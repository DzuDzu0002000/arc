import type { ReactNode } from 'react'
import { getLang, t } from '../i18n'
import { BrandMark, Link, Prefs } from '../ui'

// Privacy policy and terms (linked from the landing footer and Google's sign-in consent screen).
// Long-form text, so each language is written out in full here instead of going through t().
const CONTACT = 'maidoandu0405@gmail.com'
const UPDATED = '2026-10-01'

type Doc = { title: string; intro: string; sections: Array<[string, ReactNode[]]> }

const PRIVACY: Record<'vi' | 'en', Doc> = {
  vi: {
    title: 'Chính sách quyền riêng tư',
    intro: 'ArcHunt là nơi dự án AI thuê tester tìm bug và trả thưởng bằng USDC trên Arc Testnet. Trang này nói rõ ArcHunt thu thập gì, dùng vào việc gì và chia sẻ với ai.',
    sections: [
      ['Dữ liệu chúng tôi thu thập', [
        'Email bạn dùng để đăng nhập. Nếu đăng nhập bằng Google, chúng tôi nhận email và tên hiển thị của tài khoản Google.',
        'Mã người dùng Circle và địa chỉ ví trên Arc mà Circle tạo cho bạn.',
        'Nội dung bạn tạo trên ArcHunt: chiến dịch, bug, tin nhắn, khiếu nại, đánh giá.',
        'Địa chỉ IP khi bạn xin mã đăng nhập, để chống spam; và một cookie phiên để giữ bạn đăng nhập.',
      ]],
      ['Dữ liệu chúng tôi không thu thập', [
        'Mật khẩu, mã PIN hay khoá riêng của ví. Ví do Circle quản lý; mã PIN được nhập trong cửa sổ của Circle, ArcHunt không nhìn thấy.',
      ]],
      ['Chúng tôi dùng dữ liệu để', [
        'Đăng nhập và nhận diện tài khoản của bạn.',
        'Vận hành chợ test: hiển thị chiến dịch, cho dự án xem hồ sơ tester (số dự án, số bug, đánh giá), xử lý thanh toán và tranh chấp.',
        'Chống lạm dụng và gửi email mã đăng nhập.',
      ]],
      ['Dữ liệu từ Google', [
        'Khi bạn đăng nhập bằng Google, ArcHunt chỉ đọc email và tên của bạn, chỉ để nhận diện tài khoản. Chúng tôi không bán dữ liệu này, không dùng cho quảng cáo và không chuyển cho bên khác ngoài những nhà cung cấp nêu dưới đây.',
        'Việc sử dụng dữ liệu nhận từ Google API tuân thủ Google API Services User Data Policy, bao gồm các yêu cầu Limited Use.',
      ]],
      ['Bên cung cấp dịch vụ', [
        'Circle (đăng nhập và ví), Google (đăng nhập Google, nếu bạn chọn), Supabase (cơ sở dữ liệu), Vercel (máy chủ web), Resend (gửi email).',
        'Giao dịch trên blockchain Arc là công khai: ai cũng xem được địa chỉ ví và số tiền chuyển.',
      ]],
      ['Lưu trữ và xoá dữ liệu', [
        `Bạn có thể yêu cầu xoá tài khoản bằng cách gửi email tới ${CONTACT}. Dữ liệu đã ghi lên blockchain không thể xoá.`,
      ]],
    ],
  },
  en: {
    title: 'Privacy Policy',
    intro: 'ArcHunt is a marketplace where AI projects hire testers to find bugs and pay rewards in USDC on Arc Testnet. This page explains what ArcHunt collects, how it is used and who it is shared with.',
    sections: [
      ['What we collect', [
        'The email you sign in with. If you sign in with Google, we receive the email and display name of your Google account.',
        'Your Circle user ID and the Arc wallet address Circle creates for you.',
        'Content you create on ArcHunt: campaigns, bug reports, messages, disputes and ratings.',
        'Your IP address when you request a sign-in code, to prevent spam, and a session cookie that keeps you signed in.',
      ]],
      ['What we do not collect', [
        "Passwords, PINs or wallet private keys. Circle manages the wallet; your PIN is entered in Circle's own window and ArcHunt never sees it.",
      ]],
      ['How we use data', [
        'To sign you in and identify your account.',
        'To run the marketplace: show campaigns, let projects see tester profiles (projects tested, bugs found, ratings), and handle payouts and disputes.',
        'To prevent abuse and to send sign-in code emails.',
      ]],
      ['Google user data', [
        'When you sign in with Google, ArcHunt reads only your email address and name, and uses them only to identify your account. We do not sell this data, use it for advertising, or transfer it to anyone other than the service providers listed below.',
        "ArcHunt's use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
      ]],
      ['Service providers', [
        'Circle (sign-in and wallets), Google (Google sign-in, if you choose it), Supabase (database), Vercel (web hosting) and Resend (email delivery).',
        'Transactions on the Arc blockchain are public: anyone can see wallet addresses and amounts.',
      ]],
      ['Retention and deletion', [
        `You can ask us to delete your account by emailing ${CONTACT}. Data recorded on the blockchain cannot be deleted.`,
      ]],
    ],
  },
}

const TERMS: Record<'vi' | 'en', Doc> = {
  vi: {
    title: 'Điều khoản sử dụng',
    intro: 'Khi dùng ArcHunt, bạn đồng ý với các điều khoản dưới đây.',
    sections: [
      ['Giai đoạn thử nghiệm', [
        'ArcHunt đang chạy trên Arc Testnet. USDC trên testnet không có giá trị thật. Dịch vụ được cung cấp "nguyên trạng", có thể thay đổi hoặc tạm dừng bất cứ lúc nào.',
        'ArcHunt không thu phí nền tảng.',
      ]],
      ['Tài khoản và ví', [
        'Ví của bạn do Circle tạo và bạn tự kiểm soát bằng mã PIN. ArcHunt không thể khôi phục mã PIN hay chuyển tiền thay bạn.',
        'Mỗi tài khoản chọn một vai trò cố định: dự án hoặc tester.',
      ]],
      ['Chiến dịch và thanh toán', [
        'Dự án nạp toàn bộ ngân sách vào hợp đồng escrow trước khi mở chiến dịch. Tiền thưởng cho bug được trả từ escrow theo bảng giá của chiến dịch.',
        'Bug không được dự án phản hồi đúng hạn sẽ tự được chấp nhận và trả thưởng.',
        'Tester bị từ chối được khiếu nại một lần trong 3 ngày; quyết định của admin là cuối cùng.',
        'Dự án rút phần tiền còn lại 14 ngày sau khi chiến dịch kết thúc.',
        'Hợp đồng thông minh chưa được kiểm toán. Hãy dùng với số tiền thử nghiệm.',
      ]],
      ['Quy tắc khi test', [
        'Chỉ test trong phạm vi chiến dịch cho phép. Không tấn công từ chối dịch vụ, không truy cập dữ liệu của người khác, không gây hại cho sản phẩm hoặc người dùng của dự án.',
        'Không đăng nội dung vi phạm pháp luật hoặc quyền của người khác. ArcHunt có thể khoá tài khoản vi phạm.',
      ]],
      ['Liên hệ', [`Mọi câu hỏi xin gửi tới ${CONTACT}.`]],
    ],
  },
  en: {
    title: 'Terms of Service',
    intro: 'By using ArcHunt, you agree to the terms below.',
    sections: [
      ['Testnet beta', [
        'ArcHunt runs on Arc Testnet. Testnet USDC has no real value. The service is provided "as is" and may change or pause at any time.',
        'ArcHunt charges no platform fee.',
      ]],
      ['Accounts and wallets', [
        'Your wallet is created by Circle and controlled by you with your PIN. ArcHunt cannot recover your PIN or move funds for you.',
        'Each account picks one fixed role: project or tester.',
      ]],
      ['Campaigns and payouts', [
        'Projects fund the full budget into the escrow contract before a campaign opens. Bug rewards are paid from escrow according to the campaign price list.',
        'Bugs the project does not review in time are accepted and paid automatically.',
        "A rejected tester may dispute once within 3 days; the admin's decision is final.",
        'Projects can withdraw the remaining funds 14 days after the campaign ends.',
        'The smart contract has not been audited. Use test amounts only.',
      ]],
      ['Testing rules', [
        "Test only what the campaign scope allows. No denial-of-service attacks, no access to other people's data, and no harm to the project's product or users.",
        "Do not post illegal content or content that infringes others' rights. ArcHunt may suspend accounts that break these rules.",
      ]],
      ['Contact', [`Questions can be sent to ${CONTACT}.`]],
    ],
  },
}

function LegalPage({ doc }: { doc: Doc }) {
  return (
    <main className="page legal">
      <div className="row between">
        <Link to="/" className="brand"><BrandMark />ArcHunt</Link>
        <Prefs />
      </div>
      <h1>{doc.title}</h1>
      <p className="muted small">{t('Cập nhật')}: {UPDATED}</p>
      <p>{doc.intro}</p>
      {doc.sections.map(([heading, items]) => (
        <section key={heading} className="stack">
          <h2>{heading}</h2>
          <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
        </section>
      ))}
    </main>
  )
}

export function Privacy() {
  return <LegalPage doc={PRIVACY[getLang()]} />
}

export function Terms() {
  return <LegalPage doc={TERMS[getLang()]} />
}
