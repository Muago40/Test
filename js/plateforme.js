// Détection de l'environnement d'exécution.
//  - "web"      : site classique (localhost, GitHub Pages…) : service worker, notifications,
//                 OCR local Tesseract, clé API Anthropic optionnelle.
//  - "claude"   : page publiée sur claude.ai : IA intégrée (capacité `sample`, sans clé API),
//                 sauvegarde sur le compte (`db`), export de fichiers (`downloads`).

const capacites = {};

export const estClaude = typeof window !== "undefined" && typeof window.claude?.use === "function";

export async function capacite(nom) {
  if (!estClaude) return null;
  if (!(nom in capacites)) {
    capacites[nom] = window.claude.use(nom).catch(() => null);
  }
  return capacites[nom];
}

/** L'IA intégrée de claude.ai peut-elle lire des images ? */
export async function iaIntegreeImages() {
  const s = await capacite("sample");
  if (!s) return false;
  try { return !!(await s.limits())?.images; } catch { return false; }
}
