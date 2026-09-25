import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyError, approveError, disputeError, maxPayoutUnits, minPayoutUnits, nextBugStatus, rejectError,
  remainingBudget, submitBugError, validateBugInput, validateCampaignInput, withdrawError,
} from '../server/rules.ts'

const now = new Date('2026-09-25T00:00:00Z')
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString()

const campaignInput = {
  title: 'Test the multilingual chat flow',
  productName: 'Lumen Chat',
  platforms: ['web', 'ios'],
  testerSlots: 10,
  budget: '1200',
  payouts: { critical: '100', high: '50', medium: '20', low: '5' },
  endsAt: inDays(7),
}

test('accepts a well-formed campaign and fills defaults', () => {
  const result = validateCampaignInput(campaignInput, now)
  assert.ok(result.ok)
  assert.equal(result.value.responseHours, 120)
  assert.equal(result.value.testUrl, null)
})

test('rejects campaigns that would mislead testers', () => {
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ payouts: {} }, /at least one severity/],
    [{ payouts: { critical: '10', high: '50' } }, /more severe bug cannot pay less/],
    [{ payouts: { critical: '2000' } }, /cannot exceed the budget/],
    [{ budget: '0' }, /positive USDC/],
    [{ endsAt: inDays(0.5) }, /at least 1 day/],
    [{ endsAt: inDays(120) }, /at most 90 days/],
    [{ platforms: ['tv'] }, /valid platform/],
    [{ testUrl: 'http://insecure.example' }, /https/],
    [{ testerSlots: 0 }, /Tester slots/],
  ]
  for (const [override, message] of cases) {
    const result = validateCampaignInput({ ...campaignInput, ...override }, now)
    assert.equal(result.ok, false, JSON.stringify(override))
    if (!result.ok) assert.match(result.error, message)
  }
})

test('bug reports need real steps and https evidence', () => {
  const good = { title: 'Reply is cut off', steps: '1. Open chat 2. Ask', expected: 'Full reply', actual: 'Cut off', environment: 'iOS 19', severity: 'high', evidenceUrls: ['https://loom.com/x'] }
  assert.ok(validateBugInput(good).ok)
  assert.equal(validateBugInput({ ...good, steps: 'short' }).ok, false)
  assert.equal(validateBugInput({ ...good, severity: 'urgent' }).ok, false)
  assert.equal(validateBugInput({ ...good, evidenceUrls: ['javascript:alert(1)'] }).ok, false)
})

test('bug status machine only allows the documented transitions', () => {
  assert.equal(nextBugStatus('submitted', 'accept'), 'accepted')
  assert.equal(nextBugStatus('submitted', 'timeout_accept'), 'accepted')
  assert.equal(nextBugStatus('rejected', 'dispute'), 'disputed')
  assert.equal(nextBugStatus('disputed', 'resolve_upheld'), 'accepted')
  assert.equal(nextBugStatus('accepted', 'mark_paid'), 'paid')
  assert.equal(nextBugStatus('paid', 'accept'), null)
  assert.equal(nextBugStatus('rejected_final', 'dispute'), null)
  assert.equal(nextBugStatus('needs_info', 'accept'), null)
  assert.equal(nextBugStatus('accepted', 'reject'), null)
})

const openCampaign = { status: 'open' as const, ownerAccountId: 'owner', endsAt: inDays(3), testerSlots: 2 }

test('owners cannot test their own campaign and slots are enforced', () => {
  assert.match(applyError(openCampaign, 'owner', false, now) || '', /own campaign/)
  assert.match(applyError(openCampaign, 'tester', true, now) || '', /already applied/)
  assert.equal(applyError(openCampaign, 'tester', false, now), null)
  assert.match(approveError(openCampaign, 'pending', 2) || '', /slots are filled/)
  assert.equal(approveError(openCampaign, 'pending', 1), null)
})

test('bugs stop when the budget cannot cover the cheapest payout', () => {
  const payouts = { critical: 100_000_000n, low: 5_000_000n }
  assert.equal(maxPayoutUnits(payouts), 100_000_000n)
  assert.equal(minPayoutUnits(payouts), 5_000_000n)
  const base = { campaign: openCampaign, applicationStatus: 'approved' as const, submittedToday: 0, minPayout: 5_000_000n, now }
  assert.equal(submitBugError({ ...base, remaining: remainingBudget(20_000_000n, [10_000_000n]) }), null)
  assert.match(submitBugError({ ...base, remaining: remainingBudget(20_000_000n, [16_000_000n]) }) || '', /whole budget/)
  assert.match(submitBugError({ ...base, applicationStatus: 'pending', remaining: 20_000_000n }) || '', /approved application/)
  assert.match(submitBugError({ ...base, submittedToday: 20, remaining: 20_000_000n }) || '', /per day/)
})

test('duplicates must point to an earlier bug in the same campaign', () => {
  const bug = { id: 'b2', campaignId: 'c1', createdAt: '2026-09-25T10:00:00Z' }
  assert.match(rejectError({ reason: 'duplicate', bug, duplicateOf: null }) || '', /original bug/)
  assert.match(rejectError({ reason: 'duplicate', bug, duplicateOf: { id: 'b3', campaignId: 'c1', createdAt: '2026-09-25T11:00:00Z' } }) || '', /earlier/)
  assert.match(rejectError({ reason: 'duplicate', bug, duplicateOf: { id: 'b1', campaignId: 'c9', createdAt: '2026-09-25T09:00:00Z' } }) || '', /same campaign/)
  assert.equal(rejectError({ reason: 'duplicate', bug, duplicateOf: { id: 'b1', campaignId: 'c1', createdAt: '2026-09-25T09:00:00Z' } }), null)
  assert.match(rejectError({ reason: 'meh', bug, duplicateOf: null }) || '', /reason/)
  assert.equal(rejectError({ reason: 'out_of_scope', bug, duplicateOf: null }), null)
})

test('disputes only within 3 days of a rejection', () => {
  assert.equal(disputeError('rejected', inDays(1), now), null)
  assert.match(disputeError('rejected', inDays(-1), now) || '', /window has passed/)
  assert.match(disputeError('accepted', inDays(1), now) || '', /Only rejected/)
})

test('owners withdraw leftovers only after the grace period with nothing pending', () => {
  const ended = inDays(-15)
  assert.equal(withdrawError({ status: 'closed', endsAt: ended, openBugs: 0, now }), null)
  assert.match(withdrawError({ status: 'closed', endsAt: inDays(-3), openBugs: 0, now }) || '', /14 days/)
  assert.match(withdrawError({ status: 'closed', endsAt: ended, openBugs: 1, now }) || '', /still waiting/)
  assert.match(withdrawError({ status: 'settled', endsAt: ended, openBugs: 0, now }) || '', /Nothing to withdraw/)
})
