/* Fenêtre « Liens web » du menu : ajouter, renommer, retirer les liens du
   groupe Web (`liensWeb.ts`). Les deux liens d'office (Tarif en ligne,
   isofloor.fr) ne s'y gèrent pas : ils sont dans le code du menu. */
import { useState } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { normaliserUrl, libelleParDefaut, type LienWeb } from '@/lib/liensWeb';

export default function LiensWebDialog({ open, onOpenChange, liens, onChange, reserves }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  liens: LienWeb[];
  onChange: (liens: LienWeb[]) => void;
  /** Adresses déjà au menu (liens d'office) : un doublon serait la même clé. */
  reserves: string[];
}) {
  const [libelle, setLibelle] = useState('');
  const [adresse, setAdresse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const ajouter = () => {
    const url = normaliserUrl(adresse);
    if (!url) { setErreur('Adresse non reconnue : par exemple « isofloor.fr/calculateur ».'); return; }
    if (reserves.includes(url) || liens.some(l => l.url === url)) { setErreur('Ce lien est déjà dans le menu.'); return; }
    onChange([...liens, { libelle: libelle.trim() || libelleParDefaut(url), url }]);
    setLibelle(''); setAdresse(''); setErreur(null);
  };

  const renommer = (url: string, nom: string) =>
    onChange(liens.map(l => l.url === url ? { ...l, libelle: nom } : l));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Liens web du menu</DialogTitle>
          <DialogDescription>
            Chaque lien s'ouvre dans un nouvel onglet du navigateur. Appui long sur une
            entrée du menu pour la déplacer dans le groupe Web ou en dehors.
          </DialogDescription>
        </DialogHeader>

        {liens.length > 0 && (
          <div className="space-y-2">
            {liens.map(l => (
              <div key={l.url} className="flex items-center gap-2">
                <Input
                  defaultValue={l.libelle}
                  onBlur={e => {
                    const nom = e.target.value.trim();
                    if (nom && nom !== l.libelle) renommer(l.url, nom);
                    else e.target.value = l.libelle;
                  }}
                  className="h-8 w-40 shrink-0"
                  aria-label="Libellé"
                />
                <a href={l.url} target="_blank" rel="noopener noreferrer"
                   className="min-w-0 flex-1 truncate text-xs text-muted-foreground hover:underline" title={l.url}>
                  {l.url}
                </a>
                <a href={l.url} target="_blank" rel="noopener noreferrer" title="Ouvrir"
                   className="p-1.5 rounded-md text-muted-foreground hover:bg-muted">
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button type="button" title="Retirer du menu"
                        onClick={() => onChange(liens.filter(x => x.url !== l.url))}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          className="space-y-3 border-t pt-4"
          onSubmit={e => { e.preventDefault(); ajouter(); }}
        >
          <div className="grid grid-cols-[10rem_1fr] gap-2 items-end">
            <div className="space-y-1">
              <Label htmlFor="lien-web-libelle">Libellé</Label>
              <Input id="lien-web-libelle" value={libelle} onChange={e => setLibelle(e.target.value)}
                     placeholder="Tarif pochoirs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lien-web-url">Adresse</Label>
              <Input id="lien-web-url" value={adresse} onChange={e => { setAdresse(e.target.value); setErreur(null); }}
                     placeholder="https://…" />
            </div>
          </div>
          {erreur && <p className="text-xs text-destructive">{erreur}</p>}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!adresse.trim()}>Ajouter au menu</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
