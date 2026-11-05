import { etat, abonner, sauver, aujourdhui, ajouterTraitement, majTraitement, supprimerTraitement,
  basculerPrise, clePrise, toutEffacer, connecterCompte, compteConnecte, remplacerDonnees,
  profilActif, ajouterProfil, majProfil, supprimerProfil, choisirProfil, importerTraitements } from "./store.js";
import { encoderTransfert, decoderTransfert, adresseApplication, lienTransfert, codeDansAdresse, qrSVG,
  scannerPossible, scannerQR } from "./transfert.js";
import { documentImpression, pageAutonome, STYLE_IMPRESSION, tablePlan } from "./impression.js";
import { estClaude, capacite, iaIntegreeImages } from "./plateforme.js";
import { informer, confirmer, esc } from "./ui.js";
import { MEDICAMENTS, trouverParId } from "./data/medicaments.js";
import { analyserInteractions, NIVEAUX } from "./data/interactions.js";
import { analyserOrdonnance, detecterMedicament, MOMENTS } from "./parser.js";
import { preparerImage, ocrLocal, lireOrdonnanceIA, genererFicheIA, analyserInteractionsIA, moteurIA } from "./ocr.js";
import { prisesDuJour, resumePosologie, libelleQuantite, libelleMoment, dateFin, estActif } from "./planning.js";
import { planifierAlarmes, demanderPermission, notifier, telechargerICS, notificationsSupportees, nombreAlarmesProgrammees, horairesAlarmes } from "./alarmes.js";

const $ = (s, el = document) => el.querySelector(s);
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

let vue = "planning";
let dateVue = aujourdhui();
let brouillon = []; // médicaments détectés en attente de validation
let photo = null;
let interactionsIA = null;
let moteur = null;        // "integree" | "cle" | null
let lectureImageIA = false;
let importEnAttente = null; // traitement reçu par QR code / lien, à confirmer
let scan = null;            // lecture de QR code en cours
const estPro = () => etat.reglages.mode === "pro";

async function majMoteurIA() {
  moteur = await moteurIA(etat.reglages.cleApi);
  lectureImageIA = moteur === "cle" || (moteur === "integree" && await iaIntegreeImages());
}

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
  main.innerHTML = importEnAttente ? vueImport() :
    { ordonnance: vueOrdonnance, planning: vuePlanning, fiches: vueFiches, interactions: vueInteractions, reglages: vueReglages }[vue]();
  const choix = $("#choix-patient");
  choix.hidden = !estPro();
  if (estPro()) choix.textContent = "👤 " + profilActif().nom + " ▾";
  const badge = $("#badge-interactions");
  const n = analyserInteractions(itemsInteractions()).filter((i) => NIVEAUX[i.niveau].rang >= 3).length;
  badge.textContent = n || "";
  badge.hidden = !n;
}

// ─────────────────────── Vue : ordonnance ───────────────────────
function vueOrdonnance() {
  const ia = lectureImageIA;
  const ocrLocalPossible = !estClaude; // Tesseract télécharge ses modèles : impossible dans une page claude.ai
  return `
  <section class="carte">
    <h2>📷 Scanner une ordonnance</h2>
    <p class="aide">Prenez l'ordonnance en photo bien à plat, éclairée, cadrée sur la liste des médicaments.</p>
    <div class="choix-photo">
      <label class="bouton principal large">
        <input type="file" accept="image/*" capture="environment" id="photo" class="champ-fichier">
        📷 Prendre une photo
      </label>
      <label class="bouton large">
        <input type="file" accept="image/*" id="photo-galerie" class="champ-fichier">
        🖼️ Choisir une photo existante
      </label>
    </div>
    ${photo ? "" : `<p class="aide">Si l'appareil photo ne s'ouvre pas : prenez l'ordonnance en photo avec l'appareil photo du téléphone, puis utilisez « Choisir une photo existante ».${estClaude ? " Ouvrir la page dans Safari ou Chrome plutôt que dans l'application Claude aide aussi." : ""}</p>`}
    ${photo ? `<img src="${photo.dataUrl}" class="apercu" alt="Ordonnance">` : ""}
    ${photo ? `
      <div class="ligne-boutons">
        ${ia ? `<button class="bouton principal" data-action="analyser-ia">✨ Lire l'ordonnance avec l'IA</button>` : ""}
        ${ocrLocalPossible ? `<button class="bouton ${ia ? "" : "principal"}" data-action="analyser-local">Lire (OCR local)</button>` : ""}
      </div>
      <p class="aide">${ia ? "L'IA lit aussi les ordonnances manuscrites." + (moteur === "integree" ? " La première fois, claude.ai vous demande d'autoriser la page à utiliser Claude." : "") :
        ocrLocalPossible ? "L'OCR local fonctionne bien sur les ordonnances imprimées. Pour les ordonnances manuscrites, configurez la lecture IA dans l'onglet Alarmes." :
        "La lecture d'image n'est pas disponible ici : saisissez le texte de l'ordonnance ci-dessous."}</p>` : ""}
    <div id="progression"></div>
  </section>

  ${!estPro() && scannerPossible() ? `
  <section class="carte">
    <h2>📲 Traitement transmis par un soignant</h2>
    <p class="aide">Votre infirmier, médecin ou pharmacien vous montre un QR code : scannez-le pour recevoir votre planning.</p>
    <button class="bouton large" data-action="scanner">📷 Scanner le QR code</button>
    <div id="zone-scan"></div>
  </section>` : ""}

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
      const r = await lireOrdonnanceIA(etat.reglages.cleApi, photo);
      if (!r.medicaments.length) {
        prog.innerHTML = `<div class="alerte warning">Aucun médicament trouvé sur cette photo. Essayez une photo plus nette, bien éclairée et cadrée sur l'ordonnance.</div>`;
        return;
      }
      brouillon = r.medicaments.map((m) => {
        const det = detecterMedicament(m.dci + " " + m.nom);
        return {
          nom: [m.nom, m.dosage && !String(m.nom).includes(m.dosage) ? m.dosage : ""].filter(Boolean).join(" "),
          medId: det?.med.id || null,
          dosage: m.dosage, quantite: m.quantite || 1, unite: m.unite || "prise",
          moments: (m.moments || []).filter((x) => MOMENTS.includes(x)),
          heures: (m.heures || []).filter((h) => /^\d{2}:\d{2}$/.test(h)), siBesoin: !!m.siBesoin,
          dureeJours: m.dureeJours, hebdomadaire: m.hebdomadaire,
          remarques: m.remarques || [], texteSource: m.texteSource, certitude: "haute",
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
  <section class="carte">
    <h2>📘 Fiches ${estPro() ? "de " + esc(profilActif().nom) : "de mes traitements"}</h2>
    <p class="aide">Synthèse indicative. Lisez toujours la notice et demandez conseil à votre pharmacien.</p>
    <div class="ligne-boutons">
      <button class="bouton principal" data-action="ouvrir-impression">🖨️ Imprimer pour le patient</button>
      ${estPro() ? `<button class="bouton principal" data-action="transmettre">📲 Envoyer sur son téléphone</button>` : ""}
    </div>
  </section>
  <section class="carte">
    <h3>Plan de prise</h3>
    <div class="defile-x">${tablePlan(etat.traitements, etat.reglages, { classe: "table-plan ecran" })}</div>
  </section>
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
        ${moteur ? `<button class="bouton principal no-print" data-action="fiche-ia" data-id="${t.id}">✨ Générer la fiche avec l'IA</button>` :
          `<p class="aide">Vous pouvez l'associer à un médicament de la base (bouton Modifier dans le planning) ou configurer l'IA dans l'onglet Alarmes.</p>`}`}
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
  ${items.length >= 2 && moteur ? `
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
  const horaires = horairesAlarmes();
  return `
  <section class="carte">
    <h2>⏰ Rappels de prise</h2>
    <label class="interrupteur"><input type="checkbox" id="opt-alarmes" data-action="alarmes" ${r.alarmes ? "checked" : ""}> Activer les rappels de prise</label>
    ${estClaude ? `<p class="sous">Dans cette version, le rappel sonne et s'affiche quand la page est ouverte${r.alarmes ? ` · ${nombreAlarmesProgrammees()} rappel(s) programmé(s)` : ""}.</p>` :
      `<p class="sous">Notifications : ${{ granted: "autorisées ✅", denied: "bloquées ❌ (à autoriser dans les paramètres du navigateur)", default: "non demandées", unsupported: "non supportées par ce navigateur" }[perm]}${r.alarmes ? ` · ${nombreAlarmesProgrammees()} rappel(s) programmé(s)` : ""}</p>`}
    <label class="interrupteur"><input type="checkbox" id="opt-son" data-action="son" ${r.son ? "checked" : ""}> Son et vibration</label>
    <label>Relance si non coché après
      <select id="opt-rappel" data-action="rappel">${[0, 10, 15, 30, 60].map((m) => `<option value="${m}" ${r.rappelMinutes === m ? "selected" : ""}>${m ? m + " min" : "pas de relance"}</option>`).join("")}</select>
    </label>
    <div class="ligne-boutons">
      <button class="bouton" data-action="tester">🔔 Tester le rappel</button>
      ${estClaude ? "" : `<button class="bouton principal" data-action="ics">📅 Exporter vers l'agenda (.ics)</button>`}
    </div>
  </section>

  <section class="carte">
    <h2>📱 Alarmes du téléphone</h2>
    <p class="aide">Pour être prévenu même téléphone verrouillé et application fermée, créez ces alarmes quotidiennes dans l'application Horloge${estClaude ? "" : " ou importez le fichier agenda ci-dessus"}.</p>
    ${horaires.length ? `<ul class="liste">${horaires.map((h) => `
      <li><div class="ligne-titre"><span class="heure">${h.heure}</span></div><div class="sous">${esc(h.noms.join(" · "))}</div></li>`).join("")}</ul>
      <button class="bouton" data-action="copier-horaires">📋 Copier la liste</button>` :
      `<p class="sous">Aucune prise programmée aujourd'hui.</p>`}
  </section>

  <section class="carte">
    <h2>🕗 Horaires des moments de prise</h2>
    <div class="grille-heures">
      ${MOMENTS.map((m) => `<label>${libelleMoment(m)}<input type="time" id="heure-${m}" data-action="heure" data-moment="${m}" value="${r.heures[m]}"></label>`).join("")}
    </div>
  </section>

  ${estClaude ? `
  <section class="carte">
    <h2>✨ Lecture par IA</h2>
    <p class="aide">${lectureImageIA ? "Active : la page utilise Claude via votre compte claude.ai, sans clé API." : "L'IA intégrée n'est pas disponible dans cette vue."}</p>
  </section>` : `
  <section class="carte">
    <h2>✨ Lecture par IA (optionnel)</h2>
    <p class="aide">Avec une clé API Anthropic (Claude), la photo est envoyée à l'API pour une lecture fiable, y compris des ordonnances manuscrites, et pour générer les fiches des médicaments absents de la base. La clé est stockée uniquement sur cet appareil.</p>
    <input type="password" id="cle-api" placeholder="sk-ant-…" value="${esc(r.cleApi)}" autocomplete="off">
    <button class="bouton" data-action="sauver-cle">Enregistrer la clé</button>
  </section>`}

  <section class="carte">
    <h2>🩺 Mode professionnel</h2>
    <label class="interrupteur"><input type="checkbox" id="opt-pro" data-action="mode-pro" ${estPro() ? "checked" : ""}> Je suis soignant : gérer plusieurs patients</label>
    ${estPro() ? `
      <p class="aide">Chaque patient a son dossier (bouton en haut de l'écran). Les rappels sont désactivés dans ce mode. Les données restent sur cet appareil${compteConnecte() ? " et dans votre espace privé claude.ai" : ""} : protégez-le par un code et ne le prêtez pas.</p>
      <label>Votre nom (imprimé sur les documents)<input id="pro-nom" data-action="pro" data-champ="nom" value="${esc(r.pro.nom)}" placeholder="ex. Nicolas R., infirmier"></label>
      <label>Contact (imprimé sur les documents)<input id="pro-contact" data-action="pro" data-champ="contact" value="${esc(r.pro.contact)}" placeholder="ex. 06 00 00 00 00"></label>
      <label>Adresse de l'appli pour vos patients (QR code)
        <input id="adresse-publique" data-action="adresse" value="${esc(r.adressePublique)}" placeholder="${esc(adresseApplication("") || "https://votre-compte.github.io/Test/")}">
      </label>
      <p class="aide">${estClaude ? "Obligatoire ici : vos patients n'ont pas accès à cette page claude.ai. Mettez l'adresse GitHub Pages de l'appli." : "Laissez vide pour utiliser l'adresse actuelle."}</p>` : ""}
  </section>

  <section class="carte">
    <h2>🔒 Données</h2>
    <p class="aide">${compteConnecte() ? "Vos données sont sauvegardées de façon privée sur votre compte claude.ai (personne d'autre n'y a accès) et sur cet appareil." :
      "Toutes vos données restent dans ce navigateur. Aucune donnée n'est envoyée, sauf la photo lors d'une lecture par IA."}</p>
    <div class="ligne-boutons">
      <button class="bouton" data-action="exporter">Sauvegarder (JSON)</button>
      <label class="bouton">Restaurer<input type="file" accept="application/json" id="import" hidden></label>
      <button class="bouton danger" data-action="effacer">Tout effacer</button>
    </div>
  </section>

  <section class="carte"><p class="aide">Base locale : ${MEDICAMENTS.length} médicaments courants. Cette application est une aide à l'organisation et ne remplace pas l'avis d'un professionnel de santé.</p></section>`;
}

// ─────────────────────── Import d'un traitement transmis ───────────────────────
function vueImport() {
  const imp = importEnAttente;
  const existant = etat.traitements.length > 0;
  return `
  <section class="carte surligne">
    <h2>📲 Traitement reçu</h2>
    <p>${imp.patient && imp.patient !== "Moi" ? `Pour <strong>${esc(imp.patient)}</strong>, ` : ""}transmis le ${imp.date ? new Date(imp.date + "T12:00:00").toLocaleDateString("fr-FR") : "?"}.</p>
    <ul class="liste">
      ${imp.traitements.map((t) => `<li><strong>${esc(t.nom)}</strong><div class="sous">${esc(resumePosologie(t, { ...etat.reglages, heures: { ...etat.reglages.heures, ...imp.heures } }))}</div></li>`).join("")}
    </ul>
    <p class="aide">Vérifiez que ce traitement correspond bien à votre ordonnance.</p>
    <div class="ligne-boutons">
      ${existant ? `<button class="bouton principal" data-action="import" data-mode="remplacer">Remplacer mon traitement actuel</button>
        <button class="bouton" data-action="import" data-mode="ajouter">Ajouter à mon traitement</button>` :
        `<button class="bouton principal" data-action="import" data-mode="remplacer">Enregistrer ce traitement</button>`}
      <button class="bouton" data-action="import" data-mode="annuler">Annuler</button>
    </div>
  </section>`;
}

async function recevoirCode(texte) {
  try {
    importEnAttente = await decoderTransfert(texte);
    allerA("planning");
  } catch {
    informer("Ce QR code ne contient pas de traitement MédocPlanner.");
  }
}

// ─────────────────────── Patients (mode professionnel) ───────────────────────
function ouvrirPatients() {
  const dlg = $("#dialogue");
  const liste = [...etat.profils].sort((a, b) => a.nom.localeCompare(b.nom));
  dlg.innerHTML = `
    <h2>Mes patients</h2>
    <ul class="liste">
      ${liste.map((p) => `
        <li class="${p.id === etat.profilActif ? "patient-actif" : ""}">
          <div class="ligne-titre"><strong>${esc(p.nom)}</strong>${p.id === etat.profilActif ? '<span class="pastille info">ouvert</span>' : ""}</div>
          <div class="sous">${p.traitements.length} traitement(s)${p.naissance ? " · né(e) le " + new Date(p.naissance + "T12:00:00").toLocaleDateString("fr-FR") : ""}${p.allergies ? " · ⚠ " + esc(p.allergies) : ""}</div>
          <div class="ligne-boutons petit">
            ${p.id !== etat.profilActif ? `<button class="bouton principal" data-patient="ouvrir" data-id="${p.id}">Ouvrir</button>` : ""}
            <button class="bouton" data-patient="modifier" data-id="${p.id}">Modifier</button>
            <button class="bouton" data-patient="supprimer" data-id="${p.id}">Supprimer</button>
          </div>
        </li>`).join("")}
    </ul>
    <div class="ligne-boutons">
      <button class="bouton" data-patient="fermer">Fermer</button>
      <button class="bouton principal" data-patient="nouveau">➕ Nouveau patient</button>
    </div>`;
  dlg.onclick = async (e) => {
    const b = e.target.closest("[data-patient]");
    if (!b) return;
    const id = b.dataset.id;
    switch (b.dataset.patient) {
      case "fermer": dlg.close(); break;
      case "ouvrir": choisirProfil(id); dlg.close(); allerA("planning"); informer("Dossier ouvert : " + profilActif().nom); break;
      case "nouveau": dlg.onclick = null; ouvrirFichePatient(null); break;
      case "modifier": dlg.onclick = null; ouvrirFichePatient(etat.profils.find((p) => p.id === id)); break;
      case "supprimer": {
        const p = etat.profils.find((x) => x.id === id);
        dlg.close();
        if (await confirmer(`Supprimer le dossier de ${p.nom} et tout son historique ?`, "Supprimer")) supprimerProfil(id);
        ouvrirPatients();
        break;
      }
    }
  };
  if (!dlg.open) dlg.showModal();
}

function ouvrirFichePatient(p) {
  const dlg = $("#dialogue");
  dlg.innerHTML = `
  <form id="form-patient">
    <h2>${p ? "Modifier le patient" : "Nouveau patient"}</h2>
    <label>Nom et prénom<input name="nom" required value="${esc(p?.nom || "")}" autocomplete="off"></label>
    <label>Date de naissance<input name="naissance" type="date" value="${esc(p?.naissance || "")}"></label>
    <label>Allergies connues<input name="allergies" value="${esc(p?.allergies || "")}" placeholder="ex. pénicilline"></label>
    <label>Notes<textarea name="notes" rows="2">${esc(p?.notes || "")}</textarea></label>
    <div class="ligne-boutons">
      <button type="button" class="bouton" id="retour-patients">Retour</button>
      <button type="submit" class="bouton principal">Enregistrer</button>
    </div>
  </form>`;
  $("#retour-patients", dlg).onclick = () => ouvrirPatients();
  $("#form-patient", dlg).onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const champs = { nom: String(fd.get("nom")).trim(), naissance: fd.get("naissance") || "", allergies: String(fd.get("allergies")).trim(), notes: String(fd.get("notes")).trim() };
    if (p) majProfil(p.id, champs); else ajouterProfil(champs);
    dlg.close();
    allerA(p ? vue : "ordonnance");
    if (!p) informer("Dossier créé : scannez ou saisissez son ordonnance.");
  };
  if (!dlg.open) dlg.showModal();
}

// ─────────────────────── Transmission au téléphone du patient ───────────────────────
async function ouvrirTransmission() {
  const dlg = $("#dialogue");
  const profil = profilActif();
  const adresse = adresseApplication(etat.reglages.adressePublique);
  if (!adresse) {
    dlg.innerHTML = `<h2>Envoyer sur le téléphone du patient</h2>
      <p class="aide">Indiquez d'abord l'adresse publique de l'application (par exemple votre page GitHub Pages) dans l'onglet Alarmes, rubrique « Mode professionnel ».</p>
      <div class="ligne-boutons"><button class="bouton principal" id="fermer-dlg">OK</button></div>`;
    $("#fermer-dlg", dlg).onclick = () => dlg.close();
    dlg.showModal();
    return;
  }
  const code = await encoderTransfert(profil, etat.reglages.heures);
  const lien = lienTransfert(adresse, code);
  let qr;
  try { qr = qrSVG(lien); } catch (e) { qr = `<p class="alerte warning">${esc(e.message)}</p>`; }
  dlg.innerHTML = `
    <h2>Envoyer sur le téléphone de ${esc(profil.nom)}</h2>
    <ol class="etapes">
      <li>Le patient ouvre l'appareil photo de son téléphone (ou le bouton « Scanner le QR code » de l'appli s'il l'a déjà installée).</li>
      <li>Il vise ce QR code et ouvre le lien.</li>
      <li>Il vérifie le traitement, l'enregistre, puis ajoute l'appli à son écran d'accueil.</li>
    </ol>
    <div class="qr">${qr}</div>
    <p class="aide">${profil.traitements.length} traitement(s). Le traitement est contenu dans le QR code lui-même : rien n'est stocké sur un serveur.</p>
    <p class="aide">Sur iPhone, si le patient a déjà installé l'appli sur l'écran d'accueil, il doit scanner depuis l'appli (bouton « Scanner le QR code »), sinon le traitement s'enregistre dans Safari et pas dans l'appli.</p>
    <div class="ligne-boutons">
      <button class="bouton" id="copier-lien">Copier le lien</button>
      <button class="bouton principal" id="fermer-dlg">Fermer</button>
    </div>`;
  $("#fermer-dlg", dlg).onclick = () => dlg.close();
  $("#copier-lien", dlg).onclick = async () => {
    try { await navigator.clipboard.writeText(lien); informer("Lien copié : vous pouvez l'envoyer par SMS ou e-mail."); }
    catch { informer("Copie impossible sur cet appareil."); }
  };
  dlg.showModal();
}

// ─────────────────────── Impression ───────────────────────
function ouvrirImpression() {
  const dlg = $("#dialogue");
  dlg.innerHTML = `
  <form id="form-impression">
    <h2>Imprimer pour ${estPro() ? esc(profilActif().nom) : "le patient"}</h2>
    <p class="aide">Le plan de prise et les fiches explicatives sont imprimés sur des feuilles séparées.</p>
    <label class="case"><input type="checkbox" name="plan" checked> Feuille 1 : plan de prise (Nom / Matin / Midi / Soir / Coucher)</label>
    <label class="case"><input type="checkbox" name="fiches" checked> Feuille 2 : fiches (à quoi il sert, effets possibles, comment le prendre)</label>
    <label class="case"><input type="checkbox" name="precautions" checked> Feuille 2 : précautions et interactions</label>
    <label class="case"><input type="checkbox" name="calendrier"> Page en plus : calendrier de prises à cocher</label>
    <label>Durée du calendrier
      <select name="jours"><option value="7">1 semaine</option><option value="14">2 semaines</option><option value="28">4 semaines</option></select>
    </label>
    ${estClaude ? `<p class="aide">Ici, l'impression directe n'est pas possible : le document est enregistré sur votre appareil, ouvrez-le puis imprimez-le.</p>` : ""}
    <div class="ligne-boutons">
      <button type="button" class="bouton" id="annuler-imp">Annuler</button>
      <button type="submit" class="bouton principal">${estClaude ? "Enregistrer le document" : "Imprimer"}</button>
    </div>
  </form>`;
  $("#annuler-imp", dlg).onclick = () => dlg.close();
  $("#form-impression", dlg).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const options = { plan: fd.has("plan"), calendrier: fd.has("calendrier"), precautions: fd.has("precautions"), fiches: fd.has("fiches"), jours: Number(fd.get("jours")) };
    dlg.close();
    const profil = profilActif();
    if (estClaude) {
      const downloads = await capacite("downloads");
      if (!downloads) { informer("L'enregistrement n'est pas disponible dans cette vue."); return; }
      const nom = "plan-de-traitement-" + (profil.nom || "patient").normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase() + ".html";
      try { await downloads.save({ filename: nom, data: pageAutonome(profil, etat.reglages, options) }); }
      catch (err) { if (err?.code !== "declined") informer("Enregistrement impossible : " + (err?.message || err)); }
      return;
    }
    const zone = $("#impression");
    zone.innerHTML = `<style>${STYLE_IMPRESSION}</style>` + documentImpression(profil, etat.reglages, options);
    document.body.classList.add("mode-impression");
    const fin = () => { document.body.classList.remove("mode-impression"); zone.innerHTML = ""; window.removeEventListener("afterprint", fin); };
    window.addEventListener("afterprint", fin);
    setTimeout(() => window.print(), 50);
  };
  dlg.showModal();
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
      informer("Indiquez au moins un moment de prise, des heures, ou cochez « si besoin ».");
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
      if (!brouillon.length) informer("Aucun médicament de la base reconnu. Ajoutez-les manuellement.");
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
      if (await confirmer("Supprimer ce traitement et son historique ?", "Supprimer")) supprimerTraitement(el.dataset.id);
      break;
    case "fiche-ia": {
      const t = etat.traitements.find((x) => x.id === el.dataset.id);
      el.disabled = true; el.textContent = "Génération…";
      try { majTraitement(t.id, { ficheIA: await genererFicheIA(etat.reglages.cleApi, t.nom) }); }
      catch (err) { informer("Erreur : " + err.message); rendre(); }
      break;
    }
    case "interactions-ia": {
      el.disabled = true; el.textContent = "Analyse en cours…";
      try {
        const r = await analyserInteractionsIA(etat.reglages.cleApi, itemsInteractions().map((i) => i.nom));
        interactionsIA = r;
      } catch (err) { informer("Erreur : " + err.message); }
      rendre(); break;
    }
    case "tester": {
      const p = estClaude ? "unsupported" : await demanderPermission();
      notifier("💊 Test de rappel", p === "granted" ? "Les notifications fonctionnent." : "Le rappel s'affiche dans l'application quand elle est ouverte.", "test");
      break;
    }
    case "ics": telechargerICS(); break;
    case "sauver-cle":
      etat.reglages.cleApi = $("#cle-api").value.trim();
      await majMoteurIA(); sauver(); informer("Clé enregistrée sur cet appareil."); break;
    case "imprimer": window.print(); break;
    case "copier-horaires": {
      const txt = horairesAlarmes().map((h) => `${h.heure} : ${h.noms.join(", ")}`).join("\n");
      try { await navigator.clipboard.writeText(txt); informer("Liste copiée."); }
      catch { informer(txt, 15000); }
      break;
    }
    case "exporter": {
      const { cleApi, ...reglages } = etat.reglages;
      const json = JSON.stringify({ ...etat, reglages }, null, 2);
      const downloads = await capacite("downloads");
      if (downloads) {
        try { await downloads.save({ filename: "mes-traitements.json", data: json }); }
        catch (err) { if (err?.code !== "declined") informer("Sauvegarde impossible : " + (err?.message || err)); }
      } else if (estClaude) {
        informer("Le téléchargement n'est pas disponible dans cette vue.");
      } else {
        const lien = document.createElement("a");
        lien.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        lien.download = "mes-traitements.json"; lien.click();
      }
      break;
    }
    case "effacer":
      if (await confirmer("Effacer tous les traitements, l'historique et les réglages ?", "Tout effacer")) { await toutEffacer(); informer("Données effacées."); }
      break;
    case "ouvrir-impression": ouvrirImpression(); break;
    case "transmettre": ouvrirTransmission(); break;
    case "patients": ouvrirPatients(); break;
    case "scanner": {
      if (scan) { scan.arreter(); scan = null; el.textContent = "📷 Scanner le QR code"; break; }
      el.textContent = "Arrêter";
      scan = scannerQR($("#zone-scan"));
      try { const txt = await scan.resultat; scan = null; await recevoirCode(txt); }
      catch (err) { scan = null; el.textContent = "📷 Scanner le QR code"; informer("Caméra indisponible : " + (err?.message || err)); }
      break;
    }
    case "import": {
      const mode = el.dataset.mode;
      if (mode !== "annuler") {
        importerTraitements(importEnAttente.traitements, { remplacer: mode === "remplacer", heures: importEnAttente.heures });
        informer("Traitement enregistré. Pensez à ajouter l'appli à votre écran d'accueil.", 7000);
      }
      importEnAttente = null;
      allerA("planning");
      break;
    }
    case "fermer-avertissement": etat.reglages.avertissementLu = true; sauver(); $("#avertissement").remove(); break;
  }
});

document.addEventListener("change", async (e) => {
  const el = e.target;
  if ((el.id === "photo" || el.id === "photo-galerie") && el.files[0]) {
    const fichier = el.files[0];
    el.value = ""; // permet de reprendre la même photo
    try {
      photo = await preparerImage(fichier);
      brouillon = [];
      rendre();
    } catch {
      informer("Cette image n'a pas pu être ouverte. Essayez une photo au format JPEG ou PNG.", 7000);
    }
    return;
  }
  if (el.id === "import" && el.files[0]) {
    try {
      const d = JSON.parse(await el.files[0].text());
      if (!Array.isArray(d.traitements)) throw new Error("fichier invalide");
      remplacerDonnees(d);
      informer("Données restaurées.");
    } catch (err) { informer("Import impossible : " + err.message); }
    return;
  }
  switch (el.dataset.action) {
    case "cocher": basculerPrise(dateVue, el.dataset.id, el.dataset.heure); break;
    case "alarmes":
      if (el.checked && !estClaude) {
        const p = await demanderPermission();
        if (p === "denied") informer("Les notifications sont bloquées : les rappels s'afficheront uniquement dans l'application ouverte. Pensez aux alarmes du téléphone.", 8000);
      }
      etat.reglages.alarmes = el.checked; sauver(); break;
    case "son": etat.reglages.son = el.checked; sauver(); break;
    case "rappel": etat.reglages.rappelMinutes = Number(el.value); sauver(); break;
    case "heure": if (el.value) { etat.reglages.heures[el.dataset.moment] = el.value; sauver(); } break;
    case "mode-pro":
      etat.reglages.mode = el.checked ? "pro" : "patient";
      if (el.checked && profilActif().nom === "Moi" && !profilActif().traitements.length) profilActif().nom = "Patient 1";
      sauver();
      if (el.checked) informer("Mode soignant activé : créez vos patients avec le bouton en haut de l'écran.", 6000);
      break;
    case "pro": etat.reglages.pro[el.dataset.champ] = el.value.trim(); sauver(); break;
    case "adresse": etat.reglages.adressePublique = el.value.trim(); sauver(); break;
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

if (!estClaude && "serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW", e));
}

// Re-programme les alarmes au retour sur l'application
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { planifierAlarmes(); if (vue === "planning") rendre(); }
});

$("#choix-patient").addEventListener("click", ouvrirPatients);

planifierAlarmes();
const codeRecu = codeDansAdresse();
if (codeRecu) {
  history.replaceState(null, "", location.pathname + location.search); // le traitement ne reste pas dans l'historique
  recevoirCode(codeRecu);
} else {
  allerA(etat.traitements.length ? "planning" : "ordonnance");
}

// Fonctions qui dépendent de la plateforme : activées dès qu'elles répondent
majMoteurIA().then(() => { if (vue !== "planning") rendre(); });
if (estClaude) {
  connecterCompte().then((ok) => {
    if (etat.reglages.avertissementLu) document.getElementById("avertissement")?.remove();
    if (ok && vue === "ordonnance" && etat.traitements.length && !photo && !brouillon.length) allerA("planning");
  });
}
