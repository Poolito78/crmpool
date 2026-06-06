export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      client_contacts: {
        Row: {
          client_id: string | null
          created_at: string | null
          email: string | null
          fonction: string | null
          id: string
          nom: string
          principal: boolean | null
          tel: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          email?: string | null
          fonction?: string | null
          id: string
          nom: string
          principal?: boolean | null
          tel?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          email?: string | null
          fonction?: string | null
          id?: string
          nom?: string
          principal?: boolean | null
          tel?: string | null
        }
        Relationships: []
      }
      client_livraisons: {
        Row: {
          client_id: string | null
          cp: string | null
          created_at: string | null
          id: string
          nom_site: string | null
          principal: boolean | null
          rue: string | null
          ville: string | null
        }
        Insert: {
          client_id?: string | null
          cp?: string | null
          created_at?: string | null
          id: string
          nom_site?: string | null
          principal?: boolean | null
          rue?: string | null
          ville?: string | null
        }
        Update: {
          client_id?: string | null
          cp?: string | null
          created_at?: string | null
          id?: string
          nom_site?: string | null
          principal?: boolean | null
          rue?: string | null
          ville?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          adresse: string
          adresses_livraison: Json | null
          capital_social: string | null
          code_ape: string | null
          code_postal: string
          contacts: Json | null
          created_at: string
          date_creation: string
          date_creation_entreprise: string | null
          delai_reglement: string | null
          email: string
          est_revendeur: boolean | null
          forme_juridique: string | null
          id: string
          libelle_ape: string | null
          nom: string
          notes: string | null
          rcs: string | null
          remises_par_categorie: Json | null
          siret: string | null
          societe: string | null
          telephone: string
          telephone_mobile: string | null
          tranche_effectif: string | null
          tva_intra: string | null
          user_id: string
          ville: string
        }
        Insert: {
          adresse?: string
          adresses_livraison?: Json | null
          capital_social?: string | null
          code_ape?: string | null
          code_postal?: string
          contacts?: Json | null
          created_at?: string
          date_creation?: string
          date_creation_entreprise?: string | null
          delai_reglement?: string | null
          email?: string
          est_revendeur?: boolean | null
          forme_juridique?: string | null
          id?: string
          libelle_ape?: string | null
          nom: string
          notes?: string | null
          rcs?: string | null
          remises_par_categorie?: Json | null
          siret?: string | null
          societe?: string | null
          telephone?: string
          telephone_mobile?: string | null
          tranche_effectif?: string | null
          tva_intra?: string | null
          user_id: string
          ville?: string
        }
        Update: {
          adresse?: string
          adresses_livraison?: Json | null
          capital_social?: string | null
          code_ape?: string | null
          code_postal?: string
          contacts?: Json | null
          created_at?: string
          date_creation?: string
          date_creation_entreprise?: string | null
          delai_reglement?: string | null
          email?: string
          est_revendeur?: boolean | null
          forme_juridique?: string | null
          id?: string
          libelle_ape?: string | null
          nom?: string
          notes?: string | null
          rcs?: string | null
          remises_par_categorie?: Json | null
          siret?: string | null
          societe?: string | null
          telephone?: string
          telephone_mobile?: string | null
          tranche_effectif?: string | null
          tva_intra?: string | null
          user_id?: string
          ville?: string
        }
        Relationships: []
      }
      commandes: {
        Row: {
          created_at: string | null
          date: string | null
          date_livraison: string | null
          fournisseur_id: string | null
          id: string
          lignes: Json | null
          notes: string | null
          num: string | null
          statut: string | null
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          date_livraison?: string | null
          fournisseur_id?: string | null
          id: string
          lignes?: Json | null
          notes?: string | null
          num?: string | null
          statut?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string | null
          date_livraison?: string | null
          fournisseur_id?: string | null
          id?: string
          lignes?: Json | null
          notes?: string | null
          num?: string | null
          statut?: string | null
        }
        Relationships: []
      }
      commandes_client: {
        Row: {
          adresse_livraison_id: string | null
          client_id: string
          created_at: string
          date_creation: string
          date_depart: string | null
          date_echeance: string | null
          date_livraison: string | null
          date_livraison_prevue: string | null
          delai_reglement: string | null
          devis_id: string | null
          frais_port_ht: number
          id: string
          lignes: Json
          notes: string | null
          numero: string
          reference_affaire: string | null
          statut: string
          total_ht: number
          total_ttc: number
          total_tva: number
          user_id: string
        }
        Insert: {
          adresse_livraison_id?: string | null
          client_id: string
          created_at?: string
          date_creation?: string
          date_depart?: string | null
          date_echeance?: string | null
          date_livraison?: string | null
          date_livraison_prevue?: string | null
          delai_reglement?: string | null
          devis_id?: string | null
          frais_port_ht?: number
          id?: string
          lignes?: Json
          notes?: string | null
          numero?: string
          reference_affaire?: string | null
          statut?: string
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          user_id: string
        }
        Update: {
          adresse_livraison_id?: string | null
          client_id?: string
          created_at?: string
          date_creation?: string
          date_depart?: string | null
          date_echeance?: string | null
          date_livraison?: string | null
          date_livraison_prevue?: string | null
          delai_reglement?: string | null
          devis_id?: string | null
          frais_port_ht?: number
          id?: string
          lignes?: Json
          notes?: string | null
          numero?: string
          reference_affaire?: string | null
          statut?: string
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commandes_client_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_client_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "devis"
            referencedColumns: ["id"]
          },
        ]
      }
      commandes_fournisseur: {
        Row: {
          created_at: string
          date_creation: string
          date_echeance: string | null
          devis_id: string | null
          fournisseur_id: string
          frais_transport: number
          id: string
          lignes: Json
          notes: string | null
          numero: string
          statut: string
          total_ht: number
          total_ttc: number
          user_id: string
        }
        Insert: {
          created_at?: string
          date_creation?: string
          date_echeance?: string | null
          devis_id?: string | null
          fournisseur_id: string
          frais_transport?: number
          id?: string
          lignes?: Json
          notes?: string | null
          numero?: string
          statut?: string
          total_ht?: number
          total_ttc?: number
          user_id: string
        }
        Update: {
          created_at?: string
          date_creation?: string
          date_echeance?: string | null
          devis_id?: string | null
          fournisseur_id?: string
          frais_transport?: number
          id?: string
          lignes?: Json
          notes?: string | null
          numero?: string
          statut?: string
          total_ht?: number
          total_ttc?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commandes_fournisseur_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "devis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_fournisseur_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
        ]
      }
      concurrent_notes: {
        Row: {
          concurrent_id: string
          contenu: string | null
          created_at: string | null
          created_by: string | null
          created_by_email: string | null
          date_note: string | null
          id: string
          source: string | null
          titre: string
          updated_at: string | null
        }
        Insert: {
          concurrent_id: string
          contenu?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_email?: string | null
          date_note?: string | null
          id?: string
          source?: string | null
          titre: string
          updated_at?: string | null
        }
        Update: {
          concurrent_id?: string
          contenu?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_email?: string | null
          date_note?: string | null
          id?: string
          source?: string | null
          titre?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concurrent_notes_concurrent_id_fkey"
            columns: ["concurrent_id"]
            isOneToOne: false
            referencedRelation: "concurrents"
            referencedColumns: ["id"]
          },
        ]
      }
      concurrent_produits: {
        Row: {
          categorie: string | null
          client_id: string | null
          client_nom: string | null
          concurrent_id: string
          created_at: string | null
          created_by: string | null
          created_by_email: string | null
          date_renseignement: string | null
          description: string | null
          id: string
          informateur: string | null
          nom: string
          prix_ht: number | null
          reference: string | null
          updated_at: string | null
        }
        Insert: {
          categorie?: string | null
          client_id?: string | null
          client_nom?: string | null
          concurrent_id: string
          created_at?: string | null
          created_by?: string | null
          created_by_email?: string | null
          date_renseignement?: string | null
          description?: string | null
          id?: string
          informateur?: string | null
          nom: string
          prix_ht?: number | null
          reference?: string | null
          updated_at?: string | null
        }
        Update: {
          categorie?: string | null
          client_id?: string | null
          client_nom?: string | null
          concurrent_id?: string
          created_at?: string | null
          created_by?: string | null
          created_by_email?: string | null
          date_renseignement?: string | null
          description?: string | null
          id?: string
          informateur?: string | null
          nom?: string
          prix_ht?: number | null
          reference?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concurrent_produits_concurrent_id_fkey"
            columns: ["concurrent_id"]
            isOneToOne: false
            referencedRelation: "concurrents"
            referencedColumns: ["id"]
          },
        ]
      }
      concurrents: {
        Row: {
          created_at: string | null
          created_by: string | null
          created_by_email: string | null
          email: string | null
          id: string
          nom: string
          notes: string | null
          site_web: string | null
          telephone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          created_by_email?: string | null
          email?: string | null
          id?: string
          nom: string
          notes?: string | null
          site_web?: string | null
          telephone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          created_by_email?: string | null
          email?: string | null
          id?: string
          nom?: string
          notes?: string | null
          site_web?: string | null
          telephone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_actions: {
        Row: {
          client_id: string | null
          concurrents: Json | null
          created_at: string | null
          date_planifiee: string | null
          date_realisee: string | null
          description: string | null
          devis_id: string | null
          id: string
          priorite: string
          statut: string
          titre: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          client_id?: string | null
          concurrents?: Json | null
          created_at?: string | null
          date_planifiee?: string | null
          date_realisee?: string | null
          description?: string | null
          devis_id?: string | null
          id?: string
          priorite?: string
          statut?: string
          titre: string
          type?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string | null
          concurrents?: Json | null
          created_at?: string | null
          date_planifiee?: string | null
          date_realisee?: string | null
          description?: string | null
          devis_id?: string | null
          id?: string
          priorite?: string
          statut?: string
          titre?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_actions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_actions_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "devis"
            referencedColumns: ["id"]
          },
        ]
      }
      devis: {
        Row: {
          adresse_livraison_id: string | null
          archive_commentaire: string | null
          archive_concurrents: Json | null
          archive_date: string | null
          archive_raison: string | null
          client_id: string | null
          conditions: string | null
          contact_id: string | null
          contact_livraison_id: string | null
          created_at: string
          date_creation: string
          date_envoi: string | null
          date_realisation: string | null
          date_validite: string | null
          frais_port_auto: boolean | null
          frais_port_ht: number | null
          frais_port_tva: number | null
          id: string
          lignes: Json
          mo_content: string | null
          mode_calcul: string | null
          notes: string | null
          numero: string
          probabilite_reussite: number | null
          raison_refus: string | null
          reference_affaire: string | null
          statut: string
          surface_globale_m2: number | null
          systeme: string | null
          user_id: string
        }
        Insert: {
          adresse_livraison_id?: string | null
          archive_commentaire?: string | null
          archive_concurrents?: Json | null
          archive_date?: string | null
          archive_raison?: string | null
          client_id?: string | null
          conditions?: string | null
          contact_id?: string | null
          contact_livraison_id?: string | null
          created_at?: string
          date_creation?: string
          date_envoi?: string | null
          date_realisation?: string | null
          date_validite?: string | null
          frais_port_auto?: boolean | null
          frais_port_ht?: number | null
          frais_port_tva?: number | null
          id?: string
          lignes?: Json
          mo_content?: string | null
          mode_calcul?: string | null
          notes?: string | null
          numero?: string
          probabilite_reussite?: number | null
          raison_refus?: string | null
          reference_affaire?: string | null
          statut?: string
          surface_globale_m2?: number | null
          systeme?: string | null
          user_id: string
        }
        Update: {
          adresse_livraison_id?: string | null
          archive_commentaire?: string | null
          archive_concurrents?: Json | null
          archive_date?: string | null
          archive_raison?: string | null
          client_id?: string | null
          conditions?: string | null
          contact_id?: string | null
          contact_livraison_id?: string | null
          created_at?: string
          date_creation?: string
          date_envoi?: string | null
          date_realisation?: string | null
          date_validite?: string | null
          frais_port_auto?: boolean | null
          frais_port_ht?: number | null
          frais_port_tva?: number | null
          id?: string
          lignes?: Json
          mo_content?: string | null
          mode_calcul?: string | null
          notes?: string | null
          numero?: string
          probabilite_reussite?: number | null
          raison_refus?: string | null
          reference_affaire?: string | null
          statut?: string
          surface_globale_m2?: number | null
          systeme?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devis_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      devis_message_templates: {
        Row: {
          contenu: string
          created_at: string | null
          id: string
          nom: string
          raison_archive: string | null
          user_id: string | null
        }
        Insert: {
          contenu: string
          created_at?: string | null
          id: string
          nom: string
          raison_archive?: string | null
          user_id?: string | null
        }
        Update: {
          contenu?: string
          created_at?: string | null
          id?: string
          nom?: string
          raison_archive?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      devis_pieces_jointes: {
        Row: {
          confidentiel: boolean
          contenu: string | null
          date: string
          devis_id: string
          fichier_mime: string | null
          fichier_nom: string | null
          fichier_taille: number | null
          fichier_url: string | null
          id: string
          ligne_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          confidentiel?: boolean
          contenu?: string | null
          date?: string
          devis_id: string
          fichier_mime?: string | null
          fichier_nom?: string | null
          fichier_taille?: number | null
          fichier_url?: string | null
          id?: string
          ligne_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          confidentiel?: boolean
          contenu?: string | null
          date?: string
          devis_id?: string
          fichier_mime?: string | null
          fichier_nom?: string | null
          fichier_taille?: number | null
          fichier_url?: string | null
          id?: string
          ligne_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      entrepots: {
        Row: {
          adresse: string | null
          code_postal: string | null
          created_at: string
          est_defaut: boolean
          id: string
          nom: string
          notes: string | null
          user_id: string | null
          ville: string | null
        }
        Insert: {
          adresse?: string | null
          code_postal?: string | null
          created_at?: string
          est_defaut?: boolean
          id?: string
          nom: string
          notes?: string | null
          user_id?: string | null
          ville?: string | null
        }
        Update: {
          adresse?: string | null
          code_postal?: string | null
          created_at?: string
          est_defaut?: boolean
          id?: string
          nom?: string
          notes?: string | null
          user_id?: string | null
          ville?: string | null
        }
        Relationships: []
      }
      factures: {
        Row: {
          client_id: string | null
          created_at: string | null
          date: string | null
          date_echeance: string | null
          id: string
          lignes: Json | null
          notes: string | null
          num: string | null
          statut: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          date?: string | null
          date_echeance?: string | null
          id: string
          lignes?: Json | null
          notes?: string | null
          num?: string | null
          statut?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          date?: string | null
          date_echeance?: string | null
          id?: string
          lignes?: Json | null
          notes?: string | null
          num?: string | null
          statut?: string | null
        }
        Relationships: []
      }
      factures_client: {
        Row: {
          client_id: string
          commande_client_id: string | null
          created_at: string
          date_creation: string
          date_echeance: string | null
          date_paiement: string | null
          devis_id: string | null
          est_proforma: boolean
          frais_port_ht: number
          id: string
          lignes: Json
          notes: string | null
          numero: string
          reference_affaire: string | null
          statut: string
          total_ht: number
          total_ttc: number
          total_tva: number
          user_id: string
        }
        Insert: {
          client_id: string
          commande_client_id?: string | null
          created_at?: string
          date_creation?: string
          date_echeance?: string | null
          date_paiement?: string | null
          devis_id?: string | null
          est_proforma?: boolean
          frais_port_ht?: number
          id?: string
          lignes?: Json
          notes?: string | null
          numero: string
          reference_affaire?: string | null
          statut?: string
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          user_id: string
        }
        Update: {
          client_id?: string
          commande_client_id?: string | null
          created_at?: string
          date_creation?: string
          date_echeance?: string | null
          date_paiement?: string | null
          devis_id?: string | null
          est_proforma?: boolean
          frais_port_ht?: number
          id?: string
          lignes?: Json
          notes?: string | null
          numero?: string
          reference_affaire?: string | null
          statut?: string
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factures_client_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_client_commande_client_id_fkey"
            columns: ["commande_client_id"]
            isOneToOne: false
            referencedRelation: "commandes_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_client_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "devis"
            referencedColumns: ["id"]
          },
        ]
      }
      factures_fournisseur: {
        Row: {
          commande_fournisseur_id: string | null
          created_at: string
          date_echeance: string | null
          date_paiement: string | null
          date_reception: string
          fournisseur_id: string
          id: string
          montant_ht: number
          montant_ttc: number
          montant_tva: number
          notes: string | null
          numero: string
          numero_facture: string
          statut: string
          user_id: string
        }
        Insert: {
          commande_fournisseur_id?: string | null
          created_at?: string
          date_echeance?: string | null
          date_paiement?: string | null
          date_reception?: string
          fournisseur_id: string
          id?: string
          montant_ht?: number
          montant_ttc?: number
          montant_tva?: number
          notes?: string | null
          numero: string
          numero_facture?: string
          statut?: string
          user_id: string
        }
        Update: {
          commande_fournisseur_id?: string | null
          created_at?: string
          date_echeance?: string | null
          date_paiement?: string | null
          date_reception?: string
          fournisseur_id?: string
          id?: string
          montant_ht?: number
          montant_ttc?: number
          montant_tva?: number
          notes?: string | null
          numero?: string
          numero_facture?: string
          statut?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factures_fournisseur_commande_fournisseur_id_fkey"
            columns: ["commande_fournisseur_id"]
            isOneToOne: false
            referencedRelation: "commandes_fournisseur"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_fournisseur_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
        ]
      }
      fournisseur_contacts: {
        Row: {
          created_at: string | null
          email: string | null
          fonction: string | null
          fournisseur_id: string | null
          id: string
          nom: string
          principal: boolean | null
          tel: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          fonction?: string | null
          fournisseur_id?: string | null
          id: string
          nom: string
          principal?: boolean | null
          tel?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          fonction?: string | null
          fournisseur_id?: string | null
          id?: string
          nom?: string
          principal?: boolean | null
          tel?: string | null
        }
        Relationships: []
      }
      fournisseurs: {
        Row: {
          adresse: string
          code_postal: string
          cout_transport: number
          created_at: string
          date_creation: string
          delai_expedition: number | null
          delai_reglement: string
          email: string
          est_stockiste: boolean | null
          franco_port: number
          id: string
          nom: string
          notes: string | null
          societe: string
          telephone: string
          telephone_mobile: string | null
          user_id: string
          ville: string
        }
        Insert: {
          adresse?: string
          code_postal?: string
          cout_transport?: number
          created_at?: string
          date_creation?: string
          delai_expedition?: number | null
          delai_reglement?: string
          email?: string
          est_stockiste?: boolean | null
          franco_port?: number
          id?: string
          nom: string
          notes?: string | null
          societe?: string
          telephone?: string
          telephone_mobile?: string | null
          user_id: string
          ville?: string
        }
        Update: {
          adresse?: string
          code_postal?: string
          cout_transport?: number
          created_at?: string
          date_creation?: string
          delai_expedition?: number | null
          delai_reglement?: string
          email?: string
          est_stockiste?: boolean | null
          franco_port?: number
          id?: string
          nom?: string
          notes?: string | null
          societe?: string
          telephone?: string
          telephone_mobile?: string | null
          user_id?: string
          ville?: string
        }
        Relationships: []
      }
      historique: {
        Row: {
          action: string
          date: string
          details: Json | null
          entite_id: string
          entite_numero: string | null
          entite_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          date?: string
          details?: Json | null
          entite_id: string
          entite_numero?: string | null
          entite_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          date?: string
          details?: Json | null
          entite_id?: string
          entite_numero?: string | null
          entite_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      produit_fournisseurs: {
        Row: {
          conditionnement_min: number | null
          created_at: string
          delai_livraison: number | null
          est_prioritaire: boolean | null
          fournisseur_id: string
          id: string
          paliers_port: Json | null
          prix_achat: number
          produit_id: string
          reference_fournisseur: string | null
          user_id: string
        }
        Insert: {
          conditionnement_min?: number | null
          created_at?: string
          delai_livraison?: number | null
          est_prioritaire?: boolean | null
          fournisseur_id: string
          id?: string
          paliers_port?: Json | null
          prix_achat?: number
          produit_id: string
          reference_fournisseur?: string | null
          user_id: string
        }
        Update: {
          conditionnement_min?: number | null
          created_at?: string
          delai_livraison?: number | null
          est_prioritaire?: boolean | null
          fournisseur_id?: string
          id?: string
          paliers_port?: Json | null
          prix_achat?: number
          produit_id?: string
          reference_fournisseur?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produit_fournisseurs_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produit_fournisseurs_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      produits: {
        Row: {
          categorie: string | null
          coeff_revendeur: number
          coefficient: number
          composants: Json | null
          consommation: number | null
          created_at: string
          date_creation: string
          description: string
          description_detaillee: string | null
          disponible_vente: boolean
          fiche_link_label: string | null
          fiche_url: string | null
          fournisseur_id: string | null
          id: string
          lignes_kit: Json | null
          paliers_prix: Json | null
          poids: number | null
          prix_achat: number
          prix_ht: number
          prix_revendeur: number
          proprietaire: string | null
          proprietaire_fournisseur_id: string | null
          reference: string
          remise_revendeur: number
          stock: number
          stock_min: number
          tva: number
          type_kit: boolean | null
          unite: string
          user_id: string
          variantes: Json | null
        }
        Insert: {
          categorie?: string | null
          coeff_revendeur?: number
          coefficient?: number
          composants?: Json | null
          consommation?: number | null
          created_at?: string
          date_creation?: string
          description?: string
          description_detaillee?: string | null
          disponible_vente?: boolean
          fiche_link_label?: string | null
          fiche_url?: string | null
          fournisseur_id?: string | null
          id?: string
          lignes_kit?: Json | null
          paliers_prix?: Json | null
          poids?: number | null
          prix_achat?: number
          prix_ht?: number
          prix_revendeur?: number
          proprietaire?: string | null
          proprietaire_fournisseur_id?: string | null
          reference?: string
          remise_revendeur?: number
          stock?: number
          stock_min?: number
          tva?: number
          type_kit?: boolean | null
          unite?: string
          user_id: string
          variantes?: Json | null
        }
        Update: {
          categorie?: string | null
          coeff_revendeur?: number
          coefficient?: number
          composants?: Json | null
          consommation?: number | null
          created_at?: string
          date_creation?: string
          description?: string
          description_detaillee?: string | null
          disponible_vente?: boolean
          fiche_link_label?: string | null
          fiche_url?: string | null
          fournisseur_id?: string | null
          id?: string
          lignes_kit?: Json | null
          paliers_prix?: Json | null
          poids?: number | null
          prix_achat?: number
          prix_ht?: number
          prix_revendeur?: number
          proprietaire?: string | null
          proprietaire_fournisseur_id?: string | null
          reference?: string
          remise_revendeur?: number
          stock?: number
          stock_min?: number
          tva?: number
          type_kit?: boolean | null
          unite?: string
          user_id?: string
          variantes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "produits_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_entrepot: {
        Row: {
          entrepot_id: string
          produit_id: string
          stock: number
        }
        Insert: {
          entrepot_id: string
          produit_id: string
          stock?: number
        }
        Update: {
          entrepot_id?: string
          produit_id?: string
          stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_entrepot_entrepot_id_fkey"
            columns: ["entrepot_id"]
            isOneToOne: false
            referencedRelation: "entrepots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entrepot_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_baremes: {
        Row: {
          created_at: string | null
          id: string
          ordre: number
          poids_max: number | null
          poids_min: number
          prix_ht: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          ordre?: number
          poids_max?: number | null
          poids_min?: number
          prix_ht: number
        }
        Update: {
          created_at?: string | null
          id?: string
          ordre?: number
          poids_max?: number | null
          poids_min?: number
          prix_ht?: number
        }
        Relationships: []
      }
      veille_roles: {
        Row: {
          crm_access: boolean | null
          display_name: string | null
          email: string | null
          invited_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          crm_access?: boolean | null
          display_name?: string | null
          email?: string | null
          invited_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          crm_access?: boolean | null
          display_name?: string | null
          email?: string | null
          invited_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_veille_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
