// Money-moving flows shared by the API routes and the cron job.
import type { Hex } from 'viem'
import { arbiterPayBug, getReceipt, isBugPaidOnChain } from './chain.js'
import { resolveChallenge } from './circle.js'
import { db, must, type BugRow, type CampaignRow, type PayoutRow } from './db.js'
import { env } from './env.js'
import { receiptPaysBug, uuidToBytes32 } from './escrow.js'
import { conflict, notFound } from './http.js'
import { dbAmountToUnits, formatUsdc } from './money.js'
import { nextBugStatus, remainingBudget, testerProfile, type BugAction, type Severity, type TesterStatsRow } from './rules.js'

export async function loadCampaign(id: string): Promise<CampaignRow> {
  const campaign = must(await db().from('campaigns').select('*').eq('id', id).maybeSingle<CampaignRow>())
  if (!campaign) throw notFound('Campaign not found.')
  return campaign
}

export async function loadBug(id: string): Promise<BugRow> {
  const bug = must(await db().from('bugs').select('*').eq('id', id).maybeSingle<BugRow>())
  if (!bug) throw notFound('Bug not found.')
  return bug
}

export async function payoutTable(campaignId: string): Promise<Partial<Record<Severity, bigint>>> {
  const rows = must(await db().from('campaign_payouts').select('severity, amount').eq('campaign_id', campaignId)) as Pick<PayoutRow, 'severity' | 'amount'>[]
  return Object.fromEntries(rows.map((r) => [r.severity, dbAmountToUnits(r.amount)]))
}

/** Budget already promised to accepted or paid bugs. */
export async function committedUnits(campaignId: string): Promise<bigint[]> {
  const rows = must(await db().from('bugs').select('payout_amount').eq('campaign_id', campaignId).in('status', ['accepted', 'paid'])) as Pick<BugRow, 'payout_amount'>[]
  return rows.map((r) => dbAmountToUnits(r.payout_amount))
}

/** Moves a bug to its next status only if nobody changed it meanwhile (optimistic concurrency on `status`). */
export async function transitionBug(bug: BugRow, act: BugAction, patch: Partial<BugRow> = {}): Promise<BugRow> {
  const next = nextBugStatus(bug.status, act)
  if (!next) throw conflict('This bug can no longer be changed that way.')
  const rows = must(await db().from('bugs')
    .update({ ...patch, status: next, updated_at: new Date().toISOString() })
    .eq('id', bug.id).eq('status', bug.status).select('*')) as BugRow[]
  if (!rows.length) throw conflict('This bug was just updated by someone else. Refresh and try again.')
  return rows[0]
}

/** Accepts a bug at a severity, reserving its payout from the campaign budget. */
export async function acceptBug(bug: BugRow, campaign: CampaignRow, severity: Severity, by: 'owner' | 'timeout' | 'admin') {
  const payouts = await payoutTable(campaign.id)
  const amount = payouts[severity]
  if (!amount) throw conflict(`This campaign has no payout for ${severity} bugs.`)
  const remaining = remainingBudget(dbAmountToUnits(campaign.budget), await committedUnits(campaign.id))
  if (remaining < amount) throw conflict('The campaign budget cannot cover this payout.')
  const act: BugAction = by === 'timeout' ? 'timeout_accept' : by === 'admin' ? 'resolve_upheld' : 'accept'
  return transitionBug(bug, act, {
    severity_final: severity, payout_amount: formatUsdc(amount), decided_at: new Date().toISOString(), decided_by: by,
  })
}

async function testerAddress(accountId: string): Promise<Hex> {
  const wallet = must(await db().from('wallets').select('address').eq('account_id', accountId).maybeSingle<{ address: string }>())
  if (!wallet) throw conflict('The tester has no wallet yet.')
  return wallet.address as Hex
}

async function markPaid(bug: BugRow, txHash: string | null) {
  return transitionBug(bug, 'mark_paid', { payout_tx: txHash, paid_at: new Date().toISOString() })
}

/** Checks the owner's signed payout on chain; returns the bug as it now stands. */
export async function confirmOwnerPayout(bug: BugRow, campaign: CampaignRow, ownerUserToken: string) {
  if (bug.status !== 'accepted' || !bug.payout_challenge_id) return { bug, pending: false }
  const outcome = await resolveChallenge(ownerUserToken, bug.payout_challenge_id)
  if (outcome.state === 'failed') {
    must(await db().from('bugs').update({ payout_challenge_id: null }).eq('id', bug.id).eq('payout_challenge_id', bug.payout_challenge_id))
    return { bug: { ...bug, payout_challenge_id: null }, pending: false, failed: true }
  }
  if (outcome.state === 'pending') return { bug, pending: true }
  const receipt = await getReceipt(outcome.txHash)
  if (!receipt) return { bug, pending: true }
  const paid = receiptPaysBug(receipt, env.escrowAddress(), {
    campaignId: campaign.escrow_id, bugId: uuidToBytes32(bug.id),
    tester: await testerAddress(bug.tester_account_id), amount: dbAmountToUnits(bug.payout_amount),
  })
  if (!paid) {
    // The transaction did not pay this bug (reverted, or another payer got there first).
    if (await isBugPaidOnChain(uuidToBytes32(bug.id))) return { bug: await markPaid(bug, null), pending: false }
    must(await db().from('bugs').update({ payout_challenge_id: null }).eq('id', bug.id))
    return { bug: { ...bug, payout_challenge_id: null }, pending: false, failed: true }
  }
  return { bug: await markPaid(bug, outcome.txHash), pending: false }
}

/** The platform arbiter pays an accepted bug from escrow. Safe to retry: the contract pays each bug id once. */
export async function payWithArbiter(bug: BugRow, campaign: CampaignRow) {
  if (bug.status !== 'accepted') return bug
  const bugId = uuidToBytes32(bug.id)
  if (await isBugPaidOnChain(bugId)) return markPaid(bug, null)
  const tester = await testerAddress(bug.tester_account_id)
  const amount = dbAmountToUnits(bug.payout_amount)
  const hash = await arbiterPayBug({ campaignId: campaign.escrow_id, bugId, tester, amount })
  const receipt = await getReceipt(hash)
  if (!receipt || !receiptPaysBug(receipt, env.escrowAddress(), { campaignId: campaign.escrow_id, bugId, tester, amount })) {
    throw new Error(`Arbiter payout for bug ${bug.id} did not emit BugPaid`)
  }
  return markPaid(bug, hash)
}

/** Track records for a set of testers, keyed by account id (missing testers get an empty profile). */
export async function testerProfiles(ids: string[]) {
  const unique = [...new Set(ids)]
  const rows = unique.length
    ? must(await db().from('tester_stats').select('*').in('tester_account_id', unique)) as (TesterStatsRow & { tester_account_id: string })[]
    : []
  const byId = new Map(rows.map((row) => [row.tester_account_id, row]))
  return new Map(unique.map((id) => [id, testerProfile(byId.get(id) ?? null)]))
}
