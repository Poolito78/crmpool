import { useState, useEffect } from 'react';
import { Archive, Plus, Trash2, Save, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { Devis, RaisonArchive, ConcurrentProduit, DevisMessageTemplate } from '@/lib/store';
import { RAISON_ARCHIVE, useDevisMessageTemplates } from '@/lib/store';

interface ArchiveData {
  archiveRaison: RaisonArchive;
  archiveCommentaire: string;
  archiveConcurrents: ConcurrentProduit[];
}

interface Props {
  devis: Devis | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: ArchiveData) => void;
  produits?: { id: string; description: string; reference: string }[];
}

export default function DevisArchiveDialog({ devis, open, onOpenChange, onConfirm, produits = [] }: Props) {
  const { templates, addTemplate, deleteTemplate } = useDevisMessageTemplates();
  const [raison, setRaison] = useState<RaisonArchive>('autre');
  const [commentaire, setCommentaire] = useState('');
  const [concurrents, setConcurrents] = useState<ConcurrentProduit[]>([]);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateNom, setTemplateNom] = useState('');
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  // Pré-remplir le commentaire quand la raison change
  useEffect(() => {
    if (raison && RAISON_ARCHIVE[raison]) {
      setCommentaire(RAISON_ARCHIVE[raison].messageDefaut);
    }
  }, [raison]);

  // Reset quand le dialog s'ouvre
  useEffect(() => {
    if (open) {
      setRaison('autre');
      setCommentaire('');
      setConcurrents([]);
      setSaveAsTemplate(false);
      setTemplateNom('');
    }
  }, [open]);

  function applyTemplate(t: DevisMessageTemplate) {
    setCommentaire(t.contenu);
    if (t.raisonArchive) setRaison(t.raisonArchive);
    setTemplatePickerOpen(false);
  }

  function addConcurrent() {
    setConcurrents(prev => [...prev, { nomConcurrent: '', prixConcurrent: undefined, delaiConcurrent: undefined }]);
  }

  function updateConcurrent(idx: number, patch: Partial<ConcurrentProduit>) {
    setConcurrents(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }

  function removeConcurrent(idx: number) {
    setConcurrents(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleConfirm() {
    if (saveAsTemplate && templateNom.trim()) {
      await addTemplate({ nom: templateNom.trim(), contenu: commentaire, raisonArchive: raison });
      toast.success('Modèle sauvegardé');
    }
    onConfirm({
      archiveRaison: raison,
      archiveCommentaire: commentaire,
      archiveConcurrents: concurrents.filter(c => c.nomConcurrent || c.prixConcurrent),
    });
  }

  if (!devis) return null;

  const raisonInfo = RAISON_ARCHIVE[raison];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-muted-foreground" />
            Archiver le devis {devis.numero}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Raison */}
          <div>
            <Label>Raison d'archivage</Label>
            <select
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={raison}
              onChange={e => setRaison(e.target.value as RaisonArchive)}
            >
              {(Object.entries(RAISON_ARCHIVE) as [RaisonArchive, typeof RAISON_ARCHIVE[RaisonArchive]][]).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>

          {/* Commentaire + templates */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Commentaire</Label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTemplatePickerOpen(v => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1"
                >
                  Modèles <ChevronDown className="w-3 h-3" />
                </button>
                {templatePickerOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-xl p-2 min-w-[220px]">
                    {templates.length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-1">Aucun modèle sauvegardé</p>
                    )}
                    {templates.map(t => (
                      <div key={t.id} className="flex items-center gap-1 group">
                        <button
                          type="button"
                          onClick={() => applyTemplate(t)}
                          className="flex-1 text-left text-sm px-2 py-1.5 rounded hover:bg-accent/50 truncate"
                        >
                          {t.nom}
                          {t.raisonArchive && (
                            <span className="ml-1 text-xs text-muted-foreground">· {RAISON_ARCHIVE[t.raisonArchive]?.label}</span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTemplate(t.id)}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <textarea
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
              rows={4}
              value={commentaire}
              onChange={e => setCommentaire(e.target.value)}
              placeholder="Commentaire sur la raison d'archivage..."
            />
          </div>

          {/* Sauvegarder comme modèle */}
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="saveTemplate"
              checked={saveAsTemplate}
              onChange={e => setSaveAsTemplate(e.target.checked)}
              className="mt-0.5 rounded border-input accent-primary"
            />
            <div className="flex-1">
              <label htmlFor="saveTemplate" className="text-sm cursor-pointer">
                Sauvegarder ce commentaire comme modèle
              </label>
              {saveAsTemplate && (
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="Nom du modèle..."
                  value={templateNom}
                  onChange={e => setTemplateNom(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* Concurrents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-muted-foreground">Concurrents identifiés (optionnel)</Label>
              <button
                type="button"
                onClick={addConcurrent}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            </div>
            {concurrents.length > 0 && (
              <div className="space-y-2">
                {concurrents.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_70px_auto] gap-2 items-center">
                    <Input
                      placeholder="Nom concurrent"
                      value={c.nomConcurrent || ''}
                      onChange={e => updateConcurrent(i, { nomConcurrent: e.target.value })}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="Prix €"
                      type="number"
                      value={c.prixConcurrent ?? ''}
                      onChange={e => updateConcurrent(i, { prixConcurrent: e.target.value ? Number(e.target.value) : undefined })}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="Délai j"
                      type="number"
                      value={c.delaiConcurrent ?? ''}
                      onChange={e => updateConcurrent(i, { delaiConcurrent: e.target.value ? Number(e.target.value) : undefined })}
                      className="h-8 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeConcurrent(i)}
                      className="p-1 hover:text-destructive text-muted-foreground"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {produits.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Lier à un produit spécifique : renseignez le nom du produit dans le commentaire.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            onClick={handleConfirm}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            <Archive className="w-4 h-4 mr-2" />
            Archiver
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
