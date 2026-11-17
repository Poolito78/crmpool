/**
 * Web › Calculateur Flowfast (17/11/2026).
 *
 * Le calculateur d'isofloor.fr, À L'IDENTIQUE : la page charge le même fichier
 * (`scripts/site-isofloor/calculateur-flowfast.html`, importé tel quel) dans
 * une iframe `srcdoc` — même origine que MonCRM, la page lit donc sa
 * préconisation par `window.__devisCalc()`. Une seule source : ce qui est
 * publié sur le site et ce que voit le CRM ne peuvent pas diverger.
 *
 * « Créer devis » : client choisi ici, lignes au prix de ce client
 * (`devisCalculateur.ts`), devis brouillon ouvert aussitôt. Ce qui n'a pas
 * d'article au catalogue part « à vérifier », jamais deviné.
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilePlus2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import calculateurHtml from '../../scripts/site-isofloor/calculateur-flowfast.html?raw';
import { Button } from '@/components/ui/button';
import ClientCombobox from '@/components/ClientCombobox';
import { useCRM } from '@/lib/StoreContext';
import { useSocietes } from '@/hooks/useSocietes';
import { generateId, type Devis } from '@/lib/store';
import { prochainNumeroDevis } from '@/lib/numeroDevis';
import { lignesDepuisCalculateur, type EtatCalculateur } from '@/lib/devisCalculateur';

export default function CalculateurFlowfast() {
  const { clients, produits, devis, numerosLiberes, updateDevis } = useCRM();
  const { serieDe } = useSocietes();
  const navigate = useNavigate();
  const cadre = useRef<HTMLIFrameElement>(null);
  const [clientId, setClientId] = useState('');

  const creerDevis = () => {
    const lire = (cadre.current?.contentWindow as (Window & { __devisCalc?: () => EtatCalculateur | null }) | null)?.__devisCalc;
    const etat = lire?.();
    if (!etat || !(etat.q > 0)) {
      toast.error('Rien à reprendre : choisissez la résine et saisissez une quantité ou une surface.');
      return;
    }
    if (!clientId) {
      toast.error('Choisissez le client du devis.');
      return;
    }
    const client = clients.find(c => c.id === clientId) ?? null;
    const { lignes, aVerifier, systeme } = lignesDepuisCalculateur(etat, produits, client, generateId);
    const aujourdhui = new Date();
    const validite = new Date(aujourdhui);
    validite.setDate(validite.getDate() + 30);
    const numero = prochainNumeroDevis(devis, aujourdhui.getFullYear(), numerosLiberes, serieDe('DEV', undefined, false));
    const nouveau: Devis = {
      id: generateId(),
      numero,
      clientId,
      dateCreation: aujourdhui.toISOString().split('T')[0],
      dateValidite: validite.toISOString().split('T')[0],
      statut: 'brouillon',
      lignes,
      systeme,
    };
    updateDevis(prev => [nouveau, ...prev]);
    toast.success(`Devis ${numero} créé depuis le calculateur`,
      aVerifier.length ? { description: `À vérifier : ${aVerifier.join(' · ')}`, duration: 15000 } : undefined);
    navigate(`/devis?editDevis=${nouveau.id}`);
  };

  return (
    <div className="space-y-3 p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold">Calculateur Flowfast</h1>
          <p className="text-sm text-muted-foreground">
            Le calculateur d'isofloor.fr. « Créer devis » reprend la préconisation (kits SNLR / SNLC, résine, pigment, catalyseur) au tarif du client.
          </p>
        </div>
        <a href="https://www.isofloor.fr/calculateur-flowfast" target="_blank" rel="noopener noreferrer"
           className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
          Sur le site <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2 backdrop-blur">
        <div className="min-w-[16rem] flex-1">
          <ClientCombobox clients={clients} value={clientId} onSelect={setClientId} placeholder="Client du devis…" effacable />
        </div>
        <Button onClick={creerDevis}>
          <FilePlus2 className="w-4 h-4 mr-1.5" /> Créer devis
        </Button>
      </div>
      <iframe
        ref={cadre}
        title="Calculateur Flowfast"
        srcDoc={calculateurHtml}
        className="w-full border-0 rounded-lg"
        style={{ minHeight: 1200 }}
        scrolling="no"
      />
    </div>
  );
}
