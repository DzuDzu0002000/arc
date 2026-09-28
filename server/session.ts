import crypto from 'node:crypto'
import { db, must, type AccountRow, type Role, type WalletRow } from './db.js'
import { env } from './env.js'
import { forbidden, unauthorized, type VercelRequest, type VercelResponse } from './http.js'

const COOKIE = 'archunt_session'
const TTL_SECONDS = 7 * 24 * 60 * 60

function sign(value: string) {
  return crypto.createHmac('sha256', env.sessionSecret()).update(value).digest('base64url')
}

function readCookie(req: VercelRequest): string | null {
  const header = req.headers.cookie || ''
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE) return rest.join('=')
  }
  return null
}

/** The cookie holds only a random session id plus its HMAC; Circle tokens stay in the database. */
function verifiedSid(req: VercelRequest): string | null {
  const value = readCookie(req)
  if (!value) return null
  const [sid, signature] = value.split('.')
  if (!sid || !signature) return null
  const expected = Buffer.from(sign(sid))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null
  return sid
}

function cookie(value: string, maxAge: number) {
  const secure = env.isProduction() ? '; Secure' : ''
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`
}

export async function startSession(res: VercelResponse, args: {
  accountId: string; userToken: string; refreshToken: string | null; deviceId: string | null
}) {
  const sid = crypto.randomUUID()
  must(await db().from('sessions').insert({
    sid, account_id: args.accountId, circle_user_token: args.userToken, circle_refresh_token: args.refreshToken,
    circle_device_id: args.deviceId, expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
  }))
  res.setHeader('Set-Cookie', cookie(`${sid}.${sign(sid)}`, TTL_SECONDS))
}

export async function endSession(req: VercelRequest, res: VercelResponse) {
  const sid = verifiedSid(req)
  if (sid) await db().from('sessions').update({ revoked_at: new Date().toISOString() }).eq('sid', sid)
  res.setHeader('Set-Cookie', cookie('', 0))
}

export type Session = {
  sid: string
  account: AccountRow
  wallet: WalletRow | null
  userToken: string
  isAdmin: boolean
}

type SessionJoin = {
  sid: string; circle_user_token: string; expires_at: string; revoked_at: string | null
  accounts: AccountRow | null
}

export async function getSession(req: VercelRequest): Promise<Session | null> {
  const sid = verifiedSid(req)
  if (!sid) return null
  const row = must(await db().from('sessions')
    .select('sid, circle_user_token, expires_at, revoked_at, accounts(id, circle_user_id, email, display_name, role)')
    .eq('sid', sid).maybeSingle<SessionJoin>())
  if (!row || row.revoked_at || new Date(row.expires_at) <= new Date() || !row.accounts) return null
  const wallet = must(await db().from('wallets').select('account_id, circle_wallet_id, address')
    .eq('account_id', row.accounts.id).maybeSingle<WalletRow>())
  return {
    sid: row.sid, account: row.accounts, wallet, userToken: row.circle_user_token,
    isAdmin: env.adminCircleUserIds().includes(row.accounts.circle_user_id),
  }
}

export async function requireSession(req: VercelRequest): Promise<Session & { wallet: WalletRow }> {
  const session = await getSession(req)
  if (!session) throw unauthorized()
  if (!session.wallet) throw unauthorized('Finish creating your wallet first.')
  return session as Session & { wallet: WalletRow }
}

const ROLE_LABEL: Record<Role, string> = { project: 'project', tester: 'tester' }

/** The account must have picked this side (projects fund and review; testers apply, report and dispute). */
export async function requireRole(req: VercelRequest, role: Role) {
  const session = await requireSession(req)
  if (session.account.role !== role) throw forbidden(`Only ${ROLE_LABEL[role]} accounts can do this.`)
  return session
}

export async function requireAdmin(req: VercelRequest) {
  const session = await requireSession(req)
  if (!session.isAdmin) throw forbidden()
  return session
}
