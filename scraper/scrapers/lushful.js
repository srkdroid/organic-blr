/**
 * scraper/scrapers/lushful.js
 * Provider  : Lushful (lushful.org)
 *
 * lushful.org is a custom Node/React app with its own REST API.
 * Endpoint: GET /api/category/get/category?page=N&limit=50
 * Returns paginated product catalog (265 total as of May 2026).
 *
 * JSON shape per product:
 *   title.en            → product name
 *   variants[0].prices.price → selling price (INR)
 *   variants[0].weight  → quantity/weight value
 *   variants[0].weightType → unit (gm, kg, Pc, ml, etc.)
 *   variants[0].quantity → stock (0 = out of stock)
 *   tag                 → "Organic", "Carbide Free", etc.
 *
 * Known category IDs (from intercepted traffic):
 *   Fruits      : 66c308fcc979a82f46106a11  (24 products)
 *   All/no filter: returns all 265 products
 *
 * Strategy: fetch all products, let the normaliser filter to fresh produce.
 *
 * Run preview : node scraper/scrapers/lushful.js
 * Run + save  : node scraper/scrapers/lushful.js --save
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

const PROVIDER_ID = "LU";
const BASE_URL = "https://lushful.org/api/category/get/category";
const PAGE_LIMIT = 50; // API accepts up to 250, but 50 is polite
const TIMEOUT = 20_000;

// Known category IDs — fetch these specifically for fruits/vegetables,
// then also fetch all products as a catch-all fallback
const CATEGORIES = [
  { id: "66c308fcc979a82f46106a11", label: "Fruits" },
  { id: null, label: "All products" },
];

// ── Fetch one paginated category from the Lushful API ────────────────────────
async function fetchCategory(categoryId, label) {
  const products = [];
  let page = 1;

  while (true) {
    const params = { page, limit: PAGE_LIMIT };
    if (categoryId) params.categoryId = categoryId;

    const url = `${BASE_URL}?${new URLSearchParams(params).toString()}`;
    logger.debug(`[LU] GET ${url}`);

    const response = await axios.get(url, {
      timeout: TIMEOUT,
      headers: {
        "User-Agent": randomUserAgent(),
        Accept: "application/json",
        "Accept-Language": "en-IN,en;q=0.9",
        Referer: "https://lushful.org/",
        Origin: "https://lushful.org",
      },
    });

    const body = response.data;
    const items = body?.data?.products || [];
    const totalPages = body?.totalPages || 1;

    logger.info(
      `[LU] ${label} page ${page}/${totalPages} — ${items.length} items`,
    );

    for (const item of items) {
      const name = item.title?.en?.trim();
      if (!name) continue;

      // Each product may have multiple variants (sizes/weights).
      // We create one entry per variant so the UI can show e.g. 250g vs 500g.
      // If only one variant, that's fine too.
      for (const variant of item.variants || []) {
        const price = variant.prices?.price;
        const origPrice = variant.prices?.originalPrice;
        const inStock = (variant.quantity ?? 1) > 0;
        const weight = variant.weight || ""; // e.g. "500-600", "6", "250"
        const weightType = (variant.weightType || "").toLowerCase(); // gm, kg, pc, ml, l

        if (!price) continue;

        // Build unit string: "500g", "6pcs", "1kg", "250ml" etc.
        let unit = "";
        if (weight && weightType) {
          const typeMap = {
            gm: "g",
            gram: "g",
            grams: "g",
            kg: "kg",
            kgs: "kg",
            pc: "pcs",
            pcs: "pcs",
            piece: "pcs",
            pieces: "pcs",
            ml: "ml",
            l: "l",
            litre: "l",
            liter: "l",
            bunch: "bunch",
            bunches: "bunch",
          };
          const normType = typeMap[weightType] || weightType;
          unit = `${weight}${normType}`;
        } else if (weight) {
          unit = weight;
        }

        // Build image URL
        const imageFile = item.image?.[0] || "";
        const imageUrl = imageFile
          ? `https://lushful.org/api/upload/${imageFile}`
          : null;

        products.push(
          buildProduct({
            providerId: PROVIDER_ID,
            name,
            price,
            unit: unit || null,
            available: inStock,
            imageUrl,
            productUrl: `https://lushful.org/Products/${item._id}/${name.replace(/\s+/g, "-")}`,
          }),
        );
      }
    }

    if (page >= totalPages) break;
    page++;
    await sleep(300); // polite delay between pages
  }

  logger.info(`[LU] ${label}: fetched ${products.length} raw variants`);
  return products;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function scrape() {
  logger.info("[LU] Starting Lushful scrape via REST API");

  const allProducts = [];

  for (const cat of CATEGORIES) {
    try {
      const products = await withRetry(() => fetchCategory(cat.id, cat.label), {
        retries: 3,
        delayMs: 2000,
        label: `LU ${cat.label}`,
      });
      allProducts.push(...products);
    } catch (err) {
      logger.error(`[LU] Failed to fetch ${cat.label}`, { error: err.message });
    }
  }

  const deduped = deduplicateProducts(allProducts);
  logger.info(`[LU] Total after dedup: ${deduped.length} products`);
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
      logger.error("[LU] Scrape failed", { error: err.message });
      process.exit(1);
    }
    process.exit(0);
  })();
}

module.exports = { scrape };
