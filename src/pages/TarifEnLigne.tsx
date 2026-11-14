import { useEffect } from 'react';

/**
 * `/tarif` — adresse envoyée aux clients. Le tarif en ligne est la page
 * statique `public/tarif.html`, GÉNÉRÉE à partir du catalogue ISOFLOOR
 * (`scripts/tarif-catalogue/generer.mjs`) pour en reprendre l'apparence ;
 * cette route n'existe que pour garder l'adresse courte (`?demande`,
 * `?client=` compris).
 */
export default function TarifEnLigne() {
  useEffect(() => {
    window.location.replace(`/tarif.html${window.location.search}`);
  }, []);
  return null;
}
