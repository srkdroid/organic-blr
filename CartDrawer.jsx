'use client'
import { useEffect, useState, useMemo } from 'react'
import { PROVIDERS, GST_RATE } from '@/lib/providers'

export function CartDrawer({ open, onClose, cart, onToggle }) {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)

  const cartItems = useMemo(
    () => Array.from(cart.keys()).map(id => ({ master_item_id: id, quantity: 1 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart.size, Array.from(cart.keys()).join(',')]
  )

  // Fetch totals from API whenever cart changes
  useEffect(() => {
    if (cartItems.length === 0) { setResult(null); return }
    setLoading(true)
    fetch('/api/cart', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ items: cartItems }),
    })
      .then(r => r.json())
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems.map(i => i.master_item_id).join(',')])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const totals       = result?.provider_totals || []
  const checkoutUrls = result?.checkout_urls   || {}
  const cheapest     = totals[0]

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer panel */}
      <div className={`fixed z-50 bg-white shadow-2xl transition-transform duration-300 ease-out
        bottom-0 left-0 right-0 rounded-t-2xl max-h-[85vh] overflow-y-auto
        md:bottom-auto md:top-0 md:right-0 md:left-auto md:h-full md:w-96
        md:rounded-none md:rounded-l-2xl
        ${open
          ? 'translate-y-0 md:translate-x-0'
          : 'translate-y-full md:translate-y-0 md:translate-x-full'
        }`}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100
                        sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-gray-800">
            🛒 Basket
            {cart.size > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                {cart.size} item{cart.size !== 1 ? 's' : ''}
              </span>
            )}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl p-1">
            ✕
          </button>
        </div>

        {/* Empty basket */}
        {cart.size === 0 && (
          <div className="text-center py-16 px-6">
            <div className="text-4xl mb-3">🧺</div>
            <p className="text-gray-400 text-sm">
              Tap any item in the list to add it to your basket
            </p>
          </div>
        )}

        {/* Selected items */}
        {cart.size > 0 && (
          <div className="px-4 py-3 space-y-1 border-b border-gray-100">
            {Array.from(cart.values()).map(item => (
              <div key={item.master_item_id}
                   className="flex items-center justify-between py-1.5">
                <span className="text-sm text-gray-700">{item.canonical_name}</span>
                <button
                  onClick={() => onToggle(item)}
                  className="text-xs text-red-400 hover:text-red-600 ml-3 flex-shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Totals */}
        {cart.size > 0 && (
          <div className="px-4 py-4 space-y-3">
            {loading && (
              <p className="text-sm text-gray-400 text-center animate-pulse py-4">
                Calculating…
              </p>
            )}

            {!loading && totals.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                No price data available for selected items
              </p>
            )}

            {!loading && totals.length > 0 && (
              <>
                {/* Best option highlight */}
                {cheapest && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <p className="text-xs text-emerald-600 font-medium mb-0.5">Cheapest option</p>
                    <p className="text-2xl font-bold text-emerald-700">
                      ₹{cheapest.grand_total}
                      <span className="text-sm font-normal text-emerald-600 ml-1.5">
                        via {PROVIDERS[cheapest.provider_id]?.name}
                      </span>
                    </p>
                    <p className="text-xs text-emerald-600 mt-0.5">
                      ₹{cheapest.items_subtotal} items
                      {cheapest.delivery_applied > 0
                        ? ` + ₹${cheapest.delivery_applied} delivery`
                        : ' + free delivery'}
                      {` + ₹${cheapest.gst_amount} GST (5%)`}
                    </p>
                  </div>
                )}

                {/* All providers */}
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">
                  All providers
                </h3>
                <div className="space-y-2">
                  {totals.map((pt, i) => {
                    const cfg         = PROVIDERS[pt.provider_id]
                    const checkoutUrl = checkoutUrls[pt.provider_id]
                    const shopUrl     = `https://${cfg?.url}`
                    return (
                      <div key={pt.provider_id}
                        className={`rounded-xl border p-3
                          ${i === 0
                            ? 'border-emerald-300 bg-emerald-50'
                            : 'border-gray-100 bg-gray-50'}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full flex-shrink-0"
                                 style={{ backgroundColor: cfg?.color }} />
                            <span className="text-xs font-medium text-gray-700">
                              {cfg?.name}
                            </span>
                            {i === 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100
                                               text-emerald-700 rounded-full font-semibold">
                                Best
                              </span>
                            )}
                          </div>
                          <span className="font-bold text-gray-800 tabular-nums">
                            ₹{pt.grand_total}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 flex gap-2 flex-wrap">
                          <span>Items: ₹{pt.items_subtotal}</span>
                          <span>
                            Del: {pt.delivery_applied > 0 ? `₹${pt.delivery_applied}` : 'Free'}
                          </span>
                          <span>GST: ₹{pt.gst_amount}</span>
                        </div>
                        {pt.items_missing > 0 && (
                          <p className="text-[10px] text-amber-600 mt-0.5">
                            ⚠ {pt.items_missing} item{pt.items_missing !== 1 ? 's' : ''} unavailable
                          </p>
                        )}

                        {/* Checkout / Shop button */}
                        <div className="mt-2">
                          {checkoutUrl ? (
                            <a
                              href={checkoutUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold
                                         px-3 py-1.5 rounded-lg transition-colors
                                         bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              Checkout with {cfg?.name} →
                            </a>
                          ) : (
                            <a
                              href={shopUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium
                                         px-3 py-1.5 rounded-lg transition-colors
                                         bg-gray-100 hover:bg-gray-200 text-gray-600"
                            >
                              Shop on {cfg?.name} ↗
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <p className="text-[10px] text-gray-400 text-center pt-1">
                  Totals include 5% GST + applicable delivery charges
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
