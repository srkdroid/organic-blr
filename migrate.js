/**
 * scraper/db/migrate.js
 * Creates all tables in Supabase (idempotent — safe to re-run).
 * Run: node scraper/db/migrate.js
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env.scraper') })
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local'), override: false })

const { Pool } = require('pg')
const { logger } = require('../utils/index')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set in scraper/.env.scraper')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('supabase.com') ? { rejectUnauthorized: false } : false,
})

const SCHEMA = `
-- Master items: canonical produce names
CREATE TABLE IF NOT EXISTS master_items (
  id             SERIAL PRIMARY KEY,
  canonical_name VARCHAR(200) NOT NULL UNIQUE,
  category       VARCHAR(50)  NOT NULL DEFAULT 'Vegetables',
  aliases        TEXT[]       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_master_items_category ON master_items(category);

-- Scrape runs: audit log for every cron execution
CREATE TABLE IF NOT EXISTS scrape_runs (
  id             SERIAL PRIMARY KEY,
  provider_id    VARCHAR(10)  NOT NULL,
  started_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  status         VARCHAR(20)  NOT NULL DEFAULT 'running',
  products_found INTEGER,
  error_message  TEXT,
  duration_ms    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_provider ON scrape_runs(provider_id);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_started  ON scrape_runs(started_at DESC);

-- Provider listings: current price per provider per item
CREATE TABLE IF NOT EXISTS provider_listings (
  id             SERIAL PRIMARY KEY,
  provider_id    VARCHAR(10)  NOT NULL,
  master_item_id INTEGER      REFERENCES master_items(id) ON DELETE SET NULL,
  raw_name       VARCHAR(300) NOT NULL,
  canonical_name VARCHAR(200),
  price          NUMERIC(10,2) NOT NULL,
  unit           VARCHAR(100),
  available      BOOLEAN      NOT NULL DEFAULT TRUE,
  image_url      TEXT,
  product_url    TEXT,
  match_method   VARCHAR(30),
  scrape_run_id  INTEGER      REFERENCES scrape_runs(id) ON DELETE CASCADE,
  scraped_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, master_item_id)
);
CREATE INDEX IF NOT EXISTS idx_listings_provider    ON provider_listings(provider_id);
CREATE INDEX IF NOT EXISTS idx_listings_master_item ON provider_listings(master_item_id);
CREATE INDEX IF NOT EXISTS idx_listings_scraped_at  ON provider_listings(scraped_at DESC);

-- Price history: every historical snapshot (used for trend charts)
CREATE TABLE IF NOT EXISTS price_history (
  id             SERIAL PRIMARY KEY,
  provider_id    VARCHAR(10)  NOT NULL,
  master_item_id INTEGER      REFERENCES master_items(id) ON DELETE CASCADE,
  price          NUMERIC(10,2) NOT NULL,
  unit           VARCHAR(100),
  available      BOOLEAN      NOT NULL DEFAULT TRUE,
  scraped_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_history_item     ON price_history(master_item_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_provider ON price_history(provider_id, scraped_at DESC);

-- Providers: delivery config (seeded on first run)
CREATE TABLE IF NOT EXISTS providers (
  id                  VARCHAR(10)   PRIMARY KEY,
  name                VARCHAR(100)  NOT NULL,
  base_url            TEXT,
  delivery_charge     NUMERIC(8,2)  NOT NULL DEFAULT 0,
  free_delivery_above NUMERIC(10,2),
  min_order           NUMERIC(10,2) NOT NULL DEFAULT 0,
  gst_rate            NUMERIC(5,4)  NOT NULL DEFAULT 0.05,
  active              BOOLEAN       NOT NULL DEFAULT TRUE,
  last_scraped_at     TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed provider rows (safe to re-run)
INSERT INTO providers (id, name, base_url, delivery_charge, free_delivery_above, min_order)
VALUES
  ('HB','Healthy Buddha',       'https://healthybuddha.in',       40, 1000, 399),
  ('OM','Organic Mandya',       'https://organicmandya.com',      30,  500, 200),
  ('LU','Lushful',              'https://lushful.org',            35,  599, 300),
  ('AK','Akshayakalpa',         'https://shop.akshayakalpa.org',   0,    0,   0),
  ('FF','Farm Fresh Bangalore', 'https://farmfreshbangalore.com', 45,  699, 350),
  ('GD','GreenDNA',             'https://www.greendna.in',        30,  500, 250)
ON CONFLICT (id) DO UPDATE SET
  name                = EXCLUDED.name,
  delivery_charge     = EXCLUDED.delivery_charge,
  free_delivery_above = EXCLUDED.free_delivery_above,
  min_order           = EXCLUDED.min_order,
  updated_at          = NOW();
`

async function migrate() {
  const client = await pool.connect()
  try {
    logger.info('[DB] Running migrations against Supabase...')
    await client.query(SCHEMA)
    logger.info('[DB] ✓ All tables created / verified')
    logger.info('[DB] ✓ Provider rows seeded')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch(err => {
  logger.error('[DB] Migration failed', { error: err.message })
  process.exit(1)
})
