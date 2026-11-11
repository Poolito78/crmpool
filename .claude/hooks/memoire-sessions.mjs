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
 * d'outils) partent EN ARRIÈRE-PLAN (`--executer`, processus détaché) dans une
 * session `claude -p` qui met à jour des COPIES de la reprise et de la mémoire ;
 * ce script les reporte ensuite (voir REPRISE plus bas), committe et pousse la
 * reprise seule. Le démarrage n'attend pas.
 *
 * - Moins de deux messages de l'utilisateur : marquée traitée, rien lancé.
 * - Rien d'avant DEPUIS (mise en place du crochet) n'est repris.
 * - La session lancée porte MEMOIRE_AU_CLEAR=1 et ne garde pas de conversation
 *   (--no-session-persistence) : elle ne relance rien.
 * - Journal : %TEMP%\claude-memoire-au-clear\journal.log (chaque démarrage)
 *   et <session>-<horodatage>.log (sortie de chaque session de fond et ce qui
 *   a été reporté) ; le dossier <session>-<horodatage>\ garde les copies.
 * - Essai sans rien lancer ni marquer : MEMOIRE_AU_CLEAR_ESSAI=1.
 * - À la main : `echo {"cwd":"<projet>"} | node .claude/hooks/memoire-sessions.mjs`
 *   (dossier des conversations déduit du projet).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
// En DÉBUT de ligne seulement : ce sont les messages de Claude Code, pas une
// réponse du modèle qui citerait « claude auth login » (pris pour un échec le 11/11).
const ECHEC_CONNEXION = /^(Failed to authenticate|Not logged in|Invalid API key|Please run \/login|You've hit your|API Error: (401|429))/m;

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

/*
 * ⚠️ Claude Code protège tout le dossier `.claude` : une session de fond ne
 * peut pas écrire la reprise, même autorisée nommément (essayé le 11/11). Elle
 * travaille donc sur des COPIES, dans un dossier de travail qui est son seul
 * droit d'écriture (acceptEdits, sans Edit/Write ni Bash dans --allowedTools) :
 * `reprise-2026-09.md` et `memoire/`. Ce script compare ensuite chaque copie à
 * l'état de départ et reporte la différence par fusion à trois
 * (`git merge-file`) — ce qu'une autre session a écrit entre-temps est gardé ;
 * un conflit n'applique rien. La reprise est seule committée (choix du 11/11).
 */
const REPRISE = path.join('.claude', 'rules', 'reprise-2026-09.md');

function invite(conversation, date) {
  return `Tu es lancé automatiquement (le ${date}) : une ou plusieurs sessions de travail
sur un projet se sont terminées (/clear ou fermeture). Ci-dessous, leurs conversations :
messages de l'utilisateur et réponses de Claude, sans les sorties d'outils (une
« SUITE » ne reprend que ce qui a été dit depuis une mise en mémoire précédente).
Ta seule tâche : mettre en mémoire ce qui doit leur survivre, puis t'arrêter.
Réponds et écris en français.

Tu travailles dans le dossier courant, sur des COPIES : un script reporte ensuite
tes changements dans le projet. N'écris nulle part ailleurs.

1. ÉTAT DU PROJET → \`reprise-2026-09.md\` (dossier courant). Relis-le d'abord en
   entier. Ajoute une section datée (titre court + date), ou complète celle du même
   sujet : ce qui a été fait et où, ce qui reste à faire (gestes de l'utilisateur,
   fonctions « À déployer : \`.\\deploy-function.ps1 nom\` »), les règles métier
   décidées, les pièges rencontrés. Style du fichier : concis, ⚠️ devant un piège.
   Corrige ce que la conversation a rendu faux. N'écris pas une hypothèse non
   confirmée. Touche le moins de lignes possible : ajouts et corrections ciblées,
   jamais de réécriture d'ensemble.
2. PRÉFÉRENCES ET CONSIGNES DE L'UTILISATEUR (façon de travailler, décisions
   valables pour toutes les tâches) → \`memoire/\` (dossier courant) : un fichier
   par fait, avec le frontmatter name / description / metadata.type (user,
   feedback, project, reference), corps suivi de **Why:** et **How to apply:**, et
   une ligne d'index dans \`memoire/MEMORY.md\`. Lis MEMORY.md avant : mets à jour
   un fichier existant plutôt que d'en créer un doublon.
3. Si la reprise a changé, écris dans \`sujet.txt\` (dossier courant) le sujet en
   quelques mots, sur une ligne : il deviendra le commit « Reprise : <sujet> ».
4. Rien qui mérite de survivre (question isolée, conversation sans décision) :
   ne modifie rien. N'invente rien : seulement ce que la conversation établit.

Termine par une ligne : ce que tu as écrit, ou « rien à retenir ».

${conversation}
`;
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return { code: r.status, sortie: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

function lire(chemin) {
  try { return fs.readFileSync(chemin, 'utf8'); } catch { return null; }
}

/**
 * Reporte `propose` (la copie modifiée) sur `reel`, `base` étant l'état de
 * départ. Rend 'inchangé', 'écrit', 'conflit' ou 'erreur'.
 */
function reporter(reel, base, propose) {
  const p = lire(propose), b = lire(base), r = lire(reel);
  if (p === null || p === b || r === p) return 'inchangé';
  if (r === null || r === b) { fs.writeFileSync(reel, p, 'utf8'); return 'écrit'; }
  let baseFusion = base;
  if (b === null) { baseFusion = `${propose}.base-vide`; fs.writeFileSync(baseFusion, '', 'utf8'); }
  const f = spawnSync('git', ['merge-file', '-p', reel, baseFusion, propose], { encoding: 'utf8', windowsHide: true });
  if (f.status === 0) { fs.writeFileSync(reel, f.stdout, 'utf8'); return 'écrit'; }
  return f.status > 0 ? 'conflit' : 'erreur';
}

const noterGeneral = m => fs.appendFileSync(path.join(dossierJournal, 'journal.log'), `[${new Date().toISOString()}] ${m}\n`);

/** Processus détaché : lance la session de fond, puis reporte ses copies. */
function executer(cheminTache) {
  const t = JSON.parse(fs.readFileSync(cheminTache, 'utf8'));
  const noter = m => { fs.appendFileSync(t.journal, `[${new Date().toISOString()}] ${m}\n`); noterGeneral(m); };
  const sortie = fs.openSync(t.journal, 'a');
  const r = spawnSync(t.lanceur.programme, [...t.lanceur.avant, '-p',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Read,Grep,Glob',
    '--no-session-persistence'], {
    cwd: t.travail,
    windowsHide: true,
    stdio: [fs.openSync(t.invite, 'r'), sortie, sortie],
    env: process.env,
    timeout: 20 * 60 * 1000,
  });
  fs.closeSync(sortie);
  const dernier = lire(t.journal) || '';
  if (r.error || ECHEC_CONNEXION.test(dernier.slice(dernier.lastIndexOf('] lancée (pid')))) {
    noter(`session de fond arrêtée sans résultat${r.error ? ` (${r.error.message})` : ''} : rien reporté`);
    return;
  }

  // Mémoire de l'utilisateur : chaque fichier créé ou modifié.
  const ecrits = [];
  for (const nom of fs.readdirSync(path.join(t.travail, 'memoire'))) {
    if (!nom.endsWith('.md')) continue;
    const etat = reporter(path.join(t.dossierMemoire, nom), path.join(t.travail, 'base-memoire', nom), path.join(t.travail, 'memoire', nom));
    if (etat !== 'inchangé') ecrits.push(`${nom} : ${etat}`);
  }
  noter(`mémoire : ${ecrits.join(', ') || 'rien de neuf'}`);

  // Reprise : fusionnée dans le dépôt à jour, committée seule.
  const fichier = path.join(t.projet, REPRISE);
  const propose = path.join(t.travail, 'reprise-2026-09.md');
  const base = path.join(t.travail, 'base', 'reprise-2026-09.md');
  if (lire(propose) === lire(base)) { noter('reprise : rien de neuf'); return; }
  const tire = git(['pull', '--rebase', '--autostash'], t.projet);
  if (tire.code !== 0) noter(`reprise : git pull a échoué (${tire.sortie.split('\n').pop()}), fusion sur la copie locale`);
  if (git(['diff', '--quiet', 'HEAD', '--', REPRISE], t.projet).code !== 0) {
    noter(`reprise : modifiée et non committée par une autre session — rien reporté, proposition dans ${propose}`);
    return;
  }
  const etat = reporter(fichier, base, propose);
  if (etat !== 'écrit') { noter(`reprise : ${etat}${etat === 'conflit' ? ` — rien reporté, proposition dans ${propose}` : ''}`); return; }
  const sujet = ((lire(path.join(t.travail, 'sujet.txt')) || '').split(/\r?\n/)[0].trim() || 'mise en mémoire des sessions').slice(0, 72);
  const message = path.join(t.travail, 'commit.txt');
  fs.writeFileSync(message, `Reprise : ${sujet}\n\nMise en mémoire automatique des sessions ${t.sessions.join(', ')}.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n`, 'utf8');
  const commit = git(['commit', '-F', message, '--', REPRISE], t.projet);
  if (commit.code !== 0) { noter(`reprise : écrite mais commit refusé (${commit.sortie.split('\n').pop()})`); return; }
  const pousse = git(['push'], t.projet);
  noter(`reprise : committée « Reprise : ${sujet} »${pousse.code === 0 ? ' et poussée' : ` — push refusé, commit local (${pousse.sortie.split('\n').pop()})`}`);
}

function copierDossier(source, cible) {
  fs.mkdirSync(cible, { recursive: true });
  if (!fs.existsSync(source)) return;
  for (const nom of fs.readdirSync(source)) {
    if (nom.endsWith('.md')) fs.copyFileSync(path.join(source, nom), path.join(cible, nom));
  }
}

/** Le crochet SessionStart : trouve les sessions terminées et lance l'exécution détachée. */
function crochet() {
  const entree = lireEntree();
  const essai = !!process.env.MEMOIRE_AU_CLEAR_ESSAI;
  const projet = entree.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const dossier = entree.transcript_path ? path.dirname(entree.transcript_path) : dossierConversations(projet);
  const courante = String(entree.session_id || '');

  noterGeneral(`démarrage ${entree.source || '(à la main)'} de ${courante || '?'} dans ${dossier}`);
  const cheminRegistre = path.join(dossier, 'memoire-sessions.json');
  const registre = lireRegistre(cheminRegistre);

  // Une session de fond qui n'a pas pu se connecter n'a rien écrit : on retente.
  for (const [id, r] of Object.entries(registre)) {
    if (!r.lance || !r.journal) continue;
    let sortie = lire(path.join(dossierJournal, r.journal));
    if (sortie === null) continue;
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
  if (!aTraiter.length) { noterGeneral('rien à mettre en mémoire'); return; }

  aTraiter.sort((a, b) => a.fin - b.fin);
  const part = Math.floor(MAX_CARACTERES / aTraiter.length);
  const tout = aTraiter.map(s => {
    const quand = new Date(s.fin).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    return `===== ${s.suite ? 'SUITE DE LA ' : ''}SESSION ${s.id} (terminée le ${quand}) =====\n\n${couper(s.tout, part)}`;
  }).join('\n\n');

  const lanceur = lanceurClaude();
  if (!lanceur) { noterGeneral('Claude Code introuvable (ni CLAUDE_CODE_EXECPATH, ni cli.js dans le PATH) : rien lancé'); return; }

  // Dossier de travail : les copies, et leur état de départ pour la fusion.
  const nomTravail = `${aTraiter[aTraiter.length - 1].id}-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
  // ⚠️ Chemin LONG : %TEMP% vaut souvent « C:\Users\FCCDA~1.MOU\… » (nom 8.3), que
  // Claude Code ne reconnaît pas comme son dossier courant — toute écriture y était
  // refusée (vu le 11/11). realpathSync.native rend « C:\Users\f.mouhot\… ».
  fs.mkdirSync(path.join(dossierJournal, nomTravail), { recursive: true });
  const travail = fs.realpathSync.native(path.join(dossierJournal, nomTravail));
  const dossierMemoire = path.join(dossier, 'memory');
  fs.mkdirSync(path.join(travail, 'base'), { recursive: true });
  for (const cible of [path.join(travail, 'reprise-2026-09.md'), path.join(travail, 'base', 'reprise-2026-09.md')]) {
    fs.copyFileSync(path.join(projet, REPRISE), cible);
  }
  copierDossier(dossierMemoire, path.join(travail, 'memoire'));
  copierDossier(dossierMemoire, path.join(travail, 'base-memoire'));

  const tache = {
    projet, travail, dossierMemoire, lanceur,
    journal: path.join(dossierJournal, `${nomTravail}.log`),
    invite: path.join(travail, 'invite.txt'),
    sessions: aTraiter.map(s => s.id.slice(0, 8)),
  };
  fs.writeFileSync(tache.invite, invite(tout, new Date().toLocaleDateString('fr-FR')), 'utf8');
  const cheminTache = path.join(travail, 'tache.json');
  fs.writeFileSync(cheminTache, JSON.stringify(tache, null, 1), 'utf8');

  if (essai) {
    console.log(JSON.stringify({ projet, sessions: aTraiter.map(s => `${s.id} (${s.messagesUtilisateur} messages${s.suite ? ', suite' : ''})`), caracteres: tout.length, travail }, null, 2));
    return;
  }

  // Marquées AVANT le lancement : une autre session qui démarre ne les relance pas.
  for (const s of aTraiter) registre[s.id] = { lignes: s.lignes, taille: s.taille, le: new Date().toISOString(), lance: true, journal: `${nomTravail}.log` };
  ecrireRegistre(cheminRegistre, registre);

  const env = { ...environnementPropre(), MEMOIRE_AU_CLEAR: '1' };
  const bash = bashWindows();
  if (bash) env.CLAUDE_CODE_GIT_BASH_PATH = bash;
  const messages = aTraiter.reduce((n, s) => n + s.messagesUtilisateur, 0);
  const enfant = spawn(process.execPath, [fileURLToPath(import.meta.url), '--executer', cheminTache], {
    cwd: projet, detached: true, windowsHide: true, stdio: 'ignore', env,
  });
  enfant.unref();
  fs.appendFileSync(tache.journal, `[${new Date().toISOString()}] lancée (pid ${enfant.pid}) : ${tache.sessions.join(', ')} — ${messages} messages, ${tout.length} caractères\n`);
  noterGeneral(`lancée (pid ${enfant.pid}) : ${tache.sessions.join(', ')} — ${messages} messages`);
}

try {
  if (process.argv[2] === '--executer') executer(process.argv[3]);
  else if (!process.env.MEMOIRE_AU_CLEAR) crochet();
} catch (e) {
  noterGeneral(`erreur : ${e && e.stack || e}`);
}
process.exit(0);
