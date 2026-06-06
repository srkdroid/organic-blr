/**
 * scraper/scrapers/akshayakalpa.js
 * Provider  : Satva Farm (satvafarm.com)  [provider ID kept as 'AK']
 * Platform  : Shopify — products.json endpoint
 *
 * Key finding (May 2026):
 *   All fresh produce items have "Organic" in their title:
 *     e.g. "Tomato - Organic", "Lemon - Organic", "Spinach - Organic"
 *   Non-produce items (Kombucha, Ghee, etc.) do NOT have "Organic" in title.
 *   → Filter: only keep products whose title contains "organic" (case-insensitive)
 *
 * Confirmed collection URLs:
 *   /collections/organic-vegetables  (confirmed live)
 *   /collections/organic-fruits      (likely exists given naming pattern)
 *
 * Run preview : node scraper/scrapers/akshayakalpa.js
 * Run + save  : node scraper/scrapers/akshayakalpa.js --save
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
  extractUnit,
} = require("../utils/index");

const PROVIDER_ID = "AK";
const BASE = "https://satvafarm.com";

// Targeted collection URLs — avoids non-produce collections
const COLLECTIONS = [
  `${BASE}/collections/organic-vegetables/products.json?limit=250`,
  `${BASE}/collections/organic-fruits/products.json?limit=250`,
  // Fallback: fetch all and filter — catches anything the above miss
  `${BASE}/collections/all/products.json?limit=250`,
];

// ── Filter: only keep items with "organic" in the title ───────────────────────
function isOrganicProduce(title) {
  return /organic/i.test(title || "");
}

// ── Parse Shopify product → our standard shape ────────────────────────────────
function parseShopifyProduct(product) {
  const title = (product.title || "").trim();
  if (!isOrganicProduce(title)) return null;

  const variants = product.variants || [];
  if (variants.length === 0) return null;

  // Sort variants by price ascending so we always pick the cheapest
  const sorted = [...variants].sort(
    (a, b) => parseFloat(a.price || 999) - parseFloat(b.price || 999),
  );
  // Prefer cheapest available variant; fall back to cheapest overall
  const available = sorted.filter((v) => v.available !== false);
  const pick = available.length > 0 ? available[0] : sorted[0];

  const price = parseFloat(pick.price);
  if (!price) return null;

  // Unit from variant title (e.g. "6 pieces", "500g", "1 kg", "1 Bunch")
  // Ignore "Default Title" — that means no variant/size options
  // Fallback: try extracting unit from the product title itself
  const unit =
    pick.title && pick.title !== "Default Title"
      ? pick.title
      : extractUnit(title) || null;

  return buildProduct({
    providerId: PROVIDER_ID,
    name: title,
    price: pick.price,
    unit,
    available: pick.available !== false,
    imageUrl: product.images?.[0]?.src || null,
    productUrl: `${BASE}/products/${product.handle}`,
  });
}

// ── Fetch one paginated Shopify collection ────────────────────────────────────
async function fetchCollection(collectionUrl) {
  const allProducts = [];
  let page = 1;

  while (true) {
    const url = `${collectionUrl}&page=${page}`;
    logger.debug(`[AK→SatvaFarm] GET ${url}`);

    const response = await axios.get(url, {
      timeout: 20_000,
      headers: {
        "User-Agent": randomUserAgent(),
        Accept: "application/json",
        "Accept-Language": "en-IN,en;q=0.9",
      },
    });

    const { products } = response.data;
    if (!products || products.length === 0) break;

    for (const product of products) {
      const parsed = parseShopifyProduct(product);
      if (parsed) allProducts.push(parsed);
    }

    logger.debug(
      `[AK→SatvaFarm] Page ${page}: ${products.length} raw, ${allProducts.length} organic total`,
    );

    if (products.length < 250) break; // last page
    page++;
    await sleep(400);
  }

  return allProducts;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function scrape() {
  logger.info(
    "[AK→SatvaFarm] Starting Satva Farm scrape (Shopify JSON + organic filter)",
  );

  const allProducts = [];
  const seenHandles = new Set(); // dedup across collections

  for (const url of COLLECTIONS) {
    try {
      const products = await withRetry(() => fetchCollection(url), {
        retries: 3,
        delayMs: 2000,
        label: `AK ${url.split("/collections/")[1]?.split("/")[0]}`,
      });

      // Cross-collection dedup by Shopify handle (in productUrl)
      let added = 0;
      for (const p of products) {
        const handle = p.productUrl || p.name;
        if (!seenHandles.has(handle)) {
          seenHandles.add(handle);
          allProducts.push(p);
          added++;
        }
      }
      logger.info(
        `[AK→SatvaFarm] ${url.split("/collections/")[1]?.split("/")[0]}: ${added} new organic products`,
      );
    } catch (err) {
      // 404 = collection doesn't exist — skip silently
      if (err.response?.status === 404) {
        logger.debug(`[AK→SatvaFarm] Collection not found: ${url}`);
      } else {
        logger.error(`[AK→SatvaFarm] Failed: ${url}`, { error: err.message });
      }
    }
  }

  const deduped = deduplicateProducts(allProducts);
  logger.info(
    `[AK→SatvaFarm] Total organic produce: ${deduped.length} products`,
  );
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
        console.log('\nAll items contain "Organic" in their title.');
        console.log("Run with --save to write to database");
      }
    } catch (err) {
      logger.error("[AK→SatvaFarm] Scrape failed", { error: err.message });
      process.exit(1);
    }
    process.exit(0);
  })();
}

module.exports = { scrape };
