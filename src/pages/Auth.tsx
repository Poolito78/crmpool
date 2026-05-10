import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { FileText, Loader2, ArrowLeft, Mail } from 'lucide-react';

type Mode = 'login' | 'register' | 'reset';

export default function Auth() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ title: 'Erreur de connexion', description: error.message, variant: 'destructive' });
      }
    } else if (mode === 'register') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        toast({ title: "Erreur d'inscription", description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Inscription réussie', description: 'Vérifiez votre email pour confirmer votre compte.' });
      }
    } else if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) {
        toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
      } else {
        setResetSent(true);
      }
    }

    setLoading(false);
  }

  const titles: Record<Mode, string> = {
    login: 'Connectez-vous à votre compte',
    register: 'Créez votre compte',
    reset: 'Réinitialiser le mot de passe',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-heading">MonCRM</CardTitle>
          <CardDescription>{titles[mode]}</CardDescription>
        </CardHeader>

        <CardContent>
          {/* Mode reset — email envoyé */}
          {mode === 'reset' && resetSent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Mail className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-medium text-sm">Email envoyé !</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Un lien de réinitialisation a été envoyé à <strong>{email}</strong>.<br />
                  Vérifiez votre boîte mail (et les spams).
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => { setMode('login'); setResetSent(false); }}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Retour à la connexion
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@exemple.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                {mode !== 'reset' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Mot de passe</Label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => { setMode('reset'); setResetSent(false); }}
                          className="text-xs text-muted-foreground hover:text-primary hover:underline"
                        >
                          Mot de passe oublié ?
                        </button>
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {mode === 'login' && 'Se connecter'}
                  {mode === 'register' && "S'inscrire"}
                  {mode === 'reset' && 'Envoyer le lien de réinitialisation'}
                </Button>
              </form>

              <div className="mt-4 text-center text-sm text-muted-foreground">
                {mode === 'reset' ? (
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-primary hover:underline font-medium flex items-center gap-1 mx-auto"
                  >
                    <ArrowLeft className="w-3 h-3" /> Retour à la connexion
                  </button>
                ) : (
                  <>
                    {mode === 'login' ? "Pas encore de compte ?" : 'Déjà un compte ?'}{' '}
                    <button
                      type="button"
                      onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                      className="text-primary hover:underline font-medium"
                    >
                      {mode === 'login' ? "S'inscrire" : 'Se connecter'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
