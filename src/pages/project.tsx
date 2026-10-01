import { useState } from 'react'
import { api, one, type BugStatus, type ProjectMe } from '../api'
import { t } from '../i18n'
import { BugStatusChip, FAUCET_URL, Link, Loading, localized, SeverityChip, timeLeft, usdc, useLoad } from '../ui'

const loadProject = () => api<ProjectMe>('/api/me')

/** Project home: money in escrow, what needs attention, and the campaigns. */
export function ProjectHome() {
  const { data, error, reload } = useLoad(loadProject, [])
  if (!data) return <main className="page wide"><h1>{t('Tổng quan')}</h1><Loading error={error} onRetry={reload} /></main>
  const { totals } = data
  const urgent = data.reviewQueue
    .filter((b) => b.status === 'submitted' && b.response_due_at)
    .sort((a, b) => (a.response_due_at as string).localeCompare(b.response_due_at as string))
    .slice(0, 5)
  const drafts = data.campaigns.filter((c) => c.status === 'draft' || c.status === 'funding')

  return (
    <main className="page wide">
      <div className="row between wrap">
        <h1>{t('Tổng quan')}</h1>
        <Link to="/app/projects/new" className="btn primary">{t('Tạo chiến dịch')}</Link>
      </div>

      <section className="grid-stats">
        <div className="card stat"><span className="small muted">{t('Đang khóa trong escrow')}</span><strong>{usdc(totals.lockedInEscrow)}</strong><span className="small muted">USDC</span></div>
        <div className="card stat"><span className="small muted">{t('Đã trả cho tester')}</span><strong>{usdc(totals.paidToTesters)}</strong><span className="small muted">USDC</span></div>
        <Link to="/app/review" className="card stat"><span className="small muted">{t('Bug chờ xét')}</span><strong style={{ color: totals.toReview ? 'var(--accent)' : undefined }}>{totals.toReview}</strong><span className="small muted">{t('Xem hàng đợi')}</span></Link>
        <Link to="/app/review?tab=accepted" className="card stat"><span className="small muted">{t('Chờ ký trả tiền')}</span><strong>{totals.awaitingSignature}</strong><span className="small muted">{t('Cần xác nhận PIN')}</span></Link>
      </section>

      <section className="card row between wrap">
        <div>
          <strong>{t('Ví dự án: {amount}', { amount: data.wallet.balance === null ? '—' : `${usdc(data.wallet.balance)} USDC` })}</strong>
          <div className="small muted">{t('Nạp USDC vào ví trước, rồi nạp ngân sách từng chiến dịch vào escrow.')}</div>
        </div>
        <div className="row">
          <Link to="/app/wallet" className="btn">{t('Ví & nạp tiền')}</Link>
          <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="btn">Faucet</a>
        </div>
      </section>

      {drafts.length > 0 && (
        <section className="alert warn">
          {t('{n} chiến dịch chưa nạp escrow nên tester chưa thấy:', { n: drafts.length })}{' '}
          {drafts.map((c, i) => <span key={c.id}>{i > 0 && ', '}<Link to={`/app/projects/${c.id}`}>{localized(c.title, c.title_en)}</Link></span>)}
        </section>
      )}

      <section className="card stack">
        <div className="row between"><div className="label">{t('Sắp hết hạn xét')}</div><Link to="/app/review" className="small">{t('Tất cả bug')}</Link></div>
        {urgent.length === 0 ? <div className="muted small">{t('Không có bug nào đang chờ. Tốt lắm.')}</div> : urgent.map((b) => (
          <Link key={b.id} to={`/app/bugs/${b.id}`} className="row between divider" style={{ paddingTop: 10, textDecoration: 'none', color: 'inherit' }}>
            <div><strong>{b.title}</strong><div className="small muted">{b.campaign.product_name} · {b.accounts?.display_name}</div></div>
            <div style={{ textAlign: 'right' }}><SeverityChip severity={b.severity_claimed} /><div className="small" style={{ color: 'var(--warn-ink)' }}>{timeLeft(b.response_due_at)}</div></div>
          </Link>
        ))}
      </section>

      <section className="card stack">
        <div className="row between"><div className="label">{t('Chiến dịch')}</div><Link to="/app/projects" className="small">{t('Quản lý')}</Link></div>
        {data.campaigns.length === 0 ? <div className="muted small">{t('Chưa có chiến dịch nào.')}</div> : data.campaigns.slice(0, 5).map((c) => (
          <Link key={c.id} to={`/app/projects/${c.id}`} className="row between divider" style={{ paddingTop: 10, textDecoration: 'none', color: 'inherit' }}>
            <div><strong>{localized(c.title, c.title_en)}</strong><div className="small muted">{c.product_name} · {usdc(c.budget)} USDC · {timeLeft(c.ends_at)}</div></div>
            {c.bugsToReview > 0 ? <span className="pill st-warn">{t('{n} chờ xét', { n: c.bugsToReview })}</span> : c.fund_tx ? <span className="pill st-good">{t('Đã nạp escrow')}</span> : <span className="pill">{t('Chưa nạp')}</span>}
          </Link>
        ))}
      </section>
    </main>
  )
}

const QUEUE_TABS: Array<[string, string, BugStatus[]]> = [
  ['submitted', 'Chờ xét', ['submitted']],
  ['needs_info', 'Đã hỏi thêm', ['needs_info']],
  ['accepted', 'Chờ ký trả', ['accepted']],
  ['paid', 'Đã trả', ['paid']],
  ['closed', 'Từ chối / khiếu nại', ['rejected', 'disputed', 'rejected_final']],
]

/** Every bug reported across the project's campaigns, grouped by what the project has to do next. */
export function ReviewQueue() {
  const { data, error, reload } = useLoad(loadProject, [])
  const initial = new URLSearchParams(window.location.search).get('tab') || 'submitted'
  const [tab, setTab] = useState(QUEUE_TABS.some(([key]) => key === initial) ? initial : 'submitted')
  const [campaign, setCampaign] = useState('all')
  if (!data) return <main className="page wide"><h1>{t('Bug cần xét')}</h1><Loading error={error} onRetry={reload} /></main>

  const statuses = QUEUE_TABS.find(([key]) => key === tab)?.[2] ?? []
  const inCampaign = data.reviewQueue.filter((b) => campaign === 'all' || b.campaign_id === campaign)
  const rows = inCampaign.filter((b) => statuses.includes(b.status))
    .sort((a, b) => (a.response_due_at || a.created_at).localeCompare(b.response_due_at || b.created_at))

  return (
    <main className="page wide">
      <h1>{t('Bug cần xét')}</h1>
      <div className="row wrap between">
        <div className="tabs" role="tablist">
          {QUEUE_TABS.map(([key, label, list]) => (
            <button key={key} type="button" role="tab" className="tab-chip" aria-selected={tab === key} onClick={() => setTab(key)}>
              {t(label)} · {inCampaign.filter((b) => list.includes(b.status)).length}
            </button>
          ))}
        </div>
        <label className="row small" style={{ minWidth: 0, maxWidth: '100%' }}>
          <span className="muted">{t('Chiến dịch')}</span>
          <select className="input" style={{ minHeight: 38, width: 'auto', maxWidth: '100%', minWidth: 0 }} value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            <option value="all">{t('Tất cả')}</option>
            {data.campaigns.map((c) => <option key={c.id} value={c.id}>{c.product_name} · {localized(c.title, c.title_en)}</option>)}
          </select>
        </label>
      </div>
      {tab === 'accepted' && rows.length > 0 && <div className="alert warn">{t('Những bug này đã được chấp nhận nhưng chưa ký trả. Sau 24 giờ, nền tảng sẽ tự trả từ escrow.')}</div>}
      {rows.length === 0 ? <div className="card muted">{t('Không có bug nào ở mục này.')}</div> : rows.map((b) => (
        <Link key={b.id} to={`/app/bugs/${b.id}`} className="card stack">
          <div className="row between">
            <span className="row" style={{ gap: 6 }}><BugStatusChip status={b.status} amount={b.payout_amount} />{b.status === 'paid' && !one(b.tester_ratings) && <span className="pill st-warn">{t('Chưa đánh giá tester')}</span>}</span>
            <span className="small muted">{b.status === 'submitted' ? t('Hạn xét: {time}', { time: timeLeft(b.response_due_at) }) : b.status === 'accepted' ? t('{amount} USDC chờ ký', { amount: usdc(b.payout_amount) }) : ''}</span>
          </div>
          <strong>{b.title}</strong>
          <div className="row between small muted wrap">
            <span>{b.campaign.product_name} · {b.accounts?.display_name} · <SeverityChip severity={b.severity_final ?? b.severity_claimed} /></span>
            <span className="mono" title={t('Mã bug, dùng khi đánh dấu trùng')}>{b.id}</span>
          </div>
        </Link>
      ))}
    </main>
  )
}
