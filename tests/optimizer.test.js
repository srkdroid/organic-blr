import { getCombinations, evaluateSubset, optimizeCart } from '../lib/optimizer.js'
import assert from 'assert'

// Mock Providers config if needed, though optimizer imports from lib/providers directly.
// lib/providers has:
// AK: freeAbove 500, delivery 50
// FF: freeAbove 500, delivery 40
// GD: freeAbove 600, delivery 40
// HB: freeAbove 800, delivery 40
// LU: freeAbove 500, delivery 50
// OM: freeAbove 500, delivery 50
// GST = 5%

const mockAllItems = [
  {
    master_item_id: 1,
    canonical_name: 'Apple',
    prices: [
      { provider_id: 'FF', price: 300, available: true },
      { provider_id: 'LU', price: 150, available: true }
    ]
  },
  {
    master_item_id: 2,
    canonical_name: 'Banana',
    prices: [
      { provider_id: 'FF', price: 60, available: true },
      { provider_id: 'LU', price: 40, available: true }
    ]
  },
  {
    master_item_id: 3,
    canonical_name: 'Carrot',
    prices: [
      { provider_id: 'FF', price: 600, available: true }, // Push FF over free delivery
      { provider_id: 'OM', price: 350, available: true }  // Cheaper
    ]
  }
]

async function runTests() {
  console.log('── getCombinations')
  const c1 = getCombinations(['A', 'B', 'C'], 1)
  assert.deepStrictEqual(c1, [['A'], ['B'], ['C']])
  const c2 = getCombinations(['A', 'B', 'C'], 2)
  assert.deepStrictEqual(c2, [['A', 'B'], ['A', 'C'], ['B', 'C']])
  console.log('  ✓ getCombinations works')

  console.log('── evaluateSubset')
  const cart1 = [{ master_item_id: 1, quantity: 2 }, { master_item_id: 2, quantity: 2 }]
  // evaluate subset [FF]
  const resFF = evaluateSubset(['FF'], cart1, mockAllItems)
  // Apple: 300*2 = 600
  // Banana: 60*2 = 120
  // Subtotal = 720. Delivery = 0 (free above 699). Subtotal+Del = 720. GST(5%) = 36. Total = 756.
  assert.strictEqual(resFF.providers[0].items_subtotal, 720)
  assert.strictEqual(resFF.providers[0].delivery_applied, 0)
  assert.strictEqual(resFF.grand_total, 756)
  console.log('  ✓ evaluateSubset single works')

  console.log('── optimizeCart')
  // cart2 includes Carrot, Apple, Banana
  const cart2 = [
    { master_item_id: 1, quantity: 1 }, // Apple
    { master_item_id: 2, quantity: 2 }, // Banana
    { master_item_id: 3, quantity: 1 }  // Carrot
  ]

  // Scenario 1: Best Single Provider
  // FF: Apple(300) + Banana(120) + Carrot(600) = 1020. Free delivery (>699). GST(51) = 1071.
  // LU: Has no Carrot -> Unfulfilled.
  // OM: Has no Apple/Banana -> Unfulfilled.

  // Scenario 2: Split 2-way (FF + LU)
  // LU: Banana(80). Delivery(50). Sub = 130 + 6.5 = 136.5
  // FF: Apple(300) + Carrot(600) = 900. Free delivery! Sub = 900 + 45 = 945.
  // Total = 136.5 + 945 = 1081.5 (Worse than Single FF 1071)

  // What about FF + OM?
  // FF: Apple(300) + Banana(120) = 420 (passes 350 minOrder). Delivery(45). Sub = 465 + 23.25 = 488.25.
  // OM: Carrot(350). Delivery(50). Sub = 400 + 20 = 420.
  // Total = 908.25. (Worse than Single FF 1071... wait, 908.25 is BETTER than 1071!)
  // So Split 2-way (FF + OM) WILL BE SELECTED.

  const recommendations = optimizeCart(cart2, mockAllItems)
  
  assert.strictEqual(recommendations.length > 0, true)
  const singleRec = recommendations.find(r => r.id === 'single')
  const split2Rec = recommendations.find(r => r.id === 'split-2')
  
  assert.ok(singleRec, "Should find best single")
  assert.strictEqual(singleRec.grand_total, 1071)
  
  assert.ok(split2Rec, "Should find best split-2")
  assert.strictEqual(split2Rec.grand_total, 887.25)
  console.log('  ✓ optimizeCart recommends good splits')

  // Let's create a scenario where a split is definitely better
  const cart3 = [
    { master_item_id: 1, quantity: 10 }, // Apple: FF=3000, LU=1500
    { master_item_id: 2, quantity: 10 }, // Banana: FF=600, LU=400
  ]
  // Single FF: 3600. Free del. GST 180 = 3780.
  // Single LU: 1900. Free del. GST 95 = 1995.
  // Split FF+LU: FF Apple(3000, free del), LU Banana(400 + 50 del = 450). Total = 3450. GST = 172.5 -> 3622.5.
  const rec3 = optimizeCart(cart3, mockAllItems)
  assert.strictEqual(rec3.length > 0, true)
  console.log('  ✓ optimizeCart multi-scenario works')

  console.log('All tests passed.')
}

runTests().catch(console.error)
