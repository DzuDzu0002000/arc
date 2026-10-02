import { createContext, useCallback, useContext, useEffect, useState, type ReactElement } from 'react'
import { api, type Role, type SessionInfo } from './api'
import { Admin } from './pages/admin'
import { SignIn } from './pages/auth'
import { Landing } from './pages/landing'
import { Privacy, Terms } from './pages/legal'
import { CampaignDetail, Explore, ReportBug } from './pages/explore'
import { ProjectHome, ReviewQueue } from './pages/project'
import { ManageCampaign, MyProjects, NewCampaign } from './pages/projects'
import { MyBugs, MyDisputes } from './pages/tester'
import { TesterProfilePage } from './pages/tester-profile'
import { Wallet } from './pages/wallet'
import { Welcome } from './pages/welcome'
import { BugDetail } from './pages/work'
import { t } from './i18n'
import { Notices } from './notices'
import { AppNav, Link, Loading, navigate, usePath } from './ui'

type SessionContext = { session: SessionInfo | null; refresh: () => Promise<void> }
const Ctx = createContext<SessionContext>({ session: null, refresh: async () => {} })
export const useSession = () => useContext(Ctx)

const ID = '([0-9a-f-]{36})'
type Route = [RegExp, Role | 'any', (params: string[]) => ReactElement]
const routes: Route[] = [
  // Shared: both sides open campaigns and bugs, each sees the actions of its own role.
  [new RegExp(`^/app/c/${ID}/?$`), 'any', ([id]) => <CampaignDetail id={id} />],
  [new RegExp(`^/app/bugs/${ID}/?$`), 'any', ([id]) => <BugDetail id={id} />],
  [/^\/app\/wallet\/?$/, 'any', () => <Wallet />],
  [/^\/app\/admin\/?$/, 'any', () => <Admin />],
  [new RegExp(`^/app/testers/${ID}/?$`), 'any', ([id]) => <TesterProfilePage id={id} />],
  // Project: fund campaigns, review bugs, confirm payouts.
  [/^\/app\/?$/, 'project', () => <ProjectHome />],
  [/^\/app\/review\/?$/, 'project', () => <ReviewQueue />],
  [/^\/app\/projects\/?$/, 'project', () => <MyProjects />],
  [/^\/app\/projects\/new\/?$/, 'project', () => <NewCampaign />],
  [new RegExp(`^/app/projects/${ID}/?$`), 'project', ([id]) => <ManageCampaign id={id} />],
  // Tester: find campaigns, report bugs, track them, dispute rejections.
  [/^\/app\/?$/, 'tester', () => <Explore />],
  [new RegExp(`^/app/c/${ID}/report/?$`), 'tester', ([id]) => <ReportBug campaignId={id} />],
  [/^\/app\/work\/?$/, 'tester', () => <MyBugs />],
  [/^\/app\/disputes\/?$/, 'tester', () => <MyDisputes />],
]

function resolve(path: string, role: Role): ReactElement {
  let otherSide = false
  for (const [pattern, owner, render] of routes) {
    const m = pattern.exec(path)
    if (!m) continue
    if (owner === 'any' || owner === role) return render(m.slice(1))
    otherSide = true
  }
  return (
    <main className="page">
      <h1>{otherSide ? t('Trang này dành cho vai trò khác') : t('Không tìm thấy trang')}</h1>
      {otherSide && <p className="muted">{role === 'project' ? t('Tài khoản của bạn là tài khoản dự án.') : t('Tài khoản của bạn là tài khoản tester.')}</p>}
      <Link to="/app" className="btn" style={{ alignSelf: 'flex-start' }}>{t('Về trang chính')}</Link>
    </main>
  )
}

export function App() {
  const path = usePath()
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [error, setError] = useState('')
  // Bumped when the viewer switches language so the whole tree re-renders with new text.
  const [, setLangVersion] = useState(0)
  useEffect(() => {
    const onLang = () => setLangVersion((v) => v + 1)
    window.addEventListener('archunt:lang', onLang)
    return () => window.removeEventListener('archunt:lang', onLang)
  }, [])

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
  const role = session?.authenticated ? session.account.role : null
  useEffect(() => {
    if (!session) return
    if (isApp && !session.authenticated) navigate(`/auth?next=${encodeURIComponent(path)}`)
    else if (isApp && session.authenticated && !role && path !== '/app/welcome') navigate('/app/welcome')
  }, [session, isApp, path, role])

  if (!session) return <main className="page"><Loading error={error} onRetry={refresh} /></main>

  let page: ReactElement
  if (path === '/auth') page = <SignIn />
  else if (path === '/privacy') page = <Privacy />
  else if (path === '/terms') page = <Terms />
  else if (!isApp) page = <Landing />
  else if (!session.authenticated) page = <main className="page"><Loading error="" /></main>
  else if (!role) page = <Welcome />
  else page = resolve(path, role)

  const showNav = isApp && session.authenticated && role
  return (
    <Ctx.Provider value={{ session, refresh }}>
      <div className={showNav ? 'shell' : undefined}>
        {page}
        {showNav && <AppNav path={path} role={role} isAdmin={session.isAdmin} notices={<Notices />} />}
      </div>
    </Ctx.Provider>
  )
}
