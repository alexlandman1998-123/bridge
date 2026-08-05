import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Headphones,
  Home,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  UserRoundCheck,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ADMIN_LEVELS, formatAdminLevelLabel, resolveAdminAccess } from './lib/adminAccess'
import { getSupabaseConfigStatus, isSupabaseConfigured, supabase } from './lib/supabaseClient'

const RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'month', label: 'This Month' },
]

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, levels: [ADMIN_LEVELS.EXECUTIVE] },
  { id: 'support', label: 'Support', icon: Headphones, levels: [ADMIN_LEVELS.EXECUTIVE, ADMIN_LEVELS.CUSTOMER_SUPPORT] },
  { id: 'search', label: 'Search', icon: Search, levels: [ADMIN_LEVELS.EXECUTIVE, ADMIN_LEVELS.CUSTOMER_SUPPORT] },
  { id: 'settings', label: 'Settings', icon: Settings, levels: [ADMIN_LEVELS.EXECUTIVE, ADMIN_LEVELS.CUSTOMER_SUPPORT] },
]

const EMPTY_DASHBOARD = {
  attention: [],
  drilldowns: {
    activeAgents: [],
    activeListings: [],
    activeOrganisations: [],
  },
  generatedAt: '',
  kpis: {
    activeAgents: 0,
    activeListings: 0,
    activeOrganisations: 0,
    pipelineRevenue: 0,
    registeredRevenueThisMonth: 0,
    registeredThisMonth: 0,
    sellerSignedBuyerSigned: 0,
    stalledTransactions: 0,
  },
  pipeline: [],
  range: {},
  registered: [],
  revenue: {},
  warnings: [],
}

const EMPTY_SUPPORT = {
  generatedAt: '',
  queue: [],
  range: {},
  summary: {
    missingRevenueItems: 0,
    openTickets: 0,
    stalledTransactions: 0,
    totalItems: 0,
    urgentTickets: 0,
  },
  warnings: [],
}

function getRangeWindow(rangeId = '30d') {
  const end = new Date()
  const start = new Date(end)

  if (rangeId === 'today') {
    start.setHours(0, 0, 0, 0)
  } else if (rangeId === '7d') {
    start.setDate(end.getDate() - 7)
  } else if (rangeId === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  } else {
    start.setDate(end.getDate() - 30)
  }

  return {
    end: end.toISOString(),
    start: start.toISOString(),
  }
}

function formatMoney(value = 0) {
  return new Intl.NumberFormat('en-ZA', {
    currency: 'ZAR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number(value) || 0)
}

function formatCount(value = 0) {
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(Number(value) || 0)
}

function formatDate(value = '') {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function formatDateTime(value = '') {
  if (!value) return 'No activity'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No activity'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date)
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function compactList(values = []) {
  return values.filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
}

function uniqueCount(values = []) {
  return new Set(compactList(values).map((value) => String(value))).size
}

function countMissingRevenue(rows = [], warnings = []) {
  const missingRows = rows.filter((row) => row?.revenueMissing).map((row) => row.id || row.reference)
  const missingWarnings = warnings
    .filter((warning) => warning?.type === 'missing_revenue')
    .map((warning) => warning.id || warning.reference)
  return uniqueCount([...missingRows, ...missingWarnings])
}

function normalizePriority(value = '') {
  const priority = String(value || 'normal').toLowerCase()
  if (['urgent', 'critical', 'p0', 'p1'].includes(priority)) return 'urgent'
  if (priority === 'high') return 'high'
  if (priority === 'medium') return 'medium'
  return 'normal'
}

function priorityRank(value = '') {
  const priority = normalizePriority(value)
  if (priority === 'urgent') return 0
  if (priority === 'high') return 1
  if (priority === 'medium') return 2
  return 3
}

function supportTypeLabel(value = '') {
  const type = String(value || '').replace(/_/g, ' ')
  if (!type) return 'Support item'
  return type.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function supportItemTitle(item = {}) {
  return item.title || item.reference || item.id || 'Support item'
}

function supportItemKey(item = {}) {
  return `${item.type || 'item'}:${item.id || item.title || item.reference || 'unknown'}`
}

function buildSupportItems(snapshot = EMPTY_SUPPORT, dashboard = EMPTY_DASHBOARD) {
  const queueItems = (snapshot.queue || []).map((item) => ({
    ...item,
    priority: normalizePriority(item.priority),
    source: 'support',
  }))
  const dashboardWarnings = (dashboard.warnings || [])
    .filter((warning) => warning?.type === 'missing_revenue')
    .map((warning) => ({
      id: warning.id || warning.reference,
      lastActivityAt: dashboard.generatedAt,
      priority: 'high',
      source: 'dashboard',
      status: warning.context || 'missing_revenue',
      suggestedAction: warning.message || 'Add the Arch9 operating revenue amount.',
      title: warning.reference || warning.id || 'Missing revenue',
      type: 'missing_revenue',
    }))

  const keyed = new Map()
  for (const item of [...queueItems, ...dashboardWarnings]) {
    const key = `${item.type || 'item'}:${item.id || item.title || item.reference}`
    if (!keyed.has(key)) keyed.set(key, item)
  }

  return Array.from(keyed.values()).sort((left, right) => {
    const priorityDelta = priorityRank(left.priority) - priorityRank(right.priority)
    if (priorityDelta) return priorityDelta
    return new Date(right.lastActivityAt || 0).getTime() - new Date(left.lastActivityAt || 0).getTime()
  })
}

function getDashboardDrilldowns(snapshot = EMPTY_DASHBOARD, support = EMPTY_SUPPORT) {
  const kpis = snapshot?.kpis || EMPTY_DASHBOARD.kpis
  const drilldowns = snapshot?.drilldowns || EMPTY_DASHBOARD.drilldowns
  const pipelineRows = snapshot?.pipeline || []
  const registeredRows = snapshot?.registered || []
  const attentionRows = snapshot?.attention || []
  const missingRevenueRows = [...pipelineRows, ...registeredRows].filter((row) => row.revenueMissing)
  const supportItems = buildSupportItems(support, snapshot)

  return {
    activeOrganisations: {
      empty: 'No active organisations returned by the current data contract.',
      meta: `${formatCount(kpis.activeOrganisations)} active`,
      rows: drilldowns.activeOrganisations || [],
      title: 'Active Organisations',
      type: 'organisations',
    },
    activeAgents: {
      empty: 'No active agents returned by the current data contract.',
      meta: `${formatCount(kpis.activeAgents)} active`,
      rows: drilldowns.activeAgents || [],
      title: 'Active Agents',
      type: 'agents',
    },
    activeListings: {
      empty: 'No active listings returned by the current data contract.',
      meta: `${formatCount(kpis.activeListings)} active`,
      rows: drilldowns.activeListings || [],
      title: 'Active Listings',
      type: 'listings',
    },
    pipeline: {
      empty: 'No seller/buyer signed pipeline items yet.',
      meta: `${formatCount(pipelineRows.length)} sampled`,
      rows: pipelineRows,
      title: 'Seller + Buyer Signed Pipeline',
      type: 'transactions',
    },
    registered: {
      empty: 'No registrations in this range.',
      meta: `${formatCount(registeredRows.length)} sampled`,
      rows: registeredRows,
      title: 'Registered This Month',
      type: 'transactions',
    },
    stalled: {
      empty: 'No stalled transactions in the current data contract.',
      meta: `${formatCount(attentionRows.length)} sampled`,
      rows: attentionRows,
      title: 'Stalled Transactions',
      type: 'queue',
    },
    missingRevenue: {
      empty: 'No signed or registered transactions are missing Arch9 revenue.',
      meta: `${formatCount(missingRevenueRows.length)} missing`,
      rows: missingRevenueRows,
      title: 'Missing Revenue',
      type: 'transactions',
    },
    support: {
      empty: 'No support items returned yet.',
      meta: `${formatCount(supportItems.length)} open`,
      rows: supportItems,
      title: 'Support Queue',
      type: 'support',
    },
  }
}

function getDefaultView(level = '') {
  return level === ADMIN_LEVELS.CUSTOMER_SUPPORT ? 'support' : 'dashboard'
}

function getViewFromPath(level = '') {
  if (typeof window === 'undefined') return getDefaultView(level)
  const path = window.location.pathname
  if (path.includes('/admin/support')) return 'support'
  if (path.includes('/admin/search')) return 'search'
  if (path.includes('/admin/settings')) return 'settings'
  return getDefaultView(level)
}

function pathForView(viewId = 'dashboard') {
  if (viewId === 'support') return '/admin/support'
  if (viewId === 'search') return '/admin/search'
  if (viewId === 'settings') return '/admin/settings'
  return '/admin'
}

async function loadAdminProfile(userId) {
  if (!supabase || !userId) return null

  const attempts = [
    () => supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    () => supabase.from('users').select('*').eq('id', userId).maybeSingle(),
    () => supabase.from('staff_profiles').select('*').eq('user_id', userId).maybeSingle(),
  ]

  for (const query of attempts) {
    try {
      const { data, error } = await query()
      if (data && !error) return data
    } catch {
      // Try the next known profile table.
    }
  }

  return null
}

async function loadDashboardSnapshot(rangeId) {
  if (!supabase) return { data: EMPTY_DASHBOARD, error: 'Supabase is not configured.' }
  const range = getRangeWindow(rangeId)
  const { data, error } = await supabase.rpc('arch9_admin_dashboard_snapshot', {
    p_range_end: range.end,
    p_range_start: range.start,
  })
  return {
    data: data || EMPTY_DASHBOARD,
    error: error?.message || '',
  }
}

async function loadSupportSnapshot(rangeId) {
  if (!supabase) return { data: EMPTY_SUPPORT, error: 'Supabase is not configured.' }
  const range = getRangeWindow(rangeId)
  const { data, error } = await supabase.rpc('arch9_admin_support_snapshot', {
    p_range_end: range.end,
    p_range_start: range.start,
  })
  return {
    data: data || EMPTY_SUPPORT,
    error: error?.message || '',
  }
}

async function searchAdminData(term = '') {
  const query = normalizeText(term)
  if (!supabase || !query) return { results: [], warnings: [] }

  const searches = [
    {
      label: 'Profile',
      run: () =>
        supabase
          .from('profiles')
          .select('id, full_name, email, role, status, updated_at')
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(8),
    },
    {
      label: 'Organisation',
      run: () =>
        supabase
          .from('organisations')
          .select('id, name, trading_name, status, updated_at')
          .or(`name.ilike.%${query}%,trading_name.ilike.%${query}%`)
          .limit(8),
    },
    {
      label: 'Transaction',
      run: () =>
        supabase
          .from('transactions')
          .select('id, reference, matter_number, buyer_name, seller_name, status, stage, updated_at')
          .or(`reference.ilike.%${query}%,matter_number.ilike.%${query}%,buyer_name.ilike.%${query}%,seller_name.ilike.%${query}%`)
          .limit(8),
    },
  ]

  const settled = await Promise.all(
    searches.map(async (searchConfig) => {
      try {
        const { data, error } = await searchConfig.run()
        if (error) return { error: error.message, label: searchConfig.label, rows: [] }
        return { error: '', label: searchConfig.label, rows: Array.isArray(data) ? data : [] }
      } catch (error) {
        return { error: error?.message || 'Search failed', label: searchConfig.label, rows: [] }
      }
    }),
  )

  return {
    results: settled.flatMap((group) =>
      group.rows.map((row) => ({
        id: row.id,
        label: group.label,
        meta: row.email || row.status || row.stage || '',
        time: row.updated_at,
        title:
          row.full_name ||
          row.name ||
          row.trading_name ||
          row.reference ||
          row.matter_number ||
          [row.buyer_name, row.seller_name].filter(Boolean).join(' / ') ||
          row.id,
      })),
    ),
    warnings: settled.filter((group) => group.error).map((group) => `${group.label}: ${group.error}`),
  }
}

function LoginScreen({ authError, onMagicLink, onSignIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const configStatus = getSupabaseConfigStatus()

  async function submit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    await onSignIn({ email, password })
    setIsSubmitting(false)
  }

  async function sendMagicLink() {
    setIsSubmitting(true)
    await onMagicLink({ email })
    setIsSubmitting(false)
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">A9</div>
          <div>
            <p>Arch9 Internal</p>
            <h1>Operating Console</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={submit}>
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

          {authError ? <Notice tone="danger" text={authError} /> : null}
          {!configStatus.ok ? <Notice tone="warning" text={configStatus.message} /> : null}

          <button className="primary-button" disabled={!isSupabaseConfigured || isSubmitting} type="submit">
            <ShieldCheck size={18} />
            <span>{isSubmitting ? 'Signing in...' : 'Sign in'}</span>
          </button>
          <button
            className="secondary-button"
            disabled={!isSupabaseConfigured || !email || isSubmitting}
            onClick={sendMagicLink}
            type="button"
          >
            Send magic link
          </button>
        </form>
      </section>
    </main>
  )
}

function Notice({ text, tone = 'neutral' }) {
  return (
    <div className={`notice ${tone}`}>
      <AlertTriangle size={16} />
      <span>{text}</span>
    </div>
  )
}

function Sidebar({ access, activeView, onNavigate, onSignOut, profile }) {
  const items = NAV_ITEMS.filter((item) => item.levels.includes(access.level))

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden="true">A9</div>
        <div>
          <strong>Arch9</strong>
          <span>Operating Console</span>
        </div>
      </div>

      <nav className="nav-list" aria-label="Admin navigation">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              className={activeView === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div>
          <strong>{profile?.full_name || profile?.name || profile?.email || 'Arch9 user'}</strong>
          <span>{formatAdminLevelLabel(access.level)}</span>
        </div>
        <button className="icon-button" onClick={onSignOut} title="Sign out" type="button">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  )
}

function Topbar({ activeView, isLoading, onRefresh, rangeId, setRangeId }) {
  const title =
    activeView === 'support'
      ? 'Support Queue'
      : activeView === 'search'
        ? 'Search'
        : activeView === 'settings'
          ? 'Settings'
          : 'Operating Dashboard'

  const subtitle =
    activeView === 'dashboard'
      ? 'Active organisations, agents, listings, revenue, and stalled work.'
      : activeView === 'support'
        ? 'Open support work and operational exceptions.'
        : activeView === 'search'
          ? 'Find organisations, users, and transactions.'
          : 'Access, environment, and data-contract status.'

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Arch9 Admin</p>
        <h1>{title}</h1>
        <span>{subtitle}</span>
      </div>
      <div className="topbar-actions">
        <select aria-label="Date range" onChange={(event) => setRangeId(event.target.value)} value={rangeId}>
          {RANGE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <button className="secondary-button compact" onClick={onRefresh} type="button">
          {isLoading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
          <span>Refresh</span>
        </button>
      </div>
    </header>
  )
}

function MetricCard({ active = false, icon: Icon, label, meta = '', onClick, tone = 'green', value }) {
  const className = `metric-card ${tone}${onClick ? ' interactive' : ''}${active ? ' active' : ''}`
  const content = (
    <>
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
      {meta ? <small>{meta}</small> : null}
    </>
  )

  if (onClick) {
    return (
      <button className={className} onClick={onClick} type="button">
        {content}
      </button>
    )
  }

  return (
    <article className={className}>
      {content}
    </article>
  )
}

function StatusStrip({ dashboard, isLoading, support }) {
  const warnings = dashboard?.warnings || []
  const range = dashboard?.range || {}
  const generatedAt = dashboard?.generatedAt || ''
  const supportSummary = support?.summary || EMPTY_SUPPORT.summary

  const items = [
    ['Generated', generatedAt ? formatDateTime(generatedAt) : isLoading ? 'Refreshing' : 'Waiting for data'],
    ['Range', range.start && range.end ? `${formatDate(range.start)} - ${formatDate(range.end)}` : 'Selected range'],
    ['Data warnings', formatCount(warnings.length)],
    ['Support queue', formatCount(supportSummary.totalItems)],
  ]

  return (
    <section className="status-strip" aria-label="Dashboard status">
      {items.map(([label, value]) => (
        <div className="status-pill" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  )
}

function RevenuePath({ activeKey = '', onSelect, snapshot }) {
  const kpis = snapshot?.kpis || EMPTY_DASHBOARD.kpis
  const revenue = snapshot?.revenue || {}
  const pipeline = revenue.pipeline || {}
  const registered = revenue.registeredThisMonth || {}
  const warnings = snapshot?.warnings || []
  const missingRevenue = countMissingRevenue([...(snapshot?.pipeline || []), ...(snapshot?.registered || [])], warnings)

  const steps = [
    {
      label: 'Seller + Buyer Signed',
      drilldown: 'pipeline',
      meta: 'Registration pending',
      value: formatCount(kpis.sellerSignedBuyerSigned || pipeline.count),
    },
    {
      label: 'Pipeline Revenue',
      drilldown: 'pipeline',
      meta: 'Arch9 operating revenue',
      value: formatMoney(kpis.pipelineRevenue || pipeline.amount),
    },
    {
      label: 'Registered This Month',
      drilldown: 'registered',
      meta: `${formatCount(kpis.registeredThisMonth || registered.count)} registrations`,
      value: formatMoney(kpis.registeredRevenueThisMonth || registered.amount),
    },
    {
      label: 'Missing Revenue',
      drilldown: 'missingRevenue',
      meta: 'Needs cleanup',
      value: formatCount(missingRevenue),
      tone: missingRevenue ? 'warning' : 'success',
    },
  ]

  return (
    <section className="funnel-panel">
      <div className="panel-title">
        <h2>Revenue Path</h2>
        <span>Signed to registered</span>
      </div>
      <div className="funnel-steps">
        {steps.map((step) => (
          <button
            className={`funnel-step ${step.tone || ''}${activeKey === step.drilldown ? ' active' : ''}`}
            key={step.label}
            onClick={() => onSelect?.(step.drilldown)}
            type="button"
          >
            <span>{step.label}</span>
            <strong>{step.value}</strong>
            <small>{step.meta}</small>
          </button>
        ))}
      </div>
    </section>
  )
}

function SupportBrief({ onSelect, support }) {
  const summary = support?.summary || EMPTY_SUPPORT.summary
  const queue = support?.queue || []
  const urgentRows = queue.filter((item) => ['urgent', 'critical', 'high', 'p0', 'p1'].includes(String(item.priority || '').toLowerCase()))

  return (
    <section className="support-brief">
      <div className="panel-title">
        <h2>Support At A Glance</h2>
        <span>{formatCount(summary.totalItems)} open</span>
      </div>
      <div className="brief-metrics">
        <div>
          <span>Open tickets</span>
          <strong>{formatCount(summary.openTickets)}</strong>
        </div>
        <div>
          <span>Urgent</span>
          <strong>{formatCount(summary.urgentTickets)}</strong>
        </div>
        <div>
          <span>Stalled</span>
          <strong>{formatCount(summary.stalledTransactions)}</strong>
        </div>
        <div>
          <span>Revenue gaps</span>
          <strong>{formatCount(summary.missingRevenueItems)}</strong>
        </div>
      </div>
      <div className="brief-list">
        {(urgentRows.length ? urgentRows : queue).slice(0, 3).map((item) => (
          <button key={`${item.type}-${item.id}`} onClick={() => onSelect?.('support')} type="button">
            <strong>{item.title || item.reference || item.id}</strong>
            <span>{item.suggestedAction || item.status || 'Review item'}</span>
          </button>
        ))}
        {!queue.length ? <p className="empty-state">No support items returned yet.</p> : null}
      </div>
    </section>
  )
}

function DashboardView({ isLoading, snapshot, support }) {
  const [drilldownKey, setDrilldownKey] = useState('pipeline')
  const kpis = snapshot?.kpis || EMPTY_DASHBOARD.kpis
  const warnings = snapshot?.warnings || []
  const pipelineRows = snapshot?.pipeline || []
  const registeredRows = snapshot?.registered || []
  const attentionRows = snapshot?.attention || []
  const missingRevenue = countMissingRevenue([...pipelineRows, ...registeredRows], warnings)
  const drilldowns = useMemo(() => getDashboardDrilldowns(snapshot, support), [snapshot, support])
  const selectedDrilldown = drilldowns[drilldownKey]

  const metrics = [
    {
      drilldown: 'activeOrganisations',
      icon: Building2,
      label: 'Active Organisations',
      meta: 'Enabled workspaces',
      value: formatCount(kpis.activeOrganisations),
    },
    {
      drilldown: 'activeAgents',
      icon: UserRoundCheck,
      label: 'Active Agents',
      meta: 'Agent participation',
      tone: 'blue',
      value: formatCount(kpis.activeAgents),
    },
    {
      drilldown: 'activeListings',
      icon: Home,
      label: 'Active Listings',
      meta: 'Live opportunity base',
      tone: 'teal',
      value: formatCount(kpis.activeListings),
    },
    {
      drilldown: 'pipeline',
      icon: CircleDollarSign,
      label: 'Pipeline Revenue',
      meta: 'Signed, not registered',
      tone: 'amber',
      value: formatMoney(kpis.pipelineRevenue),
    },
    {
      drilldown: 'registered',
      icon: CheckCircle2,
      label: 'Registered Revenue This Month',
      meta: 'Recognized Arch9 revenue',
      value: formatMoney(kpis.registeredRevenueThisMonth),
    },
    {
      drilldown: 'pipeline',
      icon: BarChart3,
      label: 'Seller + Buyer Signed',
      meta: 'Pipeline count',
      tone: 'blue',
      value: formatCount(kpis.sellerSignedBuyerSigned),
    },
    {
      drilldown: 'registered',
      icon: ShieldCheck,
      label: 'Registered This Month',
      meta: 'Completed transfers',
      tone: 'teal',
      value: formatCount(kpis.registeredThisMonth),
    },
    {
      drilldown: 'stalled',
      icon: Clock3,
      label: 'Stalled Transactions',
      meta: '14+ days quiet',
      tone: 'red',
      value: formatCount(kpis.stalledTransactions),
    },
  ]

  return (
    <div className="view-stack">
      <StatusStrip dashboard={snapshot} isLoading={isLoading} support={support} />

      <section className="metric-grid" aria-label="Operating metrics">
        {metrics.map((metric) => (
          <MetricCard
            active={drilldownKey === metric.drilldown}
            icon={metric.icon}
            key={metric.label}
            label={metric.label}
            meta={metric.meta}
            onClick={() => setDrilldownKey(metric.drilldown)}
            tone={metric.tone}
            value={metric.value}
          />
        ))}
      </section>

      {selectedDrilldown ? (
        <DrilldownPanel
          config={selectedDrilldown}
          onClose={() => setDrilldownKey('')}
        />
      ) : null}

      {warnings.length ? <WarningsPanel warnings={warnings} /> : null}

      <section className="dashboard-overview">
        <RevenuePath activeKey={drilldownKey} onSelect={setDrilldownKey} snapshot={snapshot} />
        <SupportBrief onSelect={setDrilldownKey} support={support} />
      </section>

      <section className="two-column">
        <DataPanel
          empty="No seller/buyer signed pipeline items yet."
          meta={`${formatCount(missingRevenue)} missing revenue values`}
          rows={pipelineRows}
          title="Pipeline"
          type="pipeline"
        />
        <DataPanel
          empty="No registrations in this range."
          meta={`${formatCount(kpis.registeredThisMonth)} registered`}
          rows={registeredRows}
          title="Registered This Month"
          type="registered"
        />
      </section>

      <QueuePanel empty="No stalled transactions in the current data contract." rows={attentionRows} title="Transactions Requiring Attention" />
    </div>
  )
}

function DrilldownPanel({ config, onClose }) {
  const rows = config?.rows || []

  return (
    <section className="drilldown-panel">
      <div className="panel-title">
        <div>
          <h2>{config.title}</h2>
          <span>{config.meta}</span>
        </div>
        <button className="icon-button" onClick={onClose} title="Close drilldown" type="button">
          <X size={16} />
        </button>
      </div>
      <div className="table-shell">
        {rows.length ? <DrilldownTable rows={rows} type={config.type} /> : <p className="empty-state">{config.empty}</p>}
      </div>
    </section>
  )
}

function DrilldownTable({ rows = [], type = '' }) {
  if (type === 'organisations') {
    return (
      <table>
        <thead>
          <tr>
            <th>Organisation</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row) => (
            <tr key={row.id || row.name}>
              <td>
                <strong>{row.name || row.tradingName || row.id || 'Organisation'}</strong>
                <span>{row.tradingName || row.id || 'No secondary name'}</span>
              </td>
              <td>{row.status || 'active'}</td>
              <td>{row.ownerId || row.accountOwnerId || 'No owner'}</td>
              <td>{formatDateTime(row.updatedAt || row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (type === 'agents') {
    return (
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Role</th>
            <th>Organisation</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row) => (
            <tr key={row.id || row.email || row.name}>
              <td>
                <strong>{row.name || row.email || row.id || 'Agent'}</strong>
                <span>{row.email || row.phone || 'No contact detail'}</span>
              </td>
              <td>{row.role || 'agent'}</td>
              <td>{row.organisationId || 'No organisation'}</td>
              <td>{formatDateTime(row.updatedAt || row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (type === 'listings') {
    return (
      <table>
        <thead>
          <tr>
            <th>Listing</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row) => (
            <tr key={row.id || row.reference || row.title}>
              <td>
                <strong>{row.title || row.reference || row.id || 'Listing'}</strong>
                <span>{row.location || row.address || 'No location'}</span>
              </td>
              <td>{row.status || 'active'}</td>
              <td>
                <strong>{row.organisationId || 'No organisation'}</strong>
                <span>{row.agentId || 'No agent'}</span>
              </td>
              <td>{row.price ? formatMoney(row.price) : 'No value'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (type === 'support') {
    return (
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Context</th>
            <th>Priority</th>
            <th>Next action</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row) => (
            <tr key={supportItemKey(row)}>
              <td>
                <strong>{supportItemTitle(row)}</strong>
                <span>{supportTypeLabel(row.type)}</span>
              </td>
              <td>
                <strong>{row.organisationId || row.ownerId || 'No owner context'}</strong>
                <span>{row.status || row.source || 'No status'}</span>
              </td>
              <td>{normalizePriority(row.priority)}</td>
              <td>{row.suggestedAction || 'Review item.'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (type === 'queue') {
    return (
      <table>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Stage</th>
            <th>Priority</th>
            <th>Last activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row) => (
            <tr key={row.id || row.reference}>
              <td>
                <strong>{row.title || row.reference || row.id || 'Transaction'}</strong>
                <span>{row.suggestedAction || 'Review item'}</span>
              </td>
              <td>{row.stage || row.status || 'No stage'}</td>
              <td>{normalizePriority(row.priority)}</td>
              <td>{formatDateTime(row.lastActivityAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Reference</th>
          <th>People</th>
          <th>Date</th>
          <th>Revenue</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 50).map((row) => (
          <tr key={row.id || row.reference}>
            <td>
              <strong>{row.reference || row.title || row.id || 'Transaction'}</strong>
              <span>{row.stage || row.status || 'No stage'}</span>
            </td>
            <td>
              <strong>{[row.buyer, row.seller].filter(Boolean).join(' / ') || 'No names'}</strong>
              <span>{row.organisationId || row.agentId || 'No owner context'}</span>
            </td>
            <td>{formatDate(row.registeredAt || row.lastActivityAt)}</td>
            <td>
              <strong>{formatMoney(row.revenue)}</strong>
              {row.revenueMissing ? <span className="missing">Missing revenue</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SupportLane({ items = [], onSelectItem, selectedItemKey = '', title }) {
  return (
    <section className="support-lane">
      <div className="panel-title">
        <h2>{title}</h2>
        <span>{formatCount(items.length)}</span>
      </div>
      <div className="queue-list">
        {items.length ? (
          items.slice(0, 6).map((item) => (
            <button
              className={`queue-item ${item.priority || 'normal'}${selectedItemKey === supportItemKey(item) ? ' active' : ''}`}
              key={`${title}-${item.type}-${item.id || item.title}`}
              onClick={() => onSelectItem?.(item)}
              type="button"
            >
              <div>
                <strong>{supportItemTitle(item)}</strong>
                <span>{item.suggestedAction || item.status || 'Review item'}</span>
              </div>
              <div>
                <b>{supportTypeLabel(item.type)}</b>
                <span>{formatDateTime(item.lastActivityAt)}</span>
              </div>
            </button>
          ))
        ) : (
          <p className="empty-state">No items in this lane.</p>
        )}
      </div>
    </section>
  )
}

function SupportQueueTable({ items = [], onSelectItem, selectedItemKey = '' }) {
  return (
    <section className="data-panel">
      <div className="panel-title">
        <h2>Work Queue</h2>
        <span>{formatCount(items.length)}</span>
      </div>
      <div className="table-shell">
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Context</th>
                <th>Priority</th>
                <th>Last activity</th>
                <th>Next action</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 30).map((item) => (
                <tr
                  className={selectedItemKey === supportItemKey(item) ? 'selected-row' : ''}
                  key={`support-row-${item.type}-${item.id || item.title}`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onSelectItem?.(item)
                  }}
                  onClick={() => onSelectItem?.(item)}
                  tabIndex={0}
                >
                  <td>
                    <strong>{supportItemTitle(item)}</strong>
                    <span>{supportTypeLabel(item.type)}</span>
                  </td>
                  <td>
                    <strong>{item.organisationId || item.ownerId || 'No owner context'}</strong>
                    <span>{item.status || item.source || 'No status'}</span>
                  </td>
                  <td>
                    <strong>{normalizePriority(item.priority)}</strong>
                  </td>
                  <td>{formatDateTime(item.lastActivityAt)}</td>
                  <td>{item.suggestedAction || 'Review item and update status.'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-state">No support items match this filter.</p>
        )}
      </div>
    </section>
  )
}

function SupportItemDetail({ item }) {
  if (!item) {
    return (
      <section className="detail-panel">
        <div className="panel-title">
          <h2>Item Detail</h2>
          <span>None selected</span>
        </div>
        <p className="empty-state">Select a queue item to inspect the operating context.</p>
      </section>
    )
  }

  const rows = [
    ['Type', supportTypeLabel(item.type)],
    ['Priority', normalizePriority(item.priority)],
    ['Status', item.status || 'No status'],
    ['Organisation', item.organisationId || 'No organisation'],
    ['Owner', item.ownerId || 'No owner'],
    ['Last activity', formatDateTime(item.lastActivityAt)],
    ['Source', item.source || 'support'],
    ['Next action', item.suggestedAction || 'Review item and update status.'],
  ]

  return (
    <section className="detail-panel">
      <div className="panel-title">
        <div>
          <h2>{supportItemTitle(item)}</h2>
          <span>{supportTypeLabel(item.type)}</span>
        </div>
      </div>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function SupportView({ dashboard, snapshot }) {
  const [filter, setFilter] = useState('all')
  const [selectedItemKey, setSelectedItemKey] = useState('')
  const summary = snapshot?.summary || EMPTY_SUPPORT.summary
  const items = useMemo(() => buildSupportItems(snapshot, dashboard), [snapshot, dashboard])
  const urgentItems = items.filter((item) => ['urgent', 'high'].includes(normalizePriority(item.priority)))
  const stalledItems = items.filter((item) => item.type === 'stalled_transaction')
  const revenueItems = items.filter((item) => item.type === 'missing_revenue')
  const filteredItems = items.filter((item) => {
    if (filter === 'urgent') return ['urgent', 'high'].includes(normalizePriority(item.priority))
    if (filter === 'tickets') return item.type === 'support_ticket'
    if (filter === 'stalled') return item.type === 'stalled_transaction'
    if (filter === 'revenue') return item.type === 'missing_revenue'
    return true
  })
  const filters = [
    ['all', 'All'],
    ['urgent', 'Urgent'],
    ['tickets', 'Tickets'],
    ['stalled', 'Stalled'],
    ['revenue', 'Revenue Gaps'],
  ]
  const selectedItem =
    filteredItems.find((item) => supportItemKey(item) === selectedItemKey) ||
    filteredItems[0] ||
    items.find((item) => supportItemKey(item) === selectedItemKey) ||
    null

  useEffect(() => {
    if (!filteredItems.length) {
      setSelectedItemKey('')
      return
    }

    if (!filteredItems.some((item) => supportItemKey(item) === selectedItemKey)) {
      setSelectedItemKey(supportItemKey(filteredItems[0]))
    }
  }, [filteredItems, selectedItemKey])

  function selectItem(item) {
    setSelectedItemKey(supportItemKey(item))
  }

  return (
    <div className="view-stack">
      <section className="metric-grid compact-grid" aria-label="Support metrics">
        <MetricCard active={filter === 'tickets'} icon={Headphones} label="Open Tickets" meta="Unresolved issues" onClick={() => setFilter('tickets')} value={formatCount(summary.openTickets)} />
        <MetricCard active={filter === 'urgent'} icon={AlertTriangle} label="Urgent Items" meta="High-priority support" onClick={() => setFilter('urgent')} tone="red" value={formatCount(urgentItems.length || summary.urgentTickets)} />
        <MetricCard active={filter === 'stalled'} icon={Clock3} label="Stalled Transactions" meta="14+ days quiet" onClick={() => setFilter('stalled')} tone="amber" value={formatCount(summary.stalledTransactions)} />
        <MetricCard active={filter === 'revenue'} icon={CircleDollarSign} label="Revenue Gaps" meta="Missing Arch9 revenue" onClick={() => setFilter('revenue')} tone="blue" value={formatCount(summary.missingRevenueItems || revenueItems.length)} />
      </section>

      {(snapshot?.warnings || []).length ? <WarningsPanel warnings={snapshot.warnings} /> : null}

      <section className="support-lanes">
        <SupportLane items={urgentItems} onSelectItem={selectItem} selectedItemKey={selectedItemKey} title="Urgent" />
        <SupportLane items={stalledItems} onSelectItem={selectItem} selectedItemKey={selectedItemKey} title="Stalled Transactions" />
        <SupportLane items={revenueItems} onSelectItem={selectItem} selectedItemKey={selectedItemKey} title="Missing Revenue" />
      </section>

      <section className="support-filter-panel">
        <div>
          <h2>Queue Filter</h2>
          <span>{formatCount(filteredItems.length)} visible</span>
        </div>
        <div className="segmented-control" role="tablist" aria-label="Support queue filter">
          {filters.map(([id, label]) => (
            <button className={filter === id ? 'active' : ''} key={id} onClick={() => setFilter(id)} type="button">
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="support-detail-layout">
        <SupportQueueTable items={filteredItems} onSelectItem={selectItem} selectedItemKey={selectedItemKey} />
        <SupportItemDetail item={selectedItem} />
      </section>
    </div>
  )
}

function WarningsPanel({ warnings = [] }) {
  return (
    <section className="warning-panel">
      <div>
        <AlertTriangle size={18} />
        <h2>Data Warnings</h2>
      </div>
      <ul>
        {warnings.slice(0, 8).map((warning, index) => (
          <li key={`${warning?.type || warning?.table || 'warning'}-${index}`}>
            {warning?.message || warning?.table || String(warning)}
          </li>
        ))}
      </ul>
    </section>
  )
}

function DataPanel({ empty, meta = '', rows = [], title, type }) {
  return (
    <section className="data-panel">
      <div className="panel-title">
        <h2>{title}</h2>
        <span>{meta || formatCount(rows.length)}</span>
      </div>
      <div className="table-shell">
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>People</th>
                <th>{type === 'registered' ? 'Registered' : 'Activity'}</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={row.id || row.reference}>
                  <td>
                    <strong>{row.reference || row.id || 'Transaction'}</strong>
                    <span>{row.stage || row.status || 'No stage'}</span>
                  </td>
                  <td>
                    <strong>{[row.buyer, row.seller].filter(Boolean).join(' / ') || 'No names'}</strong>
                    <span>{row.organisationId || 'No organisation'}</span>
                  </td>
                  <td>{formatDate(type === 'registered' ? row.registeredAt : row.lastActivityAt)}</td>
                  <td>
                    <strong>{formatMoney(row.revenue)}</strong>
                    {row.revenueMissing ? <span className="missing">Missing revenue</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-state">{empty}</p>
        )}
      </div>
    </section>
  )
}

function QueuePanel({ empty, rows = [], title }) {
  return (
    <section className="data-panel">
      <div className="panel-title">
        <h2>{title}</h2>
        <span>{formatCount(rows.length)}</span>
      </div>
      <div className="queue-list">
        {rows.length ? (
          rows.slice(0, 20).map((row) => (
            <article className={`queue-item ${row.priority || 'medium'}`} key={`${row.type}-${row.id}`}>
              <div>
                <strong>{row.title || row.reference || row.id}</strong>
                <span>{row.suggestedAction || row.status || row.stage || 'Review item'}</span>
              </div>
              <div>
                <b>{row.priority || 'normal'}</b>
                <span>{formatDateTime(row.lastActivityAt)}</span>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-state">{empty}</p>
        )}
      </div>
    </section>
  )
}

function SearchView() {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [warnings, setWarnings] = useState([])
  const [isSearching, setIsSearching] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setIsSearching(true)
    const next = await searchAdminData(term)
    setResults(next.results)
    setWarnings(next.warnings)
    setIsSearching(false)
  }

  return (
    <div className="view-stack">
      <form className="search-panel" onSubmit={submit}>
        <Search size={20} />
        <input
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search by name, email, organisation, reference..."
          value={term}
        />
        <button className="primary-button compact" disabled={!term || isSearching} type="submit">
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {warnings.length ? <WarningsPanel warnings={warnings} /> : null}

      <section className="data-panel">
        <div className="panel-title">
          <h2>Results</h2>
          <span>{formatCount(results.length)}</span>
        </div>
        <div className="queue-list">
          {results.length ? (
            results.map((result) => (
              <article className="queue-item" key={`${result.label}-${result.id}`}>
                <div>
                  <strong>{result.title}</strong>
                  <span>{result.meta || result.id}</span>
                </div>
                <div>
                  <b>{result.label}</b>
                  <span>{formatDateTime(result.time)}</span>
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state">Search results will appear here.</p>
          )}
        </div>
      </section>
    </div>
  )
}

function SettingsView({ access, profile }) {
  const configStatus = getSupabaseConfigStatus()
  const rows = [
    ['Access level', formatAdminLevelLabel(access.level)],
    ['Resolved roles', access.roles.join(', ') || 'No roles'],
    ['User email', profile?.email || 'Unknown'],
    ['Supabase config', configStatus.message],
    ['Dashboard RPC', 'arch9_admin_dashboard_snapshot'],
    ['Support RPC', 'arch9_admin_support_snapshot'],
  ]

  return (
    <section className="data-panel settings-panel">
      <div className="panel-title">
        <h2>Console Settings</h2>
        <span>{configStatus.ok ? 'Connected' : 'Needs config'}</span>
      </div>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function UnauthorizedScreen({ onSignOut, roles }) {
  return (
    <main className="center-shell">
      <section className="message-panel">
        <AlertTriangle size={24} />
        <h1>No admin access</h1>
        <p>Your account signed in, but it does not resolve to an Arch9 admin or support role.</p>
        <small>{roles.length ? `Resolved roles: ${roles.join(', ')}` : 'No roles were resolved.'}</small>
        <button className="secondary-button" onClick={onSignOut} type="button">
          <LogOut size={16} />
          <span>Sign out</span>
        </button>
      </section>
    </main>
  )
}

export default function App() {
  const [access, setAccess] = useState({ allowed: false, level: '', roles: [] })
  const [activeView, setActiveView] = useState('dashboard')
  const [authError, setAuthError] = useState('')
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD)
  const [profile, setProfile] = useState(null)
  const [rangeId, setRangeId] = useState('30d')
  const [session, setSession] = useState(null)
  const [support, setSupport] = useState(EMPTY_SUPPORT)
  const [isBooting, setIsBooting] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  const allowedViews = useMemo(
    () => NAV_ITEMS.filter((item) => item.levels.includes(access.level)).map((item) => item.id),
    [access.level],
  )

  async function refreshData(nextRange = rangeId) {
    if (!session?.user || !access.allowed) return
    setIsLoading(true)
    const [dashboardResult, supportResult] = await Promise.all([
      loadDashboardSnapshot(nextRange),
      loadSupportSnapshot(nextRange),
    ])

    setDashboard({
      ...EMPTY_DASHBOARD,
      ...(dashboardResult.data || {}),
      warnings: [
        ...((dashboardResult.data || {}).warnings || []),
        ...(dashboardResult.error ? [{ message: dashboardResult.error, type: 'dashboard_rpc' }] : []),
      ],
    })
    setSupport({
      ...EMPTY_SUPPORT,
      ...(supportResult.data || {}),
      warnings: [
        ...((supportResult.data || {}).warnings || []),
        ...(supportResult.error ? [{ message: supportResult.error, type: 'support_rpc' }] : []),
      ],
    })
    setIsLoading(false)
  }

  function navigate(viewId) {
    const nextView = allowedViews.includes(viewId) ? viewId : getDefaultView(access.level)
    setActiveView(nextView)
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', pathForView(nextView))
    }
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
        setAccess({ allowed: false, level: '', roles: [] })
        setDashboard(EMPTY_DASHBOARD)
        setProfile(null)
        setSupport(EMPTY_SUPPORT)
        return
      }

      const nextProfile = await loadAdminProfile(session.user.id)
      if (cancelled) return

      const nextAccess = resolveAdminAccess({ profile: nextProfile, user: session.user })
      setAccess(nextAccess)
      setProfile(nextProfile || { email: session.user.email })
      setActiveView(getViewFromPath(nextAccess.level))
    }

    resolveAccess()
    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    refreshData(rangeId)
  }, [access.allowed, rangeId, session])

  async function handleSignIn({ email, password }) {
    setAuthError('')
    if (!supabase) return
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
  }

  async function handleMagicLink({ email }) {
    setAuthError('')
    if (!supabase) return
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
      <main className="center-shell">
        <Loader2 className="spin" size={26} />
      </main>
    )
  }

  if (!session) {
    return <LoginScreen authError={authError} onMagicLink={handleMagicLink} onSignIn={handleSignIn} />
  }

  if (!access.allowed) {
    return <UnauthorizedScreen onSignOut={handleSignOut} roles={access.roles} />
  }

  const view = allowedViews.includes(activeView) ? activeView : getDefaultView(access.level)

  return (
    <div className="admin-shell">
      <Sidebar
        access={access}
        activeView={view}
        onNavigate={navigate}
        onSignOut={handleSignOut}
        profile={profile}
      />
      <main className="admin-main">
        <Topbar
          activeView={view}
          isLoading={isLoading}
          onRefresh={() => refreshData()}
          rangeId={rangeId}
          setRangeId={setRangeId}
        />
        {view === 'dashboard' ? <DashboardView isLoading={isLoading} snapshot={dashboard} support={support} /> : null}
        {view === 'support' ? <SupportView dashboard={dashboard} snapshot={support} /> : null}
        {view === 'search' ? <SearchView /> : null}
        {view === 'settings' ? <SettingsView access={access} profile={profile} /> : null}
      </main>
    </div>
  )
}
