/**
 * Onglet « Documents » de la fiche concurrent : les tarifs et devis classés
 * depuis l'analyse de document (`concurrentDocuments.ts`), à rouvrir,
 * ou à supprimer. On peut aussi en déposer un à la main.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  classerDocumentConcurrent, lienDocumentConcurrent, listerDocumentsConcurrent,
  supprimerDocumentConcurrent, type ConcurrentDocument,
} from '@/lib/concurrentDocuments';

const taille = (o?: number) => o == null ? '' : o < 1024 * 1024
  ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;

export default function ConcurrentDocumentsListe({ concurrentId }: { concurrentId?: string }) {
  const [docs, setDocs] = useState<ConcurrentDocument[]>([]);
  const [chargement, setChargement] = useState(false);
  const [depot, setDepot] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const recharger = useCallback(async () => {
    if (!concurrentId) { setDocs([]); return; }
    setChargement(true);
    setDocs(await listerDocumentsConcurrent(concurrentId));
    setChargement(false);
  }, [concurrentId]);
  useEffect(() => { void recharger(); }, [recharger]);

  async function deposer(f: File) {
    if (!concurrentId) return;
    setDepot(true);
    try {
      await classerDocumentConcurrent(concurrentId, f, { libelle: 'Document déposé sur la fiche' });
      toast.success(`« ${f.name} » classé`);
      await recharger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Dépôt impossible');
    } finally {
      setDepot(false);
    }
  }

  async function ouvrir(d: ConcurrentDocument) {
    /* Onglet ouvert AVANT l'attente du lien : sinon le navigateur bloque la fenêtre. */
    const w = window.open('', '_blank');
    try {
      const url = await lienDocumentConcurrent(d);
      if (w) w.location.href = url; else window.open(url, '_blank');
    } catch (e) {
      w?.close();
      toast.error(e instanceof Error ? e.message : 'Ouverture impossible');
    }
  }

  async function supprimer(d: ConcurrentDocument) {
    if (!window.confirm(`Supprimer définitivement « ${d.nom} » de la fiche ?`)) return;
    try {
      await supprimerDocumentConcurrent(d);
      setDocs(prev => prev.filter(x => x.id !== d.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Suppression impossible');
    }
  }

  if (!concurrentId) {
    return <p className="text-sm text-muted-foreground">Enregistrez d'abord les infos du concurrent.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Tarifs et devis classés depuis l'analyse de document ou déposés ici.
        </p>
        <input ref={input} type="file" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void deposer(f); e.target.value = ''; }} />
        <Button size="sm" variant="outline" disabled={depot} onClick={() => input.current?.click()}>
          {depot ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
          Ajouter un document
        </Button>
      </div>
      {chargement ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Aucun document classé.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {docs.map(d => (
            <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <FileText className="w-4 h-4 text-rose-500 shrink-0" />
              <button type="button" onClick={() => void ouvrir(d)} className="min-w-0 flex-1 text-left hover:underline" title="Ouvrir le document">
                <span className="block truncate font-medium">{d.nom}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[d.libelle, d.clientNom, d.dateDocument ?? d.createdAt.split('T')[0], taille(d.taille), d.createdByEmail]
                    .filter(Boolean).join(' · ')}
                </span>
              </button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Ouvrir" onClick={() => void ouvrir(d)}>
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Supprimer" onClick={() => void supprimer(d)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
