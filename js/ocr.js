// Lecture de l'ordonnance à partir d'une photo.
//  - Mode local : OCR Tesseract.js (gratuit, dans le navigateur, adapté aux ordonnances imprimées)
//  - Mode IA (optionnel) : Claude (vision) avec la clé API de l'utilisateur, bien plus fiable,
//    y compris sur les ordonnances manuscrites.

import { capacite, iaIntegreeImages } from "./plateforme.js";

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
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.88));
    return { dataUrl, base64: dataUrl.split(",")[1], canvas: c, blob };
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

async function appelAPI(cle, contenu, schema, systeme) {
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

// IA intégrée de claude.ai (aucune clé nécessaire)
async function appelIntegre({ consigne, systeme, schema, image, niveau = "default" }) {
  const sample = await capacite("sample");
  const prompt = `${systeme}\n\n${consigne}\n\nRéponds uniquement avec un objet JSON conforme à ce schéma JSON (tous les champs requis) :\n${JSON.stringify(schema)}`;
  try {
    return await sample.json(prompt, { modelTier: niveau, ...(image ? { images: [image] } : {}), cache: false });
  } catch (e) {
    const messages = {
      not_granted: "Autorisez l'accès à Claude pour cette page (menu Permissions de la page).",
      rate_limited: "Trop de demandes rapprochées : patientez une minute puis réessayez.",
      invalid_json: "La réponse de l'IA n'a pas pu être lue. Réessayez avec une photo plus nette.",
      image_rejected: "Image refusée : utilisez une photo JPEG ou PNG.",
    };
    throw new Error(messages[e?.code] || e?.message || "Erreur de l'IA");
  }
}

/** Quel moteur d'IA est disponible ? "integree" (claude.ai), "cle" (clé API) ou null. */
export async function moteurIA(cle) {
  if (await capacite("sample")) return "integree";
  if (cle) return "cle";
  return null;
}

async function demander({ cle, consigne, systeme, schema, image, imageBase64, niveau }) {
  const moteur = await moteurIA(cle);
  if (moteur === "integree") {
    if (image && !(await iaIntegreeImages())) throw new Error("La lecture d'images n'est pas disponible dans cette vue.");
    return appelIntegre({ consigne, systeme, schema, image, niveau });
  }
  if (moteur === "cle") {
    const contenu = [];
    if (imageBase64) contenu.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } });
    contenu.push({ type: "text", text: consigne });
    return appelAPI(cle, contenu, schema, systeme);
  }
  throw new Error("Aucune IA configurée.");
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

export async function lireOrdonnanceIA(cle, photo) {
  const r = await demander({
    cle, image: photo.blob, imageBase64: photo.base64, niveau: "complex",
    systeme: "Tu es un assistant de lecture d'ordonnances pour une application d'aide à l'observance. Tu transcris fidèlement ; tu ne poses pas de diagnostic.",
    consigne: "Voici la photo d'une ordonnance médicale française. Extrais chaque médicament prescrit avec sa posologie. Si un élément est illisible ou incertain, indique-le dans 'remarques' plutôt que de deviner. N'invente aucun médicament. Si l'image n'est pas une ordonnance, renvoie une liste vide.",
    schema: SCHEMA_ORDONNANCE,
  });
  if (!Array.isArray(r?.medicaments)) throw new Error("Réponse inattendue de l'IA.");
  return r;
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
  const f = await demander({ cle, schema: SCHEMA_FICHE,
    systeme: "Tu es pharmacien et tu rédiges des fiches d'information patient fiables et concises.",
    consigne: `Rédige une fiche patient synthétique, en français simple, pour le médicament « ${nom} » (tel que commercialisé en France) : famille thérapeutique, principales indications, 3 à 6 effets indésirables principaux, conseils de prise pratiques. Si le médicament t'est inconnu, indique-le dans 'famille' et laisse les listes vides.` });
  for (const k of ["indications", "effets", "conseils"]) if (!Array.isArray(f[k])) f[k] = [];
  return f;
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
  const r = await demander({ cle, schema: SCHEMA_INTERACTIONS,
    systeme: "Tu es pharmacien clinicien. Tu es précis et tu n'inventes pas d'interactions.",
    consigne: `Liste de traitements d'un patient : ${noms.join(" ; ")}.\nIdentifie les interactions médicamenteuses cliniquement pertinentes selon le Thésaurus ANSM (niveaux CI, AD, PE, APEC) et les doublons thérapeutiques. Ne liste que des interactions réelles et documentées.` });
  return (r?.interactions || []).filter((i) => ["CI", "AD", "PE", "APEC"].includes(i.niveau));
}
