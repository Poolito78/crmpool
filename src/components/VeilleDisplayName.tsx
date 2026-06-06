import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { formatCreateur, setCreatorName } from '@/lib/concurrents';
import { supabase } from '@/integrations/supabase/client';

// Éditeur du nom d'affichage de l'utilisateur courant pour la Veille Concurrence.
// Persiste dans localStorage (crm_creator_names) + veille_roles.display_name.
// Affiché dans Paramètres → Veille Concurrence.
export default function VeilleDisplayName() {
  const [myEmail, setMyEmail] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setMyEmail(session.user.email);
        setName(formatCreateur(session.user.email));
      }
    });
  }, []);

  async function save() {
    const v = name.trim();
    if (!myEmail || !v) return;
    setSaving(true);
    setCreatorName(myEmail, v);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.id) {
      await supabase.from('veille_roles').update({ display_name: v }).eq('user_id', session.user.id);
    }
    setSaving(false);
    toast.success(`Nom d'affichage mis à jour : ${v}`);
  }

  if (!myEmail) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Mon nom d'affichage</p>
      <p className="text-xs text-muted-foreground mb-2">
        Nom associé à vos saisies (colonne « Saisi par ») à la place de votre e-mail <span className="font-mono">{myEmail}</span>.
      </p>
      <div className="flex items-center gap-2 max-w-sm">
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
          placeholder="Ex : FM"
          className="h-9"
        />
        <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
