import { db, must } from '../server/db.js'
import { action, badRequest, body, route } from '../server/http.js'
import { requireSession } from '../server/session.js'

const LIMIT = 30

export default route(['GET', 'POST'], async (req) => {
  const session = await requireSession(req)
  const mine = () => db().from('notifications').select('id', { count: 'exact', head: true }).eq('account_id', session.account.id).is('read_at', null)

  if (req.method === 'GET') {
    const [items, unread] = await Promise.all([
      db().from('notifications')
        .select('id, kind, campaign_id, bug_id, created_at, read_at, campaigns(title, title_en, product_name), bugs(title)')
        .eq('account_id', session.account.id).order('created_at', { ascending: false }).limit(LIMIT),
      mine(),
    ])
    if (unread.error) throw new Error(unread.error.message)
    return { notifications: must(items), unread: unread.count ?? 0 }
  }

  // POST ?action=read with { ids } marks those read; without ids, marks everything read.
  if (action(req) !== 'read') throw badRequest('Unknown action.')
  const input = body(req)
  const ids = Array.isArray(input.ids) ? input.ids.filter((id): id is string => typeof id === 'string').slice(0, 100) : null
  let query = db().from('notifications').update({ read_at: new Date().toISOString() }).eq('account_id', session.account.id).is('read_at', null)
  if (ids) query = query.in('id', ids)
  must(await query)
  const unread = await mine()
  return { unread: unread.count ?? 0 }
})
