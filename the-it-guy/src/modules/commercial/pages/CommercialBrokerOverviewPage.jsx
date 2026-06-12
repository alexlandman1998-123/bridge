import { Activity, BriefcaseBusiness, ClipboardList, Handshake, Users } from 'lucide-react'
import { createElement } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialBrokerageData } from '../services/commercialBrokerageApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

function SummaryCard({ label, value, detail, icon: Icon }) {
  return (
    <article className={CARD_CLASS}>
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#123b61]">
        {createElement(Icon, { size: 19 })}
      </span>
      <p className="mt-4 text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{value}</p>
      <p className="mt-2 text-xs font-semibold text-emerald-600">{detail}</p>
    </article>
  )
}

function CommercialBrokerOverviewPage() {
  const { data, loading, error } = useCommercialData(getCommercialBrokerageData, [])
  const summary = data?.summary || {}
  const brokers = data?.brokers || []
  const unassigned = data?.unassigned || {}
  const unassignedRows = [
    ['Requirements', unassigned.requirements?.length || 0],
    ['Deals', unassigned.deals?.length || 0],
    ['HOTs', unassigned.headsOfTerms?.length || 0],
    ['Vacancies', unassigned.vacancies?.length || 0],
  ]

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Broker Overview</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">HQ, principal, branch and broker visibility across the commercial workspace.</p>
          </div>
          <Link to="/commercial/brokers/assignments" className="inline-flex min-h-10 w-fit items-center rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white">
            Manage assignments
          </Link>
        </div>
      </section>

      {error ? <CommercialEmptyState title="Brokerage data could not be loaded" description={error} /> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total Brokers" value={loading ? '...' : summary.totalBrokers || 0} detail={`${summary.activeBrokers || 0} active`} icon={Users} />
        <SummaryCard label="Unassigned Work" value={loading ? '...' : summary.unassignedWork || 0} detail="Needs principal review" icon={ClipboardList} />
        <SummaryCard label="Active Pipeline" value={loading ? '...' : formatCurrency(summary.activePipeline || 0)} detail={`${summary.activeDeals || 0} active deals`} icon={BriefcaseBusiness} />
        <SummaryCard label="HOTs In Progress" value={loading ? '...' : summary.hotsInProgress || 0} detail="Negotiation workload" icon={Handshake} />
        <SummaryCard label="Broker Activity" value={loading ? '...' : summary.brokerActivity || 0} detail={`${summary.overloadedBrokers || 0} overloaded`} icon={Activity} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <div className={CARD_CLASS}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[#102236]">Broker Performance</h2>
              <p className="mt-1 text-sm text-slate-500">Active commercial work by broker.</p>
            </div>
            <Link to="/commercial/brokers/performance" className="text-sm font-semibold text-blue-600">View performance</Link>
          </div>
          <div className="mt-5 grid gap-3">
            {loading ? <div className="h-20 animate-pulse rounded-2xl bg-slate-100" /> : brokers.slice(0, 6).map((broker) => (
              <Link key={broker.id} to={`/commercial/brokers/${encodeURIComponent(broker.id)}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 md:grid-cols-[minmax(0,1fr)_120px_120px_150px] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#102236]">{broker.name}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{broker.branchName}</p>
                </div>
                <p className="text-sm font-semibold text-[#102236]">{broker.activeTransactions || 0} tx</p>
                <p className="text-sm font-semibold text-[#102236]">{formatCurrency(broker.projectedCommission || 0)}</p>
                <p className="text-sm text-slate-600">{broker.capacityLabel}</p>
              </Link>
            ))}
            {!loading && !brokers.length ? <CommercialEmptyState title="No brokers yet" description="Invite commercial brokers from workspace user settings to start assigning records." /> : null}
          </div>
        </div>

        <div className={CARD_CLASS}>
          <h2 className="text-base font-semibold text-[#102236]">Unassigned Work Queue</h2>
          <p className="mt-1 text-sm text-slate-500">Records that need a broker owner.</p>
          <div className="mt-5 grid gap-3">
            {unassignedRows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3">
                <span className="text-sm font-semibold text-[#102236]">{label}</span>
                <span className="text-sm font-semibold text-slate-500">{loading ? '...' : value}</span>
              </div>
            ))}
          </div>
          <Link to="/commercial/brokers/assignments" className="mt-5 inline-flex min-h-10 items-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-[#102236]">
            Open assignment queue
          </Link>
        </div>
      </section>
    </div>
  )
}

export default CommercialBrokerOverviewPage
