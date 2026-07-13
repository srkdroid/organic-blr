'use client'
import { useEffect, useState, useMemo } from 'react'
import { PROVIDERS } from '@/lib/providers'

export function CartDrawer({ open, onClose, cart, onToggle }) {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeOpt, setActiveOpt] = useState('single')

  const cartItems = useMemo(
    () => Array.from(cart.entries()).map(([id, item]) => ({
      master_item_id: id,
      quantity: 1,
      unit: item.selectedUnit || null,
    })),
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
      .then(data => {
        setResult(data)
        // Reset to single on new data if current active is no longer valid
        if (data.optimizations && !data.optimizations.find(o => o.id === activeOpt)) {
          setActiveOpt('single')
        }
      })
      .catch(() => setResult(null))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems.map(i => `${i.master_item_id}:${i.unit}`).join(',')])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const optimizations = result?.optimizations || []
  const checkoutUrls  = result?.checkout_urls  || {}
  const activeStrategy = optimizations.find(o => o.id === activeOpt) || optimizations[0]

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
                <span className="text-sm text-gray-700">
                  {item.canonical_name}
                  {item.selectedUnit && (
                    <span className="text-xs text-gray-400 ml-1">({item.selectedUnit})</span>
                  )}
                </span>
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

        {/* Optimization & Totals */}
        {cart.size > 0 && (
          <div className="px-4 py-4 space-y-4">
            {loading && (
              <p className="text-sm text-gray-400 text-center animate-pulse py-4">
                Calculating optimizations…
              </p>
            )}

            {!loading && optimizations.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                No price data available for selected items
              </p>
            )}

            {!loading && optimizations.length > 0 && (
              <>
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Delivery Optimization
                  </h3>
                  
                  {/* Strategy Selector */}
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {optimizations.map(opt => {
                      const isActive = activeOpt === opt.id
                      return (
                        <button
                          key={opt.id}
                          onClick={() => setActiveOpt(opt.id)}
                          className={`flex-shrink-0 text-left p-3 rounded-xl border transition-all ${
                            isActive 
                              ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' 
                              : 'border-gray-200 bg-white hover:border-emerald-300'
                          }`}
                        >
                          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            {opt.label}
                          </div>
                          <div className={`text-lg font-bold ${isActive ? 'text-emerald-700' : 'text-gray-800'}`}>
                            ₹{opt.grand_total}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-1">
                            {opt.provider_count} Deliver{opt.provider_count > 1 ? 'ies' : 'y'}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Active Strategy Breakdown */}
                {activeStrategy && (
                  <div className="space-y-3 mt-4 pt-4 border-t border-gray-100">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Order Breakdown
                    </h3>
                    
                    {activeStrategy.providers.map(pt => {
                      const cfg = PROVIDERS[pt.provider_id]
                      return (
                        <div key={pt.provider_id} className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                          {/* Provider Header */}
                          <div className="bg-white border-b border-gray-100 px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg?.color }} />
                              <span className="text-sm font-semibold text-gray-800">{cfg?.name}</span>
                            </div>
                            <span className="font-bold text-gray-800">₹{pt.grand_total}</span>
                          </div>
                          
                          {/* Items List */}
                          <div className="px-3 py-2 space-y-1">
                            {pt.items.map(i => (
                              <div key={i.master_item_id} className="flex justify-between text-xs text-gray-600">
                                <span>{i.qty}x {i.name}</span>
                                <span>₹{i.total}</span>
                              </div>
                            ))}
                          </div>

                          {/* Subtotals */}
                          <div className="px-3 py-2 bg-gray-100/50 border-t border-gray-100 text-[10px] text-gray-500 flex justify-between">
                            <span>Items: ₹{pt.items_subtotal} | Del: {pt.delivery_applied > 0 ? `₹${pt.delivery_applied}` : 'Free'} | GST: ₹{pt.gst_amount}</span>
                          </div>

                          {/* Checkout / Shop button */}
                          <div className="px-3 py-2 border-t border-gray-100">
                            {checkoutUrls[pt.provider_id] ? (
                              <a
                                href={checkoutUrls[pt.provider_id]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1.5 w-full text-xs font-semibold
                                           px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700
                                           text-white transition-colors"
                              >
                                🛒 Checkout with {cfg?.name} →
                              </a>
                            ) : (
                              <a
                                href={`https://${cfg?.url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1.5 w-full text-xs font-medium
                                           px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200
                                           text-gray-600 transition-colors"
                              >
                                Shop on {cfg?.name} ↗
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                
                {activeStrategy?.unfulfilled_count > 0 && (
                   <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                     <p className="text-xs text-amber-700 font-semibold mb-2">
                       ⚠ {activeStrategy.unfulfilled_count} item{activeStrategy.unfulfilled_count > 1 ? 's' : ''} unavailable in this combination:
                     </p>
                     <ul className="space-y-2">
                       {activeStrategy.unfulfilled_items?.map((item, idx) => {
                         const itemName = typeof item === 'string' ? item : item.name
                         const unit     = typeof item === 'object' ? item.unit : null
                         const available = typeof item === 'object' ? (item.availableAt || []) : []
                         return (
                           <li key={idx} className="text-[11px]">
                             <span className="text-amber-700 font-medium">
                               {itemName}{unit ? ` (${unit})` : ''}
                             </span>
                             {available.length > 0 ? (
                               <span className="block text-[10px] text-amber-600 mt-0.5">
                                 Available at: {available.join(' · ')}
                               </span>
                             ) : (
                               <span className="block text-[10px] text-amber-500 mt-0.5 italic">
                                 Not available at any provider with this size
                               </span>
                             )}
                           </li>
                         )
                       })}
                     </ul>
                     {activeStrategy.unfulfilled_count > (activeStrategy.unfulfilled_items?.length || 0) && (
                       <p className="text-[10px] text-amber-600 mt-1 italic">
                         *Some providers in this combination may also have failed their minimum order requirement.
                       </p>
                     )}
                   </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
