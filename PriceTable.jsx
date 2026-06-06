'use client'
import { PROVIDERS, PROVIDER_IDS, CAT_COLORS } from '@/lib/providers'

export function PriceTable({ items, cart, onToggle }) {
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
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-8 px-3 py-3" />
              <th className="px-3 py-3 text-left font-medium text-gray-500 text-xs w-44">Item</th>
              {PROVIDER_IDS.map(id => (
                <th key={id} className="px-2 py-3 text-right text-xs font-semibold"
                    style={{ color: PROVIDERS[id].color }}>
                  {id}
                </th>
              ))}
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500">Best</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <DesktopRow key={item.master_item_id} item={item} cart={cart} onToggle={onToggle} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {items.map(item => (
          <MobileCard key={item.master_item_id} item={item} cart={cart} onToggle={onToggle} />
        ))}
      </div>
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPriceMap(item) {
  const map = {}
  for (const p of item.prices || []) {
    if (p.available && p.price) map[p.provider_id] = p
  }
  return map
}

function getBestWorst(priceMap) {
  const vals = Object.values(priceMap).map(p => p.price)
  if (!vals.length) return { best: null, worst: null }
  return { best: Math.min(...vals), worst: Math.max(...vals) }
}

// ── Desktop row ───────────────────────────────────────────────────────────────

function DesktopRow({ item, cart, onToggle }) {
  const priceMap       = getPriceMap(item)
  const { best, worst } = getBestWorst(priceMap)
  const inCart         = cart.has(item.master_item_id)
  const bestProviderId = Object.entries(priceMap).find(([, p]) => p.price === best)?.[0]
  const catColor       = CAT_COLORS[item.category] || CAT_COLORS.Unknown

  return (
    <tr
      onClick={() => onToggle(item)}
      className={`border-b border-gray-100 cursor-pointer transition-colors
        ${inCart ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
    >
      <td className="px-3 py-2.5 text-center">
        <input
          type="checkbox"
          checked={inCart}
          onChange={() => onToggle(item)}
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
      {PROVIDER_IDS.map(id => {
        const p = priceMap[id]
        if (!p) return <td key={id} className="px-2 py-2.5 text-right price-na">—</td>
        const cls = p.price === best
          ? 'price-best'
          : p.price === worst && best !== worst
          ? 'price-worst'
          : 'text-gray-700'
        return (
          <td key={id} className={`px-2 py-2.5 text-right tabular-nums ${cls}`}>
            <div>₹{p.price}</div>
            <div className="text-xs text-gray-400 font-normal">{p.unit}</div>
          </td>
        )
      })}
      <td className="px-3 py-2.5 text-right">
        {best ? (
          <>
            <div className="font-semibold text-emerald-700 tabular-nums">₹{best}</div>
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

function MobileCard({ item, cart, onToggle }) {
  const priceMap        = getPriceMap(item)
  const { best, worst } = getBestWorst(priceMap)
  const inCart          = cart.has(item.master_item_id)
  const catColor        = CAT_COLORS[item.category] || CAT_COLORS.Unknown

  return (
    <div
      onClick={() => onToggle(item)}
      className={`rounded-xl border p-3 cursor-pointer transition-all active:scale-[0.99]
        ${inCart ? 'border-emerald-400 bg-emerald-50 shadow-sm' : 'border-gray-200 bg-white'}`}
    >
      {/* Item header */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="checkbox"
            checked={inCart}
            onChange={() => onToggle(item)}
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
        {best && (
          <div className="text-right flex-shrink-0">
            <div className="text-xs text-gray-400">Best</div>
            <div className="font-bold text-emerald-700 tabular-nums text-sm">₹{best}</div>
          </div>
        )}
      </div>

      {/* Price grid — 3 columns */}
      <div className="grid grid-cols-3 gap-1.5">
        {PROVIDER_IDS.map(id => {
          const p       = priceMap[id]
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
              <div className="text-[9px] text-gray-400 truncate">{p.unit}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
