import { PROVIDERS, calcDelivery, GST_RATE } from './providers.js'

// Generate combinations of size k from array
export function getCombinations(arr, k) {
  if (k === 1) return arr.map(x => [x])
  const result = []
  for (let i = 0; i <= arr.length - k; i++) {
    const head = arr[i]
    const tailCombs = getCombinations(arr.slice(i + 1), k - 1)
    for (const tail of tailCombs) {
      result.push([head, ...tail])
    }
  }
  return result
}

// Evaluate a specific subset of providers for the given cart
export function evaluateSubset(subsetIds, cartItems, allItems) {
  // totals maps providerId -> { items_subtotal, items, delivery, etc }
  const totals = {}
  for (const pid of subsetIds) {
    totals[pid] = { provider_id: pid, items_subtotal: 0, items: [] }
  }

  let unfulfilledCount = 0
  const unfulfilledItems = []

  // 1. Greedy Assignment
  for (const cartItem of cartItems) {
    const item = allItems.find(i => i.master_item_id === cartItem.master_item_id)
    if (!item) {
      unfulfilledCount++
      unfulfilledItems.push(`Unknown Item #${cartItem.master_item_id}`)
      continue
    }

    const qty = Math.max(1, parseInt(cartItem.quantity) || 1)
    
    // Find cheapest provider IN THE SUBSET that has this item
    let bestProvider = null
    let bestPrice = Infinity

    for (const priceObj of item.prices || []) {
      if (!priceObj.available || !priceObj.price) continue
      if (!subsetIds.includes(priceObj.provider_id)) continue

      if (priceObj.price < bestPrice) {
        bestPrice = priceObj.price
        bestProvider = priceObj.provider_id
      }
    }

    if (bestProvider) {
      totals[bestProvider].items_subtotal += bestPrice * qty
      totals[bestProvider].items.push({
        master_item_id: item.master_item_id,
        name: item.canonical_name,
        qty: qty,
        price: bestPrice,
        total: bestPrice * qty
      })
    } else {
      unfulfilledCount++
      unfulfilledItems.push(item.canonical_name)
    }
  }

  // 2. Calculate Costs
  let grandTotal = 0
  let validProvidersCount = 0

  const providerResults = []

  for (const pid of subsetIds) {
    const pt = totals[pid]
    if (pt.items.length === 0) continue // This provider wasn't used

    validProvidersCount++
    const delivery = calcDelivery(pt.items_subtotal, pid)
    const subTotal = pt.items_subtotal + delivery
    const gstAmount = Math.round(subTotal * GST_RATE * 100) / 100
    const ptGrandTotal = Math.round((subTotal + gstAmount) * 100) / 100

    grandTotal += ptGrandTotal

    const cfg = PROVIDERS[pid] || {}
    const minOrder = cfg.minOrder || 0
    if (pt.items_subtotal > 0 && pt.items_subtotal < minOrder) {
      unfulfilledCount++ // Heavy penalty, invalid subset
      // If a provider failed minOrder, the whole subset is essentially unfulfillable
    }

    providerResults.push({
      provider_id: pid,
      items: pt.items,
      items_subtotal: pt.items_subtotal,
      delivery_applied: delivery,
      free_delivery_above: cfg.freeAbove ?? null,
      gst_amount: gstAmount,
      grand_total: ptGrandTotal
    })
  }

  // Add huge penalty for unfulfilled items so they only win if there is no other choice
  const penalty = unfulfilledCount * 999999
  const score = grandTotal + penalty

  return {
    strategy_type: validProvidersCount === 1 ? 'single' : validProvidersCount === 2 ? 'split-2' : 'split-many',
    provider_count: validProvidersCount,
    unfulfilled_count: unfulfilledCount,
    unfulfilled_items: unfulfilledItems,
    score: score,
    grand_total: Math.round(grandTotal * 100) / 100,
    providers: providerResults
  }
}

export function optimizeCart(cartItems, allItems) {
  const providerIds = Object.keys(PROVIDERS)
  
  // Generate subsets of size 1, 2, and 3
  const subsets = [
    ...getCombinations(providerIds, 1),
    ...getCombinations(providerIds, 2),
    ...getCombinations(providerIds, 3)
  ]

  let bestSingle = null
  let bestSplit2 = null
  let absoluteCheapest = null

  for (const subset of subsets) {
    const result = evaluateSubset(subset, cartItems, allItems)
    
    // Only consider results that actually used the exact number of providers requested 
    // (e.g. if a 3-way subset only ended up using 2 providers, it will be caught by the 2-way subset anyway)
    if (result.provider_count !== subset.length && result.unfulfilled_count === 0) {
      continue
    }

    // Update Absolute Cheapest
    if (!absoluteCheapest || result.score < absoluteCheapest.score) {
      absoluteCheapest = result
    }

    // Update Best Single
    if (result.provider_count === 1) {
      if (!bestSingle || result.score < bestSingle.score) {
        bestSingle = result
      }
    }

    // Update Best 2-Way Split
    if (result.provider_count === 2) {
      if (!bestSplit2 || result.score < bestSplit2.score) {
        bestSplit2 = result
      }
    }
  }

  const recommendations = []
  
  if (bestSingle) recommendations.push({ id: 'single', label: 'Best Single Store', ...bestSingle })
  
  // Only add Split-2 if it's better than Single
  if (bestSplit2 && bestSingle && bestSplit2.score < bestSingle.score) {
    recommendations.push({ id: 'split-2', label: 'Best 2-Way Split', ...bestSplit2 })
  }
  
  // Only add Absolute Cheapest if it's better than the best we have so far
  const currentBestScore = recommendations.length > 0 ? recommendations[recommendations.length - 1].score : Infinity
  if (absoluteCheapest && absoluteCheapest.score < currentBestScore && absoluteCheapest.provider_count > 2) {
    recommendations.push({ id: 'cheapest', label: 'Absolute Cheapest', ...absoluteCheapest })
  }

  return recommendations
}
