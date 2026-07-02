const { Client } = require('pg');

const regions = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
  'sa-east-1', 'ca-central-1'
];

async function test() {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const client = new Client({
      user: 'postgres.fadogxelpjdstacymngd',
      password: 'dUs6xa4BFyF?r3Q',
      host,
      port: 6543,
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    });
    try {
      await client.connect();
      console.log(`\n🎉 FOUND IT! Region is: ${region}`);
      const res = await client.query("SELECT NOW()");
      console.log("Result:", res.rows[0]);
      await client.end();
      return region;
    } catch (e) {
      console.log(`${region}: ${e.message}`);
      try { await client.end(); } catch {}
    }
  }
  console.log("\nFinished testing all regions. None found.");
}

test();
