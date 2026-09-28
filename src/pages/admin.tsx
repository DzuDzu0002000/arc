import { useState } from 'react'
import { api, post, type Severity } from '../api'
import { useSession } from '../App'
import { t } from '../i18n'
import { dateTime, Link, Loading, rejectLabel, SEVERITY_ORDER, SeverityChip, usdc, useLoad } from '../ui'

type Dispute = {
  id: string; reason: string; status: 'open' | 'upheld' | 'dismissed'; resolution_note: string | null; created_at: string; resolved_at: string | null
  conflict: string | null
  bugs: {
    id: string; title: string; severity_claimed: Severity; severity_final: Severity | null; payout_amount: string | null
    reject_reason: string; reject_note: string | null; accounts: { display_name: string } | null
    campaigns: { id: string; title: string; product_name: string } | null
  } | null
}

/** Admin: judge disputes between testers and projects; upheld disputes are paid from escrow by the arbiter. */
export function Admin() {
  const { session } = useSession()
  const allowed = session?.authenticated && session.isAdmin
  const [tab, setTab] = useState<'open' | 'resolved'>('open')
  const { data, error, reload } = useLoad(
    () => (allowed ? api<{ disputes: Dispute[] }>(`/api/admin?status=${tab}`) : Promise.resolve({ disputes: [] })), [allowed, tab],
  )
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [severity, setSeverity] = useState<Record<string, Severity>>({})
  const [busy, setBusy] = useState('')
  const [actionError, setActionError] = useState('')

  if (!allowed) return <main className="page"><h1>Admin</h1><div className="alert error">{t('Bạn không có quyền admin.')}</div></main>

  async function resolve(id: string, decision: 'upheld' | 'dismissed', claimed: Severity) {
    setBusy(id)
    setActionError('')
    try {
      await post('/api/admin', { action: 'resolve-dispute', id, decision, note: notes[id] || '', severity: severity[id] ?? claimed })
      await reload()
    } catch (e) { setActionError((e as Error).message) } finally { setBusy('') }
  }

  return (
    <main className="page wide">
      <h1>{t('Xử lý tranh chấp')}</h1>
      <p className="muted" style={{ margin: 0 }}>{t('Tester khiếu nại khi dự án từ chối bug. Nếu tester đúng, ví arbiter của nền tảng trả tiền từ escrow của chiến dịch.')}</p>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" className="tab-chip" aria-selected={tab === 'open'} onClick={() => setTab('open')}>{t('Đang mở')}</button>
        <button type="button" role="tab" className="tab-chip" aria-selected={tab === 'resolved'} onClick={() => setTab('resolved')}>{t('Đã xử lý')}</button>
      </div>
      {actionError && <div className="alert error" role="alert">{actionError}</div>}
      {!data ? <Loading error={error} onRetry={reload} /> : data.disputes.length === 0 ? (
        <div className="card muted">{tab === 'open' ? t('Không có khiếu nại nào đang chờ.') : t('Chưa xử lý khiếu nại nào.')}</div>
      ) : data.disputes.map((d) => d.bugs && (
        <section key={d.id} className="card stack">
          <div className="row between wrap small muted">
            <span>{d.bugs.campaigns?.product_name} · tester {d.bugs.accounts?.display_name}</span>
            <span>{t('Gửi lúc {time}', { time: dateTime(d.created_at) })}</span>
          </div>
          <Link to={`/app/bugs/${d.bugs.id}`}><strong>{d.bugs.title}</strong></Link>
          <div className="grid2">
            <div className="stack" style={{ gap: 4 }}>
              <div className="label">{t('Dự án từ chối vì')}</div>
              <div>{rejectLabel(d.bugs.reject_reason)}</div>
              {d.bugs.reject_note && <div className="small muted pre">{d.bugs.reject_note}</div>}
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <div className="label">{t('Tester phản hồi')}</div>
              <div className="pre">{d.reason}</div>
            </div>
          </div>

          {d.status === 'open' && d.conflict ? (
            <div className="alert warn">{t('Bạn là một bên trong tranh chấp này (chủ chiến dịch hoặc tester báo bug), nên cần một admin khác xử lý.')}</div>
          ) : d.status === 'open' ? (
            <>
              <div className="grid2">
                <label className="field"><span>{t('Mức độ nếu tester đúng (tester khai: {severity})', { severity: d.bugs.severity_claimed })}</span>
                  <select className="input" value={severity[d.id] ?? d.bugs.severity_claimed} onChange={(e) => setSeverity({ ...severity, [d.id]: e.target.value as Severity })}>
                    {SEVERITY_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="field"><span>{t('Ghi chú quyết định (hai bên đều thấy)')}</span><textarea className="input" rows={2} value={notes[d.id] || ''} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} /></label>
              </div>
              <div className="row wrap">
                <button type="button" className="btn primary" disabled={!!busy} onClick={() => resolve(d.id, 'upheld', d.bugs!.severity_claimed)}>{busy === d.id ? t('Đang xử lý…') : t('Tester đúng · trả tiền')}</button>
                <button type="button" className="btn" disabled={!!busy} onClick={() => resolve(d.id, 'dismissed', d.bugs!.severity_claimed)}>{t('Giữ quyết định từ chối')}</button>
              </div>
            </>
          ) : (
            <div className="row between wrap divider" style={{ paddingTop: 10 }}>
              <span className={`pill ${d.status === 'upheld' ? 'st-good' : 'st-bad'}`}>
                {d.status === 'upheld' ? t('Tester thắng · trả {amount} USDC', { amount: usdc(d.bugs.payout_amount) }) : t('Giữ từ chối')}
              </span>
              {d.bugs.severity_final && <SeverityChip severity={d.bugs.severity_final} />}
              {d.resolution_note && <div className="small muted pre" style={{ width: '100%' }}>{d.resolution_note}</div>}
            </div>
          )}
        </section>
      ))}
    </main>
  )
}
