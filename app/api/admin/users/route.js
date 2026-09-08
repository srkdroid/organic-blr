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
      const { rows } = await client.query(`
        SELECT id, email, full_name, avatar_url, role, is_enabled, created_at, last_sign_in_at
        FROM user_profiles
        ORDER BY created_at DESC
      `)
      return Response.json(rows)
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[API /admin/users GET]', err)
    return Response.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const supabase = createClient()
    const adminUser = await checkAdmin(supabase)
    if (!adminUser) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId, isEnabled } = await request.json()
    if (!userId || typeof isEnabled !== 'boolean') {
      return Response.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    // Prevent admin from disabling themselves
    if (userId === adminUser.id && !isEnabled) {
      return Response.json({ error: 'Cannot disable your own admin account' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('UPDATE user_profiles SET is_enabled = $1 WHERE id = $2', [isEnabled, userId])
      return Response.json({ success: true, isEnabled })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[API /admin/users PATCH]', err)
    return Response.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
