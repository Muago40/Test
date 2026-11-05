# 💊 MédocPlanner

Application web installable (PWA) pour organiser ses traitements à partir d'une **photo d'ordonnance**.

## Fonctionnalités

| | |
|---|---|
| 📷 **Lecture de l'ordonnance** | Photo → OCR local (Tesseract.js, gratuit, hors ligne après le premier chargement) ou lecture par IA (Claude, optionnel, gère le manuscrit). Saisie/collage de texte et ajout manuel également possibles. Chaque ligne détectée est **vérifiée et corrigeable** avant validation. |
| 🗓️ **Planning des prises** | Prises du jour regroupées par horaire (matin / midi / soir / coucher, horaires réglables, ou heures précises « toutes les 8 h »), cases à cocher, progression, retard, traitements « si besoin », hebdomadaires (méthotrexate…), date de fin calculée. |
| 📘 **Fiches synthétiques** | Famille thérapeutique, indications, effets indésirables principaux, conseils et moment de prise. Base locale de 122 médicaments courants ; fiche générée par IA pour les autres. Impression / PDF. |
| ⚖️ **Interactions** | Moteur de règles selon les niveaux du Thésaurus ANSM (contre-indication, association déconseillée, précaution d'emploi, à prendre en compte) : saignement, hyperkaliémie, QT, CYP3A4, chélation (fer/calcium), sérotoninergiques, sédatifs, doublons (ex. deux sources de paracétamol)… + analyse complémentaire par IA. |
| ⏰ **Alarmes** | Notifications avec son/vibration et relance si la prise n'est pas cochée, **et** export `.ics` vers l'agenda du téléphone (alarmes fiables même application fermée). |

Toutes les données restent dans le navigateur (localStorage). Seule la photo est envoyée à l'API Anthropic si vous choisissez la lecture IA.

## Lancer

Aucune compilation nécessaire :

```bash
npm start          # ou : python3 -m http.server 8080
# puis ouvrir http://localhost:8080
npm test           # tests de l'analyseur et des interactions
```

Pour l'utiliser sur un téléphone, il faut un hébergement **HTTPS** (ex. GitHub Pages : Settings → Pages → branche), puis « Ajouter à l'écran d'accueil ».

### Version claude.ai (test rapide sur téléphone)

`npm run build:claude` génère `dist/medocplanner-claude.html`, l'application en un seul fichier, publiée comme page privée sur claude.ai. Dans cette version :

- la lecture de l'ordonnance utilise l'IA de votre compte claude.ai (aucune clé API ; autorisation demandée à la première utilisation) ;
- les données sont sauvegardées de façon privée sur votre compte (synchronisées entre téléphone et ordinateur) ;
- les notifications système et l'export `.ics` ne sont pas disponibles : le rappel sonne quand la page est ouverte, et l'onglet Alarmes liste les horaires à régler dans l'Horloge du téléphone.

### Lecture par IA (optionnel)

Onglet **Alarmes → Lecture par IA** : saisir une clé API Anthropic. Elle est stockée uniquement sur l'appareil et utilisée directement depuis le navigateur (SDK `@anthropic-ai/sdk`, modèle `claude-opus-5-5`, sortie JSON structurée). Pour un usage public, faire passer ces appels par un petit serveur plutôt que d'exposer une clé côté client.

## Structure

```
index.html, css/styles.css, sw.js, manifest.webmanifest
js/app.js              interface et actions
js/plateforme.js       détection web / claude.ai
js/ui.js               messages et confirmations
outils/build-claude.mjs  génération de la version claude.ai
js/parser.js           extraction médicaments + posologie depuis le texte
js/ocr.js              Tesseract.js et appels Claude (vision, fiches, interactions)
js/planning.js         calcul des prises
js/alarmes.js          notifications et export iCalendar
js/store.js            persistance locale
js/data/medicaments.js base médicaments
js/data/interactions.js règles d'interactions
```

## Limites — à lire

- Aide à l'organisation, **pas un dispositif médical**. Vérifiez toujours la lecture de l'ordonnance et demandez conseil à votre pharmacien.
- La base locale et les règles d'interactions couvrent les médicaments et situations les plus courants, pas l'exhaustivité du Vidal / Thésaurus ANSM.
- Les notifications web ne sont garanties que si l'application est ouverte (limite des navigateurs, surtout sur iOS) : utilisez l'export agenda pour des alarmes fiables.
