/**
 * Minimal lemon price test — no DB, no Playwright
 * Run: node scraper/debug_lemon.js
 */

const axios = require("axios");

const URLS = [
  "https://satvafarm.com/collections/organic-vegetables/products.json?limit=250",
  "https://satvafarm.com/collections/organic-fruits/products.json?limit=250",
  "https://satvafarm.com/collections/all/products.json?limit=250",
];

(async () => {
  for (const url of URLS) {
    let products = [];
    try {
      const res = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        timeout: 15000,
      });
      products = res.data?.products || [];
      console.log(
        `\n${url.split("/collections/")[1].split("/")[0]}: ${products.length} products`,
      );
    } catch (e) {
      console.log(`\n${url} — FAILED: ${e.response?.status || e.message}`);
      continue;
    }

    // Find lemon
    const lemon = products.find((p) => /lemon/i.test(p.title));
    if (!lemon) {
      console.log("  No lemon found");
      continue;
    }

    console.log(`\nFound: "${lemon.title}"`);
    console.log("All variants from API:");
    lemon.variants.forEach((v, i) => {
      console.log(
        `  variants[${i}]: title="${v.title}"  price=${v.price}  available=${v.available}`,
      );
    });

    // Simulate what the scraper does
    const sorted = [...lemon.variants].sort(
      (a, b) => parseFloat(a.price) - parseFloat(b.price),
    );
    const available = sorted.filter((v) => v.available !== false);
    const pick = available.length > 0 ? available[0] : sorted[0];

    console.log(`\nScraper would pick: "${pick.title}" at Rs. ${pick.price}`);
    console.log("Expected: 6 pieces at Rs. 48");
    console.log(
      pick.price === "48.00" || parseFloat(pick.price) === 48
        ? "✓ CORRECT"
        : "✗ STILL WRONG — price is: " + pick.price,
    );
    break;
  }
  process.exit(0);
})();
