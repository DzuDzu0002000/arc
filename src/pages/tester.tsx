import { useState } from 'react'
import { api, one, type BugStatus, type TesterBug, type TesterMe } from '../api'
import { useSession } from '../App'
import { t } from '../i18n'
import { Stars } from './tester-profile'
import { BugStatusChip, dateTime, Link, Loading, rejectLabel, SeverityChip, timeLeft, usdc, useLoad } from '../ui'

const loadTester = () => api<TesterMe>('/api/me')

const BUG_TABS: Array<[string, string, BugStatus[]]> = [
  ['all', 'Tất cả', []],
  ['waiting', 'Chờ xét', ['submitted']],
  ['needs_info', 'Cần bổ sung', ['needs_info']],
  ['paid', 'Được trả', ['accepted', 'paid']],
  ['rejected', 'Bị từ chối', ['rejected', 'disputed', 'rejected_final']],
]

function BugCard({ bug }: { bug: TesterBug }) {
  const dispute = one(bug.disputes)
  const note = bug.status === 'submitted' ? t('Hạn xét: {time}', { time: timeLeft(bug.response_due_at) })
    : bug.status === 'needs_info' ? t('Dự án cần bạn bổ sung')
    : bug.status === 'rejected' ? `${rejectLabel(bug.reject_reason)} · ${t('Hạn khiếu nại: {time}', { time: timeLeft(bug.dispute_due_at) })}`
    : bug.status === 'disputed' ? t('Admin đang xem khiếu nại')
    : dispute ? (dispute.status === 'upheld' ? t('Khiếu nại thắng') : t('Khiếu nại bị bác')) : ''
  return (
    <Link to={`/app/bugs/${bug.id}`} className="card stack">
      <div className="row between wrap"><BugStatusChip status={bug.status} amount={bug.payout_amount} /><span className="small muted">{note}</span></div>
      <strong>{bug.title}</strong>
      <div className="small muted">{bug.campaigns?.product_name} · <SeverityChip severity={bug.severity_final ?? bug.severity_claimed} /> · {dateTime(bug.created_at)}</div>
    </Link>
  )
}

/** Tester: every bug they reported, filterable by where it stands. */
export function MyBugs() {
  const { session } = useSession()
  const { data, error, reload } = useLoad(loadTester, [])
  const [tab, setTab] = useState('all')
  if (!data) return <main className="page wide"><h1>{t('Bug của tôi')}</h1><Loading error={error} onRetry={reload} /></main>

  const earned = data.bugs.filter((b) => b.status === 'paid').reduce((sum, b) => sum + Number(b.payout_amount || 0), 0)
  const accepted = data.bugs.filter((b) => b.status === 'paid' || b.status === 'accepted').length
  const statuses = BUG_TABS.find(([key]) => key === tab)?.[2] ?? []
  const rows = statuses.length ? data.bugs.filter((b) => statuses.includes(b.status)) : data.bugs
  const approved = data.applications.filter((a) => a.status === 'approved' && a.campaigns)
  const pending = data.applications.filter((a) => a.status === 'pending' && a.campaigns)

  return (
    <main className="page wide">
      <div className="row between wrap">
        <h1>{t('Bug của tôi')}</h1>
        {data.profile && (
          <Link to={`/app/testers/${session?.authenticated ? session.account.id : ''}`} className="row small" style={{ gap: 6 }}>
            {data.profile.ratingAvg !== null ? <><Stars value={data.profile.ratingAvg} /><strong>{data.profile.ratingAvg.toFixed(1)}</strong></> : null}
            <span>{t('Hồ sơ của tôi')}</span>
          </Link>
        )}
      </div>
      <div className="card row between wrap" style={{ background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' }}>
        <div><div className="small" style={{ color: '#b9bdc6' }}>{t('Đã nhận từ bug')}</div><strong style={{ fontFamily: 'var(--display)', fontSize: 30 }}>{usdc(String(earned))} USDC</strong></div>
        <div className="small" style={{ color: '#b9bdc6', textAlign: 'right' }}>{t('{n} bug đã gửi · {m} được chấp nhận', { n: data.bugs.length, m: accepted })}<br />{t('{n} chiến dịch đang tham gia', { n: approved.length })}</div>
      </div>

      {approved.length > 0 && (
        <div className="row wrap small">
          <span className="muted">{t('Gửi bug mới cho:')}</span>
          {approved.map((a) => <Link key={a.id} to={`/app/c/${a.campaigns!.id}/report`} className="pill" style={{ textDecoration: 'none' }}>+ {a.campaigns!.product_name}</Link>)}
        </div>
      )}

      <div className="tabs" role="tablist">
        {BUG_TABS.map(([key, label, list]) => (
          <button key={key} type="button" role="tab" className="tab-chip" aria-selected={tab === key} onClick={() => setTab(key)}>
            {t(label)} · {list.length ? data.bugs.filter((b) => list.includes(b.status)).length : data.bugs.length}
          </button>
        ))}
      </div>
      {rows.length === 0 ? <div className="card muted">{t('Không có bug nào ở mục này.')} <Link to="/app">{t('Tìm chiến dịch')}</Link></div> : rows.map((b) => <BugCard key={b.id} bug={b} />)}

      {pending.length > 0 && (
        <section className="card stack">
          <div className="label">{t('Đơn ứng tuyển đang chờ duyệt')}</div>
          {pending.map((a) => <Link key={a.id} to={`/app/c/${a.campaigns!.id}`}>{a.campaigns!.product_name} · {a.campaigns!.title}</Link>)}
        </section>
      )}
    </main>
  )
}

/** Tester: rejected bugs that can still be disputed, open disputes, and past outcomes. */
export function MyDisputes() {
  const { data, error, reload } = useLoad(loadTester, [])
  if (!data) return <main className="page wide"><h1>{t('Tranh chấp')}</h1><Loading error={error} onRetry={reload} /></main>

  const canDispute = data.bugs.filter((b) => b.status === 'rejected' && b.dispute_due_at && new Date(b.dispute_due_at) > new Date())
  const withDispute = data.bugs.filter((b) => one(b.disputes))
  const open = withDispute.filter((b) => one(b.disputes)?.status === 'open')
  const done = withDispute.filter((b) => one(b.disputes)?.status !== 'open')

  return (
    <main className="page wide">
      <h1>{t('Tranh chấp')}</h1>
      <p className="muted" style={{ margin: 0 }}>{t('Bug bị từ chối có 3 ngày để khiếu nại, mỗi bug một lần. Admin xem xét và có thể trả tiền cho bạn từ escrow.')}</p>

      <section className="stack">
        <div className="label">{t('Có thể khiếu nại')} · {canDispute.length}</div>
        {canDispute.length === 0 ? <div className="card muted small">{t('Không có bug nào đang trong hạn khiếu nại.')}</div> : canDispute.map((b) => (
          <div key={b.id} className="card stack">
            <div className="row between wrap"><BugStatusChip status={b.status} /><span className="small" style={{ color: 'var(--warn-ink)' }}>{t('Hạn khiếu nại: {time}', { time: timeLeft(b.dispute_due_at) })}</span></div>
            <strong>{b.title}</strong>
            <div className="small muted">{b.campaigns?.product_name} · {t('Lý do: {reason}', { reason: rejectLabel(b.reject_reason) })}{b.reject_note ? ` — ${b.reject_note}` : ''}</div>
            <Link to={`/app/bugs/${b.id}`} className="btn" style={{ alignSelf: 'flex-start' }}>{t('Xem và khiếu nại')}</Link>
          </div>
        ))}
      </section>

      <section className="stack">
        <div className="label">{t('Đang chờ admin')} · {open.length}</div>
        {open.length === 0 ? <div className="card muted small">{t('Không có khiếu nại nào đang mở.')}</div> : open.map((b) => (
          <Link key={b.id} to={`/app/bugs/${b.id}`} className="card stack">
            <div className="row between wrap"><span className="pill st-warn">{t('Đang khiếu nại')}</span><span className="small muted">{t('Gửi lúc {time}', { time: dateTime(one(b.disputes)!.created_at) })}</span></div>
            <strong>{b.title}</strong>
            <div className="small muted pre">{one(b.disputes)!.reason}</div>
          </Link>
        ))}
      </section>

      <section className="stack">
        <div className="label">{t('Đã xử lý')} · {done.length}</div>
        {done.length === 0 ? <div className="card muted small">{t('Chưa có khiếu nại nào được xử lý.')}</div> : done.map((b) => {
          const d = one(b.disputes)!
          return (
            <Link key={b.id} to={`/app/bugs/${b.id}`} className="card stack">
              <div className="row between wrap">
                <span className={`pill ${d.status === 'upheld' ? 'st-good' : 'st-bad'}`}>{d.status === 'upheld' ? t('Thắng · +{amount} USDC', { amount: usdc(b.payout_amount) }) : t('Bị bác')}</span>
                {d.resolved_at && <span className="small muted">{dateTime(d.resolved_at)}</span>}
              </div>
              <strong>{b.title}</strong>
              {d.resolution_note && <div className="small muted pre">{t('Admin: {note}', { note: d.resolution_note })}</div>}
            </Link>
          )
        })}
      </section>
    </main>
  )
}
