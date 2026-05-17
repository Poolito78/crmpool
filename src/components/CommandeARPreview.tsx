/**
 * CommandeARPreview — Rendu HTML d'un Accusé de Réception de commande client.
 * Même charte graphique que DevisPreview, utilisé pour la génération PDF.
 */
import logoIsofloor from '@/assets/logo-isofloor.png';
import { type CommandeClient, type Client, calculerTotalLigne, calculerTotalDevis, formatMontant, formatDate } from '@/lib/store';

const ISOSIGN_ADRESSE = [
  'ISOSIGN',
  'ZA du Monay',
  '71210 SAINT-EUSÈBE',
  'France',
  'Tél. : 03 85 77 07 25',
  'isosign@isosign.fr',
];

interface Props {
  commande: CommandeClient;
  client?: Client;
  dateDepart?: string;
  dateLivraison?: string;
}

export default function CommandeARPreview({ commande, client, dateDepart, dateLivraison }: Props) {
  const totaux = calculerTotalDevis(commande.lignes, commande.fraisPortHT, 20);

  // Adresse de livraison éventuelle
  const adrLivraison = commande.adresseLivraisonId
    ? client?.adressesLivraison?.find(a => a.id === commande.adresseLivraisonId)
    : null;

  const lignesVisibles = commande.lignes.filter(
    l => !l.type || l.type === 'ligne' || l.type === 'groupe' || l.type === 'texte' || l.type === 'soustotal'
  );

  return (
    <div
      style={{
        fontFamily: 'Arial, sans-serif',
        fontSize: '10px',
        color: '#1a1a1a',
        backgroundColor: '#ffffff',
        width: '794px',
        padding: '28px 32px 20px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── En-tête ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
        <img src={logoIsofloor} alt="ISOSIGN" style={{ height: '40px', objectFit: 'contain' }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1a1a1a', letterSpacing: '1px' }}>
            ACCUSÉ DE RÉCEPTION
          </div>
          <div style={{ fontSize: '13px', color: '#0050C8', fontWeight: 'bold', marginTop: '2px' }}>
            {commande.numero}
          </div>
          <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
            Date : {formatDate(commande.dateCreation)}
          </div>
          {commande.referenceAffaire && (
            <div style={{ fontSize: '9px', color: '#666' }}>
              Réf. affaire : {commande.referenceAffaire}
            </div>
          )}
        </div>
      </div>

      {/* Trait rouge */}
      <div style={{ height: '2px', backgroundColor: '#CC0000', marginBottom: '16px' }} />

      {/* ── Adresses ── */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '18px' }}>
        {/* ISOSIGN */}
        <div style={{ flex: 1, padding: '10px 12px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f9f9f9' }}>
          <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#999', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expéditeur</div>
          {ISOSIGN_ADRESSE.map((l, i) => (
            <div key={i} style={{ fontWeight: i === 0 ? 'bold' : 'normal', fontSize: i === 0 ? '11px' : '9px' }}>{l}</div>
          ))}
        </div>

        {/* Client */}
        <div style={{ flex: 1.3, padding: '10px 12px', border: '2px solid #CC0000', borderRadius: '4px' }}>
          <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#999', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Client</div>
          {client?.societe && <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{client.societe}</div>}
          <div style={{ fontWeight: client?.societe ? 'normal' : 'bold', fontSize: client?.societe ? '9px' : '11px' }}>{client?.nom || '—'}</div>
          {(adrLivraison ?? client) && (
            <>
              <div style={{ fontSize: '9px', marginTop: '2px' }}>{adrLivraison?.adresse || client?.adresse}</div>
              <div style={{ fontSize: '9px' }}>
                {adrLivraison
                  ? `${adrLivraison.codePostal} ${adrLivraison.ville}`
                  : `${client?.codePostal} ${client?.ville}`}
              </div>
            </>
          )}
          {client?.email && <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>{client.email}</div>}
          {client?.telephone && <div style={{ fontSize: '9px', color: '#555' }}>{client.telephone}</div>}
        </div>
      </div>

      {/* ── Bloc dates ── */}
      {(dateDepart || dateLivraison) && (
        <div style={{
          display: 'flex', gap: '16px', marginBottom: '14px',
          padding: '8px 12px', backgroundColor: '#f0f7ff', borderRadius: '4px', border: '1px solid #c8dff8',
        }}>
          {dateDepart && (
            <div>
              <span style={{ fontSize: '8px', color: '#555', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>Date de départ</span>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0050C8', marginTop: '1px' }}>{formatDate(dateDepart)}</div>
            </div>
          )}
          {dateLivraison && (
            <>
              <div style={{ width: '1px', backgroundColor: '#c8dff8' }} />
              <div>
                <span style={{ fontSize: '8px', color: '#555', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>Livraison prévue</span>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#CC0000', marginTop: '1px' }}>{formatDate(dateLivraison)}</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tableau des lignes ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '9.5px' }}>
        <thead>
          <tr style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 'bold' }}>Description</th>
            <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 'bold', width: '50px' }}>Qté</th>
            <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 'bold', width: '40px' }}>Unité</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 'bold', width: '80px' }}>PU HT</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 'bold', width: '60px' }}>Rem. %</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 'bold', width: '85px' }}>Total HT</th>
          </tr>
        </thead>
        <tbody>
          {lignesVisibles.map((l, idx) => {
            const t = calculerTotalLigne(l);
            const isGroupe = l.type === 'groupe';
            const isSousTotal = l.type === 'soustotal';
            const isTexte = l.type === 'texte';
            const bg = isGroupe ? '#e8e8e8' : idx % 2 === 0 ? '#ffffff' : '#f8f8f8';

            if (isGroupe) return (
              <tr key={l.id} style={{ backgroundColor: '#e8e8e8' }}>
                <td colSpan={6} style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: '10px', borderTop: '1px solid #ccc' }}>{l.description}</td>
              </tr>
            );
            if (isSousTotal) return (
              <tr key={l.id} style={{ backgroundColor: '#f0f0f0' }}>
                <td colSpan={5} style={{ padding: '4px 8px', fontStyle: 'italic', textAlign: 'right', fontSize: '9px', borderTop: '1px dashed #ccc' }}>
                  {l.description || 'Sous-total'}
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 'bold', borderTop: '1px dashed #ccc' }}>
                  {formatMontant(t.totalHT)}
                </td>
              </tr>
            );
            if (isTexte) return (
              <tr key={l.id} style={{ backgroundColor: bg }}>
                <td colSpan={6} style={{ padding: '4px 8px', fontStyle: 'italic', color: '#555', fontSize: '9px' }}>{l.description}</td>
              </tr>
            );
            return (
              <tr key={l.id} style={{ backgroundColor: bg }}>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #eee' }}>{l.description}</td>
                <td style={{ padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{l.quantite}</td>
                <td style={{ padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid #eee', color: '#555' }}>{l.unite}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{formatMontant(l.prixUnitaireHT)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', borderBottom: '1px solid #eee', color: '#555' }}>
                  {l.remise > 0 ? `${l.remise}%` : '—'}
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 'bold', borderBottom: '1px solid #eee' }}>{formatMontant(t.totalHT)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Totaux ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <div style={{ width: '240px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eee', fontSize: '9.5px' }}>
            <span style={{ color: '#555' }}>Total HT</span>
            <span style={{ fontWeight: 'bold' }}>{formatMontant(totaux.totalHT)}</span>
          </div>
          {commande.fraisPortHT > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eee', fontSize: '9.5px' }}>
              <span style={{ color: '#555' }}>Frais de port HT</span>
              <span>{formatMontant(commande.fraisPortHT)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eee', fontSize: '9.5px' }}>
            <span style={{ color: '#555' }}>TVA</span>
            <span>{formatMontant(totaux.totalTVA)}</span>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '8px 10px', marginTop: '4px',
            backgroundColor: '#CC0000', borderRadius: '4px', color: '#ffffff',
            fontSize: '12px', fontWeight: 'bold',
          }}>
            <span>Total TTC</span>
            <span>{formatMontant(totaux.totalTTC)}</span>
          </div>
        </div>
      </div>

      {/* ── Notes ── */}
      {commande.notes && (
        <div style={{ padding: '8px 12px', backgroundColor: '#f9f9f9', border: '1px solid #eee', borderRadius: '4px', marginBottom: '12px', fontSize: '9px', color: '#444' }}>
          <strong>Notes :</strong> {commande.notes}
        </div>
      )}

      {/* ── Pied de page ── */}
      <div style={{ borderTop: '1px solid #ddd', paddingTop: '8px', textAlign: 'center', fontSize: '7.5px', color: '#999' }}>
        ISOSIGN® • ZA du Monay - 71210 SAINT-EUSÈBE - France - Tél. : 03 85 77 07 25 • Fax : 03 85 55 41 14 • isosign@isosign.fr • www.isosign.fr
        <br />
        SAS au capital de 40 000 € • RCS Chalon-sur-Saône 494922313 • SIRET 4949223130005 • APE 4669B • TVA FR76494922313
      </div>
    </div>
  );
}
