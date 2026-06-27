/**
 * scraper/scrapers/farmFresh.js
 * Provider  : Farm Fresh Bangalore (farmfreshbangalore.com)
 * Platform  : UpMarket SaaS — POST /getGroup API (no browser needed)
 *
 * Confirmed field structure (May 2026):
 *   item.name             → "Radish With Leaves 1 Bunch"
 *   item.price            → "₹ 57"   (string, MRP)
 *   item.reducedPrice     → "₹ 52"   (string, selling price — use this)
 *   item.stock            → ""       (empty string = in stock; "0" = out of stock)
 *   item.visual.src       → S3 image URL
 *   item.selections[]
 *     .name               → "1 bunch", "500 gm", "1 kg"  (unit)
 *     .price              → "₹ 57"   (MRP for this variant)
 *     .reducedPrice       → "₹ 52"   (selling price for this variant)
 *     .stock              → "" = in stock
 *
 * Strategy: use reducedPrice (selling price) when available, else price (MRP).
 *           For multi-variant products, preserve all selections.
 *
 * Run preview : node scraper/scrapers/farmFresh.js
 * Run + save  : node scraper/scrapers/farmFresh.js --save
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
  parsePrice,
} = require("../utils/index");

const PROVIDER_ID = "FF";
const API_URL = "https://farmfreshbangalore.com/getGroup";
const ORG_ID = "AA0062";
const RECORDS = 20;

const CATEGORIES = [
  { name: "vegetables", label: "Vegetables" },
  { name: "fruits", label: "Fruits" },
];

// ── Parse price string "₹ 57" or "₹57" → 57 ─────────────────────────────────
function parsePriceStr(str) {
  if (!str) return null;
  // Remove ₹, Rs, spaces, commas — keep digits and decimal point
  const cleaned = String(str)
    .replace(/[₹Rs\s,]/gi, "")
    .trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

// ── Is item in stock? stock="" means in stock, stock="0" means out of stock ──
function isInStock(stockVal) {
  if (stockVal === "" || stockVal === null || stockVal === undefined)
    return true;
  const n = parseInt(stockVal);
  if (!isNaN(n)) return n > 0;
  return true;
}

// ── Convert one UpMarket item → our standard product shape ───────────────────
function parseItem(item) {
  const name = (item.name || "").trim();
  if (!name) return [];

  const selections = Array.isArray(item.selections) ? item.selections : [];

  if (selections.length > 0) {
    // Build one product per variant, then return only the cheapest
    const variants = selections
      .map((sel) => {
        // Prefer reducedPrice (sale price) over price (MRP)
        const price =
          parsePriceStr(sel.reducedPrice) || parsePriceStr(sel.price);
        if (!price) return null;

        const unit = (sel.name || "").trim() || null;
        const available = isInStock(sel.stock);

        return buildProduct({
          providerId: PROVIDER_ID,
          name,
          price,
          unit,
          available,
          imageUrl: item.visual?.src || null,
          productUrl: item.seoName
            ? `https://farmfreshbangalore.com/product/${item.seoName}`
            : null,
        });
      })
      .filter(Boolean);

    if (variants.length === 0) return [];

    // Return ALL variants — multi-unit support
    return variants;
  }

  // No selections — use top-level price fields
  const price = parsePriceStr(item.reducedPrice) || parsePriceStr(item.price);
  if (!price) return [];

  return [
    buildProduct({
      providerId: PROVIDER_ID,
      name,
      price,
      unit: item.selectionLabel || null,
      available: isInStock(item.stock),
      imageUrl: item.visual?.src || null,
      productUrl: item.seoName
        ? `https://farmfreshbangalore.com/product/${item.seoName}`
        : null,
    }),
  ];
}

// ── Fetch one page ────────────────────────────────────────────────────────────
async function fetchPage(categoryName, pageId) {
  const response = await axios.post(
    API_URL,
    {
      orgId: ORG_ID,
      name: categoryName,
      pageId,
      records: RECORDS,
      style: "style-21",
      scope: "local",
    },
    {
      timeout: 20_000,
      headers: {
        "User-Agent": randomUserAgent(),
        "Content-Type": "application/json",
        Accept: "application/json",
        Referer: `https://farmfreshbangalore.com/collections/${categoryName}`,
        Origin: "https://farmfreshbangalore.com",
      },
    },
  );

  const items = response.data?.data?.items || [];
  const total = response.data?.data?.totalRecords || 0;
  return { items, total };
}

// ── Scrape all pages of one category ─────────────────────────────────────────
async function scrapeCategory(categoryName, label) {
  const allProducts = [];

  const { items: firstItems, total } = await withRetry(
    () => fetchPage(categoryName, 1),
    { retries: 3, delayMs: 2000, label: `FF ${label} p1` },
  );

  firstItems.forEach((item) => allProducts.push(...parseItem(item)));
  const totalPages = Math.ceil(total / RECORDS);
  logger.info(
    `[FF] ${label}: ${total} records across ${totalPages} pages, p1 → ${firstItems.length} items`,
  );

  for (let p = 2; p <= totalPages; p++) {
    try {
      const { items } = await withRetry(() => fetchPage(categoryName, p), {
        retries: 3,
        delayMs: 2000,
        label: `FF ${label} p${p}`,
      });
      if (items.length === 0) break;
      items.forEach((item) => allProducts.push(...parseItem(item)));
      logger.info(
        `[FF] ${label}: page ${p}/${totalPages} → ${items.length} items`,
      );
      await sleep(300);
    } catch (err) {
      logger.error(`[FF] ${label} page ${p} failed`, { error: err.message });
      break;
    }
  }

  logger.info(`[FF] ${label}: ${allProducts.length} products parsed`);
  return allProducts;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function scrape() {
  logger.info("[FF] Starting Farm Fresh Bangalore scrape (UpMarket POST API)");
  const allProducts = [];

  for (const cat of CATEGORIES) {
    const products = await scrapeCategory(cat.name, cat.label);
    allProducts.push(...products);
  }

  const deduped = deduplicateProducts(allProducts);
  logger.info(`[FF] Total after dedup: ${deduped.length} products`);
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
      logger.error("[FF] Scrape failed", { error: err.message });
      process.exit(1);
    }
    process.exit(0);
  })();
}

module.exports = { scrape };
