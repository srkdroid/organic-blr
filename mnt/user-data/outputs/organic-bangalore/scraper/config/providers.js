/**
 * scraper/config/providers.js
 * Single source of truth for scraper URLs and CSS selectors.
 * When a provider redesigns their site, only edit this file.
 */

const PROVIDERS = {
  healthyBuddha: {
    id:           'HB',
    name:         'Healthy Buddha',
    baseUrl:      'https://healthybuddha.in',
    vegetablesUrl:'https://healthybuddha.in/fruits-vegetables/vegetables',
    fruitsUrl:    'https://healthybuddha.in/fruits-vegetables/fruits',
    scrapeMethod: 'playwright',
    selectors: {
      productCard: '.product-item, .product-card, article.product',
      name:        '.product-name, .product-title, h3',
      price:       '.price, .product-price, .selling-price',
      unit:        '.product-unit, .unit, .weight',
      outOfStock:  '.out-of-stock, .unavailable',
      loadMore:    '.load-more, button[data-action="load-more"]',
    },
    delivery: { freeAbove: 1000, chargeBelow: 40, minOrder: 399 },
  },

  organicMandya: {
    id:                 'OM',
    name:               'Organic Mandya',
    baseUrl:            'https://organicmandya.com',
    vegetablesApiUrl:   'https://organicmandya.com/collections/fruits-vegetables/products.json?limit=250',
    fruitsApiUrl:       'https://organicmandya.com/collections/fruits/products.json?limit=250',
    scrapeMethod:       'shopify_json',
    delivery: { freeAbove: 500, chargeBelow: 30, minOrder: 200 },
  },

  lushful: {
    id:               'LU',
    name:             'Lushful',
    baseUrl:          'https://lushful.org',
    vegetablesApiUrl: 'https://lushful.org/collections/vegetables/products.json?limit=250',
    fruitsApiUrl:     'https://lushful.org/collections/fruits/products.json?limit=250',
    scrapeMethod:     'shopify_json',
    delivery: { freeAbove: 599, chargeBelow: 35, minOrder: 300 },
  },

  akshayakalpa: {
    id:           'AK',
    name:         'Akshayakalpa',
    baseUrl:      'https://shop.akshayakalpa.org',
    vegetablesUrl:'https://shop.akshayakalpa.org/collections/vegetables',
    fruitsUrl:    'https://shop.akshayakalpa.org/collections/fruits',
    scrapeMethod: 'playwright_intercept',
    selectors: {
      productCard: '.product-card, .product-item, [data-product-id]',
      name:        '.product-title, .product-name, h2, h3',
      price:       '.price, .product-price, [data-price]',
      unit:        '.unit, .weight, .variant-title',
      outOfStock:  '[data-available="false"], .sold-out',
    },
    interceptPatterns: [
      /\/api\/products/,
      /\/products\.json/,
      /catalogue/i,
      /inventory/i,
    ],
    delivery: { freeAbove: 0, chargeBelow: 0, minOrder: 0 },
  },

  farmFresh: {
    id:           'FF',
    name:         'Farm Fresh Bangalore',
    baseUrl:      'https://farmfreshbangalore.com',
    vegetablesUrl:'https://farmfreshbangalore.com/product-category/vegetables/',
    fruitsUrl:    'https://farmfreshbangalore.com/product-category/fruits/',
    scrapeMethod: 'cheerio',
    selectors: {
      productCard: 'li.product',
      name:        'h2.woocommerce-loop-product__title',
      price:       'span.woocommerce-Price-amount bdi',
      unit:        '.product-unit, .product-weight, .variation, p.meta',
      outOfStock:  '.out-of-stock, .sold-out',
      nextPage:    'a.next.page-numbers',
    },
    delivery: { freeAbove: 699, chargeBelow: 45, minOrder: 350 },
  },

  greenDNA: {
    id:           'GD',
    name:         'GreenDNA',
    baseUrl:      'https://www.greendna.in',
    vegetablesUrl:'https://www.greendna.in/collections/vegetables',
    fruitsUrl:    'https://www.greendna.in/collections/fruits',
    scrapeMethod: 'playwright',
    selectors: {
      productCard: '.product-item, .grid__item, [class*="product-card"]',
      name:        '.product-card__title, .product-item__title, h3',
      price:       '.price__current, .money, [class*="price"]',
      unit:        '.product-card__subtitle, .variant-option, [class*="unit"]',
      outOfStock:  '.product-card--sold-out, [aria-label*="Sold out"]',
      loadMore:    'button[data-action="load-more"], .pagination__next',
    },
    delivery: { freeAbove: 500, chargeBelow: 30, minOrder: 250 },
  },
}

module.exports = PROVIDERS
