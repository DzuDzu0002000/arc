import { requestEmailOtp } from '../../server/circle.js'
import { db, must } from '../../server/db.js'
import { HttpError, badRequest, body, clientIp, route } from '../../server/http.js'

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/
const PER_EMAIL_PER_HOUR = 5
const PER_IP_PER_HOUR = 20

export default route(['POST'], async (req) => {
  const input = body(req)
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const deviceId = typeof input.deviceId === 'string' ? input.deviceId.trim() : ''
  if (!EMAIL.test(email)) throw badRequest('Enter a valid email address.')
  if (!deviceId || deviceId.length > 200) throw badRequest('Missing device id.')

  const ip = clientIp(req)
  const since = new Date(Date.now() - 3_600_000).toISOString()
  const [byEmail, byIp] = await Promise.all([
    db().from('otp_requests').select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', since),
    db().from('otp_requests').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since),
  ])
  if (byEmail.error || byIp.error) throw new Error('Rate limit lookup failed')
  if ((byEmail.count ?? 0) >= PER_EMAIL_PER_HOUR || (byIp.count ?? 0) >= PER_IP_PER_HOUR) {
    throw new HttpError(429, 'Too many sign-in codes requested. Try again in an hour.')
  }
  must(await db().from('otp_requests').insert({ email, ip }))

  return requestEmailOtp(email, deviceId)
})
