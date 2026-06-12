import { BarChart3, Building2, DollarSign, Gauge, Users, Warehouse } from 'lucide-react'
import { createElement } from 'react'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { formatCurrency, formatNumber } from '../commercialFormatters'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialBrokerageData } from '../services/commercialBrokerageApi'
import { getCommercialPrincipalDashboardData } from '../services/commercialDashboardApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

function ReportCard({ title, description, icon: Icon, children }) {
  return (
    <section className={CARD_CLASS}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#1f5a80]">
          {createElement(Icon, { size: 19 })}
        </span>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function MiniRows({ rows = [], renderRight }) {
  return (
    <div className="grid gap-3">
      {rows.length ? rows.map((row) => (
        <div key={row.id || row.key || row.name || row.label} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-[#fbfcfe] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#102236]">{row.name || row.label || row.propertyName || row.title}</p>
            <p className="truncate text-xs text-slate-500">{row.detail || row.branchName || row.property || row.type || ''}</p>
          </div>
          <div className="text-right text-sm font-semibold text-[#102236]">{renderRight(row)}</div>
        </div>
      )) : <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No report data yet.</p>}
    </div>
  )
}

function CommercialReportsPage() {
  const dashboard = useCommercialData(getCommercialPrincipalDashboardData, [])
  const brokerage = useCommercialData(getCommercialBrokerageData, [])
  const loading = dashboard.loading || brokerage.loading
  const error = dashboard.error || brokerage.error
  const data = dashboard.data || {}
  const ops = brokerage.data || {}
  const intelligence = data.intelligence || {}
  const financialSummary = data.financialSummary || {}
  const brokerRows = intelligence.brokerScorecards || ops.brokers || []
  const teamRows = ops.teams || []
  const branchRows = ops.branchRows || []
  const stockRows = intelligence.stockLeaderboard || []
  const pipelineRows = intelligence.executivePipeline || []

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Commercial Reports</h1>
            <p className="mt-1 text-sm leading-6 text-slate-500">On-screen reporting across brokers, teams, branches, stock, pipeline, and commissions.</p>
          </div>
          <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
            Live operational reporting
          </span>
        </div>
      </section>

      {error ? <CommercialEmptyState title="Commercial reports could not be loaded" description={error} /> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportCard title="Broker Report" description="Top broker contribution by pipeline and expected commission." icon={Users}>
          <MiniRows
            rows={brokerRows.slice(0, 8)}
            renderRight={(row) => (
              <div>
                <p>{formatCurrency(row.pipelineValue || 0)}</p>
                <p className="text-xs text-slate-500">{formatCurrency(row.expectedCommission || row.projectedCommission || 0)} projected</p>
              </div>
            )}
          />
        </ReportCard>

        <ReportCard title="Team Report" description="Compare team pipeline, transactions, and expected revenue." icon={Gauge}>
          <MiniRows
            rows={teamRows}
            renderRight={(row) => (
              <div>
                <p>{formatCurrency(row.pipelineValue || 0)}</p>
                <p className="text-xs text-slate-500">{formatCurrency(row.expectedRevenue || 0)} expected</p>
              </div>
            )}
          />
        </ReportCard>

        <ReportCard title="Branch Report" description="Branch stock, occupancy, and revenue outlook." icon={Building2}>
          <MiniRows
            rows={branchRows}
            renderRight={(row) => (
              <div>
                <p>{formatCurrency(row.pipelineValue || 0)}</p>
                <p className="text-xs text-slate-500">{formatNumber(row.occupancy || 0)}% occupancy</p>
              </div>
            )}
          />
        </ReportCard>

        <ReportCard title="Stock Report" description="Best-performing commercial assets by occupancy and activity." icon={Warehouse}>
          <MiniRows
            rows={stockRows}
            renderRight={(row) => (
              <div>
                <p>{formatNumber(row.occupancyRate || 0)}%</p>
                <p className="text-xs text-slate-500">{formatNumber(row.transactions || 0)} tx</p>
              </div>
            )}
          />
        </ReportCard>

        <ReportCard title="Pipeline Report" description="End-to-end brokerage flow from requirements to completion." icon={BarChart3}>
          <MiniRows
            rows={pipelineRows}
            renderRight={(row) => (
              <div>
                <p>{formatNumber(row.count || 0)}</p>
                <p className="text-xs text-slate-500">{formatCurrency(row.value || 0)}</p>
              </div>
            )}
          />
        </ReportCard>

        <ReportCard title="Commission Report" description="Projected, approved, and paid revenue visibility." icon={DollarSign}>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Projected Revenue', formatCurrency(financialSummary.projectedRevenue || 0)],
              ['Approved Revenue', formatCurrency(financialSummary.approvedRevenue || 0)],
              ['Paid Revenue', formatCurrency(financialSummary.paidRevenue || 0)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
                <p className="mt-2 text-lg font-semibold text-[#102236]">{loading ? '...' : value}</p>
              </div>
            ))}
          </div>
        </ReportCard>
      </div>
    </div>
  )
}

export default CommercialReportsPage
