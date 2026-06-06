/**
 * scraper/scrapers/greenDNA.js
 * Provider  : GreenDNA (greendna.in)
 * Method    : Playwright — custom SPA with lazy loading
 * Run alone : node scraper/scrapers/greenDNA.js
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env.scraper') })
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local'), override: false })

const { newContext, closeBrowser, scrollToBottom, waitForSelectorSafe } = require('../utils/browser')
const { logger, withRetry, buildProduct, deduplicateProducts, sleep } = require('../utils/index')
const PROVIDERS = require('../config/providers')

const CFG     = PROVIDERS.greenDNA
const TIMEOUT = parseInt(process.env.SCRAPE_TIMEOUT_MS) || 30_000

async function scrapeUrl(context, url, category) {
  const page = await context.newPage()
  logger.info(`[GD] Scraping ${category}: ${url}`)
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT })

    if (!await waitForSelectorSafe(page, CFG.selectors.productCard, 15_000)) {
      logger.warn(`[GD] No product cards at ${url}`)
      return []
    }

    await scrollToBottom(page, { pauseMs: 900, maxScrolls: 25 })

    // Click Load More / pagination
    let clicks = 0
    while (clicks < 15) {
      const btn = await page.$(CFG.selectors.loadMore)
      if (!btn) break
      if (!await btn.isVisible().catch(() => false)) break
      await btn.click()
      await page.waitForTimeout(1200)
      await scrollToBottom(page, { pauseMs: 600, maxScrolls: 5 })
      clicks++
    }

    const products = await page.evaluate(cfg => {
      return Array.from(document.querySelectorAll(cfg.productCard)).map(card => {
        const priceEl = card.querySelector(cfg.price)
        return {
          name:       card.querySelector(cfg.name)?.innerText?.trim()                             || null,
          priceRaw:   priceEl?.innerText?.trim() || priceEl?.getAttribute('data-price')           ||
                      card.querySelector('[data-price]')?.getAttribute('data-price')              || null,
          unitRaw:    card.querySelector(cfg.unit)?.innerText?.trim()                             || null,
          available:  !card.querySelector(cfg.outOfStock),
          imageUrl:   card.querySelector('img')?.src || card.querySelector('img')?.dataset?.src   || null,
          productUrl: card.querySelector('a')?.href                                               || null,
        }
      })
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
      withRetry(() => scrapeUrl(context, CFG.vegetablesUrl, 'vegetables'), { retries: 3, label: 'GD vegetables' }),
      withRetry(() => scrapeUrl(context, CFG.fruitsUrl,     'fruits'),     { retries: 3, label: 'GD fruits'     }),
    ])
    const all = deduplicateProducts([...vegetables, ...fruits])
    logger.info(`[GD] Scraped ${all.length} products total`)
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
      logger.error('[GD] Scrape failed', { error: err.message })
      process.exit(1)
    } finally {
      await closeBrowser()
    }
  })()
}

module.exports = { scrape }
