/**
 * scraper/utils/index.js
 * Shared helpers used by all scrapers.
 */

const path = require("path");
const winston = require("winston");

require("dotenv").config({ path: path.resolve(__dirname, "../.env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
  override: false,
});

// ── Logger ────────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const extra = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
      return `${timestamp} [${level}] ${message}${extra}`;
    }),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.resolve(__dirname, "../../logs/scraper.log"),
      maxsize: 5_000_000,
      maxFiles: 3,
    }),
  ],
});

// ── User-agent rotation ───────────────────────────────────────────────────────
const UA_LIST = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];
function randomUserAgent() {
  return UA_LIST[Math.floor(Math.random() * UA_LIST.length)];
}

// ── Retry with exponential back-off (429-aware) ──────────────────────────────
async function withRetry(
  fn,
  { retries = 3, delayMs = 2000, label = "operation" } = {},
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;

      // For 429 rate-limit errors, wait much longer and respect Retry-After header
      const is429 = err.response?.status === 429;
      let wait;
      if (is429) {
        const retryAfter = parseInt(err.response?.headers?.['retry-after'] || '0', 10);
        // Respect Retry-After if given, otherwise use 60s base * attempt
        wait = retryAfter > 0 ? retryAfter * 1000 : 60_000 * attempt;
        logger.warn(
          `${label} rate-limited 429 (attempt ${attempt}/${retries}), waiting ${wait / 1000}s`,
          { error: err.message },
        );
      } else {
        wait = delayMs * attempt;
        logger.warn(
          `${label} failed (attempt ${attempt}/${retries}), retrying in ${wait}ms`,
          { error: err.message },
        );
      }
      await sleep(wait);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Price parsing ─────────────────────────────────────────────────────────────
/**
 * Extracts the first number from any price string format:
 *   "Rs49"          → 49
 *   "Rs. 49"        → 49
 *   "₹49"           → 49
 *   "₹ 49.00"       → 49
 *   "Rs49\n- 500gm" → 49   (HB multi-line format)
 *   "1,299"         → 1299
 *   "45.50"         → 45.5
 */
function parsePrice(raw) {
  if (!raw) return null;
  const match = String(raw).match(/[\d,]+(?:\.\d+)?/);
  if (!match) return null;
  const val = parseFloat(match[0].replace(/,/g, ""));
  return isNaN(val) ? null : Math.round(val * 100) / 100;
}

// ── Unit parsing ──────────────────────────────────────────────────────────────
function parseUnit(raw) {
  if (!raw) return null;
  let u = String(raw).toLowerCase().trim();
  u = u.replace(/\s*(gram|grams|gm|gms)\b/, "g");
  u = u.replace(/\s*(kilogram|kilograms|kg|kgs)\b/, "kg");
  u = u.replace(/\s*(piece|pieces|pc|pcs|no|nos)\b/, "pcs");
  u = u.replace(/\s+(g|kg|ml|l|pcs)$/, "$1");
  return u;
}

// ── Unit extraction from arbitrary text ───────────────────────────────────────
/**
 * Extracts a unit string from arbitrary text (product name, price text, variant
 * title, etc.). Looks for patterns like "500g", "1 kg", "6 pcs", "1 bunch".
 * Returns normalised unit string via parseUnit(), or null if no unit found.
 */
const UNIT_REGEX =
  /(\d+[\d.\-]*\s*(?:g|gm|gms|gram|grams|kg|kgs|ml|l|pcs?|piece|pieces|bunch|bunches|no\.?|pack|strip)s?)\b/i;

function extractUnit(text) {
  if (!text) return null;
  const match = String(text).match(UNIT_REGEX);
  return match ? parseUnit(match[1].trim()) : null;
}

// ── Deduplication ─────────────────────────────────────────────────────────────
function deduplicateProducts(products) {
  const seen = new Set();
  return products.filter((p) => {
    const key = `${p.name?.toLowerCase()}|${p.unit}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Array chunking ────────────────────────────────────────────────────────────
function chunk(arr, n) {
  const result = [];
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
  return result;
}

// ── Standard product builder ──────────────────────────────────────────────────
function buildProduct({
  providerId,
  name,
  price,
  unit,
  available = true,
  imageUrl = null,
  productUrl = null,
  variantId = null,
}) {
  return {
    providerId,
    name: String(name || "").trim(),
    price: parsePrice(price),
    unit: parseUnit(unit),
    available,
    imageUrl: imageUrl || null,
    productUrl: productUrl || null,
    variantId: variantId ? String(variantId) : null,
    scrapedAt: new Date().toISOString(),
  };
}

module.exports = {
  logger,
  randomUserAgent,
  withRetry,
  sleep,
  parsePrice,
  parseUnit,
  extractUnit,
  UNIT_REGEX,
  deduplicateProducts,
  chunk,
  buildProduct,
};
