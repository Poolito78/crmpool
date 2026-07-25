/**
 * odooSync.ts
 * Génère un script JavaScript auto-exécutable à coller dans la console Odoo
 * pour créer un devis CRMPool dans Odoo (sale.order + lignes).
 */

import type { Devis, Client, Produit } from './store';
import { calculerTotalDevis } from './store';

// ── Gestion du nom Odoo par client (localStorage) ────────────────────────────

const LS_PREFIX = 'odoo_partner_';

/** Retourne le nom Odoo mémorisé pour ce client, ou le nom par défaut. */
export function getOdooPartnerName(clientId: string, defaultName: string): string {
  return localStorage.getItem(LS_PREFIX + clientId) || defaultName;
}

/** Mémorise le nom Odoo pour ce client. */
export function setOdooPartnerName(clientId: string, name: string): void {
  localStorage.setItem(LS_PREFIX + clientId, name);
}

/**
 * Ouvre un prompt pour confirmer/corriger le nom Odoo du client.
 * Retourne le nom confirmé, ou null si l'utilisateur annule.
 */
export function promptOdooPartnerName(clientId: string, defaultName: string): string | null {
  const cached = getOdooPartnerName(clientId, defaultName);
  const result = window.prompt('Nom du client dans Odoo :', cached);
  if (result === null) return null; // annulé
  const trimmed = result.trim() || cached;
  setOdooPartnerName(clientId, trimmed);
  return trimmed;
}

const ODOO_COMPANY_ID = 13;
// Frais de port : produit service dédié (ligne de transport, pas un négoce).
const ODOO_PORT_PRODUCT_ID = 362577; // FRAIS DE PORT — service générique
// Repli négoce (même méthode que le Chiffrage ISOSIGN) : article générique dont
// la désignation réelle va dans le libellé de ligne et le prix dans le P.U.
// C'est l'EXCEPTION : on ne doit y tomber que si la référence n'existe pas dans Odoo.
const ODOO_NEGOCE_CODE = 'NEG.ISO';
const ODOO_NEGOCE_ID = 575933; // « GE NEGOCE ISO » — repli si la recherche par code échoue

interface LigneScript {
  type: 'section' | 'note' | 'product';
  desc: string;
  ref?: string;   // default_code Odoo (= produit.reference dans crmpool)
  qty?: number;
  pu?: number;    // prix unitaire HT AVANT remise
  rem?: number;   // remise % (sera calculée en net, remise=0 dans Odoo)
  port?: boolean; // ligne de frais de port (produit service dédié)
}

function buildLignes(devis: Devis, produits: Produit[]): LigneScript[] {
  const result: LigneScript[] = [];

  for (const l of devis.lignes) {
    if (l.type === 'soustotal') continue;

    if (l.type === 'groupe') {
      result.push({ type: 'section', desc: l.description });
    } else if (l.type === 'texte') {
      result.push({ type: 'note', desc: l.description });
    } else {
      const produit = l.produitId ? produits.find(p => p.id === l.produitId) : null;
      const ref = (produit?.reference || '').trim();
      result.push({
        type: 'product',
        desc: l.description,
        ref: ref || undefined,
        qty: l.quantite,
        pu: l.prixUnitaireHT,
        rem: l.remise ?? 0,
      });
    }
  }

  // Frais de port comme ligne séparée si > 0
  if (devis.fraisPortHT && devis.fraisPortHT > 0) {
    result.push({
      type: 'product',
      desc: 'Frais de port',
      ref: undefined,
      qty: 1,
      pu: devis.fraisPortHT,
      rem: 0,
      port: true,
    });
  }

  return result;
}

// ── Pont navigateur (sans console) ───────────────────────────────────────────
// Même principe que le Chiffrage ISOSIGN : le devis est déposé « en attente »,
// puis un marque-page injecte le pont DANS la page Odoo (session déjà connectée)
// qui le lit et crée la commande. Deux transports, essayés dans l'ordre :
//   1. serveur local du Chiffrage (http://127.0.0.1:8765) s'il tourne ;
//   2. presse-papiers (aucune installation) — le pont le relit.
const SRV_LOCAL = 'http://127.0.0.1:8765';

export interface OdooPayload {
  source: 'crmpool';
  numero: string;
  client: string;
  contact?: string;
  ref?: string;
  validity?: string;
  note?: string;
  company_id: number;
  negoce_code: string;
  negoce_id: number;
  port_id: number;
  lines: LigneScript[];
}

/** Construit le devis à transmettre au pont (prix nets déjà calculés). */
export function buildOdooPayload(
  devis: Devis,
  client: Client,
  produits: Produit[],
  options?: { surface?: number; contactNom?: string; odooPartnerName?: string }
): OdooPayload {
  const surface = options?.surface ?? devis.surfaceGlobaleM2 ?? 0;
  const lignesProductOnly = devis.lignes.filter(l => !l.type || l.type === 'ligne');
  const totals = calculerTotalDevis(lignesProductOnly, devis.fraisPortHT || 0, devis.fraisPortTVA ?? 20);
  const coutM2 = surface > 0 ? Math.round((totals.totalTTC / surface) * 100) / 100 : 0;

  const noteLines: string[] = [];
  if (devis.systeme) noteLines.push(`Système : ${devis.systeme}`);
  if (surface > 0) noteLines.push(`Surface globale : ${surface} m²`);
  if (coutM2 > 0) noteLines.push(`Coût chantier : ${coutM2} €/m²`);

  // Prix net (remise appliquée), arrondi supérieur au centime — comme l'export console.
  const lines = buildLignes(devis, produits).map(l =>
    l.type === 'product'
      ? { ...l, pu: Math.ceil((l.pu || 0) * (1 - ((l.rem || 0) / 100)) * 100) / 100, rem: 0 }
      : l
  );

  return {
    source: 'crmpool',
    numero: devis.numero,
    client: options?.odooPartnerName || client.societe || client.nom,
    contact: options?.contactNom || undefined,
    ref: devis.referenceAffaire || undefined,
    validity: devis.dateValidite || undefined,
    note: noteLines.join('\n') || undefined,
    company_id: ODOO_COMPANY_ID,
    negoce_code: ODOO_NEGOCE_CODE,
    negoce_id: ODOO_NEGOCE_ID,
    port_id: ODOO_PORT_PRODUCT_ID,
    lines,
  };
}

/**
 * Dépose le devis pour le pont Odoo.
 * Retourne le transport réellement utilisé ('serveur' | 'presse-papiers').
 */
export async function envoyerVersOdoo(payload: OdooPayload): Promise<'serveur' | 'presse-papiers'> {
  // 1. Serveur local du Chiffrage (s'il tourne) — court délai pour ne pas bloquer.
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 900);
    const r = await fetch(`${SRV_LOCAL}/devispending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (r.ok) return 'serveur';
  } catch { /* serveur absent → presse-papiers */ }

  // 2. Presse-papiers : le pont le relit dans la page Odoo.
  await navigator.clipboard.writeText(JSON.stringify(payload));
  return 'presse-papiers';
}

export function genererScriptOdoo(
  devis: Devis,
  client: Client,
  produits: Produit[],
  options?: {
    surface?: number;
    contactNom?: string;
    odooPartnerName?: string;
  }
): string {
  const surface = options?.surface ?? devis.surfaceGlobaleM2 ?? 0;
  const lignesProductOnly = devis.lignes.filter(
    l => !l.type || l.type === 'ligne'
  );
  const totals = calculerTotalDevis(
    lignesProductOnly,
    devis.fraisPortHT || 0,
    devis.fraisPortTVA ?? 20
  );
  const coutM2 = surface > 0 ? Math.round((totals.totalTTC / surface) * 100) / 100 : 0;

  const lignes = buildLignes(devis, produits);
  const refs = [...new Set(lignes.filter(l => l.ref).map(l => l.ref as string))];

  // Texte de la note système (haut du devis)
  const noteLines: string[] = [];
  if (devis.systeme) noteLines.push(`Système : ${devis.systeme}`);
  if (surface > 0) noteLines.push(`Surface globale : ${surface} m²`);
  if (coutM2 > 0) noteLines.push(`Coût chantier : ${coutM2} €/m²`);
  const noteText = noteLines.join('\n');

  const clientName = options?.odooPartnerName || client.societe || client.nom;
  const contactNom = options?.contactNom ?? '';
  const referenceAffaire = devis.referenceAffaire ?? '';
  const dateValidite = devis.dateValidite ?? '';

  return `(async()=>{
const rpc=(model,method,args,kwargs={})=>fetch('/web/dataset/call_kw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'call',id:Math.random(),params:{model,method,args,kwargs:{...kwargs,context:{allowed_company_ids:[${ODOO_COMPANY_ID}]}}}})}).then(r=>r.json()).then(d=>{if(d.error)throw new Error(d.error?.data?.message||JSON.stringify(d.error));return d.result});

// 1. Partenaire
const compList=await rpc('res.partner','search_read',[[['name','ilike',${JSON.stringify(clientName)}],['is_company','=',true]]],{fields:['id','name'],limit:5});
if(!compList.length){alert('❌ Client "${clientName}" introuvable dans Odoo');return;}
const companyId=compList[0].id;
console.log('Partenaire:',companyId,compList[0].name);

// 2. Contact
${contactNom ? `
const ctList=await rpc('res.partner','search_read',[[['parent_id','=',companyId],['name','ilike',${JSON.stringify(contactNom)}]]],{fields:['id','name'],limit:3});
const contactId=ctList.length?ctList[0].id:null;
console.log('Contact:',contactId,ctList[0]?.name);
` : 'const contactId=null;'}

// 3. Produits par référence — même méthode que le Chiffrage ISOSIGN :
//    on résout un maximum d'articles RÉELS ; NEG.ISO n'est que le repli.
const refs=${JSON.stringify(refs)};
const prodMap={};
const orDom=(conds)=>{const d=[];for(let i=0;i<conds.length-1;i++)d.push('|');return d.concat(conds);};
if(refs.length){
  // Passe 1 — code exact
  const p1=await rpc('product.product','search_read',[[['default_code','in',refs]]],{fields:['id','default_code'],limit:500});
  p1.forEach(p=>{prodMap[p.default_code]=p.id;});
  // Passe 2 — code insensible à la casse / aux espaces (=ilike)
  let todo=refs.filter(r=>!prodMap[r]);
  if(todo.length){
    const p2=await rpc('product.product','search_read',[orDom(todo.map(r=>['default_code','=ilike',r]))],{fields:['id','default_code'],limit:500});
    todo.forEach(r=>{const hit=p2.find(p=>(p.default_code||'').trim().toLowerCase()===r.toLowerCase());if(hit)prodMap[r]=hit.id;});
  }
  // Passe 3 — le code est contenu dans la référence Odoo (préfixes/suffixes catalogue).
  //   Prudence : uniquement pour les codes assez longs ET si UN SEUL produit
  //   correspond — un mauvais article serait pire qu'une ligne négoce.
  todo=refs.filter(r=>!prodMap[r]&&r.length>=5);
  if(todo.length){
    const p3=await rpc('product.product','search_read',[orDom(todo.map(r=>['default_code','ilike',r]))],{fields:['id','default_code'],limit:500});
    todo.forEach(r=>{
      const hits=p3.filter(p=>(p.default_code||'').toLowerCase().includes(r.toLowerCase()));
      if(hits.length===1)prodMap[r]=hits[0].id;
      else if(hits.length>1)console.warn('Référence ambiguë, laissée en négoce:',r,hits.map(h=>h.default_code));
    });
  }
}
const missing=refs.filter(r=>!prodMap[r]);
console.log('Produits résolus:',Object.keys(prodMap).length+'/'+refs.length,prodMap);
if(missing.length)console.warn('Références introuvables (→ '+${JSON.stringify(ODOO_NEGOCE_CODE)}+'):',missing);

// 3a. Article négoce (repli) — recherché par code, id de secours si absent
const negList=await rpc('product.product','search_read',[[['default_code','=',${JSON.stringify(ODOO_NEGOCE_CODE)}]]],{fields:['id'],limit:1});
const negId=negList.length?negList[0].id:${ODOO_NEGOCE_ID};
console.log('Article négoce:',negId);

// 3b. TVA 20%
const taxes=await rpc('account.tax','search_read',[[['name','ilike','20'],['type_tax_use','=','sale'],['active','=',true],['company_id','=',${ODOO_COMPANY_ID}]]],{fields:['id','name'],limit:5});
const tva20Id=taxes.length?taxes[0].id:null;
console.log('TVA 20%:',tva20Id,taxes[0]?.name);

// 4. Champ Chantier (Studio)
const allF=await rpc('sale.order','fields_get',[],{attributes:['string','type']});
const chantierField=Object.keys(allF).find(k=>allF[k].string.toLowerCase().includes('chantier'))||null;
console.log('Champ chantier:',chantierField);

// 5. Créer l'en-tête
const orderVals={
  partner_id:companyId,
  partner_invoice_id:companyId,
  partner_shipping_id:companyId,
  ${dateValidite ? `validity_date:${JSON.stringify(dateValidite)},` : ''}
  ${contactNom ? 'x_studio_contact_de_laffaire:contactId||false,' : ''}
};
if(chantierField&&${JSON.stringify(!!referenceAffaire)}){orderVals[chantierField]=${JSON.stringify(referenceAffaire)};}
const orderId=await rpc('sale.order','create',[orderVals]);
console.log('Commande créée ID:',orderId);

// 6. Note système
${noteText ? `await rpc('sale.order.line','create',[{order_id:orderId,display_type:'line_note',name:${JSON.stringify(noteText)},sequence:5}]);` : '// Pas de note système'}

// 7. Lignes
const lignes=${JSON.stringify(lignes)};
let seq=10,ok=0,nArt=0,nNeg=0,errs=[],negLabels=[];
for(const l of lignes){
  seq+=10;
  try{
    let vals={order_id:orderId,sequence:seq,customer_lead:0};
    if(l.type==='section'){
      Object.assign(vals,{display_type:'line_section',name:l.desc});
    } else if(l.type==='note'){
      Object.assign(vals,{display_type:'line_note',name:l.desc});
    } else {
      const pid=l.ref?prodMap[l.ref]:null;
      // Article réel si résolu ; sinon frais de port dédié ; sinon repli négoce.
      const finalId=pid||(l.port?${ODOO_PORT_PRODUCT_ID}:negId);
      if(pid)nArt++; else if(!l.port){nNeg++;negLabels.push((l.ref?l.ref+' — ':'')+l.desc);}
      // Arrondi supérieur à 2 décimales
      const netPrice=Math.ceil((l.pu||0)*(1-((l.rem||0)/100))*100)/100;
      Object.assign(vals,{
        product_id:finalId,
        name:l.desc,
        product_uom_qty:l.qty||1,
        price_unit:netPrice,
        discount:0,
        ...(tva20Id?{tax_id:[[6,0,[tva20Id]]]}:{}),
      });
    }
    await rpc('sale.order.line','create',[vals]);
    ok++;
    console.log('Ligne OK:',(l.type==='product'?(l.ref&&prodMap[l.ref]?'✅ ':'📦 '):''),l.desc);
  }catch(e){
    console.error('ERR:',l.desc,e.message);
    errs.push(l.desc+': '+(e.message||'').substring(0,80));
  }
}

alert('✅ ${devis.numero} → Odoo\\n'+ok+'/'+lignes.length+' lignes créées'
  +'\\n✅ '+nArt+' article(s) catalogue'+(nNeg?'\\n📦 '+nNeg+' en négoce ('+${JSON.stringify(ODOO_NEGOCE_CODE)}+') :\\n  - '+negLabels.join('\\n  - '):'')
  +(errs.length?'\\n\\nErreurs:\\n'+errs.join('\\n'):''));
window.location.href='/web#model=sale.order&id='+orderId+'&view_type=form&cids=${ODOO_COMPANY_ID}&menu_id=178&action=302';
})();`;
}
