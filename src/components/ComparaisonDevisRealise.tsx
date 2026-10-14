/**
 * Encart de l'analyse de document : le devis RÉALISÉ (importé, type
 * `devis_client`) confronté au devis du CRM qu'il reprend.
 *
 * Ce que le commercial a corrigé avant d'envoyer — un article, une quantité,
 * une ligne oubliée — s'affiche ligne à ligne. « Apprendre de ce devis »
 * retient les corrections d'article dans la mémoire de l'analyseur
 * (`memoireArticles.ts`) et garde le relevé (`ecarts_devis`) ; « Copier le
 * rapport » donne le texte à transmettre pour corriger les règles du CRM,
 * ce que la mémoire ne sait pas apprendre seule. Voir `comparaisonDevis.ts`.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { GitCompare, Copy, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCRM } from '@/lib/StoreContext';
import { supabase } from '@/integrations/supabase/client';
import { formatMontant } from '@/lib/store';
import type { DocumentAnalysis } from '@/lib/analyseDocument';
import { produitParReference } from '@/lib/indexProduits';
import { retenirArticle } from '@/lib/memoireArticles';
import { retenirPrix } from '@/lib/memoirePrix';
import {
  comparerDevis, comparerParReference, prixAApprendre, substitutionsApprises, tauxPalDeLOffre, correctionsApprises, devisCandidats, rapportEcarts,
  rapportParReference, resumerEcarts, type EcartDevis, type EcartReference,
} from '@/lib/comparaisonDevis';

interface Props {
  analyse: DocumentAnalysis;
  /** Le client retenu à l'écran pour ce document. */
  clientId?: string;
  /** Le texte du document : il cite parfois le numéro du devis du CRM. */
  texte?: string;
}

const STYLE: Record<string, string> = {
  identique: 'text-muted-foreground',
  ecart: 'text-warning',
  manquant: 'text-destructive',
  en_trop: 'text-destructive',
};

function libelleEcart(e: EcartDevis): string {
  if (e.type === 'identique') return 'identique';
  if (e.type === 'manquant') return 'oubli du CRM';
  if (e.type === 'en_trop') return 'en trop au CRM';
  return [e.article && 'article', e.quantite && 'quantité', e.prix && 'prix'].filter(Boolean).join(' + ');
}

function libelleReference(e: EcartReference): string {
  if (e.type === 'identique') return 'identique';
  if (e.type === 'manquant') return 'absent du CRM';
  if (e.type === 'en_trop') return 'absent de l’offre';
  return [e.quantite && 'quantité', e.prix && 'prix'].filter(Boolean).join(' + ');
}

export default function ComparaisonDevisRealise({ analyse, clientId, texte }: Props) {
  const { devis, produits, clients } = useCRM();
  const [devisId, setDevisId] = useState('');
  const [masquerIdentiques, setMasquerIdentiques] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [appris, setAppris] = useState(false);
  /* Une grosse offre se lit par référence ; une petite, ligne à ligne. */
  const [vue, setVue] = useState<'reference' | 'ligne'>(
    (analyse.lignes?.length ?? 0) > 40 ? 'reference' : 'ligne');

  const candidats = useMemo(() => {
    const proposes = devisCandidats(devis, {
      numero: analyse.numeroDocument,
      referenceAffaire: analyse.referencePartenaire,
      clientId,
      texte,
    });
    /* Rien de reconnu : les plus récents, pour choisir à la main. */
    return (proposes.length ? proposes : [...devis].sort((a, b) => b.dateCreation.localeCompare(a.dateCreation)))
      .slice(0, 30);
  }, [devis, analyse, clientId, texte]);

  /* Le plus probable d'office ; le choix de l'écran ensuite. */
  const choisi = devis.find(d => d.id === devisId) ?? (devisCandidats(devis, {
    numero: analyse.numeroDocument, referenceAffaire: analyse.referencePartenaire, clientId, texte,
  })[0]);

  const ecarts = useMemo(
    () => (choisi ? comparerDevis(analyse.lignes || [], choisi, produits) : []),
    [choisi, analyse, produits],
  );
  const resume = useMemo(() => resumerEcarts(ecarts), [ecarts]);
  const ecartsRef = useMemo(
    () => (choisi && vue === 'reference' ? comparerParReference(analyse.lignes || [], choisi, produits) : []),
    [choisi, analyse, produits, vue],
  );
  const corrections = useMemo(() => correctionsApprises(ecarts), [ecarts]);
  const nomClient = (id?: string) => {
    const c = clients.find(x => x.id === id);
    return c ? c.societe || c.nom : '';
  };

  const meta = () => ({
    devisCrm: choisi?.numero || '',
    devisRealise: analyse.numeroDocument,
    client: nomClient(choisi?.clientId),
  });
  const rapport = () => rapportEcarts(ecarts, meta());
  const rapportAffiche = () => (vue === 'reference' ? rapportParReference(ecartsRef, meta()) : rapport());

  async function apprendre() {
    if (!choisi) return;
    setEnCours(true);
    let retenues = 0;
    const erreurs: string[] = [];
    for (const c of corrections) {
      const erreur = await retenirArticle(c.demande, {
        produitId: produitParReference(produits, c.reference)?.id,
        reference: c.reference,
        designation: c.designation,
      }, 'devis_realise');
      if (erreur) erreurs.push(erreur); else retenues++;
    }
    /* ⚠️ UN DEVIS ISSU D'UN PLAN N'A PAS DE DEMANDE CLIENT : l'apprentissage
       ligne à ligne n'y retenait RIEN, et les mêmes écarts revenaient au
       chiffrage suivant. La comparaison par référence apprend donc aussi :
       - la référence que l'offre a remplacée (D3…ST → D3…, options ôtées),
         pour toute demande qui la reprend ;
       - le prix pratiqué pour CE client (SFGAB168 35,30 € au lieu des 8,25 €
         du contrat), et le taux PAL de l'offre (PMSD ÷ m² des D3). */
    const parRef = comparerParReference(analyse.lignes || [], choisi, produits);
    const substitutions = substitutionsApprises(parRef);
    for (const sub of substitutions) {
      const erreur = await retenirArticle(sub.de, {
        produitId: produitParReference(produits, sub.vers)?.id,
        reference: sub.vers,
        designation: sub.designation,
      }, 'devis_realise');
      if (erreur) erreurs.push(erreur); else retenues++;
    }
    const prix = [...prixAApprendre(parRef), ...tauxPalDeLOffre(analyse.lignes || [])];
    if (prix.length) {
      const erreur = await retenirPrix(choisi.clientId, prix, analyse.numeroDocument);
      if (erreur) erreurs.push(erreur);
    }
    const { error } = await supabase.from('ecarts_devis' as never).insert({
      devis_id: choisi.id,
      devis_numero: choisi.numero,
      numero_realise: analyse.numeroDocument || null,
      ecarts: ecarts.filter(e => e.type !== 'identique'),
      resume: rapport(),
    } as never);
    if (error) erreurs.push(error.message);
    setEnCours(false);
    setAppris(true);
    if (erreurs.length) {
      toast.error('Apprentissage incomplet', { description: [...new Set(erreurs)].join(' — ') });
    } else {
      toast.success(`${retenues} correction(s) d’article et ${prix.length} prix retenu(s)`, {
        description: `Le prochain chiffrage de ${nomClient(choisi.clientId) || 'ce client'} reprend les articles et les prix de l’offre${
          prix.length ? ` (${prix.map(p => `${p.reference} ${formatMontant(p.prix)}`).join(', ')})` : ''}. Relevé des écarts enregistré.`,
      });
    }
  }

  function copier() {
    void navigator.clipboard.writeText(rapportAffiche()).then(
      () => toast.success('Rapport des écarts copié'),
      () => toast.error('Copie refusée par le navigateur'),
    );
  }

  const visibles = masquerIdentiques ? ecarts.filter(e => e.type !== 'identique') : ecarts;
  const sansDemande = ecarts.filter(e => e.article && !e.crm?.demandeClient).length;

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center shrink-0">
          <GitCompare className="w-4 h-4 text-warning" />
        </div>
        <div>
          <p className="text-sm font-semibold">Comparer au chiffrage du CRM</p>
          <p className="text-[11px] text-muted-foreground">
            L’offre réellement envoyée face au devis du CRM : ce que le commercial a corrigé, le CRM l’apprend.
          </p>
        </div>
      </div>

      <Select value={choisi?.id ?? ''} onValueChange={v => { setDevisId(v); setAppris(false); }}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Devis du CRM à comparer…" /></SelectTrigger>
        <SelectContent>
          {candidats.map(d => (
            <SelectItem key={d.id} value={d.id}>
              {d.numero} — {nomClient(d.clientId) || 'sans client'}
              {d.referenceAffaire ? ` — ${d.referenceAffaire}` : ''} ({d.dateCreation})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {choisi && (
        <>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded bg-muted px-1.5 py-0.5">{resume.identiques} identique(s)</span>
            <span className="rounded bg-warning/15 px-1.5 py-0.5">{resume.articles} article(s)</span>
            <span className="rounded bg-warning/15 px-1.5 py-0.5">{resume.quantites} quantité(s)</span>
            <span className="rounded bg-warning/15 px-1.5 py-0.5">{resume.prix} prix</span>
            <span className="rounded bg-destructive/10 px-1.5 py-0.5">{resume.manquants} oubli(s) du CRM</span>
            <span className="rounded bg-destructive/10 px-1.5 py-0.5">{resume.enTrop} en trop</span>
            <span className="rounded bg-muted px-1.5 py-0.5">
              HT réalisé {formatMontant(resume.totalRealise)} / CRM {formatMontant(resume.totalCrm)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex rounded border border-border overflow-hidden">
              {(['reference', 'ligne'] as const).map(v => (
                <button key={v} type="button" onClick={() => setVue(v)}
                  className={`px-2 py-0.5 ${vue === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                  {v === 'reference' ? 'Par référence' : 'Ligne à ligne'}
                </button>
              ))}
            </span>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={masquerIdentiques} onChange={e => setMasquerIdentiques(e.target.checked)} />
              Masquer les identiques
            </label>
          </div>

          {vue === 'reference' ? (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1 pr-2 font-medium">Écart</th>
                    <th className="py-1 pr-2 font-medium">Article</th>
                    <th className="py-1 pr-2 font-medium text-right">Offre</th>
                    <th className="py-1 pr-2 font-medium text-right">CRM</th>
                    <th className="py-1 font-medium text-right">Δ HT</th>
                  </tr>
                </thead>
                <tbody>
                  {ecartsRef.filter(e => !masquerIdentiques || e.type !== 'identique').map(e => (
                    <tr key={e.cle} className="border-b border-border/50 align-top">
                      <td className={`py-1 pr-2 font-medium whitespace-nowrap ${STYLE[e.type]}`}>{libelleReference(e)}</td>
                      <td className="py-1 pr-2"><span className="font-mono">{e.cle}</span> <span className="text-muted-foreground">{e.designation}</span></td>
                      <td className="py-1 pr-2 text-right whitespace-nowrap">{e.qteRealise} · {formatMontant(e.montantRealise)}</td>
                      <td className="py-1 pr-2 text-right whitespace-nowrap">{e.qteCrm} · {formatMontant(e.montantCrm)}</td>
                      <td className="py-1 text-right whitespace-nowrap font-medium">{formatMontant(e.montantRealise - e.montantCrm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : visibles.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1 pr-2 font-medium">Écart</th>
                    <th className="py-1 pr-2 font-medium">Devis réalisé</th>
                    <th className="py-1 font-medium">Chiffrage CRM</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((e, k) => (
                    <tr key={k} className="border-b border-border/50 align-top">
                      <td className={`py-1 pr-2 font-medium whitespace-nowrap ${STYLE[e.type]}`}>{libelleEcart(e)}</td>
                      <td className="py-1 pr-2">
                        {e.realise ? (
                          <>
                            {e.realise.reference && <span className="font-mono">{e.realise.reference} </span>}
                            <span>{e.realise.description}</span>
                            <span className={`block ${e.quantite || e.prix ? 'font-medium' : 'text-muted-foreground'}`}>
                              × {e.realise.quantite}{e.realise.pu != null ? ` à ${formatMontant(e.realise.pu)}` : ''}
                            </span>
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-1">
                        {e.crm ? (
                          <>
                            {e.crm.reference && <span className="font-mono">{e.crm.reference} </span>}
                            <span>{e.crm.description}</span>
                            <span className="block text-muted-foreground">
                              × {e.crm.quantite} à {formatMontant(e.crm.pu)}
                            </span>
                            {e.crm.demandeClient && (
                              <span className="block text-muted-foreground italic">demande : « {e.crm.demandeClient} »</span>
                            )}
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[11px] text-success">Aucun écart : le chiffrage du CRM est celui du devis réalisé.</p>
          )}

          {sansDemande > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {sansDemande} correction(s) d’article sans demande d’origine (devis créé avant le 14/10/2026 ou
              ligne saisie à la main) : relevées dans le rapport, pas apprises.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { void apprendre(); }} disabled={enCours || appris || !ecarts.length}>
              <Brain className="w-4 h-4 mr-1.5" />
              {appris ? 'Appris' : `Apprendre de ce devis${corrections.length ? ` (${corrections.length} correction(s))` : ''}`}
            </Button>
            <Button size="sm" variant="outline" onClick={copier} disabled={!ecarts.length}>
              <Copy className="w-4 h-4 mr-1.5" />Copier le rapport
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
