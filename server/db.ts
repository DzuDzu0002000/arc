import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env.js'

let client: SupabaseClient | null = null

export function db(): SupabaseClient {
  client ??= createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

/** Unwraps a Supabase result, turning database errors into thrown errors (reported as a generic 502). */
export function must<T>(result: { data: T; error: PostgrestError | null }): T {
  if (result.error) throw new Error(`Database error ${result.error.code}: ${result.error.message}`)
  return result.data
}

export type Role = 'project' | 'tester'
export type AccountRow = { id: string; circle_user_id: string; email: string | null; display_name: string; role: Role | null }
export type WalletRow = { account_id: string; circle_wallet_id: string; address: string }
export type CampaignRow = {
  id: string; owner_account_id: string; job_type: string; title: string; product_name: string; description: string
  scope_in: string; scope_out: string; title_en: string | null; description_en: string | null; scope_in_en: string | null; scope_out_en: string | null; tester_brief: string | null; tester_brief_en: string | null
  test_url: string | null; platforms: string[]; tester_slots: number
  budget: string; ends_at: string; response_hours: number; status: 'draft' | 'funding' | 'open' | 'closed' | 'settled'
  escrow_id: `0x${string}`; fund_challenge_id: string | null; fund_tx: string | null
  withdraw_challenge_id: string | null; withdraw_tx: string | null
  opened_at: string | null; closed_at: string | null; created_at: string; updated_at: string
}
export type PayoutRow = { campaign_id: string; severity: 'critical' | 'high' | 'medium' | 'low'; amount: string }
export type ApplicationRow = {
  id: string; campaign_id: string; tester_account_id: string; message: string; devices: string
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'removed'; decided_at: string | null; created_at: string
}
export type BugRow = {
  id: string; campaign_id: string; tester_account_id: string; title: string; steps: string; expected: string; actual: string
  environment: string; evidence_urls: string[]; severity_claimed: PayoutRow['severity']; severity_final: PayoutRow['severity'] | null
  status: 'submitted' | 'needs_info' | 'accepted' | 'rejected' | 'disputed' | 'rejected_final' | 'paid'
  reject_reason: string | null; reject_note: string | null; duplicate_of: string | null
  response_due_at: string | null; dispute_due_at: string | null; decided_at: string | null; decided_by: 'owner' | 'timeout' | 'admin' | null
  payout_amount: string | null; payout_challenge_id: string | null; payout_tx: string | null; paid_at: string | null
  created_at: string; updated_at: string
}
