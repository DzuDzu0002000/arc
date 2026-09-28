export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function api<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method || (init.body ? 'POST' : 'GET'),
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  })
  const payload = await response.json().catch(() => ({})) as { error?: string; code?: string }
  if (!response.ok) throw new ApiError(response.status, payload.error || `Request failed (${response.status}).`, payload.code)
  return payload as T
}

export const post = <T = Record<string, unknown>>(path: string, body: Record<string, unknown>) => api<T>(path, { method: 'POST', body })

// ---- Shapes returned by the API ----
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type BugStatus = 'submitted' | 'needs_info' | 'accepted' | 'rejected' | 'disputed' | 'rejected_final' | 'paid'

export type SessionInfo =
  | { authenticated: false }
  | { authenticated: true; account: { id: string; displayName: string; email: string | null; role: Role | null; circleUserId: string }; wallet: { address: string }; isAdmin: boolean }

export type Role = 'project' | 'tester'

export type Campaign = {
  id: string; title: string; productName: string; description: string; scopeIn: string; scopeOut: string; testUrl: string | null
  platforms: string[]; testerSlots: number; budget: string; endsAt: string; responseHours: number
  status: 'draft' | 'funding' | 'open' | 'closed' | 'settled'; escrowId: string; fundTx: string | null; withdrawableAt: string; createdAt: string
}

export type CampaignListItem = Campaign & { maxPayout: string; approvedTesters: number }

export type CampaignDetail = {
  campaign: Campaign
  ownerName: string
  payouts: Partial<Record<Severity, string>>
  remainingBudget: string
  escrowBalance: string | null
  approvedTesters: number
  stats: { decided: number; accepted: number; timedOut: number; overturned: number; avgResponseDays: number | null } | null
  viewer: { role: 'owner' | 'user' | 'guest'; application: { id: string; status: string } | null }
}

type Named = { accounts: { display_name: string } | null }

export type TesterProfile = {
  campaignsTested: number; bugsReported: number; bugsAccepted: number; criticalOrHigh: number
  acceptanceRate: number | null; earned: string; ratingAvg: number | null; ratingCount: number
}
export type Rating = { stars: number; comment: string | null; created_at: string }
export type TesterPage = {
  tester: { id: string; displayName: string; memberSince: string }
  profile: TesterProfile
  ratings: Array<Rating & { campaigns: { product_name: string } | null }>
}
export type ManageData = {
  campaign: Campaign
  applications: Array<{ id: string; status: string; message: string; devices: string; created_at: string; tester_account_id: string; testerProfile?: TesterProfile } & Named>
  bugs: Array<{
    id: string; title: string; status: BugStatus; severity_claimed: Severity; severity_final: Severity | null
    payout_amount: string | null; response_due_at: string | null; created_at: string; payout_tx: string | null
  } & Named>
}

export type BugView = {
  role: 'owner' | 'tester' | 'admin'
  bug: {
    id: string; title: string; steps: string; expected: string; actual: string; environment: string; evidenceUrls: string[]
    severityClaimed: Severity; severityFinal: Severity | null; status: BugStatus; rejectReason: string | null; rejectNote: string | null
    duplicateOf: string | null; responseDueAt: string | null; disputeDueAt: string | null; decidedBy: string | null
    payoutAmount: string | null; payoutTx: string | null; payoutPending: boolean; createdAt: string; testerName: string; testerId: string
  }
  rating: Rating | null
  testerProfile: TesterProfile | null
  campaign: { id: string; title: string; productName: string }
  payouts: Partial<Record<Severity, string>>
  messages: Array<{ id: string; body: string; created_at: string; author_account_id: string } & Named>
  dispute: { id: string; reason: string; status: string; resolution_note: string | null } | null
}

type Wallet = { address: string; balance: string | null }
type DisputeInfo = { id: string; status: 'open' | 'upheld' | 'dismissed'; reason: string; resolution_note: string | null; created_at: string; resolved_at: string | null }

export type TesterBug = {
  id: string; title: string; status: BugStatus; severity_claimed: Severity; severity_final: Severity | null; payout_amount: string | null
  payout_tx: string | null; response_due_at: string | null; dispute_due_at: string | null; reject_reason: string | null; reject_note: string | null
  created_at: string; campaigns: { id: string; title: string; product_name: string } | null
  disputes: DisputeInfo | DisputeInfo[] | null
}

export type TesterMe = {
  role: 'tester'
  wallet: Wallet
  applications: Array<{ id: string; status: string; created_at: string; campaigns: { id: string; title: string; product_name: string; status: string; ends_at: string } | null }>
  bugs: TesterBug[]
  profile: TesterProfile
}

export type ReviewBug = {
  id: string; campaign_id: string; title: string; status: BugStatus; severity_claimed: Severity; severity_final: Severity | null
  payout_amount: string | null; payout_tx: string | null; response_due_at: string | null; created_at: string
  accounts: { display_name: string } | null; campaign: { id: string; title?: string; product_name?: string }
  tester_ratings: { stars: number } | Array<{ stars: number }> | null
}

export type ProjectMe = {
  role: 'project'
  wallet: Wallet
  campaigns: Array<{ id: string; title: string; product_name: string; status: Campaign['status']; budget: string; ends_at: string; fund_tx: string | null; bugsToReview: number }>
  reviewQueue: ReviewBug[]
  totals: { lockedInEscrow: string; paidToTesters: string; toReview: number; awaitingSignature: number }
}

export type MeData = TesterMe | ProjectMe | { role: null; wallet: Wallet }

/** Supabase returns a one-to-one relation as an object or a one-item array depending on the schema cache. */
export const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null)
