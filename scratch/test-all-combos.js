const { Client } = require('pg');

const host = 'aws-0-ap-southeast-2.pooler.supabase.com';
const password = 'dUs6xa4BFyF%3Fr3Q';

const configs = [
  // 1. Standard pooler connection string format
  `postgresql://postgres.fadogxelpjdstacymngd:${password}@${host}:6543/postgres`,
  // 2. Standard session pooler connection string format
  `postgresql://postgres.fadogxelpjdstacymngd:${password}@${host}:5432/postgres`,
  // 3. Option parameter style
  `postgresql://postgres:${password}@${host}:6543/postgres?options=-c%20project=fadogxelpjdstacymngd`,
  `postgresql://postgres:${password}@${host}:5432/postgres?options=-c%20project=fadogxelpjdstacymngd`,
  // 4. Custom header or params
  `postgresql://postgres.fadogxelpjdstacymngd:${password}@${host}:6543/postgres?sslmode=require`
];

async function run() {
  for (let i = 0; i < configs.length; i++) {
    console.log(`Testing configuration #${i + 1}...`);
    const client = new Client({
      connectionString: configs[i],
      ssl: { rejectUnauthorized: false }
    });
    try {
      await client.connect();
      console.log(`SUCCESS on #${i + 1}!`);
      const res = await client.query("SELECT NOW()");
      console.log("Result:", res.rows[0]);
      await client.end();
      return;
    } catch (e) {
      console.log(`FAILED config #${i + 1}:`, e.message);
      try { await client.end(); } catch {}
    }
  }
}

run();
