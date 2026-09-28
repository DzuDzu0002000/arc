import { useState, type FormEvent } from 'react'
import { api, post, type BugView, type Severity } from '../api'
import { ReauthRequired, signAndConfirm } from '../circle'
import { t } from '../i18n'
import { RateTester, Stars, TesterCard } from './tester-profile'
import {
  BackLink, BugStatusChip, dateTime, Link, Loading, navigate, REJECT_REASONS, rejectLabel, SEVERITY_ORDER, SeverityChip, timeLeft, txUrl, usdc, useLoad,
} from '../ui'

function ReauthNotice({ path }: { path: string }) {
  return (
    <div className="alert warn" role="alert">
      {t('Phiên ký của Circle đã hết hạn (khoảng 60 phút).')} <Link to={`/auth?next=${encodeURIComponent(path)}`}>{t('Đăng nhập lại')}</Link>
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
  const back = role === 'owner' ? '/app/review' : role === 'admin' ? '/app/admin' : '/app/work'

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
          {bug.decidedBy === 'timeout' && <span className="pill st-warn">{t('Tự chấp nhận do quá hạn')}</span>}
        </div>
      </div>

      {bug.status === 'submitted' && bug.responseDueAt && (
        <div className="alert warn">{t('Hạn phản hồi của dự án: {time}. Quá hạn, bug tự được chấp nhận ở mức {severity}.', { time: timeLeft(bug.responseDueAt), severity: bug.severityClaimed })}</div>
      )}
      {bug.status === 'rejected' && (
        <div className="alert error">
          {t('Từ chối: {reason}', { reason: rejectLabel(bug.rejectReason) })}
          {bug.duplicateOf && <> ({t('bug gốc')} <span className="mono">{bug.duplicateOf.slice(0, 8)}</span>)</>}
          {bug.rejectNote && <div className="pre" style={{ marginTop: 6 }}>{bug.rejectNote}</div>}
        </div>
      )}
      {role !== 'tester' && data.testerProfile && (
        <section className="card"><TesterCard id={bug.testerId} name={bug.testerName} profile={data.testerProfile} compact /></section>
      )}
      {role === 'owner' && bug.status === 'paid' && !data.rating && <RateTester bugId={bug.id} testerName={bug.testerName} onDone={() => void reload()} />}
      {data.rating && (
        <section className="card stack" style={{ gap: 6 }}>
          <div className="row between wrap"><span className="label">{role === 'tester' ? t('Dự án đánh giá bạn') : t('Bạn đã đánh giá tester')}</span><Stars value={data.rating.stars} size={18} /></div>
          {data.rating.comment && <div className="pre">{data.rating.comment}</div>}
        </section>
      )}
      {bug.payoutTx && <div className="alert ok">{t('Đã trả {amount} USDC.', { amount: usdc(bug.payoutAmount) })} <a href={txUrl(bug.payoutTx)} target="_blank" rel="noreferrer">{t('Xem giao dịch')}</a></div>}

      <section className="card stack">
        <div className="label">{t('Các bước tái hiện')}</div><div className="pre">{bug.steps}</div>
        <div className="grid2">
          <div><div className="label">{t('Mong đợi')}</div><div className="pre">{bug.expected}</div></div>
          <div><div className="label">{t('Thực tế')}</div><div className="pre">{bug.actual}</div></div>
        </div>
        <div className="label">{t('Môi trường')}</div><div>{bug.environment}</div>
        {bug.evidenceUrls.length > 0 && (<><div className="label">{t('Bằng chứng')}</div>{bug.evidenceUrls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer noopener" style={{ overflowWrap: 'anywhere' }}>{u}</a>)}</>)}
      </section>

      {data.messages.length > 0 && (
        <section className="card stack">
          <div className="label">{t('Trao đổi')}</div>
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
          <div className="label">{t('Khiếu nại')} · {t({ open: 'đang chờ admin', upheld: 'đã thắng', dismissed: 'bị bác' }[data.dispute.status] ?? data.dispute.status)}</div>
          <div className="pre">{data.dispute.reason}</div>
          {data.dispute.resolution_note && <div className="pre muted">{t('Admin: {note}', { note: data.dispute.resolution_note })}</div>}
        </section>
      )}

      {reauth && <ReauthNotice path={`/app/bugs/${id}`} />}
      {actionError && <div className="alert error" role="alert">{actionError}</div>}

      {role === 'owner' && (bug.status === 'submitted' || bug.status === 'accepted') && mode === 'none' && (
        <section className="card stack">
          {bug.status === 'submitted' ? (
            <>
              <div className="label">{t('Mức độ chốt (tester khai: {severity})', { severity: bug.severityClaimed })}</div>
              <div className="grid4">
                {SEVERITY_ORDER.filter((s) => data.payouts[s]).map((s) => (
                  <button key={s} type="button" className="seg" aria-pressed={chosen === s} onClick={() => setSeverity(s)}>
                    {s[0].toUpperCase() + s.slice(1)}<small>{usdc(data.payouts[s])}</small>
                  </button>
                ))}
              </div>
              <button type="button" className="btn primary block" disabled={!!busy || !data.payouts[chosen]} onClick={acceptAndPay}>
                {busy === 'accept' ? t('Đang chờ xác nhận PIN…') : t('Chấp nhận và trả {amount} USDC', { amount: usdc(data.payouts[chosen]) })}
              </button>
              <div className="row">
                <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setMode('info')}>{t('Hỏi thêm')}</button>
                <button type="button" className="btn danger" style={{ flex: 1 }} onClick={() => setMode('reject')}>{t('Từ chối…')}</button>
              </div>
            </>
          ) : (
            <button type="button" className="btn primary block" disabled={!!busy} onClick={acceptAndPay}>
              {busy === 'accept' ? t('Đang chờ xác nhận PIN…') : t('Ký lệnh trả {amount} USDC', { amount: usdc(bug.payoutAmount) })}
            </button>
          )}
          <p className="small muted" style={{ margin: 0 }}>{t('Xác nhận bằng mã PIN ví Circle. Tiền đi thẳng từ escrow tới ví tester.')}</p>
        </section>
      )}

      {role === 'tester' && bug.status === 'needs_info' && mode === 'none' && (
        <button type="button" className="btn primary block" onClick={() => setMode('reply')}>{t('Trả lời dự án')}</button>
      )}
      {role === 'tester' && bug.status === 'rejected' && mode === 'none' && (
        <button type="button" className="btn block" onClick={() => setMode('dispute')}>{t('Khiếu nại')} ({timeLeft(bug.disputeDueAt)})</button>
      )}

      {mode !== 'none' && (
        <form className="card stack" onSubmit={submitForm}>
          {mode === 'reject' && (
            <>
              <label className="field"><span>{t('Lý do')}</span>
                <select className="input" required value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">{t('Chọn lý do…')}</option>
                  {REJECT_REASONS.map((value) => <option key={value} value={value}>{rejectLabel(value)}</option>)}
                </select>
              </label>
              {reason === 'duplicate' && (
                <label className="field"><span>{t('Mã bug gốc (UUID, gửi trước bug này)')}</span><input className="input mono" required value={duplicateOf} onChange={(e) => setDuplicateOf(e.target.value.trim())} /></label>
              )}
            </>
          )}
          <label className="field">
            <span>{t({ reject: 'Giải thích cho tester (không bắt buộc)', info: 'Bạn cần tester bổ sung gì?', reply: 'Thông tin bổ sung', dispute: 'Vì sao việc từ chối là sai?' }[mode])}</span>
            <textarea className="input" rows={4} required={mode !== 'reject'} maxLength={mode === 'dispute' ? 2000 : 3000} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="row">
            <button type="submit" className={`btn ${mode === 'reject' ? 'danger' : 'primary'}`} disabled={!!busy}>{busy ? t('Đang gửi…') : t('Gửi')}</button>
            <button type="button" className="btn" onClick={() => setMode('none')}>{t('Huỷ')}</button>
          </div>
        </form>
      )}

      {role === 'admin' && <button type="button" className="btn" onClick={() => navigate('/app/admin')}>{t('Về trang admin')}</button>}
    </main>
  )
}
