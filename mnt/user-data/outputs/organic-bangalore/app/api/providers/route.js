import { getProviders } from '@/lib/db'

export const revalidate = 300  // cache for 5 minutes

export async function GET() {
  try {
    const providers = await getProviders()
    return Response.json(providers)
  } catch (err) {
    console.error('[API /providers]', err.message)
    return Response.json({ error: 'Failed to load providers' }, { status: 500 })
  }
}
