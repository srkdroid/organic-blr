'use client'
import { PROVIDERS } from '@/lib/providers'

export function StatusBar({ providers }) {
  if (!providers?.length) return null

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 bg-white
                    rounded-xl border border-gray-100 px-3 py-2">
      <span className="text-gray-400 font-medium self-center">Data freshness:</span>
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
  )
}
