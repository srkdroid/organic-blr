/**
 * scraper/scrapers/healthyBuddha.js
 * Provider  : Healthy Buddha (healthybuddha.in)
 * Platform  : OpenCart (server-rendered HTML)
 * Method    : Fast HTTP + Cheerio (no heavy Chromium browser required)
 *
 * Products load synchronously in OpenCart HTML.
 * Using Cheerio avoids Playwright timeouts and reduces memory usage on VM.
 *
 * Run preview : node scraper/scrapers/healthyBuddha.js
 * Run + save  : node scraper/scrapers/healthyBuddha.js --save
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
  override: false,
});

const axios = require("axios");
const cheerio = require("cheerio");
const {
  logger,
  withRetry,
  buildProduct,
  deduplicateProducts,
  randomUserAgent,
  sleep,
} = require("../utils/index");

const PROVIDER_ID = "HB";
const BASE_URL = "https://healthybuddha.in";
const TIMEOUT = parseInt(process.env.SCRAPE_TIMEOUT_MS) || 25_000;

const CATEGORY_URLS = [
  {
    url: "https://healthybuddha.in/fruits-vegetables/vegetables",
    label: "vegetables",
  },
  {
    url: "https://healthybuddha.in/fruits-vegetables/fresh-fruits",
    label: "fruits",
  },
  {
    url: "https://healthybuddha.in/fruits-vegetables/fresh-leafy-greens",
    label: "leafy-greens",
  },
  {
    url: "https://healthybuddha.in/fruits-vegetables/exotics",
    label: "exotics",
  },
  {
    url: "https://healthybuddha.in/fruits-vegetables/micro-greens",
    label: "micro-greens",
  },
];

async function scrapeCategory(catInfo) {
  const allProducts = [];
  let pageNum = 1;

  while (true) {
    const url = pageNum === 1 ? catInfo.url : `${catInfo.url}?page=${pageNum}`;
    logger.debug(`[HB] Fetching ${catInfo.label} p${pageNum}: ${url}`);

    const res = await axios.get(url, {
      headers: {
        "User-Agent": randomUserAgent(),
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
      },
      timeout: TIMEOUT,
    });

    const $ = cheerio.load(res.data);
    const cards = $(".product-block, .item-default, .resp-product-block");
    if (cards.length === 0) {
      break;
    }

    let pageProductCount = 0;
    cards.each((_, el) => {
      const card = $(el);
      const nameEl = card.find(".name a, .name, h4 a, h4").first();
      const name = nameEl.text().trim() || nameEl.attr("title")?.trim();
      if (!name || name.length < 2) return;

      const specialPriceEl = card.find(".special-price").first();
      const priceEl = card.find(".price").first();

      let priceRaw = "";
      if (specialPriceEl.text().trim()) {
        priceRaw = specialPriceEl.text().trim();
      } else if (priceEl.text().trim()) {
        priceRaw = priceEl.text().trim();
      }

      if (!priceRaw) return;

      // Unit extraction
      const unitRegex =
        /(\d+[\d.\-]*\s*(?:g|gm|gms|gram|grams|kg|kgs|ml|l|pcs?|piece|pieces|bunch|bunches|no\.?|pack|strip)s?)/i;
      const unitMatch = name.match(
        /[\-–(]?\s*(\d+[\d.-]*\s*(?:g|gm|gms|gram|grams|kg|kgs|ml|l|pcs?|piece|pieces|bunch|bunches|no\.?|pack|strip)s?)\s*[)–]?/i,
      );
      let unit = unitMatch ? unitMatch[1].trim() : null;

      if (!unit) {
        const weightEl = card
          .find(
            '.weight, .product-weight, .option-value, [class*="weight"], [class*="qty"], [class*="unit"]',
          )
          .first();
        if (weightEl.length) {
          const wMatch = weightEl.text().match(unitRegex);
          if (wMatch) unit = wMatch[1].trim();
        }
      }

      if (!unit && priceRaw) {
        const pMatch = priceRaw.match(unitRegex);
        if (pMatch) unit = pMatch[1].trim();
      }

      const cleanName = name
        .replace(
          /\s*\([^)]*(?:g|gm|kg|ml|l|piece|pcs|bunch|pack)[^)]*\)/gi,
          "",
        )
        .replace(
          /\s*[\-–]\s*\d+[\d.-]*\s*(?:g|gm|gms|gram|grams|kg|kgs|ml|l|pcs?|piece|pieces|bunch|bunches|no\.?|pack|strip)s?\s*$/i,
          "",
        )
        .trim();

      const oosBtn =
        card.find(
          '.button-cart[disabled], .out-of-stock, [class*="outofstock"], button[disabled].button-cart',
        ).length > 0;
      const oosText = card.text().toLowerCase().includes("out of stock");
      const available = !oosBtn && !oosText;

      const imgEl = card
        .find(".product-img img, .web-image-resp img, img")
        .first();
      let imgSrc = imgEl.attr("src") || imgEl.attr("data-src") || null;
      if (imgSrc && !imgSrc.startsWith("http")) {
        imgSrc = `${BASE_URL}/${imgSrc.replace(/^\//, "")}`;
      }

      const linkEl = card.find('.name a, a[href*="healthybuddha.in/"]').first();
      let productUrl = linkEl.attr("href") || null;

      allProducts.push(
        buildProduct({
          providerId: PROVIDER_ID,
          name: cleanName || name,
          price: priceRaw,
          unit,
          available,
          imageUrl: imgSrc,
          productUrl,
        }),
      );
      pageProductCount++;
    });

    // Next page check
    const hasNext =
      $(
        '.pagination .next a, a[rel="next"], .pagination li:last-child a:not(.disabled)',
      ).length > 0;
    if (!hasNext || pageProductCount === 0) break;
    pageNum++;
    sleep(300);
  }

  return allProducts;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function scrape() {
  logger.info("[HB] Starting Healthy Buddha scrape (Cheerio / HTTP)");

  const allProducts = [];
  for (const cat of CATEGORY_URLS) {
    try {
      const products = await withRetry(() => scrapeCategory(cat), {
        retries: 2,
        delayMs: 2000,
        label: `HB ${cat.label}`,
      });
      allProducts.push(...products);
      logger.info(`[HB] ${cat.label}: ${products.length} products`);
      await sleep(300);
    } catch (err) {
      logger.error(`[HB] Failed: ${cat.label}`, { error: err.message });
    }
  }

  const deduped = deduplicateProducts(allProducts);
  logger.info(`[HB] Total after dedup: ${deduped.length} products`);
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
      logger.error("[HB] Scrape failed", { error: err.message });
      process.exit(1);
    }
    process.exit(0);
  })();
}

module.exports = { scrape };
