import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Historique des prix d'un article, en périodes datées.
 *
 * La base enregistre déjà chaque mouvement : le déclencheur `trg_noter_prix`
 * écrit dans `journal_prix` dès qu'un prix d'achat ou de vente change, avec
 * la valeur d'avant et celle d'après. Personne ne lisait cette table — la
 * fiche article n'affichait que la DATE du dernier changement, sans dire ce
 * qui avait changé ni ce qui valait avant.
 *
 * Or ce n'est pas la date d'un changement qu'on cherche quand on justifie une
 * hausse à un client ou qu'on vérifie une reprise Odoo, c'est la PÉRIODE
 * pendant laquelle un prix a été en vigueur : « du 12 mars au 1er septembre,
 * l'achat était à 86,82 € ». C'est ce que ce module reconstitue.
 */

export interface MouvementPrix {
  id: number;
  produitId: string;
  reference?: string;
  /** Horodatage du changement. */
  quand: string;
  achatAvant?: number;
  achatApres?: number;
  venteAvant?: number;
  venteApres?: number;
}

/** Ce qui a changé à l'entrée dans une période. */
export type ChangementPrix = 'achat' | 'vente' | 'les deux' | 'origine';

export interface PeriodePrix {
  /** Début de la période. Absent pour la plus ancienne : on ne sait pas depuis quand. */
  debut?: string;
  /** Fin de la période. Absent pour celle en cours. */
  fin?: string;
  prixAchat?: number;
  prixVente?: number;
  changement: ChangementPrix;
  /**
   * Les prix de la période en cours ne concordent pas avec le dernier
   * mouvement enregistré : un changement a échappé au journal.
   */
  ecartAvecFiche?: boolean;
}

/* ── Mapping base ↔ application ──────────────────────────────────────────── */

function dbToMouvement(r: Record<string, unknown>): MouvementPrix {
  const nb = (v: unknown) => (v == null ? undefined : Number(v));
  return {
    id: Number(r.id),
    produitId: String(r.produit_id),
    reference: (r.reference as string) || undefined,
    quand: String(r.quand),
    achatAvant: nb(r.achat_avant),
    achatApres: nb(r.achat_apres),
    venteAvant: nb(r.vente_avant),
    venteApres: nb(r.vente_apres),
  };
}

/* ── Périodes ────────────────────────────────────────────────────────────── */

const proche = (a?: number, b?: number) =>
  a == null || b == null ? a === b : Math.abs(a - b) < 0.005;

function quoiAChange(m: MouvementPrix): ChangementPrix {
  const achat = !proche(m.achatAvant, m.achatApres);
  const vente = !proche(m.venteAvant, m.venteApres);
  if (achat && vente) return 'les deux';
  if (achat) return 'achat';
  return 'vente';
}

/**
 * Reconstitue les périodes de prix, de la plus récente à la plus ancienne.
 *
 * Un mouvement daté du 1er septembre ne dit pas « le prix a changé ce
 * jour-là » : il FERME la période précédente et en OUVRE une nouvelle. La
 * première période n'a pas de début connu — le journal ne remonte pas avant
 * sa propre création — et la dernière n'a pas de fin : c'est celle en cours.
 *
 * Les prix de la période en cours sont ceux de la FICHE, pas ceux du dernier
 * mouvement. Les deux devraient concorder ; quand ce n'est pas le cas, un
 * changement a échappé au journal — une écriture antérieure au déclencheur,
 * ou faite hors de l'application — et c'est la fiche qui fait foi. On le
 * signale plutôt que de laisser croire à un prix qui n'est plus le bon.
 */
export function periodesDePrix(
  mouvements: MouvementPrix[],
  actuel?: { prixAchat?: number; prixHT?: number },
): PeriodePrix[] {
  const tries = [...mouvements].sort(
    (a, b) => new Date(a.quand).getTime() - new Date(b.quand).getTime(),
  );

  if (!tries.length) {
    if (!actuel) return [];
    return [{
      debut: undefined, fin: undefined,
      prixAchat: actuel.prixAchat, prixVente: actuel.prixHT,
      changement: 'origine',
    }];
  }

  const periodes: PeriodePrix[] = [];

  // Avant le premier mouvement : les valeurs qu'il dit avoir remplacées.
  periodes.push({
    debut: undefined,
    fin: tries[0].quand,
    prixAchat: tries[0].achatAvant,
    prixVente: tries[0].venteAvant,
    changement: 'origine',
  });

  tries.forEach((m, i) => {
    periodes.push({
      debut: m.quand,
      fin: tries[i + 1]?.quand,
      prixAchat: m.achatApres,
      prixVente: m.venteApres,
      changement: quoiAChange(m),
    });
  });

  const courante = periodes[periodes.length - 1];
  if (actuel) {
    const ecart = !proche(courante.prixAchat, actuel.prixAchat)
      || !proche(courante.prixVente, actuel.prixHT);
    if (ecart) {
      courante.prixAchat = actuel.prixAchat;
      courante.prixVente = actuel.prixHT;
      courante.ecartAvecFiche = true;
    }
  }

  return periodes.reverse();
}

/* ── Hook ────────────────────────────────────────────────────────────────── */

/**
 * Les mouvements de prix d'un article, lus À LA DEMANDE.
 *
 * Jamais au chargement du catalogue : 22 508 articles, on ne rapatrie pas
 * l'historique de tous pour en afficher un. `produitId` vide ne lit rien.
 */
export function useJournalPrix(produitId?: string) {
  const [mouvements, setMouvements] = useState<MouvementPrix[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    if (!produitId) { setMouvements([]); setErreur(null); return; }
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from('journal_prix')
      .select('*')
      .eq('produit_id', produitId)
      .order('quand', { ascending: false });
    if (error) {
      /* Un historique qui ne se charge pas doit se dire : une liste vide
         laisserait croire que le prix n'a jamais bougé. */
      console.error('[journal_prix]', error.message);
      setErreur(error.message);
      setMouvements([]);
    } else {
      setMouvements((data || []).map(dbToMouvement));
    }
    setChargement(false);
  }, [produitId]);

  useEffect(() => { void recharger(); }, [recharger]);

  return { mouvements, chargement, erreur, recharger };
}
