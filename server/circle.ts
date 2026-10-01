import crypto from 'node:crypto'
import { env } from './env.js'
import { HttpError } from './http.js'

// Circle User-Controlled Wallets REST API. https://developers.circle.com/api-reference/wallets/user-controlled-wallets
const BASE = 'https://api.circle.com/v1/w3s'
export const ARC_BLOCKCHAIN = 'ARC-TESTNET'

type Json = Record<string, unknown>
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null

async function call(path: string, init: { method?: string; userToken?: string; body?: Json } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: init.method || 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${env.circleApiKey()}`,
      ...(init.userToken ? { 'X-User-Token': init.userToken } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const payload: unknown = await response.json().catch(() => null)
  return { status: response.status, ok: response.ok, data: isRecord(payload) && isRecord(payload.data) ? payload.data : null, payload, withUserToken: Boolean(init.userToken) }
}

/** Circle rejects an expired user token (they last ~60 minutes) with 401/403: the user must sign in again to sign. */
function reauthIfExpired(status: number) {
  if (status === 401 || status === 403) throw new HttpError(401, 'Your Circle sign-in expired. Sign in again to confirm this action.', 'CIRCLE_REAUTH')
}

function circleError(result: { status: number; payload: unknown; withUserToken: boolean }, fallback: string): never {
  const code = isRecord(result.payload) ? result.payload.code : undefined
  const message = isRecord(result.payload) ? result.payload.message : undefined
  console.error('ARCHUNT_CIRCLE_ERROR', result.status, code, message)
  // Without a user token, 401/403 means Circle rejected our server API key, not that the user's sign-in expired.
  if (!result.withUserToken && (result.status === 401 || result.status === 403)) {
    throw new HttpError(500, 'The server could not authenticate with Circle. Check CIRCLE_API_KEY.', 'CIRCLE_API_KEY')
  }
  reauthIfExpired(result.status)
  throw new HttpError(502, fallback)
}

export async function requestEmailOtp(email: string, deviceId: string) {
  const result = await call('/users/email/token', { method: 'POST', body: { idempotencyKey: crypto.randomUUID(), email, deviceId } })
  if (!result.ok || !result.data) circleError(result, 'Could not send the sign-in code.')
  const { deviceToken, deviceEncryptionKey, otpToken } = result.data
  if (typeof deviceToken !== 'string' || typeof deviceEncryptionKey !== 'string' || typeof otpToken !== 'string') {
    throw new HttpError(502, 'Could not send the sign-in code.')
  }
  return { deviceToken, deviceEncryptionKey, otpToken }
}

/** Returns the Circle user id the token belongs to, or null if Circle does not accept the token. */
export async function verifyUserToken(userToken: string): Promise<string | null> {
  const result = await call('/user', { userToken })
  if (!result.ok || !result.data) return null
  const user = isRecord(result.data.user) ? result.data.user : result.data
  const id = user.id ?? user.userId ?? user.userID
  return typeof id === 'string' && id ? id : null
}

export type CircleWallet = { id: string; address: string; blockchain: string; accountType: string; state: string }

export async function listWallets(userToken: string): Promise<CircleWallet[]> {
  const result = await call('/wallets', { userToken })
  if (!result.ok || !result.data || !Array.isArray(result.data.wallets)) circleError(result, 'Could not load your wallet.')
  return (result.data.wallets as unknown[]).filter(isRecord).map((w) => ({
    id: String(w.id), address: String(w.address).toLowerCase(), blockchain: String(w.blockchain),
    accountType: String(w.accountType), state: String(w.state),
  }))
}

export async function initializeUser(userToken: string): Promise<string> {
  const result = await call('/user/initialize', {
    method: 'POST', userToken,
    body: { idempotencyKey: crypto.randomUUID(), accountType: 'SCA', blockchains: [ARC_BLOCKCHAIN] },
  })
  // 155106 = user already initialized; the wallet may still be indexing.
  if (!result.ok && isRecord(result.payload) && result.payload.code === 155106) return ''
  if (!result.ok || !result.data || typeof result.data.challengeId !== 'string') circleError(result, 'Could not create your wallet.')
  return result.data.challengeId as string
}

/** Creates a contract call that the user confirms with their PIN in the Circle SDK. Returns the challenge id. */
export async function createContractExecution(args: {
  userToken: string; walletId: string; contractAddress: string; callData: string; idempotencyKey: string
}): Promise<string> {
  const result = await call('/user/transactions/contractExecution', {
    method: 'POST', userToken: args.userToken,
    body: {
      idempotencyKey: args.idempotencyKey, walletId: args.walletId, contractAddress: args.contractAddress,
      callData: args.callData, feeLevel: 'MEDIUM',
    },
  })
  if (!result.ok || !result.data || typeof result.data.challengeId !== 'string') circleError(result, 'Could not prepare the transaction.')
  return result.data.challengeId as string
}

export type ChallengeOutcome =
  | { state: 'pending' }
  | { state: 'failed' }
  | { state: 'submitted'; walletId: string; txHash: `0x${string}` }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Follows a challenge to its on-chain transaction hash (challenge -> correlated transaction -> txHash). */
export async function resolveChallenge(userToken: string, challengeId: string): Promise<ChallengeOutcome> {
  const challengeResult = await call(`/user/challenges/${encodeURIComponent(challengeId)}`, { userToken })
  if (!challengeResult.ok || !challengeResult.data || !isRecord(challengeResult.data.challenge)) circleError(challengeResult, 'Could not check the transaction.')
  const challenge = challengeResult.data.challenge as Json
  if (['FAILED', 'DENIED', 'CANCELLED', 'EXPIRED'].includes(String(challenge.status))) return { state: 'failed' }
  const ids = Array.isArray(challenge.correlationIds) ? challenge.correlationIds : []
  const transactionId = ids.find((id): id is string => typeof id === 'string' && UUID.test(id))
  if (!transactionId) return { state: 'pending' }

  const txResult = await call(`/transactions/${encodeURIComponent(transactionId)}`, { userToken })
  if (!txResult.ok || !txResult.data || !isRecord(txResult.data.transaction)) circleError(txResult, 'Could not check the transaction.')
  const tx = txResult.data.transaction as Json
  if (['FAILED', 'DENIED', 'CANCELLED'].includes(String(tx.state))) return { state: 'failed' }
  const txHash = typeof tx.txHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(tx.txHash) ? tx.txHash.toLowerCase() as `0x${string}` : null
  return txHash ? { state: 'submitted', walletId: String(tx.walletId), txHash } : { state: 'pending' }
}
