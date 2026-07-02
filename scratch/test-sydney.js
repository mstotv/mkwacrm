const { Client } = require('pg');

const tests = [
  { user: 'postgres', host: 'aws-0-ap-southeast-2.pooler.supabase.com', port: 6543 },
  { user: 'postgres.fadogxelpjdstacymngd', host: 'aws-0-ap-southeast-2.pooler.supabase.com', port: 6543 },
  { user: 'postgres', host: 'aws-0-ap-southeast-2.pooler.supabase.com', port: 5432 },
  { user: 'postgres.fadogxelpjdstacymngd', host: 'aws-0-ap-southeast-2.pooler.supabase.com', port: 5432 }
];

async function run() {
  for (const t of tests) {
    const connectionString = `postgresql://${t.user}:dUs6xa4BFyF%3Fr3Q@${t.host}:${t.port}/postgres`;
    console.log(`Testing: user=${t.user}, port=${t.port}...`);
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    try {
      await client.connect();
      console.log(`SUCCESS!`);
      const res = await client.query("SELECT NOW()");
      console.log("Time:", res.rows[0]);
      await client.end();
      return;
    } catch (e) {
      console.log(`FAILED:`, e.message);
      try { await client.end(); } catch {}
    }
  }
}

run();
