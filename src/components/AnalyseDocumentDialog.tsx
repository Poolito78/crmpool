import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScanText, Upload, Loader2, CheckCircle2, AlertTriangle, FileText, X, PlusCircle, Package, Receipt, Mail, Users, Truck, Sparkles, Eye, EyeOff, ExternalLink, ChevronRight, Check } from 'lucide-react';
import VoiceButton from '@/components/ui/VoiceButton';
import { toast } from 'sonner';
import { analyserDocument, type DocumentAnalysis, type TypeDocument, TYPE_LABELS } from '@/lib/analyseDocument';
import { parseEml, type EmlContent } from '@/lib/parseEml';
import {
  coupeSignature, extraireIndices, societeDepuisEmail, adresseGenerique, memePersonne,
} from '@/lib/chiffrage';
import ProduitCombobox from '@/components/ProduitCombobox';
import { useReglesAccompagnement } from '@/hooks/useReglesAccompagnement';
import { appliquerAccompagnements, type LigneChiffrage } from '@/lib/chiffrage';
import { produitParId } from '@/lib/indexProduits';
import { extraireImages, lireSignature, type ContactSignature } from '@/lib/lireSignature';
import {
  codeDansTexte, prixPanneau, panonceauPour, supportPour, hauteurDeDimension,
  formeDeCode, niveauDepuisContrat, FORME_PANONCEAU, type Taille,
} from '@/lib/tarifPanneaux';
import {
  typeAgglomeration, nomAgglomerationDansTexte, dimensionnerAgglomerationAuto,
  HC_AGGLO_DEFAUT,
} from '@/lib/compositionPanneau';
import { rapprocherArticle, memeFamille } from '@/lib/rapprochementArticle';
import { useSystemes, declinerSysteme, type Systeme, type LigneSysteme } from '@/lib/systemes';
import {
  rapprocherSysteme, surfaceDeDemande, type RapprochementSysteme,
} from '@/lib/rapprochementSysteme';
import {
  articlePlastique, chiffrerTransport, departement,
} from '@/lib/transportPlastique';
import { chiffrerPortIsosign } from '@/lib/transportIsosign';
import { portGammes, type LigneGamme } from '@/lib/transportGammes';
import { prixApplicateur, prixRevendeur, niveauGamme, estGamme, type PrixGamme } from '@/lib/remiseGammes';
import {
  rapprocherFournisseur, proposerPrix, prixVenteDepuisAchat,
  appliquerPrix, type PropositionPrix, type CibleEcriture,
} from '@/lib/prixAchatFournisseur';
import { useDevisFournisseur, type DevisFournisseur } from '@/lib/devisFournisseur';
import { extrairePDFsDeMsg, extrairePJsDeMsg } from '@/lib/parseMsgPdf';
import { parseExcel } from '@/lib/parseExcel';
import { useCRM } from '@/lib/StoreContext';
import {
  type Client, type Fournisseur, type CommandeFournisseur, type LigneReception, type CommandeClient, type Devis, type LigneDevis,
  type Produit,
  generateId, calculerDateEcheance, formatDateISO, formatMontant,
} from '@/lib/store';
import ReceptionCommandeDialog from '@/components/ReceptionCommandeDialog';
import { supabase } from '@/integrations/supabase/client';
import { type ExtractedContact } from '@/components/EmailToContactDialog';

/**
 * En dessous, le prix catalogue n'est pas un prix.
 *
 * Chez ISOSIGN le prix de vente ne vit pas sur la fiche Odoo mais dans les
 * listes de prix : la fiche affiche 1 €. L'import a recopié cette valeur, d'où
 * les 1,00 €, 1,43 € et 1,44 € qui parsèment le catalogue — 7 670 articles
 * vendables sous 2 €, et 4 657 à zéro. Un article réellement vendu moins de
 * deux euros existe, mais il est bien plus rare qu'une fiche non tarifée.
 */
const SEUIL_PRIX_FACTICE = 2;

/** Un interlocuteur rattaché à la société cliente, chez Odoo. */
interface ContactOdoo {
  id: number;
  nom: string;
  fonction: string;
  email: string;
  telephone: string;
  mobile: string;
}

/** Un article du catalogue Odoo, tarifé pour le client de l'affaire. */
interface TrouvailleOdoo {
  reference: string;
  designation: string;
  categorie: string;
  unite: string;
  /** Prix de la liste du client. `null` = article hors barème. */
  contrat: number | null;
  fiche: number;
  cout: number;
  /** Part des mots de la demande que l'article porte (0 à 1). */
  certitude?: number;
  /** Classe de film portée par la référence — C1, C2, C3, C3FJ, 3430. */
  classe?: string;
  /** Classe que la demande réclamait, quand elle en nomme une. */
  classeDemandee?: string;
  /** D'où vient le prix : la grille du client, ou un calcul de liste de prix. */
  source?: 'contrat' | 'liste' | 'aucun';
  /** Codification de grille qui a tarifé l'article, quand le contrat l'a couvert. */
  gabarit?: string | null;
  /** Dernière modification de la fiche Odoo, en ISO. Arbitre des prix. */
  maj?: string;
  /** Stock constaté chez Odoo. */
  stockDispo?: number;
  /** Stock prévisionnel Odoo : constaté + attendu − réservé. */
  stockPrevu?: number;
}

/* En dessous de ce seuil, l'article est bien retenu — la ligne ne reste
   jamais vide — mais l'appli demande qu'on le vérifie plutôt que de laisser
   croire qu'elle a tranché. */
const CERTITUDE_ACQUISE = 0.6;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fichiers pré-chargés depuis le drag-and-drop du tableau de bord */
  initialFiles?: File[];
  /** Texte pré-chargé (email glissé-déposé) */
  initialText?: string;
}

const today = () => new Date().toISOString().split('T')[0];
const nextYear = () => new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];

/** Une fiche du fichier client d'Odoo, telle que la renvoie `odoo-prix`. */
interface PartenaireOdoo {
  id: number;
  nom: string;
  email: string;
  ville: string;
  codePostal: string;
  adresse: string;
  telephone: string;
  mobile: string;
  tva: string;
  estSociete: boolean;
  societeMere: string;
  contrat: string;
}

export default function AnalyseDocumentDialog({ open, onOpenChange, initialFiles, initialText }: Props) {
  const {
    commandesFournisseur, fournisseurs, produits, produitsCharges, clients, devis,
    produitFournisseurs,
    updateCommandesFournisseur, updateCommandesClient, updateClients, updateFournisseurs, updateDevis,
    updateProduits, updateProduitFournisseurs,
  } = useCRM();

  /* ── état analyse ── */
  const [texte, setTexte] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DocumentAnalysis | null>(null);
  const [dragging, setDragging] = useState(false);
  const [emlPdfs, setEmlPdfs] = useState<{ name: string; buffer: ArrayBuffer }[]>([]);
  /* ── aperçu du document PDF (pour vérifier pendant la correction) ── */
  const [apercu, setApercu] = useState<{ name: string; url: string } | null>(null);
  /* ── état extraction contact inline ── */
  const [extractingContact, setExtractingContact] = useState(false);
  const emlContactRef = useRef<EmlContent['contact'] | undefined>(undefined);
  /* Coordonnées lues dans l'image de signature, quand il y en a une.
     En état et non en ref : la lecture de l'image est plus lente que
     l'analyse du texte, et arrive donc après. Un ref serait lu avant d'être
     rempli, et la signature ne servirait à rien une fois sur deux. */
  const [signature, setSignature] = useState<ContactSignature | null>(null);
  /* Ce qu'Odoo propose pour les demandes qu'aucun article MonCRM ne satisfait,
     indexé par le texte cherché. */
  const [trouvaillesOdoo, setTrouvaillesOdoo] = useState<Record<string, TrouvailleOdoo[]>>({});
  /* Fiche Odoo des références EXPLICITEMENT demandées, par référence.
     Ces articles-là ne sont pas « cherchés » : ils sont lus par leur code,
     donc trouvés à coup sûr. Ils n'apparaissaient pourtant nulle part dans
     le panneau Odoo, qui ne montrait que le résultat de la recherche par
     mots — d'où un AK5.1000.C2.BTR.IS.BRUT tarifé mais invisible, à côté
     d'un ARCEAU sorti d'une recherche approximative. */
  const [fichesOdoo, setFichesOdoo] = useState<Record<string, TrouvailleOdoo>>({});
  /* Article Odoo retenu pour une ligne, par indice de ligne.
     Ces articles n'existent pas dans MonCRM — c'est précisément pourquoi on
     est allé les chercher. Ils ne peuvent donc pas passer par `choixProduit`,
     qui ne sait manipuler que des identifiants du catalogue local. La ligne
     partira au devis comme ligne libre : référence et désignation dans le
     libellé, prix du bordereau client. */
  const [choixOdoo, setChoixOdoo] = useState<Record<number, TrouvailleOdoo>>({});
  /* Lignes dont l'utilisateur a RETIRÉ la proposition Odoo retenue d'office.
     Sans cette mémoire, l'effet de sélection automatique la remettrait au
     rechargement suivant et le retrait paraîtrait « revenir en arrière ». */
  const [refusOdoo, setRefusOdoo] = useState<Set<number>>(new Set());
  /* Département de LIVRAISON retenu pour les frais de transport. Vide tant
     que l'utilisateur n'a rien saisi : la valeur affichée est alors celle
     déduite du document ou du client. */
  const [dptLivraison, setDptLivraison] = useState<string>('');
  /* Niveau de remise FORCÉ à la main — R1 à R4.
     Le niveau se lit normalement dans l'intitulé du contrat cadre, mais tous
     ne le portent pas, et un chargé d'affaires peut avoir à en imposer un
     autre : le contrat CCI10019 lui-même a été forcé sur ce devis. Vide =
     on s'en remet au contrat. */
  const [niveauForce, setNiveauForce] = useState<'' | 'R1' | 'R2' | 'R3' | 'R4'>('');
  /* Synchronisation des grilles R1-R4 depuis Odoo vers la copie Supabase.
     `null` tant qu'on n'a pas regardé, sinon la date de la dernière réussie. */
  const [grilleMaj, setGrilleMaj] = useState<string | null>(null);
  const [grilleEnCours, setGrilleEnCours] = useState(false);
  /** Pourquoi Odoo n'a pas été interrogé, quand c'est le cas. */
  const [odooMuet, setOdooMuet] = useState<'sans-client' | null>(null);
  /* Interlocuteurs de la société chez Odoo, et celui retenu pour l'affaire.
     Une demande transmise par une assistante ne désigne pas le contact du
     dossier : c'est un choix, pas une déduction. */
  const [contactsOdoo, setContactsOdoo] = useState<ContactOdoo[]>([]);
  const [contactRetenu, setContactRetenu] = useState<string>('');
  /* Gamme et classe demandées, communes à l'analyse : un client commande
     rarement du B14 en petite et du C18 en normale sur la même affaire. */
  const [gammePanneau, setGammePanneau] = useState<Taille>('P');
  const [classePanneau, setClassePanneau] = useState<number>(2);
  const analyseTexteRef = useRef<string>(''); // texte utilisé lors de la dernière analyse
  const [contactToSave, setContactToSave] = useState<ExtractedContact | null>(null);
  const [contactSaveType, setContactSaveType] = useState<'client' | 'fournisseur'>('client');

  const fileRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  /* ── état commande fournisseur ── */
  const [matchedCF, setMatchedCF] = useState<CommandeFournisseur | null>(null);
  const [receptionOpen, setReceptionOpen] = useState(false);
  const [showCreerCF, setShowCreerCF] = useState(false);
  const [creerCFFournisseurId, setCreerCFFournisseurId] = useState('');
  const [creerCFNumero, setCreerCFNumero] = useState('');
  const [creerCFDateReception, setCreerCFDateReception] = useState('');
  const [creerCFDateLivraison, setCreerCFDateLivraison] = useState('');
  const [creerCFNotes, setCreerCFNotes] = useState('');

  /* ── état commande client ── */
  const [showCreerCC, setShowCreerCC] = useState(false);
  const [creerCCClientId, setCreerCCClientId] = useState('');
  const [creerCCNumero, setCreerCCNumero] = useState('');
  const [creerCCDate, setCreerCCDate] = useState('');
  const [creerCCDateLivraison, setCreerCCDateLivraison] = useState('');
  const [creerCCNotes, setCreerCCNotes] = useState('');

  /* ── état devis ── */
  const [showCreerDevis, setShowCreerDevis] = useState(false);
  /** Article du catalogue retenu pour chaque ligne, par indice de ligne. */
  const [choixProduit, setChoixProduit] = useState<Record<number, string>>({});
  /* Corrections à la main. Clé : « d<indice> » pour une ligne demandée,
     « a<id de règle> » pour un accompagnement — l'indice d'un accompagnement
     change quand une quantité bouge, pas son identifiant de règle. */
  const [quantiteManuelle, setQuantiteManuelle] = useState<Record<string, number>>({});
  const [prixManuel, setPrixManuel] = useState<Record<string, number>>({});
  /* Nom porté par un panneau d'agglomération, saisi ou corrigé à la main.
     Sa longueur commande le format, or le client l'écrit rarement dans sa
     demande — « EB10 2 UNITES » sur le devis de référence. Clé « d<indice> ». */
  /* ── Recherche d'un client dans le fichier Odoo ──────────────────────────
     MonCRM ne connaît que les clients qu'on y a saisis. Quand la demande
     vient d'un client jamais ressaisi, aucune liste déroulante ne le propose
     et le devis ne peut pas être créé. On ouvre donc une recherche sur le
     fichier Odoo, et la fiche retenue est recopiée dans MonCRM.
     `odooCible` retient LEQUEL des deux formulaires a demandé la recherche —
     le devis ou la commande client — pour y reporter le client créé. */
  const [odooCible, setOdooCible] = useState<'devis' | 'commande' | 'fournisseur' | null>(null);
  const [odooTerme, setOdooTerme] = useState('');
  const [odooEnCours, setOdooEnCours] = useState(false);
  const [odooResultats, setOdooResultats] = useState<PartenaireOdoo[] | null>(null);

  /**
   * Interroge le fichier PARTENAIRES d'Odoo — clients et fournisseurs y
   * cohabitent — sur la raison sociale, la ville, le courriel ou la TVA.
   */
  const chercherPartenaireOdoo = useCallback(async (termeImpose?: string) => {
    const terme = (termeImpose ?? odooTerme).trim();
    if (terme.length < 3) {
      toast.error('Trois caractères au minimum pour chercher.');
      return;
    }
    setOdooEnCours(true);
    try {
      const { data, error } = await supabase.functions.invoke('odoo-prix', {
        body: { rechercheClient: terme },
      });
      if (error) throw error;
      const trouves: PartenaireOdoo[] = data?.partenaires ?? [];
      setOdooResultats(trouves);
      if (!trouves.length) toast.info(`Aucune fiche Odoo pour « ${terme} ».`);
    } catch (e) {
      /* Odoo injoignable ou identifiants expirés : on le dit, plutôt que de
         laisser une liste vide faire croire à une absence de client. */
      setOdooResultats(null);
      toast.error(`Recherche Odoo impossible : ${(e as Error).message}`);
    } finally {
      setOdooEnCours(false);
    }
  }, [odooTerme]);

  /** Recopie une fiche Odoo dans MonCRM et la désigne sur le formulaire. */
  const importerClientOdoo = useCallback((p: PartenaireOdoo) => {
    /* Déjà présent ? On le réutilise au lieu d'en créer un doublon : le
       rapprochement se fait sur le courriel, seul identifiant fiable, sinon
       sur la raison sociale exacte. */
    const existant = clients.find(c =>
      (p.email && c.email && c.email.toLowerCase() === p.email.toLowerCase())
      || (c.societe || c.nom || '').toLowerCase() === p.nom.toLowerCase());

    /* Un contact rattaché porte le nom de la personne ; c'est sa société qui
       doit figurer sur le devis. */
    const societe = p.estSociete ? p.nom : (p.societeMere || p.nom);
    const client: Client = existant ?? {
      id: generateId(),
      nom: p.nom,
      societe,
      email: p.email,
      telephone: p.telephone || p.mobile,
      telephoneMobile: p.mobile,
      adresse: p.adresse,
      ville: p.ville,
      codePostal: p.codePostal,
      tvaIntra: p.tva,
      notes: `Fiche reprise du fichier Odoo (partenaire #${p.id}).`,
      dateCreation: new Date().toISOString().split('T')[0],
      adressesLivraison: [],
    };
    if (!existant) updateClients(prev => [...prev, client]);

    if (odooCible === 'commande') setCreerCCClientId(client.id);
    else setCreerDevisClientId(client.id);

    setOdooCible(null);
    setOdooResultats(null);
    setOdooTerme('');
    toast.success(existant
      ? `${societe} était déjà dans MonCRM : client rattaché.`
      : `${societe} repris d'Odoo et ajouté à MonCRM.`);
  }, [clients, updateClients, odooCible]);

  /**
   * Recopie une fiche Odoo dans la liste des FOURNISSEURS.
   *
   * Le fichier partenaires d'Odoo ne sépare pas clients et fournisseurs : la
   * même fiche AFC COMMUNICATION y sert aux deux sens. C'est pourquoi la
   * recherche est commune et seule la destination change.
   *
   * Les conditions commerciales — franco de port, coût de transport, délai de
   * règlement — ne se lisent pas sur une fiche partenaire. Elles restent donc
   * à zéro, à compléter dans la fiche fournisseur : les inventer fausserait
   * les comparatifs d'achat sans que personne ne s'en aperçoive.
   */
  const importerFournisseurOdoo = useCallback((p: PartenaireOdoo) => {
    const societe = p.estSociete ? p.nom : (p.societeMere || p.nom);
    /* Déjà présent ? On le réutilise plutôt que d'en créer un doublon. */
    const existant = fournisseurs.find(f =>
      (p.email && f.email && f.email.toLowerCase() === p.email.toLowerCase())
      || (f.societe || f.nom || '').toLowerCase() === societe.toLowerCase());

    const fournisseur: Fournisseur = existant ?? {
      id: generateId(),
      nom: p.nom,
      societe,
      email: p.email,
      telephone: p.telephone || p.mobile,
      telephoneMobile: p.mobile,
      adresse: p.adresse,
      ville: p.ville,
      codePostal: p.codePostal,
      notes: `Fiche reprise du fichier Odoo (partenaire #${p.id}).`,
      francoPort: 0,
      coutTransport: 0,
      delaiReglement: '',
      dateCreation: new Date().toISOString().split('T')[0],
    };
    if (!existant) updateFournisseurs(prev => [...prev, fournisseur]);

    setDfFournisseurId(fournisseur.id);
    setOdooCible(null);
    setOdooResultats(null);
    setOdooTerme('');
    toast.success(existant
      ? `${societe} était déjà dans MonCRM : fournisseur rattaché.`
      : `${societe} repris d'Odoo et ajouté aux fournisseurs.`);
  }, [fournisseurs, updateFournisseurs]);

  /**
   * Crée le fournisseur avec le seul nom lu sur le document.
   *
   * Le repli quand Odoo ne connaît pas la société — ou ne répond pas. La
   * fiche est volontairement nue : mieux vaut un fournisseur sans
   * coordonnées, qu'on complétera, qu'un devis bloqué faute de pouvoir
   * rattacher ses prix à quelqu'un.
   */
  const creerFournisseurDepuisDocument = useCallback((nom: string) => {
    const fournisseur: Fournisseur = {
      id: generateId(),
      nom,
      societe: nom,
      email: '', telephone: '', adresse: '', ville: '', codePostal: '',
      notes: "Créé depuis l'analyse d'un devis fournisseur — coordonnées à compléter.",
      francoPort: 0,
      coutTransport: 0,
      delaiReglement: '',
      dateCreation: new Date().toISOString().split('T')[0],
    };
    updateFournisseurs(prev => [...prev, fournisseur]);
    setDfFournisseurId(fournisseur.id);
    toast.success(`${nom} ajouté aux fournisseurs — pensez à compléter sa fiche.`);
  }, [updateFournisseurs]);

  /** Le bloc de recherche, partagé par les trois formulaires. */
  const rechercheOdoo = (cible: 'devis' | 'commande' | 'fournisseur') => (
    <div className="col-span-2 space-y-1">
      {odooCible !== cible ? (
        <button
          type="button"
          className="text-[11px] text-primary underline underline-offset-2"
          onClick={() => { setOdooCible(cible); setOdooResultats(null); }}
        >
          {cible === 'fournisseur'
            ? 'Le fournisseur n’est pas dans la liste ? Chercher dans Odoo'
            : 'Le client n’est pas dans la liste ? Chercher dans Odoo'}
        </button>
      ) : (
        <div className="rounded border border-primary/30 bg-primary/5 p-1.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              className="h-7 flex-1 text-[11px]"
              placeholder="Raison sociale, ville, courriel ou n° TVA…"
              value={odooTerme}
              onChange={e => setOdooTerme(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); chercherPartenaireOdoo(); } }}
            />
            <Button
              type="button" size="sm" className="h-7 text-[11px]"
              disabled={odooEnCours} onClick={() => chercherPartenaireOdoo()}
            >
              {odooEnCours ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Chercher'}
            </Button>
            <Button
              type="button" size="sm" variant="ghost" className="h-7 text-[11px]"
              onClick={() => { setOdooCible(null); setOdooResultats(null); }}
            >
              Annuler
            </Button>
          </div>

          {odooResultats?.length ? (
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {odooResultats.map(p => (
                <button
                  type="button"
                  key={p.id}
                  className="flex w-full flex-col items-start rounded px-1.5 py-1 text-left text-[11px] hover:bg-primary/10"
                  onClick={() => cible === 'fournisseur'
                    ? importerFournisseurOdoo(p)
                    : importerClientOdoo(p)}
                >
                  <span className="font-medium">
                    {p.nom}
                    {!p.estSociete && p.societeMere && (
                      <span className="font-normal text-muted-foreground"> — {p.societeMere}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {[p.codePostal, p.ville, p.email].filter(Boolean).join(' · ') || 'aucune coordonnée'}
                  </span>
                  {p.contrat && (
                    <span className="text-primary">Contrat cadre : {p.contrat}</span>
                  )}
                </button>
              ))}
            </div>
          ) : odooResultats ? (
            <p className="text-[11px] text-muted-foreground">Aucune fiche trouvée.</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              La fiche retenue sera recopiée dans MonCRM.
            </p>
          )}
        </div>
      )}
    </div>
  );

  const [nomAgglo, setNomAgglo] = useState<Record<string, string>>({});
  /* Hauteur de composition du panneau d'agglomération : 100 mm jusqu'à
     70 km/h, 125 mm à 80. Le client ne donne jamais la vitesse, donc on part
     du cas défavorable et on laisse corriger. Clé « d<indice> ». */
  const [hcAgglo, setHcAgglo] = useState<Record<string, number>>({});
  /* Mention de commune portée sous le nom, quand la commune diffère de
     l'agglomération : « MOULIGNON » puis « c°ne de QUINCY-VOISINS ». */
  const [mentionAgglo, setMentionAgglo] = useState<Record<string, string>>({});
  /* ── état des lignes reconnues comme SYSTÈME ──────────────────────────────
     Une demande de résine nomme une mise en œuvre, pas un article : « SYSTEME
     FLOWSHIELD COMFORT 3MM · 30 ». Aucun article ne porte ce nom, et le
     rapprochement par le libellé retenait un SYSTÈME D'ACCROCHE à 0,70 €.
     Ces trois états portent ce que l'utilisateur peut corriger : la variante
     quand l'épaisseur ne suffit pas à trancher, la surface, et les composants
     facultatifs — un primaire au choix, une finition en option. */
  /* LE LIBELLÉ DE LA DEMANDE, CORRIGÉ À LA MAIN.
   *
   * « système Flowshield confort 100 m² » : une lettre de trop et le système
   * n'est pas reconnu ; une épaisseur oubliée et la variante reste à choisir.
   * Le texte du client n'est pas toujours celui qu'il fallait écrire, et
   * refaire l'analyse pour un mot est cher. On le rend donc modifiable, et
   * tout ce qui en dépend suit : reconnaissance du système, rapprochement
   * d'article, recherche Odoo, et le libellé porté au devis. */
  const [libelleManuel, setLibelleManuel] = useState<Record<number, string>>({});
  /** Identifiant de la variante retenue à la main. Clé : indice de ligne. */
  const [varianteSysteme, setVarianteSysteme] = useState<Record<number, string>>({});
  /** Surface corrigée à la main, en m². Clé : indice de ligne. */
  const [surfaceSysteme, setSurfaceSysteme] = useState<Record<number, number>>({});
  /** Composants facultatifs cochés. Clé : « <indice>:<id du composant> ». */
  const [optionsSysteme, setOptionsSysteme] = useState<Record<string, boolean>>({});

  /* ── Devis fournisseur : reprise des prix d'achat ──────────────────────── */
  /** Fournisseur auquel rattacher l'offre. */
  const [dfFournisseurId, setDfFournisseurId] = useState('');
  /** Prix d'achat corrigé à la main. Clé : indice de ligne. */
  const [dfPrix, setDfPrix] = useState<Record<number, number>>({});
  /** Lignes dont le prix ira sur la FICHE FOURNISSEUR du produit. */
  const [dfVersLien, setDfVersLien] = useState<Record<number, boolean>>({});
  /** Lignes dont le prix ira aussi sur le PRIX D'ACHAT de la fiche article. */
  const [dfVersArticle, setDfVersArticle] = useState<Record<number, boolean>>({});
  /** Lignes hors catalogue dont on veut créer l'article. */
  const [dfCreer, setDfCreer] = useState<Record<number, boolean>>({});
  const [dfEnCours, setDfEnCours] = useState(false);
  /** Nom déjà cherché chez Odoo : l'effet se rejoue, pas la requête. */
  const chercheFaitePour = useRef<string | null>(null);
  const { enregistrer: enregistrerDevisFournisseur } = useDevisFournisseur();

  const { systemes } = useSystemes();
  const { regles } = useReglesAccompagnement();
  /** Contrat cadre Odoo du client retenu, la société qui le porte, et ses prix. */
const [contratOdoo, setContratOdoo] = useState<
    { contrat: string; societe: string; prix: Record<string, number>;
      /** Tarif catalogue ISOMARK, quand la fonction sait le lire. */
      isomark?: Record<string, number>;
      /** `societe` ci-dessus est en fait le nom d'un simple contact Odoo
       *  (souvent une adresse de livraison mal rattachée) : à vérifier/corriger
       *  dans Odoo plutôt qu'à prendre pour une vraie société cliente. */
      societeIncertaine?: boolean;
      /** Intitulé du CONTRAT-CADRE Odoo — « CCI10019 TARIF R4 … ». À ne pas
       *  confondre avec `contrat` ci-dessus, qui est la LISTE DE PRIX. */
      cadre?: string;
      /** Un contrat-cadre exploitable a-t-il été trouvé pour ce client ? */
      cadreActif?: boolean;
      /** Niveau dont la grille a réellement tarifé — R1 à R4. */
      niveauApplique?: string;
      /** Ce niveau a-t-il servi de repli, faute de contrat rattaché ? */
      niveauParDefaut?: boolean } | null
  >(null);
  /* Client trouvé dans Odoo alors qu'il n'existe pas encore dans MonCRM.
     Le Chiffrage crée la fiche à la volée : ressaisir des coordonnées qu'Odoo
     détient déjà est une perte de temps, et une source d'écarts entre les deux
     bases. */
  const [clientOdoo, setClientOdoo] = useState<{
    nom: string; email: string; telephone: string;
    adresse: string; codePostal: string; ville: string; societe: string;
  } | null>(null);
  const [creerDevisClientId, setCreerDevisClientId] = useState('');
  const [creerDevisNumero, setCreerDevisNumero] = useState('');
  const [creerDevisDate, setCreerDevisDate] = useState('');
  const [creerDevisValidite, setCreerDevisValidite] = useState('');
  const [creerDevisRefAffaire, setCreerDevisRefAffaire] = useState('');
  const [creerDevisNotes, setCreerDevisNotes] = useState('');

  const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  const openrouterKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;

  /* ── helpers ── */
  const isFournisseurDoc = (t?: TypeDocument) =>
    t === 'commande_fournisseur' || t === 'bon_livraison' || t === 'facture_fournisseur';
  /* Un devis fournisseur ne se réceptionne pas : il n'y a pas de marchandise.
     Il vaut par ses PRIX, et suit donc son propre chemin. */
  const isDevisFourn = (t?: TypeDocument) => t === 'devis_fournisseur';

  /**
   * Le nom du fournisseur lu sur un devis fournisseur.
   *
   * NOTRE PROPRE SOCIÉTÉ N'EST JAMAIS LE FOURNISSEUR. Sur un devis reçu,
   * ISOSIGN figure en destinataire, souvent en gros et plusieurs fois ; il
   * arrive que l'extraction la retienne comme partenaire. La proposer
   * ensuite comme fournisseur enverrait chercher ISOSIGN dans Odoo, et
   * finirait par créer un fournisseur « ISOSIGN » dans notre propre liste.
   */
  const nomDuFournisseur = (r: DocumentAnalysis): string | undefined => {
    const nom = (r.nomPartenaire || '').trim();
    if (!nom || /\bisosign\b/i.test(nom)) return undefined;
    return nom;
  };
  const isClientDoc = (t?: TypeDocument) =>
    t === 'commande_client' || t === 'devis_client' || t === 'facture_client'
    // Une demande de devis reçue par courriel mène au même endroit : un devis.
    || t === 'demande_devis';

  /* ── pré-remplissage formulaire CF ── */
  useEffect(() => {
    if (!result || matchedCF || !isFournisseurDoc(result.typeDocument)) return;
    const year = new Date().getFullYear();
    const nextNum = String(commandesFournisseur.length + 1).padStart(3, '0');
    // Même précaution que côté client : une raison sociale vide ne doit pas
    // se retrouver rapprochée de n'importe quel document.
    const assezLongF = (v?: string) => !!v && v.trim().length >= 4;
    const foundFourn = result.nomPartenaire && assezLongF(result.nomPartenaire)
      ? fournisseurs.find(f =>
          (assezLongF(f.societe) && f.societe!.toLowerCase().includes(result.nomPartenaire!.toLowerCase())) ||
          (assezLongF(f.societe) && result.nomPartenaire!.toLowerCase().includes(f.societe!.toLowerCase())))
      : undefined;
    setCreerCFFournisseurId(foundFourn?.id ?? '');
    setCreerCFNumero(result.numeroDocument || `CF-${year}-${nextNum}`);
    setCreerCFDateReception(result.dateDocument || today());
    setCreerCFDateLivraison(result.dateLivraisonPrevue || '');
    setCreerCFNotes(result.referencePartenaire ? `Réf. fournisseur : ${result.referencePartenaire}` : '');
  }, [result, matchedCF]);

  /* ── pré-remplissage devis fournisseur ──────────────────────────────────
   *
   * Les cases sont cochées d'office là où l'intention ne fait pas de doute :
   * la fiche fournisseur, qui n'est que le prix de CE fournisseur pour CET
   * article. La fiche article, elle, commande toutes les marges de
   * l'application — elle reste décochée, à cocher en connaissance de cause. */
  useEffect(() => {
    if (!result || !isDevisFourn(result.typeDocument)) return;
    const nom = nomDuFournisseur(result);
    const trouve = rapprocherFournisseur(nom, fournisseurs);
    setDfFournisseurId(prev => prev || trouve?.id || '');
    /* PAS RECONNU : ON VA VOIR CHEZ ODOO, SANS ATTENDRE QU'ON LE DEMANDE.
       Le fichier partenaires en sait plus que notre liste de fournisseurs —
       AFC COMMUNICATION peut n'avoir jamais été saisie ici tout en y ayant
       sa fiche. Une recherche par analyse, au moment précis où elle sert. */
    if (!trouve && nom && chercheFaitePour.current !== nom) {
      chercheFaitePour.current = nom;
      setOdooTerme(nom);
      setOdooCible('fournisseur');
      void chercherPartenaireOdoo(nom);
    }
  }, [result, fournisseurs, chercherPartenaireOdoo]);

  /* ── pré-remplissage formulaire CC / Devis ── */
  useEffect(() => {
    if (!result || !isClientDoc(result.typeDocument)) return;
    const year = new Date().getFullYear();
    /* Rapprochement du client.
     *
     * L'adresse de l'expéditeur d'abord : elle désigne une personne et une
     * agence, sans ambiguïté. Le nom ensuite, mais seulement s'il est
     * suffisamment long — « contient » sur une chaîne vide est TOUJOURS vrai,
     * et un client dont le champ « nom » est vide raflait toutes les analyses.
     * C'est ainsi que REFLEX SIGNALISATION s'est retrouvé sur un devis AGILIS,
     * avec son contrat cadre et ses prix.
     */
    const indicesTexte = extraireIndices(analyseTexteRef.current || '');
    const assezLong = (v?: string) => !!v && v.trim().length >= 4;
    const contient = (a?: string, b?: string) =>
      assezLong(a) && assezLong(b) && a!.toLowerCase().includes(b!.toLowerCase());

    /* Le domaine de l'expéditeur désigne la société bien plus sûrement que ce
       que le modèle retient du corps du message : sur une demande signée
       « Manue », c'est ce prénom qui ressortait comme nom de client. On essaie
       donc, dans l'ordre : l'adresse exacte, puis le domaine, et seulement
       ensuite le nom deviné. */
    const sig = signature;
    // La signature en image, quand elle a été lue, prime sur tout : elle porte
    // la raison sociale écrite par le client lui-même.
    const societeMail = sig?.societe
      || societeDepuisEmail(sig?.email || indicesTexte.emails[0]);
    const domainesTexte = [sig?.email, ...indicesTexte.emails]
      .filter(Boolean)
      .map(e => e!.toLowerCase().split('@')[1])
      .filter(Boolean);

    const foundClient =
      clients.find(c => assezLong(c.email)
        && indicesTexte.emails.includes(c.email!.toLowerCase()))
      || clients.find(c => assezLong(c.email)
        && domainesTexte.includes(c.email!.toLowerCase().split('@')[1]))
      || (societeMail
        ? clients.find(c => contient(c.societe, societeMail)
                         || contient(c.nom, societeMail))
        : undefined)
      || (result.nomPartenaire
        ? clients.find(c =>
            contient(c.nom, result.nomPartenaire) ||
            contient(c.societe, result.nomPartenaire) ||
            contient(result.nomPartenaire, c.nom) ||
            contient(result.nomPartenaire, c.societe))
        : undefined);

    /* Une proposition ne doit jamais écraser une décision.
     *
     * Cet effet se rejoue quand la lecture de la signature arrive, plusieurs
     * secondes après l'analyse du texte. Il remettait alors le client déduit,
     * effaçant celui qu'on venait de désigner à la main. On ne renseigne donc
     * que ce qui est encore vide. */
    const garder = (actuel: string, propose?: string) => actuel || propose || '';

    if (result.typeDocument === 'devis_client' || result.typeDocument === 'demande_devis') {
      const nextNum = String(devis.length + 1).padStart(3, '0');
      setCreerDevisClientId(prev => garder(prev, foundClient?.id));
      setCreerDevisNumero(result.numeroDocument || `DEV-${year}-${nextNum}`);
      setCreerDevisDate(result.dateDocument || today());
      setCreerDevisValidite(result.dateLivraisonPrevue || '');
      setCreerDevisRefAffaire(result.referencePartenaire || '');
      setCreerDevisNotes(result.notes || '');
    } else {
      const nextNum = String(commandesFournisseur.length + 1).padStart(3, '0');
      setCreerCCClientId(prev => garder(prev, foundClient?.id));
      setCreerCCNumero(result.numeroDocument || `CC-${year}-${nextNum}`);
      setCreerCCDate(result.dateDocument || today());
      setCreerCCDateLivraison(result.dateLivraisonPrevue || '');
      setCreerCCNotes(result.notes || result.referencePartenaire || '');
    }
    // `signature` en dépendance : la lecture de l'image arrive après l'analyse
    // du texte, et doit pouvoir corriger le client déjà choisi.
  }, [result, signature]);

  /* ── cœur de l'analyse (données en paramètre pour appel immédiat après drop) ── */
  const lancerAnalyse = useCallback(async (
    pdfFile: File | null,
    texteCtx: string,
    pdfsCtx: { name: string; buffer: ArrayBuffer }[]
  ) => {
    if (!apiKey) { toast.error('Clé API Groq manquante (VITE_GROQ_API_KEY)'); return; }
    setLoading(true); setResult(null); setMatchedCF(null); setShowCreerCF(false); setShowCreerCC(false);
    /* Une nouvelle analyse repart d'une page blanche. Nécessaire depuis que le
       pré-remplissage ne réécrit plus ce qui est déjà renseigné : sans cela, le
       client et le contact du document précédent resteraient en place. */
    setCreerDevisClientId(''); setCreerCCClientId('');
    setContactsOdoo([]); setContactRetenu('');
    setChoixProduit({}); setChoixOdoo({}); setRefusOdoo(new Set());
    setQuantiteManuelle({}); setPrixManuel({});
    setVarianteSysteme({}); setSurfaceSysteme({}); setOptionsSysteme({});
    setLibelleManuel({});
    setNomAgglo({}); setDptLivraison(''); setNiveauForce('');
    setContratOdoo(null); setClientOdoo(null); setTrouvaillesOdoo({}); setFichesOdoo({});
    setOdooMuet(null);
    setDfFournisseurId(''); setDfPrix({});
    setDfVersLien({}); setDfVersArticle({}); setDfCreer({});
    dfTouche.current = false;
    chercheFaitePour.current = null;
    setOdooCible(null); setOdooResultats(null); setOdooTerme('');
    try {
      let analysis: DocumentAnalysis;
      if (pdfFile) {
        const texteSuppl = pdfsCtx.length > 0 && texteCtx.trim() ? texteCtx : undefined;
        if (texteCtx.trim()) analyseTexteRef.current = texteCtx;
        analysis = await analyserDocument({ type: 'pdf', buffer: await pdfFile.arrayBuffer(), texteSupplementaire: texteSuppl }, apiKey, geminiKey, openrouterKey);
      } else if (texteCtx.trim()) {
        // Décoder le MIME côté client si c'est un email brut collé
        let texteAnalyse = texteCtx;
        const isMime = texteCtx.includes('Content-Type:') && texteCtx.includes('boundary=');
        if (isMime) {
          try {
            const emlFile = new File([texteCtx], 'email.eml', { type: 'message/rfc822' });
            const parsed = await parseEml(emlFile);
            if (parsed.contact) emlContactRef.current = parsed.contact;
            if (parsed.texte && parsed.texte.trim().length > 30) {
              const fromLine = texteCtx.match(/^From:\s*.+/mi)?.[0] ?? '';
              const subjLine = texteCtx.match(/^Subject:\s*.+/mi)?.[0] ?? '';
              const prefix = [fromLine, subjLine].filter(Boolean).join('\n');
              texteAnalyse = (prefix ? prefix + '\n\n' : '') + parsed.texte;
            }
          } catch { /* garder texte brut */ }
        }
        analyseTexteRef.current = texteAnalyse;
        analysis = await analyserDocument({ type: 'text', texte: texteAnalyse }, apiKey, geminiKey, openrouterKey);
      } else {
        toast.error('Glissez un PDF ou collez du texte'); return;
      }
      setResult(analysis);
      if (isFournisseurDoc(analysis.typeDocument) && analysis.numeroDocument) {
        const match = commandesFournisseur.find(cf =>
          cf.numero.toLowerCase().includes(analysis.numeroDocument!.toLowerCase()) ||
          analysis.numeroDocument!.toLowerCase().includes(cf.numero.toLowerCase())
        );
        if (match) { setMatchedCF(match); toast.success(`Commande trouvée : ${match.numero}`); }
        else toast.info('Aucune commande correspondante — vous pouvez la créer');
      } else {
        toast.success(`Document analysé : ${TYPE_LABELS[analysis.typeDocument]?.label}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'analyse');
    } finally {
      setLoading(false);
    }
  }, [apiKey, commandesFournisseur]);

  /* ── traitement des fichiers pré-chargés depuis le dashboard ── */
  useEffect(() => {
    if (!open || !initialFiles || initialFiles.length === 0) return;
    processFiles(initialFiles);
  }, [open, initialFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── traitement du texte pré-chargé depuis le dashboard ── */
  useEffect(() => {
    if (!open || !initialText || !initialText.trim()) return;
    setTexte(initialText);
    lancerAnalyse(null, initialText, []);
  }, [open, initialText]); // eslint-disable-line react-hooks/exhaustive-deps


  /** Traitement commun fichiers (drop interne ou depuis dashboard) */
  const processFiles = useCallback(async (files: File[]) => {
    const isExcel = (f: File) => /\.(xlsx|xls|csv|ods)$/i.test(f.name) ||
      ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.ms-excel', 'text/csv', 'application/vnd.oasis.opendocument.spreadsheet'].includes(f.type);

    const pdfFiles  = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    const emlFiles  = files.filter(f => f.name.toLowerCase().endsWith('.eml') || f.type === 'message/rfc822');
    const msgFiles  = files.filter(f => f.name.toLowerCase().endsWith('.msg'));
    const xlsxFiles = files.filter(isExcel);

    const allPdfBuffers: { name: string; buffer: ArrayBuffer }[] = [];
    let emailTexte = '';

    /* Beaucoup de signatures professionnelles sont une image : le nom, la
       fonction et les téléphones n'existent nulle part dans le texte. Sur la
       demande de REFLEX SIGNALISATION, tout le bloc de Thierry BARAILLER était
       dans un PNG, et l'analyse retenait « Manue », le prénom de la
       destinataire lu dans le corps du message. On fait donc lire les images
       du message, en parallèle du reste. */
    setSignature(null);
    void (async () => {
      for (const f of [...emlFiles, ...msgFiles]) {
        try {
          const images = await extraireImages(f);
          const c = await lireSignature(images, geminiKey);
          if (c) { setSignature(c); break; }
        } catch { /* la signature reste facultative */ }
      }
    })();

    for (const f of emlFiles) {
      try {
        const eml = await parseEml(f);
        if (eml.texte) emailTexte += (emailTexte ? '\n\n' : '') + eml.texte;
        allPdfBuffers.push(...eml.pdfBuffers);
        if (eml.contact) emlContactRef.current = eml.contact;
      } catch { /* ignore */ }
    }
    for (const f of msgFiles) {
      try {
        const { extraireTexteDeMsg } = await import('@/lib/parseMsgPdf');
        const msgTxt = await extraireTexteDeMsg(f);
        if (msgTxt) emailTexte += (emailTexte ? '\n\n' : '') + msgTxt;
        const pjs = await extrairePJsDeMsg(f);
        // PDF → pile normale
        allPdfBuffers.push(...pjs.filter(p => p.type === 'pdf'));
        // Excel embarqué → extraire le texte tabulaire directement
        for (const xls of pjs.filter(p => p.type === 'xlsx')) {
          try {
            const xlFile = new File([xls.buffer], xls.name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const parsed = await parseExcel(xlFile);
            console.log('[msg→xlsx]', xls.name, '→ chars:', parsed.texte.length);
            if (parsed.texte) {
              // Excel prioritaire : analyser directement
              setTexte(parsed.texte); setFichier(null); setEmlPdfs([]);
              lancerAnalyse(null, parsed.texte, []);
              return;
            }
          } catch (err) {
            console.error('[msg→xlsx] erreur:', err);
          }
        }
      } catch (err) {
        console.error('[parseMsgPdf] erreur:', err);
      }
    }
    for (const f of pdfFiles) {
      allPdfBuffers.push({ name: f.name, buffer: await f.arrayBuffer() });
    }
    if (xlsxFiles.length > 0) {
      let xlTexte = '';
      for (const f of xlsxFiles) {
        try {
          const xls = await parseExcel(f);
          console.log('[parseExcel]', f.name, '→ feuilles:', xls.feuilles, 'chars:', xls.texte.length);
          if (xls.texte) xlTexte += (xlTexte ? '\n\n' : '') + xls.texte;
        } catch (err) {
          console.error('[parseExcel] erreur:', err);
          toast.error(`Impossible de lire ${f.name} : ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (xlTexte) {
        setTexte(xlTexte);
        setFichier(null); setEmlPdfs([]);
        lancerAnalyse(null, xlTexte, []);
        return;
      } else if (xlsxFiles.length > 0) {
        toast.error('Le fichier Excel semble vide ou illisible');
        return;
      }
    }
    /* Même traitement que le Chiffrage : la signature est retirée avant
       l'analyse. Elle est pleine de nombres — téléphone, code postal, numéro
       de TVA — que l'IA prend volontiers pour des quantités. Le corps du
       message conserve, lui, l'agence de livraison quand elle y est citée. */
    if (emailTexte) emailTexte = coupeSignature(emailTexte);

    if (allPdfBuffers.length > 0) {
      if (emailTexte) setTexte(emailTexte);
      setEmlPdfs(allPdfBuffers);
      const blob = new Blob([allPdfBuffers[0].buffer], { type: 'application/pdf' });
      const firstFile = new File([blob], allPdfBuffers[0].name, { type: 'application/pdf' });
      setFichier(firstFile);
      lancerAnalyse(firstFile, emailTexte, allPdfBuffers);
    } else if (emailTexte) {
      setTexte(emailTexte);
      lancerAnalyse(null, emailTexte, []);
    } else if (files.length > 0) {
      toast.error('Format non reconnu — utilisez PDF, Excel (.xlsx), email (.eml/.msg)');
    }
  }, [lancerAnalyse]);

  /* ── drag & drop ── */
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) {
      // Texte glissé directement (sélection dans mail)
      const txtPlain = e.dataTransfer.getData('text/plain');
      const txtHtml  = e.dataTransfer.getData('text/html');
      if (txtPlain) { setTexte(txtPlain); lancerAnalyse(null, txtPlain, []); return; }
      if (txtHtml) {
        const div = document.createElement('div');
        div.innerHTML = txtHtml;
        const t = (div.innerText || div.textContent || '').trim();
        if (t) { setTexte(t); lancerAnalyse(null, t, []); return; }
      }
      toast.error('Rien à importer'); return;
    }
    await processFiles(files);
  }, [lancerAnalyse, processFiles]);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(false); }, []);

  function reset() {
    setTexte(''); setFichier(null); setEmlPdfs([]); setResult(null); setMatchedCF(null); setDragging(false);
    setReceptionOpen(false); setShowCreerCF(false); setShowCreerCC(false);
    setExtractingContact(false); setContactToSave(null);
    setCreerCFFournisseurId(''); setCreerCFNumero(''); setCreerCFDateReception('');
    setCreerCFDateLivraison(''); setCreerCFNotes('');
    setCreerCCClientId(''); setCreerCCNumero(''); setCreerCCDate('');
    setCreerCCDateLivraison(''); setCreerCCNotes('');
    setShowCreerDevis(false);
    setCreerDevisClientId(''); setCreerDevisNumero(''); setCreerDevisDate('');
    setCreerDevisValidite(''); setCreerDevisRefAffaire(''); setCreerDevisNotes('');
    setApercu(null);
  }

  /* ── aperçu du PDF ─────────────────────────────────────────────────────────
     Permet de relire le document pendant qu'on corrige le type / les champs. */
  const estPdf = (f: File | null) =>
    !!f && (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));

  // Libère l'URL objet dès qu'elle change (et à la fermeture du dialog).
  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu.url); }, [apercu]);
  // Un nouveau fichier importé ⇒ on ferme l'aperçu précédent (sinon il montrerait
  // encore l'ancien document pendant la correction).
  useEffect(() => { setApercu(null); }, [fichier]);

  function ouvrirApercu(source: File | ArrayBuffer, name: string) {
    const blob = source instanceof File ? source : new Blob([source], { type: 'application/pdf' });
    setApercu({ name, url: URL.createObjectURL(blob) });
  }
  function basculerApercu(source: File | ArrayBuffer, name: string) {
    if (apercu && apercu.name === name) setApercu(null);
    else ouvrirApercu(source, name);
  }

  /* ── analyse manuelle (bouton) → délègue à lancerAnalyse avec le state courant ── */
  function handleAnalyse() {
    lancerAnalyse(fichier, texte, emlPdfs);
  }

  /* ── réception commande fournisseur existante ── */
  function handleReception(data: { dateReception: string; dateLivraisonClientPrevue: string; dateEcheance: string; lignesRecues: LigneReception[] }) {
    if (!matchedCF) return;
    updateCommandesFournisseur(prev =>
      prev.map(cf => cf.id === matchedCF.id ? { ...cf, statut: 'recue' as const, ...data } : cf)
    );
    setReceptionOpen(false);
    toast.success('Réception enregistrée');
    onOpenChange(false);
  }

  /* ── créer nouvelle commande fournisseur reçue ── */
  function handleCreerCF() {
    if (!creerCFFournisseurId) { toast.error('Veuillez sélectionner un fournisseur'); return; }
    if (!creerCFNumero.trim()) { toast.error('Veuillez saisir un numéro de commande'); return; }
    if (!creerCFDateReception) { toast.error('Veuillez saisir la date de réception'); return; }
    const fourn = fournisseurs.find(f => f.id === creerCFFournisseurId);
    const dateEch = formatDateISO(calculerDateEcheance(creerCFDateReception, fourn?.delaiReglement || '45j FDM'));
    const lignes = (result?.lignes ?? []).map(l => {
      const p = produits.find(p => p.reference?.toLowerCase() === l.reference?.toLowerCase());
      const id = p?.id ?? generateId();
      return { produitId: id, description: l.description || '', reference: l.reference || '', quantite: l.quantite, prixAchat: p?.prixAchat ?? l.prixUnitaireHT ?? 0, total: (p?.prixAchat ?? l.prixUnitaireHT ?? 0) * l.quantite };
    });
    const totalHT = result?.totalHT ?? lignes.reduce((s, l) => s + l.total, 0);
    const nouvelleCommande: CommandeFournisseur = {
      id: generateId(), fournisseurId: creerCFFournisseurId, numero: creerCFNumero.trim(),
      dateCreation: creerCFDateReception, statut: 'recue', lignes, totalHT, fraisTransport: 0, totalTTC: result?.totalTTC ?? totalHT,
      notes: creerCFNotes || undefined, dateReception: creerCFDateReception,
      dateLivraisonClientPrevue: creerCFDateLivraison || undefined, dateEcheance: dateEch,
      lignesRecues: lignes.map(l => ({ produitId: l.produitId, description: l.description, reference: l.reference, quantiteCommandee: l.quantite, quantiteRecue: l.quantite })),
    };
    updateCommandesFournisseur(prev => [nouvelleCommande, ...prev]);
    toast.success(`Commande ${creerCFNumero} créée et réceptionnée`);
    onOpenChange(false);
  }

  /* ── créer commande client ── */
  /**
   * Applique les prix d'achat lus sur un devis fournisseur.
   *
   * Trois écritures, et un enregistrement.
   *
   * — La FICHE FOURNISSEUR (`produit_fournisseurs`) reçoit le prix de ce
   *   fournisseur pour cet article, avec la référence sous laquelle il le
   *   vend : c'est elle qui permettra de le retrouver la prochaine fois sans
   *   deviner.
   * — La FICHE ARTICLE ne bouge que si la case est cochée. Son `prixAchat`
   *   commande toutes les marges de l'application ; le déclencheur
   *   `trg_noter_prix` en garde d'ailleurs l'historique, visible dans l'onglet
   *   « Prix ». On date le changement pour que la synchronisation Odoo ne le
   *   défasse pas au prochain passage.
   * — Un ARTICLE ABSENT n'est créé que sur demande, et son prix de vente n'est
   *   proposé que si le catalogue fournit un coefficient fiable pour sa
   *   famille. Sinon il reste à zéro : un prix de vente vide saute aux yeux au
   *   premier devis, un prix plausible et faux part chez le client.
   *
   * L'offre elle-même est enregistrée dans tous les cas, appliquée ou non.
   * C'est ce qui manquait : un tarif reçu et non répercuté ne se voyait nulle
   * part.
   */
  async function handleAppliquerPrixAchat() {
    if (!result) return;
    if (!dfFournisseurId) { toast.error('Choisissez le fournisseur'); return; }
    setDfEnCours(true);

    const horodate = new Date().toISOString();
    const nouveauxArticles: Produit[] = [];
    const cibles: CibleEcriture[] = [];
    const lignesDevis: DevisFournisseur['lignes'] = [];
    const devisId = generateId();

    (result.lignes || []).forEach((l, i) => {
      const prop = propositionsFournisseur.get(i);
      const prix = dfPrixDeLigne(i);
      const refFournisseur = (l.reference || '').trim();
      let produitId = prop?.produit?.id;

      /* Article absent qu'on demande à créer. */
      if (prop?.action === 'absent' && dfCreer[i] && prix != null) {
        const neuf: Produit = {
          id: generateId(),
          reference: refFournisseur || (l.description || '').slice(0, 40) || 'NOUVEAU',
          description: l.description || '',
          prixAchat: prix, coefficient: 1,
          /* Sans coefficient fiable, pas de prix de vente inventé. */
          prixHT: prixVenteDepuisAchat(prix, prop.coefficient) ?? 0,
          coeffRevendeur: 1, remiseRevendeur: 0, prixRevendeur: 0,
          tva: l.tva ?? 20, unite: 'u', stock: 0, stockMin: 0,
          prixAchatMaj: horodate,
          dateCreation: today(),
        };
        nouveauxArticles.push(neuf);
        produitId = neuf.id;
      }

      if (produitId && prix != null && (dfVersLien[i] || dfVersArticle[i])) {
        cibles.push({
          produitId, prix, reference: refFournisseur,
          versLien: !!dfVersLien[i], versArticle: !!dfVersArticle[i],
        });
      }

      lignesDevis.push({
        id: generateId(),
        devisId,
        ordre: i,
        reference: refFournisseur || undefined,
        designation: l.description || undefined,
        quantite: l.quantite,
        prixAchat: prix,
        produitId,
        action: prop?.action,
        applique: !!(produitId && prix != null && (dfVersLien[i] || dfVersArticle[i])),
        appliqueLe: (dfVersLien[i] || dfVersArticle[i]) ? horodate : undefined,
      });
    });

    /* Les articles d'abord : un lien fournisseur qui pointe vers un produit
       pas encore écrit serait orphelin. */
    if (nouveauxArticles.length || cibles.some(c => c.versArticle)) {
      updateProduits(prev => [
        ...nouveauxArticles,
        ...appliquerPrix({
          cibles, fournisseurId: dfFournisseurId, liens: produitFournisseurs,
          produits: prev, horodate, nouvelId: generateId,
        }).produits,
      ]);
    }

    if (cibles.some(c => c.versLien)) {
      updateProduitFournisseurs(prev => appliquerPrix({
        cibles, fournisseurId: dfFournisseurId, liens: prev,
        produits: [], horodate, nouvelId: generateId,
      }).liens);
    }

    const fournisseur = fournisseurs.find(f => f.id === dfFournisseurId);
    const appliquees = lignesDevis.filter(l => l.applique).length;

    const erreur = await enregistrerDevisFournisseur({
      id: devisId,
      fournisseurId: dfFournisseurId,
      fournisseurNom: result.nomPartenaire || fournisseur?.nom,
      numero: result.numeroDocument,
      dateDocument: result.dateDocument,
      reference: result.referencePartenaire,
      totalHT: result.totalHT,
      devise: 'EUR',
      statut: appliquees ? 'applique' : 'recu',
      notes: result.notes,
      sourceFichier: fichier?.name,
      createdAt: horodate,
      lignes: lignesDevis,
    }, analyseTexteRef.current);

    setDfEnCours(false);

    if (erreur) {
      /* Les prix sont écrits, le devis non : le dire plutôt que d'afficher un
         succès qui laisserait croire que tout est en place. */
      toast.error(`Prix appliqués, mais le devis fournisseur n'a pas pu être enregistré : ${erreur}`);
      return;
    }

    const quoi = [
      appliquees ? `${appliquees} prix appliqué${appliquees > 1 ? 's' : ''}` : null,
      nouveauxArticles.length ? `${nouveauxArticles.length} article${nouveauxArticles.length > 1 ? 's' : ''} créé${nouveauxArticles.length > 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(', ');
    toast.success(quoi ? `Devis fournisseur enregistré — ${quoi}` : 'Devis fournisseur enregistré');
    onOpenChange(false);
  }

  function handleCreerCC() {
    if (!creerCCClientId) { toast.error('Veuillez sélectionner un client'); return; }
    if (!creerCCNumero.trim()) { toast.error('Veuillez saisir un numéro'); return; }
    if (!creerCCDate) { toast.error('Veuillez saisir la date'); return; }
    const lignes = (result?.lignes ?? []).map(l => {
      const p = produits.find(p => p.reference?.toLowerCase() === l.reference?.toLowerCase());
      return {
        id: generateId(), produitId: p?.id, description: l.description || p?.description || '',
        // « prixVente » n'existe pas sur Produit : le champ s'appelle prixHT.
        // La faute passait inaperçue — quand le document n'annonçait pas de
        // prix, la ligne partait à 0,00 € au lieu du tarif catalogue.
        quantite: l.quantite, unite: 'u', prixUnitaireHT: l.prixUnitaireHT ?? p?.prixHT ?? 0,
        tva: l.tva ?? 20, remise: 0,
      };
    });
    const totalHT = result?.totalHT ?? lignes.reduce((s, l) => s + l.quantite * l.prixUnitaireHT, 0);
    const totalTVA = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaireHT * l.tva / 100, 0);
    const nouvelleCC: CommandeClient = {
      id: generateId(), clientId: creerCCClientId, numero: creerCCNumero.trim(),
      dateCreation: creerCCDate, statut: 'a_traiter', lignes,
      totalHT, totalTVA, totalTTC: result?.totalTTC ?? totalHT + totalTVA, fraisPortHT: 0,
      dateLivraisonPrevue: creerCCDateLivraison || undefined,
      notes: creerCCNotes || undefined,
    };
    updateCommandesClient(prev => [nouvelleCC, ...prev]);
    toast.success(`Commande client ${creerCCNumero} créée`);
    onOpenChange(false);
  }

  /* ── créer devis depuis analyse ── */
  /**
   * Articles du catalogue susceptibles de correspondre à une ligne demandée.
   *
   * Un client écrit « J11 » ; le catalogue Odoo, lui, contient J11C2,
   * J11C2DOUILLE80, J11C2SANSDOUILLE et J11C2DROUGE. Prendre le premier venu
   * revient à choisir la variante à sa place — et une balise avec douille n'est
   * pas la même chose qu'une balise sans. On remonte donc tous les candidats,
   * du plus court au plus long : le plus court est le modèle de base.
   */
  /**
   * Rapprochement de chaque ligne demandée avec le catalogue.
   *
   * Calculé une fois par analyse : `rapprocherArticle` balaie les 22 634
   * articles, on ne le refait pas à chaque rendu ni à chaque ligne affichée.
   *
   * L'ancienne version ne lisait que le premier mot de la demande. « Support
   * Ø 60 mm long 3.50 m » se réduisait à « support », et la référence la plus
   * courte commençant par ce mot l'emportait — SUPPORTGB, un support de
   * glissière béton pour tube 40×40, chiffré au prix contrat de ce mauvais
   * article. Le 3,50 m et le 4,00 m recevaient le même.
   */
  /**
   * Lignes qui nomment un SYSTÈME plutôt qu'un article.
   *
   * « SYSTEME FLOWSHIELD COMFORT 3MM », quantité 30 : le catalogue n'a rien
   * de tel à vendre, et le rapprochement par le libellé retenait le seul
   * article contenant le mot « système » — un kit de deux crochets pour
   * panneau, à 0,70 €, multiplié par 30. Une résine se chiffre par ses
   * composants, chacun avec son dosage au m² et son conditionnement.
   */
  /**
   * Le texte d'une ligne demandée : celui que l'utilisateur a corrigé, sinon
   * celui du document.
   *
   * Un seul point de vérité — la détection, le rapprochement d'article et la
   * recherche Odoo doivent lire la même chose, faute de quoi on corrigerait
   * un libellé sans que le chiffrage bouge.
   */
  const texteDemande = useCallback((
    l: { reference?: string; description?: string },
    i: number,
  ) => libelleManuel[i]
    ?? [l.reference, l.description].filter(Boolean).join(' ').trim(),
  [libelleManuel]);

  const systemesDetectes = useMemo(() => {
    const m = new Map<number, RapprochementSysteme>();
    if (!systemes.length) return m;
    (result?.lignes || []).forEach((l, i) => {
      const r = rapprocherSysteme(texteDemande(l, i), systemes);
      if (r) m.set(i, r);
    });
    return m;
  }, [result, systemes, texteDemande]);

  const rapprochements = useMemo(() => {
    const m = new Map<number, ReturnType<typeof rapprocherArticle>>();
    (result?.lignes || []).forEach((l, i) => {
      /* Une ligne système ne cherche pas d'article : la balayer contre les
         22 634 références ne produirait qu'un faux candidat à écarter. */
      if (systemesDetectes.has(i)) return;
      m.set(i, rapprocherArticle(texteDemande(l, i), produits));
    });
    return m;
  }, [result, produits, systemesDetectes, texteDemande]);

  /** Variante retenue pour une ligne : le choix de l'utilisateur, sinon celle
      que l'épaisseur désigne. Rien tant que la variante reste à trancher. */
  const systemeDeLigne = useCallback((i: number): Systeme | undefined => {
    const rap = systemesDetectes.get(i);
    if (!rap) return undefined;
    const choisi = varianteSysteme[i];
    if (choisi) return rap.variantes.find(v => v.id === choisi);
    return rap.retenu;
  }, [systemesDetectes, varianteSysteme]);

  /** Surface chiffrée pour une ligne système, correction manuelle comprise. */
  const surfaceDeLigne = useCallback((i: number, quantite?: number | null) =>
    surfaceSysteme[i] ?? surfaceDeDemande(systemesDetectes.get(i), quantite),
  [surfaceSysteme, systemesDetectes]);

  /**
   * Le système d'une ligne, décliné sur sa surface.
   *
   * Le poids du contenant vient de l'article du catalogue : c'est lui qui
   * convertit 135 kg de résine en huit seaux de 19 kg. Un composant sans
   * article rattaché reste en kilogrammes — on ne devine pas un
   * conditionnement.
   */
  const lignesSystemeDe = useCallback((i: number, quantite?: number | null): LigneSysteme[] => {
    const sys = systemeDeLigne(i);
    if (!sys) return [];
    const retenus = new Set(
      sys.composants
        .filter(c => !c.obligatoire && optionsSysteme[`${i}:${c.id}`])
        .map(c => c.id),
    );
    return declinerSysteme(sys, surfaceDeLigne(i, quantite), {
      conditionnelsRetenus: retenus,
      poidsParProduit: (produitId) => {
        if (!produitId) return undefined;
        const p = produitParId(produits, produitId);
        return p?.poids && p.poids > 0 ? p.poids : undefined;
      },
    });
  }, [systemeDeLigne, surfaceDeLigne, optionsSysteme, produits]);

  /**
   * Quantité commandée pour un composant : des contenants entiers quand le
   * catalogue en donne le poids, des kilogrammes sinon.
   *
   * Un seul point de vérité — l'écran et le devis doivent afficher le même
   * nombre, faute de quoi on chiffre à l'écran et on commande autre chose.
   */
  const quantiteComposant = useCallback((i: number, ls: LigneSysteme) =>
    quantiteManuelle[`d${i}:${ls.composant.id}`]
      ?? ls.contenants
      ?? Math.round(ls.quantiteKg * 100) / 100,
  [quantiteManuelle]);

  const candidatsPour = useCallback(
    (i: number) => rapprochements.get(i)?.candidats ?? [],
    [rapprochements],
  );

  /**
   * Article retenu pour une ligne : le choix de l'utilisateur, sinon celui que
   * le rapprochement juge sûr. Quand il ne l'est pas, on ne retient rien : une
   * ligne vide se remarque, un mauvais article chiffré avec assurance non.
   */
  /**
   * Texte envoyé à Odoo pour une ligne, et clé des résultats reçus.
   *
   * Un panneau se décline en centaines de variantes : Odoo nomme la nôtre
   * « B14#30km/h.650.C2.BTR.IS.BRUT ». Chercher « B14 30 » ramène les premières
   * par ordre alphabétique — des 450, des 850 — et jamais celle qu'on veut. La
   * dimension et la classe figurent dans la référence : on les y ajoute, tirées
   * de la gamme et de la classe choisies à l'écran. C'est ce qui relie la
   * grille tarifaire au catalogue Odoo.
   *
   * Une seule fonction pour l'envoi et pour la lecture : deux calculs séparés
   * finiraient par diverger, et les résultats deviendraient introuvables.
   */
  /**
   * Panneau sous lequel se pose le panonceau de la ligne i.
   *
   * Un panonceau n'a pas de taille propre : elle se déduit de la gamme du
   * panneau qu'il accompagne. Les clients écrivent le panneau puis son
   * panonceau, on remonte donc les lignes précédentes jusqu'au premier
   * panneau véritable.
   */
  const porteurDeLigne = useCallback((i: number): string | null => {
    for (let k = i - 1; k >= 0; k--) {
      const lk = (result?.lignes ?? [])[k];
      const ck = codeDansTexte(
        [lk?.reference, lk?.description].filter(Boolean).join(' '));
      const fk = ck && formeDeCode(ck.code);
      if (fk && fk !== FORME_PANONCEAU) return ck!.code;
    }
    return null;
  }, [result]);

  /**
   * Niveau de remise appliqué : celui qu'on force, sinon celui du contrat,
   * sinon R4.
   *
   * Il était recalculé à six endroits par le même appel ; en forcer un seul
   * aurait laissé les cinq autres sur l'ancienne valeur. Un seul point de
   * vérité, dont tout le reste dépend.
   */
  const niveauRemise = useMemo(
    () => niveauForce || niveauDepuisContrat(contratOdoo?.contrat) || 'R4',
    [niveauForce, contratOdoo],
  );

  const texteRechercheOdoo = useCallback((
    l: { reference?: string; description?: string },
    i: number,
  ) => {
    const brut = texteDemande(l, i);
    const trouve = codeDansTexte(brut);
    /* La CLASSE part avec la demande même quand la ligne ne porte aucun code
       IISR reconnu.
       
       Elle n'était ajoutée que dans les branches ci-dessous, c'est-à-dire
       uniquement pour les codes que `codeDansTexte` sait lire — A, B, C, EB,
       M… La gamme temporaire n'en fait pas partie : « panneaux AK5 en
       1000 mm » ne rendait aucun code, donc aucune classe, et Odoo recevait
       une demande muette sur ce point. Il répondait alors avec les cinq
       variantes AK5 mélangées, C1 comme C2, et la première venue était
       retenue — un C1 à 41,31 € pour une demande de classe 2 à 56,84 €.
       
       Sur les lignes où la classe n'a aucun sens — un PLASTOBLOC, une bride —
       le mot ne correspond à rien : la recherche le lâche au relâchement, et
       le classement ne pénalise que les articles portant une classe
       DIFFÉRENTE, jamais ceux qui n'en portent pas. */
    if (!trouve) return `${brut} C${classePanneau}`;

    /* Un panneau d'agglomération est facturé comme un rectangle : le devis de
       référence porte « DR50.1300.400.C2… » pour ses EB10 et EB20. C'est donc
       la DIMENSION calculée qu'il faut envoyer chercher, pas le code EB, qui
       ne figure nulle part dans le catalogue Odoo. Sans le nom, on ne peut
       rien dimensionner : on s'en tient au texte brut. */
    const typeEB = typeAgglomeration(trouve.code);
    if (typeEB) {
      const cle = `d${i}`;
      const nom = nomAgglo[cle] ?? nomAgglomerationDansTexte(brut, trouve.code) ?? '';
      const p = nom.trim() ? dimensionnerAgglomerationAuto(nom, {
        type: typeEB,
        hc: hcAgglo[cle] ?? HC_AGGLO_DEFAUT,
        mention: mentionAgglo[cle],
      }) : null;
      return p ? `DR ${p.largeur} ${p.hauteur} C${classePanneau}` : brut;
    }

    const forme = formeDeCode(trouve.code);
    if (!forme) return brut;

    /* Un panonceau se dimensionne d'après le panneau qu'il accompagne : sous
       un A de gamme P, un M9z d'une ligne fait 700x200. Sans cette dimension,
       « M9z rappel » ramenait les M9Z de toutes les tailles — 350x150,
       1200x400… — et jamais celui du devis. La règle est la même que celle
       qui affiche le panonceau à l'écran : on la réutilise plutôt que de la
       réinventer, pour que l'article proposé soit celui qui est chiffré. */
    if (forme === FORME_PANONCEAU) {
      const porteur = porteurDeLigne(i);
      if (!porteur) return brut;
      const p = panonceauPour(trouve.code, porteur, {
        taille: gammePanneau, classe: classePanneau,
        niveau: niveauRemise,
        mention: l.description || '',
      });
      /* « 700x200 » → « 700 200 » : la recherche Odoo travaille par mots, et
         la référence les porte comme deux segments distincts. */
      const dims = p?.dimension.match(/\d+/g);
      if (!dims?.length) return brut;
      return `${brut} ${dims.join(' ')} C${classePanneau}`;
    }

    const pan = prixPanneau(trouve.code, {
      taille: gammePanneau, classe: classePanneau,
      niveau: niveauRemise,
    });
    const mm = pan?.dimension.match(/(\d+)/)?.[1];
    return `${brut}${mm ? ` ${mm}` : ''} C${classePanneau}`;
  }, [gammePanneau, classePanneau, contratOdoo, niveauRemise, porteurDeLigne, nomAgglo, hcAgglo, mentionAgglo,
      texteDemande]);

  const produitDeLigne = useCallback((i: number) => {
    const choisi = choixProduit[i];
    if (choisi) return produitParId(produits, choisi);
    return rapprochements.get(i)?.meilleur;
  }, [choixProduit, produits, rapprochements]);

  /* ── Devis fournisseur ─────────────────────────────────────────────────── */

  /**
   * L'article visé par une ligne de devis FOURNISSEUR.
   *
   * La référence portée sur le document est celle du fournisseur, pas la
   * nôtre : « 30021504 » chez Tremco est « HYDRASEAL DPM 12KG » chez nous.
   * Quand ce fournisseur a déjà été rattaché à cet article, la table le sait —
   * `reference_fournisseur` a justement été remplie pour ça. C'est un lien
   * exact, bien plus sûr qu'une ressemblance de libellé, et il passe donc
   * d'abord. Le rapprochement par le texte ne sert qu'à la première fois.
   */
  const produitDeLigneFournisseur = useCallback((i: number) => {
    const choisi = choixProduit[i];
    if (choisi) return produitParId(produits, choisi);

    const ref = (result?.lignes?.[i]?.reference || '').trim().toUpperCase();
    if (ref && dfFournisseurId) {
      const lien = produitFournisseurs.find(pf =>
        pf.fournisseurId === dfFournisseurId &&
        (pf.referenceFournisseur || '').trim().toUpperCase() === ref);
      if (lien) {
        const p = produitParId(produits, lien.produitId);
        if (p) return p;
      }
    }
    return rapprochements.get(i)?.meilleur;
  }, [choixProduit, produits, rapprochements, result, dfFournisseurId, produitFournisseurs]);

  /** Le prix d'achat retenu pour une ligne : celui lu, ou celui corrigé. */
  const dfPrixDeLigne = useCallback((i: number) =>
    dfPrix[i] ?? result?.lignes?.[i]?.prixUnitaireHT ?? undefined,
  [dfPrix, result]);

  /** Ce qu'il faut faire de chaque ligne, en l'état des choix de l'écran. */
  const propositionsFournisseur = useMemo<Map<number, PropositionPrix>>(() => {
    const m = new Map<number, PropositionPrix>();
    if (!result?.lignes?.length || !isDevisFourn(result.typeDocument)) return m;
    result.lignes.forEach((_, i) => {
      m.set(i, proposerPrix({
        indice: i,
        prixLu: dfPrixDeLigne(i),
        produit: produitDeLigneFournisseur(i),
        fournisseurId: dfFournisseurId || undefined,
        liens: produitFournisseurs,
        produits,
      }));
    });
    return m;
  }, [result, dfPrixDeLigne, produitDeLigneFournisseur, dfFournisseurId, produitFournisseurs, produits]);

  /* Les cases sont cochées d'office là où l'intention ne fait pas de doute :
     la fiche fournisseur, qui n'est que le prix de CE fournisseur pour CET
     article. La fiche article, elle, commande toutes les marges — elle reste
     décochée, à cocher en connaissance de cause. Une fois que l'utilisateur a
     touché une case, on ne repropose plus rien. */
  const dfTouche = useRef(false);
  useEffect(() => {
    if (!result || !isDevisFourn(result.typeDocument) || dfTouche.current) return;
    const versLien: Record<number, boolean> = {};
    propositionsFournisseur.forEach((p, i) => {
      if (p.action === 'actualiser' || p.action === 'rattacher') versLien[i] = true;
    });
    setDfVersLien(versLien);
  }, [propositionsFournisseur, result]);

  /**
   * Articles ajoutés d'office par les règles d'accompagnement.
   *
   * Le client demande quatorze balises J11 ; il lui faut aussi quatorze
   * galettes de scellement, un seau d'enduit ARAVIS par vingtaine de balises,
   * et le durcisseur qui va avec ce seau — à 0 €, il est compris dans l'enduit.
   * Ces règles sont celles de MonCRM, les mêmes que celles du Chiffrage : elles
   * vivent en base parce que ce sont des décisions commerciales, qui changent
   * sans qu'on redéploie l'application.
   *
   * Le calcul part des articles RETENUS, pas du texte du client : c'est la
   * variante choisie qui déclenche la règle.
   */
  const accompagnements = useMemo(() => {
    if (!result?.lignes?.length || !regles.length || !produitsCharges) return [];
    const demandees: LigneChiffrage[] = result.lignes
      .map((l, i) => {
        const p = produitDeLigne(i);
        return p ? { produitId: p.id, produitMatch: p.description,
                     quantite: quantiteManuelle[`d${i}`] ?? (l.quantite || 1),
                     confidence: 'high' as const } : null;
      })
      .filter(Boolean) as LigneChiffrage[];
    if (!demandees.length) return [];

    const referentiel = produits.map(p => ({
      id: p.id, reference: p.reference, description: p.description,
    }));
    return appliquerAccompagnements(demandees, regles, referentiel)
      .filter(l => l.auto);
  }, [result, regles, produits, produitsCharges, produitDeLigne, quantiteManuelle]);

  /* Prix du contrat cadre, pour toutes les lignes — accompagnements compris.
     Le tarif se négocie avec la société, pas avec la personne : « Guillaume
     Brugel » ne dit rien de l'accord, c'est « AGILIS » qui le porte. Et la
     galette suit le même contrat que la balise : la facturer au tarif public
     ferait un devis faux. */
  /**
   * Département de livraison, et d'où il vient.
   *
   * Ordre de préférence : ce que l'utilisateur a saisi, puis l'adresse de
   * LIVRAISON lue sur le document, puis celle du client dans MonCRM, puis son
   * adresse de facturation. Le devis AF035816 justifie ce dernier repli : sa
   * livraison est « À PRÉCISER » et le transport y est pourtant chiffré pour
   * le 78, celui de la facturation. Mais un repli n'est pas une certitude,
   * d'où l'origine rendue avec la valeur — et un champ toujours modifiable.
   */
  const livraison = useMemo(() => {
    const cp = (v?: string) => {
      const d = departement(String(v || '').trim().slice(0, 2));
      return /^(\d{2}|2[AB])$/.test(d) ? d : '';
    };
    if (dptLivraison) return { dpt: cp(dptLivraison), origine: 'saisi à la main' };

    const duDoc = cp(result?.codePostalLivraison);
    if (duDoc) return { dpt: duDoc, origine: 'adresse de livraison du document' };

    const cli = clients.find(c => c.id === creerDevisClientId);
    const liv = cli?.adressesLivraison?.find(a => cp(a.codePostal));
    if (liv) return { dpt: cp(liv.codePostal), origine: `livraison « ${liv.libelle || liv.ville} »` };

    const fact = cp(cli?.codePostal);
    if (fact) return { dpt: fact, origine: 'adresse de facturation, à défaut' };

    return { dpt: '', origine: '' };
  }, [dptLivraison, result, clients, creerDevisClientId]);

  /**
   * Frais de transport des produits plastique STI présents dans la demande.
   *
   * Le barème est celui du classeur ISOSIGN : messagerie au poids contre
   * affrètement à l'encombrement, le moins cher l'emporte. Il ne couvre QUE
   * le catalogue plastique — les panneaux et les supports relèvent d'un autre
   * barème, qu'on n'a pas. Les lignes qu'il ne sait pas chiffrer sont donc
   * laissées de côté plutôt que comptées à zéro.
   */
  const transport = useMemo(() => {
    if (!result?.lignes?.length || !livraison.dpt) return null;
    const detail: { texte: string; montant: number; explication: string }[] = [];
    let total = 0;
    result.lignes.forEach((l, i) => {
      const cle = `d${i}`;
      const ref = choixOdoo[i]?.reference
        || produitDeLigne(i)?.referenceOdoo || produitDeLigne(i)?.reference || '';
      const art = articlePlastique(ref)
        || articlePlastique([l.reference, l.description].filter(Boolean).join(' ').trim());
      if (!art) return;
      /* On lit `quantiteManuelle` directement plutôt que d'appeler
         `quantiteDe` : ce raccourci est déclaré PLUS BAS dans le composant,
         et une constante n'existe pas avant sa ligne. L'appeler ici faisait
         lever « Cannot access before initialization » au premier rendu qui
         suivait le choix du client — l'analyse disparaissait et l'écran
         revenait au tableau de bord. */
      const qte = quantiteManuelle[cle] ?? (l.quantite || 1);
      const d = chiffrerTransport(art, qte, livraison.dpt);
      if (!d) return;
      total += d.montant;
      detail.push({ texte: art.reference, montant: d.montant, explication: d.explication });
    });
    /* PORT ISOSIGN, qui s'AJOUTE au port plastique.
     *
     * Les deux expéditions sont distinctes — le plastique part de chez STI,
     * les panneaux et supports de chez ISOSIGN — et le devis AF035816 les
     * réunit sur une seule ligne « BALISAGE + SV ». Le franco de 700 € se
     * juge donc sur les seules lignes ISOSIGN : le plastique voyage à part et
     * ne peut pas faire franchir un seuil qui ne le concerne pas. */
    let baseIsosign = 0;
    const lignesIsosign: { reference: string; designation?: string }[] = [];
    /* Les gammes ISOMARK et ISOFLOOR ont leur propre barème, au poids, et
       leurs propres expéditions — H1 depuis ISOSIGN, H2 depuis l'usine
       ISOMARK, ISOFLOOR à part. Les laisser dans le sac ISOSIGN leur faisait
       franchir un franco de 700 € qui ne les concerne pas. */
    const lignesGamme: LigneGamme[] = [];
    result.lignes.forEach((l, i) => {
      const cle = `d${i}`;
      const odoo = choixOdoo[i];
      const local = produitDeLigne(i);
      const ref = odoo?.reference || local?.referenceOdoo || local?.reference || '';
      if (!ref || articlePlastique(ref)) return;   // le plastique a son barème
      const qte = quantiteManuelle[cle] ?? (l.quantite || 1);
      const designation = odoo?.designation || local?.description || '';
      const categorie = odoo?.categorie || local?.categorie || '';
      const niveau = niveauGamme(categorie, local?.catalogue);
      const gamme = niveau !== null || estGamme(local?.catalogue);
      if (gamme) {
        const remise = prixApplicateur(odoo?.fiche ?? local?.prixTarif ?? local?.prixHT, categorie, local?.catalogue);
        const pu = prixManuel[cle] ?? (remise && remise.remise > 0 ? remise.prix : (odoo?.contrat ?? 0));
        lignesGamme.push({ reference: ref, designation, quantite: qte,
                           montant: (Number(pu) || 0) * qte, niveau });
        return;
      }
      const pu = prixManuel[cle] ?? odoo?.contrat ?? 0;
      baseIsosign += (Number(pu) || 0) * qte;
      lignesIsosign.push({ reference: ref, designation: odoo?.designation });
    });
    const isosign = lignesIsosign.length
      ? chiffrerPortIsosign(baseIsosign, lignesIsosign)
      : null;
    const gammes = lignesGamme.length ? portGammes(lignesGamme) : [];

    if (isosign) total += isosign.montant;
    for (const g of gammes) total += g.montant;
    return (detail.length || isosign || gammes.length)
      ? { total, detail, isosign, gammes }
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, livraison.dpt, choixOdoo, produitDeLigne, quantiteManuelle, prixManuel]);

  /* Date de la dernière synchronisation réussie. Une grille périmée est
     indiscernable d'une grille à jour : il faut la montrer. */
  useEffect(() => {
    if (!open) return;
    supabase
      .from('grille_synchro')
      .select('fin')
      .eq('etat', 'terminé')
      .order('fin', { ascending: false })
      .limit(1)
      .then(({ data }) => setGrilleMaj(data?.[0]?.fin ?? ''));
  }, [open]);

  const synchroniserGrilles = useCallback(async () => {
    setGrilleEnCours(true);
    try {
      const { data, error } = await supabase.functions.invoke('odoo-grille-sync', {
        body: { niveaux: ['R1', 'R2', 'R3', 'R4'] },
      });
      if (error) throw error;
      const faits = (data?.contrats || []) as { nom: string; lignes: number }[];
      if (!faits.length) {
        toast.warning(data?.message || 'Aucune grille trouvée chez Odoo.');
      } else {
        const total = faits.reduce((t, c) => t + (c.lignes || 0), 0);
        toast.success(`${faits.length} grille(s), ${total} ligne(s) recopiée(s).`);
        setGrilleMaj(new Date().toISOString());
      }
    } catch (e) {
      toast.error(`Synchronisation impossible : ${(e as Error).message}`);
    } finally {
      setGrilleEnCours(false);
    }
  }, []);

  const referencesDuDevis = useMemo(() => {
    const refs = new Set<string>();
    (result?.lignes ?? []).forEach((l, i) => {
      const p = produitDeLigne(i);
      if (p) refs.add(p.referenceOdoo || p.reference);
      /* La référence ÉCRITE PAR LE CLIENT, même quand MonCRM ne la connaît
         pas. C'est une lecture par code, la plus sûre qui soit, et elle ne
         coûte rien quand le code n'existe pas chez Odoo : il ne remonte
         simplement aucune fiche. Sans elle, un article que le client
         désigne exactement mais qui manque à la copie locale n'était
         atteignable que par la recherche approximative. */
      const brute = String(l.reference || '').trim();
      if (brute.length >= 4 && /[.\d]/.test(brute)) refs.add(brute.toUpperCase());

      /* LES COMPOSANTS D'UN SYSTÈME SONT LES ARTICLES VENDUS.
       *
       * Une ligne système ne retient aucun article, donc n'apportait aucune
       * référence. Sur un document qui n'en contient qu'une — « HORUS systeme
       * flowshield comfort 30m² » — la liste tombait à zéro et l'appel à Odoo
       * était sauté tout entier : plus de contrat cadre, plus de client
       * reconnu, et des composants tarifés au catalogue faute de grille.
       *
       * Ce sont pourtant les composants qu'on facture, et ils portent chacun
       * leur référence. On les envoie donc chercher leur prix contrat comme
       * n'importe quel autre article. Toutes les variantes sont couvertes,
       * pas seulement celle retenue : la liste reste ainsi stable quand on
       * change de variante ou qu'on coche une option, au lieu de relancer
       * Odoo à chaque clic. */
      const sys = systemesDetectes.get(i);
      if (sys) {
        for (const v of sys.variantes) {
          for (const c of v.composants) {
            const pc = c.produitId ? produitParId(produits, c.produitId) : undefined;
            if (pc) refs.add(pc.referenceOdoo || pc.reference);
          }
        }
      }
    });
    for (const a of accompagnements) {
      const p = produits.find(x => x.id === a.produitId);
      if (p) refs.add(p.referenceOdoo || p.reference);
    }
    return [...refs];
  }, [result, accompagnements, produits, produitDeLigne, systemesDetectes]);

  useEffect(() => {
    const cli = clients.find(c => c.id === creerDevisClientId);
    /* Sans client MonCRM, on interroge quand même Odoo avec ce que le message
       a livré : l'adresse de l'expéditeur suffit à retrouver la société et son
       contrat. C'est ainsi que procède le Chiffrage. */
    /* L'adresse de l'expéditeur désigne une agence précise ; la raison sociale
       peut en désigner plusieurs. On la lit donc dans le message analysé. */
    const indices = extraireIndices(analyseTexteRef.current || '');
    const sigOdoo = signature;
    /* Raison sociale devinée du texte, faute d'adresse.
     *
     * Le glisser-déposer d'un .msg apporte les en-têtes et l'image de
     * signature : l'adresse de l'expéditeur y est toujours. Un copier-coller,
     * lui, ne donne souvent que le corps du message — Outlook ne met pas les
     * en-têtes dans le presse-papiers, et la signature est une image qui ne se
     * colle pas en texte. Sans adresse, aucun critère n'était formé, l'appel à
     * Odoo n'avait pas lieu, et l'on perdait TOUT : contrat cadre, contacts,
     * et jusqu'aux propositions d'articles, qui pourtant ne dépendent pas du
     * client.
     *
     * `extraireIndices` sait repérer les raisons sociales dans le texte — les
     * libellés suivis de SARL, SAS, SIGNALISATION, MARQUAGE… « REFLEX
     * Signalisation » écrit dans une signature textuelle suffit. C'est moins
     * sûr qu'une adresse, mais infiniment mieux que rien. */
    const societeDuTexte = indices.noms.find(n => n.length >= 4 && !/@/.test(n));

    const critere = cli
      ? { email: cli.email, societe: cli.societe, nom: cli.nom, ville: cli.ville }
      : (sigOdoo?.email || indices.emails[0] || sigOdoo?.societe
         || societeDuTexte || result?.nomPartenaire)
        ? {
            email: sigOdoo?.email || indices.emails[0],
            /* Le domaine avant le nom deviné : « thierry@reflex-signalisation.fr »
               dit REFLEX SIGNALISATION, quand le modèle proposait « Manue »,
               le prénom de la personne à qui le message était adressé. Passer
               ce prénom à Odoo l'envoyait chercher un partenaire qui n'existe
               pas — ou pire, un homonyme. */
            societe: sigOdoo?.societe
              || societeDepuisEmail(sigOdoo?.email || indices.emails[0])
              || societeDuTexte
              || result?.nomPartenaire,
            nom: sigOdoo?.nom || result?.nomPartenaire,
            ville: sigOdoo?.ville || indices.villes[0] || emlContactRef.current?.ville,
          }
        : null;

    /* Les demandes qu'aucun article MonCRM ne satisfait : on les fait chercher
       directement dans le catalogue d'Odoo. La copie locale est incomplète —
       le support acier galva Ø60 en 3500 n'y figure pas alors qu'Odoo le
       facture 39,852 € — et à moitié non tarifée. C'est la voie qu'avait prise
       le Chiffrage local, et c'est elle qui trouve les prix. */
    /* On interroge Odoo pour TOUTES les lignes, même celles qu'un article
       MonCRM semble satisfaire.
       Sur « Support Ø 60 mm long 3.50 m », le rapprochement local retenait
       SA603500CUS — un tube alu anodisé — avec assurance : le diamètre et la
       longueur concordent. La ligne n'était donc jamais envoyée à Odoo, et le
       vrai support acier galva, SG60.3500.IS.BRUT, ne pouvait pas être
       proposé. Un article local plausible n'est pas une raison de ne pas
       demander à la source. */
    const aChercher = (result?.lignes || [])
      .map((l, i) => ({
        /* Une ligne système ne désigne pas un article : la chercher chez Odoo
           ne peut ramener qu'un homonyme — le mot « système » y trouve un kit
           de crochets pour panneau. Elle se chiffre par ses composants, qui
           portent chacun leur propre référence. */
        texte: systemesDetectes.has(i) ? '' : texteRechercheOdoo(l, i),
        quantite: quantiteManuelle[`d${i}`] ?? (l.quantite || 1),
      }))
      .filter(r => r.texte.length >= 2)
      .slice(0, 12);   // au-delà, l'appel s'éternise pour un gain nul

    /* Sans critère, Odoo n'est pas interrogé du tout — et l'utilisateur n'en
       savait rien. Un copier-coller sans adresse ni raison sociale donnait une
       analyse muette, sans qu'on comprenne pourquoi le glisser-déposer du même
       message marchait. On le dit maintenant, et désigner le client à la main
       relance tout. */
    setOdooMuet(!critere ? 'sans-client' : null);
    /* Le contrat cadre et le client ne dépendent pas des articles : un
       document dont tous les composants manquent au catalogue n'apporte
       aucune référence, et laisserait pourtant le contrat à l'écran s'il y a
       un système à chiffrer. On interroge donc Odoo dès qu'il y a de quoi
       reconnaître le client ET quelque chose à tarifer, système compris. */
    const aTarifer = referencesDuDevis.length || aChercher.length
      || systemesDetectes.size;
    if (!critere || !aTarifer) {
      setContratOdoo(null); setTrouvaillesOdoo({}); return;
    }
    let annule = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('odoo-prix', {
          body: {
            client: critere,
            lignes: referencesDuDevis.map(r => ({ reference: r, quantite: 1 })),
            recherches: aChercher,
            /* Niveau imposé : Odoo ira lire la grille de CE niveau au lieu de
               celle rattachée au client. Rien n'est copié en local. */
            niveau: niveauForce || undefined,
            /* Niveau affiché, envoyé comme FILET : il ne sert que si le client
               n'a aucun contrat rattaché. Sans lui, l'absence de rattachement
               faisait retomber la tarification sur la liste de prix, qui
               recalcule depuis des fiches à 1 €. */
            niveauDefaut: niveauRemise,
          },
        });
        if (annule) return;
        setTrouvaillesOdoo((data?.trouvailles || {}) as Record<string, TrouvailleOdoo[]>);
        /* Les fiches lues par référence exacte, gardées entières : le panneau
           Odoo doit pouvoir les proposer comme n'importe quelle trouvaille. */
        const fiches: Record<string, TrouvailleOdoo> = {};
        for (const [ref, v] of Object.entries((data?.prix || {}) as Record<string, any>)) {
          if (!v) continue;
          fiches[ref] = {
            reference: ref,
            designation: v.designation || ref,
            categorie: '', unite: '',
            contrat: v.contrat ?? null,
            fiche: v.fiche || 0,
            cout: v.cout || 0,
            /* Lue par son code, pas devinée : aucune incertitude. */
            certitude: 1,
          };
        }
        setFichesOdoo(fiches);

        /* Les interlocuteurs de la société. On présélectionne celui dont
           l'adresse est celle de l'expéditeur — pas celui dont le prénom
           traîne dans le corps du message. */
        const cts = (data?.contacts || []) as ContactOdoo[];
        setContactsOdoo(cts);
        /* Le NOM du signataire prime sur l'adresse.
           Le bloc de signature de REFLEX porte « Thierry BARAILLER » au-dessus
           de « contact@reflex-signalisation.fr » — une boîte partagée. Chercher
           d'abord par l'adresse ramenait la personne qui tient cette boîte,
           l'assistante, et non le signataire. Les adresses génériques sont donc
           écartées de l'identification : elles désignent l'entreprise. */
        const parNom = cts.find(c => memePersonne(c.nom, sigOdoo?.nom));
        const adresses = [sigOdoo?.email, ...indices.emails]
          .filter((e): e is string => !!e && !adresseGenerique(e))
          .map(e => e.toLowerCase());
        const parMail = cts.find(c => c.email && adresses.includes(c.email.toLowerCase()));
        /* Ne jamais écraser un choix déjà fait. Cet effet se rejoue dès qu'une
           référence du devis change — donc au moindre article rectifié — et il
           remettait alors la présélection, effaçant le contact désigné à la
           main. C'est ce qui faisait « revenir en arrière ». */
        setContactRetenu(prev => {
          if (prev && cts.some(c => String(c.id) === prev)) return prev;
          return String((parNom || parMail)?.id ?? '');
        });
        // Client absent de MonCRM mais connu d'Odoo : on propose de l'importer.
        if (!cli && data?.coordonnees?.nom) {
          setClientOdoo({ ...data.coordonnees, societe: data.societe || data.coordonnees.nom });
        } else setClientOdoo(null);
        if (data?.contrat) {
          const prix: Record<string, number> = {};
          for (const [ref, v] of Object.entries((data.prix || {}) as Record<string, any>)) {
            if (v?.contrat != null) prix[ref] = v.contrat;
          }
          const isomark: Record<string, number> = {};
          for (const [ref, v] of Object.entries((data.prix || {}) as Record<string, any>)) {
            if (v?.isomark != null) isomark[ref] = v.isomark;
          }
          setContratOdoo({
            contrat: data.contrat, societe: data.societe || data.partenaire || '', prix, isomark,
            societeIncertaine: !!data.societeIncertaine,
            cadre: String(data.contratCadre || ''),
            cadreActif: !!data.contratCadreActif,
            niveauApplique: String(data.niveauApplique || ''),
            niveauParDefaut: !!data.niveauParDefaut,
          });
        } else setContratOdoo(null);
      } catch { if (!annule) { setContratOdoo(null); setTrouvaillesOdoo({}); setFichesOdoo({}); } }
    })();
    return () => { annule = true; };
    // `quantiteManuelle` volontairement hors dépendances :
    // les inclure relancerait l'appel Odoo à chaque frappe dans une quantité.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creerDevisClientId, clients, referencesDuDevis, result, signature, niveauForce,
      systemesDetectes]);

  /**
   * Retient d'office la meilleure proposition Odoo.
   *
   * Odoo est la source : quand il trouve l'article et que le catalogue local
   * ne l'a pas, laisser la ligne en « — Libre — » n'apporte rien. Elle
   * obligeait à cliquer pour valider ce que l'appli savait déjà, et surtout
   * elle partait au devis SANS PRIX si on oubliait de le faire.
   *
   * Trois garde-fous :
   *  - un article déjà retenu, ici ou dans le catalogue local, n'est jamais
   *    écrasé ;
   *  - un retrait explicite est mémorisé et n'est pas défait au rechargement ;
   *  - la certitude du rapprochement voyage avec la proposition, pour que
   *    l'affichage distingue « acquis » de « à vérifier ». On retient dans
   *    les deux cas — une ligne sans prix est le pire des états — mais on ne
   *    fait pas passer une hypothèse pour une certitude.
   */
  useEffect(() => {
    const lignes = result?.lignes;
    if (!lignes?.length) return;
    setChoixOdoo(prev => {
      const n = { ...prev };
      let change = false;
      lignes.forEach((l, i) => {
        /* Une ligne système est déjà chiffrée par ses composants : lui coller
           en plus un article Odoo la ferait compter deux fois. */
        if (n[i] || refusOdoo.has(i) || produitDeLigne(i) || systemesDetectes.has(i)) return;
        /* Même ordre qu'à l'affichage : la fiche lue par référence exacte
           d'abord, la recherche par mots ensuite. */
        const brute = String(l.reference || '').trim().toUpperCase();
        const exacte = brute ? fichesOdoo[brute] : undefined;
        /* Même contrôle qu'à l'affichage : une proposition qu'on n'aurait pas
           montrée ne doit pas être retenue d'office dans son dos. */
        const props = exacte
          ? [exacte]
          : (trouvaillesOdoo[texteRechercheOdoo(l, i)] || []).filter(
              t => memeFamille(texteDemande(l, i), `${t.reference} ${t.designation || ''}`));
        if (props.length) { n[i] = props[0]; change = true; }
      });
      return change ? n : prev;
    });
  }, [trouvaillesOdoo, fichesOdoo, result, refusOdoo, produitDeLigne, texteRechercheOdoo,
      systemesDetectes, texteDemande]);

  /**
   * Prix d'un article : celui du contrat, celui du catalogue, et le retenu.
   *
   * Le tarif ISOMARK l'emporte quand il diffère du contrat Odoo. Ce n'est pas
   * un caprice : une remise oubliée dans Odoo y fait apparaître un prix plus
   * élevé que le tarif applicateur, et c'est ce dernier qui a été annoncé au
   * client. Les deux restent affichés — l'écart se voit, il ne se subit pas.
   */
  const prixDetail = useCallback((
    p: typeof produits[number] | undefined,
    prixImpose?: number | null,
  ) => {
    if (!p) return { retenu: prixImpose ?? 0, contrat: null as number | null, catalogue: 0, source: 'aucun' as const, remise: null as PrixGamme | null };
    const ref = p.referenceOdoo || p.reference;
    const contrat = contratOdoo?.prix[ref] ?? null;
    const catalogue = p.prixHT ?? 0;

    /* Remise de gamme. Le catalogue ISOMARK/ISOFLOOR ne porte que le TARIF
       PUBLIC ; la remise applicateur se lit sur la catégorie Odoo de
       l'article — « ISOMARK / H1 » à 50 %, « ISOMARK / H2 » à 30 %, ISOFLOOR
       à 30 %. Le champ `prix_tarif` est lui aussi public : sur les 157
       articles qui en portent un, il égale le prix de la fiche au centime
       près. Le retenir tel quel facturait l'applicateur au prix public. */
    const gamme = estGamme(p.catalogue) || niveauGamme(p.categorie, p.catalogue)
      ? prixApplicateur(p.prixTarif ?? p.prixHT, p.categorie, p.catalogue)
      : null;
    /* LA FICHE CLIENT PASSE AVANT LE TARIF DE GAMME.
     *
     * Le prix revendeur est le prix PUBLIC moins la remise que le client a
     * négociée pour cette famille — c'est la règle, et les exceptions sont
     * précisément ce que sa fiche enregistre. Le tarif de gamme n'est qu'un
     * défaut pour les clients qui n'ont rien de négocié.
     *
     * Les deux donnaient 30 % chez HORUS, mais pas sur la même base : la
     * gamme remise `prixTarif` quand il existe — 244,80 € sur l'Hydraseal
     * DPM — là où le prix public est à 264,70 €. Le seau partait à 171,36 €
     * au lieu de 185,29 €, et le devis entier était faux de 13,93 €. */
    const client = clients.find(c => c.id === creerDevisClientId);
    const negociee = prixRevendeur(p.prixHT, p.categorie, client?.remisesParCategorie);
    const remise = negociee ?? (gamme && gamme.remise > 0 ? gamme : null);

    if (prixImpose !== undefined && prixImpose !== null) {
      return { retenu: prixImpose, contrat, catalogue, source: 'règle' as const, remise };
    }
    /* Le tarif ISOMARK doit primer sur le contrat quand il diffère — une remise
       oubliée dans Odoo y fait apparaître un prix qui n'est pas celui annoncé
       au client. Mais il faut le VRAI tarif ISOMARK, qui vit dans une liste de
       prix Odoo dédiée. Le prix rangé dans MonCRM, lui, est le TARIF PUBLIC :
       l'ARAVIS y vaut 90,86 € quand le tarif ISOMARK est à 63,60 €. S'en
       servir gonflerait les devis. La bascule n'agit donc que lorsque la
       fonction odoo-prix renvoie ce tarif — voir la note en fin de séance. */
    /* Le tarif applicateur ISOMARK est désormais rangé sur l'article, issu du
       catalogue PDF et rapproché à la main. Il est DÉJÀ remisé — H1 à 50 %,
       H2 à 30 % — et prime sur le contrat Odoo quand il en diffère : une
       remise oubliée dans Odoo y ferait apparaître un prix jamais annoncé. */
    const tarifMetier = remise ? remise.prix : contratOdoo?.isomark?.[ref];
    if (tarifMetier != null && contrat !== null
        && Math.abs(contrat - tarifMetier) >= 0.01) {
      return { retenu: tarifMetier, contrat, catalogue: tarifMetier,
               source: (remise?.libelle || p.sourceTarif || 'catalogue métier') as any, remise };
    }
    if (contrat !== null) return { retenu: contrat, contrat, catalogue, source: 'contrat' as const, remise };

    /* Faute de contrat, la remise de gamme tient lieu de prix : c'est
       exactement le cas des primaires ISOFLOOR, absents de toute grille. */
    if (remise) {
      return { retenu: remise.prix, contrat, catalogue: remise.public,
               source: remise.libelle as any,
               remise };
    }

    /* Sur 22 635 articles vendables, 7 670 portent un prix inférieur à 2 € et
       4 657 un prix nul : chez ISOSIGN le prix de vente n'est pas sur la fiche
       Odoo, il vit dans les listes de prix. L'import a recopié la fiche, à 1 €,
       parfois multipliée par un coefficient — d'où les 1,43 € et 1,44 € qu'on
       retrouve partout. Ces valeurs ne sont pas des prix ; les afficher comme
       tels a mis un support Ø60 à 1,00 € sur une demande où Odoo facture
       39,852 €. Faute de prix contrat, on ne propose plus rien. */
    if (catalogue <= SEUIL_PRIX_FACTICE) {
      return { retenu: 0, contrat, catalogue, source: 'absent' as const, remise };
    }
    return { retenu: catalogue, contrat, catalogue, source: 'catalogue' as const, remise };
  }, [contratOdoo, clients, creerDevisClientId]);

  /**
   * Prix d'un article venu d'Odoo, remise de gamme comprise.
   *
   * La fiche Odoo porte le tarif PUBLIC et sa catégorie dit le niveau de
   * remise ; la grille du client, elle, ne couvre pas ces gammes. Sans ce
   * calcul, un primaire ISOFLOOR arrivait à 0,00 € — hors barème — ou au
   * prix public.
   *
   * Déclaré ici, au-dessus de tout ce qui s'en sert : une constante n'existe
   * pas avant sa ligne, et l'appeler plus haut ferait disparaître l'écran.
   */
  const prixOdoo = useCallback((odoo: TrouvailleOdoo) => {
    const gamme = prixApplicateur(odoo.fiche, odoo.categorie);
    const remise = gamme && gamme.remise > 0 ? gamme : null;
    if (remise) {
      return { retenu: remise.prix, contrat: odoo.contrat,
               catalogue: remise.public,
               source: remise.libelle as any,
               remise };
    }
    return { retenu: odoo.contrat ?? 0, contrat: odoo.contrat,
             catalogue: odoo.fiche, source: 'contrat' as any,
             remise: null as PrixGamme | null };
  }, []);

  /** Prix effectivement appliqué, correction manuelle comprise. */
  const prixDe = useCallback((
    p: typeof produits[number] | undefined,
    prixImpose?: number | null,
    cle?: string,
  ) => {
    if (cle && prixManuel[cle] !== undefined) return prixManuel[cle];
    return prixDetail(p, prixImpose).retenu;
  }, [prixDetail, prixManuel]);

  /** Quantité effectivement retenue pour une ligne. */
  const quantiteDe = useCallback((cle: string, defaut: number) =>
    quantiteManuelle[cle] ?? defaut, [quantiteManuelle]);

  /**
   * LE PRIX UNITAIRE D'UNE LIGNE DEMANDÉE — UN SEUL CALCUL.
   *
   * Il s'en faisait trois, qui ne disaient pas la même chose. Sur trente
   * plots de route, la ligne affichait 6,95 € — le bordereau VILL'EQUIP lu
   * chez Odoo — le TOTAL comptait 9,93 € — le tarif ISOMARK H2 de l'article
   * local — et le devis partait avec 6,95 €. L'écran annonçait donc 297,90 €
   * pour un devis de 208,50 €.
   *
   * L'article Odoo l'emporte quand il est retenu : c'est un choix explicite,
   * et c'est déjà ce que fait la création du devis.
   */
  const puDeLigne = useCallback((i: number) => {
    const cle = `d${i}`;
    const odoo = choixOdoo[i];
    if (odoo) return prixManuel[cle] ?? prixOdoo(odoo).retenu;
    return prixDe(produitDeLigne(i), undefined, cle);
  }, [choixOdoo, prixManuel, prixOdoo, prixDe, produitDeLigne]);

  /** Ce que pèse une ligne système : la somme de ses composants. */
  const totalSystemeDe = useCallback((i: number, quantite?: number | null) =>
    lignesSystemeDe(i, quantite).reduce((t, ls) => {
      const p = ls.composant.produitId
        ? produitParId(produits, ls.composant.produitId) : undefined;
      return t + quantiteComposant(i, ls) * prixDe(p, undefined, `d${i}:${ls.composant.id}`);
    }, 0),
  [lignesSystemeDe, produits, quantiteComposant, prixDe]);

  function handleCreerDevis() {
    if (!creerDevisClientId) { toast.error('Veuillez sélectionner un client'); return; }
    if (!creerDevisNumero.trim()) { toast.error('Veuillez saisir un numéro de devis'); return; }
    if (!creerDevisDate) { toast.error('Veuillez saisir la date'); return; }
    /* LES ARTICLES ODOO ENTRENT AU CATALOGUE, ET ODOO FAIT FOI.
     *
     * L'analyse retient souvent un article trouvé chez Odoo et absent de
     * MonCRM : la ligne partait « libre », sans article, et la colonne Réf.
     * restait vide. Désormais l'article est CRÉÉ dans le catalogue local au
     * moment où on s'en sert, et la ligne le désigne comme n'importe quel
     * autre. S'il existe déjà — même référence, ou même référence Odoo — il
     * est MIS À JOUR : désignation, catégorie, unité et prix viennent
     * d'Odoo, qui est la source. Le catalogue local converge ainsi vers
     * Odoo au fil des devis, au lieu de s'en écarter.
     *
     * Rien n'est écrit tant que le devis n'est pas confirmé : seuls les
     * articles réellement retenus entrent au catalogue. */
    const aEcrire = new Map<string, Produit>();
    const idParReference = new Map<string, string>();

    const enregistrerArticleOdoo = (o: TrouvailleOdoo): string => {
      const ref = String(o.reference || '').trim();
      if (!ref) return '';
      const deja = idParReference.get(ref.toUpperCase());
      if (deja) return deja;

      const local = produits.find(p =>
        String(p.referenceOdoo || p.reference).toUpperCase() === ref.toUpperCase());
      const article: Produit = local ? { ...local } : {
        id: generateId(), reference: ref, description: '',
        prixAchat: 0, coefficient: 1, prixHT: 0,
        coeffRevendeur: 1, remiseRevendeur: 0, prixRevendeur: 0,
        tva: 20, unite: 'u', stock: 0, stockMin: 0,
        dateCreation: today(),
      };

      article.referenceOdoo = ref;
      if (o.designation) article.description = o.designation;
      if (o.categorie) article.categorie = o.categorie;
      if (o.unite) article.unite = o.unite;
      /* LE PLUS RÉCENT L'EMPORTE, PAS ODOO SYSTÉMATIQUEMENT.
       *
       * « Odoo fait foi » ne peut pas vouloir dire « Odoo écrase toujours » :
       * un prix corrigé ici hier serait effacé par une fiche Odoo inchangée
       * depuis un an. On compare donc les dates — celle de la fiche Odoo
       * contre celle du dernier changement de prix chez nous — et on ne
       * remplace que par plus récent. Faute de date d'un côté ou de l'autre,
       * Odoo l'emporte : c'est la source.
       *
       * Le prix de la FICHE est le tarif public ; les remises se recalculent
       * à l'affichage. Un prix nul ou dérisoire n'est pas un prix : sur
       * 22 637 articles, 7 670 fiches Odoo portent moins de 2 €. */
      const majOdoo = o.maj ? new Date(o.maj.replace(' ', 'T') + 'Z') : null;
      const plusRecentQue = (dateLocale?: string) => {
        if (!majOdoo || isNaN(majOdoo.getTime())) return true;
        if (!dateLocale) return true;
        return majOdoo.getTime() >= new Date(dateLocale).getTime();
      };
      const horodate = (majOdoo && !isNaN(majOdoo.getTime())
        ? majOdoo : new Date()).toISOString();

      if ((o.fiche || 0) > SEUIL_PRIX_FACTICE
          && Math.abs((article.prixHT || 0) - o.fiche) >= 0.01
          && plusRecentQue(article.prixVenteMaj)) {
        article.prixHT = o.fiche;
        article.prixVenteMaj = horodate;
      }
      if ((o.cout || 0) > 0
          && Math.abs((article.prixAchat || 0) - o.cout) >= 0.01
          && plusRecentQue(article.prixAchatMaj)) {
        article.prixAchat = o.cout;
        article.prixAchatMaj = horodate;
      }
      /* Un article tout neuf n'a pas d'antériorité : on date ses deux prix
         pour que la prochaine synchro ait un point de comparaison. */
      if (!local) {
        article.prixVenteMaj = article.prixVenteMaj || horodate;
        article.prixAchatMaj = article.prixAchatMaj || horodate;
      }
      article.disponibleVente = true;
      /* Le stock d'Odoo est RECOPIÉ, pas fusionné : `stock` reste celui de
         MonCRM. On date la lecture — un stock sans date ne veut rien dire. */
      if (o.stockDispo !== undefined) {
        article.stockOdoo = o.stockDispo;
        article.stockOdooPrevu = o.stockPrevu ?? o.stockDispo;
        article.stockOdooMaj = new Date().toISOString();
      }
      /* La gamme se déduit de la catégorie Odoo : elle commande les remises
         et le barème de port, autant la fixer tout de suite. */
      const niveau = niveauGamme(o.categorie, article.catalogue);
      if (niveau === 'ISOFLOOR') article.catalogue = 'ISOFLOOR';
      else if (niveau === 'H1' || niveau === 'H2') article.catalogue = 'ISOMARK';

      aEcrire.set(ref.toUpperCase(), article);
      idParReference.set(ref.toUpperCase(), article.id);
      return article.id;
    };

    /** Lignes du devis pour une ligne de demande reconnue comme système. */
    const lignesDuSysteme = (i: number, l: { quantite: number; tva?: number }): LigneDevis[] => {
      const sys = systemeDeLigne(i);
      const declinees = lignesSystemeDe(i, l.quantite);
      if (!sys || !declinees.length) return [];
      const surface = surfaceDeLigne(i, l.quantite);

      /* Un en-tête de groupe porte le nom du système et la surface : sans lui,
         le devis aligne huit seaux et trois pots sans dire de quoi ils sont la
         mise en œuvre. Il ne compte pas dans les totaux. */
      const entete: LigneDevis = {
        id: generateId(), type: 'groupe',
        description: `${sys.nom}${sys.variante ? ` — ${sys.variante}` : ''} · ${surface} m²`,
        quantite: 0, unite: '', prixUnitaireHT: 0, tva: 0, remise: 0,
      };

      const composants = declinees.map((ls): LigneDevis => {
        const p = ls.composant.produitId
          ? produitParId(produits, ls.composant.produitId) : undefined;
        const cle = `d${i}:${ls.composant.id}`;
        /* Le conditionnement fait la quantité : on achète huit seaux de 19 kg,
           pas 135 kg. Sans article rattaché, la fiche ne dit pas le contenant :
           la ligne reste en kilogrammes et son prix est à saisir. */
        const quantite = quantiteComposant(i, ls);
        return {
          id: generateId(),
          produitId: p?.id,
          description: p?.description || ls.composant.libelle,
          quantite,
          unite: p?.unite || (ls.contenants ? 'u' : 'kg'),
          prixUnitaireHT: prixDe(p, undefined, cle),
          tva: p?.tva ?? l.tva ?? 20,
          remise: 0,
          /* La surface et le dosage restent portés par la ligne : le devis
             peut ainsi se recalculer si la surface change, et le chargé
             d'affaires lit d'où sort la quantité. */
          surfaceM2: surface,
          consommation: ls.composant.consommation,
          note: [ls.composant.role, ls.explication].filter(Boolean).join(' — '),
        };
      });

      return [entete, ...composants];
    };

    const lignes: LigneDevis[] = (result?.lignes ?? []).flatMap((l, i) => {
      const cle = `d${i}`;
      /* UNE LIGNE SYSTÈME S'ÉCLATE EN SES COMPOSANTS.
       *
       * Elle ne désigne aucun article : la laisser passer telle quelle
       * mettait au devis un kit de crochets à 0,70 €. Chaque composant part
       * en ligne propre, avec son conditionnement et son prix remisé — c'est
       * aussi ce qu'attendent le stock et la commande fournisseur. */
      if (systemesDetectes.has(i)) {
        const eclatees = lignesDuSysteme(i, l);
        /* Tant que la variante n'est pas tranchée, on ne chiffre rien plutôt
           que de chiffrer au hasard : entre 2 et 3 mm il y a 620 € d'écart. */
        if (eclatees.length) return eclatees;
      }
      /* Un article Odoo retenu l'emporte sur le rapprochement local : c'est un
         choix explicite, et souvent la bonne marchandise là où le catalogue
         local proposait un article approchant. Faute d'exister dans MonCRM, il
         part en ligne libre — référence dans le libellé, prix du bordereau. */
      const odoo = choixOdoo[i];
      if (odoo) {
        return {
          id: generateId(),
          /* L'article existe désormais dans le catalogue : la ligne le
             désigne, et la colonne Réf. l'affiche comme les autres. */
          produitId: enregistrerArticleOdoo(odoo) || undefined,
          /* La référence Odoo reste portée par la ligne : elle sert à
             l'envoi vers Odoo même si l'article venait à changer ici. */
          referenceOdoo: odoo.reference,
          description: odoo.designation || odoo.reference,
          quantite: quantiteDe(cle, l.quantite),
          unite: odoo.unite || 'u',
          /* Le prix AFFICHÉ, remise de gamme comprise : `odoo.contrat` seul
             ignorait le calcul applicateur et faisait partir au devis un prix
             que l'écran n'avait jamais montré. */
          prixUnitaireHT: puDeLigne(i),
          tva: l.tva ?? 20,
          remise: 0,
        };
      }
      const p = produitDeLigne(i);
      return {
        id: generateId(),
        produitId: p?.id,
        /* Le libellé corrigé à l'écran est celui qui part au devis : le
           laisser de côté remettrait sous les yeux du client le texte qu'on
           venait justement de rectifier. */
        description: libelleManuel[i] || l.description || p?.description || '',
        quantite: quantiteDe(cle, l.quantite),
        unite: p?.unite || 'u',
        prixUnitaireHT: puDeLigne(i),
        tva: l.tva ?? 20,
        remise: 0,
      };
    });
    // Les articles ajoutés par les règles suivent les articles demandés.
    for (const a of accompagnements) {
      const p = produits.find(x => x.id === a.produitId);
      const cle = `a${a.regleId}`;
      lignes.push({
        id: generateId(),
        produitId: a.produitId,
        description: p?.description || a.produitMatch,
        quantite: quantiteDe(cle, a.quantite),
        unite: p?.unite || 'u',
        prixUnitaireHT: prixDe(p, a.prixImpose, cle),
        tva: p?.tva ?? 20,
        remise: 0,
      });
    }

    const validite = creerDevisValidite || (() => {
      const d = new Date(creerDevisDate);
      d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
    })();
    const nouveauDevis: Devis = {
      id: generateId(),
      numero: creerDevisNumero.trim(),
      clientId: creerDevisClientId,
      dateCreation: creerDevisDate,
      dateValidite: validite,
      statut: 'brouillon',
      lignes,
      referenceAffaire: creerDevisRefAffaire || undefined,
      notes: creerDevisNotes || result?.notes || undefined,
      /* LE TRANSPORT SUIT LE DEVIS.
       *
       * L'écran chiffrait le port — « Port ISOFLOOR 85,00 € » — et le devis
       * créé arrivait avec des frais de port VIDES : le calcul restait dans
       * la fenêtre d'analyse et personne ne le reportait. Il fallait le
       * ressaisir à la main, ou l'oublier. */
      fraisPortHT: transport?.total || undefined,
      fraisPortTVA: transport?.total ? 20 : undefined,
    };
    /* Le catalogue d'abord, le devis ensuite : les lignes désignent ces
       articles, ils doivent exister quand l'écran Devis les relit. */
    if (aEcrire.size) {
      updateProduits(prev => {
        const parId = new Map(prev.map(p => [p.id, p]));
        for (const a of aEcrire.values()) parId.set(a.id, a);
        return [...parId.values()];
      });
    }
    updateDevis(prev => [nouveauDevis, ...prev]);
    const nb = aEcrire.size;
    toast.success(`Devis ${creerDevisNumero} créé`,
      nb ? { description: `${nb} article(s) Odoo repris au catalogue.` } : undefined);
    onOpenChange(false);
  }

  /* ── quantités pré-remplies pour réception ── */
  function buildQuantitesRecues(): Record<string, number> {
    if (!matchedCF || !result) return {};
    const map: Record<string, number> = {};
    for (const ligne of matchedCF.lignes) {
      const al = result.lignes.find(l =>
        (l.reference && ligne.reference && l.reference.toLowerCase() === ligne.reference.toLowerCase()) ||
        (l.description && ligne.description && l.description.toLowerCase().includes(ligne.description.toLowerCase()))
      );
      if (al) map[ligne.produitId] = al.quantite;
    }
    return map;
  }

  const fournisseurMatch = matchedCF ? fournisseurs.find(f => f.id === matchedCF.fournisseurId) : undefined;
  const noMatchCF = result && isFournisseurDoc(result.typeDocument) && !matchedCF;
  const isDevisClient = result &&
    (result.typeDocument === 'devis_client' || result.typeDocument === 'demande_devis');
  const isCC = result && result.typeDocument === 'commande_client';
  const isFact = result && (result.typeDocument === 'facture_fournisseur' || result.typeDocument === 'facture_client');
  const isAutre = result && result.typeDocument === 'autre';
  const isDevisFournisseur = result && isDevisFourn(result.typeDocument);

  const typeMeta = result ? TYPE_LABELS[result.typeDocument] : null;

  function handleContactExtracted(contact: ExtractedContact) {
    const now = new Date().toISOString();
    const name = contact.societe || contact.nom || '—';
    if (contactSaveType === 'client') {
      updateClients(prev => [{
        id: generateId(), nom: contact.nom, email: contact.email, telephone: contact.telephone,
        telephoneMobile: contact.telephoneMobile || undefined,
        adresse: contact.adresse, ville: contact.ville, codePostal: contact.codePostal,
        societe: contact.societe, notes: contact.notes, dateCreation: now, adressesLivraison: [],
      }, ...prev]);
      toast.success(`Client "${name}" créé`);
    } else {
      updateFournisseurs(prev => [{
        id: generateId(), nom: contact.nom, email: contact.email, telephone: contact.telephone,
        telephoneMobile: contact.telephoneMobile || undefined,
        adresse: contact.adresse, ville: contact.ville, codePostal: contact.codePostal,
        societe: contact.societe || contact.nom, notes: contact.notes, dateCreation: now,
        francoPort: 0, coutTransport: 0, delaiReglement: '30j',
      }, ...prev]);
      toast.success(`Fournisseur "${name}" créé`);
    }
    setContactToSave(null);
    onOpenChange(false);
  }

  async function handleExtractContact(type: 'client' | 'fournisseur') {
    // Priorité : texte de la dernière analyse > texte collé > infos du résultat
    const emailText = analyseTexteRef.current || texte ||
      (result ? [result.nomPartenaire, result.notes].filter(Boolean).join('\n') : '');
    if (!emailText.trim()) { toast.error('Aucun texte à analyser'); return; }
    setContactSaveType(type);
    setExtractingContact(true);
    setContactToSave(null);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-email', {
        body: { action: 'extract-contact', emailText, type },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // Compléter les champs vides avec les coordonnées extraites du HTML lors du chargement
      const result = { ...data, telephoneMobile: data.telephoneMobile || '' };
      const emlContact = emlContactRef.current;
      if (emlContact) {
        if (!result.telephone && emlContact.telephone) result.telephone = emlContact.telephone;
        if (!result.telephoneMobile && emlContact.telephoneMobile) result.telephoneMobile = emlContact.telephoneMobile;
        if (!result.adresse && emlContact.adresse) result.adresse = emlContact.adresse;
        if (!result.ville && emlContact.ville) result.ville = emlContact.ville;
        if (!result.codePostal && emlContact.codePostal) result.codePostal = emlContact.codePostal;
      }
      // Fallback société depuis le domaine email si manquant
      if (!result.societe && result.email) {
        const domainMatch = result.email.match(/@([^@.]+(?:\.[^@.]+)+)\s*$/);
        if (domainMatch) {
          const parts = domainMatch[1].split('.');
          result.societe = parts.slice(0, -1).join('.');
        }
      }
      setContactToSave(result);
    } catch (e: any) {
      toast.error(e.message || 'Erreur extraction contact');
    } finally {
      setExtractingContact(false);
    }
  }

  /* ── correction manuelle du type ── */
  function handleChangeType(value: string) {
    if (value === 'creer_client') { handleExtractContact('client'); return; }
    if (value === 'creer_fournisseur') { handleExtractContact('fournisseur'); return; }
    const newType = value as TypeDocument;
    setResult(prev => prev ? { ...prev, typeDocument: newType } : prev);
    setMatchedCF(null);
    setShowCreerCF(false);
    setShowCreerCC(false);
    /* Les cases cochées valaient pour le type précédent : les garder ferait
       appliquer des prix qu'on n'a plus sous les yeux. */
    setDfVersLien({});
    setDfVersArticle({});
    setDfCreer({});
    dfTouche.current = false;
  }

  // Panneau d'aperçu (un seul rendu à la fois : sous la zone d'import avant
  // l'analyse, sous l'en-tête de correction ensuite).
  const panneauApercu = apercu ? (
    <div className="rounded-xl border border-border overflow-hidden bg-muted/30">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border bg-muted/50">
        <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium flex-1 truncate" title={apercu.name}>{apercu.name}</span>
        <a
          href={apercu.url} target="_blank" rel="noopener noreferrer"
          title="Ouvrir dans un onglet"
          className="text-muted-foreground hover:text-primary shrink-0"
        ><ExternalLink className="w-3.5 h-3.5" /></a>
        <button onClick={() => setApercu(null)} title="Fermer l'aperçu" className="text-muted-foreground hover:text-destructive shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <iframe
        src={apercu.url}
        title={`Aperçu ${apercu.name}`}
        className="w-full h-[300px] sm:h-[420px] bg-white"
      />
      <p className="px-2.5 py-1 text-[10px] text-muted-foreground">
        Si l'aperçu reste vide (mobile notamment), ouvrez le document dans un onglet.
      </p>
    </div>
  ) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
        <DialogContent mobileFullscreen className="sm:max-w-3xl lg:max-w-5xl sm:max-h-[85vh] overflow-y-auto flex flex-col p-4 sm:p-5 [&>button]:z-20">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ScanText className="w-5 h-5 text-primary" />
              Analyse de document
            </DialogTitle>
          </DialogHeader>

          {/* ── Layout colonne unique ── */}
          <div className="flex flex-col gap-0 flex-1 min-h-0 pt-3">

            {/* ══ Zone unifiée PDF + texte ══ */}
            <div className="flex flex-col gap-3">

              {/* Zone combinée drag-and-drop + textarea */}
              <div
                ref={zoneRef}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`relative flex flex-col gap-2 rounded-xl border-2 transition-colors p-3 ${
                  dragging ? 'border-primary bg-primary/10' : 'border-dashed border-border hover:border-primary/50'
                }`}
              >
                {/* Overlay drag */}
                {dragging && (
                  <div className="absolute inset-0 rounded-xl bg-primary/10 border-2 border-primary flex flex-col items-center justify-center gap-2 z-10 pointer-events-none">
                    <Upload className="w-8 h-8 text-primary" />
                    <span className="text-sm font-semibold text-primary">Relâcher pour importer</span>
                  </div>
                )}

                {/* Badge PDF / Email importé */}
                {fichier && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-xs font-medium text-primary flex-1 truncate">{fichier.name}</span>
                      {estPdf(fichier) && (
                        <button
                          onClick={() => basculerApercu(fichier, fichier.name)}
                          title={apercu?.name === fichier.name ? 'Masquer l\'aperçu' : 'Aperçu du document'}
                          className="text-primary/70 hover:text-primary shrink-0"
                        >{apercu?.name === fichier.name ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
                      )}
                      <button onClick={() => { setFichier(null); setEmlPdfs([]); setApercu(null); }} className="text-primary/60 hover:text-destructive shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    {/* PDF supplémentaires de l'email */}
                    {emlPdfs.length > 1 && emlPdfs.slice(1).map((p, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-muted/50 border border-border">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground flex-1 truncate">{p.name}</span>
                        <button
                          onClick={() => basculerApercu(p.buffer, p.name)}
                          title={apercu?.name === p.name ? 'Masquer l\'aperçu' : 'Aperçu de cette pièce jointe'}
                          className="text-muted-foreground hover:text-primary shrink-0"
                        >{apercu?.name === p.name ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
                        <span className="text-xs text-muted-foreground">pj {i + 2}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Textarea + bouton dictée */}
                <div className="relative">
                  <Textarea
                    placeholder={fichier ? 'Texte complémentaire (optionnel)…' : 'Coller texte, email, commande…\nou glisser un PDF / Excel / .eml\nou dicter →'}
                    value={texte}
                    onChange={e => setTexte(e.target.value)}
                    className={`font-mono text-xs border-0 bg-transparent shadow-none focus-visible:ring-0 resize-none p-0 placeholder:text-muted-foreground/60 ${result ? 'min-h-[60px]' : 'min-h-[100px] sm:min-h-[140px]'}`}
                  />
                  <div className="absolute top-0 right-0">
                    <VoiceButton
                      onTranscript={t => setTexte(prev => prev ? prev + ' ' + t : t)}
                    />
                  </div>
                </div>

                {/* Bouton parcourir PDF */}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="self-start flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {fichier ? 'Changer le fichier' : 'Parcourir PDF, Excel, email (.eml)…'}
                </button>
                <input ref={fileRef} type="file"
                  accept="application/pdf,.eml,message/rfc822,.xlsx,.xls,.csv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className="hidden"
                  onChange={async e => {
                    const f = e.target.files?.[0]; e.target.value = '';
                    if (!f) return;
                    if (f.name.toLowerCase().endsWith('.eml') || f.type === 'message/rfc822') {
                      const eml = await parseEml(f);
                      if (eml.texte) setTexte(eml.texte);
                      if (eml.contact) emlContactRef.current = eml.contact;
                      if (eml.pdfBuffers.length > 0) {
                        setEmlPdfs(eml.pdfBuffers);
                        const blob = new Blob([eml.pdfBuffers[0].buffer], { type: 'application/pdf' });
                        setFichier(new File([blob], eml.pdfBuffers[0].name, { type: 'application/pdf' }));
                      }
                    } else if (/\.(xlsx|xls|csv|ods)$/i.test(f.name) || f.type.includes('spreadsheet') || f.type.includes('excel') || f.type === 'text/csv') {
                      try {
                        const xls = await parseExcel(f);
                        if (xls.texte) {
                          setTexte(xls.texte);
                          setFichier(null); setEmlPdfs([]);
                          toast.success(`Excel importé : ${f.name} (${xls.feuilles.length} feuille${xls.feuilles.length > 1 ? 's' : ''})`);
                          lancerAnalyse(null, xls.texte, []);
                        }
                      } catch { toast.error('Impossible de lire le fichier Excel'); }
                    } else {
                      setFichier(f);
                      lancerAnalyse(f, texte, emlPdfs);
                    }
                  }} />
              </div>

              {/* Aperçu avant analyse (pendant la correction, il est affiché plus bas) */}
              {!result && panneauApercu}

              <Button onClick={handleAnalyse} disabled={loading || (!fichier && !texte.trim())} className="w-full">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyse en cours…</> : <><ScanText className="w-4 h-4 mr-2" />Analyser</>}
              </Button>

              {result && (
                <Button variant="outline" onClick={reset} className="w-full">
                  <X className="w-4 h-4 mr-2" />Nouvelle analyse
                </Button>
              )}
            </div>

            {/* ══ Résultats / loading ══ */}
            {(result || loading) && (
              <div className="flex flex-col gap-4 mt-4 border-t border-border pt-4">

                {/* ── Skeleton pendant l'analyse ── */}
                {loading && !result && (
                  <div className="flex flex-col items-center justify-center flex-1 gap-4 py-12 text-muted-foreground">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-sm font-medium">Analyse IA en cours…</p>
                    <p className="text-xs text-center max-w-xs">Le document est lu et interprété par le modèle.</p>
                  </div>
                )}

                {result && (<>

                {/* ── En-tête : type + sélecteur correction ── */}
                {typeMeta && (
                  <div className="flex items-center gap-3 flex-wrap">
                    {result.typeDocument !== 'autre' && (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide ${typeMeta.color}`}>
                        {result.typeDocument === 'facture_fournisseur' || result.typeDocument === 'facture_client'
                          ? <Receipt className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                        {typeMeta.label}
                      </span>
                    )}
                    <Select value={result.typeDocument} onValueChange={handleChangeType}>
                      <SelectTrigger className="h-7 text-xs w-auto gap-1 px-2.5 border-dashed text-muted-foreground hover:text-foreground">
                        <span>Corriger le type</span>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(TYPE_LABELS) as [TypeDocument, { label: string; color: string }][])
                          .filter(([key]) => key !== 'autre')
                          .map(([key, meta]) => (
                            <SelectItem key={key} value={key}>
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                            </SelectItem>
                          ))}
                        <SelectSeparator />
                        <SelectItem value="creer_client">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                            <Users className="w-3.5 h-3.5" />Créer client
                          </span>
                        </SelectItem>
                        <SelectItem value="creer_fournisseur">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-info">
                            <Truck className="w-3.5 h-3.5" />Créer fournisseur
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* ── Aperçu du document pendant la correction ── */}
                {estPdf(fichier) && !apercu && (
                  <button
                    onClick={() => ouvrirApercu(fichier as File, (fichier as File).name)}
                    className="self-start inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  ><Eye className="w-3.5 h-3.5" /> Voir le document pour vérifier</button>
                )}
                {panneauApercu}

                {/* ── Bandeaux match / no-match ── */}
                {matchedCF && (
                  <div className="flex items-center gap-2.5 rounded-lg bg-success/10 border border-success/20 text-success px-4 py-2.5 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <div>
                      <span className="font-semibold">Commande trouvée</span>
                      <span className="text-success/80"> · {matchedCF.numero}{fournisseurMatch ? ` — ${fournisseurMatch.societe}` : ''}</span>
                    </div>
                  </div>
                )}
                {noMatchCF && (
                  <div className="flex items-center gap-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2.5 text-sm font-medium dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{result.numeroDocument ? `N° ${result.numeroDocument} non trouvé dans le CRM` : 'Aucune commande correspondante'}</span>
                  </div>
                )}

                {/* ── Strip montants (si présents) ── */}
                {(result.totalHT != null || result.totalTTC != null) && (
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {result.totalHT != null && (
                      <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5 sm:px-4 sm:py-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-0.5">Total HT</p>
                        <p className="text-base sm:text-lg font-bold tabular-nums">{result.totalHT.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
                      </div>
                    )}
                    {result.totalTTC != null && (
                      <div className="rounded-lg bg-primary/8 border border-primary/20 px-3 py-2.5 sm:px-4 sm:py-3">
                        <p className="text-[10px] text-primary/70 uppercase tracking-widest font-semibold mb-0.5">Total TTC</p>
                        <p className="text-base sm:text-lg font-bold text-primary tabular-nums">{result.totalTTC.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Ce que l'analyse a lu, brut ──────────────────────────
                    Replié par défaut. C'est l'état AVANT correction : les
                    articles n'y sont pas rapprochés, les prix y valent 1 €
                    faute de tarif, et le nom lu dans le message peut être
                    celui d'une assistante. Le panneau de devis, plus bas,
                    porte la version corrigée — c'est elle qui compte. Ce
                    détail reste consultable pour vérifier ce qui a été
                    compris, pas pour être lu à chaque fois. */}
                <details className="rounded-lg border border-border overflow-hidden group">
                  <summary className="bg-muted/40 px-4 py-2 cursor-pointer select-none list-none flex items-center gap-2">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Détail de l’analyse
                    </span>
                  </summary>
                <div className="overflow-hidden">
                  <div className="bg-muted/40 px-4 py-2 border-y border-border">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Informations extraites</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-border">
                    {([
                      result.numeroDocument  && ['N° document',   result.numeroDocument],
                      /* On montre la société retrouvée, pas le nom deviné : le
                         modèle avait retenu « Manue » sur un message signé de
                         ce prénom, quand l'expéditeur était REFLEX
                         SIGNALISATION. Le nom deviné reste affiché à côté
                         quand il apporte autre chose. */
                      /* Une société identifiée porte l'étiquette « Client ».
                         Un nom simplement lu dans le texte ne la porte jamais :
                         « Manue » est la personne à qui le message est adressé,
                         et l'afficher comme client donnait à croire qu'il avait
                         été retrouvé. On ordonne : la société retenue dans
                         MonCRM, sinon celle qu'Odoo a reconnue, sinon rien. */
                      (() => {
                        const cl = clients.find(c => c.id === (creerDevisClientId || creerCCClientId));
                        const societe = cl?.societe || cl?.nom || contratOdoo?.societe;
                        return societe
                          ? [isFournisseurDoc(result.typeDocument) ? 'Fournisseur' : 'Client', societe]
                          : false;
                      })(),
                      /* Le nom lu dans le message n'est plus affiché : dès lors
                         que la société est identifiée et le contact désigné,
                         il n'apprend rien et sème le doute — « Manue » est la
                         personne à qui l'on écrit, pas celle avec qui l'on
                         traite. Il reste dans le détail de l'analyse, replié,
                         pour qui veut vérifier ce que le modèle a compris. */
                      /* Ce que l'image de signature a livré : sur cette
                         demande, tout le bloc de Thierry BARAILLER était dans
                         un PNG, invisible au texte. */
                      signature?.nom && ['Contact (signature)',
                        signature.fonction ? `${signature.nom} — ${signature.fonction}` : signature.nom],
                      signature?.mobile && ['Mobile (signature)', signature.mobile],
                      signature?.telephone && ['Téléphone (signature)', signature.telephone],
                      signature?.email && ['Courriel (signature)', signature.email],
                      result.referencePartenaire && ['Réf. partenaire', result.referencePartenaire],
                      result.dateDocument    && ['Date',          new Date(result.dateDocument).toLocaleDateString('fr-FR')],
                      result.dateLivraisonPrevue && ['Livraison',  new Date(result.dateLivraisonPrevue).toLocaleDateString('fr-FR')],
                      result.dateEcheance    && ['Échéance',       new Date(result.dateEcheance).toLocaleDateString('fr-FR')],
                      // `filter(Boolean)` ne restreint pas le type : TypeScript
                      // continuait de croire qu'une case pouvait valoir `false`
                      // et refusait de la déstructurer. Ce test-ci le dit.
                    ] as ([string, string] | '' | false | undefined)[])
                      .filter((e): e is [string, string] => Array.isArray(e))
                      .map(([label, value], i) => (
                      <div key={i} className="bg-background px-4 py-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-0.5">{label}</p>
                        <p className="text-sm font-semibold truncate" title={value}>{value}</p>
                      </div>
                    ))}
                  </div>
                  {result.notes && (
                    <div className="bg-background px-4 py-2.5 border-t border-border">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-0.5">Notes</p>
                      <p className="text-xs text-muted-foreground italic">{result.notes}</p>
                    </div>
                  )}
                </div>

                {/* ── Lignes ── */}
                {result.lignes.length > 0 && (
                  <div className="overflow-hidden">
                    <div className="bg-muted/40 px-4 py-2 border-y border-border flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Lignes lues ({result.lignes.length})</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/20">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-[11px]">Description</th>
                            <th className="text-center px-2 py-2 font-semibold text-muted-foreground text-[11px]">Qté</th>
                            <th className="hidden sm:table-cell text-right px-3 py-2 font-semibold text-muted-foreground text-[11px] whitespace-nowrap">P.U. HT</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-[11px] whitespace-nowrap">Total HT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {result.lignes.map((l, i) => {
                            /* Une demande de devis n'annonce aucun prix : c'est
                               le contrat du client qui le donne. Afficher un
                               tiret revenait à cacher le seul chiffre utile. */
                            const pu = l.prixUnitaireHT ?? (
                              isDevisClient ? prixDe(produitDeLigne(i)) : null
                            );
                            const total = pu != null ? pu * l.quantite : null;
                            return (
                              <tr key={i} className="hover:bg-muted/20 transition-colors">
                                <td className="px-3 py-2 max-w-[180px] sm:max-w-[240px]">
                                  {l.reference && <span className="block font-mono text-[10px] text-muted-foreground">{l.reference}</span>}
                                  {l.description || '—'}
                                </td>
                                <td className="px-2 py-2 text-center font-bold text-sm">{l.quantite}</td>
                                <td className="hidden sm:table-cell px-3 py-2 text-right whitespace-nowrap text-muted-foreground">{pu != null ? pu.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">{total != null ? total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                </details>

                {/* ═══ ACTION : commande fournisseur existante ═══ */}
                {matchedCF && (
                  matchedCF.statut !== 'recue' && matchedCF.statut !== 'payee' ? (
                    <Button onClick={() => setReceptionOpen(true)} size="lg" className="w-full">
                      <Package className="w-4 h-4 mr-2" />Enregistrer la réception
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground py-2">
                      <CheckCircle2 className="w-4 h-4 text-success" />Déjà réceptionnée
                    </div>
                  )
                )}

                {/* ═══ ACTION : créer commande fournisseur ═══ */}
                {noMatchCF && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                          <PlusCircle className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Créer comme commande reçue</p>
                          <p className="text-[11px] text-muted-foreground">Enregistrer dans les achats fournisseurs</p>
                        </div>
                      </div>
                      <button onClick={() => setShowCreerCF(v => !v)} className="text-xs text-primary hover:underline shrink-0">{showCreerCF ? 'Masquer' : 'Configurer'}</button>
                    </div>
                    {showCreerCF && (
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1"><Label className="text-xs">Fournisseur *</Label>
                            <Select value={creerCFFournisseurId} onValueChange={setCreerCFFournisseurId}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                              <SelectContent>{fournisseurs.map(f => <SelectItem key={f.id} value={f.id}>{f.societe || f.nom}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1"><Label className="text-xs">N° commande *</Label><Input className="h-8 text-xs" value={creerCFNumero} onChange={e => setCreerCFNumero(e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Date réception *</Label><Input className="h-8 text-xs" type="date" value={creerCFDateReception} onChange={e => setCreerCFDateReception(e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Livraison client</Label><Input className="h-8 text-xs" type="date" value={creerCFDateLivraison} onChange={e => setCreerCFDateLivraison(e.target.value)} /></div>
                        </div>
                        <div className="space-y-1"><Label className="text-xs">Notes</Label><Input className="h-8 text-xs" value={creerCFNotes} onChange={e => setCreerCFNotes(e.target.value)} /></div>
                      </div>
                    )}
                    <Button onClick={() => showCreerCF ? handleCreerCF() : setShowCreerCF(true)} className="w-full" size="sm">
                      <PlusCircle className="w-4 h-4 mr-2" />{showCreerCF ? 'Confirmer la création' : 'Créer la commande reçue'}
                    </Button>
                  </div>
                )}

                {/* ═══ ACTION : créer devis ═══ */}
                {isDevisClient && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Créer comme devis</p>
                          <p className="text-[11px] text-muted-foreground">Enregistrer dans les devis clients</p>
                        </div>
                      </div>
                      <button onClick={() => setShowCreerDevis(v => !v)} className="text-xs text-primary hover:underline shrink-0">{showCreerDevis ? 'Masquer' : 'Configurer'}</button>
                    </div>
                    {showCreerDevis && (
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1"><Label className="text-xs">Client *</Label>
                            <Select value={creerDevisClientId} onValueChange={setCreerDevisClientId}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                              <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.societe || c.nom}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          {rechercheOdoo('devis')}
                          <div className="space-y-1"><Label className="text-xs">N° devis *</Label><Input className="h-8 text-xs" value={creerDevisNumero} onChange={e => setCreerDevisNumero(e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Date *</Label><Input className="h-8 text-xs" type="date" value={creerDevisDate} onChange={e => setCreerDevisDate(e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Validité</Label><Input className="h-8 text-xs" type="date" value={creerDevisValidite} onChange={e => setCreerDevisValidite(e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Réf. affaire</Label><Input className="h-8 text-xs" value={creerDevisRefAffaire} onChange={e => setCreerDevisRefAffaire(e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Notes</Label><Input className="h-8 text-xs" value={creerDevisNotes} onChange={e => setCreerDevisNotes(e.target.value)} /></div>
                        </div>

                        {clientOdoo && !creerDevisClientId && (
                          <div className="rounded-lg border border-warning/40 bg-warning/5 p-2 space-y-1.5">
                            <p className="text-[11px]">
                              <strong>{clientOdoo.societe}</strong> existe dans Odoo mais pas
                              encore dans MonCRM.
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {[clientOdoo.email, clientOdoo.telephone,
                                [clientOdoo.codePostal, clientOdoo.ville].filter(Boolean).join(' ')]
                                .filter(Boolean).join(' · ')}
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                const id = generateId();
                                updateClients(prev => [...prev, {
                                  id,
                                  nom: clientOdoo.nom,
                                  societe: clientOdoo.societe,
                                  email: clientOdoo.email,
                                  telephone: clientOdoo.telephone,
                                  adresse: clientOdoo.adresse,
                                  ville: clientOdoo.ville,
                                  codePostal: clientOdoo.codePostal,
                                  dateCreation: today(),
                                  adressesLivraison: [],
                                } as any]);
                                setCreerDevisClientId(id);
                                setClientOdoo(null);
                                toast.success(`${clientOdoo.societe} créé depuis Odoo`);
                              }}
                            >
                              Créer ce client depuis Odoo
                            </Button>
                          </div>
                        )}

                        {contratOdoo && (
                          <div className="rounded-lg border border-primary/30 bg-primary/5 px-2 py-1.5 text-[11px]">
                            {/* DEUX CHOSES DISTINCTES, longtemps confondues ici.
                                `contrat` est la LISTE DE PRIX Odoo — « APPLIQU
                                SIGNA (ISO-STI) » — et cette étiquette l'appelait
                                « Contrat cadre ». Le vrai contrat-cadre est
                                l'objet Studio « CCI10019 TARIF R4 … », et c'est
                                LUI qui tarife. Tant que les deux portaient le
                                même nom à l'écran, son absence était invisible. */}
                            {contratOdoo.cadreActif && contratOdoo.cadre && !contratOdoo.niveauParDefaut ? (
                              <>Contrat cadre <strong>{contratOdoo.cadre}</strong></>
                            ) : (
                              contratOdoo.niveauParDefaut && contratOdoo.cadre ? (
                                <span className="text-warning">
                                  <AlertTriangle className="inline w-3 h-3 mr-1" />
                                  Aucun contrat rattaché à ce client : grille{' '}
                                  <strong>{contratOdoo.niveauApplique}</strong> appliquée
                                  par défaut — <strong>{contratOdoo.cadre}</strong>
                                </span>
                              ) : (
                                <span className="text-warning">
                                  <AlertTriangle className="inline w-3 h-3 mr-1" />
                                  Aucun contrat cadre trouvé pour ce client — les prix
                                  viennent de la liste de prix, pas du bordereau
                                </span>
                              )
                            )}
                            <span className="text-muted-foreground">
                              {' '}· liste de prix <strong>{contratOdoo.contrat}</strong>
                            </span>
                           {contratOdoo.societe && <> chez <strong>{contratOdoo.societe}</strong></>}
                            {contratOdoo.societeIncertaine && (
                              <span
                                className="ml-1.5 inline-flex items-center gap-1 text-warning"
                                title="Cette fiche Odoo n'a pas de société rattachée : « chez ... » affiche le nom d'un simple contact (souvent une adresse de livraison mal reliée à sa société). À vérifier/corriger dans Odoo."
                              >
                                <AlertTriangle className="w-3 h-3" />
                                nom de contact, pas de société liée dans Odoo
                              </span>
                            )}
                          </div>
                        )}

                        {/* Odoo muet, et on dit pourquoi. Le cas typique est le
                            copier-coller : Outlook ne met pas les en-têtes dans
                            le presse-papiers, et la signature est une image qui
                            ne se colle pas. */}
                        {odooMuet === 'sans-client' && (
                          <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-[11px] space-y-0.5">
                            <p className="font-medium text-warning">
                              Odoo n’a pas été interrogé : aucun client identifié dans le texte.
                            </p>
                            <p className="text-muted-foreground">
                              Ni adresse électronique, ni raison sociale. C’est fréquent sur un
                              copier-coller — les en-têtes et la signature ne suivent pas.
                              Choisissez le client ci-dessus : le contrat cadre, les contacts et
                              les articles Odoo se chargeront aussitôt.
                            </p>
                          </div>
                        )}

                        {/* Interlocuteur de l'affaire. La demande peut être
                            transmise par une assistante ; le contact du dossier
                            est une autre personne, et c'est un choix. */}
                        {contactsOdoo.length > 0 && (
                          <div className="space-y-1 pt-1">
                            <Label className="text-xs">Contact de l’affaire</Label>
                            <Select value={contactRetenu || '__aucun__'}
                              onValueChange={v => setContactRetenu(v === '__aucun__' ? '' : v)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="À désigner" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__aucun__">À désigner</SelectItem>
                                {contactsOdoo.map(c => (
                                  <SelectItem key={c.id} value={String(c.id)}>
                                    {c.nom}{c.fonction ? ` — ${c.fonction}` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {(() => {
                              const c = contactsOdoo.find(x => String(x.id) === contactRetenu);
                              if (!c) return null;
                              const bouts = [c.email, c.mobile || c.telephone].filter(Boolean);
                              return bouts.length
                                ? <p className="text-[11px] text-muted-foreground">{bouts.join(' · ')}</p>
                                : null;
                            })()}
                          </div>
                        )}

                        {/* Gamme et classe : elles décident du prix bien plus
                            que le code du panneau. Un B14 en petite classe 2
                            vaut 46,62 € ; le même en normale, 67,06 €. */}
                        {(result?.lignes ?? []).some(l =>
                          codeDansTexte([l.reference, l.description].filter(Boolean).join(' '))) && (
                          <div className="flex items-end gap-2 pt-1">
                            <div className="space-y-1">
                              <Label className="text-xs">Gamme</Label>
                              <Select value={gammePanneau} onValueChange={v => setGammePanneau(v as Taille)}>
                                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="M">Mini</SelectItem>
                                  <SelectItem value="P">Petite</SelectItem>
                                  <SelectItem value="N">Normale</SelectItem>
                                  <SelectItem value="G">Grande</SelectItem>
                                  <SelectItem value="TG">Très grande</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Classe</Label>
                              <Select value={String(classePanneau)} onValueChange={v => setClassePanneau(Number(v))}>
                                <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">Classe 1</SelectItem>
                                  <SelectItem value="2">Classe 2</SelectItem>
                                  <SelectItem value="3">Classe 3</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {/* NIVEAU DE REMISE, FORÇABLE.
                                Il se lit normalement dans l'intitulé du contrat
                                cadre — « TARIF R4 » — mais tous ne le portent
                                pas, et il arrive qu'on doive en imposer un
                                autre : le contrat CCI10019 a lui-même été forcé
                                sur le devis AF035816. */}
                            <div className="flex items-center gap-2 pb-1.5 text-[11px]">
                              <span className="text-muted-foreground">grille ISOSIGN 2026, tarif</span>
                              <select
                                className="rounded border px-1 py-0.5 text-[11px]"
                                value={niveauForce}
                                onChange={e => setNiveauForce(e.target.value as '' | 'R1' | 'R2' | 'R3' | 'R4')}
                              >
                                {/* Une entrée « automatique » explicite : sans elle,
                                    le sélecteur affichait déjà « R4 » et choisir R4
                                    ne déclenchait aucun changement — impossible de
                                    forcer le niveau qui se trouvait être le défaut. */}
                                <option value="">{niveauRemise} — automatique</option>
                                <option value="R1">R1 — 20 %</option>
                                <option value="R2">R2 — 25 %</option>
                                <option value="R3">R3 — 30 %</option>
                                <option value="R4">R4 — 35 %</option>
                              </select>
                              <span className={niveauForce ? 'text-warning' : 'text-muted-foreground'}>
                                {niveauForce
                                  ? 'forcé à la main'
                                  : (niveauDepuisContrat(contratOdoo?.contrat)
                                      ? 'lu dans le contrat cadre'
                                      : 'valeur par défaut, aucun niveau lisible dans le contrat')}
                              </span>
                              {niveauForce && (
                                <button
                                  onClick={() => setNiveauForce('')}
                                  className="text-warning hover:underline"
                                  title="Revenir au niveau du contrat cadre"
                                >↺</button>
                              )}
                            </div>
                            {/* COPIE LOCALE DES GRILLES.
                                Les quatre grilles vivent dans Supabase, pas dans
                                Odoo à chaque appel. Odoo reste la source : cette
                                copie se refait à la demande, et sa date doit
                                rester visible — une grille périmée ressemble
                                trait pour trait à une grille à jour. */}
                            <div className="flex items-center gap-2 pb-1.5 text-[10px]">
                              <span className={grilleMaj ? 'text-muted-foreground' : 'text-warning'}>
                                {grilleMaj === null
                                  ? 'Grilles R1–R4 : vérification…'
                                  : grilleMaj
                                    ? `Grilles R1–R4 copiées le ${new Date(grilleMaj).toLocaleString('fr-FR')}`
                                    : 'Grilles R1–R4 jamais copiées — les prix sont lus directement chez Odoo, plus lentement'}
                              </span>
                              <button
                                onClick={synchroniserGrilles}
                                disabled={grilleEnCours}
                                className="rounded border px-1.5 py-0.5 hover:bg-primary/10 disabled:opacity-50"
                              >
                                {grilleEnCours ? 'Synchronisation…' : 'Synchroniser depuis Odoo'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* FRAIS DE TRANSPORT — produits plastique STI.
                            Le barème est au département de LIVRAISON, pas de
                            facturation : un client facturé à Porcheville peut
                            se faire livrer ailleurs, et le tarif change. */}
                        <div className="space-y-1 pt-1">
                          <Label className="text-xs">Livraison et transport</Label>
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="shrink-0">Département :</span>
                            <input
                              className="w-16 rounded border px-1 py-0.5 text-[11px]"
                              value={dptLivraison || livraison.dpt}
                              placeholder="ex. 78"
                              onChange={e => setDptLivraison(e.target.value.replace(/[^0-9AaBb]/g, '').slice(0, 3).toUpperCase())}
                            />
                            {livraison.origine && (
                              <span className={`truncate ${livraison.origine.includes('à défaut') ? 'text-warning' : 'text-muted-foreground'}`}>
                                {livraison.origine}
                              </span>
                            )}
                            {dptLivraison && (
                              <button
                                onClick={() => setDptLivraison('')}
                                className="text-warning hover:underline shrink-0"
                                title="Revenir à ce que le document indique"
                              >↺</button>
                            )}
                          </div>
                          {!livraison.dpt ? (
                            <p className="text-[11px] text-warning">
                              Sans département de livraison, le transport ne se chiffre pas.
                            </p>
                          ) : transport ? (
                            <div className="rounded border border-primary/30 bg-primary/5 p-1.5 space-y-0.5 text-[11px]">
                              {transport.detail.map(d => (
                                <div key={d.texte} className="flex gap-2" title={d.explication}>
                                  <span className="font-mono text-[10px] truncate flex-1">{d.texte}</span>
                                  <span className="font-semibold shrink-0">{formatMontant(d.montant)}</span>
                                </div>
                              ))}
                              {transport.isosign && (
                                <div className="flex gap-2" title={transport.isosign.explication}>
                                  <span className="flex-1 truncate">
                                    Port ISOSIGN{transport.isosign.avecSupport ? ' (avec support)' : ''}
                                  </span>
                                  <span className="font-semibold shrink-0">
                                    {transport.isosign.offert
                                      ? 'offert'
                                      : formatMontant(transport.isosign.montant)}
                                  </span>
                                </div>
                              )}
                              {transport.gammes.map(g => (
                                <div key={g.explication} className="flex gap-2" title={g.explication}>
                                  <span className="flex-1 truncate">
                                    Port {g.gamme}{g.explication.startsWith('H2') ? ' H2 (usine)' : g.gamme === 'ISOMARK' ? ' H1' : ''}
                                    {g.poidsIncomplet && <span className="text-warning"> · poids partiel</span>}
                                  </span>
                                  <span className="font-semibold shrink-0">
                                    {g.offert ? 'offert' : formatMontant(g.montant)}
                                  </span>
                                </div>
                              ))}
                              <div className="flex gap-2 border-t border-primary/20 pt-0.5">
                                <span className="flex-1 font-medium">Transport</span>
                                <span className="font-bold">{formatMontant(transport.total)}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                Des expéditions distinctes, additionnées : le plastique part
                                de chez STI — messagerie ou affrètement, le moins cher — les
                                panneaux et supports de chez ISOSIGN, au forfait, ISOMARK H2
                                de son usine, ISOFLOOR au poids, franco à deux tonnes hors
                                granulats.
                              </p>
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">
                              Aucun produit plastique STI dans cette demande : rien à chiffrer
                              avec ce barème.
                            </p>
                          )}
                        </div>

                        {/* Lignes demandées : quantité et choix de l'article.
                            Un client écrit « J11 » ; le catalogue en compte
                            plusieurs déclinaisons — c'est à vous de trancher. */}
                        {(result?.lignes ?? []).length > 0 && (
                          <div className="space-y-2 pt-1">
                            <Label className="text-xs">Articles demandés</Label>
                            {(result?.lignes ?? []).map((l, i) => {
                              const candidats = candidatsPour(i);
                              const retenu = produitDeLigne(i);
                              const rap = rapprochements.get(i);
                              const sysRap = systemesDetectes.get(i);
                              return (
                                <div key={i} className="rounded-lg border border-border p-2 space-y-1.5">
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${sysRap
                                      ? 'bg-primary/15 text-primary'
                                      : 'bg-muted text-muted-foreground'}`}>
                                      {sysRap ? 'système' : 'demandé'}
                                    </span>
                                    {/* LE LIBELLÉ SE CORRIGE SUR PLACE.
                                        « Flowshield confort » sans épaisseur,
                                        une référence mal lue : plutôt que de
                                        relancer l'analyse pour un mot, on
                                        rectifie ici et tout suit. Champ non
                                        contrôlé, validé à la sortie ou par
                                        Entrée — le rapprochement balaie 22 634
                                        articles, il ne peut pas le faire à
                                        chaque touche. */}
                                    <input
                                      key={`lib-${i}`}
                                      defaultValue={texteDemande(l, i)}
                                      onBlur={e => {
                                        const v = e.target.value.trim();
                                        const origine = [l.reference, l.description]
                                          .filter(Boolean).join(' ').trim();
                                        setLibelleManuel(pr => {
                                          const n = { ...pr };
                                          if (!v || v === origine) delete n[i]; else n[i] = v;
                                          return n;
                                        });
                                      }}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') e.currentTarget.blur();
                                        if (e.key === 'Escape') {
                                          e.currentTarget.value = texteDemande(l, i);
                                          e.currentTarget.blur();
                                        }
                                      }}
                                      title="Corrigez le libellé si le système ou l'article n'est pas reconnu"
                                      className="flex-1 min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5
                                                 font-medium hover:border-border focus:border-primary focus:bg-background
                                                 focus:outline-none"
                                    />
                                    {/* Dire ce qui a été compris de la demande, et
                                        ce qui n'a pas été trouvé. Un « à choisir »
                                        explicite vaut mieux qu'un article retenu
                                        au hasard et chiffré avec assurance. */}
                                    {!sysRap && !choixProduit[i] && rap && rap.confiance !== 'sure' && (
                                      <span className="ml-auto text-[11px] text-destructive">
                                        à choisir — {rap.pourquoi}
                                      </span>
                                    )}
                                    {!sysRap && !choixProduit[i] && rap?.confiance === 'sure' && candidats.length > 1 && (
                                      <span className="ml-auto text-[11px] text-warning">
                                        {rap.pourquoi} · {candidats.length} candidats
                                      </span>
                                    )}
                                    {sysRap && (
                                      <span className="ml-auto text-[11px] text-primary">
                                        {sysRap.pourquoi}
                                      </span>
                                    )}
                                  </div>

                                  {/* ── LA DEMANDE NOMME UN SYSTÈME ─────────
                                      Pas un article : une mise en œuvre, qui
                                      se décline en primaire, couche de masse
                                      et finition. On chiffre les composants,
                                      chacun au dosage de sa fiche, et on
                                      convertit les kilogrammes en contenants
                                      — on n'achète pas huit dixièmes de
                                      seau. */}
                                  {sysRap && (() => {
                                    const sys = systemeDeLigne(i);
                                    const surface = surfaceDeLigne(i, l.quantite);
                                    const declinees = lignesSystemeDe(i, l.quantite);
                                    const totalHT = declinees.reduce((s, ls) => {
                                      const p = ls.composant.produitId
                                        ? produitParId(produits, ls.composant.produitId) : undefined;
                                      const cle = `d${i}:${ls.composant.id}`;
                                      return s + quantiteComposant(i, ls) * prixDe(p, undefined, cle);
                                    }, 0);
                                    const facultatifs = (sys?.composants ?? []).filter(c => !c.obligatoire);
                                    return (
                                      <div className="rounded border border-primary/30 bg-primary/5 p-1.5 space-y-1.5 text-[11px]">
                                        <div className="flex items-center gap-2">
                                          <span className="shrink-0 text-muted-foreground">Surface :</span>
                                          <Input
                                            type="number" min={0} step="0.1" value={surface}
                                            onChange={e => setSurfaceSysteme(pr => ({
                                              ...pr, [i]: Math.max(0, Number(e.target.value) || 0),
                                            }))}
                                            className="h-7 w-24 text-xs"
                                          />
                                          <span className="text-muted-foreground">m²</span>
                                          {sysRap.variantes.length > 1 && (
                                            <select
                                              className="ml-auto rounded border bg-background px-1 py-0.5 text-[11px]"
                                              value={sys?.id ?? ''}
                                              onChange={e => setVarianteSysteme(pr => ({ ...pr, [i]: e.target.value }))}
                                            >
                                              <option value="">— variante à choisir —</option>
                                              {sysRap.variantes.map(v => (
                                                <option key={v.id} value={v.id}>{v.variante || v.nom}</option>
                                              ))}
                                            </select>
                                          )}
                                        </div>

                                        {!sys ? (
                                          <p className="text-warning">
                                            Choisissez la variante : les dosages en dépendent.
                                          </p>
                                        ) : (
                                          <>
                                            {/* Les composants facultatifs — primaire au
                                                choix, finition en option — ne sont jamais
                                                cochés d'office : la fiche les propose, le
                                                chantier les décide. */}
                                            {facultatifs.length > 0 && (
                                              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                                                {facultatifs.map(c => (
                                                  <label key={c.id} className="flex items-center gap-1 cursor-pointer">
                                                    <input
                                                      type="checkbox"
                                                      checked={!!optionsSysteme[`${i}:${c.id}`]}
                                                      onChange={e => setOptionsSysteme(pr => ({
                                                        ...pr, [`${i}:${c.id}`]: e.target.checked,
                                                      }))}
                                                    />
                                                    <span title={c.condition || c.phraseSource}>
                                                      {c.libelle}
                                                      {c.consommation != null ? ` · ${c.consommation} kg/m²` : ''}
                                                    </span>
                                                  </label>
                                                ))}
                                              </div>
                                            )}

                                            <div className="space-y-1 pt-0.5">
                                              {declinees.map((ls) => {
                                                const p = ls.composant.produitId
                                                  ? produitParId(produits, ls.composant.produitId) : undefined;
                                                const cle = `d${i}:${ls.composant.id}`;
                                                const q = quantiteComposant(i, ls);
                                                const pu = prixDe(p, undefined, cle);
                                                return (
                                                  <div key={ls.composant.id} className="flex items-center gap-1.5">
                                                    <span
                                                      className="flex-1 min-w-0 truncate"
                                                      title={[
                                                        `${ls.composant.role} — ${p?.description || ls.composant.libelle}`,
                                                        ls.composant.condition,
                                                        ls.composant.phraseSource,
                                                      ].filter(Boolean).join('\n')}
                                                    >
                                                      <span className="text-muted-foreground">{ls.composant.role} · </span>
                                                      {p?.description || ls.composant.libelle}
                                                    </span>
                                                    <span className="w-20 shrink-0 text-right text-muted-foreground" title={ls.explication}>
                                                      {ls.quantiteKg ? `${ls.quantiteKg} kg` : '—'}
                                                    </span>
                                                    <Input
                                                      type="number" min={0} step="1" value={q}
                                                      onChange={e => setQuantiteManuelle(pr => ({
                                                        ...pr, [cle]: Math.max(0, Number(e.target.value) || 0),
                                                      }))}
                                                      className="h-6 w-14 shrink-0 text-[11px]"
                                                    />
                                                    <span className="w-16 shrink-0 text-muted-foreground">
                                                      {p?.poids ? `× ${p.poids} kg` : 'kg'}
                                                    </span>
                                                    <span className="w-44 shrink-0 text-right">
                                                      {p
                                                        ? <>{formatMontant(pu)} → <strong className="text-foreground">{formatMontant(pu * q)}</strong></>
                                                        : <span className="text-destructive">absent du catalogue — prix à saisir</span>}
                                                    </span>
                                                  </div>
                                                );
                                              })}
                                            </div>

                                            <div className="flex items-center justify-between border-t border-primary/20 pt-1">
                                              <span className="text-muted-foreground">
                                                {declinees.length} composant(s) · {surface} m²
                                              </span>
                                              <span>
                                                <strong className="text-foreground">{formatMontant(totalHT)}</strong>
                                                {surface > 0 && <> — {formatMontant(totalHT / surface)}/m²</>}
                                              </span>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  {/* La quantité et le prix restent modifiables
                                      même quand l'article vient d'Odoo et non du
                                      catalogue local : ce sont justement ces
                                      lignes-là qu'on veut pouvoir ajuster. */}
                                  {(retenu || choixOdoo[i]) && (() => {
                                    const cle = `d${i}`;
                                    const odoo = choixOdoo[i];
                                    const d = odoo
                                      ? prixOdoo(odoo)
                                      : prixDetail(retenu);
                                    const qte = quantiteDe(cle, l.quantite || 1);
                                    const pu = puDeLigne(i);
                                    return (
                                      <>
                                        <div className="flex items-center gap-1.5 text-[11px]">
                                          <span className="text-muted-foreground">Qté</span>
                                          <Input
                                            type="number" min={0} step="1" value={qte}
                                            onChange={e => setQuantiteManuelle(p => ({ ...p, [cle]: Math.max(0, Number(e.target.value) || 0) }))}
                                            className="h-7 w-16 text-xs"
                                          />
                                          <span className="text-muted-foreground ml-1">P.U.</span>
                                          <Input
                                            type="number" min={0} step="0.01" value={pu}
                                            onChange={e => setPrixManuel(p => ({ ...p, [cle]: Math.max(0, Number(e.target.value) || 0) }))}
                                            className="h-7 w-24 text-xs"
                                          />
                                          <span className="text-muted-foreground">
                                            € = <strong className="text-foreground">{formatMontant(pu * qte)}</strong>
                                          </span>
                                          {prixManuel[cle] !== undefined && (
                                            <button
                                              onClick={() => setPrixManuel(p => { const n = { ...p }; delete n[cle]; return n; })}
                                              className="text-warning hover:underline"
                                            >↺</button>
                                          )}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">
                                          {prixManuel[cle] !== undefined
                                            ? 'prix saisi à la main'
                                            : d.remise
                                              ? <>{d.remise.libelle} — <strong className="text-foreground">{(d.remise.remise * 100).toFixed(0)} %</strong> sur {formatMontant(d.remise.public)} public → <strong className="text-foreground">{formatMontant(d.remise.prix)}</strong>{d.contrat != null && Math.abs(d.contrat - d.remise.prix) >= 0.01 ? <> — contrat Odoo {formatMontant(d.contrat)}</> : null}</>
                                              : d.source === 'absent'
                                                  ? <span className="text-destructive">prix à saisir — la fiche Odoo n’est pas tarifée</span>
                                                  : contratOdoo ? `contrat ${contratOdoo.contrat}` : 'tarif catalogue'}
                                        </div>
                                      </>
                                    );
                                  })()}
                                  {/* Une ligne système ne se choisit pas dans le
                                      catalogue : c'est le bloc ci-dessus qui la
                                      chiffre, composant par composant. */}
                                  {!sysRap && (
                                    <ProduitCombobox
                                      produits={candidats.length ? candidats : produits}
                                      value={retenu?.id ?? ''}
                                      onSelect={(id) => setChoixProduit(prev => ({ ...prev, [i]: id }))}
                                    />
                                  )}
                                  {/* Cet avertissement ne parle que du catalogue
                                      LOCAL. Depuis qu'un article Odoo peut être
                                      retenu d'office, l'afficher à côté de
                                      « Retenu d'office : PLASTOBLOC24GM » se
                                      contredisait : la ligne a bien un article
                                      et un prix, ils viennent d'ailleurs. */}
                                  {!sysRap && !retenu && !choixOdoo[i] && (
                                    <p className="text-[11px] text-warning">
                                      {candidats.length
                                        ? `Aucun candidat ne correspond assez pour être retenu d’office — ${candidats.length} proposition(s) ci-dessus.`
                                        : 'Aucun article trouvé — choisissez-en un ci-dessus.'}
                                    </p>
                                  )}

                                  {/* Chiffrage à la grille R4 quand la demande
                                      cite un code IISR. C'est le cas de « B14
                                      « 30 » » : aucune référence, mais une
                                      forme, une gamme et une classe suffisent
                                      à donner le prix — et à savoir ce qui
                                      l'accompagne. */}
                                  {(() => {
                                    const texte = texteDemande(l, i);
                                    const trouve = codeDansTexte(texte);
                                    if (!trouve) return null;

                                    /* Les panneaux d'agglomération se traitent
                                       avant tout le reste : ils ne se
                                       dimensionnent pas comme les autres. Le
                                       fabricant compte les caractères du nom au
                                       lieu de mesurer le texte, d'où un bloc
                                       dédié et un nom saisissable — le client
                                       ne l'écrit presque jamais dans sa
                                       demande. */
                                    const typeEB = typeAgglomeration(trouve.code);
                                    if (typeEB) {
                                      const cle = `d${i}`;
                                      const lu = nomAgglomerationDansTexte(texte, trouve.code);
                                      const nom = nomAgglo[cle] ?? lu ?? '';
                                      const hc = hcAgglo[cle] ?? HC_AGGLO_DEFAUT;
                                      const mention = mentionAgglo[cle] ?? '';
                                      const p = nom.trim()
                                        ? dimensionnerAgglomerationAuto(nom, {
                                          type: typeEB, hc, mention,
                                        }) : null;
                                      const qte = quantiteDe(cle, l.quantite || 1);
                                      return (
                                        <div className="rounded border border-primary/30 bg-primary/5 p-1.5 space-y-1 text-[11px]">
                                          <p className="font-medium text-primary">
                                            {typeEB === 'EB10' ? 'Entrée' : 'Sortie'} d’agglomération {trouve.code}
                                          </p>
                                          <div className="flex items-center gap-2">
                                            <span className="shrink-0">Nom porté :</span>
                                            <input
                                              className="flex-1 rounded border px-1 py-0.5 text-[11px] uppercase"
                                              value={nom}
                                              placeholder="ex. MOULIGNON"
                                              onChange={e => setNomAgglo(pr => ({
                                                ...pr, [cle]: e.target.value.toUpperCase(),
                                              }))}
                                            />
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="shrink-0">Hauteur de lettre :</span>
                                            <select
                                              className="rounded border px-1 py-0.5 text-[11px]"
                                              value={hc}
                                              onChange={e => setHcAgglo(pr => ({
                                                ...pr, [cle]: Number(e.target.value),
                                              }))}
                                            >
                                              <option value={100}>100 mm — jusqu’à 70 km/h</option>
                                              <option value={125}>125 mm — 80 km/h</option>
                                            </select>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="shrink-0">Mention commune :</span>
                                            <input
                                              className="flex-1 rounded border px-1 py-0.5 text-[11px]"
                                              value={mention}
                                              placeholder="facultatif — ex. c°ne de QUINCY-VOISINS"
                                              onChange={e => setMentionAgglo(pr => ({
                                                ...pr, [cle]: e.target.value,
                                              }))}
                                            />
                                          </div>
                                          {!nom.trim() ? (
                                            <p className="text-warning">
                                              Saisissez le nom : c’est sa longueur qui donne le format.
                                            </p>
                                          ) : !p ? (
                                            <p className="text-destructive">
                                              {[...nom.trim()].length} signes : trop long, même
                                              composé sur deux lignes. À traiter à la main.
                                            </p>
                                          ) : (
                                            <>
                                              <div className="flex gap-2">
                                                <span className="flex-1 truncate" title={p.explication}>
                                                  {p.largeur} × {p.hauteur} mm · {p.caracteres} signes
                                                  {p.lignes > 1 ? ` · ${p.lignes} lignes` : ''}
                                                  {p.mention ? ' · + mention' : ''}
                                                </span>
                                              </div>
                                              {p.largeurAConfirmer && (
                                                <p className="text-warning">
                                                  C’est la mention, plus longue que le nom, qui
                                                  impose ce format. Son équivalence en signes n’est
                                                  calée que sur deux plans : à vérifier.
                                                </p>
                                              )}
                                              <div className="flex gap-2 border-t border-primary/20 pt-0.5">
                                                <span className="flex-1">× {qte}</span>
                                                <span className="text-muted-foreground">
                                                  réf. à retenir ci-dessus
                                                </span>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      );
                                    }

                                    const forme = formeDeCode(trouve.code);
                                    if (!forme) return null;

                                    /* Une ligne QUI EST un panonceau se chiffre
                                       d'après le panneau qui la précède : les
                                       clients écrivent le panneau puis son
                                       panonceau, et c'est la gamme du panneau
                                       qui donne la largeur. Sans cette remontée,
                                       ces lignes ne recevaient rien du tout. */
                                    if (forme === FORME_PANONCEAU) {
                                      const porteur = porteurDeLigne(i);
                                      if (!porteur) {
                                        return (
                                          <p className="text-[11px] text-warning">
                                            {trouve.code} : aucun panneau au-dessus — sa taille
                                            dépend de celui qu’il accompagne.
                                          </p>
                                        );
                                      }
                                      const p = panonceauPour(trouve.code, porteur, {
                                        taille: gammePanneau, classe: classePanneau,
                                        niveau: niveauRemise,
                                        mention: l.description || '',
                                      });
                                      if (!p) return null;
                                      const qte = quantiteDe(`d${i}`, l.quantite || 1);
                                      return (
                                        <div className="rounded border border-primary/30 bg-primary/5 p-1.5 space-y-0.5 text-[11px]">
                                          <p className="font-medium text-primary">
                                            Panonceau {trouve.code} sous {porteur}
                                          </p>
                                          <div className="flex gap-2">
                                            <span className="flex-1 truncate" title={p.explication}>
                                              {p.dimension} · classe {classePanneau}
                                            </span>
                                            <span className="font-semibold">{formatMontant(p.prix)}</span>
                                          </div>
                                          <div className="flex gap-2 border-t border-primary/20 pt-0.5">
                                            <span className="flex-1">× {qte}</span>
                                            <span className="font-bold">{formatMontant(p.prix * qte)}</span>
                                          </div>
                                        </div>
                                      );
                                    }

                                    /* Le niveau vient du contrat cadre Odoo :
                                       « TARIF R4 » y est écrit noir sur blanc.
                                       R4 à défaut, c'est le cas courant. */
                                    const opts = {
                                      taille: gammePanneau, classe: classePanneau,
                                      niveau: niveauRemise,
                                    };
                                    const pan = prixPanneau(trouve.code, opts);
                                    if (!pan) {
                                      return (
                                        <p className="text-[11px] text-destructive">
                                          {trouve.code} en gamme {gammePanneau} classe {classePanneau} :
                                          cette taille n’existe pas au tarif.
                                        </p>
                                      );
                                    }
                                    // Le panonceau que le client demande presque
                                    // toujours avec son panneau. M9z par défaut :
                                    // la mention en toutes lettres, la plus courante.
                                    /* Le panonceau proposé d'office n'a lieu
                                       d'être que si le client n'en demande pas
                                       un lui-même à la ligne suivante. */
                                    const suivante = (result?.lignes ?? [])[i + 1];
                                    const cSuiv = suivante && codeDansTexte(
                                      [suivante.reference, suivante.description].filter(Boolean).join(' '));
                                    const panonceauDemande = !!cSuiv
                                      && formeDeCode(cSuiv.code) === FORME_PANONCEAU;
                                    const pano = panonceauDemande
                                      ? null
                                      : panonceauPour('M9z', trouve.code, opts);
                                    const hauteurs = [hauteurDeDimension(pan.dimension)];
                                    if (pano) hauteurs.push(hauteurDeDimension(pano.dimension));
                                    const sup = supportPour(hauteurs);
                                    const qte = quantiteDe(`d${i}`, l.quantite || 1);
                                    const total = (pan.prix + (pano?.prix || 0)
                                      + (sup?.prix || 0) + (sup?.prixColliers || 0)) * qte;

                                    return (
                                      <div className="rounded border border-primary/30 bg-primary/5 p-1.5 space-y-0.5 text-[11px]">
                                        <p className="font-medium text-primary">
                                          Tarif {opts.niveau} — {trouve.code}{trouve.valeur ? ` « ${trouve.valeur} »` : ''}
                                          {niveauDepuisContrat(contratOdoo?.contrat)
                                            ? <span className="font-normal opacity-70"> (contrat cadre)</span>
                                            : <span className="font-normal opacity-70"> (défaut — le contrat ne le précise pas)</span>}
                                        </p>
                                        <div className="flex gap-2">
                                          <span className="flex-1 truncate">Panneau {pan.dimension}</span>
                                          <span className="font-semibold">{formatMontant(pan.prix)}</span>
                                        </div>
                                        {pano && (
                                          <div className="flex gap-2">
                                            <span className="flex-1 truncate">Panonceau {pano.dimension}</span>
                                            <span className="font-semibold">{formatMontant(pano.prix)}</span>
                                          </div>
                                        )}
                                        {sup && (
                                          <div className="flex gap-2">
                                            <span className="flex-1 truncate" title={sup.explication}>
                                              Mât Ø60 {sup.longueur} m + {sup.colliers} collier(s)
                                            </span>
                                            <span className="font-semibold">
                                              {formatMontant(sup.prix + sup.prixColliers)}
                                            </span>
                                          </div>
                                        )}
                                        <div className="flex gap-2 border-t border-primary/20 pt-0.5">
                                          <span className="flex-1">Ensemble × {qte}</span>
                                          <span className="font-bold">{formatMontant(total)}</span>
                                        </div>
                                        {sup && (
                                          <p className="text-[10px] text-muted-foreground">{sup.explication}</p>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {/* Ce qu'Odoo propose quand le catalogue de
                                      MonCRM ne suffit pas. C'est là que se
                                      trouvent les articles absents de la copie
                                      locale, et surtout leurs vrais prix : le
                                      bordereau du client. */}
                                  {(() => {
                                    /* Deux sources, dans cet ordre :
                                       la fiche lue par RÉFÉRENCE EXACTE — celle
                                       de l'article retenu — puis ce que la
                                       recherche par mots a ramené. La première
                                       est certaine, la seconde approchée ; les
                                       mélanger sans les ordonner laissait un
                                       ARCEAU trouvé par similitude passer devant
                                       l'AK5.1000.C2.BTR.IS.BRUT demandé. */
                                    /* Rien à proposer pour une ligne système :
                                       ses composants ont leurs propres
                                       références, et le mot « système » ne
                                       ramène d'Odoo que des homonymes. */
                                    if (sysRap) return null;
                                    const refRetenue = retenu
                                      ? (retenu.referenceOdoo || retenu.reference)
                                      : '';
                                    const exacte = refRetenue ? fichesOdoo[refRetenue] : undefined;
                                    /* ODOO CHERCHE LARGE, ET RAMENAIT D'AUTRES
                                       PRODUITS.
                                       Sur « Plots bordure Incol D100 360° », sa
                                       recherche par mots proposait un COUSSIN
                                       BERLINOIS ROUGE EN 6 ÉLÉMENTS — et le
                                       filtrage du catalogue local, lui, ne
                                       s'appliquait pas ici. Ces propositions
                                       passent maintenant par le même contrôle :
                                       pas un mot en commun, pas le même
                                       produit. La fiche lue par référence
                                       EXACTE, elle, n'a rien à prouver. */
                                    const demandeTexte = texteDemande(l, i);
                                    const cherchees = (trouvaillesOdoo[texteRechercheOdoo(l, i)] || [])
                                      .filter(t => memeFamille(
                                        demandeTexte, `${t.reference} ${t.designation || ''}`));
                                    const props = [
                                      ...(exacte ? [exacte] : []),
                                      ...cherchees.filter(t => t.reference !== exacte?.reference),
                                    ];
                                    if (!props.length) return null;
                                    // Odoo est la source : ses propositions
                                    // s'affichent même quand un article local a
                                    // été retenu, pour qu'on puisse comparer.
                                    return (
                                      <div className="rounded border border-primary/30 bg-primary/5 p-1.5 space-y-1">
                                        <p className="text-[10px] font-medium text-primary">
                                          {retenu ? 'Aussi dans Odoo' : 'Trouvé dans Odoo'}
                                          {' '}— tarifé au bordereau du client
                                        </p>
                                        {props.slice(0, 5).map(t => {
                                          const actif = choixOdoo[i]?.reference === t.reference;
                                          return (
                                            <button
                                              key={t.reference}
                                              type="button"
                                              onClick={() => {
                                                const retire = choixOdoo[i]?.reference === t.reference;
                                                setChoixOdoo(prev => {
                                                  const n = { ...prev };
                                                  // Un second clic retire le choix.
                                                  if (retire) delete n[i]; else n[i] = t;
                                                  return n;
                                                });
                                                /* Mémoriser le retrait, sinon la
                                                   sélection d'office le rétablit. */
                                                setRefusOdoo(prev => {
                                                  const n = new Set(prev);
                                                  if (retire) n.add(i); else n.delete(i);
                                                  return n;
                                                });
                                              }}
                                              className={`flex w-full items-baseline gap-2 text-[11px] rounded px-1 py-0.5 text-left transition-colors ${
                                                actif ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-primary/10'}`}
                                              title={actif ? 'Cliquez pour retirer ce choix' : 'Cliquez pour retenir cet article'}
                                            >
                                              <Check className={`w-3 h-3 shrink-0 ${actif ? 'opacity-100 text-primary' : 'opacity-0'}`} />
                                              <span className="font-mono text-[10px]">{t.reference}</span>
                                              <span className="truncate flex-1" title={t.designation}>
                                                {t.designation}
                                              </span>
                                              {/* Ce qu'Odoo a en magasin, et ce qu'il prévoit
                                                  d'avoir une fois les réceptions attendues
                                                  entrées et les sorties réservées parties.
                                                  Le prévu ne s'affiche que s'il diffère :
                                                  répéter le même nombre n'apprend rien. */}
                                              {t.stockDispo !== undefined && (
                                                <span
                                                  className={`shrink-0 text-[10px] ${
                                                    t.stockDispo > 0 ? 'text-muted-foreground' : 'text-warning'}`}
                                                  title={`Stock Odoo : ${t.stockDispo} disponible`
                                                    + `, ${t.stockPrevu ?? t.stockDispo} prévu`}
                                                >
                                                  {t.stockDispo > 0 ? `${t.stockDispo} dispo` : 'rupture'}
                                                  {t.stockPrevu !== undefined && t.stockPrevu !== t.stockDispo
                                                    && ` · ${t.stockPrevu} prévu`}
                                                </span>
                                              )}
                                              <span className="font-semibold shrink-0">
                                                {t.contrat != null
                                                  ? formatMontant(t.contrat)
                                                  : <span className="text-warning">hors barème</span>}
                                              </span>
                                            </button>
                                          );
                                        })}
                                        {(() => {
                                          const ch = choixOdoo[i];
                                          if (!ch) {
                                            return (
                                              <p className="text-[10px] text-muted-foreground">
                                                {retenu
                                                  ? 'Le catalogue local a retenu un autre article : cliquez pour lui préférer celui-ci.'
                                                  : 'Cliquez pour retenir un article. Il n’est pas dans MonCRM : la ligne partira en libre.'}
                                              </p>
                                            );
                                          }
                                          /* Retenu d'office ou à la main ? L'utilisateur doit
                                             pouvoir faire la différence : ce que l'appli a
                                             décidé seule mérite un coup d'œil, ce qu'il a
                                             choisi lui-même, non. */
                                          const dOffice = !refusOdoo.has(i)
                                            && ch.reference === props[0]?.reference;
                                          const sur = (ch.certitude ?? 1) >= CERTITUDE_ACQUISE;
                                          /* Une classe de film différente de celle
                                             demandée n'est pas une nuance : c'est un
                                             autre produit, à un autre prix. On le dit
                                             en toutes lettres plutôt que de laisser
                                             lire un avertissement générique. */
                                          if (ch.classeDemandee && ch.classe
                                              && ch.classe !== ch.classeDemandee) {
                                            return (
                                              <p className="text-[10px] text-destructive">
                                                Retenu : {ch.reference} — mais c’est du{' '}
                                                <strong>{ch.classe}</strong>, or la demande
                                                porte du <strong>{ch.classeDemandee}</strong>.
                                                Cette variante n’est pas au catalogue Odoo :
                                                vérifiez avant de chiffrer.
                                              </p>
                                            );
                                          }
                                          return (
                                            <>
                                              <p className={`text-[10px] ${dOffice && !sur ? 'text-warning' : 'text-muted-foreground'}`}>
                                                {dOffice
                                                  ? (sur
                                                      ? `Retenu d’office : ${ch.reference} — la ligne partira au devis avec ce prix.`
                                                      : `Retenu d’office : ${ch.reference}, mais la demande ne le désigne qu’en partie — vérifiez, ou cliquez-en un autre.`)
                                                  : `Retenu : ${ch.reference} — la ligne partira au devis avec ce prix.`}
                                              </p>
                                              {/* D'OÙ VIENT LE PRIX.
                                                  Un montant négocié au bordereau et un montant
                                                  reconstruit depuis la liste de prix s'affichaient
                                                  à l'identique. Sur le devis AF035816 c'est
                                                  précisément ce qui rendait l'écart indiagnosticable :
                                                  impossible de savoir si la grille avait répondu ou
                                                  si l'on regardait un prix calculé. */}
                                              {ch.source === 'contrat' ? (
                                                <p className="text-[10px] text-muted-foreground">
                                                  Prix du bordereau{ch.gabarit ? <> — ligne <code>{ch.gabarit}</code></> : null}
                                                </p>
                                              ) : ch.source === 'liste' ? (
                                                <p className="text-[10px] text-warning">
                                                  Prix reconstruit depuis la liste de prix : cet article
                                                  n’est pas au bordereau du client.
                                                </p>
                                              ) : null}
                                            </>
                                          );
                                        })()}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}

                            {accompagnements.length > 0 && (
                              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-1">
                                <p className="text-[11px] font-medium text-primary">
                                  Ajoutés par les règles
                                </p>
                                {accompagnements.map((a, k) => {
                                  const p = produits.find(x => x.id === a.produitId);
                                  return (
                                    <div key={k} className="space-y-0.5">
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="bg-primary/15 text-primary px-1.5 py-0.5 rounded text-[10px]">
                                          accompagnement
                                        </span>
                                        <span>{p?.description || a.produitMatch}</span>
                                        {a.detail && (
                                          <span className="ml-auto text-[11px] text-muted-foreground">
                                            {a.detail}
                                          </span>
                                        )}
                                      </div>
                                      {(() => {
                                        const cle = `a${a.regleId}`;
                                        const d = prixDetail(p, a.prixImpose);
                                        const qte = quantiteDe(cle, a.quantite);
                                        const pu = prixDe(p, a.prixImpose, cle);
                                        return (
                                          <>
                                            <div className="flex items-center gap-1.5 text-[11px]">
                                              <span className="text-muted-foreground">Qté</span>
                                              <Input
                                                type="number" min={0} step="1" value={qte}
                                                onChange={e => setQuantiteManuelle(pr => ({ ...pr, [cle]: Math.max(0, Number(e.target.value) || 0) }))}
                                                className="h-7 w-16 text-xs"
                                              />
                                              <span className="text-muted-foreground ml-1">P.U.</span>
                                              <Input
                                                type="number" min={0} step="0.01" value={pu}
                                                onChange={e => setPrixManuel(pr => ({ ...pr, [cle]: Math.max(0, Number(e.target.value) || 0) }))}
                                                className="h-7 w-24 text-xs"
                                              />
                                              <span className="text-muted-foreground">
                                                € = <strong className="text-foreground">{formatMontant(pu * qte)}</strong>
                                              </span>
                                            </div>
                                            <div className="text-[11px] text-muted-foreground">
                                              {a.prixImpose === 0
                                                ? <span className="text-warning">règle — compris dans l'enduit</span>
                                                : d.remise
                                                  ? <>{d.remise.libelle} — <strong className="text-foreground">{(d.remise.remise * 100).toFixed(0)} %</strong> sur {formatMontant(d.remise.public)} public → <strong className="text-foreground">{formatMontant(d.remise.prix)}</strong></>
                                                  : d.source === 'absent'
                                                  ? <span className="text-destructive">prix à saisir — la fiche Odoo n’est pas tarifée</span>
                                                  : contratOdoo ? `contrat ${contratOdoo.contrat}` : 'tarif catalogue'}
                                            </div>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {(() => {
                              /* LE TOTAL COMPTE CE QUI PARTIRA AU DEVIS.
                               *
                               * Il ne regardait que l'article LOCAL : une ligne
                               * tarifée par Odoo était comptée au prix du
                               * catalogue, et une ligne SYSTÈME — qui ne retient
                               * aucun article — ne comptait pas du tout. Un
                               * chantier de résine à 3 912 € s'affichait donc à
                               * 0,00 €. */
                              const totalDemande = (result?.lignes ?? []).reduce((t, l, i) => {
                                if (systemesDetectes.has(i)) return t + totalSystemeDe(i, l.quantite);
                                if (!choixOdoo[i] && !produitDeLigne(i)) return t;
                                const cle = `d${i}`;
                                return t + puDeLigne(i) * quantiteDe(cle, l.quantite || 1);
                              }, 0);
                              const totalAcc = accompagnements.reduce((t, a) => {
                                const p = produits.find(x => x.id === a.produitId);
                                const cle = `a${a.regleId}`;
                                return t + prixDe(p, a.prixImpose, cle) * quantiteDe(cle, a.quantite);
                              }, 0);
                              const total = totalDemande + totalAcc;
                              return total > 0 ? (
                                <div className="flex items-center justify-between rounded-lg bg-muted px-2 py-1.5 text-xs font-semibold">
                                  <span>TOTAL H.T.</span>
                                  <span className="text-primary">{formatMontant(total)}</span>
                                </div>
                              ) : null;
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                    <Button onClick={() => showCreerDevis ? handleCreerDevis() : setShowCreerDevis(true)} className="w-full" size="sm">
                      <PlusCircle className="w-4 h-4 mr-2" />{showCreerDevis ? 'Confirmer la création' : 'Créer le devis'}
                    </Button>
                  </div>
                )}

                {/* ═══ ACTION : commande client ═══ */}
                {isCC && (
                  <div className="rounded-xl border border-success/30 bg-success/5 p-3 sm:p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-success/15 flex items-center justify-center shrink-0">
                          <PlusCircle className="w-4 h-4 text-success" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Créer la commande client</p>
                          <p className="text-[11px] text-muted-foreground">Enregistrer dans les ventes</p>
                        </div>
                      </div>
                      <button onClick={() => setShowCreerCC(v => !v)} className="text-xs text-success hover:underline shrink-0">{showCreerCC ? 'Masquer' : 'Configurer'}</button>
                    </div>
                    {showCreerCC && (
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1"><Label className="text-xs">Client *</Label>
                            <Select value={creerCCClientId} onValueChange={setCreerCCClientId}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                              <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.societe || c.nom}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          {rechercheOdoo('commande')}
                          <div className="space-y-1"><Label className="text-xs">N° commande *</Label><Input className="h-8 text-xs" value={creerCCNumero} onChange={e => setCreerCCNumero(e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Date *</Label><Input className="h-8 text-xs" type="date" value={creerCCDate} onChange={e => setCreerCCDate(e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Livraison prévue</Label><Input className="h-8 text-xs" type="date" value={creerCCDateLivraison} onChange={e => setCreerCCDateLivraison(e.target.value)} /></div>
                        </div>
                        <div className="space-y-1"><Label className="text-xs">Notes</Label><Input className="h-8 text-xs" value={creerCCNotes} onChange={e => setCreerCCNotes(e.target.value)} /></div>
                      </div>
                    )}
                    <Button onClick={() => showCreerCC ? handleCreerCC() : setShowCreerCC(true)} className="w-full bg-success hover:bg-success/90 text-white" size="sm">
                      <PlusCircle className="w-4 h-4 mr-2" />{showCreerCC ? 'Confirmer la création' : 'Créer la commande client'}
                    </Button>
                  </div>
                )}

                {/* ═══ Facture ═══ */}
                {/* ═══ Devis fournisseur → reprise des prix d'achat ═══ */}
                {isDevisFournisseur && (
                  <div className="rounded-xl border border-info/30 bg-info/5 p-3 sm:p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-info/15 flex items-center justify-center shrink-0">
                        <Truck className="w-4 h-4 text-info" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">Offre de prix reçue</p>
                        <p className="text-xs text-muted-foreground">
                          Ces prix sont ceux qu'on paie. Cochez ce qui doit être repris.
                        </p>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Fournisseur</Label>
                      <Select value={dfFournisseurId} onValueChange={setDfFournisseurId}>
                        <SelectTrigger className="h-9 mt-1">
                          <SelectValue placeholder="Choisir le fournisseur…" />
                        </SelectTrigger>
                        <SelectContent>
                          {fournisseurs.map(f => (
                            <SelectItem key={f.id} value={f.id}>{f.nom}{f.societe ? ` — ${f.societe}` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!dfFournisseurId && (() => {
                        const nomLu = result ? nomDuFournisseur(result) : undefined;
                        return (
                          <div className="mt-1.5 space-y-1.5">
                            {nomLu && (
                              <p className="text-xs text-warning flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                « {nomLu} » n'est pas dans vos fournisseurs.
                              </p>
                            )}
                            {/* Le fichier partenaires d'Odoo en sait plus que
                                notre liste : la fiche y existe souvent déjà. */}
                            <div className="grid grid-cols-2">{rechercheOdoo('fournisseur')}</div>
                            {nomLu && odooCible !== 'fournisseur' && (
                              <button
                                type="button"
                                className="text-[11px] text-primary underline underline-offset-2"
                                onClick={() => creerFournisseurDepuisDocument(nomLu)}
                              >
                                Ou créer « {nomLu} » directement, sans passer par Odoo
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {!dfFournisseurId ? (
                      <p className="text-xs text-muted-foreground">
                        Le fournisseur décide de quelle fiche de prix il s'agit : rien ne peut
                        être proposé avant qu'il soit choisi.
                      </p>
                    ) : (
                      <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-muted-foreground border-b">
                              <th className="text-left font-medium py-1.5 px-1">Ligne du document</th>
                              <th className="text-right font-medium py-1.5 px-1 w-24">Prix lu</th>
                              <th className="text-right font-medium py-1.5 px-1 w-28 hidden sm:table-cell">Aujourd'hui</th>
                              <th className="text-center font-medium py-1.5 px-1 w-20">Fiche fourn.</th>
                              <th className="text-center font-medium py-1.5 px-1 w-20">Fiche article</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(result?.lignes ?? []).map((l, i) => {
                              const prop = propositionsFournisseur.get(i);
                              const article = prop?.produit;
                              const prix = dfPrixDeLigne(i);
                              const ecart = prop?.ecartLien ?? prop?.ecartArticle;
                              const referenceActuelle = prop?.prixLien ?? prop?.prixArticle;
                              const applicable = !!article && prix != null;

                              return (
                                <tr key={i} className="border-b border-border/50 align-top">
                                  <td className="py-1.5 px-1">
                                    <p className="font-medium break-words">
                                      {l.reference ? <span className="font-mono">{l.reference}</span> : null}
                                      {l.reference && l.description ? ' · ' : ''}
                                      {l.description}
                                    </p>
                                    {article ? (
                                      <div className="mt-1">
                                        <ProduitCombobox
                                          produits={
                                            candidatsPour(i).length
                                              ? candidatsPour(i)
                                              : produits
                                          }
                                          value={article.id}
                                          onSelect={(id) => {
                                            dfTouche.current = true;
                                            setChoixProduit(prev => ({ ...prev, [i]: id }));
                                          }}
                                        />
                                      </div>
                                    ) : (
                                      <div className="mt-1 space-y-1">
                                        <p className="text-destructive">Aucun article du catalogue ne correspond.</p>
                                        <ProduitCombobox
                                          produits={candidatsPour(i).length ? candidatsPour(i) : produits}
                                          value=""
                                          onSelect={(id) => {
                                            dfTouche.current = true;
                                            setChoixProduit(prev => ({ ...prev, [i]: id }));
                                            setDfVersLien(prev => ({ ...prev, [i]: true }));
                                          }}
                                        />
                                        {prix != null && (
                                          <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              className="rounded"
                                              checked={!!dfCreer[i]}
                                              onChange={e => {
                                                dfTouche.current = true;
                                                setDfCreer(prev => ({ ...prev, [i]: e.target.checked }));
                                                setDfVersLien(prev => ({ ...prev, [i]: e.target.checked }));
                                              }}
                                            />
                                            <span>
                                              Créer l'article
                                              {(() => {
                                                const vente = prixVenteDepuisAchat(prix, prop?.coefficient);
                                                return vente
                                                  ? <> — vente proposée à {formatMontant(vente)} (coef. {prop!.coefficient!.coef.toFixed(2)} mesuré sur {prop!.coefficient!.effectif} articles « {prop!.coefficient!.categorie} »)</>
                                                  : <span className="text-muted-foreground"> — prix de vente à compléter : le catalogue ne donne pas de coefficient fiable ici</span>;
                                              })()}
                                            </span>
                                          </label>
                                        )}
                                      </div>
                                    )}
                                  </td>

                                  <td className="py-1.5 px-1 text-right">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      className="h-7 text-xs text-right tabular-nums"
                                      value={prix ?? ''}
                                      onChange={e => {
                                        dfTouche.current = true;
                                        const v = parseFloat(e.target.value);
                                        setDfPrix(prev => ({ ...prev, [i]: isNaN(v) ? 0 : v }));
                                      }}
                                    />
                                  </td>

                                  <td className="py-1.5 px-1 text-right tabular-nums hidden sm:table-cell">
                                    {referenceActuelle != null ? (
                                      <>
                                        <div>{formatMontant(referenceActuelle)}</div>
                                        {ecart != null && Math.abs(ecart) >= 0.5 && (
                                          <div className={ecart > 0 ? 'text-destructive' : 'text-success'}>
                                            {ecart > 0 ? '+' : ''}{ecart.toFixed(1)} %
                                          </div>
                                        )}
                                        {prop?.action === 'inchange' && (
                                          <div className="text-muted-foreground">inchangé</div>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        {article ? 'jamais acheté ici' : '—'}
                                      </span>
                                    )}
                                  </td>

                                  <td className="py-1.5 px-1 text-center">
                                    <input
                                      type="checkbox"
                                      className="rounded"
                                      disabled={!applicable && !dfCreer[i]}
                                      checked={!!dfVersLien[i]}
                                      onChange={e => {
                                        dfTouche.current = true;
                                        setDfVersLien(prev => ({ ...prev, [i]: e.target.checked }));
                                      }}
                                    />
                                  </td>

                                  <td className="py-1.5 px-1 text-center">
                                    <input
                                      type="checkbox"
                                      className="rounded"
                                      disabled={!applicable && !dfCreer[i]}
                                      checked={!!dfVersArticle[i]}
                                      onChange={e => {
                                        dfTouche.current = true;
                                        setDfVersArticle(prev => ({ ...prev, [i]: e.target.checked }));
                                      }}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      <strong>Fiche fournisseur</strong> : le prix de ce fournisseur pour cet
                      article, sans effet sur les devis. <strong>Fiche article</strong> : le prix
                      d'achat qui commande toutes les marges de l'application — son historique
                      est conservé dans l'onglet « Prix » du produit.
                    </p>

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => void handleAppliquerPrixAchat()}
                        disabled={dfEnCours || !dfFournisseurId}
                        className="flex-1"
                      >
                        {dfEnCours
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enregistrement…</>
                          : <><Check className="w-4 h-4 mr-2" />Enregistrer le devis et appliquer</>}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Le devis est conservé dans Achat → Devis Fournisseurs, même si aucun prix
                      n'est appliqué.
                    </p>
                  </div>
                )}

                {isFact && (
                  <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold mb-0.5">Facture détectée</p>
                      <p className="text-xs text-muted-foreground">Rapprochez-la manuellement de la commande correspondante dans le CRM.</p>
                    </div>
                  </div>
                )}

                {/* ═══ Autre document → import contact inline ═══ */}
                {isAutre && !contactToSave && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Importer le contact</p>
                        <p className="text-[11px] text-muted-foreground">L'IA extrait les coordonnées depuis le texte</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" size="sm" disabled={extractingContact}
                        onClick={() => handleExtractContact('client')}>
                        {extractingContact && contactSaveType === 'client'
                          ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          : <Users className="w-4 h-4 mr-2" />}
                        Créer client
                      </Button>
                      <Button variant="outline" className="flex-1" size="sm" disabled={extractingContact}
                        onClick={() => handleExtractContact('fournisseur')}>
                        {extractingContact && contactSaveType === 'fournisseur'
                          ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          : <Truck className="w-4 h-4 mr-2" />}
                        Créer fournisseur
                      </Button>
                    </div>
                  </div>
                )}

                {/* ═══ Indicateur chargement extraction contact ═══ */}
                {extractingContact && !isAutre && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    Extraction des coordonnées en cours…
                  </div>
                )}

                {/* ═══ Formulaire contact extrait ═══ */}
                {contactToSave && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-primary shrink-0" />
                      <p className="text-sm font-semibold text-primary">
                        Coordonnées extraites — vérifiez et corrigez
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { key: 'societe', label: 'Société' },
                        { key: 'nom', label: 'Nom contact' },
                        { key: 'email', label: 'Email', type: 'email' },
                        { key: 'telephone', label: 'Tél. fixe', type: 'tel' },
                        { key: 'telephoneMobile', label: 'Tél. mobile', type: 'tel' },
                        { key: 'adresse', label: 'Adresse' },
                        { key: 'ville', label: 'Ville' },
                        { key: 'codePostal', label: 'Code postal' },
                      ] as { key: keyof ExtractedContact; label: string; type?: string }[]).map(f => (
                        <div key={f.key} className={f.key === 'adresse' || f.key === 'email' ? 'col-span-2' : ''}>
                          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">{f.label}</Label>
                          <Input
                            type={f.type || 'text'}
                            className="h-8 text-xs"
                            value={(contactToSave as any)[f.key] || ''}
                            onChange={e => setContactToSave(prev => prev ? { ...prev, [f.key]: e.target.value } : prev)}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setContactToSave(null)}>
                        ← Retour
                      </Button>
                      <Button size="sm" className="flex-1"
                        onClick={() => handleContactExtracted(contactToSave)}>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Créer le {contactSaveType}
                      </Button>
                    </div>
                  </div>
                )}

                </>)}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {matchedCF && (
        <ReceptionCommandeDialog
          open={receptionOpen}
          onOpenChange={setReceptionOpen}
          commande={matchedCF}
          fournisseur={fournisseurMatch}
          initialQuantitesRecues={result ? buildQuantitesRecues() : undefined}
          initialDateLivraison={result?.dateLivraisonPrevue ?? undefined}
          onConfirm={handleReception}
        />
      )}

    </>
  );
}
