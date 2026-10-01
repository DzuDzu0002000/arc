# ArcHunt

Marketplace để dự án AI thuê tester tìm bug, trả thưởng bằng USDC trên **Arc Testnet**. Nền tảng không thu phí.

- Dự án tạo chiến dịch, đặt bảng giá theo mức độ lỗi, rồi **nạp toàn bộ ngân sách vào escrow** (`ArcHuntEscrow`) trước khi mở.
- Tester ứng tuyển → được duyệt → gửi bug.
- Dự án chấp nhận bug → ký lệnh `payBug` bằng PIN ví Circle → USDC đi thẳng từ escrow tới ví tester.
- Dự án không phản hồi trong hạn → bug **tự được chấp nhận**, ví arbiter của nền tảng trả từ escrow.
- Tester bị từ chối được **khiếu nại 1 lần** trong 3 ngày; admin phân xử.
- Tiền còn lại được rút về 14 ngày sau ngày kết thúc chiến dịch.
- Dự án xem **hồ sơ tester** trước khi duyệt: số dự án đã test, bug đã báo, bug được chấp nhận, tỷ lệ chấp nhận, số sao. Sau khi trả tiền cho bug, dự án **đánh giá tester 1–5 sao**.

Đăng nhập bằng **Circle Wallet** (mã OTP qua email, ví SCA trên Arc được tạo tự động). Lần đầu, người dùng chọn một vai trò cố định:

| Vai trò | Giao diện |
| --- | --- |
| Dự án | Tổng quan (escrow, đã trả, bug chờ xét) · Chiến dịch (tạo, nạp escrow, duyệt đơn) · Bug cần xét (chấp nhận, ký trả, đánh giá tester) · Ví & nạp tiền |
| Tester | Khám phá & ứng tuyển · Bug của tôi (lọc theo trạng thái) · Tranh chấp · Ví |
| Admin (theo Circle user id) | Xử lý tranh chấp: đang mở / đã xử lý |

Giao diện có tiếng Việt và tiếng Anh (nút VI | EN). Bản dịch nằm ở `src/i18n-en.ts`; `npm test` báo lỗi nếu có chữ trên giao diện chưa được dịch.

## Kiến trúc

| Phần | Công nghệ | Thư mục |
| --- | --- | --- |
| Giao diện | React 19 + Vite, CSS thuần | `src/` |
| API | Vercel Functions (Node) | `api/` |
| Logic server | TypeScript, test bằng `node --test` | `server/` |
| Database | Supabase Postgres (RLS bật, chỉ server truy cập) | `supabase/migrations/` |
| Ví & đăng nhập | Circle User-Controlled Wallets (email OTP, ví SCA) | `server/circle.ts`, `src/circle.ts` |
| Hợp đồng | Solidity `ArcHuntEscrow` | `contracts/` |

Quy tắc an toàn quan trọng:

- Tài khoản gắn với `circle_user_id` do Circle xác minh; ví lấy từ Circle phía server. Email do người dùng tự khai, **không bao giờ dùng để tìm tài khoản hay phân quyền**. Admin được cấu hình bằng Circle user id.
- Số tiền trả bug do server tính từ bảng giá, không nhận từ client.
- Trạng thái `open` / `paid` chỉ được đặt sau khi server đọc receipt trên Arc và thấy đúng sự kiện `CampaignFunded` / `BugPaid`.
- Hợp đồng chỉ cho tiền ra theo 2 đường: trả bug (tối đa `maxPayout`, mỗi bug một lần) hoặc hoàn phần còn lại cho chủ chiến dịch sau thời gian gia hạn.

## Chạy thử

Cần Node ≥ 22.18.

```bash
npm install
```

```bash
npm test
```

`npm test` chạy logic nghiệp vụ, mã hoá lệnh gọi hợp đồng, và **chạy bytecode thật của `ArcHuntEscrow` trong EVM nội bộ** (không cần Foundry hay RPC).

```bash
npm run build
```

Xem giao diện với dữ liệu mẫu (không cần Circle, Supabase hay Arc; bước ký PIN được giả lập, tải lại trang là dữ liệu về như cũ):

```bash
npm run dev:mock
```

### Cài đặt đầy đủ

1. **Supabase:** tạo project, chạy lần lượt **tất cả** file trong `supabase/migrations/` theo thứ tự tên file (init → account_roles → tester_ratings → campaign_english) trong SQL editor.
2. **Circle:** tạo app User-Controlled Wallets trên [Circle Console](https://console.circle.com), bật đăng nhập email OTP, lấy `App ID` và API key testnet. Bật Gas Station cho Arc Testnet nếu muốn tài trợ gas cho người dùng.
3. **Hợp đồng:**
   ```bash
   npm run contracts:compile
   ```
   ```bash
   DEPLOYER_PRIVATE_KEY=0x... ARBITER_ADDRESS=0x... npm run contracts:deploy
   ```
   Ví deploy và ví arbiter cần một ít USDC testnet để trả gas ([faucet](https://faucet.circle.com)).
4. **Biến môi trường:** chép `.env.example` thành `.env` và điền đủ (trên Vercel: Project Settings → Environment Variables).
5. **Chạy local cả API:**
   ```bash
   npm run dev
   ```
   Vite tự chạy các file trong `api/` tại `/api/*` (không cần Vercel CLI), đọc biến môi trường từ `.env`.
6. **Cron:** `vercel.json` gọi `/api/cron/deadlines` mỗi ngày lúc 01:00 UTC (gói Vercel Hobby chỉ cho chạy mỗi ngày một lần; lên gói Pro thì đổi thành `0 * * * *` để chạy mỗi giờ). Đặt `CRON_SECRET` trên Vercel.
7. **Cấp quyền admin:** người cần quyền đăng nhập một lần, vào trang **Ví** và chép **Mã tài khoản Circle**. Thêm mã đó vào `ADMIN_CIRCLE_USER_IDS` (nhiều mã cách nhau bằng dấu phẩy) rồi deploy lại. Admin không xử lý được tranh chấp mà chính mình là chủ chiến dịch hoặc tester báo bug; server chặn việc này.

Nếu có Foundry, `forge test` chạy thêm bộ test Solidity trong `contracts/test/` (cần `forge install foundry-rs/forge-std --root . --no-git` vào `contracts/lib`).

## Việc chưa làm (sau MVP)

- Upload file bằng chứng trực tiếp (hiện chỉ nhận link https).
- Thông báo email.
- Làm mới token Circle phía server: token hết hạn sau ~60 phút, người dùng phải đăng nhập lại để ký giao dịch.
- Arbiter multisig và audit hợp đồng, bắt buộc trước mainnet.
- Các loại việc khác ngoài test bug (`job_type`).
