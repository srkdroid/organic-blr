/**
 * scraper/scrapers/bhoomi.js
 * Provider  : Bhoomi Farms (bhoomi.farm)
 * Platform  : Custom REST API (Angular SPA), no auth required
 * City      : Bengaluru (city_id = 549)
 *
 * API endpoints (confirmed working July 2026):
 *
 *   GET /v1/web-app/get-all-products?city_id=549
 *     → returns "Top Selling" products (default, 20 items)
 *     NOTE: the ?title=<category> variant causes a MySQL GROUP BY error on their
 *     server — use the category_id param instead (discovered via inspection).
 *
 *   GET /v1/web-app/get-all-products?city_id=549&category_id=<id>
 *     → returns all products in that category
 *
 * Product JSON shape (flat, dot-notation style):
 *   product_name      → name
 *   product_image     → image URL
 *   is_in_stock       → 1 = in stock
 *   varients[]        → array of size variants (note: API spells it "varients")
 *     .unit           → weight in grams (numeric, e.g. 250, 500)
 *     .price          → selling price (INR)
 *     .compare_price  → MRP
 *     .stock          → units in stock
 *
 * Strategy:
 *   1. Fetch category list from get-all-categories (fallback to static IDs)
 *   2. Scrape produce-relevant categories by category_id
 *   3. Emit one product entry per variant
 *
 * Run preview : node scraper/scrapers/bhoomi.js
 * Run + save  : node scraper/scrapers/bhoomi.js --save
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
  override: false,
});

const axios = require("axios");
const {
  logger,
  withRetry,
  buildProduct,
  deduplicateProducts,
  randomUserAgent,
  sleep,
} = require("../utils/index");

const PROVIDER_ID = "BF";
const BASE_URL = "https://bhoomi.farm/v1/web-app";
const CITY_ID = 549; // Bengaluru
const TIMEOUT = 20_000;

// Fallback static category IDs (confirmed from live API embedded categories list,
// July 2026). Only produce-relevant categories are included.
// The API hard-caps each category at 20 products server-side.
const STATIC_CATEGORIES = [
  { id: -103, label: "Mangoes" },
  { id: 1,    label: "Fresh Vegetables" },
  { id: 2,    label: "Leafy and Seasonings" },
  { id: 3,    label: "Exotics" },
  { id: 5,    label: "Fresh Fruits" },
  { id: 7,    label: "Other Vegetables" },
];

// ── HTTP client ───────────────────────────────────────────────────────────────
const client = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  headers: {
    "User-Agent": randomUserAgent(),
    Accept: "application/json",
    "Accept-Language": "en-IN,en;q=0.9",
    Referer: "https://bhoomi.farm/",
    Origin: "https://bhoomi.farm",
  },
});

// ── Fetch category list from API ──────────────────────────────────────────────
async function fetchCategories() {
  logger.debug(`[BF] GET /get-all-categories?city_id=${CITY_ID}`);
  const res = await client.get("/get-all-categories", {
    params: { city_id: CITY_ID },
  });
  if (res.data?.status !== 1) {
    throw new Error(res.data?.message || "Categories API returned non-1 status");
  }
  const data = res.data.data;
  // API may return l2_categories or categories array
  return data?.l2_categories || data?.categories || [];
}

// ── Fetch products for one category by ID ────────────────────────────────────
async function fetchCategoryProducts(categoryId, label) {
  logger.debug(`[BF] GET /get-all-products?category_id=${categoryId} (${label})`);
  const res = await client.get("/get-all-products", {
    params: { city_id: CITY_ID, category_id: categoryId, limit: 500 },
  });

  if (res.data?.status !== 1) {
    throw new Error(
      `Products API error for category ${categoryId}: ${res.data?.message}`,
    );
  }
  return res.data?.data?.products || [];
}

// ── Build unit string from Bhoomi's numeric weight ───────────────────────────
// varients.unit is a plain number in grams (e.g. 250 → "250g", 1000 → "1kg")
function buildUnit(grams) {
  if (!grams && grams !== 0) return null;
  const g = Number(grams);
  if (isNaN(g) || g <= 0) return null;
  if (g >= 1000 && g % 1000 === 0) return `${g / 1000}kg`;
  if (g >= 1000) return `${(g / 1000).toFixed(2).replace(/\.?0+$/, "")}kg`;
  return `${g}g`;
}

// ── Convert raw products → scraper product objects ───────────────────────────
function parseProducts(rawProducts, label) {
  const results = [];

  for (const item of rawProducts) {
    const name = item.product_name?.trim();
    if (!name) continue;

    const inStock = item.is_in_stock === 1 || item.is_in_stock === true;
    const imageUrl = item.product_image || null;
    const productUrl = `https://bhoomi.farm/product-detail/${item.id || ""}`;

    const variants = item.varients || [];
    if (variants.length === 0) continue;

    for (const v of variants) {
      if (v.is_deleted) continue;
      const price = v.price ?? null;
      if (!price || price <= 0) continue;

      const variantInStock = inStock && (v.stock ?? 1) > 0;
      const unit = buildUnit(v.unit);

      results.push(
        buildProduct({
          providerId: PROVIDER_ID,
          name,
          price,
          unit,
          available: variantInStock,
          imageUrl,
          productUrl,
        }),
      );
    }
  }

  logger.info(
    `[BF] ${label}: ${rawProducts.length} products → ${results.length} variants`,
  );
  return results;
}

// ── Main scrape function ──────────────────────────────────────────────────────
async function scrape() {
  logger.info("[BF] Starting Bhoomi Farms scrape via REST API");

  let categories = STATIC_CATEGORIES;

  // Try to get live category list (in case new categories were added)
  try {
    const apiCats = await withRetry(() => fetchCategories(), {
      retries: 2,
      delayMs: 2000,
      label: "BF categories",
    });

    if (apiCats.length > 0) {
      // Filter to produce-relevant categories using keyword matching
      const produceKeywords = [
        "vegetable", "fruit", "leafy", "herb", "mango",
        "seed", "nut", "green", "seasonal",
      ];
      const filtered = apiCats.filter((c) => {
        const name = (c.l2_category || c.name || "").toLowerCase();
        const url = (c.url_title || c.category_url || "").toLowerCase();
        return produceKeywords.some(
          (kw) => name.includes(kw) || url.includes(kw),
        );
      });

      if (filtered.length > 0) {
        categories = filtered.map((c) => ({
          id: c.id,
          label: c.l2_category || c.name || `cat-${c.id}`,
        }));
        logger.info(
          `[BF] Using ${categories.length} live categories from API`,
        );
      } else {
        logger.warn(
          "[BF] Live categories API returned no produce categories, using static list",
        );
      }
    }
  } catch (err) {
    logger.warn("[BF] Categories API unavailable, using static list", {
      error: err.message,
    });
  }

  const allProducts = [];

  for (const cat of categories) {
    try {
      const rawProducts = await withRetry(
        () => fetchCategoryProducts(cat.id, cat.label),
        { retries: 3, delayMs: 2000, label: `BF ${cat.label}` },
      );

      const parsed = parseProducts(rawProducts, cat.label);
      allProducts.push(...parsed);

      await sleep(400); // polite delay between categories
    } catch (err) {
      logger.error(`[BF] Failed to scrape category "${cat.label}" (id=${cat.id})`, {
        error: err.message,
      });
    }
  }

  const deduped = deduplicateProducts(allProducts);
  logger.info(`[BF] Total after dedup: ${deduped.length} products`);
  return deduped;
}

// ── Standalone runner ─────────────────────────────────────────────────────────
if (require.main === module) {
  const saveFlag = process.argv.includes("--save");
  (async () => {
    try {
      const products = await scrape();
      if (saveFlag) {
        const { saveOneScraper } = require("../scheduler/saveHelper");
        await saveOneScraper(PROVIDER_ID, products);
      } else {
        console.log("\nSample (first 10 products):");
        console.log(JSON.stringify(products.slice(0, 10), null, 2));
        console.log(`\nTotal scraped: ${products.length} products`);
        console.log("\nRun with --save to write to database");
      }
    } catch (err) {
      logger.error("[BF] Scrape failed", { error: err.message });
      process.exit(1);
    }
    process.exit(0);
  })();
}

module.exports = { scrape };
