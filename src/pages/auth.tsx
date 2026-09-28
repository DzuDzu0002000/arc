import { useState, type FormEvent } from 'react'
import { post } from '../api'
import { useSession } from '../App'
import { confirmChallenge, loginWithEmail } from '../circle'
import { t } from '../i18n'
import { BrandMark, LangSwitch, Link, navigate } from '../ui'

function Header() {
  return (
    <div className="row between">
      <Link to="/" className="brand"><BrandMark />ArcHunt</Link>
      <LangSwitch />
    </div>
  )
}

export function Landing() {
  return (
    <main className="hero">
      <Header />
      <h1 style={{ marginTop: 40 }}>{t('Test sản phẩm AI.')}<br />{t('Nhận USDC cho mỗi bug được duyệt.')}</h1>
      <p className="muted" style={{ fontSize: 17, margin: 0 }}>
        {t('Dự án AI khóa sẵn tiền thưởng trong escrow trên Arc. Bạn tìm bug, dự án duyệt, tiền về ví bạn ngay.')}
      </p>
      <div className="row wrap">
        <Link to="/auth" className="btn primary">{t('Bắt đầu')}</Link>
        <Link to="/auth?next=/app/projects/new" className="btn">{t('Đăng chiến dịch test')}</Link>
      </div>
      <ul className="stack muted" style={{ marginTop: 'auto', paddingLeft: 18 }}>
        <li>{t('Đăng nhập bằng email qua Circle Wallet, ví được tạo tự động.')}</li>
        <li>{t('Nền tảng không thu phí. Tester nhận đủ 100%.')}</li>
        <li>{t('Dự án không phản hồi đúng hạn thì bug tự được chấp nhận.')}</li>
      </ul>
    </main>
  )
}

type Step = 'email' | 'otp' | 'wallet' | 'session'

export function SignIn() {
  const { refresh } = useSession()
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<Step>('email')
  const [error, setError] = useState('')
  const busy = step !== 'email'

  const next = new URLSearchParams(window.location.search).get('next')
  const destination = next && next.startsWith('/app') ? next : '/app'

  async function createSession(login: Awaited<ReturnType<typeof loginWithEmail>>) {
    const payload = { userToken: login.userToken, refreshToken: login.refreshToken, deviceId: login.deviceId, email }
    let result = await post<{ authenticated: boolean; needsWallet?: boolean; challengeId?: string | null }>('/api/auth/session', payload)
    if (result.needsWallet) {
      setStep('wallet')
      if (result.challengeId) await confirmChallenge(result.challengeId) // user sets a PIN, Circle creates the Arc wallet
      setStep('session')
      for (let i = 0; i < 20 && !result.authenticated; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        result = await post('/api/auth/session', payload)
      }
      if (!result.authenticated) throw new Error(t('Ví đang được tạo. Thử đăng nhập lại sau ít phút.'))
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setStep('otp')
    try {
      const login = await loginWithEmail(email.trim().toLowerCase())
      setStep('session')
      await createSession(login)
      await refresh()
      navigate(destination)
    } catch (e) {
      setError((e as Error).message)
      setStep('email')
    }
  }

  const status: Record<Step, string> = {
    email: '', otp: t('Kiểm tra email và nhập mã trong cửa sổ Circle…'),
    wallet: t('Tạo mã PIN để bảo vệ ví của bạn…'), session: t('Đang chuẩn bị tài khoản…'),
  }

  return (
    <main className="hero">
      <Header />
      <h1 style={{ marginTop: 40 }}>{t('Đăng nhập')}</h1>
      <p className="muted" style={{ margin: 0 }}>{t('Đăng nhập bằng Circle Wallet: nhận mã một lần qua email, không cần mật khẩu hay seed phrase. Lần đầu, Circle tạo cho bạn một ví trên Arc.')}</p>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" required autoComplete="email" value={email} disabled={busy}
            onChange={(e) => setEmail(e.target.value)} placeholder={t('ban@email.com')} />
        </label>
        <button className="btn primary block" type="submit" disabled={busy}>{busy ? t('Đang xử lý…') : t('Tiếp tục với Circle Wallet')}</button>
      </form>
      {status[step] && <p className="muted" role="status">{status[step]}</p>}
      {error && <div className="alert error" role="alert">{error}</div>}
    </main>
  )
}
