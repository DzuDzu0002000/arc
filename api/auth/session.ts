import { ARC_BLOCKCHAIN, initializeUser, listWallets, verifyUserToken } from '../../server/circle.js'
import { db, must, type AccountRow } from '../../server/db.js'
import { badRequest, body, route, unauthorized } from '../../server/http.js'
import { endSession, getSession, requireSession, startSession } from '../../server/session.js'

const str = (value: unknown, max = 4096) => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : null)

export default route(['GET', 'POST', 'PATCH', 'DELETE'], async (req, res) => {
  if (req.method === 'GET') {
    const session = await getSession(req)
    if (!session?.wallet) return { authenticated: false }
    return {
      authenticated: true,
      account: { id: session.account.id, displayName: session.account.display_name, email: session.account.email },
      wallet: { address: session.wallet.address },
      isAdmin: session.isAdmin,
    }
  }

  if (req.method === 'DELETE') {
    await endSession(req, res)
    return { authenticated: false }
  }

  if (req.method === 'PATCH') {
    const session = await requireSession(req)
    const displayName = typeof body(req).displayName === 'string' ? (body(req).displayName as string).trim() : ''
    if (displayName.length < 2 || displayName.length > 40) throw badRequest('Display name must be 2–40 characters.')
    must(await db().from('accounts').update({ display_name: displayName }).eq('id', session.account.id))
    return { ok: true }
  }

  // POST: exchange a Circle login for a Bugline session.
  const input = body(req)
  const userToken = str(input.userToken)
  if (!userToken) throw badRequest('Missing Circle login.')

  // Identity comes from Circle, never from the request body.
  const circleUserId = await verifyUserToken(userToken)
  if (!circleUserId) throw unauthorized('Circle could not verify this sign-in.')

  const wallets = await listWallets(userToken)
  const wallet = wallets.find((w) => w.blockchain === ARC_BLOCKCHAIN && w.accountType === 'SCA' && w.state === 'LIVE')
  if (!wallet) {
    // First sign-in: the user sets a PIN in the Circle SDK, then the client posts again.
    const challengeId = await initializeUser(userToken)
    return { authenticated: false, needsWallet: true, challengeId: challengeId || null }
  }

  // The email is self-reported (Circle does not return it): kept for display, never used to find accounts or grant roles.
  const email = typeof input.email === 'string' && input.email.length <= 320 ? input.email.trim().toLowerCase() : null
  const existing = must(await db().from('accounts').select('id, circle_user_id, email, display_name')
    .eq('circle_user_id', circleUserId).maybeSingle<AccountRow>())
  const account = existing ?? must(await db().from('accounts')
    .insert({ circle_user_id: circleUserId, email, display_name: email ? email.split('@')[0].slice(0, 40) : '' })
    .select('id, circle_user_id, email, display_name').single<AccountRow>()) as AccountRow

  must(await db().from('wallets').upsert(
    { account_id: account.id, circle_wallet_id: wallet.id, address: wallet.address },
    { onConflict: 'account_id' },
  ))

  await startSession(res, {
    accountId: account.id, userToken, refreshToken: str(input.refreshToken), deviceId: str(input.deviceId, 200),
  })
  return { authenticated: true }
})
