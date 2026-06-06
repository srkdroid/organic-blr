/**
 * scraper/utils/shopifyScraper.js
 * Fetches product data from any Shopify store's public /products.json endpoint.
 */

const axios = require('axios')
const { logger, withRetry, buildProduct, deduplicateProducts, randomUserAgent, sleep } = require('./index')

async function fetchCollection(collectionUrl) {
  const allProducts = []
  let page = 1

  while (true) {
    const url = `${collectionUrl}&page=${page}`
    logger.debug(`[Shopify] GET ${url}`)

    const response = await axios.get(url, {
      timeout: 20_000,
      headers: {
        'User-Agent':      randomUserAgent(),
        'Accept':          'application/json',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
    })

    const { products } = response.data
    if (!products || products.length === 0) break

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
      : shopifyProduct.options?.flatMap(o => o.values).find(v => /\d/.test(v)) || null

    items.push(buildProduct({
      providerId,
      name:      shopifyProduct.title,
      price:     variant.price,
      unit,
      available,
      imageUrl:  shopifyProduct.images?.[0]?.src || null,
    }))
  }

  // Keep only the cheapest variant per product
  if (items.length > 1) {
    items.sort((a, b) => (a.price || 999) - (b.price || 999))
    return [items[0]]
  }

  return items
}

async function scrapeShopify({ providerId, collectionsJson }) {
  const rawProducts = []

  for (const url of collectionsJson) {
    try {
      const fetched = await withRetry(() => fetchCollection(url), {
        retries: 3, delayMs: 2000, label: `${providerId} ${url}`,
      })
      rawProducts.push(...fetched)
      logger.info(`[${providerId}] Fetched ${fetched.length} products from ${url}`)
    } catch (err) {
      logger.error(`[${providerId}] Failed to fetch ${url}`, { error: err.message })
    }
  }

  const normalised = rawProducts.flatMap(p => shopifyProductToItems(p, providerId))
  const deduped    = deduplicateProducts(normalised)
  logger.info(`[${providerId}] Total after dedup: ${deduped.length} products`)
  return deduped
}

module.exports = { scrapeShopify }
