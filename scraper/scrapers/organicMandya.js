/**
 * scraper/scrapers/organicMandya.js
 * Provider  : Organic Mandya (organicmandya.com)
 * Platform  : Shopify — /products.json endpoint
 *
 * Run preview : node scraper/scrapers/organicMandya.js
 * Run + save  : node scraper/scrapers/organicMandya.js --save
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
  override: false,
});

const { scrapeShopify } = require("../utils/shopifyScraper");
const { logger, withRetry } = require("../utils/index");

const PROVIDER_ID = "OM";

// Hardcoded — only produce collections, no dairy/grocery
const COLLECTIONS = [
  "https://organicmandya.com/collections/fruits-vegetables/products.json?limit=250",
  "https://organicmandya.com/collections/fruits/products.json?limit=250",
];

async function scrape() {
  logger.info("[OM] Starting Organic Mandya scrape via Shopify JSON");
  const products = await withRetry(
    () =>
      scrapeShopify({ providerId: PROVIDER_ID, collectionsJson: COLLECTIONS }),
    { retries: 3, label: "OM full scrape" },
  );
  logger.info(`[OM] Raw scrape complete — ${products.length} products`);
  return products;
}

if (require.main === module) {
  const saveFlag = process.argv.includes("--save");
  scrape()
    .then(async (products) => {
      if (saveFlag) {
        const { saveOneScraper } = require("../scheduler/saveHelper");
        await saveOneScraper(PROVIDER_ID, products);
      } else {
        console.log("\nSample (first 10 products):");
        console.log(JSON.stringify(products.slice(0, 10), null, 2));
        console.log(`\nTotal scraped: ${products.length} products`);
        console.log("\nRun with --save to write to database");
      }
      process.exit(0);
    })
    .catch((err) => {
      logger.error("[OM] Scrape failed", { error: err.message });
      process.exit(1);
    });
}

module.exports = { scrape };
