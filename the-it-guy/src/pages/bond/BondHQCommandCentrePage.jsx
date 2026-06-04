import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileSpreadsheet,
  Gauge,
  Landmark,
  LineChart,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  assignExecutiveAlert,
  dismissExecutiveAlert,
  generateExecutiveReport,
  getHQCommandCentreDashboard,
} from '../../services/bondHQCommandCentreService'
import { getBankDashboard } from '../../services/bondBankRelationshipService'

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

function formatMoney(value) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
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
            <tr key={row.id || row.regionId || row.branchId || row.partnerId || row.bank || `${row.stage || 'row'}-${index}`} className="align-top">
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

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}

export default function BondHQCommandCentrePage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState('')
  const branchFilter = searchParams.get('filter') || 'all'

  const options = useMemo(() => ({ workspaceId, branchFilter, refreshKey }), [workspaceId, branchFilter, refreshKey])
  const dashboardState = useMemo(() => {
    try {
      return { dashboard: getHQCommandCentreDashboard(workspaceContext, options), error: '' }
    } catch (error) {
      return { dashboard: null, error: String(error?.message || 'Could not load HQ Command Centre.') }
    }
  }, [workspaceContext, options])
  const dashboard = dashboardState.dashboard
  const bankState = useMemo(() => {
    try {
      return { dashboard: getBankDashboard(workspaceContext, options), error: '' }
    } catch (error) {
      return { dashboard: null, error: String(error?.message || 'Could not load bank intelligence.') }
    }
  }, [workspaceContext, options])

  function refresh() {
    setNotice('HQ Command Centre refreshed.')
    setRefreshKey((value) => value + 1)
  }

  function selectBranchFilter(filter = 'all') {
    const nextParams = new URLSearchParams(searchParams)
    if (filter === 'all') nextParams.delete('filter')
    else nextParams.set('filter', filter)
    setSearchParams(nextParams)
  }

  function createReport(format) {
    try {
      const report = generateExecutiveReport(format, workspaceContext, options)
      setNotice(`${report.format} executive report generated.`)
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not generate executive report.'))
    }
  }

  function assignAlert(alertId) {
    try {
      assignExecutiveAlert(alertId, resolveActorId(workspaceContext) || 'hq-follow-up', workspaceContext, options)
      setNotice('Executive alert assigned for follow-up.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not assign executive alert.'))
    }
  }

  function dismissAlert(alertId) {
    try {
      dismissExecutiveAlert(alertId, workspaceContext, options)
      setNotice('Executive alert dismissed.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not dismiss executive alert.'))
    }
  }

  if (dashboardState.error) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">HQ Command Centre</h1>
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
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">HQ Command Centre</h1>
            <p className="mt-1 text-sm text-slate-500">National executive cockpit</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </header>

        <nav className="flex flex-wrap gap-2 text-sm">
          {[
            ['Dashboard', '/dashboard'],
            ['Partner Intelligence', '/bond/partner-intelligence'],
            ['Consultant Performance', '/bond/consultant-performance'],
            ['Branch Operations', '/bond/branch-operations'],
            ['Regional Operations', '/bond/regional-operations'],
            ['HQ Command Centre', '/bond/hq-command-centre'],
          ].map(([label, to]) => (
            <Link
              key={label}
              to={to}
              className={`rounded-lg px-3 py-2 font-medium ${label === 'HQ Command Centre' ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {notice ? <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Total Applications" value={dashboard.summary.totalApplications} icon={ClipboardList} />
          <MetricCard label="Active Applications" value={dashboard.summary.activeApplications} icon={BarChart3} />
          <MetricCard label="Submitted This Month" value={dashboard.summary.applicationsSubmittedThisMonth} icon={TrendingUp} />
          <MetricCard label="Approval Rate" value={formatPercent(dashboard.summary.approvalRate)} icon={CheckCircle2} />
          <MetricCard label="Instruction Sent" value={dashboard.summary.instructionSent} icon={ArrowRight} />
          <MetricCard label="Average Turnaround" value={formatDays(dashboard.summary.averageTurnaround)} icon={Clock3} />
          <MetricCard label="SLA Compliance" value={formatPercent(dashboard.summary.slaCompliance)} icon={ShieldAlert} />
          <MetricCard label="Partner Health Score" value={dashboard.summary.partnerHealthScore} icon={Users} />
          <MetricCard label="Consultant Capacity Risk" value={dashboard.summary.consultantCapacityRisk} icon={Gauge} />
          <MetricCard label="Forecasted Volume" value={dashboard.summary.forecastedVolume} icon={LineChart} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_2fr]">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">National Health Score</p>
                <p className="mt-2 text-4xl font-semibold text-slate-950">{dashboard.health.score}</p>
              </div>
              <StatusPill status={dashboard.health.status} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {Object.entries(dashboard.health.components).map(([key, value]) => (
                <div key={key}>
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                    <span>{Math.round(value)}</span>
                  </div>
                  <div className="mt-1"><ProgressBar value={value} /></div>
                </div>
              ))}
            </div>
          </article>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Applications" value={dashboard.executiveKPIs.applications} icon={ClipboardList} />
            <MetricCard label="Approvals" value={dashboard.executiveKPIs.approvals} icon={CheckCircle2} />
            <MetricCard label="Escalations" value={dashboard.executiveKPIs.escalations} icon={AlertTriangle} />
            <MetricCard label="Forecast Risk" value={dashboard.executiveKPIs.forecastRisk} icon={LineChart} />
          </section>
        </section>

        <Section title="Region Comparison" icon={Landmark}>
          <DataTable
            rows={dashboard.regionComparison}
            columns={[
              { key: 'regionName', label: 'Region' },
              { key: 'healthScore', label: 'Health Score' },
              { key: 'branches', label: 'Branches' },
              { key: 'consultants', label: 'Consultants' },
              { key: 'applications', label: 'Applications' },
              { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
              { key: 'slaCompliance', label: 'SLA %', render: (row) => formatPercent(row.slaCompliance) },
              { key: 'partnerHealth', label: 'Partner Health' },
              { key: 'escalations', label: 'Escalations' },
              { key: 'forecastRisk', label: 'Forecast Risk' },
              {
                key: 'action',
                label: 'Action',
                render: (row) => (
                  <div className="flex gap-2">
                    <Link className="font-semibold text-slate-950 hover:underline" to={`/bond/regional-operations?regionId=${encodeURIComponent(row.regionId)}`}>View Region</Link>
                    <Link className="font-semibold text-slate-950 hover:underline" to={`/bond/regional-operations?regionId=${encodeURIComponent(row.regionId)}#forecast`}>View Forecast</Link>
                  </div>
                ),
              },
            ]}
          />
        </Section>

        <Section
          title="Branch Network Comparison"
          icon={Building2}
          action={(
            <div className="flex flex-wrap gap-2">
              {dashboard.branchNetwork.filters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => selectBranchFilter(filter.key)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${branchFilter === filter.key || (!searchParams.get('filter') && filter.key === 'all') ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}
                >
                  {filter.label} ({filter.count})
                </button>
              ))}
            </div>
          )}
        >
          <DataTable
            rows={dashboard.branchNetwork.rows}
            columns={[
              { key: 'branchName', label: 'Branch' },
              { key: 'regionName', label: 'Region' },
              { key: 'healthScore', label: 'Health Score' },
              { key: 'applications', label: 'Applications' },
              { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
              { key: 'slaCompliance', label: 'SLA %', render: (row) => formatPercent(row.slaCompliance) },
              { key: 'partnerHealth', label: 'Partner Health' },
              { key: 'capacityRiskLevel', label: 'Capacity Risk', render: (row) => <StatusPill status={row.capacityRiskLevel} /> },
              { key: 'escalations', label: 'Escalations' },
              {
                key: 'action',
                label: 'Action',
                render: (row) => <Link className="font-semibold text-slate-950 hover:underline" to={`/bond/branch-operations?branchId=${encodeURIComponent(row.branchId)}`}>View Branch</Link>,
              },
            ]}
          />
        </Section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Consultant Network Capacity" icon={Gauge}>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              {[
                ['Light', dashboard.consultantCapacity.metrics.light],
                ['Normal', dashboard.consultantCapacity.metrics.normal],
                ['Busy', dashboard.consultantCapacity.metrics.busy],
                ['Overloaded', dashboard.consultantCapacity.metrics.overloaded],
                ['Inactive', dashboard.consultantCapacity.metrics.inactive],
                ['Average Active Apps', dashboard.consultantCapacity.metrics.averageActiveApplications],
              ].map(([label, value]) => <MiniStat key={label} label={label} value={value} />)}
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <MiniStat label="Highest Workload" value={dashboard.consultantCapacity.metrics.highestWorkloadConsultant?.consultantName || 'None'} />
              <MiniStat label="Lowest Workload" value={dashboard.consultantCapacity.metrics.lowestWorkloadConsultant?.consultantName || 'None'} />
            </div>
            <DataTable
              rows={dashboard.consultantCapacity.rows.slice(0, 8)}
              columns={[
                { key: 'consultantName', label: 'Consultant' },
                { key: 'branchName', label: 'Branch' },
                { key: 'activeApplications', label: 'Active Apps' },
                { key: 'capacityStatus', label: 'Capacity', render: (row) => <StatusPill status={row.capacityStatus} /> },
                { key: 'slaCompliance', label: 'SLA %', render: (row) => formatPercent(row.slaCompliance) },
              ]}
            />
          </Section>

          <Section title="Partner Network Health" icon={Users}>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <MiniStat label="Excellent" value={dashboard.partnerNetwork.summary.excellentPartners} />
              <MiniStat label="Healthy" value={dashboard.partnerNetwork.summary.healthyPartners} />
              <MiniStat label="At Risk" value={dashboard.partnerNetwork.summary.atRiskPartners} />
              <MiniStat label="Critical" value={dashboard.partnerNetwork.summary.criticalPartners} />
            </div>
            <DataTable
              rows={dashboard.partnerNetwork.rows.slice(0, 10)}
              columns={[
                { key: 'partnerName', label: 'Partner' },
                { key: 'type', label: 'Type' },
                { key: 'regionName', label: 'Region' },
                { key: 'branchName', label: 'Branch' },
                { key: 'applications', label: 'Applications' },
                { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
                { key: 'healthScore', label: 'Health' },
                { key: 'escalations', label: 'Escalations' },
                { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
              ]}
            />
          </Section>
        </div>

        <Section title="SLA & Escalation Hotspots" icon={ShieldAlert}>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MiniStat label="Open Requests" value={dashboard.slaHotspots.metrics.totalOpenRequests} />
            <MiniStat label="SLA Breaches" value={dashboard.slaHotspots.metrics.slaBreaches} />
            <MiniStat label="Escalations" value={dashboard.slaHotspots.metrics.escalations} />
            <MiniStat label="First Response" value={formatHours(dashboard.slaHotspots.metrics.averageFirstResponse)} />
            <MiniStat label="Resolution Time" value={formatHours(dashboard.slaHotspots.metrics.averageResolutionTime)} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <DataTable
              rows={dashboard.slaHotspots.topSLARiskAreas}
              empty="No SLA risk areas."
              columns={[
                { key: 'name', label: 'Top SLA Risk Areas' },
                { key: 'type', label: 'Type' },
                { key: 'slaBreaches', label: 'Breaches' },
                { key: 'riskLevel', label: 'Risk', render: (row) => <StatusPill status={row.riskLevel} /> },
              ]}
            />
            <DataTable
              rows={dashboard.slaHotspots.topEscalationHotspots}
              empty="No escalation hotspots."
              columns={[
                { key: 'name', label: 'Top Escalation Hotspots' },
                { key: 'type', label: 'Type' },
                { key: 'escalations', label: 'Escalations' },
                { key: 'openRequests', label: 'Open Requests' },
              ]}
            />
          </div>
        </Section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Application Pipeline Overview" icon={ClipboardList}>
            <DataTable
              rows={dashboard.pipeline}
              columns={[
                { key: 'stage', label: 'Stage' },
                { key: 'count', label: 'Count' },
                { key: 'averageAge', label: 'Average Age', render: (row) => formatDays(row.averageAge) },
                { key: 'riskLevel', label: 'Risk', render: (row) => <StatusPill status={row.riskLevel} /> },
              ]}
            />
          </Section>

          <Section title="Bank Performance Snapshot" icon={Banknote}>
            <DataTable
              rows={dashboard.bankPerformance}
              columns={[
                { key: 'bank', label: 'Bank' },
                { key: 'applicationsSubmitted', label: 'Submitted' },
                { key: 'approvals', label: 'Approvals' },
                { key: 'declines', label: 'Declines' },
                { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
                { key: 'averageResponseTime', label: 'Response', render: (row) => formatHours(row.averageResponseTime) },
                { key: 'instructionCount', label: 'Instructions' },
              ]}
            />
          </Section>
        </div>

        {bankState.dashboard ? (
          <Section title="Executive Bank Dashboard" icon={Banknote}>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat label="Bank Health" value={Math.round(bankState.dashboard.scorecards.reduce((sum, row) => sum + Number(row.healthScore || 0), 0) / (bankState.dashboard.scorecards.length || 1))} />
              <MiniStat label="Bank Escalations" value={bankState.dashboard.summary.escalations} />
              <MiniStat label="Bank Approval Trend" value={formatPercent(bankState.dashboard.summary.approvalRate)} />
              <MiniStat label="Active Banks" value={bankState.dashboard.summary.activeBanks} />
            </div>
            <DataTable
              rows={bankState.dashboard.rankings.bestOverall.slice(0, 5)}
              columns={[
                { key: 'bankName', label: 'Bank' },
                { key: 'healthScore', label: 'Health' },
                { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
                { key: 'averageResponseTime', label: 'Response', render: (row) => formatHours(row.averageResponseTime) },
                { key: 'escalations', label: 'Escalations' },
                { key: 'relationshipHealth', label: 'Status', render: (row) => <StatusPill status={row.relationshipHealth} /> },
              ]}
            />
          </Section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Executive Forecast" icon={LineChart}>
            <DataTable
              rows={dashboard.forecast}
              columns={[
                { key: 'periodDays', label: 'Period', render: (row) => `${row.periodDays}d` },
                { key: 'expectedApplications', label: 'Applications' },
                { key: 'expectedApprovals', label: 'Approvals' },
                { key: 'expectedCapacityRisk', label: 'Capacity Risk', render: (row) => <StatusPill status={row.expectedCapacityRisk} /> },
                { key: 'requiredConsultants', label: 'Consultants' },
                { key: 'expectedSLARisk', label: 'SLA Risk', render: (row) => <StatusPill status={row.expectedSLARisk} /> },
                { key: 'executiveForecastRisk', label: 'Executive Risk', render: (row) => <StatusPill status={row.executiveForecastRisk} /> },
              ]}
            />
          </Section>

          <Section title="Revenue & Commercial Snapshot" icon={Wallet}>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <MiniStat label="Estimated Revenue" value={formatMoney(dashboard.commercialSnapshot.estimatedRevenue)} />
              <MiniStat label="Applications Billed" value={dashboard.commercialSnapshot.applicationsBilled} />
            </div>
            <DataTable
              rows={dashboard.commercialSnapshot.revenueByRegion.slice(0, 6)}
              columns={[
                { key: 'name', label: 'Region' },
                { key: 'applications', label: 'Applications' },
                { key: 'estimatedRevenue', label: 'Revenue', render: (row) => formatMoney(row.estimatedRevenue) },
              ]}
            />
          </Section>
        </div>

        <Section
          title="Board Report Generator"
          icon={FileSpreadsheet}
          action={(
            <div className="flex gap-2">
              <button type="button" onClick={() => createReport('PDF')} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">PDF</button>
              <button type="button" onClick={() => createReport('Excel')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Excel</button>
            </div>
          )}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {['Executive Summary', 'Application Volume', 'Approval Performance', 'Regional Comparison', 'Branch Comparison', 'Partner Health', 'Consultant Capacity', 'SLA Performance', 'Escalations', 'Forecast', 'Commercial Snapshot'].map((section) => (
              <div key={section} className="rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700">{section}</div>
            ))}
          </div>
        </Section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Requires Executive Attention" icon={AlertTriangle}>
            <div className="space-y-3">
              {dashboard.alerts.slice(0, 8).map((alert) => (
                <article key={alert.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{alert.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{alert.description}</p>
                    </div>
                    <StatusPill status={alert.severity} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link to={alert.sourceType === 'region' ? `/bond/regional-operations?regionId=${encodeURIComponent(alert.sourceId)}` : '/bond/hq-command-centre'} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">View</Link>
                    <button type="button" onClick={() => assignAlert(alert.id)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Assign Follow-Up</button>
                    <button type="button" onClick={() => dismissAlert(alert.id)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">Dismiss</button>
                  </div>
                </article>
              ))}
              {!dashboard.alerts.length ? <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">No executive alerts.</p> : null}
            </div>
          </Section>

          <Section title="HQ Activity Feed" icon={Clock3}>
            <div className="space-y-3">
              {dashboard.activityFeed.thisMonth.slice(0, 12).map((row) => (
                <div key={row.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{row.label || row.eventType}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(row.createdAt).toLocaleString()}</p>
                  </div>
                  <StatusPill status={row.eventType} />
                </div>
              ))}
              {!dashboard.activityFeed.thisMonth.length ? <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">No HQ activity yet.</p> : null}
            </div>
          </Section>
        </div>
      </div>
    </main>
  )
}
