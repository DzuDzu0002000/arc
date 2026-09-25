import { useState, type FormEvent } from 'react'
import { api, post, type CampaignDetail as Detail, type CampaignListItem, type Severity } from '../api'
import {
  BackLink, Icons, Link, Loading, navigate, PLATFORM_LABEL, SEVERITY_ORDER, SeverityChip, timeLeft, txUrl, usdc, useLoad,
} from '../ui'

export function Explore() {
  const [platform, setPlatform] = useState('all')
  const [query, setQuery] = useState('')
  const { data, error, reload } = useLoad(() => api<{ campaigns: CampaignListItem[] }>('/api/campaigns'), [])
  const q = query.trim().toLowerCase()
  const campaigns = (data?.campaigns ?? []).filter((c) =>
    (platform === 'all' || c.platforms.includes(platform))
    && (!q || `${c.title} ${c.productName}`.toLowerCase().includes(q)))

  return (
    <main className="page">
      <h1>Khám phá</h1>
      <label className="field">
        <span className="small muted">Tìm chiến dịch</span>
        <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tên sản phẩm, chủ đề…" />
      </label>
      <div className="tabs" role="tablist" aria-label="Lọc theo nền tảng">
        {['all', 'web', 'ios', 'android', 'api'].map((p) => (
          <button key={p} type="button" role="tab" className="tab-chip" aria-selected={platform === p} onClick={() => setPlatform(p)}>
            {p === 'all' ? 'Tất cả' : PLATFORM_LABEL[p]}
          </button>
        ))}
      </div>
      {!data ? <Loading error={error} onRetry={reload} /> : campaigns.length === 0 ? (
        <div className="card muted">Chưa có chiến dịch nào đang mở{platform !== 'all' || q ? ' khớp bộ lọc' : ''}.</div>
      ) : campaigns.map((c) => (
        <Link key={c.id} to={`/app/c/${c.id}`} className="card">
          <div className="row between small"><span className="muted" style={{ fontWeight: 600 }}>{c.productName}</span><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{timeLeft(c.endsAt)}</span></div>
          <h2 style={{ marginTop: 4, fontFamily: 'var(--body)', fontSize: 17 }}>{c.title}</h2>
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>{c.platforms.map((p) => <span key={p} className="pill">{PLATFORM_LABEL[p] ?? p}</span>)}</div>
          <div className="row between divider small" style={{ marginTop: 14, paddingTop: 12 }}>
            <div><div className="muted">Tối đa / bug</div><strong>{usdc(c.maxPayout)} USDC</strong></div>
            <div><div className="muted">Ngân sách</div><strong>{usdc(c.budget)} USDC</strong></div>
            <div><div className="muted">Tester</div><strong>{c.approvedTesters}/{c.testerSlots}</strong></div>
          </div>
        </Link>
      ))}
    </main>
  )
}

export function CampaignDetail({ id }: { id: string }) {
  const { data, error, reload } = useLoad(() => api<Detail>(`/api/campaigns?id=${id}`), [id])
  const [applying, setApplying] = useState(false)
  const [message, setMessage] = useState('')
  const [devices, setDevices] = useState('')
  const [actionError, setActionError] = useState('')

  if (!data) return <main className="page"><BackLink to="/app" /><Loading error={error} onRetry={reload} /></main>
  const { campaign: c, viewer, stats } = data
  const application = viewer.application

  async function apply(event: FormEvent) {
    event.preventDefault()
    setActionError('')
    try {
      await post('/api/applications', { action: 'apply', campaignId: id, message, devices })
      setApplying(false)
      await reload()
    } catch (e) { setActionError((e as Error).message) }
  }

  const acceptance = stats && stats.decided > 0 ? `${Math.round((stats.accepted / stats.decided) * 100)}%` : '—'

  return (
    <main className="page">
      <BackLink to="/app" />
      <div>
        <div className="muted small" style={{ fontWeight: 600 }}>{c.productName} · {data.ownerName}</div>
        <h1 style={{ marginTop: 6 }}>{c.title}</h1>
        <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
          {c.platforms.map((p) => <span key={p} className="pill">{PLATFORM_LABEL[p] ?? p}</span>)}
          <span className="pill">{timeLeft(c.endsAt)}</span>
          <span className="pill">{data.approvedTesters}/{c.testerSlots} tester</span>
        </div>
      </div>

      <div className="card row" style={{ background: 'var(--accent-soft)', borderColor: '#bfe3dc' }}>
        <span style={{ color: 'var(--accent)' }}>{Icons.lock}</span>
        <div style={{ flexGrow: 1 }}>
          <div className="small" style={{ color: '#245e57' }}>Đang khóa trong escrow</div>
          <strong style={{ fontSize: 20 }}>{data.escrowBalance !== null ? `${usdc(data.escrowBalance)} USDC` : c.status === 'open' ? 'Đang đọc…' : 'Chưa nạp'}</strong>
        </div>
        {c.fundTx && <a href={txUrl(c.fundTx)} target="_blank" rel="noreferrer" className="small">Giao dịch nạp</a>}
      </div>

      <section className="card stack">
        <div className="label">Tiền thưởng mỗi bug</div>
        {SEVERITY_ORDER.filter((s) => data.payouts[s]).map((s) => (
          <div key={s} className="row between divider" style={{ paddingTop: 8 }}><SeverityChip severity={s} /><strong>{usdc(data.payouts[s])} USDC</strong></div>
        ))}
        <p className="small muted" style={{ margin: 0 }}>Còn {usdc(data.remainingBudget)} USDC chưa được dùng cho bug nào.</p>
      </section>

      {(c.description || c.scopeIn || c.scopeOut) && (
        <section className="card stack">
          {c.description && <><div className="label">Giới thiệu</div><div className="pre">{c.description}</div></>}
          {c.scopeIn && <><div className="label">Phạm vi test</div><div className="pre">{c.scopeIn}</div></>}
          {c.scopeOut && <><div className="label">Ngoài phạm vi</div><div className="pre">{c.scopeOut}</div></>}
          {c.testUrl && <a href={c.testUrl} target="_blank" rel="noreferrer">Mở sản phẩm cần test</a>}
        </section>
      )}

      <section className="card row between" style={{ textAlign: 'center' }}>
        <div style={{ flex: 1 }}><strong style={{ fontSize: 20 }}>{acceptance}</strong><div className="small muted">Bug được chấp nhận</div></div>
        <div style={{ flex: 1 }}><strong style={{ fontSize: 20 }}>{stats?.avgResponseDays != null ? `${stats.avgResponseDays.toFixed(1)} ngày` : '—'}</strong><div className="small muted">Phản hồi trung bình</div></div>
        <div style={{ flex: 1 }}><strong style={{ fontSize: 20 }}>{stats?.timedOut ?? 0}</strong><div className="small muted">Quá hạn</div></div>
      </section>

      {actionError && <div className="alert error" role="alert">{actionError}</div>}

      {viewer.role === 'owner' ? (
        <Link to={`/app/projects/${c.id}`} className="btn primary block">Quản lý chiến dịch</Link>
      ) : application?.status === 'approved' ? (
        <Link to={`/app/c/${c.id}/report`} className="btn primary block">Gửi bug</Link>
      ) : application ? (
        <div className="alert warn">Đơn ứng tuyển của bạn: {application.status === 'pending' ? 'đang chờ duyệt' : application.status === 'rejected' ? 'không được duyệt' : application.status}.</div>
      ) : c.status !== 'open' ? (
        <div className="alert warn">Chiến dịch không nhận thêm tester.</div>
      ) : applying ? (
        <form className="card stack" onSubmit={apply}>
          <label className="field"><span>Giới thiệu ngắn về bạn</span><textarea className="input" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
          <label className="field"><span>Thiết bị bạn dùng để test</span><input className="input" maxLength={300} value={devices} onChange={(e) => setDevices(e.target.value)} placeholder="iPhone 15 iOS 19, Chrome trên Windows…" /></label>
          <div className="row"><button type="submit" className="btn primary">Gửi đơn</button><button type="button" className="btn" onClick={() => setApplying(false)}>Huỷ</button></div>
        </form>
      ) : (
        <button type="button" className="btn primary block" onClick={() => setApplying(true)}>Ứng tuyển</button>
      )}
    </main>
  )
}

export function ReportBug({ campaignId }: { campaignId: string }) {
  const { data, error: loadError, reload } = useLoad(() => api<Detail>(`/api/campaigns?id=${campaignId}`), [campaignId])
  const [form, setForm] = useState({ title: '', steps: '', expected: '', actual: '', environment: '', evidence: '' })
  const [severity, setSeverity] = useState<Severity | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  if (!data) return <main className="page"><BackLink to={`/app/c/${campaignId}`} /><Loading error={loadError} onRetry={reload} /></main>

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!severity) { setError('Chọn mức độ lỗi.'); return }
    setBusy(true)
    setError('')
    try {
      const result = await post<{ id: string }>('/api/bugs', {
        action: 'submit', campaignId, ...form, severity,
        evidenceUrls: form.evidence.split(/\s+/).filter(Boolean),
      })
      navigate(`/app/bugs/${result.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <BackLink to={`/app/c/${campaignId}`} />
      <div><div className="muted small" style={{ fontWeight: 600 }}>{data.campaign.productName}</div><h1>Gửi bug</h1></div>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <label className="field"><span>Tiêu đề</span><input className="input" required minLength={5} maxLength={160} value={form.title} onChange={set('title')} /></label>
        <label className="field"><span>Các bước tái hiện</span><textarea className="input" required minLength={10} rows={5} value={form.steps} onChange={set('steps')} placeholder={'1. …\n2. …\n3. …'} /></label>
        <div className="grid2">
          <label className="field"><span>Kết quả mong đợi</span><textarea className="input" required rows={3} value={form.expected} onChange={set('expected')} /></label>
          <label className="field"><span>Kết quả thực tế</span><textarea className="input" required rows={3} value={form.actual} onChange={set('actual')} /></label>
        </div>
        <label className="field"><span>Môi trường</span><input className="input" required maxLength={300} value={form.environment} onChange={set('environment')} placeholder="Thiết bị, hệ điều hành, trình duyệt, phiên bản app" /></label>
        <label className="field"><span>Link bằng chứng (video, ảnh), cách nhau bởi dấu cách</span><input className="input" value={form.evidence} onChange={set('evidence')} placeholder="https://loom.com/…" /></label>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Mức độ bạn đánh giá</legend>
          <div className="grid4">
            {SEVERITY_ORDER.filter((s) => data.payouts[s]).map((s) => (
              <button key={s} type="button" className="seg" aria-pressed={severity === s} onClick={() => setSeverity(s)}>
                {s[0].toUpperCase() + s.slice(1)}<small>{usdc(data.payouts[s])} USDC</small>
              </button>
            ))}
          </div>
          <span className="small muted">Dự án có thể điều chỉnh mức độ khi duyệt.</span>
        </fieldset>
        {error && <div className="alert error" role="alert">{error}</div>}
        <button type="submit" className="btn primary block" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi bug'}</button>
      </form>
    </main>
  )
}
