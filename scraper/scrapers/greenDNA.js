/**
 * scraper/scrapers/greenDNA.js
 * Provider  : GreenDNA (www.greendna.in)
 * Platform  : Shopify — uses standard /products.json endpoint
 *
 * Collections confirmed:
 *   /collections/vegetables
 *   /collections/fruits
 *   /collections/greens
 *
 * Run preview : node scraper/scrapers/greenDNA.js
 * Run + save  : node scraper/scrapers/greenDNA.js --save
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
  override: false,
});

const { scrapeShopify } = require("../utils/shopifyScraper");
const { logger, withRetry } = require("../utils/index");

const PROVIDER_ID = "GD";

const COLLECTIONS = [
  "https://www.greendna.in/collections/vegetables/products.json?limit=250",
  "https://www.greendna.in/collections/fruits/products.json?limit=250",
  "https://www.greendna.in/collections/greens/products.json?limit=250",
].filter(Boolean);

async function scrape() {
  logger.info("[GD] Starting GreenDNA scrape via Shopify JSON");
  return withRetry(
    () =>
      scrapeShopify({ providerId: PROVIDER_ID, collectionsJson: COLLECTIONS }),
    { retries: 3, label: "GD full scrape" },
  );
}

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
      logger.error("[GD] Scrape failed", { error: err.message });
      process.exit(1);
    }
    process.exit(0);
  })();
}

module.exports = { scrape };
