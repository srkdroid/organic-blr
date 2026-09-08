import { getAllItems, getProviders } from '@/lib/db'
import { enrichPrices } from '@/lib/providers'
import { PriceApp } from '@/components/PriceApp'
import { createClient } from '@/lib/supabase/server'

// Always fetch fresh data on page load
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  let initialItems = []
  let initialProviders = []
  let currentUser = null

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, avatar_url, role')
        .eq('id', user.id)
        .maybeSingle()

      currentUser = {
        id: user.id,
        email: user.email,
        name: profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email,
        avatar: profile?.avatar_url || user.user_metadata?.avatar_url || null,
        role: profile?.role || 'user',
      }
    }

    const [items, providers] = await Promise.all([
      getAllItems(),
      getProviders(),
    ])
    initialItems     = enrichPrices(items)
    initialProviders = providers
  } catch (err) {
    // DB not yet configured, or first deploy — show empty state gracefully
    console.error('[HomePage] DB prefetch failed:', err.message)
  }

  return (
    <PriceApp
      initialItems={initialItems}
      initialProviders={initialProviders}
      currentUser={currentUser}
    />
  )
}
