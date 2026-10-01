import { useState } from 'react'
import { api, type Role } from '../api'
import { useSession } from '../App'
import { t } from '../i18n'
import { BrandMark, Icons, Prefs, navigate } from '../ui'

const CHOICES: Array<{ role: Role; title: string; body: string; points: string[]; icon: typeof Icons.projects }> = [
  {
    role: 'project', title: 'Tôi là dự án', icon: Icons.projects,
    body: 'Đăng chiến dịch test cho sản phẩm AI của bạn và trả thưởng cho bug hợp lệ.',
    points: ['Nạp ngân sách USDC vào escrow', 'Duyệt tester, xét bug được báo', 'Xác nhận trả tiền bằng PIN'],
  },
  {
    role: 'tester', title: 'Tôi là tester', icon: Icons.work,
    body: 'Tìm lỗi trong sản phẩm AI và nhận USDC cho mỗi bug được chấp nhận.',
    points: ['Ứng tuyển vào chiến dịch', 'Gửi và theo dõi bug của bạn', 'Khiếu nại khi bị từ chối sai'],
  },
]

export function Welcome() {
  const { refresh } = useSession()
  const [picked, setPicked] = useState<Role | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (!picked) return
    setBusy(true)
    setError('')
    try {
      await api('/api/auth/session', { method: 'PATCH', body: { role: picked } })
      await refresh()
      navigate('/app')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="page" style={{ maxWidth: 760, paddingTop: 48 }}>
      <div className="row between"><div className="brand"><BrandMark />ArcHunt</div><Prefs /></div>
      <div className="stack">
        <h1>{t('Bạn tham gia ArcHunt với vai trò nào?')}</h1>
        <p className="muted" style={{ margin: 0 }}>{t('Mỗi tài khoản chọn một vai trò. Giao diện và quyền thao tác sẽ khác nhau theo vai trò bạn chọn.')}</p>
      </div>
      <div className="grid2" role="radiogroup" aria-label={t('Vai trò')}>
        {CHOICES.map((c) => (
          <button key={c.role} type="button" role="radio" aria-checked={picked === c.role} className="role-card" onClick={() => setPicked(c.role)}>
            <span className="role-icon">{c.icon}</span>
            <strong style={{ fontFamily: 'var(--display)', fontSize: 20 }}>{t(c.title)}</strong>
            <span className="muted">{t(c.body)}</span>
            <ul className="stack small" style={{ margin: 0, paddingLeft: 18, gap: 4 }}>{c.points.map((p) => <li key={p}>{t(p)}</li>)}</ul>
          </button>
        ))}
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      <button type="button" className="btn primary block" disabled={!picked || busy} onClick={confirm}>
        {busy ? t('Đang lưu…') : picked === 'project' ? t('Tiếp tục với vai trò dự án') : picked === 'tester' ? t('Tiếp tục với vai trò tester') : t('Chọn một vai trò')}
      </button>
      <p className="small muted" style={{ margin: 0 }}>{t('Vai trò không đổi được sau khi chọn. Muốn làm cả hai, hãy dùng một email khác.')}</p>
    </main>
  )
}
