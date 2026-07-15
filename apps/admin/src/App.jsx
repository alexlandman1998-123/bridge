import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  BarChart3,
  Ban,
  Building2,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  CircleDot,
  Clock3,
  CreditCard,
  Database,
  Download,
  Filter,
  FileText,
  Headphones,
  Home,
  LineChart,
  Lock,
  LogOut,
  MoreVertical,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Target,
  Ticket,
  UserCog,
  Users,
  UserRoundCheck,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ADMIN_LEVELS, formatAdminLevelLabel, formatRoleLabel, resolveAdminAccess } from './lib/adminAccess'
import {
  archiveAdminLegalTemplate,
  buildCeoDashboardCsv,
  loadAdminProfile,
  loadCeoDashboardSnapshot,
  loadCeoLeadWorkflow,
  loadAdminLegalTemplateGovernance,
  loadDashboardSnapshot,
  loadLegalTemplateBridgeReadiness,
  loadLegalTemplateRegistry,
  publishAdminLegalTemplate,
  restoreAdminLegalTemplateVersion,
  saveAdminLegalTemplate,
  searchPlatform,
  setCeoRevenueTarget,
  setAdminLegalTemplateDefault,
  uploadAdminLegalTemplateAsset,
  updateCeoLeadWorkflow,
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

const ATTENTION_CONTEXT_LABELS = {
  documents: 'Document failures',
  onboarding: 'Stalled onboarding accounts',
  overdue: 'Overdue collections',
  stalled: 'Stalled transactions',
}

function attentionContextFromPath(path = '') {
  const query = String(path).split('?')[1] || ''
  const key = new URLSearchParams(query).get('attention') || ''
  return key ? { key, label: ATTENTION_CONTEXT_LABELS[key] || 'Attention required' } : null
}

const EMPTY_SNAPSHOT = {
  activities: [],
  attention: [],
  ceoDashboard: {
    available: false,
    attention: [],
    businessPulse: {},
    error: '',
    generatedAt: '',
    metrics: {},
    newBusinessIntake: [],
    range: null,
    topOrganisations: [],
    warnings: [],
  },
  customers: [],
  ecosystem: { hasData: false, metrics: [], total: 0 },
  financials: {
    arr: 'R0',
    averageTransactionRevenue: 'R0',
    collections: {},
    composition: [],
    forecast: [],
    hasData: false,
    health: {},
    insights: [],
    kpis: [],
    monthlyRevenue: 'R0',
    outstandingRevenue: {},
    projectedMonthEnd: 'R0',
    revenueByOrganisation: [],
    revenueForecast: [],
    revenuePerOrganisation: 'R0',
    revenueSources: [],
    revenueTrend: [],
    subscriptionAnalytics: [],
    transactionBreakdown: [],
  },
  growth: {
    acquisitionSources: [],
    funnel: [],
    hasData: false,
    insights: [],
    invitePerformance: {},
    kpis: [],
    mostActiveOrganisations: [],
    organisationTrend: [],
    roleGrowth: [],
    topGrowingOrganisations: [],
    userAdoption: {},
  },
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

function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    function updateOnlineStatus() {
      setIsOnline(navigator.onLine)
    }
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  return isOnline
}

function viewFromPath(level = '', isMobile = false) {
  if (typeof window === 'undefined') return getDefaultView(level)
  const path = window.location.pathname
  if (isMobile) {
    if (path.includes('/admin/organisations')) return 'organisations'
    if (path.includes('/admin/roleplayers')) return 'roleplayers'
    if (path.includes('/admin/legal-templates')) return 'legalTemplates'
    if (path.includes('/admin/alerts')) return 'alerts'
    if (path.includes('/admin/search')) return 'search'
    if (path.includes('/admin/more')) return 'more'
    return 'dashboard'
  }
  if (path.includes('/admin/organisations')) return 'organisations'
  if (path.includes('/admin/roleplayers')) return 'roleplayers'
  if (path.includes('/admin/legal-templates')) return 'legalTemplates'
  if (path.includes('/admin/platform-health')) return 'health'
  if (path.includes('/admin/transactions')) return 'transactions'
  if (path.includes('/admin/revenue')) return 'revenue'
  if (path.includes('/admin/growth')) return 'growth'
  if (path.includes('/admin/ecosystem')) return 'ecosystem'
  if (path.includes('/admin/users')) return 'users'
  if (path.includes('/admin/service-desk')) return 'service'
  if (path.includes('/admin/audit')) return 'audit'
  if (path.includes('/admin/settings')) return 'settings'
  if (path.includes('/admin/search')) return 'search'
  return getDefaultView(level)
}

function pushAdminPath(path) {
  if (typeof window !== 'undefined' && window.history?.pushState) {
    window.history.pushState({}, '', path)
  }
}

function adminPathForView(viewId = '') {
  if (viewId === 'organisations') return '/admin/organisations'
  if (viewId === 'roleplayers') return '/admin/roleplayers'
  if (viewId === 'legalTemplates') return '/admin/legal-templates'
  if (viewId === 'health') return '/admin/platform-health'
  if (viewId === 'transactions') return '/admin/transactions'
  if (viewId === 'revenue') return '/admin/revenue'
  if (viewId === 'growth') return '/admin/growth'
  if (viewId === 'ecosystem') return '/admin/ecosystem'
  if (viewId === 'users') return '/admin/users'
  if (viewId === 'service') return '/admin/service-desk'
  if (viewId === 'audit') return '/admin/audit'
  if (viewId === 'settings') return '/admin/settings'
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
        <div className="arch9-mark" aria-hidden="true" />
        <strong>ARCH9</strong>
      </div>

      <div className="admin-identity">
        <div className="admin-avatar" aria-hidden="true">
          A9
        </div>
        <div>
          <strong>Arch9 | Command</strong>
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

function Topbar({ activeView, canExportDashboard, dateRange, isLoading, onDashboardExport, onDateRangeChange, onRefresh }) {
  const view = ALL_VIEWS.find((item) => item.id === activeView)
  const title = activeView === 'dashboard' ? 'Executive Command Centre' : view?.label || 'Executive Command Centre'
  const subtitle =
    activeView === 'dashboard'
      ? 'Real-time overview of the Arch9 platform.'
      : activeView === 'growth'
        ? 'Track platform adoption, customer acquisition and ecosystem growth.'
      : activeView === 'revenue'
          ? 'Track financial performance, collections, forecasts and revenue growth.'
          : activeView === 'organisations'
            ? 'Manage and monitor every organisation on the Arch9 platform.'
          : 'Real-time operational workspace.'

  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
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
        {activeView === 'dashboard' ? (
          <button className="secondary-button compact" disabled={!canExportDashboard} onClick={onDashboardExport} type="button">
            <Download size={16} />
            <span>Export report</span>
          </button>
        ) : null}
        {activeView === 'growth' || activeView === 'revenue' ? (
          <button className="secondary-button compact" type="button">
            <Download size={16} />
            <span>{activeView === 'revenue' ? 'Export CSV' : 'Export'}</span>
          </button>
        ) : null}
        {activeView === 'organisations' ? (
          <button className="primary-button compact" type="button">
            <Plus size={16} />
            <span>Add Organisation</span>
          </button>
        ) : null}
      </div>
    </header>
  )
}

function EmptyData({
  compact = false,
  icon: Icon = CircleDot,
  title = 'No signal yet',
  description = 'Once platform activity starts, this area will update automatically.',
}) {
  return (
    <div className={compact ? 'empty-data compact' : 'empty-data'}>
      <Icon size={compact ? 15 : 18} />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  )
}

function numberFromDisplay(value) {
  const parsed = Number(String(value || '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-ZA', {
    currency: 'ZAR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number(value) || 0)
}

function initialsForDisplay(value = '') {
  return String(value || 'A9')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A9'
}

function sparklineForMetric(metric, index = 0) {
  const breakdownValues = (metric.breakdown || [])
    .map((item) => numberFromDisplay(item.value))
    .filter((value) => Number.isFinite(value))
  if (breakdownValues.length > 1) {
    return metric.breakdown.map((item) => ({
      label: item.label,
      value: numberFromDisplay(item.value),
    }))
  }

  const value = numberFromDisplay(metric.value)
  const labels = ['1', '2', '3', '4', '5', '6']

  return labels.map((label) => ({
    label,
    value,
  }))
}

function ExecutiveKpiRow({ kpis }) {
  const priorityLabels = [
    'Active Organisations',
    'Active Users',
    'Transactions In Progress',
    'Registrations This Month',
    'Monthly Revenue',
    'Pipeline Value',
  ]
  const cards = priorityLabels.map((label) => kpis.find((metric) => metric.label === label)).filter(Boolean)

  return (
    <section className="executive-kpi-row" aria-label="Executive KPIs">
      {cards.map((metric, index) => (
        <article className="executive-kpi-card" key={metric.label}>
          <div className="kpi-card-top">
            <div className={`kpi-icon ${metric.accent || 'green'}`}>
              {metric.label.includes('Revenue') ? (
                <CircleDollarSign size={18} />
              ) : metric.label.includes('Organisation') ? (
                <Building2 size={18} />
              ) : metric.label.includes('User') ? (
                <Users size={18} />
              ) : metric.label.includes('Pipeline') ? (
                <LineChart size={18} />
              ) : metric.label.includes('Registration') ? (
                <ShieldCheck size={18} />
              ) : (
                <BarChart3 size={18} />
              )}
            </div>
            <span className="card-label">{metric.label}</span>
          </div>
          <div className="kpi-primary">
            {metric.hasData ? (
              <>
                <strong>{metric.value}</strong>
                {metric.change ? <em>{metric.change}</em> : null}
              </>
            ) : (
              <EmptyData compact title="Waiting for activity" description="No matching records yet." />
            )}
          </div>
          <MiniLineChart compact data={sparklineForMetric(metric, index)} />
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

  return (
    <div className={data.some((item) => item.value > 0) ? 'funnel-chart' : 'funnel-chart is-empty'}>
      {data.map((item, index) => {
        const width = item.value > 0 ? Math.max(16, (item.value / max) * 100) : 0
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
  const colors = ['#0f8f55', '#35b37e', '#72d0a4', '#aee6c9', '#d7f3e4', '#94a3b8']
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
    : '#eef4f0 0% 100%'

  return (
    <div className={total ? 'donut-wrap' : 'donut-wrap is-empty'}>
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
            <b>{total ? Math.round((item.value / total) * 100) : 0}%</b>
          </span>
        ))}
      </div>
    </div>
  )
}

function MiniLineChart({ compact = false, data = [], tone = 'green' }) {
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

  return (
    <svg className={`mini-line ${tone}${compact ? ' compact' : ''}${values.some((value) => value > 0) ? '' : ' is-empty'}`} role="img" viewBox="0 0 100 88" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-fill-${tone}-${compact ? 'compact' : 'full'}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        points={points}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={compact ? '2.4' : '3'}
      />
      {data.map((item, index) => {
        const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100
        const y = 80 - (((Number(item.value) || 0) - min) / spread) * 60
        return <circle cx={x} cy={y} fill="currentColor" key={`${item.label}-${index}`} r={compact ? '1.8' : '2.5'} />
      })}
    </svg>
  )
}

function PlatformHealthSection({ health }) {
  return (
    <section className="section-block">
      <SectionTitle title="Platform Health" />
      <div className="platform-grid">
        <article className="panel chart-panel platform-combo-panel">
          <div className="health-combo-grid">
            <section>
              <h3>Transaction Funnel</h3>
              <FunnelChart data={health.transactionFunnel} />
            </section>
            <section>
              <h3>Transaction Stage Distribution</h3>
              <DonutChart centerLabel="Total" data={health.stageDistribution} />
            </section>
          </div>
        </article>
        <article className="panel chart-panel velocity-panel">
          <h3>Registration Velocity</h3>
          {health.velocity?.hasData ? (
            <>
              <strong className="velocity-number">{health.velocity.averageDays}</strong>
              <span className="metric-caption">avg. days to register</span>
              <em className={health.velocity.deltaDays <= 0 ? 'positive' : 'negative'}>
                {health.velocity.deltaDays <= 0 ? '-' : '+'}{Math.abs(health.velocity.deltaDays)} days vs previous period
              </em>
              <MiniLineChart data={health.velocity.trend} />
            </>
          ) : (
            <EmptyData
              icon={Activity}
              title="No registrations yet"
              description="Registration velocity appears once completed transfers are recorded."
            />
          )}
        </article>
      </div>
    </section>
  )
}

function GrowthSection({ growth }) {
  const newOrganisations = (growth.organisationTrend || []).at(-1)?.value || 0

  return (
    <section className="section-block">
      <SectionTitle title="Growth Overview" />
      <article className="panel chart-panel growth-overview-panel">
        <div className="growth-overview-grid">
          <section>
          <h3>New Organisations</h3>
          <strong className="section-metric">+{formatCount(newOrganisations)}</strong>
          <MiniLineChart data={growth.organisationTrend} />
          <div className="axis-labels">
            {(growth.organisationTrend || []).map((item) => (
              <span key={item.label}>{item.label}</span>
            ))}
          </div>
          </section>
          <section>
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
            <EmptyData compact title="No active users yet" description="Usage metrics will appear after sign-ins." />
          )}
          </section>
          <section>
          <h3>Most Active Organisations</h3>
          {growth.mostActiveOrganisations?.length ? (
            <div className="rank-list">
              {growth.mostActiveOrganisations.map((item, index) => (
                <div key={item.id}>
                  <b>{index + 1}</b>
                  <span>{item.name}</span>
                  <small>
                    {item.transactions} txns
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyData compact title="No leaders yet" description="Top organisations appear as usage grows." />
          )}
          </section>
        </div>
      </article>
    </section>
  )
}

function GrowthKpiRow({ growth }) {
  const metrics = growth.kpis?.length ? growth.kpis : []

  return (
    <section className="growth-kpi-grid" aria-label="Growth KPIs">
      {metrics.map((metric, index) => (
        <article className="growth-kpi-card" key={metric.label}>
          <div className={`kpi-icon ${metric.accent || 'green'}`}>
            {metric.label.includes('Revenue') || metric.label === 'MRR' ? (
              <CircleDollarSign size={18} />
            ) : metric.label.includes('Organisation') ? (
              <Building2 size={18} />
            ) : metric.label.includes('User') ? (
              <Users size={18} />
            ) : metric.label.includes('Registration') ? (
              <ShieldCheck size={18} />
            ) : (
              <FileText size={18} />
            )}
          </div>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <em>{metric.change}</em>
          <small>{metric.comparison || 'vs previous period'}</small>
          <MiniLineChart compact data={sparklineForMetric(metric, index)} />
        </article>
      ))}
    </section>
  )
}

function GrowthAreaChart({ data = [] }) {
  const rows = data.length ? data : ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'].map((label) => ({ label, value: 0 }))
  const values = rows.map((item) => Number(item.value) || 0)
  const max = Math.max(...values, 1)
  const points = values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100
      const y = 78 - (value / max) * 62
      return `${x},${y}`
    })
    .join(' ')
  const areaPoints = `0,84 ${points} 100,84`
  const ticks = [max, Math.round(max * 0.66), Math.round(max * 0.33), 0]

  return (
    <div className="growth-area-chart">
      <div className="growth-y-axis">
        {ticks.map((tick, index) => <span key={`${tick}-${index}`}>{formatCount(tick)}</span>)}
      </div>
      <svg role="img" viewBox="0 0 100 88" preserveAspectRatio="none">
        <polygon fill="currentColor" opacity="0.09" points={areaPoints} />
        <polyline fill="none" points={points} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
        {rows.map((item, index) => {
          const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100
          const y = 78 - ((Number(item.value) || 0) / max) * 62
          return <circle cx={x} cy={y} fill="currentColor" key={`${item.label}-${index}`} r="1.9" />
        })}
      </svg>
      <div className="growth-x-axis">
        {rows.map((item) => <span key={item.label}>{item.label}</span>)}
      </div>
    </div>
  )
}

function GrowthAdoptionSummary({ adoption = {} }) {
  const rows = adoption.summary?.length
    ? adoption.summary
    : [
        { change: '0%', label: 'DAU', value: '0' },
        { change: '0%', label: 'WAU', value: '0' },
        { change: '0%', label: 'MAU', value: '0' },
        { change: '0%', label: 'DAU / MAU', value: '0%' },
      ]

  return (
    <div className="growth-summary-list">
      {rows.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <em>{item.change}</em>
        </div>
      ))}
    </div>
  )
}

function GrowthRoleBars({ roles = [] }) {
  const total = roles.reduce((sum, item) => sum + (Number(item.value) || 0), 0)

  return (
    <div className="growth-role-bars">
      {(roles.length ? roles : [{ label: 'Users', value: 0 }]).map((item) => {
        const percent = total ? Math.round((item.value / total) * 100) : 0
        return (
          <div key={item.label}>
            <span>{item.label}</span>
            <div>
              <i style={{ width: `${Math.max(percent, item.value ? 4 : 0)}%` }} />
            </div>
            <strong>{formatCount(item.value)}</strong>
            <em>{percent}%</em>
          </div>
        )
      })}
    </div>
  )
}

function GrowthInsights({ insights = [] }) {
  const rows = insights.length ? insights : [{ id: 'empty', title: 'Growth insights will appear here', detail: 'Insights are generated as adoption, invite and transaction signals build up.' }]

  return (
    <div className="growth-insight-list">
      {rows.map((item, index) => (
        <article key={item.id || item.title}>
          <div className="growth-insight-icon">
            {index % 3 === 0 ? <Users size={17} /> : index % 3 === 1 ? <LineChart size={17} /> : <Building2 size={17} />}
          </div>
          <div>
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </div>
        </article>
      ))}
    </div>
  )
}

function TopGrowingOrganisations({ organisations = [] }) {
  const rows = organisations.length ? organisations : []

  return (
    <div className="growth-table">
      <div className="growth-table-head">
        <span>Organisation</span>
        <span>New Users</span>
        <span>Transactions</span>
        <span>Growth</span>
      </div>
      {rows.length ? rows.slice(0, 5).map((organisation) => (
        <article key={organisation.id}>
          <div className="growth-org-cell">
            <span className="growth-org-avatar">{initialsForDisplay(organisation.name)}</span>
            <strong>{organisation.name}</strong>
          </div>
          <span>+{formatCount(organisation.newUsers)}</span>
          <span>{formatCount(organisation.transactions)}</span>
          <div className="growth-mini-trend">
            <MiniLineChart compact data={organisation.trend} />
          </div>
        </article>
      )) : <EmptyData compact title="No growing organisations yet" description="New user and transaction growth will populate this list." />}
    </div>
  )
}

function GrowthFunnelSection({ funnel = [] }) {
  const max = Math.max(...funnel.map((item) => item.value), 1)

  return (
    <section className="section-block">
      <SectionTitle title="Growth Funnel" />
      <article className="panel growth-funnel-panel">
        {(funnel.length ? funnel : [{ label: 'Organisations Invited', value: 0, conversion: 0, dropoff: 0 }]).map((item) => (
          <div className="growth-funnel-row" key={item.label}>
            <span>{item.label}</span>
            <div className="growth-funnel-track">
              <i style={{ width: `${item.value ? Math.max(8, (item.value / max) * 100) : 0}%` }} />
            </div>
            <strong>{formatCount(item.value)}</strong>
            <em>{item.conversion}% conv.</em>
            <small>{item.dropoff}% dropoff</small>
          </div>
        ))}
      </article>
    </section>
  )
}

function GrowthLeaderboard({ organisations = [] }) {
  return (
    <section className="section-block">
      <SectionTitle title="Organisation Leaderboard" />
      <article className="panel growth-leaderboard">
        <div className="growth-leaderboard-head">
          <span>Rank</span>
          <span>Organisation</span>
          <span>Users</span>
          <span>Transactions</span>
          <span>Revenue</span>
          <span>Growth</span>
          <span>Last Activity</span>
        </div>
        {organisations.length ? organisations.slice(0, 8).map((organisation, index) => (
          <div className="growth-leaderboard-row" key={organisation.id}>
            <b>{index + 1}</b>
            <strong>{organisation.name}</strong>
            <span>{formatCount(organisation.users)}</span>
            <span>{formatCount(organisation.transactions)}</span>
            <span>{organisation.revenueDisplay}</span>
            <em>{organisation.growth}</em>
            <time>{organisation.lastActivity}</time>
          </div>
        )) : <EmptyData compact title="No leaderboard data yet" description="Organisation ranking will appear as adoption grows." />}
      </article>
    </section>
  )
}

function InvitePerformance({ performance = {} }) {
  const metrics = [
    { label: 'Invites Sent', value: formatCount(performance.sent || 0) },
    { label: 'Accepted', value: formatCount(performance.accepted || 0) },
    { label: 'Pending', value: formatCount(performance.pending || 0) },
    { label: 'Expired', value: formatCount(performance.expired || 0) },
    { label: 'Acceptance', value: `${performance.acceptanceRate || 0}%` },
    { label: 'Avg. Acceptance Time', value: performance.averageAcceptanceTime || 'No invites yet' },
    { label: 'Best Role', value: performance.bestRole || 'No role yet' },
    { label: 'Needs Attention', value: performance.worstRole || 'No role yet' },
  ]

  return (
    <section className="section-block">
      <SectionTitle title="Invite Performance" />
      <article className="panel invite-performance-grid">
        {metrics.map((item) => (
          <span key={item.label}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </span>
        ))}
      </article>
    </section>
  )
}

function GrowthDashboardView({ snapshot }) {
  const growth = snapshot.growth || {}

  return (
    <div className="growth-dashboard">
      <GrowthKpiRow growth={growth} />

      <div className="growth-top-grid">
        <article className="panel growth-large-chart">
          <div className="panel-inline-heading">
            <h3>New Organisations Over Time</h3>
            <select aria-label="Growth interval" defaultValue="monthly">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <GrowthAreaChart data={growth.organisationTrend} />
        </article>
        <article className="panel growth-source-card">
          <h3>User Acquisition Sources</h3>
          <DonutChart centerLabel="Total" data={growth.acquisitionSources} />
        </article>
        <article className="panel growth-summary-card">
          <h3>User Adoption Summary</h3>
          <GrowthAdoptionSummary adoption={growth.userAdoption} />
        </article>
      </div>

      <div className="growth-mid-grid">
        <article className="panel growth-table-card">
          <h3>Top Growing Organisations</h3>
          <TopGrowingOrganisations organisations={growth.topGrowingOrganisations} />
        </article>
        <article className="panel growth-role-card">
          <h3>User Growth by Role</h3>
          <GrowthRoleBars roles={growth.roleGrowth} />
        </article>
        <article className="panel growth-insights-card">
          <h3>Insights</h3>
          <GrowthInsights insights={growth.insights} />
        </article>
      </div>

      <GrowthFunnelSection funnel={growth.funnel} />
      <GrowthLeaderboard organisations={growth.topGrowingOrganisations} />
      <InvitePerformance performance={growth.invitePerformance} />

      <aside className="growth-momentum panel">
        <div className="growth-insight-icon">
          <LineChart size={17} />
        </div>
        <div>
          <strong>Keep the momentum going</strong>
          <span>Continue inviting your network and onboarding new organisations to strengthen growth signals.</span>
        </div>
        <button className="primary-button compact" type="button">
          <Users size={16} />
          Invite Users
        </button>
      </aside>
    </div>
  )
}

function RevenueKpiRow({ financials = {} }) {
  const metrics = financials.kpis?.length ? financials.kpis : []

  return (
    <section className="revenue-kpi-grid" aria-label="Revenue KPIs">
      {metrics.map((metric, index) => (
        <article className="growth-kpi-card revenue-kpi-card" key={metric.label}>
          <div className={`kpi-icon ${metric.accent || 'green'}`}>
            {metric.label.includes('Forecast') ? <LineChart size={18} /> : metric.label.includes('Organisation') ? <Building2 size={18} /> : metric.label.includes('Transaction') ? <FileText size={18} /> : <CircleDollarSign size={18} />}
          </div>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <em>{metric.change}</em>
          <small>{metric.comparison || 'vs previous period'}</small>
          <MiniLineChart compact data={sparklineForMetric(metric, index)} />
        </article>
      ))}
    </section>
  )
}

function RevenueSourceBreakdown({ sources = [] }) {
  const total = sources.reduce((sum, item) => sum + (Number(item.value) || 0), 0)

  return (
    <div className="revenue-source-layout">
      <DonutChart centerLabel="Total" data={sources} />
      <div className="revenue-source-list">
        {(sources.length ? sources : [{ label: 'Revenue', value: 0 }]).map((item) => {
          const percent = total ? Math.round((item.value / total) * 100) : 0
          return (
            <span key={item.label}>
              <b>{item.label}</b>
              <em>{percent}%</em>
              <strong>{formatMoney(item.value)}</strong>
            </span>
          )
        })}
      </div>
    </div>
  )
}

function RevenueComposition({ composition = [] }) {
  const rows = composition.length ? composition : [{ label: 'Recurring Revenue', percent: 0, value: formatMoney(0) }]

  return (
    <div className="revenue-composition-list">
      {rows.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <div>
            <i style={{ width: `${item.percent || 0}%` }} />
          </div>
          <em>{item.percent || 0}%</em>
        </div>
      ))}
    </div>
  )
}

function RevenueHealth({ health = {} }) {
  const rows = [
    { icon: CheckCircle2, label: 'Cash Collected', tone: 'success', value: health.cashCollected || formatMoney(0), meta: `${health.collectionRate || 0}%` },
    { icon: CreditCard, label: 'Outstanding', tone: 'warning', value: health.outstanding || formatMoney(0), meta: 'Open' },
    { icon: AlertTriangle, label: 'Overdue', tone: 'danger', value: health.overdue || formatMoney(0), meta: 'At risk' },
    { icon: Activity, label: 'Collection Rate', tone: 'success', value: `${health.collectionRate || 0}%`, meta: '+ healthy' },
    { icon: Calendar, label: 'Days Sales Outstanding', tone: 'success', value: String(health.daysSalesOutstanding || 0), meta: 'days' },
  ]

  return (
    <div className="revenue-health-list">
      {rows.map((item) => {
        const Icon = item.icon
        return (
          <div className={item.tone} key={item.label}>
            <Icon size={16} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <em>{item.meta}</em>
          </div>
        )
      })}
    </div>
  )
}

function RevenueOrganisationTable({ organisations = [], total = 0 }) {
  const rows = organisations.length ? organisations : []

  return (
    <div className="revenue-org-table">
      <div className="revenue-org-head">
        <span>Organisation</span>
        <span>Revenue</span>
        <span>% of Total</span>
        <span>Change</span>
      </div>
      {rows.length ? rows.slice(0, 6).map((organisation) => (
        <article key={organisation.id}>
          <div className="growth-org-cell">
            <span className="growth-org-avatar">{initialsForDisplay(organisation.name)}</span>
            <strong>{organisation.name}</strong>
          </div>
          <span>{organisation.revenueDisplay}</span>
          <span>{total ? safePercent(organisation.revenue, total) : 0}%</span>
          <em>{organisation.growth}</em>
        </article>
      )) : <EmptyData compact title="No organisation revenue yet" description="Revenue contribution appears as subscriptions and fees flow in." />}
    </div>
  )
}

function safePercent(value, total) {
  return total ? Math.round(((Number(value) || 0) / total) * 100) : 0
}

function RevenueForecastBars({ forecast = [] }) {
  const rows = forecast.length ? forecast : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((label) => ({ label, value: 0 }))
  const max = Math.max(...rows.map((row) => Number(row.value) || 0), 1)

  return (
    <div className="revenue-forecast-bars">
      <div className="revenue-bar-legend">
        <span><i />Actual</span>
        <span><i className="forecast" />Forecast</span>
      </div>
      <div className="revenue-bar-chart">
        {rows.map((item) => (
          <div className={item.forecast ? 'forecast' : ''} key={item.label}>
            <i style={{ height: `${item.value ? Math.max(8, (item.value / max) * 100) : 0}%` }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RevenueMetricStrip({ metrics = [] }) {
  return (
    <article className="panel revenue-metric-strip">
      {metrics.map((item) => (
        <span className={item.tone || 'neutral'} key={item.label}>
          <small>{item.label}</small>
          <strong>{item.value}</strong>
          <em>{item.change}</em>
        </span>
      ))}
    </article>
  )
}

function TransactionRevenueBreakdown({ breakdown = [], average = '' }) {
  const total = breakdown.reduce((sum, item) => sum + (Number(item.value) || 0), 0)

  return (
    <section className="section-block">
      <SectionTitle title="Transaction Revenue" />
      <article className="panel transaction-revenue-panel">
        <GrowthRoleBars roles={breakdown.map((item) => ({ label: item.label, value: item.value }))} />
        <div className="transaction-revenue-summary">
          <span>
            <small>Average Revenue / Transaction</small>
            <strong>{average || formatMoney(0)}</strong>
          </span>
          <span>
            <small>Total Transaction Revenue</small>
            <strong>{formatMoney(total)}</strong>
          </span>
        </div>
      </article>
    </section>
  )
}

function OutstandingRevenue({ outstanding = {} }) {
  return (
    <section className="section-block">
      <SectionTitle title="Invoices & Outstanding" />
      <article className="panel outstanding-revenue-panel">
        <div className="invite-performance-grid revenue-outstanding-summary">
          <span><small>Total Outstanding</small><strong>{outstanding.total || formatMoney(0)}</strong></span>
          <span><small>30 Days</small><strong>{outstanding.thirtyDays || formatMoney(0)}</strong></span>
          <span><small>60 Days</small><strong>{outstanding.sixtyDays || formatMoney(0)}</strong></span>
          <span><small>90+</small><strong>{outstanding.ninetyPlus || formatMoney(0)}</strong></span>
          <span><small>Bad Debt</small><strong>{outstanding.badDebtRate || '0%'}</strong></span>
        </div>
        <EmptyData compact title="No outstanding invoices loaded" description="Invoice ageing will populate when billing records are available." />
      </article>
    </section>
  )
}

function RevenueInsights({ insights = [] }) {
  return (
    <section className="section-block">
      <SectionTitle title="Executive Financial Insights" />
      <article className="panel growth-insights-card revenue-insights-card">
        <GrowthInsights insights={insights} />
      </article>
    </section>
  )
}

function RevenueDashboardView({ snapshot }) {
  const financials = snapshot.financials || {}
  const totalRevenue = financials.rawMonthlyRevenue || numberFromDisplay(financials.monthlyRevenue)

  return (
    <div className="revenue-dashboard">
      <RevenueKpiRow financials={financials} />

      <div className="revenue-top-grid">
        <article className="panel revenue-large-chart">
          <div className="panel-inline-heading">
            <h3>Revenue Over Time</h3>
            <select aria-label="Revenue interval" defaultValue="daily">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <GrowthAreaChart data={financials.revenueTrend} />
        </article>
        <article className="panel revenue-source-card">
          <h3>Revenue by Source</h3>
          <RevenueSourceBreakdown sources={financials.revenueSources} />
        </article>
        <article className="panel revenue-health-card">
          <h3>Revenue Composition</h3>
          <RevenueComposition composition={financials.composition} />
        </article>
      </div>

      <div className="revenue-mid-grid">
        <article className="panel revenue-org-card">
          <h3>Revenue by Organisation</h3>
          <RevenueOrganisationTable organisations={financials.revenueByOrganisation} total={totalRevenue} />
        </article>
        <article className="panel revenue-forecast-card">
          <div className="panel-inline-heading">
            <h3>Revenue Forecast</h3>
            <select aria-label="Forecast interval" defaultValue="monthly">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
          <RevenueForecastBars forecast={financials.revenueForecast} />
        </article>
        <article className="panel revenue-health-card">
          <h3>Revenue Health</h3>
          <RevenueHealth health={financials.health} />
        </article>
      </div>

      <section className="section-block">
        <SectionTitle title="Subscription Analytics" />
        <RevenueMetricStrip metrics={financials.subscriptionAnalytics || []} />
      </section>

      <TransactionRevenueBreakdown breakdown={financials.transactionBreakdown || []} average={financials.averageTransactionRevenue} />

      <section className="section-block">
        <SectionTitle title="Collections" />
        <article className="panel invite-performance-grid">
          <span><small>Invoices Issued</small><strong>{formatCount(financials.collections?.invoicesIssued || 0)}</strong></span>
          <span><small>Invoices Paid</small><strong>{formatCount(financials.collections?.invoicesPaid || 0)}</strong></span>
          <span><small>Outstanding</small><strong>{formatCount(financials.collections?.invoicesOutstanding || 0)}</strong></span>
          <span><small>Collection Rate</small><strong>{financials.collections?.collectionRate || 0}%</strong></span>
          <span><small>Avg. Collection Time</small><strong>{financials.collections?.averageCollectionTime || 'No invoice ageing yet'}</strong></span>
          <span><small>Avg. Invoice Value</small><strong>{financials.collections?.averageInvoiceValue || formatMoney(0)}</strong></span>
        </article>
      </section>

      <OutstandingRevenue outstanding={financials.outstandingRevenue} />
      <RevenueInsights insights={financials.insights} />
    </div>
  )
}

function FinancialSection({ financials, snapshot }) {
  const currentMonth = financials.monthlyRevenue || financials.forecast?.find((item) => item.label === 'Current Month')?.value || formatMoney(0)
  const currentMonthValue = numberFromDisplay(currentMonth)
  const arr = financials.arr || formatMoney(currentMonthValue * 12)
  const projectedMonth = financials.projectedMonthEnd || financials.forecast?.find((item) => item.label === 'Projected Month End')?.value || formatMoney(0)
  const transactionCount = Math.max((snapshot?.transactions || []).length, 1)
  const revenuePerTransaction = financials.averageTransactionRevenue || formatMoney(currentMonthValue / transactionCount)

  return (
    <section className="section-block">
      <SectionTitle title="Financial Overview" />
      <article className="panel chart-panel financial-overview-panel">
        <div className="financial-summary-grid">
          <span>
            <small>MRR</small>
            <strong>{currentMonth}</strong>
          </span>
          <span>
            <small>ARR</small>
            <strong>{arr}</strong>
          </span>
          <span>
            <small>Forecast</small>
            <strong>{projectedMonth}</strong>
          </span>
          <span>
            <small>Avg. Revenue / Org</small>
            <strong>{financials.revenuePerOrganisation || formatMoney(0)}</strong>
          </span>
          <span>
            <small>Avg. Transaction Revenue</small>
            <strong>{revenuePerTransaction}</strong>
          </span>
        </div>
        <div className="financial-chart-grid">
          <section>
            <h3>Revenue by Source</h3>
            <DonutChart centerLabel="Revenue" data={financials.revenueSources} />
          </section>
          <section>
            <h3>Revenue Trend</h3>
            <MiniLineChart data={financials.revenueTrend} />
          </section>
        </div>
      </article>
    </section>
  )
}

function AttentionSection({ attention }) {
  const iconFor = (item) => {
    const detail = `${item.title} ${item.detail}`.toLowerCase()
    if (detail.includes('transaction')) return Database
    if (detail.includes('trial') || detail.includes('subscription')) return CreditCard
    if (detail.includes('invite')) return UserCog
    if (detail.includes('document')) return FileText
    return AlertTriangle
  }

  return (
    <section className="section-block attention-grid">
      <article className="panel chart-panel">
        <h3>Attention Required</h3>
        {attention.length ? (
          <div className="attention-list">
            {attention.map((item) => (
              <div className={item.severity} key={item.id}>
                {(() => {
                  const Icon = iconFor(item)
                  return <Icon size={16} />
                })()}
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
                <time>{item.time}</time>
                <button type="button">View</button>
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
  const metrics = [
    ...(ecosystem.metrics || []),
    { label: 'Total Participants', value: ecosystem.total || 0, total: true },
  ]

  return (
    <section className="section-block">
      <SectionTitle title="Ecosystem Overview" />
      <article className="panel ecosystem-panel">
        <div className="ecosystem-grid">
          {metrics.map((item) => (
            <div className={item.total ? 'ecosystem-total-metric' : ''} key={item.label}>
              <Users size={18} />
              <span>{item.label}</span>
              <strong>{formatCount(item.value)}</strong>
              <em>{item.total && ecosystem.change ? `${ecosystem.change} this period` : item.value ? '+ active' : '-'}</em>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}

function dashboardDelta(metric = {}) {
  const current = Number(metric.currentPeriod) || 0
  const previous = Number(metric.previousPeriod) || 0
  if (!current && !previous) return { label: 'No change this period', tone: 'neutral' }
  if (!previous) return { label: `+${formatCount(current)} this period`, tone: 'positive' }
  const change = Math.round(((current - previous) / previous) * 100)
  return {
    label: `${change > 0 ? '+' : ''}${change}% vs previous period`,
    tone: change >= 0 ? 'positive' : 'negative',
  }
}

function formatDashboardTimestamp(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return 'Awaiting first refresh'
  return `Updated ${new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date)}`
}

function formatLeadType(value = '') {
  return String(value || 'New business')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function CeoMetricCard({ accent, actionLabel = '', icon: Icon, label, metric = {}, onAction, revenue = false }) {
  const available = !revenue || metric.available
  const delta = revenue
    ? metric.targetProgress == null
      ? { label: 'Target not configured', tone: 'neutral' }
      : { label: `${metric.targetProgress}% of monthly target`, tone: 'positive' }
    : dashboardDelta(metric)

  return (
    <article className={`ceo-metric-card ${accent}`}>
      <div className="ceo-metric-heading">
        <span className="ceo-metric-icon"><Icon size={18} /></span>
        <span>{label}</span>
      </div>
      <strong>{available ? (revenue ? formatMoney((Number(metric.valueCents) || 0) / 100) : formatCount(metric.value)) : '—'}</strong>
      <p className={delta.tone}>{available ? delta.label : 'Recognised revenue unavailable'}</p>
      {revenue && metric.targetProgress != null ? (
        <div className="ceo-target-track" aria-label={`${metric.targetProgress}% of revenue target`}>
          <span style={{ width: `${Math.min(100, Math.max(0, Number(metric.targetProgress) || 0))}%` }} />
        </div>
      ) : null}
      {actionLabel && onAction ? <button className="ceo-metric-action" onClick={onAction} type="button">{actionLabel}<ArrowRight size={14} /></button> : null}
    </article>
  )
}

function CeoMetricGrid({ metrics = {}, onSetRevenueTarget }) {
  return (
    <section className="ceo-metric-grid" aria-label="Company overview">
      <CeoMetricCard accent="agents" icon={UserRoundCheck} label="Active agents" metric={metrics.activeAgents} />
      <CeoMetricCard accent="listings" icon={Building2} label="Active listings" metric={metrics.activeListings} />
      <CeoMetricCard accent="transactions" icon={BarChart3} label="Active transactions" metric={metrics.activeTransactions} />
      <CeoMetricCard accent="revenue" actionLabel="Set monthly target" icon={CircleDollarSign} label="Revenue this month" metric={metrics.revenueMtd} onAction={onSetRevenueTarget} revenue />
    </section>
  )
}

function NewBusinessIntake({ leads = [], onManageLead }) {
  return (
    <section className="ceo-section" id="new-business-intake">
      <div className="ceo-section-heading">
        <div>
          <p>Sales intake</p>
          <h2>New business enquiries</h2>
        </div>
        <span>{leads.length} in queue</span>
      </div>
      {leads.length ? (
        <div className="lead-card-row" role="list" tabIndex="0" aria-label="New business enquiry queue">
          {leads.map((lead) => (
            <article className="lead-intake-card" key={lead.id} role="listitem">
              <div className="lead-intake-topline">
                <span className="lead-type-badge">{formatLeadType(lead.organisationType)}</span>
                <span className={`lead-priority ${lead.priority || 'normal'}`}>{formatLeadType(lead.priority || 'normal')}</span>
              </div>
              <div>
                <h3>{lead.organisationName || lead.contactName || 'New enquiry'}</h3>
                <p>{lead.contactName || 'Contact not supplied'}</p>
              </div>
              <dl>
                <div><dt>Stage</dt><dd>{formatLeadType(lead.stage || 'new')}</dd></div>
                <div><dt>Volume</dt><dd>{lead.monthlyVolume || lead.businessSize || 'Not supplied'}</dd></div>
                <div><dt>Next action</dt><dd>{lead.nextAction || (lead.assignedToUserId ? 'Follow up' : 'Assign owner')}</dd></div>
              </dl>
              <div className="lead-intake-actions">
                {lead.email ? <a href={`mailto:${lead.email}`}><Mail size={15} /> Email</a> : null}
                {lead.phone ? <a href={`tel:${lead.phone}`}><Phone size={15} /> Call</a> : null}
                <button onClick={() => onManageLead(lead.id)} type="button">Manage <ArrowRight size={14} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="ceo-empty-state"><CheckCircle2 size={20} /><div><strong>Intake queue is clear</strong><span>New website enquiries will appear here automatically.</span></div></div>
      )}
    </section>
  )
}

function toLocalDateTimeInput(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function leadWorkflowForm(lead = {}) {
  return {
    assignedToUserId: lead.assignedToUserId || '',
    internalNotes: lead.internalNotes || '',
    lostReason: lead.lostReason || '',
    nextAction: lead.nextAction || '',
    nextActionAt: toLocalDateTimeInput(lead.nextActionAt),
    priority: lead.priority || 'normal',
    salesStage: lead.stage || 'new',
  }
}

function LeadWorkflowDrawer({ leadId, onClose, onSaved }) {
  const [workflow, setWorkflow] = useState(null)
  const [form, setForm] = useState(leadWorkflowForm())
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleEscape(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)

    async function loadWorkflow() {
      setIsLoading(true)
      setError('')
      try {
        const nextWorkflow = await loadCeoLeadWorkflow(leadId)
        if (cancelled) return
        setWorkflow(nextWorkflow)
        setForm(leadWorkflowForm(nextWorkflow.lead))
      } catch (nextError) {
        if (!cancelled) setError(nextError.message || 'Unable to load this lead.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadWorkflow()
    return () => {
      cancelled = true
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [leadId])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSave(event) {
    event.preventDefault()
    if (form.salesStage === 'lost' && !form.lostReason.trim()) {
      setError('Add a reason before marking this lead as lost.')
      return
    }

    const original = leadWorkflowForm(workflow?.lead)
    const patch = {}
    for (const field of ['assignedToUserId', 'priority', 'salesStage', 'nextAction', 'lostReason', 'internalNotes']) {
      if (form[field] !== original[field]) patch[field] = form[field]
    }
    if (form.nextActionAt !== original.nextActionAt) {
      patch.nextActionAt = form.nextActionAt ? new Date(form.nextActionAt).toISOString() : ''
    }
    if (!Object.keys(patch).length) {
      setError('Make at least one change before saving.')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      await updateCeoLeadWorkflow(leadId, patch)
      await onSaved()
      onClose()
    } catch (nextError) {
      setError(nextError.message || 'Unable to save this lead.')
    } finally {
      setIsSaving(false)
    }
  }

  const lead = workflow?.lead
  return (
    <div className="lead-workflow-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside aria-labelledby="lead-workflow-title" aria-modal="true" className="lead-workflow-drawer" role="dialog">
        <header>
          <div><p>Business intake</p><h2 id="lead-workflow-title">Manage lead</h2></div>
          <button aria-label="Close lead workflow" className="icon-button light" onClick={onClose} type="button"><X size={18} /></button>
        </header>
        {isLoading ? <div className="lead-workflow-loading"><RefreshCw className="spin" size={20} /><span>Loading lead workflow…</span></div> : null}
        {!isLoading && error && !workflow ? <div className="notice danger"><AlertTriangle size={16} /><span>{error}</span></div> : null}
        {!isLoading && lead ? (
          <form onSubmit={handleSave}>
            <section className="lead-workflow-identity">
              <span>{formatLeadType(lead.organisationType)}</span>
              <h3>{lead.organisationName || lead.contactName || 'New business enquiry'}</h3>
              <p>{lead.contactName || 'Contact not supplied'}</p>
              <div>
                {lead.email ? <a href={`mailto:${lead.email}`}><Mail size={15} /> {lead.email}</a> : null}
                {lead.phone ? <a href={`tel:${lead.phone}`}><Phone size={15} /> {lead.phone}</a> : null}
              </div>
            </section>

            <section className="lead-workflow-fields">
              <label><span>Owner</span><select autoFocus onChange={(event) => updateField('assignedToUserId', event.target.value)} value={form.assignedToUserId}><option value="">Unassigned</option>{workflow.assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}{assignee.role ? ` · ${formatLeadType(assignee.role)}` : ''}</option>)}</select></label>
              <div className="lead-workflow-field-row">
                <label><span>Priority</span><select onChange={(event) => updateField('priority', event.target.value)} value={form.priority}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                <label><span>Sales stage</span><select onChange={(event) => updateField('salesStage', event.target.value)} value={form.salesStage}><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="demo_scheduled">Demo scheduled</option><option value="proposal">Proposal</option><option value="won">Won</option><option value="lost">Lost</option><option value="spam">Spam</option></select></label>
              </div>
              <label><span>Next action</span><input onChange={(event) => updateField('nextAction', event.target.value)} placeholder="e.g. Call to confirm demo attendees" value={form.nextAction} /></label>
              <label><span>Next action date</span><input onChange={(event) => updateField('nextActionAt', event.target.value)} type="datetime-local" value={form.nextActionAt} /></label>
              {form.salesStage === 'lost' ? <label><span>Lost reason</span><input onChange={(event) => updateField('lostReason', event.target.value)} placeholder="Why was this opportunity lost?" required value={form.lostReason} /></label> : null}
              <label><span>Internal notes</span><textarea onChange={(event) => updateField('internalNotes', event.target.value)} placeholder="Context for the next person working this lead" rows="5" value={form.internalNotes} /></label>
            </section>

            {error ? <div className="notice danger"><AlertTriangle size={16} /><span>{error}</span></div> : null}
            <footer><button className="secondary-button compact" onClick={onClose} type="button">Cancel</button><button className="primary-button compact" disabled={isSaving} type="submit">{isSaving ? <RefreshCw className="spin" size={16} /> : <CheckCircle2 size={16} />} Save changes</button></footer>
          </form>
        ) : null}
      </aside>
    </div>
  )
}

function revenueTargetMonth(value) {
  const date = new Date(value)
  const target = Number.isNaN(date.getTime()) ? new Date() : date
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-01`
}

function RevenueTargetDialog({ dashboard, onClose, onSaved }) {
  const revenue = dashboard.metrics?.revenueMtd || {}
  const [amount, setAmount] = useState(revenue.targetCents == null ? '' : String(Number(revenue.targetCents) / 100))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const monthStart = revenueTargetMonth(dashboard.generatedAt)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function handleEscape(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      await setCeoRevenueTarget({ monthStart, notes, targetAmount: amount })
      await onSaved()
      onClose()
    } catch (nextError) {
      setError(nextError.message || 'Unable to update the revenue target.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="lead-workflow-overlay revenue-target-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-labelledby="revenue-target-title" aria-modal="true" className="revenue-target-dialog" role="dialog">
        <header><div><p>Executive control</p><h2 id="revenue-target-title">Monthly revenue target</h2></div><button aria-label="Close revenue target" className="icon-button light" onClick={onClose} type="button"><X size={18} /></button></header>
        <form onSubmit={handleSubmit}>
          <div className="revenue-target-period"><Calendar size={17} /><div><span>Target period</span><strong>{new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric' }).format(new Date(`${monthStart}T12:00:00`))}</strong></div></div>
          <label><span>Target amount</span><div className="currency-input"><b>R</b><input autoFocus inputMode="decimal" min="0" onChange={(event) => setAmount(event.target.value)} placeholder="250 000" required step="1000" type="number" value={amount} /></div></label>
          <label><span>Executive note <em>Optional</em></span><textarea onChange={(event) => setNotes(event.target.value)} placeholder="Context behind this month’s target" rows="4" value={notes} /></label>
          <p className="revenue-target-audit"><ShieldCheck size={15} />Changes are recorded in the platform audit trail.</p>
          {error ? <div className="notice danger"><AlertTriangle size={16} /><span>{error}</span></div> : null}
          <footer><button className="secondary-button compact" onClick={onClose} type="button">Cancel</button><button className="primary-button compact" disabled={isSaving} type="submit">{isSaving ? <RefreshCw className="spin" size={16} /> : <Target size={16} />} Save target</button></footer>
        </form>
      </section>
    </div>
  )
}

function AttentionRequired({ items = [], onOpenPath }) {
  const activeItems = items.filter((item) => Number(item.value) > 0)
  return (
    <article className="ceo-panel ceo-attention-panel">
      <div className="ceo-panel-heading">
        <div><p>Operations</p><h2>Attention required</h2></div>
        <span className={activeItems.length ? 'attention-count' : 'attention-count clear'}>{activeItems.length}</span>
      </div>
      {activeItems.length ? (
        <div className="ceo-attention-list">
          {activeItems.map((item) => (
            <button key={item.key} onClick={() => onOpenPath(item.path)} type="button">
              <span className={`attention-indicator ${item.severity}`}><AlertTriangle size={16} /></span>
              <span><strong>{item.label}</strong><small>{item.severity === 'critical' ? 'Resolve as soon as possible' : 'Review and assign an owner'}</small></span>
              <b>{formatCount(item.value)}</b>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <div className="ceo-empty-state"><CheckCircle2 size={20} /><div><strong>No urgent exceptions</strong><span>All monitored queues are within their thresholds.</span></div></div>
      )}
    </article>
  )
}

function BusinessPulse({ pulse = {} }) {
  const rows = [
    { key: 'leadConversion', label: 'Lead conversion' },
    { key: 'onboardingCompletion', label: 'Onboarding completion' },
    { key: 'transactionCompletion', label: 'Transaction completion' },
    { key: 'revenueTarget', label: 'Revenue target' },
  ]
  return (
    <article className="ceo-panel">
      <div className="ceo-panel-heading"><div><p>Performance</p><h2>Business pulse</h2></div><Target size={19} /></div>
      <div className="business-pulse-list">
        {rows.map((row) => {
          const value = pulse[row.key]
          const percentage = value == null ? null : Math.min(100, Math.max(0, Number(value) || 0))
          return (
            <div key={row.key}>
              <span><strong>{row.label}</strong><b>{percentage == null ? 'Awaiting data' : `${value}%`}</b></span>
              <div className={percentage == null ? 'pulse-track unavailable' : 'pulse-track'}><span style={{ width: `${percentage || 0}%` }} /></div>
            </div>
          )
        })}
      </div>
    </article>
  )
}

function TopOrganisations({ onOpenOrganisation, organisations = [] }) {
  return (
    <article className="ceo-panel ceo-top-organisations">
      <div className="ceo-panel-heading"><div><p>Portfolio</p><h2>Top organisations</h2></div><Building2 size={19} /></div>
      {organisations.length ? (
        <ol>
          {organisations.map((organisation, index) => (
            <li key={organisation.id}>
              <button onClick={() => onOpenOrganisation(organisation.id)} type="button">
                <span>{index + 1}</span>
                <div><strong>{organisation.name}</strong><small>{formatCount(organisation.activeTransactions)} active transactions</small></div>
                <b>{formatMoney((Number(organisation.revenueCents) || 0) / 100)}</b>
                <ArrowRight size={14} />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="ceo-empty-state"><Building2 size={20} /><div><strong>No ranked organisations yet</strong><span>Recognised revenue and active transactions determine this list.</span></div></div>
      )}
    </article>
  )
}

function CeoDashboardSkeleton() {
  return <div className="ceo-dashboard-skeleton" aria-label="Loading CEO dashboard" aria-busy="true"><div /><div /><div /><div /><section /><section /></div>
}

function ExecutiveDashboardView({ isLoading, isOnline, onOpenOrganisation, onOpenPath, onRefresh, refreshError, snapshot }) {
  const [managedLeadId, setManagedLeadId] = useState('')
  const [isRevenueTargetOpen, setIsRevenueTargetOpen] = useState(false)
  const dashboard = snapshot.ceoDashboard || EMPTY_SNAPSHOT.ceoDashboard
  const generatedAt = new Date(dashboard.generatedAt)
  const isStale = dashboard.generatedAt && !Number.isNaN(generatedAt.getTime()) && Date.now() - generatedAt.getTime() > 5 * 60 * 1000
  if (isLoading && !dashboard.available) return <CeoDashboardSkeleton />
  if (!dashboard.available) {
    return (
      <section className="ceo-dashboard-unavailable">
        <AlertTriangle size={24} />
        <div><h2>CEO dashboard data is unavailable</h2><p>{dashboard.error || 'The secured dashboard service has not returned data.'}</p></div>
        <button className="secondary-button compact" onClick={onRefresh} type="button"><RefreshCw size={16} /> Retry</button>
      </section>
    )
  }

  return (
    <div className={isLoading ? 'ceo-dashboard is-refreshing' : 'ceo-dashboard'}>
      <div className="ceo-dashboard-status">
        <span className={!isOnline || isStale ? 'stale' : ''}><i /> {!isOnline ? 'Offline · showing last update' : isLoading ? 'Refreshing platform data' : isStale ? 'Data may be stale' : 'Live platform data'}</span>
        <time>{formatDashboardTimestamp(dashboard.generatedAt)}</time>
      </div>
      {refreshError ? <div className="ceo-warning-strip"><AlertTriangle size={16} /><span>{refreshError}</span></div> : null}
      {dashboard.warnings.length ? (
        <div className="ceo-warning-strip"><AlertTriangle size={16} /><span>{dashboard.warnings.map((warning) => warning.message).join(' ')}</span></div>
      ) : null}
      <CeoMetricGrid metrics={dashboard.metrics} onSetRevenueTarget={() => setIsRevenueTargetOpen(true)} />
      <NewBusinessIntake leads={dashboard.newBusinessIntake} onManageLead={setManagedLeadId} />
      <section className="ceo-insight-grid">
        <AttentionRequired items={dashboard.attention} onOpenPath={onOpenPath} />
        <BusinessPulse pulse={dashboard.businessPulse} />
        <TopOrganisations onOpenOrganisation={onOpenOrganisation} organisations={dashboard.topOrganisations} />
      </section>
      {managedLeadId ? (
        <LeadWorkflowDrawer leadId={managedLeadId} onClose={() => setManagedLeadId('')} onSaved={onRefresh} />
      ) : null}
      {isRevenueTargetOpen ? (
        <RevenueTargetDialog dashboard={dashboard} onClose={() => setIsRevenueTargetOpen(false)} onSaved={onRefresh} />
      ) : null}
    </div>
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

function ExecutiveAttentionContext({ context, onClear }) {
  if (!context) return null
  return (
    <div className="executive-attention-context">
      <span className="attention-indicator critical"><AlertTriangle size={15} /></span>
      <div><strong>{context.label}</strong><span>Opened from the CEO dashboard attention queue.</span></div>
      <button onClick={onClear} type="button">Clear context <X size={14} /></button>
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

function RoleplayerCard({ isSelected, onManageLegalTemplates, onSelect, roleplayer }) {
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
            <button onClick={onManageLegalTemplates} type="button">Legal Templates</button>
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

const ORGANISATION_STATUS_FILTERS = ['All', 'Active', 'Inactive', 'Suspended']
const ORGANISATION_HEALTH_FILTERS = ['All', 'Good', 'Needs Attention', 'At Risk']
const ORGANISATION_PLAN_FILTERS = ['All', 'Free', 'Basic', 'Pro', 'Enterprise']
const ORGANISATION_SORTS = ['Most Active', 'Newest', 'Revenue', 'Users', 'Health']

function OrganisationKpiStrip({ organisations = [] }) {
  const totalUsers = organisations.reduce((sum, organisation) => sum + (organisation.userCount || 0), 0)
  const totalRevenue = organisations.reduce((sum, organisation) => sum + (organisation.revenue || 0), 0)
  const atRisk = organisations.filter((organisation) => organisation.health?.tone === 'danger').length
  const active = organisations.filter((organisation) => normalizeDisplayToken(organisation.status).includes('active') || organisation.health?.tone === 'success').length
  const now = new Date()
  const newThisMonth = organisations.filter((organisation) => {
    const date = new Date(organisation.createdAt || '')
    return !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  }).length
  const metrics = [
    { change: '+18%', icon: Users, label: 'Total Organisations', value: formatCount(organisations.length) },
    { change: '+21%', icon: Users, label: 'Active Organisations', value: formatCount(active) },
    { change: '+33%', icon: LineChart, label: 'New This Month', value: formatCount(newThisMonth) },
    { change: '+2%', icon: AlertTriangle, label: 'At Risk', tone: 'danger', value: formatCount(atRisk) },
    { change: '+16%', icon: Users, label: 'Total Users', value: formatCount(totalUsers) },
    { change: '+18%', icon: CreditCard, label: 'Total Revenue / MRR', value: formatMoney(totalRevenue) },
  ]

  return (
    <section className="organisation-kpi-strip" aria-label="Organisation summary">
      {metrics.map((metric) => {
        const Icon = metric.icon
        return (
          <article className={metric.tone || ''} key={metric.label}>
            <Icon size={17} />
            <div>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <em>{metric.change} vs previous 30 days</em>
            </div>
            <MiniLineChart compact data={sparklineForMetric({ value: metric.value }, 0)} />
          </article>
        )
      })}
    </section>
  )
}

function normalizeDisplayToken(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function organisationMatchesType(organisation, filter) {
  if (filter === 'All') return true
  return roleplayerFilterMatches(organisation, filter)
}

function organisationMatchesStatus(organisation, filter) {
  if (filter === 'All') return true
  const status = normalizeDisplayToken(organisation.status)
  if (filter === 'Active') return status.includes('active') || organisation.health?.tone === 'success'
  if (filter === 'Inactive') return status.includes('inactive') || status.includes('disabled')
  if (filter === 'Suspended') return status.includes('suspended') || status.includes('blocked')
  return true
}

function organisationMatchesHealth(organisation, filter) {
  if (filter === 'All') return true
  return organisation.health?.label === filter
}

function organisationMatchesPlan(organisation, filter) {
  if (filter === 'All') return true
  return normalizeDisplayToken(organisation.subscriptionPlan).includes(normalizeDisplayToken(filter))
}

function OrganisationCard({ onManageLegalTemplates, onOpen, organisation }) {
  return (
    <article className="organisation-card" onClick={onOpen}>
      <div className="organisation-card-top">
        <RoleplayerLogo roleplayer={organisation} />
        <div>
          <h3>{organisation.name}</h3>
          <div>
            <span className={`type-badge ${roleplayerTypeClass(organisation.type)}`}>{organisation.type}</span>
            <span className={`status-dot ${organisation.health.tone}`}>{organisation.status}</span>
          </div>
        </div>
        <details className="card-actions" onClick={(event) => event.stopPropagation()}>
          <summary aria-label={`Actions for ${organisation.name}`}>
            <MoreVertical size={18} />
          </summary>
          <div>
            <button onClick={onOpen} type="button">View Workspace</button>
            <button type="button">Manage Users</button>
            <button type="button">Billing</button>
            <button type="button">Permissions</button>
            <button onClick={onManageLegalTemplates} type="button">Legal Templates</button>
            <button className="danger" type="button">Suspend Access</button>
          </div>
        </details>
      </div>
      <div className="organisation-card-metrics">
        <span>
          <small>Users</small>
          <strong>{formatCount(organisation.userCount)}</strong>
        </span>
        <span>
          <small>{organisation.activeWorkloadLabel}</small>
          <strong>{formatCount(organisation.activeWorkload)}</strong>
        </span>
        <span>
          <small>Revenue / MRR</small>
          <strong>{organisation.revenueDisplay}</strong>
        </span>
      </div>
      <MiniLineChart compact data={sparklineForMetric({ value: organisation.revenue }, 0)} />
      <footer>
        <span className={`health-dot ${organisation.health.tone}`}>Health: {organisation.health.label}</span>
        <span>Last activity: {organisation.lastActivity}</span>
      </footer>
    </article>
  )
}

function OrganisationTable({ organisations = [], onManageLegalTemplates, onOpen }) {
  return (
    <div className="organisation-table">
      <div className="organisation-table-head">
        <span>Organisation</span>
        <span>Type</span>
        <span>Status</span>
        <span>Users</span>
        <span>Active Workspaces</span>
        <span>Revenue / MRR</span>
        <span>Health</span>
        <span>Last Activity</span>
        <span>Actions</span>
      </div>
      {organisations.length ? organisations.map((organisation) => (
        <article key={organisation.id}>
          <button className="organisation-table-name" onClick={() => onOpen(organisation)} type="button">
            <RoleplayerLogo roleplayer={organisation} size="mini" />
            <strong>{organisation.name}</strong>
          </button>
          <span>{organisation.type}</span>
          <span>{organisation.status}</span>
          <span>{formatCount(organisation.userCount)}</span>
          <span>{formatCount(organisation.activeWorkload)}</span>
          <span>{organisation.revenueDisplay}</span>
          <span className={`health-dot ${organisation.health.tone}`}>{organisation.health.label}</span>
          <span>{organisation.lastActivity}</span>
          <details className="card-actions">
            <summary aria-label={`Actions for ${organisation.name}`}>
              <MoreVertical size={18} />
            </summary>
            <div>
              <button onClick={() => onOpen(organisation)} type="button">View Workspace</button>
              <button onClick={() => onManageLegalTemplates(organisation)} type="button">Legal Templates</button>
              <button type="button">Manage Users</button>
              <button className="danger" type="button">Suspend Access</button>
            </div>
          </details>
        </article>
      )) : <EmptyData compact title="No organisations found" description="Try adjusting your filters or search term." />}
    </div>
  )
}

const ORGANISATION_WORKSPACE_TABS = [
  'Overview',
  'Users',
  'Transactions',
  'Financials',
  'Workspaces',
  'Documents',
  'Legal Templates',
  'Activity',
  'Settings',
]

const ORGANISATION_ACTIVITY_METRICS = ['Revenue', 'Users', 'Transactions', 'Documents', 'Logins']

function organisationWorkspaceTrend(organisation, metric) {
  const base = {
    Documents: organisation.workspaceCards?.find((card) => card.label === 'Documents')?.value || 0,
    Logins: organisation.userCount || 0,
    Revenue: organisation.revenue || 0,
    Transactions: organisation.activeWorkload || 0,
    Users: organisation.userCount || 0,
  }[metric] || 0

  return ['30 Apr', '7 May', '14 May', '21 May', '28 May'].map((label, index) => ({
    label,
    value: Math.round(base * (0.45 + index * 0.13 + (index % 2 ? 0.08 : 0))),
  }))
}

function OrganisationWorkspaceHeader({ onBack, onEdit, onManageLegalTemplates, organisation }) {
  return (
    <>
      <div className="organisation-workspace-breadcrumb">
        <button onClick={onBack} type="button">
          <ArrowLeft size={15} />
          Organisations
        </button>
        <span>/</span>
        <strong>{organisation.name}</strong>
      </div>
      <section className="organisation-workspace-hero">
        <div className="organisation-workspace-profile">
          <RoleplayerLogo roleplayer={organisation} size="workspace" />
          <div>
            <h1>{organisation.name}</h1>
            <div className="organisation-workspace-pills">
              <span className={`status-dot ${organisation.health.tone}`}>{organisation.status}</span>
              <span className={`type-badge ${roleplayerTypeClass(organisation.type)}`}>{organisation.type}</span>
            </div>
            <div className="organisation-workspace-contact">
              <span>Joined {organisation.joinedDate}</span>
              <span>Reg {organisation.registrationNumber || 'Not set'}</span>
              <span>{organisation.contactEmail}</span>
              <span>{organisation.contactPhone || 'No phone'}</span>
              <span>{organisation.website || 'No website'}</span>
            </div>
          </div>
        </div>
        <div className="organisation-workspace-header-actions">
          <button className="secondary-button compact" type="button">
            <Calendar size={15} />
            30 Apr - 30 May 2024
          </button>
          <button className="secondary-button compact" type="button">
            <RefreshCw size={15} />
            Refresh
          </button>
          <details className="workspace-actions-menu">
            <summary>
              Actions
              <MoreVertical size={15} />
            </summary>
            <div>
              <button onClick={onEdit} type="button">Edit Organisation</button>
              <button onClick={onEdit} type="button">Upload / Change Logo</button>
              <button type="button">Manage Users</button>
              <button onClick={onManageLegalTemplates} type="button">Manage Legal Templates</button>
              <button type="button">Manage Billing</button>
              <button type="button">Manage Permissions</button>
              <button className="danger" type="button">Suspend Access</button>
            </div>
          </details>
        </div>
        <article className="organisation-workspace-health-card">
          <div className={`health-ring ${organisation.health.tone}`} style={{ '--score': `${organisation.healthScore || 0}%` }}>
            <strong>{organisation.healthScore || 0}</strong>
            <span>/100</span>
          </div>
          <div>
            <span className={`health-dot ${organisation.health.tone}`}>{organisation.health.label}</span>
            <p>{organisation.healthReason || 'No immediate risks detected'}</p>
            <small>Last checked: {organisation.lastActivity}</small>
          </div>
        </article>
      </section>
    </>
  )
}

function OrganisationWorkspaceKpis({ organisation }) {
  const workspaceCount = organisation.workspaceCards?.length || 0
  const kpis = [
    { icon: Users, label: 'Users', value: formatCount(organisation.userCount), change: '+12%' },
    { icon: Database, label: organisation.activeWorkloadLabel, value: formatCount(organisation.activeWorkload), change: '+27%' },
    { icon: CreditCard, label: 'MRR', value: organisation.revenueDisplay, change: '+18%' },
    { icon: CircleDollarSign, label: 'Revenue This Month', value: organisation.revenueDisplay, change: '+24%' },
    { icon: AlertTriangle, label: 'Open Issues', value: formatCount(organisation.openIssues), change: '+25%' },
    { icon: FileText, label: 'Workspaces', value: formatCount(workspaceCount), caption: 'View all workspaces' },
  ]

  return (
    <section className="organisation-workspace-kpis" aria-label="Organisation KPIs">
      {kpis.map((item) => {
        const Icon = item.icon
        return (
          <article key={item.label}>
            <Icon size={18} />
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <em>{item.caption || `${item.change} vs prev. 30 days`}</em>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function DetailList({ rows = [] }) {
  return (
    <dl className="organisation-detail-list">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value || 'Not set'}</dd>
        </div>
      ))}
    </dl>
  )
}

function OrganisationOverviewTab({ activityMetric, onActivityMetricChange, onEdit, organisation, notes, onNotesChange }) {
  const detailRows = [
    { label: 'Organisation Type', value: organisation.type },
    { label: 'Registration Number', value: organisation.registrationNumber },
    { label: 'VAT Number', value: organisation.vatNumber },
    { label: 'Industry', value: organisation.industry },
    { label: 'Primary Contact', value: organisation.primaryContactName },
    { label: 'Email', value: organisation.contactEmail },
    { label: 'Phone', value: organisation.contactPhone },
    { label: 'Website', value: organisation.website },
    { label: 'Address', value: organisation.address },
    { label: 'Billing Email', value: organisation.billingEmail },
  ]
  const checks = [
    ['Subscription', organisation.billing?.subscriptionStatus || organisation.status],
    ['Payment Method', organisation.billing?.paymentMethodStatus || 'Valid'],
    ['Users', organisation.userCount ? 'Healthy' : 'Needs users'],
    [organisation.activeWorkloadLabel.replace('Active ', ''), organisation.activeWorkload ? 'Healthy' : 'No active work'],
    ['Documents', 'Healthy'],
    ['Workspaces', 'Healthy'],
    ['Legal Templates', 'Healthy'],
  ]

  return (
    <>
      <OrganisationWorkspaceKpis organisation={organisation} />
      <div className="organisation-workspace-grid">
        <article className="panel workspace-activity-panel">
          <div className="panel-inline-heading">
            <h3>Activity Overview</h3>
            <select onChange={(event) => onActivityMetricChange(event.target.value)} value={activityMetric}>
              {ORGANISATION_ACTIVITY_METRICS.map((metric) => <option key={metric}>{metric}</option>)}
            </select>
          </div>
          <GrowthAreaChart data={organisationWorkspaceTrend(organisation, activityMetric)} />
          <div className="organisation-mini-metrics">
            <WorkspaceMetric label="New Users" value={Math.max(1, Math.round(organisation.userCount * 0.1))} />
            <WorkspaceMetric label="New Transactions" value={Math.max(0, Math.round(organisation.activeWorkload * 0.22))} />
            <WorkspaceMetric label="User Logins" value={Math.max(0, organisation.userCount * 4)} />
            <WorkspaceMetric label="Documents Uploaded" value={organisation.workspaceCards?.find((card) => card.label === 'Documents')?.value || 0} />
          </div>
        </article>

        <article className="panel organisation-recent-card">
          <div className="panel-heading">
            <h2>Recent Activity</h2>
            <button className="text-button success" type="button">View all activity</button>
          </div>
          <div className="organisation-activity-list">
            {organisation.activityFeed?.length ? organisation.activityFeed.map((item) => (
              <div key={item.id}>
                <CircleDot size={16} />
                <span>{item.text}</span>
                <time>{item.time}</time>
              </div>
            )) : <EmptyData compact title="No recent activity" description="Activity will appear once this organisation uses the platform." />}
          </div>
        </article>

        <article className="panel organisation-details-card">
          <div className="panel-heading">
            <h2>Organisation Details</h2>
            <button className="secondary-button compact" onClick={onEdit} type="button">Edit</button>
          </div>
          <DetailList rows={detailRows} />
        </article>

        <article className="panel organisation-workspaces-card">
          <div className="panel-heading">
            <h2>Workspaces</h2>
            <button className="text-button success" type="button">View all</button>
          </div>
          <div className="organisation-workspace-tiles">
            {organisation.workspaceCards.map((card) => (
              <button key={card.label} type="button">
                <FileText size={17} />
                <strong>{card.label}</strong>
                <span>{typeof card.value === 'number' ? formatCount(card.value) : card.value} {card.meta}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel organisation-billing-card">
          <div className="panel-heading">
            <h2>Subscription & Billing</h2>
            <button className="text-button success" type="button">Manage</button>
          </div>
          <DetailList rows={[
            { label: 'Plan', value: organisation.billing?.plan || organisation.subscriptionPlan },
            { label: 'Status', value: organisation.billing?.subscriptionStatus || organisation.status },
            { label: 'Billing Cycle', value: organisation.billing?.billingCycle },
            { label: 'Next Billing Date', value: organisation.billing?.nextBillingDate },
            { label: 'Amount', value: organisation.billing?.subscriptionFees },
            { label: 'MRR', value: organisation.revenueDisplay },
            { label: 'Billing Email', value: organisation.billingEmail },
            { label: 'Outstanding', value: organisation.billing?.outstandingBalance },
            { label: 'Payment Method', value: organisation.billing?.paymentMethodStatus },
          ]} />
          <button className="secondary-button compact" type="button">View Billing History</button>
        </article>

        <article className="panel organisation-health-checks">
          <h2>Health Checks</h2>
          <div>
            {checks.map(([label, value]) => (
              <span key={label}>
                <CheckCircle2 size={17} />
                <strong>{label}</strong>
                <small>{value}</small>
              </span>
            ))}
          </div>
        </article>

        <article className="panel organisation-notes-card">
          <div className="panel-heading">
            <h2>Organisation Notes</h2>
            <button className="text-button success" type="button">Edit</button>
          </div>
          <textarea onChange={(event) => onNotesChange(event.target.value)} placeholder="Add internal notes about this organisation." value={notes} />
        </article>
      </div>
    </>
  )
}

function WorkspaceResponsiveTable({ columns = [], empty, rows = [] }) {
  return (
    <div className="workspace-responsive-table">
      <div className="workspace-table-head" style={{ '--columns': columns.length }}>
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      {rows.length ? rows.map((row) => (
        <article key={row.id || row[0]} style={{ '--columns': columns.length }}>
          {columns.map((column, index) => (
            <span data-label={column} key={column}>{row[index]}</span>
          ))}
        </article>
      )) : <EmptyData compact {...empty} />}
    </div>
  )
}

function OrganisationUsersTab({ organisation }) {
  const rows = organisation.users.map((user) => ({
    id: user.id,
    0: user.name,
    1: user.email,
    2: user.role,
    3: user.status,
    4: user.lastLogin,
    5: user.createdDate,
    6: user.permissionLevel,
  }))
  return (
    <section className="panel organisation-tab-panel">
      <div className="workspace-tab-toolbar">
        <label className="roleplayer-search">
          <Search size={17} />
          <input placeholder="Search users..." />
        </label>
        <button className="secondary-button compact" type="button">Role / Status</button>
        <button className="primary-button compact" type="button"><Plus size={15} /> Invite User</button>
      </div>
      <WorkspaceResponsiveTable
        columns={['Name', 'Email', 'Role', 'Status', 'Last Login', 'Created', 'Permission']}
        empty={{ title: 'No users yet', description: 'Invite this organisation’s first user to activate the workspace.' }}
        rows={rows}
      />
      <div className="workspace-row-actions">
        <button type="button">Edit role</button>
        <button type="button">Resend invite</button>
        <button className="danger" type="button">Deactivate user</button>
      </div>
    </section>
  )
}

function OrganisationTransactionsTab({ organisation }) {
  const rows = organisation.transactions.map((transaction) => ({
    id: transaction.id,
    0: transaction.reference,
    1: transaction.property,
    2: transaction.assigned,
    3: transaction.buyer,
    4: transaction.seller,
    5: transaction.stage,
    6: transaction.status,
    7: transaction.createdDate,
    8: transaction.lastActivity,
    9: transaction.revenue,
  }))
  return (
    <section className="panel organisation-tab-panel">
      <div className="workspace-tab-toolbar">
        <label className="roleplayer-search">
          <Search size={17} />
          <input placeholder={`Search ${organisation.activeWorkloadLabel.toLowerCase()}...`} />
        </label>
        <button className="secondary-button compact" type="button"><Filter size={15} /> Stage / Status</button>
        <button className="secondary-button compact" type="button"><Download size={15} /> Export</button>
      </div>
      <WorkspaceResponsiveTable
        columns={['ID', 'Property', 'Agent', 'Buyer', 'Seller', 'Stage', 'Status', 'Created', 'Last Activity', 'Revenue']}
        empty={{ title: `No ${organisation.activeWorkloadLabel.toLowerCase()} yet`, description: 'Linked work will appear here as it moves through the platform.' }}
        rows={rows}
      />
    </section>
  )
}

function OrganisationFinancialsTab({ organisation }) {
  return (
    <div className="organisation-financials-tab">
      <OrganisationWorkspaceKpis organisation={organisation} />
      <article className="panel workspace-activity-panel">
        <div className="panel-inline-heading">
          <h3>Revenue Over Time</h3>
          <select defaultValue="Monthly"><option>Monthly</option><option>Daily</option></select>
        </div>
        <GrowthAreaChart data={organisationWorkspaceTrend(organisation, 'Revenue')} />
      </article>
      <article className="panel organisation-billing-card">
        <div className="panel-heading"><h2>Billing History</h2></div>
        <DetailList rows={[
          { label: 'MRR', value: organisation.revenueDisplay },
          { label: 'ARR', value: organisation.arrDisplay },
          { label: 'Revenue Lifetime', value: organisation.billing?.revenue },
          { label: 'Outstanding Amount', value: organisation.billing?.outstandingBalance },
          { label: 'Invoice Status', value: organisation.billing?.subscriptionStatus },
          { label: 'Transaction Fees', value: organisation.billing?.transactionFees },
        ]} />
      </article>
    </div>
  )
}

function OrganisationWorkspacesTab({ organisation }) {
  return (
    <section className="organisation-workspace-tiles tabbed">
      {organisation.workspaceCards.map((card) => (
        <article className="panel" key={card.label}>
          <FileText size={18} />
          <h3>{card.label}</h3>
          <strong>{typeof card.value === 'number' ? formatCount(card.value) : card.value}</strong>
          <span>{card.meta || 'active'}</span>
          <small>Last activity: {organisation.lastActivity}</small>
          <button className="secondary-button compact" type="button">Open workspace</button>
        </article>
      ))}
    </section>
  )
}

function OrganisationDocumentsTab() {
  const documentTypes = ['Company Registration', 'VAT Certificate', 'FICA Documents', 'Mandates', 'Compliance Docs', 'Brand Assets', 'Other']
  return (
    <section className="panel organisation-tab-panel">
      <div className="workspace-tab-toolbar">
        <label className="roleplayer-search"><Search size={17} /><input placeholder="Search documents..." /></label>
        <select defaultValue="All">{['All', ...documentTypes].map((type) => <option key={type}>{type}</option>)}</select>
        <button className="primary-button compact" type="button"><Plus size={15} /> Upload Document</button>
      </div>
      <EmptyData icon={FileText} title="No documents yet" description="Upload compliance, mandate or brand documents to keep this organisation complete." />
    </section>
  )
}

function OrganisationLegalTemplatesTab({ onManageLegalTemplates, organisation }) {
  const templates = ['OTP', 'Mandate', 'Disclosure', 'Sale agreement', 'Lease', 'Attorney instruction', 'Buyer onboarding', 'Seller onboarding', 'Custom']
  return (
    <section className="panel organisation-tab-panel">
      <div className="workspace-tab-toolbar">
        <label className="roleplayer-search"><Search size={17} /><input placeholder="Search legal templates..." /></label>
        <button className="secondary-button compact" onClick={onManageLegalTemplates} type="button">Open Template Manager</button>
        <button className="primary-button compact" onClick={onManageLegalTemplates} type="button"><Plus size={15} /> Upload Template</button>
      </div>
      <div className="legal-template-category-grid">
        {templates.map((template) => (
          <button key={template} onClick={onManageLegalTemplates} type="button">
            <FileText size={17} />
            <strong>{template}</strong>
            <span>{organisation.name}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function OrganisationActivityTab({ organisation }) {
  return (
    <section className="panel organisation-tab-panel">
      <div className="organisation-activity-list expanded">
        {organisation.activityFeed?.length ? organisation.activityFeed.map((item) => (
          <div key={item.id}>
            <Activity size={16} />
            <span>{item.text}</span>
            <time>{item.time}</time>
          </div>
        )) : <EmptyData compact title="No activity logged" description="Events will appear here as this organisation changes." />}
      </div>
    </section>
  )
}

function OrganisationSettingsTab({ onEdit, organisation }) {
  return (
    <section className="panel organisation-tab-panel">
      <div className="panel-heading">
        <h2>Organisation Settings</h2>
        <button className="primary-button compact" onClick={onEdit} type="button">Edit Organisation</button>
      </div>
      <DetailList rows={[
        { label: 'Organisation Name', value: organisation.name },
        { label: 'Organisation Type', value: organisation.type },
        { label: 'Status', value: organisation.status },
        { label: 'Logo', value: organisation.logoUrl ? 'Custom logo' : 'Initials fallback' },
        { label: 'Registration Number', value: organisation.registrationNumber },
        { label: 'VAT Number', value: organisation.vatNumber },
        { label: 'Industry', value: organisation.industry },
        { label: 'Primary Contact Name', value: organisation.primaryContactName },
        { label: 'Primary Contact Email', value: organisation.primaryContactEmail },
        { label: 'Contact Email', value: organisation.contactEmail },
        { label: 'Phone', value: organisation.contactPhone },
        { label: 'Website', value: organisation.website },
        { label: 'Address', value: organisation.address },
        { label: 'Billing Email', value: organisation.billingEmail },
        { label: 'Subscription Plan', value: organisation.subscriptionPlan },
        { label: 'Workspace Access', value: `${organisation.workspaceCards.length} enabled` },
        { label: 'Default Role Permissions', value: 'Organisation standard' },
      ]} />
    </section>
  )
}

function OrganisationEditSheet({ message, onClose, onSave, organisation }) {
  if (!organisation) return null
  const sections = [
    ['Basic Details', ['Organisation name', 'Organisation type', 'Status', 'Industry']],
    ['Contact Details', ['Primary contact name', 'Primary contact email', 'Contact email', 'Phone', 'Website', 'Address']],
    ['Legal / Registration Details', ['Registration number', 'VAT number']],
    ['Billing Details', ['Billing email', 'Subscription plan', 'Billing cycle']],
    ['Workspace Access', ['Leads', 'Listings', 'Transactions', 'Documents']],
    ['Branding', ['Logo upload', 'Logo preview', 'Fallback initials']],
  ]

  return (
    <div className="organisation-edit-overlay" role="presentation">
      <form className="organisation-edit-sheet" onSubmit={(event) => { event.preventDefault(); onSave() }}>
        <div className="panel-heading">
          <div>
            <h2>Edit Organisation</h2>
            <span>{organisation.name}</span>
          </div>
          <button className="icon-button" onClick={onClose} type="button"><X size={17} /></button>
        </div>
        {message ? <p className="organisation-edit-message">{message}</p> : null}
        <div className="organisation-logo-preview">
          <RoleplayerLogo roleplayer={organisation} size="large" />
          <div>
            <strong>Logo</strong>
            <span>PNG, JPG, SVG or WebP. Preview before saving.</span>
            <div>
              <button className="secondary-button compact" type="button">Upload / Change Logo</button>
              <button className="secondary-button compact danger" type="button">Remove Logo</button>
            </div>
          </div>
        </div>
        {sections.map(([title, fields]) => (
          <fieldset key={title}>
            <legend>{title}</legend>
            <div>
              {fields.map((field) => (
                <label key={field}>
                  <span>{field}</span>
                  <input defaultValue={field === 'Organisation name' ? organisation.name : ''} placeholder={field} />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <footer>
          <button className="secondary-button compact" onClick={onClose} type="button">Cancel</button>
          <button className="primary-button compact" type="submit">Save Changes</button>
        </footer>
      </form>
    </div>
  )
}

function OrganisationWorkspacePage({ onBack, onManageLegalTemplates, organisation }) {
  const [activeTab, setActiveTab] = useState('Overview')
  const [activityMetric, setActivityMetric] = useState('Revenue')
  const [isEditing, setIsEditing] = useState(false)
  const [editMessage, setEditMessage] = useState('')
  const [notes, setNotes] = useState('')

  if (!organisation) {
    return (
      <section className="organisation-workspace">
        <EmptyData title="Organisation not found" description="Return to the organisation list and choose another record." />
      </section>
    )
  }

  function manageLegalTemplates() {
    onManageLegalTemplates?.(organisation)
  }

  function saveEdit() {
    setEditMessage('Changes saved locally for review. Backend write wiring remains unchanged.')
    setTimeout(() => {
      setIsEditing(false)
      setEditMessage('')
    }, 900)
  }

  return (
    <section className="organisation-workspace">
      <OrganisationWorkspaceHeader
        onBack={onBack}
        onEdit={() => setIsEditing(true)}
        onManageLegalTemplates={manageLegalTemplates}
        organisation={organisation}
      />
      <nav className="organisation-workspace-tabs" aria-label={`${organisation.name} workspace`}>
        {ORGANISATION_WORKSPACE_TABS.map((tab) => (
          <button className={activeTab === tab ? 'active' : ''} key={tab} onClick={() => setActiveTab(tab)} type="button">
            {tab}
          </button>
        ))}
      </nav>
      {activeTab === 'Overview' ? (
        <OrganisationOverviewTab
          activityMetric={activityMetric}
          notes={notes}
          onActivityMetricChange={setActivityMetric}
          onEdit={() => setIsEditing(true)}
          onNotesChange={setNotes}
          organisation={organisation}
        />
      ) : null}
      {activeTab === 'Users' ? <OrganisationUsersTab organisation={organisation} /> : null}
      {activeTab === 'Transactions' ? <OrganisationTransactionsTab organisation={organisation} /> : null}
      {activeTab === 'Financials' ? <OrganisationFinancialsTab organisation={organisation} /> : null}
      {activeTab === 'Workspaces' ? <OrganisationWorkspacesTab organisation={organisation} /> : null}
      {activeTab === 'Documents' ? <OrganisationDocumentsTab organisation={organisation} /> : null}
      {activeTab === 'Legal Templates' ? <OrganisationLegalTemplatesTab onManageLegalTemplates={manageLegalTemplates} organisation={organisation} /> : null}
      {activeTab === 'Activity' ? <OrganisationActivityTab organisation={organisation} /> : null}
      {activeTab === 'Settings' ? <OrganisationSettingsTab onEdit={() => setIsEditing(true)} organisation={organisation} /> : null}
      {isEditing ? <OrganisationEditSheet message={editMessage} onClose={() => setIsEditing(false)} onSave={saveEdit} organisation={organisation} /> : null}
    </section>
  )
}

function OrganisationsView({ onManageLegalTemplates, snapshot }) {
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [healthFilter, setHealthFilter] = useState('All')
  const [planFilter, setPlanFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [rowsPerPage, setRowsPerPage] = useState(9)
  const [page, setPage] = useState(1)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(() => {
    if (typeof window === 'undefined') return ''
    const match = window.location.pathname.match(/\/admin\/organisations\/([^/]+)/)
    return match ? decodeURIComponent(match[1]) : ''
  })
  const [sort, setSort] = useState('Most Active')
  const [viewMode, setViewMode] = useState('cards')

  const organisations = snapshot.roleplayers || []
  const selectedOrganisation = organisations.find((organisation) => organisation.id === selectedWorkspaceId)
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    return organisations
      .filter((organisation) => organisationMatchesType(organisation, typeFilter))
      .filter((organisation) => organisationMatchesStatus(organisation, statusFilter))
      .filter((organisation) => organisationMatchesHealth(organisation, healthFilter))
      .filter((organisation) => organisationMatchesPlan(organisation, planFilter))
      .filter((organisation) => {
        if (!search) return true
        return [
          organisation.name,
          organisation.type,
          organisation.organisationId,
          organisation.registrationNumber,
          organisation.vatNumber,
          organisation.contactEmail,
          organisation.contactPhone,
          organisation.website,
          organisation.status,
          organisation.subscriptionPlan,
          ...organisation.users.map((user) => `${user.name} ${user.email}`),
        ].join(' ').toLowerCase().includes(search)
      })
      .sort((left, right) => {
        if (sort === 'Revenue') return right.revenue - left.revenue
        if (sort === 'Users') return right.userCount - left.userCount
        if (sort === 'Newest') return String(right.joinedDate).localeCompare(String(left.joinedDate))
        if (sort === 'Health') return (right.health.tone === 'danger' ? 2 : right.health.tone === 'warning' ? 1 : 0) - (left.health.tone === 'danger' ? 2 : left.health.tone === 'warning' ? 1 : 0)
        return right.activeWorkload + right.userCount - (left.activeWorkload + left.userCount)
      })
  }, [healthFilter, organisations, page, planFilter, query, sort, statusFilter, typeFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  function openOrganisation(organisation) {
    setSelectedWorkspaceId(organisation.id)
    if (window.history?.pushState) {
      window.history.pushState({}, '', `/admin/organisations/${encodeURIComponent(organisation.id)}`)
    }
  }

  function closeWorkspace() {
    setSelectedWorkspaceId('')
    if (window.history?.pushState) {
      window.history.pushState({}, '', '/admin/organisations')
    }
  }

  function clearFilters() {
    setTypeFilter('All')
    setStatusFilter('All')
    setHealthFilter('All')
    setPlanFilter('All')
    setQuery('')
    setSort('Most Active')
    setPage(1)
  }

  return (
    <section className="organisations-directory">
      {selectedOrganisation ? (
        <div className="organisation-workspace-page">
          <OrganisationWorkspacePage
            onBack={closeWorkspace}
            onManageLegalTemplates={onManageLegalTemplates}
            organisation={selectedOrganisation}
          />
        </div>
      ) : (
        <>
      <OrganisationKpiStrip organisations={organisations} />

      <section className="panel organisation-filter-panel">
        <div className="organisation-filter-top">
          <label className="roleplayer-search">
            <Search size={17} />
            <input onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search organisations..." value={query} />
          </label>
          <label className="roleplayer-sort">
            <span>Sort by:</span>
            <select onChange={(event) => setSort(event.target.value)} value={sort}>
              {ORGANISATION_SORTS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button className="secondary-button compact" type="button">
            <Filter size={16} />
            Filter
          </button>
          <div className="organisation-view-toggle" aria-label="View mode">
            <button className={viewMode === 'cards' ? 'active' : ''} onClick={() => setViewMode('cards')} type="button">Card View</button>
            <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')} type="button">Table View</button>
          </div>
        </div>
        <div className="organisation-filter-groups">
          <div className="roleplayer-filter-bar">
            {ROLEPLAYER_FILTERS.map((filter) => (
              <button className={typeFilter === filter ? 'active' : ''} key={filter} onClick={() => { setTypeFilter(filter); setPage(1) }} type="button">
                {filter === 'All' ? 'All Types' : filter}
              </button>
            ))}
          </div>
          <div className="organisation-select-filters">
            <label>
              <span>Status</span>
              <select onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }} value={statusFilter}>
                {ORGANISATION_STATUS_FILTERS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>Health</span>
              <select onChange={(event) => { setHealthFilter(event.target.value); setPage(1) }} value={healthFilter}>
                {ORGANISATION_HEALTH_FILTERS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>Plan</span>
              <select onChange={(event) => { setPlanFilter(event.target.value); setPage(1) }} value={planFilter}>
                {ORGANISATION_PLAN_FILTERS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <button className="text-button success" onClick={clearFilters} type="button">Clear filters</button>
          </div>
        </div>
      </section>

      {viewMode === 'cards' ? (
        visible.length ? (
          <div className="organisation-card-grid">
            {visible.map((organisation) => (
              <OrganisationCard
                key={organisation.id}
                onManageLegalTemplates={() => onManageLegalTemplates?.(organisation)}
                onOpen={() => openOrganisation(organisation)}
                organisation={organisation}
              />
            ))}
          </div>
        ) : (
          <div className="panel organisation-empty-state">
            <EmptyData title="No organisations found" description="Try adjusting your filters or search term." />
          </div>
        )
      ) : (
        <OrganisationTable organisations={visible} onManageLegalTemplates={onManageLegalTemplates} onOpen={openOrganisation} />
      )}

      <footer className="organisation-pagination panel">
        <span>
          Showing {filtered.length ? (currentPage - 1) * rowsPerPage + 1 : 0} to {Math.min(currentPage * rowsPerPage, filtered.length)} of {filtered.length} organisations
        </span>
        <div>
          <button disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button>
          {Array.from({ length: Math.min(pageCount, 5) }, (_, index) => index + 1).map((item) => (
            <button className={currentPage === item ? 'active' : ''} key={item} onClick={() => setPage(item)} type="button">{item}</button>
          ))}
          <button disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} type="button">Next</button>
          <label>
            <span>Rows</span>
            <select onChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(1) }} value={rowsPerPage}>
              {[9, 18, 27].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </footer>
        </>
      )}
    </section>
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

function RoleplayerWorkspace({ backLabel = 'Back to Roleplayers', onClose, onManageLegalTemplates, roleplayer }) {
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
          {backLabel}
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
        <button className="secondary-button compact" onClick={onManageLegalTemplates} type="button">
          <FileText size={15} />
          Legal Templates
        </button>
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
          <button onClick={onManageLegalTemplates} type="button">Legal Templates</button>
          <button type="button">View All Transactions</button>
          <button type="button">View All Matters</button>
          <button type="button">View Applications</button>
          <button type="button">Audit Log</button>
        </div>
      </section>
    </aside>
  )
}

function RoleplayersView({ basePath = '/admin/roleplayers', onManageLegalTemplates, snapshot, subtitle = 'Manage and monitor every organisation within the Arch9 ecosystem.', title = 'Roleplayers' }) {
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
      window.history.pushState({}, '', `${basePath}/${encodeURIComponent(roleplayer.id)}`)
    }
  }

  function closeWorkspace() {
    setSelectedId('')
    if (window.history?.pushState) {
      window.history.pushState({}, '', basePath)
    }
  }

  function manageLegalTemplates(roleplayer) {
    if (!roleplayer) return
    onManageLegalTemplates?.(roleplayer)
  }

  return (
    <section className="roleplayers-module">
      <div className="roleplayers-header">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
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
                  onManageLegalTemplates={() => manageLegalTemplates(roleplayer)}
                  onSelect={() => selectRoleplayer(roleplayer)}
                  roleplayer={roleplayer}
                />
              ))}
            </div>
          ) : (
            <EmptyData />
          )}
        </div>
        <RoleplayerWorkspace onClose={closeWorkspace} onManageLegalTemplates={() => manageLegalTemplates(selectedRoleplayer)} roleplayer={selectedRoleplayer} />
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
  if (activeView === 'legalTemplates') return <><MobileHeader snapshot={snapshot} title="Legal Templates" subtitle="Residential and commercial template layer." /><LegalTemplatesView /></>
  if (activeView === 'revenue') return <><MobileHeader snapshot={snapshot} title="Revenue" subtitle="Financial overview." /><RevenueDashboardView snapshot={snapshot} /></>
  if (activeView === 'growth') return <><MobileHeader snapshot={snapshot} title="Growth" subtitle="Adoption and organisation growth." /><GrowthDashboardView snapshot={snapshot} /></>
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

function LegalTemplatesView({ scopedOrganisationId = '', scopedOrganisationName = '', onClearScope }) {
  const [filters, setFilters] = useState({ organisationId: scopedOrganisationId || '', moduleType: '', packetType: '', query: '' })
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

  useEffect(() => {
    if (!scopedOrganisationId) return
    const next = { ...filters, organisationId: scopedOrganisationId }
    setFilters(next)
    void loadRegistry(next)
    void loadReadiness(next)
  }, [scopedOrganisationId])

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
          <h1>{scopedOrganisationName ? `${scopedOrganisationName} Legal Templates` : 'Legal Templates'}</h1>
          <p>Manage organisation legal templates used by residential and commercial document generation.</p>
        </div>
        <div className="legal-template-header-actions">
          {scopedOrganisationId ? (
            <button className="secondary-button compact" onClick={onClearScope} type="button">
              All Organisations
            </button>
          ) : null}
          <button className="primary-button compact" onClick={startNewTemplate} type="button">
            <Plus size={16} />
            Add Template
          </button>
        </div>
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
          <h2>Arch9 Readiness</h2>
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
  const isOnline = useNetworkStatus()
  const refreshInFlight = useRef(false)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [access, setAccess] = useState({ allowed: false, level: '', roles: [] })
  const [activeView, setActiveView] = useState('dashboard')
  const [authError, setAuthError] = useState('')
  const [dateRange, setDateRange] = useState('30d')
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [attentionContext, setAttentionContext] = useState(() => {
    if (typeof window === 'undefined') return null
    return attentionContextFromPath(`${window.location.pathname}${window.location.search}`)
  })
  const [isBooting, setIsBooting] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [dashboardRefreshError, setDashboardRefreshError] = useState('')
  const [legalTemplateScope, setLegalTemplateScope] = useState({ organisationId: '', organisationName: '' })

  async function refreshData(nextRange = dateRange) {
    if (!session?.user || refreshInFlight.current) return
    refreshInFlight.current = true
    setIsLoading(true)
    try {
      if (activeView === 'dashboard' && snapshot.ceoDashboard?.available) {
        const nextDashboard = await loadCeoDashboardSnapshot(nextRange)
        if (nextDashboard.available) {
          setSnapshot((current) => ({ ...current, ceoDashboard: nextDashboard }))
          setDashboardRefreshError('')
        } else {
          setDashboardRefreshError(nextDashboard.error || 'Dashboard refresh failed. Showing the last successful update.')
        }
      } else {
        const nextSnapshot = await loadDashboardSnapshot(nextRange)
        setSnapshot(nextSnapshot)
        setDashboardRefreshError(nextSnapshot.ceoDashboard?.error || '')
      }
    } finally {
      refreshInFlight.current = false
      setIsLoading(false)
    }
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
    setAttentionContext(null)
    if (viewId !== 'legalTemplates') setLegalTemplateScope({ organisationId: '', organisationName: '' })
    pushAdminPath(adminPathForView(viewId))
  }

  function handleDashboardPath(path = '') {
    if (path.includes('sales-pipeline')) {
      document.getElementById('new-business-intake')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const viewId = path.includes('organisations')
      ? 'organisations'
      : path.includes('transactions')
        ? 'transactions'
        : path.includes('revenue')
          ? 'revenue'
          : path.includes('platform-health')
            ? 'health'
            : ''
    if (!viewId) return
    setAttentionContext(attentionContextFromPath(path))
    setActiveView(viewId)
    pushAdminPath(path)
  }

  function clearAttentionContext() {
    setAttentionContext(null)
    pushAdminPath(adminPathForView(activeView))
  }

  function handleOpenOrganisation(organisationId) {
    if (!organisationId) return
    setAttentionContext(null)
    pushAdminPath(`/admin/organisations/${encodeURIComponent(organisationId)}`)
    setActiveView('organisations')
  }

  function exportCeoDashboard() {
    if (!snapshot.ceoDashboard?.available) return
    const csv = buildCeoDashboardCsv(snapshot.ceoDashboard)
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `arch9-ceo-dashboard-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  function handleManageLegalTemplates(roleplayer) {
    setLegalTemplateScope({
      organisationId: roleplayer?.organisationId || roleplayer?.id || '',
      organisationName: roleplayer?.name || '',
    })
    setActiveView('legalTemplates')
    pushAdminPath('/admin/legal-templates')
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
        setDashboardRefreshError('')
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
        if (!cancelled) {
          setSnapshot(nextSnapshot)
          setDashboardRefreshError(nextSnapshot.ceoDashboard?.error || '')
        }
        setIsLoading(false)
      }
    }

    resolveAccess()
    return () => {
      cancelled = true
    }
  }, [isMobile, session])

  useEffect(() => {
    if (!session?.user || access.level !== ADMIN_LEVELS.EXECUTIVE || activeView !== 'dashboard') return undefined
    let cancelled = false

    async function refreshCeoDashboard() {
      if (refreshInFlight.current || !navigator.onLine || document.hidden) return
      refreshInFlight.current = true
      setIsLoading(true)
      try {
        const nextDashboard = await loadCeoDashboardSnapshot(dateRange)
        if (cancelled) return
        if (nextDashboard.available) {
          setSnapshot((current) => ({ ...current, ceoDashboard: nextDashboard }))
          setDashboardRefreshError('')
        } else {
          setDashboardRefreshError(nextDashboard.error || 'Automatic refresh failed. Showing the last successful update.')
        }
      } finally {
        refreshInFlight.current = false
        if (!cancelled) setIsLoading(false)
      }
    }

    function handleVisibilityChange() {
      if (!document.hidden) refreshCeoDashboard()
    }

    const intervalId = window.setInterval(refreshCeoDashboard, 90000)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', refreshCeoDashboard)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', refreshCeoDashboard)
    }
  }, [access.level, activeView, dateRange, session?.user?.id])

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
          canExportDashboard={Boolean(snapshot.ceoDashboard?.available)}
          dateRange={dateRange}
          isLoading={isLoading}
          onDashboardExport={exportCeoDashboard}
          onDateRangeChange={handleDateRangeChange}
          onRefresh={() => refreshData()}
        />
        {activeView !== 'dashboard' ? <ExecutiveAttentionContext context={attentionContext} onClear={clearAttentionContext} /> : null}
        {!canViewActive ? <ServiceDeskView snapshot={snapshot} /> : null}
        {activeView === 'dashboard' && canViewActive ? (
          <ExecutiveDashboardView
            isLoading={isLoading}
            isOnline={isOnline}
            onOpenOrganisation={handleOpenOrganisation}
            onOpenPath={handleDashboardPath}
            onRefresh={() => refreshData()}
            refreshError={dashboardRefreshError}
            snapshot={snapshot}
          />
        ) : null}
        {activeView === 'growth' && canViewActive ? <GrowthDashboardView snapshot={snapshot} /> : null}
        {activeView === 'revenue' && canViewActive ? <RevenueDashboardView snapshot={snapshot} /> : null}
        {activeView === 'ecosystem' && canViewActive ? <EcosystemSection ecosystem={snapshot.ecosystem} /> : null}
        {activeView === 'health' && canViewActive ? <HealthView snapshot={snapshot} /> : null}
        {activeView === 'organisations' && canViewActive ? (
          <OrganisationsView onManageLegalTemplates={handleManageLegalTemplates} snapshot={snapshot} />
        ) : null}
        {activeView === 'legalTemplates' && canViewActive ? (
          <LegalTemplatesView
            onClearScope={() => setLegalTemplateScope({ organisationId: '', organisationName: '' })}
            scopedOrganisationId={legalTemplateScope.organisationId}
            scopedOrganisationName={legalTemplateScope.organisationName}
          />
        ) : null}
        {activeView === 'roleplayers' && canViewActive ? (
          <RoleplayersView onManageLegalTemplates={handleManageLegalTemplates} snapshot={snapshot} />
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
