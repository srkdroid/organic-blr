/**
 * scraper/db/client.js
 * PostgreSQL pool and query helpers used by the scraper scheduler.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
  override: false,
});

const { Pool } = require("pg");
const { logger } = require("../utils/index");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL not set — check scraper/.env.scraper");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  min: 1,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: DATABASE_URL.includes("supabase.com")
    ? { rejectUnauthorized: false }
    : false,
});

pool.on("error", (err) => {
  logger.error("[DB] Pool error", { error: err.message });
  // Prevent unhandled error crash — pool will create a new connection automatically
});

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// ── Scrape run tracking ───────────────────────────────────────────────────────

async function startScrapeRun(providerId) {
  const { rows } = await query(
    `INSERT INTO scrape_runs (provider_id, status) VALUES ($1, 'running') RETURNING id`,
    [providerId],
  );
  return rows[0].id;
}

async function finishScrapeRun(
  runId,
  { status, productsFound, errorMessage, durationMs },
) {
  await query(
    `UPDATE scrape_runs
     SET status = $2, products_found = $3, error_message = $4,
         duration_ms = $5, finished_at = NOW()
     WHERE id = $1`,
    [runId, status, productsFound || 0, errorMessage || null, durationMs],
  );
}

// ── Master items ──────────────────────────────────────────────────────────────

async function getMasterItems() {
  const { rows } = await query(
    `SELECT id, canonical_name, category, aliases FROM master_items ORDER BY canonical_name`,
  );
  return rows;
}

async function upsertMasterItem(
  canonicalName,
  category = "Vegetables",
  aliases = [],
) {
  const { rows } = await query(
    `INSERT INTO master_items (canonical_name, category, aliases, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (canonical_name)
     DO UPDATE SET category = EXCLUDED.category, aliases = EXCLUDED.aliases, updated_at = NOW()
     RETURNING id`,
    [canonicalName, category, aliases],
  );
  return rows[0].id;
}

// ── Provider listings ─────────────────────────────────────────────────────────

async function saveListings(products, runId) {
  if (!products.length) return;

  // Save in batches of 20 to avoid Supabase connection timeout
  // on free tier (transaction pooler drops long-running connections)
  const BATCH_SIZE = 20;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const p of batch) {
        await client.query(
          `INSERT INTO provider_listings
             (provider_id, master_item_id, raw_name, canonical_name, price, unit,
              available, image_url, product_url, match_method, scrape_run_id, variant_id, scraped_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
           ON CONFLICT (provider_id, master_item_id, unit) DO UPDATE SET
             price          = EXCLUDED.price,
             available      = EXCLUDED.available,
             image_url      = EXCLUDED.image_url,
             raw_name       = EXCLUDED.raw_name,
             match_method   = EXCLUDED.match_method,
             scrape_run_id  = EXCLUDED.scrape_run_id,
             variant_id     = EXCLUDED.variant_id,
             scraped_at     = NOW()`,
          [
            p.providerId,
            p.masterItemId || null,
            p.name,
            p.masterName || p.name,
            p.price,
            p.unit || '',
            p.available !== false,
            p.imageUrl || null,
            p.productUrl || null,
            p.matchMethod || null,
            runId,
            p.variantId || null,
          ],
        );

        if (p.masterItemId) {
          await client.query(
            `INSERT INTO price_history (provider_id, master_item_id, price, unit, available)
             VALUES ($1,$2,$3,$4,$5)`,
            [
              p.providerId,
              p.masterItemId,
              p.price,
              p.unit || '',
              p.available !== false,
            ],
          );
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // Small pause between batches — lets Supabase pooler breathe
    if (i + BATCH_SIZE < products.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

async function touchProvider(providerId) {
  await query(`UPDATE providers SET last_scraped_at = NOW() WHERE id = $1`, [
    providerId,
  ]);
}

module.exports = {
  pool,
  query,
  startScrapeRun,
  finishScrapeRun,
  getMasterItems,
  upsertMasterItem,
  saveListings,
  touchProvider,
};
