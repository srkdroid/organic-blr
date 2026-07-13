/**
 * lib/db.js
 * PostgreSQL pool for Next.js API routes (server-side only).
 * Uses Supabase's Transaction Pooler (port 6543) on Vercel.
 * A module-level singleton prevents connection storms during hot reload in dev.
 */
import { Pool } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to .env.local')
}

const poolConfig = {
  connectionString: DATABASE_URL,
  max: process.env.NODE_ENV === 'production' ? 3 : 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  // Supabase requires SSL
  ssl: DATABASE_URL.includes('supabase.com') ? { rejectUnauthorized: false } : false,
}

// Reuse pool across hot-reloads in dev, across warm invocations on Vercel
const globalForPg = globalThis
const pool = globalForPg._pgPool ?? (globalForPg._pgPool = new Pool(poolConfig))

async function query(sql, params = []) {
  const client = await pool.connect()
  try {
    return await client.query(sql, params)
  } finally {
    client.release()
  }
}

// ── Read queries called by API routes ─────────────────────────────────────────

export async function getAllItems(category = null) {
  const where  = category ? 'WHERE mi.category = $1' : ''
  const params = category ? [category] : []
  const { rows } = await query(
    `SELECT
       mi.id            AS master_item_id,
       mi.canonical_name,
       mi.category,
       COALESCE(
         json_agg(
           json_build_object(
             'provider_id', pl.provider_id,
             'price',       pl.price,
             'unit',        pl.unit,
             'available',   pl.available,
             'variant_id',  pl.variant_id,
             'product_url', pl.product_url,
             'scraped_at',  pl.scraped_at
           ) ORDER BY pl.provider_id
         ) FILTER (WHERE pl.provider_id IS NOT NULL),
         '[]'::json
       ) AS prices
     FROM master_items mi
     LEFT JOIN provider_listings pl
       ON pl.master_item_id = mi.id AND pl.available = TRUE
     ${where}
     GROUP BY mi.id, mi.canonical_name, mi.category
     ORDER BY mi.category, mi.canonical_name`,
    params
  )
  return rows
}

export async function getPriceHistory(masterItemId, days = 30) {
  const { rows } = await query(
    `SELECT provider_id, price, unit, scraped_at
     FROM price_history
     WHERE master_item_id = $1
       AND scraped_at > NOW() - ($2 || ' days')::INTERVAL
     ORDER BY scraped_at ASC`,
    [masterItemId, parseInt(days)]
  )
  return rows
}

export async function getProviders() {
  const { rows } = await query(
    `SELECT p.*,
            sr.finished_at    AS last_scraped_at,
            sr.products_found AS last_products_found
     FROM providers p
     LEFT JOIN LATERAL (
       SELECT finished_at, products_found
       FROM scrape_runs
       WHERE provider_id = p.id AND status = 'success'
       ORDER BY started_at DESC
       LIMIT 1
     ) sr ON TRUE
     ORDER BY p.id`
  )
  return rows
}
