-- ============================================================
-- 027_whatsapp_evolution.sql
--
-- Migration to support Evolution API instances to link WhatsApp
-- numbers via QR Code alongside standard Meta Cloud API.
-- ============================================================

-- Extend whatsapp_config with Evolution fields
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS connection_type TEXT DEFAULT 'meta' CHECK (connection_type IN ('meta', 'evolution')),
  ADD COLUMN IF NOT EXISTS evolution_api_url TEXT,
  ADD COLUMN IF NOT EXISTS evolution_phone TEXT;
