import { useState, type FormEvent } from 'react'
import { api, post, type BugView, type MeData, type Severity } from '../api'
import { ReauthRequired, signAndConfirm } from '../circle'
import {
  BackLink, BugStatusChip, dateTime, Link, Loading, navigate, REJECT_LABEL, SEVERITY_ORDER, SeverityChip, timeLeft, txUrl, usdc, useLoad,
} from '../ui'

export function MyWork() {
  const { data, error, reload } = useLoad(() => api<MeData>('/api/me'), [])
  const [tab, setTab] = useState<'bugs' | 'applications'>('bugs')
  if (!data) return <main className="page"><h1>Công việc</h1><Loading error={error} onRetry={reload} /></main>

  const earned = data.bugs.filter((b) => b.status === 'paid').reduce((sum, b) => sum + Number(b.payout_amount || 0), 0)
  const accepted = data.bugs.filter((b) => b.status === 'paid' || b.status === 'accepted').length

  return (
    <main className="page">
      <h1>Công việc</h1>
      <div className="card row between" style={{ background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' }}>
        <div><div className="small" style={{ color: '#b9bdc6' }}>Đã nhận từ bug</div><strong style={{ fontFamily: 'var(--display)', fontSize: 30 }}>{usdc(String(earned))} USDC</strong></div>
        <div className="small" style={{ color: '#b9bdc6', textAlign: 'right' }}>{accepted} bug được chấp nhận<br />{data.applications.filter((a) => a.status === 'approved').length} chiến dịch đang tham gia</div>
      </div>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" className="tab-chip" aria-selected={tab === 'bugs'} onClick={() => setTab('bugs')}>Bug đã gửi · {data.bugs.length}</button>
        <button type="button" role="tab" className="tab-chip" aria-selected={tab === 'applications'} onClick={() => setTab('applications')}>Đơn ứng tuyển · {data.applications.length}</button>
      </div>
      {tab === 'bugs' ? (
        data.bugs.length === 0 ? <div className="card muted">Bạn chưa gửi bug nào. <Link to="/app">Tìm chiến dịch</Link></div>
          : data.bugs.map((b) => (
            <Link key={b.id} to={`/app/bugs/${b.id}`} className="card stack">
              <div className="row between">
                <BugStatusChip status={b.status} amount={b.payout_amount} />
                <span className="small muted">
                  {b.status === 'submitted' ? `Hạn xét ${timeLeft(b.response_due_at)}`
                    : b.status === 'rejected' ? `${REJECT_LABEL[b.reject_reason || ''] ?? ''} · khiếu nại ${timeLeft(b.dispute_due_at)}` : ''}
                </span>
              </div>
              <strong>{b.title}</strong>
              <div className="small muted">{b.campaigns?.product_name} · <SeverityChip severity={b.severity_final ?? b.severity_claimed} /></div>
            </Link>
          ))
      ) : (
        data.applications.length === 0 ? <div className="card muted">Chưa có đơn ứng tuyển.</div>
          : data.applications.map((a) => a.campaigns && (
            <Link key={a.id} to={`/app/c/${a.campaigns.id}`} className="card row between">
              <div><strong>{a.campaigns.title}</strong><div className="small muted">{a.campaigns.product_name}</div></div>
              <span className={`pill ${a.status === 'approved' ? 'st-good' : a.status === 'pending' ? '' : 'st-bad'}`}>
                {{ pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Không duyệt', withdrawn: 'Đã rút', removed: 'Bị loại' }[a.status] ?? a.status}
              </span>
            </Link>
          ))
      )}
    </main>
  )
}

function ReauthNotice({ path }: { path: string }) {
  return (
    <div className="alert warn" role="alert">
      Phiên ký của Circle đã hết hạn (khoảng 60 phút). <Link to={`/auth?next=${encodeURIComponent(path)}`}>Đăng nhập lại</Link> để xác nhận giao dịch.
    </div>
  )
}

export function BugDetail({ id }: { id: string }) {
  const { data, error, reload } = useLoad(() => api<BugView>(`/api/bugs?id=${id}`), [id])
  const [severity, setSeverity] = useState<Severity | null>(null)
  const [mode, setMode] = useState<'none' | 'reject' | 'info' | 'reply' | 'dispute'>('none')
  const [text, setText] = useState('')
  const [reason, setReason] = useState('')
  const [duplicateOf, setDuplicateOf] = useState('')
  const [busy, setBusy] = useState('')
  const [actionError, setActionError] = useState('')
  const [reauth, setReauth] = useState(false)

  if (!data) return <main className="page"><BackLink to="/app/work" /><Loading error={error} onRetry={reload} /></main>
  const { bug, role, campaign } = data
  const chosen = severity ?? bug.severityClaimed
  const back = role === 'owner' ? `/app/projects/${campaign.id}` : role === 'admin' ? '/app/admin' : '/app/work'

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label)
    setActionError('')
    setReauth(false)
    try {
      await fn()
      setMode('none')
      setText('')
      await reload()
    } catch (e) {
      if (e instanceof ReauthRequired) setReauth(true)
      else setActionError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const acceptAndPay = () => run('accept', () => signAndConfirm(
    () => post<{ challengeId: string }>('/api/bugs', { action: bug.status === 'accepted' ? 'pay' : 'accept', id, severity: chosen }),
    () => post<{ pending?: boolean; failed?: boolean }>('/api/bugs', { action: 'confirm-payout', id }),
  ))

  function submitForm(event: FormEvent) {
    event.preventDefault()
    if (mode === 'reject') void run('reject', () => post('/api/bugs', { action: 'reject', id, reason, note: text, duplicateOf: duplicateOf || undefined }))
    if (mode === 'info') void run('info', () => post('/api/bugs', { action: 'request-info', id, message: text }))
    if (mode === 'reply') void run('reply', () => post('/api/bugs', { action: 'reply', id, message: text }))
    if (mode === 'dispute') void run('dispute', () => post('/api/bugs', { action: 'dispute', id, reason: text }))
  }

  return (
    <main className="page">
      <BackLink to={back} />
      <div className="stack">
        <div className="row between small muted"><span>{campaign.productName} · {bug.testerName}</span><span>{dateTime(bug.createdAt)}</span></div>
        <h1>{bug.title}</h1>
        <div className="row wrap" style={{ gap: 6 }}>
          <BugStatusChip status={bug.status} amount={bug.payoutAmount} />
          <SeverityChip severity={bug.severityFinal ?? bug.severityClaimed} />
          {bug.decidedBy === 'timeout' && <span className="pill st-warn">Tự chấp nhận do quá hạn</span>}
        </div>
      </div>

      {bug.status === 'submitted' && bug.responseDueAt && (
        <div className="alert warn">Hạn phản hồi của dự án: {timeLeft(bug.responseDueAt)}. Quá hạn, bug tự được chấp nhận ở mức {bug.severityClaimed}.</div>
      )}
      {bug.status === 'rejected' && (
        <div className="alert error">
          Từ chối: {REJECT_LABEL[bug.rejectReason || ''] ?? bug.rejectReason}
          {bug.duplicateOf && <> (bug gốc <span className="mono">{bug.duplicateOf.slice(0, 8)}</span>)</>}
          {bug.rejectNote && <div className="pre" style={{ marginTop: 6 }}>{bug.rejectNote}</div>}
        </div>
      )}
      {bug.payoutTx && <div className="alert ok">Đã trả {usdc(bug.payoutAmount)} USDC. <a href={txUrl(bug.payoutTx)} target="_blank" rel="noreferrer">Xem giao dịch</a></div>}

      <section className="card stack">
        <div className="label">Các bước tái hiện</div><div className="pre">{bug.steps}</div>
        <div className="grid2">
          <div><div className="label">Mong đợi</div><div className="pre">{bug.expected}</div></div>
          <div><div className="label">Thực tế</div><div className="pre">{bug.actual}</div></div>
        </div>
        <div className="label">Môi trường</div><div>{bug.environment}</div>
        {bug.evidenceUrls.length > 0 && (<><div className="label">Bằng chứng</div>{bug.evidenceUrls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer noopener" style={{ overflowWrap: 'anywhere' }}>{u}</a>)}</>)}
      </section>

      {data.messages.length > 0 && (
        <section className="card stack">
          <div className="label">Trao đổi</div>
          {data.messages.map((m) => (
            <div key={m.id} className="divider" style={{ paddingTop: 8 }}>
              <div className="small muted">{m.accounts?.display_name} · {dateTime(m.created_at)}</div>
              <div className="pre">{m.body}</div>
            </div>
          ))}
        </section>
      )}

      {data.dispute && (
        <section className="card stack">
          <div className="label">Khiếu nại · {{ open: 'đang chờ admin', upheld: 'đã thắng', dismissed: 'bị bác' }[data.dispute.status] ?? data.dispute.status}</div>
          <div className="pre">{data.dispute.reason}</div>
          {data.dispute.resolution_note && <div className="pre muted">Admin: {data.dispute.resolution_note}</div>}
        </section>
      )}

      {reauth && <ReauthNotice path={`/app/bugs/${id}`} />}
      {actionError && <div className="alert error" role="alert">{actionError}</div>}

      {role === 'owner' && (bug.status === 'submitted' || bug.status === 'accepted') && mode === 'none' && (
        <section className="card stack">
          {bug.status === 'submitted' ? (
            <>
              <div className="label">Mức độ chốt (tester khai: {bug.severityClaimed})</div>
              <div className="grid4">
                {SEVERITY_ORDER.filter((s) => data.payouts[s]).map((s) => (
                  <button key={s} type="button" className="seg" aria-pressed={chosen === s} onClick={() => setSeverity(s)}>
                    {s[0].toUpperCase() + s.slice(1)}<small>{usdc(data.payouts[s])}</small>
                  </button>
                ))}
              </div>
              <button type="button" className="btn primary block" disabled={!!busy || !data.payouts[chosen]} onClick={acceptAndPay}>
                {busy === 'accept' ? 'Đang chờ xác nhận PIN…' : `Chấp nhận và trả ${usdc(data.payouts[chosen])} USDC`}
              </button>
              <div className="row">
                <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setMode('info')}>Hỏi thêm</button>
                <button type="button" className="btn danger" style={{ flex: 1 }} onClick={() => setMode('reject')}>Từ chối…</button>
              </div>
            </>
          ) : (
            <button type="button" className="btn primary block" disabled={!!busy} onClick={acceptAndPay}>
              {busy === 'accept' ? 'Đang chờ xác nhận PIN…' : `Ký lệnh trả ${usdc(bug.payoutAmount)} USDC`}
            </button>
          )}
          <p className="small muted" style={{ margin: 0 }}>Xác nhận bằng mã PIN ví Circle. Tiền đi thẳng từ escrow tới ví tester.</p>
        </section>
      )}

      {role === 'tester' && bug.status === 'needs_info' && mode === 'none' && (
        <button type="button" className="btn primary block" onClick={() => setMode('reply')}>Trả lời dự án</button>
      )}
      {role === 'tester' && bug.status === 'rejected' && mode === 'none' && (
        <button type="button" className="btn block" onClick={() => setMode('dispute')}>Khiếu nại ({timeLeft(bug.disputeDueAt)})</button>
      )}

      {mode !== 'none' && (
        <form className="card stack" onSubmit={submitForm}>
          {mode === 'reject' && (
            <>
              <label className="field"><span>Lý do</span>
                <select className="input" required value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Chọn lý do…</option>
                  {Object.entries(REJECT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              {reason === 'duplicate' && (
                <label className="field"><span>Mã bug gốc (UUID, gửi trước bug này)</span><input className="input mono" required value={duplicateOf} onChange={(e) => setDuplicateOf(e.target.value.trim())} /></label>
              )}
            </>
          )}
          <label className="field">
            <span>{{ reject: 'Giải thích cho tester (không bắt buộc)', info: 'Bạn cần tester bổ sung gì?', reply: 'Thông tin bổ sung', dispute: 'Vì sao việc từ chối là sai?' }[mode]}</span>
            <textarea className="input" rows={4} required={mode !== 'reject'} maxLength={mode === 'dispute' ? 2000 : 3000} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="row">
            <button type="submit" className={`btn ${mode === 'reject' ? 'danger' : 'primary'}`} disabled={!!busy}>{busy ? 'Đang gửi…' : 'Gửi'}</button>
            <button type="button" className="btn" onClick={() => setMode('none')}>Huỷ</button>
          </div>
        </form>
      )}

      {role === 'admin' && <button type="button" className="btn" onClick={() => navigate('/app/admin')}>Về trang admin</button>}
    </main>
  )
}
