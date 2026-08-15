/**
 * Logique de chiffrage portée depuis le Chiffrage ISOSIGN.
 *
 * L'analyse par IA (fonction edge `analyze-email`) reconnaît le client et les
 * produits. Ce module apporte ce qu'une IA fait mal :
 *
 *   · la fiabilité — un mail se termine par une signature pleine de nombres
 *     (téléphone, code postal, numéro de TVA) qui passent pour des quantités ;
 *   · le métier — les articles qui en accompagnent d'autres, avec leur ratio :
 *     un catalyseur par bidon de résine, un durcisseur compris dans le prix ;
 *   · l'origine du prix — tarif catalogue, tarif revendeur, ou prix imposé.
 *
 * Tout est déterministe et testable : mêmes entrées, mêmes sorties.
 */

/* ============================================================
   NETTOYAGE DU TEXTE
============================================================ */

/**
 * Coupe le mail à la formule de politesse.
 *
 * Sans cela, « 77550 LIMOGES-FOURCHES » d'une signature devient une quantité de
 * 77 550, et un « +33 6 78… » une commande de 33 unités. La demande réelle est
 * toujours avant la formule de politesse.
 */
export function coupeSignature(texte: string): string {
  const m = /\n\s*(?:cordialement|bien [àa] vous|salutations|sinc[èe]rement|cdt|cdlt|bien cordialement|respectueusement)\b/i
    .exec(texte);
  return m ? texte.slice(0, m.index) : texte;
}

/* ============================================================
   INDICES D'IDENTIFICATION DU CLIENT
============================================================ */

export interface IndicesClient {
  emails: string[];
  noms: string[];
  villes: string[];
  reference: string;
}

/** Nos propres domaines : l'expéditeur interne n'est jamais le client. */
const DOMAINES_INTERNES = /@(isofloor|isosign|so-signal|sti-fr)\./i;

/** Messageries grand public : leur domaine ne dit rien de la société. */
const DOMAINES_GENERIQUES = new Set([
  'gmail', 'googlemail', 'orange', 'wanadoo', 'free', 'sfr', 'neuf', 'bbox',
  'laposte', 'hotmail', 'outlook', 'live', 'msn', 'yahoo', 'ymail', 'aol',
  'icloud', 'me', 'protonmail', 'proton', 'gmx', 'numericable', 'club-internet',
]);

/**
 * Raison sociale déduite de l'adresse de l'expéditeur.
 *
 * « thierry@reflex-signalisation.fr » désigne REFLEX SIGNALISATION avec bien
 * plus de certitude que ce qu'un modèle de langage retiendra du corps du
 * message : sur une demande signée « Manue », c'est ce prénom qui ressortait
 * comme nom de client. Le domaine, lui, ne se trompe pas de personne.
 *
 * Renvoie une chaîne vide pour les messageries grand public, où le domaine
 * n'apprend rien, et pour nos propres domaines.
 */
/**
 * Boîtes partagées : elles désignent une entreprise, jamais une personne.
 *
 * Le bloc de signature de REFLEX porte « contact@reflex-signalisation.fr » sous
 * le nom de Thierry BARAILLER. S'en servir pour identifier l'interlocuteur
 * ramenait la personne qui tient cette boîte — l'assistante — plutôt que le
 * signataire.
 */
const BOITES_PARTAGEES = new Set([
  'contact', 'info', 'infos', 'accueil', 'commande', 'commandes', 'devis',
  'achat', 'achats', 'compta', 'comptabilite', 'facture', 'factures', 'sav',
  'service', 'agence', 'secretariat', 'admin', 'administration', 'direction',
  'commercial', 'bureau', 'atelier', 'exploitation', 'travaux', 'no-reply',
  'noreply', 'ne-pas-repondre',
]);

export function adresseGenerique(email?: string): boolean {
  const e = String(email || '').trim().toLowerCase();
  const local = e.split('@')[0] || '';
  return !!local && BOITES_PARTAGEES.has(local.replace(/[._]/g, '-'));
}

/**
 * Deux libellés désignent-ils la même personne ?
 *
 * Les annuaires écrivent tantôt « Thierry BARAILLER », tantôt « BARAILLER
 * Thierry ». On compare les mots plutôt que la chaîne, et on exige que les
 * deux noms partagent au moins un mot d'au moins quatre lettres — le prénom
 * seul ne suffit pas à trancher entre deux Thierry.
 */
export function memePersonne(a?: string, b?: string): boolean {
  const mots = (v?: string) =>
    new Set(
      String(v || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().split(/[^a-z]+/).filter((m) => m.length >= 4),
    );
  const ma = mots(a);
  const mb = mots(b);
  if (!ma.size || !mb.size) return false;
  for (const m of ma) if (mb.has(m)) return true;
  return false;
}

export function societeDepuisEmail(email?: string): string {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@') || DOMAINES_INTERNES.test(e)) return '';
  const domaine = e.split('@')[1] || '';
  const parties = domaine.split('.');
  if (parties.length < 2) return '';

  // On garde le libellé qui précède le TLD, et l'éventuel sous-domaine
  // porteur : « agence.reflex-signalisation.fr » → « reflex signalisation ».
  const cle = parties[parties.length - 2];
  if (!cle || DOMAINES_GENERIQUES.has(cle)) return '';

  return cle.replace(/[-_]+/g, ' ').trim();
}

const BRUIT =
  /^(cordialement|bien (?:à|a) vous|salutations|sinc[èe]rement|merci|bonjour|bonsoir|madame|monsieur|objet|envoy[ée]|[àa]\s*:|cc\s*:|tel|t[ée]l|mobile|portable|fax|www\.|http)/i;

/**
 * Extrait du mail les indices permettant de retrouver le client : adresses,
 * raisons sociales, agence citée, référence d'affaire.
 *
 * L'agence compte autant que le nom : chez un client multi-sites, « livraison à
 * notre agence de X » désigne la bonne fiche là où la raison sociale reste
 * ambiguë.
 */
export function extraireIndices(texte: string): IndicesClient {
  const t = String(texte || '');

  const emails = [
    ...new Set(
      (t.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g) || []).map((e) =>
        e.toLowerCase().replace(/[.,;]+$/, ''),
      ),
    ),
  ].filter((e) => !DOMAINES_INTERNES.test(e));

  const noms: string[] = [];
  const pousse = (v: string) => {
    const n = String(v || '')
      .replace(/[<>"]/g, '')
      .replace(/[,;.\s]+$/, '')
      .trim();
    if (n.length >= 3 && n.length <= 80 && !/@/.test(n) && !BRUIT.test(n) && !noms.includes(n)) {
      noms.push(n);
    }
  };

  (t.match(/^\s*(?:De|From|Exp[ée]diteur)\s*:\s*(.+)$/gim) || []).forEach((l) =>
    pousse(l.replace(/^\s*(?:De|From|Exp[ée]diteur)\s*:\s*/i, '').split('<')[0]),
  );
  (t.match(/^\s*(?:Soci[ée]t[ée]|Client|Entreprise)\s*:\s*(.+)$/gim) || []).forEach((l) =>
    pousse(l.split(':').slice(1).join(':')),
  );
  (
    t.match(
      /\b[A-ZÀ-Ÿ0-9][A-ZÀ-Ÿ0-9'&.\- ]{2,60}?\s+(?:SARL|SAS|SASU|SA|EURL|SCOP|TP|SIGNALISATION|MARQUAGE|RESINE|SOLS?)\b/g,
    ) || []
  ).forEach(pousse);

  // signature : les deux lignes qui suivent la DERNIÈRE formule de politesse
  const sigs = [
    ...t.matchAll(
      /(?:cordialement|bien [àa] vous|salutations|sinc[èe]rement|merci d'avance)[\s,.!]*\n+([^\n]{3,60})\n?([^\n]{0,60})?/gi,
    ),
  ];
  const sig = sigs[sigs.length - 1];
  if (sig) {
    pousse(sig[1]);
    if (sig[2]) pousse(sig[2]);
  }

  const villes: string[] = [];
  [
    /\b(?:agence|d[ée]p[ôo]t|[ée]tablissement|site|chantier|usine)\s+(?:de\s+|d'|du\s+|des\s+|à\s+)?([A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9'\-]{2,}(?:[ \-][A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9'\-]{1,}){0,3})/g,
    /\b(?:livraison|livrer|adresse)\s+(?:[àa]|sur|au|chez|vers)?\s*:?\s*([A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9'\-]{2,}(?:[ \-][A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9'\-]{1,}){0,3})/g,
  ].forEach((rx) => {
    for (const m of t.matchAll(rx)) {
      const v = m[1].trim().replace(/[.,;]+$/, '');
      if (v.length >= 3 && !BRUIT.test(v) && !villes.includes(v)) villes.push(v);
    }
  });

  // référence d'affaire : on s'arrête au premier mot contenant une minuscule,
  // sans quoi « affaire 2026-0455 pour DUPONT » embarquerait « pour DUPONT »
  let reference = '';
  const mr =
    /\b(?:r[ée]f(?:[ée]rence)?|chantier|affaire|dossier|commande)\s*(?:client)?\s*[:n°#]*\s*([A-Z0-9][A-Z0-9\-_\/ .]{2,40})/i.exec(
      t,
    );
  if (mr) {
    const mots: string[] = [];
    for (const w of mr[1].trim().split(/\s+/)) {
      if (/[a-zà-ÿ]/.test(w)) break;
      mots.push(w);
    }
    reference = mots.join(' ').replace(/[.,;]+$/, '');
  }

  return { emails, noms: noms.slice(0, 8), villes: villes.slice(0, 4), reference };
}

/* ============================================================
   RÈGLES D'ACCOMPAGNEMENT
============================================================ */

export interface RegleAccompagnement {
  id: string;
  actif: boolean;
  nom: string;
  declencheurs: string[];
  produit_id: string | null;
  reference: string | null;
  par_lot: number;
  pour: number;
  unite: string;
  prix_impose: number | null;
  note: string | null;
  ordre: number;
}

/** Une ligne du devis en cours de constitution. */
export interface LigneChiffrage {
  produitId: string;
  produitMatch: string;
  quantite: number;
  confidence: 'high' | 'medium' | 'low';
  /** ligne créée par une règle, non saisie par le client */
  auto?: boolean;
  regleId?: string;
  /** prix imposé par la règle : 0 = compris dans un autre article */
  prixImpose?: number | null;
  detail?: string;
}

export interface ProduitRef {
  id: string;
  reference: string;
  description: string;
}

function normalise(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Produits visés par un déclencheur. Trois écritures sont acceptées, de la plus
 * fiable à la plus souple : le nom d'une AUTRE RÈGLE (c'est ainsi qu'on chaîne
 * « le durcisseur accompagne l'enduit »), la référence exacte, puis le libellé
 * rapproché mot à mot.
 */
export function produitsPourDeclencheur(
  terme: string,
  produits: ProduitRef[],
  regles: RegleAccompagnement[],
): string[] {
  const t = normalise(terme);
  if (!t) return [];
  const out = new Set<string>();

  // 1. nom d'une autre règle
  regles.forEach((r) => {
    const cible = r.produit_id;
    if (!cible || !r.nom) return;
    const n = normalise(r.nom);
    if (n && (n === t || n.startsWith(t) || t.startsWith(n))) out.add(cible);
  });
  if (out.size) return [...out];

  // 2. référence exacte
  produits.forEach((p) => {
    if (normalise(p.reference) === t) out.add(p.id);
  });
  if (out.size) return [...out];

  /* 2 bis. début de référence — « J11 » contre J11C2, J11C2DOUILLE80,
     J11600C2… Odoo décline une balise en plusieurs variantes, et le
     déclencheur d'une règle désigne la famille, pas une déclinaison. */
  if (t.length >= 2) {
    produits.forEach((p) => {
      if (normalise(p.reference).startsWith(t)) out.add(p.id);
    });
    if (out.size) return [...out];
  }

  // 3. libellé, mot à mot — « enduit à froid » contre « ENDUIT ARAVIS 7.85KG »
  const mots = String(terme)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    // Trois lettres suffisent : « K5D » et « J11 » sont des désignations
    // complètes, pas des fragments.
    .filter((w) => w.length >= 3);
  if (mots.length) {
    produits.forEach((p) => {
      const cible = normalise(p.description) + ' ' + normalise(p.reference);
      const trouves = mots.filter((w) => cible.includes(w)).length;
      if (trouves === mots.length || (mots.length >= 3 && trouves >= mots.length - 1)) {
        out.add(p.id);
      }
    });
  }
  return [...out];
}

/**
 * Ajoute les accompagnements aux lignes du devis.
 *
 * Les règles se CHAÎNENT : un durcisseur accompagne l'enduit, lui-même ajouté
 * par une règle. On repasse donc jusqu'à stabilisation, en n'excluant que les
 * lignes produites par la règle en cours — sinon une règle se nourrirait
 * d'elle-même. La fonction est idempotente : les lignes automatiques sont
 * effacées puis reconstruites, sans empilement d'un appel à l'autre.
 */
export function appliquerAccompagnements(
  lignes: LigneChiffrage[],
  regles: RegleAccompagnement[],
  produits: ProduitRef[],
): LigneChiffrage[] {
  const actives = regles.filter((r) => r.actif && r.produit_id);
  if (!actives.length) return lignes.filter((l) => !l.auto);

  let out = lignes.filter((l) => !l.auto);

  for (let passe = 0; passe < 6; passe += 1) {
    let change = false;

    for (const r of actives) {
      const cibles = (r.declencheurs || []).flatMap((d) =>
        produitsPourDeclencheur(d, produits, actives),
      );
      if (!cibles.length) continue;

      const base = out
        .filter((l) => l.regleId !== r.id && cibles.includes(l.produitId))
        .reduce((s, l) => s + (Number(l.quantite) || 0), 0);

      /* Le client a demandé cet article lui-même : sa quantité fait foi et la
         règle ne s'applique pas. Sans cela, un courriel demandant « 14 J11
         avec la galette » recevrait quatorze galettes en double — celles du
         client et celles de la règle. */
      const demandeExplicitement = out.some(
        (l) => !l.auto && l.produitId === r.produit_id,
      );
      if (demandeExplicitement) {
        const doublon = out.find((l) => l.auto && l.regleId === r.id);
        if (doublon) { out = out.filter((l) => l !== doublon); change = true; }
        continue;
      }

      const parLot = Number(r.par_lot) || 1;
      const pour = Number(r.pour) || 1;
      const quantite = base > 0 ? Math.ceil((base * parLot) / pour) : 0;

      const existante = out.find((l) => l.auto && l.regleId === r.id);

      if (quantite > 0) {
        const p = produits.find((x) => x.id === r.produit_id);
        if (existante) {
          if (existante.quantite !== quantite) {
            existante.quantite = quantite;
            existante.detail = `pour ${base} ${r.declencheurs.join('/')}`;
            change = true;
          }
        } else {
          out = [
            ...out,
            {
              produitId: r.produit_id as string,
              produitMatch: p?.description || r.nom,
              quantite,
              confidence: 'high',
              auto: true,
              regleId: r.id,
              prixImpose: r.prix_impose,
              detail: `pour ${base} ${r.declencheurs.join('/')}`,
            },
          ];
          change = true;
        }
      } else if (existante) {
        out = out.filter((l) => l !== existante);
        change = true;
      }
    }

    if (!change) break; // plus rien ne bouge : c'est stabilisé
  }

  return out;
}

/* ============================================================
   PRIX
============================================================ */

export interface ProduitTarif {
  prixHT: number;
  prixRevendeur?: number;
  remiseRevendeur?: number;
}

export interface ClientTarif {
  estRevendeur?: boolean;
  remisesParCategorie?: Record<string, number>;
}

export interface PrixRetenu {
  prix: number;
  origine: 'imposé' | 'revendeur' | 'remise catégorie' | 'catalogue';
  prixCatalogue: number;
}

/**
 * Prix applicable à une ligne, et d'où il vient.
 *
 * L'ordre compte : un prix imposé par une règle l'emporte sur tout — c'est le
 * cas d'un article compris dans un autre, qui doit rester à 0 quoi qu'en dise
 * le catalogue. Vient ensuite le tarif revendeur, puis la remise de catégorie
 * négociée avec ce client, et enfin le tarif public.
 */
export function prixDeLigne(
  ligne: LigneChiffrage,
  produit: (ProduitTarif & { categorie?: string }) | undefined,
  client: ClientTarif | undefined,
): PrixRetenu {
  const catalogue = produit?.prixHT ?? 0;

  if (ligne.prixImpose !== undefined && ligne.prixImpose !== null) {
    return { prix: Number(ligne.prixImpose), origine: 'imposé', prixCatalogue: catalogue };
  }
  if (client?.estRevendeur && produit?.prixRevendeur && produit.prixRevendeur > 0) {
    return { prix: produit.prixRevendeur, origine: 'revendeur', prixCatalogue: catalogue };
  }
  const remise = produit?.categorie ? client?.remisesParCategorie?.[produit.categorie] : undefined;
  if (remise && remise > 0) {
    return {
      prix: Math.round(catalogue * (1 - remise / 100) * 100) / 100,
      origine: 'remise catégorie',
      prixCatalogue: catalogue,
    };
  }
  return { prix: catalogue, origine: 'catalogue', prixCatalogue: catalogue };
}
