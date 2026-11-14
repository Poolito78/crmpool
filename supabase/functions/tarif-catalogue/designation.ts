/**
 * COPIE de `designationProduit` (src/lib/store.ts) — une fonction Supabase ne
 * peut pas importer `src/`. Le test `tarifCatalogueCopies.test.ts` vérifie que
 * les deux corps restent identiques : changer l'un sans l'autre le fait échouer.
 */
export function designationProduit(p: { description?: string; descriptionVariante?: string }): string {
  const modele = (p.description || '').trim();
  /* Odoo laisse des parenthèses vides quand aucun attribut ne s'y loge :
     « KD22A BP 1000 300 C2 ST BRUT () ». 177 articles les portent. */
  const variante = (p.descriptionVariante || '')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!variante) return modele;

  /* CE QUE LE MODÈLE AJOUTE NE DOIT PAS SE PERDRE.
     « IS KD22A + PA » vend un panneau AVEC POINTE AMOVIBLE, et la
     désignation de déclinaison qu'Odoo renvoie — « KD22A BTR 1000 300 C2
     BRUT » — n'en dit rien : la pointe disparaissait du devis. Même chose
     pour « + BOUCHON » (51 articles) et « + POCHETTE A4 ». On rapatrie donc
     ce que le modèle annonce après un « + », mot à mot, en n'ajoutant que ce
     que la déclinaison ne dit pas déjà — sans quoi « IS KD22 + PA BRUT »
     donnerait « … BRUT + PA BRUT ». */
  const nu = (m: string) => m.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const dejaLa = new Set(variante.split(/[^a-z0-9]+/i).filter(Boolean).map(nu));

  const ajouts: string[] = [];
  for (const groupe of modele.split('+').slice(1)) {
    const manquants = groupe.trim().split(/\s+/).filter(m => m && !dejaLa.has(nu(m)));
    if (manquants.length) ajouts.push(manquants.join(' '));
  }

  return ajouts.length ? `${variante} + ${ajouts.join(' + ')}` : variante;
}
