/**
 * scraper/utils/index.js
 * Shared helpers used by all scrapers. Loads .env.scraper from scraper/ directory.
 */

const path   = require('path')
const winston = require('winston')

// Load scraper-specific env first, fall back to project root .env.local
require('dotenv').config({ path: path.resolve(__dirname, '../.env.scraper') })
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local'), override: false })

// ── Logger ────────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
      return `${timestamp} [${level}] ${message}${extra}`
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.resolve(__dirname, '../../logs/scraper.log'),
      maxsize:  5_000_000,
      maxFiles: 3,
    }),
  ],
})

// ── User-agent rotation ───────────────────────────────────────────────────────
const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
]

function randomUserAgent() {
  return UA_LIST[Math.floor(Math.random() * UA_LIST.length)]
}

// ── Retry with exponential back-off ──────────────────────────────────────────
async function withRetry(fn, { retries = 3, delayMs = 2000, label = 'operation' } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === retries) throw err
      const wait = delayMs * attempt
      logger.warn(`${label} failed (attempt ${attempt}/${retries}), retrying in ${wait}ms`, {
        error: err.message,
      })
      await sleep(wait)
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Price parsing ─────────────────────────────────────────────────────────────
function parsePrice(raw) {
  if (!raw) return null
  const cleaned = String(raw)
    .replace(/[\u20B9$£€]/g, '')  // ₹ and other currency symbols
    .replace(/[Rrs]+\.?/gi, '')   // Rs. or rs
    .replace(/[,\s]/g, '')        // commas and whitespace
    .trim()
  const val = parseFloat(cleaned)
  return isNaN(val) ? null : Math.round(val * 100) / 100
}

// ── Unit parsing ──────────────────────────────────────────────────────────────
function parseUnit(raw) {
  if (!raw) return null
  let u = String(raw).toLowerCase().trim()
  u = u.replace(/\s*(gram|grams|gm|gms)\b/, 'g')
  u = u.replace(/\s*(kilogram|kilograms|kg|kgs)\b/, 'kg')
  u = u.replace(/\s*(piece|pieces|pc|pcs|no|nos)\b/, 'pcs')
  u = u.replace(/\s+(g|kg|ml|l|pcs)$/, '$1')
  return u
}

// ── Product deduplication ─────────────────────────────────────────────────────
function deduplicateProducts(products) {
  const seen = new Set()
  return products.filter(p => {
    const key = `${p.name?.toLowerCase()}|${p.unit}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── Array chunking ────────────────────────────────────────────────────────────
function chunk(arr, n) {
  const result = []
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n))
  return result
}

// ── Standard product builder ──────────────────────────────────────────────────
function buildProduct({
  providerId, name, price, unit,
  available = true, imageUrl = null, productUrl = null,
}) {
  return {
    providerId,
    name:       String(name || '').trim(),
    price:      parsePrice(price),
    unit:       parseUnit(unit),
    available,
    imageUrl:   imageUrl  || null,
    productUrl: productUrl || null,
    scrapedAt:  new Date().toISOString(),
  }
}

module.exports = {
  logger,
  randomUserAgent,
  withRetry,
  sleep,
  parsePrice,
  parseUnit,
  deduplicateProducts,
  chunk,
  buildProduct,
}
