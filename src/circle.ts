// Thin wrapper around the Circle W3S web SDK: email OTP login and PIN-confirmed challenges.
import type { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { ApiError, post } from './api'

const appId = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined
const STORAGE_KEY = 'bugline.circle'
// Demo mode (`npm run dev:mock`): skip the Circle SDK and pretend every PIN prompt succeeds.
const demo = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1'

export type CircleLogin = { userToken: string; encryptionKey: string; refreshToken: string; deviceId: string }

let loginWaiter: { resolve: (login: Omit<CircleLogin, 'deviceId'>) => void; reject: (error: Error) => void } | null = null

function onLoginComplete(error: unknown, result: unknown) {
  const waiter = loginWaiter
  loginWaiter = null
  if (!waiter) return
  const r = result as Partial<CircleLogin> | undefined
  if (error || !r?.userToken || !r.encryptionKey) {
    waiter.reject(new Error((error as { message?: string } | null)?.message || 'Mã OTP không hợp lệ hoặc đã hết hạn.'))
    return
  }
  waiter.resolve({ userToken: r.userToken, encryptionKey: r.encryptionKey, refreshToken: r.refreshToken || '' })
}

async function newSdk(): Promise<W3SSdk> {
  if (!appId) throw new Error('Thiếu VITE_CIRCLE_APP_ID.')
  const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
  // The SDK is a singleton; reset it so each login gets a fresh iframe and callback.
  document.getElementById('sdkIframe')?.remove()
  ;(W3SSdk as unknown as { instance: unknown }).instance = null
  return new W3SSdk({ appSettings: { appId } }, onLoginComplete)
}

/** Sends the OTP email and opens Circle's code prompt. Resolves once the user enters a valid code. */
export async function loginWithEmail(email: string): Promise<CircleLogin> {
  if (demo) return { userToken: 'demo', encryptionKey: 'demo', refreshToken: '', deviceId: `demo-${email}` }
  const sdk = await newSdk()
  const deviceId = await sdk.getDeviceId()
  const tokens = await post<{ deviceToken: string; deviceEncryptionKey: string; otpToken: string }>('/api/auth/otp', { email, deviceId })
  const login = new Promise<Omit<CircleLogin, 'deviceId'>>((resolve, reject) => { loginWaiter = { resolve, reject } })
  sdk.updateConfigs({ appSettings: { appId: appId as string }, loginConfigs: tokens }, onLoginComplete)
  sdk.verifyOtp()
  const result = { ...(await login), deviceId }
  saveLogin(result)
  return result
}

function saveLogin(login: CircleLogin) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ userToken: login.userToken, encryptionKey: login.encryptionKey })) } catch { /* private mode */ }
}

export function clearLogin() {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* private mode */ }
}

function storedLogin(): { userToken: string; encryptionKey: string } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
    return value?.userToken && value?.encryptionKey ? value : null
  } catch {
    return null
  }
}

export class ReauthRequired extends Error {}

/** Shows Circle's PIN prompt for a challenge created by the server. */
export async function confirmChallenge(challengeId: string): Promise<void> {
  if (demo) return new Promise((resolve) => setTimeout(resolve, 600))
  const auth = storedLogin()
  if (!auth) throw new ReauthRequired('Phiên ký đã hết hạn. Đăng nhập lại để xác nhận.')
  const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
  const sdk = new W3SSdk({ appSettings: { appId: appId as string } })
  sdk.setAuthentication(auth)
  await new Promise<void>((resolve, reject) => {
    sdk.execute(challengeId, (error) => {
      if (error) reject(new Error((error as { message?: string }).message || 'Giao dịch đã bị huỷ.'))
      else resolve()
    })
  })
}

/**
 * Server creates a challenge -> user confirms with PIN -> poll the server until it verifies the transaction on Arc.
 * `confirm` returns { pending: true } while Circle/Arc have not caught up.
 */
export async function signAndConfirm<T extends { pending?: boolean; failed?: boolean }>(
  start: () => Promise<{ challengeId: string }>,
  confirm: () => Promise<T>,
): Promise<T> {
  let challengeId: string
  try {
    challengeId = (await start()).challengeId
  } catch (error) {
    if (error instanceof ApiError && error.code === 'CIRCLE_REAUTH') throw new ReauthRequired(error.message)
    throw error
  }
  await confirmChallenge(challengeId)
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await confirm()
    if (result.failed) throw new Error('Giao dịch không thành công. Không có tiền nào bị chuyển.')
    if (!result.pending) return result
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('Giao dịch đang được xử lý. Hãy tải lại trang sau ít phút.')
}
