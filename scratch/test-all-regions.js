process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');

const regions = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
  'sa-east-1', 'ca-central-1', 'me-central-1'
];

async function test() {
  for (const region of regions) {
    const connectionString = `postgresql://postgres.fadogxelpjdstacymngd:dUs6xa4BFyF%3Fr3Q@aws-0-${region}.pooler.supabase.com:6543/postgres?sslmode=require`;
    const client = new Client({
      connectionString
    });
    try {
      await client.connect();
      console.log(`\n🎉 SUCCESS! Connected to ${region} pooler!`);
      const res = await client.query("SELECT NOW()");
      console.log("Result:", res.rows[0]);
      await client.end();
      return;
    } catch (e) {
      if (!e.message.includes('tenant/user') && !e.message.includes('ENOTFOUND')) {
        console.log(`Region ${region} error:`, e.message);
      } else {
        // Log that it failed with tenant not found to be sure it's active
        console.log(`Region ${region}: tenant not found`);
      }
      try { await client.end(); } catch {}
    }
  }
}

test();
