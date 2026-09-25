import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ConfigError } from './env.js'

export type { VercelRequest, VercelResponse }

export class HttpError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const badRequest = (message: string) => new HttpError(400, message)
export const unauthorized = (message = 'Please sign in.') => new HttpError(401, message, 'AUTH_REQUIRED')
export const forbidden = (message = 'You are not allowed to do this.') => new HttpError(403, message)
export const notFound = (message = 'Not found.') => new HttpError(404, message)
export const conflict = (message: string) => new HttpError(409, message)

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>

/** Wraps a Vercel function: method check, no-store, and uniform JSON errors that never leak internals. */
export function route(methods: string[], handler: Handler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!methods.includes(req.method || '')) {
      res.setHeader('Allow', methods.join(', '))
      return res.status(405).json({ error: 'Method not allowed.' })
    }
    try {
      const body = await handler(req, res)
      if (!res.headersSent) return res.status(200).json(body ?? { ok: true })
    } catch (error) {
      if (error instanceof HttpError) return res.status(error.status).json({ error: error.message, code: error.code })
      if (error instanceof ConfigError) {
        console.error('BUGLINE_CONFIG', error.message)
        return res.status(500).json({ error: 'The server is not configured.' })
      }
      console.error('BUGLINE_UNEXPECTED', error)
      return res.status(502).json({ error: 'Something went wrong. Please try again.' })
    }
  }
}

export function body(req: VercelRequest): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {}
}

export function action(req: VercelRequest): string {
  const value = body(req).action
  if (typeof value !== 'string') throw badRequest('Missing action.')
  return value
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function uuidParam(value: unknown, name = 'id'): string {
  const text = Array.isArray(value) ? value[0] : value
  if (typeof text !== 'string' || !UUID.test(text)) throw badRequest(`Invalid ${name}.`)
  return text.toLowerCase()
}

export function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim()
  return first || req.socket?.remoteAddress || 'unknown'
}
