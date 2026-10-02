import { useCallback, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'
import type { BugStatus, Role, Severity } from './api'
import { getLang, locale, setLang, t, type Lang } from './i18n'

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
  // Also reload when the viewer switches language (demo data and localized content change with it).
  const run = useCallback(load, [...deps, getLang()])
  const reload = useCallback(() => {
    setError('')
    return run().then(setData).catch((e: Error) => setError(e.message))
  }, [run])
  useEffect(() => { void reload() }, [reload])
  return { data, error, reload }
}

export function Loading({ error, onRetry }: { error: string; onRetry?: () => void }) {
  if (!error) return <p className="muted" role="status">{t('Đang tải…')}</p>
  return (
    <div className="alert error" role="alert">
      {error} {onRetry && <button type="button" className="btn" style={{ minHeight: 32, marginLeft: 8 }} onClick={onRetry}>{t('Thử lại')}</button>}
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
  return <span className={`pill ${tone}`}>{status === 'paid' && amount ? t('Đã trả +{amount}', { amount: usdc(amount) }) : t(label)}</span>
}

const REJECT_TEXT: Record<string, string> = {
  duplicate: 'Trùng bug khác', out_of_scope: 'Ngoài phạm vi', cannot_reproduce: 'Không tái hiện được',
  not_a_bug: 'Không phải lỗi', low_quality: 'Báo cáo thiếu thông tin',
}
export const REJECT_REASONS = Object.keys(REJECT_TEXT)
export const rejectLabel = (reason: string | null | undefined) => (reason && REJECT_TEXT[reason] ? t(REJECT_TEXT[reason]) : reason ?? '')

export const PLATFORM_LABEL: Record<string, string> = { web: 'Web', ios: 'iOS', android: 'Android', desktop: 'Desktop', api: 'API' }

/** Content a project wrote in two languages: the English copy when the viewer picked English and one exists. */
export function localized(original: string, english?: string | null) {
  return getLang() === 'en' && english ? english : original
}

export function usdc(amount: string | null | undefined) {
  if (amount === null || amount === undefined) return '—'
  const value = Number(amount)
  return Number.isFinite(value) ? value.toLocaleString(locale(), { maximumFractionDigits: 6 }) : amount
}

export function timeLeft(iso: string | null) {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return t('đã hết hạn')
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 48) return t('còn {n} ngày', { n: Math.floor(hours / 24) })
  if (hours >= 1) return t('còn {n} giờ', { n: hours })
  return t('còn {n} phút', { n: Math.max(1, Math.floor(ms / 60_000)) })
}

/** "5 phút trước" style relative time for notifications. */
export function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return t('vừa xong')
  if (minutes < 60) return t('{n} phút trước', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('{n} giờ trước', { n: hours })
  const days = Math.floor(hours / 24)
  return days < 7 ? t('{n} ngày trước', { n: days }) : dateTime(iso)
}

export function dateTime(iso: string) {
  return new Date(iso).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })
}

const explorer = (import.meta.env.VITE_ARC_EXPLORER_URL as string | undefined) || 'https://explorer.testnet.arc.io'
/** Circle's testnet faucet: pick Arc Testnet to get USDC (Arc's gas token) or EURC. */
export const FAUCET_URL = 'https://faucet.circle.com/'
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
  home: icon(<><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>),
  scale: icon(<><path d="M12 4v16" /><path d="M7 20h10" /><path d="M5 8h14" /><path d="M5 8l-2.5 6a2.5 2.5 0 0 0 5 0z" /><path d="M19 8l-2.5 6a2.5 2.5 0 0 0 5 0z" /></>),
  faucet: icon(<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" />),
  admin: icon(<><path d="M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z" /><path d="M9 12l2 2 4-4" /></>),
  lock: icon(<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>),
}

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5EEAD4" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16" /><path d="M4 12h10" /><path d="M4 17h6" /><circle cx="18" cy="16" r="3" /></svg>
    </span>
  )
}

export function BackLink({ to, label }: { to: string; label?: string }) {
  return <Link to={to} aria-label={label ?? t('Quay lại')} className="row" style={{ width: 44, height: 44, marginLeft: -10, justifyContent: 'center', color: 'var(--ink)' }}>{Icons.back}</Link>
}

/** Which nav item a path belongs to, per role (a bug page sits under the review queue or "my bugs"). */
function section(path: string, role: Role) {
  if (path.startsWith('/app/wallet')) return '/app/wallet'
  if (path.startsWith('/app/admin')) return '/app/admin'
  if (role === 'project') {
    if (path.startsWith('/app/review') || path.startsWith('/app/bugs')) return '/app/review'
    if (path.startsWith('/app/projects') || path.startsWith('/app/c/')) return '/app/projects'
    return '/app'
  }
  if (path.startsWith('/app/work') || path.startsWith('/app/bugs')) return '/app/work'
  if (path.startsWith('/app/disputes')) return '/app/disputes'
  return '/app'
}

const NAV: Record<Role, Array<[string, string, ReactNode]>> = {
  project: [
    ['/app', 'Tổng quan', Icons.home],
    ['/app/projects', 'Chiến dịch', Icons.projects],
    ['/app/review', 'Bug cần xét', Icons.work],
    ['/app/wallet', 'Ví & nạp tiền', Icons.wallet],
  ],
  tester: [
    ['/app', 'Khám phá', Icons.explore],
    ['/app/work', 'Bug của tôi', Icons.work],
    ['/app/disputes', 'Tranh chấp', Icons.scale],
    ['/app/wallet', 'Ví', Icons.wallet],
  ],
}

/** Vertical sidebar on wide screens, bottom tab bar on phones (switched by CSS). Items depend on the account's role. */
export function AppNav({ path, role, isAdmin, notices }: { path: string; role: Role; isAdmin: boolean; notices?: ReactNode }) {
  const items = [...NAV[role]]
  if (isAdmin) items.push(['/app/admin', 'Admin', Icons.admin])
  const current = section(path, role)
  return (
    <nav className="nav" aria-label={t('Điều hướng chính')}>
      <Link to="/app" className="brand nav-brand"><BrandMark />ArcHunt</Link>
      <span className="nav-role">{role === 'project' ? t('Không gian dự án') : t('Không gian tester')}</span>
      {notices}
      <div className="nav-inner">
        {items.map(([to, label, glyph]) => (
          <Link key={to} to={to} className={to === '/app/admin' ? 'nav-extra' : undefined} aria-current={current === to ? 'page' : undefined}>
            {glyph}<span>{t(label)}</span>
          </Link>
        ))}
        <a href={FAUCET_URL} target="_blank" rel="noreferrer" title={t('Nhận USDC testnet trên Arc (mở tab mới)')}>
          {Icons.faucet}<span>Faucet</span>
        </a>
      </div>
      <Prefs className="nav-lang" />
    </nav>
  )
}

/** VI | EN toggle. App listens for the event and re-renders everything in the new language. */
export function LangSwitch({ className }: { className?: string }) {
  const lang = getLang()
  const pick = (next: Lang) => {
    if (next === lang) return
    setLang(next)
    window.dispatchEvent(new Event('archunt:lang'))
  }
  return (
    <div className={`lang-switch ${className ?? ''}`} role="group" aria-label="Language / Ngôn ngữ">
      {(['vi', 'en'] as const).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => pick(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  )
}

// ---- Light / dark theme ----
// index.html sets html[data-theme] before first paint (saved choice, else the system setting).
type Theme = 'light' | 'dark'
const THEME_KEY = 'archunt.theme'

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  useEffect(() => {
    // Follow the system while the viewer has not picked a theme.
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      let saved: string | null = null
      try { saved = localStorage.getItem(THEME_KEY) } catch { /* storage blocked */ }
      if (saved) return
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light'
      setTheme(currentTheme())
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const toggle = () => {
    document.documentElement.dataset.theme = next
    try { localStorage.setItem(THEME_KEY, next) } catch { /* storage blocked */ }
    setTheme(next)
  }
  const label = next === 'dark' ? t('Chuyển sang giao diện tối') : t('Chuyển sang giao diện sáng')
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark'
        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>}
    </button>
  )
}

/** Theme toggle + VI | EN, shown together wherever the language switch appears. */
export function Prefs({ className }: { className?: string }) {
  return <div className={`prefs ${className ?? ''}`}><ThemeToggle /><LangSwitch /></div>
}
