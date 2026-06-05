import {
  AlertTriangle,
  BarChart3,
  Building2,
  Download,
  FileSpreadsheet,
  HeartPulse,
  LineChart,
  Network,
  RefreshCw,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  generatePartnerReport,
  getBranchServiceQuality,
  getConsultantResponsiveness,
  getEscalationAnalysis,
  getExecutiveReporting,
  getPartnerHealth,
  getRecurringIssues,
  getRegionalServiceQuality,
  getSLAPerformance,
  getTrendReporting,
} from '../../services/bondPartnerIntelligenceService'

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
  const number = Number(value || 0)
  return `${Math.round(number)}%`
}

function formatHours(value) {
  const number = Number(value || 0)
  return `${Math.round(number * 10) / 10}h`
}

function statusClass(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized.includes('excellent')) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (normalized.includes('healthy')) return 'bg-sky-50 text-sky-700 ring-sky-200'
  if (normalized.includes('risk') || normalized.includes('unhappy')) return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (normalized.includes('critical')) return 'bg-red-50 text-red-700 ring-red-200'
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
            <tr key={row.id || row.partnerId || row.issueType || row.period} className="align-top transition hover:bg-slate-50/70">
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

export default function BondPartnerIntelligencePage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState('')

  const options = useMemo(() => ({ workspaceId, refreshKey }), [workspaceId, refreshKey])
  const health = useMemo(() => getPartnerHealth(workspaceContext, options), [workspaceContext, options])
  const sla = useMemo(() => getSLAPerformance(workspaceContext, options), [workspaceContext, options])
  const consultants = useMemo(() => getConsultantResponsiveness(workspaceContext, options), [workspaceContext, options])
  const branches = useMemo(() => getBranchServiceQuality(workspaceContext, options), [workspaceContext, options])
  const regions = useMemo(() => getRegionalServiceQuality(workspaceContext, options), [workspaceContext, options])
  const issues = useMemo(() => getRecurringIssues(workspaceContext, options), [workspaceContext, options])
  const escalations = useMemo(() => getEscalationAnalysis(workspaceContext, options), [workspaceContext, options])
  const trends = useMemo(() => getTrendReporting(workspaceContext, options), [workspaceContext, options])
  const executive = useMemo(() => getExecutiveReporting(workspaceContext, options), [workspaceContext, options])

  function refresh() {
    setNotice('Partner intelligence refreshed.')
    setRefreshKey((value) => value + 1)
  }

  function handleReport(partner) {
    try {
      const report = generatePartnerReport(partner.partnerId, workspaceContext, options)
      setNotice(`Generated ${report.formats.pdf.filename} and ${report.formats.excel.filename}.`)
    } catch (error) {
      setNotice(String(error?.message || 'Could not generate partner report.'))
    }
  }

  const partnerColumns = [
    { key: 'partnerName', label: 'Partner' },
    { key: 'healthScore', label: 'Health Score' },
    { key: 'applications', label: 'Applications' },
    { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
    { key: 'slaCompliance', label: 'SLA Compliance', render: (row) => formatPercent(row.slaCompliance) },
    { key: 'escalations', label: 'Escalations' },
    { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Link to={`/bond/partners?partnerId=${encodeURIComponent(row.partnerId)}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
            <Network className="h-3.5 w-3.5" aria-hidden="true" />
            View
          </Link>
          <button type="button" onClick={() => handleReport(row)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Report
          </button>
        </div>
      ),
    },
  ]

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bond Originator</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Partner Intelligence</h1>
          </div>
          <button type="button" onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </header>

        <nav className="flex flex-wrap gap-2 text-sm font-semibold text-slate-600" aria-label="Bond intelligence">
          {[
            { label: 'Dashboard', to: '/bond/dashboard' },
            { label: 'Partners', to: '/bond/partners' },
            { label: 'Partner Intelligence', to: '/bond/partner-intelligence' },
            { label: 'Reports', to: '/bond/reports' },
          ].map((item) => (
            <Link key={item.label} to={item.to} className={`rounded-lg px-3 py-2 ${item.label === 'Partner Intelligence' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
              {item.label}
            </Link>
          ))}
        </nav>

        {notice ? <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{notice}</div> : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Excellent Partners" value={health.summary.excellentPartners} helper="Health score 80-100" icon={HeartPulse} />
          <MetricCard label="Healthy Partners" value={health.summary.healthyPartners} helper="Health score 60-79" icon={Users} />
          <MetricCard label="At Risk Partners" value={health.summary.atRiskPartners} helper="Health score 40-59" icon={AlertTriangle} />
          <MetricCard label="Critical Partners" value={health.summary.criticalPartners} helper="Health score 0-39" icon={AlertTriangle} />
        </section>

        {!executive.accessDenied ? (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Network Partner Health" value={Math.round(executive.widgets.networkPartnerHealth || 0)} icon={Network} />
            <MetricCard label="Network SLA" value={formatPercent(executive.widgets.networkSLAPerformance)} icon={BarChart3} />
            <MetricCard label="At Risk Network" value={executive.widgets.atRiskPartners?.length || 0} icon={AlertTriangle} />
            <MetricCard label="Top Partner" value={executive.widgets.topPerformingPartners?.[0]?.partnerName || 'None'} icon={HeartPulse} />
            <MetricCard label="Escalation Hotspot" value={executive.widgets.escalationHotspots?.branch?.name || 'None'} icon={Building2} />
          </section>
        ) : null}

        <Section title="Partner Health Dashboard" icon={HeartPulse}>
          <DataTable columns={partnerColumns} rows={health.rows} empty="No partner health rows are available in this scope." />
        </Section>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Section title="SLA Performance" icon={BarChart3}>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Total Requests" value={sla.metrics.totalRequests} />
              <MetricCard label="Resolved Within SLA" value={sla.metrics.resolvedWithinSLA} />
              <MetricCard label="Breached SLA" value={sla.metrics.breachedSLA} />
              <MetricCard label="Avg Response Time" value={formatHours(sla.metrics.averageResponseTime)} />
              <MetricCard label="Avg Resolution Time" value={formatHours(sla.metrics.averageResolutionTime)} />
              <MetricCard label="SLA Compliance" value={formatPercent(sla.metrics.slaCompliance)} />
            </div>
          </Section>

          <Section title="Consultant Responsiveness" icon={Users}>
            <DataTable
              rows={consultants.rows}
              columns={[
                { key: 'consultantName', label: 'Consultant' },
                { key: 'openRequests', label: 'Open Requests' },
                { key: 'averageFirstResponseTime', label: 'Response Time', render: (row) => formatHours(row.averageFirstResponseTime) },
                { key: 'averageResolutionTime', label: 'Resolution Time', render: (row) => formatHours(row.averageResolutionTime) },
                { key: 'slaCompliance', label: 'SLA %', render: (row) => formatPercent(row.slaCompliance) },
                { key: 'escalations', label: 'Escalations' },
                { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
              ]}
            />
          </Section>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Section title="Branch Service Quality" icon={Building2}>
            <DataTable
              rows={branches.rows}
              empty={branches.accessDenied ? 'Branch service quality is not available for this role.' : 'No branch service quality rows are available.'}
              columns={[
                { key: 'branchName', label: 'Branch' },
                { key: 'applications', label: 'Applications' },
                { key: 'openRequests', label: 'Open Requests' },
                { key: 'slaCompliance', label: 'SLA %', render: (row) => formatPercent(row.slaCompliance) },
                { key: 'partnerHealth', label: 'Partner Health' },
                { key: 'escalations', label: 'Escalations' },
              ]}
            />
          </Section>

          <Section title="Regional Service Dashboard" icon={Network}>
            <DataTable
              rows={regions.rows}
              empty={regions.accessDenied ? 'Regional service quality is not available for this role.' : 'No regional service rows are available.'}
              columns={[
                { key: 'regionName', label: 'Region' },
                { key: 'applications', label: 'Applications' },
                { key: 'partners', label: 'Partners' },
                { key: 'branches', label: 'Branches' },
                { key: 'averageSLA', label: 'Average SLA', render: (row) => formatPercent(row.averageSLA) },
                { key: 'partnerHealth', label: 'Partner Health' },
                { key: 'escalations', label: 'Escalations' },
              ]}
            />
          </Section>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Section title="Recurring Issues Analysis" icon={FileSpreadsheet}>
            <DataTable
              rows={issues.rows}
              columns={[
                { key: 'issueType', label: 'Issue Type' },
                { key: 'count', label: 'Count' },
                { key: 'trend', label: 'Trend', render: (row) => <StatusPill status={row.trend} /> },
                { key: 'affectedPartners', label: 'Affected Partners' },
              ]}
            />
          </Section>

          <Section title="Escalation Analysis" icon={AlertTriangle}>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Volume" value={escalations.metrics.volume} />
              <MetricCard label="Frequency" value={formatPercent(escalations.metrics.frequency)} />
              <MetricCard label="Trend" value={escalations.metrics.trend} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MetricCard label="Consultant" value={escalations.highlights.mostEscalatedConsultant?.name || 'None'} />
              <MetricCard label="Branch" value={escalations.highlights.mostEscalatedBranch?.name || 'None'} />
              <MetricCard label="Partner" value={escalations.highlights.mostEscalatedPartner?.name || 'None'} />
            </div>
          </Section>
        </section>

        <Section title="Trend Reporting" icon={LineChart}>
          <DataTable
            rows={trends.rows}
            columns={[
              { key: 'period', label: 'Period' },
              { key: 'applications', label: 'Applications' },
              { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
              { key: 'partnerHealth', label: 'Partner Health' },
              { key: 'slaCompliance', label: 'SLA Compliance', render: (row) => formatPercent(row.slaCompliance) },
              { key: 'escalations', label: 'Escalations' },
              { key: 'supportVolume', label: 'Support Volume' },
              { key: 'trend', label: 'Trend', render: (row) => <StatusPill status={row.trend} /> },
            ]}
          />
        </Section>
      </div>
    </main>
  )
}
