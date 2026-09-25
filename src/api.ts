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
  | { authenticated: true; account: { id: string; displayName: string; email: string | null }; wallet: { address: string }; isAdmin: boolean }

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
export type ManageData = {
  campaign: Campaign
  applications: Array<{ id: string; status: string; message: string; devices: string; created_at: string } & Named>
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
    payoutAmount: string | null; payoutTx: string | null; payoutPending: boolean; createdAt: string; testerName: string
  }
  campaign: { id: string; title: string; productName: string }
  payouts: Partial<Record<Severity, string>>
  messages: Array<{ id: string; body: string; created_at: string; author_account_id: string } & Named>
  dispute: { id: string; reason: string; status: string; resolution_note: string | null } | null
}

export type MeData = {
  wallet: { address: string; balance: string | null }
  applications: Array<{ id: string; status: string; created_at: string; campaigns: { id: string; title: string; product_name: string; status: string; ends_at: string } | null }>
  bugs: Array<{
    id: string; title: string; status: BugStatus; severity_claimed: Severity; severity_final: Severity | null; payout_amount: string | null
    payout_tx: string | null; response_due_at: string | null; dispute_due_at: string | null; reject_reason: string | null; created_at: string
    campaigns: { id: string; title: string; product_name: string } | null
  }>
  campaigns: Array<{ id: string; title: string; product_name: string; status: Campaign['status']; budget: string; ends_at: string; bugsToReview: number }>
}
