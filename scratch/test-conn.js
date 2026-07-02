const { Client } = require('pg');

const regions = ['eu-west-1', 'eu-central-1', 'us-east-1'];

async function test() {
  for (const region of regions) {
    const connectionString = `postgresql://postgres.fadogxelpjdstacymngd:dUs6xa4BFyF%3Fr3Q@aws-0-${region}.pooler.supabase.com:6543/postgres`;
    console.log(`Testing region: ${region}...`);
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    try {
      await client.connect();
      console.log(`SUCCESS connected to ${region} pooler!`);
      
      const res = await client.query("SELECT NOW()");
      console.log("Result:", res.rows[0]);
      
      await client.end();
      return;
    } catch (e) {
      console.error(`FAILED connected to ${region}:`, e.message);
      try { await client.end(); } catch {}
    }
  }
}

test();
