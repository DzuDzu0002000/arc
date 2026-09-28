import { useState, type FormEvent } from 'react'
import { api, post, type TesterPage, type TesterProfile } from '../api'
import { locale, t } from '../i18n'
import { BackLink, dateTime, Link, Loading, usdc, useLoad } from '../ui'

/** ★★★★☆ with an accessible label; half stars round to the nearest whole star. */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const full = Math.round(value)
  return (
    <span className="stars" role="img" aria-label={t('{n} trên 5 sao', { n: value })} style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} aria-hidden="true" className={i <= full ? 'on' : undefined}>★</span>)}
    </span>
  )
}

/** Compact track record shown to projects next to an application or a bug. */
export function TesterCard({ id, name, profile, compact = false }: { id: string; name: string; profile: TesterProfile; compact?: boolean }) {
  return (
    <div className="tester-card">
      <div className="row between wrap">
        <Link to={`/app/testers/${id}`}><strong>{name}</strong></Link>
        {profile.ratingAvg !== null
          ? <span className="row" style={{ gap: 6 }}><Stars value={profile.ratingAvg} /><strong>{profile.ratingAvg.toFixed(1)}</strong><span className="small muted">({t('{n} đánh giá', { n: profile.ratingCount })})</span></span>
          : <span className="small muted">{t('Chưa có đánh giá')}</span>}
      </div>
      <div className={compact ? 'tester-stats compact' : 'tester-stats'}>
        <div><strong>{profile.campaignsTested}</strong><span>{t('dự án đã test')}</span></div>
        <div><strong>{profile.bugsReported}</strong><span>{t('bug đã báo')}</span></div>
        <div><strong>{profile.bugsAccepted}</strong><span>{t('bug được chấp nhận')}</span></div>
        <div><strong>{profile.acceptanceRate === null ? '—' : `${profile.acceptanceRate}%`}</strong><span>{t('tỷ lệ chấp nhận')}</span></div>
      </div>
    </div>
  )
}

/** Shown to the project once a bug is paid: rate the tester 1–5 stars, once per bug. */
export function RateTester({ bugId, testerName, onDone }: { bugId: string; testerName: string; onDone: () => void }) {
  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!stars) { setError(t('Chọn số sao.')); return }
    setBusy(true)
    setError('')
    try {
      await post('/api/bugs', { action: 'rate', id: bugId, stars, comment })
      onDone()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const labels = ['', t('Kém'), t('Tạm được'), t('Tốt'), t('Rất tốt'), t('Xuất sắc')]
  return (
    <form className="card stack rate-card" onSubmit={submit}>
      <strong>{t('Đánh giá {name} cho bug này', { name: testerName })}</strong>
      <span className="small muted">{t('Đánh giá hiện trên hồ sơ tester để các dự án khác tham khảo. Mỗi bug đánh giá một lần.')}</span>
      <div className="row" role="radiogroup" aria-label={t('Số sao')} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={stars === i} aria-label={t('{n} sao', { n: i })}
            className={`star-btn ${i <= (hover || stars) ? 'on' : ''}`} onMouseEnter={() => setHover(i)} onClick={() => setStars(i)}>★</button>
        ))}
        <span className="small" style={{ fontWeight: 600 }}>{labels[hover || stars]}</span>
      </div>
      <label className="field"><span>{t('Nhận xét (không bắt buộc)')}</span>
        <textarea className="input" rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('Báo cáo rõ ràng, tái hiện được ngay…')} />
      </label>
      {error && <div className="alert error" role="alert">{error}</div>}
      <button type="submit" className="btn primary" disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy ? t('Đang gửi…') : t('Gửi đánh giá')}</button>
    </form>
  )
}

/** Full tester profile: stats plus what previous projects said. */
export function TesterProfilePage({ id }: { id: string }) {
  const { data, error, reload } = useLoad(() => api<TesterPage>(`/api/testers?id=${id}`), [id])
  if (!data) return <main className="page"><BackLink to="/app" /><Loading error={error} onRetry={reload} /></main>
  const { profile } = data
  return (
    <main className="page">
      <BackLink to="/app" />
      <div className="stack">
        <span className="label">{t('Hồ sơ tester')}</span>
        <h1>{data.tester.displayName}</h1>
        <span className="small muted">{t('Tham gia từ {date}', { date: new Date(data.tester.memberSince).toLocaleDateString(locale(), { dateStyle: 'medium' }) })}</span>
      </div>
      <section className="card">
        <TesterCard id={data.tester.id} name={data.tester.displayName} profile={profile} />
        <div className="row wrap small muted divider" style={{ marginTop: 12, paddingTop: 12 }}>
          <span>{t('{n} bug Critical/High được chấp nhận', { n: profile.criticalOrHigh })}</span>
          <span>·</span>
          <span>{t('Đã nhận {amount} USDC', { amount: usdc(profile.earned) })}</span>
        </div>
      </section>
      <section className="card stack">
        <div className="label">{t('Đánh giá từ các dự án')}</div>
        {data.ratings.length === 0 ? <div className="muted small">{t('Chưa có đánh giá')}</div> : data.ratings.map((r, i) => (
          <div key={i} className="stack divider" style={{ paddingTop: 10, gap: 4 }}>
            <div className="row between wrap"><Stars value={r.stars} /><span className="small muted">{r.campaigns?.product_name} · {dateTime(r.created_at)}</span></div>
            {r.comment && <div className="pre">{r.comment}</div>}
          </div>
        ))}
      </section>
    </main>
  )
}
