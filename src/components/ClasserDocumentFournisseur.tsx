import { useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Fournisseur } from '@/lib/store';
import type { DocumentAnalysis } from '@/lib/analyseDocument';
import { rapprocherFournisseur } from '@/lib/prixAchatFournisseur';
import {
  GENRES_DOC_FOURNISSEUR, LIBELLE_GENRE_FOURNISSEUR, ajouterDocumentFournisseur, formatTaille,
  genreDepuisType, TAILLE_MAX_GED, type GenreDocFournisseur,
} from '@/lib/gedFournisseur';

/**
 * Encart de l'Analyse : range les pièces glissées (PDF, .eml, .msg, Excel)
 * dans la mini-GED du fournisseur. Le genre et le fournisseur sont PROPOSÉS
 * d'après l'analyse, jamais imposés — et rien ne part sans le clic.
 */
interface Props {
  fichiers: File[];
  result: DocumentAnalysis;
  fournisseurs: Fournisseur[];
  /** Fournisseur déjà établi par l'écran (commande retrouvée, fournisseur choisi). */
  fournisseurIdConnu?: string;
}

export default function ClasserDocumentFournisseur({ fichiers, result, fournisseurs, fournisseurIdConnu }: Props) {
  const propose = useMemo(
    () => fournisseurIdConnu || rapprocherFournisseur(result.nomPartenaire, fournisseurs)?.id || '',
    [fournisseurIdConnu, result.nomPartenaire, fournisseurs],
  );
  const [fournisseurId, setFournisseurId] = useState(propose);
  const [genre, setGenre] = useState<GenreDocFournisseur>(genreDepuisType(result.typeDocument, fichiers[0]?.name));
  const [numero, setNumero] = useState(result.numeroDocument ?? '');
  const [exclus, setExclus] = useState<Set<number>>(new Set());
  const [envoi, setEnvoi] = useState(false);
  const [classes, setClasses] = useState<string | null>(null);

  // Une nouvelle analyse (ou un type corrigé) repart des propositions.
  useEffect(() => { setFournisseurId(propose); }, [propose]);
  useEffect(() => { setGenre(genreDepuisType(result.typeDocument, fichiers[0]?.name)); }, [result.typeDocument, fichiers]);
  useEffect(() => { setNumero(result.numeroDocument ?? ''); }, [result.numeroDocument]);
  useEffect(() => { setClasses(null); setExclus(new Set()); }, [fichiers]);

  if (fichiers.length === 0) return null;

  const aClasser = fichiers.filter((_, i) => !exclus.has(i));

  async function classer() {
    if (!fournisseurId) { toast.error('Choisissez le fournisseur'); return; }
    if (aClasser.length === 0) return;
    setEnvoi(true);
    let ok = 0;
    for (const f of aClasser) {
      try {
        await ajouterDocumentFournisseur(f, {
          fournisseurId, genre,
          numero: numero.trim(),
          libelle: result.nomPartenaire ?? '',
          dateDocument: result.dateDocument,
          montantHT: result.totalHT,
        });
        ok++;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Échec : ${f.name}`);
      }
    }
    setEnvoi(false);
    if (ok > 0) {
      const nom = fournisseurs.find(x => x.id === fournisseurId)?.societe || 'le fournisseur';
      setClasses(`${ok} document${ok > 1 ? 's' : ''} classé${ok > 1 ? 's' : ''} chez ${nom}`);
      toast.success(`Classé dans les documents de ${nom}`);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Archive className="w-4 h-4 text-primary" /> Classer dans les documents du fournisseur
      </div>

      {classes ? (
        <div className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="w-4 h-4" /> {classes}
          <button className="ml-2 text-xs text-muted-foreground underline" onClick={() => setClasses(null)}>
            classer ailleurs
          </button>
        </div>
      ) : (<>
        <ul className="space-y-1">
          {fichiers.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!exclus.has(i)} disabled={f.size > TAILLE_MAX_GED}
                onChange={() => setExclus(prev => { const s = new Set(prev); if (s.has(i)) s.delete(i); else s.add(i); return s; })} />
              <span className="truncate">{f.name}</span>
              <span className={f.size > TAILLE_MAX_GED ? 'text-destructive shrink-0' : 'text-muted-foreground shrink-0'}>
                {formatTaille(f.size)}{f.size > TAILLE_MAX_GED ? ' — trop gros' : ''}
              </span>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Select value={fournisseurId} onValueChange={setFournisseurId}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Fournisseur…" /></SelectTrigger>
            <SelectContent>
              {[...fournisseurs].sort((a, b) => (a.societe || a.nom).localeCompare(b.societe || b.nom)).map(f => (
                <SelectItem key={f.id} value={f.id}>{f.societe || f.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={genre} onValueChange={v => setGenre(v as GenreDocFournisseur)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GENRES_DOC_FOURNISSEUR.map(g => (
                <SelectItem key={g} value={g}>{LIBELLE_GENRE_FOURNISSEUR[g]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input className="h-8 text-xs" placeholder="N° du document" value={numero} onChange={e => setNumero(e.target.value)} />
        </div>

        {!propose && result.nomPartenaire && (
          <p className="text-xs text-amber-600">
            « {result.nomPartenaire} » n'a pas été retrouvé parmi vos fournisseurs — choisissez-le.
          </p>
        )}

        <Button size="sm" onClick={classer} disabled={envoi || aClasser.length === 0 || !fournisseurId}>
          {envoi ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Archive className="w-3.5 h-3.5 mr-1.5" />}
          Classer {aClasser.length} fichier{aClasser.length > 1 ? 's' : ''}
        </Button>
      </>)}
    </div>
  );
}
