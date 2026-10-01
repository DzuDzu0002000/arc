import { usdcBalance } from '../server/chain.js'
import { db, must } from '../server/db.js'
import { route } from '../server/http.js'
import { dbAmountToUnits, formatUsdc } from '../server/money.js'
import { testerProfiles } from '../server/flows.js'
import { requireSession, type Session } from '../server/session.js'

type OwnCampaign = { id: string; title: string; title_en: string | null; product_name: string; status: string; budget: string; ends_at: string; fund_tx: string | null; created_at: string }
type QueueBug = { id: string; campaign_id: string; status: string; payout_amount: string | null }

/** Project side: funding, what is waiting for review, and what has been paid out. */
async function projectData(session: Session) {
  const campaigns = must(await db().from('campaigns')
    .select('id, title, title_en, product_name, status, budget, ends_at, fund_tx, created_at')
    .eq('owner_account_id', session.account.id).order('created_at', { ascending: false })) as OwnCampaign[]
  const ids = campaigns.map((c) => c.id)
  const bugs = ids.length ? must(await db().from('bugs')
    .select('id, campaign_id, title, status, severity_claimed, severity_final, payout_amount, payout_tx, response_due_at, created_at, accounts(display_name), tester_ratings(stars)')
    .in('campaign_id', ids).order('created_at', { ascending: false }).limit(300)) as (QueueBug & Record<string, unknown>)[] : []

  const funded = campaigns.filter((c) => c.fund_tx)
  const paid = bugs.filter((b) => b.status === 'paid').reduce((sum, b) => sum + dbAmountToUnits(b.payout_amount), 0n)
  const locked = funded.filter((c) => c.status !== 'settled').reduce((sum, c) => sum + dbAmountToUnits(c.budget), 0n) - paid
  const byCampaign = new Map(campaigns.map((c) => [c.id, c]))

  return {
    campaigns: campaigns.map((c) => ({
      ...c, bugsToReview: bugs.filter((b) => b.campaign_id === c.id && b.status === 'submitted').length,
    })),
    reviewQueue: bugs.map((b) => ({ ...b, campaign: { id: b.campaign_id, title: byCampaign.get(b.campaign_id)?.title, title_en: byCampaign.get(b.campaign_id)?.title_en, product_name: byCampaign.get(b.campaign_id)?.product_name } })),
    totals: {
      lockedInEscrow: formatUsdc(locked > 0n ? locked : 0n),
      paidToTesters: formatUsdc(paid),
      toReview: bugs.filter((b) => b.status === 'submitted').length,
      awaitingSignature: bugs.filter((b) => b.status === 'accepted').length,
    },
  }
}

/** Tester side: applications, every bug they reported, and their disputes. */
async function testerData(session: Session) {
  const [applications, bugs] = await Promise.all([
    db().from('applications').select('id, status, created_at, campaigns(id, title, title_en, product_name, status, ends_at)')
      .eq('tester_account_id', session.account.id).order('created_at', { ascending: false }),
    db().from('bugs').select('id, title, status, severity_claimed, severity_final, payout_amount, payout_tx, response_due_at, dispute_due_at, reject_reason, reject_note, created_at, campaigns(id, title, title_en, product_name), disputes(id, status, reason, resolution_note, created_at, resolved_at)')
      .eq('tester_account_id', session.account.id).order('created_at', { ascending: false }).limit(300),
  ])
  const profile = (await testerProfiles([session.account.id])).get(session.account.id)
  return { applications: must(applications), bugs: must(bugs), profile }
}

export default route(['GET'], async (req) => {
  const session = await requireSession(req)
  const balance = await usdcBalance(session.wallet.address as `0x${string}`).then(formatUsdc).catch(() => null)
  const wallet = { address: session.wallet.address, balance }
  if (session.account.role === 'project') return { role: 'project', wallet, ...(await projectData(session)) }
  if (session.account.role === 'tester') return { role: 'tester', wallet, ...(await testerData(session)) }
  return { role: null, wallet }
})
