/**
 * Calculateur Flowfast → lignes de devis (bouton « Créer devis » de la page
 * Web › Calculateur Flowfast, 17/11/2026).
 *
 * Le calculateur (scripts/site-isofloor/calculateur-flowfast.html, le même
 * que sur isofloor.fr) publie sa préconisation par `window.__devisCalc()` :
 * résine, pigment et ses sachets, catalyseur, kits de charge SNLR / SNLC.
 * Quand des kits sont retenus, ce sont LEURS quantités qui font foi (résine,
 * pigment et catalyseur suivent la charge de chaque kit), sinon le besoin.
 *
 * ⚠️ **ON N'INVENTE PAS UN ARTICLE.** Chaque quantité se rattache à une fiche
 * du catalogue par sa référence (les kits portent le même code que la fiche :
 * SNLR11, SNLC-05…). Fiche absente, conditionnement inconnu (sachet de poids
 * saisi, Fintalc, charge quartz du 208) : la ligne part SANS article, en
 * « à vérifier », la quantité en kg dans le libellé — jamais rapprochée d'une
 * voisine.
 *
 * Prix : celui du devis pour ce client — prix convenu (fiche client), sinon
 * remise de gamme (`prixGamme`), sinon prix public au palier.
 */
import { designationProduit, getPrixPourQuantite, type Client, type LigneDevis, type Produit } from './store';
import { prixGamme } from './remiseGammes';
import { prixClientDeProduit } from './memoirePrix';

/** Ce que renvoie `window.__devisCalc()` dans le calculateur. */
export interface EtatCalculateur {
  resine: '107' | '208' | '215' | '319' | string;
  mode: 'u' | 'c' | string;
  nomResine: string;
  q: number;
  pig: number;
  pigNom: string;
  talc: boolean;
  pk: number;
  ck: number;
  charge: string | null;
  chargeTag: string;
  isC: boolean;
  isR: boolean;
  fk: number;
  total: number;
  area: number;
  um: boolean;
  larg: number;
  rate: number;
  temp: number;
  /** Conditionnement du Catalyst choisi, en g (80, 150, 2000) ; absent = pot de 2 kg. */
  catW?: number;
  /** Poids saisi à la main plutôt qu'un conditionnement proposé. */
  catLibre?: boolean;
  longueur: number | null;
  kits: { code: string; kg: number; n: number }[];
  sachets: { kg: number; n: number; libre: boolean }[];
  prep: { resine: number; pigment: number; catalyseur: number; charge: number; total: number; kits: number } | null;
}

/** Seaux de résine (références du catalogue). Seul le seau de 20 kg est
 *  proposé actuellement (règle du 17/11) : le 10 kg de 319 n'est pas retenu. */
const RESINES: Record<string, { refs: string[]; kg: number }[]> = {
  '107': [{ refs: ['FLOWFAST107', 'FLOWFASTPRIMER107.20'], kg: 20 }],
  '208': [{ refs: ['FLOWFAST208'], kg: 20 }],
  '215': [{ refs: ['FLOWFAST215'], kg: 20 }],
  '319u': [{ refs: ['FLOWFAST319', 'FLOWFAST31920'], kg: 20 }],
  '319c': [{ refs: ['FLOWFAST319C', 'FLOWFAST31920.CLEAR'], kg: 20 }],
};

/** Sachets de pigment (formats Odoo, 17/11) → fiche. */
const SACHETS: Record<string, string> = { '0.2': 'PIGMENT02', '0.4': 'PIGMENT04', '0.5': 'PIGMENT05', '1': 'PIGMENTKG', '2': 'PIGMENT2KG' };

/* Catalyst par conditionnement (g) → fiche. Seul le pot de 2 kg a un article :
   les sachets de 80 g et 150 g partent « à vérifier » (17/11). */
const CATALYSEURS: Record<number, string[]> = { 2000: ['CATALYST2'] };
const SNL_FILLER = { refs: ['SNLFILLER'], kg: 25 };

const nf = (n: number, d = 2) => n.toLocaleString('fr-FR', { maximumFractionDigits: d });
const kg = (x: number) => (x < 1 ? `${nf(x * 1000, 0)} g` : `${nf(x)} kg`);

/**
 * Seaux pour une masse de résine : le moins de surplus, puis le moins de
 * seaux. 25 kg de 319 → 20 + 10 (30 kg), jamais 2 × 20.
 */
export function seauxPour(masse: number, formats: number[]): { kg: number; n: number }[] {
  if (!(masse > 0) || !formats.length) return [];
  const f = [...formats].sort((a, b) => b - a);
  let best: { tot: number; nb: number; cnt: number[] } | null = null;
  const cnt: number[] = [];
  const rec = (i: number, somme: number) => {
    if (i === f.length - 1) {
      const n = Math.max(0, Math.ceil((masse - somme - 1e-9) / f[i]));
      const tot = somme + n * f[i];
      const nb = cnt.slice(0, i).reduce((a, b) => a + b, 0) + n;
      if (!best || tot < best.tot - 1e-9 || (Math.abs(tot - best.tot) < 1e-9 && nb < best.nb)) {
        best = { tot, nb, cnt: [...cnt.slice(0, i), n] };
      }
      return;
    }
    const max = Math.ceil(masse / f[i]);
    for (let c = 0; c <= max; c++) { cnt[i] = c; rec(i + 1, somme + c * f[i]); }
  };
  rec(0, 0);
  const b = best as { tot: number; nb: number; cnt: number[] } | null;
  return b ? f.map((k, i) => ({ kg: k, n: b.cnt[i] })).filter(x => x.n > 0) : [];
}

function trouver(produits: Produit[], refs: string[]): Produit | undefined {
  for (const r of refs) {
    const cle = r.toUpperCase();
    const p = produits.find(x => String(x.reference || '').trim().toUpperCase() === cle);
    if (p) return p;
  }
  return undefined;
}

/** Prix d'une ligne pour ce client, à la règle du devis. */
export function prixPourClient(p: Produit, quantite: number, client?: Client | null): number {
  const convenu = prixClientDeProduit(client?.id, p);
  if (convenu) return convenu.prix;
  const g = client
    ? prixGamme(
        { prixHT: p.prixHT, paliersPrix: p.paliersPrix, categorie: p.categorie, catalogue: p.catalogue },
        client.remisesParCategorie,
        client.estRevendeur,
        quantite,
      )
    : null;
  return g ? g.prix : getPrixPourQuantite(p, quantite).prixHT;
}

export interface ResultatCalculateur {
  lignes: LigneDevis[];
  /** Ce qui part sans article, à vérifier dans le devis. */
  aVerifier: string[];
  /** Libellé court pour le champ Système du devis. */
  systeme: string;
}

/** Les lignes de devis de la préconisation du calculateur. */
export function lignesDepuisCalculateur(
  e: EtatCalculateur,
  produits: Produit[],
  client: Client | null | undefined,
  genererId: () => string,
): ResultatCalculateur {
  const lignes: LigneDevis[] = [];
  const aVerifier: string[] = [];
  const kits = (e.isC || e.isR) ? e.kits.filter(k => k.n > 0) : [];
  const prep = kits.length && e.prep ? e.prep : null;
  const resine = prep ? prep.resine : e.q;
  const pigment = prep ? prep.pigment : e.pk;
  const catalyseur = prep ? prep.catalyseur : e.ck;

  const article = (p: Produit, quantite: number, note?: string): LigneDevis => ({
    id: genererId(),
    produitId: p.id,
    description: designationProduit(p),
    quantite,
    unite: p.unite || 'u',
    prixUnitaireHT: prixPourClient(p, quantite, client),
    tva: p.tva ?? 20,
    remise: 0,
    ...(note ? { note } : {}),
  });
  const libre = (description: string) => {
    aVerifier.push(description);
    lignes.push({ id: genererId(), description: `${description} — à vérifier`, quantite: 1, unite: 'u', prixUnitaireHT: 0, tva: 20, remise: 0 });
  };

  /* En-tête : ce que le calculateur a chiffré. */
  const surface = e.um && e.longueur
    ? `${nf(e.longueur)} ml en bande de ${nf(e.larg)} cm (${nf(e.area)} m²)`
    : `${nf(e.area)} m²`;
  const systeme = `Flowfast ${e.resine}${e.charge ? ` ${e.chargeTag || e.charge}` : ''}`.trim();
  lignes.push({
    id: genererId(), type: 'texte', quantite: 0, unite: '', prixUnitaireHT: 0, tva: 20, remise: 0,
    description: `Calculateur Flowfast — ${e.nomResine}${e.charge ? `, charge ${e.charge}` : ''} : ${surface}, `
      + `${nf(e.rate)} kg/m², ${nf(e.temp, 0)} °C`
      + (prep ? `. Préconisation : ${kits.map(k => `${k.n} × ${k.code}`).join(' + ')}` : '')
      + `. Mélange ${kg(prep ? prep.total : e.total)} (résine ${kg(resine)}${pigment > 0 ? `, pigment ${kg(pigment)}` : ''}, catalyseur ${kg(catalyseur)}${e.fk > 0 ? `, charge ${kg(prep ? prep.charge : e.fk)}` : ''}).`,
  });

  /* Résine, en seaux. */
  const cle = e.resine === '319' ? `319${e.mode === 'c' ? 'c' : 'u'}` : e.resine;
  const formats = (RESINES[cle] || []).map(f => ({ ...f, p: trouver(produits, f.refs) }));
  const dispo = formats.filter(f => f.p);
  if (!dispo.length) libre(`Résine ${e.nomResine} : ${kg(resine)}`);
  else {
    for (const s of seauxPour(resine, dispo.map(f => f.kg))) {
      const f = dispo.find(x => x.kg === s.kg)!;
      lignes.push(article(f.p!, s.n, `Résine nécessaire : ${kg(resine)}`));
    }
  }

  /* Pigment (ou Fintalc), en sachets. */
  if (pigment > 0) {
    if (e.talc) libre(`Fintalc M15 (${nf(e.pig)} %) : ${kg(pigment)}`);
    else {
      for (const s of e.sachets.filter(x => x.n > 0)) {
        const ref = s.libre ? undefined : SACHETS[String(s.kg)];
        const p = ref ? trouver(produits, [ref]) : undefined;
        if (p) lignes.push(article(p, s.n, `Pigment${e.pigNom ? ` ${e.pigNom}` : ''} ${nf(e.pig)} % : ${kg(pigment)} — teinte à choisir`));
        else libre(`Pigment en sachets de ${kg(s.kg)} × ${s.n}`);
      }
      if (!e.sachets.some(x => x.n > 0)) libre(`Pigment ${nf(e.pig)} % : ${kg(pigment)}`);
    }
  }

  /* Catalyseur, au conditionnement choisi dans le calculateur. */
  if (catalyseur > 0) {
    const g = e.catW && e.catW > 0 ? e.catW : 2000;
    const n = Math.max(1, Math.ceil(catalyseur * 1000 / g - 1e-9));
    const refs = e.catLibre ? undefined : CATALYSEURS[g];
    const p = refs ? trouver(produits, refs) : undefined;
    const format = g >= 1000 ? `pot de ${nf(g / 1000)} kg` : `sachet de ${nf(g, 0)} g`;
    if (p) lignes.push(article(p, n, `Catalyst C2 nécessaire : ${kg(catalyseur)}`));
    else libre(`Catalyst C2 en ${format} × ${n} (${kg(catalyseur)})`);
  }

  /* Charge : kits SNLR / SNLC sous leur code, SNL Filler en sacs. */
  if (kits.length) {
    for (const k of kits) {
      const p = trouver(produits, [k.code]);
      if (p) lignes.push(article(p, k.n));
      else libre(`Kit ${k.code} (${nf(k.kg, 3)} kg) × ${k.n}`);
    }
  } else if (e.fk > 0 && e.charge) {
    const p = /SNL Filler/i.test(e.charge) ? trouver(produits, SNL_FILLER.refs) : undefined;
    if (p) lignes.push(article(p, Math.max(1, Math.ceil(e.fk / SNL_FILLER.kg - 1e-9)), `Charge nécessaire : ${kg(e.fk)}`));
    else libre(`Charge ${e.charge} : ${kg(e.fk)}`);
  }

  return { lignes, aVerifier, systeme };
}
