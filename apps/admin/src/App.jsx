import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Headphones,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatRoleLabel, resolveAdminAccess } from './lib/adminAccess'
import { loadAdminProfile, loadDashboardSnapshot, searchPlatform } from './lib/adminData'
import { getSupabaseConfigStatus, isSupabaseConfigured, supabase } from './lib/supabaseClient'

const VIEWS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'service', label: 'Service Desk', icon: Headphones },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'health', label: 'Platform Health', icon: Activity },
]

const EMPTY_SNAPSHOT = {
  metrics: [
    { label: 'Open tickets', value: 0 },
    { label: 'Recent transactions', value: 0 },
    { label: 'Customer records', value: 0 },
    { label: 'Audit events', value: 0 },
  ],
  tickets: [],
  transactions: [],
  customers: [],
  activities: [],
  warnings: [],
}

function statusClass(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('urgent') || normalized.includes('high') || normalized.includes('blocked')) return 'danger'
  if (normalized.includes('pending') || normalized.includes('open') || normalized.includes('review')) return 'warning'
  if (normalized.includes('closed') || normalized.includes('complete') || normalized.includes('logged')) return 'success'
  return 'neutral'
}

function LoginScreen({ authError, onSignIn, onMagicLink }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const configStatus = getSupabaseConfigStatus()

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    await onSignIn({ email, password })
    setIsSubmitting(false)
  }

  async function handleMagicLink() {
    setIsSubmitting(true)
    await onMagicLink({ email })
    setIsSubmitting(false)
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand-mark" aria-hidden="true">
          9
        </div>
        <div>
          <p className="eyebrow">Bridge Nine</p>
          <h1>Admin</h1>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@bridgenine.co.za"
              type="email"
              value={email}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type="password"
              value={password}
            />
          </label>

          {authError ? (
            <div className="notice danger">
              <AlertTriangle size={16} />
              <span>{authError}</span>
            </div>
          ) : null}

          {!configStatus.ok ? (
            <div className="notice warning">
              <AlertTriangle size={16} />
              <span>{configStatus.message}</span>
            </div>
          ) : null}

          <button className="primary-button" disabled={!isSupabaseConfigured || isSubmitting} type="submit">
            <ShieldCheck size={18} />
            <span>{isSubmitting ? 'Signing in...' : 'Sign in'}</span>
          </button>
          <button
            className="secondary-button"
            disabled={!isSupabaseConfigured || !email || isSubmitting}
            onClick={handleMagicLink}
            type="button"
          >
            Send magic link
          </button>
        </form>
      </section>
    </main>
  )
}

function Sidebar({ activeView, onViewChange, profile, roles, onSignOut }) {
  const roleLabel = roles.length ? formatRoleLabel(roles[0]) : 'Internal Staff'
  const name = profile?.full_name || profile?.name || profile?.email || 'Admin user'

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark small" aria-hidden="true">
          9
        </div>
        <div>
          <strong>Bridge Admin</strong>
          <span>{roleLabel}</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Admin views">
        {VIEWS.map((view) => {
          const Icon = view.icon
          return (
            <button
              className={activeView === view.id ? 'active' : ''}
              key={view.id}
              onClick={() => onViewChange(view.id)}
              title={view.label}
              type="button"
            >
              <Icon size={18} />
              <span>{view.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-user">
        <div>
          <strong>{name}</strong>
          <span>{profile?.email || 'Signed in'}</span>
        </div>
        <button className="icon-button" onClick={onSignOut} title="Sign out" type="button">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  )
}

function Topbar({ activeView, onRefresh, isLoading }) {
  const view = VIEWS.find((item) => item.id === activeView) || VIEWS[0]

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Internal operations</p>
        <h1>{view.label}</h1>
      </div>
      <button className="secondary-button compact" disabled={isLoading} onClick={onRefresh} type="button">
        <RefreshCw className={isLoading ? 'spin' : ''} size={16} />
        <span>Refresh</span>
      </button>
    </header>
  )
}

function MetricGrid({ metrics }) {
  return (
    <section className="metric-grid" aria-label="Admin metrics">
      {metrics.map((metric) => (
        <article className="metric-card" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </article>
      ))}
    </section>
  )
}

function RecordList({ emptyLabel, icon: Icon = CircleDot, items, title }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span>{items.length}</span>
      </div>
      <div className="record-list">
        {items.length ? (
          items.map((item) => (
            <article className="record-row" key={item.id || `${item.title}-${item.time}`}>
              <div className="record-icon">
                <Icon size={17} />
              </div>
              <div className="record-main">
                <strong>{item.title}</strong>
                <span>{item.meta}</span>
              </div>
              <div className="record-meta">
                <span className={`pill ${statusClass(item.priority || item.status)}`}>{item.priority || item.status}</span>
                <time>{item.time}</time>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">{emptyLabel}</div>
        )}
      </div>
    </section>
  )
}

function WarningStrip({ warnings }) {
  if (!warnings.length) {
    return (
      <div className="notice success">
        <CheckCircle2 size={16} />
        <span>Connected checks completed.</span>
      </div>
    )
  }

  return (
    <div className="warning-stack">
      {warnings.map((warning) => (
        <div className="notice warning" key={`${warning.label}-${warning.message}`}>
          <AlertTriangle size={16} />
          <span>
            {warning.label}: {warning.message}
          </span>
        </div>
      ))}
    </div>
  )
}

function DashboardView({ snapshot }) {
  return (
    <>
      <MetricGrid metrics={snapshot.metrics} />
      <div className="content-grid">
        <RecordList emptyLabel="No support tickets found." icon={Ticket} items={snapshot.tickets} title="Service Desk" />
        <RecordList emptyLabel="No recent transactions found." items={snapshot.transactions} title="Transactions" />
      </div>
    </>
  )
}

function ServiceDeskView({ snapshot }) {
  return (
    <div className="single-column">
      <RecordList emptyLabel="No support tickets found." icon={Ticket} items={snapshot.tickets} title="Support Queue" />
    </div>
  )
}

function SearchView() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ customers: [], transactions: [], warnings: [] })
  const [isSearching, setIsSearching] = useState(false)

  async function handleSearch(event) {
    event.preventDefault()
    setIsSearching(true)
    setResults(await searchPlatform(query))
    setIsSearching(false)
  }

  return (
    <div className="single-column">
      <form className="search-form" onSubmit={handleSearch}>
        <Search size={18} />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, email, transaction reference"
          value={query}
        />
        <button className="primary-button compact" disabled={isSearching || !query.trim()} type="submit">
          Search
        </button>
      </form>
      <WarningStrip warnings={results.warnings} />
      <div className="content-grid">
        <RecordList emptyLabel="No customers found." icon={Users} items={results.customers} title="Customers" />
        <RecordList emptyLabel="No transactions found." items={results.transactions} title="Transactions" />
      </div>
    </div>
  )
}

function HealthView({ snapshot }) {
  const healthItems = useMemo(
    () => [
      {
        id: 'supabase',
        title: 'Supabase',
        meta: getSupabaseConfigStatus().message,
        status: isSupabaseConfigured ? 'connected' : 'attention',
        time: 'Live',
      },
      {
        id: 'tickets',
        title: 'Support queue',
        meta: `${snapshot.tickets.length} recent ticket records loaded`,
        status: snapshot.tickets.length ? 'active' : 'quiet',
        time: 'Now',
      },
      {
        id: 'activity',
        title: 'Audit activity',
        meta: `${snapshot.activities.length} recent audit records loaded`,
        status: snapshot.activities.length ? 'logged' : 'quiet',
        time: 'Now',
      },
    ],
    [snapshot],
  )

  return (
    <div className="single-column">
      <WarningStrip warnings={snapshot.warnings} />
      <RecordList emptyLabel="No health checks available." icon={Activity} items={healthItems} title="System Checks" />
      <RecordList emptyLabel="No recent activity found." icon={CircleDot} items={snapshot.activities} title="Activity" />
    </div>
  )
}

function UnauthorizedScreen({ roles, onSignOut }) {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="notice danger">
          <ShieldCheck size={17} />
          <span>Admin access is required.</span>
        </div>
        <div>
          <p className="eyebrow">Detected roles</p>
          <h1>{roles.length ? roles.map(formatRoleLabel).join(', ') : 'None'}</h1>
        </div>
        <button className="secondary-button" onClick={onSignOut} type="button">
          <LogOut size={18} />
          <span>Sign out</span>
        </button>
      </section>
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [access, setAccess] = useState({ allowed: false, roles: [] })
  const [activeView, setActiveView] = useState('dashboard')
  const [authError, setAuthError] = useState('')
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [isBooting, setIsBooting] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  async function refreshData() {
    if (!session?.user) return
    setIsLoading(true)
    setSnapshot(await loadDashboardSnapshot())
    setIsLoading(false)
  }

  useEffect(() => {
    let isMounted = true

    async function boot() {
      if (!supabase) {
        setIsBooting(false)
        return
      }

      const { data } = await supabase.auth.getSession()
      if (isMounted) setSession(data.session || null)

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession)
        setAuthError('')
      })

      setIsBooting(false)
      return () => subscription.unsubscribe()
    }

    const cleanupPromise = boot()
    return () => {
      isMounted = false
      cleanupPromise.then((cleanup) => {
        if (typeof cleanup === 'function') cleanup()
      })
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function resolveAccess() {
      if (!session?.user) {
        setProfile(null)
        setAccess({ allowed: false, roles: [] })
        setSnapshot(EMPTY_SNAPSHOT)
        return
      }

      const nextProfile = await loadAdminProfile(session.user.id)
      if (cancelled) return
      const nextAccess = resolveAdminAccess({ user: session.user, profile: nextProfile })
      setProfile(nextProfile || { email: session.user.email })
      setAccess(nextAccess)
      if (nextAccess.allowed) {
        setIsLoading(true)
        setSnapshot(await loadDashboardSnapshot())
        setIsLoading(false)
      }
    }

    resolveAccess()
    return () => {
      cancelled = true
    }
  }, [session])

  async function handleSignIn({ email, password }) {
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
  }

  async function handleMagicLink({ email }) {
    setAuthError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    setAuthError(error ? error.message : 'Magic link sent.')
  }

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut()
    setSession(null)
  }

  if (isBooting) {
    return (
      <main className="loading-shell">
        <RefreshCw className="spin" size={24} />
      </main>
    )
  }

  if (!session) {
    return <LoginScreen authError={authError} onMagicLink={handleMagicLink} onSignIn={handleSignIn} />
  }

  if (!access.allowed) {
    return <UnauthorizedScreen onSignOut={handleSignOut} roles={access.roles} />
  }

  return (
    <div className="admin-shell">
      <Sidebar
        activeView={activeView}
        onSignOut={handleSignOut}
        onViewChange={setActiveView}
        profile={profile}
        roles={access.roles}
      />
      <main className="admin-main">
        <Topbar activeView={activeView} isLoading={isLoading} onRefresh={refreshData} />
        {activeView === 'dashboard' ? <DashboardView snapshot={snapshot} /> : null}
        {activeView === 'service' ? <ServiceDeskView snapshot={snapshot} /> : null}
        {activeView === 'search' ? <SearchView /> : null}
        {activeView === 'health' ? <HealthView snapshot={snapshot} /> : null}
      </main>
    </div>
  )
}
