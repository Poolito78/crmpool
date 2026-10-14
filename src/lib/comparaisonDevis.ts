import type { Devis, LigneDevis, Produit } from '@/lib/store';
import type { LigneAnalysee } from '@/lib/analyseDocument';
import { produitParId } from '@/lib/indexProduits';
import { estMotVide, motsDe } from '@/lib/produitTags';

/**
 * Le devis RÉELLEMENT ENVOYÉ face au chiffrage du CRM.
 *
 * ⚠️ **LE CRM NE SAIT PAS QU'IL S'EST TROMPÉ.** Le commercial reprend le
 * devis créé par l'analyse, corrige un article, ajoute les brides oubliées,
 * retouche une quantité — dans MonCRM ou directement dans Odoo — et l'envoie.
 * Rien de ces corrections ne revenait à l'analyseur : la demande suivante
 * repartait sur les mêmes fautes. On importe donc le devis réalisé (le PDF
 * Odoo, type `devis_client`) et on le confronte au devis du CRM, ligne à
 * ligne :
 *
 *  - `article`  : même ligne, autre article — la faute que la mémoire
 *    (`memoireArticles.ts`) apprend, quand la ligne du CRM porte encore la
 *    demande du client (`LigneDevis.demandeClient`) ;
 *  - `quantite` / `prix` : même article, autre quantité ou autre prix ;
 *  - `manquant` : au devis réalisé, absent du CRM (l'oubli : port, brides,
 *    support…) ;
 *  - `en_trop`  : chiffré par le CRM, retiré du devis réalisé.
 *
 * Appariement en trois passes, de la plus sûre à la plus large : la
 * référence exacte, le port, puis la ressemblance des désignations — jamais
 * l'ordre des lignes, que le commercial réorganise.
 */

export interface CoteRealise {
  index: number;
  reference?: string;
  description: string;
  quantite: number;
  pu?: number;
}

export interface CoteCrm {
  /** `LigneDevis.id`, ou `'port'` pour les frais de port du devis. */
  id: string;
  reference?: string;
  description: string;
  quantite: number;
  pu: number;
  produitId?: string;
  demandeClient?: string;
}

export interface EcartDevis {
  type: 'identique' | 'ecart' | 'manquant' | 'en_trop';
  realise?: CoteRealise;
  crm?: CoteCrm;
  /** Les deux lignes se répondent mais ne désignent pas le même article. */
  article?: boolean;
  quantite?: boolean;
  prix?: boolean;
}

/* ── Lecture des deux côtés ───────────────────────────────────────────────── */

/** « [AK3.700.C2.BTR.IS.BRUT] Panneau… » : Odoo met la référence entre crochets. */
export function referenceDeLigne(reference?: string | null, description?: string | null): string | undefined {
  const brute = String(reference || '').replace(/[[\]]/g, '').trim();
  if (brute) return brute.toUpperCase();
  const m = /^\s*\[([^\]]{2,})\]/.exec(String(description || ''));
  return m ? m[1].trim().toUpperCase() : undefined;
}

const estPort = (ref?: string, description?: string) =>
  /^PORT/i.test(ref || '') || /\b(frais de port|transport|port\s+(isomark|isofloor|isosign|sh))\b/i.test(description || '');

const estArticle = (l: LigneDevis) =>
  l.type !== 'groupe' && l.type !== 'soustotal' && l.type !== 'texte';

/** Les lignes d'article du devis CRM, port compris quand il est facturé. */
export function cotesCrm(devis: Devis, produits: Produit[]): CoteCrm[] {
  const cotes: CoteCrm[] = devis.lignes.filter(estArticle).map(l => {
    const p = produitParId(produits, l.produitId);
    return {
      id: l.id,
      reference: (l.referenceOdoo || p?.referenceOdoo || p?.reference || '').toUpperCase() || undefined,
      description: l.description,
      quantite: l.quantite,
      pu: l.prixUnitaireHT * (1 - (l.remise || 0) / 100),
      produitId: l.produitId,
      demandeClient: l.demandeClient,
    };
  });
  if (devis.fraisPortHT && devis.fraisPortHT > 0) {
    cotes.push({
      id: 'port', description: devis.fraisPortLibelle || 'Frais de port',
      quantite: 1, pu: devis.fraisPortHT,
    });
  }
  return cotes;
}

/** Toutes les références sous lesquelles une ligne du CRM peut être citée. */
function referencesCrm(c: CoteCrm, produits: Produit[]): Set<string> {
  const refs = new Set<string>();
  if (c.reference) refs.add(c.reference);
  const p = produitParId(produits, c.produitId);
  if (p?.reference) refs.add(p.reference.toUpperCase());
  if (p?.referenceOdoo) refs.add(p.referenceOdoo.toUpperCase());
  return refs;
}

/* ── Ressemblance des désignations ────────────────────────────────────────── */

function motsSignificatifs(t: string): Set<string> {
  return new Set(motsDe(t).filter(m => !estMotVide(m) && m.length > 1));
}

/**
 * Coefficient de Dice sur les mots, plus un bonus quand les références
 * partagent leur code (« AK3 » de AK3.700 et AK3.1000) : c'est la même
 * ligne, chiffrée sur une autre variante.
 */
export function ressemblance(a: { reference?: string; description: string }, b: { reference?: string; description: string }): number {
  const ma = motsSignificatifs(`${a.reference || ''} ${a.description}`);
  const mb = motsSignificatifs(`${b.reference || ''} ${b.description}`);
  if (!ma.size || !mb.size) return 0;
  let communs = 0;
  for (const m of ma) if (mb.has(m)) communs++;
  const dice = (2 * communs) / (ma.size + mb.size);
  const code = (r?: string) => (r || '').split(/[.#\s]/)[0];
  const memeCode = !!a.reference && !!b.reference && code(a.reference) === code(b.reference);
  return dice + (memeCode ? 0.3 : 0);
}

/** Au-dessous, deux lignes ne se répondent pas : l'une manque, l'autre est en trop. */
export const SEUIL_RESSEMBLANCE = 0.45;

/* ── Comparaison ──────────────────────────────────────────────────────────── */

const ecartQuantite = (a: number, b: number) => Math.abs((a || 0) - (b || 0)) > 0.001;
/** Un centime ET un pour cent : l'arrondi d'Odoo n'est pas une faute. */
const ecartPrix = (a?: number, b?: number) =>
  a != null && b != null && Math.abs(a - b) > 0.01 && Math.abs(a - b) > Math.abs(b) * 0.01;

function qualifier(r: CoteRealise, c: CoteCrm, memeArticle: boolean): EcartDevis {
  const e: EcartDevis = { type: 'identique', realise: r, crm: c };
  if (!memeArticle) e.article = true;
  if (ecartQuantite(r.quantite, c.quantite)) e.quantite = true;
  if (ecartPrix(r.pu, c.pu)) e.prix = true;
  if (e.article || e.quantite || e.prix) e.type = 'ecart';
  return e;
}

export function comparerDevis(
  realise: LigneAnalysee[],
  devis: Devis,
  produits: Produit[],
): EcartDevis[] {
  const cotesR: CoteRealise[] = realise
    .map((l, index) => ({
      index,
      reference: referenceDeLigne(l.reference, l.description),
      description: (l.description || '').replace(/^\s*\[[^\]]+\]\s*/, ''),
      quantite: Number(l.quantite) || 0,
      pu: l.prixUnitaireHT ?? undefined,
    }))
    /* Les lignes de section ou de note d'Odoo n'ont ni quantité ni prix. */
    .filter(r => r.quantite > 0 || (r.pu ?? 0) > 0);
  const cotesC = cotesCrm(devis, produits);
  const refsC = cotesC.map(c => referencesCrm(c, produits));

  const ecarts: EcartDevis[] = [];
  const prisR = new Set<number>();
  const prisC = new Set<number>();

  // 1. La référence exacte.
  cotesR.forEach((r, ir) => {
    if (!r.reference) return;
    const ic = cotesC.findIndex((_, k) => !prisC.has(k) && refsC[k].has(r.reference!));
    if (ic < 0) return;
    prisR.add(ir); prisC.add(ic);
    ecarts.push(qualifier(r, cotesC[ic], true));
  });

  // 2. Le port répond au port, quel que soit son article.
  cotesR.forEach((r, ir) => {
    if (prisR.has(ir) || !estPort(r.reference, r.description)) return;
    const ic = cotesC.findIndex((c, k) => !prisC.has(k) && estPort(c.reference, c.description));
    if (ic < 0) return;
    prisR.add(ir); prisC.add(ic);
    ecarts.push(qualifier(r, cotesC[ic], true));
  });

  // 3. La ressemblance, meilleures paires d'abord.
  const paires: { ir: number; ic: number; s: number }[] = [];
  cotesR.forEach((r, ir) => {
    if (prisR.has(ir)) return;
    cotesC.forEach((c, ic) => {
      if (prisC.has(ic)) return;
      const s = ressemblance(r, c);
      if (s >= SEUIL_RESSEMBLANCE) paires.push({ ir, ic, s });
    });
  });
  paires.sort((a, b) => b.s - a.s);
  for (const { ir, ic } of paires) {
    if (prisR.has(ir) || prisC.has(ic)) continue;
    prisR.add(ir); prisC.add(ic);
    const r = cotesR[ir];
    const c = cotesC[ic];
    /* Sans référence d'un côté, on ne peut pas affirmer que l'article
       diffère : seule une référence lue des deux côtés le prouve. */
    const memeArticle = !r.reference || refsC[ic].size === 0 || refsC[ic].has(r.reference);
    ecarts.push(qualifier(r, c, memeArticle));
  }

  cotesR.forEach((r, ir) => { if (!prisR.has(ir)) ecarts.push({ type: 'manquant', realise: r }); });
  cotesC.forEach((c, ic) => { if (!prisC.has(ic)) ecarts.push({ type: 'en_trop', crm: c }); });

  // Dans l'ordre du devis réalisé, les lignes en trop à la fin.
  return ecarts.sort((a, b) => (a.realise?.index ?? 1e9) - (b.realise?.index ?? 1e9));
}

/* ── Ce qu'on en apprend ──────────────────────────────────────────────────── */

export interface CorrectionApprise {
  demande: string;
  reference: string;
  designation: string;
}

/**
 * Les corrections d'article que la mémoire peut retenir : la demande du
 * client (portée par la ligne du CRM) → l'article du devis réalisé.
 *
 * ⚠️ Une ligne du CRM sans `demandeClient` (devis antérieur au 14/10/2026,
 * ou ligne saisie à la main) n'apprend rien : sa désignation est celle du
 * MAUVAIS article, pas les mots du client — l'associer au bon article ne
 * servirait à aucune demande future.
 */
export function correctionsApprises(ecarts: EcartDevis[]): CorrectionApprise[] {
  return ecarts
    .filter(e => e.article && e.crm?.demandeClient && e.realise?.reference)
    .map(e => ({
      demande: e.crm!.demandeClient!,
      reference: e.realise!.reference!,
      designation: e.realise!.description,
    }));
}

export interface ResumeEcarts {
  identiques: number;
  articles: number;
  quantites: number;
  prix: number;
  manquants: number;
  enTrop: number;
  totalRealise: number;
  totalCrm: number;
}

export function resumerEcarts(ecarts: EcartDevis[]): ResumeEcarts {
  const r: ResumeEcarts = { identiques: 0, articles: 0, quantites: 0, prix: 0, manquants: 0, enTrop: 0, totalRealise: 0, totalCrm: 0 };
  for (const e of ecarts) {
    if (e.type === 'identique') r.identiques++;
    if (e.article) r.articles++;
    if (e.quantite) r.quantites++;
    if (e.prix) r.prix++;
    if (e.type === 'manquant') r.manquants++;
    if (e.type === 'en_trop') r.enTrop++;
    if (e.realise) r.totalRealise += (e.realise.pu ?? 0) * e.realise.quantite;
    if (e.crm) r.totalCrm += e.crm.pu * e.crm.quantite;
  }
  r.totalRealise = Math.round(r.totalRealise * 100) / 100;
  r.totalCrm = Math.round(r.totalCrm * 100) / 100;
  return r;
}

const eur = (n?: number) => (n == null ? '—' : `${n.toFixed(2).replace('.', ',')} €`);
const cote = (c?: { reference?: string; description: string; quantite: number; pu?: number }) =>
  c ? `${c.reference ? `[${c.reference}] ` : ''}${c.description} × ${c.quantite} à ${eur(c.pu)}` : '—';

/**
 * Le relevé en texte, à copier : c'est ce qu'on transmet pour corriger le
 * CRM lui-même (une règle de chiffrage, un oubli systématique) — ce que la
 * mémoire ne sait pas apprendre seule.
 */
export function rapportEcarts(
  ecarts: EcartDevis[],
  meta: { devisCrm: string; devisRealise?: string; client?: string },
): string {
  const r = resumerEcarts(ecarts);
  const lignes = [
    `Comparaison devis réalisé ${meta.devisRealise || '(sans numéro)'} ↔ chiffrage CRM ${meta.devisCrm}`
      + (meta.client ? ` — ${meta.client}` : ''),
    `Total HT réalisé ${eur(r.totalRealise)} / CRM ${eur(r.totalCrm)}`,
    `${r.identiques} identique(s), ${r.articles} article(s) différent(s), ${r.quantites} quantité(s), `
      + `${r.prix} prix, ${r.manquants} oubli(s) du CRM, ${r.enTrop} ligne(s) en trop`,
    '',
  ];
  for (const e of ecarts) {
    if (e.type === 'identique') continue;
    if (e.type === 'manquant') {
      lignes.push(`- OUBLI DU CRM : ${cote(e.realise)}`);
    } else if (e.type === 'en_trop') {
      lignes.push(`- EN TROP AU CRM : ${cote(e.crm)}${e.crm?.demandeClient ? ` (demande : « ${e.crm.demandeClient} »)` : ''}`);
    } else {
      const quoi = [e.article && 'article', e.quantite && 'quantité', e.prix && 'prix'].filter(Boolean).join(' + ');
      lignes.push(`- ${quoi.toUpperCase()} : réalisé ${cote(e.realise)} / CRM ${cote(e.crm)}`
        + (e.crm?.demandeClient ? ` (demande : « ${e.crm.demandeClient} »)` : ''));
    }
  }
  return lignes.join('\n');
}

/**
 * Le devis du CRM que le devis réalisé reprend, le plus probable d'abord :
 * même numéro, même référence d'affaire ou même chantier, puis le plus récent
 * du client.
 */
export function devisCandidats(
  tous: Devis[],
  realise: { numero?: string; referenceAffaire?: string; clientId?: string; texte?: string },
): Devis[] {
  const norm = (s?: string) => (s || '').trim().toUpperCase();
  const num = norm(realise.numero);
  const ref = norm(realise.referenceAffaire);
  const texte = norm(realise.texte);
  const score = (d: Devis) => {
    let s = 0;
    if (num && (norm(d.numero) === num || norm(d.referenceAffaire) === num)) s += 100;
    if (ref && (norm(d.referenceAffaire) === ref || norm(d.chantier) === ref)) s += 50;
    if (texte && d.numero && texte.includes(norm(d.numero))) s += 80;
    if (realise.clientId && d.clientId === realise.clientId) s += 20;
    return s;
  };
  return tous
    .filter(d => d.statut !== 'système')
    .map(d => ({ d, s: score(d) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || b.d.dateCreation.localeCompare(a.d.dateCreation))
    .map(x => x.d);
}

/* ── Par référence ────────────────────────────────────────────────────────── */

/**
 * La même comparaison, CUMULÉE PAR RÉFÉRENCE.
 *
 * Sur une offre de 631 lignes (AF039468, 61 ensembles), l'appariement ligne à
 * ligne noie l'essentiel : soixante colliers CO89SFP50 se répondent deux à
 * deux, au hasard de l'ordre. Ce qui compte pour corriger le CRM, c'est le
 * bilan par article — « le CRM chiffre 48 MC.89 mono, l'offre 31 MC.89 et 17
 * MDREH » — et le montant que chaque écart pèse. Trié par écart de montant.
 */
export interface EcartReference {
  /** Référence, ou « PORT », ou la désignation quand la ligne n'a pas de référence. */
  cle: string;
  designation: string;
  qteRealise: number;
  qteCrm: number;
  montantRealise: number;
  montantCrm: number;
  type: 'identique' | 'ecart' | 'manquant' | 'en_trop';
  quantite?: boolean;
  prix?: boolean;
}

export function comparerParReference(
  realise: LigneAnalysee[],
  devis: Devis,
  produits: Produit[],
): EcartReference[] {
  const parCle = new Map<string, EcartReference & { vuR: boolean; vuC: boolean }>();
  const entree = (cle: string, designation: string) => {
    let e = parCle.get(cle);
    if (!e) {
      e = { cle, designation, qteRealise: 0, qteCrm: 0, montantRealise: 0, montantCrm: 0,
        type: 'identique', vuR: false, vuC: false };
      parCle.set(cle, e);
    }
    return e;
  };
  const sansRef = (d: string) => motsDe(d).join(' ').toUpperCase();

  for (const l of realise) {
    const ref = referenceDeLigne(l.reference, l.description);
    const desc = (l.description || '').replace(/^\s*\[[^\]]+\]\s*/, '');
    const q = Number(l.quantite) || 0;
    if (!q && !l.prixUnitaireHT) continue;
    const e = entree(estPort(ref, desc) ? 'PORT' : ref || sansRef(desc), desc);
    e.vuR = true;
    e.qteRealise += q;
    e.montantRealise += (l.prixUnitaireHT ?? 0) * q;
  }
  for (const c of cotesCrm(devis, produits)) {
    const p = produitParId(produits, c.produitId);
    /* La référence sous laquelle le réalisé la cite : Odoo d'abord. */
    const cle = c.id === 'port' || estPort(c.reference, c.description) ? 'PORT'
      : [...referencesCrm(c, produits)].find(r => parCle.has(r))
        ?? (c.reference || p?.reference?.toUpperCase() || sansRef(c.description));
    const e = entree(cle, c.description);
    e.vuC = true;
    e.qteCrm += c.quantite;
    e.montantCrm += c.pu * c.quantite;
  }

  const out: EcartReference[] = [];
  for (const { vuR, vuC, ...e } of parCle.values()) {
    e.montantRealise = Math.round(e.montantRealise * 100) / 100;
    e.montantCrm = Math.round(e.montantCrm * 100) / 100;
    if (!vuC) e.type = 'manquant';
    else if (!vuR) e.type = 'en_trop';
    else {
      if (ecartQuantite(e.qteRealise, e.qteCrm)) e.quantite = true;
      const puR = e.qteRealise ? e.montantRealise / e.qteRealise : undefined;
      const puC = e.qteCrm ? e.montantCrm / e.qteCrm : undefined;
      if (ecartPrix(puR, puC)) e.prix = true;
      if (e.quantite || e.prix) e.type = 'ecart';
    }
    out.push(e);
  }
  return out.sort((a, b) =>
    Math.abs(b.montantRealise - b.montantCrm) - Math.abs(a.montantRealise - a.montantCrm));
}

/** Le relevé par référence, en texte à copier. */
export function rapportParReference(
  ecarts: EcartReference[],
  meta: { devisCrm: string; devisRealise?: string; client?: string },
): string {
  const tR = ecarts.reduce((s, e) => s + e.montantRealise, 0);
  const tC = ecarts.reduce((s, e) => s + e.montantCrm, 0);
  const lignes = [
    `Comparaison par référence : offre ${meta.devisRealise || '(sans numéro)'} ↔ chiffrage CRM ${meta.devisCrm}`
      + (meta.client ? ` — ${meta.client}` : ''),
    `Total HT offre ${eur(Math.round(tR * 100) / 100)} / CRM ${eur(Math.round(tC * 100) / 100)}`,
    '',
  ];
  for (const e of ecarts) {
    if (e.type === 'identique') continue;
    const quoi = e.type === 'manquant' ? 'ABSENT DU CRM'
      : e.type === 'en_trop' ? 'ABSENT DE L’OFFRE'
      : [e.quantite && 'quantité', e.prix && 'prix'].filter(Boolean).join(' + ').toUpperCase();
    lignes.push(`- ${quoi} : ${e.cle} — ${e.designation} — offre ${e.qteRealise} pour ${eur(e.montantRealise)}`
      + ` / CRM ${e.qteCrm} pour ${eur(e.montantCrm)}`);
  }
  return lignes.join('\n');
}

/* ── Ce que la comparaison par référence apprend ─────────────────────────── */

/** La référence sans ses segments d'option (R kit rail, P pieds, ST face simple). */
export const sansOptions = (r: string) =>
  r.toUpperCase().split('.').filter(s => !/^(R|P|ST)$/.test(s)).join('.');

/**
 * Les références que l'offre a REMPLACÉES : présente au CRM seulement d'un
 * côté, à l'offre seulement de l'autre, et identiques une fois les options
 * ôtées — D3.2200.2100.C2.ST.IS.BRUT (CRM) → D3.2200.2100.C2.IS.BRUT
 * (AF039468). C'est la même pièce sous une autre écriture : le CRM la reprend.
 * Jamais deux références d'articles différents.
 */
export function substitutionsApprises(ecarts: EcartReference[]): { de: string; vers: string; designation: string }[] {
  const crm = ecarts.filter(e => e.type === 'en_trop');
  const offre = ecarts.filter(e => e.type === 'manquant');
  const out: { de: string; vers: string; designation: string }[] = [];
  for (const c of crm) {
    const o = offre.filter(x => sansOptions(x.cle) === sansOptions(c.cle) && x.cle !== c.cle);
    if (o.length === 1) out.push({ de: c.cle, vers: o[0].cle, designation: o[0].designation });
  }
  return out;
}

/** Les prix unitaires que l'offre a pratiqués quand ils diffèrent du CRM. */
export function prixAApprendre(ecarts: EcartReference[]): { reference: string; prix: number }[] {
  return ecarts
    .filter(e => e.prix && e.qteRealise > 0 && e.cle !== 'PORT')
    .map(e => ({ reference: e.cle, prix: e.montantRealise / e.qteRealise }));
}

/**
 * Le taux PAL au m² d'une offre : ses lignes PMSD (« PAL m2 - C2 »), qui
 * portent le prix des panneaux Tasman cotés 0 € sous leur référence D3,
 * rapportées à la surface de ces D3 (lue dans la référence : D3.2200.2100 =
 * 4,62 m²). AF039468 : 2 × 761,28 € pour 2 × 4,62 m² = 164,78 €/m². Par
 * classe (`PMSD.C2`). Rien quand l'offre n'en porte pas.
 */
export function tauxPalDeLOffre(realise: LigneAnalysee[]): { reference: string; prix: number }[] {
  const parClasse = new Map<string, { montant: number; surface: number }>();
  const acc = (c: string) => {
    let a = parClasse.get(c);
    if (!a) { a = { montant: 0, surface: 0 }; parClasse.set(c, a); }
    return a;
  };
  for (const l of realise) {
    const ref = referenceDeLigne(l.reference, l.description) ?? '';
    const q = Number(l.quantite) || 0;
    const d3 = ref.match(/^D3\.(\d+)\.(\d+)\.C(\d)\b/);
    if (d3) { acc(d3[3]).surface += q * (Number(d3[1]) * Number(d3[2])) / 1e6; continue; }
    if (/^PMSD\b/.test(ref)) {
      const c = (ref.match(/\.C(\d)/) ?? `${l.description}`.match(/\bC(\d)\b/))?.[1];
      if (c) acc(c).montant += q * (l.prixUnitaireHT ?? 0);
    }
  }
  return [...parClasse.entries()]
    .filter(([, a]) => a.montant > 0 && a.surface > 0)
    .map(([c, a]) => ({ reference: `PMSD.C${c}`, prix: a.montant / a.surface }));
}
