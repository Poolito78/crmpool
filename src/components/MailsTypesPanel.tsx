/**
 * Paramètres → Mails : les textes proposés à l'envoi d'un devis, d'une
 * commande fournisseur, d'une facture, d'un AR de commande client.
 *
 * Un type à la fois : objet, corps, champs à insérer au curseur, aperçu
 * rempli d'exemples. « Texte d'origine » efface le réglage de l'utilisateur.
 * La logique (champs, `[[ ]]`, stockage) vit dans `mailsTypes.ts`.
 */
import { useEffect, useRef, useState } from 'react';
import { Mail, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { MAILS_DEFAUT, TYPES_MAIL, remplirMail, useMailsTypes, type TypeMail } from '@/lib/mailsTypes';

export default function MailsTypesPanel() {
  const { modele, estPersonnalise, enregistrer, reinitialiser, charge, version } = useMailsTypes();
  const [type, setType] = useState<TypeMail>('devis');
  const [objet, setObjet] = useState('');
  const [corps, setCorps] = useState('');
  const [enCours, setEnCours] = useState(false);
  // Dernier champ de saisie touché : c'est là qu'un champ cliqué s'insère.
  const [cible, setCible] = useState<'objet' | 'corps'>('corps');
  const objetRef = useRef<HTMLInputElement>(null);
  const corpsRef = useRef<HTMLTextAreaElement>(null);

  const def = MAILS_DEFAUT[type];
  const enregistre = modele(type);
  const modifie = objet !== enregistre.objet || corps !== enregistre.corps;

  // Le type choisi (ou la lecture des réglages) recharge les champs.
  useEffect(() => {
    const m = modele(type);
    setObjet(m.objet);
    setCorps(m.corps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, version]);

  function changerType(t: TypeMail) {
    if (t === type) return;
    if (modifie && !confirm('Les modifications non enregistrées de ce mail seront perdues. Continuer ?')) return;
    setType(t);
  }

  function insererChamp(cle: string) {
    const jeton = `{${cle}}`;
    const el = cible === 'objet' ? objetRef.current : corpsRef.current;
    const valeur = cible === 'objet' ? objet : corps;
    const debut = el?.selectionStart ?? valeur.length;
    const fin = el?.selectionEnd ?? valeur.length;
    const suite = valeur.slice(0, debut) + jeton + valeur.slice(fin);
    if (cible === 'objet') setObjet(suite); else setCorps(suite);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(debut + jeton.length, debut + jeton.length);
    });
  }

  async function sauver() {
    if (!objet.trim() || !corps.trim()) { toast.error("L'objet et le corps sont requis"); return; }
    setEnCours(true);
    const err = await enregistrer(type, { objet, corps });
    setEnCours(false);
    if (err) toast.error(`Enregistrement impossible : ${err}`);
    else toast.success(`Mail « ${def.libelle} » enregistré`);
  }

  async function texteOrigine() {
    if (!confirm(`Revenir au texte d'origine pour « ${def.libelle} » ?`)) return;
    setEnCours(true);
    const err = await reinitialiser(type);
    setEnCours(false);
    if (err) { toast.error(`Impossible : ${err}`); return; }
    // Sans réglage enregistré, l'effet ne se relance pas forcément : on recharge à la main.
    setObjet(def.objet);
    setCorps(def.corps);
    toast.success("Texte d'origine rétabli");
  }

  const exemples = Object.fromEntries(Object.entries(def.champs).map(([k, c]) => [k, c.exemple]));

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div>
        <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" /> Mails types
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Objet et texte proposés à l'envoi de chaque document — vos réglages, avec votre signature.
          Le mail reste modifiable au moment de l'envoi.
        </p>
      </div>

      {/* Types */}
      <div className="flex flex-wrap gap-2">
        {TYPES_MAIL.map(t => (
          <button key={t} type="button" onClick={() => changerType(t)}
            className={cn('px-3 py-2 rounded-lg border text-sm font-medium transition-all',
              t === type ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-primary/50')}>
            {MAILS_DEFAUT[t].libelle}
            {estPersonnalise(t) && <span className="ml-1.5 text-[10px] text-primary align-middle">● personnalisé</span>}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{def.description}</p>

      {!charge ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          <div>
            <Label>Objet</Label>
            <Input ref={objetRef} value={objet} onChange={e => setObjet(e.target.value)} onFocus={() => setCible('objet')} />
          </div>
          <div>
            <Label>Texte du mail</Label>
            <Textarea ref={corpsRef} value={corps} onChange={e => setCorps(e.target.value)} onFocus={() => setCible('corps')}
              rows={14} className="font-mono text-xs leading-relaxed" />
          </div>

          {/* Champs */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Champs — cliquer pour insérer dans {cible === 'objet' ? "l'objet" : 'le texte'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(def.champs).map(([cle, c]) => (
                <button key={cle} type="button" onClick={() => insererChamp(cle)} title={`Exemple : ${c.exemple}`}
                  className="text-xs rounded-md border border-border bg-muted/40 px-2 py-1 hover:bg-muted">
                  <code className="text-primary">{`{${cle}}`}</code> <span className="text-muted-foreground">{c.libelle}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Un passage entre <code>[[ ]]</code> disparaît si l'un de ses champs est vide —
              par ex. <code>{'[[ (Réf. {reference})]]'}</code> n'apparaît que si le document a une référence.
            </p>
          </div>

          {/* Aperçu */}
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Aperçu (exemple)</p>
            <p className="text-sm"><span className="text-muted-foreground">Objet : </span>{remplirMail(objet, exemples)}</p>
            <pre className="text-sm whitespace-pre-wrap font-sans">{remplirMail(corps, exemples)}</pre>
          </div>

          <div className="flex justify-between gap-2">
            <Button variant="outline" size="sm" onClick={texteOrigine} disabled={enCours || (!estPersonnalise(type) && objet === def.objet && corps === def.corps)}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Texte d'origine
            </Button>
            <Button size="sm" onClick={sauver} disabled={enCours || !modifie}>
              <Save className="w-3.5 h-3.5 mr-1.5" /> {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
