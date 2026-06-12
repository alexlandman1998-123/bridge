import {
  AlertTriangle,
  BarChart3,
  Building2,
  Gauge,
  LineChart,
  PieChart,
  ShieldCheck,
  TrendingUp,
  Users,
  Warehouse,
} from 'lucide-react'
import { createElement, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { formatCurrency, formatNumber, titleize } from '../commercialFormatters'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialMarketIntelligenceData } from '../services/commercialIntelligenceApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

const TABS = [
  ['market', 'Market'],
  ['supply', 'Supply'],
  ['vacancy', 'Vacancy'],
  ['demand', 'Demand'],
  ['leasing', 'Leasing'],
  ['areas', 'Areas'],
  ['benchmarks', 'Benchmarks'],
  ['investor', 'Investor'],
  ['portfolio', 'Portfolio'],
  ['quality', 'Data Quality'],
  ['reports', 'Reports'],
]

const EMPTY_ARRAY = []

function percentLabel(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '0%'
  return `${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 }).format(parsed)}%`
}

function areaLabel(value) {
  return `${formatNumber(value || 0)} m2`
}

function KpiCard({ label, value, detail, icon: Icon, tone = 'blue', loading }) {
  const tones = {
    blue: 'bg-sky-50 text-sky-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    slate: 'bg-slate-100 text-slate-600',
  }
  return (
    <article className={`${CARD_CLASS} min-h-[126px]`}>
      {loading ? <div className="h-20 animate-pulse rounded-2xl bg-slate-100" /> : (
        <div className="flex items-start gap-4">
          <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones[tone] || tones.blue}`}>
            {createElement(Icon, { size: 20 })}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-[#102236]">{value}</p>
            <p className="mt-2 text-xs font-semibold text-slate-500">{detail}</p>
          </div>
        </div>
      )}
    </article>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-10 items-center rounded-2xl px-4 text-sm font-semibold transition ${
        active ? 'bg-[#102b46] text-white' : 'border border-slate-200 bg-white text-[#102236] hover:border-blue-200 hover:text-blue-700'
      }`}
    >
      {children}
    </button>
  )
}

function Table({ columns = [], rows = [], empty = 'No rows yet.', minWidth = 860 }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
          <tr>
            {columns.map((column) => <th key={column.key} className={`px-3 py-3 ${column.align === 'right' ? 'text-right' : ''}`}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length ? rows.map((row) => (
            <tr key={row.id || row.key || row.label} className="align-top hover:bg-slate-50">
              {columns.map((column) => (
                <td key={column.key} className={`px-3 py-3 ${column.align === 'right' ? 'text-right' : ''}`}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td className="px-3 py-5 text-slate-500" colSpan={columns.length}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function SectionHeader({ title, description, action }) {
  return (
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-[#102236]">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  )
}

function SimpleBars({ rows = [], valueKey = 'count', labelKey = 'label', maxRows = 8 }) {
  const visibleRows = rows.slice(0, maxRows)
  const max = Math.max(...visibleRows.map((row) => Number(row[valueKey] || 0)), 1)
  return (
    <div className="grid gap-3">
      {visibleRows.length ? visibleRows.map((row) => {
        const value = Number(row[valueKey] || 0)
        return (
          <div key={row.key || row[labelKey]} className="grid gap-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-[#102236]">{titleize(row[labelKey])}</span>
              <span className="text-slate-500">{formatNumber(value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#102b46]" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
            </div>
          </div>
        )
      }) : <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No data captured yet.</p>}
    </div>
  )
}

function CommercialMarketIntelligencePage() {
  const [tab, setTab] = useState('market')
  const { data, loading, error } = useCommercialData(getCommercialMarketIntelligenceData, [])
  const intelligence = data?.intelligence || {}
  const supply = intelligence.supply || {}
  const demand = intelligence.demand || {}
  const leasing = intelligence.leasing || {}
  const vacancy = intelligence.vacancy || {}
  const areas = intelligence.areas || EMPTY_ARRAY
  const benchmarking = intelligence.benchmarking || {}
  const investor = intelligence.investor || {}
  const portfolio = intelligence.portfolio || []
  const dataQuality = intelligence.dataQuality || {}

  const topAreaGaps = useMemo(() => areas.slice().sort((left, right) => Math.abs(right.supplyDemandGap || 0) - Math.abs(left.supplyDemandGap || 0)).slice(0, 8), [areas])

  const marketKpis = [
    { label: 'Active Properties', value: formatNumber(supply.totalActiveProperties || 0), detail: 'Commercial supply records', icon: Building2 },
    { label: 'Available Space', value: areaLabel(supply.availableSpace || 0), detail: `${areaLabel(supply.occupiedSpace || 0)} occupied`, icon: Warehouse, tone: 'amber' },
    { label: 'Active Requirements', value: formatNumber(demand.activeRequirements || 0), detail: 'Live occupier/investor demand', icon: Users, tone: 'green' },
    { label: 'Occupancy', value: percentLabel(supply.occupancyRate || 0), detail: `${percentLabel(supply.vacancyRate || 0)} vacancy`, icon: TrendingUp, tone: 'green' },
    { label: 'Avg Days On Market', value: formatNumber(leasing.averageDaysOnMarket || 0), detail: 'Vacancy lifecycle average', icon: Gauge, tone: 'slate' },
    { label: 'Deal Conversion', value: percentLabel(leasing.averageDealConversion || 0), detail: 'Viewed stock to deals', icon: LineChart, tone: 'blue' },
    { label: 'Investment Volume', value: formatCurrency(investor.transactionVolume || 0), detail: `${formatNumber(investor.investmentSales || 0)} sale transactions`, icon: PieChart, tone: 'green' },
    { label: 'Data Quality', value: percentLabel(dataQuality.score || 0), detail: 'Reporting readiness score', icon: ShieldCheck, tone: (dataQuality.score || 0) < 80 ? 'rose' : 'green' },
  ]

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#102236]">Commercial Market Intelligence</h1>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
              Live network intelligence from commercial supply, demand, viewings, deals, transactions, occupancy, revenue, and portal activity. No external feeds or generated assumptions are included in Phase 7.
            </p>
          </div>
          <Link to="/commercial/principal" className="inline-flex min-h-10 items-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-[#102236]">
            Principal View
          </Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {TABS.map(([key, label]) => <TabButton key={key} active={tab === key} onClick={() => setTab(key)}>{label}</TabButton>)}
        </div>
      </section>

      {error ? <CommercialEmptyState title="Market intelligence could not be loaded" description={error} /> : null}

      {tab === 'market' ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {marketKpis.map((card) => <KpiCard key={card.label} {...card} loading={loading} />)}
          </section>
          <section className="grid gap-4 xl:grid-cols-2">
            <article className={CARD_CLASS}>
              <SectionHeader title="Demand vs Supply Gaps" description="Area-level supply and demand imbalance based on active vacancies and active requirements." />
              <Table
                columns={[
                  { key: 'label', label: 'Area', render: (row) => row.label },
                  { key: 'availableSupply', label: 'Supply', align: 'right', render: (row) => areaLabel(row.availableSupply || 0) },
                  { key: 'activeDemand', label: 'Demand', align: 'right', render: (row) => areaLabel(row.activeDemand || 0) },
                  { key: 'supplyDemandGap', label: 'Gap', align: 'right', render: (row) => areaLabel(row.supplyDemandGap || 0) },
                ]}
                rows={topAreaGaps}
                minWidth={640}
              />
            </article>
            <article className={CARD_CLASS}>
              <SectionHeader title="Leasing Velocity" description="Movement through vacancy, viewing, deal, transaction, and completed stages." />
              <SimpleBars rows={leasing.velocity || []} valueKey="count" />
            </article>
          </section>
        </>
      ) : null}

      {tab === 'supply' ? (
        <section className={CARD_CLASS}>
          <SectionHeader title="Supply Intelligence" description="Active properties, vacancies, listings, available space, occupied space, and occupancy by commercial category." />
          <Table
            columns={[
              { key: 'label', label: 'Category', render: (row) => titleize(row.label) },
              { key: 'properties', label: 'Properties', align: 'right', render: (row) => formatNumber(row.properties || 0) },
              { key: 'vacancies', label: 'Vacancies', align: 'right', render: (row) => formatNumber(row.vacancies || 0) },
              { key: 'listings', label: 'Listings', align: 'right', render: (row) => formatNumber(row.listings || 0) },
              { key: 'availableSpace', label: 'Available', align: 'right', render: (row) => areaLabel(row.availableSpace || 0) },
              { key: 'occupancyRate', label: 'Occupancy', align: 'right', render: (row) => percentLabel(row.occupancyRate || 0) },
            ]}
            rows={supply.byClass || []}
          />
        </section>
      ) : null}

      {tab === 'vacancy' ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <article className={CARD_CLASS}>
            <SectionHeader title="Vacancy Intelligence" description="New, occupied, withdrawn, and long-term vacancy movement from actual stock records." />
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['New Vacancies', formatNumber(vacancy.newVacancies || 0)],
                ['Occupied Vacancies', formatNumber(vacancy.occupiedVacancies || 0)],
                ['Withdrawn Vacancies', formatNumber(vacancy.withdrawnVacancies || 0)],
                ['Long-Term Vacancies', formatNumber(vacancy.longTermVacancies || 0)],
                ['Vacancy Rate', percentLabel(vacancy.vacancyRate || 0)],
                ['Absorption Rate', percentLabel(vacancy.absorptionRate || 0)],
              ].map(([label, value]) => (
                <article key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
                  <p className="mt-2 text-lg font-semibold text-[#102236]">{value}</p>
                </article>
              ))}
            </div>
          </article>
          <article className={CARD_CLASS}>
            <SectionHeader title="Long-Term Vacancies" description="Active vacancies older than 90 days, grouped for management attention." />
            <Table
              columns={[
                { key: 'title', label: 'Vacancy' },
                { key: 'property', label: 'Property' },
                { key: 'area', label: 'Area' },
                { key: 'availableSpace', label: 'Available', align: 'right', render: (row) => areaLabel(row.availableSpace || 0) },
                { key: 'daysVacant', label: 'Days', align: 'right', render: (row) => formatNumber(row.daysVacant || 0) },
              ]}
              rows={vacancy.longTerm || []}
              minWidth={640}
            />
          </article>
          <article className={CARD_CLASS}>
            <SectionHeader title="Vacancies By Area" description="Current vacancy exposure by captured commercial area." />
            <SimpleBars rows={vacancy.byArea || []} valueKey="vacancies" />
          </article>
          <article className={CARD_CLASS}>
            <SectionHeader title="Vacancies By Broker" description="Vacancy exposure by assigned broker." />
            <SimpleBars rows={vacancy.byBroker || []} valueKey="vacancies" />
          </article>
        </section>
      ) : null}

      {tab === 'demand' ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <article className={CARD_CLASS}>
            <SectionHeader title="Requirements By Type" description="What occupiers, buyers, and investors are asking the brokerage for." />
            <SimpleBars rows={demand.byType || []} valueKey="count" />
          </article>
          <article className={CARD_CLASS}>
            <SectionHeader title="Requirements By Area" description="Most active demand locations from preferred requirement areas." />
            <SimpleBars rows={demand.byArea || []} valueKey="count" />
          </article>
          <article className={CARD_CLASS}>
            <SectionHeader title="Requirements By Size" description="Size-band distribution based on minimum/maximum requirement area." />
            <SimpleBars rows={demand.bySize || []} valueKey="count" />
          </article>
          <article className={CARD_CLASS}>
            <SectionHeader title="Requirements By Budget" description="Budget-band distribution from captured requirement budgets." />
            <SimpleBars rows={demand.byBudget || []} valueKey="count" />
          </article>
        </section>
      ) : null}

      {tab === 'leasing' ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <article className={CARD_CLASS}>
            <SectionHeader title="Leasing Efficiency" description="Average movement speed and conversion from actual platform activity." />
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Average Days On Market', formatNumber(leasing.averageDaysOnMarket || 0)],
                ['Average Viewing Count', formatNumber(leasing.averageViewingCount || 0)],
                ['Deal Conversion', percentLabel(leasing.averageDealConversion || 0)],
                ['Transaction Duration', `${formatNumber(leasing.averageTransactionDuration || 0)} days`],
              ].map(([label, value]) => (
                <article key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
                  <p className="mt-2 text-xl font-semibold text-[#102236]">{value}</p>
                </article>
              ))}
            </div>
          </article>
          <article className={CARD_CLASS}>
            <SectionHeader title="Velocity Bottlenecks" description="Average time between commercial execution stages." />
            <Table
              columns={[
                { key: 'label', label: 'Stage Movement' },
                { key: 'days', label: 'Avg Days', align: 'right', render: (row) => formatNumber(row.days || 0) },
              ]}
              rows={leasing.bottlenecks || []}
              minWidth={420}
            />
          </article>
        </section>
      ) : null}

      {tab === 'areas' ? (
        <section className={CARD_CLASS}>
          <SectionHeader title="Commercial Area Performance" description="Supply, demand, transactions, occupancy, average rentals, and activity by area." />
          <Table
            columns={[
              { key: 'label', label: 'Area' },
              { key: 'availableSupply', label: 'Supply', align: 'right', render: (row) => areaLabel(row.availableSupply || 0) },
              { key: 'activeDemand', label: 'Demand', align: 'right', render: (row) => areaLabel(row.activeDemand || 0) },
              { key: 'transactions', label: 'Transactions', align: 'right', render: (row) => formatNumber(row.transactions || 0) },
              { key: 'occupancyRate', label: 'Occupancy', align: 'right', render: (row) => percentLabel(row.occupancyRate || 0) },
              { key: 'averageRental', label: 'Avg Rental', align: 'right', render: (row) => formatCurrency(row.averageRental || 0) },
              { key: 'viewings', label: 'Activity', align: 'right', render: (row) => formatNumber((row.viewings || 0) + (row.deals || 0) + (row.activity || 0)) },
            ]}
            rows={areas}
          />
        </section>
      ) : null}

      {tab === 'benchmarks' ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <article className={CARD_CLASS}>
            <SectionHeader title="Brokerage Benchmarking: Brokers" description="Internal comparison of listings, viewings, deals, transactions, occupancy value, and revenue." />
            <Table
              columns={[
                { key: 'label', label: 'Broker' },
                { key: 'listings', label: 'Listings', align: 'right', render: (row) => formatNumber(row.listings || 0) },
                { key: 'viewings', label: 'Viewings', align: 'right', render: (row) => formatNumber(row.viewings || 0) },
                { key: 'deals', label: 'Deals', align: 'right', render: (row) => formatNumber(row.deals || 0) },
                { key: 'transactions', label: 'Transactions', align: 'right', render: (row) => formatNumber(row.transactions || 0) },
                { key: 'revenueGenerated', label: 'Revenue', align: 'right', render: (row) => formatCurrency(row.revenueGenerated || 0) },
              ]}
              rows={benchmarking.brokers || []}
            />
          </article>
          <article className={CARD_CLASS}>
            <SectionHeader title="Brokerage Benchmarking: Branches" description="Branch-level operating comparison from live commercial records." />
            <Table
              columns={[
                { key: 'label', label: 'Branch' },
                { key: 'brokers', label: 'Brokers', align: 'right', render: (row) => formatNumber(row.brokers || 0) },
                { key: 'listings', label: 'Listings', align: 'right', render: (row) => formatNumber(row.listings || 0) },
                { key: 'viewings', label: 'Viewings', align: 'right', render: (row) => formatNumber(row.viewings || 0) },
                { key: 'transactions', label: 'Transactions', align: 'right', render: (row) => formatNumber(row.transactions || 0) },
                { key: 'revenueGenerated', label: 'Revenue', align: 'right', render: (row) => formatCurrency(row.revenueGenerated || 0) },
              ]}
              rows={benchmarking.branches || []}
            />
          </article>
        </section>
      ) : null}

      {tab === 'investor' ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <article className={CARD_CLASS}>
            <SectionHeader title="Investor Analytics" description="Investment activity from actual requirements, listings, sale transactions, cap rates, and yields." />
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Active Opportunities', formatNumber(investor.activeOpportunities || 0)],
                ['Transaction Volume', formatCurrency(investor.transactionVolume || 0)],
                ['Investment Sales', formatNumber(investor.investmentSales || 0)],
                ['Average Cap Rate', percentLabel(investor.averageCapRate || 0)],
                ['Gross Yield', percentLabel(investor.averageGrossYield || 0)],
                ['Net Yield', percentLabel(investor.averageNetYield || 0)],
              ].map(([label, value]) => (
                <article key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
                  <p className="mt-2 text-lg font-semibold text-[#102236]">{value}</p>
                </article>
              ))}
            </div>
          </article>
          <article className={CARD_CLASS}>
            <SectionHeader title="Investment Opportunities" description="Current investment-facing listings and opportunities." />
            <Table
              columns={[
                { key: 'title', label: 'Opportunity' },
                { key: 'status', label: 'Status', render: (row) => titleize(row.status) },
                { key: 'value', label: 'Value', align: 'right', render: (row) => formatCurrency(row.value || 0) },
              ]}
              rows={investor.opportunities || []}
              minWidth={520}
            />
          </article>
        </section>
      ) : null}

      {tab === 'portfolio' ? (
        <section className={CARD_CLASS}>
          <SectionHeader title="Portfolio Analytics" description="Landlord asset performance across properties, vacancy exposure, transactions, viewings, and leasing velocity." />
          <Table
            columns={[
              { key: 'landlord', label: 'Landlord' },
              { key: 'properties', label: 'Properties', align: 'right', render: (row) => formatNumber(row.properties || 0) },
              { key: 'vacancies', label: 'Vacancies', align: 'right', render: (row) => formatNumber(row.vacancies || 0) },
              { key: 'transactions', label: 'Transactions', align: 'right', render: (row) => formatNumber(row.transactions || 0) },
              { key: 'viewings', label: 'Viewings', align: 'right', render: (row) => formatNumber(row.viewings || 0) },
              { key: 'occupancyRate', label: 'Occupancy', align: 'right', render: (row) => percentLabel(row.occupancyRate || 0) },
              { key: 'leasingVelocity', label: 'Velocity', align: 'right', render: (row) => percentLabel(row.leasingVelocity || 0) },
            ]}
            rows={portfolio}
          />
        </section>
      ) : null}

      {tab === 'quality' ? (
        <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <article className={CARD_CLASS}>
            <SectionHeader title="Data Quality Monitoring" description="Reporting integrity across commercial CRM, stock, demand, deals, and transactions." />
            <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-5">
              <p className="text-sm font-semibold text-slate-500">Readiness Score</p>
              <p className="mt-2 text-4xl font-semibold text-[#102236]">{percentLabel(dataQuality.score || 0)}</p>
            </div>
          </article>
          <article className={CARD_CLASS}>
            <Table
              columns={[
                { key: 'label', label: 'Issue' },
                { key: 'priority', label: 'Priority', render: (row) => row.priority },
                { key: 'count', label: 'Count', align: 'right', render: (row) => formatNumber(row.count || 0) },
              ]}
              rows={dataQuality.issues || []}
              minWidth={520}
            />
          </article>
        </section>
      ) : null}

      {tab === 'reports' ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(intelligence.reports || []).map((report) => (
            <article key={report.key} className={CARD_CLASS}>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#102b46]">
                {createElement(BarChart3, { size: 18 })}
              </span>
              <h2 className="mt-4 text-base font-semibold text-[#102236]">{report.label}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{report.description}</p>
            </article>
          ))}
          <article className={CARD_CLASS}>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              {createElement(AlertTriangle, { size: 18 })}
            </span>
            <h2 className="mt-4 text-base font-semibold text-[#102236]">Future Data Sources</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{(intelligence.futureDataSources || []).join(', ')}</p>
          </article>
        </section>
      ) : null}
    </div>
  )
}

export default CommercialMarketIntelligencePage
