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
import { rapprocherArticle } from '@/lib/rapprochementArticle';
import { extrairePDFsDeMsg, extrairePJsDeMsg } from '@/lib/parseMsgPdf';
import { parseExcel } from '@/lib/parseExcel';
import { useCRM } from '@/lib/StoreContext';
import {
  type Client, type CommandeFournisseur, type LigneReception, type CommandeClient, type Devis, type LigneDevis,
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
    updateCommandesFournisseur, updateCommandesClient, updateClients, updateFournisseurs, updateDevis,
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
  const [odooCible, setOdooCible] = useState<'devis' | 'commande' | null>(null);
  const [odooTerme, setOdooTerme] = useState('');
  const [odooEnCours, setOdooEnCours] = useState(false);
  const [odooResultats, setOdooResultats] = useState<PartenaireOdoo[] | null>(null);

  /** Interroge le fichier client d'Odoo sur la raison sociale, la ville, le
      courriel ou le numéro de TVA. */
  const chercherClientOdoo = useCallback(async () => {
    const terme = odooTerme.trim();
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

  /** Le bloc de recherche, partagé par les deux formulaires. */
  const rechercheOdoo = (cible: 'devis' | 'commande') => (
    <div className="col-span-2 space-y-1">
      {odooCible !== cible ? (
        <button
          type="button"
          className="text-[11px] text-primary underline underline-offset-2"
          onClick={() => { setOdooCible(cible); setOdooResultats(null); }}
        >
          Le client n’est pas dans la liste ? Chercher dans Odoo
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
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); chercherClientOdoo(); } }}
            />
            <Button
              type="button" size="sm" className="h-7 text-[11px]"
              disabled={odooEnCours} onClick={chercherClientOdoo}
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
                  onClick={() => importerClientOdoo(p)}
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
  const { regles } = useReglesAccompagnement();
  /** Contrat cadre Odoo du client retenu, la société qui le porte, et ses prix. */
const [contratOdoo, setContratOdoo] = useState<
    { contrat: string; societe: string; prix: Record<string, number>;
      /** Tarif catalogue ISOMARK, quand la fonction sait le lire. */
      isomark?: Record<string, number>;
      /** `societe` ci-dessus est en fait le nom d'un simple contact Odoo
       *  (souvent une adresse de livraison mal rattachée) : à vérifier/corriger
       *  dans Odoo plutôt qu'à prendre pour une vraie société cliente. */
      societeIncertaine?: boolean } | null
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
    setNomAgglo({});
    setContratOdoo(null); setClientOdoo(null); setTrouvaillesOdoo({}); setFichesOdoo({});
    setOdooMuet(null);
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
  const rapprochements = useMemo(() => {
    const m = new Map<number, ReturnType<typeof rapprocherArticle>>();
    (result?.lignes || []).forEach((l, i) => {
      const texte = [l.reference, l.description].filter(Boolean).join(' ').trim();
      m.set(i, rapprocherArticle(texte, produits));
    });
    return m;
  }, [result, produits]);

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

  const texteRechercheOdoo = useCallback((
    l: { reference?: string; description?: string },
    i: number,
  ) => {
    const brut = [l.reference, l.description].filter(Boolean).join(' ').trim();
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
        niveau: niveauDepuisContrat(contratOdoo?.contrat) ?? 'R4',
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
      niveau: niveauDepuisContrat(contratOdoo?.contrat) ?? 'R4',
    });
    const mm = pan?.dimension.match(/(\d+)/)?.[1];
    return `${brut}${mm ? ` ${mm}` : ''} C${classePanneau}`;
  }, [gammePanneau, classePanneau, contratOdoo, porteurDeLigne, nomAgglo, hcAgglo, mentionAgglo]);

  const produitDeLigne = useCallback((i: number) => {
    const choisi = choixProduit[i];
    if (choisi) return produitParId(produits, choisi);
    return rapprochements.get(i)?.meilleur;
  }, [choixProduit, produits, rapprochements]);

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
    });
    for (const a of accompagnements) {
      const p = produits.find(x => x.id === a.produitId);
      if (p) refs.add(p.referenceOdoo || p.reference);
    }
    return [...refs];
  }, [result, accompagnements, produits, produitDeLigne]);

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
        texte: texteRechercheOdoo(l, i),
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
    if (!critere || (!referencesDuDevis.length && !aChercher.length)) {
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
          });
        } else setContratOdoo(null);
      } catch { if (!annule) { setContratOdoo(null); setTrouvaillesOdoo({}); setFichesOdoo({}); } }
    })();
    return () => { annule = true; };
    // `quantiteManuelle` volontairement hors dépendances :
    // les inclure relancerait l'appel Odoo à chaque frappe dans une quantité.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creerDevisClientId, clients, referencesDuDevis, result, signature]);

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
        if (n[i] || refusOdoo.has(i) || produitDeLigne(i)) return;
        /* Même ordre qu'à l'affichage : la fiche lue par référence exacte
           d'abord, la recherche par mots ensuite. */
        const brute = String(l.reference || '').trim().toUpperCase();
        const exacte = brute ? fichesOdoo[brute] : undefined;
        const props = exacte
          ? [exacte]
          : (trouvaillesOdoo[texteRechercheOdoo(l, i)] || []);
        if (props.length) { n[i] = props[0]; change = true; }
      });
      return change ? n : prev;
    });
  }, [trouvaillesOdoo, fichesOdoo, result, refusOdoo, produitDeLigne, texteRechercheOdoo]);

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
    if (!p) return { retenu: prixImpose ?? 0, contrat: null as number | null, catalogue: 0, source: 'aucun' as const };
    const ref = p.referenceOdoo || p.reference;
    const contrat = contratOdoo?.prix[ref] ?? null;
    const catalogue = p.prixHT ?? 0;

    if (prixImpose !== undefined && prixImpose !== null) {
      return { retenu: prixImpose, contrat, catalogue, source: 'règle' as const };
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
    const tarifMetier = p.prixTarif ?? contratOdoo?.isomark?.[ref];
    if (tarifMetier != null && contrat !== null
        && Math.abs(contrat - tarifMetier) >= 0.01) {
      return { retenu: tarifMetier, contrat, catalogue: tarifMetier,
               source: (p.sourceTarif || 'catalogue métier') as any };
    }
    if (contrat !== null) return { retenu: contrat, contrat, catalogue, source: 'contrat' as const };

    /* Sur 22 635 articles vendables, 7 670 portent un prix inférieur à 2 € et
       4 657 un prix nul : chez ISOSIGN le prix de vente n'est pas sur la fiche
       Odoo, il vit dans les listes de prix. L'import a recopié la fiche, à 1 €,
       parfois multipliée par un coefficient — d'où les 1,43 € et 1,44 € qu'on
       retrouve partout. Ces valeurs ne sont pas des prix ; les afficher comme
       tels a mis un support Ø60 à 1,00 € sur une demande où Odoo facture
       39,852 €. Faute de prix contrat, on ne propose plus rien. */
    if (catalogue <= SEUIL_PRIX_FACTICE) {
      return { retenu: 0, contrat, catalogue, source: 'absent' as const };
    }
    return { retenu: catalogue, contrat, catalogue, source: 'catalogue' as const };
  }, [contratOdoo]);

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

  function handleCreerDevis() {
    if (!creerDevisClientId) { toast.error('Veuillez sélectionner un client'); return; }
    if (!creerDevisNumero.trim()) { toast.error('Veuillez saisir un numéro de devis'); return; }
    if (!creerDevisDate) { toast.error('Veuillez saisir la date'); return; }
    const lignes: LigneDevis[] = (result?.lignes ?? []).map((l, i) => {
      const cle = `d${i}`;
      /* Un article Odoo retenu l'emporte sur le rapprochement local : c'est un
         choix explicite, et souvent la bonne marchandise là où le catalogue
         local proposait un article approchant. Faute d'exister dans MonCRM, il
         part en ligne libre — référence dans le libellé, prix du bordereau. */
      const odoo = choixOdoo[i];
      if (odoo) {
        return {
          id: generateId(),
          produitId: undefined,
          description: `${odoo.reference} — ${odoo.designation}`,
          quantite: quantiteDe(cle, l.quantite),
          unite: odoo.unite || 'u',
          prixUnitaireHT: prixManuel[cle] ?? odoo.contrat ?? 0,
          tva: l.tva ?? 20,
          remise: 0,
        };
      }
      const p = produitDeLigne(i);
      return {
        id: generateId(),
        produitId: p?.id,
        description: l.description || p?.description || '',
        quantite: quantiteDe(cle, l.quantite),
        unite: p?.unite || 'u',
        prixUnitaireHT: prixDe(p, undefined, cle),
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
    };
    updateDevis(prev => [nouveauDevis, ...prev]);
    toast.success(`Devis ${creerDevisNumero} créé`);
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
        <DialogContent mobileFullscreen className="sm:max-w-2xl sm:max-h-[85vh] overflow-y-auto flex flex-col p-4 sm:p-5 [&>button]:z-20">
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
                            Contrat cadre <strong>{contratOdoo.contrat}</strong>
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
                            <p className="text-[11px] text-muted-foreground pb-1.5">
                              grille ISOSIGN 2026, tarif{' '}
                              <strong className="text-foreground">
                                {niveauDepuisContrat(contratOdoo?.contrat) ?? 'R4'}
                              </strong>
                              {niveauDepuisContrat(contratOdoo?.contrat) && ' lu dans le contrat cadre'}
                            </p>
                          </div>
                        )}

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
                              return (
                                <div key={i} className="rounded-lg border border-border p-2 space-y-1.5">
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded text-[10px]">
                                      demandé
                                    </span>
                                    <span className="font-medium">{l.description || l.reference}</span>
                                    {/* Dire ce qui a été compris de la demande, et
                                        ce qui n'a pas été trouvé. Un « à choisir »
                                        explicite vaut mieux qu'un article retenu
                                        au hasard et chiffré avec assurance. */}
                                    {!choixProduit[i] && rap && rap.confiance !== 'sure' && (
                                      <span className="ml-auto text-[11px] text-destructive">
                                        à choisir — {rap.pourquoi}
                                      </span>
                                    )}
                                    {!choixProduit[i] && rap?.confiance === 'sure' && candidats.length > 1 && (
                                      <span className="ml-auto text-[11px] text-warning">
                                        {rap.pourquoi} · {candidats.length} candidats
                                      </span>
                                    )}
                                  </div>
                                  {/* La quantité et le prix restent modifiables
                                      même quand l'article vient d'Odoo et non du
                                      catalogue local : ce sont justement ces
                                      lignes-là qu'on veut pouvoir ajuster. */}
                                  {(retenu || choixOdoo[i]) && (() => {
                                    const cle = `d${i}`;
                                    const odoo = choixOdoo[i];
                                    const d = odoo
                                      ? { retenu: odoo.contrat ?? 0, contrat: odoo.contrat,
                                          catalogue: odoo.fiche, source: 'contrat' as const }
                                      : prixDetail(retenu);
                                    const qte = quantiteDe(cle, l.quantite || 1);
                                    const pu = odoo
                                      ? (prixManuel[cle] ?? odoo.contrat ?? 0)
                                      : prixDe(retenu, undefined, cle);
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
                                            : (d.source === 'ISOMARK' || d.source === 'ISOFLOOR')
                                              ? <>tarif <strong className="text-foreground">{d.source} {formatMontant(d.catalogue)}</strong> retenu — contrat Odoo {formatMontant(d.contrat!)}</>
                                              : d.source === 'absent'
                                                  ? <span className="text-destructive">prix à saisir — la fiche Odoo n’est pas tarifée</span>
                                                  : contratOdoo ? `contrat ${contratOdoo.contrat}` : 'tarif catalogue'}
                                        </div>
                                      </>
                                    );
                                  })()}
                                  <ProduitCombobox
                                    produits={candidats.length ? candidats : produits}
                                    value={retenu?.id ?? ''}
                                    onSelect={(id) => setChoixProduit(prev => ({ ...prev, [i]: id }))}
                                  />
                                  {/* Cet avertissement ne parle que du catalogue
                                      LOCAL. Depuis qu'un article Odoo peut être
                                      retenu d'office, l'afficher à côté de
                                      « Retenu d'office : PLASTOBLOC24GM » se
                                      contredisait : la ligne a bien un article
                                      et un prix, ils viennent d'ailleurs. */}
                                  {!retenu && !choixOdoo[i] && (
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
                                    const texte = [l.reference, l.description].filter(Boolean).join(' ');
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
                                        niveau: niveauDepuisContrat(contratOdoo?.contrat) ?? 'R4',
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
                                      niveau: niveauDepuisContrat(contratOdoo?.contrat) ?? 'R4' as const,
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
                                    const refRetenue = retenu
                                      ? (retenu.referenceOdoo || retenu.reference)
                                      : '';
                                    const exacte = refRetenue ? fichesOdoo[refRetenue] : undefined;
                                    const cherchees = trouvaillesOdoo[texteRechercheOdoo(l, i)] || [];
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
                                            <p className={`text-[10px] ${dOffice && !sur ? 'text-warning' : 'text-muted-foreground'}`}>
                                              {dOffice
                                                ? (sur
                                                    ? `Retenu d’office : ${ch.reference} — la ligne partira au devis avec ce prix.`
                                                    : `Retenu d’office : ${ch.reference}, mais la demande ne le désigne qu’en partie — vérifiez, ou cliquez-en un autre.`)
                                                : `Retenu : ${ch.reference} — la ligne partira au devis avec ce prix.`}
                                            </p>
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
                                                : d.source === 'ISOMARK'
                                                  ? <>tarif <strong className="text-foreground">ISOMARK {formatMontant(d.catalogue)}</strong> retenu — contrat Odoo {formatMontant(d.contrat!)}</>
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
                              const totalDemande = (result?.lignes ?? []).reduce((t, l, i) => {
                                const p = produitDeLigne(i);
                                if (!p) return t;
                                const cle = `d${i}`;
                                return t + prixDe(p, undefined, cle) * quantiteDe(cle, l.quantite || 1);
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
