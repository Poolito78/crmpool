/**
 * Tarif en ligne ISOFLOOR — `/tarif`, page PUBLIQUE (hors gardes de session).
 *
 * Un client dont la fiche porte « Accès à son tarif » se connecte avec son
 * e-mail et le mot de passe que l'admin lui a transmis, consulte les articles
 * cochés « Catalogue » À SES PRIX et les télécharge en PDF. Sans accès, il
 * peut en demander un (formulaire → `tarif_demandes`, traité dans
 * Paramètres → Administration).
 *
 * ⚠️ Rien n'est lu en base depuis cette page : tout passe par la fonction
 * `tarif-catalogue`, seule à connaître les prix. Le client du tarif n'a PAS
 * de compte Supabase (voir l'en-tête de la fonction : `produits` est ouvert à
 * tout compte authentifié).
 *
 * L'admin connecté à MonCRM dans ce navigateur voit en plus une barre
 * d'aperçu : tarif public, ou celui de n'importe quel client (`?client=`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { Download, ExternalLink, LogOut, Search } from 'lucide-react';
import logoIsofloor from '@/assets/logo-isofloor.png';

interface LigneTarif {
  reference: string;
  designation: string;
  categorie: string;
  unite: string;
  poids: number | null;
  prixPublic: number | null;
  prix: number | null;
  remise: number;
  ficheUrl: string | null;
}
interface ReponseTarif {
  client: { societe: string } | null;
  admin: boolean;
  date: string;
  lignes: LigneTarif[];
}

const CLE_JETON = 'tarif_isofloor_jeton';
const ROUGE = '#E8392A';
const NAVY = '#0F2744';

async function appel<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tarif-catalogue', { body });
  if (error) {
    let msg = 'Service indisponible, réessayez plus tard.';
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.erreur) msg = j.erreur;
    } catch { /* corps illisible : message générique */ }
    throw new Error(msg);
  }
  return data as T;
}

const eur = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

function conditionnement(l: LigneTarif) {
  const kg = l.poids && l.poids > 0 ? `${l.poids.toLocaleString('fr-FR')} kg` : '';
  return [l.unite, kg].filter(Boolean).join(' · ');
}

function libelleCategorie(c: string) {
  const dernier = c.split('/').pop()?.trim();
  return dernier || 'Autres';
}

/* ── PDF ──────────────────────────────────────────────────────────────── */
async function chargerImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

async function telechargerPdf(t: ReponseTarif) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 210, M = 12;
  const date = new Date(t.date).toLocaleDateString('fr-FR');
  const societe = t.client?.societe || 'Tarif public';
  const logo = await chargerImage(logoIsofloor);
  const avecRemise = t.lignes.some(l => l.remise > 0);
  /* Réf | Désignation | Cond. | Public HT | Votre prix HT */
  const cols = avecRemise ? [30, 84, 26, 22, 24] : [32, 104, 28, 0, 24];
  const xs = cols.reduce<number[]>((a, w, i) => [...a, i ? a[i - 1] + cols[i - 1] : M], []);

  let page = 0;
  const entete = () => {
    page++;
    doc.setFillColor(15, 39, 68);
    doc.rect(0, 0, L, 22, 'F');
    if (logo) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(M - 1, 4, 46, 14, 2, 2, 'F');
      doc.addImage(logo, 'PNG', M + 1, 5.6, 42, 42 * logo.height / logo.width);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`Tarif ${new Date(t.date).getFullYear()} — ${societe}`, L - M, 11, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Prix HT au ${date}`, L - M, 16.5, { align: 'right' });
    const y = 30;
    doc.setFillColor(241, 245, 249);
    doc.rect(M, y - 4.5, L - 2 * M, 7, 'F');
    doc.setTextColor(15, 39, 68);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const titres = ['Référence', 'Désignation', 'Cond.', 'Public HT', avecRemise ? 'Votre prix HT' : 'Prix HT'];
    titres.forEach((h, i) => {
      if (!cols[i]) return;
      const droite = i >= 3;
      doc.text(h, droite ? xs[i] + cols[i] - 1.5 : xs[i] + 1.5, y, { align: droite ? 'right' : 'left' });
    });
    return y + 6;
  };
  const pied = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('ISOFLOOR — www.isofloor.fr — Prix HT, TVA 20 % en sus. Franco de port 2 tonnes (hors granulats).', M, 290);
    doc.text(`Page ${page}`, L - M, 290, { align: 'right' });
  };

  let y = entete();
  let cat = '';
  for (const l of t.lignes) {
    const c = libelleCategorie(l.categorie);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const des = doc.splitTextToSize(l.designation, cols[1] - 3) as string[];
    const h = Math.max(1, des.length) * 3.6 + 2.4;
    if (y + h + (c !== cat ? 8 : 0) > 280) { pied(); doc.addPage(); y = entete(); cat = ''; }
    if (c !== cat) {
      cat = c;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(232, 57, 42);
      doc.text(c.toUpperCase(), M + 1.5, y + 4);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }
    doc.setTextColor(30, 41, 59);
    doc.text(l.reference, xs[0] + 1.5, y + 3.4);
    doc.text(des, xs[1] + 1.5, y + 3.4);
    doc.text(conditionnement(l), xs[2] + 1.5, y + 3.4);
    if (cols[3]) {
      doc.setTextColor(100, 116, 139);
      doc.text(eur(l.prixPublic), xs[3] + cols[3] - 1.5, y + 3.4, { align: 'right' });
    }
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 39, 68);
    doc.text(eur(l.prix), xs[4] + cols[4] - 1.5, y + 3.4, { align: 'right' });
    y += h;
    doc.setDrawColor(226, 232, 240);
    doc.line(M, y - 0.6, L - M, y - 0.6);
  }
  pied();
  const nom = societe.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
  doc.save(`Tarif_ISOFLOOR_${nom}_${new Date(t.date).toISOString().slice(0, 10)}.pdf`);
}

/* ── page ─────────────────────────────────────────────────────────────── */
export default function TarifEnLigne() {
  const [params, setParams] = useSearchParams();
  const [jeton, setJeton] = useState<string | null>(() => {
    try { return sessionStorage.getItem(CLE_JETON); } catch { return null; }
  });
  const [vue, setVue] = useState<'login' | 'demande'>('login');
  const [tarif, setTarif] = useState<ReponseTarif | null>(null);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState('');
  const [estAdmin, setEstAdmin] = useState(false);
  const [clientsAcces, setClientsAcces] = useState<{ id: string; nom: string }[]>([]);
  const clientApercu = params.get('client') || '';

  const charger = useCallback(async () => {
    setCharge(true);
    setErreur('');
    try {
      if (jeton) {
        setTarif(await appel<ReponseTarif>({ action: 'tarif', jeton }));
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const t = await appel<ReponseTarif>({ action: 'tarif', client_id: clientApercu || undefined });
          setTarif(t);
          setEstAdmin(t.admin);
          return;
        } catch { /* session CRM sans droit admin : écran de connexion du tarif */ }
      }
      setTarif(null);
    } catch (e) {
      if (jeton) {
        try { sessionStorage.removeItem(CLE_JETON); } catch { /* stockage indisponible */ }
        setJeton(null);
      }
      setErreur((e as Error).message);
      setTarif(null);
    } finally {
      setCharge(false);
    }
  }, [jeton, clientApercu]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (!estAdmin) return;
    supabase.from('clients').select('id, societe, nom').eq('acces_tarif', true).order('societe')
      .then(({ data }) => setClientsAcces((data || []).map(c => ({ id: c.id, nom: c.societe || c.nom }))));
  }, [estAdmin]);

  const deconnexion = () => {
    try { sessionStorage.removeItem(CLE_JETON); } catch { /* stockage indisponible */ }
    setJeton(null);
    setTarif(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header style={{ background: NAVY }} className="px-4 sm:px-8 py-3 flex items-center justify-between gap-3">
        <a href="https://www.isofloor.fr" className="bg-white rounded-md px-3 py-1.5 shrink-0">
          <img src={logoIsofloor} alt="ISOFLOOR" className="h-7 w-auto" />
        </a>
        <span className="text-white/80 text-sm font-medium hidden sm:block">Tarif professionnel</span>
        {jeton && tarif && (
          <button onClick={deconnexion} className="text-white/80 hover:text-white text-sm flex items-center gap-1.5">
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        )}
      </header>

      {estAdmin && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-8 py-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-amber-800">Aperçu admin :</span>
          <select
            value={clientApercu}
            onChange={e => setParams(e.target.value ? { client: e.target.value } : {})}
            className="border border-amber-300 rounded px-2 py-1 bg-white max-w-full"
          >
            <option value="">Tarif public</option>
            {clientApercu && !clientsAcces.some(c => c.id === clientApercu) && (
              <option value={clientApercu}>{tarif?.client?.societe || 'Client sélectionné'} (sans accès)</option>
            )}
            {clientsAcces.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          <span className="text-amber-700 text-xs">{clientsAcces.length} client(s) avec accès</span>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
        {charge ? (
          <div className="flex justify-center py-24">
            <div className="animate-spin w-8 h-8 border-4 border-t-transparent rounded-full" style={{ borderColor: ROUGE, borderTopColor: 'transparent' }} />
          </div>
        ) : tarif ? (
          <VueTarif tarif={tarif} />
        ) : vue === 'login' ? (
          <Connexion
            erreurInitiale={erreur}
            onConnecte={j => {
              try { sessionStorage.setItem(CLE_JETON, j); } catch { /* jeton gardé en mémoire seulement */ }
              setJeton(j);
            }}
            onDemande={() => setVue('demande')}
          />
        ) : (
          <Demande onRetour={() => setVue('login')} />
        )}
      </main>
    </div>
  );
}

function Carte({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="max-w-md mx-auto bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">
      <h1 className="text-xl font-bold mb-1" style={{ color: NAVY }}>{titre}</h1>
      {children}
    </div>
  );
}

const champ = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400';
const bouton = 'w-full rounded-lg py-2.5 text-white font-semibold text-sm disabled:opacity-60';

function Connexion({ erreurInitiale, onConnecte, onDemande }: {
  erreurInitiale: string; onConnecte: (jeton: string) => void; onDemande: () => void;
}) {
  const [identifiant, setIdentifiant] = useState('');
  const [mdp, setMdp] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(erreurInitiale);

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      const r = await appel<{ jeton: string }>({ action: 'login', identifiant, mdp });
      onConnecte(r.jeton);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Carte titre="Accès au tarif professionnel">
      <p className="text-sm text-slate-500 mb-6">Réservé aux clients ISOFLOOR. Connectez-vous avec l'e-mail et le mot de passe transmis par votre commercial.</p>
      <form onSubmit={valider} className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">E-mail</label>
          <input type="email" required autoComplete="username" value={identifiant} onChange={e => setIdentifiant(e.target.value)} className={champ} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">Mot de passe</label>
          <input type="password" required autoComplete="current-password" value={mdp} onChange={e => setMdp(e.target.value)} className={champ} />
        </div>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <button type="submit" disabled={envoi} className={bouton} style={{ background: ROUGE }}>
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <div className="border-t border-slate-200 mt-6 pt-5 text-center">
        <p className="text-sm text-slate-500 mb-2">Pas encore d'accès ?</p>
        <button onClick={onDemande} className="text-sm font-semibold underline" style={{ color: NAVY }}>Demander un accès au tarif</button>
      </div>
    </Carte>
  );
}

function Demande({ onRetour }: { onRetour: () => void }) {
  const [f, setF] = useState({ entreprise: '', nom: '', email: '', telephone: '', siret: '', ville: '', message: '', site_web: '' });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [ok, setOk] = useState(false);
  const maj = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }));

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      await appel({ action: 'demande', ...f });
      setOk(true);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  if (ok) {
    return (
      <Carte titre="Demande envoyée">
        <p className="text-sm text-slate-600 mt-2 mb-6">Merci. Votre demande d'accès au tarif ISOFLOOR a bien été reçue ; votre commercial vous recontacte avec vos identifiants.</p>
        <button onClick={onRetour} className={bouton} style={{ background: NAVY }}>Retour à la connexion</button>
      </Carte>
    );
  }

  return (
    <Carte titre="Demande d'accès au tarif">
      <p className="text-sm text-slate-500 mb-6">Professionnel du revêtement de sol ? Remplissez ce formulaire, nous vous ouvrons un accès à vos prix.</p>
      <form onSubmit={valider} className="space-y-3">
        {([
          ['entreprise', 'Entreprise *', 'text', true, 'organization'],
          ['nom', 'Nom et prénom *', 'text', true, 'name'],
          ['email', 'E-mail professionnel *', 'email', true, 'email'],
          ['telephone', 'Téléphone', 'tel', false, 'tel'],
          ['siret', 'SIRET', 'text', false, 'off'],
          ['ville', 'Ville', 'text', false, 'address-level2'],
        ] as const).map(([k, label, type, requis, auto]) => (
          <div key={k}>
            <label className="text-xs font-semibold text-slate-600 block mb-1">{label}</label>
            <input type={type} required={requis} autoComplete={auto} value={f[k]} onChange={maj(k)} className={champ} />
          </div>
        ))}
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">Message</label>
          <textarea rows={3} value={f.message} onChange={maj('message')} className={champ} placeholder="Votre activité, vos besoins…" />
        </div>
        {/* Pot de miel : invisible pour un humain, rempli par les robots. */}
        <input type="text" tabIndex={-1} autoComplete="off" value={f.site_web} onChange={maj('site_web')} className="hidden" aria-hidden="true" />
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <button type="submit" disabled={envoi} className={bouton} style={{ background: ROUGE }}>
          {envoi ? 'Envoi…' : 'Envoyer ma demande'}
        </button>
      </form>
      <button onClick={onRetour} className="w-full text-center text-sm text-slate-500 mt-4 underline">J'ai déjà un accès</button>
    </Carte>
  );
}

function VueTarif({ tarif }: { tarif: ReponseTarif }) {
  const [q, setQ] = useState('');
  const [pdf, setPdf] = useState(false);
  const avecRemise = tarif.lignes.some(l => l.remise > 0);

  const groupes = useMemo(() => {
    const s = q.trim().toLowerCase();
    const m = new Map<string, LigneTarif[]>();
    for (const l of tarif.lignes) {
      if (s && !`${l.reference} ${l.designation} ${l.categorie}`.toLowerCase().includes(s)) continue;
      const c = libelleCategorie(l.categorie);
      m.set(c, [...(m.get(c) || []), l]);
    }
    return [...m.entries()];
  }, [tarif, q]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Tarif {new Date(tarif.date).getFullYear()}{tarif.client ? ` — ${tarif.client.societe}` : ' public'}
          </h1>
          <p className="text-sm text-slate-500">Prix HT au {new Date(tarif.date).toLocaleDateString('fr-FR')} · {tarif.lignes.length} articles</p>
        </div>
        <button
          onClick={async () => { setPdf(true); try { await telechargerPdf(tarif); } finally { setPdf(false); } }}
          disabled={pdf || !tarif.lignes.length}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-white font-semibold text-sm disabled:opacity-60"
          style={{ background: ROUGE }}
        >
          <Download className="w-4 h-4" /> {pdf ? 'Préparation…' : 'Télécharger le PDF'}
        </button>
      </div>

      <div className="relative mb-6">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une référence, un produit…" className={`${champ} pl-9 bg-white`} />
      </div>

      {groupes.length === 0 && <p className="text-center text-slate-500 py-12">Aucun article.</p>}

      {groupes.map(([cat, lignes]) => (
        <section key={cat} className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: ROUGE }}>{cat}</h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Référence</th>
                  <th className="text-left font-semibold px-3 py-2">Désignation</th>
                  <th className="text-left font-semibold px-3 py-2">Cond.</th>
                  {avecRemise && <th className="text-right font-semibold px-3 py-2">Public HT</th>}
                  <th className="text-right font-semibold px-3 py-2">{avecRemise ? 'Votre prix HT' : 'Prix HT'}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map(l => (
                  <tr key={l.reference} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{l.reference}</td>
                    <td className="px-3 py-2">
                      {l.designation}
                      {l.ficheUrl && (
                        <a href={l.ficheUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 ml-2 text-xs underline text-slate-500">
                          fiche <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{conditionnement(l)}</td>
                    {avecRemise && (
                      <td className="px-3 py-2 text-right text-slate-400 whitespace-nowrap">
                        {l.remise > 0 ? <s>{eur(l.prixPublic)}</s> : eur(l.prixPublic)}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: NAVY }}>
                      {eur(l.prix)}
                      {l.remise > 0 && <span className="ml-1.5 text-xs font-medium text-emerald-600">−{l.remise.toLocaleString('fr-FR')} %</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="text-xs text-slate-400 mt-8">Prix HT, TVA 20 % en sus. Franco de port 2 tonnes (hors granulats). Tarif susceptible d'évoluer : la version en ligne fait foi.</p>
    </div>
  );
}
