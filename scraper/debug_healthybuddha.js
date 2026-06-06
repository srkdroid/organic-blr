/**
 * DEBUG — Healthy Buddha network + DOM inspector
 * Run: node scraper/debug_healthybuddha.js
 *
 * Captures:
 *   1. Every JSON API response (to find if products load via XHR)
 *   2. DOM structure after full page load (to find actual CSS selectors)
 *   3. All unique CSS classes on the page (to identify product cards)
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
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
  });

  const page = await context.newPage();

  // ── Capture ALL JSON responses ─────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("NETWORK: All JSON responses");
  console.log("=".repeat(60));

  page.on("response", async (res) => {
    const url = res.url();
    const ct = res.headers()["content-type"] || "";
    if (!ct.includes("json")) return;
    try {
      const json = await res.json();
      const str = JSON.stringify(json);
      if (str.length < 30) return;

      // Find arrays that might be product lists
      const findArrays = (obj, path = "", depth = 0) => {
        if (depth > 4) return;
        for (const [k, v] of Object.entries(obj || {})) {
          const p = path ? `${path}.${k}` : k;
          if (Array.isArray(v) && v.length > 0) {
            const firstKeys =
              typeof v[0] === "object"
                ? Object.keys(v[0]).slice(0, 8).join(",")
                : typeof v[0];
            console.log(
              `  [${url.slice(0, 80)}] array "${p}": ${v.length} items, keys: [${firstKeys}]`,
            );
            if (v.length > 0 && typeof v[0] === "object") {
              console.log(`    sample: ${JSON.stringify(v[0]).slice(0, 150)}`);
            }
          } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
            findArrays(v, p, depth + 1);
          }
        }
      };
      findArrays(json);
    } catch {
      /* ignore */
    }
  });

  // ── Load the vegetables page ───────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("Loading: https://healthybuddha.in/fruits-vegetables/vegetables");
  console.log("=".repeat(60));

  try {
    await page.goto("https://healthybuddha.in/fruits-vegetables/vegetables", {
      waitUntil: "networkidle",
      timeout: 45000,
    });
  } catch (e) {
    console.log("goto note:", e.message.slice(0, 100));
  }

  // Wait and scroll
  await sleep(3000);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);
  }
  await sleep(2000);

  // ── DOM analysis ───────────────────────────────────────────────────────────
  const domInfo = await page.evaluate(() => {
    const title = document.title;
    const bodyText = document.body.innerText.slice(0, 600);
    const totalEls = document.querySelectorAll("*").length;

    // Find elements containing price-like text (₹ or Rs.)
    const priceEls = [];
    document.querySelectorAll("*").forEach((el) => {
      const txt = el.innerText || "";
      if (
        (txt.includes("₹") || txt.match(/Rs\.\s*\d/)) &&
        el.children.length < 5 &&
        txt.length < 60
      ) {
        priceEls.push({
          tag: el.tagName,
          classes: el.className?.toString()?.slice(0, 80),
          text: txt.trim().slice(0, 50),
          parent: el.parentElement?.className?.toString()?.slice(0, 60),
        });
      }
    });

    // Top repeated classes (likely product card selectors)
    const classCounts = {};
    document.querySelectorAll("[class]").forEach((el) => {
      el.className
        ?.toString()
        ?.split(" ")
        .forEach((c) => {
          c = c.trim();
          if (c.length > 2 && c.length < 50)
            classCounts[c] = (classCounts[c] || 0) + 1;
        });
    });
    const topClasses = Object.entries(classCounts)
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40);

    // Check for specific OpenCart selectors
    const selectorTests = [
      ".product-thumb",
      ".product-layout",
      ".product-grid",
      ".product-item",
      '[class*="product"]',
      "article",
      ".item",
      ".card",
      "[data-id]",
      "[data-product]",
      ".product",
      "li.col",
      ".col-sm-6",
      ".col-md-3",
    ];
    const selectorResults = {};
    selectorTests.forEach((sel) => {
      selectorResults[sel] = document.querySelectorAll(sel).length;
    });

    // Sample innerHTML of any element with class containing "product"
    const productEls = Array.from(
      document.querySelectorAll('[class*="product"],[class*="Product"]'),
    );
    const productSamples = productEls.slice(0, 3).map((el) => ({
      tag: el.tagName,
      classes: el.className?.toString()?.slice(0, 80),
      html: el.outerHTML?.slice(0, 400),
    }));

    return {
      title,
      bodyText,
      totalEls,
      priceEls: priceEls.slice(0, 15),
      topClasses,
      selectorResults,
      productSamples,
    };
  });

  console.log("\n" + "=".repeat(60));
  console.log("DOM ANALYSIS");
  console.log("=".repeat(60));
  console.log("Page title:", domInfo.title);
  console.log("Total DOM elements:", domInfo.totalEls);
  console.log("\nBody text preview:");
  console.log(domInfo.bodyText);

  console.log("\nSelector hit counts:");
  Object.entries(domInfo.selectorResults).forEach(([sel, count]) => {
    if (count > 0) console.log(`  ${count}x  ${sel}`);
  });

  console.log("\nTop repeated CSS classes:");
  domInfo.topClasses.forEach(([cls, n]) => console.log(`  ${n}x  .${cls}`));

  console.log("\nElements with price text:");
  domInfo.priceEls.forEach((p) =>
    console.log(
      `  <${p.tag} class="${p.classes}">: "${p.text}" (parent: ${p.parent})`,
    ),
  );

  console.log("\nProduct-class element samples:");
  domInfo.productSamples.forEach((s, i) => {
    console.log(`\n  [${i + 1}] <${s.tag} class="${s.classes}">`);
    console.log(`  HTML: ${s.html}`);
  });

  await browser.close();
  console.log("\nDebug complete.");
})().catch((e) => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
