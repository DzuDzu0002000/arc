import { useState } from 'react'
import { api, post, type Severity } from '../api'
import { useSession } from '../App'
import { Link, Loading, REJECT_LABEL, SEVERITY_ORDER, useLoad } from '../ui'

type Dispute = {
  id: string; reason: string; created_at: string
  bugs: { id: string; title: string; severity_claimed: Severity; reject_reason: string; reject_note: string | null; campaigns: { id: string; title: string; product_name: string } | null } | null
}

export function Admin() {
  const { session } = useSession()
  const allowed = session?.authenticated && session.isAdmin
  const { data, error, reload } = useLoad(() => (allowed ? api<{ disputes: Dispute[] }>('/api/admin') : Promise.resolve({ disputes: [] })), [allowed])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [severity, setSeverity] = useState<Record<string, Severity>>({})
  const [busy, setBusy] = useState('')
  const [actionError, setActionError] = useState('')

  if (!allowed) return <main className="page"><h1>Admin</h1><div className="alert error">Bạn không có quyền admin.</div></main>
  if (!data) return <main className="page"><h1>Admin</h1><Loading error={error} onRetry={reload} /></main>

  async function resolve(id: string, decision: 'upheld' | 'dismissed', claimed: Severity) {
    setBusy(id)
    setActionError('')
    try {
      await post('/api/admin', { action: 'resolve-dispute', id, decision, note: notes[id] || '', severity: severity[id] ?? claimed })
      await reload()
    } catch (e) { setActionError((e as Error).message) } finally { setBusy('') }
  }

  return (
    <main className="page">
      <h1>Khiếu nại đang mở</h1>
      {actionError && <div className="alert error" role="alert">{actionError}</div>}
      {data.disputes.length === 0 ? <div className="card muted">Không có khiếu nại nào.</div> : data.disputes.map((d) => d.bugs && (
        <section key={d.id} className="card stack">
          <div className="small muted">{d.bugs.campaigns?.product_name} · {d.bugs.campaigns?.title}</div>
          <Link to={`/app/bugs/${d.bugs.id}`}><strong>{d.bugs.title}</strong></Link>
          <div className="small">Dự án từ chối: {REJECT_LABEL[d.bugs.reject_reason] ?? d.bugs.reject_reason}{d.bugs.reject_note ? ` — ${d.bugs.reject_note}` : ''}</div>
          <div className="pre">Tester: {d.reason}</div>
          <label className="field"><span>Mức độ nếu chấp nhận</span>
            <select className="input" value={severity[d.id] ?? d.bugs.severity_claimed} onChange={(e) => setSeverity({ ...severity, [d.id]: e.target.value as Severity })}>
              {SEVERITY_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="field"><span>Ghi chú quyết định</span><textarea className="input" rows={2} value={notes[d.id] || ''} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} /></label>
          <div className="row">
            <button type="button" className="btn primary" disabled={!!busy} onClick={() => resolve(d.id, 'upheld', d.bugs!.severity_claimed)}>Tester đúng · trả tiền</button>
            <button type="button" className="btn" disabled={!!busy} onClick={() => resolve(d.id, 'dismissed', d.bugs!.severity_claimed)}>Giữ từ chối</button>
          </div>
        </section>
      ))}
    </main>
  )
}
