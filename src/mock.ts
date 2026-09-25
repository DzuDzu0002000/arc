// Dev-only demo mode (`npm run dev:mock`): answers /api/* in the browser with sample data so the UI
// can be clicked through without Circle, Supabase or Arc. Never included in production builds.
const day = 86_400_000
const now = Date.now()
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString()
const tx = (c: string) => `0x${c.repeat(64)}`

const ME = { id: 'acc-me', displayName: 'minh.qa', email: 'minh@example.com' }
const WALLET = '0x7a3c4f0e2b1d9a8c7b6e5d4c3b2a1f0e9d8c91e4'

type Campaign = Record<string, unknown> & { id: string; title: string; productName: string; budget: string; endsAt: string; status: string; owner: string }
const campaigns: Campaign[] = [
  {
    id: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', owner: 'acc-lumen', title: 'Test luồng đăng nhập và trả lời đa ngôn ngữ', productName: 'Lumen Chat',
    description: 'Chatbot AI chăm sóc khách hàng cho sàn thương mại điện tử.', scopeIn: 'Đăng nhập bằng email và Google\nTrả lời bằng tiếng Việt, Anh, Nhật\nLịch sử hội thoại và xuất file',
    scopeOut: 'Lỗi chính tả trong giao diện\nTấn công DDoS, spam tài khoản', testUrl: 'https://example.com', platforms: ['web', 'ios'], testerSlots: 10,
    budget: '1200', endsAt: iso(6 * day), responseHours: 120, status: 'open', fundTx: tx('a'), createdAt: iso(-3 * day),
    payouts: { critical: '100', high: '50', medium: '20', low: '5' },
  },
  {
    id: '7b1e2c3d-4a5f-4b6c-8d7e-9f0a1b2c3d4e', owner: 'acc-voice', title: 'Tìm lỗi chuyển giọng nói tiếng Việt', productName: 'VoiceNote AI',
    description: 'Ứng dụng ghi chú bằng giọng nói.', scopeIn: 'Nhận dạng giọng ba miền\nTóm tắt ghi chú', scopeOut: '', testUrl: null, platforms: ['android', 'ios'],
    testerSlots: 15, budget: '500', endsAt: iso(12 * day), responseHours: 120, status: 'open', fundTx: tx('c'), createdAt: iso(-1 * day),
    payouts: { critical: '60', high: '30', medium: '10' },
  },
  {
    id: '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', owner: ME.id, title: 'Kiểm thử API sinh ảnh', productName: 'PromptForge',
    description: 'API sinh ảnh từ prompt.', scopeIn: 'Endpoint /generate và /upscale', scopeOut: '', testUrl: 'https://example.com/docs', platforms: ['api'],
    testerSlots: 5, budget: '300', endsAt: iso(9 * day), responseHours: 120, status: 'open', fundTx: tx('d'), createdAt: iso(-2 * day),
    payouts: { critical: '80', high: '40', medium: '15', low: '5' },
  },
]

type Bug = Record<string, unknown> & { id: string; campaignId: string; tester: string; testerName: string; status: string; title: string; severityClaimed: string }
const bugs: Bug[] = [
  {
    id: '0b7e8d4c-1a2b-4c3d-8e9f-001122334455', campaignId: campaigns[0].id, tester: ME.id, testerName: ME.displayName, status: 'paid',
    title: 'Trả lời tiếng Nhật bị cắt sau 200 ký tự', steps: '1. Đăng nhập bằng Google\n2. Chọn ngôn ngữ Nhật\n3. Hỏi một câu dài hơn 3 đoạn',
    expected: 'Câu trả lời đầy đủ', actual: 'Bị cắt, không có nút xem tiếp', environment: 'iPhone 15, iOS 19.2, Safari', evidenceUrls: ['https://loom.com/share/demo'],
    severityClaimed: 'high', severityFinal: 'high', payoutAmount: '50', payoutTx: tx('b'), decidedBy: 'owner', createdAt: iso(-2 * day),
  },
  {
    id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', campaignId: campaigns[0].id, tester: ME.id, testerName: ME.displayName, status: 'rejected',
    title: 'Mất lịch sử hội thoại sau khi đăng xuất', steps: '1. Chat vài câu\n2. Đăng xuất\n3. Đăng nhập lại', expected: 'Lịch sử còn nguyên', actual: 'Lịch sử trống',
    environment: 'Chrome 140, Windows 11', evidenceUrls: [], severityClaimed: 'medium', rejectReason: 'duplicate', duplicateOf: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
    rejectNote: 'Đã có người báo lỗi này từ hôm qua.', disputeDueAt: iso(2 * day), createdAt: iso(-1 * day),
  },
  {
    id: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a', campaignId: campaigns[2].id, tester: 'acc-lan', testerName: 'lan.tester', status: 'submitted',
    title: '/upscale trả 500 khi ảnh đầu vào là PNG trong suốt', steps: '1. Gọi /generate với prompt bất kỳ\n2. Gửi ảnh PNG có kênh alpha tới /upscale',
    expected: 'Ảnh được phóng to', actual: 'HTTP 500, body rỗng', environment: 'curl 8.9, macOS 15', evidenceUrls: ['https://gist.github.com/demo'],
    severityClaimed: 'high', responseDueAt: iso(52 * 3_600_000), createdAt: iso(-3 * 3_600_000),
  },
  {
    id: '3e4f5a6b-7c8d-4e9f-8a0b-2c3d4e5f6a7b', campaignId: campaigns[2].id, tester: 'acc-hung', testerName: 'hung.dev', status: 'submitted',
    title: 'Prompt tiếng Việt có dấu bị lỗi mã hoá trong metadata', steps: '1. Gọi /generate với prompt "phố cổ Hội An"\n2. Xem trường prompt trong response',
    expected: 'Giữ nguyên dấu', actual: 'Hiện "ph? c? H?i An"', environment: 'Postman 11', evidenceUrls: [], severityClaimed: 'low',
    responseDueAt: iso(4 * day), createdAt: iso(-1 * 3_600_000),
  },
]
const applications = [
  { id: 'app-1', campaignId: campaigns[0].id, tester: ME.id, status: 'approved', message: '', devices: 'iPhone 15', createdAt: iso(-3 * day) },
  { id: 'app-2', campaignId: campaigns[2].id, tester: 'acc-lan', testerName: 'lan.tester', status: 'approved', message: 'QA 3 năm, chuyên test API.', devices: 'macOS, Postman', createdAt: iso(-2 * day) },
  { id: 'app-3', campaignId: campaigns[2].id, tester: 'acc-thu', testerName: 'thu.nguyen', status: 'pending', message: 'Mình từng test API của Stability và Replicate.', devices: 'Windows 11, Insomnia', createdAt: iso(-5 * 3_600_000) },
]
let balance = 245

const payoutsOf = (c: Campaign) => c.payouts as Record<string, string>
const committed = (c: Campaign) => bugs.filter((b) => b.campaignId === c.id && (b.status === 'accepted' || b.status === 'paid'))
  .reduce((s, b) => s + Number(b.payoutAmount || 0), 0)
const publicCampaign = (c: Campaign) => ({ ...c, escrowId: '0x0', withdrawableAt: new Date(new Date(c.endsAt).getTime() + 14 * day).toISOString() })
const bugRow = (b: Bug) => ({
  id: b.id, title: b.title, status: b.status, severity_claimed: b.severityClaimed, severity_final: b.severityFinal ?? null,
  payout_amount: b.payoutAmount ?? null, payout_tx: b.payoutTx ?? null, response_due_at: b.responseDueAt ?? null,
  dispute_due_at: b.disputeDueAt ?? null, reject_reason: b.rejectReason ?? null, created_at: b.createdAt,
  accounts: { display_name: b.testerName },
})

function get(path: string, params: URLSearchParams) {
  if (path === '/api/auth/session') return { authenticated: true, account: ME, wallet: { address: WALLET }, isAdmin: true }
  if (path === '/api/campaigns' && !params.get('id')) {
    return { campaigns: campaigns.filter((c) => c.status === 'open').map((c) => ({
      ...publicCampaign(c), maxPayout: String(Math.max(...Object.values(payoutsOf(c)).map(Number))),
      approvedTesters: applications.filter((a) => a.campaignId === c.id && a.status === 'approved').length + 6,
    })) }
  }
  if (path === '/api/campaigns') {
    const c = campaigns.find((x) => x.id === params.get('id'))
    if (!c) return null
    if (params.get('view') === 'manage') {
      return {
        campaign: publicCampaign(c),
        applications: applications.filter((a) => a.campaignId === c.id).map((a) => ({ ...a, created_at: a.createdAt, accounts: { display_name: a.testerName ?? ME.displayName } })),
        bugs: bugs.filter((b) => b.campaignId === c.id).map(bugRow),
      }
    }
    const application = applications.find((a) => a.campaignId === c.id && a.tester === ME.id) ?? null
    return {
      campaign: publicCampaign(c), ownerName: c.owner === ME.id ? ME.displayName : c.productName.split(' ')[0] + ' Labs',
      payouts: c.payouts, remainingBudget: String(Number(c.budget) - committed(c)), escrowBalance: String(Number(c.budget) - bugs.filter((b) => b.campaignId === c.id && b.status === 'paid').reduce((s, b) => s + Number(b.payoutAmount || 0), 0)),
      approvedTesters: 7, stats: { decided: 25, accepted: 17, timedOut: 0, overturned: 1, avgResponseDays: 1.8 },
      viewer: { role: c.owner === ME.id ? 'owner' : 'user', application: application && { id: application.id, status: application.status } },
    }
  }
  if (path === '/api/bugs') {
    const b = bugs.find((x) => x.id === params.get('id'))
    if (!b) return null
    const c = campaigns.find((x) => x.id === b.campaignId) as Campaign
    return {
      role: c.owner === ME.id ? 'owner' : 'tester',
      bug: { severityFinal: null, rejectReason: null, rejectNote: null, duplicateOf: null, responseDueAt: null, disputeDueAt: null, decidedBy: null, payoutAmount: null, payoutTx: null, payoutPending: false, ...b },
      campaign: { id: c.id, title: c.title, productName: c.productName }, payouts: c.payouts,
      messages: (b.messages as unknown[]) ?? [], dispute: b.dispute ?? null,
    }
  }
  if (path === '/api/me') {
    return {
      wallet: { address: WALLET, balance: String(balance) },
      applications: applications.filter((a) => a.tester === ME.id).map((a) => {
        const c = campaigns.find((x) => x.id === a.campaignId) as Campaign
        return { id: a.id, status: a.status, created_at: a.createdAt, campaigns: { id: c.id, title: c.title, product_name: c.productName, status: c.status, ends_at: c.endsAt } }
      }),
      bugs: bugs.filter((b) => b.tester === ME.id).map((b) => {
        const c = campaigns.find((x) => x.id === b.campaignId) as Campaign
        return { ...bugRow(b), campaigns: { id: c.id, title: c.title, product_name: c.productName } }
      }),
      campaigns: campaigns.filter((c) => c.owner === ME.id).map((c) => ({
        id: c.id, title: c.title, product_name: c.productName, status: c.status, budget: c.budget, ends_at: c.endsAt,
        bugsToReview: bugs.filter((b) => b.campaignId === c.id && b.status === 'submitted').length,
      })),
    }
  }
  if (path === '/api/admin') return { disputes: bugs.filter((b) => b.status === 'disputed').map((b) => ({ id: `d-${b.id}`, reason: (b.dispute as { reason: string }).reason, created_at: iso(0), bugs: { id: b.id, title: b.title, severity_claimed: b.severityClaimed, reject_reason: b.rejectReason, reject_note: b.rejectNote ?? null, campaigns: { id: b.campaignId, title: '', product_name: campaigns.find((c) => c.id === b.campaignId)?.productName } } })) }
  return null
}

function post(path: string, body: Record<string, unknown>) {
  const bug = bugs.find((b) => b.id === body.id)
  const campaign = campaigns.find((c) => c.id === body.id || c.id === body.campaignId)
  switch (`${path}:${body.action}`) {
    case '/api/applications:apply':
      applications.push({ id: `app-${Date.now()}`, campaignId: String(body.campaignId), tester: ME.id, status: 'pending', message: String(body.message), devices: String(body.devices), createdAt: iso(0) })
      return { status: 'pending' }
    case '/api/applications:approve': case '/api/applications:reject': case '/api/applications:remove': {
      const a = applications.find((x) => x.id === body.id)
      if (a) a.status = { approve: 'approved', reject: 'rejected', remove: 'removed' }[String(body.action)] as string
      return { status: a?.status }
    }
    case '/api/bugs:submit': {
      const id = crypto.randomUUID()
      bugs.unshift({ ...body, id, campaignId: String(body.campaignId), tester: ME.id, testerName: ME.displayName, status: 'submitted', title: String(body.title), severityClaimed: String(body.severity), responseDueAt: iso(5 * day), createdAt: iso(0) })
      return { id }
    }
    case '/api/bugs:accept': case '/api/bugs:pay':
      if (bug) Object.assign(bug, { status: 'accepted', severityFinal: body.severity ?? bug.severityFinal, payoutAmount: payoutsOf(campaigns.find((c) => c.id === bug.campaignId) as Campaign)[String(body.severity ?? bug.severityFinal)], decidedBy: 'owner' })
      return { challengeId: 'demo-challenge' }
    case '/api/bugs:confirm-payout':
      if (bug) Object.assign(bug, { status: 'paid', payoutTx: tx('e') })
      return { status: 'paid', pending: false }
    case '/api/bugs:reject':
      if (bug) Object.assign(bug, { status: 'rejected', rejectReason: body.reason, rejectNote: body.note, duplicateOf: body.duplicateOf ?? null, disputeDueAt: iso(3 * day) })
      return { status: 'rejected' }
    case '/api/bugs:request-info': case '/api/bugs:reply': case '/api/bugs:dispute': {
      if (!bug) return null
      const msgs = (bug.messages as unknown[]) ?? []
      const text = String(body.message ?? body.reason)
      if (body.action === 'dispute') Object.assign(bug, { status: 'disputed', dispute: { id: 'd1', reason: text, status: 'open', resolution_note: null } })
      else {
        msgs.push({ id: String(Date.now()), body: text, created_at: iso(0), author_account_id: ME.id, accounts: { display_name: ME.displayName } })
        Object.assign(bug, { messages: msgs, status: body.action === 'reply' ? 'submitted' : 'needs_info' })
      }
      return { status: bug.status }
    }
    case '/api/admin:resolve-dispute': {
      const b = bugs.find((x) => `d-${x.id}` === body.id)
      if (b) Object.assign(b, body.decision === 'upheld'
        ? { status: 'paid', severityFinal: body.severity, payoutAmount: payoutsOf(campaigns.find((c) => c.id === b.campaignId) as Campaign)[String(body.severity)] ?? '0', payoutTx: tx('f'), decidedBy: 'admin', dispute: { ...(b.dispute as object), status: 'upheld' } }
        : { status: 'rejected_final', dispute: { ...(b.dispute as object), status: 'dismissed' } })
      if (b && body.decision === 'upheld') balance += Number(b.payoutAmount)
      return { status: body.decision }
    }
    case '/api/campaigns:create': {
      const id = crypto.randomUUID()
      campaigns.push({ ...body, id, owner: ME.id, title: String(body.title), productName: String(body.productName), budget: String(body.budget), endsAt: String(body.endsAt), status: 'draft', fundTx: null, createdAt: iso(0) })
      return { id }
    }
    case '/api/campaigns:start-funding': case '/api/campaigns:start-withdraw':
      return { challengeId: 'demo-challenge' }
    case '/api/campaigns:confirm-funding':
      if (campaign) Object.assign(campaign, { status: 'open', fundTx: tx('9') })
      return { status: 'open' }
    case '/api/campaigns:close':
      if (campaign) campaign.status = 'closed'
      return { status: 'closed' }
    default:
      return { ok: true }
  }
}

export function installMockApi() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin)
    if (!url.pathname.startsWith('/api/')) return realFetch(input, init)
    await new Promise((r) => setTimeout(r, 250))
    const result = init?.method === 'POST' || (init?.method === undefined && init?.body)
      ? post(url.pathname, JSON.parse(String(init?.body || '{}')))
      : init?.method === 'DELETE' ? { authenticated: false } : get(url.pathname, url.searchParams)
    return new Response(JSON.stringify(result ?? { error: 'Không tìm thấy (dữ liệu mẫu).' }), {
      status: result ? 200 : 404, headers: { 'Content-Type': 'application/json' },
    })
  }
}
