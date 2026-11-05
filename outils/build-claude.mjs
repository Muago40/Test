// Construit dist/medocplanner-claude.html : l'application en un seul fichier,
// prête à être publiée comme page claude.ai (scripts et styles intégrés).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const ORDRE = [
  "js/plateforme.js", "js/ui.js", "js/data/medicaments.js", "js/data/interactions.js",
  "js/parser.js", "js/store.js", "js/planning.js", "js/alarmes.js", "js/impression.js", "js/transfert.js",
  "js/ocr.js", "js/app.js",
];

const js = ORDRE.map((f) => {
  const src = readFileSync(f, "utf8")
    .replace(/^import\s[\s\S]*?\sfrom\s+["'][^"']+["'];\s*$/gm, "")
    .replace(/^export\s+(?=(async\s+)?function|const|let|class)/gm, "");
  return `// ── ${f} ──\n${src}`;
}).join("\n");

if (/<\/script/i.test(js)) throw new Error("Le code contient </script> : écrire <\\/script> dans les chaînes");

const css = readFileSync("css/styles.css", "utf8");
const html = readFileSync("index.html", "utf8");
const corps = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"))
  .replace(/<script type="module" src="js\/app.js"><\/script>/, "")
  .replace(/<script src="js\/vendor\/qrcode.js"><\/script>/, () => `<script>\n${readFileSync("js/vendor/qrcode.js", "utf8")}\n</script>`);

const page = `<title>MédocPlanner</title>
<style>
${css}
</style>
${corps.trim()}
<script type="module">
${js}
</script>
`;
mkdirSync("dist", { recursive: true });
writeFileSync("dist/medocplanner-claude.html", page);
if (process.argv.includes("--check")) writeFileSync("dist/bundle-check.mjs", js); // vérification syntaxique
console.log("dist/medocplanner-claude.html", (page.length / 1024).toFixed(0), "Ko");
