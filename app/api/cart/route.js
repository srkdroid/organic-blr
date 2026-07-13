import { getAllItems } from '@/lib/db'
import { enrichPrices, PROVIDERS, calcDelivery, GST_RATE, getPriceForVariant } from '@/lib/providers'
import { optimizeCart } from '@/lib/optimizer'

export const dynamic = 'force-dynamic'

/**
 * Build a Shopify cart URL for a given provider from cart items + their prices.
 * e.g. https://organicmandya.com/cart/41234567:1,98765432:2
 * Returns null if no items have variant_ids for that provider.
 */
function buildShopifyCartUrl(cartItems, allItems, providerId) {
  const cfg = PROVIDERS[providerId]
  if (!cfg?.shopifyCart || !cfg?.cartBase) return null

  const segments = []

  for (const cartItem of cartItems) {
    const item = allItems.find(i => i.master_item_id === cartItem.master_item_id)
    if (!item) continue

    const qty = Math.max(1, parseInt(cartItem.quantity) || 1)
    const providerPrices = (item.prices || []).filter(
      p => p.provider_id === providerId && p.available && p.price
    )
    const { price: p } = getPriceForVariant(providerPrices, cartItem.unit)
    if (p?.variant_id) {
      segments.push(`${p.variant_id}:${qty}`)
    }
  }

  if (segments.length === 0) return null
  return `${cfg.cartBase}/${segments.join(',')}`
}

export async function POST(request) {
  try {
    const body = await request.json()
    const cartItems = body?.items

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return Response.json({ error: 'items array required' }, { status: 400 })
    }

    const allItems = enrichPrices(await getAllItems())
    const totals = {}

    // Sum up prices per provider
    for (const cartItem of cartItems) {
      const item = allItems.find(i => i.master_item_id === cartItem.master_item_id)
      if (!item) continue
      const qty = Math.max(1, parseInt(cartItem.quantity) || 1)

      for (const pid of Object.keys(PROVIDERS)) {
        const providerPrices = (item.prices || []).filter(
          p => p.provider_id === pid && p.available && p.price
        )
        const { price: p } = getPriceForVariant(providerPrices, cartItem.unit)
        if (p && p.price) {
          if (!totals[pid]) {
            totals[pid] = { provider_id: pid, items_subtotal: 0, items_found: 0, items_missing: 0 }
          }
          totals[pid].items_subtotal += p.price * qty
          totals[pid].items_found++
        }
      }
    }

    // Count items not available per provider
    for (const cartItem of cartItems) {
      const item = allItems.find(i => i.master_item_id === cartItem.master_item_id)
      for (const pid of Object.keys(totals)) {
        const providerPrices = (item?.prices || []).filter(
          p => p.provider_id === pid && p.available && p.price
        )
        const { price: p } = getPriceForVariant(providerPrices, cartItem.unit)
        if (!p) {
          totals[pid].items_missing++
        }
      }
    }

    // Compute grand totals including delivery + GST
    const result = Object.values(totals).map(pt => {
      const delivery   = calcDelivery(pt.items_subtotal, pt.provider_id)
      const subTotal   = pt.items_subtotal + delivery
      const gstAmount  = Math.round(subTotal * GST_RATE * 100) / 100
      const grandTotal = Math.round((subTotal + gstAmount) * 100) / 100
      const cfg        = PROVIDERS[pt.provider_id] || {}
      return {
        ...pt,
        delivery_applied:     delivery,
        free_delivery_above:  cfg.freeAbove ?? null,
        gst_rate:             GST_RATE,
        gst_amount:           gstAmount,
        grand_total:          grandTotal,
      }
    })

    result.sort((a, b) => a.grand_total - b.grand_total)

    // Run the subset optimization algorithm
    const optimizations = optimizeCart(cartItems, allItems)

    // Build Shopify cart checkout URLs for OM, AK, GD
    const checkout_urls = {}
    for (const pid of Object.keys(PROVIDERS)) {
      const url = buildShopifyCartUrl(cartItems, allItems, pid)
      if (url) checkout_urls[pid] = url
    }

    return Response.json({ 
      cart_items: cartItems.length, 
      provider_totals: result,
      optimizations,
      checkout_urls,
    })
  } catch (err) {
    console.error('[API /cart]', err.message)
    return Response.json({ error: 'Failed to compute cart total' }, { status: 500 })
  }
}
