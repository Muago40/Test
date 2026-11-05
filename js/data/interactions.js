// Règles d'interactions médicamenteuses — inspirées du Thésaurus des interactions
// médicamenteuses de l'ANSM (niveaux : CI, AD, PE, APEC). Liste volontairement
// limitée aux interactions les plus fréquentes et les plus importantes.
//
// Un sélecteur correspond soit à un identifiant de médicament, soit à une classe
// (voir le champ `classes` de medicaments.js).

export const NIVEAUX = {
  CI:   { rang: 4, libelle: "Contre-indication", couleur: "danger" },
  AD:   { rang: 3, libelle: "Association déconseillée", couleur: "warning" },
  PE:   { rang: 2, libelle: "Précaution d'emploi", couleur: "caution" },
  APEC: { rang: 1, libelle: "À prendre en compte", couleur: "info" },
};

export const REGLES = [
  // ── Saignement ──
  { a: ["avk"], b: ["aod", "hbpm"], niveau: "AD",
    risque: "Association de deux anticoagulants : risque hémorragique majeur.",
    conduite: "Uniquement lors d'un relais encadré par le médecin." },
  { a: ["aod"], b: ["aod"], niveau: "CI",
    risque: "Deux anticoagulants oraux directs : risque hémorragique majeur.",
    conduite: "Ne jamais associer. Contacter le prescripteur." },
  { a: ["avk"], b: ["avk"], niveau: "CI",
    risque: "Deux antivitamines K : surdosage et hémorragie.",
    conduite: "Ne jamais associer. Contacter le prescripteur." },
  { a: ["anticoagulant"], b: ["ains"], niveau: "AD",
    risque: "Majoration du risque hémorragique (notamment digestif).",
    conduite: "Éviter les AINS ; préférer le paracétamol. Si indispensable : surveillance clinique étroite." },
  { a: ["anticoagulant"], b: ["antiagregant"], niveau: "APEC",
    risque: "Augmentation du risque de saignement.",
    conduite: "Association parfois volontaire (cardiologie) : elle doit être explicitement validée par le médecin." },
  { a: ["antiagregant"], b: ["ains"], niveau: "PE",
    risque: "Majoration du risque hémorragique et d'ulcère ; l'ibuprofène peut diminuer l'effet antiagrégant de l'aspirine.",
    conduite: "Éviter l'automédication par AINS ; prise courte et protection gastrique si nécessaire." },
  { a: ["isrs"], b: ["anticoagulant", "antiagregant", "ains"], niveau: "PE",
    risque: "Les antidépresseurs sérotoninergiques augmentent le risque de saignement.",
    conduite: "Surveillance clinique ; signaler tout saignement inhabituel." },
  { a: ["avk"], b: ["antibiotique"], niveau: "PE",
    risque: "Les antibiotiques peuvent déséquilibrer l'INR (risque hémorragique).",
    conduite: "Contrôle de l'INR pendant et après l'antibiothérapie." },
  { a: ["avk"], b: ["amiodarone"], niveau: "PE",
    risque: "L'amiodarone augmente fortement l'effet de l'AVK.",
    conduite: "Contrôle rapproché de l'INR et adaptation de la dose." },
  { a: ["avk"], b: ["paracetamol"], niveau: "APEC",
    risque: "À doses élevées et prolongées (≥ 4 g/j pendant plusieurs jours), le paracétamol peut augmenter l'INR.",
    conduite: "Contrôler l'INR en cas de prise prolongée." },

  // ── AINS ──
  { a: ["ains"], b: ["ains"], niveau: "AD",
    risque: "Deux anti-inflammatoires : majoration du risque d'ulcère et d'hémorragie digestive, sans gain d'efficacité.",
    conduite: "N'en garder qu'un seul." },
  { a: ["ains"], b: ["iec", "ara2", "diuretique"], niveau: "PE",
    risque: "Insuffisance rénale aiguë (surtout chez le sujet âgé ou déshydraté) et baisse de l'effet antihypertenseur.",
    conduite: "Bien s'hydrater ; surveillance de la fonction rénale. Éviter l'association triple (AINS + IEC/sartan + diurétique)." },
  { a: ["ains"], b: ["methotrexate"], niveau: "AD",
    risque: "Augmentation de la toxicité du méthotrexate (sanguine, rénale).",
    conduite: "À éviter, sauf faibles doses de méthotrexate en rhumatologie sous surveillance biologique." },
  { a: ["ains"], b: ["lithium"], niveau: "AD",
    risque: "Augmentation de la lithémie avec risque de surdosage.",
    conduite: "Éviter ; sinon surveillance étroite de la lithémie." },
  { a: ["ains"], b: ["corticoide"], niveau: "APEC",
    risque: "Augmentation du risque d'ulcère et d'hémorragie digestive.",
    conduite: "Une protection gastrique (IPP) peut être discutée." },

  // ── Potassium / rein ──
  { a: ["iec"], b: ["ara2"], niveau: "AD",
    risque: "Double blocage du système rénine-angiotensine : insuffisance rénale, hyperkaliémie.",
    conduite: "Association à éviter, sauf avis spécialisé." },
  { a: ["iec", "ara2"], b: ["epargneur_k", "potassium"], niveau: "PE",
    risque: "Hyperkaliémie potentiellement grave.",
    conduite: "Contrôle régulier de la kaliémie et de la créatinine." },
  { a: ["epargneur_k"], b: ["potassium"], niveau: "AD",
    risque: "Hyperkaliémie potentiellement mortelle.",
    conduite: "Association à éviter sauf hypokaliémie documentée et surveillance étroite." },
  { a: ["lithium"], b: ["diuretique", "iec", "ara2"], niveau: "AD",
    risque: "Diminution de l'élimination du lithium : surdosage.",
    conduite: "Surveillance stricte de la lithémie et adaptation de la dose." },
  { a: ["digoxine"], b: ["hypokaliemiant"], niveau: "PE",
    risque: "La baisse du potassium favorise la toxicité de la digoxine.",
    conduite: "Surveiller la kaliémie, corriger une hypokaliémie." },

  // ── Interactions métaboliques (CYP3A4…) ──
  { a: ["clarithromycine"], b: ["simvastatine"], niveau: "CI",
    risque: "Augmentation importante de la simvastatine : risque de rhabdomyolyse.",
    conduite: "Suspendre la statine pendant l'antibiotique ou changer d'antibiotique." },
  { a: ["clarithromycine"], b: ["atorvastatine"], niveau: "AD",
    risque: "Augmentation de l'atorvastatine : risque musculaire (rhabdomyolyse).",
    conduite: "Suspendre la statine pendant l'antibiothérapie ou utiliser la dose minimale." },
  { a: ["amiodarone"], b: ["simvastatine"], niveau: "PE",
    risque: "Risque musculaire accru.",
    conduite: "Ne pas dépasser 20 mg/j de simvastatine ou choisir une autre statine." },
  { a: ["macrolide"], b: ["colchicine"], niveau: "CI",
    risque: "Augmentation de la toxicité de la colchicine, potentiellement mortelle.",
    conduite: "Ne pas associer : choisir un autre antibiotique." },
  { a: ["clarithromycine"], b: ["domperidone"], niveau: "CI",
    risque: "Augmentation de la dompéridone et allongement du QT : troubles du rythme graves.",
    conduite: "Ne pas associer." },
  { a: ["amiodarone"], b: ["digoxine"], niveau: "PE",
    risque: "Augmentation de la digoxinémie et ralentissement cardiaque.",
    conduite: "Surveillance ECG et digoxinémie, réduire la dose de digoxine." },
  { a: ["ipp_cyp2c19"], b: ["clopidogrel"], niveau: "AD",
    risque: "L'oméprazole et l'ésoméprazole diminuent l'efficacité du clopidogrel.",
    conduite: "Préférer le pantoprazole si un IPP est nécessaire." },
  { a: ["sulfamide_hypo"], b: ["fluoroquinolone", "clarithromycine"], niveau: "PE",
    risque: "Risque d'hypoglycémie.",
    conduite: "Renforcer l'autosurveillance glycémique." },
  { a: ["fluoroquinolone"], b: ["antidiabetique"], niveau: "APEC",
    risque: "Les fluoroquinolones peuvent déséquilibrer la glycémie (hypo- ou hyperglycémie).",
    conduite: "Surveillance glycémique." },

  // ── Absorption (chélation) ──
  { a: ["fluoroquinolone", "cycline"], b: ["fer", "calcium", "antiacide"], niveau: "PE",
    risque: "Diminution de l'absorption de l'antibiotique (risque d'échec).",
    conduite: "Prendre l'antibiotique au moins 2 h avant (ou 4 h après) le fer, le calcium ou l'antiacide." },
  { a: ["levothyroxine"], b: ["fer", "calcium", "antiacide"], niveau: "PE",
    risque: "Diminution de l'absorption de la lévothyroxine.",
    conduite: "Espacer d'au moins 2 h (idéalement 4 h)." },
  { a: ["levothyroxine"], b: ["ipp"], niveau: "APEC",
    risque: "Les IPP peuvent diminuer l'absorption de la lévothyroxine.",
    conduite: "Contrôle de la TSH après introduction de l'IPP." },
  { a: ["antiacide"], b: ["statine", "hydroxychloroquine", "levothyroxine", "fer"], niveau: "PE",
    risque: "Les antiacides diminuent l'absorption de nombreux médicaments.",
    conduite: "Espacer les prises d'au moins 2 h." },
  { a: ["fer"], b: ["calcium"], niveau: "APEC",
    risque: "Le calcium diminue l'absorption du fer.",
    conduite: "Prendre le fer à distance (2 h) du calcium." },

  // ── Cœur : QT et fréquence ──
  { a: ["qt"], b: ["qt"], niveau: "AD", generique: true,
    risque: "Addition d'effets d'allongement de l'intervalle QT : risque de troubles du rythme graves (torsades de pointes).",
    conduite: "Association à éviter ; si nécessaire, ECG et surveillance du potassium." },
  { a: ["domperidone"], b: ["qt"], niveau: "CI",
    risque: "Dompéridone + autre médicament allongeant le QT : troubles du rythme graves.",
    conduite: "Ne pas associer." },
  { a: ["bradycardisant"], b: ["bradycardisant"], niveau: "PE",
    risque: "Ralentissement excessif du cœur (bradycardie), malaises.",
    conduite: "Surveillance clinique et ECG." },
  { a: ["betabloquant"], b: ["sulfamide_hypo", "metformine"], niveau: "APEC",
    risque: "Les bêtabloquants peuvent masquer les signes d'hypoglycémie (palpitations, tremblements).",
    conduite: "Renforcer l'autosurveillance glycémique." },
  { a: ["corticoide"], b: ["antidiabetique"], niveau: "PE",
    risque: "Les corticoïdes augmentent la glycémie.",
    conduite: "Renforcer la surveillance glycémique, adaptation éventuelle du traitement." },
  { a: ["fluoroquinolone"], b: ["corticoide"], niveau: "PE",
    risque: "Risque majoré de tendinopathie, voire de rupture du tendon (surtout sujet âgé).",
    conduite: "Arrêter et consulter en cas de douleur tendineuse." },

  // ── Système nerveux ──
  { a: ["isrs"], b: ["isrs"], niveau: "AD",
    risque: "Deux antidépresseurs sérotoninergiques : risque de syndrome sérotoninergique.",
    conduite: "Association à éviter sauf avis spécialisé (relais encadré)." },
  { a: ["isrs"], b: ["tramadol"], niveau: "PE",
    risque: "Syndrome sérotoninergique (agitation, fièvre, tremblements, diarrhée) et risque de convulsions.",
    conduite: "Surveillance ; consulter en cas d'agitation, sueurs, tremblements." },
  { a: ["isrs"], b: ["triptan"], niveau: "APEC",
    risque: "Risque de syndrome sérotoninergique.",
    conduite: "Être attentif aux symptômes (agitation, tremblements, fièvre)." },
  { a: ["isrs"], b: ["lithium"], niveau: "APEC",
    risque: "Risque de syndrome sérotoninergique.",
    conduite: "Surveillance clinique." },
  { a: ["opioide"], b: ["benzodiazepine", "hypnotique"], niveau: "AD",
    risque: "Dépression respiratoire et sédation pouvant être graves.",
    conduite: "Association à éviter ; si nécessaire, doses minimales et durée la plus courte." },
  { a: ["opioide"], b: ["opioide"], niveau: "AD",
    risque: "Deux opioïdes : majoration de la sédation et de la dépression respiratoire.",
    conduite: "N'en garder qu'un seul." },
  { a: ["benzodiazepine", "hypnotique"], b: ["benzodiazepine", "hypnotique"], niveau: "AD",
    risque: "Addition des effets sédatifs : somnolence, chutes, dépression respiratoire.",
    conduite: "Éviter d'associer deux benzodiazépines ou apparentés." },
  { a: ["sedatif"], b: ["sedatif"], niveau: "APEC", generique: true,
    risque: "Majoration de la somnolence et de la baisse de vigilance.",
    conduite: "Prudence en cas de conduite ; éviter l'alcool." },
  { a: ["antiemetique_dopa"], b: ["antiemetique_dopa"], niveau: "AD",
    risque: "Deux antiémétiques antidopaminergiques : effets indésirables neurologiques et cardiaques.",
    conduite: "N'en garder qu'un seul." },

  // ── Méthotrexate ──
  { a: ["methotrexate"], b: ["penicilline"], niveau: "AD",
    risque: "Les pénicillines augmentent la toxicité sanguine du méthotrexate.",
    conduite: "Surveillance de la numération sanguine ; avis du prescripteur." },
  { a: ["methotrexate"], b: ["ipp"], niveau: "APEC",
    risque: "Possible augmentation de la toxicité du méthotrexate (surtout à fortes doses).",
    conduite: "À signaler au prescripteur." },

  // ── Inducteurs enzymatiques, antifongiques, divers ──
  { a: ["inducteur"], b: ["contraceptif_oral"], niveau: "AD",
    risque: "La carbamazépine diminue l'efficacité de la contraception orale (risque de grossesse).",
    conduite: "Utiliser une autre méthode contraceptive (DIU…)." },
  { a: ["inducteur"], b: ["aod"], niveau: "AD",
    risque: "Diminution importante de l'effet anticoagulant (risque de thrombose).",
    conduite: "Association à éviter : avis du prescripteur." },
  { a: ["inducteur"], b: ["avk"], niveau: "PE",
    risque: "Diminution de l'effet de l'AVK.",
    conduite: "Contrôle rapproché de l'INR, notamment à l'introduction et à l'arrêt." },
  { a: ["inducteur"], b: ["valproate"], niveau: "PE",
    risque: "Modification des concentrations des deux antiépileptiques.",
    conduite: "Surveillance clinique et des dosages sanguins." },
  { a: ["antifongique_azole"], b: ["avk"], niveau: "PE",
    risque: "Augmentation de l'effet de l'AVK (risque hémorragique).",
    conduite: "Contrôle de l'INR pendant et après le traitement." },
  { a: ["antifongique_azole"], b: ["statine_cyp3a4"], niveau: "PE",
    risque: "Augmentation du risque musculaire.",
    conduite: "Suspendre la statine pendant un traitement court, ou avis médical." },
  { a: ["antifongique_azole"], b: ["sulfamide_hypo"], niveau: "PE",
    risque: "Risque d'hypoglycémie.",
    conduite: "Surveillance glycémique renforcée." },
  { a: ["metronidazole"], b: ["avk"], niveau: "AD",
    risque: "Forte augmentation de l'effet de l'AVK (risque hémorragique).",
    conduite: "Contrôle rapproché de l'INR, adaptation de la dose." },
  { a: ["metronidazole"], b: ["lithium"], niveau: "AD",
    risque: "Augmentation de la lithémie.",
    conduite: "Surveiller étroitement la lithémie." },
  { a: ["bisphosphonate"], b: ["calcium", "fer", "antiacide"], niveau: "PE",
    risque: "Diminution de l'absorption du bisphosphonate.",
    conduite: "Prendre le bisphosphonate à jeun, au moins 30 min (idéalement 2 h) avant le calcium, le fer ou l'antiacide." },
  { a: ["insuline"], b: ["betabloquant"], niveau: "APEC",
    risque: "Les bêtabloquants peuvent masquer les signes d'hypoglycémie.",
    conduite: "Renforcer l'autosurveillance glycémique." },
  { a: ["insuline"], b: ["sulfamide_hypo"], niveau: "APEC",
    risque: "Risque d'hypoglycémie accru.",
    conduite: "Association fréquente mais surveillance glycémique attentive." },
  { a: ["opioide"], b: ["sedatif"], niveau: "PE", generique: true,
    risque: "Opioïde associé à un autre médicament sédatif (prégabaline, antidépresseur sédatif, antipsychotique…) : somnolence et risque de dépression respiratoire.",
    conduite: "Doses minimales, pas d'alcool, consulter en cas de somnolence importante ou de respiration ralentie." },
  { a: ["valproate"], b: ["contraceptif_oral"], niveau: "APEC",
    risque: "Le valproate est très toxique pour le fœtus : une contraception efficace est indispensable.",
    conduite: "Vérifier avec le médecin que la contraception est adaptée." },

  { a: ["nitre"], b: ["hypotenseur", "iec", "ara2", "diuretique", "inhibiteur_calcique"], niveau: "APEC",
    risque: "Addition des effets sur la tension : risque d'hypotension et de malaise.",
    conduite: "Se lever progressivement ; s'asseoir pour utiliser la trinitrine." },
  { a: ["diltiazem", "verapamil"], b: ["simvastatine"], niveau: "PE",
    risque: "Augmentation de la simvastatine : risque musculaire (rhabdomyolyse).",
    conduite: "Ne pas dépasser 20 mg/j de simvastatine ou choisir une autre statine (avis médical)." },

  // ── Doublons ──
  { a: ["paracetamol"], b: ["paracetamol"], niveau: "AD",
    risque: "Deux médicaments contenant du paracétamol : risque de surdosage et d'atteinte hépatique grave.",
    conduite: "Ne pas dépasser 3 g de paracétamol par jour au total ; n'en garder qu'un." },
  { a: ["statine"], b: ["statine"], niveau: "AD",
    risque: "Deux statines : risque musculaire sans bénéfice supplémentaire.",
    conduite: "Doublon probable : vérifier avec le médecin ou le pharmacien." },
  { a: ["ipp"], b: ["ipp"], niveau: "APEC",
    risque: "Deux inhibiteurs de la pompe à protons : doublon thérapeutique.",
    conduite: "Doublon probable : vérifier l'ordonnance." },
  { a: ["antihistaminique"], b: ["antihistaminique"], niveau: "APEC",
    risque: "Deux antihistaminiques : doublon, majoration des effets indésirables.",
    conduite: "Doublon probable : n'en garder qu'un." },
  { a: ["corticoide"], b: ["corticoide"], niveau: "APEC",
    risque: "Deux corticoïdes par voie générale : doublon.",
    conduite: "Vérifier l'ordonnance." },
];

function correspond(med, selecteurs) {
  return selecteurs.some((s) => s === med.id || med.classes.includes(s));
}

/**
 * Analyse les interactions entre une liste de médicaments de la base.
 * @param {Array<{med:object, nom:string}>} items
 * @returns {Array} interactions triées par gravité décroissante
 */
export function analyserInteractions(items) {
  const resultats = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      if (!A.med || !B.med) continue;
      const memeMed = A.med.id === B.med.id;
      const vus = new Set();
      REGLES.forEach((r, idx) => {
        const ok = (correspond(A.med, r.a) && correspond(B.med, r.b)) ||
                   (correspond(B.med, r.a) && correspond(A.med, r.b));
        if (ok && !vus.has(idx)) {
          vus.add(idx);
          resultats.push({ ...r, a: A.nom, b: B.nom });
        }
      });
      if (memeMed) {
        resultats.push({
          a: A.nom, b: B.nom, niveau: "AD",
          risque: "Le même médicament apparaît deux fois : risque de surdosage.",
          conduite: "Vérifier l'ordonnance : il s'agit probablement d'un doublon ou d'un changement de dose.",
        });
      }
    }
  }
  // Pour une même paire, on évite les règles génériques redondantes (ex. "sédatif + sédatif")
  // lorsqu'une règle plus grave et plus spécifique couvre déjà la paire.
  const parPaire = new Map();
  for (const r of resultats) {
    const k = [r.a, r.b].sort().join("|");
    if (!parPaire.has(k)) parPaire.set(k, []);
    parPaire.get(k).push(r);
  }
  const final = [];
  for (const liste of parPaire.values()) {
    const max = Math.max(...liste.map((r) => NIVEAUX[r.niveau].rang));
    for (const r of liste) {
      if (r.generique && NIVEAUX[r.niveau].rang < max) continue;
      final.push(r);
    }
  }
  return final.sort((x, y) => NIVEAUX[y.niveau].rang - NIVEAUX[x.niveau].rang);
}
