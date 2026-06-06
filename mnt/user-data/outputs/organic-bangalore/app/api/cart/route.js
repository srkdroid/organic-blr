import { getAllItems } from '@/lib/db'
import { enrichPrices, PROVIDERS, calcDelivery, GST_RATE } from '@/lib/providers'

export const dynamic = 'force-dynamic'

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

      for (const price of item.prices || []) {
        if (!price.available || !price.price) continue
        const pid = price.provider_id
        if (!totals[pid]) {
          totals[pid] = { provider_id: pid, items_subtotal: 0, items_found: 0, items_missing: 0 }
        }
        totals[pid].items_subtotal += price.price * qty
        totals[pid].items_found++
      }
    }

    // Count items not available per provider
    for (const cartItem of cartItems) {
      for (const pid of Object.keys(totals)) {
        const item = allItems.find(i => i.master_item_id === cartItem.master_item_id)
        const has  = item?.prices?.some(p => p.provider_id === pid && p.available)
        if (!has) totals[pid].items_missing++
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
    return Response.json({ cart_items: cartItems.length, provider_totals: result })
  } catch (err) {
    console.error('[API /cart]', err.message)
    return Response.json({ error: 'Failed to compute cart total' }, { status: 500 })
  }
}
