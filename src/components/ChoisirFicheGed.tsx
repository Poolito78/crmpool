import { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCRM } from '@/lib/StoreContext';
import {
  LIBELLE_GENRE_FOURNISSEUR, NOM_FICHE_PRODUIT, formatTaille, listerDocumentsFournisseur, telechargerDocumentFournisseur,
  type DocumentFournisseur,
} from '@/lib/gedFournisseur';
import { deposerFicheTechnique, estFichePdf } from '@/lib/fichesProduitPdf';
import { fichesDuProduit } from '@/lib/liensProduit';

/**
 * Choisir, parmi les documents de la GED fournisseurs, la fiche technique à
 * ajouter à un article.
 *
 * Le fichier de la GED est dans un seau PRIVÉ (lien signé qui expire) : on le
 * RECOPIE dans le seau public des fiches d'articles, seul à donner un lien
 * durable que le client peut ouvrir depuis un mail ou un devis.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produitId: string;
  /** Fournisseur de l'article : ses documents passent en tête. */
  fournisseurId?: string;
  /** Mots de départ de la recherche (ex. « FLOWFAST 215 », tiré de la désignation). */
  indice?: string;
  onChoisie: (fiche: { url: string; label: string }) => void;
}

/** Minuscules, sans accents, `_ - . /` lus comme des espaces : « Flowfast_215 » = « flowfast 215 ». */
const normaliser = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_\-./]+/g, ' ');
const tousLesMots = (haystack: string, recherche: string) => {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  const h = normaliser(haystack);
  return mots.every(m => h.includes(m));
};

export default function ChoisirFicheGed({ open, onOpenChange, produitId, fournisseurId, indice = '', onChoisie }: Props) {
  const { fournisseurs, produits } = useCRM();
  const [documents, setDocuments] = useState<DocumentFournisseur[]>([]);
  const [chargement, setChargement] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [toutes, setToutes] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRecherche(indice);
    setChargement(true);
    listerDocumentsFournisseur()
      .then(setDocuments)
      .catch(e => toast.error(e instanceof Error ? e.message : 'Lecture de la GED impossible'))
      .finally(() => setChargement(false));
  }, [open]);

  const nomFournisseur = (id: string) => {
    const f = fournisseurs.find(x => x.id === id);
    return f?.societe || f?.nom || 'Fournisseur inconnu';
  };

  const visibles = useMemo(() => {
    const q = recherche.trim();
    return documents
      .filter(d => estFichePdf({ name: d.fichierNom, type: d.fichierMime } as File))
      /* Une fiche classée « Autre » reste une fiche si son nom l'annonce
         (FP_Flowfast_215_fr.pdf) : on ne s'arrête pas au genre choisi. */
      .filter(d => toutes || d.genre === 'fiche_produit' || NOM_FICHE_PRODUIT.test(d.fichierNom))
      .filter(d => !q || tousLesMots(`${d.fichierNom} ${nomFournisseur(d.fournisseurId)} ${d.numero}`, q))
      .sort((a, b) => Number(b.fournisseurId === fournisseurId) - Number(a.fournisseurId === fournisseurId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, recherche, toutes, fournisseurId, fournisseurs]);

  /* Les fiches DÉJÀ liées à d'autres articles (le 20 kg a la fiche du 10 kg) :
     un lien public prêt à servir, sans rien recopier. Une seule ligne par lien. */
  const deAutresArticles = useMemo(() => {
    const q = recherche.trim();
    const vus = new Set<string>();
    const out: { url: string; label: string; article: string }[] = [];
    for (const p of produits) {
      if (p.id === produitId) continue;
      for (const f of fichesDuProduit(p)) {
        const url = f.url.trim();
        if (!url || vus.has(url)) continue;
        if (q && !tousLesMots(`${p.reference} ${p.description} ${f.label}`, q)) continue;
        vus.add(url);
        out.push({ url, label: f.label || 'Fiche technique', article: p.reference });
        if (out.length >= 15) return out;
      }
    }
    return out;
  }, [produits, produitId, recherche]);

  async function choisir(d: DocumentFournisseur) {
    setEnCours(d.id);
    try {
      const fichier = await telechargerDocumentFournisseur(d);
      const res = await deposerFicheTechnique(produitId, fichier);
      if ('erreur' in res) { toast.error(res.erreur); return; }
      onChoisie(res);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ajout impossible');
    } finally {
      setEnCours(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullscreen className="sm:max-w-xl sm:max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Choisir une fiche technique dans la GED</DialogTitle>
        </DialogHeader>
        <div className="shrink-0 flex items-center gap-3">
          <Input className="h-8 text-xs" placeholder="Rechercher (fichier, fournisseur)…" value={recherche} onChange={e => setRecherche(e.target.value)} />
          <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <input type="checkbox" checked={toutes} onChange={e => setToutes(e.target.checked)} />
            Toutes les pièces PDF
          </label>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5">
          {chargement && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {visibles.length > 0 && <p className="text-xs font-semibold text-muted-foreground pt-1">Dans la GED des fournisseurs</p>}
          {!chargement && visibles.length === 0 && deAutresArticles.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Aucune fiche trouvée{toutes ? '' : ' — cochez « Toutes les pièces PDF » pour élargir'}.
            </p>
          )}
          {visibles.map(d => (
            <button
              key={d.id} type="button" disabled={enCours !== null} onClick={() => choisir(d)}
              className="w-full flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/50 disabled:opacity-60"
            >
              {enCours === d.id ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <FileText className="w-4 h-4 text-muted-foreground shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{d.fichierNom}</span>
                <span className="block text-xs text-muted-foreground">
                  {nomFournisseur(d.fournisseurId)} · {LIBELLE_GENRE_FOURNISSEUR[d.genre]} · {formatTaille(d.fichierTaille)}
                  {d.fournisseurId === fournisseurId ? ' · fournisseur de l\'article' : ''}
                </span>
              </span>
            </button>
          ))}
          {deAutresArticles.length > 0 && (
            <p className="text-xs font-semibold text-muted-foreground pt-2">Déjà liées à d'autres articles</p>
          )}
          {deAutresArticles.map(f => (
            <button
              key={f.url} type="button" disabled={enCours !== null}
              onClick={() => { onChoisie({ url: f.url, label: f.label }); onOpenChange(false); }}
              className="w-full flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/50"
            >
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{f.label}</span>
                <span className="block text-xs text-muted-foreground">fiche de l'article {f.article}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
