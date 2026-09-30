import type { Devis } from '@/lib/store';
import type { Systeme, SystemeComposant } from '@/lib/systemes';

/**
 * Un devis MODÈLE (statut « système », client SYSTEME) lu comme un système.
 *
 * La table `systemes` recopie les fiches Flowcrete. Les combinaisons que l'on
 * vend vraiment — « Flowfast 107 + 319 Road » : primaire 107, quartz, finition
 * 319 Road, tire à zéro en option — n'y sont pas : elles vivent dans des devis
 * modèles, avec leurs articles, leurs consommations et leurs notes. La demande
 * « système 107 flowfast 319 Road 100 m² » se chiffrait comme un article
 * quelconque, alors que le modèle existe.
 *
 * On ne réinvente rien : chaque ligne du modèle devient un composant, avec
 * l'article et la consommation que le modèle porte. Une ligne sans article
 * (la surcharge énergie) reste hors du système. Une consommation absente reste
 * absente — à défaut, on lit celle que la NOTE du modèle annonce (« @ 0,5
 * kg/m² ») ; sinon le composant part à zéro avec « aucun dosage ».
 *
 * Un groupe « Tire à zéro » ou « Option » se range en composants FACULTATIFS :
 * le modèle les propose, la demande ne les réclame pas.
 */

const EST_FACULTATIF = /tire\s+[aà]\s+z[eé]ro|option/i;
const CONSO_NOTE = /@\s*(\d+(?:[.,]\d+)?)\s*kg\s*\/\s*m/i;

/** Préfixe d'identifiant : on reconnaît un système issu d'un devis. */
export const PREFIXE_SYSTEME_DEVIS = 'devis:';

function roleDe(description: string, groupe: string): string {
  if (/pigment/i.test(description)) return 'pigment';
  if (/catalyst|catalyseur/i.test(description)) return 'catalyseur';
  if (/primaire|primer/i.test(groupe)) return 'primaire';
  return groupe.trim().toLowerCase() || 'base';
}

export function systemeDepuisDevis(d: Devis): Systeme | null {
  if (d.statut !== 'système') return null;
  const nom = (d.systeme || d.referenceAffaire || '').trim();
  if (!nom) return null;

  const composants: SystemeComposant[] = [];
  let groupe = '';
  (d.lignes || []).forEach((l, ordre) => {
    if (l.type === 'groupe') { groupe = l.description || ''; return; }
    /* Un article se reconnaît par exclusion (type absent = article). */
    if (l.type === 'soustotal' || l.type === 'texte') return;
    if (!l.produitId) return;
    const note = l.note || undefined;
    const lue = l.consommation != null && l.consommation > 0
      ? l.consommation
      : (() => {
        const m = note?.match(CONSO_NOTE);
        return m ? parseFloat(m[1].replace(',', '.')) : undefined;
      })();
    const facultatif = EST_FACULTATIF.test(groupe);
    composants.push({
      id: `${PREFIXE_SYSTEME_DEVIS}${d.id}:${l.id}`,
      systemeId: `${PREFIXE_SYSTEME_DEVIS}${d.id}`,
      ordre,
      produitId: l.produitId,
      libelle: l.description,
      role: roleDe(l.description || '', groupe),
      consommation: lue,
      obligatoire: !facultatif,
      ...(facultatif ? { condition: groupe } : {}),
      ...(note ? { phraseSource: note } : {}),
    });
  });
  if (!composants.length) return null;

  return {
    id: `${PREFIXE_SYSTEME_DEVIS}${d.id}`,
    nom,
    famille: 'Modèle de devis',
    support: 'Béton ou enrobé — voir le devis modèle',
    description: `Modèle ${d.numero}${d.referenceAffaire ? ` — ${d.referenceAffaire}` : ''}`,
    actif: true,
    depuisDevis: true,
    composants,
  };
}

/** Les systèmes que portent les devis modèles. */
export function systemesDeDevis(devis: Devis[]): Systeme[] {
  const out: Systeme[] = [];
  for (const d of devis) {
    const s = systemeDepuisDevis(d);
    if (s) out.push(s);
  }
  return out;
}
