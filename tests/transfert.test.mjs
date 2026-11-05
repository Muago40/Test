import assert from "node:assert/strict";
import { encoderTransfert, decoderTransfert, lienTransfert } from "../js/transfert.js";
import { analyserOrdonnance } from "../js/parser.js";

const traitements = analyserOrdonnance(`Doliprane 1000 mg 1 cp 3 fois par jour si douleur pendant 5 jours
Kardegic 75 mg 1 sachet le midi
Levothyrox 75 µg 1 cp le matin à jeun
Methotrexate 10 mg 1 cp une fois par semaine
Amoxicilline 1 g 1 cp toutes les 8 heures pendant 7 jours
Xarelto 20 mg 1 cp le soir
Tahor 20 mg 1 cp le soir`).map((t, i) => ({ ...t, id: "t" + i, debut: "2026-11-05" }));
const profil = { nom: "Mme Dupont", traitements };
const heures = { matin: "07:30", midi: "12:00", soir: "19:00", coucher: "21:30" };
const code = await encoderTransfert(profil, heures);
const lien = lienTransfert("https://muago40.github.io/Test/", code);
console.log("longueur du lien :", lien.length, "caractères (max QR ≈ 2300 en correction M)");
assert.ok(lien.length < 2000);
const r = await decoderTransfert(lien);
assert.equal(r.patient, "Mme Dupont");
assert.deepEqual(r.heures, heures);
assert.equal(r.traitements.length, traitements.length);
for (let i = 0; i < traitements.length; i++) {
  const a = traitements[i], b = r.traitements[i];
  for (const k of ["nom", "medId", "quantite", "unite", "siBesoin", "hebdomadaire", "dureeJours", "debut"]) assert.deepEqual(b[k], a[k] ?? b[k], k);
  assert.deepEqual(b.moments, a.moments);
  assert.deepEqual(b.heures, a.heures);
}
await assert.rejects(decoderTransfert("https://exemple.fr/#import=zzzz"));
console.log("OK transfert");
