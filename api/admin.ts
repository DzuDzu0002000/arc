import { db, must } from '../server/db.js'
import { acceptBug, loadBug, loadCampaign, payWithArbiter, transitionBug } from '../server/flows.js'
import { action, badRequest, body, conflict, route, uuidParam } from '../server/http.js'
import { SEVERITIES, type Severity } from '../server/rules.js'
import { requireAdmin } from '../server/session.js'

type Dispute = { id: string; bug_id: string; status: string }

export default route(['GET', 'POST'], async (req) => {
  const session = await requireAdmin(req)

  if (req.method === 'GET') {
    const disputes = must(await db().from('disputes')
      .select('id, reason, status, created_at, bugs(id, title, severity_claimed, reject_reason, reject_note, campaigns(id, title, product_name))')
      .eq('status', 'open').order('created_at'))
    return { disputes }
  }

  const input = body(req)
  if (action(req) !== 'resolve-dispute') throw badRequest('Unknown action.')
  const dispute = must(await db().from('disputes').select('id, bug_id, status').eq('id', uuidParam(input.id)).maybeSingle<Dispute>())
  if (!dispute || dispute.status !== 'open') throw conflict('This dispute is already resolved.')
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 2000) : null
  const upheld = input.decision === 'upheld'
  if (!upheld && input.decision !== 'dismissed') throw badRequest('Decide upheld or dismissed.')

  const bug = await loadBug(dispute.bug_id)
  const campaign = await loadCampaign(bug.campaign_id)
  if (upheld) {
    const severity = (SEVERITIES.includes(input.severity as Severity) ? input.severity : bug.severity_claimed) as Severity
    const accepted = await acceptBug(bug, campaign, severity, 'admin')
    await payWithArbiter(accepted, campaign)
  } else {
    await transitionBug(bug, 'resolve_dismissed')
  }
  must(await db().from('disputes').update({
    status: upheld ? 'upheld' : 'dismissed', resolved_by: session.account.id, resolution_note: note, resolved_at: new Date().toISOString(),
  }).eq('id', dispute.id))
  return { status: upheld ? 'upheld' : 'dismissed' }
})
