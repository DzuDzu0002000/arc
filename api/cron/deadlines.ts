import crypto from 'node:crypto'
import { db, must, type BugRow, type CampaignRow } from '../../server/db.js'
import { env } from '../../server/env.js'
import { acceptBug, loadCampaign, payWithArbiter, transitionBug } from '../../server/flows.js'
import { route, unauthorized } from '../../server/http.js'
import { OWNER_SIGN_TIMEOUT_HOURS } from '../../server/rules.js'
import { withEnglish } from '../../server/translate.js'

// Each arbiter payout waits for its receipt, so cap the work per run; the next hourly run picks up the rest.
const MAX_PAYOUTS_PER_RUN = 15

function authorized(header: string | undefined) {
  const expected = Buffer.from(`Bearer ${env.cronSecret()}`)
  const actual = Buffer.from(header || '')
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

export default route(['GET'], async (req) => {
  if (!authorized(req.headers.authorization)) throw unauthorized('Invalid cron secret.')
  const now = new Date().toISOString()
  const report = { autoAccepted: 0, paid: 0, finalizedRejections: 0, closedCampaigns: 0, translated: 0, errors: 0 }
  const campaigns = new Map<string, CampaignRow>()
  const campaignFor = async (id: string) => {
    if (!campaigns.has(id)) campaigns.set(id, await loadCampaign(id))
    return campaigns.get(id) as CampaignRow
  }

  // 1. Owner missed the response deadline: accept at the severity the tester reported.
  const overdue = must(await db().from('bugs').select('*').eq('status', 'submitted').lt('response_due_at', now).limit(50)) as BugRow[]
  const toPay: BugRow[] = []
  for (const bug of overdue) {
    try {
      toPay.push(await acceptBug(bug, await campaignFor(bug.campaign_id), bug.severity_claimed, 'timeout'))
      report.autoAccepted++
    } catch (error) {
      report.errors++
      console.error('ARCHUNT_CRON_AUTO_ACCEPT', bug.id, error)
    }
  }

  // 2. Accepted but the owner never signed the payout: the arbiter pays from escrow.
  const signCutoff = new Date(Date.now() - OWNER_SIGN_TIMEOUT_HOURS * 3_600_000).toISOString()
  const unsigned = must(await db().from('bugs').select('*').eq('status', 'accepted').lt('decided_at', signCutoff).limit(MAX_PAYOUTS_PER_RUN)) as BugRow[]
  for (const bug of [...toPay, ...unsigned].slice(0, MAX_PAYOUTS_PER_RUN)) {
    try {
      await payWithArbiter(bug, await campaignFor(bug.campaign_id))
      report.paid++
    } catch (error) {
      report.errors++
      console.error('ARCHUNT_CRON_PAYOUT', bug.id, error)
    }
  }

  // 3. Dispute window passed without a dispute.
  const expired = must(await db().from('bugs').select('*').eq('status', 'rejected').lt('dispute_due_at', now).limit(200)) as BugRow[]
  for (const bug of expired) {
    try { await transitionBug(bug, 'finalize_reject'); report.finalizedRejections++ } catch { /* changed meanwhile */ }
  }

  // 4. Campaigns past their end date stop taking bugs.
  const closed = must(await db().from('campaigns').update({ status: 'closed', closed_at: now })
    .eq('status', 'open').lt('ends_at', now).select('id')) as { id: string }[]
  report.closedCampaigns = closed.length

  // 5. Machine-translate campaigns still missing English (created before auto-translation, or the service was down).
  const untranslated = must(await db().from('campaigns').select('*')
    .or('title_en.is.null,description_en.is.null,scope_in_en.is.null').order('created_at', { ascending: false }).limit(20)) as CampaignRow[]
  for (const c of untranslated) {
    const english = { title: c.title_en, description: c.description_en, scopeIn: c.scope_in_en, scopeOut: c.scope_out_en }
    const filled = await withEnglish({ title: c.title, description: c.description, scopeIn: c.scope_in, scopeOut: c.scope_out }, english)
    if (JSON.stringify(filled) === JSON.stringify(english)) continue
    must(await db().from('campaigns').update({
      title_en: filled.title, description_en: filled.description, scope_in_en: filled.scopeIn, scope_out_en: filled.scopeOut,
    }).eq('id', c.id))
    report.translated++
  }

  return report
})
