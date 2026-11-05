// Document imprimable pour les patients (notamment sans téléphone).
// Recto : plan de prise en tableau (Nom | Matin | Midi | Soir | Coucher | Remarques).
// Verso : fiches explicatives (indications, effets indésirables, conseils) et précautions.
// En option : calendrier de prises à cocher.
import { trouverParId } from "./data/medicaments.js";
import { analyserInteractions, NIVEAUX } from "./data/interactions.js";
import { MOMENTS } from "./parser.js";
import { libelleQuantite, libelleMoment, dateFin, estActif, heuresDe } from "./planning.js";
import { aujourdhui } from "./store.js";
import { esc } from "./ui.js";

const dateFR = (d) => (d instanceof Date ? d : new Date(d + "T12:00:00")).toLocaleDateString("fr-FR");
const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const JOURS_LONGS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const UNITES_SIMPLES = ["comprimé", "gélule", "prise", "capsule"];

export const ficheDe = (t) => (t.medId ? trouverParId(t.medId) : t.ficheIA) || null;

/** Traitements encore en cours, les « si besoin » à la fin (comme sur un plan de prise papier). */
export function traitementsEnCours(traitements) {
  const auj = new Date(aujourdhui() + "T00:00:00");
  const actifs = traitements.filter((t) => { const f = dateFin(t); return !f || f >= auj; });
  return [...actifs.filter((t) => !t.siBesoin), ...actifs.filter((t) => t.siBesoin)];
}

function quantiteCourte(t) {
  const q = t.quantite ?? 1;
  return q === 0.5 ? "½" : q === 0.25 ? "¼" : String(q).replace(".", ",");
}

function remarquesPlan(t) {
  const r = [];
  if (t.siBesoin) r.push("Si besoin");
  if (t.heures?.length) r.push(`${libelleQuantite(t)} à ${t.heures.join(", ")}`);
  if (t.hebdomadaire) r.push(`1 fois par semaine (le ${JOURS_LONGS[new Date(t.debut + "T12:00:00").getDay()]})`);
  for (const x of t.remarques || []) if (x !== "Moments à vérifier" && !r.includes(x)) r.push(x);
  const fin = dateFin(t);
  if (fin) r.push("Jusqu'au " + dateFR(fin));
  return r.join(". ");
}

/** Tableau du plan de prise (utilisé à l'écran et à l'impression). */
export function tablePlan(traitements, reglages, { classe = "table-plan" } = {}) {
  const liste = traitementsEnCours(traitements);
  if (!liste.length) return "";
  return `
  <table class="${classe}">
    <thead><tr><th class="col-nom">Nom</th>${MOMENTS.map((m) => `<th>${libelleMoment(m)}<span class="h">${reglages.heures[m]}</span></th>`).join("")}<th class="col-rem">Remarques</th></tr></thead>
    <tbody>
    ${liste.map((t) => {
      const unite = UNITES_SIMPLES.includes(t.unite) ? "" : t.unite;
      const cellules = MOMENTS.map((m) => (!t.heures?.length && t.moments?.includes(m))
        ? `<td class="dose">${quantiteCourte(t)}${unite ? `<span class="u">${esc(unite)}</span>` : ""}</td>` : `<td></td>`).join("");
      return `<tr${t.siBesoin ? ' class="si-besoin"' : ""}><td class="col-nom">${esc(t.nom)}</td>${cellules}<td class="col-rem">${esc(remarquesPlan(t))}</td></tr>`;
    }).join("")}
    </tbody>
  </table>`;
}

export const STYLE_IMPRESSION = `
.doc-impression { font: 12pt/1.35 Arial, Helvetica, sans-serif; color: #000; background: #fff; }
.doc-impression .page { break-after: page; }
.doc-impression .page:last-child { break-after: auto; }
.doc-impression .titre { display: flex; justify-content: space-between; gap: 12pt; flex-wrap: wrap; margin-bottom: 10pt; }
.doc-impression .titre h1 { font-size: 17pt; margin: 0 0 2pt; }
.doc-impression .titre p { margin: 1pt 0; }
.doc-impression .allergie { border: 2px solid #000; padding: 3pt 6pt; display: inline-block; margin-top: 3pt; font-weight: bold; }
.doc-impression table.table-plan { width: 100%; border-collapse: collapse; }
.doc-impression .table-plan th, .doc-impression .table-plan td { border: 1px solid #000; padding: 6pt 5pt; text-align: center; vertical-align: middle; }
.doc-impression .table-plan th { font-size: 13pt; background: #eee; }
.doc-impression .table-plan th .h { display: block; font-size: 9pt; font-weight: normal; }
.doc-impression .table-plan td.col-nom { font-weight: bold; width: 26%; }
.doc-impression .table-plan th.col-nom { width: 26%; }
.doc-impression .table-plan td.dose { font-size: 15pt; font-weight: bold; width: 11%; }
.doc-impression .table-plan td.dose .u { display: block; font-size: 8.5pt; font-weight: normal; }
.doc-impression .table-plan td.col-rem { font-size: 10.5pt; text-align: left; }
.doc-impression .table-plan tr.si-besoin td { background: #f4f4f4; }
.doc-impression h2 { font-size: 14pt; margin: 0 0 6pt; border-bottom: 2px solid #000; padding-bottom: 2pt; }
.doc-impression .fiches { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt; }
.doc-impression .fiche-imp { border: 1px solid #000; padding: 4pt 6pt; font-size: 9pt; line-height: 1.25; break-inside: avoid; }
.doc-impression .fiches.trois { grid-template-columns: 1fr 1fr 1fr; gap: 5pt; }
.doc-impression .fiches.trois .fiche-imp { font-size: 8pt; padding: 3pt 5pt; }
.doc-impression .fiches.trois .fiche-imp h3 { font-size: 9.5pt; }
.doc-impression .fiche-imp h3 { font-size: 11pt; margin: 0; }
.doc-impression .fiche-imp .fam { font-style: italic; margin: 0 0 3pt; }
.doc-impression .fiche-imp p { margin: 2pt 0; }
.doc-impression .precautions { margin-top: 6pt; font-size: 9pt; break-inside: avoid; }
.doc-impression .precautions h2 { font-size: 11pt; margin-bottom: 3pt; }
.doc-impression .precautions .alerte-imp { border: 1.5px solid #000; padding: 3pt 5pt; margin: 2pt 0; }
.doc-impression .precautions ul { margin: 3pt 0; padding-left: 14pt; }
.doc-impression .calendrier { width: 100%; border-collapse: collapse; }
.doc-impression .calendrier td, .doc-impression .calendrier th { border: 1px solid #000; text-align: center; padding: 4pt 2pt; }
.doc-impression .calendrier td:first-child, .doc-impression .calendrier th:first-child { text-align: left; padding-left: 5pt; }
.doc-impression .case { display: inline-block; width: 14pt; height: 14pt; border: 1.5px solid #000; }
.doc-impression .vide { background: #eee; }
.doc-impression .pied { margin-top: 10pt; font-size: 9pt; display: flex; justify-content: space-between; gap: 10pt; flex-wrap: wrap; }
`;

function entete(profil, reglages, sousTitre) {
  const pro = reglages.pro || {};
  const nom = profil.nom && profil.nom !== "Moi" ? profil.nom : "____________________";
  return `
  <div class="titre">
    <div>
      <h1>${sousTitre} ${esc(nom)}</h1>
      ${profil.naissance ? `<p>Né(e) le ${esc(dateFR(profil.naissance))}</p>` : ""}
      ${profil.allergies ? `<span class="allergie">⚠ Allergies : ${esc(profil.allergies)}</span>` : ""}
    </div>
    <div>
      <p>Mis à jour le ${dateFR(aujourdhui())}</p>
      ${pro.nom ? `<p>${esc(pro.nom)}</p>` : ""}
      ${pro.contact ? `<p>${esc(pro.contact)}</p>` : ""}
    </div>
  </div>`;
}

function liste(items, max) {
  const l = (items || []).slice(0, max);
  return l.map(esc).join(" ; ");
}

/**
 * @param {object} profil   patient à imprimer
 * @param {object} reglages horaires, coordonnées du professionnel
 * @param {object} options  { plan, fiches, precautions, calendrier, jours }
 */
export function documentImpression(profil, reglages, options = {}) {
  const o = { plan: true, fiches: true, precautions: true, calendrier: false, jours: 7, ...options };
  const actifs = traitementsEnCours(profil.traitements);
  const pages = [];

  // ── Recto : plan de prise ──
  if (o.plan) {
    pages.push(`<section class="page">
      ${entete(profil, reglages, "Traitement de")}
      ${tablePlan(profil.traitements, reglages)}
      <div class="pied"><span>Ce plan ne remplace pas l'ordonnance.</span><span>Signature : ____________________</span></div>
    </section>`);
  }

  // ── Verso : fiches explicatives + précautions ──
  if (o.fiches || o.precautions) {
    const avecFiche = actifs.filter((t) => ficheDe(t));
    const sansFiche = actifs.filter((t) => !ficheDe(t));
    const inter = o.precautions
      ? analyserInteractions(actifs.map((t) => ({ nom: t.nom, med: t.medId ? trouverParId(t.medId) : null }))).filter((i) => NIVEAUX[i.niveau].rang >= 2)
      : [];
    pages.push(`<section class="page">
      ${o.plan ? "" : entete(profil, reglages, "Traitement de")}
      ${o.fiches ? `
        <h2>Mes médicaments expliqués</h2>
        <div class="fiches${avecFiche.length > 8 ? " trois" : ""}">
        ${avecFiche.map((t) => {
          const f = ficheDe(t);
          // conseils sans redite du moment de prise
          const mot = (x) => x.toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "");
          const conseils = f.conseils.filter((c) => !mot(c).includes(mot(f.moment)) && !mot(f.moment).includes(mot(c)));
          return `<div class="fiche-imp">
            <h3>${esc(t.nom)}</h3>
            <p class="fam">${esc(f.dci)} — ${esc(f.famille)}</p>
            <p><strong>Pour :</strong> ${liste(f.indications, 2)}</p>
            <p><strong>Effets possibles :</strong> ${liste(f.effets, 3)}</p>
            <p><strong>Prise :</strong> ${esc(f.moment)}${conseils.length ? ". " + liste(conseils, avecFiche.length > 8 ? 1 : 2) : ""}</p>
          </div>`;
        }).join("")}
        </div>
        ${sansFiche.length ? `<p class="petit">Sans fiche (demandez à votre pharmacien) : ${sansFiche.map((t) => esc(t.nom)).join(", ")}.</p>` : ""}` : ""}
      ${o.precautions ? `
        <div class="precautions">
          <h2>Précautions</h2>
          ${inter.map((i) => `<div class="alerte-imp"><strong>${esc(i.a)} + ${esc(i.b)}</strong> : ${esc(i.risque)} <strong>À faire :</strong> ${esc(i.conduite)}</div>`).join("")}
          <ul>
            <li>Ne prenez aucun autre médicament (même sans ordonnance, ni plantes) sans avis du pharmacien, du médecin ou de l'infirmier.</li>
            <li>En cas d'oubli, ne doublez pas la dose suivante : demandez conseil.</li>
            <li>Les effets indésirables cités sont les principaux, la liste n'est pas complète.</li>
          </ul>
        </div>` : ""}
    </section>`);
  }

  // ── Option : calendrier de prises à cocher ──
  const reguliers = actifs.filter((t) => !t.siBesoin);
  if (o.calendrier && reguliers.length) {
    const jours = [];
    for (let i = 0; i < o.jours; i++) { const d = new Date(aujourdhui() + "T12:00:00"); d.setDate(d.getDate() + i); jours.push(d); }
    const lignes = [];
    for (const t of reguliers) for (const h of heuresDe(t, reglages)) lignes.push({ h, t });
    lignes.sort((a, b) => a.h.localeCompare(b.h));
    pages.push(`<section class="page">
      ${entete(profil, reglages, "Je coche mes prises —")}
      <table class="calendrier">
        <thead><tr><th>Heure — médicament</th>${jours.map((d) => `<th>${JOURS_COURTS[d.getDay()]}<br>${d.getDate()}/${d.getMonth() + 1}</th>`).join("")}</tr></thead>
        <tbody>${lignes.map(({ h, t }) => `<tr><td><strong>${h}</strong> — ${esc(t.nom)} (${esc(libelleQuantite(t))})</td>
          ${jours.map((d) => estActif(t, aujourdhui(d)) ? `<td><span class="case"></span></td>` : `<td class="vide"></td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </section>`);
  }

  return `<div class="doc-impression">${pages.join("\n")}</div>`;
}

/** Page HTML autonome (pour l'enregistrer puis l'imprimer quand l'impression directe n'est pas possible). */
export function pageAutonome(profil, reglages, options) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Traitement — ${esc(profil.nom)}</title>
<style>body{margin:0;padding:16px;background:#fff}@page{size:A4;margin:12mm}${STYLE_IMPRESSION}</style></head>
<body>${documentImpression(profil, reglages, options)}
<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300))<\/script></body></html>`;
}
