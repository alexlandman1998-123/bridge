import {
  Bell,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  ListChecks,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  Sparkles,
  Workflow,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  BOND_AUTOMATION_CATEGORIES,
  createRule,
  disableRule,
  enableRule,
  getAutomationDashboard,
  simulateRule,
} from '../../services/bondAutomationService'

function normalizeText(value) {
  return String(value || '').trim()
}

function resolveWorkspaceId(workspaceContext = {}) {
  return normalizeText(
    workspaceContext.workspaceId ||
      workspaceContext.currentWorkspace?.id ||
      workspaceContext.workspace?.id ||
      workspaceContext.currentMembership?.workspaceId ||
      workspaceContext.currentMembership?.organisation_id ||
      workspaceContext.currentMembership?.organisationId,
  )
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`
}

function titleize(value = '') {
  return normalizeText(value).replaceAll('_', ' ')
}

function statusClass(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === 'active' || normalized === 'success') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (normalized === 'disabled' || normalized === 'failed') return 'bg-red-50 text-red-700 ring-red-200'
  if (normalized === 'draft' || normalized === 'simulated') return 'bg-amber-50 text-amber-700 ring-amber-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

function MetricCard({ label, value, icon: Icon }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
        </div>
        {Icon ? <Icon className="h-5 w-5 text-slate-500" aria-hidden="true" /> : null}
      </div>
    </article>
  )
}

function Section({ title, icon: Icon, children, action = null }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" /> : null}
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function StatusPill({ status }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ring-1 ${statusClass(status)}`}>{status || 'draft'}</span>
}

function DataTable({ columns = [], rows = [], empty = 'No data available.' }) {
  if (!rows.length) {
    return <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">{empty}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={row.id || row.ruleId || `${row.name || row.title || 'row'}-${index}`} className="align-top">
              {columns.map((column) => (
                <td key={column.key} className="whitespace-nowrap px-3 py-3 text-slate-700">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RuleBuilder({ canManage, onCreate }) {
  const [name, setName] = useState('No bank feedback after 5 days')
  const [category, setCategory] = useState('Applications')
  const [trigger, setTrigger] = useState('no_bank_feedback')
  const [field, setField] = useState('daysSinceSubmitted')
  const [operator, setOperator] = useState('gte')
  const [threshold, setThreshold] = useState(5)
  const [action, setAction] = useState('create_escalation')

  function submit(event) {
    event.preventDefault()
    onCreate({
      name,
      category,
      trigger: { event: trigger, entityType: category === 'Revenue' ? 'revenue' : category.toLowerCase().replace(/s$/, '') },
      conditions: [{ field, operator, threshold: Number(threshold) }],
      actions: [{ type: action, target: 'owner' }],
      status: 'active',
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-3 lg:grid-cols-6">
      <label className="lg:col-span-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">WHEN</span>
        <input value={trigger} onChange={(event) => setTrigger(event.target.value)} disabled={!canManage} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 disabled:bg-slate-50" />
      </label>
      <label>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={!canManage} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 disabled:bg-slate-50">
          {BOND_AUTOMATION_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">IF</span>
        <input value={field} onChange={(event) => setField(event.target.value)} disabled={!canManage} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 disabled:bg-slate-50" />
      </label>
      <label>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operator</span>
        <select value={operator} onChange={(event) => setOperator(event.target.value)} disabled={!canManage} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 disabled:bg-slate-50">
          {['gte', 'gt', 'lte', 'lt', 'equals', 'missing', 'present', 'older_than_days'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Value</span>
        <input type="number" value={threshold} onChange={(event) => setThreshold(event.target.value)} disabled={!canManage} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 disabled:bg-slate-50" />
      </label>
      <label className="lg:col-span-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rule name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 disabled:bg-slate-50" />
      </label>
      <label className="lg:col-span-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">THEN</span>
        <select value={action} onChange={(event) => setAction(event.target.value)} disabled={!canManage} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 disabled:bg-slate-50">
          {['create_escalation', 'send_notification', 'create_task', 'create_bank_escalation', 'create_executive_alert', 'create_reassignment_recommendation', 'calculate_commission', 'create_payout_item'].map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
        </select>
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={!canManage} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          <Workflow className="h-4 w-4" aria-hidden="true" />
          Create Rule
        </button>
      </div>
    </form>
  )
}

export default function BondAutomationCentrePage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState('')
  const [simulation, setSimulation] = useState(null)
  const options = useMemo(() => ({ workspaceId, refreshKey }), [workspaceId, refreshKey])

  const state = useMemo(() => {
    try {
      return { dashboard: getAutomationDashboard(workspaceContext, options), error: '' }
    } catch (error) {
      return { dashboard: null, error: String(error?.message || 'Could not load automation centre.') }
    }
  }, [workspaceContext, options])
  const dashboard = state.dashboard
  const canManage = Boolean(dashboard?.permissions?.canManageRules)

  function refresh() {
    setNotice('Automation & Rules refreshed.')
    setRefreshKey((value) => value + 1)
  }

  function handleCreate(payload) {
    try {
      createRule(payload, workspaceContext, options)
      setNotice('Automation rule created.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not create rule.'))
    }
  }

  function toggleRule(rule) {
    try {
      if (rule.status === 'active') {
        disableRule(rule.id, workspaceContext, options)
        setNotice(`${rule.name} disabled.`)
      } else {
        enableRule(rule.id, workspaceContext, options)
        setNotice(`${rule.name} enabled.`)
      }
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not update rule.'))
    }
  }

  function testRule(rule) {
    try {
      setSimulation(simulateRule(rule, workspaceContext, options))
      setNotice(`${rule.name} simulated.`)
    } catch (error) {
      setNotice(String(error?.message || 'Could not simulate rule.'))
    }
  }

  if (state.error) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">Automation & Rules</h1>
          <p className="mt-3 text-sm text-slate-600">{state.error}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bond Originator</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Automation & Rules</h1>
            <p className="mt-1 text-sm text-slate-500">Decision rules, workflow actions, and automation intelligence</p>
          </div>
          <button type="button" onClick={refresh} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </header>

        <nav className="flex flex-wrap gap-2 text-sm">
          {[
            ['Dashboard', '/dashboard'],
            ['HQ Command Centre', '/bond/hq-command-centre'],
            ['Revenue & Commissions', '/bond/revenue'],
            ['Bank Relationships', '/bond/banks'],
            ['Automation & Rules', '/bond/automation'],
          ].map(([label, to]) => (
            <Link key={label} to={to} className={`rounded-lg px-3 py-2 font-medium ${label === 'Automation & Rules' ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
              {label}
            </Link>
          ))}
        </nav>

        {notice ? <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Active Rules" value={dashboard.summary.activeRules} icon={Workflow} />
          <MetricCard label="Triggered Today" value={dashboard.summary.automationsTriggeredToday} icon={Bot} />
          <MetricCard label="Escalations Created" value={dashboard.summary.escalationsCreated} icon={Bell} />
          <MetricCard label="Notifications Sent" value={dashboard.summary.notificationsSent} icon={CheckCircle2} />
          <MetricCard label="Tasks Generated" value={dashboard.summary.tasksGenerated} icon={ListChecks} />
          <MetricCard label="Success Rate" value={formatPercent(dashboard.summary.automationSuccessRate)} icon={Gauge} />
        </section>

        <Section title="Automation Rule Builder" icon={Workflow}>
          <RuleBuilder canManage={canManage} onCreate={handleCreate} />
        </Section>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <Section title="Automation Rules" icon={Bot}>
            <DataTable
              rows={dashboard.rules}
              columns={[
                { key: 'name', label: 'Rule' },
                { key: 'category', label: 'Category' },
                { key: 'trigger', label: 'When', render: (row) => titleize(row.trigger?.event) },
                { key: 'conditions', label: 'If', render: (row) => `${row.conditions?.length || 0} condition${row.conditions?.length === 1 ? '' : 's'}` },
                { key: 'actions', label: 'Then', render: (row) => `${row.actions?.length || 0} action${row.actions?.length === 1 ? '' : 's'}` },
                { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
                {
                  key: 'actionsMenu',
                  label: 'Action',
                  render: (row) => (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => testRule(row)} className="inline-flex items-center gap-1 font-semibold text-slate-950 hover:underline">
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        Test
                      </button>
                      {canManage ? (
                        <button type="button" onClick={() => toggleRule(row)} className="inline-flex items-center gap-1 font-semibold text-slate-950 hover:underline">
                          {row.status === 'active' ? <PowerOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Power className="h-3.5 w-3.5" aria-hidden="true" />}
                          {row.status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
          </Section>

          <Section title="Automation Simulator" icon={Play}>
            {simulation ? (
              <div className="grid gap-3">
                <MetricCard label="Would Trigger" value={simulation.triggerCount} />
                <MetricCard label="Escalations" value={simulation.created.escalations} />
                <MetricCard label="Notifications" value={simulation.created.notifications} />
                <MetricCard label="Tasks" value={simulation.created.tasks} />
                <MetricCard label="Payout Items" value={simulation.created.payouts} />
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">Test a rule to preview its last-30-day impact.</p>
            )}
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Automation History" icon={Clock3}>
            <DataTable
              rows={dashboard.history}
              empty="No automation history recorded yet."
              columns={[
                { key: 'ruleName', label: 'Rule' },
                { key: 'entityType', label: 'Entity' },
                { key: 'actionType', label: 'Action', render: (row) => titleize(row.actionType) },
                { key: 'result', label: 'Result', render: (row) => <StatusPill status={row.result} /> },
                { key: 'createdAt', label: 'Triggered', render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleString() : '' },
              ]}
            />
          </Section>

          <Section title="Automation Analytics" icon={Gauge}>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Rules Triggered" value={dashboard.analytics.rulesTriggered} />
              <MetricCard label="Failures" value={dashboard.analytics.failures} />
              <MetricCard label="Time Saved" value={`${dashboard.analytics.timeSavedMinutes} min`} />
              <MetricCard label="Success Rate" value={formatPercent(dashboard.analytics.successRate)} />
            </div>
            <div className="mt-4">
              <DataTable
                rows={dashboard.analytics.mostActiveRules}
                empty="No active rule analytics yet."
                columns={[
                  { key: 'ruleName', label: 'Most Active Rules' },
                  { key: 'count', label: 'Triggers' },
                ]}
              />
            </div>
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Automation Recommendations" icon={Sparkles}>
            <DataTable
              rows={dashboard.recommendations}
              empty="No automation recommendations yet."
              columns={[
                { key: 'title', label: 'Recommendation' },
                { key: 'category', label: 'Category' },
                { key: 'impact', label: 'Impact' },
                { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
              ]}
            />
          </Section>

          <Section title="Communication Templates" icon={FileText}>
            <DataTable
              rows={dashboard.templates}
              columns={[
                { key: 'name', label: 'Template' },
                { key: 'category', label: 'Category' },
                { key: 'channel', label: 'Channel' },
                { key: 'subject', label: 'Subject' },
              ]}
            />
          </Section>
        </div>
      </div>
    </main>
  )
}
