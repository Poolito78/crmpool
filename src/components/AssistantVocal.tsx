/* Assistant vocal — écoute en continu et pilote l'écran.
 *
 * Monté par `CRMLayout` tant que l'assistant est allumé (bouton du menu,
 * Alt+M). Chaque phrase reconnue est interprétée par `assistantVocal.ts` ;
 * ce composant exécute : navigation, ouverture d'une action CRM ou d'un
 * devis, recherche d'un devis ou d'un article (avec son stock), passage
 * d'un champ à l'autre, dictée dans le champ actif.
 *
 * LES CHAMPS SE TROUVENT PAR LEUR LIBELLÉ À L'ÉCRAN, pas par une liste
 * propre à chaque fenêtre : « aller au titre », « date planifiée demain »,
 * « priorité haute » marchent dans tout dialogue qui porte ces libellés.
 * La portée est la fenêtre (dialogue Radix) au premier plan, sinon la page.
 *
 * ⚠️ LE PANNEAU VIT HORS DU DIALOGUE RADIX. Un clic dessus serait un « clic
 * à l'extérieur » qui ferme la fenêtre (même piège que les notifications
 * sonner) : `pointerdown` est arrêté avant d'atteindre le document, et
 * `mousedown` n'emporte pas le focus — le curseur reste dans le champ dicté.
 * Le dialogue modal coupe aussi les pointeurs du `body` : le panneau les
 * rétablit (`pointer-events-auto`).
 *
 * ⚠️ LA VOIX DE L'ASSISTANT S'ENTENDRAIT ELLE-MÊME. Pendant qu'il lit un
 * stock, la reconnaissance est coupée, et relancée à la fin de la phrase.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mic, X, Volume2, VolumeX, HelpCircle, FileText, Package } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCRM } from '@/lib/StoreContext';
import { designationProduit, type Produit } from '@/lib/store';
import { chercherProduits } from '@/lib/indexProduits';
import { quantitesReservees } from '@/lib/stockDisponible';
import { ouvrirFenetre } from '@/lib/fenetres';
import type { CaptureDictee, GestionnaireDictee } from '@/hooks/useAssistantVocal';
import {
  interpreter, champNomme, optionsDesignees, texteAInserer, dateParlee, nombreParle,
  chercherDevis, variantesReference, phraseStock, normaliser, resteOriginal,
  commandeApprise, reponse, cleDePhrase,
  type CommandeVocale, type DevisCherche, type CommandeApprise, type EtapeApprise,
} from '@/lib/assistantVocal';

interface Props {
  onArret: () => void;
  ouvrirAnalyse: () => void;
  /** Droits de l'utilisateur : une page masquée du menu ne s'ouvre pas à la voix. */
  pageAutorisee: (path: string) => boolean;
  /** Aiguillage de dictée prêté par la page ouverte (`useAssistantVocal`). */
  dicteeContextuelle?: () => GestionnaireDictee | null;
  /** Zone de dialogue qui capte toute la dictée (bouton micro), `null` sinon. */
  captureDictee?: () => CaptureDictee | null;
  finCapture?: () => void;
}

type Genre = 'texte' | 'ligne' | 'date' | 'nombre' | 'select' | 'riche' | 'boutons';
interface Champ { libelle: string; el: HTMLElement; genre: Genre; boutons?: HTMLElement[] }

/** proposer → (oui) enregistrer les clics → (terminé) confirmer → (oui) retenu. */
type Apprentissage =
  | { etape: 'proposer'; dite: string }
  | { etape: 'enregistrer'; dite: string; etapes: EtapeApprise[] }
  | { etape: 'confirmer'; dite: string; etapes: EtapeApprise[] };

const CLE_APPRISES = 'assistant_vocal_commandes_apprises';

type Resultats =
  | { kind: 'devis'; items: (DevisCherche & { statut: string })[] }
  | { kind: 'produits'; items: { p: Produit; reserve: number }[]; total: number };

interface Ligne { texte: string; ton: 'info' | 'ok' | 'erreur' | 'dicte' }

const SELECT_CONTROLES = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit]), textarea, select, [contenteditable="true"]';
const SELECT_CLIQUABLES = 'button, [role=button], [role=checkbox], [role=switch], [role=tab], [role=menuitem], [role=option], a[href]';
/** Pages dont la liste lit `?search=` à l'ouverture. */
const PAGES_RECHERCHE = ['/clients', '/devis', '/produits', '/commandes-client', '/commandes', '/factures-client', '/factures-fournisseur'];

const visible = (el: Element) => el.getClientRects().length > 0 && !(el as HTMLElement).closest('[aria-hidden="true"]');

/** La fenêtre au premier plan, sinon la page. */
function portee(): HTMLElement {
  const dialogues = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')).filter(visible);
  return dialogues[dialogues.length - 1] ?? document.querySelector('main') ?? document.body;
}
const dansDialogue = () => !!Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).find(visible);

function genreDe(el: HTMLElement): Genre {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'texte';
  if (el instanceof HTMLInputElement) {
    if (el.type === 'date' || el.type === 'datetime-local') return 'date';
    if (el.type === 'number') return 'nombre';
    return 'ligne';
  }
  return 'riche';
}

/** Les champs de saisie et groupes de boutons de la portée, sous tous leurs noms. */
function champsDe(scope: HTMLElement): Champ[] {
  const champs: Champ[] = [];
  const controles = Array.from(scope.querySelectorAll<HTMLElement>(SELECT_CONTROLES)).filter(visible);
  const lies = new Set<HTMLLabelElement>();
  const nbControles = (el: Element) => el.querySelectorAll(SELECT_CONTROLES).length;

  for (const el of controles) {
    const genre = genreDe(el);
    const libelles: string[] = [];
    let label: HTMLLabelElement | null = null;
    if (el.id) label = scope.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (!label) label = el.closest('label');
    if (!label) {
      // Le libellé frère : <div><Label/><Input/></div>, jusqu'à trois niveaux,
      // tant que l'ancêtre ne contient que ce champ.
      let anc = el.parentElement;
      for (let k = 0; k < 3 && anc && anc !== scope && !label; k++, anc = anc.parentElement) {
        if (nbControles(anc) !== 1) break;
        label = anc.querySelector<HTMLLabelElement>(':scope > label');
      }
    }
    if (label) { lies.add(label); libelles.push(label.textContent || ''); }
    const ph = el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('data-placeholder');
    if (ph) libelles.push(ph);
    for (const l of libelles) if (l.trim()) champs.push({ libelle: l.trim(), el, genre });
  }

  // Groupes de boutons sous un libellé : Type, Statut, Priorité…
  for (const label of Array.from(scope.querySelectorAll<HTMLLabelElement>('label')).filter(visible)) {
    if (lies.has(label) || !label.parentElement) continue;
    const parent = label.parentElement;
    if (nbControles(parent) > 0) continue;
    const boutons = Array.from(parent.querySelectorAll<HTMLElement>('button, [role=radio], [role=checkbox]')).filter(visible);
    if (boutons.length) champs.push({ libelle: (label.textContent || '').trim(), el: label, genre: 'boutons', boutons });
  }
  return champs;
}

function texteDe(el: HTMLElement): string {
  return (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
}

/** Écrit une valeur dans un champ contrôlé par React (le setter natif, puis l'événement). */
function ecrireValeur(el: HTMLElement, valeur: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, valeur);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function focaliser(el: HTMLElement) {
  el.focus();
  el.scrollIntoView({ block: 'nearest' });
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    try { const n = el.value.length; el.setSelectionRange(n, n); } catch { /* date, nombre */ }
  } else if (el.isContentEditable) {
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(r);
  }
}

/** Le champ où va la dictée : celui qui a le focus, s'il se remplit. */
function champActif(panneau: HTMLElement | null): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el || panneau?.contains(el)) return null;
  if (el.isContentEditable) return el;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el;
  if (el instanceof HTMLInputElement && !['checkbox', 'radio', 'file', 'button', 'submit', 'hidden', 'range', 'color'].includes(el.type)) return el;
  return null;
}

export default function AssistantVocal({ onArret, ouvrirAnalyse, pageAutorisee, dicteeContextuelle, captureDictee, finCapture }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { clients, devis, produits, produitsCharges, commandesClient } = useCRM();

  const [interim, setInterim] = useState('');
  const [journal, setJournal] = useState<Ligne[]>([]);
  const [resultats, setResultats] = useState<Resultats | null>(null);
  const [aide, setAide] = useState(false);
  const [parle, setParle] = useState(false);
  const [voix, setVoix] = useState<boolean>(() => {
    try { return localStorage.getItem('assistant_vocal_voix') !== '0'; } catch { return true; }
  });
  const panneauRef = useRef<HTMLDivElement>(null);
  /** Valeurs d'avant chaque dictée, pour « corrige ». */
  const historique = useRef<{ el: HTMLElement; avant: string; html: boolean }[]>([]);
  const parleRef = useRef(false);
  const controle = useRef<{ demarrer: () => void; couper: () => void } | null>(null);

  /* Commandes apprises : rangées dans CE navigateur (localStorage). Les
     perdre ne coûte qu'un nouvel apprentissage ; rien de métier n'y est. */
  const [apprises, setApprises] = useState<CommandeApprise[]>(() => {
    try { return JSON.parse(localStorage.getItem(CLE_APPRISES) || '[]'); } catch { return []; }
  });
  const sauverApprises = (liste: CommandeApprise[]) => {
    setApprises(liste);
    try { localStorage.setItem(CLE_APPRISES, JSON.stringify(liste)); } catch { /* stockage bloqué */ }
  };
  const [apprentissage, setApprentissage] = useState<Apprentissage | null>(null);

  const dire = useCallback((texte: string, ton: Ligne['ton'] = 'info') => {
    setJournal(j => [...j.slice(-3), { texte, ton }]);
  }, []);

  const changerVoix = (v: boolean) => {
    setVoix(v);
    try { localStorage.setItem('assistant_vocal_voix', v ? '1' : '0'); } catch { /* ignore */ }
  };

  /** Lit une phrase à voix haute, micro coupé le temps de la lecture. */
  const parler = useCallback((texte: string) => {
    const synth = window.speechSynthesis;
    if (!voix || !synth) return;
    parleRef.current = true;
    setParle(true);
    controle.current?.couper();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(texte);
    u.lang = 'fr-FR';
    let fini = false;
    const reprendre = () => {
      if (fini) return;
      fini = true;
      parleRef.current = false;
      setParle(false);
      controle.current?.demarrer();
    };
    u.onend = reprendre;
    u.onerror = reprendre;
    // Filet : certains navigateurs n'émettent jamais `end`.
    setTimeout(reprendre, 2500 + texte.length * 90);
    synth.speak(u);
  }, [voix]);

  const reserves = useMemo(() => quantitesReservees(commandesClient), [commandesClient]);

  // ── Actions sur l'écran ───────────────────────────────────────────────

  function inserer(el: HTMLElement, texte: string): boolean {
    const genre = genreDe(el);
    if (genre === 'select') return choisirOption(el as HTMLSelectElement, texte);
    if (genre === 'date') {
      const d = dateParlee(texte);
      if (!d) { dire(`Date non comprise : « ${texte} »`, 'erreur'); return true; }
      historique.current.push({ el, avant: (el as HTMLInputElement).value, html: false });
      ecrireValeur(el, d);
      dire(`📅 ${new Date(d + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`, 'ok');
      return true;
    }
    if (genre === 'nombre') {
      const n = nombreParle(texte);
      if (n === null) { dire(`Nombre non compris : « ${texte} »`, 'erreur'); return true; }
      historique.current.push({ el, avant: (el as HTMLInputElement).value, html: false });
      ecrireValeur(el, String(n));
      dire(`= ${n}`, 'ok');
      return true;
    }
    if (genre === 'riche') {
      historique.current.push({ el, avant: el.innerHTML, html: true });
      el.focus();
      const sel = window.getSelection();
      let avant = '';
      if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0).cloneRange();
        r.selectNodeContents(el);
        r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
        avant = r.toString();
      }
      const t = texteAInserer(avant, texte);
      t.split('\n').forEach((morceau, i) => {
        if (i > 0) document.execCommand('insertLineBreak');
        if (morceau) document.execCommand('insertText', false, morceau);
      });
      dire(`✎ ${texte}`, 'dicte');
      return true;
    }
    // input texte / textarea
    const champ = el as HTMLInputElement | HTMLTextAreaElement;
    const debut = champ.selectionStart ?? champ.value.length;
    let t = texteAInserer(champ.value.slice(0, debut), texte);
    if (genre === 'ligne') t = t.replace(/\s*\n+\s*/g, ' ');
    historique.current.push({ el, avant: champ.value, html: false });
    champ.focus();
    // insertText garde l'annulation native (Ctrl+Z) et prévient React.
    if (!document.execCommand('insertText', false, t)) {
      const fin = champ.selectionEnd ?? debut;
      ecrireValeur(champ, champ.value.slice(0, debut) + t + champ.value.slice(fin));
    }
    dire(`✎ ${texte}`, 'dicte');
    return true;
  }

  function choisirOption(select: HTMLSelectElement, texte: string): boolean {
    const options = Array.from(select.options);
    const trouves = optionsDesignees(texte, options.map(o => o.text));
    if (trouves.length === 0) { dire(`Aucune option « ${texte} »`, 'erreur'); return true; }
    if (trouves.length > 1) {
      dire(`${trouves.length} choix pour « ${texte} » : ${trouves.slice(0, 4).map(i => options[i].text).join(', ')}${trouves.length > 4 ? '…' : ''}`, 'erreur');
      return true;
    }
    historique.current.push({ el: select, avant: select.value, html: false });
    ecrireValeur(select, options[trouves[0]].value);
    dire(`✓ ${options[trouves[0]].text}`, 'ok');
    return true;
  }

  /** « titre », « date planifiée demain », « priorité haute », « description Rappeler… ». */
  function essayerChamp(phrase: string, explicite: boolean): boolean {
    const champs = champsDe(portee());
    const r = champNomme(phrase, champs.map(c => c.libelle));
    if (!r) {
      if (explicite) dire(`Champ « ${phrase} » introuvable ici`, 'erreur');
      return explicite;
    }
    const c = champs[r.index];
    if (!r.reste) {
      if (c.genre === 'boutons') {
        dire(`${c.libelle.replace(/\*/g, '').trim()} : ${c.boutons!.map(texteDe).join(' · ')}`);
        return true;
      }
      focaliser(c.el);
      dire(`→ ${c.libelle.replace(/\*/g, '').trim()}`, 'ok');
      return true;
    }
    if (c.genre === 'boutons') {
      const textes = c.boutons!.map(texteDe);
      const i = optionsDesignees(r.reste, textes)[0];
      if (i === undefined) return false;
      c.boutons![i].click();
      dire(`✓ ${c.libelle.replace(/\*/g, '').trim()} : ${textes[i]}`, 'ok');
      return true;
    }
    // Ce qui suit le nom du champ, dans la phrase d'origine (accents, majuscules).
    const total = normaliser(phrase).split(' ').filter(Boolean).length;
    const reste = resteOriginal(phrase, total - r.reste.split(' ').length);
    if (c.genre === 'select') {
      const opts = Array.from((c.el as HTMLSelectElement).options).map(o => o.text);
      if (!optionsDesignees(reste, opts).length) return false;
    }
    /* Un champ texte nommé en tête de phrase : on y va et on y écrit. Sauf
       s'il a déjà le focus — « titre » au début d'un titre dicté reste un mot. */
    if ((c.genre === 'texte' || c.genre === 'ligne' || c.genre === 'riche') && document.activeElement === c.el) return false;
    focaliser(c.el);
    return inserer(c.el, reste);
  }

  /** Un bouton visible dont le texte est EXACTEMENT `libelle` : fenêtre d'abord, puis la page. */
  function trouverCliquable(libelle: string): HTMLElement | undefined {
    const k = normaliser(libelle);
    const dans = (racine: ParentNode) => Array.from(racine.querySelectorAll<HTMLElement>(SELECT_CLIQUABLES))
      .filter(el => visible(el) && !panneauRef.current?.contains(el))
      .find(el => normaliser(texteDe(el)) === k);
    return dans(portee()) ?? dans(document);
  }

  /** Rejoue une commande apprise, clic après clic — le temps qu'un menu s'ouvre. */
  async function rejouer(c: CommandeApprise) {
    for (const e of c.etapes) {
      let el: HTMLElement | undefined;
      for (let essai = 0; essai < 15 && !el; essai++) {
        el = trouverCliquable(e.libelle);
        if (!el) await new Promise(r => setTimeout(r, 100));
      }
      if (!el) {
        dire(`« ${e.libelle} » introuvable ici — « ${c.dite} » a été apprise sur ${c.page}`, 'erreur');
        return;
      }
      if ((el as HTMLButtonElement).disabled) { dire(`« ${e.libelle} » est grisé`, 'erreur'); return; }
      el.click();
      await new Promise(r => setTimeout(r, 250));
    }
    dire(`✓ ${c.dite}`, 'ok');
  }

  /* « ajoute une ligne » : le bouton « + Ligne », « Ajouter une ligne »,
     « Nouvelle ligne »… Entre plusieurs boutons du même nom, celui qui porte
     un « + » (icône Plus) est le bouton d'ajout. */
  function ajouter(objet: string): boolean {
    const boutons = Array.from(portee().querySelectorAll<HTMLElement>(SELECT_CLIQUABLES))
      .filter(el => visible(el) && !(el as HTMLButtonElement).disabled);
    const textes = boutons.map(texteDe);
    const indices = [
      ...optionsDesignees(objet, textes),
      ...optionsDesignees(`ajouter ${objet}`, textes),
      ...optionsDesignees(`nouveau ${objet}`, textes),
      ...optionsDesignees(`nouvelle ${objet}`, textes),
    ];
    if (!indices.length) return false;
    const estAjout = (el: HTMLElement) => !!el.querySelector('svg.lucide-plus, svg.lucide-circle-plus, svg.lucide-plus-circle')
      || /^\s*\+/.test(el.textContent || '') || /^(?:ajouter|nouveau|nouvelle)\b/.test(normaliser(texteDe(el)));
    const b = boutons[indices.find(i => estAjout(boutons[i])) ?? indices[0]];
    b.click();
    dire(`✓ ${texteDe(b)}`, 'ok');
    return true;
  }

  function cliquer(cible: string): boolean {
    const boutons = Array.from(portee().querySelectorAll<HTMLElement>(SELECT_CLIQUABLES)).filter(visible);
    const i = optionsDesignees(cible, boutons.map(texteDe))[0];
    if (i === undefined) return false;
    const b = boutons[i];
    if ((b as HTMLButtonElement).disabled) { dire(`« ${texteDe(b)} » est grisé`, 'erreur'); return true; }
    b.click();
    dire(`✓ ${texteDe(b) || cible}`, 'ok');
    return true;
  }

  function valider() {
    if (!dansDialogue()) { dire('Aucune fenêtre à valider', 'erreur'); return; }
    const boutons = Array.from(portee().querySelectorAll<HTMLButtonElement>('button')).filter(visible);
    const b = [...boutons].reverse().find(x => /^(?:creer|enregistrer|valider|modifier|sauvegarder|ajouter|confirmer|appliquer|ok)\b/.test(normaliser(texteDe(x))));
    if (!b) { dire('Pas de bouton de validation ici', 'erreur'); return; }
    if (b.disabled) { dire(`« ${texteDe(b)} » est grisé : un champ obligatoire manque ?`, 'erreur'); return; }
    b.click();
    dire(`✓ ${texteDe(b)}`, 'ok');
  }

  function fermer() {
    if (!dansDialogue()) { dire('Aucune fenêtre ouverte', 'erreur'); return; }
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    dire('✓ Fenêtre fermée', 'ok');
  }

  function corriger() {
    const h = historique.current.pop();
    if (!h) { dire('Rien à corriger', 'erreur'); return; }
    if (h.html) { h.el.innerHTML = h.avant; h.el.dispatchEvent(new Event('input', { bubbles: true })); }
    else ecrireValeur(h.el, h.avant);
    focaliser(h.el);
    dire('↺ Dernière dictée retirée', 'ok');
  }

  function effacer() {
    const el = champActif(panneauRef.current);
    if (!el) { dire('Aucun champ actif', 'erreur'); return; }
    if (el.isContentEditable) {
      historique.current.push({ el, avant: el.innerHTML, html: true });
      el.innerHTML = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      historique.current.push({ el, avant: (el as HTMLInputElement).value, html: false });
      ecrireValeur(el, '');
    }
    dire('✓ Champ vidé', 'ok');
  }

  function deplacer(sens: 1 | -1) {
    const els = Array.from(portee().querySelectorAll<HTMLElement>(SELECT_CONTROLES))
      .filter(el => visible(el) && !(el as HTMLInputElement).disabled);
    if (!els.length) { dire('Aucun champ ici', 'erreur'); return; }
    const i = els.indexOf(document.activeElement as HTMLElement);
    const el = els[i < 0 ? 0 : (i + sens + els.length) % els.length];
    focaliser(el);
    const c = champsDe(portee()).find(x => x.el === el);
    dire(`→ ${c?.libelle.replace(/\*/g, '').trim() || 'champ suivant'}`, 'ok');
  }

  function rechercherSurPage(requete: string): boolean {
    const input = Array.from(document.querySelectorAll<HTMLInputElement>('main input'))
      .filter(visible)
      .find(i => i.type === 'search' || normaliser(i.placeholder).startsWith('recherch') || normaliser(i.placeholder).startsWith('filtr'));
    if (!input) return false;
    ecrireValeur(input, requete);
    focaliser(input);
    dire(`🔎 ${requete}`, 'ok');
    return true;
  }

  // ── Recherches ───────────────────────────────────────────────────────

  const nomClient = useCallback((id?: string) => {
    const c = clients.find(x => x.id === id);
    return c ? (c.societe || c.nom) : '';
  }, [clients]);

  function ouvrirDevis(id: string, numero: string) {
    navigate(`/devis?editDevis=${id}`);
    dire(`✓ Devis ${numero}`, 'ok');
  }

  function ouvrirProduit(p: Produit) {
    navigate(`/produits?highlight=${p.id}`);
    dire(`✓ ${p.reference}`, 'ok');
  }

  function chercherLesDevis(requete: string) {
    if (!pageAutorisee('/devis')) { dire('Accès aux devis non autorisé', 'erreur'); return; }
    const base = devis.map(d => ({
      id: d.id, numero: d.numero, client: nomClient(d.clientId), referenceAffaire: d.referenceAffaire,
      chantier: d.chantier, dateCreation: d.dateCreation, statut: d.statut,
    }));
    const trouves = chercherDevis(base, requete);
    if (!trouves.length) { dire(`Aucun devis pour « ${requete} »`, 'erreur'); parler('Aucun devis trouvé.'); setResultats(null); return; }
    if (trouves.length === 1) { setResultats(null); ouvrirDevis(trouves[0].id, trouves[0].numero); return; }
    setResultats({ kind: 'devis', items: trouves });
    dire(`${trouves.length} devis — dites « ouvre le premier »…`);
    parler(`${trouves.length} devis trouvés.`);
  }

  function chercherLesProduits(requete: string) {
    const essais = [requete.toLowerCase(), ...variantesReference(requete)];
    let r: { resultats: Produit[]; total: number } = { resultats: [], total: 0 };
    for (const q of [...new Set(essais)]) {
      r = chercherProduits(produits, q, 6);
      if (r.total) break;
    }
    const partiel = produitsCharges ? '' : ' (catalogue encore en chargement)';
    if (!r.total) {
      setResultats(null);
      dire(`Aucun article pour « ${requete} »${partiel}`, 'erreur');
      parler('Aucun article trouvé.');
      return;
    }
    const items = r.resultats.map(p => ({ p, reserve: reserves[p.id] || 0 }));
    setResultats({ kind: 'produits', items, total: r.total });
    const premier = items[0];
    dire(`${r.total} article${r.total > 1 ? 's' : ''}${partiel}`);
    parler(
      phraseStock(designationProduit(premier.p) || premier.p.reference, { stock: premier.p.stock, reserve: premier.reserve, stockOdoo: premier.p.stockOdoo })
      + (r.total > 1 ? ` ${r.total} articles correspondent.` : ''),
    );
  }

  function clientNomme(nom: string): { id?: string; message?: string } {
    const libelles = clients.map(c => `${c.societe || ''} ${c.nom || ''}`.trim());
    const trouves = optionsDesignees(nom, libelles);
    if (trouves.length === 1) return { id: clients[trouves[0]].id };
    if (!trouves.length) return { message: `Client « ${nom} » introuvable` };
    return { message: `${trouves.length} clients pour « ${nom} » : ${trouves.slice(0, 3).map(i => libelles[i]).join(', ')}…` };
  }

  // ── Aiguillage ───────────────────────────────────────────────────────

  function executer(cmd: CommandeVocale, enSaisie: boolean): boolean {
    switch (cmd.kind) {
      case 'stop': onArret(); return true;
      case 'aide': setAide(a => !a); return true;
      case 'silence': changerVoix(!cmd.actif); dire(cmd.actif ? '🔇 Voix coupée' : '🔊 Voix active', 'ok'); return true;
      case 'valider': valider(); return true;
      case 'fermer': fermer(); return true;
      case 'corriger': corriger(); return true;
      case 'effacer': effacer(); return true;
      case 'suivant': deplacer(1); return true;
      case 'precedent': deplacer(-1); return true;
      case 'analyse': ouvrirAnalyse(); dire('✓ Analyse de document', 'ok'); return true;
      case 'page': {
        if (!pageAutorisee(cmd.page.path)) { dire(`Accès à « ${cmd.page.label} » non autorisé`, 'erreur'); return true; }
        if (cmd.fenetre) {
          if (!ouvrirFenetre(cmd.page.path)) dire('Fenêtre bloquée par le navigateur — Maj+clic sur le menu', 'erreur');
          else dire(`✓ ${cmd.page.label} (nouvelle fenêtre)`, 'ok');
        } else {
          navigate(cmd.page.path);
          dire(`✓ ${cmd.page.label}`, 'ok');
        }
        return true;
      }
      case 'nouvelleAction': {
        if (!pageAutorisee('/crm')) { dire('Accès au CRM non autorisé', 'erreur'); return true; }
        const params = new URLSearchParams({ tab: 'actions', nouvelle: cmd.type });
        if (cmd.client) {
          const c = clientNomme(cmd.client);
          if (c.id) params.set('clientId', c.id);
          else if (c.message) dire(c.message, 'erreur');
        }
        navigate(`/crm?${params}`);
        dire('✓ Nouvelle action — dictez le titre, puis « description … »', 'ok');
        return true;
      }
      case 'nouveauDevis':
        if (!pageAutorisee('/devis')) { dire('Accès aux devis non autorisé', 'erreur'); return true; }
        navigate('/devis?nouveau=1');
        dire('✓ Nouveau devis', 'ok');
        return true;
      case 'chercherDevis': chercherLesDevis(cmd.requete); return true;
      case 'chercherProduit': chercherLesProduits(cmd.requete); return true;
      case 'resultat': {
        const r = resultats;
        if (!r) return false;
        const item = r.items[cmd.rang - 1];
        if (!item) { dire(`Pas de résultat n° ${cmd.rang}`, 'erreur'); return true; }
        if (r.kind === 'devis') { const d = item as DevisCherche; ouvrirDevis(d.id, d.numero); }
        else ouvrirProduit((item as { p: Produit }).p);
        return true;
      }
      case 'chercher': {
        const page = cmd.page;
        if (page) {
          if (!pageAutorisee(page.path)) { dire(`Accès à « ${page.label} » non autorisé`, 'erreur'); return true; }
          if (location.pathname !== page.path.split('?')[0] || !rechercherSurPage(cmd.requete)) {
            navigate(PAGES_RECHERCHE.includes(page.path) ? `${page.path}?search=${encodeURIComponent(cmd.requete)}` : page.path);
            dire(`🔎 ${cmd.requete} — ${page.label}`, 'ok');
          }
          return true;
        }
        // « recherche de fuite… » dicté dans une note reste du texte.
        if (enSaisie) return false;
        if (!rechercherSurPage(cmd.requete)) { dire('Pas de champ de recherche sur cette page', 'erreur'); }
        return true;
      }
      case 'allerChamp':
        return essayerChamp(cmd.nom, !enSaisie);
      case 'clic':
        return cliquer(cmd.cible);
      case 'ajouter':
        return ajouter(cmd.objet);
      case 'oublier': {
        const c = commandeApprise(cmd.phrase, apprises);
        if (!c) { dire(`Aucune commande apprise « ${cmd.phrase} »`, 'erreur'); return true; }
        sauverApprises(apprises.filter(x => x !== c));
        dire(`✓ « ${c.dite} » oubliée`, 'ok');
        return true;
      }
    }
  }

  /** Les réponses pendant un apprentissage. `true` = la phrase est consommée. */
  function repondreApprentissage(t: string): boolean {
    const a = apprentissage;
    if (!a) return false;
    const r = reponse(t);
    if (a.etape === 'proposer') {
      if (r === 'oui') {
        setApprentissage({ etape: 'enregistrer', dite: a.dite, etapes: [] });
        dire('Montrez-moi : cliquez les boutons, puis dites « terminé ».', 'ok');
        parler('Montrez-moi. Cliquez, puis dites terminé.');
        return true;
      }
      if (r === 'non') { setApprentissage(null); dire("D'accord, rien n'est appris."); return true; }
      setApprentissage(null); // on passe à autre chose
      return false;
    }
    if (a.etape === 'enregistrer') {
      if (r === 'non') { setApprentissage(null); dire('Apprentissage abandonné.'); return true; }
      if (r === 'termine' || r === 'oui') {
        if (!a.etapes.length) { dire('Aucun clic vu — cliquez un bouton, ou dites « annuler ».', 'erreur'); return true; }
        setApprentissage({ etape: 'confirmer', dite: a.dite, etapes: a.etapes });
        const suite = a.etapes.map(e => e.libelle).join(', puis ');
        dire(`Retenir « ${a.dite} » = ${suite} ? Oui ou non.`);
        parler(`Je retiens : ${a.dite}, égale ${suite}. Oui ou non ?`);
        return true;
      }
      return false; // les autres phrases s'exécutent normalement pendant la démonstration
    }
    // confirmer
    if (r === 'oui') {
      const nouvelle: CommandeApprise = {
        cle: cleDePhrase(a.dite), dite: a.dite, etapes: a.etapes,
        page: location.pathname, creeLe: new Date().toISOString(),
      };
      sauverApprises([...apprises.filter(c => c.cle !== nouvelle.cle), nouvelle]);
      setApprentissage(null);
      dire(`✓ Appris : « ${a.dite} »`, 'ok');
      parler("C'est noté.");
      return true;
    }
    if (r === 'non') { setApprentissage(null); dire("Rien n'est retenu."); return true; }
    dire('Dites « oui » pour retenir, « non » pour abandonner.', 'erreur');
    return true;
  }

  // Pendant la démonstration, chaque clic hors du panneau est une étape.
  const enregistre = apprentissage?.etape === 'enregistrer';
  useEffect(() => {
    if (!enregistre) return;
    const surClic = (e: MouseEvent) => {
      const cible = e.target as HTMLElement | null;
      if (!cible || panneauRef.current?.contains(cible)) return;
      const el = cible.closest<HTMLElement>(SELECT_CLIQUABLES);
      if (!el) return;
      const libelle = texteDe(el);
      if (!libelle) { dire("Ce bouton n'a pas de nom : je ne saurai pas le retrouver.", 'erreur'); return; }
      const etape: EtapeApprise = { libelle, dansFenetre: !!el.closest('[role="dialog"], [role="alertdialog"]') };
      setApprentissage(a => (a?.etape === 'enregistrer' ? { ...a, etapes: [...a.etapes, etape] } : a));
      dire(`● ${libelle}`, 'ok');
    };
    document.addEventListener('click', surClic, true);
    return () => document.removeEventListener('click', surClic, true);
  }, [enregistre, dire]);

  function traiter(phrase: string) {
    const t = phrase.trim();
    setInterim('');
    if (!t) return;
    /* Une zone capte la dictée : tout lui revient, sans interprétation —
       sauf ce qui y met fin. « stop » ne coupe alors que la capture. */
    const cap = captureDictee?.();
    if (cap) {
      if (interpreter(t)?.kind === 'stop' || /^(?:fin de (?:la )?dictee|arrete la dictee|termine la dictee|fin dictee)$/.test(normaliser(t))) {
        finCapture?.();
        dire(`✓ Fin de la dictée dans ${cap.libelle}`, 'ok');
        return;
      }
      cap.onTexte(t);
      dire(`✎ ${t}`, 'dicte');
      return;
    }
    if (repondreApprentissage(t)) return;
    // Ce qu'on lui a appris passe avant tout : c'est l'utilisateur qui l'a voulu.
    const apprise = commandeApprise(t, apprises);
    if (apprise) { void rejouer(apprise); return; }
    const cible = champActif(panneauRef.current);
    const enSaisie = !!cible && ['texte', 'ligne', 'riche'].includes(genreDe(cible));
    const cmd = interpreter(t);
    if (cmd && executer(cmd, enSaisie)) return;
    // La page sait mieux que nous ce que veut dire un libellé de ligne dicté.
    if (cible && dicteeContextuelle?.()?.(t, cible)) { dire(`✎ ${t}`, 'dicte'); return; }
    if (essayerChamp(t, false)) return;
    if (cible) { inserer(cible, t); return; }
    if (apprentissage?.etape === 'enregistrer') { dire(`« ${t} » — pas compris (démonstration en cours).`, 'erreur'); return; }
    // Inconnue : on propose de l'apprendre.
    setApprentissage({ etape: 'proposer', dite: t });
    dire(`« ${t} » : je ne connais pas. Me l'apprendre ? Oui ou non.`, 'erreur');
    parler("Je ne connais pas cette commande. Voulez-vous me l'apprendre ?");
  }
  const traiterRef = useRef(traiter);
  traiterRef.current = traiter;
  const onArretRef = useRef(onArret);
  onArretRef.current = onArret;

  // ── Reconnaissance ───────────────────────────────────────────────────

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      toast.error('Assistant vocal non supporté sur ce navigateur (utilisez Chrome ou Edge)');
      onArretRef.current();
      return;
    }
    let vivant = true;
    let recog: SpeechRecognition | null = null;
    let relance: ReturnType<typeof setTimeout> | undefined;

    const demarrer = () => {
      if (!vivant || parleRef.current || recog) return;
      const r = new SR();
      r.lang = 'fr-FR';
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e: SpeechRecognitionEvent) => {
        let encours = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) traiterRef.current(res[0].transcript);
          else encours += res[0].transcript;
        }
        setInterim(encours);
      };
      r.onerror = (e: SpeechRecognitionErrorEvent) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
          toast.error(e.error === 'audio-capture' ? 'Aucun micro détecté' : 'Accès au micro refusé — autorisez-le dans le navigateur');
          vivant = false;
          onArretRef.current();
        } else if (e.error === 'network') {
          toast.error('Reconnaissance vocale indisponible (réseau)');
          vivant = false;
          onArretRef.current();
        }
        // no-speech, aborted : la relance de `onend` s'en charge.
      };
      // Chrome coupe l'écoute après un silence : on la relance tant que l'assistant est allumé.
      r.onend = () => {
        recog = null;
        if (vivant && !parleRef.current) relance = setTimeout(demarrer, 300);
      };
      try { r.start(); recog = r; } catch { /* déjà en cours */ }
    };

    controle.current = {
      demarrer: () => { clearTimeout(relance); demarrer(); },
      couper: () => { clearTimeout(relance); recog?.abort(); recog = null; },
    };
    demarrer();
    return () => {
      vivant = false;
      clearTimeout(relance);
      recog?.abort();
      controle.current = null;
      window.speechSynthesis?.cancel();
    };
  }, []);

  // ── Panneau ──────────────────────────────────────────────────────────

  return (
    <div
      ref={panneauRef}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.preventDefault()}
      className="fixed z-[80] pointer-events-auto bottom-20 md:bottom-4 right-4 left-4 sm:left-auto sm:w-96 rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className={cn('relative flex items-center justify-center w-7 h-7 rounded-full', parle ? 'bg-info/15 text-info' : 'bg-destructive/15 text-destructive')}>
          {!parle && <span className="absolute inset-0 rounded-full bg-destructive/20 animate-ping" />}
          {parle ? <Volume2 className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Assistant vocal</p>
          <p className="text-[11px] text-muted-foreground leading-tight">{parle ? 'Je parle…' : 'J\'écoute — dites « aide »'}</p>
        </div>
        <button type="button" onClick={() => changerVoix(!voix)} title={voix ? 'Couper la voix' : 'Lire les réponses à voix haute'} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted">
          {voix ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
        <button type="button" onClick={() => setAide(a => !a)} title="Commandes" className={cn('p-1.5 rounded-md hover:bg-muted', aide ? 'text-primary' : 'text-muted-foreground')}>
          <HelpCircle className="w-4 h-4" />
        </button>
        <button type="button" onClick={onArret} title="Arrêter l'assistant (Alt+M)" className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 py-2 space-y-1 text-xs">
        {journal.map((l, i) => (
          <p key={i} className={cn('truncate', {
            'text-muted-foreground': l.ton === 'info',
            'text-emerald-600 dark:text-emerald-400': l.ton === 'ok',
            'text-destructive': l.ton === 'erreur',
            'text-foreground': l.ton === 'dicte',
          })} title={l.texte}>{l.texte}</p>
        ))}
        <p className="italic text-muted-foreground min-h-[1rem]">{interim}</p>
      </div>

      {captureDictee?.() && (
        <div className="border-t border-border px-3 py-2 bg-destructive/5 flex items-center gap-2">
          <p className="flex-1 text-xs"><b>Dictée dans {captureDictee()!.libelle}</b> — dites « fin de dictée »</p>
          <button type="button" onClick={() => finCapture?.()} className="px-2 py-1 rounded-md text-[11px] font-semibold border border-border hover:bg-muted">Terminer</button>
        </div>
      )}

      {apprentissage && (
        <div className="border-t border-border px-3 py-2 bg-primary/5 space-y-1.5">
          <p className="text-xs font-semibold">
            {apprentissage.etape === 'proposer' && <>Apprendre « {apprentissage.dite} » ?</>}
            {apprentissage.etape === 'enregistrer' && <>Démonstration de « {apprentissage.dite} » : cliquez, puis « terminé »</>}
            {apprentissage.etape === 'confirmer' && <>Retenir « {apprentissage.dite} » ?</>}
          </p>
          {apprentissage.etape !== 'proposer' && (
            <ol className="text-[11px] text-muted-foreground list-decimal pl-4">
              {apprentissage.etapes.map((e, i) => <li key={i}>clic « {e.libelle} »{e.dansFenetre ? ' (fenêtre)' : ''}</li>)}
              {!apprentissage.etapes.length && <li className="list-none -ml-4 italic">aucun clic pour l'instant</li>}
            </ol>
          )}
          <div className="flex gap-1.5">
            <button type="button" onClick={() => repondreApprentissage(apprentissage.etape === 'enregistrer' ? 'terminé' : 'oui')}
              className="px-2 py-1 rounded-md text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
              {apprentissage.etape === 'enregistrer' ? 'Terminé' : 'Oui'}
            </button>
            <button type="button" onClick={() => repondreApprentissage('non')}
              className="px-2 py-1 rounded-md text-[11px] font-semibold border border-border hover:bg-muted">
              {apprentissage.etape === 'enregistrer' ? 'Annuler' : 'Non'}
            </button>
          </div>
        </div>
      )}

      {resultats && (
        <div className="border-t border-border max-h-64 overflow-y-auto">
          {resultats.kind === 'devis' && resultats.items.map((d, i) => (
            <button key={d.id} type="button" onClick={() => ouvrirDevis(d.id, d.numero)} className="w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-muted/60">
              <span className="text-[10px] font-semibold text-muted-foreground w-4 pt-0.5">{i + 1}</span>
              <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium truncate">{d.numero} · {d.client || '—'}</span>
                <span className="block text-[11px] text-muted-foreground truncate">
                  {[d.referenceAffaire, d.chantier, d.statut, d.dateCreation && new Date(d.dateCreation).toLocaleDateString('fr-FR')].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          ))}
          {resultats.kind === 'produits' && (
            <>
              {resultats.items.map(({ p, reserve }, i) => {
                const dispo = p.stock - reserve;
                return (
                  <button key={p.id} type="button" onClick={() => ouvrirProduit(p)} className="w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-muted/60">
                    <span className="text-[10px] font-semibold text-muted-foreground w-4 pt-0.5">{i + 1}</span>
                    <Package className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium truncate" title={p.reference}>{p.reference}</span>
                      <span className="block text-[11px] text-muted-foreground truncate" title={designationProduit(p)}>{designationProduit(p)}</span>
                      <span className="flex flex-wrap gap-x-2 text-[11px]">
                        <span className={cn('font-semibold', dispo > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>Dispo {dispo}</span>
                        <span className="text-muted-foreground">Stock {p.stock}{reserve > 0 ? ` · réservé ${reserve}` : ''}</span>
                        <span className="text-muted-foreground" title={p.stockOdooMaj ? `Lu le ${new Date(p.stockOdooMaj).toLocaleString('fr-FR')}` : undefined}>
                          {p.stockOdoo !== undefined
                            ? `Odoo ${p.stockOdoo}${p.stockOdooPrevu !== undefined ? ` (prév. ${p.stockOdooPrevu})` : ''}`
                            : 'Odoo non lu'}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
              {resultats.total > resultats.items.length && (
                <p className="px-3 py-1 text-[11px] text-muted-foreground">… {resultats.total - resultats.items.length} autres — précisez la référence</p>
              )}
            </>
          )}
        </div>
      )}

      {aide && (
        <div className="border-t border-border px-3 py-2 max-h-72 overflow-y-auto text-[11px] text-muted-foreground space-y-1.5">
          <p><b className="text-foreground">Naviguer</b> : « ouvre les devis », « va aux clients », « ouvre le stock dans une nouvelle fenêtre », « analyse de document »</p>
          <p><b className="text-foreground">CRM</b> : « nouvelle tâche », « nouvel appel pour Dupont », « nouveau rendez-vous », « ouvre les relances »</p>
          <p><b className="text-foreground">Devis</b> : « nouveau devis », « cherche le devis 112 », « ouvre le devis Eiffage Pantin », puis « ouvre le premier »</p>
          <p><b className="text-foreground">Articles</b> : « stock du produit KC1 800 », « cherche l'article A13A 700 », « combien de ECLIPSE25 en stock »</p>
          <p><b className="text-foreground">Champs</b> : « aller au titre », « description », « champ suivant », « date planifiée demain », « priorité haute », « client Dupont », « description Rappeler lundi »</p>
          <p><b className="text-foreground">Dictée</b> : parlez, le texte va dans le champ actif — « virgule », « à la ligne », « point final » ; « corrige » retire la dernière phrase, « efface tout » vide le champ</p>
          <p><b className="text-foreground">Fenêtre</b> : « valider » / « créer », « fermer », « clique sur Envoyer », « cherche Dupont »</p>
          <p><b className="text-foreground">Assistant</b> : « silence » / « parle », « stop » — raccourci Alt+M</p>
          <p><b className="text-foreground">Ajouter</b> : « ajoute une ligne », « ajoute un groupe », « ajoute une note » — le bouton « + Ligne », « Groupe »…</p>
          <p><b className="text-foreground">Apprendre</b> : une phrase inconnue → « oui », faites l'action à la souris, « terminé », « oui ». « Oublie la commande … » l'efface.</p>
          {apprises.length > 0 && (
            <div className="pt-1 border-t border-border/60">
              <p className="font-semibold text-foreground mb-0.5">Commandes apprises</p>
              {apprises.map(c => (
                <div key={c.cle} className="flex items-center gap-1">
                  <span className="flex-1 min-w-0 truncate" title={`Apprise sur ${c.page}`}>« {c.dite} » → {c.etapes.map(e => e.libelle).join(' › ')}</span>
                  <button type="button" onClick={() => sauverApprises(apprises.filter(x => x !== c))} title="Oublier" className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
