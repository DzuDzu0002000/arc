// Thin wrapper around the Circle W3S web SDK: email OTP login and PIN-confirmed challenges.
import type { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { ApiError, post } from './api'
import { t } from './i18n'

const appId = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const GOOGLE_KEY = 'archunt.google'
/** Google sign-in is offered only once a Google OAuth client id is configured. */
export const googleEnabled = Boolean(googleClientId)
const STORAGE_KEY = 'archunt.circle'
// Demo mode (`npm run dev:mock`): skip the Circle SDK and pretend every PIN prompt succeeds.
const demo = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1'

export type CircleLogin = { userToken: string; encryptionKey: string; refreshToken: string; deviceId: string; email?: string }

let loginWaiter: { resolve: (login: Omit<CircleLogin, 'deviceId'>) => void; reject: (error: Error) => void } | null = null

function onLoginComplete(error: unknown, result: unknown) {
  const waiter = loginWaiter
  loginWaiter = null
  if (!waiter) return
  const r = result as Partial<CircleLogin> | undefined
  if (error || !r?.userToken || !r.encryptionKey) {
    waiter.reject(new Error((error as { message?: string } | null)?.message || t('Mã OTP không hợp lệ hoặc đã hết hạn.')))
    return
  }
  const email = (result as { oAuthInfo?: { socialUserInfo?: { email?: string } } }).oAuthInfo?.socialUserInfo?.email
  waiter.resolve({ userToken: r.userToken, encryptionKey: r.encryptionKey, refreshToken: r.refreshToken || '', email })
}

async function newSdk(): Promise<W3SSdk> {
  if (!appId) throw new Error(t('Thiếu VITE_CIRCLE_APP_ID.'))
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

function googleConfigs(tokens: { deviceToken: string; deviceEncryptionKey: string }) {
  return {
    appSettings: { appId: appId as string },
    loginConfigs: { ...tokens, google: { clientId: googleClientId as string, redirectUri: `${window.location.origin}/auth`, selectAccountPrompt: true } },
  }
}

/** Sends the browser to Google. The page comes back to /auth, where finishGoogleLogin() completes it. */
export async function startGoogleLogin(): Promise<void> {
  if (!googleClientId) throw new Error(t('Đăng nhập Google chưa được cấu hình.'))
  const sdk = await newSdk()
  const deviceId = await sdk.getDeviceId()
  const tokens = await post<{ deviceToken: string; deviceEncryptionKey: string }>('/api/auth/social', { deviceId })
  try { sessionStorage.setItem(GOOGLE_KEY, JSON.stringify({ ...tokens, deviceId })) } catch { /* private mode */ }
  sdk.updateConfigs(googleConfigs(tokens), onLoginComplete)
  // SocialLoginProvider.GOOGLE; the enum is not exported from the package entry.
  await sdk.performLogin('Google' as Parameters<W3SSdk['performLogin']>[0])
}

/** True when the page has just come back from Google with a pending sign-in. */
export function hasGoogleReturn(): boolean {
  try { return Boolean(sessionStorage.getItem(GOOGLE_KEY)) && window.location.hash.length > 1 } catch { return false }
}

/** Lets Circle's SDK verify the Google token from the URL and returns the Circle login. */
export async function finishGoogleLogin(): Promise<CircleLogin> {
  let pending: { deviceToken: string; deviceEncryptionKey: string; deviceId: string } | null = null
  try { pending = JSON.parse(sessionStorage.getItem(GOOGLE_KEY) || 'null'); sessionStorage.removeItem(GOOGLE_KEY) } catch { /* private mode */ }
  if (!pending || !appId || !googleClientId) throw new Error(t('Đăng nhập Google không thành công. Thử lại.'))
  const login = new Promise<Omit<CircleLogin, 'deviceId'>>((resolve, reject) => { loginWaiter = { resolve, reject } })
  const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
  document.getElementById('sdkIframe')?.remove()
  ;(W3SSdk as unknown as { instance: unknown }).instance = null
  // The constructor reads the token Google put in the URL hash and asks Circle to verify it.
  new W3SSdk(googleConfigs(pending), onLoginComplete)
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(t('Đăng nhập Google không thành công. Thử lại.'))), 60_000))
  const result = { ...(await Promise.race([login, timeout])), deviceId: pending.deviceId }
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
  if (!auth) throw new ReauthRequired(t('Phiên ký đã hết hạn. Đăng nhập lại để xác nhận.'))
  const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
  const sdk = new W3SSdk({ appSettings: { appId: appId as string } })
  sdk.setAuthentication(auth)
  await new Promise<void>((resolve, reject) => {
    sdk.execute(challengeId, (error) => {
      if (error) reject(new Error((error as { message?: string }).message || t('Giao dịch đã bị huỷ.')))
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
    if (result.failed) throw new Error(t('Giao dịch không thành công. Không có tiền nào bị chuyển.'))
    if (!result.pending) return result
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(t('Giao dịch đang được xử lý. Hãy tải lại trang sau ít phút.'))
}
