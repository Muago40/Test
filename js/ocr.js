// Lecture de l'ordonnance à partir d'une photo.
//  - Mode local : OCR Tesseract.js (gratuit, dans le navigateur, adapté aux ordonnances imprimées)
//  - Mode IA (optionnel) : Claude (vision) avec la clé API de l'utilisateur, bien plus fiable,
//    y compris sur les ordonnances manuscrites.

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const ANTHROPIC_SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm";
export const MODELE_CLAUDE = "claude-opus-5-5";

/** Redimensionne l'image et la renvoie en JPEG (dataURL + base64). */
export async function preparerImage(fichier, maxCote = 1800) {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Image illisible"));
      i.src = url;
    });
    const ratio = Math.min(1, maxCote / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * ratio);
    c.height = Math.round(img.height * ratio);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.88);
    return { dataUrl, base64: dataUrl.split(",")[1], canvas: c };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function chargerScript(src) {
  return new Promise((ok, ko) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script");
    s.src = src;
    s.onload = ok;
    s.onerror = () => ko(new Error("Impossible de charger " + src + " (connexion internet requise)"));
    document.head.appendChild(s);
  });
}

/** OCR local, renvoie le texte brut. */
export async function ocrLocal(canvas, onProgres = () => {}) {
  await chargerScript(TESSERACT_URL);
  // Pré-traitement : niveaux de gris + contraste
  const c = document.createElement("canvas");
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext("2d");
  ctx.filter = "grayscale(1) contrast(1.4)";
  ctx.drawImage(canvas, 0, 0);
  const { data } = await window.Tesseract.recognize(c, "fra", {
    logger: (m) => { if (m.status === "recognizing text") onProgres(Math.round(m.progress * 100)); },
  });
  return data.text;
}

// ─────────────── Claude (optionnel) ───────────────

let clientCache = null;
async function client(cle) {
  if (clientCache && clientCache.cle === cle) return clientCache.client;
  const { default: Anthropic } = await import(ANTHROPIC_SDK_URL);
  // La clé reste sur l'appareil de l'utilisateur ; l'appel est fait directement depuis le navigateur.
  const c = new Anthropic({ apiKey: cle, dangerouslyAllowBrowser: true });
  clientCache = { cle, client: c };
  return c;
}

async function appelJSON(cle, contenu, schema, systeme) {
  const c = await client(cle);
  const reponse = await c.beta.messages.create({
    model: MODELE_CLAUDE,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    system: systeme,
    messages: [{ role: "user", content: contenu }],
  });
  if (reponse.stop_reason === "refusal") throw new Error("Claude a refusé de traiter cette demande.");
  if (reponse.stop_reason === "max_tokens") throw new Error("Réponse tronquée, réessayez.");
  const texte = reponse.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(texte);
}

const SCHEMA_ORDONNANCE = {
  type: "object",
  additionalProperties: false,
  required: ["medicaments", "prescripteur", "date"],
  properties: {
    prescripteur: { type: "string", description: "Nom du médecin si lisible, sinon chaîne vide" },
    date: { type: "string", description: "Date de l'ordonnance au format AAAA-MM-JJ si lisible, sinon chaîne vide" },
    medicaments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nom", "dci", "dosage", "quantite", "unite", "moments", "heures", "siBesoin", "dureeJours", "hebdomadaire", "remarques", "texteSource"],
        properties: {
          nom: { type: "string", description: "Nom tel qu'écrit (commercial ou DCI)" },
          dci: { type: "string", description: "DCI (molécule) en français" },
          dosage: { type: "string", description: "ex. '500 mg'" },
          quantite: { type: "number", description: "Quantité par prise" },
          unite: { type: "string", description: "comprimé, gélule, sachet, bouffée…" },
          moments: { type: "array", items: { type: "string", enum: ["matin", "midi", "soir", "coucher"] } },
          heures: { type: "array", items: { type: "string" }, description: "Heures HH:MM si posologie en intervalle (toutes les X heures), sinon vide" },
          siBesoin: { type: "boolean" },
          dureeJours: { type: ["integer", "null"], description: "Durée en jours, null si traitement au long cours ou non précisé" },
          hebdomadaire: { type: "boolean", description: "Vrai si une prise par semaine" },
          remarques: { type: "array", items: { type: "string" } },
          texteSource: { type: "string", description: "Ligne(s) de l'ordonnance correspondante(s)" },
        },
      },
    },
  },
};

export async function lireOrdonnanceIA(cle, base64) {
  return appelJSON(cle, [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
    { type: "text", text: "Voici la photo d'une ordonnance médicale française. Extrais chaque médicament prescrit avec sa posologie. Si un élément est illisible ou incertain, indique-le dans 'remarques' plutôt que de deviner. N'invente aucun médicament." },
  ], SCHEMA_ORDONNANCE,
  "Tu es un assistant de lecture d'ordonnances pour une application d'aide à l'observance. Tu transcris fidèlement ; tu ne poses pas de diagnostic.");
}

const SCHEMA_FICHE = {
  type: "object",
  additionalProperties: false,
  required: ["dci", "famille", "indications", "effets", "conseils", "moment"],
  properties: {
    dci: { type: "string" },
    famille: { type: "string" },
    indications: { type: "array", items: { type: "string" } },
    effets: { type: "array", items: { type: "string" } },
    conseils: { type: "array", items: { type: "string" } },
    moment: { type: "string", description: "Moment de prise conseillé par rapport aux repas" },
  },
};

export async function genererFicheIA(cle, nom) {
  return appelJSON(cle, [{ type: "text", text: `Rédige une fiche patient synthétique, en français simple, pour le médicament « ${nom} » (tel que commercialisé en France) : famille thérapeutique, principales indications, 3 à 6 effets indésirables principaux, conseils de prise pratiques. Si le médicament t'est inconnu, indique-le dans 'famille' et laisse les listes vides.` }],
  SCHEMA_FICHE, "Tu es pharmacien et tu rédiges des fiches d'information patient fiables et concises.");
}

const SCHEMA_INTERACTIONS = {
  type: "object",
  additionalProperties: false,
  required: ["interactions"],
  properties: {
    interactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["a", "b", "niveau", "risque", "conduite"],
        properties: {
          a: { type: "string" }, b: { type: "string" },
          niveau: { type: "string", enum: ["CI", "AD", "PE", "APEC"] },
          risque: { type: "string" }, conduite: { type: "string" },
        },
      },
    },
  },
};

export async function analyserInteractionsIA(cle, noms) {
  return appelJSON(cle, [{ type: "text", text: `Liste de traitements d'un patient : ${noms.join(" ; ")}.\nIdentifie les interactions médicamenteuses cliniquement pertinentes selon le Thésaurus ANSM (niveaux CI, AD, PE, APEC) et les doublons thérapeutiques. Ne liste que des interactions réelles et documentées.` }],
  SCHEMA_INTERACTIONS, "Tu es pharmacien clinicien. Tu es précis et tu n'inventes pas d'interactions.");
}
