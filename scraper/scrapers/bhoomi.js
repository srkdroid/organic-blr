/**
 * scraper/scrapers/bhoomi.js
 * Provider  : Bhoomi Farms (bhoomi.farm)
 * Platform  : Custom REST API (Angular SPA), no auth required
 * City      : Bengaluru (city_id = 549)
 *
 * API endpoints (confirmed working July 2026):
 *
 *   GET /v1/web-app/get-all-products?page=1&limit=500&title=<url_title>&city_id=549
 *     → returns full category product list (up to 89–177 items per category)
 *     NOTE: ?category_id= only returns 20 items (hard server cap — do not use).
 *     NOTE: the title= approach was briefly broken when the server came back online
 *     after downtime; if it returns a MySQL GROUP BY error, retry — it's transient.
 *
 * Product JSON shape:
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
const CITY_ID = 549;     // Bengaluru
const PAGE_LIMIT = 500;  // High limit to get all products in one call per category
const TIMEOUT = 20_000;

// Fallback static category url_titles (confirmed from live API, July 2026).
// Only produce-relevant categories — excludes dairy, grocery, snacks etc.
// Use url_title (not category_id) — the id-based endpoint caps at 20 products.
const STATIC_CATEGORIES = [
  { title: "top-selling",         label: "Top Selling" },
  { title: "fresh-fruits",        label: "Fresh Fruits" },
  { title: "fresh-vegetables",    label: "Fresh Vegetables" },
  { title: "leafy-and-seasonings",label: "Leafy and Seasonings" },
  { title: "other-vegetables",    label: "Other Vegetables" },
  { title: "exotics",             label: "Exotics" },
  { title: "misfits",             label: "Misfits" },
  { title: "mangoes",             label: "Mangoes" },
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

// ── Fetch category list from the products response ───────────────────────────
// The get-all-categories endpoint is broken (MySQL error); instead we read
// the categories list embedded in any get-all-products response.
async function fetchCategories() {
  logger.debug(`[BF] Fetching embedded category list from products endpoint`);
  const res = await client.get("/get-all-products", {
    params: { city_id: CITY_ID },
  });
  if (res.data?.status !== 1) {
    throw new Error(res.data?.message || "Products API returned non-1 status");
  }
  // Each products response embeds the full category list
  return res.data?.data?.categories || [];
}

// ── Fetch all products for one category by url_title ─────────────────────────
async function fetchCategoryProducts(urlTitle, label) {
  logger.debug(`[BF] GET /get-all-products?title=${urlTitle} (${label})`);
  const res = await client.get("/get-all-products", {
    params: { city_id: CITY_ID, title: urlTitle, limit: PAGE_LIMIT, page: 1 },
  });

  if (res.data?.status !== 1) {
    throw new Error(
      `Products API error for "${urlTitle}": ${res.data?.message}`,
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

    const isMultiVariant = item.varient === 1 || (item.varients && item.varients.length > 0);

    if (isMultiVariant) {
      const variants = item.varients || [];
      for (const v of variants) {
        if (v.is_deleted) continue;
        const price = v.price ?? null;
        if (!price || price <= 0) continue;

        const variantInStock = inStock && (v.stock ?? 1) > 0;
        if (!variantInStock) continue; // Skip out-of-stock variants completely

        const unit = buildUnit(v.unit);

        results.push(
          buildProduct({
            providerId: PROVIDER_ID,
            name,
            price,
            unit,
            available: true,
            imageUrl,
            productUrl,
          }),
        );
      }
    } else {
      // Single variant product (varient === 0)
      const price = item.price ?? null;
      if (!price || price <= 0) continue;

      const productInStock = inStock && (item.stock ?? 1) > 0;
      if (!productInStock) continue; // Skip out-of-stock products completely

      const unit = buildUnit(item.unit);

      results.push(
        buildProduct({
          providerId: PROVIDER_ID,
          name,
          price,
          unit,
          available: true,
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

  // Try to refresh the category list from the embedded categories in a products response
  // (avoids the broken /get-all-categories endpoint)
  try {
    const apiCats = await withRetry(() => fetchCategories(), {
      retries: 2,
      delayMs: 2000,
      label: "BF categories",
    });

    if (apiCats.length > 0) {
      // Filter to produce-relevant categories only using allowlist
      const ALLOWED_URLS = new Set([
        "top-selling",
        "fresh-fruits",
        "fresh-vegetables",
        "leafy-and-seasonings",
        "other-vegetables",
        "exotics",
        "misfits",
        "mangoes",
      ]);
      const filtered = apiCats.filter((c) => {
        const url = (c.url_title || c.url || "").toLowerCase();
        return url && ALLOWED_URLS.has(url);
      });

      if (filtered.length > 0) {
        categories = filtered.map((c) => ({
          title: c.url_title || c.url,
          label: c.l2_category || c.name || c.url_title,
        }));
        logger.info(`[BF] Using ${categories.length} live categories from API`);
      } else {
        logger.warn("[BF] No produce categories from API, using static list");
      }
    }
  } catch (err) {
    logger.warn("[BF] Category fetch failed, using static list", {
      error: err.message,
    });
  }

  const allProducts = [];

  for (const cat of categories) {
    try {
      const rawProducts = await withRetry(
        () => fetchCategoryProducts(cat.title, cat.label),
        { retries: 3, delayMs: 2000, label: `BF ${cat.label}` },
      );

      const parsed = parseProducts(rawProducts, cat.label);
      allProducts.push(...parsed);

      await sleep(400); // polite delay between categories
    } catch (err) {
      logger.error(`[BF] Failed to scrape category "${cat.label}" (title=${cat.title})`, {
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
