// Calcul du planning des prises.
import { MOMENTS } from "./parser.js";

const JOUR_MS = 86400000;

function dateLocale(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Le traitement est-il actif à cette date ? */
export function estActif(t, iso) {
  const jour = dateLocale(iso);
  const debut = dateLocale(t.debut);
  const ecart = Math.round((jour - debut) / JOUR_MS);
  if (ecart < 0) return false;
  if (t.dureeJours && ecart >= t.dureeJours) return false;
  if (t.hebdomadaire) return jour.getDay() === (t.jourSemaine ?? debut.getDay());
  return true;
}

/** Date de fin (dernier jour inclus) ou null. */
export function dateFin(t) {
  if (!t.dureeJours) return null;
  return new Date(dateLocale(t.debut).getTime() + (t.dureeJours - 1) * JOUR_MS);
}

/** Heures de prise d'un traitement. */
export function heuresDe(t, reglages) {
  if (t.heures && t.heures.length) return [...t.heures].sort();
  return MOMENTS.filter((m) => (t.moments || []).includes(m)).map((m) => reglages.heures[m]);
}

/** Liste triée des prises programmées pour une date. */
export function prisesDuJour(iso, traitements, reglages) {
  const liste = [];
  for (const t of traitements) {
    if (t.siBesoin || !estActif(t, iso)) continue;
    for (const h of heuresDe(t, reglages)) {
      const moment = Object.entries(reglages.heures).find(([, v]) => v === h)?.[0] || null;
      liste.push({ heure: h, moment, t });
    }
  }
  return liste.sort((a, b) => a.heure.localeCompare(b.heure));
}

export function libelleMoment(m) {
  return { matin: "Matin", midi: "Midi", soir: "Soir", coucher: "Coucher" }[m] || "";
}

export function libelleQuantite(t) {
  const q = t.quantite ?? 1;
  const qs = q === 0.5 ? "½" : String(q).replace(".", ",");
  const u = t.unite || "prise";
  return `${qs} ${u}${q > 1 && !/s$/.test(u) ? "s" : ""}`;
}

export function resumePosologie(t, reglages) {
  const parts = [libelleQuantite(t)];
  if (t.siBesoin) parts.push("si besoin");
  else if (t.heures?.length) parts.push("à " + t.heures.join(", "));
  else parts.push((t.moments || []).map(libelleMoment).join(" · ").toLowerCase());
  if (t.hebdomadaire) parts.push("1 fois/semaine");
  if (t.dureeJours) parts.push(`pendant ${t.dureeJours} j`);
  else parts.push("au long cours");
  return parts.join(" — ");
}
