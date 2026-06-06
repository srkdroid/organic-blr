/**
 * scraper/scrapers/healthyBuddha.js
 * Provider  : Healthy Buddha (healthybuddha.in)
 * Method    : Playwright — renders React SPA, scrolls, extracts product cards
 * Run alone : node scraper/scrapers/healthyBuddha.js
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env.scraper') })
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local'), override: false })

const { newContext, closeBrowser, scrollToBottom, waitForSelectorSafe } = require('../utils/browser')
const { logger, withRetry, buildProduct, deduplicateProducts } = require('../utils/index')
const PROVIDERS = require('../config/providers')

const CFG     = PROVIDERS.healthyBuddha
const TIMEOUT = parseInt(process.env.SCRAPE_TIMEOUT_MS) || 30_000

async function scrapeUrl(context, url, category) {
  const page = await context.newPage()
  logger.info(`[HB] Scraping ${category}: ${url}`)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })

    const found = await waitForSelectorSafe(page, CFG.selectors.productCard, 15_000)
    if (!found) {
      logger.warn(`[HB] No product cards found at ${url} — selector may have changed`)
      return []
    }

    await scrollToBottom(page, { pauseMs: 700, maxScrolls: 20 })

    // Click "Load More" until gone
    let clicks = 0
    while (clicks < 10) {
      const btn = await page.$(CFG.selectors.loadMore)
      if (!btn) break
      if (!await btn.isVisible()) break
      await btn.click()
      await page.waitForTimeout(1500)
      clicks++
    }

    const products = await page.evaluate(cfg => {
      return Array.from(document.querySelectorAll(cfg.productCard)).map(card => ({
        name:       card.querySelector(cfg.name)?.innerText?.trim()       || null,
        priceRaw:   card.querySelector(cfg.price)?.innerText?.trim()      || null,
        unitRaw:    card.querySelector(cfg.unit)?.innerText?.trim()       || null,
        available:  !card.querySelector(cfg.outOfStock),
        productUrl: card.querySelector('a[href]')?.href                   || null,
        imageUrl:   card.querySelector('img')?.src                        || null,
      }))
    }, CFG.selectors)

    return products
      .filter(p => p.name && p.priceRaw)
      .map(p => buildProduct({
        providerId: CFG.id, name: p.name, price: p.priceRaw,
        unit: p.unitRaw, available: p.available,
        imageUrl: p.imageUrl, productUrl: p.productUrl,
      }))
  } finally {
    await page.close()
  }
}

async function scrape() {
  const context = await newContext()
  try {
    const [vegetables, fruits] = await Promise.all([
      withRetry(() => scrapeUrl(context, CFG.vegetablesUrl, 'vegetables'), { retries: 3, label: 'HB vegetables' }),
      withRetry(() => scrapeUrl(context, CFG.fruitsUrl,     'fruits'),     { retries: 3, label: 'HB fruits'     }),
    ])
    const all = deduplicateProducts([...vegetables, ...fruits])
    logger.info(`[HB] Scraped ${all.length} products total`)
    return all
  } finally {
    await context.close()
  }
}

if (require.main === module) {
  ;(async () => {
    try {
      const products = await scrape()
      console.log(JSON.stringify(products, null, 2))
      console.log(`\nTotal: ${products.length} products`)
    } catch (err) {
      logger.error('[HB] Scrape failed', { error: err.message })
      process.exit(1)
    } finally {
      await closeBrowser()
    }
  })()
}

module.exports = { scrape }
