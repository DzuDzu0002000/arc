import { useCallback, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'
import type { BugStatus, Severity } from './api'

// ---- Tiny router (pushState + popstate) ----
export function navigate(to: string) {
  window.history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo(0, 0)
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return path
}

export function Link({ to, children, ...rest }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={to} {...rest} onClick={(event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
      event.preventDefault()
      navigate(to)
    }}>{children}</a>
  )
}

// ---- Data loading ----
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)
  const reload = useCallback(() => {
    setError('')
    return run().then(setData).catch((e: Error) => setError(e.message))
  }, [run])
  useEffect(() => { void reload() }, [reload])
  return { data, error, reload }
}

export function Loading({ error, onRetry }: { error: string; onRetry?: () => void }) {
  if (!error) return <p className="muted" role="status">Đang tải…</p>
  return (
    <div className="alert error" role="alert">
      {error} {onRetry && <button type="button" className="btn" style={{ minHeight: 32, marginLeft: 8 }} onClick={onRetry}>Thử lại</button>}
    </div>
  )
}

// ---- Formatting ----
const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low']

export function SeverityChip({ severity }: { severity: Severity }) {
  return <span className={`pill sev-${severity}`}>{SEVERITY_LABEL[severity]}</span>
}

const BUG_STATUS: Record<BugStatus, [string, string]> = {
  submitted: ['Chờ xét', ''],
  needs_info: ['Cần thêm thông tin', 'st-warn'],
  accepted: ['Đã chấp nhận, đang trả', 'st-good'],
  paid: ['Đã trả', 'st-good'],
  rejected: ['Bị từ chối', 'st-bad'],
  disputed: ['Đang khiếu nại', 'st-warn'],
  rejected_final: ['Từ chối (chốt)', 'st-bad'],
}

export function BugStatusChip({ status, amount }: { status: BugStatus; amount?: string | null }) {
  const [label, tone] = BUG_STATUS[status]
  return <span className={`pill ${tone}`}>{status === 'paid' && amount ? `Đã trả +${usdc(amount)}` : label}</span>
}

export const REJECT_LABEL: Record<string, string> = {
  duplicate: 'Trùng bug khác', out_of_scope: 'Ngoài phạm vi', cannot_reproduce: 'Không tái hiện được',
  not_a_bug: 'Không phải lỗi', low_quality: 'Báo cáo thiếu thông tin',
}

export const PLATFORM_LABEL: Record<string, string> = { web: 'Web', ios: 'iOS', android: 'Android', desktop: 'Desktop', api: 'API' }

export function usdc(amount: string | null | undefined) {
  if (amount === null || amount === undefined) return '—'
  const value = Number(amount)
  return Number.isFinite(value) ? value.toLocaleString('vi-VN', { maximumFractionDigits: 6 }) : amount
}

export function timeLeft(iso: string | null) {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'đã hết hạn'
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 48) return `còn ${Math.floor(hours / 24)} ngày`
  if (hours >= 1) return `còn ${hours} giờ`
  return `còn ${Math.max(1, Math.floor(ms / 60_000))} phút`
}

export function dateTime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })
}

const explorer = (import.meta.env.VITE_ARC_EXPLORER_URL as string | undefined) || 'https://explorer.testnet.arc.io'
export const txUrl = (hash: string) => `${explorer}/tx/${hash}`
export const addressUrl = (address: string) => `${explorer}/address/${address}`
export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

// ---- Icons (stroke, currentColor) ----
const icon = (d: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
export const Icons = {
  explore: icon(<><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>),
  work: icon(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 13l2 2 4-4" /></>),
  projects: icon(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />),
  wallet: icon(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M16 14.5h2" /></>),
  back: icon(<path d="M15 18l-6-6 6-6" />),
  lock: icon(<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>),
}

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5EEAD4" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16" /><path d="M4 12h10" /><path d="M4 17h6" /><circle cx="18" cy="16" r="3" /></svg>
    </span>
  )
}

export function BackLink({ to, label = 'Quay lại' }: { to: string; label?: string }) {
  return <Link to={to} aria-label={label} className="row" style={{ width: 44, height: 44, marginLeft: -10, justifyContent: 'center', color: 'var(--ink)' }}>{Icons.back}</Link>
}

export function BottomNav({ path }: { path: string }) {
  const items: Array<[string, string, ReactNode]> = [
    ['/app', 'Khám phá', Icons.explore],
    ['/app/work', 'Công việc', Icons.work],
    ['/app/projects', 'Dự án', Icons.projects],
    ['/app/wallet', 'Ví', Icons.wallet],
  ]
  const current = items.filter(([to]) => path === to || path.startsWith(`${to}/`)).sort((a, b) => b[0].length - a[0].length)[0]?.[0]
  return (
    <nav className="nav" aria-label="Điều hướng chính">
      <div className="nav-inner">
        {items.map(([to, label, glyph]) => (
          <Link key={to} to={to} aria-current={current === to ? 'page' : undefined}>{glyph}{label}</Link>
        ))}
      </div>
    </nav>
  )
}
