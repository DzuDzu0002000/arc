import { db, must } from '../server/db.js'
import { acceptBug, loadBug, loadCampaign, payWithArbiter, transitionBug } from '../server/flows.js'
import { action, badRequest, body, conflict, forbidden, route, uuidParam } from '../server/http.js'
import { adminConflictError, SEVERITIES, type Severity } from '../server/rules.js'
import { requireAdmin } from '../server/session.js'

type Dispute = { id: string; bug_id: string; status: string }
type DisputeRow = { bugs: { tester_account_id: string; campaigns: { owner_account_id: string } | null } | null } & Record<string, unknown>

export default route(['GET', 'POST'], async (req) => {
  const session = await requireAdmin(req)

  if (req.method === 'GET') {
    const resolved = req.query.status === 'resolved'
    const query = db().from('disputes')
      .select('id, reason, status, resolution_note, created_at, resolved_at, bugs(id, title, severity_claimed, severity_final, payout_amount, reject_reason, reject_note, tester_account_id, accounts(display_name), campaigns(id, title, product_name, owner_account_id))')
    const disputes = must(await (resolved
      ? query.in('status', ['upheld', 'dismissed']).order('resolved_at', { ascending: false }).limit(100)
      : query.eq('status', 'open').order('created_at')))
    // Flag disputes this admin is part of; the UI hides the decision buttons and the POST below refuses them.
    return {
      disputes: (disputes as unknown as DisputeRow[]).map((d) => ({
        ...d,
        conflict: d.bugs ? adminConflictError(session.account.id, { campaignOwnerId: d.bugs.campaigns?.owner_account_id ?? '', testerId: d.bugs.tester_account_id }) : null,
      })),
    }
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
  const conflictError = adminConflictError(session.account.id, { campaignOwnerId: campaign.owner_account_id, testerId: bug.tester_account_id })
  if (conflictError) throw forbidden(conflictError)
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
