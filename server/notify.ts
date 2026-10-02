// In-app notifications. Sending is best effort: a failure is logged and never undoes the action that triggered it.
import { db, must } from './db.js'
import { env } from './env.js'
import type { BugAction } from './rules.js'

export type NotificationKind =
  | 'application_new' | 'application_approved' | 'application_rejected' | 'application_removed'
  | 'bug_submitted' | 'bug_info_requested' | 'bug_replied' | 'bug_accepted' | 'bug_auto_accepted' | 'bug_paid' | 'bug_rejected'
  | 'dispute_opened' | 'dispute_upheld' | 'dispute_dismissed'

type Target = { campaignId?: string | null; bugId?: string | null }

export async function notify(recipients: Array<string | null | undefined>, kind: NotificationKind, target: Target) {
  const ids = [...new Set(recipients.filter((id): id is string => Boolean(id)))]
  if (!ids.length) return
  try {
    must(await db().from('notifications').insert(ids.map((accountId) => ({
      account_id: accountId, kind, campaign_id: target.campaignId ?? null, bug_id: target.bugId ?? null,
    }))))
  } catch (error) {
    console.error('ARCHUNT_NOTIFY_ERROR', kind, (error as Error).message)
  }
}

/** Accounts of the admins configured in ADMIN_CIRCLE_USER_IDS (those who have signed in at least once). */
export async function adminAccountIds(): Promise<string[]> {
  const circleIds = env.adminCircleUserIds()
  if (!circleIds.length) return []
  const rows = must(await db().from('accounts').select('id').in('circle_user_id', circleIds)) as { id: string }[]
  return rows.map((r) => r.id)
}

type BugRef = { id: string; campaign_id: string; tester_account_id: string }

/** Who hears about each bug status change. Called after the change is saved. */
export async function notifyBugChange(bug: BugRef, act: BugAction) {
  try {
    const target = { campaignId: bug.campaign_id, bugId: bug.id }
    const owner = async () => {
      const row = must(await db().from('campaigns').select('owner_account_id').eq('id', bug.campaign_id).maybeSingle<{ owner_account_id: string }>())
      return row?.owner_account_id
    }
    switch (act) {
      case 'request_info': return notify([bug.tester_account_id], 'bug_info_requested', target)
      case 'reply': return notify([await owner()], 'bug_replied', target)
      case 'accept': return notify([bug.tester_account_id], 'bug_accepted', target)
      case 'timeout_accept': return notify([bug.tester_account_id, await owner()], 'bug_auto_accepted', target)
      case 'mark_paid': return notify([bug.tester_account_id], 'bug_paid', target)
      case 'reject': return notify([bug.tester_account_id], 'bug_rejected', target)
      case 'dispute': return notify([...(await adminAccountIds()), await owner()], 'dispute_opened', target)
      case 'resolve_upheld': return notify([bug.tester_account_id, await owner()], 'dispute_upheld', target)
      case 'resolve_dismissed': return notify([bug.tester_account_id, await owner()], 'dispute_dismissed', target)
      default: return
    }
  } catch (error) {
    console.error('ARCHUNT_NOTIFY_ERROR', act, (error as Error).message)
  }
}
