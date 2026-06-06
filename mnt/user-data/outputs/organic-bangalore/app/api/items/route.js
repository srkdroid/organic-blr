import { getAllItems } from '@/lib/db'
import { enrichPrices } from '@/lib/providers'

export const revalidate = 600  // cache for 10 minutes

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || null
    const q        = searchParams.get('q') || null

    let items = await getAllItems(category)
    items = enrichPrices(items)

    if (q) {
      const lower = q.toLowerCase()
      items = items.filter(i => i.canonical_name.toLowerCase().includes(lower))
    }

    return Response.json(items)
  } catch (err) {
    console.error('[API /items]', err.message)
    return Response.json({ error: 'Failed to load items' }, { status: 500 })
  }
}
