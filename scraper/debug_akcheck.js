/**
 * Clears all AK provider listings and price history, then re-saves fresh.
 * Run: node scraper/debug_akcheck.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../.env.local"),
  override: false,
});

const { Pool } = require("pg");
const { logger } = require("./utils/index");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase.com")
    ? { rejectUnauthorized: false }
    : false,
});

async function main() {
  const client = await pool.connect();
  try {
    // Show what's currently in DB for AK
    const { rows: before } = await client.query(`
      SELECT raw_name, canonical_name, price, unit
      FROM provider_listings
      WHERE provider_id = 'AK'
      ORDER BY raw_name
    `);
    console.log(`\nCurrent AK listings in DB: ${before.length} rows`);
    console.table(before);

    // Delete all AK listings and price history
    await client.query(
      `DELETE FROM price_history     WHERE provider_id = 'AK'`,
    );
    await client.query(
      `DELETE FROM provider_listings WHERE provider_id = 'AK'`,
    );
    console.log("\n✓ Cleared all AK listings and price history from DB");
    console.log("\nNow run: npm run save:akshayakalpa");
    console.log("Fresh data will be saved with correct prices.\n");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
