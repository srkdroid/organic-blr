'use client'

import { useState, useMemo, useCallback, useTransition } from 'react'
import { PROVIDERS, PROVIDER_IDS } from '@/lib/providers'
import { PriceTable }   from './PriceTable'
import { CartDrawer }   from './CartDrawer'
import { FilterBar }    from './FilterBar'
import { StatusBar }    from './StatusBar'
import { ScrapeButton } from './ScrapeButton'

export function PriceApp({ initialItems = [], initialProviders = [] }) {
  const [items,     setItems]     = useState(initialItems)
  const [providers, setProviders] = useState(initialProviders)
  const [cart,      setCart]      = useState(new Map())   // master_item_id → item
  const [category,  setCategory]  = useState('All')
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(false)
  const [cartOpen,  setCartOpen]  = useState(false)
  const [,          startTransition] = useTransition()

  // Filtered items based on search + category
  const filtered = useMemo(() => items.filter(item => {
    if (category !== 'All' && item.category !== category) return false
    if (search && !item.canonical_name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [items, category, search])

  // Refresh data from API (called after scrape or manual refresh)
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, provRes] = await Promise.all([
        fetch('/api/items').then(r => r.json()),
        fetch('/api/providers').then(r => r.json()),
      ])
      startTransition(() => {
        if (Array.isArray(itemsRes)) setItems(itemsRes)
        if (Array.isArray(provRes))  setProviders(provRes)
      })
    } catch { /* keep stale data on error */ }
    finally { setLoading(false) }
  }, [])

  const toggleCart = useCallback(item => {
    setCart(prev => {
      const next = new Map(prev)
      if (next.has(item.master_item_id)) {
        next.delete(item.master_item_id)
      } else {
        // Store the item with the selected unit (from PriceTable variant dropdown)
        next.set(item.master_item_id, {
          ...item,
          selectedUnit: item._selectedUnit || null,
        })
      }
      return next
    })
  }, [])

  const updateCartUnit = useCallback((masterItemId, unit) => {
    setCart(prev => {
      if (!prev.has(masterItemId)) return prev
      const next = new Map(prev)
      const existing = next.get(masterItemId)
      next.set(masterItemId, {
        ...existing,
        selectedUnit: unit,
      })
      return next
    })
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 tap-highlight">

      {/* ── Sticky header ───────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">

          {/* Logo */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl flex-shrink-0">🥦</span>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 text-sm leading-tight truncate">
                Organic Bangalore
              </h1>
              <p className="text-xs text-gray-400 hidden sm:block">
                Compare prices · 6 providers
              </p>
            </div>
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <ScrapeButton onComplete={refresh} />
            <button
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh prices"
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500
                         hover:border-emerald-400 active:scale-95 transition-transform"
            >
              {loading ? '…' : '↻'}
            </button>

            {/* Cart button */}
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white
                         text-xs font-medium rounded-lg active:scale-95 transition-transform shadow-sm"
            >
              🛒
              {cart.size > 0 && (
                <span className="bg-white text-emerald-700 rounded-full w-4 h-4 flex items-center
                                 justify-center text-[10px] font-bold leading-none">
                  {cart.size}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Page body ────────────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-3 py-4 space-y-3">

        <StatusBar providers={providers} />

        <FilterBar
          search={search}
          onSearch={setSearch}
          category={category}
          onCategory={setCategory}
          count={filtered.length}
          loading={loading}
        />

        {/* Provider legend — desktop only */}
        <div className="hidden sm:flex flex-wrap gap-3 text-xs text-gray-500">
          {PROVIDER_IDS.map(id => (
            <div key={id} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PROVIDERS[id].color }} />
              <span>{id} — {PROVIDERS[id].name}</span>
            </div>
          ))}
          <span className="ml-auto price-best text-xs">Green = cheapest</span>
          <span className="price-worst text-xs ml-2">Red = priciest</span>
        </div>

        {items.length === 0 && !loading ? (
          <EmptyState />
        ) : (
          <PriceTable items={filtered} cart={cart} onToggle={toggleCart} onUnitChange={updateCartUnit} />
        )}

        <p className="text-xs text-center text-gray-400 pb-6">
          Prices scraped from provider websites · Refreshed twice daily · Totals include 5% GST + delivery
        </p>
      </main>

      {/* ── Cart drawer ──────────────────────────────────────────────────────── */}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onToggle={toggleCart}
      />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-20 px-4">
      <div className="text-5xl mb-4">🌱</div>
      <h2 className="text-lg font-semibold text-gray-600 mb-2">No prices yet</h2>
      <p className="text-gray-400 text-sm max-w-xs mx-auto mb-4">
        Run the scraper on your local machine to populate the database, then prices
        will appear here automatically.
      </p>
      <code className="inline-block bg-gray-100 text-gray-700 text-xs px-3 py-2 rounded-lg">
        npm run scrape:all
      </code>
    </div>
  )
}
