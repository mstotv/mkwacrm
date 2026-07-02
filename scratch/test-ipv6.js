const { Client } = require('pg');

async function run() {
  const connectionString = `postgresql://postgres:dUs6xa4BFyF%3Fr3Q@[2406:da1c:4c7:f802:ac24:d08a:807d:b2b4]:5432/postgres`;
  console.log("Connecting directly via IPv6 address...");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    console.log("SUCCESS!");
    const res = await client.query("SELECT NOW()");
    console.log("Result:", res.rows[0]);
    await client.end();
  } catch (e) {
    console.log("FAILED:", e.message);
    try { await client.end(); } catch {}
  }
}

run();
