import assert from "node:assert/strict";
import { analyserOrdonnance, extrairePosologie } from "../js/parser.js";
import { analyserInteractions } from "../js/data/interactions.js";
import { MEDICAMENTS, trouverParId } from "../js/data/medicaments.js";

const ordo = `Dr Martin - Médecin généraliste
Le 05/11/2026
DOLIPRANE 1000 mg
1 comprimé 3 fois par jour si douleur pendant 5 jours
AMOXICILLINE 1g : 1 cp matin et soir pendant 6 jours
Kardegic 75 mg 1 sachet le midi
Ibuprofene 400mg 1-0-1 pendant 3 jours au cours du repas
Levothyrox 75 µg : 1 cp le matin à jeun QSP 3 mois
Tahor 20 mg 1 comprime le soir`;
const r = analyserOrdonnance(ordo);
console.table(r.map(t => ({ nom: t.nom, q: t.quantite, u: t.unite, m: t.moments.join(","), sb: t.siBesoin, d: t.dureeJours })));
assert.equal(r.length, 6);
assert.deepEqual(r[0].moments, ["matin", "midi", "soir"]); assert.equal(r[0].siBesoin, true); assert.equal(r[0].dureeJours, 5);
assert.deepEqual(r[1].moments, ["matin", "soir"]); assert.equal(r[1].dureeJours, 6); assert.equal(r[1].unite, "comprimé");
assert.equal(r[2].medId, "aspirine_antiagregant"); assert.deepEqual(r[2].moments, ["midi"]); assert.equal(r[2].unite, "sachet");
assert.deepEqual(r[3].moments, ["matin", "soir"]); assert.equal(r[3].dureeJours, 3);
assert.equal(r[4].medId, "levothyroxine"); assert.equal(r[4].dureeJours, 90); assert.ok(r[4].remarques.includes("À jeun"));
assert.equal(r[5].medId, "atorvastatine"); assert.deepEqual(r[5].moments, ["soir"]);

// tolérance OCR
const r2 = analyserOrdonnance("Amoxicilfine 500 mg 2 gelules x3/j 7 jours");
assert.equal(r2[0].medId, "amoxicilline"); assert.equal(r2[0].quantite, 2); assert.equal(r2[0].moments.length, 3); assert.equal(r2[0].dureeJours, 7);
assert.deepEqual(extrairePosologie("1 cp toutes les 8 heures").heures, ["08:00", "16:00", "00:00"]);
assert.equal(extrairePosologie("Methotrexate 10 mg une fois par semaine").hebdomadaire, true);

const items = r.map(t => ({ nom: t.nom, med: trouverParId(t.medId) }));
const inter = analyserInteractions(items);
console.table(inter.map(i => ({ a: i.a, b: i.b, n: i.niveau })));
assert.ok(inter.some(i => i.niveau === "PE" && /Kardegic|Acide/.test(i.a + i.b) && /Ibup/.test(i.a + i.b)));
const i2 = analyserInteractions(["clarithromycine", "simvastatine", "colchicine", "domperidone"].map(id => ({ nom: id, med: trouverParId(id) })));
assert.ok(i2.filter(i => i.niveau === "CI").length >= 3);
const i3 = analyserInteractions(["paracetamol", "paracetamol_codeine"].map(id => ({ nom: id, med: trouverParId(id) })));
assert.ok(i3.some(i => /paracétamol/.test(i.risque)));
// ids uniques
assert.equal(new Set(MEDICAMENTS.map(m => m.id)).size, MEDICAMENTS.length);
console.log("OK", MEDICAMENTS.length, "médicaments");
