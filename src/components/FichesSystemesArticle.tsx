import { useState } from 'react';
import { FolderOpen, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MentionFiche from '@/components/MentionFiche';
import ChoisirFicheGed from '@/components/ChoisirFicheGed';
import { enregistrerFicheSysteme, systemesDeLArticle, type Systeme } from '@/lib/systemes';

/**
 * Encart « Fiches systèmes » de la fiche article : les systèmes de mise en
 * œuvre dont l'article est un composant, chacun avec SA fiche (texte du mail,
 * lien, mention) — modifiable ici.
 *
 * La fiche appartient au système, pas à l'article : la renseigner sur un
 * composant la rend disponible sur tous les autres. Dans le dialogue d'envoi
 * du devis, elle est cochée d'office quand le système est l'objet du devis
 * (`systemeEstObjet`), proposée décochée sinon.
 */
interface Props {
  produitId: string;
  systemes: Systeme[];
  onChange: () => void;
}

export default function FichesSystemesArticle({ produitId, systemes, onChange }: Props) {
  const liste = systemesDeLArticle(systemes, produitId);
  const [gedPour, setGedPour] = useState<string | null>(null);

  async function maj(s: Systeme, patch: { url?: string; label?: string; mention?: string }) {
    const err = await enregistrerFicheSysteme(s.id, {
      url: s.ficheUrl, label: s.ficheLabel, mention: s.ficheMention, ...patch,
    });
    if (err) toast.error(err);
    else { toast.success('Fiche système enregistrée.'); onChange(); }
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3 bg-muted/20">
      <p className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
        <Layers className="w-3.5 h-3.5" />
        Fiches systèmes
        <span className="font-normal">(jointes d'office quand le système est l'objet du devis)</span>
      </p>
      {liste.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Cet article n'entre dans aucun système de mise en œuvre.</p>
      ) : liste.map(s => (
        <div key={s.id} className="space-y-1 pb-2 border-b border-border/60 last:border-0 last:pb-0">
          <p className="text-xs font-medium">{s.nom}{s.variante ? <span className="font-normal text-muted-foreground"> — {s.variante}</span> : null}</p>
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
    </div>
  );
}
