/**
 * scraper/scrapers/akshayakalpa.js
 * Provider  : Akshayakalpa (shop.akshayakalpa.org)
 * Method    : Playwright + XHR interception (falls back to DOM scraping)
 * Run alone : node scraper/scrapers/akshayakalpa.js
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env.scraper') })
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local'), override: false })

const { chromium } = require('playwright')
const { logger, withRetry, buildProduct, deduplicateProducts, randomUserAgent, sleep } = require('../utils/index')
const { scrollToBottom, waitForSelectorSafe } = require('../utils/browser')
const PROVIDERS = require('../config/providers')

const CFG     = PROVIDERS.akshayakalpa
const TIMEOUT = parseInt(process.env.SCRAPE_TIMEOUT_MS) || 30_000

async function scrapeWithIntercept(page, url) {
  const captured = []

  page.on('response', async response => {
    const respUrl = response.url()
    if (!CFG.interceptPatterns.some(pat => pat.test(respUrl))) return
    try {
      const ct = response.headers()['content-type'] || ''
      if (!ct.includes('json')) return
      const json  = await response.json()
      const items = json.products || json.data?.products ||
                    json.items    || json.data?.items    ||
                    (Array.isArray(json) ? json : null)
      if (!items) return

      logger.debug(`[AK] Intercepted ${items.length} items from ${respUrl}`)
      for (const item of items) {
        const name  = item.name  || item.title  || item.product_name
        const price = item.price || item.selling_price || item.mrp || item.variants?.[0]?.price
        const unit  = item.unit  || item.weight || item.quantity   || item.variants?.[0]?.title
        const avail = item.available !== false && item.in_stock !== false
        if (name && price) {
          captured.push(buildProduct({ providerId: CFG.id, name, price, unit, available: avail }))
        }
      }
    } catch { /* ignore non-JSON responses */ }
  })

  await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT })
  await scrollToBottom(page, { pauseMs: 800 })
  await sleep(1000)
  return captured
}

async function scrapeFromDom(page, url) {
  logger.info('[AK] Falling back to DOM scraping')
  if (!await waitForSelectorSafe(page, CFG.selectors.productCard, 15_000)) return []

  return page.evaluate(cfg => {
    return Array.from(document.querySelectorAll(cfg.productCard)).map(card => ({
      name:      card.querySelector(cfg.name)?.innerText?.trim()  || null,
      priceRaw:  card.querySelector(cfg.price)?.innerText?.trim() || null,
      unitRaw:   card.querySelector(cfg.unit)?.innerText?.trim()  || null,
      available: !card.querySelector(cfg.outOfStock),
      imageUrl:  card.querySelector('img')?.src                   || null,
    }))
  }, CFG.selectors)
}

async function scrapeUrl(browser, url, category) {
  const context = await browser.newContext({
    userAgent:  randomUserAgent(),
    viewport:   { width: 1440, height: 900 },
    locale:     'en-IN',
    timezoneId: 'Asia/Kolkata',
  })
  await context.route('**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,ttf}', r => r.abort())
  const page = await context.newPage()
  logger.info(`[AK] Scraping ${category}: ${url}`)

  try {
    const intercepted = await scrapeWithIntercept(page, url)
    if (intercepted.length > 0) {
      logger.info(`[AK] Interception got ${intercepted.length} products for ${category}`)
      return intercepted
    }

    const domItems = await scrapeFromDom(page, url)
    return domItems
      .filter(p => p.name && p.priceRaw)
      .map(p => buildProduct({
        providerId: CFG.id, name: p.name, price: p.priceRaw,
        unit: p.unitRaw, available: p.available, imageUrl: p.imageUrl,
      }))
  } finally {
    await context.close()
  }
}

async function scrape() {
  const browser = await chromium.launch({
    headless: process.env.SCRAPE_HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const [vegetables, fruits] = await Promise.all([
      withRetry(() => scrapeUrl(browser, CFG.vegetablesUrl, 'vegetables'), { retries: 3, label: 'AK vegetables' }),
      withRetry(() => scrapeUrl(browser, CFG.fruitsUrl,     'fruits'),     { retries: 3, label: 'AK fruits'     }),
    ])
    const all = deduplicateProducts([...vegetables, ...fruits])
    logger.info(`[AK] Scraped ${all.length} products total`)
    return all
  } finally {
    await browser.close()
  }
}

if (require.main === module) {
  scrape()
    .then(products => {
      console.log(JSON.stringify(products, null, 2))
      console.log(`\nTotal: ${products.length} products`)
      process.exit(0)
    })
    .catch(err => {
      logger.error('[AK] Scrape failed', { error: err.message })
      process.exit(1)
    })
}

module.exports = { scrape }
