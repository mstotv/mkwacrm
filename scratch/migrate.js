const { Client } = require('pg');
const { parse } = require('pg-connection-string');
const fs = require('fs');
const path = require('path');

const connectionString = "postgresql://postgres.fadogxelpjdstacymngd:dUs6xa4BFyF%3Fr3Q@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?sslmode=require";
const config = parse(connectionString);
config.ssl = { rejectUnauthorized: false };

const client = new Client(config);

async function run() {
  console.log("Connecting using parsed connection string with SSL override...");
  await client.connect();
  console.log("Connected successfully!");

  const sql023 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '023_saas_subscriptions.sql'), 'utf8');
  const sql024 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '024_advanced_features_schema.sql'), 'utf8');

  console.log("Running Migration 023...");
  await client.query(sql023);
  console.log("Migration 023 completed.");

  console.log("Running Migration 024...");
  await client.query(sql024);
  console.log("Migration 024 completed.");

  console.log("Updating user roles...");
  await client.query(`
    UPDATE profiles 
    SET platform_role = 'super_admin', account_role = 'owner'
    WHERE id = '9f73371a-bd7c-4bf3-9163-1db68ffdf4cf';
  `);
  console.log("User roles updated successfully!");

  await client.end();
}

run().catch(async (err) => {
  console.error("Error executing migrations:", err);
  try { await client.end(); } catch {}
});
