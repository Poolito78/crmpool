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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          adresse: string
          adresses_livraison: Json | null
          code_postal: string
          created_at: string
          date_creation: string
          email: string
          est_revendeur: boolean | null
          id: string
          nom: string
          notes: string | null
          remises_par_categorie: Json | null
          societe: string | null
          telephone: string
          user_id: string
          ville: string
        }
        Insert: {
          adresse?: string
          adresses_livraison?: Json | null
          code_postal?: string
          created_at?: string
          date_creation?: string
          email?: string
          est_revendeur?: boolean | null
          id?: string
          nom: string
          notes?: string | null
          remises_par_categorie?: Json | null
          societe?: string | null
          telephone?: string
          user_id: string
          ville?: string
        }
        Update: {
          adresse?: string
          adresses_livraison?: Json | null
          code_postal?: string
          created_at?: string
          date_creation?: string
          email?: string
          est_revendeur?: boolean | null
          id?: string
          nom?: string
          notes?: string | null
          remises_par_categorie?: Json | null
          societe?: string | null
          telephone?: string
          user_id?: string
          ville?: string
        }
        Relationships: []
      }
      commandes_client: {
        Row: {
          client_id: string
          created_at: string
          date_creation: string
          date_depart: string | null
          date_echeance: string | null
          date_livraison_prevue: string | null
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
          client_id: string
          created_at?: string
          date_creation?: string
          date_depart?: string | null
          date_echeance?: string | null
          date_livraison_prevue?: string | null
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
          client_id?: string
          created_at?: string
          date_creation?: string
          date_depart?: string | null
          date_echeance?: string | null
          date_livraison_prevue?: string | null
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
      devis: {
        Row: {
          adresse_livraison_id: string | null
          client_id: string | null
          conditions: string | null
          created_at: string
          date_creation: string
          date_validite: string | null
          frais_port_ht: number | null
          frais_port_tva: number | null
          id: string
          lignes: Json
          mode_calcul: string | null
          notes: string | null
          numero: string
          reference_affaire: string | null
          statut: string
          surface_globale_m2: number | null
          user_id: string
        }
        Insert: {
          adresse_livraison_id?: string | null
          client_id?: string | null
          conditions?: string | null
          created_at?: string
          date_creation?: string
          date_validite?: string | null
          frais_port_ht?: number | null
          frais_port_tva?: number | null
          id?: string
          lignes?: Json
          mode_calcul?: string | null
          notes?: string | null
          numero?: string
          reference_affaire?: string | null
          statut?: string
          surface_globale_m2?: number | null
          user_id: string
        }
        Update: {
          adresse_livraison_id?: string | null
          client_id?: string | null
          conditions?: string | null
          created_at?: string
          date_creation?: string
          date_validite?: string | null
          frais_port_ht?: number | null
          frais_port_tva?: number | null
          id?: string
          lignes?: Json
          mode_calcul?: string | null
          notes?: string | null
          numero?: string
          reference_affaire?: string | null
          statut?: string
          surface_globale_m2?: number | null
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
      fournisseurs: {
        Row: {
          adresse: string
          code_postal: string
          cout_transport: number
          created_at: string
          date_creation: string
          delai_reglement: string
          email: string
          franco_port: number
          id: string
          nom: string
          notes: string | null
          societe: string
          telephone: string
          user_id: string
          ville: string
        }
        Insert: {
          adresse?: string
          code_postal?: string
          cout_transport?: number
          created_at?: string
          date_creation?: string
          delai_reglement?: string
          email?: string
          franco_port?: number
          id?: string
          nom: string
          notes?: string | null
          societe?: string
          telephone?: string
          user_id: string
          ville?: string
        }
        Update: {
          adresse?: string
          code_postal?: string
          cout_transport?: number
          created_at?: string
          date_creation?: string
          delai_reglement?: string
          email?: string
          franco_port?: number
          id?: string
          nom?: string
          notes?: string | null
          societe?: string
          telephone?: string
          user_id?: string
          ville?: string
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
          consommation: number | null
          created_at: string
          date_creation: string
          description: string
          description_detaillee: string | null
          fournisseur_id: string | null
          id: string
          poids: number | null
          prix_achat: number
          prix_ht: number
          prix_revendeur: number
          reference: string
          remise_revendeur: number
          stock: number
          stock_min: number
          tva: number
          unite: string
          user_id: string
        }
        Insert: {
          categorie?: string | null
          coeff_revendeur?: number
          coefficient?: number
          consommation?: number | null
          created_at?: string
          date_creation?: string
          description?: string
          description_detaillee?: string | null
          fournisseur_id?: string | null
          id?: string
          poids?: number | null
          prix_achat?: number
          prix_ht?: number
          prix_revendeur?: number
          reference?: string
          remise_revendeur?: number
          stock?: number
          stock_min?: number
          tva?: number
          unite?: string
          user_id: string
        }
        Update: {
          categorie?: string | null
          coeff_revendeur?: number
          coefficient?: number
          consommation?: number | null
          created_at?: string
          date_creation?: string
          description?: string
          description_detaillee?: string | null
          fournisseur_id?: string | null
          id?: string
          poids?: number | null
          prix_achat?: number
          prix_ht?: number
          prix_revendeur?: number
          reference?: string
          remise_revendeur?: number
          stock?: number
          stock_min?: number
          tva?: number
          unite?: string
          user_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
