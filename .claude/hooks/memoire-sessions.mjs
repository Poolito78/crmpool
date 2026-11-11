#!/usr/bin/env node
/**
 * Les sessions terminées sont mises en mémoire au démarrage de la suivante.
 *
 * Crochet SessionStart (`.claude/settings.json`). ⚠️ Pas SessionEnd : le /clear
 * de l'application de bureau ne le déclenche pas avec la raison « clear »
 * (essayé deux fois le 11/11, aucune trace). Au démarrage d'une session, on
 * cherche donc les conversations du projet qui sont TERMINÉES — dernière ligne
 * `cost-state`, que Claude Code écrit en fermant une session (/clear compris) —
 * et pas encore mises en mémoire (registre `memoire-sessions.json`, à côté des
 * conversations : nombre de lignes déjà traitées par session). Une session
 * encore ouverte, ici ou en parallèle, n'a pas ce `cost-state` final : elle
 * attend. Une session reprise puis refermée n'est relue qu'à partir de la
 * ligne déjà traitée.
 *
 * Les messages de l'utilisateur et les réponses de Claude (sans les sorties
 * d'outils) partent EN ARRIÈRE-PLAN dans une session `claude -p` qui met à jour
 * `.claude/rules/reprise-2026-09.md` (commit + push de ce seul fichier) et la
 * mémoire de l'utilisateur. Le démarrage n'attend pas.
 *
 * - Moins de deux messages de l'utilisateur : marquée traitée, rien lancé.
 * - Rien d'avant DEPUIS (mise en place du crochet) n'est repris.
 * - La session lancée porte MEMOIRE_AU_CLEAR=1 et ne garde pas de conversation
 *   (--no-session-persistence) : elle ne relance rien.
 * - Journal : %TEMP%\claude-memoire-au-clear\journal.log (chaque démarrage)
 *   et <session>-<horodatage>.log (sortie de chaque session de fond).
 * - Essai sans rien lancer ni marquer : MEMOIRE_AU_CLEAR_ESSAI=1.
 * - À la main : `echo {"cwd":"<projet>"} | node .claude/hooks/memoire-sessions.mjs`
 *   (dossier des conversations déduit du projet).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MAX_CARACTERES = 150_000;
const MIN_MESSAGES_UTILISATEUR = 2;
/** Mise en place du crochet : les conversations plus anciennes ne sont pas reprises. */
const DEPUIS = Date.parse('2026-11-11T16:00:00Z');
/**
 * ⚠️ La session de fond se connecte avec les identifiants de ~/.claude (ceux
 * d'un `claude` de terminal), pas avec ceux de l'application : expirés, elle
 * répond « Failed to authenticate » sans rien écrire (vu le 11/11). Refaire
 * `claude auth login` dans un terminal ; la session non traitée est retentée.
 * Même chose quand la limite d'usage est atteinte (« You've hit your 5-hour
 * limit », vu le 11/11) : la session de fond s'arrête sans rien écrire.
 */
const ECHEC_CONNEXION = /Failed to authenticate|Not logged in|Invalid API key|Please run \/login|claude auth login|hit your .{0,20}limit|usage limit|rate limit/i;

const dossierJournal = path.join(os.tmpdir(), 'claude-memoire-au-clear');
fs.mkdirSync(dossierJournal, { recursive: true });

function lireEntree() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

/** Le texte d'un message, sans les blocs d'outils. */
function texteDe(contenu) {
  if (typeof contenu === 'string') return contenu;
  if (!Array.isArray(contenu)) return '';
  return contenu.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n');
}

/** Ce qui n'est pas la parole de l'utilisateur : rappels, commandes, notifications. */
const BRUIT = /^\s*<(system-reminder|command-name|command-message|command-args|local-command|task-notification|user-prompt-submit-hook)/;

/** Lignes de la conversation, de `depuis` à la fin. */
function condenser(cheminTranscript, depuis = 0) {
  const lignes = fs.readFileSync(cheminTranscript, 'utf8').split(/\r?\n/);
  const morceaux = [];
  let messagesUtilisateur = 0;
  for (const ligne of lignes.slice(depuis)) {
    if (!ligne.trim()) continue;
    let o;
    try { o = JSON.parse(ligne); } catch { continue; }
    if (o.isMeta || !o.message) continue;
    const texte = texteDe(o.message.content).trim();
    if (!texte) continue;
    if (o.type === 'user') {
      if (BRUIT.test(texte)) continue;
      if (!o.isCompactSummary) messagesUtilisateur++;
      morceaux.push(`${o.isCompactSummary ? 'RÉSUMÉ DE LA PARTIE PRÉCÉDENTE' : 'UTILISATEUR'} :\n${texte}`);
    } else if (o.type === 'assistant') {
      morceaux.push(`CLAUDE :\n${texte}`);
    }
  }
  return { tout: morceaux.join('\n\n---\n\n'), messagesUtilisateur, lignes: lignes.length };
}

/** Garde la fin d'un texte trop long. */
function couper(texte, max) {
  return texte.length > max ? '[… début coupé …]\n\n' + texte.slice(-max) : texte;
}

/** Type de la dernière ligne non vide, lu sur la fin du fichier seulement. */
function typeDerniereLigne(chemin) {
  const taille = fs.statSync(chemin).size;
  const n = Math.min(taille, 64 * 1024);
  const fd = fs.openSync(chemin, 'r');
  const tampon = Buffer.alloc(n);
  fs.readSync(fd, tampon, 0, n, taille - n);
  fs.closeSync(fd);
  const derniere = tampon.toString('utf8').split(/\r?\n/).filter(l => l.trim()).pop() || '';
  return (derniere.match(/^\{"type":"([^"]+)"/) || [])[1] || null;
}

/** Dossier des conversations d'un projet : le chemin, chaque caractère hors [A-Za-z0-9-] → « - ». */
function dossierConversations(projet) {
  return path.join(os.homedir(), '.claude', 'projects', projet.replace(/[^A-Za-z0-9-]/g, '-'));
}

function lireRegistre(chemin) {
  try { return JSON.parse(fs.readFileSync(chemin, 'utf8')); } catch { return {}; }
}

function ecrireRegistre(chemin, registre) {
  const tmp = `${chemin}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(registre, null, 1), 'utf8');
  fs.renameSync(tmp, chemin);
}

/**
 * Le programme Claude Code à lancer : celui de l'application de bureau
 * (CLAUDE_CODE_EXECPATH, le plus récent), sinon le cli.js installé par npm.
 */
function lanceurClaude() {
  const exe = process.env.CLAUDE_CODE_EXECPATH;
  if (exe && /\.exe$/i.test(exe) && fs.existsSync(exe)) return { programme: exe, avant: [] };
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const cli = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (fs.existsSync(cli)) return { programme: process.execPath, avant: [cli] };
  }
  return null;
}

/*
 * ⚠️ L'environnement d'une session de l'application de bureau la rattache à
 * l'application (ANTHROPIC_BASE_URL vers son relais, identifiants de session,
 * canal de messages) : hérité, il ferait passer la session de fond pour une
 * session de l'application, après la fin de la sienne. On le retire : la
 * session de fond se connecte avec les identifiants de ~/.claude, ceux d'un
 * `claude` lancé dans un terminal (connexion faite une fois par /login).
 */
function environnementPropre() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_PREVIEW_|CLAUDE_AGENT_SDK_|ANTHROPIC_BASE_URL$)/.test(k)) continue;
    if (/^CLAUDE_CODE_/.test(k) && k !== 'CLAUDE_CODE_GIT_BASH_PATH' && k !== 'CLAUDE_CODE_OAUTH_TOKEN') continue;
    env[k] = v;
  }
  return env;
}

/* Claude Code refuse de démarrer sous Windows sans Git Bash (« requires
   git-bash ») : on le lui désigne s'il ne le trouve pas tout seul. */
function bashWindows() {
  if (process.platform !== 'win32' || process.env.CLAUDE_CODE_GIT_BASH_PATH) return null;
  const candidats = [];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (fs.existsSync(path.join(dir, 'git.exe'))) {
      candidats.push(path.join(dir, '..', 'bin', 'bash.exe'), path.join(dir, '..', '..', 'bin', 'bash.exe'));
    }
  }
  for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]) {
    if (base) candidats.push(path.join(base, 'Git', 'bin', 'bash.exe'));
  }
  return candidats.map(c => path.resolve(c)).find(c => fs.existsSync(c)) || null;
}

function invite(conversation, dossierMemoire, date) {
  return `Tu es lancé automatiquement (le ${date}) : une ou plusieurs sessions de travail
sur ce projet se sont terminées (/clear ou fermeture). Ci-dessous, leurs conversations :
messages de l'utilisateur et réponses de Claude, sans les sorties d'outils (une
« SUITE » ne reprend que ce qui a été dit depuis une mise en mémoire précédente).
Ta seule tâche : mettre en mémoire ce qui doit leur survivre, puis t'arrêter.
Réponds et écris en français.

1. ÉTAT DU PROJET → \`.claude/rules/reprise-2026-09.md\`. Relis-le d'abord en entier.
   Ajoute une section datée (titre court + date), ou complète celle du même sujet :
   ce qui a été fait et où, ce qui reste à faire (gestes de l'utilisateur, fonctions
   « À déployer : \`.\\deploy-function.ps1 nom\` »), les règles métier décidées, les
   pièges rencontrés. Style du fichier : concis, ⚠️ devant un piège. Corrige ce que
   la conversation a rendu faux. N'écris pas ce que le code ou git disent déjà
   (\`git log\` au besoin), ni une hypothèse non confirmée.
2. PRÉFÉRENCES ET CONSIGNES DE L'UTILISATEUR (façon de travailler, décisions
   valables pour toutes les tâches) → mémoire dans \`${dossierMemoire}\` : un
   fichier par fait, avec le frontmatter name / description / metadata.type
   (user, feedback, project, reference), corps suivi de **Why:** et **How to apply:**,
   et une ligne d'index dans MEMORY.md. Lis MEMORY.md avant : mets à jour un
   fichier existant plutôt que d'en créer un doublon.
3. Rien qui mérite de survivre (question isolée, conversation sans décision) :
   ne modifie rien.
4. Ne touche à aucun autre fichier. N'invente rien : seulement ce que la
   conversation établit.
5. Si la reprise a changé : \`git pull --rebase --autostash\`, \`git add\` de CE
   fichier seulement, commit « Reprise : <sujet> » terminé par la ligne
   « Co-Authored-By: Claude <noreply@anthropic.com> », puis \`git push\`. Jamais
   de force. Si le push échoue, laisse le commit local et dis-le.

Termine par une ligne : ce que tu as écrit, ou « rien à retenir ».

${conversation}
`;
}

const entree = lireEntree();
if (process.env.MEMOIRE_AU_CLEAR) process.exit(0);
const essai = !!process.env.MEMOIRE_AU_CLEAR_ESSAI;

const projet = entree.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const dossier = entree.transcript_path ? path.dirname(entree.transcript_path) : dossierConversations(projet);
const courante = String(entree.session_id || '');
const noterGeneral = m => fs.appendFileSync(path.join(dossierJournal, 'journal.log'), `[${new Date().toISOString()}] ${m}\n`);

try {
  noterGeneral(`démarrage ${entree.source || '(à la main)'} de ${courante || '?'} dans ${dossier}`);
  const cheminRegistre = path.join(dossier, 'memoire-sessions.json');
  const registre = lireRegistre(cheminRegistre);

  // Une session de fond qui n'a pas pu se connecter n'a rien écrit : on retente.
  for (const [id, r] of Object.entries(registre)) {
    if (!r.lance || !r.journal) continue;
    let sortie = '';
    try { sortie = fs.readFileSync(path.join(dossierJournal, r.journal), 'utf8'); } catch { continue; }
    sortie = sortie.slice(Math.max(0, sortie.lastIndexOf('] lancée (pid'))); // le dernier lancement seulement
    if (ECHEC_CONNEXION.test(sortie)) { delete registre[id]; noterGeneral(`à refaire (connexion refusée) : ${id}`); }
  }

  // Les conversations terminées, pas encore (entièrement) mises en mémoire.
  const aTraiter = [];
  for (const nom of fs.readdirSync(dossier)) {
    const m = nom.match(/^([0-9a-f-]{36})\.jsonl$/);
    if (!m || m[1] === courante) continue;
    const chemin = path.join(dossier, nom);
    const stat = fs.statSync(chemin);
    if (stat.mtimeMs < DEPUIS) continue;
    if (registre[m[1]]?.taille === stat.size) continue; // déjà traitée, rien d'écrit depuis
    if (typeDerniereLigne(chemin) !== 'cost-state') continue;
    const deja = registre[m[1]]?.lignes || 0;
    const c = condenser(chemin, deja);
    if (c.messagesUtilisateur < MIN_MESSAGES_UTILISATEUR) {
      if (!essai) registre[m[1]] = { lignes: c.lignes, taille: stat.size, le: new Date().toISOString(), lance: false };
      continue;
    }
    aTraiter.push({ id: m[1], suite: deja > 0, fin: stat.mtimeMs, taille: stat.size, ...c });
  }
  if (!essai) ecrireRegistre(cheminRegistre, registre);
  if (!aTraiter.length) { noterGeneral('rien à mettre en mémoire'); process.exit(0); }

  aTraiter.sort((a, b) => a.fin - b.fin);
  const part = Math.floor(MAX_CARACTERES / aTraiter.length);
  const tout = aTraiter.map(s => {
    const quand = new Date(s.fin).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    return `===== ${s.suite ? 'SUITE DE LA ' : ''}SESSION ${s.id} (terminée le ${quand}) =====\n\n${couper(s.tout, part)}`;
  }).join('\n\n');

  const session = aTraiter[aTraiter.length - 1].id;
  const nomJournal = `${session}-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.log`;
  const journal = path.join(dossierJournal, nomJournal);
  const noter = m => { fs.appendFileSync(journal, `[${new Date().toISOString()}] ${m}\n`); noterGeneral(m); };

  const dossierMemoire = path.join(dossier, 'memory');
  const date = new Date().toLocaleDateString('fr-FR');
  const fichierInvite = path.join(dossierJournal, `${session}.invite.txt`);
  fs.writeFileSync(fichierInvite, invite(tout, dossierMemoire, date), 'utf8');
  const messagesUtilisateur = aTraiter.reduce((n, s) => n + s.messagesUtilisateur, 0);

  const lanceur = lanceurClaude();
  if (!lanceur) { noter('Claude Code introuvable (ni CLAUDE_CODE_EXECPATH, ni cli.js dans le PATH) : rien lancé'); process.exit(0); }
  const args = [...lanceur.avant, '-p',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Read,Grep,Glob,Edit,Write,Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(git add:*),Bash(git commit:*),Bash(git pull:*),Bash(git push:*)',
    '--add-dir', dossierMemoire,
    '--no-session-persistence'];

  if (essai) {
    console.log(JSON.stringify({ projet, sessions: aTraiter.map(s => `${s.id} (${s.messagesUtilisateur} messages${s.suite ? ', suite' : ''})`), caracteres: tout.length, invite: fichierInvite, commande: [lanceur.programme, ...args] }, null, 2));
    process.exit(0);
  }

  // Marquées AVANT le lancement : une autre session qui démarre ne les relance pas.
  for (const s of aTraiter) registre[s.id] = { lignes: s.lignes, taille: s.taille, le: new Date().toISOString(), lance: true, journal: nomJournal };
  ecrireRegistre(cheminRegistre, registre);

  const env = { ...environnementPropre(), MEMOIRE_AU_CLEAR: '1' };
  const bash = bashWindows();
  if (bash) env.CLAUDE_CODE_GIT_BASH_PATH = bash;
  const sortie = fs.openSync(journal, 'a');
  const enfant = spawn(lanceur.programme, args, {
    cwd: projet,
    detached: true,
    windowsHide: true,
    stdio: [fs.openSync(fichierInvite, 'r'), sortie, sortie],
    env,
  });
  enfant.unref();
  noter(`lancée (pid ${enfant.pid}) : ${aTraiter.map(s => s.id.slice(0, 8)).join(', ')} — ${messagesUtilisateur} messages, ${tout.length} caractères`);
} catch (e) {
  noterGeneral(`erreur : ${e && e.stack || e}`);
}
process.exit(0);
