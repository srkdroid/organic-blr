/**
 * DEBUG SCRIPT — Run this ONCE to discover the Farm Fresh API structure.
 * It captures the full request body and response for /getGroup.
 *
 * Run: node scraper/debug_farmfresh.js
 *
 * Share the output with Claude to get the final scraper written.
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

  const captured = [];

  // Capture FULL request details for ALL JSON-returning endpoints
  page.on("request", (req) => {
    const url = req.url();
    if (
      !url.includes("farmfreshbangalore.com") &&
      !url.includes("getupmarket.com")
    )
      return;
    const body = req.postData();
    if (
      body ||
      url.includes("getGroup") ||
      url.includes("getProduct") ||
      url.includes("category")
    ) {
      console.log(`\n→ REQUEST: ${req.method()} ${url}`);
      if (body) console.log(`  Body: ${body}`);
    }
  });

  page.on("response", async (res) => {
    const url = res.url();
    const ct = res.headers()["content-type"] || "";
    if (!ct.includes("json")) return;
    if (
      !url.includes("farmfreshbangalore.com") &&
      !url.includes("getupmarket.com")
    )
      return;

    try {
      const json = await res.json();
      const str = JSON.stringify(json);

      // Only log if response has data content
      if (str.length < 50) return;

      console.log(`\n← RESPONSE: ${url}`);
      console.log(`  Keys: ${Object.keys(json).join(", ")}`);

      // Find arrays of items
      const findArrays = (obj, path = "") => {
        for (const [k, v] of Object.entries(obj || {})) {
          const p = path ? `${path}.${k}` : k;
          if (Array.isArray(v) && v.length > 0) {
            const first = v[0];
            const keys =
              typeof first === "object"
                ? Object.keys(first).join(",")
                : typeof first;
            console.log(
              `  Array at "${p}": ${v.length} items, first item keys: [${keys}]`,
            );
            if (v.length > 0 && typeof first === "object") {
              console.log(
                `  First item sample: ${JSON.stringify(first).slice(0, 200)}`,
              );
            }
            captured.push({ url, path: p, count: v.length, sample: first });
          } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
            findArrays(v, p);
          }
          // Log total/count fields
          if (
            typeof v === "number" &&
            (k.toLowerCase().includes("total") ||
              k.toLowerCase().includes("count"))
          ) {
            console.log(`  Count field: "${p}" = ${v}`);
          }
        }
      };
      findArrays(json);
    } catch {
      /* ignore */
    }
  });

  // ── Visit vegetables page ─────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("VISITING: /collections/vegetables");
  console.log("=".repeat(60));
  try {
    await page.goto("https://farmfreshbangalore.com/collections/vegetables", {
      waitUntil: "networkidle",
      timeout: 40000,
    });
  } catch (e) {
    /* networkidle timeout is ok */
  }
  await sleep(4000);

  // Scroll to trigger any lazy-loaded content
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(600);
  }
  await sleep(2000);

  // ── Visit fruits page ─────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("VISITING: /collections/fruits");
  console.log("=".repeat(60));
  try {
    await page.goto("https://farmfreshbangalore.com/collections/fruits", {
      waitUntil: "networkidle",
      timeout: 40000,
    });
  } catch (e) {
    /* ok */
  }
  await sleep(4000);

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY OF CAPTURED DATA ARRAYS:");
  console.log("=".repeat(60));
  captured.forEach((c, i) => {
    console.log(`\n[${i + 1}] URL: ${c.url}`);
    console.log(`     Path: ${c.path}, Count: ${c.count}`);
    console.log(`     Sample: ${JSON.stringify(c.sample).slice(0, 300)}`);
  });

  await browser.close();
  console.log("\nDebug complete.");
})().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
