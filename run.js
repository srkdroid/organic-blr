/**
 * scraper/tests/run.js
 * Smoke tests — validates utils and normalizer without hitting any live site.
 * Run: npm test
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env.scraper') })
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local'), override: false })

const { parsePrice, parseUnit, deduplicateProducts, buildProduct } = require('../utils/index')
const { fuzzyMatch } = require('../normalizer/index')

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) { console.log(`  ✓ ${label}`); passed++ }
  else           { console.error(`  ✗ ${label}`); failed++ }
}

// ── parsePrice ────────────────────────────────────────────────────────────────
console.log('\n── parsePrice')
assert(parsePrice('Rs. 45')   === 45,   'Rs. 45 → 45')
assert(parsePrice('₹ 45.00') === 45,   '₹ 45.00 → 45')
assert(parsePrice('45')       === 45,   '"45" → 45')
assert(parsePrice('₹1,299')  === 1299, '₹1,299 → 1299')
assert(parsePrice(null)       === null, 'null → null')
assert(parsePrice('')         === null, 'empty → null')

// ── parseUnit ─────────────────────────────────────────────────────────────────
console.log('\n── parseUnit')
assert(parseUnit('500 gms') === '500g',    '500 gms → 500g')
assert(parseUnit('1 Kg')    === '1kg',     '1 Kg → 1kg')
assert(parseUnit('1 bunch') === '1 bunch', '1 bunch → 1 bunch')
assert(parseUnit('6 pcs')   === '6pcs',    '6 pcs → 6pcs')
assert(parseUnit('500g')    === '500g',    '500g → 500g (unchanged)')
assert(parseUnit(null)      === null,      'null → null')

// ── buildProduct ──────────────────────────────────────────────────────────────
console.log('\n── buildProduct')
const p = buildProduct({ providerId: 'HB', name: 'Tomato', price: '₹45', unit: '500 gms' })
assert(p.providerId === 'HB',  'providerId set')
assert(p.name       === 'Tomato', 'name set')
assert(p.price      === 45,    'price parsed')
assert(p.unit       === '500g','unit normalised')
assert(typeof p.scrapedAt === 'string', 'scrapedAt set')

// ── deduplicateProducts ───────────────────────────────────────────────────────
console.log('\n── deduplicateProducts')
const dupes = [
  buildProduct({ providerId: 'HB', name: 'Tomato', price: '45', unit: '500g' }),
  buildProduct({ providerId: 'HB', name: 'Tomato', price: '50', unit: '500g' }),  // duplicate
  buildProduct({ providerId: 'HB', name: 'Carrot', price: '55', unit: '500g' }),
]
assert(deduplicateProducts(dupes).length === 2, 'removes duplicate name+unit pairs')

// ── fuzzyMatch ────────────────────────────────────────────────────────────────
console.log('\n── fuzzyMatch')
const masterItems = [
  { id: 1, canonical_name: 'Tomato',  aliases: ['tomato', 'tamatar'] },
  { id: 2, canonical_name: 'Carrot',  aliases: ['carrot', 'gajar'] },
  { id: 3, canonical_name: 'Spinach', aliases: ['spinach', 'palak', 'fresh palak'] },
]
const testProducts = [
  buildProduct({ providerId: 'HB', name: 'Tomato',            price: '45', unit: '500g' }),
  buildProduct({ providerId: 'FF', name: 'Fresh Palak',        price: '30', unit: '1 bunch' }),
  buildProduct({ providerId: 'LU', name: 'XYZUNKNOWNITEM999',  price: '99', unit: '1pc' }),
]
const { matched, unmatched } = fuzzyMatch(testProducts, masterItems)
assert(matched.length   >= 1, `fuzzyMatch: ≥1 matched (got ${matched.length})`)
assert(unmatched.length >= 1, `fuzzyMatch: ≥1 unmatched (got ${unmatched.length})`)
assert(matched.find(m => m.masterItemId === 1) !== undefined, 'Tomato → masterItemId 1')

// ── Cart total logic ──────────────────────────────────────────────────────────
console.log('\n── Cart total logic')
function mockTotal(subtotal, charge, freeAbove, gst) {
  const delivery = (freeAbove === 0 || subtotal >= freeAbove) ? 0 : charge
  const sub = subtotal + delivery
  return Math.round((sub + sub * gst) * 100) / 100
}
assert(mockTotal(500,  0, 0,    0.05) === 525,  'AK: ₹500 + free + 5% GST = ₹525')
assert(mockTotal(600, 40, 1000, 0.05) === 672,  'HB: ₹600 + ₹40 del + 5% GST = ₹672')
assert(mockTotal(1200,40, 1000, 0.05) === 1260, 'HB: ₹1200 free del + 5% GST = ₹1260')

// ── Provider config ───────────────────────────────────────────────────────────
console.log('\n── Provider config')
const PROVIDERS = require('../config/providers')
assert(PROVIDERS.organicMandya.vegetablesApiUrl.includes('/products.json'), 'OM: Shopify URL correct')
assert(PROVIDERS.lushful.vegetablesApiUrl.includes('/products.json'),       'LU: Shopify URL correct')
assert(PROVIDERS.farmFresh.selectors.productCard === 'li.product',          'FF: WooCommerce selector correct')
assert(PROVIDERS.akshayakalpa.interceptPatterns.length > 0,                 'AK: interceptPatterns set')

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(42)}`)
console.log(`  Results: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(42)}\n`)

if (failed > 0) process.exit(1)
