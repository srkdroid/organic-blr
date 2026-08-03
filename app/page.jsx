import { getAllItems, getProviders } from '@/lib/db'
import { enrichPrices } from '@/lib/providers'
import { PriceApp } from '@/components/PriceApp'

// Always fetch fresh data on page load
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  let initialItems = []
  let initialProviders = []

  try {
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
    />
  )
}
