import { createClient } from '@/lib/supabase/server'
import { Pool } from 'pg'

export const dynamic = 'force-dynamic'

const DATABASE_URL = process.env.DATABASE_URL
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes('supabase.com') ? { rejectUnauthorized: false } : false,
})

async function checkAdmin(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const client = await pool.connect()
  try {
    const { rows } = await client.query('SELECT role FROM user_profiles WHERE id = $1', [user.id])
    if (rows[0]?.role === 'admin') {
      return user
    }
    return null
  } finally {
    client.release()
  }
}

export async function GET() {
  try {
    const supabase = createClient()
    const adminUser = await checkAdmin(supabase)
    if (!adminUser) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const client = await pool.connect()
    try {
      // 1. Overview counts
      const { rows: totalVisitsRow } = await client.query('SELECT COUNT(*) AS total FROM page_visits')
      const { rows: todayVisitsRow } = await client.query(
        "SELECT COUNT(*) AS today FROM page_visits WHERE visited_at >= CURRENT_DATE"
      )
      const { rows: totalUsersRow } = await client.query('SELECT COUNT(*) AS total FROM user_profiles')
      const { rows: activeUsersTodayRow } = await client.query(
        "SELECT COUNT(DISTINCT user_id) AS active FROM page_visits WHERE visited_at >= CURRENT_DATE AND user_id IS NOT NULL"
      )

      // 2. Last 7 days trend
      const { rows: trendRows } = await client.query(`
        SELECT TO_CHAR(visited_at, 'YYYY-MM-DD') AS day, COUNT(*) AS count
        FROM page_visits
        WHERE visited_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY day
        ORDER BY day ASC
      `)

      // 3. Top paths
      const { rows: topPathsRows } = await client.query(`
        SELECT path, COUNT(*) AS visits
        FROM page_visits
        GROUP BY path
        ORDER BY visits DESC
        LIMIT 5
      `)

      // 4. Recent visits with user info
      const { rows: recentVisitsRows } = await client.query(`
        SELECT pv.id, pv.path, pv.visited_at, pv.user_agent, up.email, up.full_name
        FROM page_visits pv
        LEFT JOIN user_profiles up ON pv.user_id = up.id
        ORDER BY pv.visited_at DESC
        LIMIT 25
      `)

      return Response.json({
        overview: {
          totalVisits: parseInt(totalVisitsRow[0]?.total || 0),
          todayVisits: parseInt(todayVisitsRow[0]?.today || 0),
          totalUsers: parseInt(totalUsersRow[0]?.total || 0),
          activeUsersToday: parseInt(activeUsersTodayRow[0]?.active || 0),
        },
        trend: trendRows,
        topPaths: topPathsRows,
        recentVisits: recentVisitsRows,
      })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[API /admin/stats GET]', err)
    return Response.json({ error: 'Failed to fetch statistics' }, { status: 500 })
  }
}
