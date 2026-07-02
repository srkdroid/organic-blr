/**
 * scraper/scrapers/bhoomi.js
 * Provider  : Bhoomi Farms (bhoomi.farm)
 * Platform  : Custom REST API (Angular SPA), no auth required
 * City      : Bengaluru (city_id = 549)
 *
 * API endpoints:
 *   GET /v1/web-app/get-all-categories?city_id=549
 *     → returns list of categories (l2_categories array)
 *       each with: id, l2_category (name), url_title
 *
 *   GET /v1/web-app/get-all-products?page=1&limit=200&title={url_title}&city_id=549
 *     → returns products for a category
 *       each with: product_name, product_image, is_in_stock,
 *                  variants[]: { quantity_variant, price, market_price, stock }
 *
 * Strategy:
 *   1. Fetch all categories
 *   2. Scrape only produce-relevant categories (vegetables, fruits, leafy, herbs, exotic)
 *   3. For each product, emit one entry per variant (size/weight)
 *   4. No pagination needed — limit=200 covers the full catalogue per category
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
const CITY_ID = 549;   // Bengaluru
const PAGE_LIMIT = 200; // API can handle large limits; covers most categories in one call
const TIMEOUT = 20_000;

// Only scrape produce-relevant category URL titles.
// Discovered from get-all-categories during feasibility study (July 2026).
// If null, we fall back to fetching from the categories API dynamically.
const PRODUCE_CATEGORIES = [
  "fresh-vegetables",
  "fresh-fruits",
  "leafy-and-seasonings",
  "dried-fruits-nuts-and-seeds",
  "herbs-and-microgreens",
  "mangoes",
];

// ── HTTP client setup ─────────────────────────────────────────────────────────
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

// ── Fetch category list from the API ─────────────────────────────────────────
async function fetchCategories() {
  logger.debug(`[BF] GET /get-all-categories?city_id=${CITY_ID}`);
  const res = await client.get("/get-all-categories", {
    params: { city_id: CITY_ID },
  });
  // API shape: data.l2_categories[] or data.categories[]
  const data = res.data?.data;
  return (
    data?.l2_categories ||
    data?.categories ||
    []
  );
}

// ── Fetch products for one category ──────────────────────────────────────────
async function fetchCategoryProducts(urlTitle) {
  const params = {
    page: 1,
    limit: PAGE_LIMIT,
    title: urlTitle,
    city_id: CITY_ID,
  };

  logger.debug(`[BF] GET /get-all-products?title=${urlTitle}`);
  const res = await client.get("/get-all-products", { params });
  return res.data?.data?.products || [];
}

// ── Parse variant quantity string → unit ──────────────────────────────────────
// e.g. "500 g" → "500g", "1 kg" → "1kg", "6 pcs" → "6pcs", "1 bunch" → "1bunch"
function parseVariantUnit(raw) {
  if (!raw) return null;
  let u = String(raw).trim().toLowerCase();
  // Normalise known patterns
  u = u.replace(/\s*(grams?|gm|gms)\b/, "g");
  u = u.replace(/\s*(kilograms?|kgs?)\b/, "kg");
  u = u.replace(/\s*(pieces?|pcs?|nos?)\b/, "pcs");
  u = u.replace(/\s*(bunches?)\b/, "bunch");
  u = u.replace(/\s*(litres?|liters?|ltr?)\b/, "l");
  u = u.replace(/\s*(millilitres?|ml)\b/, "ml");
  // Remove stray internal whitespace between number and unit
  u = u.replace(/(\d)\s+(g|kg|ml|l|pcs|bunch)$/, "$1$2");
  return u;
}

// ── Convert raw API products → scraper product objects ────────────────────────
function parseProducts(rawProducts) {
  const results = [];

  for (const item of rawProducts) {
    const name = item.product_name?.trim();
    if (!name) continue;

    const inStock = item.is_in_stock !== false; // default to true if missing
    const imageUrl = item.product_image || null;
    const productUrl = `https://bhoomi.farm/products/${item.url_title || name.replace(/\s+/g, "-").toLowerCase()}`;

    const variants = item.variants || [];

    if (variants.length === 0) {
      // No variants — skip; we need a price to be useful
      continue;
    }

    for (const variant of variants) {
      const price = variant.price ?? variant.mrp ?? null;
      if (!price) continue;

      const variantInStock = inStock && (variant.stock ?? 1) > 0;
      const unit = parseVariantUnit(variant.quantity_variant);

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

  return results;
}

// ── Main scrape function ──────────────────────────────────────────────────────
async function scrape() {
  logger.info("[BF] Starting Bhoomi Farms scrape via REST API");

  let categoriesToScrape = PRODUCE_CATEGORIES;

  // Optionally refresh from the live API to catch new categories
  try {
    const apiCats = await withRetry(() => fetchCategories(), {
      retries: 2,
      delayMs: 2000,
      label: "BF categories",
    });

    if (apiCats.length > 0) {
      // Filter to only those whose url_title matches our whitelist
      const apiTitles = apiCats
        .map((c) => c.url_title || c.category_url || c.l2_category_url)
        .filter(Boolean);

      // Merge: keep our static list but also add any new ones from the API
      // that match known produce keywords
      const produceKeywords = ["vegetable", "fruit", "leafy", "herb", "mango", "seed", "nut", "greens"];
      const dynamicExtra = apiTitles.filter(
        (t) =>
          !categoriesToScrape.includes(t) &&
          produceKeywords.some((kw) => t.includes(kw)),
      );
      if (dynamicExtra.length > 0) {
        logger.info(`[BF] Discovered extra categories: ${dynamicExtra.join(", ")}`);
        categoriesToScrape = [...categoriesToScrape, ...dynamicExtra];
      }

      logger.info(`[BF] Will scrape ${categoriesToScrape.length} categories`);
    }
  } catch (err) {
    logger.warn("[BF] Could not fetch categories from API, using static list", {
      error: err.message,
    });
  }

  const allProducts = [];

  for (const urlTitle of categoriesToScrape) {
    try {
      const rawProducts = await withRetry(
        () => fetchCategoryProducts(urlTitle),
        { retries: 3, delayMs: 2000, label: `BF ${urlTitle}` },
      );

      const parsed = parseProducts(rawProducts);
      logger.info(`[BF] ${urlTitle}: ${rawProducts.length} products → ${parsed.length} variants`);
      allProducts.push(...parsed);

      await sleep(300); // polite delay
    } catch (err) {
      logger.error(`[BF] Failed to scrape category "${urlTitle}"`, {
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
