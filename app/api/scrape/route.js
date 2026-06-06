import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { secret } = await request.json()

    if (!process.env.SCRAPE_TRIGGER_SECRET || secret !== process.env.SCRAPE_TRIGGER_SECRET) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // Bust the ISR cache so the next visitor gets fresh data immediately
    revalidatePath('/api/items')
    revalidatePath('/api/providers')
    revalidatePath('/')

    return Response.json({
      ok: true,
      message: 'Cache cleared. Fresh data will appear on next page load.',
    })
  } catch (err) {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }
}
