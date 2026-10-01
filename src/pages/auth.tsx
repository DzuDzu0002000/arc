import { useEffect, useState, type FormEvent } from 'react'
import { post } from '../api'
import { useSession } from '../App'
import { confirmChallenge, finishGoogleLogin, googleEnabled, hasGoogleReturn, loginWithEmail, startGoogleLogin } from '../circle'
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

// Finishing a Google return must run once, even when React re-runs effects in development.
let googleReturnHandled = false

type Step = 'email' | 'otp' | 'google' | 'wallet' | 'session'

const googleLogo = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
)

export function SignIn() {
  const { refresh } = useSession()
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<Step>(() => (hasGoogleReturn() ? 'google' : 'email'))
  const [error, setError] = useState('')
  const busy = step !== 'email'

  const next = new URLSearchParams(window.location.search).get('next')
  const destination = next && next.startsWith('/app') ? next : '/app'

  async function createSession(login: Awaited<ReturnType<typeof loginWithEmail>>) {
    const payload = { userToken: login.userToken, refreshToken: login.refreshToken, deviceId: login.deviceId, email: login.email ?? email }
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

  async function complete(getLogin: () => ReturnType<typeof loginWithEmail>) {
    try {
      const login = await getLogin()
      setStep('session')
      await createSession(login)
      await refresh()
      navigate(destination)
    } catch (e) {
      setError((e as Error).message)
      setStep('email')
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setStep('otp')
    void complete(() => loginWithEmail(email.trim().toLowerCase()))
  }

  async function google() {
    setError('')
    setStep('google')
    try {
      await startGoogleLogin() // leaves the page; we continue in the effect below when Google sends the user back
    } catch (e) {
      setError((e as Error).message)
      setStep('email')
    }
  }

  // Back from Google: let Circle verify the token in the URL, then open the session.
  useEffect(() => {
    if (!hasGoogleReturn() || googleReturnHandled) return
    googleReturnHandled = true
    void complete(finishGoogleLogin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const status: Record<Step, string> = {
    email: '', otp: t('Kiểm tra email và nhập mã trong cửa sổ Circle…'), google: t('Đang đăng nhập bằng Google…'),
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
      {googleEnabled && (
        <>
          <div className="or-divider"><span>{t('hoặc')}</span></div>
          <button className="btn block google-btn" type="button" disabled={busy} onClick={() => void google()}>{googleLogo}{t('Tiếp tục với Google')}</button>
        </>
      )}
      {status[step] && <p className="muted" role="status">{status[step]}</p>}
      {step === 'otp' && <div className="alert warn">{t('Không thấy email? Hãy xem mục Thư rác (Spam) hoặc Quảng cáo. Mã được gửi từ auth@archunt.site; bấm "Không phải thư rác" để lần sau email vào hộp thư chính.')}</div>}
      {step === 'wallet' && <div className="alert warn">{t('Hãy ghi nhớ mã PIN 6 số này. Bạn cần nó mỗi khi nạp hoặc trả USDC. ArcHunt không lưu và không khôi phục được mã PIN.')}</div>}
      {error && <div className="alert error" role="alert">{error}</div>}
    </main>
  )
}
