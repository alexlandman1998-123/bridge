import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  Flame,
  Gauge,
  LineChart,
  Map,
  RefreshCw,
  Target,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  getRegionalOperationsDashboard,
  setRegionalTargets,
} from '../../services/bondRegionalOperationsService'

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
  if (normalized.includes('healthy') || normalized.includes('normal') || normalized.includes('low') || normalized.includes('stable')) return 'bg-sky-50 text-sky-700 ring-sky-200'
  if (normalized.includes('excellent') || normalized.includes('light') || normalized.includes('improving')) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
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
            <tr key={row.id || row.branchId || row.partnerId || row.type || `${row.periodDays || 'row'}-${index}`} className="align-top">
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
    applicationTarget: target.applicationTarget || 120,
    approvalTarget: target.approvalTarget || 70,
    slaTarget: target.slaTarget || 90,
    partnerHealthTarget: target.partnerHealthTarget || 75,
    growthTarget: target.growthTarget || 10,
  }
}

export default function BondRegionalOperationsPage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState('')
  const [targetDraftOverride, setTargetDraftOverride] = useState(null)
  const requestedRegionId = searchParams.get('regionId') || ''

  const options = useMemo(() => ({ workspaceId, regionId: requestedRegionId, refreshKey }), [workspaceId, requestedRegionId, refreshKey])
  const dashboardState = useMemo(() => {
    try {
      return { dashboard: getRegionalOperationsDashboard(workspaceContext, options), error: '' }
    } catch (error) {
      return { dashboard: null, error: String(error?.message || 'Could not load regional operations.') }
    }
  }, [workspaceContext, options])
  const dashboard = dashboardState.dashboard
  const targetDraft = targetDraftOverride?.regionId === dashboard?.region?.id
    ? targetDraftOverride
    : buildTargetDraft(dashboard?.targetProgress?.target || {})

  function refresh() {
    setNotice('Regional operations refreshed.')
    setRefreshKey((value) => value + 1)
  }

  function selectRegion(regionId = '') {
    const nextParams = new URLSearchParams(searchParams)
    if (regionId) nextParams.set('regionId', regionId)
    setSearchParams(nextParams)
  }

  function updateTargetField(field, value) {
    setTargetDraftOverride({ ...targetDraft, regionId: dashboard?.region?.id || '', [field]: value })
  }

  function saveTargets() {
    if (!dashboard?.region?.id) return
    try {
      const payload = {
        period: targetDraft.period,
        applicationTarget: numberDraft(targetDraft.applicationTarget, 120),
        approvalTarget: numberDraft(targetDraft.approvalTarget, 70),
        slaTarget: numberDraft(targetDraft.slaTarget, 90),
        partnerHealthTarget: numberDraft(targetDraft.partnerHealthTarget, 75),
        growthTarget: numberDraft(targetDraft.growthTarget, 10),
      }
      setRegionalTargets(dashboard.region.id, payload, workspaceContext, options)
      setNotice(`Targets saved for ${dashboard.region.name}.`)
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not save regional targets.'))
    }
  }

  if (dashboardState.error) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">Regional Operations</h1>
          <p className="mt-3 text-sm text-slate-600">{dashboardState.error}</p>
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
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Regional Operations</h1>
            <p className="mt-1 text-sm text-slate-500">{dashboard.region.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dashboard.regions.length > 1 ? (
              <select
                value={dashboard.region.id}
                onChange={(event) => selectRegion(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm"
              >
                {dashboard.regions.map((region) => (
                  <option key={region.id} value={region.id}>{region.name}</option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={refresh}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </button>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2 text-sm">
          {[
            ['Dashboard', '/dashboard'],
            ['Partner Intelligence', '/bond/partner-intelligence'],
            ['Consultant Performance', '/bond/consultant-performance'],
            ['Branch Operations', '/bond/branch-operations'],
            ['Regional Operations', '/bond/regional-operations'],
          ].map(([label, to]) => (
            <Link
              key={label}
              to={to}
              className={`rounded-lg px-3 py-2 font-medium ${label === 'Regional Operations' ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {notice ? <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Branches" value={dashboard.summary.branches} icon={Building2} />
          <MetricCard label="Consultants" value={dashboard.summary.consultants} icon={Users} />
          <MetricCard label="Active Applications" value={dashboard.summary.activeApplications} icon={BarChart3} />
          <MetricCard label="Open Partner Requests" value={dashboard.summary.openPartnerRequests} icon={AlertTriangle} />
          <MetricCard label="Regional SLA Compliance" value={formatPercent(dashboard.summary.regionalSLACompliance)} icon={Clock3} />
          <MetricCard label="Average Approval Rate" value={formatPercent(dashboard.summary.averageApprovalRate)} icon={CheckCircle2} />
          <MetricCard label="Partner Health Score" value={dashboard.summary.partnerHealthScore} icon={Users} />
          <MetricCard label="Regional Health Score" value={dashboard.summary.regionalHealthScore} helper={dashboard.summary.regionalHealthStatus} icon={Gauge} />
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          {Object.entries(dashboard.executive).map(([key, value]) => (
            <article key={key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium capitalize text-slate-500">{key.replace(/([A-Z])/g, ' $1')}</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">
                {String(key).toLowerCase().includes('rate') || String(key).toLowerCase().includes('sla') || String(key).toLowerCase().includes('satisfaction') || String(key).toLowerCase().includes('utilisation')
                  ? formatPercent(value)
                  : value}
              </p>
            </article>
          ))}
        </section>

        <Section title="Branch Comparison" icon={Building2}>
          <DataTable
            rows={dashboard.branchComparison}
            columns={[
              { key: 'branchName', label: 'Branch' },
              { key: 'healthScore', label: 'Health Score' },
              { key: 'applications', label: 'Applications' },
              { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
              { key: 'slaCompliance', label: 'SLA %', render: (row) => formatPercent(row.slaCompliance) },
              { key: 'partnerHealth', label: 'Partner Health' },
              { key: 'escalations', label: 'Escalations' },
              { key: 'capacityRiskLevel', label: 'Capacity Risk', render: (row) => <StatusPill status={row.capacityRiskLevel} /> },
              { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
              {
                key: 'actions',
                label: 'Actions',
                render: (row) => (
                  <div className="flex gap-2">
                    <Link className="text-sm font-semibold text-slate-950 hover:underline" to={`/bond/branch-operations?branchId=${encodeURIComponent(row.branchId)}`}>View Branch</Link>
                    <Link className="text-sm font-semibold text-slate-950 hover:underline" to={`/bond/branch-operations?branchId=${encodeURIComponent(row.branchId)}#capacity`}>View Capacity</Link>
                  </div>
                ),
              },
            ]}
          />
        </Section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Branch Rankings" icon={LineChart}>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ['Top 10', dashboard.branchRankings.top10],
                ['Bottom 10', dashboard.branchRankings.bottom10],
                ['Most Improved', dashboard.branchRankings.mostImproved],
                ['Most At Risk', dashboard.branchRankings.mostAtRisk],
              ].map(([title, rows]) => (
                <div key={title} className="rounded-lg border border-slate-200 p-3">
                  <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
                  <div className="mt-3 space-y-2">
                    {rows.slice(0, 5).map((row) => (
                      <div key={`${title}-${row.branchId}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-slate-600">{row.branchName}</span>
                        <span className="font-semibold text-slate-950">{row.healthScore}</span>
                      </div>
                    ))}
                    {!rows.length ? <p className="text-sm text-slate-500">No ranking data.</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Regional Capacity" icon={Gauge}>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              {Object.entries(dashboard.capacity.metrics).map(([status, count]) => (
                <div key={status} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{status}</p>
                  <p className="mt-2 text-xl font-semibold text-slate-950">{count}</p>
                </div>
              ))}
            </div>
            <DataTable
              rows={dashboard.capacity.rows}
              columns={[
                { key: 'branchName', label: 'Branch' },
                { key: 'consultants', label: 'Consultants' },
                { key: 'capacityStatus', label: 'Capacity', render: (row) => <StatusPill status={row.capacityStatus} /> },
                { key: 'riskLevel', label: 'Risk', render: (row) => <StatusPill status={row.riskLevel} /> },
              ]}
            />
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Regional Workload Heatmap" icon={Map}>
            <DataTable
              rows={dashboard.heatmap}
              columns={[
                { key: 'branchName', label: 'Branch' },
                { key: 'applications', label: 'Applications' },
                { key: 'partnerRequests', label: 'Partner Requests' },
                { key: 'documents', label: 'Documents' },
                { key: 'escalations', label: 'Escalations' },
                { key: 'riskLevel', label: 'Risk', render: (row) => <StatusPill status={row.riskLevel} /> },
              ]}
            />
          </Section>

          <Section title="Application Bottlenecks" icon={Flame}>
            <DataTable
              rows={dashboard.bottlenecks}
              columns={[
                { key: 'branchName', label: 'Branch' },
                { key: 'type', label: 'Stage' },
                { key: 'count', label: 'Count' },
                { key: 'averageDays', label: 'Average Days', render: (row) => formatDays(row.averageDays) },
                { key: 'riskLevel', label: 'Risk', render: (row) => <StatusPill status={row.riskLevel} /> },
              ]}
            />
          </Section>
        </div>

        <Section title="Regional Partner Intelligence" icon={Users}>
          <div className="mb-4 grid gap-3 md:grid-cols-5">
            <MetricCard label="Partner Health" value={dashboard.partnerIntelligence.metrics.partnerHealth} />
            <MetricCard label="Satisfaction" value={dashboard.partnerIntelligence.metrics.partnerSatisfaction} />
            <MetricCard label="Escalations" value={dashboard.partnerIntelligence.metrics.escalations} />
            <MetricCard label="Open Requests" value={dashboard.partnerIntelligence.metrics.openRequests} />
            <MetricCard label="Support Volume" value={dashboard.partnerIntelligence.metrics.supportVolume} />
          </div>
          <DataTable
            rows={dashboard.partnerIntelligence.rows}
            columns={[
              { key: 'partnerName', label: 'Partner' },
              { key: 'branchName', label: 'Branch' },
              { key: 'healthScore', label: 'Health' },
              { key: 'applications', label: 'Applications' },
              { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
              { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
            ]}
          />
        </Section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Escalation Oversight" icon={AlertTriangle}>
            <DataTable
              rows={dashboard.escalations}
              columns={[
                { key: 'issue', label: 'Issue' },
                { key: 'branchName', label: 'Branch' },
                { key: 'owner', label: 'Owner' },
                { key: 'priority', label: 'Priority', render: (row) => <StatusPill status={row.priority} /> },
                { key: 'age', label: 'Age' },
                { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
              ]}
            />
          </Section>

          <Section title="Branch Manager Performance" icon={Users}>
            <DataTable
              rows={dashboard.branchManagerPerformance}
              columns={[
                { key: 'branchManager', label: 'Branch Manager' },
                { key: 'branchName', label: 'Branch' },
                { key: 'score', label: 'Score' },
                { key: 'trend', label: 'Trend', render: (row) => <StatusPill status={row.trend} /> },
                { key: 'escalationVolume', label: 'Escalations' },
              ]}
            />
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section
            title="Regional Targets"
            icon={Target}
            action={(
              <button type="button" onClick={saveTargets} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                Save Targets
              </button>
            )}
          >
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['period', 'Period', 'month'],
                ['applicationTarget', 'Application Target', 'number'],
                ['approvalTarget', 'Approval Target', 'number'],
                ['slaTarget', 'SLA Target', 'number'],
                ['partnerHealthTarget', 'Partner Health Target', 'number'],
                ['growthTarget', 'Growth Target', 'number'],
              ].map(([field, label, type]) => (
                <label key={field} className="text-sm font-medium text-slate-600">
                  {label}
                  <input
                    type={type}
                    value={targetDraft[field]}
                    onChange={(event) => updateTargetField(field, event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-950"
                  />
                </label>
              ))}
            </div>
            <DataTable
              rows={dashboard.targetProgress.rows}
              columns={[
                { key: 'target', label: 'Target' },
                { key: 'actual', label: 'Actual' },
                { key: 'targetValue', label: 'Target Value' },
                { key: 'variance', label: 'Variance' },
                { key: 'progress', label: 'Progress', render: (row) => <ProgressBar value={row.progress} /> },
              ]}
            />
          </Section>

          <Section title="Regional Forecast" icon={LineChart}>
            <DataTable
              rows={dashboard.forecast}
              columns={[
                { key: 'periodDays', label: 'Period', render: (row) => `${row.periodDays}d` },
                { key: 'expectedApplicationVolume', label: 'Expected Volume' },
                { key: 'capacityDemand', label: 'Capacity Demand' },
                { key: 'consultantDemand', label: 'Consultant Demand' },
                { key: 'recommendedHeadcount', label: 'Headcount' },
                { key: 'expectedCapacityRisk', label: 'Risk', render: (row) => <StatusPill status={row.expectedCapacityRisk} /> },
              ]}
            />
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Intervention Recommendations" icon={ArrowRightLeft}>
            <DataTable
              rows={dashboard.recommendations}
              columns={[
                { key: 'type', label: 'Type' },
                { key: 'branchName', label: 'Branch' },
                { key: 'recommendation', label: 'Recommendation' },
                { key: 'priority', label: 'Priority', render: (row) => <StatusPill status={row.priority} /> },
              ]}
            />
          </Section>

          <Section title="Regional Activity" icon={Clock3}>
            <div className="space-y-3">
              {dashboard.activityFeed.thisWeek.slice(0, 12).map((row) => (
                <div key={row.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{row.label || row.eventType}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(row.createdAt).toLocaleString()}</p>
                  </div>
                  <StatusPill status={row.eventType} />
                </div>
              ))}
              {!dashboard.activityFeed.thisWeek.length ? <p className="text-sm text-slate-500">No activity in the current period.</p> : null}
            </div>
          </Section>
        </div>
      </div>
    </main>
  )
}
