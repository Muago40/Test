// Persistance des données.
//  - Toujours : stockage local du navigateur (affichage immédiat, hors ligne).
//  - Sur claude.ai : en plus, sauvegarde privée sur le compte de l'utilisateur
//    (documents sous data/users/<id>/, illisibles par toute autre personne).
//
// Les données sont organisées en profils : un seul (« Moi ») en mode patient,
// un par patient en mode professionnel. `etat.traitements` et `etat.prises`
// désignent toujours ceux du profil actif.
import { capacite } from "./plateforme.js";

const CLE = "medoc-planner:v1";

export const REGLAGES_DEFAUT = {
  heures: { matin: "08:00", midi: "12:30", soir: "19:30", coucher: "22:00" },
  alarmes: false,
  son: true,
  rappelMinutes: 15, // relance si la prise n'est pas cochée
  cleApi: "",
  avertissementLu: false,
  mode: "patient",   // "patient" | "pro"
  pro: { nom: "", contact: "" },
  adressePublique: "", // adresse de l'appli à donner aux patients (QR code)
};

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function nouveauProfil(champs = {}) {
  return { id: uid(), nom: "Moi", naissance: "", allergies: "", notes: "", traitements: [], prises: {}, ...champs };
}

function normaliserEtat(brut = {}) {
  let profils = Array.isArray(brut.profils) ? brut.profils : null;
  if (!profils) {
    // Ancien format (un seul jeu de traitements)
    profils = [nouveauProfil({ id: "moi", traitements: brut.traitements || [], prises: brut.prises || {} })];
  }
  profils = profils.map((p) => nouveauProfil({ ...p, traitements: p.traitements || [], prises: p.prises || {} }));
  const actif = profils.some((p) => p.id === brut.profilActif) ? brut.profilActif : profils[0].id;
  const r = brut.reglages || {};
  return {
    profils,
    profilActif: actif,
    reglages: { ...REGLAGES_DEFAUT, ...r, heures: { ...REGLAGES_DEFAUT.heures, ...(r.heures || {}) }, pro: { ...REGLAGES_DEFAUT.pro, ...(r.pro || {}) } },
  };
}

function lireLocal() {
  try { return normaliserEtat(JSON.parse(localStorage.getItem(CLE) || "{}")); }
  catch { return normaliserEtat(); }
}

export const etat = lireLocal();

export function profilActif() {
  return etat.profils.find((p) => p.id === etat.profilActif) || etat.profils[0];
}
// Raccourcis vers le profil actif (non sérialisés)
Object.defineProperty(etat, "traitements", { get: () => profilActif().traitements, set: (v) => { profilActif().traitements = v; }, enumerable: false });
Object.defineProperty(etat, "prises", { get: () => profilActif().prises, set: (v) => { profilActif().prises = v; }, enumerable: false });

const abonnes = new Set();
export function abonner(fn) { abonnes.add(fn); }
function notifierAbonnes() { abonnes.forEach((fn) => fn(etat)); }

// ─────────── Sauvegarde sur le compte claude.ai ───────────
let compte = null;          // { db, uid }
let dernierEnvoi = {};      // id de document → JSON envoyé (pour n'écrire que ce qui change)
let envoiPrevu = null;
let envoiEnCours = Promise.resolve();

function documentsAEnvoyer() {
  const { cleApi, ...reglages } = etat.reglages; // la clé API ne quitte jamais l'appareil
  const docs = {
    etat: {
      profils: etat.profils.map(({ prises, ...p }) => p),
      profilActif: etat.profilActif,
      reglages,
    },
  };
  // Historique des prises : un document par profil et par mois (taille de document limitée)
  for (const p of etat.profils) {
    for (const [k, v] of Object.entries(p.prises)) {
      const id = `prises-${p.id}-${k.slice(0, 7)}`;
      (docs[id] ||= { profil: p.id, prises: {} }).prises[k] = v;
    }
  }
  // Documents devenus vides (prises retirées, profil supprimé)
  for (const id of Object.keys(dernierEnvoi)) if (id.startsWith("prises-") && !docs[id]) docs[id] = null;
  return docs;
}

function planifierEnvoi() {
  if (!compte) return;
  clearTimeout(envoiPrevu);
  envoiPrevu = setTimeout(() => {
    envoiEnCours = envoiEnCours.then(async () => {
      for (const [id, data] of Object.entries(documentsAEnvoyer())) {
        const json = JSON.stringify(data);
        if (dernierEnvoi[id] === json) continue;
        const ref = compte.db.collection("data/users/" + compte.uid).doc(id);
        try {
          if (data === null) { await ref.delete(); delete dernierEnvoi[id]; }
          else { await ref.set(data); dernierEnvoi[id] = json; }
        } catch (e) { console.warn("Sauvegarde du compte impossible", id, e); }
      }
    });
  }, 800);
}

/** Connecte la sauvegarde du compte (claude.ai) et récupère les données existantes. */
export async function connecterCompte() {
  const [db, user] = await Promise.all([capacite("db"), capacite("user")]);
  if (!db || !user) return false;
  let id;
  try { id = await user.id(); } catch { return false; }
  if (!id) return false;
  compte = { db, uid: id };
  try {
    const snap = await db.collection("data/users/" + id).limit(1000).get();
    const docs = {};
    // Les snapshots sont figés : copie profonde avant toute modification
    snap.docs.forEach((d) => { if (d.exists) docs[d.id] = JSON.parse(JSON.stringify(d.data())); });
    if (docs.etat) {
      let brut;
      if (Array.isArray(docs.etat.profils)) {
        const prisesPar = {};
        for (const [k, d] of Object.entries(docs)) {
          if (k.startsWith("prises-") && d.profil) Object.assign((prisesPar[d.profil] ||= {}), d.prises || {});
        }
        brut = { ...docs.etat, profils: docs.etat.profils.map((p) => ({ ...p, prises: prisesPar[p.id] || {} })) };
      } else {
        // format de la version précédente
        const prises = {};
        for (const [k, d] of Object.entries(docs)) if (k.startsWith("prises-")) Object.assign(prises, d.prises || {});
        brut = { traitements: docs.etat.traitements, reglages: docs.etat.reglages, prises };
        for (const k of Object.keys(docs)) if (k.startsWith("prises-")) dernierEnvoi[k] = "ancien";
      }
      const cleApi = etat.reglages.cleApi;
      Object.assign(etat, normaliserEtat(brut));
      etat.reglages.cleApi = cleApi;
      // Ce qui est déjà stocké au nouveau format n'est pas réécrit ; l'ancien format est converti
      if (Array.isArray(docs.etat.profils)) {
        for (const [k, data] of Object.entries(documentsAEnvoyer())) dernierEnvoi[k] = JSON.stringify(data);
      }
      ecrireLocal();
      notifierAbonnes();
      planifierEnvoi(); // convertit éventuellement l'ancien format
    } else if (etat.profils.some((p) => p.traitements.length)) {
      planifierEnvoi(); // première sauvegarde des données locales existantes
    }
    return true;
  } catch (e) {
    console.warn("Lecture du compte impossible", e);
    return false;
  }
}

export function compteConnecte() { return !!compte; }

function ecrireLocal() {
  try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch { /* stockage indisponible */ }
}

export function sauver() {
  ecrireLocal();
  planifierEnvoi();
  notifierAbonnes();
}

export function aujourdhui(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

// ─────────── Profils (patients) ───────────
export function ajouterProfil(champs) {
  const p = nouveauProfil({ nom: "Nouveau patient", ...champs });
  etat.profils.push(p);
  etat.profilActif = p.id;
  sauver();
  return p;
}

export function majProfil(id, champs) {
  const p = etat.profils.find((x) => x.id === id);
  if (p) Object.assign(p, champs);
  sauver();
}

export function supprimerProfil(id) {
  etat.profils = etat.profils.filter((p) => p.id !== id);
  if (!etat.profils.length) etat.profils.push(nouveauProfil());
  if (!etat.profils.some((p) => p.id === etat.profilActif)) etat.profilActif = etat.profils[0].id;
  sauver();
}

export function choisirProfil(id) {
  if (etat.profils.some((p) => p.id === id)) { etat.profilActif = id; sauver(); }
}

// ─────────── Traitements du profil actif ───────────
export function ajouterTraitement(t) {
  etat.traitements.push({ id: uid(), debut: aujourdhui(), ...t });
  sauver();
}

export function majTraitement(id, champs) {
  const t = etat.traitements.find((x) => x.id === id);
  if (t) Object.assign(t, champs);
  sauver();
}

export function supprimerTraitement(id) {
  etat.traitements = etat.traitements.filter((x) => x.id !== id);
  for (const k of Object.keys(etat.prises)) if (k.includes("|" + id + "|")) delete etat.prises[k];
  sauver();
}

export function clePrise(date, id, heure) { return `${date}|${id}|${heure}`; }

export function basculerPrise(date, id, heure) {
  const k = clePrise(date, id, heure);
  if (etat.prises[k]) delete etat.prises[k];
  else etat.prises[k] = new Date().toISOString();
  sauver();
}

/** Restaure une sauvegarde JSON (nouveau ou ancien format). */
export function remplacerDonnees(d) {
  const cleApi = etat.reglages.cleApi;
  if (Array.isArray(d.profils)) {
    Object.assign(etat, normaliserEtat(d));
  } else {
    etat.traitements = d.traitements;
    etat.prises = d.prises || {};
    Object.assign(etat.reglages, d.reglages || {});
  }
  etat.reglages.cleApi = cleApi;
  sauver();
}

/** Remplace (ou complète) les traitements du profil actif avec un traitement transmis. */
export function importerTraitements(traitements, { remplacer, heures }) {
  const neufs = traitements.map((t) => ({ ...t, id: uid() }));
  if (remplacer) { etat.traitements = neufs; etat.prises = {}; }
  else etat.traitements.push(...neufs);
  if (heures) Object.assign(etat.reglages.heures, heures);
  sauver();
}

export async function toutEffacer() {
  const neuf = normaliserEtat();
  neuf.reglages.avertissementLu = true;
  Object.assign(etat, neuf);
  try { localStorage.removeItem(CLE); } catch { /* rien */ }
  if (compte) {
    await envoiEnCours;
    for (const id of Object.keys(dernierEnvoi)) {
      try { await compte.db.collection("data/users/" + compte.uid).doc(id).delete(); } catch { /* rien */ }
    }
    dernierEnvoi = {};
  }
  sauver();
}
