/**
 * Paramètres → Sociétés (administrateur).
 *
 * Identité légale de chaque société (elle fait le pied de page et l'émetteur
 * des factures), série de numéros, lien Odoo, marques et leurs logos, et
 * rattachement des utilisateurs : un compte non administrateur ne voit que
 * les documents de SA société.
 *
 * On n'invente rien : un champ vide reste vide, et l'émission d'une facture
 * le signale. Les identifiants sont contrôlés à la saisie (clé de Luhn, clé
 * de TVA) — un contrôle qui avertit, sans empêcher d'enregistrer.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Plus, Trash2, Upload, Save, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSocietes } from '@/hooks/useSocietes';
import { logoDe, type Societe, type Marque } from '@/lib/societes';
import { sirenValide, siretValide, tvaIntraFrValide, chiffres } from '@/lib/factureConforme';

type Champ = keyof Pick<Societe, 'raisonSociale' | 'formeJuridique' | 'capital' | 'adresse' | 'codePostal' | 'ville' | 'siren' | 'siret' | 'rcs' | 'ape' | 'tvaIntra' | 'email' | 'telephone' | 'fax' | 'siteWeb' | 'prefixe'>;

const CHAMPS: { k: Champ; label: string; large?: boolean }[] = [
  { k: 'raisonSociale', label: 'Raison sociale' },
  { k: 'formeJuridique', label: 'Forme juridique' },
  { k: 'capital', label: 'Capital' },
  { k: 'adresse', label: 'Adresse', large: true },
  { k: 'codePostal', label: 'Code postal' },
  { k: 'ville', label: 'Ville' },
  { k: 'siren', label: 'SIREN' },
  { k: 'siret', label: 'SIRET (siège)' },
  { k: 'tvaIntra', label: 'N° TVA intracommunautaire' },
  { k: 'rcs', label: 'RCS (ex. RCS Chalon-sur-Saône 494922313)', large: true },
  { k: 'ape', label: 'Code APE' },
  { k: 'telephone', label: 'Téléphone' },
  { k: 'fax', label: 'Fax' },
  { k: 'email', label: 'E-mail' },
  { k: 'siteWeb', label: 'Site web' },
  { k: 'prefixe', label: 'Préfixe des numéros (vide = DEV-2026-…)' },
];

function alerteIdentifiant(k: Champ, v: string | undefined): string | null {
  if (!v) return null;
  if (k === 'siren' && !sirenValide(chiffres(v))) return 'SIREN invalide (9 chiffres, clé de Luhn)';
  if (k === 'siret' && !siretValide(chiffres(v))) return `SIRET invalide (${chiffres(v).length} chiffres sur 14, ou clé fausse)`;
  if (k === 'tvaIntra' && v.toUpperCase().startsWith('FR') && !tvaIntraFrValide(v)) return 'N° de TVA invalide (clé ou SIREN)';
  return null;
}

interface Utilisateur { user_id: string; email: string | null; display_name: string | null; role: string | null }

export default function SocietesPanel() {
  const { societes, enregistrer, recharger } = useSocietes();
  const [brouillons, setBrouillons] = useState<Record<string, Societe>>({});
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [rattachements, setRattachements] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState<string | null>(null);

  useEffect(() => {
    setBrouillons(Object.fromEntries(societes.map(s => [s.id, structuredClone(s)])));
  }, [societes]);

  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.from('veille_roles').select('user_id, email, display_name, role');
      setUtilisateurs(((u as Utilisateur[]) || []).sort((a, b) => (a.email || '').localeCompare(b.email || '')));
      const { data: r } = await supabase.from('utilisateur_societes' as never).select('user_id, societe_id');
      setRattachements(Object.fromEntries(((r as { user_id: string; societe_id: string }[]) || []).map(x => [x.user_id, x.societe_id])));
    })();
  }, []);

  const maj = (id: string, f: (s: Societe) => Societe) => setBrouillons(b => ({ ...b, [id]: f(b[id]) }));

  async function sauver(id: string) {
    const s = brouillons[id];
    if (!s.raisonSociale.trim()) { toast.error('Raison sociale obligatoire'); return; }
    const autre = societes.find(x => x.id !== id && (x.prefixe || '') === (s.prefixe || '').trim().toUpperCase());
    if (autre) { toast.error(`Préfixe déjà pris par ${autre.raisonSociale} : deux sociétés ne partagent pas une série.`); return; }
    if (await enregistrer(s)) toast.success(`${s.raisonSociale} enregistrée`);
    else toast.error('Enregistrement refusé (droits administrateur ?)');
  }

  async function nouvelle() {
    const code = window.prompt('Code de la nouvelle société (ex. ISOMARK SAS) :')?.trim().toUpperCase();
    if (!code) return;
    if (societes.some(s => s.code === code)) { toast.error('Ce code existe déjà'); return; }
    const prefixe = window.prompt('Préfixe de ses numéros (3 lettres, ex. ISM) :')?.trim().toUpperCase() || '';
    if (!prefixe) { toast.error('Un préfixe est nécessaire : sans lui la série se confondrait avec celle d\'ISOSIGN.'); return; }
    const s: Societe = {
      id: crypto.randomUUID(), code, raisonSociale: code, pays: 'FR', prefixe, odoo: false,
      marques: [{ nom: code }], marqueDefaut: code, actif: true, ordre: societes.length + 1,
    };
    if (await enregistrer(s)) { toast.success(`${code} créée — à compléter`); setOuverte(s.id); }
  }

  async function envoyerLogo(id: string, i: number, file: File) {
    const s = brouillons[id];
    const m = s.marques[i];
    setEnvoi(`${id}:${i}`);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const chemin = `${s.code}/${m.nom.replace(/[^A-Z0-9_-]/gi, '_')}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('societes-logos').upload(chemin, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const url = supabase.storage.from('societes-logos').getPublicUrl(chemin).data.publicUrl;
      const suivante = { ...s, marques: s.marques.map((x, j) => j === i ? { ...x, logoUrl: url } : x) };
      maj(id, () => suivante);
      if (await enregistrer(suivante)) toast.success(`Logo ${m.nom} enregistré`);
    } catch (e) {
      toast.error('Envoi du logo impossible', { description: (e as { message?: string })?.message });
    } finally {
      setEnvoi(null);
    }
  }

  async function rattacher(userId: string, societeId: string) {
    setRattachements(r => ({ ...r, [userId]: societeId }));
    const { error } = await supabase.from('utilisateur_societes' as never)
      .upsert({ user_id: userId, societe_id: societeId } as never);
    if (error) toast.error('Rattachement refusé : ' + error.message);
    else toast.success('Société de l\'utilisateur mise à jour');
  }

  if (societes.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-5 text-sm text-muted-foreground">
        La table des sociétés n'est pas encore en base : appliquer la migration
        <code className="mx-1">20261017140000_multi_societe.sql</code> dans le SQL Editor de Supabase, puis
        <button onClick={() => void recharger()} className="ml-1 underline">recharger</button>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading font-semibold text-lg flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" /> Sociétés</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Chaque société émet ses devis, commandes et factures : son identité fait le pied de page et l'émetteur
              des factures, son préfixe ses séries de numéros. Ses marques ne changent que le logo imprimé.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={nouvelle}><Plus className="w-4 h-4 mr-1" />Société</Button>
        </div>

        {societes.map(orig => {
          const s = brouillons[orig.id];
          if (!s) return null;
          const open = ouverte === s.id;
          return (
            <div key={s.id} className="rounded-lg border border-border">
              <button className="w-full flex items-center justify-between px-4 py-3 text-left" onClick={() => setOuverte(open ? null : s.id)}>
                <span className="font-medium">{s.raisonSociale}
                  <span className="ml-2 text-xs text-muted-foreground">{s.prefixe ? `${s.prefixe}-DEV-…` : 'DEV-…'} · {s.marques.map(m => m.nom).join(', ') || 'aucune marque'}{s.odoo ? ' · Odoo' : ''}{!s.actif ? ' · inactive' : ''}</span>
                </span>
                {(!s.siren || !s.tvaIntra || !s.adresse) && <span className="text-[11px] text-amber-700 dark:text-amber-400">identité à compléter</span>}
              </button>
              {open && (
                <div className="border-t border-border p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CHAMPS.map(({ k, label, large }) => {
                      const alerte = alerteIdentifiant(k, s[k] as string | undefined);
                      return (
                        <div key={k} className={large ? 'sm:col-span-2' : ''}>
                          <Label className="text-xs">{label}</Label>
                          <Input value={(s[k] as string) || ''} onChange={e => maj(s.id, x => ({ ...x, [k]: e.target.value }))} />
                          {alerte && <p className="text-[11px] text-destructive mt-0.5">{alerte}</p>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={s.odoo} onChange={e => maj(s.id, x => ({ ...x, odoo: e.target.checked }))} />Devis envoyés vers Odoo</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={s.actif} onChange={e => maj(s.id, x => ({ ...x, actif: e.target.checked }))} />Active</label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Marques et logos</Label>
                      <button className="text-xs text-primary inline-flex items-center gap-1" onClick={() => {
                        const nom = window.prompt('Nom de la marque :')?.trim().toUpperCase();
                        if (nom && !s.marques.some(m => m.nom === nom)) maj(s.id, x => ({ ...x, marques: [...x.marques, { nom }] }));
                      }}><Plus className="w-3 h-3" />Marque</button>
                    </div>
                    {s.marques.map((m: Marque, i) => {
                      const logo = logoDe(s, m.nom);
                      return (
                        <div key={m.nom} className="flex flex-wrap items-center gap-2 rounded border border-border p-2">
                          <div className="w-28 h-10 flex items-center justify-center bg-white rounded border border-border/50">
                            {logo ? <img src={logo} alt={m.nom} className="max-h-8 max-w-[6.5rem] object-contain" /> : <span className="text-[10px] text-muted-foreground">sans logo</span>}
                          </div>
                          <span className="font-medium text-sm w-24">{m.nom}</span>
                          <Input className="h-8 w-48 text-xs" placeholder="E-mail de contact (en-tête)" value={m.email || ''}
                            onChange={e => maj(s.id, x => ({ ...x, marques: x.marques.map((y, j) => j === i ? { ...y, email: e.target.value || undefined } : y) }))} />
                          <label className="text-xs inline-flex items-center gap-1 cursor-pointer text-primary">
                            <Upload className="w-3.5 h-3.5" />{envoi === `${s.id}:${i}` ? 'Envoi…' : 'Logo'}
                            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) void envoyerLogo(s.id, i, f); e.target.value = ''; }} />
                          </label>
                          <label className="text-xs inline-flex items-center gap-1">
                            <input type="radio" name={`defaut-${s.id}`} checked={(s.marqueDefaut || s.marques[0]?.nom) === m.nom}
                              onChange={() => maj(s.id, x => ({ ...x, marqueDefaut: m.nom }))} />par défaut
                          </label>
                          <button className="ml-auto text-muted-foreground hover:text-destructive" title="Retirer la marque"
                            onClick={() => maj(s.id, x => ({ ...x, marques: x.marques.filter((_, j) => j !== i) }))}><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => void sauver(s.id)}><Save className="w-4 h-4 mr-1" />Enregistrer {s.raisonSociale}</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-card rounded-xl border border-border p-5 space-y-3">
        <h2 className="font-heading font-semibold text-lg flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> Société de chaque utilisateur</h2>
        <p className="text-sm text-muted-foreground">
          Un compte ne voit et ne crée que les documents de sa société. Les administrateurs voient toutes les
          sociétés et choisissent la société active dans l'en-tête. Sans choix ici : ISOSIGN.
        </p>
        <table className="w-full text-sm">
          <tbody>
            {utilisateurs.map(u => (
              <tr key={u.user_id} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-3">{u.display_name || u.email}<div className="text-xs text-muted-foreground">{u.email}</div></td>
                <td className="py-2">
                  {u.role === 'admin'
                    ? <span className="text-xs text-muted-foreground">Administrateur — toutes les sociétés</span>
                    : (
                      <div className="flex flex-wrap gap-1">
                        {societes.filter(s => s.actif).map(s => {
                          const choisie = (rattachements[u.user_id] || societes.find(x => x.code === 'ISOSIGN')?.id) === s.id;
                          return (
                            <button key={s.id} onClick={() => void rattacher(u.user_id, s.id)}
                              className={`px-2 py-0.5 rounded text-xs border ${choisie ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'}`}>
                              {s.raisonSociale}
                            </button>
                          );
                        })}
                      </div>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
