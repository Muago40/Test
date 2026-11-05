// Persistance des données.
//  - Toujours : stockage local du navigateur (affichage immédiat, hors ligne).
//  - Sur claude.ai : en plus, sauvegarde privée sur le compte de l'utilisateur
//    (documents sous data/users/<id>/, illisibles par toute autre personne),
//    ce qui évite de perdre l'historique et synchronise téléphone et ordinateur.
import { capacite } from "./plateforme.js";

const CLE = "medoc-planner:v1";

export const REGLAGES_DEFAUT = {
  heures: { matin: "08:00", midi: "12:30", soir: "19:30", coucher: "22:00" },
  alarmes: false,
  son: true,
  rappelMinutes: 15, // relance si la prise n'est pas cochée
  cleApi: "",
  avertissementLu: false,
};

function normaliserEtat(brut = {}) {
  return {
    traitements: brut.traitements || [],
    prises: brut.prises || {},
    reglages: { ...REGLAGES_DEFAUT, ...(brut.reglages || {}), heures: { ...REGLAGES_DEFAUT.heures, ...(brut.reglages?.heures || {}) } },
  };
}

function lireLocal() {
  try { return normaliserEtat(JSON.parse(localStorage.getItem(CLE) || "{}")); }
  catch { return normaliserEtat(); }
}

export const etat = lireLocal();

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
  const docs = { etat: { traitements: etat.traitements, reglages, maj: Date.now() } };
  // Historique des prises découpé par mois (taille de document limitée)
  for (const [k, v] of Object.entries(etat.prises)) {
    const mois = "prises-" + k.slice(0, 7);
    (docs[mois] ||= { prises: {} }).prises[k] = v;
  }
  // Les mois dont toutes les prises ont été retirées sont vidés
  for (const id of Object.keys(dernierEnvoi)) if (id.startsWith("prises-") && !docs[id]) docs[id] = { prises: {} };
  return docs;
}

function planifierEnvoi() {
  if (!compte) return;
  clearTimeout(envoiPrevu);
  envoiPrevu = setTimeout(() => {
    envoiEnCours = envoiEnCours.then(async () => {
      const docs = documentsAEnvoyer();
      for (const [id, data] of Object.entries(docs)) {
        const json = JSON.stringify(id === "etat" ? { ...data, maj: 0 } : data);
        if (dernierEnvoi[id] === json) continue;
        try {
          await compte.db.collection("data/users/" + compte.uid).doc(id).set(data);
          dernierEnvoi[id] = json;
        } catch (e) { console.warn("Sauvegarde du compte impossible", id, e); }
      }
    });
  }, 800);
}

/** Connecte la sauvegarde du compte (claude.ai) et récupère les données existantes. */
export async function connecterCompte() {
  const [db, user] = await Promise.all([capacite("db"), capacite("user")]);
  if (!db || !user) return false;
  let uid;
  try { uid = await user.id(); } catch { return false; }
  if (!uid) return false;
  compte = { db, uid };
  try {
    const snap = await db.collection("data/users/" + uid).limit(1000).get();
    const docs = {};
    // Les snapshots sont figés : copie profonde avant toute modification
    snap.docs.forEach((d) => { if (d.exists) docs[d.id] = JSON.parse(JSON.stringify(d.data())); });
    if (docs.etat) {
      const prises = {};
      for (const [id, d] of Object.entries(docs)) if (id.startsWith("prises-")) Object.assign(prises, d.prises || {});
      const cleApi = etat.reglages.cleApi;
      Object.assign(etat, normaliserEtat({ traitements: docs.etat.traitements, reglages: docs.etat.reglages, prises }));
      etat.reglages.cleApi = cleApi;
      // Mémorise ce qui est déjà stocké pour ne pas le réécrire
      for (const [id, data] of Object.entries(documentsAEnvoyer())) {
        dernierEnvoi[id] = JSON.stringify(id === "etat" ? { ...data, maj: 0 } : data);
      }
      ecrireLocal();
      notifierAbonnes();
    } else if (etat.traitements.length) {
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

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function aujourdhui(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

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

export function remplacerDonnees(d) {
  etat.traitements = d.traitements;
  etat.prises = d.prises || {};
  Object.assign(etat.reglages, d.reglages || {});
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
