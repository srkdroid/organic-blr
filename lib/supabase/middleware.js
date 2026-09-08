import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function updateSession(request) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid running code between createServerClient and supabase.auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Public routes that unauthenticated users can access
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/disabled') ||
    pathname === '/api/scrape' // protected by secret token

  if (!user && !isPublic) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user) {
    // If logged-in user visits /login, redirect to /
    if (pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }

    // Fetch user profile to check is_enabled and role
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_enabled, role')
      .eq('id', user.id)
      .maybeSingle()

    // If profile exists and is_enabled is explicitly false, block access
    if (profile && profile.is_enabled === false) {
      if (pathname !== '/disabled') {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'Account disabled' }, { status: 403 })
        }
        const url = request.nextUrl.clone()
        url.pathname = '/disabled'
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }

    // Protect /admin routes (pages & APIs) - requires role === 'admin'
    if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
      if (!profile || profile.role !== 'admin') {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
      }
    }

    // Asynchronously log visit for HTML page requests (ignore API & assets)
    if (!pathname.startsWith('/api/') && !pathname.startsWith('/disabled') && !pathname.startsWith('/auth/')) {
      const userAgent = request.headers.get('user-agent') || ''
      // Non-blocking visit logging
      supabase
        .from('page_visits')
        .insert({
          user_id: user.id,
          path: pathname,
          user_agent: userAgent.slice(0, 300),
        })
        .then(() => {})
        .catch(() => {})
    }
  }

  return supabaseResponse
}
