import { useState } from 'react';
import { FolderOpen, Layers, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MentionFiche from '@/components/MentionFiche';
import ChoisirFicheGed from '@/components/ChoisirFicheGed';
import { enregistrerFicheSysteme, systemesDeLArticle, type Systeme } from '@/lib/systemes';
import { deposerFicheTechnique, estFichePdf } from '@/lib/fichesProduitPdf';

/**
 * Encart « Fiches systèmes » de la fiche article.
 *
 * Il montre les systèmes de mise en œuvre dont l'article est un composant, et
 * permet d'en AJOUTER un autre (liste de tous les systèmes) : un composant
 * qu'aucun système ne référence n'aurait sinon aucun moyen de recevoir une
 * fiche. Pour chaque système : texte du mail, lien, mention — à la main, par
 * la GED, ou en GLISSANT le PDF (déposé dans le seau public des fiches).
 *
 * La fiche appartient au système, pas à l'article : elle sert ensuite à tous
 * ses composants. Dans le dialogue d'envoi du devis, elle est cochée d'office
 * quand le système est l'objet du devis (`systemeEstObjet`).
 */
interface Props {
  produitId: string;
  /** TOUS les systèmes actifs. */
  systemes: Systeme[];
  onChange: () => void;
}

export default function FichesSystemesArticle({ produitId, systemes, onChange }: Props) {
  const [ajoutes, setAjoutes] = useState<string[]>([]);
  const [gedPour, setGedPour] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [enAttente, setEnAttente] = useState<File | null>(null);
  const [cible, setCible] = useState('');

  const liees = systemesDeLArticle(systemes, produitId);
  const liste = [
    ...liees,
    ...ajoutes.map(id => systemes.find(s => s.id === id)).filter((s): s is Systeme => !!s && !liees.some(l => l.id === s.id)),
  ];
  const autres = systemes.filter(s => !liste.some(l => l.id === s.id));

  async function maj(s: Systeme, patch: { url?: string; label?: string; mention?: string }) {
    const err = await enregistrerFicheSysteme(s.id, {
      url: s.ficheUrl, label: s.ficheLabel, mention: s.ficheMention, ...patch,
    });
    if (err) toast.error(err);
    else { toast.success('Fiche système enregistrée.'); onChange(); }
  }

  async function deposer(file: File, systemeId: string) {
    const s = systemes.find(x => x.id === systemeId);
    if (!s) return;
    setEnvoi(true);
    const res = await deposerFicheTechnique(produitId, file);
    if ('erreur' in res) { toast.error(res.erreur); setEnvoi(false); return; }
    if (!liste.some(l => l.id === s.id)) setAjoutes(prev => [...prev, s.id]);
    await maj(s, { url: res.url, label: s.ficheLabel || res.label });
    setEnvoi(false);
    setEnAttente(null);
    setCible('');
  }

  function depose(files: File[]) {
    const pdf = files.find(estFichePdf);
    if (!pdf) { toast.error('Déposez un PDF.'); return; }
    // Un seul système en vue : la fiche lui revient. Sinon on demande lequel.
    if (liste.length === 1) void deposer(pdf, liste[0].id);
    else setEnAttente(pdf);
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3 bg-muted/20">
      <p className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
        <Layers className="w-3.5 h-3.5" />
        Fiches systèmes
        <span className="font-normal">(jointes d'office quand le système est l'objet du devis)</span>
      </p>

      <div
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setSurvol(true); }}
        onDragLeave={() => setSurvol(false)}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setSurvol(false); depose(Array.from(e.dataTransfer.files)); }}
        className={`rounded-md border-2 border-dashed px-3 py-2 text-center text-xs ${survol ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}
      >
        {envoi ? (
          <span className="inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Envoi de la fiche…</span>
        ) : (
          <span className="inline-flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" />Glissez ici la fiche système (PDF)</span>
        )}
      </div>

      {enAttente && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
          <span className="truncate max-w-[16rem]">« {enAttente.name} » — pour quel système ?</span>
          <Select value={cible} onValueChange={setCible}>
            <SelectTrigger className="h-8 w-64 text-xs"><SelectValue placeholder="Choisir le système…" /></SelectTrigger>
            <SelectContent>
              {systemes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}{s.variante ? ` — ${s.variante}` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs" disabled={!cible || envoi} onClick={() => void deposer(enAttente, cible)}>Ajouter</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setEnAttente(null); setCible(''); }}>Annuler</Button>
        </div>
      )}

      {liste.length === 0 && !enAttente && (
        <p className="text-[11px] text-muted-foreground">
          Cet article n'entre dans aucun système : glissez un PDF (le système vous sera demandé) ou ajoutez-en un ci-dessous.
        </p>
      )}

      {liste.map(s => (
        <div key={s.id} className="space-y-1 pb-2 border-b border-border/60 last:border-0 last:pb-0">
          <p className="text-xs font-medium">
            {s.nom}{s.variante ? <span className="font-normal text-muted-foreground"> — {s.variante}</span> : null}
            {!liees.some(l => l.id === s.id) && <span className="font-normal text-muted-foreground"> (ajouté à la main)</span>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_13rem_auto] gap-2 items-end">
            <div>
              <Label className="text-xs">Texte affiché dans le mail</Label>
              <Input
                key={`l-${s.id}-${s.ficheLabel ?? ''}`}
                className="h-9 text-xs" defaultValue={s.ficheLabel ?? ''} placeholder={s.nom}
                onBlur={e => { if (e.target.value.trim() !== (s.ficheLabel ?? '')) void maj(s, { label: e.target.value }); }}
              />
            </div>
            <div>
              <Label className="text-xs">URL (lien)</Label>
              <Input
                key={`u-${s.id}-${s.ficheUrl ?? ''}`}
                className="h-9 text-xs" type="url" defaultValue={s.ficheUrl ?? ''} placeholder="https://..."
                onBlur={e => { if (e.target.value.trim() !== (s.ficheUrl ?? '')) void maj(s, { url: e.target.value }); }}
              />
            </div>
            <div>
              <Label className="text-xs">Mention</Label>
              <MentionFiche
                className="h-9 text-xs" value={s.ficheMention ?? 'systeme'}
                onCommit={v => void maj(s, { mention: v ?? '' })}
              />
            </div>
            <Button type="button" size="sm" variant="outline" className="h-9 text-xs" onClick={() => setGedPour(s.id)}>
              <FolderOpen className="w-3.5 h-3.5 mr-1" />GED
            </Button>
          </div>
          <ChoisirFicheGed
            open={gedPour === s.id}
            onOpenChange={o => { if (!o) setGedPour(null); }}
            produitId={produitId}
            indice={s.nom}
            onChoisie={fiche => void maj(s, { url: fiche.url, label: s.ficheLabel || fiche.label })}
          />
        </div>
      ))}

      {autres.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value="" onValueChange={id => setAjoutes(prev => [...prev, id])}>
            <SelectTrigger className="h-8 w-72 text-xs"><SelectValue placeholder="Ajouter une fiche pour un autre système…" /></SelectTrigger>
            <SelectContent>
              {autres.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}{s.variante ? ` — ${s.variante}` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
