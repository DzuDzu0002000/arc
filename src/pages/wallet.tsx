import { useState } from 'react'
import { api, type MeData } from '../api'
import { useSession } from '../App'
import { clearLogin } from '../circle'
import { t } from '../i18n'
import { addressUrl, FAUCET_URL, LangSwitch, Link, localized, Loading, navigate, timeLeft, txUrl, usdc, useLoad } from '../ui'

const demo = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1'

export function Wallet() {
  const { session, refresh } = useSession()
  const { data, error, reload } = useLoad(() => api<MeData>('/api/me'), [])
  const [copied, setCopied] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  if (!data || !session?.authenticated) return <main className="page"><h1>{t('Ví')}</h1><Loading error={error} onRetry={reload} /></main>

  const address = data.wallet.address
  const isProject = data.role === 'project'

  async function copy() {
    try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ }
  }

  async function copyCircleId() {
    if (!session?.authenticated) return
    try { await navigator.clipboard.writeText(session.account.circleUserId); setCopiedId(true); setTimeout(() => setCopiedId(false), 1500) } catch { /* clipboard blocked */ }
  }

  async function signOut() {
    await api('/api/auth/session', { method: 'DELETE' })
    clearLogin()
    await refresh()
    navigate('/')
  }

  async function switchRoleDemo() {
    await api('/api/auth/session', { method: 'PATCH', body: { role: isProject ? 'tester' : 'project', demo: true } })
    await refresh()
    navigate('/app')
  }

  return (
    <main className="page">
      <h1>{isProject ? t('Ví & nạp tiền') : t('Ví')}</h1>
      <section className="card stack" style={{ gap: 14 }}>
        <div className="row between"><span className="muted small">{t('Số dư ví')}</span><span className="pill">Arc Testnet</span></div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 40, fontWeight: 700, lineHeight: 1 }}>
          {data.wallet.balance === null ? '—' : usdc(data.wallet.balance)} <span className="muted" style={{ fontSize: 20 }}>USDC</span>
        </div>
        <div className="row">
          <a className="mono" href={addressUrl(address)} target="_blank" rel="noreferrer">{address}</a>
          <button type="button" className="btn" style={{ minHeight: 36 }} onClick={copy}>{copied ? t('Đã chép') : t('Chép')}</button>
        </div>
        <div className="row wrap">
          <a className="btn primary" href={FAUCET_URL} target="_blank" rel="noreferrer">{t('Lấy USDC testnet (Faucet)')}</a>
          <button type="button" className="btn" onClick={() => void reload()}>{t('Làm mới số dư')}</button>
        </div>
      </section>

      {isProject ? (
        <>
          <section className="card stack">
            <div className="label">{t('Cách nạp tiền cho chiến dịch')}</div>
            <ol className="stack" style={{ margin: 0, paddingLeft: 20 }}>
              <li>{t('Nạp USDC vào ví này: chép địa chỉ ở trên, vào Faucet chọn Arc Testnet và dán địa chỉ.')}</li>
              <li>{t('Tạo chiến dịch và đặt ngân sách.')}</li>
              <li>{t('Trong trang chiến dịch, bấm Nạp escrow và xác nhận bằng PIN. Ngân sách chuyển từ ví này vào hợp đồng escrow.')}</li>
            </ol>
            <p className="small muted" style={{ margin: 0 }}>{t('USDC cũng là phí gas trên Arc, nên hãy để lại một ít trong ví.')}</p>
          </section>
          <section className="card stack">
            <div className="label">{t('Ngân sách đã nạp escrow')}</div>
            {data.campaigns.filter((c) => c.fund_tx).length === 0 ? <div className="muted small">{t('Chưa nạp chiến dịch nào.')}</div>
              : data.campaigns.filter((c) => c.fund_tx).map((c) => (
                <div key={c.id} className="row between divider" style={{ paddingTop: 8 }}>
                  <div><Link to={`/app/projects/${c.id}`}>{localized(c.title, c.title_en)}</Link><div className="small muted">{c.product_name} · {t('kết thúc: {time}', { time: timeLeft(c.ends_at) })}</div></div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>−{usdc(c.budget)}</strong>
                    <div className="small"><a href={txUrl(c.fund_tx as string)} target="_blank" rel="noreferrer">{t('Giao dịch')}</a></div>
                  </div>
                </div>
              ))}
          </section>
        </>
      ) : data.role === 'tester' ? (
        <section className="card stack">
          <div className="label">{t('Tiền thưởng đã nhận')}</div>
          {data.bugs.filter((b) => b.status === 'paid').length === 0 ? <div className="muted small">{t('Chưa có khoản nào.')}</div>
            : data.bugs.filter((b) => b.status === 'paid').map((b) => (
              <div key={b.id} className="row between divider" style={{ paddingTop: 8 }}>
                <div><Link to={`/app/bugs/${b.id}`}>{b.title}</Link><div className="small muted">{b.campaigns?.product_name}</div></div>
                <div style={{ textAlign: 'right' }}>
                  <strong style={{ color: 'var(--accent-hover)' }}>+{usdc(b.payout_amount)}</strong>
                  {b.payout_tx && <div className="small"><a href={txUrl(b.payout_tx)} target="_blank" rel="noreferrer">{t('Giao dịch')}</a></div>}
                </div>
              </div>
            ))}
        </section>
      ) : null}

      <section className="card stack">
        <div className="label">{t('Mã tài khoản Circle')}</div>
        <div className="row wrap">
          <span className="mono">{session.account.circleUserId}</span>
          <button type="button" className="btn" style={{ minHeight: 36 }} onClick={copyCircleId}>{copiedId ? t('Đã chép') : t('Chép')}</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>{t('Mã định danh do Circle xác minh. Gửi mã này cho người quản lý ArcHunt nếu bạn cần được cấp quyền admin.')}</p>
      </section>

      <section className="card row between wrap">
        <div>
          <strong>{session.account.displayName || t('Tài khoản')}</strong>
          <div className="small muted">{session.account.email} · {isProject ? t('Tài khoản dự án') : t('Tài khoản tester')}{session.isAdmin ? ' · Admin' : ''} · Circle Wallet</div>
        </div>
        <div className="row wrap">
          <LangSwitch />
          {demo && <button type="button" className="btn" onClick={switchRoleDemo}>{isProject ? t('Đổi sang tester (demo)') : t('Đổi sang dự án (demo)')}</button>}
          <button type="button" className="btn" onClick={signOut}>{t('Đăng xuất')}</button>
        </div>
      </section>
    </main>
  )
}
