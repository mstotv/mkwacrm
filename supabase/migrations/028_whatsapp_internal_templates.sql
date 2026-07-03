-- ============================================================
-- 028_whatsapp_internal_templates.sql
--
-- Migration to support internal review system for Message Templates.
-- Bypasses Meta constraints for non-WABA / Evolution templates.
-- ============================================================

-- Drop the old Meta status check constraint
ALTER TABLE message_templates
  DROP CONSTRAINT IF EXISTS message_templates_status_meta_check;

-- Re-add check constraint with PENDING_REVIEW included
ALTER TABLE message_templates
  ADD CONSTRAINT message_templates_status_meta_check
  CHECK (status IN (
    'DRAFT',
    'PENDING',
    'APPROVED',
    'REJECTED',
    'PAUSED',
    'DISABLED',
    'IN_APPEAL',
    'PENDING_DELETION',
    'PENDING_REVIEW'
  ));

-- Add require_template_review option to landing_page_settings
ALTER TABLE landing_page_settings
  ADD COLUMN IF NOT EXISTS require_template_review BOOLEAN DEFAULT false;
