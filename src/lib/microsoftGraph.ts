/**
 * La boîte Outlook (Microsoft 365) lue depuis MonCRM, par Microsoft Graph.
 *
 * Sert l'Agent mail : lister les mails non lus de la boîte de réception,
 * télécharger un mail entier (.eml, pièces jointes comprises) pour l'analyse
 * de document, et le marquer lu une fois traité.
 *
 * ── Pourquoi pas de bibliothèque MSAL ─────────────────────────────────────
 * Le besoin tient en deux échanges OAuth (code + PKCE, puis rafraîchissement)
 * et une fenêtre surgissante. MSAL change d'API d'une version majeure à
 * l'autre (la page de retour d'une fenêtre surgissante en v5 n'est plus celle
 * de la v4) ; 150 lignes que l'on lit valent mieux qu'un paquet de 100 ko dont
 * le comportement nous échappe.
 *
 * ── Ce que demande Microsoft, une fois ────────────────────────────────────
 * Une INSCRIPTION D'APPLICATION dans Entra ID (portail Azure → « Inscriptions
 * d'applications ») : plateforme **Application monopage (SPA)**, URI de
 * redirection `https://<domaine MonCRM>/auth-ms.html` (et
 * `http://localhost:8080/auth-ms.html` pour le dev), permissions déléguées
 * `Mail.ReadWrite`, `User.Read`, `offline_access`. L'ID d'application et l'ID
 * d'annuaire se donnent par `VITE_MS_CLIENT_ID` / `VITE_MS_TENANT_ID`, ou se
 * saisissent dans la fenêtre de l'Agent mail (rangés dans ce navigateur).
 *
 * ⚠️ **SANS PLATEFORME « SPA », L'ÉCHANGE DU CODE EST REFUSÉ** (AADSTS9002326,
 * « Cross-origin token redemption is permitted only for the 'Single-Page
 * Application' client-type ») : une URI déclarée en « Web » ne marche pas.
 *
 * ⚠️ **Le jeton de rafraîchissement d'une SPA vit 24 h** (règle Microsoft) :
 * au-delà, une nouvelle connexion par la fenêtre est demandée. Les jetons
 * sont rangés dans le `localStorage` de ce navigateur, comme le ferait MSAL.
 */

const CLE_CONFIG = 'ms_graph_config';
const CLE_JETONS = 'ms_graph_jetons';
const SCOPES = 'openid profile offline_access User.Read Mail.ReadWrite';
const GRAPH = 'https://graph.microsoft.com/v1.0';

export interface ConfigMicrosoft {
  /** ID d'application (client) de l'inscription Entra ID. */
  clientId: string;
  /** ID d'annuaire (locataire) ; « organizations » à défaut. */
  tenant: string;
  /** Vrai quand la configuration vient des variables de build. */
  depuisEnv?: boolean;
}

interface Jetons {
  accessToken: string;
  refreshToken?: string;
  /** Horodatage (ms) d'expiration du jeton d'accès. */
  expiresAt: number;
}

/** Le jeton manque ou ne se rafraîchit plus : il faut se (re)connecter. */
export class ConnexionRequise extends Error {
  constructor(message = 'Connexion Microsoft requise') { super(message); this.name = 'ConnexionRequise'; }
}

function lireLocal<T>(cle: string): T | null {
  try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) as T : null; } catch { return null; }
}
function ecrireLocal(cle: string, v: unknown | null): void {
  try { if (v === null) localStorage.removeItem(cle); else localStorage.setItem(cle, JSON.stringify(v)); } catch { /* stockage indisponible */ }
}

export function configMicrosoft(): ConfigMicrosoft | null {
  const envId = (import.meta.env.VITE_MS_CLIENT_ID as string | undefined)?.trim();
  if (envId) {
    return { clientId: envId, tenant: (import.meta.env.VITE_MS_TENANT_ID as string | undefined)?.trim() || 'organizations', depuisEnv: true };
  }
  const c = lireLocal<ConfigMicrosoft>(CLE_CONFIG);
  return c?.clientId ? { clientId: c.clientId, tenant: c.tenant || 'organizations' } : null;
}

export function enregistrerConfigMicrosoft(clientId: string, tenant: string): void {
  ecrireLocal(CLE_CONFIG, { clientId: clientId.trim(), tenant: tenant.trim() || 'organizations' });
  ecrireLocal(CLE_JETONS, null);
}

export function uriRetour(): string {
  return `${window.location.origin}/auth-ms.html`;
}

export function estConnecte(): boolean {
  return !!lireLocal<Jetons>(CLE_JETONS);
}

export function deconnecterMicrosoft(): void {
  ecrireLocal(CLE_JETONS, null);
}

/* ── PKCE ─────────────────────────────────────────────────────────────────── */

function base64url(octets: Uint8Array): string {
  let s = '';
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function aleatoire(n: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(n)));
}
async function defi(verificateur: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificateur));
  return base64url(new Uint8Array(h));
}

async function demanderJeton(cfg: ConfigMicrosoft, corps: Record<string, string>): Promise<void> {
  const rep = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, scope: SCOPES, ...corps }),
  });
  const data = await rep.json().catch(() => ({}));
  if (!rep.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Jeton refusé (${rep.status})`);
  }
  ecrireLocal(CLE_JETONS, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  } satisfies Jetons);
}

/**
 * Connexion par fenêtre surgissante. À appeler DANS le gestionnaire du clic :
 * la fenêtre s'ouvre avant tout `await`, sans quoi le navigateur la bloque.
 */
export async function connecterMicrosoft(): Promise<void> {
  const cfg = configMicrosoft();
  if (!cfg) throw new Error("ID d'application Microsoft non renseigné");
  const popup = window.open('', 'connexion-microsoft', 'width=520,height=700');
  if (!popup) throw new Error('La fenêtre de connexion a été bloquée par le navigateur');

  const verificateur = aleatoire(48);
  const etat = aleatoire(16);
  const redirect = uriRetour();
  popup.location.href = `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/authorize?` + new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: redirect,
    response_mode: 'fragment',
    scope: SCOPES,
    state: etat,
    code_challenge: await defi(verificateur),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });

  /* La page de retour est sur NOTRE origine : tant que la fenêtre est chez
     Microsoft, lire son adresse lève une erreur — on attend qu'elle revienne. */
  const params = await new Promise<URLSearchParams>((resolve, reject) => {
    const t = window.setInterval(() => {
      if (popup.closed) { window.clearInterval(t); reject(new Error('Connexion annulée')); return; }
      let href = '';
      try { href = popup.location.href; } catch { return; }
      if (!href.startsWith(redirect)) return;
      window.clearInterval(t);
      popup.close();
      resolve(new URLSearchParams(new URL(href).hash.replace(/^#/, '')));
    }, 300);
  });

  if (params.get('error')) throw new Error(params.get('error_description') || params.get('error') || 'Connexion refusée');
  if (params.get('state') !== etat) throw new Error('Réponse de connexion inattendue (état)');
  const code = params.get('code');
  if (!code) throw new Error('Aucun code de connexion reçu');
  await demanderJeton(cfg, { grant_type: 'authorization_code', code, code_verifier: verificateur, redirect_uri: redirect });
}

async function jetonValide(): Promise<string> {
  const cfg = configMicrosoft();
  const j = lireLocal<Jetons>(CLE_JETONS);
  if (!cfg || !j) throw new ConnexionRequise();
  if (j.expiresAt - 60_000 > Date.now()) return j.accessToken;
  if (!j.refreshToken) throw new ConnexionRequise('Session Microsoft expirée');
  try {
    await demanderJeton(cfg, { grant_type: 'refresh_token', refresh_token: j.refreshToken });
  } catch {
    ecrireLocal(CLE_JETONS, null);
    throw new ConnexionRequise('Session Microsoft expirée — reconnectez-vous');
  }
  return lireLocal<Jetons>(CLE_JETONS)!.accessToken;
}

async function graph(chemin: string, init: RequestInit = {}): Promise<Response> {
  const jeton = await jetonValide();
  const rep = await fetch(chemin.startsWith('http') ? chemin : GRAPH + chemin, {
    ...init,
    headers: { Authorization: `Bearer ${jeton}`, ...(init.headers || {}) },
  });
  if (rep.status === 401) { ecrireLocal(CLE_JETONS, null); throw new ConnexionRequise(); }
  if (!rep.ok) {
    const e = await rep.json().catch(() => null);
    throw new Error(e?.error?.message || `Microsoft Graph : erreur ${rep.status}`);
  }
  return rep;
}

/* ── La boîte ─────────────────────────────────────────────────────────────── */

export interface MailOutlook {
  id: string;
  sujet: string;
  deNom: string;
  deEmail: string;
  recuLe: string;
  /** Corps en texte brut (Graph le convertit). */
  corps: string;
  piecesJointes: string[];
  lienWeb?: string;
}

export async function compteMicrosoft(): Promise<{ nom: string; email: string }> {
  const r = await (await graph('/me?$select=displayName,mail,userPrincipalName')).json();
  return { nom: r.displayName || '', email: (r.mail || r.userPrincipalName || '').toLowerCase() };
}

/**
 * Les mails non lus de la boîte de réception, du plus récent au plus ancien.
 *
 * ⚠️ Graph exige que la propriété triée figure AUSSI dans le filtre, et en
 * premier : d'où le `receivedDateTime ge …` qui ne filtre rien.
 */
/** Un message tel que Graph le rend, réduit aux champs demandés. */
interface MessageGraph {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime: string;
  body?: { content?: string };
  attachments?: { name?: string }[];
  webLink?: string;
}

export async function mailsNonLus(max = 30): Promise<MailOutlook[]> {
  const q = new URLSearchParams({
    $filter: 'receivedDateTime ge 2000-01-01T00:00:00Z and isRead eq false',
    $orderby: 'receivedDateTime desc',
    $top: String(max),
    $select: 'id,subject,from,receivedDateTime,body,hasAttachments,webLink',
    $expand: 'attachments($select=name)',
  });
  const r = await (await graph(`/me/mailFolders/inbox/messages?${q}`, {
    headers: { Prefer: 'outlook.body-content-type="text"' },
  })).json();
  return ((r.value || []) as MessageGraph[]).map((m): MailOutlook => ({
    id: m.id,
    sujet: m.subject || '(sans objet)',
    deNom: m.from?.emailAddress?.name || '',
    deEmail: (m.from?.emailAddress?.address || '').toLowerCase(),
    recuLe: m.receivedDateTime,
    corps: m.body?.content || '',
    piecesJointes: (m.attachments || []).map(a => a.name).filter((n): n is string => !!n),
    lienWeb: m.webLink,
  }));
}

/** Le mail entier au format .eml (MIME), pièces jointes comprises. */
export async function fichierEml(mail: Pick<MailOutlook, 'id' | 'sujet'>): Promise<File> {
  const blob = await (await graph(`/me/messages/${encodeURIComponent(mail.id)}/$value`)).blob();
  const nom = (mail.sujet || 'mail').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'mail';
  return new File([blob], `${nom}.eml`, { type: 'message/rfc822' });
}

export async function marquerLu(id: string): Promise<void> {
  await graph(`/me/messages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isRead: true }),
  });
}
