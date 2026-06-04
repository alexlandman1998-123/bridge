import {
  AlertTriangle,
  Banknote,
  BarChart3,
  BrainCircuit,
  Building2,
  CheckCircle2,
  Clock3,
  Gauge,
  LineChart,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  getPredictiveDashboard,
  recordPredictionFeedback,
} from '../../services/bondPredictiveAnalyticsService'

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

function formatMoney(value) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`
}

function statusClass(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized.includes('critical') || normalized.includes('high')) return 'bg-red-50 text-red-700 ring-red-200'
  if (normalized.includes('medium') || normalized.includes('watch') || normalized.includes('at risk')) return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (normalized.includes('low') || normalized.includes('normal') || normalized.includes('high confidence')) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
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

function Section({ title, icon: Icon, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        {Icon ? <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" /> : null}
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function StatusPill({ status }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(status)}`}>{status || 'Low'}</span>
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
            <tr key={row.id || row.applicationId || row.partnerId || row.bank || `${row.type || 'row'}-${index}`} className="align-top">
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

export default function BondPredictiveIntelligencePage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState('')
  const options = useMemo(() => ({ workspaceId, refreshKey }), [workspaceId, refreshKey])

  const state = useMemo(() => {
    try {
      return { dashboard: getPredictiveDashboard(workspaceContext, options), error: '' }
    } catch (error) {
      return { dashboard: null, error: String(error?.message || 'Could not load predictive intelligence.') }
    }
  }, [workspaceContext, options])
  const dashboard = state.dashboard

  function refresh() {
    setNotice('Predictive Intelligence refreshed.')
    setRefreshKey((value) => value + 1)
  }

  function markFeedback(correct) {
    try {
      const target = dashboard.applicationRisks[0]
      if (!target) return
      recordPredictionFeedback(`feedback-${target.applicationId}`, {
        correct,
        expectedOutcome: target.riskLevel,
        actualOutcome: correct ? target.riskLevel : 'Outcome differed',
      }, workspaceContext, options)
      setNotice(correct ? 'Prediction marked correct.' : 'Prediction marked incorrect.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not record prediction feedback.'))
    }
  }

  if (state.error) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">Predictive Intelligence</h1>
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
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Predictive Intelligence</h1>
            <p className="mt-1 text-sm text-slate-500">Risk scoring, probability forecasts, and intervention intelligence</p>
          </div>
          <button type="button" onClick={refresh} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </header>

        <nav className="flex flex-wrap gap-2 text-sm">
          {[
            ['Dashboard', '/dashboard'],
            ['Branch Operations', '/bond/branch-operations'],
            ['Regional Operations', '/bond/regional-operations'],
            ['HQ Command Centre', '/bond/hq-command-centre'],
            ['Automation & Rules', '/bond/automation'],
            ['Predictive Intelligence', '/bond/predictive-intelligence'],
          ].map(([label, to]) => (
            <Link key={label} to={to} className={`rounded-lg px-3 py-2 font-medium ${label === 'Predictive Intelligence' ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
              {label}
            </Link>
          ))}
        </nav>

        {notice ? <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="High Risk Applications" value={dashboard.summary.highRiskApplications} icon={AlertTriangle} />
          <MetricCard label="Predicted SLA Breaches" value={dashboard.summary.predictedSLABreaches} icon={Clock3} />
          <MetricCard label="Capacity Issues" value={dashboard.summary.predictedCapacityIssues} icon={Users} />
          <MetricCard label="Partner Churn Risk" value={dashboard.summary.partnerChurnRisk} icon={Building2} />
          <MetricCard label="Revenue Risk" value={dashboard.summary.revenueRisk} icon={Banknote} />
          <MetricCard label="Forecast Confidence" value={dashboard.summary.forecastConfidence.replace(' Confidence', '')} icon={Gauge} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
          <Section title="Application Risk" icon={AlertTriangle}>
            <DataTable
              rows={dashboard.applicationRisks.slice(0, 12)}
              columns={[
                { key: 'applicationReference', label: 'Application' },
                { key: 'bank', label: 'Bank' },
                { key: 'riskScore', label: 'Score' },
                { key: 'riskLevel', label: 'Risk', render: (row) => <StatusPill status={row.riskLevel} /> },
                { key: 'confidence', label: 'Confidence', render: (row) => <StatusPill status={row.confidence} /> },
                { key: 'recommendedAction', label: 'Recommended Action' },
              ]}
            />
          </Section>

          <Section title="Approval Probability" icon={CheckCircle2}>
            <DataTable
              rows={dashboard.approvalProbabilities.slice(0, 6)}
              columns={[
                { key: 'applicationId', label: 'Application' },
                { key: 'bestBank', label: 'Best Bank' },
                { key: 'bestProbability', label: 'Probability', render: (row) => formatPercent(row.bestProbability) },
                { key: 'confidence', label: 'Confidence', render: (row) => <StatusPill status={row.probabilities?.[0]?.confidence} /> },
              ]}
            />
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="SLA Breach Prediction" icon={Clock3}>
            <DataTable
              rows={dashboard.slaPredictions.slice(0, 10)}
              columns={[
                { key: 'entityType', label: 'Entity' },
                { key: 'probability', label: 'Probability', render: (row) => formatPercent(row.probability) },
                { key: 'riskLevel', label: 'Risk', render: (row) => <StatusPill status={row.riskLevel} /> },
                { key: 'recommendedAction', label: 'Action' },
              ]}
            />
          </Section>

          <Section title="Consultant Overload Prediction" icon={Users}>
            <DataTable
              rows={dashboard.consultantCapacity}
              columns={[
                { key: 'consultantName', label: 'Consultant' },
                { key: 'currentWorkload', label: 'Current' },
                { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
                { key: 'forecast', label: '30 Day Forecast', render: (row) => <StatusPill status={row.forecast?.find((item) => item.periodDays === 30)?.riskLevel} /> },
              ]}
            />
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Branch Capacity Prediction" icon={Building2}>
            <DataTable
              rows={dashboard.branchCapacity}
              columns={[
                { key: 'branchName', label: 'Branch' },
                { key: 'current', label: 'Current' },
                { key: 'forecast', label: '14 Day Forecast', render: (row) => <StatusPill status={row.forecast?.find((item) => item.periodDays === 14)?.expectedCapacity} /> },
                { key: 'headcount', label: 'Required Headcount', render: (row) => row.forecast?.find((item) => item.periodDays === 14)?.requiredHeadcount || 0 },
                { key: 'action', label: 'Recommendation', render: (row) => row.forecast?.find((item) => item.periodDays === 14)?.recommendedAction || '' },
              ]}
            />
          </Section>

          <Section title="Partner Churn Prediction" icon={BrainCircuit}>
            <DataTable
              rows={dashboard.partnerChurn}
              columns={[
                { key: 'partnerName', label: 'Partner' },
                { key: 'churnRiskScore', label: 'Score' },
                { key: 'churnRisk', label: 'Risk', render: (row) => <StatusPill status={row.churnRisk} /> },
                { key: 'reason', label: 'Reason' },
              ]}
            />
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Revenue Risk Prediction" icon={Banknote}>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Expected Revenue" value={formatMoney(dashboard.revenueRisk.expectedRevenue)} />
              <MetricCard label="Shortfall" value={formatMoney(dashboard.revenueRisk.shortfall)} />
              <MetricCard label="Commission Risk" value={dashboard.revenueRisk.commissionRisk} />
              <MetricCard label="Risk Level" value={dashboard.revenueRisk.riskLevel} />
            </div>
          </Section>

          <Section title="Bank Performance Prediction" icon={LineChart}>
            <DataTable
              rows={dashboard.bankPerformance}
              columns={[
                { key: 'bank', label: 'Bank' },
                { key: 'approvalRate', label: 'Approval', render: (row) => formatPercent(row.approvalRate) },
                { key: 'responseTimeChange', label: 'Response Change', render: (row) => `${row.responseTimeChange}%` },
                { key: 'riskLevel', label: 'Risk', render: (row) => <StatusPill status={row.riskLevel} /> },
              ]}
            />
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Intelligent Recommendations" icon={Sparkles}>
            <DataTable
              rows={dashboard.recommendations}
              columns={[
                { key: 'priority', label: 'Priority', render: (row) => <StatusPill status={row.priority} /> },
                { key: 'type', label: 'Type' },
                { key: 'recommendation', label: 'Recommendation' },
              ]}
            />
          </Section>

          <Section title="Predictive Timeline" icon={BarChart3}>
            <DataTable
              rows={dashboard.predictiveTimeline.flatMap((item) => item.events.map((event) => ({ ...event, applicationReference: item.applicationReference }))).slice(0, 10)}
              columns={[
                { key: 'applicationReference', label: 'Application' },
                { key: 'predictedEvent', label: 'Predicted Event' },
                { key: 'probability', label: 'Probability', render: (row) => formatPercent(row.probability) },
                { key: 'confidence', label: 'Confidence', render: (row) => <StatusPill status={row.confidence} /> },
                { key: 'expectedDate', label: 'Expected', render: (row) => row.expectedDate ? new Date(row.expectedDate).toLocaleDateString() : '' },
              ]}
            />
          </Section>
        </div>

        <Section title="Prediction Feedback Loop" icon={Gauge}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Mark the highest-risk prediction as correct or incorrect to improve future prediction learning.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => markFeedback(true)} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">Prediction Correct</button>
              <button type="button" onClick={() => markFeedback(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Prediction Incorrect</button>
            </div>
          </div>
        </Section>
      </div>
    </main>
  )
}
