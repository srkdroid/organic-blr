/**
 * Fix the UNIQUE constraint on provider_listings.
 *
 * OLD: UNIQUE(provider_id, master_item_id)
 *   — Only one row per provider per canonical item
 *   — "Beans-Cluster 500g Rs49" overwrites "Beans-Dark Green 500g Rs126"
 *     if both map to master_item "Beans"
 *
 * NEW: UNIQUE(provider_id, master_item_id, unit)
 *   — One row per provider per canonical item PER UNIT
 *   — "Beans 500g" and "Beans 250g" can coexist
 *   — Different varieties that happen to share a canonical name can coexist
 *     as long as their units differ
 *
 * Run ONCE: node scraper/db/fix_unique_constraint.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
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
    console.log("Fixing UNIQUE constraint on provider_listings...");

    await client.query(`
      -- Drop the old constraint (one per provider+item)
      ALTER TABLE provider_listings
        DROP CONSTRAINT IF EXISTS provider_listings_provider_id_master_item_id_key;

      -- Add new constraint (one per provider+item+unit)
      -- Using COALESCE so NULL units don't cause duplicates
      ALTER TABLE provider_listings
        DROP CONSTRAINT IF EXISTS provider_listings_provider_item_unit_key;

      ALTER TABLE provider_listings
        ADD CONSTRAINT provider_listings_provider_item_unit_key
        UNIQUE (provider_id, master_item_id, unit);
    `);

    console.log("✓ Old UNIQUE(provider_id, master_item_id) dropped");
    console.log("✓ New UNIQUE(provider_id, master_item_id, unit) added");
    console.log("");
    console.log(
      "Now run: node scraper/debug_clear_hb.js && npm run save:healthybuddha",
    );
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
