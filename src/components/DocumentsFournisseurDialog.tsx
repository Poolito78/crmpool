import { useRef, useState } from 'react';
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Fournisseur } from '@/lib/store';
import {
  GENRES_DOC_FOURNISSEUR, LIBELLE_GENRE_FOURNISSEUR, ajouterDocumentFournisseur, formatTaille,
  lienDocumentFournisseur, supprimerDocumentFournisseur, useDocumentsFournisseur,
  type DocumentFournisseur, type GenreDocFournisseur,
} from '@/lib/gedFournisseur';

/** Les documents rangés sur la fiche d'un fournisseur (mini-GED). */
interface PanelProps {
  fournisseurId: string;
  /** Appelé après un ajout ou une suppression (pastille de nombre à rafraîchir). */
  onChange?: () => void;
}

export function DocumentsFournisseurPanel({ fournisseurId, onChange }: PanelProps) {
  const { documents, chargement, erreur, recharger } = useDocumentsFournisseur(fournisseurId);
  const [filtre, setFiltre] = useState<GenreDocFournisseur | 'tous'>('tous');
  const [genreAjout, setGenreAjout] = useState<GenreDocFournisseur>('autre');
  const [envoi, setEnvoi] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const visibles = filtre === 'tous' ? documents : documents.filter(d => d.genre === filtre);

  async function ajouter(files: File[]) {
    if (files.length === 0) return;
    setEnvoi(true);
    for (const f of files) {
      try { await ajouterDocumentFournisseur(f, { fournisseurId, genre: genreAjout }); }
      catch (err) { toast.error(err instanceof Error ? err.message : `Échec : ${f.name}`); }
    }
    setEnvoi(false);
    await recharger();
    onChange?.();
  }

  async function ouvrir(d: DocumentFournisseur) {
    try { window.open(await lienDocumentFournisseur(d), '_blank', 'noopener'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Ouverture impossible'); }
  }

  async function supprimer(d: DocumentFournisseur) {
    if (!window.confirm(`Supprimer « ${d.fichierNom} » ? Le fichier sera effacé.`)) return;
    try { await supprimerDocumentFournisseur(d); await recharger(); onChange?.(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Suppression impossible'); }
  }

  return (
    <div className="flex flex-col gap-3 min-h-0">
        <div
          className="shrink-0 rounded-lg border border-dashed border-border p-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); void ajouter(Array.from(e.dataTransfer.files)); }}
        >
          <Upload className="w-4 h-4" />
          <span>Glissez des fichiers ici, ou</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={envoi} onClick={() => inputRef.current?.click()}>
            {envoi ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}Parcourir
          </Button>
          <span>rangés comme</span>
          <Select value={genreAjout} onValueChange={v => setGenreAjout(v as GenreDocFournisseur)}>
            <SelectTrigger className="h-7 text-xs w-auto gap-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GENRES_DOC_FOURNISSEUR.map(g => <SelectItem key={g} value={g}>{LIBELLE_GENRE_FOURNISSEUR[g]}</SelectItem>)}
            </SelectContent>
          </Select>
          <input ref={inputRef} type="file" multiple className="hidden"
            onChange={e => { void ajouter(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </div>

        <div className="shrink-0 flex flex-wrap gap-1.5">
          {(['tous', ...GENRES_DOC_FOURNISSEUR] as const).map(g => (
            <button key={g} onClick={() => setFiltre(g)}
              className={`px-2.5 py-1 rounded-full text-xs border ${filtre === g ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {g === 'tous' ? `Tous (${documents.length})` : `${LIBELLE_GENRE_FOURNISSEUR[g]} (${documents.filter(d => d.genre === g).length})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5">
          {chargement && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {erreur && <p className="text-sm text-destructive">Lecture impossible : {erreur} (migration appliquée ?)</p>}
          {!chargement && !erreur && visibles.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucun document.</p>
          )}
          {visibles.map(d => (
            <div key={d.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{d.fichierNom}</p>
                <p className="text-xs text-muted-foreground">
                  {LIBELLE_GENRE_FOURNISSEUR[d.genre]}
                  {d.numero ? ` · n° ${d.numero}` : ''}
                  {d.dateDocument ? ` · ${new Date(d.dateDocument).toLocaleDateString('fr-FR')}` : ''}
                  {d.montantHT != null ? ` · ${d.montantHT.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} HT` : ''}
                  {` · ${formatTaille(d.fichierTaille)}`}
                </p>
              </div>
              <button onClick={() => ouvrir(d)} className="p-1.5 rounded-md hover:bg-muted" title="Ouvrir / télécharger"><Download className="w-4 h-4" /></button>
              <button onClick={() => supprimer(d)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
    </div>
  );
}

interface Props {
  fournisseur: Fournisseur | null;
  onOpenChange: (open: boolean) => void;
  onChange?: () => void;
}

export default function DocumentsFournisseurDialog({ fournisseur, onOpenChange, onChange }: Props) {
  return (
    <Dialog open={!!fournisseur} onOpenChange={onOpenChange}>
      <DialogContent mobileFullscreen className="sm:max-w-2xl sm:max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Documents — {fournisseur?.societe || fournisseur?.nom}</DialogTitle>
        </DialogHeader>
        {fournisseur && <DocumentsFournisseurPanel fournisseurId={fournisseur.id} onChange={onChange} />}
      </DialogContent>
    </Dialog>
  );
}
