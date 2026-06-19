'use client'
import { PROVIDERS } from '@/lib/providers'

export function StatusBar({ providers }) {
  if (!providers?.length) return null

  // Find the most recent successful scrape across all providers
  const mostRecent = providers.reduce((latest, p) => {
    if (!p.last_scraped_at) return latest;
    const date = new Date(p.last_scraped_at);
    return date > latest ? date : latest;
  }, new Date(0));

  let lastUpdatedStr = "Never";
  if (mostRecent.getTime() > 0) {
    const isToday = new Date().toDateString() === mostRecent.toDateString();
    const timeStr = mostRecent.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    lastUpdatedStr = isToday ? `Today at ${timeStr}` : `${mostRecent.toLocaleDateString()} at ${timeStr}`;
  }

  return (
    <div className="space-y-3">
      {/* Overall Last Updated Badge */}
      <div className="flex items-center">
        <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-200 text-xs font-semibold shadow-sm flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Prices last updated: {lastUpdatedStr}
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
