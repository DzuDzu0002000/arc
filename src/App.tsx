import { createContext, useCallback, useContext, useEffect, useState, type ReactElement } from 'react'
import { api, type SessionInfo } from './api'
import { Admin } from './pages/admin'
import { Landing, SignIn } from './pages/auth'
import { CampaignDetail, Explore, ReportBug } from './pages/explore'
import { ManageCampaign, MyProjects, NewCampaign } from './pages/projects'
import { Wallet } from './pages/wallet'
import { BugDetail, MyWork } from './pages/work'
import { BottomNav, Loading, navigate, usePath } from './ui'

type SessionContext = { session: SessionInfo | null; refresh: () => Promise<void> }
const Ctx = createContext<SessionContext>({ session: null, refresh: async () => {} })
export const useSession = () => useContext(Ctx)

type Route = [RegExp, (params: string[]) => ReactElement]
const routes: Route[] = [
  [/^\/app\/?$/, () => <Explore />],
  [/^\/app\/c\/([0-9a-f-]{36})\/?$/, ([id]) => <CampaignDetail id={id} />],
  [/^\/app\/c\/([0-9a-f-]{36})\/report\/?$/, ([id]) => <ReportBug campaignId={id} />],
  [/^\/app\/work\/?$/, () => <MyWork />],
  [/^\/app\/bugs\/([0-9a-f-]{36})\/?$/, ([id]) => <BugDetail id={id} />],
  [/^\/app\/projects\/?$/, () => <MyProjects />],
  [/^\/app\/projects\/new\/?$/, () => <NewCampaign />],
  [/^\/app\/projects\/([0-9a-f-]{36})\/?$/, ([id]) => <ManageCampaign id={id} />],
  [/^\/app\/wallet\/?$/, () => <Wallet />],
  [/^\/app\/admin\/?$/, () => <Admin />],
]

export function App() {
  const path = usePath()
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setSession(await api<SessionInfo>('/api/auth/session'))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const isApp = path.startsWith('/app')
  useEffect(() => {
    if (!session) return
    if (isApp && !session.authenticated) navigate(`/auth?next=${encodeURIComponent(path)}`)
    if (path === '/' && session.authenticated) navigate('/app')
  }, [session, isApp, path])

  if (!session) return <main className="page"><Loading error={error} onRetry={refresh} /></main>

  let page: ReactElement
  if (path === '/auth') page = <SignIn />
  else if (!isApp) page = <Landing />
  else if (!session.authenticated) page = <main className="page"><Loading error="" /></main>
  else {
    const match = routes.map(([pattern, render]) => {
      const m = pattern.exec(path)
      return m ? render(m.slice(1)) : null
    }).find(Boolean)
    page = match ?? <main className="page"><h1>Không tìm thấy trang</h1></main>
  }

  return (
    <Ctx.Provider value={{ session, refresh }}>
      <div className={isApp ? 'shell' : undefined}>
        {page}
        {isApp && session.authenticated && <BottomNav path={path} />}
      </div>
    </Ctx.Provider>
  )
}
