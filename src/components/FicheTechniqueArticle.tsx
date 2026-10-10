import { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import ProduitCombobox from '@/components/ProduitCombobox';
import type { Produit } from '@/lib/store';
import { rapprocherArticle } from '@/lib/rapprochementArticle';
import { ajouterFicheAuProduit, deposerFicheTechnique, estFichePdf } from '@/lib/fichesProduitPdf';

/**
 * Encart de l'Analyse : un PDF glissé peut être rangé comme FICHE TECHNIQUE
 * d'un article. Le fichier part dans le seau public `produits-fiches` et son
 * lien rejoint les fiches de l'article (celles des mails et des devis).
 */
interface Props {
  fichiers: File[];
  produits: Produit[];
  updateProduits: (fn: (prev: Produit[]) => Produit[]) => void;
}

export default function FicheTechniqueArticle({ fichiers, produits, updateProduits }: Props) {
  const pdfs = fichiers.filter(estFichePdf);
  const [produitId, setProduitId] = useState('');
  const [exclus, setExclus] = useState<Set<number>>(new Set());
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState<string | null>(null);
  const [choisiAMain, setChoisiAMain] = useState(false);

  /* L'article se reconnaît d'après le NOM du premier PDF (« FLOWFAST 107
     Primer fiche technique.pdf »), comme à la fiche article où il est déjà
     connu. Retenu d'office seulement quand le rapprochement est SÛR ; sinon
     les candidats sont proposés et rien n'est présélectionné. */
  const nomPremier = pdfs[0]?.name ?? '';
  const reco = useMemo(() => {
    const texte = nomPremier.replace(/\.pdf$/i, '').replace(/[_\-.]+/g, ' ')
      .replace(/\b(fiche|technique|ft|fds|tds|datasheet|data|sheet)\b/gi, ' ').trim();
    return texte ? rapprocherArticle(texte, produits, 8) : null;
  }, [nomPremier, produits]);

  useEffect(() => {
    if (!choisiAMain && reco?.confiance === 'sure' && reco.meilleur) setProduitId(reco.meilleur.id);
  }, [reco, choisiAMain]);

  if (pdfs.length === 0) return null;
  const aEnvoyer = pdfs.filter((_, i) => !exclus.has(i));

  async function ajouter() {
    const produit = produits.find(p => p.id === produitId);
    if (!produit) { toast.error('Choisissez l\'article'); return; }
    setEnvoi(true);
    let ok = 0;
    for (const f of aEnvoyer) {
      const res = await deposerFicheTechnique(produit.id, f);
      if ('erreur' in res) { toast.error(res.erreur); continue; }
      updateProduits(prev => prev.map(p => p.id === produit.id ? ajouterFicheAuProduit(p, res) : p));
      ok++;
    }
    setEnvoi(false);
    if (ok) {
      setFait(`${ok} fiche${ok > 1 ? 's' : ''} technique${ok > 1 ? 's' : ''} ajoutée${ok > 1 ? 's' : ''} à ${produit.reference}`);
      toast.success(`Fiche technique ajoutée à ${produit.reference}`);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="w-4 h-4 text-primary" /> Ajouter comme fiche technique d'un article
      </div>
      {fait ? (
        <div className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="w-4 h-4" /> {fait}
          <button className="ml-2 text-xs text-muted-foreground underline" onClick={() => setFait(null)}>
            un autre article
          </button>
        </div>
      ) : (<>
        <ul className="space-y-1">
          {pdfs.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!exclus.has(i)}
                onChange={() => setExclus(prev => { const s = new Set(prev); if (s.has(i)) s.delete(i); else s.add(i); return s; })} />
              <span className="truncate">{f.name}</span>
            </li>
          ))}
        </ul>
        <ProduitCombobox
          produits={produits}
          suggestions={reco?.candidats}
          value={produitId}
          onSelect={id => { setChoisiAMain(true); setProduitId(id); }}
        />
        {reco?.confiance === 'sure' && reco.meilleur && !choisiAMain && (
          <p className="text-xs text-muted-foreground">Article reconnu d'après le nom du fichier : {reco.meilleur.reference} — modifiable.</p>
        )}
        {reco?.confiance === 'douteux' && !produitId && (
          <p className="text-xs text-amber-600">Article incertain d'après le nom du fichier — à choisir (candidats proposés).</p>
        )}
        <Button size="sm" onClick={ajouter} disabled={envoi || !produitId || aEnvoyer.length === 0}>
          {envoi ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-1.5" />}
          Ajouter {aEnvoyer.length > 1 ? `${aEnvoyer.length} fiches` : 'la fiche'} à l'article
        </Button>
      </>)}
    </div>
  );
}
