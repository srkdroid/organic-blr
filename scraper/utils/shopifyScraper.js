/**
 * scraper/utils/shopifyScraper.js
 * Fetches product data from any Shopify store's public /products.json endpoint.
 *
 * Proxy support (for VM IPs blocked by Cloudflare/Shopify):
 *   Set SCRAPERAPI_KEY in scraper/.env.scraper
 *   Set PROXY_PROVIDERS=OM,AK  (comma-separated provider IDs that need the proxy)
 *   ScraperAPI free tier: 1,000 credits/month — well within our usage (~360/month)
 *   Sign up free at: https://www.scraperapi.com
 */

const axios = require('axios')
const { logger, withRetry, buildProduct, deduplicateProducts, randomUserAgent, sleep, extractUnit } = require('./index')

// Providers that should route through ScraperAPI when SCRAPERAPI_KEY is set
const PROXY_PROVIDERS = (process.env.PROXY_PROVIDERS || '')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean)

const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY || ''

function buildRequestUrl(targetUrl, providerId) {
  if (SCRAPERAPI_KEY && PROXY_PROVIDERS.includes(providerId.toUpperCase())) {
    // Route through ScraperAPI — resolves IP blocks / Cloudflare challenges
    const encoded = encodeURIComponent(targetUrl)
    return `http://api.scraperapi.com?api_key=${SCRAPERAPI_KEY}&url=${encoded}`
  }
  return targetUrl
}

async function fetchCollection(collectionUrl, providerId) {
  const allProducts = []
  let page = 1
  const usingProxy = SCRAPERAPI_KEY && PROXY_PROVIDERS.includes(providerId.toUpperCase())

  while (true) {
    const pageUrl = `${collectionUrl}&page=${page}`
    const requestUrl = buildRequestUrl(pageUrl, providerId)
    logger.debug(`[Shopify] GET ${pageUrl}${usingProxy ? ' (via proxy)' : ''}`)

    const response = await axios.get(requestUrl, {
      timeout: usingProxy ? 60_000 : 20_000, // ScraperAPI needs more time
      headers: {
        'User-Agent':      randomUserAgent(),
        'Accept':          'application/json',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    })

    const { products } = response.data

    // Diagnostic: log when 0 products returned so we can spot rate-limiting
    if (!products || products.length === 0) {
      const ct = response.headers['content-type'] || ''
      const body = typeof response.data === 'string'
        ? response.data.slice(0, 200)
        : JSON.stringify(response.data).slice(0, 200)
      logger.warn(`[Shopify] 0 products from ${pageUrl} — HTTP ${response.status} content-type: ${ct} body: ${body}`)
      break
    }

    allProducts.push(...products)
    if (products.length < 250) break   // last page

    page++
    await sleep(500)
  }

  return allProducts
}

function shopifyProductToItems(shopifyProduct, providerId) {
  const items = []
  for (const variant of shopifyProduct.variants) {
    const available = variant.available !== false
    const price     = parseFloat(variant.price)
    if (!price) continue

    const unit = variant.title && variant.title !== 'Default Title'
      ? variant.title
      : shopifyProduct.options?.flatMap(o => o.values).find(v => /\d/.test(v))
        || extractUnit(shopifyProduct.title)
        || null

    items.push(buildProduct({
      providerId,
      name:      shopifyProduct.title,
      price:     variant.price,
      unit,
      available,
      imageUrl:  shopifyProduct.images?.[0]?.src || null,
    }))
  }

  // Return ALL variants — multi-unit support
  return items
}

async function scrapeShopify({ providerId, collectionsJson }) {
  const rawProducts = []

  // Random jitter (0–3s) so parallel scrapers don't all hit Shopify CDN at the same instant
  await sleep(Math.floor(Math.random() * 3000))

  const usingProxy = SCRAPERAPI_KEY && PROXY_PROVIDERS.includes(providerId.toUpperCase())
  if (usingProxy) {
    logger.info(`[${providerId}] Using ScraperAPI proxy (PROXY_PROVIDERS includes ${providerId})`)
  }

  for (const url of collectionsJson) {
    try {
      const fetched = await withRetry(() => fetchCollection(url, providerId), {
        retries: 5, delayMs: 3000, label: `${providerId} ${url.split('/collections/')[1]?.split('/')[0] || url}`,
      })
      rawProducts.push(...fetched)
      logger.info(`[${providerId}] Fetched ${fetched.length} products from ${url}`)
    } catch (err) {
      logger.error(`[${providerId}] Failed to fetch ${url}`, { error: err.message })
    }
    // Polite delay between collections within the same store
    await sleep(2000 + Math.floor(Math.random() * 1000))
  }

  const normalised = rawProducts.flatMap(p => shopifyProductToItems(p, providerId))
  const deduped    = deduplicateProducts(normalised)
  logger.info(`[${providerId}] Total after dedup: ${deduped.length} products`)
  return deduped
}

module.exports = { scrapeShopify }
