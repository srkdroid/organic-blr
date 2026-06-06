/**
 * scraper/db/patch_providers.js
 * One-time patch to update provider names/URLs after Akshayakalpa → Satva Farm change.
 * Run once: node scraper/db/patch_providers.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
  override: false,
});

const { Pool } = require("pg");
const { logger } = require("../utils/index");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase.com")
    ? { rejectUnauthorized: false }
    : false,
});

async function patch() {
  const client = await pool.connect();
  try {
    // Update AK from Akshayakalpa to Satva Farm
    await client.query(`
      UPDATE providers SET
        name                = 'Satva Farm',
        base_url            = 'https://satvafarm.com',
        delivery_charge     = 0,
        free_delivery_above = 500,
        min_order           = 0,
        updated_at          = NOW()
      WHERE id = 'AK'
    `);
    // Update FF delivery (free over 500, min order 500)
    await client.query(`
      UPDATE providers SET
        delivery_charge     = 0,
        free_delivery_above = 500,
        min_order           = 500,
        updated_at          = NOW()
      WHERE id = 'FF'
    `);
    logger.info("[Patch] ✓ AK updated to Satva Farm");
    logger.info("[Patch] ✓ FF delivery config updated");

    // Show current state
    const { rows } = await client.query(
      "SELECT id, name, base_url, delivery_charge, free_delivery_above, min_order FROM providers ORDER BY id",
    );
    console.log("\nCurrent providers table:");
    console.table(rows);
  } finally {
    client.release();
    await pool.end();
  }
}

patch().catch((err) => {
  logger.error("[Patch] Failed", { error: err.message });
  process.exit(1);
});
