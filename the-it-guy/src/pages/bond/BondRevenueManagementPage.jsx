import {
  Banknote,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  Gauge,
  LineChart,
  RefreshCw,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  approvePayout,
  calculateBonus,
  generateCommissionStatement,
  getRevenueDashboard,
  markPayoutPaid,
} from '../../services/bondRevenueManagementService'

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
  if (normalized.includes('rejected') || normalized.includes('cancelled')) return 'bg-red-50 text-red-700 ring-red-200'
  if (normalized.includes('pending') || normalized.includes('processing')) return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (normalized.includes('approved') || normalized.includes('payable')) return 'bg-sky-50 text-sky-700 ring-sky-200'
  if (normalized.includes('paid')) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
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
            <tr key={row.id || row.applicationId || row.payeeId || row.key || `${row.bank || row.periodDays || 'row'}-${index}`} className="align-top">
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
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(status)}`}>{status || 'Pending'}</span>
}

function RankingCard({ label, item, valueKey = 'revenue' }) {
  return (
    <article className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold text-slate-950">{item?.name || item?.bank || 'No data'}</p>
      <p className="mt-1 text-sm text-slate-500">{formatMoney(item?.[valueKey] || item?.revenueGenerated || item?.profit || 0)}</p>
    </article>
  )
}

export default function BondRevenueManagementPage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState('')
  const options = useMemo(() => ({ workspaceId, refreshKey }), [workspaceId, refreshKey])

  const state = useMemo(() => {
    try {
      return { dashboard: getRevenueDashboard(workspaceContext, options), error: '' }
    } catch (error) {
      return { dashboard: null, error: String(error?.message || 'Could not load revenue management.') }
    }
  }, [workspaceContext, options])
  const dashboard = state.dashboard

  function refresh() {
    setNotice('Revenue & Commissions refreshed.')
    setRefreshKey((value) => value + 1)
  }

  function approve(row) {
    try {
      approvePayout(row.id, workspaceContext, options)
      setNotice(`Payout approved for ${row.payeeName}.`)
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not approve payout.'))
    }
  }

  function pay(row) {
    try {
      markPayoutPaid(row.id, workspaceContext, options)
      setNotice(`Payout marked paid for ${row.payeeName}.`)
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not mark payout paid.'))
    }
  }

  function statement(row, format = 'PDF') {
    try {
      generateCommissionStatement(row.key || row.payeeId, workspaceContext, { ...options, format })
      setNotice(`${format} commission statement generated.`)
    } catch (error) {
      setNotice(String(error?.message || 'Could not generate commission statement.'))
    }
  }

  function issueBonus() {
    try {
      const topConsultant = dashboard?.rankings?.topRevenueConsultant
      if (!topConsultant) return
      calculateBonus({
        recipientType: 'consultant',
        recipientId: topConsultant.key,
        amount: 1000,
        reason: 'Revenue target hit',
        metrics: { revenue: topConsultant.revenueGenerated || topConsultant.revenue || 0, approvalRate: topConsultant.approvalRate || 100, slaCompliance: 100 },
        rule: { type: 'fixed', fixedAmount: 1000, bonusCriteria: { revenueTarget: 1 } },
      }, workspaceContext, options)
      setNotice('Bonus issued for the top revenue consultant.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not issue bonus.'))
    }
  }

  if (state.error) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">Revenue & Commissions</h1>
          <p className="mt-3 text-sm text-slate-600">{state.error}</p>
        </div>
      </main>
    )
  }

  const canManageCommercial = Boolean(dashboard.permissions?.canManagePayouts || dashboard.permissions?.canIssueBonuses)

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bond Originator</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Revenue & Commissions</h1>
            <p className="mt-1 text-sm text-slate-500">Commercial engine and payout control</p>
          </div>
          <button type="button" onClick={refresh} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </header>

        <nav className="flex flex-wrap gap-2 text-sm">
          {[
            ['Dashboard', '/dashboard'],
            ['Consultant Performance', '/bond/consultant-performance'],
            ['Branch Operations', '/bond/branch-operations'],
            ['Regional Operations', '/bond/regional-operations'],
            ['HQ Command Centre', '/bond/hq-command-centre'],
            ['Bank Relationships', '/bond/banks'],
            ['Revenue & Commissions', '/bond/revenue'],
          ].map(([label, to]) => (
            <Link
              key={label}
              to={to}
              className={`rounded-lg px-3 py-2 font-medium ${label === 'Revenue & Commissions' ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {notice ? <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Revenue This Month" value={formatMoney(dashboard.summary.revenueThisMonth)} icon={Wallet} />
          <MetricCard label="Revenue YTD" value={formatMoney(dashboard.summary.revenueYTD)} icon={BarChart3} />
          <MetricCard label="Projected Revenue" value={formatMoney(dashboard.summary.projectedRevenue)} icon={LineChart} />
          <MetricCard label="Pending Revenue" value={formatMoney(dashboard.summary.pendingRevenue)} icon={Clock3} />
          <MetricCard label="Commissions Payable" value={formatMoney(dashboard.summary.commissionsPayable)} icon={Users} />
          <MetricCard label="Referral Fees Payable" value={formatMoney(dashboard.summary.referralFeesPayable)} icon={Banknote} />
          <MetricCard label="Profit Estimate" value={formatMoney(dashboard.summary.profitEstimate)} icon={Gauge} />
          <MetricCard label="Avg Revenue / App" value={formatMoney(dashboard.summary.averageRevenuePerApplication)} icon={CheckCircle2} />
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Commercial Rankings" icon={Trophy}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <RankingCard label="Top Revenue Consultant" item={dashboard.rankings.topRevenueConsultant} valueKey="revenueGenerated" />
              <RankingCard label="Top Revenue Branch" item={dashboard.rankings.topRevenueBranch} />
              <RankingCard label="Top Revenue Region" item={dashboard.rankings.topRevenueRegion} />
              <RankingCard label="Top Revenue Partner" item={dashboard.rankings.topRevenuePartner} valueKey="revenueGenerated" />
              <RankingCard label="Most Profitable Bank" item={dashboard.rankings.mostProfitableBank} valueKey="profit" />
            </div>
          </Section>

          <Section title="Revenue Forecast" icon={LineChart}>
            <DataTable
              rows={dashboard.forecast}
              columns={[
                { key: 'periodDays', label: 'Period', render: (row) => row.periodDays === 365 ? '12 months' : `${row.periodDays} days` },
                { key: 'expectedApplications', label: 'Applications' },
                { key: 'expectedRevenue', label: 'Revenue', render: (row) => formatMoney(row.expectedRevenue) },
                { key: 'expectedCommission', label: 'Commission', render: (row) => formatMoney(row.expectedCommission) },
                { key: 'expectedProfit', label: 'Profit', render: (row) => formatMoney(row.expectedProfit) },
              ]}
            />
          </Section>
        </div>

        <Section title="Revenue Attribution" icon={FileSpreadsheet}>
          <DataTable
            rows={dashboard.attribution}
            columns={[
              { key: 'applicationReference', label: 'Application' },
              { key: 'consultantName', label: 'Consultant' },
              { key: 'branchName', label: 'Branch' },
              { key: 'partnerName', label: 'Partner' },
              { key: 'bank', label: 'Bank' },
              { key: 'applicationRevenue', label: 'Revenue', render: (row) => formatMoney(row.applicationRevenue) },
              { key: 'consultantCommission', label: 'Consultant Commission', render: (row) => formatMoney(row.consultantCommission) },
              { key: 'referralFee', label: 'Referral Fee', render: (row) => formatMoney(row.referralFee) },
              { key: 'bankIncentive', label: 'Bank Incentive', render: (row) => formatMoney(row.bankIncentive) },
              { key: 'profit', label: 'Profit', render: (row) => formatMoney(row.profit) },
              { key: 'revenueStatus', label: 'Status', render: (row) => <StatusPill status={row.revenueStatus} /> },
            ]}
          />
        </Section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section
            title="Consultant Earnings"
            icon={Users}
            action={dashboard.permissions?.canIssueBonuses ? <button type="button" onClick={issueBonus} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">Issue Bonus</button> : null}
          >
            <DataTable
              rows={dashboard.consultantEarnings}
              columns={[
                { key: 'name', label: 'Consultant' },
                { key: 'applications', label: 'Applications' },
                { key: 'revenueGenerated', label: 'Revenue', render: (row) => formatMoney(row.revenueGenerated) },
                { key: 'commissionEarned', label: 'Commission Earned', render: (row) => formatMoney(row.commissionEarned) },
                { key: 'commissionPaid', label: 'Paid', render: (row) => formatMoney(row.commissionPaid) },
                { key: 'commissionOutstanding', label: 'Outstanding', render: (row) => formatMoney(row.commissionOutstanding) },
                {
                  key: 'statement',
                  label: 'Statement',
                  render: (row) => (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => statement(row, 'PDF')} className="font-semibold text-slate-950 hover:underline">PDF</button>
                      <button type="button" onClick={() => statement(row, 'Excel')} className="font-semibold text-slate-950 hover:underline">Excel</button>
                    </div>
                  ),
                },
              ]}
            />
          </Section>

          <Section title="Payout Centre" icon={Wallet}>
            <DataTable
              rows={dashboard.payouts}
              columns={[
                { key: 'payeeName', label: 'Payee' },
                { key: 'payeeType', label: 'Type' },
                { key: 'applications', label: 'Applications' },
                { key: 'amount', label: 'Amount', render: (row) => formatMoney(row.amount) },
                { key: 'workflowStage', label: 'Workflow' },
                { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
                ...(canManageCommercial
                  ? [
                      {
                        key: 'actions',
                        label: 'Actions',
                        render: (row) => (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => approve(row)} className="font-semibold text-slate-950 hover:underline">Approve</button>
                            <button type="button" onClick={() => pay(row)} className="font-semibold text-slate-950 hover:underline">Mark Paid</button>
                          </div>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Branch Revenue" icon={BarChart3}>
            <DataTable
              rows={dashboard.branchRevenue}
              columns={[
                { key: 'branchName', label: 'Branch' },
                { key: 'applications', label: 'Apps' },
                { key: 'revenue', label: 'Revenue', render: (row) => formatMoney(row.revenue) },
                { key: 'commissions', label: 'Commissions', render: (row) => formatMoney(row.commissions) },
                { key: 'profit', label: 'Profit', render: (row) => formatMoney(row.profit) },
                { key: 'approvalRate', label: 'Approval', render: (row) => formatPercent(row.approvalRate) },
                { key: 'revenuePerConsultant', label: 'Revenue / Consultant', render: (row) => formatMoney(row.revenuePerConsultant) },
              ]}
            />
          </Section>

          <Section title="Regional Revenue" icon={LineChart}>
            <DataTable
              rows={dashboard.regionalRevenue}
              columns={[
                { key: 'regionName', label: 'Region' },
                { key: 'applications', label: 'Apps' },
                { key: 'revenue', label: 'Revenue', render: (row) => formatMoney(row.revenue) },
                { key: 'profit', label: 'Profit', render: (row) => formatMoney(row.profit) },
                { key: 'commissions', label: 'Commissions', render: (row) => formatMoney(row.commissions) },
                { key: 'growth', label: 'Growth', render: (row) => formatPercent(row.growth) },
              ]}
            />
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Partner Revenue" icon={Users}>
            <DataTable
              rows={dashboard.partnerRevenue}
              columns={[
                { key: 'partnerName', label: 'Partner' },
                { key: 'applicationsSent', label: 'Applications' },
                { key: 'revenueGenerated', label: 'Revenue', render: (row) => formatMoney(row.revenueGenerated) },
                { key: 'referralFees', label: 'Referral Fees', render: (row) => formatMoney(row.referralFees) },
                { key: 'profit', label: 'Profitability', render: (row) => formatMoney(row.profit) },
                { key: 'lifetimeValue', label: 'LTV', render: (row) => formatMoney(row.lifetimeValue) },
              ]}
            />
          </Section>

          <Section title="Bank Revenue" icon={Banknote}>
            <DataTable
              rows={dashboard.bankRevenue}
              columns={[
                { key: 'bank', label: 'Bank' },
                { key: 'applications', label: 'Apps' },
                { key: 'revenue', label: 'Revenue', render: (row) => formatMoney(row.revenue) },
                { key: 'approvalRevenue', label: 'Approval Revenue', render: (row) => formatMoney(row.approvalRevenue) },
                { key: 'instructionRevenue', label: 'Instruction Revenue', render: (row) => formatMoney(row.instructionRevenue) },
                { key: 'bankIncentives', label: 'Incentives', render: (row) => formatMoney(row.bankIncentives) },
              ]}
            />
          </Section>
        </div>

        <Section title="Profitability" icon={Gauge}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <MetricCard label="Revenue" value={formatMoney(dashboard.profitability.revenue)} />
            <MetricCard label="Commission" value={formatMoney(dashboard.profitability.commission)} />
            <MetricCard label="Referral Fees" value={formatMoney(dashboard.profitability.referralFees)} />
            <MetricCard label="Bank Incentives" value={formatMoney(dashboard.profitability.bankIncentives)} />
            <MetricCard label="Profit" value={formatMoney(dashboard.profitability.profit)} />
            <MetricCard label="Margin" value={formatPercent(dashboard.profitability.margin)} />
          </div>
        </Section>

        <Section title="Revenue Activity Feed" icon={Clock3}>
          <DataTable
            rows={dashboard.activityFeed}
            empty="No revenue activity recorded yet."
            columns={[
              { key: 'eventType', label: 'Event', render: (row) => normalizeText(row.eventType).replaceAll('_', ' ') },
              { key: 'sourceType', label: 'Source' },
              { key: 'sourceId', label: 'Reference' },
              { key: 'createdAt', label: 'Created', render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleString() : '' },
            ]}
          />
        </Section>
      </div>
    </main>
  )
}
