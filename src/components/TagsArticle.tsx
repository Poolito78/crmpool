import { useMemo, useState } from 'react';
import { Tag as TagIcon, X, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useProduitTags, normaliserTag } from '@/lib/produitTags';

/**
 * Les mots du client attachés à un article, sur sa fiche.
 *
 * ⚠️ **CE BLOC N'EST PAS UNE DESCRIPTION DE PLUS.** Il est posé juste sous
 * « Description détaillée » parce que c'est là qu'on cherche à décrire
 * l'article — mais les deux champs vont dans des directions opposées : la
 * description détaillée **s'affiche dans le devis**, un tag ne s'affiche
 * **jamais**. Écrire « cycliste » sur la ligne d'un devis à la place de
 * « Homme à vélo » serait une faute vis-à-vis du client. Le rappel est donc
 * écrit à l'écran, pas seulement ici : sans lui, quelqu'un finira par y ranger
 * un complément de désignation en s'étonnant qu'il ne sorte pas au PDF.
 *
 * Deux provenances, distinguées à l'œil : saisi ici à la main, ou **retenu par
 * le CRM** après un choix d'article en saisie de devis. Sans cette marque, le
 * ménage serait impossible — on n'oserait plus rien effacer de peur de
 * supprimer un mot voulu.
 */
export default function TagsArticle({ produitId }: { produitId?: string }) {
  const { tags, ajouter, supprimer } = useProduitTags();
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);

  const mesTags = useMemo(
    () => (produitId ? tags.filter(t => t.produitId === produitId) : [])
      .slice()
      .sort((a, b) => a.tag.localeCompare(b.tag, 'fr')),
    [tags, produitId],
  );

  async function ajouterSaisie() {
    if (!produitId) return;
    const tag = normaliserTag(saisie);
    if (!tag) return;
    setEnCours(true);
    const erreur = await ajouter(produitId, tag, 'manuel');
    setEnCours(false);
    if (erreur) { toast.error(erreur); return; }
    setSaisie('');
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
      <div className="flex items-center gap-2">
        <TagIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <Label className="text-sm font-semibold">Tags — les mots du client</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Les mots par lesquels un client demande cet article quand ils diffèrent de la
        désignation — « cycliste » pour « Homme à vélo ».{' '}
        <strong className="text-foreground">Jamais affichés dans un devis</strong> : ils ne
        servent qu'à retrouver l'article dans la recherche.
      </p>

      {!produitId ? (
        <p className="text-xs text-muted-foreground italic">
          Enregistrez d'abord l'article — un tag s'attache à une fiche existante.
        </p>
      ) : (
        <>
          {mesTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {mesTags.map(t => (
                <span
                  key={t.id}
                  title={t.origine === 'appris'
                    ? 'Retenu automatiquement lors d’une saisie de devis'
                    : 'Saisi à la main'}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                    t.origine === 'appris'
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-background text-foreground'
                  }`}
                >
                  {t.origine === 'appris' && <Sparkles className="w-3 h-3 shrink-0" />}
                  {t.tag}
                  <button
                    type="button"
                    onClick={() => { void supprimer(t.id); }}
                    className="opacity-60 hover:opacity-100"
                    title="Retirer ce tag"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={saisie}
              onChange={e => setSaisie(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); void ajouterSaisie(); }
              }}
              placeholder="cycliste, plot bordure…"
              className="h-8 text-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              disabled={enCours || !normaliserTag(saisie)}
              onClick={() => { void ajouterSaisie(); }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />Ajouter
            </Button>
          </div>

          {mesTags.some(t => t.origine === 'appris') && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3 shrink-0 text-primary" />
              Les tags marqués ont été retenus tout seuls après un choix d'article en devis.
            </p>
          )}
        </>
      )}
    </div>
  );
}
