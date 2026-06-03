import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  Gauge,
  LineChart,
  RefreshCw,
  Target,
  TrendingUp,
  Trophy,
  UserCog,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  getConsultantForecast,
  getConsultantPerformanceDashboard,
  getConsultantTargetProgress,
  getConsultantTargets,
  setConsultantTarget,
} from '../../services/bondConsultantPerformanceService'

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

function formatHours(value) {
  return `${Math.round(Number(value || 0) * 10) / 10}h`
}

function statusClass(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized.includes('overloaded') || normalized.includes('high')) return 'bg-red-50 text-red-700 ring-red-200'
  if (normalized.includes('busy') || normalized.includes('medium')) return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (normalized.includes('normal') || normalized.includes('low')) return 'bg-sky-50 text-sky-700 ring-sky-200'
  if (normalized.includes('light') || normalized.includes('active')) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
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
          {rows.map((row) => (
            <tr key={row.id || row.consultantId || row.name} className="align-top">
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

function numberDraft(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function rankingValue(label = '', row = {}) {
  if (label.includes('Turnaround')) return formatDays(row.averageTurnaround)
  if (label.includes('Volume')) return row.applicationsSubmitted
  if (label.includes('SLA')) return formatPercent(row.slaCompliance)
  return formatPercent(row.approvalRate)
}

function buildTargetDraft(target = {}) {
  return {
    period: target.period || new Date().toISOString().slice(0, 7),
    applicationsTarget: target.applicationsTarget || 20,
    approvalsTarget: target.approvalsTarget || 12,
    approvalRateTarget: target.approvalRateTarget || 65,
    turnaroundTarget: target.turnaroundTarget || 14,
    slaComplianceTarget: target.slaComplianceTarget || 85,
    responseTimeTarget: target.responseTimeTarget || 8,
  }
}

export default function BondConsultantPerformancePage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState('')
  const [targetDraftOverride, setTargetDraftOverride] = useState(null)

  const selectedConsultantParam = searchParams.get('consultantId') || ''
  const options = useMemo(() => ({ workspaceId, refreshKey }), [workspaceId, refreshKey])
  const dashboard = useMemo(() => getConsultantPerformanceDashboard(workspaceContext, options), [workspaceContext, options])
  const rows = dashboard.rows || []
  const selectedConsultantId = selectedConsultantParam || rows[0]?.consultantId || ''
  const selectedRow = rows.find((row) => row.consultantId === selectedConsultantId) || rows[0] || null
  const canManageTargets = dashboard.scope?.scopeLevel !== 'consultant'
  const selectedTargets = useMemo(
    () => selectedRow ? getConsultantTargets(selectedRow.consultantId, workspaceContext, options) : [],
    [options, selectedRow, workspaceContext],
  )
  const selectedProgress = useMemo(
    () => selectedRow ? getConsultantTargetProgress(selectedRow.consultantId, workspaceContext, options) : null,
    [options, selectedRow, workspaceContext],
  )
  const selectedForecast = useMemo(
    () => selectedRow ? getConsultantForecast(selectedRow.consultantId, workspaceContext, options) : [],
    [options, selectedRow, workspaceContext],
  )
  const targetDraft = targetDraftOverride?.consultantId === selectedRow?.consultantId
    ? targetDraftOverride
    : buildTargetDraft(selectedTargets[0] || selectedProgress?.target || {})

  function refresh() {
    setNotice('Consultant performance refreshed.')
    setRefreshKey((value) => value + 1)
  }

  function selectConsultant(consultantId = '') {
    const nextParams = new URLSearchParams(searchParams)
    if (consultantId) nextParams.set('consultantId', consultantId)
    setSearchParams(nextParams)
  }

  function updateTargetField(field, value) {
    setTargetDraftOverride({ ...targetDraft, consultantId: selectedRow?.consultantId || '', [field]: value })
  }

  function saveTarget() {
    if (!selectedRow || !targetDraft) return
    try {
      const payload = {
        period: targetDraft.period,
        applicationsTarget: numberDraft(targetDraft.applicationsTarget, 20),
        approvalsTarget: numberDraft(targetDraft.approvalsTarget, 12),
        approvalRateTarget: numberDraft(targetDraft.approvalRateTarget, 65),
        turnaroundTarget: numberDraft(targetDraft.turnaroundTarget, 14),
        slaComplianceTarget: numberDraft(targetDraft.slaComplianceTarget, 85),
        responseTimeTarget: numberDraft(targetDraft.responseTimeTarget, 8),
      }
      setConsultantTarget(selectedRow.consultantId, payload, workspaceContext, options)
      setNotice(`Targets saved for ${selectedRow.consultantName}.`)
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not save consultant target.'))
    }
  }

  const consultantColumns = [
    { key: 'consultantName', label: 'Consultant' },
    { key: 'branchName', label: 'Branch' },
    { key: 'regionName', label: 'Region' },
    { key: 'activeApplications', label: 'Active Applications' },
    { key: 'capacityStatus', label: 'Capacity Status', render: (row) => <StatusPill status={row.capacityStatus} /> },
    { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
    { key: 'declineRate', label: 'Decline Rate', render: (row) => formatPercent(row.declineRate) },
    { key: 'averageTurnaround', label: 'Avg Turnaround', render: (row) => formatDays(row.averageTurnaround) },
    { key: 'slaCompliance', label: 'SLA Compliance', render: (row) => formatPercent(row.slaCompliance) },
    { key: 'partnerResponseTime', label: 'Partner Response Time', render: (row) => formatHours(row.partnerResponseTime) },
    { key: 'applicationsSubmitted', label: 'Applications Submitted' },
    { key: 'coachingFlagCount', label: 'Coaching Flags', render: (row) => row.coachingFlagCount ? <StatusPill status={`${row.coachingFlagCount} ${row.topCoachingFlag}`} /> : 'None' },
    {
      key: 'action',
      label: 'Action',
      render: (row) => (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => selectConsultant(row.consultantId)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
            <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
            View
          </button>
          {canManageTargets ? (
            <button type="button" onClick={() => selectConsultant(row.consultantId)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              Set Target
            </button>
          ) : null}
          <Link to={`/bond/applications?consultantId=${encodeURIComponent(row.consultantId)}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            Applications
          </Link>
        </div>
      ),
    },
  ]

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bond Originator</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Consultant Performance</h1>
          </div>
          <button type="button" onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </header>

        {notice ? <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{notice}</div> : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Consultants" value={dashboard.summary.totalConsultants} helper="In current scope" icon={Users} />
          <MetricCard label="Active Consultants" value={dashboard.summary.activeConsultants} helper="Available consultants" icon={CheckCircle2} />
          <MetricCard label="Overloaded Consultants" value={dashboard.summary.overloadedConsultants} helper="Capacity score 41+" icon={AlertTriangle} />
          <MetricCard label="Average Approval Rate" value={formatPercent(dashboard.summary.averageApprovalRate)} helper="Scoped consultant average" icon={Trophy} />
          <MetricCard label="Average Turnaround" value={formatDays(dashboard.summary.averageTurnaround)} helper="Submission to outcome" icon={Clock3} />
          <MetricCard label="Average SLA Compliance" value={formatPercent(dashboard.summary.averageSLACompliance)} helper="Partner response SLA" icon={Gauge} />
          <MetricCard label="Open Applications" value={dashboard.summary.openApplications} helper="Active workload" icon={BarChart3} />
          <MetricCard label="Submitted This Month" value={dashboard.summary.applicationsSubmittedThisMonth} helper="Last 30 days" icon={TrendingUp} />
        </section>

        <Section title="Consultant Performance Table" icon={Users}>
          <DataTable columns={consultantColumns} rows={rows} empty="No consultants are visible in your current scope." />
        </Section>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Section title="Capacity, Targets & Coaching" icon={Target}>
            {selectedRow ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Selected Consultant</p>
                    <h3 className="mt-1 text-xl font-semibold text-slate-950">{selectedRow.consultantName}</h3>
                    <p className="mt-1 text-sm text-slate-500">{selectedRow.branchName} · {selectedRow.regionName}</p>
                  </div>
                  <StatusPill status={selectedRow.capacityStatus} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <MetricCard label="Capacity Score" value={selectedRow.capacityScore} helper={`${selectedRow.activeApplications} active applications`} icon={Gauge} />
                  <MetricCard label="SLA Breaches" value={selectedRow.slaBreaches} helper={`${selectedRow.openPartnerRequests} open partner requests`} icon={AlertTriangle} />
                  <MetricCard label="Partner Health Impact" value={formatPercent(selectedRow.partnerHealthImpact)} helper="Average linked partner health" icon={LineChart} />
                </div>

                {canManageTargets && targetDraft ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        ['period', 'Period', 'month'],
                        ['applicationsTarget', 'Applications Submitted', 'number'],
                        ['approvalsTarget', 'Approvals', 'number'],
                        ['approvalRateTarget', 'Approval Rate %', 'number'],
                        ['turnaroundTarget', 'Average Turnaround Days', 'number'],
                        ['slaComplianceTarget', 'SLA Compliance %', 'number'],
                        ['responseTimeTarget', 'Partner Response Hours', 'number'],
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
                    <button type="button" onClick={saveTarget} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                      <Target className="h-4 w-4" aria-hidden="true" />
                      Save Target
                    </button>
                  </div>
                ) : null}

                <DataTable
                  columns={[
                    { key: 'metric', label: 'Target Metric' },
                    { key: 'actual', label: 'Actual' },
                    { key: 'target', label: 'Target' },
                    { key: 'progress', label: 'Progress' },
                  ]}
                  rows={Object.entries(selectedProgress?.progress || {}).map(([metric, value]) => ({
                    id: metric,
                    metric,
                    actual: metric.includes('Rate') || metric.includes('Compliance') ? formatPercent(value.actual) : value.actual,
                    target: metric.includes('Rate') || metric.includes('Compliance') ? formatPercent(value.target) : value.target,
                    progress: <StatusPill status={`${Math.min(100, value.percent)}%`} />,
                  }))}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedRow.coachingFlags.map((flag) => (
                    <article key={flag.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-semibold text-slate-950">{flag.type}</h4>
                        <StatusPill status={flag.severity} />
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{flag.reason}</p>
                      <p className="mt-2 text-sm font-medium text-slate-700">{flag.recommendedAction}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select a consultant to view targets and coaching flags.</p>
            )}
          </Section>

          <Section title="Forecasting & Recommendations" icon={LineChart}>
            <div className="space-y-5">
              <DataTable
                columns={[
                  { key: 'periodDays', label: 'Forecast', render: (row) => `${row.periodDays} days` },
                  { key: 'expectedCapacity', label: 'Expected Capacity' },
                  { key: 'riskLevel', label: 'Risk', render: (row) => <StatusPill status={row.riskLevel} /> },
                  { key: 'recommendedAction', label: 'Recommended Action' },
                ]}
                rows={selectedForecast}
                empty="No forecast available."
              />

              <div className="space-y-3">
                {(dashboard.recommendations || []).slice(0, 4).map((recommendation) => (
                  <article key={recommendation.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start gap-2">
                      <ArrowRightLeft className="mt-0.5 h-4 w-4 text-slate-500" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{recommendation.recommendation}</p>
                        <p className="mt-1 text-sm text-slate-500">{recommendation.reason}</p>
                      </div>
                    </div>
                  </article>
                ))}
                {!dashboard.recommendations?.length ? <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">No workload reassignments recommended.</p> : null}
              </div>
            </div>
          </Section>
        </div>

        {!dashboard.rankings?.accessDenied ? (
          <Section
            title="Performance Rankings"
            icon={Trophy}
            action={<span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"><Download className="h-3.5 w-3.5" aria-hidden="true" /> Internal only</span>}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                ['Top Approval Rate', dashboard.rankings.topApprovalRate],
                ['Fastest Turnaround', dashboard.rankings.fastestTurnaround],
                ['Best SLA Compliance', dashboard.rankings.bestSLACompliance],
                ['Most Improved', dashboard.rankings.mostImproved],
                ['Highest Volume', dashboard.rankings.highestVolume],
                ['At Risk Consultants', dashboard.rankings.atRiskConsultants],
              ].map(([label, rankingRows]) => (
                <article key={label} className="rounded-lg border border-slate-200 p-3">
                  <h3 className="font-semibold text-slate-950">{label}</h3>
                  <div className="mt-3 space-y-2">
                    {(rankingRows || []).slice(0, 5).map((row) => (
                      <button key={`${label}-${row.consultantId}`} type="button" onClick={() => selectConsultant(row.consultantId)} className="flex w-full items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-left text-sm">
                        <span className="font-medium text-slate-700">{row.consultantName}</span>
                        <span className="text-slate-500">{rankingValue(label, row)}</span>
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </Section>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Branch Manager View" icon={BarChart3}>
            <DataTable
              columns={[
                { key: 'name', label: 'Branch' },
                { key: 'consultants', label: 'Consultants' },
                { key: 'overloadedConsultants', label: 'Overloaded' },
                { key: 'averageCapacityScore', label: 'Capacity' },
                { key: 'averageSLACompliance', label: 'SLA', render: (row) => formatPercent(row.averageSLACompliance) },
                { key: 'escalationHotspots', label: 'Escalation Hotspots' },
              ]}
              rows={dashboard.branchComparison || []}
            />
          </Section>

          <Section title="Regional / HQ View" icon={LineChart}>
            <DataTable
              columns={[
                { key: 'name', label: 'Region' },
                { key: 'consultants', label: 'Consultants' },
                { key: 'branches', label: 'Branches' },
                { key: 'overloadedConsultants', label: 'Overloaded' },
                { key: 'averageCapacityScore', label: 'Capacity' },
                { key: 'averageApprovalRate', label: 'Approval', render: (row) => formatPercent(row.averageApprovalRate) },
              ]}
              rows={dashboard.regionComparison || []}
            />
          </Section>
        </div>
      </div>
    </main>
  )
}
