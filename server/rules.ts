// Pure marketplace rules. No I/O here, so every rule is unit-tested in tests/rules.test.ts.

export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const
export type Severity = typeof SEVERITIES[number]

export const PLATFORMS = ['web', 'ios', 'android', 'desktop', 'api'] as const
export type Platform = typeof PLATFORMS[number]

export const REJECT_REASONS = ['duplicate', 'out_of_scope', 'cannot_reproduce', 'not_a_bug', 'low_quality'] as const
export type RejectReason = typeof REJECT_REASONS[number]

export type CampaignStatus = 'draft' | 'funding' | 'open' | 'closed' | 'settled'
export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'removed'
export type BugStatus = 'submitted' | 'needs_info' | 'accepted' | 'rejected' | 'disputed' | 'rejected_final' | 'paid'
export type BugAction =
  | 'request_info' | 'reply' | 'accept' | 'reject' | 'dispute'
  | 'timeout_accept' | 'finalize_reject' | 'resolve_upheld' | 'resolve_dismissed' | 'mark_paid'

export const DISPUTE_WINDOW_HOURS = 72
export const ESCROW_GRACE_DAYS = 14
export const MAX_BUGS_PER_TESTER_PER_DAY = 20
export const OWNER_SIGN_TIMEOUT_HOURS = 24
const HOUR = 3_600_000
const DAY = 24 * HOUR

type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

const USDC_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/
function usdcUnits(value: unknown): bigint | null {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value)
  if (typeof value !== 'string' || !USDC_PATTERN.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
}

function text(value: unknown, field: string, min: number, max: number): Result<string> {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (trimmed.length < min) return fail(min > 0 ? `${field} is required (at least ${min} characters).` : `${field} is invalid.`)
  if (trimmed.length > max) return fail(`${field} must be at most ${max} characters.`)
  return { ok: true, value: trimmed }
}

function httpsUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

export type CampaignInput = {
  title: string
  productName: string
  description: string
  scopeIn: string
  scopeOut: string
  /** Tasks shown only to approved testers and the owner. */
  brief: string | null
  /** Optional English copy; null when the project did not provide it. */
  english: { title: string | null; description: string | null; scopeIn: string | null; scopeOut: string | null; brief: string | null }
  testUrl: string | null
  platforms: Platform[]
  testerSlots: number
  budget: string
  payouts: Partial<Record<Severity, string>>
  endsAt: string
  responseHours: number
}

export function validateCampaignInput(input: unknown, now: Date): Result<CampaignInput> {
  if (!input || typeof input !== 'object') return fail('Invalid campaign.')
  const body = input as Record<string, unknown>

  const title = text(body.title, 'Title', 5, 120); if (!title.ok) return title
  const productName = text(body.productName, 'Product name', 1, 80); if (!productName.ok) return productName
  const description = text(body.description ?? '', 'Description', 20, 5000); if (!description.ok) return description
  const scopeIn = text(body.scopeIn ?? '', 'In scope', 10, 3000); if (!scopeIn.ok) return scopeIn
  const scopeOut = text(body.scopeOut ?? '', 'Out of scope', 0, 3000); if (!scopeOut.ok) return scopeOut
  const titleEn = text(body.titleEn ?? '', 'English title', 0, 120); if (!titleEn.ok) return titleEn
  if (titleEn.value && titleEn.value.length < 5) return fail('English title must be at least 5 characters.')
  const descriptionEn = text(body.descriptionEn ?? '', 'English description', 0, 5000); if (!descriptionEn.ok) return descriptionEn
  const scopeInEn = text(body.scopeInEn ?? '', 'English in scope', 0, 3000); if (!scopeInEn.ok) return scopeInEn
  const scopeOutEn = text(body.scopeOutEn ?? '', 'English out of scope', 0, 3000); if (!scopeOutEn.ok) return scopeOutEn
  const brief = text(body.brief ?? '', 'Tester tasks', 0, 5000); if (!brief.ok) return brief
  const briefEn = text(body.briefEn ?? '', 'English tester tasks', 0, 5000); if (!briefEn.ok) return briefEn

  const rawUrl = typeof body.testUrl === 'string' ? body.testUrl.trim() : ''
  if (rawUrl && !httpsUrl(rawUrl)) return fail('Test URL must start with https://')

  const platforms = Array.isArray(body.platforms) ? [...new Set(body.platforms)] : []
  if (!platforms.length || !platforms.every((p): p is Platform => PLATFORMS.includes(p as Platform))) return fail('Choose at least one valid platform.')

  const testerSlots = Number(body.testerSlots)
  if (!Number.isInteger(testerSlots) || testerSlots < 1 || testerSlots > 500) return fail('Tester slots must be between 1 and 500.')

  const budget = usdcUnits(body.budget)
  if (budget === null || budget <= 0n) return fail('Budget must be a positive USDC amount.')

  const rawPayouts = body.payouts && typeof body.payouts === 'object' ? body.payouts as Record<string, unknown> : {}
  const payouts: Partial<Record<Severity, string>> = {}
  for (const [severity, amount] of Object.entries(rawPayouts)) {
    if (!SEVERITIES.includes(severity as Severity)) return fail(`Unknown severity: ${severity}`)
    if (amount === '' || amount === null || amount === undefined) continue
    const units = usdcUnits(amount)
    if (units === null || units <= 0n) return fail(`Payout for ${severity} must be a positive USDC amount.`)
    if (units > budget) return fail(`Payout for ${severity} cannot exceed the budget.`)
    payouts[severity as Severity] = String(amount)
  }
  if (!Object.keys(payouts).length) return fail('Set a payout for at least one severity.')
  const ordered = SEVERITIES.map((s) => payouts[s]).filter((v): v is string => v !== undefined).map((v) => usdcUnits(v) as bigint)
  if (ordered.some((value, i) => i > 0 && value > ordered[i - 1])) return fail('A more severe bug cannot pay less than a less severe one.')

  const endsAt = typeof body.endsAt === 'string' ? new Date(body.endsAt) : new Date(NaN)
  if (Number.isNaN(endsAt.getTime())) return fail('End date is invalid.')
  if (endsAt.getTime() < now.getTime() + DAY) return fail('The campaign must run for at least 1 day.')
  if (endsAt.getTime() > now.getTime() + 90 * DAY) return fail('The campaign can run for at most 90 days.')

  const responseHours = body.responseHours === undefined ? 120 : Number(body.responseHours)
  if (!Number.isInteger(responseHours) || responseHours < 24 || responseHours > 336) return fail('Response time must be between 24 and 336 hours.')

  return {
    ok: true,
    value: {
      title: title.value, productName: productName.value, description: description.value,
      scopeIn: scopeIn.value, scopeOut: scopeOut.value, testUrl: rawUrl || null, brief: brief.value || null,
      english: { title: titleEn.value || null, description: descriptionEn.value || null, scopeIn: scopeInEn.value || null, scopeOut: scopeOutEn.value || null, brief: briefEn.value || null },
      platforms: platforms as Platform[], testerSlots, budget: String(body.budget), payouts,
      endsAt: endsAt.toISOString(), responseHours,
    },
  }
}

export type BugInput = {
  title: string
  steps: string
  expected: string
  actual: string
  environment: string
  evidenceUrls: string[]
  severity: Severity
}

export function validateBugInput(input: unknown): Result<BugInput> {
  if (!input || typeof input !== 'object') return fail('Invalid bug report.')
  const body = input as Record<string, unknown>
  const title = text(body.title, 'Title', 5, 160); if (!title.ok) return title
  const steps = text(body.steps, 'Steps to reproduce', 10, 5000); if (!steps.ok) return steps
  const expected = text(body.expected, 'Expected result', 1, 2000); if (!expected.ok) return expected
  const actual = text(body.actual, 'Actual result', 1, 2000); if (!actual.ok) return actual
  const environment = text(body.environment, 'Environment', 1, 300); if (!environment.ok) return environment
  const evidenceUrls = Array.isArray(body.evidenceUrls)
    ? body.evidenceUrls.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean)
    : []
  if (evidenceUrls.length > 5) return fail('At most 5 evidence links.')
  if (!evidenceUrls.every(httpsUrl)) return fail('Evidence links must start with https://')
  if (!SEVERITIES.includes(body.severity as Severity)) return fail('Choose a severity.')
  return {
    ok: true,
    value: {
      title: title.value, steps: steps.value, expected: expected.value, actual: actual.value,
      environment: environment.value, evidenceUrls, severity: body.severity as Severity,
    },
  }
}

const transitions: Record<BugAction, Partial<Record<BugStatus, BugStatus>>> = {
  request_info: { submitted: 'needs_info' },
  reply: { needs_info: 'submitted' },
  accept: { submitted: 'accepted' },
  reject: { submitted: 'rejected' },
  timeout_accept: { submitted: 'accepted' },
  dispute: { rejected: 'disputed' },
  finalize_reject: { rejected: 'rejected_final' },
  resolve_upheld: { disputed: 'accepted' },
  resolve_dismissed: { disputed: 'rejected_final' },
  mark_paid: { accepted: 'paid' },
}

/** The next status for an action, or null when the action is not allowed from this status. */
export function nextBugStatus(status: BugStatus, action: BugAction): BugStatus | null {
  return transitions[action][status] ?? null
}

export function payoutUnits(payouts: Partial<Record<Severity, bigint>>, severity: Severity): bigint | null {
  const amount = payouts[severity]
  return amount && amount > 0n ? amount : null
}

export function maxPayoutUnits(payouts: Partial<Record<Severity, bigint>>): bigint {
  return Object.values(payouts).reduce<bigint>((max, v) => (v !== undefined && v > max ? v : max), 0n)
}

export function minPayoutUnits(payouts: Partial<Record<Severity, bigint>>): bigint {
  const values = Object.values(payouts).filter((v): v is bigint => v !== undefined && v > 0n)
  return values.length ? values.reduce((min, v) => (v < min ? v : min)) : 0n
}

/** Budget not yet promised to accepted or paid bugs. */
export function remainingBudget(budget: bigint, committed: bigint[]): bigint {
  return committed.reduce((left, amount) => left - amount, budget)
}

export function responseDueAt(from: Date, responseHours: number): Date {
  return new Date(from.getTime() + responseHours * HOUR)
}

export function disputeDueAt(from: Date): Date {
  return new Date(from.getTime() + DISPUTE_WINDOW_HOURS * HOUR)
}

export function withdrawableAt(endsAt: Date): Date {
  return new Date(endsAt.getTime() + ESCROW_GRACE_DAYS * DAY)
}

type CampaignView = { status: CampaignStatus; ownerAccountId: string; endsAt: string; testerSlots: number }

export function applyError(campaign: CampaignView, applicantId: string, hasApplied: boolean, now: Date): string | null {
  if (campaign.status !== 'open') return 'This campaign is not accepting testers.'
  if (new Date(campaign.endsAt) <= now) return 'This campaign has ended.'
  if (campaign.ownerAccountId === applicantId) return 'You cannot test your own campaign.'
  if (hasApplied) return 'You have already applied to this campaign.'
  return null
}

export function approveError(campaign: CampaignView, applicationStatus: ApplicationStatus, approvedCount: number): string | null {
  if (campaign.status !== 'open') return 'This campaign is not open.'
  if (applicationStatus !== 'pending') return 'Only pending applications can be approved.'
  if (approvedCount >= campaign.testerSlots) return 'All tester slots are filled.'
  return null
}

export function submitBugError(args: {
  campaign: CampaignView
  applicationStatus: ApplicationStatus | null
  submittedToday: number
  remaining: bigint
  minPayout: bigint
  now: Date
}): string | null {
  if (args.campaign.status !== 'open') return 'This campaign is not accepting bugs.'
  if (new Date(args.campaign.endsAt) <= args.now) return 'This campaign has ended.'
  if (args.applicationStatus !== 'approved') return 'You need an approved application to submit bugs.'
  if (args.submittedToday >= MAX_BUGS_PER_TESTER_PER_DAY) return `You can submit at most ${MAX_BUGS_PER_TESTER_PER_DAY} bugs per day to one campaign.`
  if (args.remaining < args.minPayout || args.remaining <= 0n) return 'This campaign has used its whole budget.'
  return null
}

export function rejectError(args: {
  reason: unknown
  bug: { id: string; campaignId: string; createdAt: string }
  duplicateOf: { id: string; campaignId: string; createdAt: string } | null
}): string | null {
  if (!REJECT_REASONS.includes(args.reason as RejectReason)) return 'Choose a reason for rejecting.'
  if (args.reason !== 'duplicate') return args.duplicateOf ? 'Only duplicates point to another bug.' : null
  if (!args.duplicateOf) return 'Point to the original bug this one duplicates.'
  if (args.duplicateOf.id === args.bug.id) return 'A bug cannot duplicate itself.'
  if (args.duplicateOf.campaignId !== args.bug.campaignId) return 'The original bug must be in the same campaign.'
  if (new Date(args.duplicateOf.createdAt) >= new Date(args.bug.createdAt)) return 'The original bug must have been submitted earlier.'
  return null
}

export function disputeError(status: BugStatus, disputeDue: string | null, now: Date): string | null {
  if (status !== 'rejected') return 'Only rejected bugs can be disputed.'
  if (!disputeDue || new Date(disputeDue) <= now) return 'The 3-day dispute window has passed.'
  return null
}

export function withdrawError(args: { status: CampaignStatus; endsAt: string; openBugs: number; now: Date }): string | null {
  if (args.status !== 'open' && args.status !== 'closed') return 'Nothing to withdraw for this campaign.'
  if (withdrawableAt(new Date(args.endsAt)) > args.now) return `Funds unlock ${ESCROW_GRACE_DAYS} days after the end date.`
  if (args.openBugs > 0) return 'Some bugs are still waiting for a decision, payment or dispute.'
  return null
}

export type RatingInput = { stars: number; comment: string | null }

/** A project rates the tester once per paid bug in its own campaign. */
export function validateRating(input: unknown, bug: { status: BugStatus; alreadyRated: boolean }): Result<RatingInput> {
  if (bug.status !== 'paid') return fail('You can rate the tester once the bug is paid.')
  if (bug.alreadyRated) return fail('You already rated this bug.')
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const stars = Number(body.stars)
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return fail('Choose 1 to 5 stars.')
  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
  if (comment.length > 500) return fail('Keep the comment under 500 characters.')
  return { ok: true, value: { stars, comment: comment || null } }
}

export type TesterStatsRow = {
  campaigns_tested: number | string; bugs_reported: number | string; bugs_accepted: number | string
  critical_or_high: number | string; earned: number | string; rating_avg: number | string | null; rating_count: number | string
}

/** Postgres counts come back as strings; normalize and add the acceptance rate projects look at. */
export function testerProfile(row: TesterStatsRow | null) {
  const n = (value: number | string | null | undefined) => Number(value ?? 0)
  const reported = n(row?.bugs_reported)
  const accepted = n(row?.bugs_accepted)
  return {
    campaignsTested: n(row?.campaigns_tested),
    bugsReported: reported,
    bugsAccepted: accepted,
    criticalOrHigh: n(row?.critical_or_high),
    acceptanceRate: reported ? Math.round((accepted / reported) * 100) : null,
    earned: String(n(row?.earned)),
    ratingAvg: row?.rating_avg == null ? null : Math.round(n(row.rating_avg) * 10) / 10,
    ratingCount: n(row?.rating_count),
  }
}

/** An admin cannot judge a dispute they are part of: as the campaign owner or as the tester who reported the bug. */
export function adminConflictError(adminAccountId: string, parties: { campaignOwnerId: string; testerId: string }): string | null {
  if (adminAccountId === parties.campaignOwnerId) return 'You own this campaign, so another admin must resolve this dispute.'
  if (adminAccountId === parties.testerId) return 'You reported this bug, so another admin must resolve this dispute.'
  return null
}
