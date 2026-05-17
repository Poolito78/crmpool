/**
 * CommandeARDialog — Génération PDF + envoi Outlook de l'Accusé de Réception commande client.
 * Même logique que DevisEmailDialog : génération html2canvas → PDF, EML, dossier "Commandes Clients".
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Mail, Send, Loader2, FileText, FolderOpen, Eye, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { type CommandeClient, type Client, formatMontant, formatDate, calculerTotalDevis } from '@/lib/store';
import { toast } from 'sonner';
import { generatePdfFromElement, writeFileToSubfolder, getStoredDirHandle, clearStoredDirHandle } from '@/lib/pdfFolder';
import logoIsofloor from '@/assets/logo-isofloor.png';
import CommandeARPreview from '@/components/CommandeARPreview';

const SUBFOLDER = 'Commandes Clients';

// ── Helpers encodage MIME ────────────────────────────────────────────────────
const _utf8Encoder = new TextEncoder();

function toQuotedPrintable(str: string): string {
  return str.split('\n').map(line => {
    const bytes = _utf8Encoder.encode(line);
    let out = '';
    for (const b of bytes) {
      if (b > 127 || b === 61) out += '=' + b.toString(16).toUpperCase().padStart(2, '0');
      else out += String.fromCharCode(b);
    }
    return out;
  }).join('\r\n');
}

function encodeHeader(str: string): string {
  if (/^[\x00-\x7F]*$/.test(str)) return str;
  const bytes = _utf8Encoder.encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function generateEml(params: {
  from: string; to: string; subject: string; body: string;
  pdfBase64: string; pdfFileName: string;
}): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const htmlBody = params.body.split('\n')
    .map(l => l.trim() === '' ? '<br>' : `<p style="margin:0">${esc(l)}</p>`)
    .join('\n');
  const fullHtml = `<html><body>${htmlBody}</body></html>`;

  const lines: string[] = [
    'MIME-Version: 1.0', 'X-Unsent: 1',
    `From: ${params.from}`, `To: ${params.to}`,
    `Subject: ${encodeHeader(params.subject)}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable', '',
    toQuotedPrintable(fullHtml), '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${params.pdfFileName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${params.pdfFileName}"`, '',
    ...(params.pdfBase64.match(/.{1,76}/g) ?? []),
    '', `--${boundary}--`,
  ];
  return lines.join('\r\n');
}

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

async function openEmlInOutlook(params: {
  emlContent: string; fileName: string;
  pdfBase64: string; pdfFileName: string;
  to: string; subject: string; body: string;
}): Promise<void> {
  if (isMobile()) {
    const pdfBytes = Uint8Array.from(atob(params.pdfBase64), c => c.charCodeAt(0));
    const pdfFile = new File([pdfBytes], params.pdfFileName, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [pdfFile] })) {
      try { await navigator.share({ title: params.subject, text: params.body, files: [pdfFile] }); return; } catch { /* ignored */ }
    }
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a'); a.href = url; a.download = params.pdfFileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setTimeout(() => { window.location.href = `mailto:${encodeURIComponent(params.to)}?subject=${encodeURIComponent(params.subject)}&body=${encodeURIComponent(params.body)}`; }, 600);
    return;
  }
  const blob = new Blob([params.emlContent], { type: 'message/rfc822' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  commande: CommandeClient | null;
  client?: Client;
  dateDepart?: string;
  dateLivraison?: string;
  onSent?: () => void;
}

export default function CommandeARDialog({ open, onOpenChange, commande, client, dateDepart, dateLivraison, onSent }: Props) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [savedFolder, setSavedFolder] = useState<string | null>(null);
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const pdfBase64Ref = useRef<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    getStoredDirHandle().then(h => setSavedFolder(h?.name ?? null));
  }, []);

  useEffect(() => {
    if (!open || !commande) { setPdfReady(false); pdfBase64Ref.current = null; return; }

    const totaux = calculerTotalDevis(commande.lignes, commande.fraisPortHT, 20);
    setTo(client?.email || '');
    setSubject(`AR Commande ${commande.numero}${commande.referenceAffaire ? ` — ${commande.referenceAffaire}` : ''}${client?.societe ? ` — ${client.societe}` : ''}`);

    const dateDep = dateDepart ? formatDate(dateDepart) : '';
    const dateLiv = dateLivraison ? formatDate(dateLivraison) : '';
    setBody(
`Bonjour${client?.nom ? ` ${client.nom}` : ''},

Nous vous confirmons la bonne réception de votre commande ${commande.numero}${commande.referenceAffaire ? ` (Réf. ${commande.referenceAffaire})` : ''} d'un montant de ${formatMontant(totaux.totalHT)} HT.
${dateDep ? `\nDate de départ prévue : ${dateDep}` : ''}${dateLiv ? `\nDate de livraison prévue : ${dateLiv}` : ''}

Restant à votre disposition pour tout complément d'information.

Cordialement,
ISOSIGN`
    );

    setPdfReady(false);
    pdfBase64Ref.current = null;
    // Génération auto après que le DOM soit rendu
    setTimeout(() => generatePdf(), 700);
  }, [open, commande, client, dateDepart, dateLivraison]);

  // ── Génération PDF ────────────────────────────────────────────────────────
  async function generatePdf() {
    if (!previewRef.current || !commande) return;
    setGenerating(true);
    try {
      const logoDataUrl: string = await fetch(logoIsofloor)
        .then(r => r.blob())
        .then(blob => new Promise<string>(res => {
          const reader = new FileReader();
          reader.onloadend = () => res(reader.result as string);
          reader.readAsDataURL(blob);
        }));

      const base64 = await generatePdfFromElement(previewRef.current, {
        devisNumero: commande.numero,
        logoDataUrl,
        docTitle: 'ACCUSÉ DE RÉCEPTION',
      });
      pdfBase64Ref.current = base64;
      setPdfReady(true);
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la génération du PDF');
    } finally {
      setGenerating(false);
    }
  }

  // ── Aperçu PDF ────────────────────────────────────────────────────────────
  function handlePreview() {
    if (!pdfBase64Ref.current) return;
    const bytes = Uint8Array.from(atob(pdfBase64Ref.current), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ── Sauvegarde dossier ────────────────────────────────────────────────────
  async function handleSaveFolder(force = false) {
    if (!pdfBase64Ref.current || !commande) return;
    const bytes = Uint8Array.from(atob(pdfBase64Ref.current), c => c.charCodeAt(0));
    const ref = commande.referenceAffaire || commande.numero;
    const clientName = (client?.societe || client?.nom || 'client').replace(/[^a-zA-Z0-9À-ÿ\-_ ]/g, '').slice(0, 30).trim();
    const fileName = `AR_${commande.numero}_${clientName}.pdf`;

    const res = await writeFileToSubfolder(SUBFOLDER, fileName, bytes, force);
    if (res.ok) {
      setSavedFolder(res.folderName ?? null);
      toast.success(`PDF enregistré dans ${res.folderName ?? SUBFOLDER}`, { description: fileName });
    } else {
      toast.error('Enregistrement annulé');
    }
  }

  // ── Envoi Outlook ─────────────────────────────────────────────────────────
  async function handleSend() {
    if (!pdfBase64Ref.current || !commande) return;
    if (!to.trim()) { toast.error('Renseignez l\'adresse email'); return; }
    setSending(true);
    try {
      const ref = commande.referenceAffaire || commande.numero;
      const clientName = (client?.societe || client?.nom || 'client').replace(/[^a-zA-Z0-9À-ÿ\-_ ]/g, '').slice(0, 30).trim();
      const pdfFileName = `AR_${commande.numero}_${clientName}.pdf`;

      const emlContent = generateEml({
        from: 'isosign@isosign.fr',
        to,
        subject,
        body,
        pdfBase64: pdfBase64Ref.current,
        pdfFileName,
      });

      // Sauvegarder dans le dossier Commandes Clients en même temps
      const bytes = Uint8Array.from(atob(pdfBase64Ref.current), c => c.charCodeAt(0));
      await writeFileToSubfolder(SUBFOLDER, pdfFileName, bytes).then(res => {
        if (res.ok) setSavedFolder(res.folderName ?? null);
      });

      await openEmlInOutlook({ emlContent, fileName: `${pdfFileName}.eml`, pdfBase64: pdfBase64Ref.current, pdfFileName, to, subject, body });

      toast.success('Email ouvert dans Outlook', { description: `AR ${commande.numero}` });
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de l\'envoi');
    } finally {
      setSending(false);
    }
  }

  const pdfFileName = commande
    ? `AR_${commande.numero}_${(client?.societe || client?.nom || 'client').replace(/[^a-zA-Z0-9À-ÿ\-_ ]/g, '').slice(0, 30).trim()}.pdf`
    : 'AR.pdf';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Zone de rendu hors écran pour html2canvas */}
      {open && commande && createPortal(
        <div
          style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1, pointerEvents: 'none', opacity: 0 }}
          aria-hidden="true"
        >
          <div ref={previewRef}>
            <CommandeARPreview
              commande={commande}
              client={client}
              dateDepart={dateDepart}
              dateLivraison={dateLivraison}
            />
          </div>
        </div>,
        document.body
      )}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Accusé de réception — {commande?.numero}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Statut PDF */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-muted/30">
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" /><span className="text-sm text-muted-foreground">Génération du PDF…</span></>
              ) : pdfReady ? (
                <><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /><span className="text-sm font-medium">{pdfFileName}</span></>
              ) : (
                <><AlertCircle className="w-4 h-4 text-warning shrink-0" /><span className="text-sm text-muted-foreground">PDF non généré</span></>
              )}
              <div className="ml-auto flex gap-2">
                {pdfReady && (
                  <Button size="sm" variant="outline" onClick={handlePreview} className="gap-1.5 h-7 text-xs">
                    <Eye className="w-3.5 h-3.5" />Aperçu
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => generatePdf()} disabled={generating} className="gap-1.5 h-7 text-xs">
                  <FileText className="w-3.5 h-3.5" />{generating ? 'Génération…' : 'Regénérer'}
                </Button>
              </div>
            </div>

            {/* Aperçu visuel du document */}
            <div>
              <button
                onClick={() => setShowPreviewPanel(v => !v)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Eye className="w-3 h-3" />
                {showPreviewPanel ? 'Masquer l\'aperçu' : 'Afficher l\'aperçu du document'}
              </button>
              {showPreviewPanel && commande && (
                <div className="mt-2 border border-border rounded-lg overflow-auto max-h-[400px] bg-white">
                  <div style={{ transform: 'scale(0.7)', transformOrigin: 'top left', width: '142.8%' }}>
                    <CommandeARPreview
                      commande={commande}
                      client={client}
                      dateDepart={dateDepart}
                      dateLivraison={dateLivraison}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Email */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">À</Label>
                <Input value={to} onChange={e => setTo(e.target.value)} placeholder="email@client.fr" className="mt-1" type="email" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Objet</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Corps du message</Label>
                <Textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={8}
                  className="mt-1 text-sm font-mono resize-none"
                />
              </div>
            </div>

            {/* Sauvegarde dossier */}
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 space-y-2">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground flex-1 truncate">
                  {savedFolder
                    ? <><span className="font-medium text-foreground">{savedFolder}</span><span className="text-muted-foreground"> / {SUBFOLDER}</span></>
                    : <span className="italic">Aucun dossier sélectionné</span>}
                </span>
                {savedFolder && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" title="Effacer le dossier mémorisé" onClick={() => { clearStoredDirHandle(); setSavedFolder(null); }}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline"
                  className="flex-1 h-7 text-xs gap-1"
                  onClick={() => handleSaveFolder(true)}
                  disabled={!pdfReady}
                  title="Choisir un dossier différent"
                >
                  <FolderOpen className="w-3 h-3" />
                  {savedFolder ? 'Changer de dossier…' : 'Choisir un dossier…'}
                </Button>
                {savedFolder && (
                  <Button
                    size="sm" variant="default"
                    className="flex-1 h-7 text-xs gap-1"
                    onClick={() => handleSaveFolder(false)}
                    disabled={!pdfReady}
                    title="Enregistrer dans le dossier mémorisé"
                  >
                    <FolderOpen className="w-3 h-3" />
                    Enregistrer ici
                  </Button>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button
              onClick={handleSend}
              disabled={!pdfReady || sending || !to.trim()}
              className="gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Ouverture…' : 'Ouvrir dans Outlook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
