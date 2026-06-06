'use client'
import { useState } from 'react'

export function ScrapeButton({ onComplete }) {
  const [open,    setOpen]    = useState(false)
  const [secret,  setSecret]  = useState('')
  const [loading, setLoading] = useState(false)
  const [msg,     setMsg]     = useState(null)

  async function trigger() {
    setLoading(true)
    setMsg(null)
    try {
      const res  = await fetch('/api/scrape', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ secret }),
      })
      const data = await res.json()
      if (res.ok) {
        setMsg({ ok: true, text: 'Cache cleared!' })
        setTimeout(() => {
          setOpen(false)
          setMsg(null)
          onComplete?.()
        }, 2000)
      } else {
        setMsg({ ok: false, text: data.error || 'Failed' })
      }
    } catch {
      setMsg({ ok: false, text: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Bust cache after running local scraper"
        className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500
                   hover:border-emerald-400 hover:text-emerald-600 active:scale-95 transition-transform"
      >
        🔄
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <input
        type="password"
        value={secret}
        onChange={e => setSecret(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && trigger()}
        placeholder="Secret key"
        autoFocus
        className="w-28 text-xs border border-gray-200 rounded-lg px-2 py-1.5
                   focus:outline-none focus:border-emerald-400"
      />
      <button
        onClick={trigger}
        disabled={loading || !secret}
        className="text-xs px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg
                   disabled:opacity-40 active:scale-95 transition-transform"
      >
        {loading ? '…' : 'Go'}
      </button>
      <button
        onClick={() => { setOpen(false); setMsg(null) }}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        ✕
      </button>
      {msg && (
        <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-500'}`}>
          {msg.text}
        </span>
      )}
    </div>
  )
}
