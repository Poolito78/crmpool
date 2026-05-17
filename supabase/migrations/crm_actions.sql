-- Migration: CRM Actions module
-- Run this in Supabase SQL Editor

-- 1. Add raison_refus column to devis table
ALTER TABLE devis ADD COLUMN IF NOT EXISTS raison_refus TEXT;

-- 2. Create crm_actions table
CREATE TABLE IF NOT EXISTS crm_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  devis_id UUID REFERENCES devis(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'tache',
  -- types: 'visite', 'appel', 'email', 'tache', 'rdv'
  titre TEXT NOT NULL,
  description TEXT,
  date_planifiee TIMESTAMP WITH TIME ZONE,
  date_realisee TIMESTAMP WITH TIME ZONE,
  statut TEXT NOT NULL DEFAULT 'planifiee',
  -- statuts: 'planifiee', 'realisee', 'annulee'
  priorite TEXT NOT NULL DEFAULT 'normale',
  -- priorites: 'basse', 'normale', 'haute'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable Row Level Security
ALTER TABLE crm_actions ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy: users can only see/modify their own actions
CREATE POLICY "Users manage own crm_actions" ON crm_actions
  FOR ALL USING (auth.uid() = user_id);

-- 5. Index for performance
CREATE INDEX IF NOT EXISTS crm_actions_user_id_idx ON crm_actions(user_id);
CREATE INDEX IF NOT EXISTS crm_actions_client_id_idx ON crm_actions(client_id);
CREATE INDEX IF NOT EXISTS crm_actions_date_planifiee_idx ON crm_actions(date_planifiee);
