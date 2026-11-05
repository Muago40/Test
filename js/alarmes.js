// Alarmes de prise.
// 1) Notifications du navigateur programmées tant que l'application est ouverte
//    (ou installée et active en arrière-plan selon le système).
// 2) Export d'un calendrier .ics avec alarmes : solution la plus fiable sur téléphone,
//    les rappels sont alors gérés par l'agenda du système même application fermée.
import { etat, aujourdhui, clePrise } from "./store.js";
import { prisesDuJour, heuresDe, libelleQuantite, estActif } from "./planning.js";
import { trouverParId } from "./data/medicaments.js";

let minuteurs = [];

export function notificationsSupportees() {
  return "Notification" in window;
}

export async function demanderPermission() {
  if (!notificationsSupportees()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

function bip() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
  } catch { /* audio indisponible */ }
}

export async function notifier(titre, corps, tag) {
  if (etat.reglages.son) bip();
  if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  if (!notificationsSupportees() || Notification.permission !== "granted") {
    alerteInterne(titre, corps);
    return;
  }
  const options = { body: corps, tag, icon: "icons/icon.svg", badge: "icons/icon.svg", requireInteraction: true, renotify: true };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(titre, options);
    else new Notification(titre, options);
  } catch {
    new Notification(titre, options);
  }
}

function alerteInterne(titre, corps) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = titre + "\n" + corps;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 15000);
}

function aHeure(iso, hhmm) {
  const [y, m, d] = iso.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi, 0);
}

/** (Re)programme les alarmes des prochaines 24 h. */
export function planifierAlarmes() {
  minuteurs.forEach(clearTimeout);
  minuteurs = [];
  if (!etat.reglages.alarmes) return;
  const maintenant = Date.now();
  const demain = new Date(); demain.setDate(demain.getDate() + 1);
  for (const iso of [aujourdhui(), aujourdhui(demain)]) {
    // Regroupe les médicaments à prendre à la même heure
    const parHeure = new Map();
    for (const p of prisesDuJour(iso, etat.traitements, etat.reglages)) {
      if (!parHeure.has(p.heure)) parHeure.set(p.heure, []);
      parHeure.get(p.heure).push(p);
    }
    for (const [heure, prises] of parHeure) {
      const quand = aHeure(iso, heure).getTime();
      const relance = quand + etat.reglages.rappelMinutes * 60000;
      const corps = prises.map((p) => `• ${p.t.nom} : ${libelleQuantite(p.t)}`).join("\n");
      const restantes = () => prises.filter((p) => !etat.prises[clePrise(iso, p.t.id, heure)]);
      if (quand > maintenant && quand - maintenant < 86400000) {
        minuteurs.push(setTimeout(() => {
          if (restantes().length) notifier(`💊 Prise de ${heure}`, corps, `prise-${iso}-${heure}`);
        }, quand - maintenant));
      }
      if (etat.reglages.rappelMinutes > 0 && relance > maintenant && relance - maintenant < 86400000) {
        minuteurs.push(setTimeout(() => {
          const r = restantes();
          if (r.length) notifier(`⏰ Rappel : prise de ${heure} non cochée`, r.map((p) => `• ${p.t.nom}`).join("\n"), `rappel-${iso}-${heure}`);
        }, relance - maintenant));
      }
    }
  }
  // Re-planification à minuit passé
  const minuit = new Date(); minuit.setHours(24, 0, 30, 0);
  minuteurs.push(setTimeout(planifierAlarmes, minuit - maintenant));
}

export function nombreAlarmesProgrammees() {
  return minuteurs.length;
}

// ─────────── Export iCalendar ───────────

function echapper(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function plier(ligne) {
  // RFC 5545 : lignes de 75 octets max
  const out = [];
  let reste = ligne;
  while (reste.length > 73) { out.push(reste.slice(0, 73)); reste = " " + reste.slice(73); }
  out.push(reste);
  return out.join("\r\n");
}

export function genererICS() {
  const z = (n) => String(n).padStart(2, "0");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MedocPlanner//FR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Mes traitements"];
  for (const t of etat.traitements) {
    if (t.siBesoin) continue;
    const med = t.medId ? trouverParId(t.medId) : null;
    const conseil = med?.moment || t.ficheIA?.moment || "";
    // premier jour actif (utile pour les prises hebdomadaires)
    let debut = new Date(t.debut + "T00:00:00");
    for (let i = 0; i < 7 && !estActif(t, aujourdhui(debut)); i++) debut.setDate(debut.getDate() + 1);
    for (const h of heuresDe(t, etat.reglages)) {
      const [hh, mm] = h.split(":");
      const dt = `${debut.getFullYear()}${z(debut.getMonth() + 1)}${z(debut.getDate())}T${hh}${mm}00`;
      let rrule = t.hebdomadaire ? "RRULE:FREQ=WEEKLY" : "RRULE:FREQ=DAILY";
      if (t.dureeJours) rrule += ";COUNT=" + (t.hebdomadaire ? Math.max(1, Math.ceil(t.dureeJours / 7)) : t.dureeJours);
      lignes.push(
        "BEGIN:VEVENT",
        `UID:${t.id}-${hh}${mm}@medoc-planner`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dt}`,
        "DURATION:PT10M",
        rrule,
        plier(`SUMMARY:${echapper(`💊 ${t.nom} – ${libelleQuantite(t)}`)}`),
        plier(`DESCRIPTION:${echapper([conseil, ...(t.remarques || [])].filter(Boolean).join("\n"))}`),
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${echapper("Prendre " + t.nom)}`, "TRIGGER:PT0M", "END:VALARM",
        "END:VEVENT",
      );
    }
  }
  lignes.push("END:VCALENDAR");
  return lignes.join("\r\n");
}

export function telechargerICS() {
  const blob = new Blob([genererICS()], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "mes-traitements.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Horaires distincts des prises du jour, avec les médicaments concernés (pour régler des alarmes). */
export function horairesAlarmes() {
  const parHeure = new Map();
  for (const p of prisesDuJour(aujourdhui(), etat.traitements, etat.reglages)) {
    if (!parHeure.has(p.heure)) parHeure.set(p.heure, []);
    parHeure.get(p.heure).push(p.t.nom);
  }
  return [...parHeure].map(([heure, noms]) => ({ heure, noms }));
}
