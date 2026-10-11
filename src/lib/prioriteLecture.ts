/**
 * Priorité aux lectures que l'utilisateur attend.
 *
 * Le catalogue entier (22 700 articles, 23 tranches de ~2 Mo) se relit en
 * arrière-plan : au démarrage, puis à chaque rafale de messages temps réel
 * (synchro Odoo, import). Mesuré dans `pg_stat_statements` : ces tranches
 * coûtent 900 ms en moyenne, jusqu'à 7,7 s — et la page de recherche de
 * Produits, qui se lit en 1 ms, faisait la queue derrière elles. D'où « le
 * temps de recherche est extrêmement long » alors que la requête est instantanée.
 *
 * Tant qu'une lecture interactive est en cours, la relecture de fond ne lance
 * AUCUNE nouvelle tranche (celles déjà parties se terminent) ; elle reprend
 * dès que la base est libre. L'attente est bornée : une lecture interactive
 * bloquée ne doit pas geler le chargement du catalogue pour toujours.
 */

let interactives = 0;

/** À appeler quand une lecture attendue par l'utilisateur démarre ; rend la fonction de fin. */
export function lectureInteractive(): () => void {
  interactives++;
  let fini = false;
  return () => {
    if (fini) return;
    fini = true;
    interactives = Math.max(0, interactives - 1);
  };
}

/** La relecture de fond attend ici avant chaque paquet de tranches. */
export async function cederLaMain(attenteMaxMs = 10000): Promise<void> {
  const debut = Date.now();
  while (interactives > 0 && Date.now() - debut < attenteMaxMs) {
    await new Promise(r => setTimeout(r, 100));
  }
}
