-- Migration 037: Add color column to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS color TEXT;
