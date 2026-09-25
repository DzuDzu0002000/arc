import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// `npm run dev:mock` serves sample data instead of the real API; the branch is removed from production builds.
if (import.meta.env.DEV && import.meta.env.VITE_MOCK === '1') {
  const { installMockApi } = await import('./mock')
  installMockApi()
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
