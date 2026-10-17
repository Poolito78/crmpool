/**
 * Compteur d'egress et mode économie (migration 20261017160000).
 *
 * Supabase gratuit = 5 Go de données sortantes par cycle ; septembre 2026 en
 * a fait 5,93 et l'organisation est passée en sursis. La règle du 17/10 :
 * bloquer AVANT la limite.
 *
 * `fetchCompte` enveloppe le `fetch` du client Supabase : chaque réponse est
 * pesée (taille DÉCOMPRESSÉE — au-dessus du réel transmis, c'est voulu : on se
 * trompe du côté prudent). Le total part en base toutes les 2 minutes par
 * `noter_egress`, dont la réponse dit si le seuil du cycle est franchi. Le
 * mode économie coupe alors le temps réel ; les tâches de nuit, elles, le
 * lisent côté serveur.
 *
 * L'appel `noter_egress` lui-même n'est pas compté (il ne pèse rien et
 * s'écouterait parler).
 */
let octets = 0;
let requetes = 0;

export function fetchCompte(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init).then(res => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/rpc/noter_egress')) {
      requetes++;
      const annonce = Number(res.headers.get('content-length'));
      if (annonce > 0) octets += annonce;
      else if (res.body) {
        // Réponse découpée (catalogue, devis) : on pèse une copie, sans retenir l'appelant.
        res.clone().blob().then(b => { octets += b.size; }).catch(() => { /* lecture abandonnée */ });
      }
    }
    return res;
  });
}

/** Ce qui a été compté depuis le dernier envoi, remis à zéro. */
export function prendreCompte(): { octets: number; requetes: number } {
  const r = { octets, requetes };
  octets = 0;
  requetes = 0;
  return r;
}

/** Remet un envoi échoué dans le compteur, pour le prochain essai. */
export function rendreCompte(r: { octets: number; requetes: number }) {
  octets += r.octets;
  requetes += r.requetes;
}

export interface EtatQuota {
  mode: 'auto' | 'force' | 'off';
  seuil: number;
  mesure: number;
  reel_go: string | null;
  debut_cycle: string;
  economie: boolean;
}

/** « 1,2 Go » / « 340 Mo ». */
export function formatOctets(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace('.', ',')} Go`;
  return `${Math.round(n / 1e6)} Mo`;
}
