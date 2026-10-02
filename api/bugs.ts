import crypto from 'node:crypto'
import { createContractExecution } from '../server/circle.js'
import { db, must, type BugRow, type CampaignRow } from '../server/db.js'
import { env } from '../server/env.js'
import { encodePayBug, uuidToBytes32 } from '../server/escrow.js'
import { acceptBug, committedUnits, confirmOwnerPayout, loadBug, loadCampaign, payoutTable, testerProfiles, transitionBug } from '../server/flows.js'
import { action, badRequest, body, conflict, forbidden, route, uuidParam } from '../server/http.js'
import { dbAmountToUnits, formatUsdc } from '../server/money.js'
import {
  disputeDueAt, disputeError, minPayoutUnits, rejectError, remainingBudget, responseDueAt, SEVERITIES, submitBugError,
  validateBugInput, validateRating, type Severity,
} from '../server/rules.js'
import { notify } from '../server/notify.js'
import { requireSession, type Session } from '../server/session.js'

const messageBody = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length < 1 || text.length > 3000) throw badRequest('Write a message (up to 3000 characters).')
  return text
}

async function addMessage(bugId: string, authorId: string, text: string) {
  must(await db().from('bug_messages').insert({ bug_id: bugId, author_account_id: authorId, body: text }))
}

function roleFor(session: Session, bug: BugRow, campaign: CampaignRow) {
  if (campaign.owner_account_id === session.account.id) return 'owner' as const
  if (bug.tester_account_id === session.account.id) return 'tester' as const
  if (session.isAdmin) return 'admin' as const
  return null
}

async function view(session: Session, id: string) {
  const bug = await loadBug(id)
  const campaign = await loadCampaign(bug.campaign_id)
  const role = roleFor(session, bug, campaign)
  if (!role) throw forbidden()
  const [messages, dispute, tester, payouts, rating, profiles] = await Promise.all([
    db().from('bug_messages').select('id, body, created_at, author_account_id, accounts(display_name)').eq('bug_id', id).order('created_at'),
    db().from('disputes').select('id, reason, status, resolution_note, created_at, resolved_at').eq('bug_id', id).maybeSingle(),
    db().from('accounts').select('display_name').eq('id', bug.tester_account_id).maybeSingle<{ display_name: string }>(),
    payoutTable(campaign.id),
    db().from('tester_ratings').select('stars, comment, created_at').eq('bug_id', id).maybeSingle(),
    role === 'tester' ? Promise.resolve(null) : testerProfiles([bug.tester_account_id]),
  ])
  return {
    role,
    bug: {
      id: bug.id, title: bug.title, steps: bug.steps, expected: bug.expected, actual: bug.actual, environment: bug.environment,
      evidenceUrls: bug.evidence_urls, severityClaimed: bug.severity_claimed, severityFinal: bug.severity_final, status: bug.status,
      rejectReason: bug.reject_reason, rejectNote: bug.reject_note, duplicateOf: bug.duplicate_of, responseDueAt: bug.response_due_at,
      disputeDueAt: bug.dispute_due_at, decidedBy: bug.decided_by, payoutAmount: bug.payout_amount, payoutTx: bug.payout_tx,
      payoutPending: Boolean(bug.payout_challenge_id), createdAt: bug.created_at, testerName: must(tester)?.display_name || 'Tester',
      testerId: bug.tester_account_id,
    },
    rating: must(rating),
    testerProfile: profiles?.get(bug.tester_account_id) ?? null,
    campaign: { id: campaign.id, title: campaign.title, titleEn: campaign.title_en, productName: campaign.product_name },
    payouts: Object.fromEntries(SEVERITIES.filter((s) => payouts[s]).map((s) => [s, formatUsdc(payouts[s] as bigint)])),
    messages: must(messages),
    dispute: must(dispute),
  }
}

async function submit(session: Session, input: Record<string, unknown>) {
  const campaign = await loadCampaign(uuidParam(input.campaignId, 'campaign'))
  const result = validateBugInput(input)
  if (!result.ok) throw badRequest(result.error)
  const payouts = await payoutTable(campaign.id)
  if (!payouts[result.value.severity]) throw badRequest(`This campaign does not pay for ${result.value.severity} bugs.`)

  const since = new Date(Date.now() - 86_400_000).toISOString()
  const [application, today, committed] = await Promise.all([
    db().from('applications').select('status').eq('campaign_id', campaign.id).eq('tester_account_id', session.account.id).maybeSingle<{ status: 'approved' }>(),
    db().from('bugs').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('tester_account_id', session.account.id).gte('created_at', since),
    committedUnits(campaign.id),
  ])
  if (today.error) throw new Error(today.error.message)
  const error = submitBugError({
    campaign: { status: campaign.status, ownerAccountId: campaign.owner_account_id, endsAt: campaign.ends_at, testerSlots: campaign.tester_slots },
    applicationStatus: must(application)?.status ?? null,
    submittedToday: today.count ?? 0,
    remaining: remainingBudget(dbAmountToUnits(campaign.budget), committed),
    minPayout: minPayoutUnits(payouts),
    now: new Date(),
  })
  if (error) throw conflict(error)

  const v = result.value
  const row = must(await db().from('bugs').insert({
    campaign_id: campaign.id, tester_account_id: session.account.id, title: v.title, steps: v.steps, expected: v.expected,
    actual: v.actual, environment: v.environment, evidence_urls: v.evidenceUrls, severity_claimed: v.severity,
    response_due_at: responseDueAt(new Date(), campaign.response_hours).toISOString(),
  }).select('id').single<{ id: string }>())
  if (row) await notify([campaign.owner_account_id], 'bug_submitted', { campaignId: campaign.id, bugId: row.id })
  return row
}

/** Owner signs payBug in their Circle wallet. The amount comes from the payout table, never from the client. */
async function requestOwnerSignature(session: Session & { wallet: { circle_wallet_id: string } }, bug: BugRow, campaign: CampaignRow) {
  const tester = must(await db().from('wallets').select('address').eq('account_id', bug.tester_account_id).maybeSingle<{ address: string }>())
  if (!tester) throw conflict('The tester has no wallet yet.')
  const challengeId = await createContractExecution({
    userToken: session.userToken, walletId: session.wallet.circle_wallet_id, contractAddress: env.escrowAddress(),
    callData: encodePayBug({
      campaignId: campaign.escrow_id, bugId: uuidToBytes32(bug.id), tester: tester.address as `0x${string}`,
      amount: dbAmountToUnits(bug.payout_amount),
    }),
    idempotencyKey: crypto.randomUUID(),
  })
  must(await db().from('bugs').update({ payout_challenge_id: challengeId }).eq('id', bug.id).eq('status', 'accepted'))
  return { status: 'accepted', challengeId }
}

export default route(['GET', 'POST'], async (req) => {
  const session = await requireSession(req)
  if (req.method === 'GET') return view(session, uuidParam(req.query.id))

  const input = body(req)
  const act = action(req)
  if (act === 'submit') {
    if (session.account.role !== 'tester') throw forbidden('Only tester accounts can report bugs.')
    return submit(session, input)
  }

  const bug = await loadBug(uuidParam(input.id))
  const campaign = await loadCampaign(bug.campaign_id)
  const role = roleFor(session, bug, campaign)
  const ownerOnly = () => { if (role !== 'owner') throw forbidden('Only the campaign owner can do this.') }
  const testerOnly = () => { if (role !== 'tester') throw forbidden('Only the tester who reported this bug can do this.') }

  switch (act) {
    case 'request-info': {
      ownerOnly()
      const text = messageBody(input.message)
      await transitionBug(bug, 'request_info', { response_due_at: null })
      await addMessage(bug.id, session.account.id, text)
      return { status: 'needs_info' }
    }
    case 'reply': {
      testerOnly()
      const text = messageBody(input.message)
      // The owner's response clock restarts once the tester answers.
      await transitionBug(bug, 'reply', { response_due_at: responseDueAt(new Date(), campaign.response_hours).toISOString() })
      await addMessage(bug.id, session.account.id, text)
      return { status: 'submitted' }
    }
    case 'accept': {
      ownerOnly()
      const severity = input.severity as Severity
      if (!SEVERITIES.includes(severity)) throw badRequest('Choose a severity.')
      const accepted = await acceptBug(bug, campaign, severity, 'owner')
      return requestOwnerSignature(session, accepted, campaign)
    }
    case 'pay': {
      // Retry the owner signature after a cancelled or failed PIN prompt.
      ownerOnly()
      if (bug.status !== 'accepted') throw conflict('Only accepted bugs can be paid.')
      return requestOwnerSignature(session, bug, campaign)
    }
    case 'confirm-payout': {
      ownerOnly()
      const result = await confirmOwnerPayout(bug, campaign, session.userToken)
      return { status: result.bug.status, pending: result.pending, failed: 'failed' in result ? result.failed : false, txHash: result.bug.payout_tx }
    }
    case 'reject': {
      ownerOnly()
      const duplicate = typeof input.duplicateOf === 'string' && input.duplicateOf
        ? await loadBug(uuidParam(input.duplicateOf, 'original bug'))
        : null
      const error = rejectError({
        reason: input.reason,
        bug: { id: bug.id, campaignId: bug.campaign_id, createdAt: bug.created_at },
        duplicateOf: duplicate ? { id: duplicate.id, campaignId: duplicate.campaign_id, createdAt: duplicate.created_at } : null,
      })
      if (error) throw badRequest(error)
      const note = typeof input.note === 'string' ? input.note.trim().slice(0, 1000) : null
      const now = new Date()
      await transitionBug(bug, 'reject', {
        reject_reason: input.reason as string, reject_note: note || null, duplicate_of: duplicate?.id ?? null,
        decided_at: now.toISOString(), decided_by: 'owner', dispute_due_at: disputeDueAt(now).toISOString(),
      })
      return { status: 'rejected' }
    }
    case 'rate': {
      // After paying, the project rates the tester; the stars feed the tester's public profile.
      ownerOnly()
      const existing = must(await db().from('tester_ratings').select('id').eq('bug_id', bug.id).maybeSingle())
      const result = validateRating(input, { status: bug.status, alreadyRated: Boolean(existing) })
      if (!result.ok) throw conflict(result.error)
      must(await db().from('tester_ratings').insert({
        bug_id: bug.id, campaign_id: campaign.id, tester_account_id: bug.tester_account_id, rater_account_id: session.account.id,
        stars: result.value.stars, comment: result.value.comment,
      }))
      return { stars: result.value.stars }
    }
    case 'dispute': {
      testerOnly()
      const error = disputeError(bug.status, bug.dispute_due_at, new Date())
      if (error) throw conflict(error)
      const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
      if (reason.length < 10 || reason.length > 2000) throw badRequest('Explain why the rejection is wrong (10–2000 characters).')
      await transitionBug(bug, 'dispute')
      must(await db().from('disputes').insert({ bug_id: bug.id, reason }))
      return { status: 'disputed' }
    }
    default:
      throw badRequest('Unknown action.')
  }
})
