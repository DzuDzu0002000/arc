import { useEffect, useState, type ReactNode } from 'react'
import { useSession } from '../App'
import { t } from '../i18n'
import { BrandMark, Icons, Prefs, Link } from '../ui'
import '../landing.css'

const check = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></svg>
)
const arrow = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
)

// Cards and headings that fade up as they scroll into view; siblings are staggered.
const REVEAL = '.lp-section-head, .lp-card, .lp-role, .lp-preview, .lp-step, .lp-rules > div, .lp-faq details, .lp-final-box'

function useScrollEffects() {
  useEffect(() => {
    const root = document.documentElement
    const header = document.querySelector<HTMLElement>('.lp-header')
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const max = root.scrollHeight - root.clientHeight
        root.style.setProperty('--lp-progress', String(max > 0 ? Math.min(window.scrollY / max, 1) : 0))
        root.style.setProperty('--lp-scroll', String(window.scrollY))
        header?.classList.toggle('scrolled', window.scrollY > 8)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const targets = [...document.querySelectorAll<HTMLElement>(REVEAL)]
    let observer: IntersectionObserver | null = null
    if (!reduce && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('in')
          observer?.unobserve(entry.target)
        }
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
      for (const el of targets) {
        const siblings = el.parentElement ? [...el.parentElement.children].filter((c) => c.matches(REVEAL)) : [el]
        el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 5) * 90}ms`)
        el.classList.add('reveal')
        observer.observe(el)
      }
    }
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      observer?.disconnect()
      for (const el of targets) el.classList.remove('reveal', 'in')
      root.style.removeProperty('--lp-progress')
      root.style.removeProperty('--lp-scroll')
    }
  }, [])
}

function Header() {
  const { session } = useSession()
  const [open, setOpen] = useState(false)
  const signedIn = Boolean(session?.authenticated)
  return (
    <header className="lp-header">
      <div className="lp-progress" aria-hidden="true" />
      <div className="lp-wrap lp-header-row">
        <Link to="/" className="brand"><BrandMark />ArcHunt</Link>
        <nav className="lp-nav" aria-label={t('Giới thiệu')}>
          <div className="lp-dropdown" onMouseLeave={() => setOpen(false)}>
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} onMouseEnter={() => setOpen(true)}>{t('Sản phẩm')} ▾</button>
            {open && (
              <div className="lp-menu">
                <a href="#projects" onClick={() => setOpen(false)}><strong>{t('Cho dự án AI')}</strong><span>{t('Đăng chiến dịch, khóa ngân sách trong escrow, trả thưởng cho bug hợp lệ.')}</span></a>
                <a href="#testers" onClick={() => setOpen(false)}><strong>{t('Cho tester')}</strong><span>{t('Ứng tuyển, tìm bug, nhận USDC ngay khi được duyệt.')}</span></a>
                <a href="#fair" onClick={() => setOpen(false)}><strong>{t('Escrow trên Arc')}</strong><span>{t('Tiền nằm trong hợp đồng, không ai rút ngang được.')}</span></a>
              </div>
            )}
          </div>
          <a href="#how">{t('Cách hoạt động')}</a>
          <a href="#faq">{t('Hỏi đáp')}</a>
        </nav>
        <div className="row lp-actions">
          <Prefs />
          {signedIn ? (
            <Link to="/app" className="btn primary">{t('Mở ứng dụng')}</Link>
          ) : (
            <>
              <Link to="/auth" className="lp-signin">{t('Đăng nhập')}</Link>
              <Link to="/auth" className="btn primary">{t('Bắt đầu')}</Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function HeroVisual() {
  return (
    <div className="lp-visual" aria-hidden="true">
      <div className="lp-visual-inner">
        <div className="row between">
          <span className="lp-eyebrow">{t('Escrow chiến dịch')}</span>
          <span className="lp-chip">USDC</span>
        </div>
        <div className="lp-big">1,200 USDC</div>
        <div className="lp-panel warm">
          <div><strong>{t('Bug được chấp nhận')}</strong><span>{t('Trả lời bị cắt · High')}</span></div>
          <strong>+50</strong>
        </div>
        <div className="lp-flow"><span />{arrow}<span /></div>
        <div className="lp-panel">
          <div><strong>{t('Đã trả vào ví tester')}</strong><span>{t('Xác minh trên Arc')}</span></div>
          <span className="lp-chip dot">{t('Tức thì')}</span>
        </div>
        <div className="lp-bar"><span>{t('Bug → thanh toán')}</span><i /><strong>{t('Đã đánh giá ★★★★★')}</strong></div>
      </div>
    </div>
  )
}

function Section({ id, eyebrow, title, lead, children }: { id?: string; eyebrow: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} className="lp-section">
      <div className="lp-wrap">
        <div className="lp-section-head">
          <span className="lp-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          {lead && <p>{lead}</p>}
        </div>
        {children}
      </div>
    </section>
  )
}

const FEATURES: Array<{ icon: ReactNode; tone: string; title: string; body: string }> = [
  { icon: Icons.lock, tone: 'teal', title: 'Tiền khóa trước, trả chắc chắn', body: 'Dự án nạp toàn bộ ngân sách vào hợp đồng escrow trước khi chiến dịch mở. Tester biết chắc có tiền trả.' },
  { icon: Icons.work, tone: 'warm', title: 'Bảng giá rõ theo mức độ', body: 'Critical, High, Medium, Low: mỗi mức một số tiền, công bố trước và khóa khi chiến dịch mở.' },
  { icon: Icons.scale, tone: 'grey', title: 'Tranh chấp công bằng', body: 'Bug bị từ chối có 3 ngày để khiếu nại. Admin độc lập xem xét và có thể trả thẳng từ escrow.' },
]

// A function so the mock cards re-render in the viewer's current language.
const steps = (): Array<{ title: string; body: string; mock: ReactNode }> => [
  {
    title: 'Tạo chiến dịch & nạp escrow',
    body: 'Dự án mô tả sản phẩm, phạm vi test, bảng giá theo mức độ lỗi và nạp ngân sách USDC.',
    mock: (
      <div className="lp-mock stack">
        <div className="row between"><strong>{t('Chiến dịch mới')}</strong><span className="lp-chip">{t('Bản nháp')}</span></div>
        <div className="lp-field">{t('Sản phẩm')}: <b>Lumen Chat</b></div>
        <div className="lp-field">Critical 100 · High 50 · Low 5</div>
        <div className="lp-fake-btn">{t('Nạp 1,200 USDC vào escrow')}</div>
      </div>
    ),
  },
  {
    title: 'Tester ứng tuyển',
    body: 'Tester gửi đơn. Dự án xem hồ sơ: số dự án đã test, bug được chấp nhận, số sao, rồi duyệt.',
    mock: (
      <div className="lp-mock stack">
        <div className="row between"><strong>lan.tester</strong><span className="lp-stars">★★★★★ 4.7</span></div>
        <div className="lp-mini-grid"><span><b>8</b>{t('dự án')}</span><span><b>34</b>{t('bug nhận')}</span><span><b>74%</b>{t('chấp nhận')}</span></div>
        <div className="lp-fake-btn">{t('Duyệt tester')}</div>
      </div>
    ),
  },
  {
    title: 'Gửi bug & xét duyệt',
    body: 'Tester gửi bug kèm các bước tái hiện. Dự án chấp nhận, hỏi thêm hoặc từ chối có lý do trong 5 ngày.',
    mock: (
      <div className="lp-mock stack">
        <div className="lp-option active"><span>1</span><div><b>{t('Chấp nhận')}</b><small>{t('Chọn mức độ, ký trả tiền')}</small></div></div>
        <div className="lp-option"><span>2</span><div><b>{t('Hỏi thêm')}</b><small>{t('Tester bổ sung thông tin')}</small></div></div>
        <div className="lp-option"><span>3</span><div><b>{t('Từ chối')}</b><small>{t('Phải nêu lý do')}</small></div></div>
      </div>
    ),
  },
  {
    title: 'Trả tiền & đánh giá',
    body: 'USDC đi thẳng từ escrow tới ví tester, xác minh trên Arc. Dự án đánh giá tester 1–5 sao.',
    mock: (
      <div className="lp-mock stack">
        <div className="lp-panel tint"><div><strong>{t('Đã trả 50 USDC')}</strong><span>{t('Giao dịch xác minh trên Arc')}</span></div></div>
        <div className="lp-field row between"><span>{t('Trạng thái')}</span><b>{t('Đã trả')}</b></div>
        <div className="lp-field row between"><span>{t('Đánh giá')}</span><b className="lp-stars">★★★★★</b></div>
      </div>
    ),
  },
]

const FAQ: Array<[string, string]> = [
  ['ArcHunt có thu phí không?', 'Không. Nền tảng không thu phí, tester nhận đủ 100% tiền thưởng. Phí gas trên Arc được trả bằng USDC và rất nhỏ.'],
  ['Tôi cần ví crypto để dùng không?', 'Không. Bạn đăng nhập bằng email qua Circle Wallet. Lần đầu, Circle tạo sẵn cho bạn một ví trên Arc, không cần seed phrase.'],
  ['Nếu dự án không phản hồi bug thì sao?', 'Mỗi bug có hạn xét (mặc định 5 ngày). Quá hạn, bug tự được chấp nhận ở mức tester khai và nền tảng trả tiền từ escrow.'],
  ['Dự án có rút tiền escrow bất cứ lúc nào được không?', 'Không. Tiền còn lại chỉ rút được 14 ngày sau khi chiến dịch kết thúc, khi không còn bug hay tranh chấp nào đang chờ.'],
  ['Hiện ArcHunt chạy trên mạng nào?', 'Arc Testnet. Bạn lấy USDC testnet miễn phí ở Circle Faucet để thử toàn bộ luồng.'],
]

export function Landing() {
  const { session } = useSession()
  const signedIn = Boolean(session?.authenticated)
  const start = signedIn ? '/app' : '/auth'
  useScrollEffects()
  return (
    <div className="lp">
      <Header />

      <section className="lp-hero">
        <div className="lp-glow" aria-hidden="true" />
        <div className="lp-wrap lp-hero-grid">
          <div className="stack" style={{ gap: 24 }}>
            <span className="lp-pill"><i />{t('Xây dựng trên Arc · Ví bởi Circle')}</span>
            <h1>{t('Săn bug cho sản phẩm AI.')}<br /><span>{t('Nhận USDC ngay khi được duyệt.')}</span></h1>
            <p className="lp-lead">{t('ArcHunt kết nối dự án AI với tester. Dự án khóa tiền thưởng trong escrow trên Arc, tester tìm lỗi, bug được chấp nhận là tiền về ví ngay.')}</p>
            <div className="row wrap">
              <Link to={start} className="btn primary lp-cta">{t('Bắt đầu săn bug')}</Link>
              <Link to={signedIn ? '/app' : '/auth?next=/app/projects/new'} className="btn lp-cta">{t('Đăng chiến dịch test')}</Link>
            </div>
            <ul className="lp-ticks">
              <li>{check}{t('Không thu phí')}</li>
              <li>{check}{t('Escrow trên chuỗi')}</li>
              <li>{check}{t('Đăng nhập bằng email')}</li>
              <li>{check}{t('Trả bằng USDC')}</li>
            </ul>
          </div>
          <HeroVisual />
        </div>
        <a href="#product" className="lp-scroll">{t('Cuộn để khám phá')} <span aria-hidden="true">⌄</span></a>
      </section>

      <Section id="product" eyebrow={t('Mọi thứ bạn cần')} title={t('Test sản phẩm AI, trả thưởng minh bạch.')} lead={t('Một nơi cho dự án tìm tester và cho tester kiếm tiền từ kỹ năng tìm lỗi.')}>
        <div className="lp-cards">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-card">
              <span className={`lp-icon ${f.tone}`}>{f.icon}</span>
              <h3>{t(f.title)}</h3>
              <p>{t(f.body)}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow={t('Hai vai trò')} title={t('Một nền tảng, hai không gian làm việc.')} lead={t('Mỗi tài khoản chọn một vai trò. Giao diện và quyền thao tác khác nhau theo vai trò.')}>
        <div className="lp-roles">
          <div id="projects" className="lp-role">
            <span className="lp-icon teal">{Icons.projects}</span>
            <h3>{t('Cho dự án AI')}</h3>
            <ul>
              <li>{check}{t('Tạo chiến dịch, đặt bảng giá theo mức độ lỗi')}</li>
              <li>{check}{t('Nạp ngân sách USDC vào escrow một lần')}</li>
              <li>{check}{t('Duyệt tester dựa trên hồ sơ và số sao')}</li>
              <li>{check}{t('Xét bug, ký trả tiền bằng PIN, đánh giá tester')}</li>
            </ul>
            <Link to={signedIn ? '/app' : '/auth?next=/app/projects/new'} className="lp-more">{t('Đăng chiến dịch')} {arrow}</Link>
          </div>
          <div id="testers" className="lp-role">
            <span className="lp-icon warm">{Icons.work}</span>
            <h3>{t('Cho tester')}</h3>
            <ul>
              <li>{check}{t('Tìm chiến dịch theo nền tảng: Web, iOS, Android, API')}</li>
              <li>{check}{t('Ứng tuyển, gửi bug kèm bằng chứng')}</li>
              <li>{check}{t('Theo dõi trạng thái từng bug, khiếu nại khi bị từ chối sai')}</li>
              <li>{check}{t('Xây hồ sơ uy tín với số sao từ các dự án')}</li>
            </ul>
            <Link to={start} className="lp-more">{t('Bắt đầu săn bug')} {arrow}</Link>
          </div>
        </div>
      </Section>

      <Section eyebrow={t('Giao diện')} title={t('Mọi việc của dự án ở một màn hình.')} lead={t('Theo dõi tiền trong escrow, bug chờ xét và hạn phản hồi, tất cả ở một nơi.')}>
        <div className="lp-preview" aria-hidden="true">
          <div className="lp-preview-side">
            <div className="brand" style={{ fontSize: 17 }}><BrandMark />ArcHunt</div>
            <span className="lp-eyebrow" style={{ margin: '14px 0 6px' }}>{t('Không gian dự án')}</span>
            {['Tổng quan', 'Chiến dịch', 'Bug cần xét', 'Ví & nạp tiền'].map((item, i) => <div key={item} className={i === 0 ? 'lp-side-item on' : 'lp-side-item'}>{t(item)}</div>)}
          </div>
          <div className="lp-preview-main">
            <div className="row between"><strong style={{ fontSize: 20 }}>{t('Tổng quan')}</strong><span className="lp-fake-btn small">{t('Tạo chiến dịch')}</span></div>
            <div className="lp-mini-stats">
              <div><span>{t('Đang khóa trong escrow')}</span><b>1,080</b></div>
              <div><span>{t('Đã trả cho tester')}</span><b>120</b></div>
              <div><span>{t('Bug chờ xét')}</span><b className="accent">3</b></div>
            </div>
            <div className="lp-list">
              <div className="row between"><span>{t('Trả lời bị cắt sau 200 ký tự')}</span><span className="lp-chip warm">High</span></div>
              <div className="row between"><span>{t('Nút xuất PDF không phản hồi')}</span><span className="lp-chip">Medium</span></div>
              <div className="row between"><span>{t('Sai mã hoá tiếng Việt có dấu')}</span><span className="lp-chip good">{t('Đã trả')}</span></div>
            </div>
          </div>
        </div>
      </Section>

      <Section id="how" eyebrow={t('Cách hoạt động')} title={t('Từ chiến dịch tới thanh toán, rõ ràng từng bước.')}>
        <ol className="lp-steps">
          {steps().map((step, i) => (
            <li key={step.title} className="lp-step">
              <span className="lp-num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{t(step.title)}</h3>
              <p>{t(step.body)}</p>
              {step.mock}
            </li>
          ))}
        </ol>
      </Section>

      <Section id="fair" eyebrow={t('Minh bạch')} title={t('Luật chơi rõ ràng cho cả hai bên.')}>
        <div className="lp-rules">
          <div><b>0%</b><span>{t('phí nền tảng')}</span></div>
          <div><b>{t('5 ngày')}</b><span>{t('hạn xét mỗi bug, quá hạn tự chấp nhận')}</span></div>
          <div><b>{t('3 ngày')}</b><span>{t('để khiếu nại khi bị từ chối')}</span></div>
          <div><b>{t('14 ngày')}</b><span>{t('sau khi kết thúc dự án mới rút được tiền thừa')}</span></div>
        </div>
      </Section>

      <Section id="faq" eyebrow={t('Hỏi đáp')} title={t('Câu hỏi thường gặp')}>
        <div className="lp-faq">
          {FAQ.map(([q, a]) => (
            <details key={q}><summary>{t(q)}</summary><p>{t(a)}</p></details>
          ))}
        </div>
      </Section>

      <section className="lp-final">
        <div className="lp-wrap lp-final-box">
          <h2>{t('Sẵn sàng bắt đầu?')}</h2>
          <p>{t('Đăng nhập bằng email, chọn vai trò và bắt đầu trong vài phút.')}</p>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <Link to={start} className="btn lp-cta light">{t('Bắt đầu săn bug')}</Link>
            <Link to={signedIn ? '/app' : '/auth?next=/app/projects/new'} className="btn lp-cta ghost">{t('Đăng chiến dịch test')}</Link>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap row between wrap">
          <div className="brand" style={{ fontSize: 17 }}><BrandMark />ArcHunt</div>
          <div className="row wrap small">
            <a href="https://docs.arc.io" target="_blank" rel="noreferrer">{t('Tài liệu Arc')}</a>
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Faucet</a>
            <span className="muted">{t('Chạy trên Arc Testnet')}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
