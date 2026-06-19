import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  CircleDot,
  Database,
  Headphones,
  Home,
  LineChart,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ADMIN_LEVELS, formatAdminLevelLabel, formatRoleLabel, resolveAdminAccess } from './lib/adminAccess'
import { loadAdminProfile, loadDashboardSnapshot, searchPlatform } from './lib/adminData'
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

function PlaceholderView({ icon: Icon, items, title }) {
  return (
    <div className="single-column">
      <RecordList emptyLabel={`No ${title.toLowerCase()} records found.`} icon={Icon} items={items} title={title} />
    </div>
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
        setActiveView(getDefaultView(nextAccess.level))
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

  const allowedGroups = getAllowedGroups(access.level)
  const allowedViews = getAllowedViews(access.level)
  const canViewActive = allowedViews.some((view) => view.id === activeView)

  return (
    <div className="admin-shell">
      <Sidebar
        activeView={activeView}
        allowedGroups={allowedGroups}
        level={access.level}
        onSignOut={handleSignOut}
        onViewChange={setActiveView}
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
