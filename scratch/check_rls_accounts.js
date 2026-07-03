const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

// Database connection config
const connectionString = "postgresql://postgres.fadogxelpjdstacymngd:dUs6xa4BFyF%3Fr3Q@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?sslmode=require";
const { parse } = require('pg-connection-string');
const config = parse(connectionString);
config.ssl = { rejectUnauthorized: false };

const client = new Client(config);

async function run() {
  await client.connect();
  console.log("Connected successfully!");

  const res = await client.query(`
    SELECT tablename, policyname, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE tablename = 'accounts';
  `);

  console.log("Policies on 'accounts' table:");
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(console.error);
