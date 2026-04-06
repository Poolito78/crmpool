function updateStatut(id: string, newStatut: DevisType['statut']) {
  const d = devis.find(dv => dv.id === id);
  updateDevis(prev => prev.map(dv => dv.id === id ? { ...dv, statut: newStatut } : dv));
  toast.success('Statut mis à jour');
  
  if (newStatut === 'accepté' && d) {
    // Create CommandeClient
    const numero = `CMD-${new Date().getFullYear()}-${String(commandesClient.length + 1).padStart(3, '0')}`;
    const newCommandeClient: CommandeClient = {
      id: generateId(),
      devisId: d.id,
      clientId: d.clientId,
      numero,
      dateCreation: new Date().toISOString().split('T')[0],
      statut: 'commande_envoyee',
      lignes: d.lignes,
      totalHT: calculerTotalDevis(d.lignes, 0, 0).totalHT,
      totalTVA: calculerTotalDevis(d.lignes, 0, 0).totalTVA,
      totalTTC: calculerTotalDevis(d.lignes, d.fraisPortHT || 0, d.fraisPortTVA ?? 20).totalTTC,
      fraisPortHT: d.fraisPortHT || 0,
      referenceAffaire: d.referenceAffaire,
      notes: d.notes,
    };
    
    updateCommandesClient(prev => [...prev, newCommandeClient]);
    toast.success('✅ Commande client créée');
    setCommandeConfirmDevis({ ...d, statut: newStatut });
  }
}