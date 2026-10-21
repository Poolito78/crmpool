/**
 * odooSync.ts
 * Génère un script JavaScript auto-exécutable à coller dans la console Odoo
 * pour créer un devis CRMPool dans Odoo (sale.order + lignes).
 */

import type { Devis, Client, Produit, Contact, LigneDevis, UniteSurface } from './store';
import { couvertureM2, consoFiche, libelleSurface, uniteDeLigne, surfaceDeLigne, consoDeLigne } from './store';
import { produitParId } from '@/lib/indexProduits';
import { estGamme, niveauGamme } from '@/lib/remiseGammes';
import { noteEnTexte } from '@/lib/noteRiche';
import { calculerCatalyse, contenanceCatalyseur, estCatalyseur, ligneDuTableau, TEMPERATURE_PAR_DEFAUT } from '@/lib/catalyseur';

// ── Gestion du nom Odoo par client (localStorage) ────────────────────────────

const LS_PREFIX = 'odoo_partner_';

/** Retourne le nom Odoo mémorisé pour ce client, ou le nom par défaut. */
export function getOdooPartnerName(clientId: string, defaultName: string): string {
  return localStorage.getItem(LS_PREFIX + clientId) || defaultName;
}

/** Mémorise le nom Odoo pour ce client. */
export function setOdooPartnerName(clientId: string, name: string): void {
  localStorage.setItem(LS_PREFIX + clientId, name);
}

const LS_PREFIX_ID = 'odoo_partner_id_';

/**
 * La fiche Odoo choisie à la main pour ce client, si son nom est toujours
 * celui qu'on envoie. Un nom corrigé depuis dans le prompt l'annule : c'est
 * alors une autre société que l'utilisateur désigne.
 */
export function getOdooPartnerId(clientId: string, nomEnvoye: string): number | undefined {
  try {
    const lu = JSON.parse(localStorage.getItem(LS_PREFIX_ID + clientId) || 'null') as { id?: number; nom?: string } | null;
    return lu?.id && lu.nom === nomEnvoye ? lu.id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Retient la fiche Odoo cliquée dans « Quelle société, dans Odoo ? » : son
 * nom devient celui du prompt, son id part avec les envois suivants — une
 * fiche fille (« AGENCE CÔTE D'OPALE ») ne se retrouverait pas par son nom.
 */
export function setOdooPartnerId(clientId: string, fiche: { id: number; nom: string }): void {
  setOdooPartnerName(clientId, fiche.nom);
  localStorage.setItem(LS_PREFIX_ID + clientId, JSON.stringify({ id: fiche.id, nom: fiche.nom }));
}

/**
 * Ouvre un prompt pour confirmer/corriger le nom Odoo du client.
 * Retourne le nom confirmé, ou null si l'utilisateur annule.
 */
export function promptOdooPartnerName(clientId: string, defaultName: string): string | null {
  const cached = getOdooPartnerName(clientId, defaultName);
  const result = window.prompt('Nom du client dans Odoo :', cached);
  if (result === null) return null; // annulé
  const trimmed = result.trim() || cached;
  setOdooPartnerName(clientId, trimmed);
  return trimmed;
}

const ODOO_COMPANY_ID = 13;
// Frais de port : produit service dédié (ligne de transport, pas un négoce).
const ODOO_PORT_PRODUCT_ID = 362577; // FRAIS DE PORT — service générique
// Repli négoce (même méthode que le Chiffrage ISOSIGN) : article générique dont
// la désignation réelle va dans le libellé de ligne et le prix dans le P.U.
// C'est l'EXCEPTION : on ne doit y tomber que si la référence n'existe pas dans Odoo.
const ODOO_NEGOCE_CODE = 'NEG.ISO';
const ODOO_NEGOCE_ID = 575933; // « GE NEGOCE ISO » — repli si la recherche par code échoue

/**
 * Le négoce des gammes ISOMARK et ISOFLOOR : « GE NEGOCE SH ISO ».
 *
 * Un article ISOMARK ou ISOFLOOR absent d'Odoo ne part pas dans le négoce
 * ISOSIGN : le devis AF037640 porte ses SNL Concrete et ses pigments en
 * NEG.SH.ISO, et c'est ce code qu'Odoo attend pour ces gammes.
 */
export const ODOO_NEGOCE_SH_CODE = 'NEG.SH.ISO';

/**
 * L'article de négoce d'une ligne, si elle doit partir en négoce.
 *
 * La gamme se lit sur l'article (catalogue, ou catégorie Odoo « ISOMARK /… »,
 * « … / FLOORING / … », MMA, EPOXY…), à défaut sur la ligne elle-même.
 * `undefined` = le négoce par défaut du devis (NEG.ISO).
 */
export function codeNegoce(
  produit: Pick<Produit, 'catalogue' | 'categorie'> | undefined,
  ligne?: { gamme?: string },
): string | undefined {
  const gamme = String(ligne?.gamme || '').toUpperCase();
  if (estGamme(produit?.catalogue) || estGamme(gamme)) return ODOO_NEGOCE_SH_CODE;
  const categorie = String(produit?.categorie || '').toUpperCase();
  if (/^ISOMARK\b/.test(categorie)) return ODOO_NEGOCE_SH_CODE;
  if (produit && niveauGamme(produit.categorie, produit.catalogue)) return ODOO_NEGOCE_SH_CODE;
  return undefined;
}

interface LigneScript {
  type: 'section' | 'note' | 'product';
  desc: string;
  ref?: string;   // default_code Odoo (= produit.reference dans crmpool)
  qty?: number;
  pu?: number;    // prix unitaire HT AVANT remise
  rem?: number;   // remise % (sera calculée en net, remise=0 dans Odoo)
  port?: boolean; // ligne de frais de port (produit service dédié)
  /** Mode d'expédition Odoo du port : l'article de port se retrouve par ce nom. */
  portNom?: string;
  /** Article de négoce si la référence manque chez Odoo — défaut : celui du devis. */
  negoce?: string;
}

function buildLignes(devis: Devis, produits: Produit[]): LigneScript[] {
  const result: LigneScript[] = [];

  for (const l of devis.lignes) {
    if (l.type === 'soustotal') continue;

    if (l.type === 'groupe') {
      result.push({ type: 'section', desc: l.description });
    } else if (l.type === 'texte') {
      result.push({ type: 'note', desc: l.description });
    } else {
      const produit = produitParId(produits, l.produitId);
      /* La référence ODOO d'abord.
       *
       * On envoyait `reference`, la référence MonCRM. Elle coïncide avec
       * celle d'Odoo pour les articles importés, mais PAS pour ceux du
       * catalogue métier : le primaire ISOFLOOR se code « FLOWFAST107 » ici
       * et n'existe pas sous ce code chez Odoo. La ligne partait alors en
       * négoce, ou pire, tombait sur un homonyme. */
      /* À défaut d'article MonCRM, la référence portée par la ligne elle-même :
         c'est le cas des articles retenus chez Odoo et absents du catalogue
         local, qui partaient jusqu'ici en négoce. */
      const ref = (produit?.referenceOdoo || produit?.reference || l.referenceOdoo || '').trim();
      result.push({
        type: 'product',
        // Odoo n'a pas de gras : le texte part sans les balises de mise en forme.
        desc: noteEnTexte(l.description),
        ref: ref || undefined,
        qty: l.quantite,
        pu: l.prixUnitaireHT,
        rem: l.remise ?? 0,
        ...(codeNegoce(produit, l) ? { negoce: codeNegoce(produit, l) } : {}),
      });
    }
  }

  // Frais de port comme ligne séparée si > 0
  if (devis.fraisPortHT && devis.fraisPortHT > 0) {
    result.push({
      type: 'product',
      desc: devis.fraisPortLibelle || 'Frais de port',
      ref: undefined,
      qty: 1,
      pu: devis.fraisPortHT,
      rem: 0,
      port: true,
      ...(devis.fraisPortLibelle ? { portNom: devis.fraisPortLibelle } : {}),
    });
  }

  return result;
}

// ── Pont navigateur (sans console) ───────────────────────────────────────────
// Même principe que le Chiffrage ISOSIGN : le devis est déposé « en attente »,
// puis un marque-page injecte le pont DANS la page Odoo (session déjà connectée)
// qui le lit et crée la commande. Deux transports, essayés dans l'ordre :
//   1. serveur local du Chiffrage (http://127.0.0.1:8765) s'il tourne ;
//   2. presse-papiers (aucune installation) — le pont le relit.
const SRV_LOCAL = 'http://127.0.0.1:8765';

export interface OdooPayload {
  source: 'crmpool';
  numero: string;
  client: string;
  contact?: string;
  /** Le contact de l'affaire en entier : `odoo-devis` le retrouve par son
      e-mail ou ses mots, et le crée sous la société s'il n'existe pas. */
  contactInfo?: {
    nom: string;
    prenom?: string;
    email?: string;
    telephone?: string;
    mobile?: string;
    fonction?: string;
  };
  ref?: string;
  /** La case Chantier du devis : `odoo-devis` l'écrit dans le champ Chantier
      d'Odoo. Absent, la référence d'affaire y va, comme avant. */
  chantier?: string;
  validity?: string;
  note?: string;
  company_id: number;
  negoce_code: string;
  negoce_id: number;
  port_id: number;
  lines: LigneScript[];
}

/**
 * Surface réellement posée d'une ligne vendue au m² : surface × consommation
 * quand la ligne les porte (système), sinon la quantité commandée.
 */
export function m2Consommes(l: Pick<LigneDevis, 'quantite' | 'surfaceM2' | 'consommation'>): number {
  if ((l.surfaceM2 || 0) > 0 && (l.consommation || 0) > 0) return l.surfaceM2! * l.consommation!;
  return l.quantite || 0;
}

/**
 * Le coût chantier : la matière CONSOMMÉE, HT, rapportée au m².
 *
 * La note Odoo divisait le total TTC du devis par la surface — TVA, port et
 * conditionnements arrondis au seau compris : 48,32 €/m² là où l'écran du
 * devis annonçait bien moins pour le même chantier. Un seul calcul désormais,
 * celui de l'écran : surface × consommation × prix au kilo net pour un
 * article qui porte une consommation, prix conditionné net pour les autres.
 * Au ml, la « surface » est un linéaire et la consommation celle de la
 * fiche au ml. `uniteDevis` est l'unité du devis ; une ligne peut porter la
 * sienne (`LigneDevis.uniteSurface`), et ne reprend alors la surface globale
 * que si les deux unités concordent.
 */
export function coutChantierLigne(
  l: LigneDevis,
  produits: Produit[],
  surfaceGlobaleM2: number,
  uniteDevis?: UniteSurface,
  /** Toutes les lignes du devis : le catalyseur se compte sur la résine des autres (`coutCatalyseConsommee`). */
  lignesDevis?: LigneDevis[],
): number {
  if (l.type === 'groupe' || l.type === 'soustotal' || l.type === 'texte') return 0;
  if (lignesDevis) {
    const cata = coutCatalyseConsommee(l, lignesDevis, produits, surfaceGlobaleM2, uniteDevis);
    if (cata != null) return cata;
  }
  /* UNE LIGNE VENDUE AU m² SE COMPTE AU m², PAS AU KILO. Les pavés d'un
     système portent « 1 m²/m² » en consommation : le calcul au kilo les
     divisait par leur poids (8 kg/m²), et 4 m² à 47,50 € comptaient
     23,75 € au lieu de 190 € — coût chantier 31,55 €/m² pour 73,11.
     ⚠️ Et on compte la surface POSÉE, pas la commandée : 3,3 m² posés
     se commandent 4 m² (m² entier), le coût chantier en compte 3,3. */
  if (/^m(²|2)$/i.test((l.unite || '').trim())) {
    return m2Consommes(l) * (l.prixUnitaireHT || 0) * (1 - (l.remise || 0) / 100);
  }
  const prod = l.produitId ? produitParId(produits, l.produitId) : null;
  const unite = uniteDeLigne(l, uniteDevis);
  const conso = consoDeLigne(l, unite) || consoFiche(prod, unite) || 0;
  const surfLigne = surfaceDeLigne(l, surfaceGlobaleM2, uniteDevis);
  const net = (l.prixUnitaireHT || 0) * (1 - (l.remise || 0) / 100);
  /* Article consommé au m² (toile de verre) : une unité couvre N m², le coût
     chantier est la part de rouleau consommée, pas le rouleau entier. */
  const couverture = unite === 'ml' ? null : couvertureM2(prod);
  if (couverture && surfLigne > 0 && l.prixUnitaireHT) return surfLigne * (conso > 0 ? conso : 1) * (net / couverture);
  if (conso > 0 && surfLigne > 0) {
    const poids = prod?.poids || null;
    return poids && l.prixUnitaireHT ? surfLigne * conso * (net / poids) : 0;
  }
  return l.prixUnitaireHT > 0 ? (l.quantite || 0) * net : 0;
}

/**
 * LE CATALYSEUR CONSOMMÉ, PAS CELUI QU'ON A VENDU NI UNE CONSO FIGÉE.
 *
 * Le catalyseur se dose sur la RÉSINE (`catalyseur.ts`) : sa quantité vendue
 * vient des seaux vendus. Sa ligne porte pourtant une « consommation » en
 * kg/m², figée à la création et jamais recalculée : DEV-2026-152 en gardait
 * 0,012 — 9,6 kg sur 800 m² pour 8 kg vendus, 376,80 € de coût chantier pour
 * une ligne facturée 314 €, et un coût chantier au-dessus du total HT.
 *
 * On reprend donc le dosage sur la résine CONSOMMÉE — surface × conso ÷
 * poids, en unités fractionnaires — à la température du devis (celle de la
 * première ligne de catalyseur, comme `repartitionCatalyse`), et on valorise
 * les kilos obtenus au prix net moyen du kilo de catalyseur vendu, réparti
 * entre ses lignes (sac 2 kg, 400 g, dose) au prorata de leurs kilos.
 *
 * `null` quand la ligne n'est pas un catalyseur, ou quand le dosage ne se lit
 * pas (résine « à vérifier », sous 0 °C, aucune résine) : on ne devine pas,
 * la ligne garde alors le calcul ordinaire.
 */
export function coutCatalyseConsommee(
  l: LigneDevis,
  lignes: LigneDevis[],
  produits: Produit[],
  surfaceGlobaleM2: number,
  uniteDevis?: UniteSurface,
): number | null {
  const trouver = (id: string) => produitParId(produits, id);
  const estArticle = (x: LigneDevis) => x.type !== 'groupe' && x.type !== 'soustotal' && x.type !== 'texte';
  const pLigne = l.produitId ? trouver(l.produitId) : undefined;
  if (!estArticle(l) || !estCatalyseur(pLigne)) return null;

  const cata = lignes.filter(x => estArticle(x) && x.produitId && estCatalyseur(trouver(x.produitId)));
  const t = ligneDuTableau(cata[0]?.temperatureCatalyse ?? TEMPERATURE_PAR_DEFAUT);
  if (t == null) return null;

  // La résine consommée : la quantité devient surface × conso ÷ poids, sans arrondi au seau.
  const consommees = lignes.map(x => {
    if (!estArticle(x) || !x.produitId) return x;
    const prod = trouver(x.produitId);
    if (!prod || estCatalyseur(prod) || !(prod.poids && prod.poids > 0)) return x;
    const unite = uniteDeLigne(x, uniteDevis);
    const conso = consoDeLigne(x, unite) || consoFiche(prod, unite) || 0;
    const surf = surfaceDeLigne(x, surfaceGlobaleM2, uniteDevis);
    return conso > 0 && surf > 0 ? { ...x, quantite: surf * conso / prod.poids } : x;
  });
  const calc = calculerCatalyse(consommees, trouver, t, undefined);
  if (calc.aVerifier.length || !calc.resines.length) return null;

  const kgDe = (x: LigneDevis) => {
    const p = x.produitId ? trouver(x.produitId) : undefined;
    return (x.quantite || 0) * (contenanceCatalyseur(p) ?? p?.poids ?? 0);
  };
  const kgVendus = cata.reduce((s, x) => s + kgDe(x), 0);
  const montant = cata.reduce((s, x) => s + (x.quantite || 0) * (x.prixUnitaireHT || 0) * (1 - (x.remise || 0) / 100), 0);
  if (!(kgVendus > 0) || !(montant > 0)) return null;
  return calc.kgCatalyseur * (montant / kgVendus) * (kgDe(l) / kgVendus);
}

export function coutChantier(
  lignes: Devis['lignes'],
  produits: Produit[],
  surfaceGlobaleM2: number,
  unite?: UniteSurface,
): { total: number; parM2: number | null } {
  const total = lignes.reduce((t, l) => t + coutChantierLigne(l, produits, surfaceGlobaleM2, unite, lignes), 0);
  // Rapporté à l'unité du devis : les surfaces des lignes dans l'autre unité n'y entrent pas.
  const surfaceRef = surfaceGlobaleM2 > 0
    ? surfaceGlobaleM2
    : Math.max(0, ...lignes.filter(l => uniteDeLigne(l, unite) === (unite ?? 'm2')).map(l => l.surfaceM2 || 0));
  const parM2 = total > 0 && surfaceRef > 0 ? Math.round(total / surfaceRef * 100) / 100 : null;
  return { total, parM2 };
}

/** Coût chantier d'un groupe du devis (en-tête « groupe » jusqu'au sous-total ou au groupe suivant). */
export interface CoutChantierGroupe {
  groupeId: string;
  titre: string;
  total: number;
  /** Surface de référence du groupe : la plus grande de ses lignes, dans l'unité de celle-ci. */
  surface: number | null;
  unite: UniteSurface;
  /** Coût par m² (ou par ml) du groupe, `null` sans surface. */
  parUnite: number | null;
}

/**
 * Le coût chantier groupe par groupe : un sol au m² et ses joints au ml ne
 * se rapportent pas à la même surface. Chaque groupe se rapporte à SA
 * surface — la plus grande de ses lignes (la sienne, sinon la globale si
 * l'unité concorde) — et à l'unité de cette ligne. Les lignes hors groupe
 * n'y figurent pas ; elles restent dans le total du devis.
 */
export function coutChantierParGroupe(
  lignes: Devis['lignes'],
  produits: Produit[],
  surfaceGlobaleM2: number,
  uniteDevis?: UniteSurface,
): CoutChantierGroupe[] {
  const groupes: { id: string; titre: string; lignes: LigneDevis[] }[] = [];
  let cur: (typeof groupes)[number] | null = null;
  for (const l of lignes) {
    if (l.type === 'groupe') { cur = { id: l.id, titre: l.description, lignes: [] }; groupes.push(cur); }
    else if (l.type === 'soustotal') cur = null;
    else if (cur && l.type !== 'texte') cur.lignes.push(l);
  }
  return groupes.map(g => {
    const total = g.lignes.reduce((t, l) => t + coutChantierLigne(l, produits, surfaceGlobaleM2, uniteDevis, lignes), 0);
    let surface = 0;
    let unite: UniteSurface = uniteDevis ?? 'm2';
    for (const l of g.lignes) {
      const s = surfaceDeLigne(l, surfaceGlobaleM2, uniteDevis);
      if (s > surface) { surface = s; unite = uniteDeLigne(l, uniteDevis); }
    }
    return {
      groupeId: g.id, titre: g.titre, total,
      surface: surface > 0 ? surface : null, unite,
      parUnite: total > 0 && surface > 0 ? Math.round(total / surface * 100) / 100 : null,
    };
  });
}

/** Construit le devis à transmettre au pont (prix nets déjà calculés). */
export function buildOdooPayload(
  devis: Devis,
  client: Client,
  produits: Produit[],
  options?: { surface?: number; contactNom?: string; contact?: Contact; odooPartnerName?: string }
): OdooPayload {
  const surface = options?.surface ?? devis.surfaceGlobaleM2 ?? 0;
  const coutM2 = coutChantier(devis.lignes, produits, surface, devis.uniteSurface).parM2 ?? 0;
  const u = libelleSurface(devis.uniteSurface);
  const ct = options?.contact;

  const noteLines: string[] = [];
  if (devis.systeme) noteLines.push(`Système : ${devis.systeme}`);
  if (surface > 0) noteLines.push(`${devis.uniteSurface === 'ml' ? 'Linéaire global' : 'Surface globale'} : ${surface} ${u}`);
  if (coutM2 > 0) noteLines.push(`Coût chantier : ${coutM2} €/${u}`);

  // Prix net (remise appliquée), arrondi supérieur au centime — comme l'export console.
  const lines = buildLignes(devis, produits).map(l =>
    l.type === 'product'
      ? { ...l, pu: Math.ceil((l.pu || 0) * (1 - ((l.rem || 0) / 100)) * 100) / 100, rem: 0 }
      : l
  );

  return {
    source: 'crmpool',
    numero: devis.numero,
    client: options?.odooPartnerName || client.societe || client.nom,
    contact: options?.contactNom || undefined,
    ...(ct ? {
      contactInfo: {
        nom: ct.nom,
        prenom: ct.prenom || undefined,
        email: ct.email || undefined,
        telephone: ct.telephone || undefined,
        mobile: ct.telephoneMobile || undefined,
        fonction: ct.fonction || undefined,
      },
    } : {}),
    ref: devis.referenceAffaire || undefined,
    /* Oublié jusqu'ici : seul le script console lisait `devis.chantier`, et
       l'envoi par la fonction partait sans — la case Chantier d'Odoo
       recevait la référence d'affaire. */
    chantier: devis.chantier?.trim() || undefined,
    validity: devis.dateValidite || undefined,
    note: noteLines.join('\n') || undefined,
    company_id: ODOO_COMPANY_ID,
    negoce_code: ODOO_NEGOCE_CODE,
    negoce_id: ODOO_NEGOCE_ID,
    port_id: ODOO_PORT_PRODUCT_ID,
    lines,
  };
}

/**
 * Dépose le devis pour le pont Odoo.
 * Retourne le transport réellement utilisé ('serveur' | 'presse-papiers').
 */
export async function envoyerVersOdoo(payload: OdooPayload): Promise<'serveur' | 'presse-papiers'> {
  // 1. Serveur local du Chiffrage (s'il tourne) — court délai pour ne pas bloquer.
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 900);
    const r = await fetch(`${SRV_LOCAL}/devispending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (r.ok) return 'serveur';
  } catch { /* serveur absent → presse-papiers */ }

  // 2. Presse-papiers : le pont le relit dans la page Odoo.
  await navigator.clipboard.writeText(JSON.stringify(payload));
  return 'presse-papiers';
}

export function genererScriptOdoo(
  devis: Devis,
  client: Client,
  produits: Produit[],
  options?: {
    surface?: number;
    contactNom?: string;
    odooPartnerName?: string;
  }
): string {
  const surface = options?.surface ?? devis.surfaceGlobaleM2 ?? 0;
  const coutM2 = coutChantier(devis.lignes, produits, surface, devis.uniteSurface).parM2 ?? 0;
  const u = libelleSurface(devis.uniteSurface);

  const lignes = buildLignes(devis, produits);
  const refs = [...new Set(lignes.filter(l => l.ref).map(l => l.ref as string))];

  // Texte de la note système (haut du devis)
  const noteLines: string[] = [];
  if (devis.systeme) noteLines.push(`Système : ${devis.systeme}`);
  if (surface > 0) noteLines.push(`${devis.uniteSurface === 'ml' ? 'Linéaire global' : 'Surface globale'} : ${surface} ${u}`);
  if (coutM2 > 0) noteLines.push(`Coût chantier : ${coutM2} €/${u}`);
  const noteText = noteLines.join('\n');

  const clientName = options?.odooPartnerName || client.societe || client.nom;
  const contactNom = options?.contactNom ?? '';
  const referenceAffaire = devis.referenceAffaire ?? '';
  /* La case Chantier d'Odoo (`x_studio_chantier`, champ texte) reçoit le
     chantier quand il est renseigné. À défaut, elle garde l'ancien
     comportement — la référence d'affaire — pour que les devis créés avant
     l'existence du champ continuent de partir comme avant. */
  const chantier = (devis.chantier ?? '').trim() || referenceAffaire;
  const dateValidite = devis.dateValidite ?? '';

  return `(async()=>{
const rpc=(model,method,args,kwargs={})=>fetch('/web/dataset/call_kw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'call',id:Math.random(),params:{model,method,args,kwargs:{...kwargs,context:{allowed_company_ids:[${ODOO_COMPANY_ID}]}}}})}).then(r=>r.json()).then(d=>{if(d.error)throw new Error(d.error?.data?.message||JSON.stringify(d.error));return d.result});

// 1. Partenaire
const compList=await rpc('res.partner','search_read',[[['name','ilike',${JSON.stringify(clientName)}],['is_company','=',true]]],{fields:['id','name'],limit:5});
if(!compList.length){alert('❌ Client "${clientName}" introuvable dans Odoo');return;}
const companyId=compList[0].id;
console.log('Partenaire:',companyId,compList[0].name);

// 2. Contact
${contactNom ? `
const ctList=await rpc('res.partner','search_read',[[['parent_id','=',companyId],['name','ilike',${JSON.stringify(contactNom)}]]],{fields:['id','name'],limit:3});
const contactId=ctList.length?ctList[0].id:null;
console.log('Contact:',contactId,ctList[0]?.name);
` : 'const contactId=null;'}

// 3. Produits par référence — même méthode que le Chiffrage ISOSIGN :
//    on résout un maximum d'articles RÉELS ; NEG.ISO n'est que le repli.
const refs=${JSON.stringify(refs)};
const prodMap={};
const orDom=(conds)=>{const d=[];for(let i=0;i<conds.length-1;i++)d.push('|');return d.concat(conds);};
if(refs.length){
  // Passe 1 — code exact
  const p1=await rpc('product.product','search_read',[[['default_code','in',refs]]],{fields:['id','default_code'],limit:500});
  p1.forEach(p=>{prodMap[p.default_code]=p.id;});
  // Passe 2 — code insensible à la casse / aux espaces (=ilike)
  let todo=refs.filter(r=>!prodMap[r]);
  if(todo.length){
    const p2=await rpc('product.product','search_read',[orDom(todo.map(r=>['default_code','=ilike',r]))],{fields:['id','default_code'],limit:500});
    todo.forEach(r=>{const hit=p2.find(p=>(p.default_code||'').trim().toLowerCase()===r.toLowerCase());if(hit)prodMap[r]=hit.id;});
  }
  // Passe 3 — le code est contenu dans la référence Odoo (préfixes/suffixes catalogue).
  //   Prudence : uniquement pour les codes assez longs ET si UN SEUL produit
  //   correspond — un mauvais article serait pire qu'une ligne négoce.
  todo=refs.filter(r=>!prodMap[r]&&r.length>=5);
  if(todo.length){
    const p3=await rpc('product.product','search_read',[orDom(todo.map(r=>['default_code','ilike',r]))],{fields:['id','default_code'],limit:500});
    todo.forEach(r=>{
      const hits=p3.filter(p=>(p.default_code||'').toLowerCase().includes(r.toLowerCase()));
      if(hits.length===1)prodMap[r]=hits[0].id;
      else if(hits.length>1)console.warn('Référence ambiguë, laissée en négoce:',r,hits.map(h=>h.default_code));
    });
  }
}
const missing=refs.filter(r=>!prodMap[r]);
console.log('Produits résolus:',Object.keys(prodMap).length+'/'+refs.length,prodMap);
if(missing.length)console.warn('Références introuvables (→ '+${JSON.stringify(ODOO_NEGOCE_CODE)}+'):',missing);

const lignes=${JSON.stringify(lignes)};
// 3a. Articles négoce (repli) — NEG.ISO, et NEG.SH.ISO pour ISOMARK / ISOFLOOR
const negList=await rpc('product.product','search_read',[[['default_code','=',${JSON.stringify(ODOO_NEGOCE_CODE)}]]],{fields:['id'],limit:1});
const negId=negList.length?negList[0].id:${ODOO_NEGOCE_ID};
const negIds={};
for(const c of [...new Set(lignes.map(l=>l.negoce).filter(Boolean))]){
  const n=await rpc('product.product','search_read',[[['default_code','=',c]]],{fields:['id'],limit:1});
  if(n.length)negIds[c]=n[0].id; else console.warn('Article négoce introuvable, repli NEG.ISO :',c);
}
console.log('Article négoce:',negId,negIds);

// 3b. TVA 20%
const taxes=await rpc('account.tax','search_read',[[['name','ilike','20'],['type_tax_use','=','sale'],['active','=',true],['company_id','=',${ODOO_COMPANY_ID}]]],{fields:['id','name'],limit:5});
const tva20Id=taxes.length?taxes[0].id:null;
console.log('TVA 20%:',tva20Id,taxes[0]?.name);

// 4. Champ Chantier (Studio)
const allF=await rpc('sale.order','fields_get',[],{attributes:['string','type']});
const chantierField=Object.keys(allF).find(k=>allF[k].string.toLowerCase().includes('chantier'))||null;
console.log('Champ chantier:',chantierField);

// 5. Créer l'en-tête
const orderVals={
  partner_id:companyId,
  partner_invoice_id:companyId,
  partner_shipping_id:companyId,
  ${dateValidite ? `validity_date:${JSON.stringify(dateValidite)},` : ''}
  ${contactNom ? 'x_studio_contact_de_laffaire:contactId||false,' : ''}
};
if(chantierField&&${JSON.stringify(!!chantier)}){orderVals[chantierField]=${JSON.stringify(chantier)};}
const orderId=await rpc('sale.order','create',[orderVals]);
console.log('Commande créée ID:',orderId);

// 6. Note système
${noteText ? `await rpc('sale.order.line','create',[{order_id:orderId,display_type:'line_note',name:${JSON.stringify(noteText)},sequence:5}]);` : '// Pas de note système'}

// 7. Lignes
let seq=10,ok=0,nArt=0,nNeg=0,errs=[],negLabels=[];
for(const l of lignes){
  seq+=10;
  try{
    let vals={order_id:orderId,sequence:seq,customer_lead:0};
    if(l.type==='section'){
      Object.assign(vals,{display_type:'line_section',name:l.desc});
    } else if(l.type==='note'){
      Object.assign(vals,{display_type:'line_note',name:l.desc});
    } else {
      const pid=l.ref?prodMap[l.ref]:null;
      // Article réel si résolu ; sinon frais de port dédié ; sinon repli négoce.
      const finalId=pid||(l.port?${ODOO_PORT_PRODUCT_ID}:((l.negoce&&negIds[l.negoce])||negId));
      if(pid)nArt++; else if(!l.port){nNeg++;negLabels.push((l.ref?l.ref+' — ':'')+l.desc);}
      // Arrondi supérieur à 2 décimales
      const netPrice=Math.ceil((l.pu||0)*(1-((l.rem||0)/100))*100)/100;
      /* La DESIGNATION reste celle d'Odoo quand l'article y est resolu.
         Envoyer le libelle MonCRM l'ecrasait : la commande affichait
         « FLOWFAST 107 Primer (20 kg) » sur un article Odoo qui s'appelle
         autrement. Sans libelle, Odoo le calcule lui-meme d'apres le produit,
         exactement comme une ligne saisie a la main. Le texte MonCRM ne sert
         plus qu'aux lignes sans article : negoce et port. */
      Object.assign(vals,{
        product_id:finalId,
        ...(pid?{}:{name:l.desc}),
        product_uom_qty:l.qty||1,
        price_unit:netPrice,
        discount:0,
        ...(tva20Id?{tax_id:[[6,0,[tva20Id]]]}:{}),
      });
    }
    try{
      await rpc('sale.order.line','create',[vals]);
    }catch(e1){
      /* Certaines configurations exigent un libellé explicite. On retente
         avec le nôtre plutôt que de perdre la ligne. */
      if(vals.name===undefined){vals.name=l.desc;await rpc('sale.order.line','create',[vals]);}
      else throw e1;
    }
    ok++;
    console.log('Ligne OK:',(l.type==='product'?(l.ref&&prodMap[l.ref]?'✅ ':'📦 '):''),l.desc);
  }catch(e){
    console.error('ERR:',l.desc,e.message);
    errs.push(l.desc+': '+(e.message||'').substring(0,80));
  }
}

alert('✅ ${devis.numero} → Odoo\\n'+ok+'/'+lignes.length+' lignes créées'
  +'\\n✅ '+nArt+' article(s) catalogue'+(nNeg?'\\n📦 '+nNeg+' en négoce ('+${JSON.stringify(ODOO_NEGOCE_CODE)}+') :\\n  - '+negLabels.join('\\n  - '):'')
  +(errs.length?'\\n\\nErreurs:\\n'+errs.join('\\n'):''));
window.location.href='/web#model=sale.order&id='+orderId+'&view_type=form&cids=${ODOO_COMPANY_ID}&menu_id=178&action=302';
})();`;
}
