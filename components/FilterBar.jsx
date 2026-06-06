'use client'
import { CATEGORIES } from '@/lib/providers'

export function FilterBar({ search, onSearch, category, onCategory, count, loading }) {
  return (
    <div className="space-y-2">
      <input
        type="search"
        value={search}
        onChange={e => onSearch(e.target.value)}
        placeholder="Search… tomato, banana, palak"
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white
                   focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent
                   placeholder:text-gray-400"
      />

      {/* Horizontally scrollable category pills on mobile */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-3 px-3">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => onCategory(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border
                        transition-all active:scale-95
              ${category === cat
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'border-gray-200 text-gray-500 bg-white hover:border-emerald-400'
              }`}
          >
            {cat}
          </button>
        ))}
        <span className="flex-shrink-0 self-center text-xs text-gray-400 pr-1">
          {loading ? '…' : `${count} items`}
        </span>
      </div>
    </div>
  )
}
