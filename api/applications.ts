import { db, must, type ApplicationRow } from '../server/db.js'
import { loadCampaign } from '../server/flows.js'
import { action, badRequest, body, conflict, forbidden, notFound, route, uuidParam } from '../server/http.js'
import { applyError, approveError } from '../server/rules.js'
import { notify } from '../server/notify.js'
import { requireSession } from '../server/session.js'

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

async function loadApplication(id: string) {
  const application = must(await db().from('applications').select('*').eq('id', id).maybeSingle<ApplicationRow>())
  if (!application) throw notFound('Application not found.')
  return application
}

async function setStatus(application: ApplicationRow, from: ApplicationRow['status'][], to: ApplicationRow['status']) {
  if (!from.includes(application.status)) throw conflict('This application can no longer be changed that way.')
  const rows = must(await db().from('applications').update({ status: to, decided_at: new Date().toISOString() })
    .eq('id', application.id).eq('status', application.status).select('id')) as { id: string }[]
  if (!rows.length) throw conflict('This application was just updated. Refresh and try again.')
  if (to === 'approved' || to === 'rejected' || to === 'removed') {
    await notify([application.tester_account_id], `application_${to}`, { campaignId: application.campaign_id })
  }
  return { status: to }
}

export default route(['POST'], async (req) => {
  const session = await requireSession(req)
  const input = body(req)

  const act = action(req)
  if ((act === 'apply' || act === 'withdraw') && session.account.role !== 'tester') throw forbidden('Only tester accounts can apply.')

  switch (act) {
    case 'apply': {
      const campaign = await loadCampaign(uuidParam(input.campaignId, 'campaign'))
      const existing = must(await db().from('applications').select('id').eq('campaign_id', campaign.id)
        .eq('tester_account_id', session.account.id).maybeSingle())
      const error = applyError({
        status: campaign.status, ownerAccountId: campaign.owner_account_id, endsAt: campaign.ends_at, testerSlots: campaign.tester_slots,
      }, session.account.id, Boolean(existing), new Date())
      if (error) throw conflict(error)
      const row = must(await db().from('applications').insert({
        campaign_id: campaign.id, tester_account_id: session.account.id,
        message: text(input.message, 1000), devices: text(input.devices, 300),
      }).select('id, status').single<{ id: string; status: string }>())
      await notify([campaign.owner_account_id], 'application_new', { campaignId: campaign.id })
      return row
    }
    case 'withdraw': {
      const application = await loadApplication(uuidParam(input.id))
      if (application.tester_account_id !== session.account.id) throw forbidden()
      return setStatus(application, ['pending', 'approved'], 'withdrawn')
    }
    case 'approve':
    case 'reject':
    case 'remove': {
      const application = await loadApplication(uuidParam(input.id))
      const campaign = await loadCampaign(application.campaign_id)
      if (campaign.owner_account_id !== session.account.id) throw forbidden('Only the campaign owner can do this.')
      if (action(req) === 'reject') return setStatus(application, ['pending'], 'rejected')
      if (action(req) === 'remove') return setStatus(application, ['approved'], 'removed')
      const { count, error: countError } = await db().from('applications').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id).eq('status', 'approved')
      if (countError) throw new Error(countError.message)
      const error = approveError({
        status: campaign.status, ownerAccountId: campaign.owner_account_id, endsAt: campaign.ends_at, testerSlots: campaign.tester_slots,
      }, application.status, count ?? 0)
      if (error) throw conflict(error)
      return setStatus(application, ['pending'], 'approved')
    }
    default:
      throw badRequest('Unknown action.')
  }
})
