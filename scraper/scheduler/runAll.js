/**
 * scraper/scheduler/runAll.js
 * Runs all 6 scrapers, normalises names, saves to Supabase.
 * Lightweight scrapers (Shopify/Cheerio) run in parallel.
 * Browser scrapers (Playwright) run sequentially to share one browser.
 *
 * Run: node scraper/scheduler/runAll.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
  override: false,
});

// Simple concurrency limiter — avoids p-limit ESM compatibility issues
function pLimit(concurrency) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}
const { logger } = require("../utils/index");
const { closeBrowser } = require("../utils/browser");
const db = require("../db/client");
const { normalise } = require("../normalizer/index");

// Lightweight = no browser (Shopify JSON, Cheerio)
const LIGHTWEIGHT = [
  { id: "OM", module: require("../scrapers/organicMandya") },
  { id: "LU", module: require("../scrapers/lushful") },
  { id: "FF", module: require("../scrapers/farmFresh") },
];

// Browser-based = must share one Playwright process
const BROWSER_BASED = [
  { id: "HB", module: require("../scrapers/healthyBuddha") },
  { id: "AK", module: require("../scrapers/akshayakalpa") },
  { id: "GD", module: require("../scrapers/greenDNA") },
];

async function runScraper({ id, module: mod }, masterItems) {
  const runId = await db.startScrapeRun(id);
  const startedAt = Date.now();
  logger.info(`[Scheduler] ── Starting ${id}`);

  try {
    const rawProducts = await mod.scrape();

    if (!rawProducts || rawProducts.length === 0) {
      logger.warn(`[Scheduler] ${id} returned 0 products`);
      await db.finishScrapeRun(runId, {
        status: "partial",
        productsFound: 0,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    // Normalise: map raw names → canonical master items
    const normalised = await normalise(rawProducts, masterItems);

    // Upsert any new canonical items into master_items
    for (const p of normalised) {
      if (!p.masterName) continue;
      if (p.masterItemId) continue; // already matched

      const existing = masterItems.find(
        (m) => m.canonical_name.toLowerCase() === p.masterName.toLowerCase(),
      );

      if (existing) {
        p.masterItemId = existing.id;
      } else if (p.isFreshProduce !== false) {
        const newId = await db.upsertMasterItem(
          p.masterName,
          p.category || "Vegetables",
          [p.name],
        );
        p.masterItemId = newId;
        masterItems.push({
          id: newId,
          canonical_name: p.masterName,
          category: p.category,
          aliases: [p.name],
        });
      }
    }

    // Save only confirmed fresh produce with a master item ID
    const toSave = normalised.filter(
      (p) => p.isFreshProduce !== false && p.masterItemId,
    );
    await db.saveListings(toSave, runId);
    await db.touchProvider(id);

    const duration = Date.now() - startedAt;
    await db.finishScrapeRun(runId, {
      status: "success",
      productsFound: toSave.length,
      durationMs: duration,
    });
    logger.info(
      `[Scheduler] ✓ ${id} — ${toSave.length} products saved in ${(duration / 1000).toFixed(1)}s`,
    );
  } catch (err) {
    const duration = Date.now() - startedAt;
    logger.error(`[Scheduler] ✗ ${id} failed`, { error: err.message });
    await db.finishScrapeRun(runId, {
      status: "failed",
      productsFound: 0,
      errorMessage: err.message,
      durationMs: duration,
    });
  }
}

async function runAll() {
  const cycleStart = Date.now();
  logger.info("[Scheduler] ════ Full scrape cycle starting ════");

  // Load existing master items once; shared + mutated across all scrapers in this run
  const masterItems = await db.getMasterItems();
  logger.info(`[Scheduler] Loaded ${masterItems.length} existing master items`);

  // Run lightweight scrapers in parallel (max 3 at once)
  const limit = pLimit(3);
  const lightPromises = LIGHTWEIGHT.map((s) =>
    limit(() => runScraper(s, masterItems)),
  );

  // Run browser scrapers sequentially (one shared Playwright process)
  const browserPromise = (async () => {
    for (const s of BROWSER_BASED) {
      await runScraper(s, masterItems);
    }
  })();

  await Promise.allSettled([...lightPromises, browserPromise]);
  await closeBrowser();

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  logger.info(`[Scheduler] ════ Cycle complete in ${elapsed}s ════`);
}

if (require.main === module) {
  runAll()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error("[Scheduler] Fatal error", { error: err.message });
      process.exit(1);
    });
}

module.exports = { runAll };
