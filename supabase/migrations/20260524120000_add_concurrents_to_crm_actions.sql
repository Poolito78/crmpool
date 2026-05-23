-- Add competitor tracking field to crm_actions
ALTER TABLE crm_actions ADD COLUMN IF NOT EXISTS concurrents jsonb;
