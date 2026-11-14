import { useState } from 'react';
import { ExternalLink, KeyRound, Loader2, Mail, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { genererIdentifiantsTarif, mailIdentifiantsTarif, urlTarif, type IdentifiantsTarif } from '@/lib/tarifEnLigne';

/**
 * « Accès à son tarif » dans la fiche client — réservé à l'admin.
 *
 * Cocher ouvre l'accès à l'enregistrement de la fiche ; décocher le coupe
 * aussitôt (la fonction relit la case à chaque appel). Les identifiants se
 * génèrent ici, sur un client déjà enregistré.
 */
export default function AccesTarifClient({ clientId, email, nomContact, checked, onChange }: {
  clientId?: string;
  email: string;
  nomContact?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [ids, setIds] = useState<IdentifiantsTarif | null>(null);

  const generer = async () => {
    if (!clientId) return;
    setEnvoi(true);
    try {
      const r = await genererIdentifiantsTarif(clientId, email);
      setIds(r);
      onChange(true);
      toast.success('Identifiants créés — transmettez-les au client.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-center gap-3 mb-2">
        <Checkbox id="accesTarif" checked={checked} onCheckedChange={v => onChange(v === true)} />
        <Label htmlFor="accesTarif" className="text-base font-semibold cursor-pointer">Accès à son tarif en ligne</Label>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Le client consulte les articles du catalogue ISOFLOOR à SES prix (remises ci-dessus) et les télécharge en PDF.
      </p>
      {checked && (
        <div className="bg-muted/30 rounded-lg border border-border p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={!clientId || envoi} onClick={generer}>
              {envoi ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1.5" />}
              Créer / renouveler le mot de passe
            </Button>
            {clientId && (
              <Button type="button" size="sm" variant="ghost" asChild>
                <a href={`/tarif?client=${clientId}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1.5" /> Voir son tarif
                </a>
              </Button>
            )}
          </div>
          {!clientId && <p className="text-xs text-amber-600">Enregistrez d'abord la fiche pour créer les identifiants.</p>}
          {ids && (
            <div className="text-sm space-y-1 bg-background rounded border border-border p-3">
              <p><span className="text-muted-foreground">Adresse :</span> {urlTarif()}</p>
              <p><span className="text-muted-foreground">Identifiant :</span> <strong>{ids.identifiant}</strong></p>
              <p><span className="text-muted-foreground">Mot de passe :</span> <strong className="font-mono">{ids.mdp}</strong></p>
              <p className="text-xs text-amber-600">Ce mot de passe ne sera plus affiché : transmettez-le maintenant.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" size="sm" asChild>
                  <a href={mailIdentifiantsTarif(ids, nomContact)}><Mail className="w-4 h-4 mr-1.5" /> Préparer le mail</a>
                </Button>
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => navigator.clipboard.writeText(`${urlTarif()}\nIdentifiant : ${ids.identifiant}\nMot de passe : ${ids.mdp}`).then(() => toast.success('Copié'))}
                >
                  <Copy className="w-4 h-4 mr-1.5" /> Copier
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
