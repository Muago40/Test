// Transmission d'un traitement du professionnel vers le téléphone du patient,
// sans serveur : le traitement est compressé dans un lien (après le « # », partie
// d'une adresse qui n'est jamais envoyée au serveur) affiché sous forme de QR code.
import { estClaude } from "./plateforme.js";

const PREFIXE = "import=";
const VERSION = 1;

// Champs utiles d'un traitement, sous forme compacte
function compacter(t) {
  const c = { n: t.nom, q: t.quantite, u: t.unite };
  if (t.medId) c.i = t.medId;
  if (t.moments?.length) c.m = encoderMoments(t.moments);
  if (t.heures?.length) c.h = t.heures;
  if (t.siBesoin) c.b = 1;
  if (t.hebdomadaire) c.w = 1;
  if (t.dureeJours) c.d = t.dureeJours;
  if (t.debut) c.s = t.debut;
  if (t.remarques?.length) c.r = t.remarques;
  if (t.ficheIA) c.f = t.ficheIA;
  return c;
}

const CODES_MOMENTS = { m: "matin", i: "midi", s: "soir", o: "coucher" };

function encoderMoments(moments) {
  return moments.map((m) => ({ matin: "m", midi: "i", soir: "s", coucher: "o" }[m])).join("");
}

function decompacter(c) {
  return {
    nom: String(c.n || "Médicament"),
    quantite: Number(c.q) || 1,
    unite: String(c.u || "prise"),
    medId: c.i || null,
    moments: typeof c.m === "string" ? [...c.m].map((x) => CODES_MOMENTS[x]).filter(Boolean) : [],
    heures: Array.isArray(c.h) ? c.h.filter((h) => /^\d{2}:\d{2}$/.test(h)) : [],
    siBesoin: !!c.b,
    hebdomadaire: !!c.w,
    dureeJours: Number(c.d) || null,
    debut: /^\d{4}-\d{2}-\d{2}$/.test(c.s) ? c.s : undefined,
    remarques: Array.isArray(c.r) ? c.r.map(String) : [],
    ...(c.f ? { ficheIA: c.f } : {}),
  };
}

function versBase64Url(octets) {
  let s = "";
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function depuisBase64Url(txt) {
  const s = atob(txt.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function transformer(octets, flux) {
  const r = new Blob([octets]).stream().pipeThrough(flux);
  return new Uint8Array(await new Response(r).arrayBuffer());
}

/** Construit le code de transfert d'un profil. */
export async function encoderTransfert(profil, heures) {
  const charge = {
    v: VERSION,
    p: profil.nom,
    hr: heures,
    t: profil.traitements.map(compacter),
    dt: new Date().toISOString().slice(0, 10),
  };
  const octets = new TextEncoder().encode(JSON.stringify(charge));
  if (typeof CompressionStream !== "undefined") {
    return "z" + versBase64Url(await transformer(octets, new CompressionStream("deflate-raw")));
  }
  return "j" + versBase64Url(octets);
}

/** Décode un code de transfert (ou un lien complet). */
export async function decoderTransfert(texte) {
  const m = String(texte).match(/import=([A-Za-z0-9_-]+)/);
  const code = m ? m[1] : String(texte).trim();
  let octets = depuisBase64Url(code.slice(1));
  if (code[0] === "z") octets = await transformer(octets, new DecompressionStream("deflate-raw"));
  else if (code[0] !== "j") throw new Error("Code non reconnu");
  const c = JSON.parse(new TextDecoder().decode(octets));
  if (c.v !== VERSION || !Array.isArray(c.t)) throw new Error("Code non reconnu");
  const heures = {};
  for (const [k, v] of Object.entries(c.hr || {})) {
    if (Object.values(CODES_MOMENTS).includes(k) && /^\d{2}:\d{2}$/.test(v)) heures[k] = v;
  }
  return { patient: String(c.p || ""), date: c.dt || "", heures, traitements: c.t.map(decompacter), code };
}

/** Adresse de l'application à utiliser dans le lien. */
export function adresseApplication(adressePublique) {
  if (adressePublique) return adressePublique.replace(/#.*$/, "");
  if (estClaude) return "";
  return location.origin + location.pathname;
}

export function lienTransfert(adresse, code) {
  return adresse + "#" + PREFIXE + code;
}

/** Code présent dans l'adresse de la page ? */
export function codeDansAdresse() {
  return location.hash.startsWith("#" + PREFIXE) ? location.hash.slice(1 + PREFIXE.length) : null;
}

/** QR code en SVG (bibliothèque qrcode-generator, chargée globalement). */
export function qrSVG(texte) {
  if (typeof window.qrcode !== "function") throw new Error("Générateur de QR code indisponible");
  const qr = window.qrcode(0, "M");
  qr.addData(texte, "Byte");
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
}

// ─────────── Lecture d'un QR code avec la caméra (téléphone du patient) ───────────
let jsqrCharge = null;
function chargerJsQR() {
  jsqrCharge ||= new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = "js/vendor/jsQR.js";
    s.onload = ok;
    s.onerror = () => ko(new Error("Lecteur de QR code indisponible"));
    document.head.appendChild(s);
  });
  return jsqrCharge;
}

export function scannerPossible() {
  return !estClaude && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Ouvre la caméra dans `conteneur` et résout avec le texte du premier QR code lu.
 * Renvoie { resultat: Promise<string>, arreter() }.
 */
export function scannerQR(conteneur) {
  let flux = null, fini = false, rafId = null;
  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.muted = true;
  video.className = "video-scan";
  conteneur.replaceChildren(video);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const arreter = () => {
    fini = true;
    cancelAnimationFrame(rafId);
    flux?.getTracks().forEach((t) => t.stop());
    conteneur.replaceChildren();
  };

  const resultat = (async () => {
    await chargerJsQR();
    flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    video.srcObject = flux;
    await video.play();
    return new Promise((ok) => {
      const boucle = () => {
        if (fini) return;
        if (video.readyState >= 2 && video.videoWidth) {
          const l = 640, h = Math.round((video.videoHeight / video.videoWidth) * l);
          canvas.width = l; canvas.height = h;
          ctx.drawImage(video, 0, 0, l, h);
          const img = ctx.getImageData(0, 0, l, h);
          const code = window.jsQR(img.data, l, h, { inversionAttempts: "dontInvert" });
          if (code?.data) { arreter(); ok(code.data); return; }
        }
        rafId = requestAnimationFrame(boucle);
      };
      boucle();
    });
  })();
  resultat.catch(arreter);
  return { resultat, arreter };
}
