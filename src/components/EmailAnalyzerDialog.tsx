import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useCRM } from '@/lib/StoreContext';
import { generateId, type LigneDevis, type Devis as DevisType } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Loader2, Check, AlertTriangle, X, Sparkles, Trash2, Plus } from 'lucide-react';
import ClientCombobox from '@/components/ClientCombobox';
import ProduitCombobox from '@/components/ProduitCombobox';
import { useReglesAccompagnement } from '@/hooks/useReglesAccompagnement';
import {
  coupeSignature,
  extraireIndices,
  appliquerAccompagnements,
  prixDeLigne,
  type LigneChiffrage,
} from '@/lib/chiffrage';

interface AnalysisLigne {
  produitId: string;
  produitMatch: string;
  quantite: number;
  confidence: 'high' | 'medium' | 'low';
  /** ligne posée par une règle d'accompagnement, pas demandée par le client */
  auto?: boolean;
  regleId?: string;
  /** prix imposé par la règle — 0 signifie « compris dans un autre article » */
  prixImpose?: number | null;
  detail?: string;
  /** prix saisi à la main : ni le catalogue ni une règle ne le remplacent */
  prixManuel?: number;
  /** prix du contrat cadre Odoo de ce client, lu au moment de l'analyse */
  prixOdoo?: number | null;
  /** arbitrage de l'utilisateur quand les deux prix diffèrent */
  choixPrix?: 'odoo' | 'catalogue';
}

interface AnalysisResult {
  clientId: string;
  clientMatch: string;
  referenceAffaire?: string;
  notes?: string;
  lignes: AnalysisLigne[];
}

const confidenceColors: Record<string, string> = {
  high: 'bg-success/10 text-success',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-destructive/10 text-destructive',
};

const confidenceLabels: Record<string, string> = {
  high: 'Sûr',
  medium: 'Probable',
  low: 'Incertain',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDevisCreated: (devisId: string) => void;
}

const CATALOGUE_CLE = 'crm_catalogue_analyse';

export default function EmailAnalyzerDialog({ open, onOpenChange, onDevisCreated }: Props) {
  const { clients, produits, devis, updateDevis } = useCRM();
  const { regles } = useReglesAccompagnement();
  const [emailText, setEmailText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  /* Contrat cadre Odoo du client : son nom, et l'état de la lecture des prix.
     Le prix catalogue de MonCRM vient du TARIF PUBLIC ; le prix réellement
     pratiqué vient de la liste de prix rattachée au client dans Odoo. Quand
     les deux divergent, c'est un arbitrage commercial — l'application ne
     tranche pas en silence. */
  const [contrat, setContrat] = useState<string | null>(null);
  /** Société qui porte ce contrat : c'est elle qui a négocié, pas le contact. */
  const [societeContrat, setSocieteContrat] = useState<string | null>(null);
  /** `societeContrat` ci-dessus est en fait le nom d'un simple contact Odoo
   *  (souvent une adresse de livraison mal rattachée), pas d'une société. */
  const [societeContratIncertaine, setSocieteContratIncertaine] = useState(false);
  const [lectureTarifs, setLectureTarifs] = useState(false);

  /* Catalogue de travail. Avec près de 9 000 références réparties entre
     ISOFLOOR, ISOMARK et ISOSIGN, envoyer tout le catalogue à l'IA la ralentit,
     la coûte plus cher et lui fait confondre des articles de métiers différents.
     Le dernier choix est mémorisé : on travaille rarement sur deux catalogues
     dans la même journée. */
  const [catalogue, setCatalogue] = useState<string>(
    () => localStorage.getItem(CATALOGUE_CLE) || 'tous',
  );

  const catalogues = Array.from(
    new Set(produits.map(p => p.catalogue).filter(Boolean) as string[]),
  ).sort();

  /* Les articles sans catalogue — transport, main d'œuvre, enduit à froid,
     accessoires — servent dans tous les métiers : ils restent toujours
     proposés, sinon un devis ISOSIGN filtré perdrait sa colle et sa livraison. */
  /* Un article importé d'Odoo sans tarif exploitable est arrivé à 1 € : il a
     été retiré de la vente en base. Le proposer à l'IA produirait des devis
     faux, on l'écarte avant tout le reste. */
  const vendables = produits.filter(p => p.disponibleVente !== false);

  const produitsFiltres =
    catalogue === 'tous'
      ? vendables
      : vendables.filter(p => !p.catalogue || p.catalogue === catalogue);

  function changerCatalogue(valeur: string) {
    setCatalogue(valeur);
    localStorage.setItem(CATALOGUE_CLE, valeur);
  }

  /** Référentiel léger passé aux règles d'accompagnement. */
  const produitsRef = produitsFiltres.map(p => ({
    id: p.id,
    reference: p.reference,
    description: p.description,
  }));

  /**
   * Recalcule les accompagnements à partir des lignes demandées.
   * Les lignes automatiques sont reconstruites à chaque fois : modifier une
   * quantité ou retirer un produit met à jour ce qui l'accompagne.
   */
  function avecAccompagnements(lignes: AnalysisLigne[]): AnalysisLigne[] {
    if (!regles.length) return lignes;
    return appliquerAccompagnements(
      lignes as LigneChiffrage[],
      regles,
      produitsRef,
    ) as AnalysisLigne[];
  }

  /**
   * Lit dans Odoo le prix que ce client paie réellement, ligne par ligne.
   *
   * Le prix catalogue de MonCRM est le tarif public : chez ISOSIGN il ne vaut
   * rien pour un client sous contrat cadre — une balise J11C2 au tarif public
   * est à 32,20 €, elle est à 20,93 € pour un client remisé à 35 %. C'est donc
   * Odoo qui donne le prix de vente, et le catalogue sert de point de
   * comparaison.
   *
   * Le prix imposé par une règle d'accompagnement (durcisseur à 0 €, compris
   * dans l'enduit) n'est jamais remplacé.
   */
  async function lireTarifsClient(
    lignes: AnalysisLigne[],
    clientId: string,
  ): Promise<AnalysisLigne[]> {
    const cli = clients.find(c => c.id === clientId);
    if (!cli) return lignes;

    const aTarifer = lignes
      .map(l => ({ ligne: l, produit: produits.find(p => p.id === l.produitId) }))
      .filter(x => x.produit && x.ligne.prixImpose === undefined);
    if (!aTarifer.length) return lignes;

    setLectureTarifs(true);
    try {
      const { data, error } = await supabase.functions.invoke('odoo-prix', {
        body: {
          client: {
            email: cli.email,
            societe: cli.societe,
            nom: cli.nom,
            ville: cli.ville,
          },
          lignes: aTarifer.map(x => ({
            reference: x.produit!.referenceOdoo || x.produit!.reference,
            quantite: x.ligne.quantite,
          })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setContrat(data?.contrat || null);
      setSocieteContrat(data?.societe || data?.partenaire || null);
      setSocieteContratIncertaine(!!data?.societeIncertaine);
      const px = data?.prix || {};

      return lignes.map(l => {
        const p = produits.find(pr => pr.id === l.produitId);
        if (!p || l.prixImpose !== undefined) return l;
        const trouve = px[p.referenceOdoo || p.reference];
        if (!trouve || trouve.contrat == null) return l;
        // Par défaut on retient le prix du contrat : c'est celui qu'Odoo
        // appliquerait de toute façon sur la commande.
        return { ...l, prixOdoo: trouve.contrat, choixPrix: l.choixPrix || 'odoo' };
      });
    } catch (e: any) {
      toast.warning(
        'Tarifs client illisibles (' + (e.message || 'Odoo injoignable') +
        ') — les prix catalogue sont conservés.',
      );
      return lignes;
    } finally {
      setLectureTarifs(false);
    }
  }

  /** Prix retenu pour une ligne, tous arbitrages appliqués. */
  function prixRetenu(l: AnalysisLigne): number {
    if (l.prixManuel !== undefined) return l.prixManuel;
    if (l.prixImpose !== undefined && l.prixImpose !== null) return l.prixImpose;
    if (l.choixPrix === 'odoo' && l.prixOdoo != null) return l.prixOdoo;
    const p = produits.find(pr => pr.id === l.produitId);
    const cli = result ? clients.find(c => c.id === result.clientId) : undefined;
    return prixDeLigne(l, p, cli).prix;
  }

  /** Bascule le prix d'une ligne entre contrat Odoo et tarif catalogue. */
  function choisirPrix(index: number, choix: 'odoo' | 'catalogue') {
    if (!result) return;
    const newLignes = [...result.lignes];
    // un choix explicite annule une saisie manuelle antérieure
    newLignes[index] = { ...newLignes[index], choixPrix: choix, prixManuel: undefined };
    setResult({ ...result, lignes: newLignes });
  }

  async function analyze() {
    if (!emailText.trim()) {
      toast.error('Collez un texte à analyser');
      return;
    }
    setLoading(true);
    setResult(null);

    try {
      /* La signature est retirée AVANT l'analyse : elle est pleine de nombres
         — téléphone, code postal, TVA — que l'IA prend pour des quantités. */
      const texteUtile = coupeSignature(emailText.trim());
      const indices = extraireIndices(emailText.trim());

      const { data, error } = await supabase.functions.invoke('analyze-email', {
        body: {
          emailText: texteUtile,
          clients: clients.map(c => ({ id: c.id, nom: c.nom, societe: c.societe, email: c.email, ville: c.ville })),
          produits: produitsFiltres.map(p => ({ id: p.id, reference: p.reference, description: p.description, prixHT: p.prixHT, tva: p.tva, unite: p.unite })),
          indices,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const brut = data as AnalysisResult;

      /* Repli sur les indices déterministes quand l'IA n'a rien trouvé :
         l'adresse de l'expéditeur et l'agence citée désignent souvent le client
         avec plus de sûreté qu'un rapprochement de raison sociale. */
      let clientId = brut.clientId;
      if (!clientId && indices.emails.length) {
        const parMail = clients.find(c =>
          indices.emails.includes((c.email || '').toLowerCase()));
        if (parMail) clientId = parMail.id;
      }
      if (!clientId && indices.villes.length) {
        const parVille = clients.filter(c =>
          indices.villes.some(v =>
            (c.ville || '').toLowerCase().includes(v.toLowerCase().replace(/-/g, ' ')) ||
            (c.nom || '').toLowerCase().includes(v.toLowerCase().replace(/-/g, ' '))));
        // une seule correspondance, sinon on laisse l'utilisateur trancher
        if (parVille.length === 1) clientId = parVille[0].id;
      }

      let lignes = avecAccompagnements(brut.lignes || []);
      const ajoutees = lignes.filter(l => l.auto).length;

      setContrat(null);
      setSocieteContrat(null);
      setSocieteContratIncertaine(false);
      // Les tarifs se lisent APRÈS l'identification du client et APRÈS les
      // accompagnements : la galette et l'enduit ajoutés par une règle doivent
      // être tarifés eux aussi.
      if (clientId) lignes = await lireTarifsClient(lignes, clientId);

      setResult({
        ...brut,
        clientId,
        referenceAffaire: brut.referenceAffaire || indices.reference || '',
        lignes,
      });

      toast.success(
        ajoutees
          ? `Analyse terminée — ${ajoutees} accompagnement(s) ajouté(s)`
          : 'Analyse terminée',
      );
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de l\'analyse');
    } finally {
      setLoading(false);
    }
  }

  async function updateResultClient(clientId: string) {
    if (!result) return;
    setResult({ ...result, clientId });
    // Changer de client change le contrat cadre, donc tous les prix.
    setContrat(null);
    setSocieteContrat(null);
    const lignes = await lireTarifsClient(
      result.lignes.map(l => ({ ...l, prixOdoo: undefined, choixPrix: undefined })),
      clientId,
    );
    setResult(r => (r ? { ...r, clientId, lignes } : r));
  }

  function updateResultLigneProduit(index: number, produitId: string) {
    if (!result) return;
    const p = produits.find(pr => pr.id === produitId);
    const newLignes = [...result.lignes];
    newLignes[index] = {
      ...newLignes[index],
      produitId,
      produitMatch: p?.description || newLignes[index].produitMatch,
      confidence: 'high',
    };
    setResult({ ...result, lignes: newLignes });
  }

  function updateResultLigneQuantite(index: number, quantite: number) {
    if (!result) return;
    const newLignes = [...result.lignes];
    newLignes[index] = { ...newLignes[index], quantite };
    // la quantité change : les accompagnements suivent
    setResult({ ...result, lignes: avecAccompagnements(newLignes) });
  }

  /** P.U. saisi à la main : il prime sur le catalogue et sur les règles. */
  function updateResultLignePrix(index: number, prix: number) {
    if (!result) return;
    const newLignes = [...result.lignes];
    newLignes[index] = { ...newLignes[index], prixManuel: prix };
    setResult({ ...result, lignes: newLignes });
  }

  function removeResultLigne(index: number) {
    if (!result) return;
    setResult({
      ...result,
      lignes: avecAccompagnements(result.lignes.filter((_, i) => i !== index)),
    });
  }

  function addResultLigne() {
    if (!result) return;
    setResult({
      ...result,
      lignes: [...result.lignes, { produitId: '', produitMatch: '', quantite: 1, confidence: 'high' }],
    });
  }

  function createDevis() {
    if (!result) return;

    const client = clients.find(c => c.id === result.clientId);
    if (!result.clientId || !client) {
      toast.error('Sélectionnez un client');
      return;
    }

    const lignes: LigneDevis[] = result.lignes
      .filter(l => l.produitId)
      .map(l => {
        const p = produits.find(pr => pr.id === l.produitId);
        /* Ordre des priorités pour le P.U. : saisie manuelle, puis prix imposé
           par la règle (0 = compris dans un autre article), puis le tarif du
           client — revendeur ou remise de catégorie — et enfin le catalogue. */
        const pu = prixRetenu(l);
        return {
          id: generateId(),
          produitId: l.produitId,
          description: p?.description || l.produitMatch,
          quantite: l.quantite,
          unite: p?.unite || 'pièce',
          prixUnitaireHT: pu,
          tva: p?.tva || 20,
          remise: 0,
        };
      });

    if (lignes.length === 0) {
      toast.error('Ajoutez au moins un produit');
      return;
    }

    const numero = `DEV-${new Date().getFullYear()}-${String(devis.length + 1).padStart(3, '0')}`;
    const newDevis: DevisType = {
      id: generateId(),
      numero,
      clientId: result.clientId,
      dateCreation: new Date().toISOString().split('T')[0],
      dateValidite: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      statut: 'brouillon',
      lignes,
      referenceAffaire: result.referenceAffaire || '',
      notes: result.notes || '',
      conditions: 'Paiement à 30 jours à compter de la date de facturation.',
      fraisPortHT: 0,
      fraisPortTVA: 20,
      modeCalcul: 'standard',
    };

    updateDevis(prev => [...prev, newDevis]);
    toast.success(`Devis ${numero} créé avec ${lignes.length} ligne(s)`);
    onOpenChange(false);
    onDevisCreated(newDevis.id);
    setEmailText('');
    setResult(null);
  }

  function reset() {
    setResult(null);
    setEmailText('');
  }

  const client = result ? clients.find(c => c.id === result.clientId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Analyse de mail — Création de devis
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Collez le texte d'un email client ci-dessous. L'IA identifiera le client, les produits et les quantités pour créer automatiquement un devis.
            </p>

            {catalogues.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-sm font-medium">Catalogue à consulter</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={catalogue === 'tous' ? 'default' : 'outline'}
                    onClick={() => changerCatalogue('tous')}
                  >
                    Tous
                  </Button>
                  {catalogues.map(c => (
                    <Button
                      key={c}
                      type="button"
                      size="sm"
                      variant={catalogue === c ? 'default' : 'outline'}
                      onClick={() => changerCatalogue(c)}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {produitsFiltres.length} article{produitsFiltres.length > 1 ? 's' : ''} sur{' '}
                  {produits.length} seront proposés à l'IA. Choisir un catalogue accélère
                  l'analyse et évite les confusions entre métiers.
                </p>
              </div>
            )}
            <Textarea
              value={emailText}
              onChange={e => setEmailText(e.target.value)}
              placeholder="Collez ici le texte de l'email ou du message client..."
              className="min-h-[200px] font-mono text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
              <Button onClick={analyze} disabled={loading || !emailText.trim()}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                {loading ? 'Analyse en cours...' : 'Analyser'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Client — editable */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Client</div>
              {client && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Check className="w-3 h-3 text-success" />
                  <span>Détecté : {result.clientMatch}</span>
                </div>
              )}
              {!client && result.clientMatch && (
                <div className="flex items-center gap-2 text-xs text-destructive mb-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Non trouvé : « {result.clientMatch} » — sélectionnez manuellement</span>
                </div>
              )}
              <ClientCombobox
                clients={clients}
                value={result.clientId}
                onSelect={updateResultClient}
              />
            </div>

            {/* Référence affaire */}
            {result.referenceAffaire && (
              <div className="rounded-lg border p-3 space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Référence affaire</div>
                <Input
                  value={result.referenceAffaire}
                  onChange={e => setResult({ ...result, referenceAffaire: e.target.value })}
                  className="h-8"
                />
              </div>
            )}

            {/* Contrat cadre : sans lui, tous les prix affichés sont des tarifs
                publics, ce qui se voit rarement à l'œil sur une seule ligne. */}
            {result.clientId && (
              <div className="rounded-lg border p-3 text-xs">
                {lectureTarifs ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Lecture des tarifs du client dans Odoo…
                  </span>
                ) : contrat ? (
                  <span>
                    Contrat cadre appliqué :{' '}
                    <strong className="text-foreground">{contrat}</strong>
                    {societeContrat && (
                      <> chez <strong className="text-foreground">{societeContrat}</strong></>
                    )}
                    {' — '}
                    {result.lignes.filter(l => l.prixOdoo != null).length} ligne(s)
                    tarifée(s) sur {result.lignes.filter(l => l.produitId).length}.
                  </span>
                ) : (
                  <span className="text-warning">
                    Aucun contrat cadre Odoo trouvé pour ce client : les prix
                    affichés sont ceux du catalogue.
                  </span>
                )}
              </div>
            )}

            {/* Produits — editable */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-muted-foreground">Produits ({result.lignes.length})</div>
                <Button variant="ghost" size="sm" onClick={addResultLigne} className="h-7 text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Ajouter
                </Button>
              </div>
              {result.lignes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun produit. Ajoutez-en manuellement.</p>
              ) : (
                <div className="space-y-3">
                  {result.lignes.map((l, i) => {
                    const p = produits.find(pr => pr.id === l.produitId);
                    const tarif = prixDeLigne(l, p, client);
                    const pu = prixRetenu(l);
                    const puCatalogue = tarif.prix;
                    // Un écart sépare le contrat négocié du tarif catalogue :
                    // il se tranche à la main, ligne par ligne.
                    const ecart =
                      l.prixOdoo != null &&
                      puCatalogue > 0 &&
                      Math.abs(l.prixOdoo - puCatalogue) >= 0.01;
                    return (
                      <div
                        key={i}
                        className={`p-2 rounded space-y-2 ${l.auto ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            {l.auto && (
                              <div className="text-xs text-primary mb-1 flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                Ajouté automatiquement {l.detail ? `— ${l.detail}` : ''}
                              </div>
                            )}
                            {l.produitMatch && !l.auto && l.confidence !== 'high' && (
                              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                Détecté : « {l.produitMatch} »
                                <Badge className={`${confidenceColors[l.confidence]} text-[10px] px-1 py-0`}>{confidenceLabels[l.confidence]}</Badge>
                              </div>
                            )}
                            <ProduitCombobox
                              produits={produits}
                              value={l.produitId}
                              onSelect={(produitId) => updateResultLigneProduit(i, produitId)}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeResultLigne(i)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive shrink-0 mt-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground shrink-0">Qté :</span>
                          <Input
                            type="number"
                            min={1}
                            value={l.quantite}
                            onChange={e => updateResultLigneQuantite(i, Math.max(1, Number(e.target.value) || 1))}
                            className="h-7 w-20 text-sm"
                          />
                          {p && <span className="text-xs text-muted-foreground shrink-0">{p.unite}</span>}

                          {/* P.U. modifiable : le catalogue se trompe parfois
                              (remise absente, article compris dans un autre). */}
                          <span className="text-xs text-muted-foreground shrink-0 ml-1">P.U. :</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={pu}
                            onChange={e => updateResultLignePrix(i, Math.max(0, Number(e.target.value) || 0))}
                            className="h-7 w-24 text-sm"
                          />
                          <span className="text-xs text-muted-foreground">
                            € HT ={' '}
                            <strong className="text-foreground">
                              {(pu * l.quantite).toFixed(2)} €
                            </strong>
                          </span>

                          {/* d'où vient ce prix : le savoir évite de le corriger à tort */}
                          {l.prixManuel !== undefined ? (
                            <Badge className="bg-warning/10 text-warning text-[10px] px-1 py-0">saisi</Badge>
                          ) : l.choixPrix === 'odoo' && l.prixOdoo != null ? (
                            <Badge className="bg-primary/10 text-primary text-[10px] px-1 py-0">
                              contrat
                            </Badge>
                          ) : tarif.origine !== 'catalogue' ? (
                            <Badge className="bg-primary/10 text-primary text-[10px] px-1 py-0">
                              {tarif.origine}
                            </Badge>
                          ) : null}
                        </div>

                        {ecart && (
                          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/50">
                            <span className="text-xs text-warning shrink-0">
                              Écart de tarif — quel prix retenir ?
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant={l.choixPrix === 'odoo' ? 'default' : 'outline'}
                              className="h-6 text-[11px] px-2"
                              onClick={() => choisirPrix(i, 'odoo')}
                            >
                              Contrat {contrat ? `« ${contrat} »` : 'client'} :{' '}
                              {l.prixOdoo!.toFixed(2)} €
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={l.choixPrix === 'catalogue' ? 'default' : 'outline'}
                              className="h-6 text-[11px] px-2"
                              onClick={() => choisirPrix(i, 'catalogue')}
                            >
                              Catalogue : {puCatalogue.toFixed(2)} €
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notes */}
            {result.notes && (
              <div className="rounded-lg border p-3 space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Notes extraites</div>
                <div className="text-sm">{result.notes}</div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                <X className="w-4 h-4 mr-1" /> Recommencer
              </Button>
              <Button
                onClick={createDevis}
                disabled={!result.clientId || result.lignes.filter(l => l.produitId).length === 0}
              >
                <Check className="w-4 h-4 mr-1" /> Créer le devis
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
