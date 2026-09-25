import { useState } from 'react'
import { api, type MeData } from '../api'
import { useSession } from '../App'
import { clearLogin } from '../circle'
import { addressUrl, Link, Loading, navigate, txUrl, usdc, useLoad } from '../ui'

export function Wallet() {
  const { session, refresh } = useSession()
  const { data, error, reload } = useLoad(() => api<MeData>('/api/me'), [])
  const [copied, setCopied] = useState(false)
  if (!data || !session?.authenticated) return <main className="page"><h1>Ví</h1><Loading error={error} onRetry={reload} /></main>

  const address = data.wallet.address
  const payouts = data.bugs.filter((b) => b.status === 'paid')

  async function copy() {
    try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ }
  }

  async function signOut() {
    await api('/api/auth/session', { method: 'DELETE' })
    clearLogin()
    await refresh()
    navigate('/')
  }

  return (
    <main className="page">
      <h1>Ví</h1>
      <section className="card stack" style={{ gap: 14 }}>
        <div className="row between"><span className="muted small">Số dư</span><span className="pill">Arc Testnet</span></div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 40, fontWeight: 700, lineHeight: 1 }}>
          {data.wallet.balance === null ? '—' : usdc(data.wallet.balance)} <span className="muted" style={{ fontSize: 20 }}>USDC</span>
        </div>
        <div className="row">
          <a className="mono" href={addressUrl(address)} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>{address}</a>
          <button type="button" className="btn" style={{ minHeight: 36 }} onClick={copy}>{copied ? 'Đã chép' : 'Chép'}</button>
        </div>
        <div className="row wrap">
          <a className="btn" href="https://faucet.circle.com" target="_blank" rel="noreferrer">Nhận USDC testnet</a>
          <button type="button" className="btn" onClick={() => void reload()}>Làm mới</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Trên Arc, USDC vừa là tiền thưởng vừa là phí gas.</p>
      </section>

      <section className="card stack">
        <div className="label">Tiền thưởng đã nhận</div>
        {payouts.length === 0 ? <div className="muted small">Chưa có khoản nào.</div> : payouts.map((b) => (
          <div key={b.id} className="row between divider" style={{ paddingTop: 8 }}>
            <div><Link to={`/app/bugs/${b.id}`}>{b.title}</Link><div className="small muted">{b.campaigns?.product_name}</div></div>
            <div style={{ textAlign: 'right' }}>
              <strong style={{ color: 'var(--accent-hover)' }}>+{usdc(b.payout_amount)}</strong>
              {b.payout_tx && <div className="small"><a href={txUrl(b.payout_tx)} target="_blank" rel="noreferrer">Giao dịch</a></div>}
            </div>
          </div>
        ))}
      </section>

      <section className="card row between">
        <div><strong>{session.account.displayName || 'Tài khoản'}</strong><div className="small muted">{session.account.email}</div></div>
        <div className="row">
          {session.isAdmin && <Link to="/app/admin" className="btn">Admin</Link>}
          <button type="button" className="btn" onClick={signOut}>Đăng xuất</button>
        </div>
      </section>
    </main>
  )
}
