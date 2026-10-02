// Notification bell in the top-right corner, with pop-up toasts in the bottom-right corner.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, post } from './api'
import { useSession } from './App'
import { t } from './i18n'
import { localized, navigate, timeAgo } from './ui'

export type Notice = {
  id: string; kind: string; campaign_id: string | null; bug_id: string | null; created_at: string; read_at: string | null
  campaigns: { title: string; title_en: string | null; product_name: string } | null
  bugs: { title: string } | null
}

const POLL_MS = 30_000
const TOAST_MS = 7_000
const SHOWN_KEY = 'archunt.toasted'

type Tone = 'good' | 'bad' | 'info'

function describe(n: Notice): { text: string; tone: Tone } {
  const c = n.campaigns ? localized(n.campaigns.title, n.campaigns.title_en) : ''
  const b = n.bugs?.title ?? ''
  switch (n.kind) {
    case 'application_new': return { text: t('Có tester mới ứng tuyển vào "{c}"', { c }), tone: 'info' }
    case 'application_approved': return { text: t('Bạn đã được duyệt vào "{c}". Bắt đầu tìm bug nhé!', { c }), tone: 'good' }
    case 'application_rejected': return { text: t('Đơn ứng tuyển vào "{c}" bị từ chối', { c }), tone: 'bad' }
    case 'application_removed': return { text: t('Bạn đã bị gỡ khỏi "{c}"', { c }), tone: 'bad' }
    case 'bug_submitted': return { text: t('Bug mới cần xét: "{b}"', { b }), tone: 'info' }
    case 'bug_info_requested': return { text: t('Dự án cần bạn bổ sung thông tin cho bug "{b}"', { b }), tone: 'info' }
    case 'bug_replied': return { text: t('Tester đã bổ sung thông tin cho bug "{b}"', { b }), tone: 'info' }
    case 'bug_accepted': return { text: t('Bug "{b}" đã được chấp nhận', { b }), tone: 'good' }
    case 'bug_auto_accepted': return { text: t('Bug "{b}" được tự động chấp nhận vì quá hạn xét', { b }), tone: 'good' }
    case 'bug_paid': return { text: t('Bạn đã nhận thưởng cho bug "{b}"', { b }), tone: 'good' }
    case 'bug_rejected': return { text: t('Bug "{b}" bị từ chối', { b }), tone: 'bad' }
    case 'dispute_opened': return { text: t('Có khiếu nại mới cho bug "{b}"', { b }), tone: 'bad' }
    case 'dispute_upheld': return { text: t('Khiếu nại cho bug "{b}" được chấp nhận', { b }), tone: 'good' }
    case 'dispute_dismissed': return { text: t('Khiếu nại cho bug "{b}" bị bác', { b }), tone: 'bad' }
    default: return { text: t('Bạn có thông báo mới'), tone: 'info' }
  }
}

function linkFor(n: Notice, isAdmin: boolean): string {
  if (n.kind === 'dispute_opened' && isAdmin) return '/app/admin'
  if (n.bug_id) return `/app/bugs/${n.bug_id}`
  if (n.kind === 'application_new' && n.campaign_id) return `/app/projects/${n.campaign_id}`
  if (n.campaign_id) return `/app/c/${n.campaign_id}`
  return '/app'
}

function shownIds(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(SHOWN_KEY) || '[]') as string[]) } catch { return new Set() }
}
function rememberShown(ids: Set<string>) {
  try { sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...ids].slice(-200))) } catch { /* storage blocked */ }
}

const bell = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9" /><path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
)

export function Notices() {
  const { session } = useSession()
  const isAdmin = Boolean(session?.authenticated && session.isAdmin)
  const [items, setItems] = useState<Notice[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [toasts, setToasts] = useState<Notice[]>([])
  const shown = useRef(shownIds())
  const box = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<{ notifications: Notice[]; unread: number }>('/api/notifications')
      setItems(data.notifications)
      setUnread(data.unread)
      // Pop up unread notices this tab has not shown yet (newest three).
      const fresh = data.notifications.filter((n) => !n.read_at && !shown.current.has(n.id)).slice(0, 3)
      if (fresh.length) {
        fresh.forEach((n) => shown.current.add(n.id))
        rememberShown(shown.current)
        setToasts((list) => [...fresh, ...list].slice(0, 3))
        for (const n of fresh) setTimeout(() => setToasts((list) => list.filter((x) => x.id !== n.id)), TOAST_MS)
      }
    } catch { /* offline or signed out: try again on the next tick */ }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load() }, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const markRead = async (ids?: string[]) => {
    const now = new Date().toISOString()
    setItems((list) => list.map((n) => (!ids || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)))
    try { setUnread((await post<{ unread: number }>('/api/notifications', { action: 'read', ...(ids ? { ids } : {}) })).unread) } catch { /* retried on next poll */ }
  }

  const openNotice = (n: Notice) => {
    setOpen(false)
    setToasts((list) => list.filter((x) => x.id !== n.id))
    if (!n.read_at) void markRead([n.id])
    navigate(linkFor(n, isAdmin))
  }

  return (
    <>
      <div className="notices" ref={box}>
        <button type="button" className={`notice-bell${unread ? ' has-unread' : ''}`} aria-expanded={open} aria-haspopup="dialog"
          aria-label={unread ? t('Thông báo ({n} chưa đọc)', { n: unread }) : t('Thông báo')} onClick={() => setOpen(!open)}>
          {bell}<span className="notice-label">{t('Thông báo')}</span>
          {unread > 0 && <span className="notice-count">{unread > 99 ? '99+' : unread}</span>}
        </button>
        {open && (
          <div className="notice-panel" role="dialog" aria-label={t('Thông báo')}>
            <div className="row between notice-panel-head">
              <strong>{t('Thông báo')}</strong>
              {unread > 0 && <button type="button" className="link-btn" onClick={() => void markRead()}>{t('Đánh dấu đã đọc hết')}</button>}
            </div>
            {items.length === 0 ? <p className="muted small notice-empty">{t('Chưa có thông báo nào.')}</p> : (
              <ul className="notice-list">
                {items.map((n) => {
                  const { text, tone } = describe(n)
                  return (
                    <li key={n.id}>
                      <button type="button" className={`notice-item ${tone}${n.read_at ? '' : ' unread'}`} onClick={() => openNotice(n)}>
                        <i aria-hidden="true" />
                        <span>{text}<small>{timeAgo(n.created_at)}</small></span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="toasts" aria-live="polite">
        {toasts.map((n) => {
          const { text, tone } = describe(n)
          return (
            <div key={n.id} className={`toast ${tone}`}>
              <button type="button" className="toast-body" onClick={() => openNotice(n)}><i aria-hidden="true" />{text}</button>
              <button type="button" className="toast-close" aria-label={t('Đóng')} onClick={() => setToasts((list) => list.filter((x) => x.id !== n.id))}>×</button>
            </div>
          )
        })}
      </div>
    </>
  )
}
