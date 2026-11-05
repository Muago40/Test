// Messages et confirmations dans la page (alert/confirm ne sont pas disponibles partout,
// notamment dans les pages publiées sur claude.ai).

let minuteur = null;

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function informer(message, duree = 5000) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(minuteur);
  minuteur = setTimeout(() => el.classList.remove("visible"), duree);
}

export function confirmer(message, libelleOk = "Confirmer") {
  return new Promise((resoudre) => {
    const dlg = document.getElementById("confirmation");
    dlg.replaceChildren();
    const p = document.createElement("p");
    p.textContent = message;
    const ligne = document.createElement("div");
    ligne.className = "ligne-boutons";
    const non = Object.assign(document.createElement("button"), { className: "bouton", textContent: "Annuler", type: "button" });
    const oui = Object.assign(document.createElement("button"), { className: "bouton principal", textContent: libelleOk, type: "button" });
    ligne.append(non, oui);
    dlg.append(p, ligne);
    const fin = (v) => { dlg.close(); resoudre(v); };
    non.onclick = () => fin(false);
    oui.onclick = () => fin(true);
    dlg.oncancel = () => resoudre(false);
    dlg.showModal();
  });
}
