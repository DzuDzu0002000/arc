import { useState, type FormEvent } from 'react'
import { api, post, type ManageData, type MeData, type Severity } from '../api'
import { ReauthRequired, signAndConfirm } from '../circle'
import {
  BackLink, BugStatusChip, Link, Loading, navigate, PLATFORM_LABEL, SEVERITY_ORDER, SeverityChip, timeLeft, txUrl, usdc, useLoad,
} from '../ui'

const CAMPAIGN_STATUS: Record<string, string> = {
  draft: 'Bản nháp', funding: 'Đang nạp escrow', open: 'Đang mở', closed: 'Đã đóng', settled: 'Đã tất toán',
}

export function MyProjects() {
  const { data, error, reload } = useLoad(() => api<MeData>('/api/me'), [])
  return (
    <main className="page">
      <div className="row between"><h1>Dự án của tôi</h1><Link to="/app/projects/new" className="btn primary">Tạo chiến dịch</Link></div>
      {!data ? <Loading error={error} onRetry={reload} /> : data.campaigns.length === 0 ? (
        <div className="card muted">Bạn chưa tạo chiến dịch nào. Tạo chiến dịch, nạp ngân sách USDC vào escrow, rồi duyệt tester.</div>
      ) : data.campaigns.map((c) => (
        <Link key={c.id} to={`/app/projects/${c.id}`} className="card stack">
          <div className="row between small"><span className="muted">{c.product_name}</span><span className="pill">{CAMPAIGN_STATUS[c.status]}</span></div>
          <strong>{c.title}</strong>
          <div className="row between small muted">
            <span>Ngân sách {usdc(c.budget)} USDC · {timeLeft(c.ends_at)}</span>
            {c.bugsToReview > 0 && <span className="pill st-warn">{c.bugsToReview} bug chờ xét</span>}
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
      <h1>Tạo chiến dịch test</h1>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <section className="card stack" style={{ gap: 14 }}>
          <div className="label">1 · Thông tin</div>
          <label className="field"><span>Tên sản phẩm</span><input className="input" required maxLength={80} value={form.productName} onChange={set('productName')} /></label>
          <label className="field"><span>Tiêu đề chiến dịch</span><input className="input" required minLength={5} maxLength={120} value={form.title} onChange={set('title')} placeholder="Test luồng đăng nhập và trả lời đa ngôn ngữ" /></label>
          <label className="field"><span>Giới thiệu</span><textarea className="input" rows={3} maxLength={5000} value={form.description} onChange={set('description')} /></label>
          <label className="field"><span>Phạm vi test</span><textarea className="input" rows={3} maxLength={3000} value={form.scopeIn} onChange={set('scopeIn')} /></label>
          <label className="field"><span>Ngoài phạm vi</span><textarea className="input" rows={2} maxLength={3000} value={form.scopeOut} onChange={set('scopeOut')} /></label>
          <label className="field"><span>Link sản phẩm (https)</span><input className="input" type="url" value={form.testUrl} onChange={set('testUrl')} /></label>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Nền tảng</legend>
            <div className="row wrap" style={{ gap: 8 }}>
              {Object.entries(PLATFORM_LABEL).map(([value, label]) => (
                <button key={value} type="button" className="tab-chip" aria-pressed={platforms.includes(value)}
                  style={platforms.includes(value) ? { background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' } : undefined}
                  onClick={() => setPlatforms(platforms.includes(value) ? platforms.filter((p) => p !== value) : [...platforms, value])}>{label}</button>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="card stack" style={{ gap: 14 }}>
          <div className="label">2 · Tiền thưởng & thời gian</div>
          <div className="grid2">
            {SEVERITY_ORDER.map((s) => (
              <label key={s} className="field"><span><SeverityChip severity={s} /> USDC / bug</span>
                <input className="input" inputMode="decimal" value={payouts[s]} onChange={(e) => setPayouts({ ...payouts, [s]: e.target.value })} placeholder="Để trống nếu không trả" />
              </label>
            ))}
          </div>
          <div className="grid2">
            <label className="field"><span>Ngân sách tổng (USDC)</span><input className="input" required inputMode="decimal" value={form.budget} onChange={set('budget')} placeholder="1200" /></label>
            <label className="field"><span>Số tester tối đa</span><input className="input" required type="number" min={1} max={500} value={form.testerSlots} onChange={set('testerSlots')} /></label>
            <label className="field"><span>Ngày kết thúc</span><input className="input" required type="date" value={form.endDate} onChange={set('endDate')} /></label>
            <label className="field"><span>Hạn xét mỗi bug (ngày)</span><input className="input" required type="number" min={1} max={14} value={form.responseDays} onChange={set('responseDays')} /></label>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Quá hạn xét, bug tự được chấp nhận ở mức tester khai. Tiền còn lại rút được 14 ngày sau ngày kết thúc. Bảng giá bị khóa khi chiến dịch mở.
          </p>
        </section>

        {error && <div className="alert error" role="alert">{error}</div>}
        <button type="submit" className="btn primary block" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu bản nháp và tiếp tục'}</button>
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
        <div className="row between small muted"><span>{c.productName}</span><span className="pill">{CAMPAIGN_STATUS[c.status]}</span></div>
        <h1>{c.title}</h1>
        <div className="small muted">Ngân sách {usdc(c.budget)} USDC · kết thúc {timeLeft(c.endsAt)}{c.fundTx && <> · <a href={txUrl(c.fundTx)} target="_blank" rel="noreferrer">giao dịch nạp</a></>}</div>
      </div>

      {reauth && <div className="alert warn" role="alert">Phiên ký Circle đã hết hạn. <Link to={`/auth?next=/app/projects/${id}`}>Đăng nhập lại</Link> để xác nhận.</div>}
      {actionError && <div className="alert error" role="alert">{actionError}</div>}

      {(c.status === 'draft' || c.status === 'funding') && (
        <section className="card stack">
          <strong>Nạp {usdc(c.budget)} USDC vào escrow để mở chiến dịch</strong>
          <p className="small muted" style={{ margin: 0 }}>Một lần xác nhận PIN: duyệt đúng số tiền và nạp vào hợp đồng. Tester chỉ thấy chiến dịch sau khi tiền đã nằm trong escrow.</p>
          <button type="button" className="btn primary block" disabled={!!busy} onClick={fund}>{busy === 'fund' ? 'Đang chờ xác nhận…' : 'Nạp escrow và mở chiến dịch'}</button>
        </section>
      )}

      {(c.status === 'open' || c.status === 'closed') && (
        <div className="row wrap">
          <Link to={`/app/c/${c.id}`} className="btn">Xem trang công khai</Link>
          {c.status === 'open' && <button type="button" className="btn" disabled={!!busy} onClick={() => run('close', () => post('/api/campaigns', { action: 'close', id }))}>Đóng sớm</button>}
          {new Date(c.withdrawableAt) <= new Date() && <button type="button" className="btn" disabled={!!busy} onClick={withdraw}>Rút tiền còn lại</button>}
        </div>
      )}

      <div className="tabs" role="tablist">
        <button type="button" role="tab" className="tab-chip" aria-selected={tab === 'bugs'} onClick={() => setTab('bugs')}>Bug · {toReview} chờ xét</button>
        <button type="button" role="tab" className="tab-chip" aria-selected={tab === 'applications'} onClick={() => setTab('applications')}>
          Đơn ứng tuyển · {data.applications.filter((a) => a.status === 'pending').length} mới
        </button>
      </div>

      {tab === 'bugs' ? (
        data.bugs.length === 0 ? <div className="card muted">Chưa có bug nào.</div> : [...data.bugs]
          .sort((a, b) => (a.status === 'submitted' ? 0 : 1) - (b.status === 'submitted' ? 0 : 1) || (a.response_due_at || '').localeCompare(b.response_due_at || ''))
          .map((b) => (
            <Link key={b.id} to={`/app/bugs/${b.id}`} className="card stack">
              <div className="row between"><BugStatusChip status={b.status} amount={b.payout_amount} /><span className="small muted">{b.status === 'submitted' ? `Hạn ${timeLeft(b.response_due_at)}` : ''}</span></div>
              <strong>{b.title}</strong>
              <div className="row between small muted">
                <span>{b.accounts?.display_name} · <SeverityChip severity={b.severity_final ?? b.severity_claimed} /></span>
                <span className="mono" title="Mã bug, dùng khi đánh dấu trùng">{b.id}</span>
              </div>
            </Link>
          ))
      ) : (
        data.applications.length === 0 ? <div className="card muted">Chưa có ai ứng tuyển.</div> : data.applications.map((a) => (
          <div key={a.id} className="card stack">
            <div className="row between"><strong>{a.accounts?.display_name || 'Tester'}</strong><span className="pill">{a.status}</span></div>
            {a.message && <div className="pre small">{a.message}</div>}
            {a.devices && <div className="small muted">Thiết bị: {a.devices}</div>}
            {a.status === 'pending' && (
              <div className="row">
                <button type="button" className="btn primary" disabled={!!busy} onClick={() => decide(a.id, 'approve')}>Duyệt</button>
                <button type="button" className="btn" disabled={!!busy} onClick={() => decide(a.id, 'reject')}>Không duyệt</button>
              </div>
            )}
            {a.status === 'approved' && <button type="button" className="btn danger" disabled={!!busy} onClick={() => decide(a.id, 'remove')}>Loại khỏi chiến dịch</button>}
          </div>
        ))
      )}
    </main>
  )
}
