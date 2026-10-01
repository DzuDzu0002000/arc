import { requestSocialDeviceToken } from '../../server/circle.js'
import { badRequest, body, route } from '../../server/http.js'

// Starts Google sign-in. No email is sent, so there is no per-email rate limit here.
export default route(['POST'], async (req) => {
  const input = body(req)
  const deviceId = typeof input.deviceId === 'string' ? input.deviceId.trim() : ''
  if (!deviceId || deviceId.length > 200) throw badRequest('Missing device id.')
  return requestSocialDeviceToken(deviceId)
})
