-- ============================================================
-- 052_sentiment_analysis.sql
--
-- Migration script to add sentiment analysis fields to 
-- conversations.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS sentiment TEXT DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'neutral', 'negative', 'frustrated')),
  ADD COLUMN IF NOT EXISTS sentiment_score INTEGER DEFAULT 50;
