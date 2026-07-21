-- ============================================================
-- 054_auto_tagging.sql
--
-- Migration script to add auto-tagging category field to 
-- conversations.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'unknown' CHECK (category IN ('sales', 'support', 'complaint', 'refund', 'general', 'unknown'));
