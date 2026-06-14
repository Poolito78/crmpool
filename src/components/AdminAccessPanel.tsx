import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ShieldCheck, RefreshCw, ExternalLink } from 'lucide-react';

type Row = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  crm_active?: boolean | null;
  crm_access: boolean | null;
  crm_achat_access?: boolean | null;
};

type AccessField = 'crm_active' | 'crm_access' | 'crm_achat_access';

// Panneau admin natif : gère les droits crmpool par utilisateur (table partagée
// veille_roles). Réservé aux administrateurs (role = 'admin').
export default function AdminAccessPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    // select('*') : indépendant des migrations (crm_achat_access peut être absent).
    const { data, error } = await supabase.from('veille_roles').select('*');
    if (error) {
      toast.error('Lecture impossible : ' + error.message);
      setRows([]);
    } else {
      const list = (data as Row[]) || [];
      list.sort((a, b) => (a.email || a.display_name || '').localeCompare(b.email || b.display_name || ''));
      setRows(list);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggle(r: Row, field: AccessField, value: boolean) {
    setSavingId(r.user_id);
    setRows(prev => prev.map(x => x.user_id === r.user_id ? { ...x, [field]: value } : x));
    // cast : crm_achat_access peut ne pas encore figurer dans les types générés.
    const { error } = await supabase.from('veille_roles').update({ [field]: value } as never).eq('user_id', r.user_id);
    setSavingId(null);
    if (error) {
      toast.error('Échec de l\'enregistrement : ' + error.message);
      load(); // resynchronise en cas d'erreur (ex. colonne manquante ou RLS)
    } else {
      toast.success('Droits mis à jour');
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> Droits des utilisateurs
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cochez les droits accordés à chaque utilisateur. « Compte actif » conditionne l'accès
          à l'application ; « Accès CRM » ouvre la page CRM ; « Accès Achat » le périmètre achats.
          Les administrateurs ont tous les droits.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={load} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualiser
          </button>
          <a href="https://veille-alpha.vercel.app" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> App Veille
          </a>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Aucun utilisateur visible. Vérifiez que votre compte est administrateur et que la
          policy RLS autorise la lecture de <code>veille_roles</code>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-left">
                <th className="py-2 pr-3 font-medium">Utilisateur</th>
                <th className="py-2 px-3 font-medium">Rôle</th>
                <th className="py-2 px-3 font-medium text-center">Compte actif</th>
                <th className="py-2 px-3 font-medium text-center">Accès CRM</th>
                <th className="py-2 pl-3 font-medium text-center">Accès Achat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isAdminRow = r.role === 'admin';
                const saving = savingId === r.user_id;
                return (
                  <tr key={r.user_id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 pr-3">
                      <p className="font-medium">{r.display_name || r.email || '—'}</p>
                      {r.display_name && r.email && <p className="text-xs text-muted-foreground">{r.email}</p>}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${isAdminRow ? 'bg-primary/10 text-primary font-medium' : 'bg-muted text-muted-foreground'}`}>
                        {r.role || 'membre'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {isAdminRow ? (
                        <span className="text-xs text-muted-foreground">tous droits</span>
                      ) : (
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-input accent-primary cursor-pointer disabled:opacity-50"
                          checked={!!r.crm_active}
                          disabled={saving}
                          onChange={e => toggle(r, 'crm_active', e.target.checked)}
                        />
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {isAdminRow ? (
                        <span className="text-xs text-muted-foreground">tous droits</span>
                      ) : (
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-input accent-primary cursor-pointer disabled:opacity-50"
                          checked={!!r.crm_access}
                          disabled={saving || !r.crm_active}
                          title={!r.crm_active ? 'Activez d\'abord le compte' : undefined}
                          onChange={e => toggle(r, 'crm_access', e.target.checked)}
                        />
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-center">
                      {isAdminRow ? (
                        <span className="text-xs text-muted-foreground">tous droits</span>
                      ) : (
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-input accent-primary cursor-pointer disabled:opacity-50"
                          checked={!!r.crm_achat_access}
                          disabled={saving || !r.crm_active}
                          title={!r.crm_active ? 'Activez d\'abord le compte' : undefined}
                          onChange={e => toggle(r, 'crm_achat_access', e.target.checked)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
