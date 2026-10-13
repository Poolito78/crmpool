/**
 * Mails types d'envoi : l'objet et le corps proposés quand on envoie un devis,
 * une commande fournisseur, une facture ou l'accusé de réception d'une
 * commande client.
 *
 * Chaque utilisateur règle les siens dans Paramètres → Mails (table
 * `mails_types`, une ligne par type) — chacun sa signature. Un type sans ligne
 * garde le texte d'origine de l'application (`MAILS_DEFAUT`), qui reprend
 * ce que les dialogues écrivaient en dur avant.
 *
 * Les valeurs du document entrent par des champs `{numero}`, `{montantHT}`…
 * Un passage entre `[[ ]]` disparaît si l'un de ses champs est vide : « (Réf.
 * {reference}) » ne doit pas laisser « (Réf. ) » sur un devis sans référence.
 * Un champ inconnu reste tel quel, pour que la faute de frappe se voie.
 *
 * Les relances de devis gardent leurs propres mails types (`relanceDevis.ts`),
 * choisis au rang de la relance.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type TypeMail = 'devis' | 'commande_fournisseur' | 'facture' | 'ar_commande';

export interface ModeleMail { objet: string; corps: string }

export interface DefinitionMail extends ModeleMail {
  libelle: string;
  description: string;
  /** Champs disponibles : clé → libellé et exemple (aperçu des Paramètres). */
  champs: Record<string, { libelle: string; exemple: string }>;
}

const DESTINATAIRE = { libelle: 'Nom du destinataire', exemple: 'Roger Cheval' };
const NUMERO = { libelle: 'Numéro', exemple: 'DEV-2026-138' };
const REFERENCE = { libelle: "Réf. affaire", exemple: 'BAO BLANCHE' };
const SOCIETE = { libelle: 'Société', exemple: "PRESTA'SERVICE" };

export const MAILS_DEFAUT: Record<TypeMail, DefinitionMail> = {
  devis: {
    libelle: 'Envoi de devis',
    description: "Proposé par « Envoyer par mail » d'un devis (la relance garde ses propres mails types).",
    objet: 'Devis {numero}[[ — {reference}]][[ — {societe}]][[ — {chantier}]]',
    corps: `Bonjour[[ {destinataire}]],

Suite à notre échange, tu trouveras ci-joint notre devis {numero}[[ (Réf. {reference})]] d'un montant de {montantHT} HT.[[
Chantier : {chantier}]]
Ce devis est valable jusqu'au {validite}.

Restant à ta disposition pour tout complément d'information.`,
    champs: {
      destinataire: DESTINATAIRE, numero: NUMERO, reference: REFERENCE, societe: SOCIETE,
      chantier: { libelle: 'Chantier', exemple: 'BAO BLANCHE 64 ML' },
      montantHT: { libelle: 'Montant HT', exemple: '846,80 €' },
      montantTTC: { libelle: 'Montant TTC', exemple: '1 016,16 €' },
      validite: { libelle: 'Valable jusqu\'au', exemple: '12/11/2026' },
    },
  },
  commande_fournisseur: {
    libelle: 'Commande fournisseur',
    description: "Proposé à l'envoi d'une commande à un fournisseur.",
    objet: 'Commande {numero}[[ — {societe}]]',
    corps: `Bonjour[[ {destinataire}]],

Veuillez trouver ci-joint notre commande {numero} d'un montant de {montantTTC} TTC.

Détail :
{detail}

Total HT : {montantHT}
Transport : {transport}
Total TTC : {montantTTC}

Merci de confirmer la réception de cette commande et de nous communiquer le délai de livraison.

Cordialement,
[Votre nom]
[Votre entreprise]`,
    champs: {
      destinataire: DESTINATAIRE, numero: { libelle: 'Numéro', exemple: 'CF-2026-042' }, societe: { libelle: 'Société', exemple: 'URBADECCO' },
      detail: { libelle: 'Détail des lignes', exemple: '- Quartz gris 0,7-1,3 (Réf: QUARTZGRI0.7-1.3) × 10 = 228,50 €' },
      montantHT: { libelle: 'Total HT', exemple: '228,50 €' },
      transport: { libelle: 'Transport', exemple: 'Franco' },
      montantTTC: { libelle: 'Total TTC', exemple: '274,20 €' },
    },
  },
  facture: {
    libelle: 'Facture client',
    description: "Proposé à l'envoi d'une facture au client.",
    objet: 'Facture {numero}[[ — Réf. {reference}]][[ — {societe}]]',
    corps: `Bonjour[[ {destinataire}]],

Veuillez trouver ci-joint notre facture {numero} d'un montant de {montantTTC} TTC.

Détail :
- Total HT : {montantHT}
- Total TVA : {montantTVA}
- Total TTC : {montantTTC}[[
- Frais de port : {fraisPort}]][[

Date d'échéance de paiement : {echeance}]]

Restant à votre disposition pour toute question.

Cordialement,
[Votre nom]
[Votre entreprise]`,
    champs: {
      destinataire: DESTINATAIRE, numero: { libelle: 'Numéro', exemple: 'FA-2026-310' }, reference: REFERENCE, societe: SOCIETE,
      montantHT: { libelle: 'Total HT', exemple: '846,80 €' },
      montantTVA: { libelle: 'Total TVA', exemple: '169,36 €' },
      montantTTC: { libelle: 'Total TTC', exemple: '1 016,16 €' },
      fraisPort: { libelle: 'Frais de port', exemple: '87,00 €' },
      echeance: { libelle: 'Échéance', exemple: '31/12/2026' },
    },
  },
  ar_commande: {
    libelle: 'AR de commande client',
    description: "Proposé à l'envoi de l'accusé de réception d'une commande client.",
    objet: 'AR Commande {numero}[[ — {reference}]][[ — {societe}]]',
    corps: `Bonjour[[ {destinataire}]],

Nous vous confirmons la bonne réception de votre commande {numero}[[ (Réf. {reference})]] d'un montant de {montantHT} HT.[[

Date de départ prévue : {dateDepart}]][[
Date de livraison prévue : {dateLivraison}]]

Restant à votre disposition pour tout complément d'information.

Cordialement,
ISOSIGN`,
    champs: {
      destinataire: DESTINATAIRE, numero: { libelle: 'Numéro', exemple: 'CC-2026-077' }, reference: REFERENCE, societe: SOCIETE,
      montantHT: { libelle: 'Montant HT', exemple: '846,80 €' },
      dateDepart: { libelle: 'Date de départ', exemple: '20/10/2026' },
      dateLivraison: { libelle: 'Date de livraison', exemple: '22/10/2026' },
    },
  },
};

export const TYPES_MAIL = Object.keys(MAILS_DEFAUT) as TypeMail[];

/**
 * Remplit un modèle. `[[ … ]]` disparaît si l'un de ses champs est vide ;
 * un champ inconnu reste visible ; trois sauts de ligne ou plus se réduisent
 * à deux (un passage retiré ne laisse pas de trou).
 */
export function remplirMail(modele: string, valeurs: Record<string, string | null | undefined>): string {
  const val = (k: string) => String(valeurs[k] ?? '').trim();
  const connu = (k: string) => k in valeurs;
  const sansOptions = modele.replace(/\[\[([\s\S]*?)\]\]/g, (_, segment: string) => {
    const cles = [...segment.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    return cles.some(k => connu(k) && !val(k)) ? '' : segment;
  });
  return sansOptions
    .replace(/\{(\w+)\}/g, (m, k: string) => (connu(k) ? val(k) : m))
    .replace(/\n{3,}/g, '\n\n');
}

/* ── Les mails types de l'utilisateur ─────────────────────────────────────────
   Lus une fois par session et partagés entre les dialogues : un dialogue qui
   s'ouvre trouve ses textes déjà là. */
let cache: Partial<Record<TypeMail, ModeleMail>> | null = null;
let chargement: Promise<void> | null = null;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach(f => f());

function charger(): Promise<void> {
  if (!chargement) {
    chargement = (async () => {
      const { data, error } = await supabase.from('mails_types' as never).select('type, objet, corps');
      const lus: Partial<Record<TypeMail, ModeleMail>> = {};
      if (!error) {
        for (const r of (data ?? []) as { type: string; objet: string; corps: string }[]) {
          if (r.type in MAILS_DEFAUT) lus[r.type as TypeMail] = { objet: r.objet, corps: r.corps };
        }
      } else {
        console.error('[mails_types] lecture', error.message);
      }
      cache = lus;
      prevenir();
    })();
  }
  return chargement;
}

export function useMailsTypes() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const f = () => setVersion(v => v + 1);
    abonnes.add(f);
    void charger();
    return () => { abonnes.delete(f); };
  }, []);

  /** Le modèle retenu pour ce type : celui de l'utilisateur, sinon l'origine. */
  const modele = useCallback((t: TypeMail): ModeleMail => cache?.[t] ?? MAILS_DEFAUT[t],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]);
  const estPersonnalise = useCallback((t: TypeMail) => !!cache?.[t],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]);

  const enregistrer = useCallback(async (t: TypeMail, m: ModeleMail) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 'Non connecté';
    const { error } = await supabase.from('mails_types' as never).upsert(
      { user_id: session.user.id, type: t, objet: m.objet, corps: m.corps, updated_at: new Date().toISOString() } as never,
      { onConflict: 'user_id,type' },
    );
    if (error) return error.message;
    cache = { ...(cache ?? {}), [t]: m };
    prevenir();
    return null;
  }, []);

  /** Revient au texte d'origine : la ligne de l'utilisateur est effacée. */
  const reinitialiser = useCallback(async (t: TypeMail) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 'Non connecté';
    const { error } = await supabase.from('mails_types' as never).delete().eq('user_id', session.user.id).eq('type', t);
    if (error) return error.message;
    const suite = { ...(cache ?? {}) };
    delete suite[t];
    cache = suite;
    prevenir();
    return null;
  }, []);

  return { modele, estPersonnalise, enregistrer, reinitialiser, charge: cache !== null, version };
}
