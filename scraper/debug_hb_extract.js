/**
 * Debug — shows exactly what the HB scraper extracts from the vegetables page
 * including which items are missing and why (no price, no name, etc.)
 * Run: node scraper/debug_hb_extract.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../.env.local"),
  override: false,
});

const { chromium } = require("playwright");
const { sleep } = require("./utils/index");

(async () => {
  const browser = await chromium.launch({
    headless: process.env.SCRAPE_HEADLESS !== "false",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
  });

  const page = await context.newPage();

  console.log("Loading HB vegetables page...");
  try {
    await page.goto("https://healthybuddha.in/fruits-vegetables/vegetables", {
      waitUntil: "networkidle",
      timeout: 45000,
    });
  } catch (e) {
    /* networkidle timeout ok */
  }

  await page.waitForSelector(".product-block, .item-default", {
    timeout: 15000,
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);

  // Extract full detail from every product card
  const result = await page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll(".product-block, .item-default"),
    );

    return cards.map((card) => {
      const nameEl = card.querySelector(".name a, .name");
      const specialPriceEl = card.querySelector(".special-price");
      const priceEl = card.querySelector(".price");
      const allPriceEls = Array.from(
        card.querySelectorAll('[class*="price"],[class*="Price"]'),
      );

      return {
        // Name extraction
        name: nameEl?.innerText?.trim() || null,
        nameClass: nameEl?.className || null,

        // Price extraction attempts
        specialPrice: specialPriceEl?.innerText?.trim() || null,
        anyPrice: priceEl?.innerText?.trim() || null,

        // ALL price-like elements found in this card
        allPriceTexts: allPriceEls
          .map((el) => ({
            cls: el.className,
            text: el.innerText?.trim()?.slice(0, 40),
          }))
          .filter((x) => x.text),

        // Raw card text (first 100 chars) for manual inspection
        cardText: card.innerText?.trim()?.slice(0, 120),
      };
    });
  });

  // Classify results
  const extracted = result.filter(
    (r) => r.name && (r.specialPrice || r.anyPrice),
  );
  const missingPrice = result.filter(
    (r) => r.name && !r.specialPrice && !r.anyPrice,
  );
  const missingName = result.filter((r) => !r.name);

  console.log(`\nTotal cards found: ${result.length}`);
  console.log(`Successfully extracted (name + price): ${extracted.length}`);
  console.log(`Missing price: ${missingPrice.length}`);
  console.log(`Missing name: ${missingName.length}`);

  // Print successfully extracted items
  console.log("\n=== EXTRACTED ITEMS ===");
  extracted.forEach((r, i) =>
    console.log(
      `  [${i + 1}] "${r.name}" | special="${r.specialPrice}" | price="${r.anyPrice}"`,
    ),
  );

  // Print items missing price — these are the ones NOT being saved
  if (missingPrice.length > 0) {
    console.log("\n=== MISSING PRICE (not being saved) ===");
    missingPrice.forEach((r, i) => {
      console.log(`\n  [${i + 1}] Name: "${r.name}"`);
      console.log(`       specialPrice: null`);
      console.log(`       anyPrice: null`);
      console.log(`       allPriceEls: ${JSON.stringify(r.allPriceTexts)}`);
      console.log(`       cardText: "${r.cardText}"`);
    });
  }

  // Check specifically for beans
  const beans = result.filter(
    (r) =>
      r.name?.toLowerCase().includes("bean") ||
      r.cardText?.toLowerCase().includes("bean"),
  );
  if (beans.length > 0) {
    console.log("\n=== BEANS CARDS ===");
    beans.forEach((r) => {
      console.log(`  Name: "${r.name}"`);
      console.log(`  specialPrice: "${r.specialPrice}"`);
      console.log(`  anyPrice: "${r.anyPrice}"`);
      console.log(`  allPriceEls: ${JSON.stringify(r.allPriceTexts)}`);
      console.log(`  cardText: "${r.cardText}"`);
    });
  } else {
    console.log("\n=== BEANS: not found in any card ===");
    console.log(
      'Either page is paginated, or "beans" has a different name on HB',
    );
  }

  await browser.close();
  console.log("\nDebug complete.");
})().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
