import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer, defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

/**
 * Local stand-in for Vercel Functions: `npm run dev` serves /api/* from the files in api/,
 * so the real API runs without the Vercel CLI. Production still deploys api/ to Vercel.
 */
function localApi(): Plugin {
  const readBody = (req: IncomingMessage) => new Promise<unknown>((done) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try { done(raw ? JSON.parse(raw) : undefined) } catch { done(undefined) }
    })
  })

  // A separate loader without the browser polyfills, so server code gets Node's real crypto, fs, etc.
  let loader: ViteDevServer | null = null
  const load = async (file: string) => {
    loader ??= await createServer({ configFile: false, root: __dirname, logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' })
    return loader.ssrLoadModule(file)
  }

  return {
    name: 'archunt-local-api',
    configureServer(server: ViteDevServer) {
      server.httpServer?.once('close', () => { void loader?.close() })
      server.middlewares.use(async (req, res: ServerResponse, next) => {
        const url = new URL(req.url || '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()
        const file = resolve(__dirname, `.${url.pathname.replace(/\/$/, '')}.ts`)
        if (!file.startsWith(resolve(__dirname, 'api')) || !existsSync(file)) {
          res.statusCode = 404
          return res.end(JSON.stringify({ error: 'Not found.' }))
        }
        const request = Object.assign(req, {
          query: Object.fromEntries(url.searchParams),
          body: req.method === 'GET' ? undefined : await readBody(req),
        })
        const response = Object.assign(res, {
          status(code: number) { res.statusCode = code; return response },
          json(body: unknown) {
            if (!res.headersSent) res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(body))
            return response
          },
        })
        try {
          const mod = await load(file)
          await mod.default(request, response)
        } catch (error) {
          console.error('[local api]', error)
          if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: 'Local API error.' })) }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Server code reads process.env (like on Vercel); load every .env value for the local API.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    // The Circle W3S web SDK expects Node globals (Buffer, process) in the browser.
    plugins: [react(), nodePolyfills({ globals: { process: true, Buffer: true } }), ...(mode === 'mock' ? [] : [localApi()])],
  }
})
