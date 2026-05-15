import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Send, Loader2, FileText, FolderOpen, X, CheckCircle2, AlertCircle, Paperclip, File, FileImage, FileSpreadsheet, ExternalLink, Eye } from 'lucide-react';
import { type Devis, type Client, type Produit, calculerTotalDevis, formatMontant, formatDate } from '@/lib/store';
import { toast } from 'sonner';
import { generatePdfFromElement, writeFileToFolder, getStoredDirHandle, clearStoredDirHandle } from '@/lib/pdfFolder';
import { supabase } from '@/integrations/supabase/client';
import logoIsofloor from '@/assets/logo-isofloor.png';

interface PjFichier {
  id: string;
  fichierNom: string;
  fichierUrl: string;
  fichierMime?: string;
  fichierTaille?: number;
}

function formatTaille(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1048576).toFixed(1)} Mo`;
}

function IconPj({ mime }: { mime?: string }) {
  if (!mime) return <File className="w-4 h-4 text-muted-foreground" />;
  if (mime.startsWith('image/')) return <FileImage className="w-4 h-4 text-blue-500" />;
  if (mime.includes('pdf')) return <FileText className="w-4 h-4 text-red-500" />;
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
  return <File className="w-4 h-4 text-muted-foreground" />;
}

async function fetchFileAsBase64(signedUrl: string): Promise<string> {
  const res = await fetch(signedUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const _utf8Encoder = new TextEncoder();

// Encode les octets UTF-8 (pas les code points Unicode) — requis par la norme MIME
function toQuotedPrintable(str: string): string {
  return str.split('\n').map(line => {
    const bytes = _utf8Encoder.encode(line);
    let out = '';
    for (const b of bytes) {
      if (b > 127 || b === 61 /* = */) {
        out += '=' + b.toString(16).toUpperCase().padStart(2, '0');
      } else {
        out += String.fromCharCode(b);
      }
    }
    return out;
  }).join('\r\n');
}

// Encode un header MIME (Subject, From display name…) en UTF-8 base64 RFC 2047
function encodeHeader(str: string): string {
  if (/^[\x00-\x7F]*$/.test(str)) return str;
  const bytes = _utf8Encoder.encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function generateEml(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  pdfBase64: string;
  pdfFileName: string;
  extraAttachments?: Array<{ filename: string; content: string; mime?: string }>;
  ficheLinks?: Array<{ label: string; url: string }>;
}): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines: string[] = [];

  lines.push('MIME-Version: 1.0');
  lines.push('X-Unsent: 1');
  lines.push(`From: ${params.from}`);
  lines.push(`To: ${params.to}`);
  lines.push(`Subject: ${encodeHeader(params.subject)}`);
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push('');

  // Corps HTML — Outlook insère sa signature APRÈS le HTML (pas avant)
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const htmlBody = params.body
    .split('\n')
    .map(l => l.trim() === '' ? '<br>' : `<p style="margin:0 0 0 0">${esc(l)}</p>`)
    .join('\n');

  // Section fiches produit avec vrais liens cliquables
  const ficheHtml = params.ficheLinks && params.ficheLinks.length > 0
    ? `<br><p style="margin:0 0 4px 0"><strong>Fiches produit :</strong></p>` +
      params.ficheLinks.map(f =>
        `<p style="margin:0 0 2px 0">&#8226; <a href="${esc(f.url)}" style="color:#0563C1">${esc(f.label)}</a></p>`
      ).join('')
    : '';

  const fullHtml = `<html><body>${htmlBody}${ficheHtml}</body></html>`;
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset="utf-8"');
  lines.push('Content-Transfer-Encoding: quoted-printable');
  lines.push('');
  lines.push(toQuotedPrintable(fullHtml));
  lines.push('');

  // PDF devis
  lines.push(`--${boundary}`);
  lines.push(`Content-Type: application/pdf; name="${params.pdfFileName}"`);
  lines.push('Content-Transfer-Encoding: base64');
  lines.push(`Content-Disposition: attachment; filename="${params.pdfFileName}"`);
  lines.push('');
  // Découper le base64 en lignes de 76 caractères (norme MIME)
  const pdfChunks = params.pdfBase64.match(/.{1,76}/g) ?? [];
  lines.push(...pdfChunks);
  lines.push('');

  // PJs supplémentaires
  for (const att of params.extraAttachments ?? []) {
    const mime = att.mime ?? 'application/octet-stream';
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${mime}; name="${att.filename}"`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
    lines.push('');
    const chunks = att.content.match(/.{1,76}/g) ?? [];
    lines.push(...chunks);
    lines.push('');
  }

  lines.push(`--${boundary}--`);
  return lines.join('\r\n');
}

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

async function openEmlInOutlook(params: {
  emlContent: string;
  fileName: string;
  pdfBase64: string;
  pdfFileName: string;
  to: string;
  subject: string;
  body: string;
  extraAttachments?: Array<{ filename: string; content: string; mime?: string }>;
  ficheLinks?: Array<{ label: string; url: string }>;
}): Promise<'eml' | 'share' | 'mailto'> {
  if (isMobile()) {
    // Sur mobile : corps texte enrichi avec les liens fiches (texte brut "label : url")
    const ficheText = params.ficheLinks && params.ficheLinks.length > 0
      ? `\n\nFiches produit :\n${params.ficheLinks.map(f => `• ${f.label} : ${f.url}`).join('\n')}`
      : '';
    const mobileBody = params.body + ficheText;

    // Essayer Web Share API avec tous les fichiers (PDF + PJs) en pièces jointes
    try {
      const pdfBytes = Uint8Array.from(atob(params.pdfBase64), c => c.charCodeAt(0));
      const pdfFile = new File([pdfBytes], params.pdfFileName, { type: 'application/pdf' });

      const extraFiles: File[] = (params.extraAttachments ?? []).map(att => {
        const bytes = Uint8Array.from(atob(att.content), c => c.charCodeAt(0));
        return new File([bytes], att.filename, { type: att.mime ?? 'application/octet-stream' });
      });

      const allFiles = [pdfFile, ...extraFiles];
      if (navigator.canShare?.({ files: allFiles })) {
        await navigator.share({
          title: params.subject,
          text: mobileBody,
          files: allFiles,
        });
        return 'share';
      }
    } catch { /* annulé par l'utilisateur ou non supporté */ }

    // Fallback : télécharger chaque fichier + ouvrir mailto
    const pdfBytes = Uint8Array.from(atob(params.pdfBase64), c => c.charCodeAt(0));
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = params.pdfFileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000);

    let delay = 400;
    for (const att of params.extraAttachments ?? []) {
      setTimeout(() => {
        const bytes = Uint8Array.from(atob(att.content), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: att.mime ?? 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = att.filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }, delay);
      delay += 400;
    }

    const mailto = `mailto:${encodeURIComponent(params.to)}?subject=${encodeURIComponent(params.subject)}&body=${encodeURIComponent(mobileBody)}`;
    setTimeout(() => { window.location.href = mailto; }, delay);
    return 'mailto';
  }
  // Desktop : blob .eml
  const blob = new Blob([params.emlContent], { type: 'message/rfc822' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'eml';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devis: Devis | null;
  client?: Client;
  produits?: Produit[];
  onSent: (dateEnvoi: string) => void;
  pdfContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export default function DevisEmailDialog({ open, onOpenChange, devis, client, produits = [], onSent, pdfContainerRef }: Props) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [ficheLinks, setFicheLinks] = useState<Array<{ label: string; url: string }>>([]);
  const [dateEnvoi, setDateEnvoi] = useState(new Date().toISOString().split('T')[0]);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [savedFolder, setSavedFolder] = useState<string | null>(null);
  const [pjFichiers, setPjFichiers] = useState<PjFichier[]>([]);
  const [selectedPjIds, setSelectedPjIds] = useState<Set<string>>(new Set());
  const pdfBase64Ref = useRef<string | null>(null);

  useEffect(() => {
    getStoredDirHandle().then(h => setSavedFolder(h?.name ?? null));
  }, []);

  // Charger les pièces jointes du chatter pour ce devis
  useEffect(() => {
    if (!devis || !open) { setPjFichiers([]); setSelectedPjIds(new Set()); return; }
    supabase
      .from('devis_pieces_jointes')
      .select('id, fichier_nom, fichier_url, fichier_mime, fichier_taille')
      .eq('devis_id', devis.id)
      .eq('type', 'fichier')
      .eq('confidentiel', false)
      .order('date', { ascending: true })
      .then(({ data }) => {
        const fichiers: PjFichier[] = (data ?? []).map(r => ({
          id: r.id,
          fichierNom: r.fichier_nom ?? 'Fichier',
          fichierUrl: r.fichier_url ?? '',
          fichierMime: r.fichier_mime ?? undefined,
          fichierTaille: r.fichier_taille ?? undefined,
        }));
        setPjFichiers(fichiers);
        // Tout sélectionner par défaut
        setSelectedPjIds(new Set(fichiers.map(f => f.id)));
      });
  }, [devis, open]);

  useEffect(() => {
    if (!devis || !open) {
      setPdfReady(false);
      pdfBase64Ref.current = null;
      return;
    }
    // Toujours mettre à jour la date d'envoi à aujourd'hui à chaque ouverture (renvoi inclus)
    setDateEnvoi(new Date().toISOString().split('T')[0]);
    const totals = calculerTotalDevis(devis.lignes, devis.fraisPortHT || 0, devis.fraisPortTVA ?? 20);
    setTo(client?.email || '');
    setSubject(`Devis ${devis.numero}${devis.referenceAffaire ? ` — ${devis.referenceAffaire}` : ''}${client?.societe ? ` — ${client.societe}` : ''}`);

    // Fiches produit : uniquement en HTML dans le .eml (pas dans le textarea → évite les doublons)
    const fichesLignes = devis.lignes
      .map(l => produits.find(p => p.id === l.produitId))
      .filter((p): p is NonNullable<typeof p> => !!p?.ficheUrl)
      .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);

    setFicheLinks(fichesLignes.map(p => ({
      label: p.ficheLinkLabel?.trim() || `${p.reference} — ${p.description}`,
      url: p.ficheUrl!,
    })));

    // Corps textarea : texte pur, sans section fiches (les liens sont injectés en HTML dans le .eml)
    setBody(
`Bonjour${client?.nom ? ` ${client.nom}` : ''},

Suite à notre échange, tu trouveras ci-joint notre devis ${devis.numero}${devis.referenceAffaire ? ` (Réf. ${devis.referenceAffaire})` : ''} d'un montant de ${formatMontant(totals.totalHT)} HT.
Ce devis est valable jusqu'au ${formatDate(devis.dateValidite)}.

Restant à ta disposition pour tout complément d'information.`
    );

    if (pdfContainerRef?.current) {
      setPdfReady(false);
      pdfBase64Ref.current = null;
      setTimeout(() => generatePdf(), 600);
    }
  }, [devis, client, open, produits]);

  async function generatePdf() {
    if (!pdfContainerRef?.current || !devis) return;
    setGenerating(true);
    try {
      // Même options que le bouton PDF : logo + numéro + date en entête pages 2+
      const logoDataUrl: string | null = await fetch(logoIsofloor)
        .then(r => r.blob())
        .then(blob => new Promise<string>(res => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(blob);
        }))
        .catch(() => null);
      const refDate = devis.dateEnvoi || devis.dateCreation;
      pdfBase64Ref.current = await generatePdfFromElement(pdfContainerRef.current, {
        devisNumero: devis.numero,
        devisDate: refDate ? formatDate(refDate) : undefined,
        logoDataUrl: logoDataUrl ?? undefined,
      });
      setPdfReady(true);
    } catch (err) {
      console.error('Erreur génération PDF:', err);
    } finally {
      setGenerating(false);
    }
  }

  async function handlePickFolder() {
    const res = await writeFileToFolder('_init', new Uint8Array(0), true);
    if (res.ok) setSavedFolder(res.folderName ?? null);
  }

  async function handleSend() {
    if (!to || !devis || !pdfBase64Ref.current) return;
    setSending(true);

    const accentMap: Record<string, string> = {
      'é':'e','è':'e','ê':'e','ë':'e','à':'a','â':'a','ä':'a',
      'ù':'u','û':'u','ü':'u','ô':'o','ö':'o','î':'i','ï':'i','ç':'c',
      'É':'E','È':'E','Ê':'E','À':'A','Â':'A','Ù':'U','Û':'U','Ô':'O','Î':'I','Ç':'C',
    };
    const sanitize = (s: string) =>
      s.split('').map(c => accentMap[c] ?? c).join('')
        .replace(/[^a-zA-Z0-9-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const societe = client?.societe || client?.nom || '';
    const fileNameParts: string[] = ['Devis', devis.numero];
    if (societe) fileNameParts.push(sanitize(societe));
    if (devis.referenceAffaire) fileNameParts.push(sanitize(devis.referenceAffaire));
    const pdfFileName = fileNameParts.join('_') + '.pdf';
    const pdfBytes = Uint8Array.from(atob(pdfBase64Ref.current), c => c.charCodeAt(0));

    // 1. Sauvegarder PDF dans le dossier Préco
    const folderRes = await writeFileToFolder(pdfFileName, pdfBytes);
    if (folderRes.ok) setSavedFolder(folderRes.folderName ?? null);

    // 1b. Sauvegarder les références produits pour la macro VBA Outlook
    if (folderRes.ok && devis && produits.length > 0) {
      const refs = devis.lignes
        .map(l => produits.find(p => p.id === l.produitId))
        .filter(Boolean)
        .map(p => p!.description || p!.reference || '')
        .filter(Boolean);
      if (refs.length > 0) {
        const refsContent = refs.join('\n');
        const refsBytes = new TextEncoder().encode(refsContent);
        const refsFileName = `Devis_${devis.numero}_refs.txt`;
        await writeFileToFolder(refsFileName, refsBytes);
      }
    }

    // 2. Préparer les PJs sélectionnées (URL signée fraîche + base64)
    const extraAttachments: Array<{ filename: string; content: string }> = [];
    const pjsToSend = pjFichiers.filter(f => selectedPjIds.has(f.id));
    for (const pj of pjsToSend) {
      try {
        const pathMatch = pj.fichierUrl.match(/\/devis-pj\/([^?]+)/);
        if (!pathMatch) continue;
        const { data: signed } = await supabase.storage
          .from('devis-pj')
          .createSignedUrl(decodeURIComponent(pathMatch[1]), 120);
        if (!signed?.signedUrl) continue;
        const b64 = await fetchFileAsBase64(signed.signedUrl);
        extraAttachments.push({ filename: pj.fichierNom, content: b64 });
      } catch { /* ignorer si échec sur un fichier */ }
    }

    // 3. Générer le .eml avec PDF + PJs et l'ouvrir dans Outlook
    try {
      const emlContent = generateEml({
        from: 'f.mouhot@isosign.fr',
        to,
        subject,
        body,
        pdfBase64: pdfBase64Ref.current!,
        pdfFileName,
        extraAttachments,
        ficheLinks,
      });
      const result = await openEmlInOutlook({
        emlContent,
        fileName: `${pdfFileName.replace('.pdf', '')}.eml`,
        pdfBase64: pdfBase64Ref.current!,
        pdfFileName,
        to, subject, body,
        extraAttachments,
        ficheLinks,
      });
      const totalFichiers = 1 + extraAttachments.length;
      const desc = result === 'mailto'
        ? `${totalFichiers > 1 ? `${totalFichiers} fichiers téléchargés` : 'PDF téléchargé'} — joignez-les manuellement dans Outlook`
        : result === 'share' ? `Partagé via la feuille de partage${extraAttachments.length > 0 ? ` (${totalFichiers} fichiers)` : ''}` : '';
      toast.success('Outlook ouvert avec le devis', {
        description: desc || (folderRes.ok ? `PDF aussi sauvegardé dans "${folderRes.folderName}"` : ''),
        duration: 6000,
      });
      onSent(dateEnvoi);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erreur génération .eml (${msg})`, { duration: 8000 });
    } finally {
      setSending(false);
    }
  }

  if (!devis) return null;

  const canSend = !!(to && pdfReady && !generating && !sending);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Envoyer le devis {devis.numero}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Destinataire</Label>
            <Input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="email@client.com" />
          </div>
          <div>
            <Label>Objet</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <Label className="flex items-center gap-2">
              Date d'envoi
              <span className="text-xs font-normal text-muted-foreground">(modifiable — sera enregistrée sur le devis)</span>
            </Label>
            <Input type="date" value={dateEnvoi} onChange={e => setDateEnvoi(e.target.value)} className="w-48" />
          </div>
          <div>
            <Label>Corps du message</Label>
            <textarea
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[260px] font-mono"
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>

          {/* ── Fiches produit (liens hypertexte dans le HTML du mail) ── */}
          {ficheLinks.length > 0 && (
            <div className="rounded-md border px-3 py-2 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ExternalLink className="w-4 h-4 text-primary" />
                Fiches produit ajoutées au mail
                <span className="text-xs font-normal text-muted-foreground">(liens cliquables dans Outlook)</span>
              </div>
              {ficheLinks.map((f, i) => (
                <div key={i} className="flex items-center gap-2 pl-6 text-sm">
                  <span className="text-primary underline truncate">{f.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Pièces jointes du chatter ── */}
          {pjFichiers.length > 0 && (
            <div className="rounded-md border px-3 py-2 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Paperclip className="w-4 h-4 text-muted-foreground" />
                Pièces jointes à inclure
                <span className="text-xs font-normal text-muted-foreground">({selectedPjIds.size}/{pjFichiers.length} sélectionnée{selectedPjIds.size > 1 ? 's' : ''})</span>
              </div>
              <div className="space-y-1">
                {pjFichiers.map(pj => (
                  <label key={pj.id} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedPjIds.has(pj.id)}
                      onChange={e => {
                        setSelectedPjIds(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(pj.id); else next.delete(pj.id);
                          return next;
                        });
                      }}
                    />
                    <IconPj mime={pj.fichierMime} />
                    <span className="text-sm flex-1 truncate">{pj.fichierNom}</span>
                    {pj.fichierTaille != null && (
                      <span className="text-xs text-muted-foreground shrink-0">{formatTaille(pj.fichierTaille)}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Statut PDF + dossier */}
          <div className="rounded-md border px-3 py-2 space-y-2 text-sm">
            {/* PDF */}
            <div className="flex items-center gap-2">
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" /><span className="text-muted-foreground">Génération du PDF…</span></>
              ) : pdfReady ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-emerald-700 font-medium">PDF prêt</span>
                  <span className="text-muted-foreground ml-1">— sera joint automatiquement</span>
                  <button
                    className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                    onClick={() => {
                      if (!pdfBase64Ref.current) return;
                      const bytes = Uint8Array.from(atob(pdfBase64Ref.current), c => c.charCodeAt(0));
                      const blob = new Blob([bytes], { type: 'application/pdf' });
                      const url = URL.createObjectURL(blob);
                      window.open(url, '_blank');
                      setTimeout(() => URL.revokeObjectURL(url), 60000);
                    }}
                  >
                    <Eye className="w-3.5 h-3.5" /> Aperçu
                  </button>
                </>
              ) : (
                <><AlertCircle className="w-4 h-4 text-amber-500 shrink-0" /><span className="text-amber-600">PDF non disponible</span></>
              )}
            </div>

            {/* Dossier Préco */}
            <div className="flex items-center gap-2 border-t pt-2">
              <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
              {savedFolder ? (
                <>
                  <span className="text-muted-foreground">Copie dans :</span>
                  <span className="font-medium truncate">{savedFolder}</span>
                  <button onClick={handlePickFolder} className="ml-auto text-xs text-muted-foreground hover:text-foreground underline shrink-0">Changer</button>
                  <button onClick={async () => { await clearStoredDirHandle(); setSavedFolder(null); }} className="text-muted-foreground hover:text-destructive shrink-0"><X className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground text-xs">Aucun dossier de copie configuré</span>
                  <button onClick={handlePickFolder} className="ml-auto text-xs text-primary hover:underline shrink-0">Choisir Préco…</button>
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground border-t pt-2">
              <FileText className="w-3 h-3 inline mr-1" />
              Un fichier .eml sera téléchargé avec le PDF joint — ouvrez-le dans Outlook pour envoyer.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Annuler</Button>
          <Button onClick={handleSend} disabled={!canSend}>
            {sending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Préparation…</>
              : <><Send className="w-4 h-4 mr-2" /> Ouvrir dans Outlook</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
