import crypto from 'node:crypto'
import { escrowCampaign, getReceipt, USDC_ADDRESS } from '../server/chain.js'
import { createContractExecution, resolveChallenge } from '../server/circle.js'
import { db, must, type ApplicationRow, type CampaignRow } from '../server/db.js'
import { env } from '../server/env.js'
import { encodeFundBatch, encodeWithdraw, receiptFundsCampaign, receiptWithdraws, unixSeconds, uuidToBytes32 } from '../server/escrow.js'
import { committedUnits, loadCampaign, payoutTable } from '../server/flows.js'
import { action, badRequest, body, conflict, forbidden, notFound, route, uuidParam } from '../server/http.js'
import { dbAmountToUnits, formatUsdc } from '../server/money.js'
import { maxPayoutUnits, remainingBudget, SEVERITIES, validateCampaignInput, withdrawError, withdrawableAt, type Severity } from '../server/rules.js'
import { getSession, requireSession, type Session } from '../server/session.js'

type Stats = { decided: number; accepted: number; timed_out: number; overturned: number; avg_response_days: number | null }

function publicCampaign(c: CampaignRow) {
  return {
    id: c.id, title: c.title, productName: c.product_name, description: c.description, scopeIn: c.scope_in, scopeOut: c.scope_out,
    testUrl: c.test_url, platforms: c.platforms, testerSlots: c.tester_slots, budget: formatUsdc(dbAmountToUnits(c.budget)),
    endsAt: c.ends_at, responseHours: c.response_hours, status: c.status, escrowId: c.escrow_id, fundTx: c.fund_tx,
    withdrawableAt: withdrawableAt(new Date(c.ends_at)).toISOString(), createdAt: c.created_at,
  }
}

function payoutsJson(payouts: Partial<Record<Severity, bigint>>) {
  return Object.fromEntries(SEVERITIES.filter((s) => payouts[s]).map((s) => [s, formatUsdc(payouts[s] as bigint)]))
}

async function ownedCampaign(session: Session, id: string) {
  const campaign = await loadCampaign(id)
  if (campaign.owner_account_id !== session.account.id) throw forbidden('Only the campaign owner can do this.')
  return campaign
}

async function list() {
  const campaigns = must(await db().from('campaigns').select('*').eq('status', 'open')
    .gt('ends_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(50)) as CampaignRow[]
  const ids = campaigns.map((c) => c.id)
  const [payoutRows, approvedRows] = await Promise.all([
    ids.length ? db().from('campaign_payouts').select('campaign_id, amount').in('campaign_id', ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? db().from('applications').select('campaign_id').in('campaign_id', ids).eq('status', 'approved') : Promise.resolve({ data: [], error: null }),
  ])
  const maxByCampaign = new Map<string, bigint>()
  for (const row of must(payoutRows) as { campaign_id: string; amount: string }[]) {
    const units = dbAmountToUnits(row.amount)
    if (units > (maxByCampaign.get(row.campaign_id) ?? 0n)) maxByCampaign.set(row.campaign_id, units)
  }
  const approved = new Map<string, number>()
  for (const row of must(approvedRows) as { campaign_id: string }[]) approved.set(row.campaign_id, (approved.get(row.campaign_id) ?? 0) + 1)
  return {
    campaigns: campaigns.map((c) => ({
      ...publicCampaign(c), maxPayout: formatUsdc(maxByCampaign.get(c.id) ?? 0n), approvedTesters: approved.get(c.id) ?? 0,
    })),
  }
}

async function detail(id: string, session: Session | null) {
  const campaign = await loadCampaign(id)
  const isOwner = session?.account.id === campaign.owner_account_id
  if (campaign.status === 'draft' && !isOwner) throw notFound('Campaign not found.')
  const [payouts, committed, stats, approvedCount, application, owner] = await Promise.all([
    payoutTable(id),
    committedUnits(id),
    db().from('project_stats').select('*').eq('owner_account_id', campaign.owner_account_id).maybeSingle<Stats>(),
    db().from('applications').select('id', { count: 'exact', head: true }).eq('campaign_id', id).eq('status', 'approved'),
    session ? db().from('applications').select('id, status').eq('campaign_id', id).eq('tester_account_id', session.account.id).maybeSingle<Pick<ApplicationRow, 'id' | 'status'>>() : Promise.resolve({ data: null, error: null }),
    db().from('accounts').select('display_name').eq('id', campaign.owner_account_id).maybeSingle<{ display_name: string }>(),
  ])
  let escrowBalance: string | null = null
  if (campaign.fund_tx) {
    try { escrowBalance = formatUsdc((await escrowCampaign(campaign.escrow_id)).balance) } catch { escrowBalance = null }
  }
  const s = must(stats)
  return {
    campaign: publicCampaign(campaign),
    ownerName: must(owner)?.display_name || 'Dự án',
    payouts: payoutsJson(payouts),
    remainingBudget: formatUsdc(remainingBudget(dbAmountToUnits(campaign.budget), committed)),
    escrowBalance,
    approvedTesters: approvedCount.count ?? 0,
    stats: s ? {
      decided: Number(s.decided), accepted: Number(s.accepted), timedOut: Number(s.timed_out),
      overturned: Number(s.overturned), avgResponseDays: s.avg_response_days === null ? null : Number(s.avg_response_days),
    } : null,
    viewer: { role: isOwner ? 'owner' : session ? 'user' : 'guest', application: must(application) },
  }
}

async function manage(id: string, session: Session) {
  const campaign = await ownedCampaign(session, id)
  const [applications, bugs] = await Promise.all([
    db().from('applications').select('id, status, message, devices, created_at, accounts(display_name)').eq('campaign_id', id).order('created_at'),
    db().from('bugs').select('id, title, status, severity_claimed, severity_final, payout_amount, response_due_at, created_at, payout_tx, accounts(display_name)')
      .eq('campaign_id', id).order('created_at', { ascending: false }),
  ])
  return { campaign: publicCampaign(campaign), applications: must(applications), bugs: must(bugs) }
}

async function create(session: Session & { wallet: { address: string } }, input: Record<string, unknown>) {
  const result = validateCampaignInput(input, new Date())
  if (!result.ok) throw badRequest(result.error)
  const v = result.value
  const id = crypto.randomUUID()
  must(await db().from('campaigns').insert({
    id, owner_account_id: session.account.id, title: v.title, product_name: v.productName, description: v.description,
    scope_in: v.scopeIn, scope_out: v.scopeOut, test_url: v.testUrl, platforms: v.platforms, tester_slots: v.testerSlots,
    budget: v.budget, ends_at: v.endsAt, response_hours: v.responseHours, escrow_id: uuidToBytes32(id),
  }))
  must(await db().from('campaign_payouts').insert(
    Object.entries(v.payouts).map(([severity, amount]) => ({ campaign_id: id, severity, amount })),
  ))
  return { id }
}

async function startFunding(session: Session & { wallet: { address: string; circle_wallet_id: string } }, id: string) {
  const campaign = await ownedCampaign(session, id)
  if (campaign.status !== 'draft' && campaign.status !== 'funding') throw conflict('This campaign is already funded.')
  if (new Date(campaign.ends_at).getTime() < Date.now() + 3_600_000) throw conflict('The end date is too close. Edit the campaign first.')
  const payouts = await payoutTable(id)
  const callData = encodeFundBatch({
    usdc: USDC_ADDRESS, escrow: env.escrowAddress(), campaignId: campaign.escrow_id,
    amount: dbAmountToUnits(campaign.budget), maxPayout: maxPayoutUnits(payouts), endsAt: unixSeconds(campaign.ends_at),
  })
  const challengeId = await createContractExecution({
    userToken: session.userToken, walletId: session.wallet.circle_wallet_id,
    contractAddress: session.wallet.address, callData, idempotencyKey: crypto.randomUUID(),
  })
  must(await db().from('campaigns').update({ status: 'funding', fund_challenge_id: challengeId, updated_at: new Date().toISOString() }).eq('id', id))
  return { challengeId }
}

async function confirmFunding(session: Session & { wallet: { address: string } }, id: string) {
  const campaign = await ownedCampaign(session, id)
  if (campaign.status === 'open') return { status: 'open' }
  if (campaign.status !== 'funding' || !campaign.fund_challenge_id) throw conflict('Start funding first.')
  const outcome = await resolveChallenge(session.userToken, campaign.fund_challenge_id)
  if (outcome.state === 'failed') {
    must(await db().from('campaigns').update({ status: 'draft', fund_challenge_id: null }).eq('id', id).eq('status', 'funding'))
    return { status: 'draft', failed: true }
  }
  if (outcome.state === 'pending') return { status: 'funding', pending: true }
  const receipt = await getReceipt(outcome.txHash)
  if (!receipt) return { status: 'funding', pending: true }
  const payouts = await payoutTable(id)
  const funded = receiptFundsCampaign(receipt, env.escrowAddress(), {
    campaignId: campaign.escrow_id, owner: session.wallet.address, amount: dbAmountToUnits(campaign.budget),
    maxPayout: maxPayoutUnits(payouts), endsAt: unixSeconds(campaign.ends_at),
  })
  if (!funded) {
    must(await db().from('campaigns').update({ status: 'draft', fund_challenge_id: null }).eq('id', id).eq('status', 'funding'))
    return { status: 'draft', failed: true }
  }
  must(await db().from('campaigns').update({
    status: 'open', fund_tx: outcome.txHash, opened_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'funding'))
  return { status: 'open', txHash: outcome.txHash }
}

async function update(session: Session, id: string, input: Record<string, unknown>) {
  const campaign = await ownedCampaign(session, id)
  if (campaign.status !== 'draft') throw conflict('Only drafts can be edited. Payouts are locked once a campaign is funded.')
  const result = validateCampaignInput(input, new Date())
  if (!result.ok) throw badRequest(result.error)
  const v = result.value
  must(await db().from('campaigns').update({
    title: v.title, product_name: v.productName, description: v.description, scope_in: v.scopeIn, scope_out: v.scopeOut,
    test_url: v.testUrl, platforms: v.platforms, tester_slots: v.testerSlots, budget: v.budget, ends_at: v.endsAt,
    response_hours: v.responseHours, updated_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'draft'))
  must(await db().from('campaign_payouts').delete().eq('campaign_id', id))
  must(await db().from('campaign_payouts').insert(Object.entries(v.payouts).map(([severity, amount]) => ({ campaign_id: id, severity, amount }))))
  return { id }
}

async function openBugCount(id: string) {
  const { count, error } = await db().from('bugs').select('id', { count: 'exact', head: true })
    .eq('campaign_id', id).in('status', ['submitted', 'needs_info', 'accepted', 'rejected', 'disputed'])
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function startWithdraw(session: Session & { wallet: { address: string; circle_wallet_id: string } }, id: string) {
  const campaign = await ownedCampaign(session, id)
  const error = withdrawError({ status: campaign.status, endsAt: campaign.ends_at, openBugs: await openBugCount(id), now: new Date() })
  if (error) throw conflict(error)
  const challengeId = await createContractExecution({
    userToken: session.userToken, walletId: session.wallet.circle_wallet_id, contractAddress: env.escrowAddress(),
    callData: encodeWithdraw(campaign.escrow_id), idempotencyKey: crypto.randomUUID(),
  })
  must(await db().from('campaigns').update({ withdraw_challenge_id: challengeId }).eq('id', id))
  return { challengeId }
}

async function confirmWithdraw(session: Session & { wallet: { address: string } }, id: string) {
  const campaign = await ownedCampaign(session, id)
  if (campaign.status === 'settled') return { status: 'settled' }
  if (!campaign.withdraw_challenge_id) throw conflict('Start the withdrawal first.')
  const outcome = await resolveChallenge(session.userToken, campaign.withdraw_challenge_id)
  if (outcome.state === 'failed') return { status: campaign.status, failed: true }
  if (outcome.state === 'pending') return { status: campaign.status, pending: true }
  const receipt = await getReceipt(outcome.txHash)
  if (!receipt) return { status: campaign.status, pending: true }
  if (!receiptWithdraws(receipt, env.escrowAddress(), { campaignId: campaign.escrow_id, owner: session.wallet.address })) {
    return { status: campaign.status, failed: true }
  }
  must(await db().from('campaigns').update({ status: 'settled', withdraw_tx: outcome.txHash, updated_at: new Date().toISOString() }).eq('id', id))
  return { status: 'settled', txHash: outcome.txHash }
}

export default route(['GET', 'POST'], async (req) => {
  if (req.method === 'GET') {
    if (!req.query.id) return list()
    const id = uuidParam(req.query.id)
    if (req.query.view === 'manage') return manage(id, await requireSession(req))
    return detail(id, await getSession(req))
  }

  const session = await requireSession(req)
  const input = body(req)
  switch (action(req)) {
    case 'create': return create(session, input)
    case 'update': return update(session, uuidParam(input.id), input)
    case 'start-funding': return startFunding(session, uuidParam(input.id))
    case 'confirm-funding': return confirmFunding(session, uuidParam(input.id))
    case 'close': {
      const campaign = await ownedCampaign(session, uuidParam(input.id))
      if (campaign.status !== 'open') throw conflict('Only open campaigns can be closed.')
      must(await db().from('campaigns').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', campaign.id).eq('status', 'open'))
      return { status: 'closed' }
    }
    case 'start-withdraw': return startWithdraw(session, uuidParam(input.id))
    case 'confirm-withdraw': return confirmWithdraw(session, uuidParam(input.id))
    default: throw badRequest('Unknown action.')
  }
})
