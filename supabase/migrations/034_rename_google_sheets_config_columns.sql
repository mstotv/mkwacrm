-- Migration: Rename google_sheets_config columns to linked_accounts and linked_spreadsheets, and convert them to JSONB.

ALTER TABLE google_sheets_config
  RENAME COLUMN access_token TO linked_accounts;

ALTER TABLE google_sheets_config
  RENAME COLUMN refresh_token TO linked_spreadsheets;

-- Convert columns to jsonb
ALTER TABLE google_sheets_config
  ALTER COLUMN linked_accounts TYPE jsonb USING linked_accounts::jsonb,
  ALTER COLUMN linked_spreadsheets TYPE jsonb USING linked_spreadsheets::jsonb;
