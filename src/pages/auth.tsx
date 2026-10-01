import { useState, type FormEvent } from 'react'
import { post } from '../api'
import { useSession } from '../App'
import { confirmChallenge, loginWithEmail } from '../circle'
import { t } from '../i18n'
import { BrandMark, Prefs, Link, navigate } from '../ui'

function Header() {
  return (
    <div className="row between">
      <Link to="/" className="brand"><BrandMark />ArcHunt</Link>
      <Prefs />
    </div>
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
      {step === 'otp' && <div className="alert warn">{t('Không thấy email? Hãy xem mục Thư rác (Spam) hoặc Quảng cáo. Mã được gửi từ auth@archunt.site; bấm "Không phải thư rác" để lần sau email vào hộp thư chính.')}</div>}
      {step === 'wallet' && <div className="alert warn">{t('Hãy ghi nhớ mã PIN 6 số này. Bạn cần nó mỗi khi nạp hoặc trả USDC. ArcHunt không lưu và không khôi phục được mã PIN.')}</div>}
      {error && <div className="alert error" role="alert">{error}</div>}
    </main>
  )
}
