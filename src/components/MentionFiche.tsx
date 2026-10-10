import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { LIBELLE_TYPE_FICHE, TYPES_FICHE, mentionTexte, type TypeFiche } from '@/lib/liensProduit';

/**
 * Mention d'une fiche (« Fiche technique fournisseur », « Fiche système »…) :
 * un champ LIBRE, avec les mentions habituelles en suggestion. On peut donc
 * écrire la sienne — « Fiche de pose », « Fiche de données de sécurité »…
 *
 * Une suggestion choisie est mémorisée par sa clé (le libellé pourra évoluer),
 * un texte libre tel qu'il est écrit. Vide = sans mention.
 *
 * `live` : valide à chaque frappe (formulaire local qu'on enregistre ensuite) ;
 * sinon à la sortie du champ (écriture directe en base).
 */
interface Props {
  value?: TypeFiche;
  onCommit: (v: TypeFiche | undefined) => void;
  live?: boolean;
  className?: string;
}

const cleDe = (texte: string): TypeFiche | undefined => {
  const t = texte.trim();
  if (!t) return undefined;
  return TYPES_FICHE.find(k => LIBELLE_TYPE_FICHE[k] === t) ?? t;
};

export default function MentionFiche({ value, onCommit, live, className }: Props) {
  const [texte, setTexte] = useState(mentionTexte(value));
  const liste = useId();

  // Un changement venu d'ailleurs (autre fiche, rechargement) remplace le texte ;
  // la frappe en cours, elle, n'est jamais écrasée.
  useEffect(() => {
    if (cleDe(texte) !== value) setTexte(mentionTexte(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const valider = (t: string) => {
    const cle = cleDe(t);
    if (cle !== value) onCommit(cle);
  };

  return (
    <>
      <Input
        className={className}
        list={liste}
        value={texte}
        placeholder="Sans mention — ou tapez la vôtre"
        onChange={e => { setTexte(e.target.value); if (live) valider(e.target.value); }}
        onBlur={() => valider(texte)}
      />
      <datalist id={liste}>
        {TYPES_FICHE.map(k => <option key={k} value={LIBELLE_TYPE_FICHE[k]} />)}
      </datalist>
    </>
  );
}
