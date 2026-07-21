-- ============================================================
-- 053_lead_intent.sql
--
-- Migration script to add buying intent analysis field to 
-- conversations.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS intent TEXT DEFAULT 'info_seeking' CHECK (intent IN ('ready_to_buy', 'hesitant', 'not_interested', 'wants_appointment', 'info_seeking', 'unknown'));
