#!/usr/bin/env node
/**
 * Au /clear, la session qui vient d'être effacée est mise en mémoire.
 *
 * Crochet SessionEnd (raison « clear », `.claude/settings.json`). Claude Code
 * ne rend pas la main au modèle avant d'effacer : ce script ne peut que lire la
 * conversation sur le disque. Il en tire les messages de l'utilisateur et les
 * réponses de Claude (sans les sorties d'outils), puis lance EN ARRIÈRE-PLAN
 * une session `claude -p` qui met à jour `.claude/rules/reprise-2026-09.md`
 * (état du projet, commit + push de ce seul fichier) et la mémoire de
 * l'utilisateur (préférences, consignes). Le /clear n'attend pas.
 *
 * - Une conversation de moins de deux messages de l'utilisateur est ignorée.
 * - La session lancée porte MEMOIRE_AU_CLEAR=1 et finit sans /clear : elle ne
 *   relance pas le crochet.
 * - Journal : %TEMP%\claude-memoire-au-clear\<session>.log
 * - Essai sans rien lancer : MEMOIRE_AU_CLEAR_ESSAI=1 (écrit l'invite, montre
 *   la commande).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MAX_CARACTERES = 150_000;
const MIN_MESSAGES_UTILISATEUR = 2;

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

function condenser(cheminTranscript) {
  const lignes = fs.readFileSync(cheminTranscript, 'utf8').split(/\r?\n/);
  const morceaux = [];
  let messagesUtilisateur = 0;
  for (const ligne of lignes) {
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
  let tout = morceaux.join('\n\n---\n\n');
  if (tout.length > MAX_CARACTERES) tout = '[… début coupé …]\n\n' + tout.slice(-MAX_CARACTERES);
  return { tout, messagesUtilisateur };
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
  return `Tu es lancé automatiquement : l'utilisateur vient de faire /clear (le ${date}).
Ci-dessous, la conversation effacée : ses messages et les réponses de Claude, sans
les sorties d'outils. Ta seule tâche : mettre en mémoire ce qui doit lui survivre,
puis t'arrêter. Réponds et écris en français.

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

===== CONVERSATION EFFACÉE =====

${conversation}
`;
}

const entree = lireEntree();
if (process.env.MEMOIRE_AU_CLEAR || entree.reason !== 'clear' || !entree.transcript_path) process.exit(0);

const session = String(entree.session_id || Date.now()).replace(/[^\w-]/g, '');
const journal = path.join(dossierJournal, `${session}.log`);
const noter = m => fs.appendFileSync(journal, `[${new Date().toISOString()}] ${m}\n`);

try {
  if (!fs.existsSync(entree.transcript_path)) { noter(`conversation introuvable : ${entree.transcript_path}`); process.exit(0); }
  const { tout, messagesUtilisateur } = condenser(entree.transcript_path);
  if (messagesUtilisateur < MIN_MESSAGES_UTILISATEUR) { noter(`ignorée : ${messagesUtilisateur} message(s) de l'utilisateur`); process.exit(0); }

  const projet = entree.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const dossierMemoire = path.join(path.dirname(entree.transcript_path), 'memory');
  const date = new Date().toLocaleDateString('fr-FR');
  const fichierInvite = path.join(dossierJournal, `${session}.invite.txt`);
  fs.writeFileSync(fichierInvite, invite(tout, dossierMemoire, date), 'utf8');

  const lanceur = lanceurClaude();
  if (!lanceur) { noter('Claude Code introuvable (ni CLAUDE_CODE_EXECPATH, ni cli.js dans le PATH) : rien lancé'); process.exit(0); }
  const args = [...lanceur.avant, '-p',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Read,Grep,Glob,Edit,Write,Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(git add:*),Bash(git commit:*),Bash(git pull:*),Bash(git push:*)',
    '--add-dir', dossierMemoire,
    '--no-session-persistence'];

  if (process.env.MEMOIRE_AU_CLEAR_ESSAI) {
    console.log(JSON.stringify({ projet, messagesUtilisateur, caracteres: tout.length, invite: fichierInvite, commande: [lanceur.programme, ...args] }, null, 2));
    process.exit(0);
  }

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
  noter(`lancée (pid ${enfant.pid}) : ${messagesUtilisateur} messages, ${tout.length} caractères`);
} catch (e) {
  noter(`erreur : ${e && e.stack || e}`);
}
process.exit(0);
