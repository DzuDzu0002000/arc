import { usdcBalance } from '../server/chain.js'
import { db, must } from '../server/db.js'
import { route } from '../server/http.js'
import { formatUsdc } from '../server/money.js'
import { requireSession } from '../server/session.js'

export default route(['GET'], async (req) => {
  const session = await requireSession(req)
  const accountId = session.account.id
  const [applications, bugs, campaigns, balance] = await Promise.all([
    db().from('applications').select('id, status, created_at, campaigns(id, title, product_name, status, ends_at)')
      .eq('tester_account_id', accountId).order('created_at', { ascending: false }),
    db().from('bugs').select('id, title, status, severity_claimed, severity_final, payout_amount, payout_tx, response_due_at, dispute_due_at, reject_reason, created_at, campaigns(id, title, product_name)')
      .eq('tester_account_id', accountId).order('created_at', { ascending: false }).limit(100),
    db().from('campaigns').select('id, title, product_name, status, budget, ends_at, created_at')
      .eq('owner_account_id', accountId).order('created_at', { ascending: false }),
    usdcBalance(session.wallet.address as `0x${string}`).then(formatUsdc).catch(() => null),
  ])

  const ownCampaigns = must(campaigns) as { id: string }[]
  const pendingByCampaign: Record<string, number> = {}
  if (ownCampaigns.length) {
    const pending = must(await db().from('bugs').select('campaign_id')
      .in('campaign_id', ownCampaigns.map((c) => c.id)).eq('status', 'submitted')) as { campaign_id: string }[]
    for (const row of pending) pendingByCampaign[row.campaign_id] = (pendingByCampaign[row.campaign_id] ?? 0) + 1
  }

  return {
    wallet: { address: session.wallet.address, balance },
    applications: must(applications),
    bugs: must(bugs),
    campaigns: ownCampaigns.map((c) => ({ ...c, bugsToReview: pendingByCampaign[c.id] ?? 0 })),
  }
})
