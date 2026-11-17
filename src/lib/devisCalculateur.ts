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
  /** Conditionnement du Catalyst choisi, en g (80, 150, 2000) ; absent = sachet de 2 kg. */
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

/* Catalyst par conditionnement (g) → fiche. Seul le sachet de 2 kg a un article :
   les sachets de 80 g et 150 g partent « à vérifier » (17/11). */
const CATALYSEURS: Record<number, string[]> = {
  2000: ['CATALYST2'],
  /* Même matière (peroxyde de benzoyle 50 %, « Catalyst C2 ») — `catalyseur.ts`. */
  150: ['DUR50FT150'],
};

/** Teinte posée d'office selon le pigment choisi au calculateur (règle du 17/11). */
const RAL_PAR_PIGMENT: Record<string, string> = { jaune: '1023' };

/** L'option de teinte d'un pigment pour ce RAL (« 319 (RAL 1023, Traffic Yellow) »). */
function teinteRal(p: Produit, ral: string): { dimId: string; label: string; prixDiff: number } | null {
  const re = new RegExp(`RAL\\s*${ral}(?!\\d)`, 'i');
  for (const d of p.variantes || []) {
    const o = d.options.find(x => re.test(x.label));
    if (o) return { dimId: d.id, label: o.label, prixDiff: o.prixDiff || 0 };
  }
  return null;
}
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
  /** Surface (m²) ou longueur (ml) du chantier : le coût chantier s'en lit. */
  surface: { valeur: number; unite: 'm2' | 'ml' } | null;
}

/** Seau de résine : seul format retenu actuellement (règle du 17/11). */
export const SEAU_RESINE_KG = 20;

/** Une masse de pigment en sachets entiers (2 kg d'abord), si elle tombe juste. */
function sachetsExacts(masse: number): string | null {
  let reste = Math.round(masse * 1000);
  const parts: string[] = [];
  for (const g of [2000, 1000, 500, 400, 200]) {
    const n = Math.floor(reste / g);
    if (n > 0) { parts.push(`${n} sachet${n > 1 ? 's' : ''} de ${g >= 1000 ? `${g / 1000} kg` : `${g} g`}`); reste -= n * g; }
  }
  return reste === 0 && parts.length ? parts.join(' + ') : null;
}

/**
 * Note récap du devis : nombre de kits et détail d'UN kit (un seau de 20 kg).
 * Les dosages par kg de résine sont ceux de la préconisation (kits retenus,
 * sinon besoin) ; la charge se dit aussi en kits SNLR / SNLC quand elle tombe
 * juste.
 */
export function noteRecap(
  e: EtatCalculateur, resine: number, pigment: number, catalyseur: number, charge: number,
  kits: { code: string; kg: number; n: number }[],
): string | null {
  if (!(resine > 0)) return null;
  const parKg = (x: number) => (x > 0 ? (x / resine) * SEAU_RESINE_KG : 0);
  const pg = parKg(pigment), ct = parKg(catalyseur), ch = parKg(charge);
  const lignes = [`Détail d'un kit :`];
  lignes.push(`• Résine ${e.nomResine} : ${SEAU_RESINE_KG} kg (1 seau)`);
  if (pg > 0) {
    const sachets = e.talc ? null : sachetsExacts(pg);
    lignes.push(`• ${e.talc ? 'Fintalc M15' : `Pigment${e.pigNom ? ` ${e.pigNom}` : ''}`} ${nf(e.pig)} % : ${kg(pg)} à rajouter par seau${sachets ? ` (${sachets})` : ''}`);
  }
  if (ct > 0) {
    const g = e.catW && e.catW > 0 ? e.catW : 2000;
    const n = ct * 1000 / g;
    const format = g >= 1000
      ? `à prélever sur un sachet de ${nf(g / 1000)} kg`
      : `${Math.abs(n - Math.round(n)) < 0.01 ? Math.round(n) : nf(n)} sachet${n > 1 ? 's' : ''} de ${nf(g, 0)} g`;
    lignes.push(`• Catalyst C2 : ${kg(ct)} par seau à ${nf(e.temp, 0)} °C (${format})`);
  }
  if (ch > 0) {
    const k = kits.length === 1 ? kits[0] : undefined;
    const nk = k ? ch / k.kg : 0;
    const enKits = k && Math.abs(nk - Math.round(nk)) < 0.01 ? ` (${Math.round(nk)} sachet${Math.round(nk) > 1 ? 's' : ''} ${k.code})` : '';
    lignes.push(`• Charge ${e.charge || ''} : ${kg(ch)}${enKits}`);
  }
  const melange = SEAU_RESINE_KG + pg + ct + ch;
  lignes.push(`Mélange d'un kit : ${kg(melange)}, soit ${nf(melange / e.rate)} m² à ${nf(e.rate)} kg/m²`
    + (e.um && e.larg > 0 ? ` (${nf(melange / e.rate / (e.larg / 100))} ml en bande de ${nf(e.larg)} cm)` : '') + '.');
  return lignes.join('\n');
}

/**
 * Note du devis quand des kits de charge sont retenus : nombre de kits et
 * détail d'un kit, format par format — résine, pigment et catalyseur suivent
 * la charge du kit, comme dans « Préconisation » du calculateur.
 */
export function noteKits(
  e: EtatCalculateur, kits: { code: string; kg: number; n: number }[],
  resine: number, pigment: number, catalyseur: number, charge: number,
): string | null {
  if (!(resine > 0) || !(charge > 0) || !kits.length) return null;
  const cpr = charge / resine, ppr = pigment / resine, kpr = catalyseur / resine;
  const total = kits.reduce((a, k) => a + k.n, 0);
  const blocs: string[] = [];
  if (kits.length > 1) blocs.push(`${total} kits : ${kits.map(k => `${k.n} × ${k.code}`).join(' + ')}.`);
  for (const k of kits) {
    const r = k.kg / cpr, pg = r * ppr, ct = r * kpr, melange = r + pg + ct + k.kg;
    const l = [`${k.n} kit${k.n > 1 ? 's' : ''} ${k.code} — détail par kit :`];
    l.push(`• Résine ${e.nomResine} : ${kg(r)}`);
    if (pg > 0) l.push(`• ${e.talc ? 'Fintalc M15' : `Pigment${e.pigNom ? ` ${e.pigNom}` : ''}`} ${nf(e.pig)} % : ${kg(pg)} à rajouter par kit`);
    if (ct > 0) l.push(`• Catalyst C2 : ${kg(ct)} par kit à ${nf(e.temp, 0)} °C`);
    l.push(`• Charge ${k.code} (${nf(k.kg, 3)} kg) : 1 sachet`);
    const m2 = melange / e.rate;
    l.push(`Mélange d'un kit : ${kg(melange)}, soit `
      + (e.um && e.larg > 0 ? `${nf(m2 / (e.larg / 100))} ml en bande de ${nf(e.larg)} cm (${nf(m2)} m²)` : `${nf(m2)} m²`)
      + ` à ${nf(e.rate)} kg/m².`);
    blocs.push(l.join('\n'));
  }
  return blocs.join('\n\n');
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

  const systeme = `Flowfast ${e.resine}${e.charge ? ` ${e.chargeTag || e.charge}` : ''}`.trim();

  /* COÛT CHANTIER AU m², MIEUX AU ml (règle du 17/11) : le devis prend la
     surface du calculateur (ml en bande, sinon m²) et chaque ligne la
     consommation de ce qu'elle apporte, rapportée à cette surface — résine
     et pigment préparés, charge des sachets. Le Catalyst n'en porte pas : son
     coût se lit sur la résine (`coutCatalyseConsommee`). */
  const surfVal = e.um && e.longueur ? e.longueur : e.area;
  const surface = surfVal > 0 ? { valeur: Math.round(surfVal * 100) / 100, unite: (e.um && e.longueur ? 'ml' : 'm2') as 'm2' | 'ml' } : null;
  const conso = (masse: number): Partial<LigneDevis> => {
    if (!surface || !(masse > 0)) return {};
    const c = Math.round(masse / surface.valeur * 10000) / 10000;
    return surface.unite === 'ml' ? { consommationMl: c } : { consommation: c };
  };

  /* Seule note du devis : le détail d'UN kit (un seau de résine de 20 kg et
     ce qu'on lui ajoute — pigment, 4 kg pour le jaune à 20 %, catalyseur,
     charge). L'en-tête « Calculateur Flowfast — … » et le récapitulatif du
     nombre de kits ont été retirés (règle du 17/11) : les quantités sont
     sur les lignes. */
  /* Kits SNLR / SNLC retenus : leur nombre et le détail PAR KIT, comme la
     préconisation du calculateur (règle du 17/11). Sans kit : un seau. */
  const recap = kits.length
    ? noteKits(e, kits, resine, pigment, catalyseur, prep ? prep.charge : e.fk)
    : noteRecap(e, resine, pigment, catalyseur, e.fk, kits);
  if (recap) lignes.push({ id: genererId(), type: 'texte', quantite: 0, unite: '', prixUnitaireHT: 0, tva: 20, remise: 0, description: recap });

  /* Résine, en seaux. */
  const cle = e.resine === '319' ? `319${e.mode === 'c' ? 'c' : 'u'}` : e.resine;
  const formats = (RESINES[cle] || []).map(f => ({ ...f, p: trouver(produits, f.refs) }));
  const dispo = formats.filter(f => f.p);
  if (!dispo.length) libre(`Résine ${e.nomResine} : ${kg(resine)}`);
  else {
    for (const s of seauxPour(resine, dispo.map(f => f.kg))) {
      const f = dispo.find(x => x.kg === s.kg)!;
      lignes.push({ ...article(f.p!, s.n, `Résine nécessaire : ${kg(resine)}`), ...conso(resine * s.n * s.kg / seauxPour(resine, dispo.map(x => x.kg)).reduce((a, x) => a + x.n * x.kg, 0)) });
    }
  }

  /* Pigment (ou Fintalc), en sachets. */
  if (pigment > 0) {
    if (e.talc) libre(`Fintalc M15 (${nf(e.pig)} %) : ${kg(pigment)}`);
    else {
      const sachets = e.sachets.filter(x => x.n > 0);
      const totalSachets = sachets.reduce((a, x) => a + x.n * x.kg, 0);
      const ral = RAL_PAR_PIGMENT[(e.pigNom || '').toLowerCase()];
      for (const s of sachets) {
        const ref = s.libre ? undefined : SACHETS[String(s.kg)];
        const p = ref ? trouver(produits, [ref]) : undefined;
        if (!p) { libre(`Pigment en sachets de ${kg(s.kg)} × ${s.n}`); continue; }
        const t = ral ? teinteRal(p, ral) : null;
        const l = article(p, s.n, `Pigment${e.pigNom ? ` ${e.pigNom}` : ''} ${nf(e.pig)} % : ${kg(pigment)} — ${t ? `RAL ${ral}` : 'teinte à choisir'}`);
        if (t) {
          l.variantesChoisies = { [t.dimId]: t.label };
          l.prixUnitaireHT = Math.round((l.prixUnitaireHT + t.prixDiff) * 100) / 100;
        }
        lignes.push({ ...l, ...conso(totalSachets > 0 ? pigment * s.n * s.kg / totalSachets : 0) });
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
    const format = g >= 1000 ? `sachet de ${nf(g / 1000)} kg` : `sachet de ${nf(g, 0)} g`;
    /* La température du calculateur suit la ligne : le devis recalcule le
       Catalyst à cette température (règle du 17/11). */
    if (p) lignes.push({ ...article(p, n, `Catalyst C2 nécessaire : ${kg(catalyseur)} à ${nf(e.temp, 0)} °C`), temperatureCatalyse: Math.round(e.temp) });
    else libre(`Catalyst C2 en ${format} × ${n} (${kg(catalyseur)})`);
  }

  /* Charge : kits SNLR / SNLC sous leur code, SNL Filler en sacs. */
  if (kits.length) {
    for (const k of kits) {
      const p = trouver(produits, [k.code]);
      if (p) lignes.push({ ...article(p, k.n), ...conso(k.n * k.kg) });
      else libre(`${k.n} sachet${k.n > 1 ? 's' : ''} ${k.code} (${nf(k.kg, 3)} kg)`);
    }
  } else if (e.fk > 0 && e.charge) {
    const p = /SNL Filler/i.test(e.charge) ? trouver(produits, SNL_FILLER.refs) : undefined;
    if (p) lignes.push({ ...article(p, Math.max(1, Math.ceil(e.fk / SNL_FILLER.kg - 1e-9)), `Charge nécessaire : ${kg(e.fk)}`), ...conso(e.fk) });
    else libre(`Charge ${e.charge} : ${kg(e.fk)}`);
  }

  return { lignes, aVerifier, systeme, surface };
}
