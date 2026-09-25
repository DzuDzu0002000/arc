import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// The Circle W3S web SDK expects Node globals (Buffer, process) in the browser.
export default defineConfig({
  plugins: [react(), nodePolyfills({ globals: { process: true, Buffer: true } })],
})
