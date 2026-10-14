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
