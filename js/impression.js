// Document imprimable pour les patients (notamment sans téléphone) :
// plan de prise, calendrier de prises à cocher, fiches médicaments, précautions.
import { trouverParId } from "./data/medicaments.js";
import { analyserInteractions, NIVEAUX } from "./data/interactions.js";
import { MOMENTS } from "./parser.js";
import { libelleQuantite, libelleMoment, dateFin, estActif, heuresDe } from "./planning.js";
import { aujourdhui } from "./store.js";
import { esc } from "./ui.js";

const dateFR = (d) => (d instanceof Date ? d : new Date(d + "T12:00:00")).toLocaleDateString("fr-FR");
const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

export const STYLE_IMPRESSION = `
.doc-impression { font: 12.5pt/1.4 Arial, Helvetica, sans-serif; color: #000; background: #fff; }
.doc-impression h1 { font-size: 19pt; margin: 0 0 4pt; }
.doc-impression h2 { font-size: 15pt; margin: 14pt 0 6pt; border-bottom: 2px solid #000; padding-bottom: 2pt; }
.doc-impression h3 { font-size: 13.5pt; margin: 0 0 3pt; }
.doc-impression .entete-doc { display: flex; justify-content: space-between; gap: 12pt; flex-wrap: wrap; border: 2px solid #000; padding: 8pt 10pt; }
.doc-impression .entete-doc p { margin: 2pt 0; }
.doc-impression table { width: 100%; border-collapse: collapse; margin: 4pt 0; }
.doc-impression th, .doc-impression td { border: 1px solid #000; padding: 5pt 6pt; vertical-align: top; text-align: left; }
.doc-impression th { background: #e6e6e6; }
.doc-impression th:first-child { width: 30%; }
.doc-impression .bloc { break-inside: avoid; }
.doc-impression h2, .doc-impression h3 { break-after: avoid; }
.doc-impression td.dose { text-align: center; font-size: 14pt; font-weight: bold; white-space: nowrap; }
.doc-impression td.vide { background: #f6f6f6; }
.doc-impression .petit { font-size: 10.5pt; }
.doc-impression .case { display: inline-block; width: 15pt; height: 15pt; border: 1.5px solid #000; }
.doc-impression .calendrier td, .doc-impression .calendrier th { text-align: center; padding: 4pt 2pt; }
.doc-impression .calendrier td:first-child, .doc-impression .calendrier th:first-child { text-align: left; padding-left: 6pt; }
.doc-impression .fiche-imp { border: 1px solid #000; padding: 7pt 9pt; margin: 0 0 8pt; break-inside: avoid; }
.doc-impression .fiche-imp ul { margin: 2pt 0 4pt; padding-left: 16pt; }
.doc-impression .fiche-imp .colonnes { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12pt; }
.doc-impression .alerte-imp { border: 2px solid #000; padding: 6pt 8pt; margin: 4pt 0; break-inside: avoid; }
.doc-impression .signature { margin-top: 16pt; display: flex; justify-content: space-between; gap: 12pt; flex-wrap: wrap; }
.doc-impression .saut { break-before: page; }
.doc-impression .avert { font-size: 10pt; margin-top: 12pt; }
`;

/**
 * @param {object} profil  profil (patient) à imprimer
 * @param {object} reglages  réglages (horaires, coordonnées du professionnel)
 * @param {object} options  { plan, calendrier, fiches, precautions, jours }
 */
export function documentImpression(profil, reglages, options = {}) {
  const o = { plan: true, calendrier: true, fiches: true, precautions: true, jours: 7, ...options };
  const auj = aujourdhui();
  const actifs = profil.traitements.filter((t) => { const f = dateFin(t); return !f || f >= new Date(auj + "T00:00:00"); });
  const reguliers = actifs.filter((t) => !t.siBesoin);
  const siBesoin = actifs.filter((t) => t.siBesoin);
  const fiche = (t) => (t.medId ? trouverParId(t.medId) : t.ficheIA) || null;
  const pro = reglages.pro || {};
  const parties = [];

  parties.push(`
  <div class="entete-doc">
    <div>
      <h1>Mon plan de traitement</h1>
      <p><strong>${esc(profil.nom && profil.nom !== "Moi" ? profil.nom : "Patient : ____________________")}</strong>${profil.naissance ? ` — né(e) le ${esc(dateFR(profil.naissance))}` : ""}</p>
      ${profil.allergies ? `<p>⚠ Allergies : <strong>${esc(profil.allergies)}</strong></p>` : ""}
    </div>
    <div class="petit">
      <p>Établi le ${dateFR(auj)}</p>
      ${pro.nom ? `<p>Par : ${esc(pro.nom)}</p>` : ""}
      ${pro.contact ? `<p>Contact : ${esc(pro.contact)}</p>` : ""}
    </div>
  </div>`);

  if (o.plan) {
    const autresHeures = reguliers.some((t) => t.heures?.length);
    parties.push(`
    <h2>Plan de prise</h2>
    <table>
      <thead><tr><th>Médicament</th>${MOMENTS.map((m) => `<th>${libelleMoment(m)}<br><span class="petit">${reglages.heures[m]}</span></th>`).join("")}${autresHeures ? "<th>Autres heures</th>" : ""}<th>Comment le prendre</th></tr></thead>
      <tbody>
      ${reguliers.map((t) => {
        const f = fiche(t);
        const fin = dateFin(t);
        const dose = libelleQuantite(t);
        const cellules = MOMENTS.map((m) => (!t.heures?.length && t.moments?.includes(m)) ? `<td class="dose">${esc(dose)}</td>` : `<td class="vide"></td>`).join("");
        return `<tr>
          <td><strong>${esc(t.nom)}</strong>${f && f.dci && !t.nom.toLowerCase().includes(f.dci.toLowerCase().split(" ")[0]) ? `<br><span class="petit">${esc(f.dci)}</span>` : ""}
            <br><span class="petit">${t.hebdomadaire ? "Une fois par semaine. " : ""}${fin ? "Jusqu'au " + dateFR(fin) + " inclus" : "Traitement au long cours"}</span></td>
          ${cellules}
          ${autresHeures ? `<td class="dose">${t.heures?.length ? esc(dose) + "<br>" + esc(t.heures.join(" – ")) : ""}</td>` : ""}
          <td class="petit">${esc([f?.moment, ...(t.remarques || [])].filter(Boolean).join(". "))}</td>
        </tr>`;
      }).join("")}
      </tbody>
    </table>
    ${siBesoin.length ? `<div class="bloc">
      <h3>Seulement si besoin</h3>
      <table><tbody>${siBesoin.map((t) => `<tr><td><strong>${esc(t.nom)}</strong></td><td>${esc(libelleQuantite(t))}${t.moments?.length ? `, jusqu'à ${t.moments.length} fois par jour` : ""}${dateFin(t) ? ` — jusqu'au ${dateFR(dateFin(t))}` : ""}</td><td class="petit">${esc([fiche(t)?.moment, ...(t.remarques || [])].filter(Boolean).join(". "))}</td></tr>`).join("")}</tbody></table></div>` : ""}`);
  }

  if (o.calendrier && reguliers.length) {
    const jours = [];
    for (let i = 0; i < o.jours; i++) { const d = new Date(auj + "T12:00:00"); d.setDate(d.getDate() + i); jours.push(d); }
    const iso = (d) => aujourdhui(d);
    // une ligne par (heure, médicament)
    const lignes = [];
    for (const t of reguliers) for (const h of heuresDe(t, reglages)) lignes.push({ h, t });
    lignes.sort((a, b) => a.h.localeCompare(b.h));
    parties.push(`
    <h2 class="saut">Je coche chaque prise</h2>
    <table class="calendrier">
      <thead><tr><th>Heure — médicament</th>${jours.map((d) => `<th>${JOURS_COURTS[d.getDay()]}<br>${d.getDate()}/${d.getMonth() + 1}</th>`).join("")}</tr></thead>
      <tbody>
      ${lignes.map(({ h, t }) => `<tr><td><strong>${h}</strong> — ${esc(t.nom)}<br><span class="petit">${esc(libelleQuantite(t))}</span></td>
        ${jours.map((d) => estActif(t, iso(d)) ? `<td><span class="case"></span></td>` : `<td class="vide"></td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>`);
  }

  if (o.precautions) {
    const inter = analyserInteractions(actifs.map((t) => ({ nom: t.nom, med: t.medId ? trouverParId(t.medId) : null })))
      .filter((i) => NIVEAUX[i.niveau].rang >= 2);
    parties.push(`
    <h2>Précautions importantes</h2>
    ${inter.length ? inter.map((i) => `<div class="alerte-imp"><strong>${esc(i.a)} + ${esc(i.b)}</strong> (${esc(NIVEAUX[i.niveau].libelle.toLowerCase())})<br>${esc(i.risque)}<br><strong>À faire :</strong> ${esc(i.conduite)}</div>`).join("") : ""}
    <ul>
      <li>Ne prenez aucun autre médicament (même sans ordonnance, ni plantes) sans demander à votre pharmacien, médecin ou infirmier.</li>
      <li>En cas d'oubli, ne doublez pas la dose suivante : demandez conseil.</li>
      <li>Apportez ce document à chaque consultation et en cas d'hospitalisation.</li>
    </ul>`);
  }

  if (o.fiches) {
    const avecFiche = actifs.filter((t) => fiche(t));
    if (avecFiche.length) {
      parties.push(`<h2 class="saut">Mes médicaments expliqués</h2>` + avecFiche.map((t) => {
        const f = fiche(t);
        return `
        <div class="fiche-imp">
          <h3>${esc(t.nom)}</h3>
          <p class="petit"><strong>${esc(f.dci)}</strong> — ${esc(f.famille)}</p>
          <div class="colonnes">
            <div><strong>À quoi il sert</strong><ul>${f.indications.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
            <div><strong>Effets indésirables possibles</strong><ul>${f.effets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          </div>
          <strong>Conseils de prise</strong> — ${esc(f.moment)}
          <ul>${f.conseils.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        </div>`;
      }).join(""));
    }
  }

  parties.push(`
  <div class="signature petit"><span>Signature du professionnel :</span><span>__________________________</span></div>
  <p class="avert">Document d'aide à la prise des médicaments. Il ne remplace ni l'ordonnance, ni la notice, ni l'avis du médecin ou du pharmacien. Les effets indésirables cités sont les principaux, la liste n'est pas complète.</p>`);

  return `<div class="doc-impression">${parties.join("\n")}</div>`;
}

/** Page HTML autonome (pour l'enregistrer puis l'imprimer quand l'impression directe n'est pas possible). */
export function pageAutonome(profil, reglages, options) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan de traitement — ${esc(profil.nom)}</title>
<style>body{margin:0;padding:16px;background:#fff}@page{margin:12mm}${STYLE_IMPRESSION}</style></head>
<body>${documentImpression(profil, reglages, options)}
<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300))<\/script></body></html>`;
}
