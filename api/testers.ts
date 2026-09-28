import { db, must } from '../server/db.js'
import { testerProfiles } from '../server/flows.js'
import { notFound, route, uuidParam } from '../server/http.js'
import { requireSession } from '../server/session.js'

type Rating = { stars: number; comment: string | null; created_at: string; campaigns: { product_name: string } | null }

/** A tester's public track record: what projects look at before approving an application. */
export default route(['GET'], async (req) => {
  await requireSession(req)
  const id = uuidParam(req.query.id)
  const account = must(await db().from('accounts').select('id, display_name, role, created_at').eq('id', id)
    .maybeSingle<{ id: string; display_name: string; role: string | null; created_at: string }>())
  if (!account || account.role !== 'tester') throw notFound('Tester not found.')
  const [profiles, ratings] = await Promise.all([
    testerProfiles([id]),
    db().from('tester_ratings').select('stars, comment, created_at, campaigns(product_name)')
      .eq('tester_account_id', id).order('created_at', { ascending: false }).limit(20),
  ])
  return {
    tester: { id: account.id, displayName: account.display_name, memberSince: account.created_at },
    profile: profiles.get(id),
    ratings: must(ratings) as unknown as Rating[],
  }
})
