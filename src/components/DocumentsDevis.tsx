/**
 * Les documents joints d'un devis, ouvrables depuis la liste des devis
 * (`piecesJointesDevis.ts`).
 *
 * - `liste` (vue cartes) : un lien par document, nom compris ;
 * - `compact` (vue tableau) : un trombone et le nombre, qui ouvre le
 *   document seul ou déroule la liste.
 *
 * Les clics s'arrêtent ici : la carte et la ligne ouvrent le devis au clic,
 * et un menu Radix, rendu hors du tableau, remonte quand même ses clics au
 * composant parent React.
 */
import { FileText, FileImage, Link2, Lock, Paperclip } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MIME_LIEN, ouvrirFichierDevis, type FichierDevis } from '@/lib/piecesJointesDevis';

function Icone({ f }: { f: FichierDevis }) {
  if (f.mime === MIME_LIEN) return <Link2 className="w-3.5 h-3.5 shrink-0 text-violet-500" />;
  if (f.mime?.startsWith('image/')) return <FileImage className="w-3.5 h-3.5 shrink-0 text-blue-500" />;
  if (f.mime?.includes('pdf')) return <FileText className="w-3.5 h-3.5 shrink-0 text-red-500" />;
  return <Paperclip className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />;
}

const arreter = (e: { stopPropagation: () => void }) => e.stopPropagation();

export default function DocumentsDevis({ fichiers, compact = false }: { fichiers?: FichierDevis[]; compact?: boolean }) {
  if (!fichiers?.length) return null;

  if (compact) {
    if (fichiers.length === 1) {
      const f = fichiers[0];
      return (
        <button type="button" title={`Ouvrir « ${f.nom} »`}
          onClick={e => { arreter(e); void ouvrirFichierDevis(f); }}
          className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline shrink-0">
          <Paperclip className="w-3.5 h-3.5" />
        </button>
      );
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" title={`${fichiers.length} documents joints`} onClick={arreter}
            className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline shrink-0">
            <Paperclip className="w-3.5 h-3.5" />{fichiers.length}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-w-sm" onClick={arreter}>
          {fichiers.map(f => (
            <DropdownMenuItem key={f.id} onSelect={() => void ouvrirFichierDevis(f)} className="gap-2 text-xs">
              <Icone f={f} />
              <span className="truncate">{f.nom}</span>
              {f.confidentiel && <Lock className="w-3 h-3 shrink-0 text-amber-500" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1">
      {fichiers.map(f => (
        <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
          title={`Ouvrir « ${f.nom} »${f.confidentiel ? ' — confidentiel, non transmis à l’envoi' : ''}`}
          onClick={e => { e.preventDefault(); arreter(e); void ouvrirFichierDevis(f); }}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline min-w-0 max-w-full">
          <Icone f={f} />
          <span className="truncate max-w-[22rem]">{f.nom}</span>
          {f.confidentiel && <Lock className="w-3 h-3 shrink-0 text-amber-500" />}
        </a>
      ))}
    </div>
  );
}
