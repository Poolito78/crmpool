import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ExternalLink, ImageOff } from 'lucide-react';
import logoIsofloor from '@/assets/logo-isofloor.png';

/**
 * La fiche produit publique — la page qu'un client ouvre depuis un mail.
 *
 * ELLE VIT HORS DE L'APPLICATION : pas de session, pas de `CRMLayout`, pas de
 * `useCRM()`. Le destinataire d'un devis n'a pas de compte et n'en aura pas ;
 * une page qui redirige vers l'écran de connexion ne sert à rien dans un mail.
 *
 * ELLE NE MONTRE AUCUN PRIX. Ce n'est pas un oubli à corriger : la fonction
 * `fiche_publique` en base ne les renvoie pas, et c'est là que la frontière
 * est tenue. Ajouter un prix ici demanderait d'abord de l'ajouter là-bas —
 * une décision, pas une négligence d'affichage.
 */

interface FichePubliqueData {
  id: string;
  reference: string | null;
  description: string | null;
  description_detaillee: string | null;
  unite: string | null;
  categorie: string | null;
  fiche_url: string | null;
  fiche_link_label: string | null;
  images: Array<{ url: string; nom: string | null }>;
}

export default function FichePublique() {
  const { id } = useParams<{ id: string }>();
  const [fiche, setFiche] = useState<FichePubliqueData | null>(null);
  const [chargement, setChargement] = useState(true);
  const [principale, setPrincipale] = useState(0);

  useEffect(() => {
    let annule = false;
    if (!id) { setChargement(false); return; }
    setChargement(true);
    supabase
      .rpc('fiche_publique' as never, { p_id: id } as never)
      .then(({ data, error }) => {
        if (annule) return;
        if (error) console.error('[fiche publique]', error.message);
        setFiche((data as FichePubliqueData | null) ?? null);
        setPrincipale(0);
        setChargement(false);
      });
    return () => { annule = true; };
  }, [id]);

  useEffect(() => {
    if (fiche?.description) document.title = `${fiche.description} — ISOFLOOR`;
  }, [fiche]);

  if (chargement) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin w-8 h-8 border-4 border-[#FF2E17] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!fiche) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white px-6 text-center">
        <ImageOff className="w-10 h-10 text-neutral-300" />
        <h1 className="text-lg font-semibold text-neutral-800">Fiche introuvable</h1>
        <p className="text-sm text-neutral-500 max-w-sm">
          Ce lien ne correspond à aucun article disponible. Il a pu être remplacé —
          demandez-nous le lien à jour.
        </p>
      </div>
    );
  }

  const images = fiche.images ?? [];
  const image = images[principale];
  const libelleFiche = fiche.fiche_link_label?.trim() || 'Fiche technique du fabricant';

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <img src={logoIsofloor} alt="ISOFLOOR" className="h-8 w-auto" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          {fiche.categorie && (
            <p className="text-xs uppercase tracking-wide text-[#FF2E17] font-medium">{fiche.categorie}</p>
          )}
          <h1 className="text-2xl font-semibold text-neutral-900 mt-1">
            {fiche.description || fiche.reference}
          </h1>
          {fiche.reference && (
            <p className="text-sm text-neutral-500 mt-1">
              Référence {fiche.reference}
              {fiche.unite ? ` — vendu à l'${fiche.unite === 'u' ? 'unité' : fiche.unite}` : ''}
            </p>
          )}
        </div>

        {image && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border overflow-hidden flex items-center justify-center">
              <img
                src={image.url}
                alt={image.nom || fiche.description || 'Photo de l’article'}
                className="max-h-[420px] w-auto object-contain"
              />
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {images.map((im, i) => (
                  <button
                    key={im.url}
                    onClick={() => setPrincipale(i)}
                    className={`w-16 h-16 rounded-lg border overflow-hidden bg-white ${i === principale ? 'ring-2 ring-[#FF2E17]' : ''}`}
                  >
                    <img src={im.url} alt="" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {fiche.description_detaillee && (
          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-neutral-900 mb-2">Description</h2>
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{fiche.description_detaillee}</p>
          </div>
        )}

        {fiche.fiche_url && (
          <a
            href={fiche.fiche_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF2E17] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <ExternalLink className="w-4 h-4" />
            {libelleFiche}
          </a>
        )}

        <p className="text-xs text-neutral-400 pt-4 border-t">
          Document d'information. Les prix et disponibilités font l'objet d'une offre écrite.
        </p>
      </main>
    </div>
  );
}
