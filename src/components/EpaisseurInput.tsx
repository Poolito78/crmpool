import { useEffect, useState } from 'react';
import { InputNombre } from '@/components/InputNombre';

/**
 * Épaisseur d'un mortier dosé, en mm — validée à la SORTIE du champ (ou
 * Entrée), pas à chaque frappe : taper « 30 » passerait par « 3 », sous le
 * minimum de la fiche, et retirerait les lignes de granulats avec leur prix.
 */
interface Props {
  value?: number;
  onCommit: (mm: number | undefined) => void;
  className?: string;
  title?: string;
}

export default function EpaisseurInput({ value, onCommit, className, title }: Props) {
  const [v, setV] = useState<number | undefined>(value);
  useEffect(() => setV(value), [value]);
  const valider = () => { const n = v && v > 0 ? v : undefined; if (n !== value) onCommit(n); };
  return (
    <InputNombre decimales={1} value={v} onChange={n => setV(n)} onBlur={valider}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      placeholder="mm" className={className} title={title} />
  );
}
