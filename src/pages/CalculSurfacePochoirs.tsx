import { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Trash2, ExternalLink, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  POCHOIRS_SURFACE, CATEGORIES_POCHOIRS, chercherPochoirs, surfaceDimension,
  type PochoirSurface, type CategoriePochoir,
} from '@/lib/pochoirsSurface';
import { melangeFlowfast319, masse, GAMMES_FLOWFAST319, PIGMENTS_319, type GammeFlowfast319 } from '@/lib/melangeFlowfast319';

interface Ligne {
  id: string;
  /** Index dans `PochoirSurface.tailles` (ignoré si la fiche n'a pas de dimension). */
  taille: number;
  qte: number;
  /** Dimension saisie (cm) quand la fiche n'en donne pas. */
  l: number;
  h: number;
}

const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

function Vignette({ p, className }: { p: PochoirSurface; className?: string }) {
  const [ko, setKo] = useState(false);
  const base = cn('shrink-0 rounded border bg-white object-contain', className ?? 'w-11 h-11');
  return ko
    ? <div className={cn(base, 'bg-muted')} />
    : <img src={p.image} alt={p.nom} loading="lazy" referrerPolicy="no-referrer" onError={() => setKo(true)} className={base} />;
}

/* Mélange Flowfast 319 de la surface à peindre — même calcul que le site
   isofloor.fr (`melangeFlowfast319.ts`). */
function CarteMelange({ surface }: { surface: number }) {
  const [gamme, setGamme] = useState<GammeFlowfast319>('road');
  const [pigment, setPigment] = useState<number>(10);
  const [conso, setConso] = useState(String(GAMMES_FLOWFAST319.road.conso));
  const consoNum = parseFloat(conso.replace(',', '.'));
  const m = melangeFlowfast319(surface, gamme, pigment, consoNum > 0 ? consoNum : undefined);
  const G = GAMMES_FLOWFAST319[gamme];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Mélange Flowfast 319 pour cette surface (consommations de base à 20 °C)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(GAMMES_FLOWFAST319) as GammeFlowfast319[]).map(g => (
            <Button key={g} size="sm" variant={gamme === g ? 'default' : 'outline'} className="h-8"
                    onClick={() => { setGamme(g); setConso(String(GAMMES_FLOWFAST319[g].conso).replace('.', ',')); }}>
              {GAMMES_FLOWFAST319[g].libelle}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-[12rem] space-y-1">
            <span className="text-xs text-muted-foreground">Pigment</span>
            <select value={pigment} onChange={e => setPigment(Number(e.target.value))}
                    className="h-10 w-full rounded-md border bg-background px-2 text-sm">
              {PIGMENTS_319.map(p => <option key={p.pct} value={p.pct}>{p.libelle}</option>)}
            </select>
          </label>
          <label className="w-28 space-y-1">
            <span className="text-xs text-muted-foreground">Conso. (kg/m²)</span>
            <Input inputMode="decimal" value={conso} onChange={e => setConso(e.target.value)} className="h-10" />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-muted/60 p-3">
            <div className="text-xs text-muted-foreground">Surface à couvrir (+10 %)</div>
            <div className="font-bold tabular-nums">{fmt(m.surfaceACouvrir)} m²</div>
          </div>
          <div className="rounded-lg bg-primary/10 p-3">
            <div className="text-xs text-muted-foreground">Mélange à préparer</div>
            <div className="font-bold text-primary tabular-nums">{masse(m.melangeKg)}</div>
          </div>
          <div className="rounded-lg bg-muted/60 p-3">
            <div className="text-xs text-muted-foreground">dont résine 319</div>
            <div className="font-bold tabular-nums">{masse(m.resineKg)}</div>
          </div>
        </div>
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950/40 dark:text-green-200 dark:border-green-800">
          <div className="font-semibold">
            Kit le plus adapté : {m.kits.map(([k, n]) => `${n} × ${k.code} (${masse(k.kg)})`).join(' + ')}
          </div>
          <div>Résine 319 : {masse(m.kit.resine)}</div>
          <div>{G.charge} (charge) : {masse(m.kit.charge)}</div>
          {pigment > 0 && <div>Pigment {pigment} % : {masse(m.kit.pigment)}</div>}
          <div>Catalyseur C2 : {masse(m.kit.catalyseur)}</div>
          <div>
            <span className="font-semibold">Mélange total : {masse(m.kit.total)}</span>
            {' '}· couvre jusqu'à {m.couvreM2.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m² avec la marge
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Surface à couvrir = surface à peindre + 10 % de marge d'erreur à l'application ; consommations de base à 20 °C. Le mélange
          comprend résine, pigment, catalyseur et charge.
        </p>
      </CardContent>
    </Card>
  );
}

export default function CalculSurfacePochoirs() {
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [galerie, setGalerie] = useState(true);
  const [categorie, setCategorie] = useState<CategoriePochoir | 'Tous'>('Tous');
  const champ = useRef<HTMLInputElement>(null);

  const propositions = useMemo(() => chercherPochoirs(recherche), [recherche]);
  const dansGalerie = useMemo(
    () => POCHOIRS_SURFACE.filter(p => categorie === 'Tous' || p.categorie === categorie),
    [categorie],
  );

  const ajouter = (id: string) => {
    setLignes(prev =>
      prev.some(l => l.id === id)
        ? prev.map(l => (l.id === id ? { ...l, qte: l.qte + 1 } : l))
        : [...prev, { id, taille: 0, qte: 1, l: 0, h: 0 }],
    );
    setRecherche('');
    setActif(0);
    setOuvert(false);
  };

  const maj = (id: string, patch: Partial<Ligne>) =>
    setLignes(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));

  const detail = lignes.map(l => {
    const p = POCHOIRS_SURFACE.find(x => x.id === l.id)!;
    const [w, h] = p.tailles.length ? p.tailles[Math.min(l.taille, p.tailles.length - 1)] : [l.l, l.h];
    const s = surfaceDimension(p, w, h);
    return { l, p, ...s, total: s.peinte * l.qte, totalPlaque: s.plaque * l.qte, saisieManquante: !p.tailles.length && !(l.l > 0 && l.h > 0) };
  });
  const totalPeint = detail.reduce((a, d) => a + d.total, 0);
  const totalPlaque = detail.reduce((a, d) => a + d.totalPlaque, 0);
  const totalQte = detail.reduce((a, d) => a + d.l.qte, 0);
  const nbAVerifier = detail.filter(d => d.p.note).length;

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">Surface des pochoirs</h1>
        <p className="text-sm text-muted-foreground">
          Cherchez un logo dans la liste (ou cliquez-le dans la galerie), choisissez la dimension et la quantité : la surface à peindre se calcule seule.
        </p>
      </div>

      {/* Barre de recherche → liste des logos existants */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={champ}
          value={recherche}
          placeholder={`Rechercher un logo parmi ${POCHOIRS_SURFACE.length} pochoirs : piéton, cycliste, PMR, voiture…`}
          className="pl-9 h-11"
          onChange={e => { setRecherche(e.target.value); setActif(0); setOuvert(true); }}
          onFocus={() => setOuvert(true)}
          onBlur={() => setTimeout(() => setOuvert(false), 150)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOuvert(true); setActif(a => Math.min(a + 1, propositions.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActif(a => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { const p = propositions[actif]; if (p) { e.preventDefault(); ajouter(p.id); } }
            else if (e.key === 'Escape') setOuvert(false);
          }}
        />
        {ouvert && (
          <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-96 overflow-auto rounded-md border bg-popover shadow-lg">
            {propositions.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">Aucun pochoir trouvé</div>
            ) : propositions.map((p, i) => (
              <button
                key={p.id}
                type="button"
                ref={el => { if (el && i === actif) el.scrollIntoView({ block: 'nearest' }); }}
                onMouseDown={e => { e.preventDefault(); ajouter(p.id); }}
                onMouseEnter={() => setActif(i)}
                className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', i === actif && 'bg-accent')}
              >
                <Vignette p={p} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{p.nom}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {p.categorie} · {p.tailles.length ? p.tailles.map(([l, h]) => `${l}×${h}`).join(' · ') + ' cm' : 'dimension à saisir'}
                  </span>
                </span>
                {p.note && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Galerie : sélection par l'image du pochoir */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Galerie des logos</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setGalerie(g => !g)}>
              {galerie ? <>Masquer <ChevronUp className="w-4 h-4 ml-1" /></> : <>Afficher <ChevronDown className="w-4 h-4 ml-1" /></>}
            </Button>
          </div>
        </CardHeader>
        {galerie && (
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {(['Tous', ...CATEGORIES_POCHOIRS] as const).map(c => (
                <Button key={c} size="sm" variant={categorie === c ? 'default' : 'outline'} className="h-8" onClick={() => setCategorie(c)}>
                  {c}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-96 overflow-auto pr-1">
              {dansGalerie.map(p => {
                const choisi = lignes.some(l => l.id === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => ajouter(p.id)}
                    title={p.nom}
                    className={cn('flex flex-col items-center gap-1 rounded-md border p-1.5 text-center hover:bg-accent', choisi && 'ring-2 ring-primary')}
                  >
                    <Vignette p={p} className="w-full h-auto aspect-square" />
                    <span className="text-[11px] leading-tight line-clamp-2">{p.nom.replace(/^Pochoir /, '')}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Pochoirs sélectionnés</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {detail.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun pochoir — utilisez la recherche ou la galerie ci-dessus.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                  <th className="py-2 pr-2">Logo</th>
                  <th className="py-2 pr-2">Dimension</th>
                  <th className="py-2 pr-2 text-right">Qté</th>
                  <th className="py-2 pr-2 text-right">Plaque (m²)</th>
                  <th className="py-2 pr-2 text-right">À peindre / u. (m²)</th>
                  <th className="py-2 pr-2 text-right">Total à peindre (m²)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {detail.map(({ l, p, plaque, peinte, total, saisieManquante }) => (
                  <tr key={l.id} className="border-b last:border-0 align-middle">
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <Vignette p={p} />
                        <div>
                          <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">
                            {p.nom}<ExternalLink className="w-3 h-3 opacity-50" />
                          </a>
                          {p.note && (
                            <div className="flex items-start gap-1 text-xs text-amber-600 max-w-xs">
                              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{p.note}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      {p.tailles.length ? (
                        <select
                          value={l.taille}
                          onChange={e => maj(l.id, { taille: Number(e.target.value) })}
                          className="h-9 rounded-md border bg-background px-2 text-sm"
                        >
                          {p.tailles.map(([w, h], k) => <option key={k} value={k}>{w} × {h} cm</option>)}
                        </select>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Input type="number" min={0} step="any" placeholder="l" value={l.l || ''} onChange={e => maj(l.id, { l: Number(e.target.value) || 0 })} className="h-9 w-16" />
                          <span>×</span>
                          <Input type="number" min={0} step="any" placeholder="h" value={l.h || ''} onChange={e => maj(l.id, { h: Number(e.target.value) || 0 })} className="h-9 w-16" />
                          <span className="text-xs text-muted-foreground">cm</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <Input
                        type="number" min={1} step={1} value={l.qte}
                        onChange={e => maj(l.id, { qte: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="h-9 w-20 ml-auto text-right"
                      />
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{saisieManquante ? '—' : fmt(plaque)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{saisieManquante ? '—' : fmt(peinte)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums font-semibold">{saisieManquante ? '—' : fmt(total)}</td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon" title="Retirer" onClick={() => setLignes(prev => prev.filter(x => x.id !== l.id))}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold bg-muted/50">
                  <td className="py-2 pr-2" colSpan={2}>Total ({totalQte} pochoir{totalQte > 1 ? 's' : ''})</td>
                  <td />
                  <td className="py-2 pr-2 text-right tabular-nums">{fmt(totalPlaque)}</td>
                  <td />
                  <td className="py-2 pr-2 text-right tabular-nums">{fmt(totalPeint)} m²</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
          {nbAVerifier > 0 && (
            <p className="mt-2 text-xs text-amber-600">
              {nbAVerifier} pochoir{nbAVerifier > 1 ? 's' : ''} de la sélection porte{nbAVerifier > 1 ? 'nt' : ''} un point à vérifier : le total est à confirmer avant chiffrage.
            </p>
          )}
        </CardContent>
      </Card>

      {detail.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/60 p-4 text-center">
                <div className="text-3xl font-bold text-primary tabular-nums">{fmt(totalPlaque)}</div>
                <div className="text-sm text-muted-foreground">m² de plaque · {totalQte} pochoir{totalQte > 1 ? 's' : ''}</div>
              </div>
              <div className="rounded-lg bg-primary/10 p-4 text-center">
                <div className="text-3xl font-bold text-primary tabular-nums">{fmt(totalPeint)}</div>
                <div className="text-sm text-muted-foreground">m² à peindre</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Zone à peindre = surface de la plaque × part ajourée du dessin (poignées de préhension exclues). Part ajourée mesurée sur la
              vignette du pochoir : précision de quelques %. Prévoir une marge pour le gaspillage.
            </p>
          </CardContent>
        </Card>
      )}

      {totalPeint > 0 && <CarteMelange surface={totalPeint} />}

      <p className="text-xs text-muted-foreground">
        Dimensions : fiches produits virages.com (dimensions de la marque). Surface à peindre = plaque × part ajourée du dessin,
        mesurée sur l'image du pochoir — estimation à quelques % près.
      </p>
    </div>
  );
}
