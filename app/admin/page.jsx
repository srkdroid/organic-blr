'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState({})

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [usersRes, statsRes] = await Promise.all([
        fetch('/api/admin/users').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/admin/stats').then((r) => (r.ok ? r.json() : null)),
      ])
      setUsers(Array.isArray(usersRes) ? usersRes : [])
      setStats(statsRes)
    } catch (err) {
      console.error('Failed to load admin data:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleUserStatus = async (userId, currentStatus) => {
    const newStatus = !currentStatus
    setActionLoading((prev) => ({ ...prev, [userId]: true }))

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isEnabled: newStatus }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        alert(errorData.error || 'Failed to update user')
        return
      }

      // Optimistically update list
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_enabled: newStatus } : u))
      )
    } catch (err) {
      alert('Error updating user status')
    } finally {
      setActionLoading((prev) => ({ ...prev, [userId]: false }))
    }
  }

  const filteredUsers = users.filter((u) => {
    const term = search.toLowerCase()
    return (
      u.email?.toLowerCase().includes(term) ||
      u.full_name?.toLowerCase().includes(term)
    )
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              ← Back to Prices
            </Link>
            <h1 className="font-bold text-gray-900 text-sm sm:text-base flex items-center gap-1.5">
              <span>⚙️</span> Admin Console
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-emerald-400 bg-white"
            >
              {loading ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 space-x-6">
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'users'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            👥 User Management ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'stats'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📊 Visit Analytics
          </button>
        </div>

        {/* TAB 1: USERS */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search user by name or email..."
                className="w-full sm:w-72 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <span className="text-xs text-gray-500">
                Default for new users is <strong>Enabled</strong>. Toggle to disable immediately.
              </span>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-gray-50 text-gray-600 uppercase text-[11px] tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Joined</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading && users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-10 text-gray-400">
                          Loading users...
                        </td>
                      </tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-10 text-gray-400">
                          No users found matching "{search}"
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const isPending = !!actionLoading[u.id]
                        return (
                          <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                {u.avatar_url ? (
                                  <img
                                    src={u.avatar_url}
                                    alt=""
                                    className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                    {(u.full_name || u.email || 'U')[0].toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="font-medium text-gray-900 truncate">
                                    {u.full_name || 'No Name'}
                                  </div>
                                  <div className="text-gray-500 text-xs truncate">{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                  u.role === 'admin'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {u.role}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-gray-500 text-xs">
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4">
                              {u.is_enabled ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-xs font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded-md text-xs font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                                  Disabled
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => toggleUserStatus(u.id, u.is_enabled)}
                                disabled={isPending || u.role === 'admin'}
                                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                                  u.role === 'admin'
                                    ? 'opacity-40 cursor-not-allowed bg-gray-100 text-gray-400'
                                    : u.is_enabled
                                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                }`}
                              >
                                {isPending ? 'Updating...' : u.is_enabled ? 'Disable' : 'Enable'}
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: STATS */}
        {activeTab === 'stats' && stats && (
          <div className="space-y-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Page Visits
                </div>
                <div className="mt-1 text-2xl font-bold text-gray-900">
                  {stats.overview.totalVisits.toLocaleString()}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Visits Today
                </div>
                <div className="mt-1 text-2xl font-bold text-emerald-600">
                  {stats.overview.todayVisits.toLocaleString()}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Registered Users
                </div>
                <div className="mt-1 text-2xl font-bold text-gray-900">
                  {stats.overview.totalUsers.toLocaleString()}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Active Users Today
                </div>
                <div className="mt-1 text-2xl font-bold text-blue-600">
                  {stats.overview.activeUsersToday.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Top Visited Pages & Trend */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Daily Trend */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold text-gray-800">Visits (Last 7 Days)</h3>
                {stats.trend.length === 0 ? (
                  <p className="text-xs text-gray-400 py-6 text-center">No trend data yet</p>
                ) : (
                  <div className="space-y-2">
                    {stats.trend.map((t) => (
                      <div key={t.day} className="flex items-center justify-between text-xs">
                        <span className="text-gray-600">{t.day}</span>
                        <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          {t.count} visits
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Paths */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold text-gray-800">Most Visited Pages</h3>
                {stats.topPaths.length === 0 ? (
                  <p className="text-xs text-gray-400 py-6 text-center">No page views recorded yet</p>
                ) : (
                  <div className="space-y-2">
                    {stats.topPaths.map((p) => (
                      <div key={p.path} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-gray-700">{p.path}</span>
                        <span className="font-semibold text-gray-900">{p.visits} views</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Visits Log */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 font-semibold text-sm text-gray-800">
                Recent Visit Activity
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider border-b border-gray-100">
                    <tr>
                      <th className="py-2.5 px-4">User</th>
                      <th className="py-2.5 px-4">Path</th>
                      <th className="py-2.5 px-4">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.recentVisits.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center py-6 text-gray-400">
                          No recent visits
                        </td>
                      </tr>
                    ) : (
                      stats.recentVisits.map((v) => (
                        <tr key={v.id} className="hover:bg-gray-50">
                          <td className="py-2 px-4 text-gray-800 font-medium">
                            {v.email || 'Anonymous'}
                          </td>
                          <td className="py-2 px-4 font-mono text-gray-600">{v.path}</td>
                          <td className="py-2 px-4 text-gray-400">
                            {new Date(v.visited_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
