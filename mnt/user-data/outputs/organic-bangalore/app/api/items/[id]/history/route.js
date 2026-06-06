import { getPriceHistory } from '@/lib/db'

export const revalidate = 600

export async function GET(request, { params }) {
  try {
    const id   = parseInt(params.id)
    const days = parseInt(new URL(request.url).searchParams.get('days') || '30')

    if (isNaN(id)) {
      return Response.json({ error: 'Invalid item id' }, { status: 400 })
    }

    const history = await getPriceHistory(id, Math.min(days, 90))
    return Response.json({ master_item_id: id, days, history })
  } catch (err) {
    console.error('[API /items/[id]/history]', err.message)
    return Response.json({ error: 'Failed to load history' }, { status: 500 })
  }
}
