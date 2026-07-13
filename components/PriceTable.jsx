'use client'
import { useState, useMemo } from 'react'
import { PROVIDERS, PROVIDER_IDS, CAT_COLORS, unitToGrams, findNearestVariant, getPriceForVariant } from '@/lib/providers'

export function PriceTable({ items, cart, onToggle, onUnitChange }) {
  if (!items.length) {
    return (
      <p className="text-center text-gray-400 text-sm py-10">
        No items match your filter.
      </p>
    )
  }

  return (
    <>
      {/* Desktop: classic table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="sticky top-14 z-20 w-8 px-3 py-3 bg-gray-50 border-b border-gray-200" />
              <th className="sticky top-14 z-20 px-3 py-3 text-left font-medium text-gray-500 text-xs w-44 bg-gray-50 border-b border-gray-200">Item</th>
              <th className="sticky top-14 z-20 px-2 py-3 text-left font-medium text-gray-500 text-xs w-28 bg-gray-50 border-b border-gray-200">Size</th>
              {PROVIDER_IDS.map(id => (
                <th key={id}
                    className="sticky top-14 z-20 px-2 py-3 text-right text-xs font-semibold bg-gray-50 border-b border-gray-200"
                    style={{ color: PROVIDERS[id].color }}>
                  {id}
                </th>
              ))}
              <th className="sticky top-14 z-20 px-3 py-3 text-right text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-200">Best</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <DesktopRow key={item.master_item_id} item={item} cart={cart} onToggle={onToggle} onUnitChange={onUnitChange} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {items.map(item => (
          <MobileCard key={item.master_item_id} item={item} cart={cart} onToggle={onToggle} onUnitChange={onUnitChange} />
        ))}
      </div>
    </>
  )
}

// ── Multi-variant helpers ─────────────────────────────────────────────────────

/** Build a map: provider_id → [array of price entries] */
function getMultiPriceMap(item) {
  const map = {}
  for (const p of item.prices || []) {
    if (p.available && p.price) {
      if (!map[p.provider_id]) map[p.provider_id] = []
      map[p.provider_id].push(p)
    }
  }
  return map
}

/** Get all unique unit strings across all providers for an item */
function getAllVariants(multiPriceMap) {
  const unitSet = new Map() // unit string → grams (for sorting)
  for (const prices of Object.values(multiPriceMap)) {
    for (const p of prices) {
      if (p.unit && !unitSet.has(p.unit)) {
        unitSet.set(p.unit, unitToGrams(p.unit))
      }
    }
  }
  // Sort by grams ascending (null grams go last)
  const sorted = [...unitSet.entries()].sort((a, b) => {
    if (a[1] === null && b[1] === null) return 0
    if (a[1] === null) return 1
    if (b[1] === null) return -1
    return a[1] - b[1]
  })
  return sorted.map(([unit]) => unit)
}

/** Find the default variant (the one with the overall cheapest price) */
function getDefaultVariant(multiPriceMap) {
  let cheapest = null
  let cheapestUnit = null
  for (const prices of Object.values(multiPriceMap)) {
    for (const p of prices) {
      if (!cheapest || p.price < cheapest.price) {
        cheapest = p
        cheapestUnit = p.unit
      }
    }
  }
  return cheapestUnit
}

/** Get best/worst for a selected variant across all providers */
function getBestWorstForVariant(multiPriceMap, selectedUnit) {
  const entries = []
  for (const [providerId, prices] of Object.entries(multiPriceMap)) {
    const { price } = getPriceForVariant(prices, selectedUnit)
    if (price) entries.push({ providerId, ...price })
  }
  if (!entries.length) return { best: null, worst: null, bestProviderId: null }

  const vals = entries.map(e => e.price)
  const best = Math.min(...vals)
  const worst = Math.max(...vals)
  const bestEntry = entries.find(e => e.price === best)

  return { best, worst, bestProviderId: bestEntry?.providerId || null }
}

// ── Desktop row ───────────────────────────────────────────────────────────────

function DesktopRow({ item, cart, onToggle, onUnitChange }) {
  const multiPriceMap = useMemo(() => getMultiPriceMap(item), [item])
  const allVariants   = useMemo(() => getAllVariants(multiPriceMap), [multiPriceMap])
  const defaultUnit   = useMemo(() => getDefaultVariant(multiPriceMap), [multiPriceMap])

  const [selectedUnit, setSelectedUnit] = useState(null)
  const activeUnit = (selectedUnit && allVariants.includes(selectedUnit)) ? selectedUnit : defaultUnit

  const { best, worst, bestProviderId } = useMemo(
    () => getBestWorstForVariant(multiPriceMap, activeUnit),
    [multiPriceMap, activeUnit]
  )

  const inCart    = cart.has(item.master_item_id)
  const catColor  = CAT_COLORS[item.category] || CAT_COLORS.Unknown
  const hasMultipleVariants = allVariants.length > 1

  const bestPrice = bestProviderId
    ? getPriceForVariant(multiPriceMap[bestProviderId], activeUnit)?.price?.price
    : null

  return (
    <tr
      onClick={() => onToggle({ ...item, _selectedUnit: activeUnit })}
      className={`border-b border-gray-100 cursor-pointer transition-colors
        ${inCart ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
    >
      <td className="px-3 py-2.5 text-center">
        <input
          type="checkbox"
          checked={inCart}
          onChange={() => onToggle({ ...item, _selectedUnit: activeUnit })}
          onClick={e => e.stopPropagation()}
          className="accent-emerald-600 w-4 h-4 cursor-pointer"
        />
      </td>
      <td className="px-3 py-2.5">
        <div className="font-medium text-gray-800 text-sm leading-tight">
          {item.canonical_name}
        </div>
        <span className="inline-block mt-0.5 text-xs px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: catColor.bg, color: catColor.text }}>
          {item.category}
        </span>
      </td>

      {/* Variant dropdown column */}
      <td className="px-2 py-2.5" onClick={e => e.stopPropagation()}>
        {hasMultipleVariants ? (
          <select
            value={activeUnit || ''}
            onChange={e => {
              const val = e.target.value
              setSelectedUnit(val)
              if (onUnitChange) onUnitChange(item.master_item_id, val)
            }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white
                       text-gray-700 cursor-pointer hover:border-emerald-400
                       focus:outline-none focus:ring-1 focus:ring-emerald-500 w-full max-w-[100px]"
          >
            {allVariants.map(unit => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-gray-500">
            {allVariants[0] || '—'}
          </span>
        )}
      </td>

      {/* Provider price cells */}
      {PROVIDER_IDS.map(id => {
        const providerPrices = multiPriceMap[id]
        const { price: p, isExact } = getPriceForVariant(providerPrices, activeUnit)

        if (!p) return <td key={id} className="px-2 py-2.5 text-right price-na">—</td>

        const cls = p.price === best
          ? 'price-best'
          : p.price === worst && best !== worst
          ? 'price-worst'
          : 'text-gray-700'

        return (
          <td key={id} className={`px-2 py-2.5 text-right tabular-nums ${cls}`}>
            <div>₹{p.price}</div>
            <div className={`text-xs font-normal ${isExact ? 'text-gray-400' : 'text-amber-500 italic'}`}>
              {isExact ? p.unit : `~${p.unit}`}
            </div>
          </td>
        )
      })}

      {/* Best column */}
      <td className="px-3 py-2.5 text-right">
        {bestPrice ? (
          <>
            <div className="font-semibold text-emerald-700 tabular-nums">₹{bestPrice}</div>
            <div className="text-xs text-gray-400">{bestProviderId}</div>
          </>
        ) : (
          <span className="price-na">—</span>
        )}
      </td>
    </tr>
  )
}

// ── Mobile card ───────────────────────────────────────────────────────────────

function MobileCard({ item, cart, onToggle, onUnitChange }) {
  const multiPriceMap = useMemo(() => getMultiPriceMap(item), [item])
  const allVariants   = useMemo(() => getAllVariants(multiPriceMap), [multiPriceMap])
  const defaultUnit   = useMemo(() => getDefaultVariant(multiPriceMap), [multiPriceMap])

  const [selectedUnit, setSelectedUnit] = useState(null)
  const activeUnit = (selectedUnit && allVariants.includes(selectedUnit)) ? selectedUnit : defaultUnit

  const { best, worst, bestProviderId } = useMemo(
    () => getBestWorstForVariant(multiPriceMap, activeUnit),
    [multiPriceMap, activeUnit]
  )

  const inCart    = cart.has(item.master_item_id)
  const catColor  = CAT_COLORS[item.category] || CAT_COLORS.Unknown
  const hasMultipleVariants = allVariants.length > 1

  const bestPrice = bestProviderId
    ? getPriceForVariant(multiPriceMap[bestProviderId], activeUnit)?.price?.price
    : null

  return (
    <div
      onClick={() => onToggle({ ...item, _selectedUnit: activeUnit })}
      className={`rounded-xl border p-3 cursor-pointer transition-all active:scale-[0.99]
        ${inCart ? 'border-emerald-400 bg-emerald-50 shadow-sm' : 'border-gray-200 bg-white'}`}
    >
      {/* Item header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="checkbox"
            checked={inCart}
            onChange={() => onToggle({ ...item, _selectedUnit: activeUnit })}
            onClick={e => e.stopPropagation()}
            className="accent-emerald-600 w-4 h-4 flex-shrink-0 mt-0.5"
          />
          <div className="min-w-0">
            <div className="font-semibold text-gray-800 text-sm leading-tight">
              {item.canonical_name}
            </div>
            <span className="inline-block text-xs px-1.5 py-0.5 rounded-full mt-0.5"
                  style={{ backgroundColor: catColor.bg, color: catColor.text }}>
              {item.category}
            </span>
          </div>
        </div>
        {bestPrice && (
          <div className="text-right flex-shrink-0">
            <div className="text-xs text-gray-400">Best</div>
            <div className="font-bold text-emerald-700 tabular-nums text-sm">₹{bestPrice}</div>
          </div>
        )}
      </div>

      {/* Variant selector */}
      {hasMultipleVariants && (
        <div className="mb-2.5" onClick={e => e.stopPropagation()}>
          <select
            value={activeUnit || ''}
            onChange={e => {
              const val = e.target.value
              setSelectedUnit(val)
              if (onUnitChange) onUnitChange(item.master_item_id, val)
            }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white
                       text-gray-700 cursor-pointer hover:border-emerald-400
                       focus:outline-none focus:ring-1 focus:ring-emerald-500 w-full"
          >
            {allVariants.map(unit => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        </div>
      )}

      {/* Price grid — 3 columns */}
      <div className="grid grid-cols-3 gap-1.5">
        {PROVIDER_IDS.map(id => {
          const providerPrices = multiPriceMap[id]
          const { price: p, isExact } = getPriceForVariant(providerPrices, activeUnit)
          const isBest  = p && p.price === best
          const isWorst = p && p.price === worst && best !== worst

          if (!p) return (
            <div key={id} className="rounded-lg bg-gray-50 px-2 py-1.5 text-center">
              <div className="text-[10px] font-medium mb-0.5" style={{ color: PROVIDERS[id].color }}>
                {id}
              </div>
              <div className="text-xs text-gray-300">—</div>
            </div>
          )

          return (
            <div key={id}
              className={`rounded-lg px-2 py-1.5 text-center border
                ${isBest  ? 'bg-emerald-50 border-emerald-200'
                : isWorst ? 'bg-red-50 border-red-100'
                :           'bg-gray-50 border-transparent'}`}
            >
              <div className="text-[10px] font-semibold mb-0.5" style={{ color: PROVIDERS[id].color }}>
                {id}
              </div>
              <div className={`text-xs font-medium tabular-nums
                ${isBest ? 'text-emerald-700' : isWorst ? 'text-red-500' : 'text-gray-700'}`}>
                ₹{p.price}
              </div>
              <div className={`text-[9px] truncate ${isExact ? 'text-gray-400' : 'text-amber-500 italic'}`}>
                {isExact ? p.unit : `~${p.unit}`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
