/**
 * scraper/db/migrate.js
 * Creates all tables in Supabase (idempotent — safe to re-run).
 * Run: node scraper/db/migrate.js
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
  console.error("ERROR: DATABASE_URL is not set in scraper/.env.scraper");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("supabase.com")
    ? { rejectUnauthorized: false }
    : false,
});

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
  unit           VARCHAR(100) NOT NULL DEFAULT '',
  available      BOOLEAN      NOT NULL DEFAULT TRUE,
  image_url      TEXT,
  product_url    TEXT,
  match_method   VARCHAR(30),
  scrape_run_id  INTEGER      REFERENCES scrape_runs(id) ON DELETE CASCADE,
  scraped_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, master_item_id, unit)
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
  unit           VARCHAR(100) NOT NULL DEFAULT '',
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
-- Enable Row Level Security (RLS) to secure tables against public anonymous access via PostgREST
ALTER TABLE master_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;

-- Seed provider rows (safe to re-run)
INSERT INTO providers (id, name, base_url, delivery_charge, free_delivery_above, min_order)
VALUES
  ('HB','Healthy Buddha',       'https://healthybuddha.in',        40, 1000, 399),
  ('OM','Organic Mandya',       'https://organicmandya.com',       30,  500, 200),
  ('LU','Lushful',              'https://lushful.org',             35,  599, 300),
  ('AK','Satva Farm',           'https://satvafarm.com',            0,  500,   0),
  ('FF','Farm Fresh Bangalore', 'https://farmfreshbangalore.com',   0,  500, 500),
  ('GD','GreenDNA',             'https://www.greendna.in',         30,  500, 250),
  ('BF','Bhoomi Farms',         'https://bhoomi.farm',             40,  499,   0)
ON CONFLICT (id) DO UPDATE SET
  name                = EXCLUDED.name,
  base_url            = EXCLUDED.base_url,
  delivery_charge     = EXCLUDED.delivery_charge,
  free_delivery_above = EXCLUDED.free_delivery_above,
  min_order           = EXCLUDED.min_order,
  updated_at          = NOW();

-- Triggers to automatically coalesce NULL units to '' (prevents constraint violation from older scrapers)
CREATE OR REPLACE FUNCTION coalesce_provider_listings_unit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.unit IS NULL THEN
    NEW.unit := '';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_coalesce_provider_listings_unit ON provider_listings;
CREATE TRIGGER trg_coalesce_provider_listings_unit
BEFORE INSERT OR UPDATE ON provider_listings
FOR EACH ROW EXECUTE FUNCTION coalesce_provider_listings_unit();

CREATE OR REPLACE FUNCTION coalesce_price_history_unit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.unit IS NULL THEN
    NEW.unit := '';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_coalesce_price_history_unit ON price_history;
CREATE TRIGGER trg_coalesce_price_history_unit
BEFORE INSERT ON price_history
FOR EACH ROW EXECUTE FUNCTION coalesce_price_history_unit();

-- Auth & Analytics schema
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_sign_in_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_enabled ON user_profiles(is_enabled);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, avatar_url, is_enabled)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    last_sign_in_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS page_visits (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  user_agent TEXT,
  visited_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_visits_visited_at ON page_visits(visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_visits_user_id ON page_visits(user_id);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_visits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;
CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can record visits" ON page_visits;
CREATE POLICY "Authenticated users can record visits"
  ON page_visits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Admins can view page visits" ON page_visits;
CREATE POLICY "Admins can view page visits"
  ON page_visits FOR SELECT
  TO authenticated
  USING (public.is_admin());
`;

async function migrate() {
  const client = await pool.connect();
  try {
    logger.info("[DB] Running migrations against Supabase...");
    await client.query(SCHEMA);
    logger.info("[DB] ✓ All tables created / verified");
    logger.info("[DB] ✓ Provider rows seeded");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  logger.error("[DB] Migration failed", { error: err.message });
  process.exit(1);
});
