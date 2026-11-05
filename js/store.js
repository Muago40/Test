// Persistance locale (les données de santé ne quittent pas l'appareil).
const CLE = "medoc-planner:v1";

export const REGLAGES_DEFAUT = {
  heures: { matin: "08:00", midi: "12:30", soir: "19:30", coucher: "22:00" },
  alarmes: false,
  son: true,
  rappelMinutes: 15, // relance si la prise n'est pas cochée
  cleApi: "",
  avertissementLu: false,
};

function charger() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) || "{}");
    return {
      traitements: brut.traitements || [],
      prises: brut.prises || {},
      reglages: { ...REGLAGES_DEFAUT, ...(brut.reglages || {}), heures: { ...REGLAGES_DEFAUT.heures, ...(brut.reglages?.heures || {}) } },
    };
  } catch {
    return { traitements: [], prises: {}, reglages: { ...REGLAGES_DEFAUT } };
  }
}

export const etat = charger();

const abonnes = new Set();
export function abonner(fn) { abonnes.add(fn); }

export function sauver() {
  try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) { console.warn("Sauvegarde impossible", e); }
  abonnes.forEach((fn) => fn(etat));
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

export function toutEffacer() {
  localStorage.removeItem(CLE);
  location.reload();
}
