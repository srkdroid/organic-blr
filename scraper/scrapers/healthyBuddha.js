/**
 * scraper/scrapers/healthyBuddha.js
 * Provider  : Healthy Buddha (healthybuddha.in)
 * Platform  : OpenCart with custom megashop theme
 *
 * Confirmed DOM structure (May 2026, from live debug):
 *   96 products fully rendered in DOM on page load
 *   .product-block          → product card (96x)
 *   .product-col            → outer wrapper (96x)
 *   .name                   → product name div (96x)
 *   .name a                 → clickable name link with text
 *   .special-price          → sale/current price (96x)
 *   .price                  → price container (96x)
 *   .WebRupee               → rupee symbol span (106x)
 *   .product-img img        → product image
 *   .item-default           → card container (96x)
 *   body class              → "product-category-107_74" (vegetables=107, fruits=TBD)
 *
 * Price structure in OpenCart megashop:
 *   <div class="special-price">Rs. 45.00</div>   ← sale price (use this)
 *   OR <span class="WebRupee">₹</span> 45.00
 *
 * Products load SYNCHRONOUSLY in the HTML — no AJAX needed.
 * No login required. Playwright used only to render JS.
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

const { chromium } = require("playwright");
const {
  logger,
  withRetry,
  buildProduct,
  deduplicateProducts,
  randomUserAgent,
  sleep,
} = require("../utils/index");

const PROVIDER_ID = "HB";
const TIMEOUT = parseInt(process.env.SCRAPE_TIMEOUT_MS) || 45_000;

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

// ── Extract products from rendered DOM ────────────────────────────────────────
async function extractProducts(page, label) {
  const products = await page.evaluate(() => {
    const results = [];

    // Primary selector confirmed from debug: .product-block
    const cards = Array.from(
      document.querySelectorAll(
        ".product-block, .item-default, .resp-product-block",
      ),
    );

    for (const card of cards) {
      // ── Name ─────────────────────────────────────────────────────────────
      const nameEl = card.querySelector(".name a, .name, h4 a, h4");
      const name =
        nameEl?.innerText?.trim() || nameEl?.getAttribute("title")?.trim();
      if (!name || name.length < 2) continue;

      // ── Price ─────────────────────────────────────────────────────────────
      // OpenCart megashop: .special-price has the sale price
      // Fall back to .price if no sale price
      const specialPriceEl = card.querySelector(".special-price");
      const priceEl = card.querySelector(".price");

      let priceRaw = "";
      if (specialPriceEl?.innerText?.trim()) {
        priceRaw = specialPriceEl.innerText.trim();
      } else if (priceEl?.innerText?.trim()) {
        // .price may contain both old and new price — get last number
        priceRaw = priceEl.innerText.trim();
      }

      if (!priceRaw) continue;

      // ── Unit ──────────────────────────────────────────────────────────────
      // HB includes weight in product name: "Tomato (500g)" or "Spinach - 1 Bunch"
      const unitRegex =
        /(\d+[\d.\-]*\s*(?:g|gm|gms|gram|grams|kg|kgs|ml|l|pcs?|piece|pieces|bunch|bunches|no\.?|pack|strip)s?)/i;

      const unitMatch = name.match(
        /[\-–(]?\s*(\d+[\d.-]*\s*(?:g|gm|gms|gram|grams|kg|kgs|ml|l|pcs?|piece|pieces|bunch|bunches|no\.?|pack|strip)s?)\s*[)–]?/i,
      );
      let unit = unitMatch ? unitMatch[1].trim() : null;

      // Fallback 1: look for a weight/quantity element in the product card
      if (!unit) {
        const weightEl = card.querySelector(
          '.weight, .product-weight, .option-value, [class*="weight"], [class*="qty"], [class*="unit"]',
        );
        if (weightEl?.innerText) {
          const wMatch = weightEl.innerText.match(unitRegex);
          if (wMatch) unit = wMatch[1].trim();
        }
      }

      // Fallback 2: extract from price text (HB often shows "Rs 39\n- 250g")
      if (!unit && priceRaw) {
        const priceUnitMatch = priceRaw.match(unitRegex);
        if (priceUnitMatch) unit = priceUnitMatch[1].trim();
      }

      // Clean name — remove the unit part in parentheses or after dash
      const cleanName = name
        .replace(
          /\s*[\-–(]\s*\d+[\d.-]*\s*(?:g|gm|gms|gram|grams|kg|kgs|ml|l|pcs?|piece|pieces|bunch|bunches|no\.?|pack|strip)s?\s*[)–]?/i,
          "",
        )
        .trim();

      // ── Availability ──────────────────────────────────────────────────────
      // OpenCart shows "Out of Stock" button or disables add-to-cart
      const oosBtn = card.querySelector(
        '.button-cart[disabled], .out-of-stock, [class*="outofstock"], ' +
          "button[disabled].button-cart",
      );
      // Also check if the price element shows "Out of Stock" text
      const oosText = (card.innerText || "")
        .toLowerCase()
        .includes("out of stock");
      const available = !oosBtn && !oosText;

      // ── Image ─────────────────────────────────────────────────────────────
      const imgEl = card.querySelector(
        ".product-img img, .web-image-resp img, img",
      );
      const imgSrc =
        imgEl?.src || imgEl?.dataset?.src || imgEl?.dataset?.lazySrc || null;

      // ── Product URL ───────────────────────────────────────────────────────
      const linkEl = card.querySelector(
        '.name a, a[href*="healthybuddha.in/"]',
      );
      const productUrl = linkEl?.href || null;

      results.push({
        name: cleanName || name,
        priceRaw,
        unit,
        available,
        imageUrl: imgSrc,
        productUrl,
      });
    }

    return results;
  });

  logger.info(`[HB] ${label}: extracted ${products.length} products from DOM`);

  return products
    .filter((p) => p.name && p.priceRaw)
    .map((p) =>
      buildProduct({
        providerId: PROVIDER_ID,
        name: p.name,
        price: p.priceRaw,
        unit: p.unit,
        available: p.available,
        imageUrl: p.imageUrl,
        productUrl: p.productUrl,
      }),
    );
}

// ── Scrape one category URL (handles pagination) ──────────────────────────────
async function scrapeCategory(page, catInfo) {
  const allProducts = [];
  let pageNum = 1;

  while (true) {
    const url = pageNum === 1 ? catInfo.url : `${catInfo.url}?page=${pageNum}`;

    logger.info(`[HB] Loading ${catInfo.label} p${pageNum}: ${url}`);

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: TIMEOUT });
    } catch (e) {
      // networkidle timeout is fine — products may already be in DOM
      logger.debug(`[HB] goto note: ${e.message.slice(0, 80)}`);
    }

    // Wait for the confirmed selector .product-block
    try {
      await page.waitForSelector(".product-block, .item-default", {
        timeout: 10_000,
      });
    } catch {
      logger.warn(`[HB] ${catInfo.label} p${pageNum}: no .product-block found`);
      break;
    }

    // Small scroll to ensure lazy images don't block anything
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);

    const products = await extractProducts(
      page,
      `${catInfo.label} p${pageNum}`,
    );
    if (products.length === 0) break;
    allProducts.push(...products);

    // Check for next page link
    const hasNext = await page
      .evaluate(() => {
        const next = document.querySelector(
          '.pagination .next a, a[rel="next"], ' +
            ".pagination li:last-child a:not(.disabled)",
        );
        return !!next && next.offsetParent !== null;
      })
      .catch(() => false);

    if (!hasNext) break;
    pageNum++;
    await sleep(800);
  }

  return allProducts;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function scrape() {
  logger.info("[HB] Starting Healthy Buddha scrape (Playwright / OpenCart)");

  const browser = await chromium.launch({
    headless: process.env.SCRAPE_HEADLESS !== "false",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const context = await browser.newContext({
    userAgent: randomUserAgent(),
    viewport: { width: 1440, height: 900 },
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    extraHTTPHeaders: { "Accept-Language": "en-IN,en;q=0.9" },
  });

  // Block fonts and analytics only — keep CSS/JS (needed for OpenCart to render)
  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    const url = route.request().url();
    if (type === "font") return route.abort();
    if (
      url.includes("google-analytics") ||
      url.includes("googletagmanager") ||
      url.includes("hotjar") ||
      url.includes("facebook.net")
    ) {
      return route.abort();
    }
    return route.continue();
  });

  const page = await context.newPage();

  try {
    // Warm up — visit homepage first to establish session cookies
    logger.info("[HB] Warming up session...");
    await page.goto("https://healthybuddha.in", {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT,
    });
    await sleep(1500);

    const allProducts = [];
    for (const cat of CATEGORY_URLS) {
      try {
        const products = await withRetry(() => scrapeCategory(page, cat), {
          retries: 2,
          delayMs: 3000,
          label: `HB ${cat.label}`,
        });
        allProducts.push(...products);
        logger.info(`[HB] ${cat.label}: ${products.length} products`);
        await sleep(1000);
      } catch (err) {
        logger.error(`[HB] Failed: ${cat.label}`, { error: err.message });
      }
    }

    const deduped = deduplicateProducts(allProducts);
    logger.info(`[HB] Total after dedup: ${deduped.length} products`);
    return deduped;
  } finally {
    await context.close();
    await browser.close();
  }
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
