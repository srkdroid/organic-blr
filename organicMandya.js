/**
 * scraper/scrapers/organicMandya.js
 * Provider  : Organic Mandya (organicmandya.com)
 * Method    : Shopify /products.json — no browser needed
 * Run alone : node scraper/scrapers/organicMandya.js
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env.scraper') })
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local'), override: false })

const { scrapeShopify } = require('../utils/shopifyScraper')
const { logger, withRetry } = require('../utils/index')
const PROVIDERS = require('../config/providers')

const CFG = PROVIDERS.organicMandya

const COLLECTIONS = [
  CFG.vegetablesApiUrl,
  CFG.fruitsApiUrl,
  'https://organicmandya.com/collections/all/products.json?limit=250',
].filter(Boolean)

async function scrape() {
  logger.info('[OM] Starting Organic Mandya scrape via Shopify JSON')
  return withRetry(
    () => scrapeShopify({ providerId: CFG.id, collectionsJson: COLLECTIONS }),
    { retries: 3, label: 'OM full scrape' }
  )
}

if (require.main === module) {
  scrape()
    .then(products => {
      console.log(JSON.stringify(products, null, 2))
      console.log(`\nTotal: ${products.length} products`)
      process.exit(0)
    })
    .catch(err => {
      logger.error('[OM] Scrape failed', { error: err.message })
      process.exit(1)
    })
}

module.exports = { scrape }
