import { useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';

/**
 * Le champ « Système » du devis, qui propose les systèmes du CRM — les devis
 * au statut « Système (modèle) » — PENDANT la saisie :
 *  - sur la même ligne, la suite du premier nom qui commence comme la saisie,
 *    en gris (Tab ou → l'accepte) ;
 *  - dessous, les systèmes dont le nom contient tous les mots tapés. Le nom
 *    seul se prend d'un clic ; « + lignes » ajoute aussi au devis les lignes du
 *    modèle. Rien n'est ajouté sans ce clic : un nom de système ne remplit
 *    jamais un devis d'office.
 */
export interface SystemeConnu {
  id: string;
  nom: string;
  nbLignes: number;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  systemes: SystemeConnu[];
  /** Ajoute au devis les lignes du modèle choisi. */
  onInsererLignes?: (id: string) => void;
  placeholder?: string;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export default function ChampSysteme({ value, onChange, systemes, onInsererLignes, placeholder }: Props) {
  const [focus, setFocus] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  // Un nom en double (deux modèles « Moquette de pierre ») ne s'affiche qu'une fois.
  const uniques = useMemo(() => {
    const vus = new Set<string>();
    return systemes.filter(s => s.nom.trim() && !vus.has(norm(s.nom)) && vus.add(norm(s.nom)));
  }, [systemes]);

  const q = norm(value);
  const mots = q.split(/\s+/).filter(Boolean);
  const proposes = q
    ? uniques.filter(s => norm(s.nom) !== q && mots.every(m => norm(s.nom).includes(m))).slice(0, 6)
    : uniques.slice(0, 6);
  // La complétion en ligne : un nom qui COMMENCE comme la saisie.
  const suite = q ? uniques.find(s => norm(s.nom).startsWith(q) && norm(s.nom) !== q) : undefined;
  const fantome = suite && value.length > 0 ? suite.nom.slice(value.length) : '';

  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={ref}
          data-voice="systeme"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={e => {
            if (fantome && (e.key === 'Tab' || (e.key === 'ArrowRight' && ref.current?.selectionStart === value.length))) {
              e.preventDefault();
              onChange(suite!.nom);
            }
          }}
          autoComplete="off"
        />
        {/* Suite proposée, en gris, juste après le texte tapé (même police, même retrait). */}
        {focus && fantome && (
          <div className="pointer-events-none absolute inset-0 flex items-center px-3 text-sm overflow-hidden whitespace-pre">
            <span className="invisible">{value}</span>
            <span className="text-muted-foreground/60">{fantome}</span>
            <span className="ml-2 text-[10px] text-muted-foreground/60 border border-border rounded px-1">Tab</span>
          </div>
        )}
      </div>
      {focus && proposes.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md text-sm overflow-hidden">
          <div className="px-2 py-1 text-[11px] text-muted-foreground border-b border-border">Systèmes du CRM</div>
          {proposes.map(s => (
            <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted">
              <button type="button" className="flex-1 text-left truncate" onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(s.nom); setFocus(false); }} title="Prendre ce nom de système">
                {s.nom}
              </button>
              {onInsererLignes && s.nbLignes > 0 && (
                <button type="button" onMouseDown={e => e.preventDefault()}
                  onClick={() => { onChange(s.nom); onInsererLignes(s.id); setFocus(false); }}
                  className="shrink-0 inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                  title={`Ajouter au devis les ${s.nbLignes} lignes de ce modèle (quantités recalculées à la surface du devis)`}>
                  <Plus className="w-3 h-3" /> {s.nbLignes} lignes
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
