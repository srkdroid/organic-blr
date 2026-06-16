/**
 * scraper/scheduler/saveHelper.js
 *
 * Saves one provider's scrape results to DB.
 *
 * KEY DESIGN DECISIONS:
 *
 * 1. UNIQUE(provider_id, master_item_id) in provider_listings means only ONE
 *    price row per provider per canonical item. When HB has "Beans - Cluster"
 *    Rs49, "Beans - Flat" Rs56, "Long Beans" Rs55 — all mapping to master item
 *    "Beans" — we keep the CHEAPEST (Rs49). Others are stored in raw_name but
 *    only the cheapest price shows in the comparison table.
 *
 * 2. All DB operations are batched in chunks of 20 to avoid Supabase free-tier
 *    connection timeouts (which occur with 100+ rapid sequential queries).
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
  override: false,
});

const { logger, sleep } = require("../utils/index");
const db = require("../db/client");
const { normalise } = require("../normalizer/index");

async function saveOneScraper(providerId, rawProducts) {
  if (!rawProducts || rawProducts.length === 0) {
    logger.warn(`[SaveHelper] No products to save for ${providerId}`);
    return;
  }

  logger.info(
    `[SaveHelper] Processing ${rawProducts.length} raw products for ${providerId}`,
  );

  const runId = await db.startScrapeRun(providerId);
  const startedAt = Date.now();

  try {
    // Step 1: Load existing master items
    const masterItems = await db.getMasterItems();
    logger.info(
      `[SaveHelper] Loaded ${masterItems.length} master items from DB`,
    );

    // Step 2: Normalise
    const normalised = await normalise(rawProducts, masterItems);
    logger.info(`[SaveHelper] Normalised: ${normalised.length} products`);

    // Step 3: Build canonical name → id lookup
    const nameToId = {};
    for (const m of masterItems) {
      nameToId[m.canonical_name.toLowerCase()] = m.id;
    }

    // Step 4: Find new canonical names not yet in DB
    const seen = new Set();
    const uniqueToCreate = [];
    for (const p of normalised) {
      if (!p.masterName || p.isFreshProduce === false) continue;
      const key = p.masterName.toLowerCase();
      if (!nameToId[key] && !seen.has(key)) {
        seen.add(key);
        uniqueToCreate.push({
          canonical_name: p.masterName,
          category: p.category || "Unknown",
          aliases: p.masterName !== p.name ? [p.name] : [],
        });
        nameToId[key] = null; // reserve slot
      }
    }

    // Step 5: Batch-upsert new master items in chunks of 20
    if (uniqueToCreate.length > 0) {
      logger.info(
        `[SaveHelper] Creating ${uniqueToCreate.length} new master items`,
      );
      const CHUNK = 20;
      for (let i = 0; i < uniqueToCreate.length; i += CHUNK) {
        const chunk = uniqueToCreate.slice(i, i + CHUNK);
        for (const item of chunk) {
          const newId = await db.upsertMasterItem(
            item.canonical_name,
            item.category,
            item.aliases,
          );
          nameToId[item.canonical_name.toLowerCase()] = newId;
        }
        if (i + CHUNK < uniqueToCreate.length) await sleep(150);
      }
    }

    // Step 6: Assign masterItemId to every product
    for (const p of normalised) {
      if (!p.masterName || p.isFreshProduce === false) continue;
      const key = p.masterName.toLowerCase();
      if (nameToId[key]) p.masterItemId = nameToId[key];
    }

    // Step 7: Deduplicate — key is provider + master_item_id + unit
    // Only collapse entries where all three match (true duplicates).
    // "Beans - Cluster 500g" and "Beans - Dark Green Small 500g" should each
    // have their own canonical master_item (handled in normalizer).
    // This step only removes exact same product scraped twice.
    const cheapestMap = new Map();
    for (const p of normalised) {
      if (p.isFreshProduce === false) continue;
      if (!p.masterItemId) continue;
      if (!p.price || p.price <= 0) continue;
      const normUnit = (p.unit || "").toLowerCase().replace(/\s+/g, "");
      const key = `${p.providerId}:${p.masterItemId}:${normUnit}`;
      const existing = cheapestMap.get(key);
      if (!existing) {
        cheapestMap.set(key, p);
      } else {
        // Prefer available items. If both same availability, prefer cheaper.
        const preferAvailable = p.available && !existing.available;
        const preferCheaper = (p.available === existing.available) && (p.price < existing.price);
        if (preferAvailable || preferCheaper) {
          cheapestMap.set(key, p);
        }
      }
    }

    // DB has UNIQUE(provider_id, master_item_id) — when multiple units exist
    // for the same canonical item at the same provider, keep the cheapest unit.
    const finalMap = new Map();
    for (const p of cheapestMap.values()) {
      const key = `${p.providerId}:${p.masterItemId}`;
      const existing = finalMap.get(key);
      if (!existing) {
        finalMap.set(key, p);
      } else {
        const preferAvailable = p.available && !existing.available;
        const preferCheaper = (p.available === existing.available) && (p.price < existing.price);
        if (preferAvailable || preferCheaper) {
          finalMap.set(key, p);
        }
      }
    }

    const toSave = Array.from(finalMap.values());
    const skipped = normalised.length - toSave.length;
    logger.info(
      `[SaveHelper] Saving ${toSave.length} products (${skipped} variants/non-produce skipped)`,
    );

    // Step 8: Save to DB
    await db.saveListings(toSave, runId);
    await db.touchProvider(providerId);

    const duration = Date.now() - startedAt;
    await db.finishScrapeRun(runId, {
      status: "success",
      productsFound: toSave.length,
      durationMs: duration,
    });

    // Summary
    const byCategory = {};
    for (const p of toSave) {
      const cat = p.category || "Unknown";
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }

    console.log("\n── Saved to Supabase ──────────────────────────────");
    console.log(`  Provider : ${providerId}`);
    console.log(`  Saved    : ${toSave.length} products`);
    console.log(
      `  Skipped  : ${skipped} (cheaper variant already kept / non-produce)`,
    );
    console.log(`  Duration : ${(duration / 1000).toFixed(1)}s`);
    console.log(`  Breakdown:`);
    for (const [cat, count] of Object.entries(byCategory).sort()) {
      console.log(`    ${cat.padEnd(18)} ${count}`);
    }
    console.log("───────────────────────────────────────────────────");
    console.log("  Refresh http://localhost:3000 to see prices");
    console.log("───────────────────────────────────────────────────\n");
  } catch (err) {
    const duration = Date.now() - startedAt;
    logger.error(`[SaveHelper] Failed to save ${providerId}`, {
      error: err.message,
    });
    await db
      .finishScrapeRun(runId, {
        status: "failed",
        productsFound: 0,
        errorMessage: err.message,
        durationMs: duration,
      })
      .catch(() => {});
    throw err;
  }
}

module.exports = { saveOneScraper };
