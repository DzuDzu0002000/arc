import { getLang } from './i18n'
import { sampleEn } from './mock-en'

// Dev-only demo mode (`npm run dev:mock`): answers /api/* in the browser with sample data so the UI
// can be clicked through without Circle, Supabase or Arc. Never included in production builds.
const day = 86_400_000
const hour = 3_600_000
const now = Date.now()
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString()
const tx = (c: string) => `0x${c.repeat(64)}`

// The demo user starts without a role, so the role picker shows first; the wallet page can switch roles.
const ROLE_KEY = 'archunt.demo-role'
let role: 'project' | 'tester' | null = (() => {
  try { const saved = sessionStorage.getItem(ROLE_KEY); return saved === 'project' || saved === 'tester' ? saved : null } catch { return null }
})()
const ME = { id: 'd0000000-0000-4000-8000-00000000000a', displayName: 'minh', email: 'minh@example.com' }
const WALLET = '0x7a3c4f0e2b1d9a8c7b6e5d4c3b2a1f0e9d8c91e4'
const balances = { project: 1350, tester: 245 }

type Campaign = Record<string, unknown> & { id: string; title: string; productName: string; budget: string; endsAt: string; status: string; owner: string; testerSlots: number; fundTx: string | null }
const campaigns: Campaign[] = [
  {
    id: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', owner: 'acc-lumen', ownerName: 'Lumen Labs', title: 'Test luồng đăng nhập và trả lời đa ngôn ngữ', productName: 'Lumen Chat',
    description: 'Chatbot AI chăm sóc khách hàng cho sàn thương mại điện tử.', scopeIn: 'Đăng nhập bằng email và Google\nTrả lời bằng tiếng Việt, Anh, Nhật\nLịch sử hội thoại và xuất file',
    scopeOut: 'Lỗi chính tả trong giao diện\nTấn công DDoS, spam tài khoản', testUrl: 'https://example.com', platforms: ['web', 'ios'], testerSlots: 10,
    budget: '1200', endsAt: iso(6 * day), responseHours: 120, status: 'open', fundTx: tx('a'), createdAt: iso(-3 * day),
    payouts: { critical: '100', high: '50', medium: '20', low: '5' },
  },
  {
    id: '7b1e2c3d-4a5f-4b6c-8d7e-9f0a1b2c3d4e', owner: 'acc-voice', ownerName: 'VoiceNote', title: 'Tìm lỗi chuyển giọng nói tiếng Việt', productName: 'VoiceNote AI',
    description: 'Ứng dụng ghi chú bằng giọng nói.', scopeIn: 'Nhận dạng giọng ba miền\nTóm tắt ghi chú', scopeOut: '', testUrl: null, platforms: ['android', 'ios'],
    testerSlots: 15, budget: '500', endsAt: iso(12 * day), responseHours: 120, status: 'open', fundTx: tx('c'), createdAt: iso(-1 * day),
    payouts: { critical: '60', high: '30', medium: '10' },
  },
  {
    id: 'b1c2d3e4-0001-4a00-8a00-000000000001', owner: 'acc-documind', ownerName: 'DocuMind Labs', title: 'Kiểm thử tóm tắt hợp đồng PDF', productName: 'DocuMind',
    description: '', scopeIn: '', scopeOut: '', testUrl: null, platforms: ['web'], testerSlots: 8,
    budget: '900', endsAt: iso(9 * day), responseHours: 120, status: 'open', fundTx: tx('1'), createdAt: iso(-5 * day),
    payouts: {critical: '120',high: '60',medium: '20',low: '5'},
  },
  {
    id: 'b1c2d3e4-0002-4a00-8a00-000000000002', owner: 'acc-snapcaption', ownerName: 'SnapCaption', title: 'Tìm lỗi phụ đề tự động cho video ngắn', productName: 'SnapCaption',
    description: '', scopeIn: '', scopeOut: '', testUrl: null, platforms: ['ios','android'], testerSlots: 12,
    budget: '700', endsAt: iso(14 * day), responseHours: 120, status: 'open', fundTx: tx('2'), createdAt: iso(-5 * day),
    payouts: {critical: '80',high: '40',medium: '15'},
  },
  {
    id: 'b1c2d3e4-0003-4a00-8a00-000000000003', owner: 'acc-translategpt', ownerName: 'TranslateGPT', title: 'Test API dịch thuật đa ngôn ngữ', productName: 'TranslateGPT',
    description: '', scopeIn: '', scopeOut: '', testUrl: null, platforms: ['api'], testerSlots: 6,
    budget: '1500', endsAt: iso(20 * day), responseHours: 120, status: 'open', fundTx: tx('3'), createdAt: iso(-1 * day),
    payouts: {critical: '150',high: '70',medium: '25',low: '5'},
  },
  {
    id: 'b1c2d3e4-0004-4a00-8a00-000000000004', owner: 'acc-studybuddy', ownerName: 'StudyBuddy', title: 'Kiểm tra gia sư AI trả lời bài tập toán', productName: 'StudyBuddy',
    description: '', scopeIn: '', scopeOut: '', testUrl: null, platforms: ['web','ios'], testerSlots: 20,
    budget: '400', endsAt: iso(7 * day), responseHours: 120, status: 'open', fundTx: tx('4'), createdAt: iso(-3 * day),
    payouts: {high: '30',medium: '12',low: '4'},
  },
  {
    id: 'b1c2d3e4-0005-4a00-8a00-000000000005', owner: 'acc-shopassist', ownerName: 'ShopAssist', title: 'Test trợ lý mua sắm gợi ý sản phẩm', productName: 'ShopAssist',
    description: '', scopeIn: '', scopeOut: '', testUrl: null, platforms: ['web','android'], testerSlots: 10,
    budget: '650', endsAt: iso(16 * day), responseHours: 120, status: 'open', fundTx: tx('5'), createdAt: iso(-2 * day),
    payouts: {critical: '90',high: '45',medium: '15',low: '5'},
  },
  {
    id: 'b1c2d3e4-0006-4a00-8a00-000000000006', owner: 'acc-codepilot', ownerName: 'CodePilot', title: 'Săn lỗi plugin sinh code cho VS Code', productName: 'CodePilot',
    description: '', scopeIn: '', scopeOut: '', testUrl: null, platforms: ['desktop'], testerSlots: 5,
    budget: '1100', endsAt: iso(25 * day), responseHours: 120, status: 'open', fundTx: tx('6'), createdAt: iso(-1 * day),
    payouts: {critical: '200',high: '80',medium: '30'},
  },
  {
    id: '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', owner: ME.id, ownerName: 'PromptForge', title: 'Kiểm thử API sinh ảnh', productName: 'PromptForge',
    description: 'API sinh ảnh từ prompt.', scopeIn: 'Endpoint /generate và /upscale', scopeOut: '', testUrl: 'https://example.com/docs', platforms: ['api'],
    testerSlots: 5, budget: '300', endsAt: iso(9 * day), responseHours: 120, status: 'open', fundTx: tx('d'), createdAt: iso(-2 * day),
    payouts: { critical: '80', high: '40', medium: '15', low: '5' },
  },
  {
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', owner: ME.id, ownerName: 'PromptForge', title: 'Test ứng dụng mobile PromptForge', productName: 'PromptForge',
    description: 'Ứng dụng iOS/Android sinh ảnh.', scopeIn: 'Luồng tạo ảnh, lưu, chia sẻ', scopeOut: '', testUrl: null, platforms: ['ios', 'android'],
    testerSlots: 8, budget: '400', endsAt: iso(20 * day), responseHours: 120, status: 'draft', fundTx: null, createdAt: iso(-2 * hour),
    payouts: { critical: '100', high: '40', medium: '15' },
  },
]

const PROMPTFORGE_ID = '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' // the demo user's own funded campaign

type Bug = Record<string, unknown> & { id: string; campaignId: string; tester: string; testerName: string; status: string; title: string; severityClaimed: string }
const bug = (b: Partial<Bug> & Pick<Bug, 'id' | 'campaignId' | 'tester' | 'testerName' | 'status' | 'title' | 'severityClaimed'>): Bug => ({
  steps: '1. Mở sản phẩm\n2. Làm theo luồng chính\n3. Quan sát kết quả', expected: 'Hoạt động đúng', actual: 'Có lỗi', environment: 'Chrome 140, Windows 11',
  evidenceUrls: [], createdAt: iso(-day), ...b,
})
const bugs: Bug[] = [
  // Reported by the demo user as a tester.
  bug({ id: '0b7e8d4c-1a2b-4c3d-8e9f-001122334455', campaignId: campaigns[0].id, tester: ME.id, testerName: ME.displayName, status: 'paid', title: 'Trả lời tiếng Nhật bị cắt sau 200 ký tự', steps: '1. Đăng nhập bằng Google\n2. Chọn ngôn ngữ Nhật\n3. Hỏi một câu dài hơn 3 đoạn', expected: 'Câu trả lời đầy đủ', actual: 'Bị cắt, không có nút xem tiếp', environment: 'iPhone 15, iOS 19.2, Safari', evidenceUrls: ['https://loom.com/share/demo'], severityClaimed: 'high', severityFinal: 'high', payoutAmount: '50', payoutTx: tx('b'), decidedBy: 'owner', createdAt: iso(-2 * day) }),
  bug({ id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', campaignId: campaigns[0].id, tester: ME.id, testerName: ME.displayName, status: 'rejected', title: 'Mất lịch sử hội thoại sau khi đăng xuất', severityClaimed: 'medium', rejectReason: 'duplicate', duplicateOf: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b', rejectNote: 'Đã có người báo lỗi này từ hôm qua.', disputeDueAt: iso(2 * day) }),
  bug({ id: '4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b7c', campaignId: campaigns[1].id, tester: ME.id, testerName: ME.displayName, status: 'disputed', title: 'Nhận sai từ "nhà" thành "nhả" với giọng miền Trung', severityClaimed: 'high', rejectReason: 'not_a_bug', rejectNote: 'Giọng miền Trung chưa nằm trong cam kết.', environment: 'Pixel 8, Android 16', dispute: { id: 'd-open', status: 'open', reason: 'Phạm vi test ghi rõ "Nhận dạng giọng ba miền", miền Trung nằm trong phạm vi.', resolution_note: null, created_at: iso(-5 * hour), resolved_at: null } }),
  bug({ id: '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d', campaignId: campaigns[1].id, tester: ME.id, testerName: ME.displayName, status: 'paid', title: 'Tóm tắt bỏ sót số điện thoại trong ghi chú', severityClaimed: 'medium', severityFinal: 'medium', payoutAmount: '10', payoutTx: tx('f'), decidedBy: 'admin', rejectReason: 'out_of_scope', dispute: { id: 'd-done', status: 'upheld', reason: 'Tóm tắt nằm trong phạm vi test.', resolution_note: 'Phạm vi có ghi "Tóm tắt ghi chú". Tester đúng.', created_at: iso(-3 * day), resolved_at: iso(-2 * day) } }),
  bug({ id: '6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e', campaignId: campaigns[0].id, tester: ME.id, testerName: ME.displayName, status: 'submitted', title: 'Nút xuất PDF không phản hồi trên Safari', severityClaimed: 'medium', responseDueAt: iso(3 * day), createdAt: iso(-2 * day) }),
  // A dispute between two other parties, so the demo admin can resolve it.
  bug({ id: '9e0f1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b', campaignId: campaigns[0].id, tester: 'd0000000-0000-4000-8000-00000000000d', testerName: 'thu.nguyen', status: 'disputed', title: 'Chatbot trả lời bằng tiếng Anh khi hỏi bằng tiếng Việt không dấu', severityClaimed: 'medium', rejectReason: 'out_of_scope', rejectNote: 'Tiếng Việt không dấu chưa hỗ trợ.', dispute: { id: 'd-other', status: 'open', reason: 'Phạm vi ghi "Trả lời bằng tiếng Việt", không loại trừ tiếng Việt không dấu.', resolution_note: null, created_at: iso(-8 * hour), resolved_at: null } }),
  // Reported to the demo user's own campaign (project side).
  bug({ id: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a', campaignId: PROMPTFORGE_ID, tester: 'd0000000-0000-4000-8000-00000000000b', testerName: 'lan.tester', status: 'submitted', title: '/upscale trả 500 khi ảnh đầu vào là PNG trong suốt', steps: '1. Gọi /generate với prompt bất kỳ\n2. Gửi ảnh PNG có kênh alpha tới /upscale', expected: 'Ảnh được phóng to', actual: 'HTTP 500, body rỗng', environment: 'curl 8.9, macOS 15', evidenceUrls: ['https://gist.github.com/demo'], severityClaimed: 'high', responseDueAt: iso(52 * hour), createdAt: iso(-3 * hour) }),
  bug({ id: '3e4f5a6b-7c8d-4e9f-8a0b-2c3d4e5f6a7b', campaignId: PROMPTFORGE_ID, tester: 'd0000000-0000-4000-8000-00000000000c', testerName: 'hung.dev', status: 'submitted', title: 'Prompt tiếng Việt có dấu bị lỗi mã hoá trong metadata', steps: '1. Gọi /generate với prompt "phố cổ Hội An"\n2. Xem trường prompt trong response', expected: 'Giữ nguyên dấu', actual: 'Hiện "ph? c? H?i An"', environment: 'Postman 11', severityClaimed: 'low', responseDueAt: iso(4 * day), createdAt: iso(-hour) }),
  bug({ id: '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f', campaignId: PROMPTFORGE_ID, tester: 'd0000000-0000-4000-8000-00000000000b', testerName: 'lan.tester', status: 'accepted', title: 'Giới hạn rate limit không trả header Retry-After', severityClaimed: 'medium', severityFinal: 'medium', payoutAmount: '15', decidedBy: 'owner', createdAt: iso(-day) }),
  bug({ id: '8d9e0f1a-2b3c-4d4e-9f5a-6b7c8d9e0f1a', campaignId: PROMPTFORGE_ID, tester: 'd0000000-0000-4000-8000-00000000000d', testerName: 'thu.nguyen', status: 'paid', title: 'Ảnh 4K bị crop mất viền phải', severityClaimed: 'high', severityFinal: 'high', payoutAmount: '40', payoutTx: tx('e'), decidedBy: 'owner', createdAt: iso(-2 * day) }),
]
const applications = [
  { id: 'app-1', campaignId: campaigns[0].id, tester: ME.id, testerName: ME.displayName, status: 'approved', message: '', devices: 'iPhone 15', createdAt: iso(-3 * day) },
  { id: 'app-4', campaignId: campaigns[1].id, tester: ME.id, testerName: ME.displayName, status: 'approved', message: '', devices: 'Pixel 8', createdAt: iso(-day) },
  { id: 'app-2', campaignId: PROMPTFORGE_ID, tester: 'd0000000-0000-4000-8000-00000000000b', testerName: 'lan.tester', status: 'approved', message: 'QA 3 năm, chuyên test API.', devices: 'macOS, Postman', createdAt: iso(-2 * day) },
  { id: 'app-3', campaignId: PROMPTFORGE_ID, tester: 'd0000000-0000-4000-8000-00000000000d', testerName: 'thu.nguyen', status: 'pending', message: 'Mình từng test API của nhiều dịch vụ sinh ảnh.', devices: 'Windows 11, Insomnia', createdAt: iso(-5 * hour) },
]

const find = <T extends { id: string }>(list: T[], id: unknown) => list.find((x) => x.id === id)
const campaignOf = (b: Bug) => find(campaigns, b.campaignId) as Campaign
const payoutsOf = (c: Campaign) => c.payouts as Record<string, string>
const sum = (list: Bug[]) => list.reduce((s, b) => s + Number(b.payoutAmount || 0), 0)
const committed = (c: Campaign) => sum(bugs.filter((b) => b.campaignId === c.id && (b.status === 'accepted' || b.status === 'paid')))
const paidOut = (c: Campaign) => sum(bugs.filter((b) => b.campaignId === c.id && b.status === 'paid'))
// Sample campaigns carry an English copy, as if the project filled the optional English fields.
const englishOf = (c: Campaign) => ({
  title: sampleEn[c.title] ?? null, description: sampleEn[String(c.description ?? '')] ?? null,
  scopeIn: sampleEn[String(c.scopeIn ?? '')] ?? null, scopeOut: sampleEn[String(c.scopeOut ?? '')] ?? null,
})
const publicCampaign = (c: Campaign) => ({ ...c, english: englishOf(c), escrowId: '0x0', withdrawableAt: new Date(new Date(c.endsAt).getTime() + 14 * day).toISOString() })
const approvedCount = (c: Campaign) => Math.min(applications.filter((a) => a.campaignId === c.id && a.status === 'approved').length + 5, c.testerSlots)
const disputeOf = (b: Bug) => (b.dispute as Record<string, unknown> | undefined) ?? null
const bugRow = (b: Bug) => ({
  id: b.id, campaign_id: b.campaignId, title: b.title, status: b.status, severity_claimed: b.severityClaimed, severity_final: b.severityFinal ?? null,
  payout_amount: b.payoutAmount ?? null, payout_tx: b.payoutTx ?? null, response_due_at: b.responseDueAt ?? null,
  dispute_due_at: b.disputeDueAt ?? null, reject_reason: b.rejectReason ?? null, reject_note: b.rejectNote ?? null, created_at: b.createdAt,
  accounts: { display_name: b.testerName },
  campaigns: { id: b.campaignId, title: campaignOf(b).title, product_name: campaignOf(b).productName },
  campaign: { id: b.campaignId, title: campaignOf(b).title, product_name: campaignOf(b).productName },
  disputes: disputeOf(b),
  tester_ratings: ratings.has(b.id) ? { stars: ratings.get(b.id)!.stars } : null,
})
const adminDispute = (b: Bug) => {
  const d = disputeOf(b) as Record<string, unknown>
  // The demo admin is also the tester on some disputes: those show the conflict notice instead of decision buttons.
  const conflict = b.tester === ME.id || campaignOf(b).owner === ME.id ? 'conflict' : null
  return { ...d, id: `d-${b.id}`, conflict, bugs: { id: b.id, title: b.title, severity_claimed: b.severityClaimed, severity_final: b.severityFinal ?? null, payout_amount: b.payoutAmount ?? null, reject_reason: b.rejectReason, reject_note: b.rejectNote ?? null, accounts: { display_name: b.testerName }, campaigns: { id: b.campaignId, title: campaignOf(b).title, product_name: campaignOf(b).productName } } }
}

// Tester track records: past history outside this demo, plus what happens in it.
type PastRating = { stars: number; comment: string | null; created_at: string; campaigns: { product_name: string } }
const history: Record<string, { name: string; campaigns: number; reported: number; accepted: number; criticalOrHigh: number; earned: number; since: string; ratings: PastRating[] }> = {
  [ME.id]: { name: ME.displayName, campaigns: 2, reported: 6, accepted: 4, criticalOrHigh: 1, earned: 120, since: iso(-60 * day), ratings: [
    { stars: 5, comment: 'Báo cáo rất rõ, có video kèm theo.', created_at: iso(-20 * day), campaigns: { product_name: 'TranslateGPT' } },
    { stars: 4, comment: null, created_at: iso(-12 * day), campaigns: { product_name: 'Lumen Chat' } },
  ] },
  'd0000000-0000-4000-8000-00000000000b': { name: 'lan.tester', campaigns: 7, reported: 44, accepted: 33, criticalOrHigh: 9, earned: 1460, since: iso(-200 * day), ratings: [
    { stars: 5, comment: 'Tìm ra lỗi bảo mật nghiêm trọng, mô tả chi tiết từng bước.', created_at: iso(-9 * day), campaigns: { product_name: 'DocuMind' } },
    { stars: 5, comment: 'Phản hồi nhanh khi được hỏi thêm.', created_at: iso(-30 * day), campaigns: { product_name: 'VoiceNote AI' } },
    { stars: 4, comment: null, created_at: iso(-45 * day), campaigns: { product_name: 'Lumen Chat' } },
  ] },
  'd0000000-0000-4000-8000-00000000000c': { name: 'hung.dev', campaigns: 2, reported: 9, accepted: 4, criticalOrHigh: 0, earned: 60, since: iso(-40 * day), ratings: [
    { stars: 3, comment: 'Một số báo cáo thiếu bước tái hiện.', created_at: iso(-15 * day), campaigns: { product_name: 'TranslateGPT' } },
  ] },
  'd0000000-0000-4000-8000-00000000000d': { name: 'thu.nguyen', campaigns: 4, reported: 23, accepted: 19, criticalOrHigh: 5, earned: 820, since: iso(-120 * day), ratings: [
    { stars: 5, comment: 'Test API rất kỹ, gửi kèm script tái hiện.', created_at: iso(-6 * day), campaigns: { product_name: 'SnapCaption' } },
    { stars: 5, comment: null, created_at: iso(-25 * day), campaigns: { product_name: 'DocuMind' } },
  ] },
}
const ratings = new Map<string, PastRating & { tester: string }>() // bug id -> rating given in this demo
const testerRatings = (tester: string) => [
  ...[...ratings.values()].filter((r) => r.tester === tester),
  ...(history[tester]?.ratings ?? []),
]
function profileOf(tester: string) {
  const h = history[tester] ?? { campaigns: 0, reported: 0, accepted: 0, criticalOrHigh: 0, earned: 0, ratings: [] }
  const own = bugs.filter((b) => b.tester === tester)
  const reported = h.reported + own.length
  const accepted = h.accepted + own.filter((b) => b.status === 'accepted' || b.status === 'paid').length
  const all = testerRatings(tester)
  const avg = all.length ? Math.round((all.reduce((s, r) => s + r.stars, 0) / all.length) * 10) / 10 : null
  return {
    campaignsTested: h.campaigns + applications.filter((a) => a.tester === tester && a.status === 'approved').length,
    bugsReported: reported, bugsAccepted: accepted,
    criticalOrHigh: h.criticalOrHigh + own.filter((b) => (b.status === 'paid' || b.status === 'accepted') && ['critical', 'high'].includes(String(b.severityFinal))).length,
    acceptanceRate: reported ? Math.round((accepted / reported) * 100) : null,
    earned: String(h.earned + sum(own.filter((b) => b.status === 'paid'))),
    ratingAvg: avg, ratingCount: all.length,
  }
}

function me() {
  const wallet = { address: WALLET, balance: role ? String(balances[role]) : '0' }
  if (role === 'project') {
    const own = campaigns.filter((c) => c.owner === ME.id)
    const queue = bugs.filter((b) => own.some((c) => c.id === b.campaignId))
    const funded = own.filter((c) => c.fundTx)
    return {
      role, wallet,
      campaigns: own.map((c) => ({ id: c.id, title: c.title, title_en: englishOf(c).title, product_name: c.productName, status: c.status, budget: c.budget, ends_at: c.endsAt, fund_tx: c.fundTx, created_at: c.createdAt, bugsToReview: queue.filter((b) => b.campaignId === c.id && b.status === 'submitted').length })),
      reviewQueue: queue.map(bugRow),
      totals: {
        lockedInEscrow: String(funded.reduce((s, c) => s + Number(c.budget) - paidOut(c), 0)),
        paidToTesters: String(sum(queue.filter((b) => b.status === 'paid'))),
        toReview: queue.filter((b) => b.status === 'submitted').length,
        awaitingSignature: queue.filter((b) => b.status === 'accepted').length,
      },
    }
  }
  if (role === 'tester') {
    return {
      role, wallet,
      applications: applications.filter((a) => a.tester === ME.id).map((a) => {
        const c = find(campaigns, a.campaignId) as Campaign
        return { id: a.id, status: a.status, created_at: a.createdAt, campaigns: { id: c.id, title: c.title, product_name: c.productName, status: c.status, ends_at: c.endsAt } }
      }),
      bugs: bugs.filter((b) => b.tester === ME.id).map(bugRow),
      profile: profileOf(ME.id),
    }
  }
  return { role: null, wallet }
}

// Demo notifications, different per side. Marking read only lasts until the page reloads.
const readNotices = new Set<string>()
function notices() {
  const pf = find(campaigns, PROMPTFORGE_ID) as Campaign
  const camp = { title: pf.title, title_en: null, product_name: pf.productName }
  const list = role === 'project'
    ? [
        { id: 'n1', kind: 'bug_submitted', campaign_id: pf.id, bug_id: '3e4f5a6b-7c8d-4e9f-8a0b-2c3d4e5f6a7b', created_at: iso(-hour), campaigns: camp, bugs: { title: 'Prompt tiếng Việt có dấu bị lỗi mã hoá trong metadata' } },
        { id: 'n2', kind: 'application_new', campaign_id: pf.id, bug_id: null, created_at: iso(-5 * hour), campaigns: camp, bugs: null },
        { id: 'n3', kind: 'dispute_opened', campaign_id: pf.id, bug_id: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a', created_at: iso(-day), campaigns: camp, bugs: { title: '/upscale trả 500 khi ảnh đầu vào là PNG trong suốt' } },
      ]
    : [
        { id: 't1', kind: 'application_approved', campaign_id: pf.id, bug_id: null, created_at: iso(-2 * hour), campaigns: camp, bugs: null },
        { id: 't2', kind: 'bug_rejected', campaign_id: pf.id, bug_id: null, created_at: iso(-6 * hour), campaigns: camp, bugs: { title: 'Nút xuất PDF không phản hồi trên Safari' } },
        { id: 't3', kind: 'bug_paid', campaign_id: pf.id, bug_id: null, created_at: iso(-2 * day), campaigns: camp, bugs: { title: 'Ảnh 4K bị crop mất viền phải' } },
      ]
  const notifications = list.map((n) => ({ ...n, read_at: readNotices.has(n.id) || n.created_at < iso(-day + hour) ? iso(-hour) : null }))
  return { notifications, unread: notifications.filter((n) => !n.read_at).length }
}

function get(path: string, params: URLSearchParams) {
  if (path === '/api/notifications') return notices()
  if (path === '/api/auth/session') return { authenticated: true, account: { ...ME, role, circleUserId: '3f9c1a52-7e4b-4d2a-9b61-0c8e5d7a2f14' }, wallet: { address: WALLET }, isAdmin: true }
  if (path === '/api/me') return me()
  if (path === '/api/campaigns' && !params.get('id')) {
    return { campaigns: campaigns.filter((c) => c.status === 'open' && c.owner !== ME.id).map((c) => ({
      ...publicCampaign(c), maxPayout: String(Math.max(...Object.values(payoutsOf(c)).map(Number))), approvedTesters: approvedCount(c),
    })) }
  }
  if (path === '/api/campaigns') {
    const c = find(campaigns, params.get('id'))
    if (!c) return null
    if (params.get('view') === 'manage') {
      return {
        campaign: publicCampaign(c),
        applications: applications.filter((a) => a.campaignId === c.id).map((a) => ({ ...a, created_at: a.createdAt, tester_account_id: a.tester, testerProfile: profileOf(a.tester), accounts: { display_name: a.testerName } })),
        bugs: bugs.filter((b) => b.campaignId === c.id).map(bugRow),
      }
    }
    const application = applications.find((a) => a.campaignId === c.id && a.tester === ME.id) ?? null
    return {
      campaign: publicCampaign(c), ownerName: c.ownerName, payouts: c.payouts,
      remainingBudget: String(Number(c.budget) - committed(c)), escrowBalance: c.fundTx ? String(Number(c.budget) - paidOut(c)) : null,
      approvedTesters: approvedCount(c), stats: { decided: 25, accepted: 17, timedOut: 0, overturned: 1, avgResponseDays: 1.8 },
      viewer: { role: c.owner === ME.id && role === 'project' ? 'owner' : 'user', application: role === 'tester' && application ? { id: application.id, status: application.status } : null },
    }
  }
  if (path === '/api/bugs') {
    const b = find(bugs, params.get('id'))
    if (!b) return null
    const c = campaignOf(b)
    return {
      role: c.owner === ME.id && role === 'project' ? 'owner' : b.tester === ME.id && role === 'tester' ? 'tester' : 'admin',
      bug: { testerId: b.tester, severityFinal: null, rejectReason: null, rejectNote: null, duplicateOf: null, responseDueAt: null, disputeDueAt: null, decidedBy: null, payoutAmount: null, payoutTx: null, payoutPending: false, ...b },
      campaign: { id: c.id, title: c.title, productName: c.productName }, payouts: c.payouts,
      messages: (b.messages as unknown[]) ?? [], dispute: disputeOf(b),
      rating: ratings.get(b.id) ?? null,
      testerProfile: b.tester === ME.id && role === 'tester' ? null : profileOf(b.tester),
    }
  }
  if (path === '/api/testers') {
    const id = String(params.get('id'))
    const h = history[id]
    if (!h) return null
    return { tester: { id, displayName: h.name, memberSince: h.since }, profile: profileOf(id), ratings: testerRatings(id) }
  }
  if (path === '/api/admin') {
    const resolved = params.get('status') === 'resolved'
    return { disputes: bugs.filter((b) => disputeOf(b) && (disputeOf(b)!.status === 'open') !== resolved).map(adminDispute) }
  }
  return null
}

function post(path: string, body: Record<string, unknown>) {
  const b = find(bugs, body.id)
  const campaign = find(campaigns, body.id) ?? find(campaigns, body.campaignId)
  const payFor = (target: Bug, severity: unknown) => payoutsOf(campaignOf(target))[String(severity)] ?? '0'
  switch (`${path}:${body.action}`) {
    case '/api/notifications:read': {
      const all = notices().notifications
      for (const n of all) if (!Array.isArray(body.ids) || body.ids.includes(n.id)) readNotices.add(n.id)
      return { unread: notices().unread }
    }
    case '/api/applications:apply':
      applications.push({ id: `app-${Date.now()}`, campaignId: String(body.campaignId), tester: ME.id, testerName: ME.displayName, status: 'pending', message: String(body.message), devices: String(body.devices), createdAt: iso(0) })
      return { status: 'pending' }
    case '/api/applications:approve': case '/api/applications:reject': case '/api/applications:remove': {
      const a = find(applications, body.id)
      if (a) a.status = { approve: 'approved', reject: 'rejected', remove: 'removed' }[String(body.action)] as string
      return { status: a?.status }
    }
    case '/api/bugs:submit': {
      const id = crypto.randomUUID()
      bugs.unshift(bug({ ...body, id, campaignId: String(body.campaignId), tester: ME.id, testerName: ME.displayName, status: 'submitted', title: String(body.title), severityClaimed: String(body.severity), responseDueAt: iso(5 * day), createdAt: iso(0) }))
      return { id }
    }
    case '/api/bugs:accept': case '/api/bugs:pay':
      if (b) Object.assign(b, { status: 'accepted', severityFinal: body.severity ?? b.severityFinal, payoutAmount: payFor(b, body.severity ?? b.severityFinal), decidedBy: 'owner' })
      return { challengeId: 'demo-challenge' }
    case '/api/bugs:confirm-payout':
      if (b) Object.assign(b, { status: 'paid', payoutTx: tx('9') })
      return { status: 'paid', pending: false }
    case '/api/bugs:reject':
      if (b) Object.assign(b, { status: 'rejected', rejectReason: body.reason, rejectNote: body.note, duplicateOf: body.duplicateOf ?? null, disputeDueAt: iso(3 * day) })
      return { status: 'rejected' }
    case '/api/bugs:rate':
      if (!b || b.status !== 'paid' || ratings.has(b.id)) return null
      ratings.set(b.id, { tester: b.tester, stars: Number(body.stars), comment: String(body.comment || '').trim() || null, created_at: iso(0), campaigns: { product_name: campaignOf(b).productName } })
      return { stars: body.stars }
    case '/api/bugs:dispute':
      if (b) Object.assign(b, { status: 'disputed', dispute: { id: `d-${b.id}`, reason: String(body.reason), status: 'open', resolution_note: null, created_at: iso(0), resolved_at: null } })
      return { status: 'disputed' }
    case '/api/bugs:request-info': case '/api/bugs:reply': {
      if (!b) return null
      const messages = (b.messages as unknown[]) ?? []
      messages.push({ id: String(Date.now()), body: String(body.message), created_at: iso(0), author_account_id: ME.id, accounts: { display_name: body.action === 'reply' ? b.testerName : campaignOf(b).ownerName } })
      Object.assign(b, { messages, status: body.action === 'reply' ? 'submitted' : 'needs_info' })
      return { status: b.status }
    }
    case '/api/admin:resolve-dispute': {
      const target = bugs.find((x) => `d-${x.id}` === body.id)
      if (!target) return null
      const upheld = body.decision === 'upheld'
      Object.assign(target, upheld
        ? { status: 'paid', severityFinal: body.severity, payoutAmount: payFor(target, body.severity), payoutTx: tx('7'), decidedBy: 'admin' }
        : { status: 'rejected_final' })
      target.dispute = { ...disputeOf(target), status: upheld ? 'upheld' : 'dismissed', resolution_note: body.note || null, resolved_at: iso(0) }
      return { status: body.decision }
    }
    case '/api/campaigns:create': {
      const id = crypto.randomUUID()
      campaigns.push({ ...body, id, owner: ME.id, ownerName: 'PromptForge', title: String(body.title), productName: String(body.productName), budget: String(body.budget), endsAt: String(body.endsAt), testerSlots: Number(body.testerSlots), status: 'draft', fundTx: null, createdAt: iso(0) })
      return { id }
    }
    case '/api/campaigns:start-funding': case '/api/campaigns:start-withdraw':
      return { challengeId: 'demo-challenge' }
    case '/api/campaigns:confirm-funding':
      if (campaign) { Object.assign(campaign, { status: 'open', fundTx: tx('8') }); balances.project -= Number(campaign.budget) }
      return { status: 'open' }
    case '/api/campaigns:close':
      if (campaign) campaign.status = 'closed'
      return { status: 'closed' }
    default:
      return { ok: true }
  }
}

function patch(path: string, body: Record<string, unknown>) {
  if (path !== '/api/auth/session') return null
  if (body.role === 'project' || body.role === 'tester') {
    role = body.role // the demo lets you switch sides; the real API allows it once
    try { sessionStorage.setItem(ROLE_KEY, role) } catch { /* private mode */ }
  }
  return { role }
}

/** In English, sample bug reports, notes and comments read as if testers and projects wrote them in English. */
function inViewerLanguage(value: unknown): unknown {
  if (getLang() !== 'en') return value
  if (typeof value === 'string') return sampleEn[value] ?? value
  if (Array.isArray(value)) return value.map(inViewerLanguage)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, inViewerLanguage(v)]))
  return value
}

export function installMockApi() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin)
    if (!url.pathname.startsWith('/api/')) return realFetch(input, init)
    await new Promise((r) => setTimeout(r, 200))
    const method = init?.method || (init?.body ? 'POST' : 'GET')
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    const result = method === 'POST' ? post(url.pathname, body)
      : method === 'PATCH' ? patch(url.pathname, body)
      : method === 'DELETE' ? (() => { role = null; try { sessionStorage.removeItem(ROLE_KEY) } catch { /* private mode */ } return { authenticated: false } })()
      : get(url.pathname, url.searchParams)
    return new Response(JSON.stringify(inViewerLanguage(result ?? { error: 'Không tìm thấy (dữ liệu mẫu).' })), {
      status: result ? 200 : 404, headers: { 'Content-Type': 'application/json' },
    })
  }
}
