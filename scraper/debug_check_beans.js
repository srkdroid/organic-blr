/**
 * Check what bean-related master items and listings exist in DB
 * Run: node scraper/debug_check_beans.js
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
    // Check master items
    const { rows: masters } = await client.query(`
      SELECT id, canonical_name, category
      FROM master_items
      WHERE lower(canonical_name) LIKE '%bean%'
         OR lower(canonical_name) LIKE '%gourd%'
         OR lower(canonical_name) LIKE '%pumpkin%'
      ORDER BY canonical_name
    `);
    console.log("\n=== master_items containing bean/gourd/pumpkin ===");
    console.table(masters);

    // Check HB listings for beans
    const { rows: listings } = await client.query(`
      SELECT pl.raw_name, pl.canonical_name, pl.price, pl.unit, pl.match_method
      FROM provider_listings pl
      WHERE pl.provider_id = 'HB'
        AND (lower(pl.raw_name) LIKE '%bean%'
          OR lower(pl.canonical_name) LIKE '%bean%')
      ORDER BY pl.raw_name
    `);
    console.log("\n=== HB provider_listings for beans ===");
    console.table(listings);

    // Check if fix_unique_constraint ran
    const { rows: constraints } = await client.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'provider_listings'
        AND constraint_type = 'UNIQUE'
    `);
    console.log("\n=== provider_listings UNIQUE constraints ===");
    console.table(constraints);
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
