import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  LineChart,
  RefreshCw,
  Target,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  getBranchOperationsDashboard,
  setBranchTargets,
} from '../../services/bondBranchOperationsService'

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

function formatDays(value) {
  return `${Math.round(Number(value || 0) * 10) / 10}d`
}

function statusClass(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized.includes('critical') || normalized.includes('overloaded') || normalized.includes('high')) return 'bg-red-50 text-red-700 ring-red-200'
  if (normalized.includes('risk') || normalized.includes('busy') || normalized.includes('medium')) return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (normalized.includes('healthy') || normalized.includes('normal') || normalized.includes('low')) return 'bg-sky-50 text-sky-700 ring-sky-200'
  if (normalized.includes('excellent') || normalized.includes('light') || normalized.includes('resolved')) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

function MetricCard({ label, value, helper, icon: Icon }) {
  return (
    <article className="min-h-[132px] rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" /> : null}
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  )
}

function DataTable({ columns = [], rows = [], empty = 'No records match this view yet.' }) {
  if (!rows.length) {
    return <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">{empty}</p>
  }
  return (
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <table className="w-full min-w-[920px] divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="whitespace-nowrap px-4 py-3 text-left font-semibold">{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id || row.consultantId || row.partnerId || row.type} className="align-top transition hover:bg-slate-50/70">
              {columns.map((column) => (
                <td key={column.key} className="whitespace-nowrap px-4 py-3.5 text-slate-700">
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

function ProgressBar({ value = 0 }) {
  const width = Math.min(100, Math.max(0, Number(value || 0)))
  return (
    <div className="h-2 w-32 rounded-full bg-slate-100">
      <div className="h-2 rounded-full bg-slate-950" style={{ width: `${width}%` }} />
    </div>
  )
}

function numberDraft(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function buildTargetDraft(target = {}) {
  return {
    period: target.period || new Date().toISOString().slice(0, 7),
    approvalTarget: target.approvalTarget || 70,
    submissionTarget: target.submissionTarget || 30,
    turnaroundTarget: target.turnaroundTarget || 12,
    slaTarget: target.slaTarget || 90,
    satisfactionTarget: target.satisfactionTarget || 75,
  }
}

export default function BondBranchOperationsPage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState('')
  const [targetDraftOverride, setTargetDraftOverride] = useState(null)
  const requestedBranchId = searchParams.get('branchId') || ''

  const options = useMemo(() => ({ workspaceId, branchId: requestedBranchId, refreshKey }), [workspaceId, requestedBranchId, refreshKey])
  const dashboardState = useMemo(() => {
    try {
      return { dashboard: getBranchOperationsDashboard(workspaceContext, options), error: '' }
    } catch (error) {
      return { dashboard: null, error: String(error?.message || 'Could not load branch operations.') }
    }
  }, [workspaceContext, options])
  const dashboard = dashboardState.dashboard
  const targetDraft = targetDraftOverride?.branchId === dashboard?.branch?.id
    ? targetDraftOverride
    : buildTargetDraft(dashboard?.targetProgress?.target || {})

  function refresh() {
    setNotice('Branch operations refreshed.')
    setRefreshKey((value) => value + 1)
  }

  function selectBranch(branchId = '') {
    const nextParams = new URLSearchParams(searchParams)
    if (branchId) nextParams.set('branchId', branchId)
    setSearchParams(nextParams)
  }

  function updateTargetField(field, value) {
    setTargetDraftOverride({ ...targetDraft, branchId: dashboard?.branch?.id || '', [field]: value })
  }

  function saveTargets() {
    if (!dashboard?.branch?.id) return
    try {
      const payload = {
        period: targetDraft.period,
        approvalTarget: numberDraft(targetDraft.approvalTarget, 70),
        submissionTarget: numberDraft(targetDraft.submissionTarget, 30),
        turnaroundTarget: numberDraft(targetDraft.turnaroundTarget, 12),
        slaTarget: numberDraft(targetDraft.slaTarget, 90),
        satisfactionTarget: numberDraft(targetDraft.satisfactionTarget, 75),
      }
      setBranchTargets(dashboard.branch.id, payload, workspaceContext, options)
      setNotice(`Targets saved for ${dashboard.branch.name}.`)
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not save branch targets.'))
    }
  }

  if (dashboardState.error) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-5 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">Branch Operations</h1>
          <p className="mt-3 text-sm text-slate-600">{dashboardState.error}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bond Originator</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Branch Operations</h1>
            <p className="mt-1 text-sm text-slate-500">{dashboard.branch.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dashboard.branches.length > 1 ? (
              <select value={dashboard.branch.id} onChange={(event) => selectBranch(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                {dashboard.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            ) : null}
            <button type="button" onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </button>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2 text-sm font-semibold text-slate-600" aria-label="Branch operations navigation">
          {[
            { label: 'Dashboard', to: '/bond/dashboard' },
            { label: 'Applications', to: '/bond/applications' },
            { label: 'Partner Inbox', to: '/bond/partner-inbox' },
            { label: 'Consultant Performance', to: '/bond/consultant-performance' },
            { label: 'Branch Operations', to: '/bond/branch-operations' },
          ].map((item) => (
            <Link key={item.label} to={item.to} className={`rounded-lg px-3 py-2 ${item.label === 'Branch Operations' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
              {item.label}
            </Link>
          ))}
        </nav>

        {notice ? <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{notice}</div> : null}

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <MetricCard label="Active Applications" value={dashboard.summary.activeApplications} helper="Current branch workload" icon={BarChart3} />
          <MetricCard label="Submitted This Month" value={dashboard.summary.applicationsSubmittedThisMonth} helper="Last 30 days" icon={CheckCircle2} />
          <MetricCard label="Open Partner Requests" value={dashboard.summary.openPartnerRequests} helper="Branch partner queue" icon={Users} />
          <MetricCard label="SLA Breaches" value={dashboard.summary.slaBreaches} helper="Needs same-day action" icon={AlertTriangle} />
          <MetricCard label="Overloaded Consultants" value={dashboard.summary.overloadedConsultants} helper="Capacity score 41+" icon={Gauge} />
          <MetricCard label="Pending Documents" value={dashboard.summary.pendingDocuments} helper="Document blockers" icon={FileText} />
          <MetricCard label="Approval Rate" value={formatPercent(dashboard.summary.approvalRate)} helper="Scoped applications" icon={Target} />
          <MetricCard label="Branch Health Score" value={dashboard.summary.branchHealthScore} helper={dashboard.summary.branchHealthStatus} icon={LineChart} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Section title="Needs Attention Today" icon={AlertTriangle}>
            <div className="space-y-3">
              {dashboard.priorities.map((priority) => (
                <article key={priority.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="font-semibold text-slate-950">{priority.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{priority.type}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={priority.priority} />
                    <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{priority.action}</button>
                  </div>
                </article>
              ))}
              {!dashboard.priorities.length ? <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">No urgent branch priorities right now.</p> : null}
            </div>
          </Section>

          <Section title="Consultant Capacity Dashboard" icon={Gauge}>
            <DataTable
              columns={[
                { key: 'consultantName', label: 'Consultant' },
                { key: 'applications', label: 'Applications' },
                { key: 'capacity', label: 'Capacity' },
                { key: 'slaCompliance', label: 'SLA %', render: (row) => formatPercent(row.slaCompliance) },
                { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
                { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
              ]}
              rows={dashboard.consultantCapacity}
            />
          </Section>
        </div>

        <Section title="Branch Workload Heatmap" icon={Building2}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {dashboard.heatmap.map((row) => (
              <article key={row.consultantId} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-950">{row.consultantName}</h3>
                  <StatusPill status={row.riskLevel} />
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {[
                    ['Applications', row.applications],
                    ['Partner Requests', row.partnerRequests],
                    ['Documents', row.documents],
                    ['SLA Risk', row.slaRisk],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <span>{label}</span>
                      <span className="font-semibold text-slate-950">{value}</span>
                    </div>
                  ))}
                  <ProgressBar value={row.riskScore} />
                </div>
              </article>
            ))}
          </div>
        </Section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Application Bottlenecks" icon={Clock3}>
            <DataTable
              columns={[
                { key: 'type', label: 'Bottleneck' },
                { key: 'count', label: 'Count' },
                { key: 'averageDays', label: 'Average Days', render: (row) => formatDays(row.averageDays) },
                { key: 'riskLevel', label: 'Risk', render: (row) => <StatusPill status={row.riskLevel} /> },
              ]}
              rows={dashboard.bottlenecks}
            />
          </Section>

          <Section title="Partner Operations" icon={Users}>
            <DataTable
              columns={[
                { key: 'partnerName', label: 'Partner' },
                { key: 'openRequests', label: 'Open Requests' },
                { key: 'healthScore', label: 'Health Score' },
                { key: 'escalations', label: 'Escalations' },
                { key: 'lastActivity', label: 'Last Activity' },
              ]}
              rows={dashboard.partnerOperations.rows}
            />
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Section title="Document Operations" icon={FileText}>
            <DataTable
              columns={[
                { key: 'applicationReference', label: 'Application' },
                { key: 'documentType', label: 'Document Type' },
                { key: 'uploadedBy', label: 'Uploaded By' },
                { key: 'age', label: 'Age', render: (row) => formatDays(row.age) },
                { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
              ]}
              rows={dashboard.documentOperations.rows}
            />
          </Section>

          <Section title="Branch Target Management" icon={Target}>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['period', 'Period', 'month'],
                  ['submissionTarget', 'Submission Target', 'number'],
                  ['approvalTarget', 'Approval Target %', 'number'],
                  ['turnaroundTarget', 'Turnaround Target Days', 'number'],
                  ['slaTarget', 'SLA Target %', 'number'],
                  ['satisfactionTarget', 'Partner Satisfaction Target', 'number'],
                ].map(([field, label, type]) => (
                  <label key={field} className="text-sm font-medium text-slate-600">
                    {label}
                    <input
                      type={type}
                      value={targetDraft[field]}
                      onChange={(event) => updateTargetField(field, event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                    />
                  </label>
                ))}
              </div>
              <button type="button" onClick={saveTargets} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                <Target className="h-4 w-4" aria-hidden="true" />
                Save Targets
              </button>
              <DataTable
                columns={[
                  { key: 'target', label: 'Target' },
                  { key: 'actual', label: 'Actual' },
                  { key: 'targetValue', label: 'Target Value' },
                  { key: 'variance', label: 'Variance' },
                  { key: 'progress', label: 'Progress', render: (row) => <StatusPill status={`${Math.min(100, row.progress)}%`} /> },
                ]}
                rows={dashboard.targetProgress.rows}
              />
            </div>
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Workload Rebalancing" icon={ArrowRightLeft}>
            <DataTable
              columns={[
                { key: 'recommendation', label: 'Recommendation' },
                { key: 'reason', label: 'Reason' },
                { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
                { key: 'actions', label: 'Actions', render: (row) => row.actions.join(' / ') },
              ]}
              rows={dashboard.workloadRecommendations}
              empty="No workload rebalancing recommendations."
            />
          </Section>

          <Section title="Escalation Centre" icon={AlertTriangle}>
            <DataTable
              columns={[
                { key: 'issue', label: 'Issue' },
                { key: 'owner', label: 'Owner' },
                { key: 'priority', label: 'Priority', render: (row) => <StatusPill status={row.priority} /> },
                { key: 'age', label: 'Age', render: (row) => formatDays(row.age) },
                { key: 'status', label: 'Status' },
                { key: 'action', label: 'Action' },
              ]}
              rows={dashboard.escalations}
            />
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Consultant Coaching Centre" icon={Users}>
            <DataTable
              columns={[
                { key: 'consultantName', label: 'Consultant' },
                { key: 'type', label: 'Issue' },
                { key: 'severity', label: 'Severity', render: (row) => <StatusPill status={row.severity} /> },
                { key: 'recommendedAction', label: 'Recommended Action' },
              ]}
              rows={dashboard.coachingCentre}
              empty="No coaching flags for this branch."
            />
          </Section>

          <Section title="Branch Capacity Forecast" icon={LineChart}>
            <DataTable
              columns={[
                { key: 'periodDays', label: 'Forecast', render: (row) => `${row.periodDays} days` },
                { key: 'expectedApplications', label: 'Expected Applications' },
                { key: 'expectedCapacity', label: 'Expected Capacity' },
                { key: 'riskLevel', label: 'Risk', render: (row) => <StatusPill status={row.riskLevel} /> },
                { key: 'requiredHeadcount', label: 'Required Headcount' },
              ]}
              rows={dashboard.forecast}
            />
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Branch Rankings" icon={BarChart3}>
            <DataTable
              columns={[
                { key: 'branchName', label: 'Branch' },
                { key: 'rank', label: 'Ranking', render: (row) => `${row.rank} of ${row.totalBranches}` },
                { key: 'approvalRate', label: 'Approval', render: (row) => formatPercent(row.metrics?.approvalRate) },
                { key: 'slaCompliance', label: 'SLA', render: (row) => formatPercent(row.metrics?.slaCompliance) },
                { key: 'partnerSatisfaction', label: 'Partner Satisfaction', render: (row) => formatPercent(row.metrics?.partnerSatisfaction) },
              ]}
              rows={dashboard.rankings}
            />
          </Section>

          <Section title="Branch Activity Feed" icon={Clock3}>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ['Today', dashboard.activityFeed.today],
                ['This Week', dashboard.activityFeed.thisWeek],
                ['This Month', dashboard.activityFeed.thisMonth],
              ].map(([label, rows]) => (
                <article key={label} className="rounded-lg border border-slate-200 p-3">
                  <h3 className="font-semibold text-slate-950">{label}</h3>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    {rows.slice(0, 5).map((row) => <p key={row.id}>{row.label || row.eventType}</p>)}
                    {!rows.length ? <p className="text-slate-400">No activity.</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </main>
  )
}
