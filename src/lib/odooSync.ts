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
// Produit de fallback pour les lignes sans code Odoo (ex: pigment, surcharge, port)
const ODOO_FALLBACK_PRODUCT_ID = 362577; // FRAIS DE PORT — service générique

interface LigneScript {
  type: 'section' | 'note' | 'product';
  desc: string;
  ref?: string;   // default_code Odoo (= produit.reference dans crmpool)
  qty?: number;
  pu?: number;    // prix unitaire HT AVANT remise
  rem?: number;   // remise % (sera calculée en net, remise=0 dans Odoo)
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
      result.push({
        type: 'product',
        desc: l.description,
        ref: produit?.reference || undefined,
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
    });
  }

  return result;
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

// 3. Produits par référence
const refs=${JSON.stringify(refs)};
const prodList=refs.length?await rpc('product.product','search_read',[[['default_code','in',refs]]],{fields:['id','default_code'],limit:200}):[];
const prodMap=Object.fromEntries(prodList.map(p=>[p.default_code,p.id]));
console.log('Produits trouvés:',Object.keys(prodMap).length+'/'+refs.length,prodMap);

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
let seq=10,ok=0,errs=[];
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
      // Arrondi supérieur à 2 décimales
      const netPrice=Math.ceil((l.pu||0)*(1-((l.rem||0)/100))*100)/100;
      Object.assign(vals,{
        product_id:pid||${ODOO_FALLBACK_PRODUCT_ID},
        name:l.desc,
        product_uom_qty:l.qty||1,
        price_unit:netPrice,
        discount:0,
        ...(tva20Id?{tax_id:[[6,0,[tva20Id]]]}:{}),
      });
    }
    await rpc('sale.order.line','create',[vals]);
    ok++;
    console.log('Ligne OK:',l.desc);
  }catch(e){
    console.error('ERR:',l.desc,e.message);
    errs.push(l.desc+': '+(e.message||'').substring(0,80));
  }
}

alert('✅ ${devis.numero} → Odoo\\n'+ok+'/'+lignes.length+' lignes créées'+(errs.length?'\\n\\nErreurs:\\n'+errs.join('\\n'):'  ✓'));
window.location.href='/web#model=sale.order&id='+orderId+'&view_type=form&cids=${ODOO_COMPANY_ID}&menu_id=178&action=302';
})();`;
}
