/**
 * Paramètres → Mails : les textes proposés à l'envoi d'un devis, d'une
 * commande fournisseur, d'une facture, d'un AR de commande client.
 *
 * Un type à la fois : objet, corps mis en forme (police, taille, couleur,
 * gras, italique — `EditeurMail`), champs à insérer au curseur, images
 * (logo, signature) placées par un repère `{img:…}`, aperçu rempli
 * d'exemples. « Texte d'origine » efface le réglage de l'utilisateur.
 * La logique (champs, `[[ ]]`, stockage) vit dans `mailsTypes.ts`.
 */
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Mail, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import EditeurMail, { type EditeurMailRef } from '@/components/EditeurMail';
import { cn } from '@/lib/utils';
import { MAILS_DEFAUT, TYPES_MAIL, corpsEnHtml, estHtmlMail, idImage, jetonImage, lireImageMail, remplirMail, texteVersHtml, useMailsTypes, type ImageMail, type TypeMail } from '@/lib/mailsTypes';

/* Un texte brut (texte d'origine, réglage d'avant la mise en forme) s'ouvre
   dans l'éditeur converti en HTML, ligne à ligne. */
const enHtml = (corps: string) => (estHtmlMail(corps) ? corps : texteVersHtml(corps));

export default function MailsTypesPanel() {
  const { modele, estPersonnalise, enregistrer, reinitialiser, toutesImages, charge, version } = useMailsTypes();
  const [type, setType] = useState<TypeMail>('devis');
  const [objet, setObjet] = useState('');
  const [corps, setCorps] = useState('');
  const [images, setImages] = useState<ImageMail[]>([]);
  const fichierRef = useRef<HTMLInputElement>(null);
  const [enCours, setEnCours] = useState(false);
  // Dernier champ de saisie touché : c'est là qu'un champ cliqué s'insère.
  const [cible, setCible] = useState<'objet' | 'corps'>('corps');
  const objetRef = useRef<HTMLInputElement>(null);
  const editeurRef = useRef<EditeurMailRef>(null);

  const def = MAILS_DEFAUT[type];
  const enregistre = modele(type);
  const modifie = objet !== enregistre.objet || corps !== enHtml(enregistre.corps)
    || JSON.stringify(images) !== JSON.stringify(enregistre.images ?? []);

  // Le type choisi (ou la lecture des réglages) recharge les champs.
  useEffect(() => {
    const m = modele(type);
    setObjet(m.objet);
    setCorps(enHtml(m.corps));
    setImages(m.images ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, version]);

  function changerType(t: TypeMail) {
    if (t === type) return;
    if (modifie && !confirm('Les modifications non enregistrées de ce mail seront perdues. Continuer ?')) return;
    setType(t);
  }

  function insererChamp(cle: string, dansLeTexte = false) {
    const jeton = dansLeTexte ? cle : `{${cle}}`;
    // Le texte : au curseur de l'éditeur (une image n'a rien à faire dans l'objet).
    if (cible === 'corps' || dansLeTexte) { editeurRef.current?.inserer(jeton); return; }
    const el = objetRef.current;
    const debut = el?.selectionStart ?? objet.length;
    const fin = el?.selectionEnd ?? objet.length;
    setObjet(objet.slice(0, debut) + jeton + objet.slice(fin));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(debut + jeton.length, debut + jeton.length);
    });
  }

  /* Une image ajoutée se place au curseur du texte (une image n'a rien à faire dans l'objet). */
  function placerImage(img: Omit<ImageMail, 'id'>) {
    const id = idImage(img.nom, images.map(i => i.id));
    setImages(prev => [...prev, { ...img, id }]);
    insererChamp(jetonImage(id), true);
  }

  async function ajouterImage(fichier: File | undefined) {
    if (!fichier) return;
    try {
      const { dataUrl, largeur } = await lireImageMail(fichier);
      placerImage({ nom: fichier.name, dataUrl, largeur });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function retirerImage(id: string) {
    setImages(prev => prev.filter(i => i.id !== id));
    // Le repère part avec l'image : un repère orphelin resterait visible dans le mail.
    setCorps(prev => prev.split(jetonImage(id)).join(''));
  }

  async function sauver() {
    if (!objet.trim() || !corps.trim()) { toast.error("L'objet et le corps sont requis"); return; }
    setEnCours(true);
    const err = await enregistrer(type, { objet, corps, images });
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
    setCorps(enHtml(def.corps));
    setImages([]);
    toast.success("Texte d'origine rétabli");
  }

  const exemples = Object.fromEntries(Object.entries(def.champs).map(([k, c]) => [k, c.exemple]));
  // Images d'un autre mail type, à réutiliser d'un clic (même logo partout).
  const reutilisables = toutesImages().filter(i => !images.some(x => x.dataUrl === i.dataUrl));

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
            <EditeurMail ref={editeurRef} value={corps} onChange={setCorps} onFocus={() => setCible('corps')} />
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

          {/* Images */}
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Images (logo, signature)</p>
              <input ref={fichierRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
                onChange={e => { void ajouterImage(e.target.files?.[0]); e.target.value = ''; }} />
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => fichierRef.current?.click()}>
                <ImagePlus className="w-3.5 h-3.5 mr-1" /> Ajouter une image
              </Button>
              {reutilisables.map(i => (
                <button key={i.dataUrl} type="button" onClick={() => placerImage({ nom: i.nom, dataUrl: i.dataUrl, largeur: i.largeur })}
                  title={`Reprendre « ${i.nom} » d'un autre mail type`}
                  className="h-7 flex items-center gap-1 rounded-md border border-border px-1.5 text-xs hover:bg-muted">
                  <img src={i.dataUrl} alt="" className="h-5 w-auto max-w-[60px] object-contain" /> reprendre
                </button>
              ))}
            </div>
            {images.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                L'image se place au curseur du texte par un repère <code>{'{img:…}'}</code>, que l'on peut déplacer.
                Elle part dans le mail lui-même (pas un lien), réduite à 600 px.
              </p>
            ) : (
              <div className="space-y-1.5">
                {images.map(i => (
                  <div key={i.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                    <img src={i.dataUrl} alt={i.nom} className="h-10 w-auto max-w-[120px] object-contain bg-white rounded" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{i.nom}</p>
                      <code className="text-[11px] text-primary">{jetonImage(i.id)}</code>
                      {!corps.includes(jetonImage(i.id)) && <span className="ml-2 text-[11px] text-amber-600">placée nulle part — elle ne partira pas</span>}
                    </div>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      Largeur
                      <Input type="number" min={20} max={600} value={i.largeur} className="h-7 w-20 text-xs"
                        onChange={e => { const v = Math.max(20, Math.min(600, Number(e.target.value) || 0)); setImages(prev => prev.map(x => x.id === i.id ? { ...x, largeur: v } : x)); }} />
                      px
                    </label>
                    <button type="button" title="Placer encore au curseur" onClick={() => insererChamp(jetonImage(i.id), true)}
                      className="text-xs text-primary hover:underline">placer</button>
                    <button type="button" title="Retirer l'image (et son repère)" onClick={() => retirerImage(i.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Aperçu */}
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Aperçu (exemple)</p>
            <p className="text-sm"><span className="text-muted-foreground">Objet : </span>{remplirMail(objet, exemples)}</p>
            {/* Le HTML du mail, images comprises (elles-mêmes en data URL ici, en pièce en ligne à l'envoi). */}
            <div className="text-sm" dangerouslySetInnerHTML={{ __html: corpsEnHtml(remplirMail(corps, exemples), images, 'data') }} />
          </div>

          <div className="flex justify-between gap-2">
            <Button variant="outline" size="sm" onClick={texteOrigine} disabled={enCours || (!estPersonnalise(type) && objet === def.objet && corps === enHtml(def.corps))}>
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
