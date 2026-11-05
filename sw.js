// Service worker : fonctionnement hors ligne + gestion du clic sur les notifications.
const CACHE = "medoc-planner-v3";
const FICHIERS = [
  "./", "index.html", "css/styles.css", "manifest.webmanifest", "icons/icon.svg",
  "js/app.js", "js/store.js", "js/parser.js", "js/planning.js", "js/alarmes.js", "js/ocr.js",
  "js/plateforme.js", "js/ui.js", "js/transfert.js", "js/impression.js",
  "js/vendor/qrcode.js", "js/vendor/jsQR.js",
  "js/data/medicaments.js", "js/data/interactions.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Réseau d'abord pour les fichiers de l'application (mises à jour), cache en secours.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copie = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copie)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((liste) => {
      for (const c of liste) if ("focus" in c) return c.focus();
      return self.clients.openWindow("./");
    }),
  );
});
