import { getAllItems, getProviders } from '@/lib/db'
import { enrichPrices } from '@/lib/providers'
import { PriceApp } from '@/components/PriceApp'

// Revalidate every 10 minutes via ISR — fresh enough given twice-daily scrapes
export const revalidate = 600

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
