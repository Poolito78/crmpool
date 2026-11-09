import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Mic, Sparkles, Building2, Ruler, Layers, Package, Check, Trash2, Bot, AlertTriangle, Palette } from 'lucide-react';
import VoiceButton from '@/components/ui/VoiceButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Devis, Produit } from '@/lib/store';
import { produitParId } from '@/lib/indexProduits';
import { appelerClaude } from '@/lib/claudeIA';
import { clientAUneFautePres } from '@/lib/rapprochementClient';
import { getRalInfo, libelleTeinte } from '@/lib/ralColors';
import { teinteDemandee } from '@/lib/referenceTeinte';
import {
  chiffrerTeintes, enFrancais, lireDemandeTeintes, manqueDeZone, modelesPourDemande, noteDesZones,
  pigmentDuModele, ralDeCouleur, surfaceDeZone, surfacesDuChantier, teintesDeTexte, teintesDuChantier,
  type DemandeLue, type ReglagesZones, type ZoneLue,
} from '@/lib/demandeTeintes';

export interface VoiceLigne {
  produitId?: string;
  description: string;
  quantite: number;
  unite: string;
  prixUnitaireHT: number;
  remise?: number;
  note?: string;
}

/** Un pigment par teinte, chiffré d'après le devis modèle (`demandeTeintes.ts`). */
export interface VoiceTeinte {
  produitId: string;
  surfaceM2: number;
  consommation: number;
  quantite: number;
  variantesChoisies?: Record<string, string>;
}

export interface VoiceDevis {
  client?: string;
  chantier?: string;
  surface?: number | null;
  systeme?: string;
  lignes?: VoiceLigne[];
  /** Le devis modèle choisi à l'écran : il est dupliqué, ses pigments remplacés par `teintes`. */
  modeleId?: string;
  /** Les zones de la demande et leur calcul, une par ligne : la note en tête du devis. */
  noteZones?: string;
  teintes?: VoiceTeinte[];
  /** Ce qui n'a pas pu être chiffré — à dire à l'utilisateur. */
  aVerifier?: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produits?: Produit[];
  /** Clients existants — pour proposer la liste si le client dicté n'est pas reconnu */
  clients?: { id: string; nom: string; societe?: string }[];
  /** Devis modèles (statut « système ») existants — pour reconnaissance du système dicté */
  systemes?: { id: string; nom: string }[];
  /** Tous les devis : les modèles donnent la dose de pigment, les devis réalisés les règles par teinte. */
  devis?: Devis[];
  /** Appelé avec les infos extraites validées par l'utilisateur */
  onApply: (parsed: VoiceDevis) => void;
}

const EXTRACT_PROMPT = (transcript: string, systemes?: { id: string; nom: string }[]) => `Tu dois extraire les informations d'un devis à partir de ce texte, qui est soit une demande dictée vocalement, soit le texte d'un email/message d'un client, pour un commercial du bâtiment (revêtements de sol, résines, chapes...).

Réponds UNIQUEMENT avec un bloc JSON entre les balises ci-dessous, sans aucun autre texte avant ou après :

<<<DEVIS>>>
{"client":"nom du client ou de la société mentionné, sinon vide","chantier":"nom ou référence du chantier, sinon vide","surface":120,"systeme":"nom du système ou modèle de revêtement mentionné, sinon vide","lignes":[{"produitId":"ID EXACT du catalogue si un produit correspond, sinon vide","description":"produit ou prestation","quantite":10,"unite":"m²","prixUnitaireHT":0,"remise":0,"note":""}],"zones":[{"libelle":"13 allées piétonnes","ral":"5017","couleur":"bleu","surfaceM2":493.6,"lineaireMl":null,"nombre":null,"finition":"Anti glissant"}]}
<<<FIN_DEVIS>>>

RÈGLES :
- "surface" = surface du chantier en m² (nombre uniquement, sinon null).
- Utilise les IDs EXACTS du catalogue fourni quand un produit correspond au nom dicté ; sinon laisse produitId vide et mets la description.
- "unite" = "m²", "U", "kg", "L", "seau", "sac"... selon ce qui est dicté (par défaut "U").
- "prixUnitaireHT" = prix du catalogue si le produit est trouvé, sinon 0.
- Si une information est absente, mets une chaîne vide "" (ou null pour surface). Ne devine pas le client ; corrige seulement une faute de frappe évidente dans son nom.
- "lignes" peut être vide [] si aucun produit n'est mentionné.
- "zones" : SEULEMENT si la demande détaille des surfaces PAR COULEUR ou PAR TEINTE (RAL). Une entrée par zone, avec ce qui est ÉCRIT : "surfaceM2" si une surface est donnée, "lineaireMl" si c'est une longueur en mètres linéaires, "nombre" si c'est un nombre de pictos ou de logos. Ne calcule pas une surface à partir d'une longueur, ne devine jamais une largeur. Un zébra bicolore s'écrit "couleur":"jaune / noir (zébra)". Sinon "zones": []. Une surface déjà rangée dans "zones" ne fait PAS une ligne dans "lignes".
${systemes && systemes.length > 0 ? `
SYSTÈMES MODÈLES EXISTANTS (devis types réutilisables) :
${systemes.map(s => `- ${s.nom}`).join('\n')}
Si la demande fait référence à l'un de ces systèmes (même approximativement), renvoie son nom EXACT tel qu'écrit ci-dessus dans "systeme". Dans ce cas, ne génère PAS de lignes pour les produits de ce système (le modèle sera dupliqué) — ne mets dans "lignes" que les produits supplémentaires explicitement dictés en plus du système.` : ''}

Texte à analyser (dictée vocale ou email client) : "${transcript}"`;

interface ZoneIA { libelle?: string; ral?: string; couleur?: string; surfaceM2?: number | null; lineaireMl?: number | null; nombre?: number | null; finition?: string }

function parseVoiceDevis(text: string): (VoiceDevis & { zones?: ZoneIA[] }) | null {
  const m = text.match(/<<<DEVIS>>>([\s\S]*?)<<<FIN_DEVIS>>>/);
  const raw = m ? m[1].trim() : text.trim();
  // tente d'isoler un objet JSON même sans balises
  const jsonStr = m ? raw : (raw.match(/\{[\s\S]*\}/)?.[0] ?? '');
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === 'object' && parsed ? parsed as VoiceDevis : null;
  } catch {
    return null;
  }
}

/**
 * Les zones qu'une IA a rangées, pour une dictée que la lecture ligne à ligne
 * ne découpe pas. On ne garde que ce qui porte une teinte ET une mesure.
 */
function zonesDepuisIA(zones: ZoneIA[] | undefined): ZoneLue[] {
  const positif = (v: unknown) => (Number(v) > 0 ? Number(v) : undefined);
  return (Array.isArray(zones) ? zones : []).flatMap((z) => {
    const libelle = String(z?.libelle || '').trim();
    const ral = String(z?.ral || '').match(/\d{4}/)?.[0];
    const teintes = teintesDeTexte(`${ral ? `RAL ${ral}` : ''} ${z?.couleur || ''}`);
    const surfaceM2 = positif(z?.surfaceM2);
    const lineaireMl = surfaceM2 ? undefined : positif(z?.lineaireMl);
    const nombre = surfaceM2 || lineaireMl ? undefined : positif(z?.nombre);
    if (!teintes.length || !(surfaceM2 || lineaireMl || nombre)) return [];
    const finition = String(z?.finition || '').trim();
    return [{
      id: '', libelle: libelle || 'Zone', teintes,
      ...(finition ? { finition } : {}),
      ...(surfaceM2 ? { surfaceM2, calcul: `${enFrancais(surfaceM2)} m²` } : {}),
      ...(lineaireMl ? { lineaireMl } : {}),
      ...(nombre ? { nombre } : {}),
    }];
  }).map((z, i) => ({ ...z, id: String(i) }));
}

const AUCUN_MODELE = 'aucun';
type Moteur = 'ia' | 'claude';

export default function DevisVoiceAssistantDialog({ open, onOpenChange, produits = [], clients = [], systemes, devis = [], onApply }: Props) {
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState<Moteur | null>(null);
  const [parsed, setParsed] = useState<VoiceDevis | null>(null);
  /* Demande « par teinte » : zones lues, cotes saisies, modèle et RAL retenus. */
  const [demande, setDemande] = useState<DemandeLue | null>(null);
  const [texteAnalyse, setTexteAnalyse] = useState('');
  const [reglages, setReglages] = useState<ReglagesZones>({});
  const [modeleId, setModeleId] = useState(AUCUN_MODELE);
  const [ralChoisi, setRalChoisi] = useState<Record<string, string>>({});
  const [reponduPar, setReponduPar] = useState('');

  useEffect(() => {
    if (open) {
      setTranscript(''); setParsed(null); setLoading(null); setDemande(null);
      setReglages({}); setModeleId(AUCUN_MODELE); setRalChoisi({}); setReponduPar('');
    }
  }, [open]);

  const articleDe = useCallback((id: string | undefined) => produitParId(produits, id), [produits]);

  // Glossaire de termes « collés » (noms de systèmes, références produits, marques) pour
  // recoller les mots éclatés par la dictée vocale (« flow fast » → « flowfast »).
  const glueTerms = useMemo(() => {
    const set = new Set<string>();
    const addWords = (s: string) => {
      for (const w of s.split(/\s+/)) {
        const c = w.replace(/[^a-zA-ZÀ-ÿ]/g, '');
        if (c.length >= 6) set.add(c);
      }
    };
    (systemes || []).forEach(s => addWords(s.nom || ''));
    produits.forEach(p => addWords(`${p.reference || ''} ${p.description || ''}`));
    ['flowfast', 'flowcoat', 'flowfresh', 'flowcrete', 'flowshield', 'isocrete', 'peran'].forEach(w => set.add(w));
    return [...set].slice(0, 120);
  }, [systemes, produits]);

  const normalizeTerms = (text: string): string => {
    let out = text;
    for (const term of glueTerms) {
      // autorise des espaces entre chaque lettre ; ne recolle que si le texte était espacé
      const re = new RegExp(term.split('').join('\\s*'), 'gi');
      out = out.replace(re, m => (/\s/.test(m) ? term : m));
    }
    return out;
  };

  const produitsCatalog = (() => {
    if (produits.length === 0) return null;
    const lines: string[] = [];
    let chars = 0;
    const MAX = 6000;
    for (const p of produits) {
      const line = `${p.id}|${p.reference}|${p.categorie || ''}|${p.description.slice(0, 40)}|${p.prixHT}|${p.unite}`;
      if (chars + line.length > MAX) break;
      lines.push(line);
      chars += line.length + 1;
    }
    return `id|ref|cat|desc|prixHT|unite\n${lines.join('\n')}`;
  })();

  /* Les modèles qui portent un pigment : les candidats de la demande d'abord. */
  const modeles = useMemo(() => {
    if (!demande) return [];
    const candidats = modelesPourDemande(texteAnalyse, devis, articleDe);
    const vus = new Set(candidats.map(c => c.devis.id));
    const autres = devis
      .filter(d => d.statut === 'système' && !vus.has(d.id) && !!pigmentDuModele(d, articleDe))
      .map(d => ({ devis: d, nom: (d.systeme || d.referenceAffaire || d.numero || '').trim(), communs: 0 }));
    return [...candidats, ...autres];
  }, [demande, texteAnalyse, devis, articleDe]);

  /** Le client est-il dans la base, au nom près (l'un pouvant contenir l'autre) ? */
  const clientConnu = (nom: string) => {
    const q = nom.trim().toLowerCase();
    return !!q && clients.some(c => {
      const soc = (c.societe || '').toLowerCase(); const n = (c.nom || '').toLowerCase();
      return soc === q || n === q || (soc && (soc.includes(q) || q.includes(soc))) || (n && (n.includes(q) || q.includes(n)));
    });
  };
  /** Un nom tapé avec une faute (« empriente signa ») reprend celui de la fiche, si une seule répond. */
  const nomClient = (nom: string | undefined) => {
    const lu = (nom || '').trim();
    if (!lu || clientConnu(lu)) return lu;
    const proche = clientAUneFautePres(lu, clients);
    return proche ? (proche.societe || proche.nom) : lu;
  };

  /** Adopte des zones : retient le modèle le plus probable et le nomme comme système. */
  function adopterZones(lue: DemandeLue, texte: string) {
    const [premier] = modelesPourDemande(texte, devis, articleDe);
    setDemande(lue);
    setTexteAnalyse(texte);
    setReglages({});
    setRalChoisi({});
    setModeleId(premier?.devis.id ?? AUCUN_MODELE);
    return premier;
  }

  async function analyser(moteur: Moteur) {
    const text = normalizeTerms(transcript.trim());
    if (text !== transcript) setTranscript(text);
    if (!text || loading) return;
    setLoading(moteur);
    setParsed(null);
    setDemande(null);
    setReponduPar('');

    /* 1. SANS IA : un tableau de surfaces par teinte se lit ligne à ligne, et
          s'affiche tout de suite — l'IA ne fait ensuite que compléter. */
    const lue = lireDemandeTeintes(text);
    const zonesLues = lue.zones.length > 0;
    if (zonesLues) {
      const premier = adopterZones(lue, text);
      setParsed({ client: nomClient(lue.client), chantier: lue.chantier || '', systeme: premier?.nom ?? lue.systeme ?? '', surface: null, lignes: [] });
    }

    /* 2. L'IA — Gemini/Groq par « Analyser », Claude par son bouton — pour le
          client (fautes de frappe), le chantier, et une dictée sans tableau. */
    try {
      let raw = '';
      if (moteur === 'claude') {
        const r = await appelerClaude({
          system: `Tu es l'assistant de chiffrage de MonCRM (revêtements de sol, résines, signalisation).${produitsCatalog ? `\n\nCATALOGUE (extrait) :\n${produitsCatalog}` : ''}`,
          messages: [{ role: 'user', content: EXTRACT_PROMPT(text, systemes) }],
        });
        raw = r.texte;
        setReponduPar(`${r.modele}${r.dureeMs ? ` · ${(r.dureeMs / 1000).toFixed(1)} s` : ''}`);
      } else {
        const { data, error } = await supabase.functions.invoke('devis-assistant', {
          body: { message: EXTRACT_PROMPT(text, systemes), history: [], produitsCatalog },
        });
        if (error) throw error;
        raw = data?.response || '';
      }
      const result = parseVoiceDevis(raw);
      if (!result) {
        if (!zonesLues) toast.error("L'IA n'a pas pu structurer la demande. Reformulez ou complétez la dictée.");
        return;
      }
      const { zones: zonesIA, ...reste } = result;
      reste.client = nomClient(reste.client);
      if (zonesLues) {
        /* Les zones lues sans IA font foi : l'IA ne complète que le client et le
           chantier — et ne remplace pas un client déjà retrouvé dans la base. */
        setParsed(p => ({
          ...p,
          client: p?.client && clientConnu(p.client) ? p.client : (reste.client || p?.client || ''),
          chantier: reste.chantier || p?.chantier || '',
        }));
        return;
      }
      const zones = zonesDepuisIA(zonesIA);
      if (zones.length) {
        const premier = adopterZones({ zones }, text);
        setParsed({ ...reste, systeme: premier?.nom ?? reste.systeme, surface: null, lignes: [] });
      } else {
        setParsed(reste);
      }
    } catch (e) {
      console.error('[voice assistant]', e);
      const detail = moteur === 'claude' && e instanceof Error ? e.message.replace(/^\[claude\]\s*/, '') : '';
      if (zonesLues) toast.warning(`Zones lues sans IA${detail ? ` — Claude : ${detail}` : ' — client et chantier à vérifier.'}`);
      else toast.error(detail ? `Claude : ${detail}` : "Erreur lors de l'analyse vocale.");
    } finally {
      setLoading(null);
    }
  }

  /* ── Zones, teintes et pigments : un seul calcul pour l'écran et pour le devis ── */
  const modele = modeles.find(m => m.devis.id === modeleId)?.devis;
  const calcul = useMemo(() => {
    if (!demande) return null;
    const teintes = teintesDuChantier(demande.zones, reglages);
    const ralDefaut: Record<string, { ral: string; devis: number } | undefined> = {};
    for (const t of teintes) if (!t.ral && t.couleur) ralDefaut[t.cle] = ralDeCouleur(t.couleur, devis, articleDe);
    const ralRetenu: Record<string, string | undefined> = {};
    for (const t of teintes) {
      /* Un champ vidé à la main reste vide : on ne retombe pas sur le RAL proposé. */
      const saisi = ralChoisi[t.cle];
      ralRetenu[t.cle] = saisi !== undefined ? (/^\d{4}$/.test(saisi) ? saisi : undefined) : ralDefaut[t.cle]?.ral;
    }
    const lignes = chiffrerTeintes(teintes, modele, devis, articleDe, ralRetenu);
    const surfaces = surfacesDuChantier(demande.zones, reglages);
    const ecrites = Math.round(demande.zones.reduce((s, z) => s + (z.surfaceM2 ?? 0), 0) * 1000) / 1000;
    return { lignes, surfaces, ralDefaut, ecrites };
  }, [demande, reglages, ralChoisi, modele, devis, articleDe]);

  function appliquer() {
    if (!parsed) return;
    if (!demande || !calcul) { onApply(parsed); onOpenChange(false); return; }

    const aVerifier: string[] = [];
    const teintes = calcul.lignes.flatMap((l) => {
      const nom = l.ral ? (libelleTeinte(`RAL ${l.ral}`) ?? `RAL ${l.ral}`) : (l.couleur ?? 'teinte');
      if (!l.produitId || !l.conso || !l.quantite || !l.ral) {
        aVerifier.push(`${nom} : ${l.aVerifier.join(', ') || 'pigment non calculé'}`);
        return [];
      }
      if (l.aVerifier.length) aVerifier.push(`${nom} : ${l.aVerifier.join(', ')}`);
      const t = teinteDemandee(articleDe(l.produitId), l.ral);
      if (t && !t.auNuancier) aVerifier.push(`${nom} : teinte absente de la fiche du pigment`);
      return [{
        produitId: l.produitId, surfaceM2: l.surfaceM2, consommation: l.conso, quantite: l.quantite,
        ...(t ? { variantesChoisies: { [t.dimensionId]: t.valeur } } : {}),
      }];
    });
    onApply({
      ...parsed,
      systeme: modele ? (modele.systeme || parsed.systeme) : parsed.systeme,
      surface: calcul.surfaces.peinteM2 > 0 ? calcul.surfaces.peinteM2 : null,
      lignes: [],
      modeleId: modele?.id,
      noteZones: noteDesZones(demande.zones, reglages),
      teintes,
      aVerifier,
    });
    onOpenChange(false);
  }

  const lignes = parsed?.lignes ?? [];
  const manqueLargeur = !!demande?.zones.some(z => z.lineaireMl && !z.surfaceM2);
  const manqueUnite = !!demande?.zones.some(z => z.nombre && !z.surfaceM2);
  const nombreSaisi = (v: string) => (v === '' ? undefined : Number(v.replace(',', '.')) || undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] flex flex-col max-h-[88vh] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mic className="w-4 h-4 text-primary" /> Nouveau devis — dictée vocale ou email
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Zone dictée */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Dictez <span className="text-muted-foreground/70">ou collez un email client</span> : client, chantier, surface (m²), système et produits avec quantités — ou un tableau de surfaces par couleur.
              </p>
              <VoiceButton cible="le devis vocal" onTranscript={t => setTranscript(prev => (prev ? prev.trim() + ' ' : '') + normalizeTerms(t))} />
            </div>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder='Dictez ou collez un email. Ex : « Devis pour la société Dubois, chantier parking Nord, 250 m², système Flowfast 319, ajoute 250 m² de résine et 12 seaux de primaire. »'
              className="w-full min-h-[110px] text-sm rounded-md border border-input bg-background px-3 py-2 resize-y"
            />
            <div className="flex gap-2">
              <Button onClick={() => analyser('ia')} disabled={!!loading || !transcript.trim()} className="flex-1 gap-2">
                {loading === 'ia' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading === 'ia' ? 'Analyse en cours…' : 'Analyser'}
              </Button>
              <Button variant="outline" onClick={() => analyser('claude')} disabled={!!loading || !transcript.trim()} className="gap-2"
                title="Confier cette lecture à Claude (à la demande, facturé à votre clé d'API Anthropic)">
                {loading === 'claude' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                {loading === 'claude' ? 'Claude lit…' : 'Claude'}
              </Button>
            </div>
            {reponduPar && <p className="text-[11px] text-muted-foreground">Lu par {reponduPar}</p>}
          </div>

          {/* Résultat extrait */}
          {parsed && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Informations détectées</p>

              <div className="grid grid-cols-1 gap-2">
                <FieldRow icon={<Building2 className="w-4 h-4" />} label="Client">
                  <Input className="h-8 text-sm" list="voice-clients" value={parsed.client || ''} placeholder="Choisir ou taper un client…"
                    onChange={e => setParsed(p => p ? { ...p, client: e.target.value } : p)} />
                  <datalist id="voice-clients">
                    {clients.map(c => <option key={c.id} value={c.societe || c.nom} />)}
                  </datalist>
                  {(() => {
                    if (!(parsed.client || '').trim()) return null;
                    return clientConnu(parsed.client || '')
                      ? <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">✓ Client trouvé dans la base</p>
                      : <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Client non trouvé — choisissez dans la liste ou tapez le nom exact</p>;
                  })()}
                </FieldRow>
                <FieldRow icon={<Package className="w-4 h-4" />} label="Chantier">
                  <Input className="h-8 text-sm" value={parsed.chantier || ''} placeholder="(non détecté)"
                    onChange={e => setParsed(p => p ? { ...p, chantier: e.target.value } : p)} />
                </FieldRow>
                {!demande && (
                  <div className="grid grid-cols-2 gap-2">
                    <FieldRow icon={<Ruler className="w-4 h-4" />} label="Surface m²">
                      <Input className="h-8 text-sm" type="number" value={parsed.surface ?? ''} placeholder="—"
                        onChange={e => setParsed(p => p ? { ...p, surface: e.target.value === '' ? null : Number(e.target.value) } : p)} />
                    </FieldRow>
                    <FieldRow icon={<Layers className="w-4 h-4" />} label="Système">
                      <Input className="h-8 text-sm" value={parsed.systeme || ''} placeholder="(non détecté)"
                        onChange={e => setParsed(p => p ? { ...p, systeme: e.target.value } : p)} />
                    </FieldRow>
                  </div>
                )}
              </div>

              {/* ── Demande par teinte : modèle, zones en m², pigments ── */}
              {demande && calcul && (
                <div className="space-y-3">
                  <FieldRow icon={<Layers className="w-4 h-4" />} label="Devis modèle (résine, dose de pigment)">
                    <Select value={modeleId} onValueChange={setModeleId}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir un modèle…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AUCUN_MODELE}>Aucun — zones en note, pigments non calculés</SelectItem>
                        {modeles.map(m => (
                          <SelectItem key={m.devis.id} value={m.devis.id}>{m.nom}{m.communs ? '' : ' (autre gamme)'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {modeles.filter(m => m.communs).length > 1 && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                        {modeles.filter(m => m.communs).length} modèles répondent à la demande — vérifiez celui retenu.
                      </p>
                    )}
                  </FieldRow>

                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground">Zones ({demande.zones.length})</p>
                      <p className="text-[11px] text-muted-foreground">
                        au sol {enFrancais(calcul.surfaces.solM2)} m² · peint {enFrancais(calcul.surfaces.peinteM2)} m²
                        {demande.totalAnnonceM2 != null && (
                          Math.abs(calcul.ecrites - demande.totalAnnonceM2) <= 0.05
                            ? <span className="text-emerald-600 dark:text-emerald-400"> · total annoncé {enFrancais(demande.totalAnnonceM2)} m² ✓</span>
                            : <span className="text-amber-600 dark:text-amber-400"> · les surfaces écrites font {enFrancais(calcul.ecrites)} m², le total annonce {enFrancais(demande.totalAnnonceM2)} m²</span>
                        )}
                      </p>
                    </div>

                    {(manqueLargeur || manqueUnite) && (
                      <div className="flex flex-wrap items-end gap-3 rounded-md border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 px-2 py-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mb-1.5" />
                        {manqueLargeur && (
                          <label className="text-[11px] text-muted-foreground">
                            Largeur des tracés au mètre linéaire (m)
                            <Input className="h-7 w-24 text-sm mt-0.5" inputMode="decimal" placeholder="ex. 0,10"
                              onChange={e => setReglages(r => ({ ...r, largeurM: nombreSaisi(e.target.value) }))} />
                          </label>
                        )}
                        {manqueUnite && (
                          <label className="text-[11px] text-muted-foreground">
                            Surface peinte d'un picto (m²)
                            <Input className="h-7 w-24 text-sm mt-0.5" inputMode="decimal" placeholder="ex. 0,129"
                              onChange={e => setReglages(r => ({ ...r, surfaceUniteM2: nombreSaisi(e.target.value) }))} />
                          </label>
                        )}
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 basis-full">
                          Sans cette cote, ces zones restent hors du calcul — elle n'est jamais supposée.
                        </p>
                      </div>
                    )}

                    {demande.zones.map((z) => {
                      const s = surfaceDeZone(z, reglages);
                      return (
                        <div key={z.id} className="flex items-center gap-2 bg-muted/30 rounded-md px-2 py-1.5 text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-medium" title={z.libelle}>{z.libelle}</p>
                            <p className={`text-[11px] truncate ${s ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}>
                              {z.teintes.length === 0 ? 'teinte à préciser · ' : ''}
                              {s ? s.calcul : manqueDeZone(z, reglages)}
                              {z.teintes.length > 1 && ` · ${z.teintes.map(t => `${t.couleur ?? `RAL ${t.ral}`} ${enFrancais(t.part * 100)} %`).join(', ')}`}
                            </p>
                            {z.ecart && <p className="text-[11px] text-amber-600 dark:text-amber-400 truncate" title={z.ecart}>⚠ {z.ecart}</p>}
                          </div>
                          <Input className="h-7 w-20 text-sm text-right" inputMode="decimal" placeholder="—"
                            defaultValue={z.surfaceM2 != null ? enFrancais(z.surfaceM2) : ''}
                            title="Surface de la zone en m² (corrigeable)"
                            onChange={e => setReglages(r => ({ ...r, surfaces: { ...r.surfaces, [z.id]: nombreSaisi(e.target.value) } }))} />
                          <span className="text-xs text-muted-foreground w-6 shrink-0">m²</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Palette className="w-3.5 h-3.5" /> Pigments par teinte ({calcul.lignes.length})
                      {modele && <span className="font-normal">— d'après {modele.numero}</span>}
                    </p>
                    {calcul.lignes.map((l) => {
                      const info = l.ral ? getRalInfo(`RAL ${l.ral}`) : undefined;
                      const pot = articleDe(l.produitId);
                      const defaut = calcul.ralDefaut[l.cle];
                      return (
                        <div key={l.cle} className="flex items-center gap-2 bg-muted/30 rounded-md px-2 py-1.5 text-sm">
                          <span className="w-4 h-4 rounded-full border border-border shrink-0" style={{ background: info?.hex ?? 'transparent' }} />
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-medium">
                              {l.ral ? (libelleTeinte(`RAL ${l.ral}`) ?? `RAL ${l.ral}`) : (l.couleur ?? 'Teinte')}
                              <span className="font-normal text-muted-foreground"> · {enFrancais(l.surfaceM2)} m²</span>
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {l.quantite && pot
                                ? `${l.quantite} × ${pot.reference} · ${enFrancais(l.conso ?? 0)} kg/m² · ${l.source}`
                                : pot && l.conso ? `${pot.reference} · ${enFrancais(l.conso)} kg/m²` : 'pigment non calculé'}
                              {!l.cle.startsWith('ral:') && defaut && ralChoisi[l.cle] === undefined && ` · RAL ${defaut.ral} employé sur ${defaut.devis} devis`}
                            </p>
                            {l.aVerifier.length > 0 && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-400 truncate" title={l.aVerifier.join(' · ')}>⚠ {l.aVerifier.join(' · ')}</p>
                            )}
                          </div>
                          {!l.cle.startsWith('ral:') && (
                            <Input className="h-7 w-20 text-sm" inputMode="numeric" maxLength={4} placeholder="RAL"
                              title={`RAL de la teinte « ${l.couleur} »`}
                              value={ralChoisi[l.cle] ?? defaut?.ral ?? ''}
                              onChange={e => setRalChoisi(r => ({ ...r, [l.cle]: e.target.value.replace(/\D/g, '') }))} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Lignes */}
              {!demande && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Lignes produits ({lignes.length})</p>
                  {lignes.length === 0 && <p className="text-xs text-muted-foreground italic">Aucune ligne détectée.</p>}
                  {lignes.map((l, i) => {
                    const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                    return (
                      <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-md px-2 py-1.5 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{l.description || prod?.description || '—'}</p>
                          {prod && <p className="text-[11px] text-muted-foreground truncate">{prod.reference}</p>}
                        </div>
                        <Input className="h-7 w-16 text-sm text-right" type="number" value={l.quantite}
                          onChange={e => setParsed(p => p ? { ...p, lignes: p.lignes!.map((x, j) => j === i ? { ...x, quantite: Number(e.target.value) } : x) } : p)} />
                        <span className="text-xs text-muted-foreground w-10 shrink-0">{l.unite || 'U'}</span>
                        <button type="button" className="text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => setParsed(p => p ? { ...p, lignes: p.lignes!.filter((_, j) => j !== i) } : p)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border shrink-0 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button size="sm" onClick={appliquer} disabled={!parsed} className="gap-1.5">
            <Check className="w-4 h-4" /> Remplir le devis
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
        <span className="text-muted-foreground/70">{icon}</span> {label}
      </label>
      {children}
    </div>
  );
}
