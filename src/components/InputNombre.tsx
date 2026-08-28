import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

/**
 * Un champ numérique qui se laisse saisir.
 *
 * LE DÉFAUT QU'IL CORRIGE. Avec `<input type="number">`, React ne réécrit le
 * champ que si la valeur affichée DIFFÈRE de la valeur du composant — et il
 * les compare de façon LÂCHE. Or « 0170,99 » et 170,99 sont égaux pour cette
 * comparaison. Le zéro de tête, tapé par accident devant le 0 déjà présent,
 * n'est donc jamais effacé par React : il reste là, et rien de ce qu'on tape
 * ne le fait partir. C'est exactement ce qui a été signalé.
 *
 * LE PRINCIPE. Le champ est du TEXTE. Il porte exactement ce qui a été tapé,
 * virgule française comprise, et ne remonte un nombre que lorsque ce qui est
 * écrit en est un. Tant qu'on tape « 1, » ou qu'on efface tout, la valeur ne
 * saute pas à zéro et le curseur ne se déplace pas.
 *
 * TANT QU'ON Y EST. Le champ n'est réécrit de l'extérieur que si l'on n'y est
 * pas : un recalcul du coefficient ou une reprise Odoo ne vient plus couper
 * une saisie en cours. Et l'affichage est arrondi — un coefficient valait
 * « 1,6699807006257676 » à l'écran, illisible — sans que la valeur enregistrée
 * soit touchée tant que personne n'y a mis la main.
 */

/** Ce qu'on montre : au plus `decimales` chiffres, virgule à la française. */
function afficher(v: number | undefined | null, decimales: number): string {
  if (v == null || !Number.isFinite(v)) return '';
  const f = 10 ** decimales;
  return String(Math.round(v * f) / f).replace('.', ',');
}

/** Ce qu'on comprend : virgule ou point, espaces tolérés. */
function lire(t: string): number | null {
  const net = t.replace(/\s/g, '').replace(',', '.');
  if (net === '') return 0;
  if (!/^-?\d*\.?\d*$/.test(net) || net === '.' || net === '-') return null;
  const n = Number(net);
  return Number.isFinite(n) ? n : null;
}

interface Props extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
  value: number | undefined | null;
  onChange: (v: number) => void;
  /** Chiffres après la virgule à l'affichage. 2 pour un prix, 4 pour un coefficient. */
  decimales?: number;
}

export function InputNombre({ value, onChange, decimales = 4, onFocus, onBlur, ...rest }: Props) {
  const [texte, setTexte] = useState(() => afficher(value, decimales));
  const dedans = useRef(false);

  /* La valeur peut changer sans nous : coefficient recalculé depuis le prix
     revendeur, prix repris d'Odoo, fiche rouverte sur un autre article. On
     réaligne alors le texte — mais jamais pendant que l'on saisit. */
  useEffect(() => {
    if (!dedans.current) setTexte(afficher(value, decimales));
  }, [value, decimales]);

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={texte}
      onFocus={e => { dedans.current = true; onFocus?.(e); }}
      onBlur={e => {
        dedans.current = false;
        /* En repartant, on remet le champ en forme : « 0170,99 » saisi
           devient « 170,99 », et un champ vidé retrouve sa valeur. */
        setTexte(afficher(value, decimales));
        onBlur?.(e);
      }}
      onChange={e => {
        const t = e.target.value;
        setTexte(t);
        const n = lire(t);
        /* Une saisie encore incomplète — « 1, », « - » — ne vaut pas zéro :
           on garde la dernière valeur valable et on attend la suite. */
        if (n !== null) onChange(n);
      }}
    />
  );
}
