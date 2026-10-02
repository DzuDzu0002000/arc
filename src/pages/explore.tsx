import { useState, type FormEvent } from 'react'
import { api, post, type CampaignDetail as Detail, type CampaignListItem, type Severity } from '../api'
import { useSession } from '../App'
import { t } from '../i18n'
import {
  BackLink, Icons, Link, Loading, navigate, PLATFORM_LABEL, SEVERITY_ORDER, localized, SeverityChip, timeLeft, txUrl, usdc, useLoad,
} from '../ui'

export function Explore() {
  const [platform, setPlatform] = useState('all')
  const [query, setQuery] = useState('')
  const { data, error, reload } = useLoad(() => api<{ campaigns: CampaignListItem[] }>('/api/campaigns'), [])
  const q = query.trim().toLowerCase()
  const campaigns = (data?.campaigns ?? []).filter((c) =>
    (platform === 'all' || c.platforms.includes(platform))
    && (!q || `${c.title} ${c.english.title ?? ''} ${c.productName}`.toLowerCase().includes(q)))

  return (
    <main className="page explore">
      <div className="explore-head">
        <h1>{t('Khám phá')}</h1>
        <div className="explore-tools">
          <label className="explore-search">
            <span className="sr-only">{t('Tìm chiến dịch')}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Tên sản phẩm, chủ đề…')} />
          </label>
          <div className="tabs" role="tablist" aria-label={t('Lọc theo nền tảng')}>
            {['all', 'web', 'ios', 'android', 'api'].map((p) => (
              <button key={p} type="button" role="tab" className="tab-chip" aria-selected={platform === p} onClick={() => setPlatform(p)}>
                {p === 'all' ? t('Tất cả') : PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      </div>
      {!data ? <Loading error={error} onRetry={reload} /> : campaigns.length === 0 ? (
        <div className="card muted">{platform !== 'all' || q ? t('Không có chiến dịch nào khớp bộ lọc.') : t('Chưa có chiến dịch nào đang mở.')}</div>
      ) : (
        <div className="campaign-grid">
          {campaigns.map((c) => (
            <Link key={c.id} to={`/app/c/${c.id}`} className="card campaign-card">
              <div className="row between small"><span className="muted" style={{ fontWeight: 600 }}>{c.productName}</span><span style={{ color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>{timeLeft(c.endsAt)}</span></div>
              <h2>{localized(c.title, c.english.title)}</h2>
              <div className="row wrap" style={{ gap: 6 }}>{c.platforms.map((p) => <span key={p} className="pill">{PLATFORM_LABEL[p] ?? p}</span>)}</div>
              <div className="campaign-stats divider">
                <div><div className="muted">{t('Tối đa / bug')}</div><strong>{usdc(c.maxPayout)} USDC</strong></div>
                <div><div className="muted">{t('Ngân sách')}</div><strong>{usdc(c.budget)} USDC</strong></div>
                <div><div className="muted">Tester</div><strong>{c.approvedTesters}/{c.testerSlots}</strong></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}

export function CampaignDetail({ id }: { id: string }) {
  const { session } = useSession()
  const isProjectAccount = session?.authenticated && session.account.role === 'project'
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
      <BackLink to={isProjectAccount ? "/app/projects" : "/app"} />
      <div>
        <div className="muted small" style={{ fontWeight: 600 }}>{c.productName} · {data.ownerName}</div>
        <h1 style={{ marginTop: 6 }}>{localized(c.title, c.english.title)}</h1>
        <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
          {c.platforms.map((p) => <span key={p} className="pill">{PLATFORM_LABEL[p] ?? p}</span>)}
          <span className="pill">{timeLeft(c.endsAt)}</span>
          <span className="pill">{t('{n}/{max} tester', { n: data.approvedTesters, max: c.testerSlots })}</span>
        </div>
      </div>

      <section className="card where-to-test">
        <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
          <div className="label">{t('Nơi test')}</div>
          {c.testUrl
            ? <a href={c.testUrl} target="_blank" rel="noreferrer" className="test-url">{c.testUrl}</a>
            : <span className="small muted">{t('Dự án chưa cung cấp link. Xem hướng dẫn trong phần Phạm vi test bên dưới.')}</span>}
        </div>
        {c.testUrl && <a href={c.testUrl} target="_blank" rel="noreferrer" className="btn primary">{t('Mở sản phẩm cần test')} ↗</a>}
      </section>

      <div className="card row" style={{ background: 'var(--accent-soft)', borderColor: 'var(--tint-line)' }}>
        <span style={{ color: 'var(--accent)' }}>{Icons.lock}</span>
        <div style={{ flexGrow: 1 }}>
          <div className="small" style={{ color: 'var(--tint-ink)' }}>{t('Đang khóa trong escrow')}</div>
          <strong style={{ fontSize: 20 }}>{data.escrowBalance !== null ? `${usdc(data.escrowBalance)} USDC` : c.status === 'open' ? t('Đang đọc…') : t('Chưa nạp')}</strong>
        </div>
        {c.fundTx && <a href={txUrl(c.fundTx)} target="_blank" rel="noreferrer" className="small">{t('Giao dịch nạp')}</a>}
      </div>

      <section className="card stack">
        <div className="label">{t('Tiền thưởng mỗi bug')}</div>
        {SEVERITY_ORDER.filter((s) => data.payouts[s]).map((s) => (
          <div key={s} className="row between divider" style={{ paddingTop: 8 }}><SeverityChip severity={s} /><strong>{usdc(data.payouts[s])} USDC</strong></div>
        ))}
        <p className="small muted" style={{ margin: 0 }}>{t('Còn {amount} USDC chưa được dùng cho bug nào.', { amount: usdc(data.remainingBudget) })}</p>
      </section>

      {(c.description || c.scopeIn || c.scopeOut) ? (
        <section className="card stack">
          {c.description && <><div className="label">{t('Giới thiệu')}</div><div className="pre">{localized(c.description, c.english.description)}</div></>}
          {c.scopeIn && <><div className="label">{t('Phạm vi test')}</div><div className="pre">{localized(c.scopeIn, c.english.scopeIn)}</div></>}
          {c.scopeOut && <><div className="label">{t('Ngoài phạm vi')}</div><div className="pre">{localized(c.scopeOut, c.english.scopeOut)}</div></>}
        </section>
      ) : (
        <div className="alert warn">{t('Dự án chưa mô tả sản phẩm và phạm vi test. Hãy test các luồng chính trên link ở trên và ghi rõ các bước khi báo bug.')}</div>
      )}

      <section className="card row between" style={{ textAlign: 'center' }}>
        <div style={{ flex: 1 }}><strong style={{ fontSize: 20 }}>{acceptance}</strong><div className="small muted">{t('Bug được chấp nhận')}</div></div>
        <div style={{ flex: 1 }}><strong style={{ fontSize: 20 }}>{stats?.avgResponseDays != null ? t('{n} ngày', { n: stats.avgResponseDays.toFixed(1) }) : '—'}</strong><div className="small muted">{t('Phản hồi trung bình')}</div></div>
        <div style={{ flex: 1 }}><strong style={{ fontSize: 20 }}>{stats?.timedOut ?? 0}</strong><div className="small muted">{t('Quá hạn')}</div></div>
      </section>

      {data.brief ? (
        <section className="card stack brief-card">
          <div className="row between wrap">
            <div className="label">{t('Nhiệm vụ test')}</div>
            <span className="pill st-good">{viewer.role === 'owner' ? t('Chỉ tester được duyệt thấy') : t('Dành cho bạn')}</span>
          </div>
          <div className="pre">{localized(data.brief.text, data.brief.english)}</div>
        </section>
      ) : data.hasBrief && viewer.role !== 'owner' ? (
        <div className="card row brief-locked">{Icons.lock}<span className="small">{t('Dự án có danh sách nhiệm vụ test chi tiết. Bạn sẽ thấy khi được duyệt.')}</span></div>
      ) : null}

      {actionError && <div className="alert error" role="alert">{actionError}</div>}

      {viewer.role === 'owner' ? (
        <Link to={`/app/projects/${c.id}`} className="btn primary block">{t('Quản lý chiến dịch')}</Link>
      ) : isProjectAccount ? (
        <div className="alert warn">{t('Bạn đang dùng tài khoản dự án. Chỉ tài khoản tester mới ứng tuyển và gửi bug được.')}</div>
      ) : application?.status === 'approved' ? (
        <Link to={`/app/c/${c.id}/report`} className="btn primary block">{t('Gửi bug')}</Link>
      ) : application ? (
        <div className="alert warn">{application.status === 'pending' ? t('Đơn ứng tuyển của bạn đang chờ duyệt.') : application.status === 'rejected' ? t('Đơn ứng tuyển của bạn không được duyệt.') : t('Đơn ứng tuyển của bạn đã đóng.')}</div>
      ) : c.status !== 'open' ? (
        <div className="alert warn">{t('Chiến dịch không nhận thêm tester.')}</div>
      ) : applying ? (
        <form className="card stack" onSubmit={apply}>
          <label className="field"><span>{t('Giới thiệu ngắn về bạn')}</span><textarea className="input" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
          <label className="field"><span>{t('Thiết bị bạn dùng để test')}</span><input className="input" maxLength={300} value={devices} onChange={(e) => setDevices(e.target.value)} placeholder={t('iPhone 15 iOS 19, Chrome trên Windows…')} /></label>
          <div className="row"><button type="submit" className="btn primary">{t('Gửi đơn')}</button><button type="button" className="btn" onClick={() => setApplying(false)}>{t('Huỷ')}</button></div>
        </form>
      ) : (
        <button type="button" className="btn primary block" onClick={() => setApplying(true)}>{t('Ứng tuyển')}</button>
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
    if (!severity) { setError(t('Chọn mức độ lỗi.')); return }
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
      <div><div className="muted small" style={{ fontWeight: 600 }}>{data.campaign.productName}</div><h1>{t('Gửi bug')}</h1></div>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <label className="field"><span>{t('Tiêu đề')}</span><input className="input" required minLength={5} maxLength={160} value={form.title} onChange={set('title')} /></label>
        <label className="field"><span>{t('Các bước tái hiện')}</span><textarea className="input" required minLength={10} rows={5} value={form.steps} onChange={set('steps')} placeholder={'1. …\n2. …\n3. …'} /></label>
        <div className="grid2">
          <label className="field"><span>{t('Kết quả mong đợi')}</span><textarea className="input" required rows={3} value={form.expected} onChange={set('expected')} /></label>
          <label className="field"><span>{t('Kết quả thực tế')}</span><textarea className="input" required rows={3} value={form.actual} onChange={set('actual')} /></label>
        </div>
        <label className="field"><span>{t('Môi trường')}</span><input className="input" required maxLength={300} value={form.environment} onChange={set('environment')} placeholder={t('Thiết bị, hệ điều hành, trình duyệt, phiên bản app')} /></label>
        <label className="field"><span>{t('Link bằng chứng (video, ảnh), cách nhau bởi dấu cách')}</span><input className="input" value={form.evidence} onChange={set('evidence')} placeholder="https://loom.com/…" /></label>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('Mức độ bạn đánh giá')}</legend>
          <div className="grid4">
            {SEVERITY_ORDER.filter((s) => data.payouts[s]).map((s) => (
              <button key={s} type="button" className="seg" aria-pressed={severity === s} onClick={() => setSeverity(s)}>
                {s[0].toUpperCase() + s.slice(1)}<small>{usdc(data.payouts[s])} USDC</small>
              </button>
            ))}
          </div>
          <span className="small muted">{t('Dự án có thể điều chỉnh mức độ khi duyệt.')}</span>
        </fieldset>
        {error && <div className="alert error" role="alert">{error}</div>}
        <button type="submit" className="btn primary block" disabled={busy}>{busy ? t('Đang gửi…') : t('Gửi bug')}</button>
      </form>
    </main>
  )
}
