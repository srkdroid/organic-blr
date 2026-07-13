/**
 * lib/providers.js
 * Shared provider metadata — used by API routes (server) AND React components (client).
 * No Node-only imports allowed here.
 */

export const PROVIDERS = {
  HB: { id:'HB', name:'Healthy Buddha',       color:'#059669', bg:'#d1fae5', url:'healthybuddha.in',       deliveryCharge:40,  freeAbove:1000, minOrder:399  },
  OM: { id:'OM', name:'Organic Mandya',        color:'#2563eb', bg:'#dbeafe', url:'organicmandya.com',      deliveryCharge:30,  freeAbove:500,  minOrder:200,  shopifyCart:true, cartBase:'https://organicmandya.com/cart'      },
  LU: { id:'LU', name:'Lushful',               color:'#dc2626', bg:'#fee2e2', url:'lushful.org',            deliveryCharge:35,  freeAbove:599,  minOrder:300  },
  AK: { id:'AK', name:'Satva Farm',            color:'#7c3aed', bg:'#ede9fe', url:'satvafarm.com',          deliveryCharge:0,   freeAbove:500,  minOrder:0,    shopifyCart:true, cartBase:'https://satvafarm.com/cart'          },
  FF: { id:'FF', name:'Farm Fresh Bangalore',  color:'#d97706', bg:'#fef3c7', url:'farmfreshbangalore.com', deliveryCharge:45,  freeAbove:699,  minOrder:350  },
  GD: { id:'GD', name:'GreenDNA',              color:'#0891b2', bg:'#cffafe', url:'greendna.in',            deliveryCharge:30,  freeAbove:500,  minOrder:250,  shopifyCart:true, cartBase:'https://www.greendna.in/cart'        },
  BF: { id:'BF', name:'Bhoomi Farms',          color:'#65a30d', bg:'#ecfccb', url:'bhoomi.farm',            deliveryCharge:40,  freeAbove:499,  minOrder:0    },
}

export const PROVIDER_IDS = Object.keys(PROVIDERS)

export const CATEGORIES = ['All', 'Vegetables', 'Fruits', 'Leafy Greens', 'Herbs', 'Exotic']

export const CAT_COLORS = {
  Vegetables:     { bg:'#dcfce7', text:'#166534' },
  Fruits:         { bg:'#fef9c3', text:'#713f12' },
  'Leafy Greens': { bg:'#cffafe', text:'#164e63' },
  Herbs:          { bg:'#ede9fe', text:'#4c1d95' },
  Exotic:         { bg:'#fce7f3', text:'#831843' },
  Unknown:        { bg:'#f3f4f6', text:'#374151' },
}

export const GST_RATE = 0.05

/** Return the delivery charge for a given order subtotal + provider. */
export function calcDelivery(subtotal, providerId) {
  const p = PROVIDERS[providerId]
  if (!p) return 0
  if (p.freeAbove === 0) return 0               // always free (e.g. Akshayakalpa)
  return subtotal < p.freeAbove ? p.deliveryCharge : 0
}

/** Convert a weight-based unit string to a kg multiplier. Returns null if not weight-based. */
export function parseUnitToKg(unitStr) {
  if (!unitStr) return null
  const u = String(unitStr).toLowerCase().trim()
  const match = u.match(/^([\d.]+)\s*(g|kg|ml|l)$/)
  if (!match) return null
  
  const val = parseFloat(match[1])
  if (isNaN(val)) return null
  
  const type = match[2]
  if (type === 'g' || type === 'ml') return val / 1000
  if (type === 'kg' || type === 'l') return val
  return null
}

/** Parse a unit string like "500g", "1 kg", "250 gm" into grams for comparison */
export function unitToGrams(unitStr) {
  if (!unitStr) return null
  const u = String(unitStr).toLowerCase().trim()

  // Match patterns like "500g", "1 kg", "250 gm", "1.5 kg", "500ml", "1l"
  const match = u.match(/^([\d.]+)\s*(g|gm|gms|gram|grams|kg|kgs|ml|l|ltr|litre|litres)$/)
  if (!match) return null

  const val = parseFloat(match[1])
  if (isNaN(val)) return null

  const type = match[2]
  if (['g', 'gm', 'gms', 'gram', 'grams', 'ml'].includes(type)) return val
  if (['kg', 'kgs', 'l', 'ltr', 'litre', 'litres'].includes(type)) return val * 1000
  return null
}

/** Find the nearest available unit for a provider, given a target unit in grams */
export function findNearestVariant(providerPrices, targetGrams) {
  if (!providerPrices || providerPrices.length === 0 || targetGrams === null) return null

  let nearest = null
  let nearestDiff = Infinity

  for (const p of providerPrices) {
    const pGrams = unitToGrams(p.unit)
    if (pGrams === null) continue
    const diff = Math.abs(pGrams - targetGrams)
    if (diff < nearestDiff) {
      nearestDiff = diff
      nearest = p
    }
  }

  return nearest
}

/** Get the price for a specific variant at a provider, or nearest match */
export function getPriceForVariant(providerPrices, selectedUnit) {
  if (!providerPrices || providerPrices.length === 0) return { price: null, isExact: false }

  // Exact match
  const exact = providerPrices.find(p => p.unit === selectedUnit)
  if (exact) return { price: exact, isExact: true }

  // Nearest match
  const targetGrams = unitToGrams(selectedUnit)
  if (targetGrams === null) return { price: null, isExact: false }

  const nearest = findNearestVariant(providerPrices, targetGrams)
  return { price: nearest, isExact: false }
}

/** Attach delivery + GST metadata to each price in the items list. */
export function enrichPrices(items) {
  return items.map(item => ({
    ...item,
    prices: (item.prices || []).map(p => {
      const cfg = PROVIDERS[p.provider_id] || {}
      
      let pricePerKg = null
      const kgMult = parseUnitToKg(p.unit)
      if (kgMult && p.price) {
        pricePerKg = Math.round(p.price / kgMult)
      }

      return {
        ...p,
        price_per_kg:        pricePerKg,
        delivery_charge:     cfg.deliveryCharge  ?? 0,
        free_delivery_above: cfg.freeAbove       ?? null,
        min_order:           cfg.minOrder        ?? 0,
        gst_rate:            GST_RATE,
      }
    }),
  }))
}
