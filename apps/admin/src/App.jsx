import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Ban,
  Building2,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  CircleDot,
  CreditCard,
  Database,
  FileText,
  Headphones,
  Home,
  LineChart,
  Lock,
  LogOut,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ADMIN_LEVELS, formatAdminLevelLabel, formatRoleLabel, resolveAdminAccess } from './lib/adminAccess'
import {
  archiveAdminLegalTemplate,
  loadAdminProfile,
  loadAdminLegalTemplateGovernance,
  loadDashboardSnapshot,
  loadLegalTemplateBridgeReadiness,
  loadLegalTemplateRegistry,
  publishAdminLegalTemplate,
  restoreAdminLegalTemplateVersion,
  saveAdminLegalTemplate,
  searchPlatform,
  setAdminLegalTemplateDefault,
  uploadAdminLegalTemplateAsset,
} from './lib/adminData'
import { getSupabaseConfigStatus, isSupabaseConfigured, supabase } from './lib/supabaseClient'

const DATE_RANGES = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: '90d', label: '90 Days' },
  { id: 'ytd', label: 'YTD' },
  { id: 'custom', label: 'Custom' },
]

const NAV_GROUPS = [
  {
    label: 'Executive',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: Home, levels: [ADMIN_LEVELS.EXECUTIVE] },
      { id: 'growth', label: 'Growth', icon: LineChart, levels: [ADMIN_LEVELS.EXECUTIVE] },
      { id: 'revenue', label: 'Revenue', icon: CircleDollarSign, levels: [ADMIN_LEVELS.EXECUTIVE] },
      { id: 'ecosystem', label: 'Ecosystem', icon: Users, levels: [ADMIN_LEVELS.EXECUTIVE] },
      { id: 'health', label: 'Platform Health', icon: Activity, levels: [ADMIN_LEVELS.EXECUTIVE] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'organisations', label: 'Organisations', icon: Building2, levels: [ADMIN_LEVELS.EXECUTIVE] },
      { id: 'legalTemplates', label: 'Legal Templates', icon: FileText, levels: [ADMIN_LEVELS.EXECUTIVE] },
      { id: 'roleplayers', label: 'Roleplayers', icon: UserCog, levels: [ADMIN_LEVELS.EXECUTIVE] },
      { id: 'users', label: 'Users', icon: Users, levels: [ADMIN_LEVELS.EXECUTIVE] },
      { id: 'transactions', label: 'Transactions', icon: Database, levels: [ADMIN_LEVELS.EXECUTIVE] },
      { id: 'service', label: 'Service Desk', icon: Headphones, levels: [ADMIN_LEVELS.EXECUTIVE, ADMIN_LEVELS.CUSTOMER_SUPPORT] },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'audit', label: 'Audit Log', icon: ShieldCheck, levels: [ADMIN_LEVELS.EXECUTIVE] },
      { id: 'search', label: 'Search', icon: Search, levels: [ADMIN_LEVELS.EXECUTIVE, ADMIN_LEVELS.CUSTOMER_SUPPORT] },
      { id: 'settings', label: 'Settings', icon: Settings, levels: [ADMIN_LEVELS.EXECUTIVE] },
    ],
  },
]

const ALL_VIEWS = NAV_GROUPS.flatMap((group) => group.items)

const MOBILE_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, path: '/admin' },
  { id: 'roleplayers', label: 'Roleplayers', icon: UserCog, path: '/admin/roleplayers' },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle, path: '/admin/alerts' },
  { id: 'search', label: 'Search', icon: Search, path: '/admin/search' },
  { id: 'more', label: 'More', icon: MoreVertical, path: '/admin/more' },
]

const EMPTY_SNAPSHOT = {
  activities: [],
  attention: [],
  customers: [],
  ecosystem: { hasData: false, metrics: [], total: 0 },
  financials: { forecast: [], hasData: false, revenueSources: [], revenueTrend: [] },
  growth: { hasData: false, mostActiveOrganisations: [], organisationTrend: [], userAdoption: {} },
  kpis: [],
  metrics: [],
  organisations: [],
  platformHealth: {
    hasData: false,
    stageDistribution: [],
    transactionFunnel: [],
    velocity: { hasData: false, trend: [] },
  },
  roleplayers: [],
  tickets: [],
  transactions: [],
  users: [],
  warnings: [],
}

function statusClass(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('urgent') || normalized.includes('high') || normalized.includes('blocked')) return 'danger'
  if (normalized.includes('pending') || normalized.includes('open') || normalized.includes('review')) return 'warning'
  if (normalized.includes('closed') || normalized.includes('complete') || normalized.includes('logged')) return 'success'
  return 'neutral'
}

function formatCount(value) {
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(Number(value) || 0)
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 767px)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const query = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return isMobile
}

function viewFromPath(level = '', isMobile = false) {
  if (typeof window === 'undefined') return getDefaultView(level)
  const path = window.location.pathname
  if (isMobile) {
    if (path.includes('/admin/roleplayers')) return 'roleplayers'
    if (path.includes('/admin/legal-templates')) return 'legalTemplates'
    if (path.includes('/admin/alerts')) return 'alerts'
    if (path.includes('/admin/search')) return 'search'
    if (path.includes('/admin/more')) return 'more'
    return 'dashboard'
  }
  if (path.includes('/admin/roleplayers')) return 'roleplayers'
  if (path.includes('/admin/legal-templates')) return 'legalTemplates'
  if (path.includes('/admin/search')) return 'search'
  return getDefaultView(level)
}

function pushAdminPath(path) {
  if (typeof window !== 'undefined' && window.history?.pushState) {
    window.history.pushState({}, '', path)
  }
}

function adminPathForView(viewId = '') {
  if (viewId === 'roleplayers') return '/admin/roleplayers'
  if (viewId === 'legalTemplates') return '/admin/legal-templates'
  if (viewId === 'search') return '/admin/search'
  return '/admin'
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
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            9
          </div>
          <div>
            <p className="eyebrow">Arch9 HQ</p>
            <h1>Admin</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@arch9.co.za"
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

function getAllowedGroups(level = '') {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((view) => view.levels.includes(level)),
  })).filter((group) => group.items.length)
}

function getAllowedViews(level = '') {
  return ALL_VIEWS.filter((view) => view.levels.includes(level))
}

function getDefaultView(level = '') {
  return getAllowedViews(level)[0]?.id || 'service'
}

function Sidebar({ activeView, allowedGroups, level, onViewChange, profile, onSignOut }) {
  const roleLabel = formatAdminLevelLabel(level)
  const name = profile?.full_name || profile?.name || profile?.email || 'Admin user'

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark small" aria-hidden="true">
          9
        </div>
        <strong>ARCH9</strong>
      </div>

      <div className="admin-identity">
        <div className="brand-mark mini" aria-hidden="true">
          9
        </div>
        <div>
          <strong>Bridge Admin</strong>
          <span>{roleLabel}</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Admin views">
        {allowedGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map((view) => {
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
          </div>
        ))}
      </nav>

      <div className="sidebar-user">
        <div>
          <strong>{name}</strong>
          <span>{profile?.email || 'Signed in'}</span>
        </div>
        <button className="icon-button light" onClick={onSignOut} title="Sign out" type="button">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  )
}

function Topbar({ activeView, dateRange, isLoading, onDateRangeChange, onRefresh }) {
  const view = ALL_VIEWS.find((item) => item.id === activeView)
  const isExecutivePage = ['dashboard', 'growth', 'revenue', 'ecosystem', 'health'].includes(activeView)

  return (
    <header className="topbar">
      <div>
        <h1>{isExecutivePage ? 'Executive Dashboard' : view?.label || 'Executive Dashboard'}</h1>
        <p>CEO Command Centre</p>
      </div>
      <div className="topbar-actions">
        <label className="range-select">
          <Calendar size={16} />
          <select onChange={(event) => onDateRangeChange(event.target.value)} value={dateRange}>
            {DATE_RANGES.map((range) => (
              <option key={range.id} value={range.id}>
                {range.label}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button compact" disabled={isLoading} onClick={onRefresh} type="button">
          <RefreshCw className={isLoading ? 'spin' : ''} size={16} />
          <span>Refresh</span>
        </button>
      </div>
    </header>
  )
}

function EmptyData({ compact = false }) {
  return (
    <div className={compact ? 'empty-data compact' : 'empty-data'}>
      <strong>No data available yet.</strong>
      <span>Data will populate as organisations and transactions are onboarded.</span>
    </div>
  )
}

function ExecutiveKpiRow({ kpis }) {
  return (
    <section className="executive-kpi-row" aria-label="Executive KPIs">
      {kpis.map((metric) => (
        <article className="executive-kpi-card" key={metric.label}>
          <div className={`kpi-icon ${metric.accent || 'green'}`}>
            {metric.label.includes('Revenue') ? (
              <CircleDollarSign size={20} />
            ) : metric.label.includes('Organisation') ? (
              <Building2 size={20} />
            ) : metric.label.includes('User') ? (
              <Users size={20} />
            ) : metric.label.includes('Pipeline') ? (
              <LineChart size={20} />
            ) : (
              <BarChart3 size={20} />
            )}
          </div>
          <div>
            <span className="card-label">{metric.label}</span>
            {metric.hasData ? (
              <>
                <strong>{metric.value}</strong>
                {metric.change ? <em>{metric.change}</em> : null}
              </>
            ) : (
              <EmptyData compact />
            )}
          </div>
          {metric.hasData && metric.breakdown?.length ? (
            <div className="kpi-breakdown">
              {metric.breakdown.map((item) => (
                <span key={item.label}>
                  <small>{item.label}</small>
                  <b>{typeof item.value === 'number' ? formatCount(item.value) : item.value}</b>
                </span>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </section>
  )
}

function SectionTitle({ kicker, title }) {
  return (
    <div className="section-title">
      {kicker ? <p>{kicker}</p> : null}
      <h2>{title}</h2>
    </div>
  )
}

function FunnelChart({ data = [] }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  const first = data[0]?.value || 0

  if (!data.some((item) => item.value > 0)) return <EmptyData />

  return (
    <div className="funnel-chart">
      {data.map((item, index) => {
        const width = Math.max(28, (item.value / max) * 100)
        const conversion = index === 0 || !first ? 100 : Math.round((item.value / first) * 100)
        return (
          <div className="funnel-row" key={item.label}>
            <span>{item.label}</span>
            <div className="funnel-track">
              <div className="funnel-bar" style={{ width: `${width}%` }}>
                {formatCount(item.value)}
              </div>
            </div>
            <strong>{conversion}%</strong>
          </div>
        )
      })}
    </div>
  )
}

function DonutChart({ centerLabel = '', centerValue = '', data = [] }) {
  const colors = ['#2563eb', '#0f8f55', '#f3b51b', '#8b5cf6', '#14b8a6', '#94a3b8']
  const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0)
  let cursor = 0
  const gradient = total
    ? data
        .map((item, index) => {
          const start = cursor
          const end = cursor + (item.value / total) * 100
          cursor = end
          return `${colors[index % colors.length]} ${start}% ${end}%`
        })
        .join(', ')
    : '#eef2f3 0% 100%'

  if (!total) return <EmptyData />

  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${gradient})` }}>
        <div>
          <strong>{centerValue || formatCount(total)}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <div className="donut-legend">
        {data.map((item, index) => (
          <span key={item.label}>
            <i style={{ background: colors[index % colors.length] }} />
            {item.label}
            <b>{Math.round((item.value / total) * 100)}%</b>
          </span>
        ))}
      </div>
    </div>
  )
}

function MiniLineChart({ data = [], tone = 'green' }) {
  const values = data.map((item) => Number(item.value) || 0)
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const spread = Math.max(max - min, 1)
  const points = values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100
      const y = 80 - ((value - min) / spread) * 60
      return `${x},${y}`
    })
    .join(' ')

  if (!values.some((value) => value > 0)) return <EmptyData compact />

  return (
    <svg className={`mini-line ${tone}`} role="img" viewBox="0 0 100 88" preserveAspectRatio="none">
      <polyline fill="none" points={points} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      {data.map((item, index) => {
        const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100
        const y = 80 - (((Number(item.value) || 0) - min) / spread) * 60
        return <circle cx={x} cy={y} fill="currentColor" key={`${item.label}-${index}`} r="2.5" />
      })}
    </svg>
  )
}

function PlatformHealthSection({ health }) {
  return (
    <section className="section-block">
      <SectionTitle title="Platform Health" />
      <div className="platform-grid">
        <article className="panel chart-panel">
          <h3>Transaction Funnel</h3>
          <FunnelChart data={health.transactionFunnel} />
        </article>
        <article className="panel chart-panel">
          <h3>Transaction Stage Distribution</h3>
          <DonutChart centerLabel="In Progress" data={health.stageDistribution} />
        </article>
        <article className="panel chart-panel velocity-panel">
          <h3>Registration Velocity</h3>
          {health.velocity?.hasData ? (
            <>
              <span className="metric-caption">Average Registration Time</span>
              <strong className="velocity-number">{health.velocity.averageDays} days</strong>
              <em className={health.velocity.deltaDays <= 0 ? 'positive' : 'negative'}>
                {health.velocity.deltaDays <= 0 ? 'Down' : 'Up'} {Math.abs(health.velocity.deltaDays)} days
              </em>
              <MiniLineChart data={health.velocity.trend} />
            </>
          ) : (
            <EmptyData />
          )}
        </article>
      </div>
    </section>
  )
}

function GrowthSection({ growth }) {
  return (
    <section className="section-block">
      <SectionTitle title="Growth" />
      <div className="growth-grid">
        <article className="panel chart-panel">
          <h3>New Organisations</h3>
          <MiniLineChart data={growth.organisationTrend} />
          <div className="axis-labels">
            {(growth.organisationTrend || []).map((item) => (
              <span key={item.label}>{item.label}</span>
            ))}
          </div>
        </article>
        <article className="panel chart-panel">
          <h3>User Adoption</h3>
          {growth.userAdoption?.hasData ? (
            <div className="adoption-stack">
              <div>
                <span>DAU</span>
                <strong>{formatCount(growth.userAdoption.dau)}</strong>
              </div>
              <div>
                <span>WAU</span>
                <strong>{formatCount(growth.userAdoption.wau)}</strong>
              </div>
              <div>
                <span>MAU</span>
                <strong>{formatCount(growth.userAdoption.mau)}</strong>
              </div>
              <div className="stickiness">
                <span>DAU / MAU</span>
                <strong>{growth.userAdoption.ratio}%</strong>
              </div>
            </div>
          ) : (
            <EmptyData />
          )}
        </article>
        <article className="panel chart-panel">
          <h3>Most Active Organisations</h3>
          {growth.mostActiveOrganisations?.length ? (
            <div className="rank-list">
              {growth.mostActiveOrganisations.map((item, index) => (
                <div key={item.id}>
                  <b>{index + 1}</b>
                  <span>{item.name}</span>
                  <small>
                    {item.users} users / {item.transactions} transactions
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyData />
          )}
        </article>
      </div>
    </section>
  )
}

function FinancialSection({ financials }) {
  return (
    <section className="section-block">
      <SectionTitle title="Financial Overview" />
      <div className="financial-grid">
        <article className="panel chart-panel">
          <h3>Revenue Sources</h3>
          <DonutChart centerLabel="Revenue" data={financials.revenueSources} />
        </article>
        <article className="panel chart-panel">
          <h3>Revenue Forecast</h3>
          {financials.hasData ? (
            <div className="forecast-list">
              {financials.forecast.map((item) => (
                <span key={item.label}>
                  {item.label}
                  <b>{item.value}</b>
                </span>
              ))}
            </div>
          ) : (
            <EmptyData />
          )}
        </article>
        <article className="panel chart-panel">
          <h3>Revenue Per Organisation</h3>
          {financials.hasData ? (
            <>
              <span className="metric-caption">Average Revenue Per Org</span>
              <strong className="revenue-number">{financials.revenuePerOrganisation}</strong>
              <MiniLineChart data={financials.revenueTrend} />
            </>
          ) : (
            <EmptyData />
          )}
        </article>
      </div>
    </section>
  )
}

function AttentionSection({ attention }) {
  return (
    <section className="section-block attention-grid">
      <article className="panel chart-panel">
        <h3>Attention Required</h3>
        {attention.length ? (
          <div className="attention-list">
            {attention.map((item) => (
              <div className={item.severity} key={item.id}>
                <AlertTriangle size={18} />
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
                <em>{item.time}</em>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-data calm">
            <CheckCircle2 size={20} />
            <strong>No anomalies detected.</strong>
            <span>Executive rules are watching inactivity, stalled work, trial expiry and usage drops.</span>
          </div>
        )}
      </article>
    </section>
  )
}

function EcosystemSection({ ecosystem }) {
  return (
    <section className="section-block">
      <SectionTitle title="Ecosystem Overview" />
      <article className="panel ecosystem-panel">
        {ecosystem.hasData ? (
          <>
            <div className="ecosystem-grid">
              {ecosystem.metrics.map((item) => (
                <div key={item.label}>
                  <Users size={20} />
                  <span>{item.label}</span>
                  <strong>{formatCount(item.value)}</strong>
                </div>
              ))}
            </div>
            <div className="ecosystem-total">
              <span>Total Ecosystem Participants</span>
              <strong>{formatCount(ecosystem.total)}</strong>
              {ecosystem.change ? <em>{ecosystem.change} this period</em> : null}
            </div>
          </>
        ) : (
          <EmptyData />
        )}
      </article>
    </section>
  )
}

function ExecutiveDashboardView({ snapshot }) {
  return (
    <>
      <ExecutiveKpiRow kpis={snapshot.kpis} />
      <PlatformHealthSection health={snapshot.platformHealth} />
      <div className="split-sections">
        <GrowthSection growth={snapshot.growth} />
        <FinancialSection financials={snapshot.financials} />
      </div>
      <div className="bottom-sections">
        <AttentionSection attention={snapshot.attention} />
        <EcosystemSection ecosystem={snapshot.ecosystem} />
      </div>
    </>
  )
}

function RecordList({ emptyLabel, icon: Icon = CircleDot, items = [], title }) {
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

function WarningStrip({ warnings = [] }) {
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
        meta: getSupabaseConfigStatus().message,
        status: isSupabaseConfigured ? 'connected' : 'attention',
        time: 'Live',
        title: 'Supabase',
      },
      {
        id: 'tickets',
        meta: `${snapshot.tickets.length} recent ticket records loaded`,
        status: snapshot.tickets.length ? 'active' : 'quiet',
        time: 'Now',
        title: 'Support queue',
      },
      {
        id: 'activity',
        meta: `${snapshot.activities.length} recent audit records loaded`,
        status: snapshot.activities.length ? 'logged' : 'quiet',
        time: 'Now',
        title: 'Audit activity',
      },
    ],
    [snapshot],
  )

  return (
    <div className="single-column">
      <WarningStrip warnings={snapshot.warnings} />
      <PlatformHealthSection health={snapshot.platformHealth} />
      <RecordList emptyLabel="No health checks available." icon={Activity} items={healthItems} title="System Checks" />
      <RecordList emptyLabel="No recent activity found." icon={CircleDot} items={snapshot.activities} title="Activity" />
    </div>
  )
}

const ROLEPLAYER_FILTERS = ['All', 'Agencies', 'Attorneys', 'Bond Originators', 'Developers', 'Insurance Partners', 'Banks', 'Other']
const ROLEPLAYER_SORTS = ['Most Active', 'Highest Revenue', 'Most Transactions', 'Newest', 'Needs Attention', 'A-Z']

function roleplayerFilterMatches(roleplayer, filter) {
  if (filter === 'All') return true
  const pluralType = roleplayer.type === 'Agency' ? 'Agencies' : `${roleplayer.type}s`
  return pluralType === filter || roleplayer.type === filter.replace(/s$/, '')
}

function roleplayerTypeClass(value = '') {
  return value.toLowerCase().replace(/\s+/g, '-')
}

function RoleplayerLogo({ roleplayer, size = 'large' }) {
  return roleplayer.logoUrl ? (
    <img alt="" className={`roleplayer-logo ${size}`} src={roleplayer.logoUrl} />
  ) : (
    <div className={`roleplayer-logo fallback ${size}`} aria-hidden="true">
      {roleplayer.initials}
    </div>
  )
}

function RoleplayerCard({ isSelected, onSelect, roleplayer }) {
  return (
    <article className={isSelected ? 'roleplayer-card selected' : 'roleplayer-card'} onClick={onSelect}>
      <div className="roleplayer-card-top">
        <RoleplayerLogo roleplayer={roleplayer} />
        <div>
          <h3>{roleplayer.name}</h3>
          <span className={`type-badge ${roleplayerTypeClass(roleplayer.type)}`}>{roleplayer.type}</span>
        </div>
        <details className="card-actions" onClick={(event) => event.stopPropagation()}>
          <summary aria-label={`Actions for ${roleplayer.name}`}>
            <MoreVertical size={18} />
          </summary>
          <div>
            <button type="button">View Workspace</button>
            <button type="button">Manage Users</button>
            <button type="button">View Transactions</button>
            <button type="button">View Billing</button>
            <button className="danger" type="button">
              Suspend Organisation
            </button>
          </div>
        </details>
      </div>
      <div className="roleplayer-kpis">
        <span>
          <Users size={16} />
          <b>{formatCount(roleplayer.userCount)}</b>
          <small>Users</small>
        </span>
        <span>
          <Database size={16} />
          <b>{formatCount(roleplayer.activeWorkload)}</b>
          <small>{roleplayer.activeWorkloadLabel}</small>
        </span>
      </div>
      <div className="roleplayer-revenue">
        <strong>{roleplayer.revenueDisplay}</strong>
        <span>Revenue This Month</span>
      </div>
      <div className="roleplayer-footer">
        <span className={`health-dot ${roleplayer.health.tone}`}>Health: {roleplayer.health.label}</span>
        <span>Last activity: {roleplayer.lastActivity}</span>
      </div>
    </article>
  )
}

function WorkspaceMetric({ label, value }) {
  return (
    <div className="workspace-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function RoleplayerWorkspace({ onClose, roleplayer }) {
  if (!roleplayer) {
    return (
      <aside className="roleplayer-workspace empty">
        <EmptyData />
      </aside>
    )
  }

  return (
    <aside className="roleplayer-workspace">
      <div className="workspace-topbar">
        <button className="text-button" onClick={onClose} type="button">
          <ArrowLeft size={16} />
          Back to Roleplayers
        </button>
        <button className="icon-button" onClick={onClose} title="Close workspace" type="button">
          <X size={17} />
        </button>
      </div>

      <section className="workspace-hero">
        <RoleplayerLogo roleplayer={roleplayer} size="workspace" />
        <div>
          <h2>{roleplayer.name}</h2>
          <span className={`type-badge ${roleplayerTypeClass(roleplayer.type)}`}>{roleplayer.type}</span>
          <p>
            <span className={`status-dot ${roleplayer.health.tone}`} />
            {roleplayer.status}
          </p>
          <small>Joined: {roleplayer.joinedDate}</small>
          <small>Organisation ID: {roleplayer.organisationId}</small>
          <small>Plan: {roleplayer.subscriptionPlan}</small>
        </div>
      </section>

      <div className="workspace-actions">
        <button className="secondary-button compact" type="button">
          <UserCog size={15} />
          Manage Users
        </button>
        <button className="secondary-button compact" type="button">
          <ShieldCheck size={15} />
          Permissions
        </button>
        <button className="secondary-button compact" type="button">
          <CreditCard size={15} />
          Billing
        </button>
        <button className="secondary-button compact danger" type="button">
          <Ban size={15} />
          Suspend Access
        </button>
      </div>

      <section className="workspace-section">
        <div className="workspace-heading">
          <h3>Overview</h3>
          <button className="text-button success" type="button">
            View Full Dashboard
          </button>
        </div>
        <div className="workspace-metrics">
          <WorkspaceMetric label="Users" value={formatCount(roleplayer.userCount)} />
          <WorkspaceMetric label={roleplayer.activeWorkloadLabel} value={formatCount(roleplayer.activeWorkload)} />
          <WorkspaceMetric label="Active Transactions" value={formatCount(roleplayer.transactions.length)} />
          <WorkspaceMetric label="Revenue This Month" value={roleplayer.revenueDisplay} />
          <WorkspaceMetric label="Open Issues" value={formatCount(roleplayer.openIssues)} />
          <WorkspaceMetric label="Last Activity" value={roleplayer.lastActivity} />
        </div>
      </section>

      <section className="workspace-section">
        <div className="workspace-heading">
          <h3>Recent Activity</h3>
          <button className="text-button success" type="button">
            View All Activity
          </button>
        </div>
        <div className="activity-feed">
          {roleplayer.activityFeed.length ? (
            roleplayer.activityFeed.map((item) => (
              <div key={item.id}>
                <FileText size={16} />
                <span>{item.text}</span>
                <time>{item.time}</time>
              </div>
            ))
          ) : (
            <EmptyData compact />
          )}
        </div>
      </section>

      <section className="workspace-section">
        <h3>Workspaces</h3>
        <div className="workspace-card-grid">
          {roleplayer.workspaceCards.map((card) => (
            <button key={card.label} type="button">
              <FileText size={18} />
              <strong>{card.label}</strong>
              <span>
                {typeof card.value === 'number' ? formatCount(card.value) : card.value} {card.meta}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="workspace-section">
        <h3>Users</h3>
        <div className="mini-table">
          {roleplayer.users.length ? (
            roleplayer.users.slice(0, 5).map((user) => (
              <div key={user.id}>
                <span>{user.name}</span>
                <small>{user.role}</small>
                <small>{user.lastLogin}</small>
              </div>
            ))
          ) : (
            <EmptyData compact />
          )}
        </div>
      </section>

      <section className="workspace-section">
        <h3>Quick Actions</h3>
        <div className="quick-actions">
          <button type="button">View All Transactions</button>
          <button type="button">View All Matters</button>
          <button type="button">View Applications</button>
          <button type="button">Audit Log</button>
        </div>
      </section>
    </aside>
  )
}

function RoleplayersView({ snapshot }) {
  const [activeFilter, setActiveFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('Most Active')
  const [selectedId, setSelectedId] = useState('')

  const roleplayers = snapshot.roleplayers || []
  const filteredRoleplayers = useMemo(() => {
    const search = query.trim().toLowerCase()
    return roleplayers
      .filter((roleplayer) => roleplayerFilterMatches(roleplayer, activeFilter))
      .filter((roleplayer) => {
        if (!search) return true
        return [roleplayer.name, roleplayer.type, roleplayer.organisationId, ...roleplayer.users.map((user) => `${user.name} ${user.email}`)]
          .join(' ')
          .toLowerCase()
          .includes(search)
      })
      .sort((left, right) => {
        if (sort === 'Highest Revenue') return right.revenue - left.revenue
        if (sort === 'Most Transactions') return right.transactions.length - left.transactions.length
        if (sort === 'Newest') return String(right.joinedDate).localeCompare(String(left.joinedDate))
        if (sort === 'Needs Attention') return (right.health.tone === 'danger' ? 2 : right.health.tone === 'warning' ? 1 : 0) - (left.health.tone === 'danger' ? 2 : left.health.tone === 'warning' ? 1 : 0)
        if (sort === 'A-Z') return left.name.localeCompare(right.name)
        return right.activeWorkload + right.userCount - (left.activeWorkload + left.userCount)
      })
  }, [activeFilter, query, roleplayers, sort])

  const selectedRoleplayer = roleplayers.find((roleplayer) => roleplayer.id === selectedId) || filteredRoleplayers[0]

  function selectRoleplayer(roleplayer) {
    setSelectedId(roleplayer.id)
    if (window.history?.pushState) {
      window.history.pushState({}, '', `/admin/roleplayers/${encodeURIComponent(roleplayer.id)}`)
    }
  }

  function closeWorkspace() {
    setSelectedId('')
    if (window.history?.pushState) {
      window.history.pushState({}, '', '/admin/roleplayers')
    }
  }

  return (
    <section className="roleplayers-module">
      <div className="roleplayers-header">
        <div>
          <h1>Roleplayers</h1>
          <p>Manage and monitor every organisation within the Arch9 ecosystem.</p>
        </div>
        <button className="primary-button compact" type="button">
          <Plus size={16} />
          Add Roleplayer
        </button>
      </div>

      <div className="roleplayers-toolbar">
        <label className="roleplayer-search">
          <Search size={17} />
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search organisation..." value={query} />
        </label>
        <label className="roleplayer-sort">
          <span>Sort by:</span>
          <select onChange={(event) => setSort(event.target.value)} value={sort}>
            {ROLEPLAYER_SORTS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="roleplayers-layout">
        <div className="roleplayers-list-panel panel">
          <div className="roleplayer-filter-bar">
            {ROLEPLAYER_FILTERS.map((filter) => (
              <button className={activeFilter === filter ? 'active' : ''} key={filter} onClick={() => setActiveFilter(filter)} type="button">
                {filter}
              </button>
            ))}
          </div>
          {filteredRoleplayers.length ? (
            <div className="roleplayer-grid">
              {filteredRoleplayers.map((roleplayer) => (
                <RoleplayerCard
                  isSelected={selectedRoleplayer?.id === roleplayer.id}
                  key={roleplayer.id}
                  onSelect={() => selectRoleplayer(roleplayer)}
                  roleplayer={roleplayer}
                />
              ))}
            </div>
          ) : (
            <EmptyData />
          )}
        </div>
        <RoleplayerWorkspace onClose={closeWorkspace} roleplayer={selectedRoleplayer} />
      </div>
    </section>
  )
}

function MobileHeader({ profile, snapshot, title, subtitle }) {
  const firstName = (profile?.full_name || profile?.name || profile?.email || 'Alex').split(/[ @]/)[0] || 'Alex'
  const alertCount = snapshot.attention?.length || 0
  return (
    <header className="mobile-header">
      <div>
        <p>{title || `Good morning, ${firstName}`}</p>
        <h1>{subtitle || (alertCount ? `${alertCount} items need attention.` : 'Arch9 is operating normally.')}</h1>
      </div>
      <div className="brand-mark mini" aria-hidden="true">
        9
      </div>
    </header>
  )
}

function MobileBottomNav({ activeView, onNavigate }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile admin navigation">
      {MOBILE_NAV_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <button className={activeView === item.id ? 'active' : ''} key={item.id} onClick={() => onNavigate(item.id)} type="button">
            <Icon size={19} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function MobileMetricCard({ metric }) {
  return (
    <article className="mobile-metric-card">
      <span>{metric.label}</span>
      {metric.hasData ? (
        <>
          <strong>{metric.value}</strong>
          {metric.change ? <em>{metric.change}</em> : null}
        </>
      ) : (
        <EmptyData compact />
      )}
    </article>
  )
}

function MobileKpiCarousel({ kpis = [] }) {
  const priority = ['Transactions In Progress', 'Monthly Revenue', 'Registrations This Month', 'Active Organisations', 'Active Users']
  const cards = priority.map((label) => kpis.find((metric) => metric.label === label)).filter(Boolean)
  return (
    <section className="mobile-kpi-carousel" aria-label="Executive KPIs">
      {cards.map((metric) => (
        <MobileMetricCard key={metric.label} metric={metric} />
      ))}
    </section>
  )
}

function MobileAlertCard({ alert }) {
  return (
    <article className={`mobile-alert-card ${alert.severity || 'warning'}`}>
      <div>
        <strong>{alert.title || alert.organisation || 'Platform alert'}</strong>
        <span>{alert.detail || alert.issue || 'Needs attention'}</span>
        <button type="button">Open organisation</button>
      </div>
      <time>{alert.time || 'Now'}</time>
    </article>
  )
}

function MobileActivityFeed({ items = [] }) {
  return (
    <div className="mobile-activity-feed">
      {items.length ? (
        items.slice(0, 5).map((item) => (
          <div key={item.id || `${item.title}-${item.time}`}>
            <CircleDot size={15} />
            <span>{item.title || item.text}</span>
            <time>{item.time}</time>
          </div>
        ))
      ) : (
        <EmptyData compact />
      )}
    </div>
  )
}

function MobileDashboard({ onNavigate, profile, snapshot }) {
  const ecosystemTotal = snapshot.ecosystem?.total || 0
  const organisations = snapshot.kpis.find((metric) => metric.label === 'Active Organisations')?.value || '0'
  const users = snapshot.kpis.find((metric) => metric.label === 'Active Users')?.value || '0'
  const velocity = snapshot.platformHealth?.velocity || {}
  const recent = [
    ...(snapshot.activities || []),
    ...(snapshot.roleplayers || []).flatMap((roleplayer) =>
      (roleplayer.activityFeed || []).slice(0, 1).map((item) => ({
        id: `${roleplayer.id}-${item.id}`,
        title: `${roleplayer.name}: ${item.text}`,
        time: item.time,
      })),
    ),
  ].slice(0, 5)

  return (
    <>
      <MobileHeader profile={profile} snapshot={snapshot} />
      <MobileKpiCarousel kpis={snapshot.kpis} />

      <section className="mobile-section">
        <div className="mobile-section-heading">
          <h2>Attention Required</h2>
          <button onClick={() => onNavigate('alerts')} type="button">
            View all alerts
          </button>
        </div>
        {snapshot.attention?.length ? (
          <div className="mobile-alert-list">
            {snapshot.attention.slice(0, 3).map((alert) => (
              <MobileAlertCard alert={alert} key={alert.id} />
            ))}
          </div>
        ) : (
          <div className="mobile-empty-good">
            <CheckCircle2 size={18} />
            <span>No alerts right now. Arch9 is operating normally.</span>
          </div>
        )}
      </section>

      <section className="mobile-section">
        <h2>Ecosystem Snapshot</h2>
        <div className="mobile-snapshot-grid">
          <MobileMetricCard metric={{ hasData: true, label: 'Organisations', value: organisations }} />
          <MobileMetricCard metric={{ hasData: true, label: 'Users', value: users }} />
          <MobileMetricCard metric={{ hasData: true, label: 'Participants', value: formatCount(ecosystemTotal) }} />
        </div>
      </section>

      <section className="mobile-section">
        <h2>Organisation Growth</h2>
        <article className="mobile-card">
          <MiniLineChart data={snapshot.growth?.organisationTrend || []} />
        </article>
      </section>

      <section className="mobile-section">
        <h2>Registration Velocity</h2>
        <article className="mobile-card velocity">
          {velocity.hasData ? (
            <>
              <span>Average Registration Time</span>
              <strong>{velocity.averageDays} days</strong>
              <em className={velocity.deltaDays <= 0 ? 'positive' : 'negative'}>
                {velocity.deltaDays <= 0 ? 'Down' : 'Up'} {Math.abs(velocity.deltaDays || 0)} days vs last month
              </em>
            </>
          ) : (
            <EmptyData compact />
          )}
        </article>
      </section>

      <section className="mobile-section">
        <h2>Recent Activity</h2>
        <MobileActivityFeed items={recent} />
      </section>
    </>
  )
}

function MobileRoleplayerCard({ onSelect, roleplayer }) {
  return (
    <button className="mobile-roleplayer-card" onClick={() => onSelect(roleplayer)} type="button">
      <RoleplayerLogo roleplayer={roleplayer} size="large" />
      <div>
        <h3>{roleplayer.name}</h3>
        <span className={`type-badge ${roleplayerTypeClass(roleplayer.type)}`}>{roleplayer.type}</span>
        <div className="mobile-roleplayer-metrics">
          <span>{formatCount(roleplayer.userCount)} Users</span>
          <span>
            {formatCount(roleplayer.activeWorkload)} {roleplayer.activeWorkloadLabel.replace('Active ', '')}
          </span>
          <span>{roleplayer.revenueDisplay} Revenue</span>
        </div>
        <p>
          <span className={`health-dot ${roleplayer.health.tone}`}>Health: {roleplayer.health.label}</span>
          <time>{roleplayer.lastActivity}</time>
        </p>
      </div>
    </button>
  )
}

function MobileWorkspaceGrid({ roleplayer }) {
  return (
    <div className="mobile-workspace-grid">
      {roleplayer.workspaceCards.map((card) => (
        <button key={card.label} type="button">
          <FileText size={17} />
          <strong>{card.label}</strong>
          <span>
            {typeof card.value === 'number' ? formatCount(card.value) : card.value} {card.meta}
          </span>
        </button>
      ))}
    </div>
  )
}

function MobileRoleplayerDetail({ onBack, roleplayer }) {
  if (!roleplayer) return <EmptyData />
  return (
    <>
      <button className="mobile-back-button" onClick={onBack} type="button">
        <ArrowLeft size={16} />
        Roleplayers
      </button>
      <section className="mobile-detail-hero">
        <RoleplayerLogo roleplayer={roleplayer} size="workspace" />
        <div>
          <h1>{roleplayer.name}</h1>
          <span className={`type-badge ${roleplayerTypeClass(roleplayer.type)}`}>{roleplayer.type}</span>
          <p>
            <span className={`status-dot ${roleplayer.health.tone}`} />
            {roleplayer.status}
          </p>
          <small>Joined {roleplayer.joinedDate}</small>
          <small>Last activity {roleplayer.lastActivity}</small>
        </div>
      </section>

      <section className="mobile-section">
        <div className="mobile-action-grid">
          <button type="button">Users</button>
          <button type="button">Permissions</button>
          <button type="button">Billing</button>
          <button className="danger" type="button">Suspend</button>
        </div>
      </section>

      <section className="mobile-section">
        <div className="mobile-snapshot-grid two">
          <MobileMetricCard metric={{ hasData: true, label: 'Users', value: formatCount(roleplayer.userCount) }} />
          <MobileMetricCard metric={{ hasData: true, label: roleplayer.activeWorkloadLabel, value: formatCount(roleplayer.activeWorkload) }} />
          <MobileMetricCard metric={{ hasData: true, label: 'Revenue', value: roleplayer.revenueDisplay }} />
          <MobileMetricCard metric={{ hasData: true, label: 'Open Issues', value: formatCount(roleplayer.openIssues) }} />
          <MobileMetricCard metric={{ hasData: true, label: 'Last Activity', value: roleplayer.lastActivity }} />
          <MobileMetricCard metric={{ hasData: true, label: 'Health', value: roleplayer.health.label }} />
        </div>
      </section>

      <section className="mobile-section">
        <h2>Recent Activity</h2>
        <MobileActivityFeed items={(roleplayer.activityFeed || []).map((item) => ({ ...item, title: item.text }))} />
      </section>

      <section className="mobile-section">
        <h2>Workspaces</h2>
        <MobileWorkspaceGrid roleplayer={roleplayer} />
      </section>

      <section className="mobile-section">
        <h2>Quick Links</h2>
        <div className="mobile-link-list">
          <button type="button">View All Transactions</button>
          <button type="button">View All Matters</button>
          <button type="button">View All Applications</button>
          <button type="button">Audit Log</button>
        </div>
      </section>
    </>
  )
}

function MobileRoleplayers({ snapshot }) {
  const [activeFilter, setActiveFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(() => {
    if (typeof window === 'undefined') return ''
    const match = window.location.pathname.match(/\/admin\/roleplayers\/([^/]+)/)
    return match ? decodeURIComponent(match[1]) : ''
  })
  const roleplayers = snapshot.roleplayers || []
  const filtered = roleplayers.filter((roleplayer) => roleplayerFilterMatches(roleplayer, activeFilter)).filter((roleplayer) => {
    const search = query.trim().toLowerCase()
    if (!search) return true
    return `${roleplayer.name} ${roleplayer.type} ${roleplayer.organisationId}`.toLowerCase().includes(search)
  })
  const selectedRoleplayer = roleplayers.find((roleplayer) => roleplayer.id === selectedId)

  function selectRoleplayer(roleplayer) {
    setSelectedId(roleplayer.id)
    pushAdminPath(`/admin/roleplayers/${encodeURIComponent(roleplayer.id)}`)
  }

  function backToList() {
    setSelectedId('')
    pushAdminPath('/admin/roleplayers')
  }

  if (selectedRoleplayer) {
    return <MobileRoleplayerDetail onBack={backToList} roleplayer={selectedRoleplayer} />
  }

  return (
    <>
      <MobileHeader snapshot={snapshot} title="Roleplayers" subtitle="Manage and monitor organisations." />
      <section className="mobile-section">
        <label className="mobile-search-field">
          <Search size={17} />
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search roleplayers..." value={query} />
        </label>
        <div className="mobile-chip-row">
          {ROLEPLAYER_FILTERS.map((filter) => (
            <button className={activeFilter === filter ? 'active' : ''} key={filter} onClick={() => setActiveFilter(filter)} type="button">
              {filter === 'Insurance Partners' ? 'Insurance' : filter}
            </button>
          ))}
        </div>
      </section>
      <section className="mobile-roleplayer-list">
        {filtered.length ? (
          filtered.map((roleplayer) => <MobileRoleplayerCard key={roleplayer.id} onSelect={selectRoleplayer} roleplayer={roleplayer} />)
        ) : (
          <EmptyData />
        )}
      </section>
    </>
  )
}

function MobileAlerts({ snapshot }) {
  const alerts = [
    ...(snapshot.attention || []),
    ...(snapshot.warnings || []).map((warning) => ({
      detail: warning.message,
      id: `${warning.label}-${warning.message}`,
      severity: 'warning',
      time: 'Now',
      title: warning.label,
    })),
  ]
  return (
    <>
      <MobileHeader snapshot={snapshot} title="Alerts" subtitle={alerts.length ? `${alerts.length} items need attention.` : 'No alerts right now.'} />
      <section className="mobile-alert-list">
        {alerts.length ? alerts.map((alert) => <MobileAlertCard alert={alert} key={alert.id} />) : <div className="mobile-empty-good"><CheckCircle2 size={18} /><span>Arch9 is operating normally.</span></div>}
      </section>
    </>
  )
}

function MobileSearchResult({ result, type }) {
  return (
    <article className="mobile-search-result">
      <span>{type}</span>
      <strong>{result.title}</strong>
      <small>{result.meta}</small>
      <em>{result.status}</em>
      {result.time || result.lastActivity ? <time>{result.time || result.lastActivity}</time> : null}
    </article>
  )
}

function MobileSearch({ snapshot }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ customers: [], transactions: [], warnings: [] })
  const [isSearching, setIsSearching] = useState(false)

  async function handleSearch(event) {
    event.preventDefault()
    setIsSearching(true)
    setResults(await searchPlatform(query))
    setIsSearching(false)
  }

  const roleplayerResults = (snapshot.roleplayers || [])
    .filter((roleplayer) => `${roleplayer.name} ${roleplayer.type}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 6)
    .map((roleplayer) => ({
      lastActivity: roleplayer.lastActivity,
      meta: roleplayer.type,
      status: roleplayer.health.label,
      title: roleplayer.name,
    }))

  return (
    <>
      <MobileHeader snapshot={snapshot} title="Search" subtitle="Find organisations, users, transactions and matters." />
      <form className="mobile-search-form" onSubmit={handleSearch}>
        <Search size={18} />
        <input onChange={(event) => setQuery(event.target.value)} placeholder="Search the ecosystem..." value={query} />
        <button disabled={isSearching || !query.trim()} type="submit">Search</button>
      </form>
      <section className="mobile-search-results">
        {roleplayerResults.map((result) => <MobileSearchResult key={`org-${result.title}`} result={result} type="Organisation" />)}
        {results.customers.map((result) => <MobileSearchResult key={`user-${result.id}`} result={result} type="User" />)}
        {results.transactions.map((result) => <MobileSearchResult key={`tx-${result.id}`} result={result} type="Transaction" />)}
        {!query.trim() ? <EmptyData compact /> : null}
        {query.trim() && !roleplayerResults.length && !results.customers.length && !results.transactions.length ? <EmptyData compact /> : null}
      </section>
    </>
  )
}

function MobileMore({ onNavigate, onSignOut, snapshot }) {
  const items = [
    { id: 'health', label: 'Platform Health' },
    { id: 'legalTemplates', label: 'Legal Templates' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'growth', label: 'Growth' },
    { id: 'ecosystem', label: 'Ecosystem' },
    { id: 'audit', label: 'Audit Log' },
    { id: 'settings', label: 'Settings' },
  ]
  return (
    <>
      <MobileHeader snapshot={snapshot} title="More" subtitle="Secondary executive tools." />
      <section className="mobile-link-list">
        {items.map((item) => (
          <button key={item.id} onClick={() => onNavigate(item.id)} type="button">
            {item.label}
          </button>
        ))}
        <button className="danger" onClick={onSignOut} type="button">Sign Out</button>
      </section>
    </>
  )
}

function MobileSecondaryView({ activeView, access, onNavigate, profile, snapshot }) {
  if (activeView === 'health') return <><MobileHeader snapshot={snapshot} title="Platform Health" subtitle="Current platform operating signals." /><PlatformHealthSection health={snapshot.platformHealth} /></>
  if (activeView === 'legalTemplates') return <><MobileHeader snapshot={snapshot} title="Legal Templates" subtitle="Residential and commercial template bridge." /><LegalTemplatesView /></>
  if (activeView === 'revenue') return <><MobileHeader snapshot={snapshot} title="Revenue" subtitle="Financial overview." /><FinancialSection financials={snapshot.financials} /></>
  if (activeView === 'growth') return <><MobileHeader snapshot={snapshot} title="Growth" subtitle="Adoption and organisation growth." /><GrowthSection growth={snapshot.growth} /></>
  if (activeView === 'ecosystem') return <><MobileHeader snapshot={snapshot} title="Ecosystem" subtitle="Participants and role coverage." /><EcosystemSection ecosystem={snapshot.ecosystem} /></>
  if (activeView === 'audit') return <><MobileHeader snapshot={snapshot} title="Audit Log" subtitle="Recent system activity." /><RecordList emptyLabel="No audit events found." icon={ShieldCheck} items={snapshot.activities} title="Audit Log" /></>
  if (activeView === 'settings') return <><MobileHeader snapshot={snapshot} title="Settings" subtitle="Admin access and configuration." /><SettingsView access={access} profile={profile} /></>
  return (
    <>
      <button className="mobile-back-button" onClick={() => onNavigate('more')} type="button">
        <ArrowLeft size={16} />
        More
      </button>
      <EmptyData />
    </>
  )
}

function MobileAdminShell({ access, activeView, onNavigate, onSignOut, profile, snapshot }) {
  const primaryViews = ['dashboard', 'roleplayers', 'alerts', 'search', 'more']
  const bottomActive = primaryViews.includes(activeView) ? activeView : 'more'
  return (
    <div className="mobile-admin-shell">
      <main className="mobile-admin-main">
        {activeView === 'dashboard' ? <MobileDashboard onNavigate={onNavigate} profile={profile} snapshot={snapshot} /> : null}
        {activeView === 'roleplayers' ? <MobileRoleplayers snapshot={snapshot} /> : null}
        {activeView === 'alerts' ? <MobileAlerts snapshot={snapshot} /> : null}
        {activeView === 'search' ? <MobileSearch snapshot={snapshot} /> : null}
        {activeView === 'more' ? <MobileMore onNavigate={onNavigate} onSignOut={onSignOut} snapshot={snapshot} /> : null}
        {!primaryViews.includes(activeView) ? (
          <MobileSecondaryView activeView={activeView} access={access} onNavigate={onNavigate} profile={profile} snapshot={snapshot} />
        ) : null}
      </main>
      <MobileBottomNav activeView={bottomActive} onNavigate={onNavigate} />
    </div>
  )
}

function PlaceholderView({ icon: Icon, items, title }) {
  return (
    <div className="single-column">
      <RecordList emptyLabel={`No ${title.toLowerCase()} records found.`} icon={Icon} items={items} title={title} />
    </div>
  )
}

const LEGAL_TEMPLATE_MODULES = [
  { value: '', label: 'All Modules' },
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
]

const LEGAL_TEMPLATE_PACKET_TYPES = [
  { value: '', label: 'All Documents', module: '' },
  { value: 'mandate', label: 'Residential Mandate', module: 'residential' },
  { value: 'otp', label: 'Offer to Purchase', module: 'residential' },
  { value: 'addendum', label: 'Addendum', module: 'residential' },
  { value: 'supporting_legal', label: 'Supporting Legal', module: 'residential' },
  { value: 'commercial_lease', label: 'Commercial Lease', module: 'commercial' },
  { value: 'commercial_sale', label: 'Commercial Sale', module: 'commercial' },
]

const EMPTY_LEGAL_TEMPLATE_FORM = {
  id: '',
  organisationId: '',
  moduleType: 'residential',
  packetType: 'mandate',
  templateKey: '',
  templateLabel: '',
  templateFormat: 'docx',
  versionTag: 'v1',
  status: 'draft',
  isDefault: false,
  description: '',
  changeSummary: '',
  templateStorageBucket: '',
  templateStoragePath: '',
  templateFileName: '',
}

function formatAdminDate(value = '') {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function titleizeToken(value = '') {
  return String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function legalTemplateToForm(template = {}) {
  return {
    ...EMPTY_LEGAL_TEMPLATE_FORM,
    id: template.id || '',
    organisationId: template.organisation_id || template.organisationId || '',
    moduleType: template.module_type || template.moduleType || 'residential',
    packetType: template.packet_type || template.packetType || 'mandate',
    templateKey: template.template_key || template.templateKey || '',
    templateLabel: template.template_label || template.templateLabel || '',
    templateFormat: template.template_format || 'docx',
    versionTag: template.version_tag || 'v1',
    status: template.status || 'draft',
    isDefault: Boolean(template.is_default || template.isDefault),
    description: template.description || '',
    changeSummary: template.change_summary || template.changeSummary || '',
    templateStorageBucket: template.template_storage_bucket || template.bucket || '',
    templateStoragePath: template.template_storage_path || template.storagePath || '',
    templateFileName: template.template_file_name || template.fileName || '',
  }
}

function templateStatusTone(status = '') {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'published') return 'success'
  if (normalized === 'archived') return 'danger'
  return 'warning'
}

function readinessTone(severity = '') {
  if (severity === 'ready') return 'success'
  if (severity === 'warning') return 'warning'
  return 'danger'
}

function LegalTemplatesView() {
  const [filters, setFilters] = useState({ organisationId: '', moduleType: '', packetType: '', query: '' })
  const [registry, setRegistry] = useState({ organisations: [], templates: [], warnings: [] })
  const [governance, setGovernance] = useState({ audit: [], fileUrl: '', versions: [], warnings: [] })
  const [readiness, setReadiness] = useState({ checks: [], summary: { ready: 0, warning: 0, missing: 0, total: 0 }, warnings: [] })
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState(EMPTY_LEGAL_TEMPLATE_FORM)
  const [file, setFile] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGovernanceLoading, setIsGovernanceLoading] = useState(false)
  const [isReadinessLoading, setIsReadinessLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const packetOptions = useMemo(
    () => LEGAL_TEMPLATE_PACKET_TYPES.filter((option) => !option.module || !form.moduleType || option.module === form.moduleType),
    [form.moduleType],
  )

  async function loadRegistry(nextFilters = filters) {
    setIsLoading(true)
    setError('')
    try {
      const nextRegistry = await loadLegalTemplateRegistry(nextFilters)
      setRegistry(nextRegistry)
      setSelectedId((previous) => previous && nextRegistry.templates.some((template) => template.id === previous) ? previous : nextRegistry.templates[0]?.id || '')
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load legal templates.')
    } finally {
      setIsLoading(false)
    }
  }

  async function loadReadiness(nextFilters = filters) {
    setIsReadinessLoading(true)
    try {
      setReadiness(await loadLegalTemplateBridgeReadiness({
        organisationId: nextFilters.organisationId,
        moduleType: nextFilters.moduleType,
      }))
    } catch (loadError) {
      setReadiness({
        checks: [],
        summary: { ready: 0, warning: 0, missing: 0, total: 0 },
        warnings: [{ label: 'Template readiness', message: loadError?.message || 'Unable to scan legal template readiness.' }],
      })
    } finally {
      setIsReadinessLoading(false)
    }
  }

  useEffect(() => {
    void loadRegistry()
    void loadReadiness()
  }, [])

  const selectedTemplate = registry.templates.find((template) => template.id === selectedId) || null

  async function loadGovernance(templateId = selectedId) {
    if (!templateId) {
      setGovernance({ audit: [], fileUrl: '', versions: [], warnings: [] })
      return
    }
    setIsGovernanceLoading(true)
    try {
      setGovernance(await loadAdminLegalTemplateGovernance(templateId))
    } catch (loadError) {
      setGovernance({ audit: [], fileUrl: '', versions: [], warnings: [{ label: 'Template governance', message: loadError?.message || 'Unable to load template history.' }] })
    } finally {
      setIsGovernanceLoading(false)
    }
  }

  useEffect(() => {
    if (selectedTemplate) {
      setForm(legalTemplateToForm(selectedTemplate))
      setFile(null)
    }
  }, [selectedTemplate])

  useEffect(() => {
    void loadGovernance(selectedId)
  }, [selectedId])

  function updateFilters(patch) {
    const next = { ...filters, ...patch }
    if (patch.moduleType !== undefined) {
      const stillValid = LEGAL_TEMPLATE_PACKET_TYPES.some((option) => option.value === next.packetType && (!option.module || option.module === next.moduleType))
      if (!stillValid) next.packetType = ''
    }
    setFilters(next)
    void loadRegistry(next)
    void loadReadiness(next)
  }

  function updateForm(patch) {
    setForm((previous) => {
      const next = { ...previous, ...patch }
      if (patch.moduleType && !LEGAL_TEMPLATE_PACKET_TYPES.some((option) => option.value === next.packetType && option.module === patch.moduleType)) {
        next.packetType = patch.moduleType === 'commercial' ? 'commercial_lease' : 'mandate'
      }
      return next
    })
  }

  function startNewTemplate() {
    setSelectedId('')
    setFile(null)
    setMessage('')
    setError('')
    setForm({
      ...EMPTY_LEGAL_TEMPLATE_FORM,
      organisationId: filters.organisationId || registry.organisations[0]?.id || '',
      moduleType: filters.moduleType || 'residential',
      packetType: filters.moduleType === 'commercial' ? 'commercial_lease' : filters.packetType || 'mandate',
    })
  }

  async function handleSave(event) {
    event?.preventDefault()
    setIsSaving(true)
    setMessage('')
    setError('')
    try {
      const upload = file
        ? await uploadAdminLegalTemplateAsset({
            file,
            moduleType: form.moduleType,
            organisationId: form.organisationId,
            packetType: form.packetType,
            templateKey: form.templateKey || form.templateLabel,
            versionTag: form.versionTag,
          })
        : null
      const saved = await saveAdminLegalTemplate(form, upload)
      setMessage('Legal template saved.')
      setFile(null)
      await loadRegistry(filters)
      await loadReadiness(filters)
      setSelectedId(saved?.id || '')
      await loadGovernance(saved?.id || selectedId)
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save legal template.')
    } finally {
      setIsSaving(false)
    }
  }

  async function runTemplateAction(action, successMessage) {
    if (!form.id) return
    setIsSaving(true)
    setMessage('')
    setError('')
    try {
      await action(form)
      setMessage(successMessage)
      await loadRegistry(filters)
      await loadReadiness(filters)
      await loadGovernance(selectedId)
    } catch (actionError) {
      setError(actionError?.message || 'Template action failed.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRestoreVersion(version) {
    if (!form.id) return
    setIsSaving(true)
    setMessage('')
    setError('')
    try {
      const restored = await restoreAdminLegalTemplateVersion(form, version)
      setMessage(`Restored ${version.version_tag || 'previous version'} as a draft.`)
      await loadRegistry(filters)
      await loadReadiness(filters)
      setSelectedId(restored?.id || form.id)
      await loadGovernance(restored?.id || form.id)
    } catch (restoreError) {
      setError(restoreError?.message || 'Unable to restore template version.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="legal-template-module">
      <div className="roleplayers-header">
        <div>
          <h1>Legal Templates</h1>
          <p>Manage organisation legal templates used by residential and commercial document generation.</p>
        </div>
        <button className="primary-button compact" onClick={startNewTemplate} type="button">
          <Plus size={16} />
          Add Template
        </button>
      </div>

      <div className="legal-template-toolbar panel">
        <label>
          <span>Organisation</span>
          <select onChange={(event) => updateFilters({ organisationId: event.target.value })} value={filters.organisationId}>
            <option value="">All organisations</option>
            {registry.organisations.map((organisation) => (
              <option key={organisation.id} value={organisation.id}>{organisation.displayName}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Module</span>
          <select onChange={(event) => updateFilters({ moduleType: event.target.value })} value={filters.moduleType}>
            {LEGAL_TEMPLATE_MODULES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>Document</span>
          <select onChange={(event) => updateFilters({ packetType: event.target.value })} value={filters.packetType}>
            {LEGAL_TEMPLATE_PACKET_TYPES.filter((option) => !option.module || !filters.moduleType || option.module === filters.moduleType).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="legal-template-search">
          <span>Search</span>
          <input onChange={(event) => updateFilters({ query: event.target.value })} placeholder="Template, organisation, packet..." value={filters.query} />
        </label>
        <button className="secondary-button compact" disabled={isLoading} onClick={() => loadRegistry(filters)} type="button">
          <RefreshCw className={isLoading ? 'spin' : ''} size={16} />
          Refresh
        </button>
      </div>

      {registry.warnings.length ? <WarningStrip warnings={registry.warnings} /> : null}
      {readiness.warnings.length ? <WarningStrip warnings={readiness.warnings} /> : null}
      {error ? <div className="notice danger"><AlertTriangle size={16} /><span>{error}</span></div> : null}
      {message ? <div className="notice success"><CheckCircle2 size={16} /><span>{message}</span></div> : null}

      <section className="panel legal-template-readiness">
        <div className="panel-heading">
          <h2>Bridge Readiness</h2>
          <button className="secondary-button compact" disabled={isReadinessLoading} onClick={() => loadReadiness(filters)} type="button">
            <RefreshCw className={isReadinessLoading ? 'spin' : ''} size={16} />
            Scan
          </button>
        </div>
        <div className="legal-template-readiness-summary">
          <div className="success">
            <span>Ready</span>
            <strong>{readiness.summary.ready}</strong>
          </div>
          <div className="warning">
            <span>Fallback</span>
            <strong>{readiness.summary.warning}</strong>
          </div>
          <div className="danger">
            <span>Missing</span>
            <strong>{readiness.summary.missing}</strong>
          </div>
          <div>
            <span>Total Checks</span>
            <strong>{readiness.summary.total}</strong>
          </div>
        </div>
        <div className="legal-template-readiness-list">
          {readiness.checks.length ? readiness.checks.map((check) => (
            <article className={check.severity} key={check.id}>
              <div>
                <strong>{check.organisationName}</strong>
                <span>{check.label}</span>
              </div>
              <em className={`pill ${readinessTone(check.severity)}`}>{check.source.replace(/_/g, ' ')}</em>
              <p>{check.message}</p>
              <small>{check.templateLabel || 'No template'}{check.storagePath ? ` / ${check.storagePath}` : ''}</small>
            </article>
          )) : <EmptyData compact />}
        </div>
      </section>

      <div className="legal-template-layout">
        <section className="panel legal-template-list-panel">
          <div className="panel-heading">
            <h2>Template Registry</h2>
            <span>{registry.templates.length}</span>
          </div>
          <div className="legal-template-list">
            {registry.templates.length ? registry.templates.map((template) => (
              <button
                className={selectedId === template.id ? 'legal-template-row active' : 'legal-template-row'}
                key={template.id}
                onClick={() => setSelectedId(template.id)}
                type="button"
              >
                <FileText size={18} />
                <div>
                  <strong>{template.templateLabel}</strong>
                  <span>{template.organisationName}</span>
                  <small>{titleizeToken(template.moduleType)} / {titleizeToken(template.packetType)} / {template.version_tag || 'v1'}</small>
                </div>
                <em className={`pill ${templateStatusTone(template.status)}`}>{template.status}</em>
                {template.is_default ? <b>Default</b> : null}
              </button>
            )) : <EmptyData />}
          </div>
        </section>

        <form className="panel legal-template-editor" onSubmit={handleSave}>
          <div className="panel-heading">
            <h2>{form.id ? 'Edit Template' : 'New Template'}</h2>
            <span>{form.status}</span>
          </div>

          <div className="legal-template-form-grid">
            <label>
              <span>Organisation</span>
              <select required onChange={(event) => updateForm({ organisationId: event.target.value })} value={form.organisationId}>
                <option value="">Choose organisation</option>
                {registry.organisations.map((organisation) => (
                  <option key={organisation.id} value={organisation.id}>{organisation.displayName}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Module</span>
              <select onChange={(event) => updateForm({ moduleType: event.target.value })} value={form.moduleType}>
                {LEGAL_TEMPLATE_MODULES.filter((option) => option.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>Document Type</span>
              <select onChange={(event) => updateForm({ packetType: event.target.value })} value={form.packetType}>
                {packetOptions.filter((option) => option.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select onChange={(event) => updateForm({ status: event.target.value })} value={form.status}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label>
              <span>Template Label</span>
              <input required onChange={(event) => updateForm({ templateLabel: event.target.value })} value={form.templateLabel} />
            </label>
            <label>
              <span>Template Key</span>
              <input onChange={(event) => updateForm({ templateKey: event.target.value })} placeholder="auto from label" value={form.templateKey} />
            </label>
            <label>
              <span>Version</span>
              <input onChange={(event) => updateForm({ versionTag: event.target.value })} value={form.versionTag} />
            </label>
            <label>
              <span>Format</span>
              <select onChange={(event) => updateForm({ templateFormat: event.target.value })} value={form.templateFormat}>
                <option value="docx">DOCX</option>
                <option value="html">HTML</option>
                <option value="structured">Structured</option>
                <option value="pdf">PDF</option>
                <option value="json">JSON</option>
              </select>
            </label>
            <label className="wide">
              <span>Description</span>
              <textarea onChange={(event) => updateForm({ description: event.target.value })} value={form.description} />
            </label>
            <label className="wide">
              <span>Change Summary</span>
              <textarea onChange={(event) => updateForm({ changeSummary: event.target.value })} placeholder="What changed in this version?" value={form.changeSummary} />
            </label>
            <label className="wide legal-template-upload">
              <span>Upload Template File</span>
              <input accept=".doc,.docx,.pdf,.html,.json,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] || null)} type="file" />
              <small>{file ? file.name : form.templateFileName || form.templateStoragePath || 'No file selected'}</small>
            </label>
            <label className="wide checkbox-row">
              <input checked={form.isDefault} onChange={(event) => updateForm({ isDefault: event.target.checked })} type="checkbox" />
              <span>Use as the active default for this organisation, module, and document type.</span>
            </label>
          </div>

          <div className="legal-template-storage">
            <div>
              <span>Bucket</span>
              <strong>{form.templateStorageBucket || 'legal-templates'}</strong>
            </div>
            <div>
              <span>Path</span>
              <strong>{form.templateStoragePath || 'Upload a file to generate a canonical path.'}</strong>
            </div>
            <div>
              <span>Updated</span>
              <strong>{selectedTemplate ? formatAdminDate(selectedTemplate.updated_at) : 'Not saved yet'}</strong>
            </div>
          </div>

          <div className="legal-template-governance">
            <section>
              <div className="legal-template-governance-heading">
                <h3>Source File</h3>
                {isGovernanceLoading ? <RefreshCw className="spin" size={15} /> : null}
              </div>
              {governance.fileUrl ? (
                <a className="secondary-button compact" href={governance.fileUrl} rel="noreferrer" target="_blank">
                  Open template file
                </a>
              ) : (
                <p>No signed file link is available for the current template.</p>
              )}
            </section>

            <section>
              <div className="legal-template-governance-heading">
                <h3>Version History</h3>
                <span>{governance.versions.length}</span>
              </div>
              <div className="legal-template-version-list">
                {governance.versions.length ? governance.versions.map((version) => (
                  <article key={version.id}>
                    <div>
                      <strong>{version.version_tag || 'v1'}</strong>
                      <span className={`pill ${templateStatusTone(version.status)}`}>{version.status}</span>
                    </div>
                    <p>{version.change_summary || version.description || 'No change summary captured.'}</p>
                    <small>{version.fileName || version.storagePath || 'No file'} / {formatAdminDate(version.updated_at || version.created_at)}</small>
                    <button disabled={isSaving} onClick={() => handleRestoreVersion(version)} type="button">
                      Restore as Draft
                    </button>
                  </article>
                )) : <EmptyData compact />}
              </div>
            </section>

            <section>
              <div className="legal-template-governance-heading">
                <h3>Audit Trail</h3>
                <span>{governance.audit.length}</span>
              </div>
              <div className="legal-template-audit-list">
                {governance.audit.length ? governance.audit.map((event) => (
                  <div key={event.id}>
                    <ShieldCheck size={15} />
                    <span>{titleizeToken(event.eventType)}</span>
                    <small>{event.summary}</small>
                    <time>{event.time}</time>
                  </div>
                )) : <EmptyData compact />}
              </div>
            </section>
          </div>

          {governance.warnings.length ? <WarningStrip warnings={governance.warnings} /> : null}

          <div className="legal-template-actions">
            <button className="primary-button compact" disabled={isSaving} type="submit">
              <FileText size={16} />
              {isSaving ? 'Saving...' : 'Save Template'}
            </button>
            <button className="secondary-button compact" disabled={!form.id || isSaving} onClick={() => runTemplateAction(publishAdminLegalTemplate, 'Template published and set as default.')} type="button">
              Publish
            </button>
            <button className="secondary-button compact" disabled={!form.id || isSaving} onClick={() => runTemplateAction(setAdminLegalTemplateDefault, 'Template set as active default.')} type="button">
              Set Default
            </button>
            <button className="secondary-button compact danger" disabled={!form.id || isSaving} onClick={() => runTemplateAction(archiveAdminLegalTemplate, 'Template archived.')} type="button">
              Archive
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

function SettingsView({ access, profile }) {
  return (
    <div className="single-column">
      <section className="panel settings-panel">
        <div>
          <Lock size={22} />
          <div>
            <h2>Admin access</h2>
            <p>{formatAdminLevelLabel(access.level)}</p>
          </div>
        </div>
        <dl>
          <div>
            <dt>Signed in as</dt>
            <dd>{profile?.email || 'Unknown'}</dd>
          </div>
          <div>
            <dt>Detected roles</dt>
            <dd>{access.roles.length ? access.roles.map(formatRoleLabel).join(', ') : 'None'}</dd>
          </div>
          <div>
            <dt>Supabase</dt>
            <dd>{getSupabaseConfigStatus().message}</dd>
          </div>
        </dl>
      </section>
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
  const isMobile = useIsMobile()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [access, setAccess] = useState({ allowed: false, level: '', roles: [] })
  const [activeView, setActiveView] = useState('dashboard')
  const [authError, setAuthError] = useState('')
  const [dateRange, setDateRange] = useState('30d')
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [isBooting, setIsBooting] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  async function refreshData(nextRange = dateRange) {
    if (!session?.user) return
    setIsLoading(true)
    setSnapshot(await loadDashboardSnapshot(nextRange))
    setIsLoading(false)
  }

  async function handleDateRangeChange(nextRange) {
    setDateRange(nextRange)
    await refreshData(nextRange)
  }

  function handleNavigate(viewId) {
    setActiveView(viewId)
    const navItem = MOBILE_NAV_ITEMS.find((item) => item.id === viewId)
    if (navItem) {
      pushAdminPath(navItem.path)
    }
  }

  function handleDesktopNavigate(viewId) {
    setActiveView(viewId)
    pushAdminPath(adminPathForView(viewId))
  }

  useEffect(() => {
    let isMounted = true

    async function boot() {
      if (!supabase) {
        setIsBooting(false)
        return undefined
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
        setAccess({ allowed: false, level: '', roles: [] })
        setSnapshot(EMPTY_SNAPSHOT)
        return
      }

      const nextProfile = await loadAdminProfile(session.user.id)
      if (cancelled) return
      const nextAccess = resolveAdminAccess({ profile: nextProfile, user: session.user })
      setProfile(nextProfile || { email: session.user.email })
      setAccess(nextAccess)
      if (nextAccess.allowed) {
        setActiveView(viewFromPath(nextAccess.level, isMobile))
        setIsLoading(true)
        const nextSnapshot = await loadDashboardSnapshot(dateRange)
        if (!cancelled) setSnapshot(nextSnapshot)
        setIsLoading(false)
      }
    }

    resolveAccess()
    return () => {
      cancelled = true
    }
  }, [isMobile, session])

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

  const allowedGroups = getAllowedGroups(access.level)
  const allowedViews = getAllowedViews(access.level)
  const canViewActive = allowedViews.some((view) => view.id === activeView)

  if (isMobile && access.level === ADMIN_LEVELS.EXECUTIVE) {
    return (
      <MobileAdminShell
        access={access}
        activeView={activeView}
        onNavigate={handleNavigate}
        onSignOut={handleSignOut}
        profile={profile}
        snapshot={snapshot}
      />
    )
  }

  return (
    <div className="admin-shell">
      <Sidebar
        activeView={activeView}
        allowedGroups={allowedGroups}
        level={access.level}
        onSignOut={handleSignOut}
        onViewChange={handleDesktopNavigate}
        profile={profile}
      />
      <main className="admin-main">
        <Topbar
          activeView={activeView}
          dateRange={dateRange}
          isLoading={isLoading}
          onDateRangeChange={handleDateRangeChange}
          onRefresh={() => refreshData()}
        />
        {!canViewActive ? <ServiceDeskView snapshot={snapshot} /> : null}
        {activeView === 'dashboard' && canViewActive ? <ExecutiveDashboardView snapshot={snapshot} /> : null}
        {activeView === 'growth' && canViewActive ? <GrowthSection growth={snapshot.growth} /> : null}
        {activeView === 'revenue' && canViewActive ? <FinancialSection financials={snapshot.financials} /> : null}
        {activeView === 'ecosystem' && canViewActive ? <EcosystemSection ecosystem={snapshot.ecosystem} /> : null}
        {activeView === 'health' && canViewActive ? <HealthView snapshot={snapshot} /> : null}
        {activeView === 'organisations' && canViewActive ? (
          <PlaceholderView icon={Building2} items={snapshot.organisations} title="Organisations" />
        ) : null}
        {activeView === 'legalTemplates' && canViewActive ? <LegalTemplatesView /> : null}
        {activeView === 'roleplayers' && canViewActive ? <RoleplayersView snapshot={snapshot} /> : null}
        {activeView === 'users' && canViewActive ? <PlaceholderView icon={Users} items={snapshot.users} title="Users" /> : null}
        {activeView === 'transactions' && canViewActive ? (
          <PlaceholderView icon={Database} items={snapshot.transactions} title="Transactions" />
        ) : null}
        {activeView === 'service' && canViewActive ? <ServiceDeskView snapshot={snapshot} /> : null}
        {activeView === 'audit' && canViewActive ? <PlaceholderView icon={ShieldCheck} items={snapshot.activities} title="Audit Log" /> : null}
        {activeView === 'search' && canViewActive ? <SearchView /> : null}
        {activeView === 'settings' && canViewActive ? <SettingsView access={access} profile={profile} /> : null}
      </main>
    </div>
  )
}
