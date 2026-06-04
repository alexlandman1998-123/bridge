import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  LineChart,
  MessageSquare,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  createBankContact,
  createBankEscalation,
  createConsultantFeedback,
  getBankDashboard,
  getBankSubmissionAnalytics,
  getBankWorkspace,
  updateBankContact,
} from '../../services/bondBankRelationshipService'

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

function resolveActorId(workspaceContext = {}) {
  return normalizeText(workspaceContext.userId || workspaceContext.user?.id || workspaceContext.profile?.id || workspaceContext.currentMembership?.userId || workspaceContext.currentMembership?.user_id)
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`
}

function formatHours(value) {
  return `${Math.round(Number(value || 0) * 10) / 10}h`
}

function formatDays(value) {
  return `${Math.round(Number(value || 0) * 10) / 10}d`
}

function statusClass(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized.includes('critical') || normalized.includes('high')) return 'bg-red-50 text-red-700 ring-red-200'
  if (normalized.includes('risk') || normalized.includes('medium') || normalized.includes('increasing')) return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (normalized.includes('healthy') || normalized.includes('low') || normalized.includes('stable') || normalized.includes('open')) return 'bg-sky-50 text-sky-700 ring-sky-200'
  if (normalized.includes('excellent') || normalized.includes('positive')) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

function MetricCard({ label, value, helper, icon: Icon }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
        </div>
        {Icon ? <Icon className="h-5 w-5 text-slate-500" aria-hidden="true" /> : null}
      </div>
      {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
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
            <tr key={row.id || row.bankId || row.applicationId || `${row.stage || row.reason || 'row'}-${index}`} className="align-top">
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

function StatusPill({ status }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(status)}`}>{status || 'Stable'}</span>
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="text-sm font-medium text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-950"
      />
    </label>
  )
}

function DashboardView({ dashboard, refresh }) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Applications Submitted" value={dashboard.summary.applicationsSubmitted} icon={Banknote} />
        <MetricCard label="Approvals" value={dashboard.summary.approvals} icon={CheckCircle2} />
        <MetricCard label="Declines" value={dashboard.summary.declines} icon={AlertTriangle} />
        <MetricCard label="Approval Rate" value={formatPercent(dashboard.summary.approvalRate)} icon={Gauge} />
        <MetricCard label="Average Response Time" value={formatHours(dashboard.summary.averageResponseTime)} icon={Clock3} />
        <MetricCard label="Instructions Issued" value={dashboard.summary.instructionsIssued} icon={FileText} />
        <MetricCard label="Escalations" value={dashboard.summary.escalations} icon={AlertTriangle} />
        <MetricCard label="Active Banks" value={dashboard.summary.activeBanks} icon={Building2} />
      </section>

      <Section title="Bank Scorecards" icon={Banknote} action={<button type="button" onClick={refresh} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button>}>
        <DataTable
          rows={dashboard.scorecards}
          columns={[
            { key: 'bankName', label: 'Bank' },
            { key: 'applicationsSubmitted', label: 'Submitted' },
            { key: 'approvals', label: 'Approvals' },
            { key: 'declines', label: 'Declines' },
            { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
            { key: 'averageTurnaround', label: 'Turnaround', render: (row) => formatDays(row.averageTurnaround) },
            { key: 'instructionConversion', label: 'Instruction %', render: (row) => formatPercent(row.instructionConversion) },
            { key: 'escalations', label: 'Escalations' },
            { key: 'relationshipHealth', label: 'Health', render: (row) => <StatusPill status={row.relationshipHealth} /> },
            { key: 'action', label: 'Action', render: (row) => <Link className="font-semibold text-slate-950 hover:underline" to={`/bond/banks/${encodeURIComponent(row.bankId)}`}>View Bank</Link> },
          ]}
        />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Bank Rankings" icon={LineChart}>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['Best Overall', dashboard.rankings.bestOverall],
              ['Fastest', dashboard.rankings.fastest],
              ['Highest Approval', dashboard.rankings.highestApproval],
              ['Most At Risk', dashboard.rankings.mostAtRisk],
            ].map(([title, rows]) => (
              <div key={title} className="rounded-lg border border-slate-200 p-3">
                <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
                <div className="mt-3 space-y-2">
                  {rows.slice(0, 5).map((row) => (
                    <div key={`${title}-${row.bankId}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-slate-600">{row.bankName}</span>
                      <span className="font-semibold text-slate-950">{title === 'Fastest' ? formatHours(row.averageResponseTime) : row.healthScore || formatPercent(row.approvalRate)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Decline Reason Analysis" icon={AlertTriangle}>
          <DataTable
            rows={dashboard.declineAnalysis}
            columns={[
              { key: 'reason', label: 'Reason' },
              { key: 'count', label: 'Count' },
              { key: 'trend', label: 'Trend', render: (row) => <StatusPill status={row.trend} /> },
              { key: 'affectedBank', label: 'Affected Bank' },
            ]}
          />
        </Section>
      </div>

      <Section title="Bank Comparison" icon={Building2}>
        <DataTable
          rows={dashboard.comparison}
          columns={[
            { key: 'bankName', label: 'Bank' },
            { key: 'applications', label: 'Applications' },
            { key: 'approvals', label: 'Approvals' },
            { key: 'approvalRate', label: 'Approval %', render: (row) => formatPercent(row.approvalRate) },
            { key: 'averageResponseTime', label: 'Avg Response', render: (row) => formatHours(row.averageResponseTime) },
            { key: 'instructionRate', label: 'Instruction %', render: (row) => formatPercent(row.instructionRate) },
            { key: 'escalations', label: 'Escalations' },
            { key: 'healthScore', label: 'Health Score' },
            { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
          ]}
        />
      </Section>

      <Section title="Regional Bank Performance" icon={LineChart}>
        <DataTable
          rows={dashboard.regionalPerformance}
          columns={[
            { key: 'regionName', label: 'Region' },
            { key: 'bankName', label: 'Bank' },
            { key: 'applications', label: 'Applications' },
            { key: 'approvals', label: 'Approvals' },
            { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
            { key: 'responseTime', label: 'Response', render: (row) => formatHours(row.responseTime) },
            { key: 'relationshipRisk', label: 'Risk', render: (row) => <StatusPill status={row.relationshipRisk} /> },
          ]}
        />
      </Section>
    </>
  )
}

function WorkspaceView({ workspace, analytics, notice, saveContact, saveEscalation, saveFeedback, contactDraft, setContactDraft, escalationDraft, setEscalationDraft, feedbackDraft, setFeedbackDraft }) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Applications" value={workspace.performance.metrics.applications} icon={Banknote} />
        <MetricCard label="Approval Rate" value={formatPercent(workspace.performance.metrics.approvalRate)} icon={Gauge} />
        <MetricCard label="Instruction Rate" value={formatPercent(workspace.performance.metrics.instructionRate)} icon={CheckCircle2} />
        <MetricCard label="Relationship Health" value={workspace.health.score} helper={workspace.health.status} icon={LineChart} />
      </section>

      {notice ? <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}

      <nav className="flex flex-wrap gap-2 text-sm">
        {workspace.tabs.map((tab) => (
          <a key={tab} href={`#${tab.toLowerCase()}`} className="rounded-lg bg-white px-3 py-2 font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">{tab}</a>
        ))}
      </nav>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Performance" icon={LineChart}>
          <DataTable
            rows={workspace.performance.trend}
            columns={[
              { key: 'periodDays', label: 'Trend', render: (row) => `${row.periodDays}d` },
              { key: 'applications', label: 'Applications' },
              { key: 'approvals', label: 'Approvals' },
              { key: 'declines', label: 'Declines' },
              { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
              { key: 'averageResponseTime', label: 'Response', render: (row) => formatHours(row.averageResponseTime) },
            ]}
          />
        </Section>

        <Section title="Submission Analytics" icon={Gauge}>
          <DataTable
            rows={analytics}
            columns={[
              { key: 'stage', label: 'Stage' },
              { key: 'count', label: 'Count' },
              { key: 'conversionRate', label: 'Conversion', render: (row) => formatPercent(row.conversionRate) },
              { key: 'dropOff', label: 'Drop-off' },
              { key: 'averageDelay', label: 'Delay', render: (row) => formatDays(row.averageDelay) },
            ]}
          />
        </Section>
      </div>

      <Section title="Applications" icon={FileText}>
        <DataTable
          rows={workspace.applications}
          columns={[
            { key: 'applicationReference', label: 'Application' },
            { key: 'consultantName', label: 'Consultant' },
            { key: 'branchName', label: 'Branch' },
            { key: 'status', label: 'Status' },
            { key: 'responseTime', label: 'Response', render: (row) => formatHours(row.responseTime) },
            { key: 'declineReason', label: 'Decline Reason' },
          ]}
        />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Escalations" icon={AlertTriangle}>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <Field label="Application ID" value={escalationDraft.applicationId} onChange={(value) => setEscalationDraft({ ...escalationDraft, applicationId: value })} />
            <Field label="Issue" value={escalationDraft.issue} onChange={(value) => setEscalationDraft({ ...escalationDraft, issue: value })} />
            <Field label="Issue Type" value={escalationDraft.issueType} onChange={(value) => setEscalationDraft({ ...escalationDraft, issueType: value })} />
            <Field label="Priority" value={escalationDraft.priority} onChange={(value) => setEscalationDraft({ ...escalationDraft, priority: value })} />
          </div>
          <button type="button" onClick={saveEscalation} className="mb-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" />Create Escalation</button>
          <DataTable
            rows={workspace.escalations}
            columns={[
              { key: 'application', label: 'Application' },
              { key: 'consultantName', label: 'Consultant' },
              { key: 'branchName', label: 'Branch' },
              { key: 'issue', label: 'Issue' },
              { key: 'age', label: 'Age', render: (row) => `${row.age}d` },
              { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
            ]}
          />
        </Section>

        <Section title="Contacts" icon={Users}>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <Field label="Name" value={contactDraft.name} onChange={(value) => setContactDraft({ ...contactDraft, name: value })} />
            <Field label="Role" value={contactDraft.role} onChange={(value) => setContactDraft({ ...contactDraft, role: value })} />
            <Field label="Email" value={contactDraft.email} onChange={(value) => setContactDraft({ ...contactDraft, email: value })} />
            <Field label="Phone" value={contactDraft.phone} onChange={(value) => setContactDraft({ ...contactDraft, phone: value })} />
            <Field label="Region" value={contactDraft.region} onChange={(value) => setContactDraft({ ...contactDraft, region: value })} />
            <Field label="Notes" value={contactDraft.notes} onChange={(value) => setContactDraft({ ...contactDraft, notes: value })} />
          </div>
          <button type="button" onClick={saveContact} className="mb-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" />Save Contact</button>
          <DataTable
            rows={workspace.contacts}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'role', label: 'Role' },
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
              { key: 'region', label: 'Region' },
            ]}
          />
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Consultant Bank Feedback" icon={MessageSquare}>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <Field label="Feedback Type" value={feedbackDraft.feedbackType} onChange={(value) => setFeedbackDraft({ ...feedbackDraft, feedbackType: value })} />
            <Field label="Message" value={feedbackDraft.message} onChange={(value) => setFeedbackDraft({ ...feedbackDraft, message: value })} />
          </div>
          <button type="button" onClick={saveFeedback} className="mb-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" />Add Feedback</button>
          <DataTable
            rows={workspace.feedback}
            columns={[
              { key: 'feedbackType', label: 'Type' },
              { key: 'sentiment', label: 'Sentiment', render: (row) => <StatusPill status={row.sentiment} /> },
              { key: 'message', label: 'Message' },
              { key: 'consultantName', label: 'Consultant' },
            ]}
          />
        </Section>

        <Section title="Activity" icon={Clock3}>
          <div className="space-y-3">
            {workspace.activity.slice(0, 12).map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{row.eventType.replaceAll('_', ' ')}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(row.createdAt).toLocaleString()}</p>
                </div>
                <StatusPill status={row.eventType} />
              </div>
            ))}
            {!workspace.activity.length ? <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">No bank activity yet.</p> : null}
          </div>
        </Section>
      </div>
    </>
  )
}

export default function BondBankRelationshipsPage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const { bankId = '' } = useParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState('')
  const [contactDraft, setContactDraft] = useState({ name: '', role: 'Business Development Manager', email: '', phone: '', region: '', notes: '' })
  const [escalationDraft, setEscalationDraft] = useState({ applicationId: '', issue: '', issueType: 'Slow Responses', priority: 'Medium' })
  const [feedbackDraft, setFeedbackDraft] = useState({ feedbackType: 'Relationship Feedback', message: '' })
  const options = useMemo(() => ({ workspaceId, refreshKey }), [workspaceId, refreshKey])

  const state = useMemo(() => {
    try {
      if (bankId) {
        return {
          dashboard: null,
          workspace: getBankWorkspace(bankId, workspaceContext, options),
          analytics: getBankSubmissionAnalytics(bankId, workspaceContext, options),
          error: '',
        }
      }
      return { dashboard: getBankDashboard(workspaceContext, options), workspace: null, analytics: [], error: '' }
    } catch (error) {
      return { dashboard: null, workspace: null, analytics: [], error: String(error?.message || 'Could not load bank relationships.') }
    }
  }, [bankId, workspaceContext, options])

  function refresh() {
    setNotice('Bank relationships refreshed.')
    setRefreshKey((value) => value + 1)
  }

  function saveContact() {
    if (!bankId) return
    try {
      const existing = state.workspace?.contacts?.find((contact) => contact.email && contact.email === contactDraft.email)
      if (existing) updateBankContact(existing.id, contactDraft, workspaceContext, options)
      else createBankContact({ ...contactDraft, bankId }, workspaceContext, options)
      setNotice('Bank contact saved.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not save bank contact.'))
    }
  }

  function saveEscalation() {
    if (!bankId) return
    try {
      createBankEscalation({ ...escalationDraft, bankId, createdBy: resolveActorId(workspaceContext) }, workspaceContext, options)
      setNotice('Bank escalation created.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not create bank escalation.'))
    }
  }

  function saveFeedback() {
    if (!bankId) return
    try {
      createConsultantFeedback(bankId, { ...feedbackDraft, createdBy: resolveActorId(workspaceContext) }, workspaceContext, options)
      setNotice('Bank feedback added.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not add bank feedback.'))
    }
  }

  if (state.error) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">Bank Relationships</h1>
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
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">{state.workspace ? state.workspace.bank.name : 'Bank Relationships'}</h1>
            <p className="mt-1 text-sm text-slate-500">{state.workspace ? 'Bank workspace' : 'Bank Relationship Management'}</p>
          </div>
          {state.workspace ? <Link className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" to="/bond/banks">All Banks</Link> : null}
        </header>

        <nav className="flex flex-wrap gap-2 text-sm">
          {[
            ['Dashboard', '/dashboard'],
            ['Partner Intelligence', '/bond/partner-intelligence'],
            ['Consultant Performance', '/bond/consultant-performance'],
            ['Branch Operations', '/bond/branch-operations'],
            ['Regional Operations', '/bond/regional-operations'],
            ['HQ Command Centre', '/bond/hq-command-centre'],
            ['Bank Relationships', '/bond/banks'],
          ].map(([label, to]) => (
            <Link
              key={label}
              to={to}
              className={`rounded-lg px-3 py-2 font-medium ${label === 'Bank Relationships' ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {!state.workspace && notice ? <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}

        {state.workspace ? (
          <WorkspaceView
            workspace={state.workspace}
            analytics={state.analytics}
            notice={notice}
            saveContact={saveContact}
            saveEscalation={saveEscalation}
            saveFeedback={saveFeedback}
            contactDraft={contactDraft}
            setContactDraft={setContactDraft}
            escalationDraft={escalationDraft}
            setEscalationDraft={setEscalationDraft}
            feedbackDraft={feedbackDraft}
            setFeedbackDraft={setFeedbackDraft}
          />
        ) : (
          <DashboardView dashboard={state.dashboard} refresh={refresh} />
        )}
      </div>
    </main>
  )
}
