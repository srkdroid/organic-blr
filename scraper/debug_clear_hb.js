/**
 * Clears all HB listings and price history so a fresh save picks up everything.
 * Run: node scraper/debug_clear_hb.js
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../.env.local"),
  override: false,
});

const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase.com")
    ? { rejectUnauthorized: false }
    : false,
});

(async () => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT COUNT(*) FROM provider_listings WHERE provider_id='HB'`,
    );
    console.log(`Current HB listings: ${rows[0].count}`);

    await client.query(
      `DELETE FROM price_history     WHERE provider_id = 'HB'`,
    );
    await client.query(
      `DELETE FROM provider_listings WHERE provider_id = 'HB'`,
    );
    console.log("✓ Cleared all HB listings and price history");
    console.log("Now run: npm run save:healthybuddha");
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
