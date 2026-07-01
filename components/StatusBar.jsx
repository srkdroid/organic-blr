'use client'
import { useState, useEffect } from 'react'
import { PROVIDERS } from '@/lib/providers'

export function StatusBar({ providers }) {
  const [lastUpdatedStr, setLastUpdatedStr] = useState(null)

  // Find the most recent successful scrape across all providers
  const mostRecent = (providers || []).reduce((latest, p) => {
    if (!p.last_scraped_at) return latest;
    const date = new Date(p.last_scraped_at);
    return date > latest ? date : latest;
  }, new Date(0));

  const isStale = mostRecent.getTime() === 0 ||
    (Date.now() - mostRecent.getTime()) > 12 * 60 * 60 * 1000

  // Compute the human-readable time string client-side only to avoid
  // server/client locale mismatch (hydration error)
  useEffect(() => {
    if (mostRecent.getTime() === 0) {
      setLastUpdatedStr('Never')
      return
    }
    const isToday = new Date().toDateString() === mostRecent.toDateString()
    const timeStr = mostRecent.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    setLastUpdatedStr(isToday ? `Today at ${timeStr}` : `${mostRecent.toLocaleDateString()} at ${timeStr}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostRecent.getTime()])

  if (!providers?.length) return null

  return (
    <div className="space-y-3">
      {/* Overall Last Updated Badge */}
      <div className="flex items-center">
        <span className={`px-3 py-1.5 rounded-full border text-xs font-semibold shadow-sm flex items-center gap-1.5
          ${isStale
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}>
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75
              ${isStale ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2
              ${isStale ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
          </span>
          {isStale ? '⚠ ' : ''}Prices last updated: {lastUpdatedStr}
        </span>
      </div>

      {/* Per-provider freshness */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 bg-white
                      rounded-xl border border-gray-100 px-3 py-2 shadow-sm">
        <span className="text-gray-400 font-medium self-center">Provider sync:</span>
        {providers.map(p => {
          const cfg   = PROVIDERS[p.id]
          const ago   = p.last_scraped_at
            ? Math.round((Date.now() - new Date(p.last_scraped_at)) / 60000)
            : null
          const fresh = ago !== null && ago < 720   // under 12 hours = green

          return (
            <div key={p.id} className="flex items-center gap-1">
              <div
                className={`w-1.5 h-1.5 rounded-full`}
                style={{ backgroundColor: ago === null ? '#d1d5db' : fresh ? '#22c55e' : '#f59e0b' }}
              />
              <span className="font-medium" style={{ color: cfg?.color }}>{p.id}</span>
              <span className={fresh ? 'text-emerald-600' : 'text-amber-500'}>
                {ago === null
                  ? 'never'
                  : ago < 60
                    ? `${ago}m ago`
                    : `${Math.round(ago / 60)}h ago`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
