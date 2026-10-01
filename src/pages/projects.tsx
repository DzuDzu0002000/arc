import { useState, type FormEvent } from 'react'
import { api, post, type ManageData, type ProjectMe, type Severity } from '../api'
import { ReauthRequired, signAndConfirm } from '../circle'
import { t } from '../i18n'
import { TesterCard } from './tester-profile'
import {
  BackLink, BugStatusChip, Link, Loading, localized, navigate, PLATFORM_LABEL, SEVERITY_ORDER, SeverityChip, timeLeft, txUrl, usdc, useLoad,
} from '../ui'

const CAMPAIGN_STATUS: Record<string, string> = {
  draft: 'Bản nháp', funding: 'Đang nạp escrow', open: 'Đang mở', closed: 'Đã đóng', settled: 'Đã tất toán',
}
const APPLICATION_STATUS: Record<string, string> = {
  pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Không duyệt', withdrawn: 'Đã rút', removed: 'Bị loại',
}

export function MyProjects() {
  const { data, error, reload } = useLoad(() => api<ProjectMe>('/api/me'), [])
  return (
    <main className="page">
      <div className="row between"><h1>{t('Chiến dịch')}</h1><Link to="/app/projects/new" className="btn primary">{t('Tạo chiến dịch')}</Link></div>
      {!data ? <Loading error={error} onRetry={reload} /> : data.campaigns.length === 0 ? (
        <div className="card muted">{t('Bạn chưa tạo chiến dịch nào. Tạo chiến dịch, nạp ngân sách USDC vào escrow, rồi duyệt tester.')}</div>
      ) : data.campaigns.map((c) => (
        <Link key={c.id} to={`/app/projects/${c.id}`} className="card stack">
          <div className="row between small"><span className="muted">{c.product_name}</span><span className="pill">{t(CAMPAIGN_STATUS[c.status])}</span></div>
          <strong>{localized(c.title, c.title_en)}</strong>
          <div className="row between small muted">
            <span>{t('Ngân sách {amount} USDC', { amount: usdc(c.budget) })} · {timeLeft(c.ends_at)}</span>
            {c.bugsToReview > 0 && <span className="pill st-warn">{t('{n} bug chờ xét', { n: c.bugsToReview })}</span>}
          </div>
        </Link>
      ))}
    </main>
  )
}

function defaultEnd() {
  const date = new Date(Date.now() + 14 * 86_400_000)
  return date.toISOString().slice(0, 10)
}

export function NewCampaign() {
  const [form, setForm] = useState({
    title: '', productName: '', description: '', scopeIn: '', scopeOut: '', testUrl: '',
    titleEn: '', descriptionEn: '', scopeInEn: '', scopeOutEn: '',
    testerSlots: '10', budget: '', endDate: defaultEnd(), responseDays: '5',
  })
  const [platforms, setPlatforms] = useState<string[]>(['web'])
  const [payouts, setPayouts] = useState<Record<Severity, string>>({ critical: '100', high: '50', medium: '20', low: '5' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await post<{ id: string }>('/api/campaigns', {
        action: 'create', title: form.title, productName: form.productName, description: form.description,
        scopeIn: form.scopeIn, scopeOut: form.scopeOut, testUrl: form.testUrl, platforms,
        titleEn: form.titleEn, descriptionEn: form.descriptionEn, scopeInEn: form.scopeInEn, scopeOutEn: form.scopeOutEn,
        testerSlots: Number(form.testerSlots), budget: form.budget,
        payouts: Object.fromEntries(Object.entries(payouts).filter(([, v]) => v.trim())),
        endsAt: new Date(`${form.endDate}T23:59:00`).toISOString(), responseHours: Number(form.responseDays) * 24,
      })
      navigate(`/app/projects/${result.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <BackLink to="/app/projects" />
      <h1>{t('Tạo chiến dịch test')}</h1>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <section className="card stack" style={{ gap: 14 }}>
          <div className="label">{t('1 · Thông tin')}</div>
          <label className="field"><span>{t('Tên sản phẩm')}</span><input className="input" required maxLength={80} value={form.productName} onChange={set('productName')} /></label>
          <label className="field"><span>{t('Tiêu đề chiến dịch')}</span><input className="input" required minLength={5} maxLength={120} value={form.title} onChange={set('title')} placeholder={t('Test luồng đăng nhập và trả lời đa ngôn ngữ')} /></label>
          <label className="field"><span>{t('Giới thiệu')}</span><textarea className="input" rows={3} maxLength={5000} value={form.description} onChange={set('description')} /></label>
          <label className="field"><span>{t('Phạm vi test')}</span><textarea className="input" rows={3} maxLength={3000} value={form.scopeIn} onChange={set('scopeIn')} /></label>
          <label className="field"><span>{t('Ngoài phạm vi')}</span><textarea className="input" rows={2} maxLength={3000} value={form.scopeOut} onChange={set('scopeOut')} /></label>
          <label className="field"><span>{t('Link sản phẩm (https)')}</span><input className="input" type="url" value={form.testUrl} onChange={set('testUrl')} /></label>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('Nền tảng')}</legend>
            <div className="row wrap" style={{ gap: 8 }}>
              {Object.entries(PLATFORM_LABEL).map(([value, label]) => (
                <button key={value} type="button" className="tab-chip" aria-pressed={platforms.includes(value)}
                  style={platforms.includes(value) ? { background: 'var(--solid)', color: 'var(--on-solid)', borderColor: 'var(--solid)' } : undefined}
                  onClick={() => setPlatforms(platforms.includes(value) ? platforms.filter((p) => p !== value) : [...platforms, value])}>{label}</button>
              ))}
            </div>
          </fieldset>
        </section>

        <details className="card stack" style={{ gap: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('Bản tiếng Anh (không bắt buộc)')}</summary>
          <p className="small muted" style={{ margin: '8px 0 0' }}>{t('Người xem chọn English sẽ thấy nội dung này. Bỏ trống thì hiện bản gốc.')}</p>
          <div className="stack" style={{ gap: 14, marginTop: 12 }}>
            <label className="field"><span>{t('Tiêu đề (tiếng Anh)')}</span><input className="input" maxLength={120} value={form.titleEn} onChange={set('titleEn')} placeholder="Test sign-in and multilingual answers" /></label>
            <label className="field"><span>{t('Giới thiệu (tiếng Anh)')}</span><textarea className="input" rows={3} maxLength={5000} value={form.descriptionEn} onChange={set('descriptionEn')} /></label>
            <label className="field"><span>{t('Phạm vi test (tiếng Anh)')}</span><textarea className="input" rows={3} maxLength={3000} value={form.scopeInEn} onChange={set('scopeInEn')} /></label>
            <label className="field"><span>{t('Ngoài phạm vi (tiếng Anh)')}</span><textarea className="input" rows={2} maxLength={3000} value={form.scopeOutEn} onChange={set('scopeOutEn')} /></label>
          </div>
        </details>

        <section className="card stack" style={{ gap: 14 }}>
          <div className="label">{t('2 · Tiền thưởng & thời gian')}</div>
          <div className="grid2">
            {SEVERITY_ORDER.map((s) => (
              <label key={s} className="field"><span><SeverityChip severity={s} /> USDC / bug</span>
                <input className="input" inputMode="decimal" value={payouts[s]} onChange={(e) => setPayouts({ ...payouts, [s]: e.target.value })} placeholder={t('Để trống nếu không trả')} />
              </label>
            ))}
          </div>
          <div className="grid2">
            <label className="field"><span>{t('Ngân sách tổng (USDC)')}</span><input className="input" required inputMode="decimal" value={form.budget} onChange={set('budget')} placeholder="1200" /></label>
            <label className="field"><span>{t('Số tester tối đa')}</span><input className="input" required type="number" min={1} max={500} value={form.testerSlots} onChange={set('testerSlots')} /></label>
            <label className="field"><span>{t('Ngày kết thúc')}</span><input className="input" required type="date" value={form.endDate} onChange={set('endDate')} /></label>
            <label className="field"><span>{t('Hạn xét mỗi bug (ngày)')}</span><input className="input" required type="number" min={1} max={14} value={form.responseDays} onChange={set('responseDays')} /></label>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {t('Quá hạn xét, bug tự được chấp nhận ở mức tester khai. Tiền còn lại rút được 14 ngày sau ngày kết thúc. Bảng giá bị khóa khi chiến dịch mở.')}
          </p>
        </section>

        {error && <div className="alert error" role="alert">{error}</div>}
        <button type="submit" className="btn primary block" disabled={busy}>{busy ? t('Đang lưu…') : t('Lưu bản nháp và tiếp tục')}</button>
      </form>
    </main>
  )
}

export function ManageCampaign({ id }: { id: string }) {
  const { data, error, reload } = useLoad(() => api<ManageData>(`/api/campaigns?id=${id}&view=manage`), [id])
  const [tab, setTab] = useState<'bugs' | 'applications'>('bugs')
  const [busy, setBusy] = useState('')
  const [actionError, setActionError] = useState('')
  const [reauth, setReauth] = useState(false)

  if (!data) return <main className="page"><BackLink to="/app/projects" /><Loading error={error} onRetry={reload} /></main>
  const c = data.campaign
  const toReview = data.bugs.filter((b) => b.status === 'submitted').length

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label)
    setActionError('')
    setReauth(false)
    try { await fn(); await reload() } catch (e) {
      if (e instanceof ReauthRequired) setReauth(true)
      else setActionError((e as Error).message)
    } finally { setBusy('') }
  }

  const fund = () => run('fund', () => signAndConfirm(
    () => post<{ challengeId: string }>('/api/campaigns', { action: 'start-funding', id }),
    () => post<{ pending?: boolean; failed?: boolean }>('/api/campaigns', { action: 'confirm-funding', id }),
  ))
  const withdraw = () => run('withdraw', () => signAndConfirm(
    () => post<{ challengeId: string }>('/api/campaigns', { action: 'start-withdraw', id }),
    () => post<{ pending?: boolean; failed?: boolean }>('/api/campaigns', { action: 'confirm-withdraw', id }),
  ))
  const decide = (appId: string, act: 'approve' | 'reject' | 'remove') => run(appId, () => post('/api/applications', { action: act, id: appId }))

  return (
    <main className="page">
      <BackLink to="/app/projects" />
      <div className="stack">
        <div className="row between small muted"><span>{c.productName}</span><span className="pill">{t(CAMPAIGN_STATUS[c.status])}</span></div>
        <h1>{localized(c.title, c.english.title)}</h1>
        <div className="small muted">{t('Ngân sách {amount} USDC', { amount: usdc(c.budget) })} · {t('kết thúc: {time}', { time: timeLeft(c.endsAt) })}{c.fundTx && <> · <a href={txUrl(c.fundTx)} target="_blank" rel="noreferrer">{t('Giao dịch nạp')}</a></>}</div>
      </div>

      {reauth && <div className="alert warn" role="alert">{t('Phiên ký Circle đã hết hạn.')} <Link to={`/auth?next=/app/projects/${id}`}>{t('Đăng nhập lại')}</Link></div>}
      {actionError && <div className="alert error" role="alert">{actionError}</div>}

      {(c.status === 'draft' || c.status === 'funding') && (
        <section className="card stack">
          <strong>{t('Nạp {amount} USDC vào escrow để mở chiến dịch', { amount: usdc(c.budget) })}</strong>
          <p className="small muted" style={{ margin: 0 }}>{t('Một lần xác nhận PIN: duyệt đúng số tiền và nạp vào hợp đồng. Tester chỉ thấy chiến dịch sau khi tiền đã nằm trong escrow.')}</p>
          <button type="button" className="btn primary block" disabled={!!busy} onClick={fund}>{busy === 'fund' ? t('Đang chờ xác nhận…') : t('Nạp escrow và mở chiến dịch')}</button>
        </section>
      )}

      {(c.status === 'open' || c.status === 'closed') && (
        <div className="row wrap">
          <Link to={`/app/c/${c.id}`} className="btn">{t('Xem trang công khai')}</Link>
          {c.status === 'open' && <button type="button" className="btn" disabled={!!busy} onClick={() => run('close', () => post('/api/campaigns', { action: 'close', id }))}>{t('Đóng sớm')}</button>}
          {new Date(c.withdrawableAt) <= new Date() && <button type="button" className="btn" disabled={!!busy} onClick={withdraw}>{t('Rút tiền còn lại')}</button>}
        </div>
      )}

      <div className="tabs" role="tablist">
        <button type="button" role="tab" className="tab-chip" aria-selected={tab === 'bugs'} onClick={() => setTab('bugs')}>{t('Bug · {n} chờ xét', { n: toReview })}</button>
        <button type="button" role="tab" className="tab-chip" aria-selected={tab === 'applications'} onClick={() => setTab('applications')}>
          {t('Đơn ứng tuyển · {n} mới', { n: data.applications.filter((a) => a.status === 'pending').length })}
        </button>
      </div>

      {tab === 'bugs' ? (
        data.bugs.length === 0 ? <div className="card muted">{t('Chưa có bug nào.')}</div> : [...data.bugs]
          .sort((a, b) => (a.status === 'submitted' ? 0 : 1) - (b.status === 'submitted' ? 0 : 1) || (a.response_due_at || '').localeCompare(b.response_due_at || ''))
          .map((b) => (
            <Link key={b.id} to={`/app/bugs/${b.id}`} className="card stack">
              <div className="row between"><BugStatusChip status={b.status} amount={b.payout_amount} /><span className="small muted">{b.status === 'submitted' ? t('Hạn xét: {time}', { time: timeLeft(b.response_due_at) }) : ''}</span></div>
              <strong>{b.title}</strong>
              <div className="row between small muted">
                <span>{b.accounts?.display_name} · <SeverityChip severity={b.severity_final ?? b.severity_claimed} /></span>
                <span className="mono" title={t('Mã bug, dùng khi đánh dấu trùng')}>{b.id}</span>
              </div>
            </Link>
          ))
      ) : (
        data.applications.length === 0 ? <div className="card muted">{t('Chưa có ai ứng tuyển.')}</div> : data.applications.map((a) => (
          <div key={a.id} className="card stack">
            <div className="row between"><span className="label">{t('Hồ sơ tester')}</span><span className="pill">{t(APPLICATION_STATUS[a.status] ?? a.status)}</span></div>
            {a.testerProfile
              ? <TesterCard id={a.tester_account_id} name={a.accounts?.display_name || 'Tester'} profile={a.testerProfile} compact />
              : <strong>{a.accounts?.display_name || 'Tester'}</strong>}
            {a.message && <div className="pre small">{a.message}</div>}
            {a.devices && <div className="small muted">{t('Thiết bị: {devices}', { devices: a.devices })}</div>}
            {a.status === 'pending' && (
              <div className="row">
                <button type="button" className="btn primary" disabled={!!busy} onClick={() => decide(a.id, 'approve')}>{t('Duyệt')}</button>
                <button type="button" className="btn" disabled={!!busy} onClick={() => decide(a.id, 'reject')}>{t('Không duyệt')}</button>
              </div>
            )}
            {a.status === 'approved' && <button type="button" className="btn danger" disabled={!!busy} onClick={() => decide(a.id, 'remove')}>{t('Loại khỏi chiến dịch')}</button>}
          </div>
        ))
      )}
    </main>
  )
}
