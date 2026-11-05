// Analyse du texte d'une ordonnance (issu de l'OCR) pour en extraire
// les médicaments et leur posologie.
import { MEDICAMENTS, normaliser } from "./data/medicaments.js";

export const MOMENTS = ["matin", "midi", "soir", "coucher"];

const UNITES = {
  comprime: "comprimé", cp: "comprimé", gelule: "gélule", gel: "gélule", sachet: "sachet",
  cuillere: "cuillère", cuill: "cuillère", bouffee: "bouffée", goutte: "goutte", ampoule: "ampoule",
  suppositoire: "suppositoire", suppo: "suppositoire", application: "application", dose: "dose",
  injection: "injection", pulverisation: "pulvérisation", capsule: "capsule", lyoc: "lyoc",
  pipette: "pipette", patch: "patch", unidose: "unidose",
};

const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, demi: 0.5, "1/2": 0.5 };

// Distance de Levenshtein bornée (tolérance aux erreurs d'OCR)
function levenshtein(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    let minLigne = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      minLigne = Math.min(minLigne, cur[j]);
    }
    if (minLigne > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

// Construit l'index des noms (y compris noms composés)
const INDEX = [];
for (const m of MEDICAMENTS) {
  const noms = new Set([...m.noms, normaliser(m.dci)]);
  for (const n of noms) INDEX.push({ nom: normaliser(n), med: m });
}
// Les noms les plus longs d'abord (ex. « dafalgan codeine » avant « dafalgan »)
INDEX.sort((x, y) => y.nom.length - x.nom.length);

/** Recherche un médicament de la base dans une ligne de texte. */
export function detecterMedicament(ligne) {
  const txt = " " + normaliser(ligne) + " ";
  // 1) correspondance exacte (mot entier)
  for (const e of INDEX) {
    if (txt.includes(" " + e.nom + " ") || txt.includes(" " + e.nom + "/")) return { med: e.med, trouve: e.nom, exact: true };
  }
  // 2) correspondance approchée mot à mot (erreurs d'OCR)
  const mots = txt.trim().split(" ").filter((w) => w.length >= 5);
  let meilleur = null;
  for (const mot of mots) {
    for (const e of INDEX) {
      if (e.nom.includes(" ") || e.nom.length < 5) continue;
      const tol = e.nom.length >= 9 ? 2 : 1;
      const d = levenshtein(mot, e.nom, tol);
      if (d <= tol && (!meilleur || d < meilleur.d)) meilleur = { med: e.med, trouve: mot, d };
    }
  }
  return meilleur ? { med: meilleur.med, trouve: meilleur.trouve, exact: false } : null;
}

function nombre(s) {
  if (!s) return null;
  s = s.replace(",", ".");
  if (NOMBRES[s] !== undefined) return NOMBRES[s];
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Extrait la posologie d'un bloc de texte relatif à un médicament. */
export function extrairePosologie(bloc) {
  const t = normaliser(bloc).replace(/\s*-\s*/g, "-");
  const res = {
    dosage: "",
    quantite: 1,
    unite: "prise",
    moments: [],
    heures: [],
    siBesoin: false,
    dureeJours: null,
    hebdomadaire: false,
    remarques: [],
  };

  const dos = bloc.match(/(\d+(?:[.,]\d+)?)\s*(mg|g|µg|mcg|ui|ml|%)(?:\s*\/\s*(\d+(?:[.,]\d+)?)\s*(mg|g|µg|mcg|ui|ml)?)?(?![a-z])/i);
  if (dos) {
    const u = (x) => (x.toLowerCase() === "ui" ? "UI" : x.toLowerCase());
    res.dosage = dos[1].replace(".", ",") + " " + u(dos[2]) + (dos[3] ? "/" + dos[3].replace(".", ",") + " " + u(dos[4] || dos[2]) : "");
  }

  const formes = "(comprimes?|cp|cps|gelules?|gel|sachets?|cuilleres?|cuill|bouffees?|gouttes?|ampoules?|suppositoires?|suppo|applications?|doses?|injections?|pulverisations?|capsules?|lyocs?|pipettes?|patchs?|unidoses?)";
  const q = t.match(new RegExp("(\\d+(?:[.,]\\d+)?|un|une|deux|trois|quatre|demi|1/2)\\s*" + formes));
  if (q) {
    res.quantite = nombre(q[1]) ?? 1;
    res.unite = UNITES[q[2].replace(/s$/, "")] || q[2];
  }

  // Schéma "1-0-1" ou "1-1-1-1" (matin-midi-soir[-coucher])
  const schema = t.match(/\b(\d(?:[.,]5)?)-(\d(?:[.,]5)?)-(\d(?:[.,]5)?)(?:-(\d(?:[.,]5)?))?\b/);
  if (schema) {
    const vals = schema.slice(1, 5).map((v) => (v === undefined ? 0 : nombre(v)));
    vals.forEach((v, i) => { if (v > 0) res.moments.push(MOMENTS[i]); });
    const nz = vals.filter((v) => v > 0);
    if (nz.length && nz.every((v) => v === nz[0])) res.quantite = nz[0];
  }

  // Moments explicites
  if (!res.moments.length) {
    if (/\bmatin|petit[- ]dejeuner|au lever|reveil\b/.test(t)) res.moments.push("matin");
    if (/\bmidi|dejeuner\b/.test(t.replace(/petit[- ]dejeuner/g, ""))) res.moments.push("midi");
    if (/\bsoir|diner|souper\b/.test(t)) res.moments.push("soir");
    if (/\bcoucher|nuit\b/.test(t)) res.moments.push("coucher");
  }

  // Fréquence : "3 fois par jour", "x2/j", "2 prises par jour"
  const freq = t.match(/(\d|un|une|deux|trois|quatre)\s*(?:fois|x|prises?)\s*(?:par|\/|le)?\s*(?:jour|j|24 ?h)\b/) ||
               t.match(/\bx\s*(\d)\s*(?:\/|par)\s*(?:jour|j)\b/);
  const parJour = freq ? nombre(freq[1]) : null;
  if (!res.moments.length && parJour) {
    res.moments = { 1: ["matin"], 2: ["matin", "soir"], 3: ["matin", "midi", "soir"], 4: ["matin", "midi", "soir", "coucher"] }[parJour] || [];
  }

  // "toutes les 6 heures"
  const inter = t.match(/toutes les (\d+)\s*(?:h|heures)\b/);
  if (inter) {
    const pas = parseInt(inter[1], 10);
    if (pas >= 4 && pas <= 24) {
      res.moments = [];
      for (let h = 8; h < 8 + 24; h += pas) res.heures.push(String(h % 24).padStart(2, "0") + ":00");
    }
  }

  if (/\bsi besoin|si douleur|en cas de|si fievre|a la demande|si necessaire\b/.test(t)) res.siBesoin = true;
  if (/par semaine|\/ ?semaine|hebdomadaire|une fois par semaine|1 fois par semaine/.test(t)) res.hebdomadaire = true;

  // Durée
  const d = t.match(/(?:pendant|durant|pdt|sur|x)\s*(\d+|un|une|deux|trois|quatre|cinq|six)\s*(jours?|j|semaines?|sem|mois)\b/) ||
            t.match(/\b(\d+)\s*(jours?|j|semaines?|mois)\b(?!.*\bpar\b)/);
  if (d) {
    const n = nombre(d[1]) || 0;
    const u = d[2];
    res.dureeJours = u.startsWith("sem") ? n * 7 : u.startsWith("mois") ? n * 30 : n;
  }
  if (/qsp\s*(\d+)\s*(mois|jours?|semaines?)/.test(t)) {
    const m = t.match(/qsp\s*(\d+)\s*(mois|jours?|semaines?)/);
    const n = parseInt(m[1], 10);
    res.dureeJours = m[2].startsWith("mois") ? n * 30 : m[2].startsWith("sem") ? n * 7 : n;
  }
  if (/a renouveler|renouvelable/.test(t)) res.remarques.push("Ordonnance renouvelable");
  if (/a jeun/.test(t)) res.remarques.push("À jeun");
  if (/(au cours|pendant|au milieu|a la fin) d[ue]s? repas/.test(t)) res.remarques.push("Pendant le repas");
  if (/avant (le|les) repas/.test(t)) res.remarques.push("Avant le repas");

  // « Le gère » : le patient gère lui-même la prise
  const gere = /\ble gere\b|\bil gere\b|\belle gere\b|\bgere seul/.test(t);
  if (gere) res.remarques.push("Géré par le patient");
  if (/apres (les|le|chaque) repas/.test(t)) res.remarques.push("Après les repas");
  const siDiarrhee = t.match(/\bsi (diarrhees?|douleurs?|fievre|nausees?|constipation|brulures?|besoin)\b/);
  if (siDiarrhee) { res.siBesoin = res.siBesoin || !res.moments.length; if (!/besoin/.test(siDiarrhee[1])) res.remarques.push("Si " + ({ diarrhee: "diarrhée", diarrhees: "diarrhée", douleur: "douleur", douleurs: "douleur", fievre: "fièvre", nausee: "nausées", nausees: "nausées", brulure: "brûlures", brulures: "brûlures" }[siDiarrhee[1]] || siDiarrhee[1])); }

  // Tableau (plan de prise) : chiffres isolés dans les colonnes Matin / Midi / Soir / Coucher
  if (!res.moments.length && !res.heures.length) {
    const sansDosage = t
      .replace(/\d+(?:[.,]\d+)?\s*(?:mg|g|µg|mcg|ui|ml|%)\b(?:\s*\/\s*\d+(?:[.,]\d+)?\s*(?:mg|g|µg|mcg|ui|ml)?\b)?/g, " ")
      .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, " ")
      .replace(/(?:pendant|durant|pdt|sur|qsp)\s*\d+\s*\w+/g, " ");
    const colonnes = (sansDosage.match(/(?:^|\s)(1\/2|½|\d(?:[.,]5)?)(?=\s|$)/g) || []).map((x) => nombre(x.trim().replace("½", "1/2")));
    if (colonnes.length && colonnes.length <= 4) {
      res.moments = { 1: ["matin"], 2: ["matin", "soir"], 3: ["matin", "midi", "soir"], 4: ["matin", "midi", "soir", "coucher"] }[colonnes.length];
      if (colonnes.every((v) => v === colonnes[0])) res.quantite = colonnes[0];
      if (colonnes.length < 3) res.remarques.push("Moments à vérifier");
      res.siBesoin = false;
    } else if (gere) {
      res.siBesoin = true;
    }
  }

  if (!res.moments.length && !res.heures.length && !res.siBesoin) {
    res.moments = ["matin"];
    res.remarques.push("Moments à vérifier");
  }
  return res;
}

// Nom affiché : celui écrit sur l'ordonnance (ex. « Doliprane ») si reconnu exactement, sinon la DCI.
function nomAffiche(det) {
  if (!det.exact || det.trouve === normaliser(det.med.dci)) return det.med.dci;
  return det.trouve.replace(/(^|[ -])([a-z])/g, (_, s, c) => s + c.toUpperCase());
}

// Mots qui commencent une ligne sans être un nom de médicament
const MOTS_NON_MEDICAMENT = new Set(("nom matin midi soir coucher traitement traitements docteur dr date signature ordonnance " +
  "mme madame monsieur mr mlle patient patiente ne nee adresse tel telephone rpps finess medecin cabinet rue avenue " +
  "pendant prendre avant apres au aux si en le la les un une puis renouveler renouvelable qsp durant toutes fois jours " +
  "semaines mois comprime comprimes gelule gelules sachet sachets cuillere ampoule boite boites quantite posologie " +
  "a de du et ou par pour total age poids taille allergie allergies remarques page").split(" "));

/** Ligne qui ressemble à un médicament absent de la base (nom + dosage, ou nom + colonnes de chiffres). */
export function detecterInconnu(ligne) {
  const m = ligne.trim().match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]{3,}(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]{2,}){0,2})(.*)$/);
  if (!m) return null;
  const premier = normaliser(m[1].split(/\s+/)[0]);
  if (MOTS_NON_MEDICAMENT.has(premier)) return null;
  const reste = m[2];
  const dosage = /\d+(?:[.,]\d+)?\s*(?:mg|g|µg|mcg|ui|ml)\b/i.test(reste);
  const colonnes = /^[A-ZÀ-Ý]/.test(m[1]) && /(?:^|\s)(?:1\/2|½|\d)(?=\s|$)/.test(reste);
  if (!dosage && !colonnes) return null;
  // retire les mots de posologie éventuellement collés au nom
  const nom = m[1].split(/\s+/).filter((w) => !MOTS_NON_MEDICAMENT.has(normaliser(w))).join(" ");
  return nom ? { med: null, trouve: nom, exact: false, inconnu: true } : null;
}

/**
 * Analyse un texte complet d'ordonnance.
 * Découpe en blocs : chaque ligne contenant un médicament reconnu ouvre un bloc ;
 * les lignes suivantes (posologie) lui sont rattachées jusqu'au prochain médicament.
 */
export function analyserOrdonnance(texte) {
  const lignes = texte.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const blocs = [];
  for (const ligne of lignes) {
    const det = detecterMedicament(ligne) || detecterInconnu(ligne);
    if (det) blocs.push({ det, lignes: [ligne] });
    else if (blocs.length) {
      const dernier = blocs[blocs.length - 1];
      if (dernier.lignes.length < 4) dernier.lignes.push(ligne);
    }
  }
  return blocs.map(({ det, lignes }) => {
    const bloc = lignes.join(" ");
    const poso = extrairePosologie(bloc);
    return {
      nom: (det.inconnu ? det.trouve : nomAffiche(det)) + (poso.dosage ? " " + poso.dosage : ""),
      medId: det.med?.id || null,
      texteSource: bloc,
      certitude: det.exact && !poso.remarques.includes("Moments à vérifier") ? "haute" : "moyenne",
      ...poso,
    };
  });
}
