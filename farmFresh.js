/**
 * scraper/scrapers/farmFresh.js
 * Provider  : Farm Fresh Bangalore (farmfreshbangalore.com)
 * Method    : axios + cheerio (WooCommerce HTML — no browser needed)
 * Run alone : node scraper/scrapers/farmFresh.js
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env.scraper') })
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local'), override: false })

const axios   = require('axios')
const cheerio = require('cheerio')
const { logger, withRetry, buildProduct, deduplicateProducts, randomUserAgent, sleep } = require('../utils/index')
const PROVIDERS = require('../config/providers')

const CFG     = PROVIDERS.farmFresh
const TIMEOUT = parseInt(process.env.SCRAPE_TIMEOUT_MS) || 30_000

async function fetchPage(url) {
  const response = await axios.get(url, {
    timeout: TIMEOUT,
    headers: {
      'User-Agent':      randomUserAgent(),
      'Accept':          'text/html,application/xhtml+xml',
      'Accept-Language': 'en-IN,en;q=0.9',
      'Referer':         CFG.baseUrl,
    },
  })

  const $        = cheerio.load(response.data)
  const products = []

  $(CFG.selectors.productCard).each((_, card) => {
    const $card = $(card)
    const name  = $card.find(CFG.selectors.name).text().trim()
    if (!name) return

    // WooCommerce may show sale price inside <ins>
    const salePriceEl = $card.find('ins ' + CFG.selectors.price)
    const priceRaw    = salePriceEl.length
      ? salePriceEl.text().trim()
      : $card.find(CFG.selectors.price).first().text().trim()

    const unitRaw =
      $card.find(CFG.selectors.unit).first().text().trim() ||
      (name.match(/\d+\s*(g|gm|gms|kg|kgs|ml|l|pcs?|bunch|piece|pc)\b/i) || [])[0] ||
      null

    const available  = !$card.is(CFG.selectors.outOfStock) &&
                       !$card.find(CFG.selectors.outOfStock).length
    const imageUrl   = $card.find('img').attr('src') || $card.find('img').attr('data-src') || null
    const productUrl = $card.find('a.woocommerce-LoopProduct-link').attr('href') || null

    products.push(buildProduct({
      providerId: CFG.id, name, price: priceRaw, unit: unitRaw,
      available, imageUrl, productUrl,
    }))
  })

  const nextUrl = $(CFG.selectors.nextPage).attr('href') || null
  logger.debug(`[FF] Parsed ${products.length} products from ${url}`)
  return { products, nextUrl }
}

async function scrapeCategory(startUrl, label) {
  const all  = []
  let url    = startUrl
  let pageNo = 1

  while (url) {
    logger.info(`[FF] Fetching ${label} page ${pageNo}: ${url}`)
    try {
      const { products, nextUrl } = await withRetry(
        () => fetchPage(url),
        { retries: 3, label: `FF ${label} p${pageNo}` }
      )
      all.push(...products)
      url = nextUrl
      pageNo++
      if (url) await sleep(600)
    } catch (err) {
      logger.error(`[FF] Failed to fetch ${url}`, { error: err.message })
      break
    }
  }

  return all
}

async function scrape() {
  logger.info('[FF] Starting Farm Fresh Bangalore scrape (Cheerio/WooCommerce)')
  const [vegetables, fruits] = await Promise.all([
    scrapeCategory(CFG.vegetablesUrl, 'vegetables'),
    scrapeCategory(CFG.fruitsUrl, 'fruits'),
  ])
  const all = deduplicateProducts([...vegetables, ...fruits])
  logger.info(`[FF] Scraped ${all.length} products total`)
  return all
}

if (require.main === module) {
  scrape()
    .then(products => {
      console.log(JSON.stringify(products, null, 2))
      console.log(`\nTotal: ${products.length} products`)
      process.exit(0)
    })
    .catch(err => {
      logger.error('[FF] Scrape failed', { error: err.message })
      process.exit(1)
    })
}

module.exports = { scrape }
