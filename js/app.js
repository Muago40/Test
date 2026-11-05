import { etat, abonner, sauver, aujourdhui, ajouterTraitement, majTraitement, supprimerTraitement,
  basculerPrise, clePrise, toutEffacer } from "./store.js";
import { MEDICAMENTS, trouverParId } from "./data/medicaments.js";
import { analyserInteractions, NIVEAUX } from "./data/interactions.js";
import { analyserOrdonnance, detecterMedicament, MOMENTS } from "./parser.js";
import { preparerImage, ocrLocal, lireOrdonnanceIA, genererFicheIA, analyserInteractionsIA } from "./ocr.js";
import { prisesDuJour, resumePosologie, libelleQuantite, libelleMoment, dateFin, estActif } from "./planning.js";
import { planifierAlarmes, demanderPermission, notifier, telechargerICS, notificationsSupportees, nombreAlarmesProgrammees } from "./alarmes.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

let vue = "planning";
let dateVue = aujourdhui();
let brouillon = []; // médicaments détectés en attente de validation
let photo = null;
let interactionsIA = null;

// ─────────────────────── Navigation ───────────────────────
function allerA(v) {
  vue = v;
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("actif", b.dataset.vue === v));
  rendre();
  window.scrollTo(0, 0);
}
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => allerA(b.dataset.vue)));

function rendre() {
  const main = $("#contenu");
  main.innerHTML = { ordonnance: vueOrdonnance, planning: vuePlanning, fiches: vueFiches, interactions: vueInteractions, reglages: vueReglages }[vue]();
  const badge = $("#badge-interactions");
  const n = analyserInteractions(itemsInteractions()).filter((i) => NIVEAUX[i.niveau].rang >= 3).length;
  badge.textContent = n || "";
  badge.hidden = !n;
}

// ─────────────────────── Vue : ordonnance ───────────────────────
function vueOrdonnance() {
  const cle = !!etat.reglages.cleApi;
  return `
  <section class="carte">
    <h2>📷 Scanner une ordonnance</h2>
    <p class="aide">Prenez l'ordonnance en photo bien à plat, éclairée, cadrée sur la liste des médicaments.</p>
    <label class="bouton principal large">
      <input type="file" accept="image/*" capture="environment" id="photo" hidden>
      Prendre / choisir une photo
    </label>
    ${photo ? `<img src="${photo.dataUrl}" class="apercu" alt="Ordonnance">` : ""}
    ${photo ? `
      <div class="ligne-boutons">
        <button class="bouton principal" data-action="analyser-local">Lire (OCR local)</button>
        <button class="bouton ${cle ? "principal" : ""}" data-action="analyser-ia" ${cle ? "" : "disabled"} title="${cle ? "" : "Ajoutez une clé API dans Réglages"}">Lire avec l'IA ✨</button>
      </div>
      <p class="aide">${cle ? "L'IA lit aussi les ordonnances manuscrites." : "L'OCR local fonctionne bien sur les ordonnances imprimées. Pour les ordonnances manuscrites, configurez la lecture IA dans Réglages."}</p>` : ""}
    <div id="progression"></div>
  </section>

  <details class="carte">
    <summary>⌨️ Saisir ou coller le texte de l'ordonnance</summary>
    <textarea id="texte-ordo" rows="6" placeholder="Ex. :&#10;Doliprane 1000 mg : 1 comprimé 3 fois par jour si douleur pendant 5 jours&#10;Amoxicilline 1 g : 1 cp matin et soir pendant 6 jours"></textarea>
    <button class="bouton principal" data-action="analyser-texte">Analyser le texte</button>
  </details>

  ${brouillon.length ? vueBrouillon() : ""}

  <section class="carte">
    <button class="bouton large" data-action="nouveau">➕ Ajouter un médicament manuellement</button>
  </section>`;
}

function vueBrouillon() {
  return `
  <section class="carte surligne">
    <h2>Médicaments détectés (${brouillon.length})</h2>
    <p class="aide">Vérifiez attentivement chaque ligne avec l'ordonnance originale et corrigez si besoin avant de valider.</p>
    <ul class="liste">
      ${brouillon.map((t, i) => `
        <li>
          <div class="ligne-titre">
            <strong>${esc(t.nom)}</strong>
            ${t.certitude === "moyenne" ? '<span class="pastille caution">à vérifier</span>' : ""}
            ${!t.medId ? '<span class="pastille info">hors base</span>' : ""}
          </div>
          <div class="sous">${esc(resumePosologie(t, etat.reglages))}</div>
          ${t.texteSource ? `<div class="source">« ${esc(t.texteSource)} »</div>` : ""}
          ${t.remarques?.length ? `<div class="sous">📝 ${esc(t.remarques.join(" · "))}</div>` : ""}
          <div class="ligne-boutons petit">
            <button class="bouton" data-action="editer-brouillon" data-i="${i}">Modifier</button>
            <button class="bouton" data-action="retirer-brouillon" data-i="${i}">Retirer</button>
          </div>
        </li>`).join("")}
    </ul>
    <button class="bouton principal large" data-action="valider-brouillon">✅ Ajouter au planning</button>
  </section>`;
}

async function analyserPhoto(mode) {
  const prog = $("#progression");
  try {
    if (mode === "ia") {
      prog.innerHTML = `<div class="chargement">Lecture par l'IA en cours…</div>`;
      const r = await lireOrdonnanceIA(etat.reglages.cleApi, photo.base64);
      brouillon = r.medicaments.map((m) => {
        const det = detecterMedicament(m.dci + " " + m.nom);
        return {
          nom: [m.nom, m.dosage].filter(Boolean).join(" "),
          medId: det?.med.id || null,
          dosage: m.dosage, quantite: m.quantite || 1, unite: m.unite || "prise",
          moments: m.moments, heures: m.heures, siBesoin: m.siBesoin,
          dureeJours: m.dureeJours, hebdomadaire: m.hebdomadaire,
          remarques: m.remarques, texteSource: m.texteSource, certitude: "haute",
          debut: aujourdhui(),
        };
      });
    } else {
      prog.innerHTML = `<div class="chargement">Lecture du texte… <span id="pct">0</span>%</div>`;
      const texte = await ocrLocal(photo.canvas, (p) => { const el = $("#pct"); if (el) el.textContent = p; });
      brouillon = analyserOrdonnance(texte);
      if (!brouillon.length) {
        prog.innerHTML = `<div class="alerte warning">Aucun médicament reconnu. Texte lu :<pre>${esc(texte)}</pre>Vous pouvez corriger ce texte dans la zone « Saisir le texte », ou ajouter les médicaments manuellement.</div>`;
        $("#texte-ordo").value = texte;
        return;
      }
    }
    rendre();
  } catch (e) {
    console.error(e);
    prog.innerHTML = `<div class="alerte danger">Erreur : ${esc(e.message)}</div>`;
  }
}

// ─────────────────────── Vue : planning ───────────────────────
function vuePlanning() {
  const prises = prisesDuJour(dateVue, etat.traitements, etat.reglages);
  const d = new Date(dateVue + "T12:00:00");
  const estAujourdhui = dateVue === aujourdhui();
  const faites = prises.filter((p) => etat.prises[clePrise(dateVue, p.t.id, p.heure)]).length;
  const siBesoin = etat.traitements.filter((t) => t.siBesoin && estActif(t, dateVue));

  // regroupement par heure
  const groupes = new Map();
  for (const p of prises) {
    if (!groupes.has(p.heure)) groupes.set(p.heure, []);
    groupes.get(p.heure).push(p);
  }
  const maintenant = new Date().toTimeString().slice(0, 5);

  return `
  <section class="carte">
    <div class="nav-date">
      <button class="bouton rond" data-action="jour" data-delta="-1" aria-label="Jour précédent">‹</button>
      <div>
        <div class="jour">${estAujourdhui ? "Aujourd'hui" : JOURS[d.getDay()]}</div>
        <div class="sous">${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</div>
      </div>
      <button class="bouton rond" data-action="jour" data-delta="1" aria-label="Jour suivant">›</button>
    </div>
    ${prises.length ? `
      <div class="progression-jour"><div style="width:${Math.round((faites / prises.length) * 100)}%"></div></div>
      <p class="sous centre">${faites} / ${prises.length} prise${prises.length > 1 ? "s" : ""} effectuée${faites > 1 ? "s" : ""}</p>` : ""}
  </section>

  ${!etat.traitements.length ? `
    <section class="carte vide">
      <p>Aucun traitement enregistré.</p>
      <button class="bouton principal" data-action="aller" data-vue="ordonnance">📷 Scanner une ordonnance</button>
    </section>` : ""}

  ${[...groupes].map(([heure, liste]) => {
    const toutFait = liste.every((p) => etat.prises[clePrise(dateVue, p.t.id, heure)]);
    const enRetard = estAujourdhui && !toutFait && heure < maintenant;
    return `
    <section class="carte creneau ${toutFait ? "fait" : ""} ${enRetard ? "retard" : ""}">
      <div class="creneau-tete">
        <span class="heure">${heure}</span>
        <span class="sous">${liste[0].moment ? libelleMoment(liste[0].moment) : ""}${enRetard ? " · en retard" : ""}</span>
      </div>
      <ul class="liste">
        ${liste.map((p) => {
          const pris = etat.prises[clePrise(dateVue, p.t.id, heure)];
          const med = p.t.medId ? trouverParId(p.t.medId) : null;
          const conseil = med?.moment || p.t.ficheIA?.moment || "";
          return `
          <li class="prise ${pris ? "prise-ok" : ""}">
            <label>
              <input type="checkbox" data-action="cocher" data-id="${p.t.id}" data-heure="${heure}" ${pris ? "checked" : ""}>
              <span>
                <strong>${esc(p.t.nom)}</strong>
                <span class="sous">${esc(libelleQuantite(p.t))}${conseil ? " · " + esc(conseil) : ""}</span>
                ${pris ? `<span class="sous ok">✓ pris à ${new Date(pris).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>` : ""}
              </span>
            </label>
          </li>`;
        }).join("")}
      </ul>
    </section>`;
  }).join("")}

  ${siBesoin.length ? `
    <section class="carte">
      <h3>Si besoin</h3>
      <ul class="liste">${siBesoin.map((t) => `<li><strong>${esc(t.nom)}</strong><div class="sous">${esc(resumePosologie(t, etat.reglages))}</div></li>`).join("")}</ul>
    </section>` : ""}

  ${etat.traitements.length ? `
    <section class="carte">
      <h3>Mes traitements</h3>
      <ul class="liste">
        ${etat.traitements.map((t) => {
          const fin = dateFin(t);
          const termine = fin && fin < new Date(aujourdhui() + "T00:00:00");
          return `
          <li class="${termine ? "termine" : ""}">
            <div class="ligne-titre"><strong>${esc(t.nom)}</strong>${termine ? '<span class="pastille">terminé</span>' : ""}</div>
            <div class="sous">${esc(resumePosologie(t, etat.reglages))}</div>
            <div class="sous">Depuis le ${new Date(t.debut + "T12:00:00").toLocaleDateString("fr-FR")}${fin ? " jusqu'au " + fin.toLocaleDateString("fr-FR") : ""}</div>
            <div class="ligne-boutons petit">
              <button class="bouton" data-action="editer" data-id="${t.id}">Modifier</button>
              <button class="bouton" data-action="supprimer" data-id="${t.id}">Supprimer</button>
            </div>
          </li>`;
        }).join("")}
      </ul>
      <button class="bouton large" data-action="nouveau">➕ Ajouter un médicament</button>
    </section>` : ""}`;
}

// ─────────────────────── Vue : fiches ───────────────────────
function vueFiches() {
  if (!etat.traitements.length) return `<section class="carte vide"><p>Ajoutez des traitements pour voir leurs fiches.</p></section>`;
  return `
  <section class="carte no-print">
    <h2>📘 Fiches de mes traitements</h2>
    <p class="aide">Synthèse indicative. Lisez toujours la notice et demandez conseil à votre pharmacien.</p>
    <button class="bouton" onclick="window.print()">🖨️ Imprimer / PDF</button>
  </section>
  <h1 class="print-only">Mes traitements — ${new Date().toLocaleDateString("fr-FR")}</h1>
  ${etat.traitements.map((t) => {
    const f = t.medId ? trouverParId(t.medId) : t.ficheIA;
    return `
    <article class="carte fiche">
      <h3>${esc(t.nom)}</h3>
      ${f ? `
        <div class="famille">${esc(f.dci)} — ${esc(f.famille)}</div>
        <div class="poso">🗓️ <strong>Ma posologie :</strong> ${esc(resumePosologie(t, etat.reglages))}</div>
        <div class="grille-fiche">
          <div><h4>🎯 Indications</h4><ul>${f.indications.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div><h4>⚠️ Effets indésirables principaux</h4><ul>${f.effets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div class="pleine"><h4>💡 Conseils de prise</h4>
            <p class="moment">⏱️ ${esc(f.moment)}</p>
            <ul>${f.conseils.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          </div>
        </div>
        ${t.ficheIA && !t.medId ? `<p class="aide">Fiche générée par IA — à vérifier avec votre pharmacien.</p>` : ""}` : `
        <p class="aide">Ce médicament n'est pas dans la base locale.</p>
        ${etat.reglages.cleApi ? `<button class="bouton principal no-print" data-action="fiche-ia" data-id="${t.id}">✨ Générer la fiche avec l'IA</button>` :
          `<p class="aide">Vous pouvez l'associer à un médicament de la base (bouton Modifier dans le planning) ou configurer l'IA dans Réglages.</p>`}`}
    </article>`;
  }).join("")}`;
}

// ─────────────────────── Vue : interactions ───────────────────────
function itemsInteractions() {
  return etat.traitements
    .filter((t) => { const f = dateFin(t); return !f || f >= new Date(aujourdhui() + "T00:00:00"); })
    .map((t) => ({ nom: t.nom, med: t.medId ? trouverParId(t.medId) : null }));
}

function carteInteraction(i) {
  const n = NIVEAUX[i.niveau];
  return `
  <li class="interaction ${n.couleur}">
    <div class="ligne-titre"><span class="pastille ${n.couleur}">${n.libelle}</span></div>
    <strong>${esc(i.a)}</strong> + <strong>${esc(i.b)}</strong>
    <p>${esc(i.risque)}</p>
    <p class="conduite">👉 ${esc(i.conduite)}</p>
  </li>`;
}

function vueInteractions() {
  const items = itemsInteractions();
  const res = analyserInteractions(items);
  const horsBase = items.filter((i) => !i.med);
  return `
  <section class="carte">
    <h2>⚖️ Interactions médicamenteuses</h2>
    <p class="aide">Analyse des ${items.length} traitement(s) en cours selon les niveaux du Thésaurus ANSM.</p>
    <div class="legende">${Object.values(NIVEAUX).map((n) => `<span class="pastille ${n.couleur}">${n.libelle}</span>`).join(" ")}</div>
  </section>
  ${items.length < 2 ? `<section class="carte vide"><p>Il faut au moins deux traitements pour rechercher des interactions.</p></section>` :
    res.length ? `<section class="carte"><ul class="liste">${res.map(carteInteraction).join("")}</ul></section>` :
    `<section class="carte"><div class="alerte ok">✅ Aucune interaction connue détectée dans la base locale entre ces traitements.</div></section>`}
  ${horsBase.length ? `<section class="carte"><div class="alerte info">Non vérifiés (hors base locale) : ${horsBase.map((i) => esc(i.nom)).join(", ")}.</div></section>` : ""}
  ${items.length >= 2 && etat.reglages.cleApi ? `
    <section class="carte">
      <button class="bouton large" data-action="interactions-ia">✨ Analyse complémentaire par l'IA</button>
      <div id="res-ia">${interactionsIA ? (interactionsIA.length ? `<ul class="liste">${interactionsIA.map(carteInteraction).join("")}</ul>` : `<div class="alerte ok">L'IA n'a pas relevé d'interaction supplémentaire.</div>`) : ""}</div>
    </section>` : ""}
  <section class="carte"><p class="aide">⚠️ Cette vérification ne couvre pas tous les médicaments ni l'automédication, les plantes ou l'alimentation. Signalez toujours l'ensemble de vos traitements à votre médecin et pharmacien.</p></section>`;
}

// ─────────────────────── Vue : réglages / alarmes ───────────────────────
function vueReglages() {
  const r = etat.reglages;
  const perm = notificationsSupportees() ? Notification.permission : "unsupported";
  return `
  <section class="carte">
    <h2>⏰ Alarmes</h2>
    <label class="interrupteur"><input type="checkbox" data-action="alarmes" ${r.alarmes ? "checked" : ""}> Activer les rappels de prise</label>
    <p class="sous">Notifications : ${{ granted: "autorisées ✅", denied: "bloquées ❌ (à autoriser dans les paramètres du navigateur)", default: "non demandées", unsupported: "non supportées par ce navigateur" }[perm]}
    ${r.alarmes ? ` · ${nombreAlarmesProgrammees()} rappel(s) programmé(s)` : ""}</p>
    <label class="interrupteur"><input type="checkbox" data-action="son" ${r.son ? "checked" : ""}> Son et vibration</label>
    <label>Relance si non coché après
      <select data-action="rappel">${[0, 10, 15, 30, 60].map((m) => `<option value="${m}" ${r.rappelMinutes === m ? "selected" : ""}>${m ? m + " min" : "pas de relance"}</option>`).join("")}</select>
    </label>
    <div class="ligne-boutons">
      <button class="bouton" data-action="tester">🔔 Tester</button>
      <button class="bouton principal" data-action="ics">📅 Exporter vers l'agenda (.ics)</button>
    </div>
    <p class="aide">Les rappels du navigateur fonctionnent tant que l'application est ouverte (idéalement installée sur l'écran d'accueil). Pour des alarmes garanties même téléphone verrouillé et application fermée, exportez le planning dans l'agenda de votre téléphone : chaque prise y est créée avec une alarme.</p>
  </section>

  <section class="carte">
    <h2>🕗 Horaires des moments de prise</h2>
    <div class="grille-heures">
      ${MOMENTS.map((m) => `<label>${libelleMoment(m)}<input type="time" data-action="heure" data-moment="${m}" value="${r.heures[m]}"></label>`).join("")}
    </div>
  </section>

  <section class="carte">
    <h2>✨ Lecture par IA (optionnel)</h2>
    <p class="aide">Avec une clé API Anthropic (Claude), la photo est envoyée à l'API pour une lecture fiable, y compris des ordonnances manuscrites, et pour générer les fiches des médicaments absents de la base. La clé est stockée uniquement sur cet appareil.</p>
    <input type="password" id="cle-api" placeholder="sk-ant-…" value="${esc(r.cleApi)}" autocomplete="off">
    <button class="bouton" data-action="sauver-cle">Enregistrer la clé</button>
  </section>

  <section class="carte">
    <h2>🔒 Données</h2>
    <p class="aide">Toutes vos données restent dans ce navigateur. Aucune donnée n'est envoyée, sauf la photo lors d'une lecture par IA.</p>
    <div class="ligne-boutons">
      <button class="bouton" data-action="exporter">Sauvegarder (JSON)</button>
      <label class="bouton">Restaurer<input type="file" accept="application/json" id="import" hidden></label>
      <button class="bouton danger" data-action="effacer">Tout effacer</button>
    </div>
  </section>

  <section class="carte"><p class="aide">Base locale : ${MEDICAMENTS.length} médicaments courants. Cette application est une aide à l'organisation et ne remplace pas l'avis d'un professionnel de santé.</p></section>`;
}

// ─────────────────────── Formulaire traitement ───────────────────────
function ouvrirFormulaire(t, onValider) {
  const dlg = $("#dialogue");
  const v = { nom: "", medId: null, dosage: "", quantite: 1, unite: "comprimé", moments: ["matin"], heures: [], siBesoin: false,
    dureeJours: null, hebdomadaire: false, debut: aujourdhui(), remarques: [], ...t };
  dlg.innerHTML = `
  <form method="dialog" id="form-t">
    <h2>${t?.nom ? "Modifier" : "Ajouter"} un médicament</h2>
    <label>Nom (tel qu'indiqué sur l'ordonnance)
      <input name="nom" required value="${esc(v.nom)}" list="liste-meds" autocomplete="off">
    </label>
    <datalist id="liste-meds">${MEDICAMENTS.map((m) => `<option value="${esc(m.dci)}">`).join("")}</datalist>
    <label>Correspond à (base de données)
      <select name="medId">
        <option value="">— non trouvé / autre —</option>
        ${[...MEDICAMENTS].sort((a, b) => a.dci.localeCompare(b.dci)).map((m) => `<option value="${m.id}" ${v.medId === m.id ? "selected" : ""}>${esc(m.dci)}</option>`).join("")}
      </select>
    </label>
    <div class="deux-col">
      <label>Quantité par prise<input name="quantite" type="number" step="0.25" min="0.25" value="${v.quantite}"></label>
      <label>Forme<input name="unite" value="${esc(v.unite)}" list="liste-unites"></label>
    </div>
    <datalist id="liste-unites">${["comprimé", "gélule", "sachet", "cuillère", "bouffée", "goutte", "ampoule", "injection", "application", "suppositoire"].map((u) => `<option value="${u}">`).join("")}</datalist>
    <fieldset>
      <legend>Moments de prise</legend>
      ${MOMENTS.map((m) => `<label class="case"><input type="checkbox" name="moment" value="${m}" ${v.moments?.includes(m) ? "checked" : ""}> ${libelleMoment(m)} (${etat.reglages.heures[m]})</label>`).join("")}
      <label>ou heures précises (ex. 06:00, 14:00, 22:00)<input name="heures" value="${esc((v.heures || []).join(", "))}" placeholder="laisser vide pour utiliser les moments"></label>
      <label class="case"><input type="checkbox" name="siBesoin" ${v.siBesoin ? "checked" : ""}> Uniquement si besoin (pas d'alarme)</label>
      <label class="case"><input type="checkbox" name="hebdomadaire" ${v.hebdomadaire ? "checked" : ""}> Une fois par semaine (le même jour que la date de début)</label>
    </fieldset>
    <div class="deux-col">
      <label>Début<input name="debut" type="date" value="${v.debut}"></label>
      <label>Durée (jours)<input name="dureeJours" type="number" min="1" value="${v.dureeJours ?? ""}" placeholder="long cours"></label>
    </div>
    <label>Remarques<input name="remarques" value="${esc((v.remarques || []).join(" · "))}"></label>
    <div class="ligne-boutons">
      <button type="button" class="bouton" value="annuler" id="annuler">Annuler</button>
      <button type="submit" class="bouton principal">Enregistrer</button>
    </div>
  </form>`;
  const form = $("#form-t", dlg);
  // Association automatique au médicament de la base quand on tape le nom
  form.nom.addEventListener("change", () => {
    if (form.medId.value) return;
    const d = detecterMedicament(form.nom.value);
    if (d) form.medId.value = d.med.id;
  });
  $("#annuler", dlg).onclick = () => dlg.close();
  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const heures = String(fd.get("heures") || "").split(/[,;\s]+/).map((h) => h.replace("h", ":").trim())
      .filter((h) => /^\d{1,2}:\d{2}$/.test(h) || /^\d{1,2}:$/.test(h)).map((h) => {
        const [a, b] = h.split(":"); return a.padStart(2, "0") + ":" + (b || "00").padStart(2, "0");
      });
    const res = {
      nom: String(fd.get("nom")).trim(),
      medId: fd.get("medId") || null,
      quantite: parseFloat(fd.get("quantite")) || 1,
      unite: String(fd.get("unite") || "prise").trim(),
      moments: fd.getAll("moment"),
      heures,
      siBesoin: fd.get("siBesoin") === "on",
      hebdomadaire: fd.get("hebdomadaire") === "on",
      debut: fd.get("debut") || aujourdhui(),
      dureeJours: parseInt(fd.get("dureeJours"), 10) || null,
      remarques: String(fd.get("remarques") || "").split("·").map((s) => s.trim()).filter(Boolean),
    };
    if (!res.siBesoin && !res.moments.length && !res.heures.length) {
      alert("Indiquez au moins un moment de prise, des heures, ou cochez « si besoin ».");
      return;
    }
    dlg.close();
    onValider(res);
  };
  dlg.showModal();
}

// ─────────────────────── Actions ───────────────────────
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.tagName === "INPUT" || el.tagName === "SELECT") return;
  const a = el.dataset.action;
  switch (a) {
    case "aller": allerA(el.dataset.vue); break;
    case "jour": {
      const d = new Date(dateVue + "T12:00:00");
      d.setDate(d.getDate() + Number(el.dataset.delta));
      dateVue = aujourdhui(d); rendre(); break;
    }
    case "analyser-local": analyserPhoto("local"); break;
    case "analyser-ia": analyserPhoto("ia"); break;
    case "analyser-texte": {
      const txt = $("#texte-ordo").value;
      brouillon = analyserOrdonnance(txt);
      if (!brouillon.length) alert("Aucun médicament de la base reconnu. Ajoutez-les manuellement.");
      rendre(); break;
    }
    case "editer-brouillon": {
      const i = Number(el.dataset.i);
      ouvrirFormulaire(brouillon[i], (res) => { brouillon[i] = { ...brouillon[i], ...res, certitude: "haute" }; rendre(); });
      break;
    }
    case "retirer-brouillon": brouillon.splice(Number(el.dataset.i), 1); rendre(); break;
    case "valider-brouillon":
      brouillon.forEach(({ certitude, ...t }) => ajouterTraitement({ debut: aujourdhui(), ...t }));
      brouillon = []; photo = null;
      allerA("interactions");
      break;
    case "nouveau": ouvrirFormulaire(null, (res) => ajouterTraitement(res)); break;
    case "editer": {
      const t = etat.traitements.find((x) => x.id === el.dataset.id);
      ouvrirFormulaire(t, (res) => majTraitement(t.id, res));
      break;
    }
    case "supprimer":
      if (confirm("Supprimer ce traitement et son historique ?")) supprimerTraitement(el.dataset.id);
      break;
    case "fiche-ia": {
      const t = etat.traitements.find((x) => x.id === el.dataset.id);
      el.disabled = true; el.textContent = "Génération…";
      try { majTraitement(t.id, { ficheIA: await genererFicheIA(etat.reglages.cleApi, t.nom) }); }
      catch (err) { alert("Erreur : " + err.message); rendre(); }
      break;
    }
    case "interactions-ia": {
      el.disabled = true; el.textContent = "Analyse en cours…";
      try {
        const r = await analyserInteractionsIA(etat.reglages.cleApi, itemsInteractions().map((i) => i.nom));
        interactionsIA = r.interactions;
      } catch (err) { alert("Erreur : " + err.message); }
      rendre(); break;
    }
    case "tester": {
      const p = await demanderPermission();
      notifier("💊 Test de rappel", p === "granted" ? "Les notifications fonctionnent." : "Notifications non autorisées : rappel affiché dans l'application.", "test");
      break;
    }
    case "ics": telechargerICS(); break;
    case "sauver-cle": etat.reglages.cleApi = $("#cle-api").value.trim(); sauver(); alert("Clé enregistrée sur cet appareil."); break;
    case "exporter": {
      const { cleApi, ...reglages } = etat.reglages;
      const blob = new Blob([JSON.stringify({ ...etat, reglages }, null, 2)], { type: "application/json" });
      const lien = document.createElement("a");
      lien.href = URL.createObjectURL(blob); lien.download = "mes-traitements.json"; lien.click();
      break;
    }
    case "effacer": if (confirm("Effacer tous les traitements, l'historique et les réglages ?")) toutEffacer(); break;
    case "fermer-avertissement": etat.reglages.avertissementLu = true; sauver(); $("#avertissement").remove(); break;
  }
});

document.addEventListener("change", async (e) => {
  const el = e.target;
  if (el.id === "photo" && el.files[0]) {
    photo = await preparerImage(el.files[0]);
    brouillon = [];
    rendre();
    return;
  }
  if (el.id === "import" && el.files[0]) {
    try {
      const d = JSON.parse(await el.files[0].text());
      if (!Array.isArray(d.traitements)) throw new Error("Fichier invalide");
      etat.traitements = d.traitements; etat.prises = d.prises || {};
      Object.assign(etat.reglages, d.reglages || {});
      sauver();
    } catch (err) { alert("Import impossible : " + err.message); }
    return;
  }
  switch (el.dataset.action) {
    case "cocher": basculerPrise(dateVue, el.dataset.id, el.dataset.heure); break;
    case "alarmes":
      if (el.checked) {
        const p = await demanderPermission();
        if (p === "denied") alert("Les notifications sont bloquées : les rappels s'afficheront uniquement dans l'application ouverte. Pensez à l'export agenda.");
      }
      etat.reglages.alarmes = el.checked; sauver(); break;
    case "son": etat.reglages.son = el.checked; sauver(); break;
    case "rappel": etat.reglages.rappelMinutes = Number(el.value); sauver(); break;
    case "heure": if (el.value) { etat.reglages.heures[el.dataset.moment] = el.value; sauver(); } break;
  }
});

// ─────────────────────── Démarrage ───────────────────────
abonner(() => { planifierAlarmes(); rendre(); });

if (!etat.reglages.avertissementLu) {
  document.body.insertAdjacentHTML("afterbegin", `
    <div id="avertissement" class="bandeau">
      <p><strong>Important :</strong> cette application est une aide à l'organisation de vos traitements. Elle ne remplace pas l'avis de votre médecin ou pharmacien. Vérifiez toujours les informations lues sur l'ordonnance.</p>
      <button class="bouton" data-action="fermer-avertissement">J'ai compris</button>
    </div>`);
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW", e));
}

// Re-programme les alarmes au retour sur l'application
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { planifierAlarmes(); if (vue === "planning") rendre(); }
});

planifierAlarmes();
allerA(etat.traitements.length ? "planning" : "ordonnance");
