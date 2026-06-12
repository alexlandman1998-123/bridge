import { ArrowLeft, Mail, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialBrokerageData } from '../services/commercialBrokerageApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

function Metric({ label, value }) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#102236]">{value}</p>
    </article>
  )
}

function BrokerCard({ broker }) {
  return (
    <Link to={`/commercial/brokers/${encodeURIComponent(broker.id)}`} className={`${CARD_CLASS} block transition hover:border-[#cfe0ef] hover:shadow-[0_18px_38px_rgba(15,23,42,0.07)]`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-[#102236]">{broker.name}</h2>
          <p className="mt-1 truncate text-sm text-slate-500">{broker.branchName}</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{titleize(broker.status)}</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Metric label="Requirements" value={broker.activeRequirements} />
        <Metric label="Listings" value={broker.activeListings} />
        <Metric label="Deals" value={broker.activeDeals} />
        <Metric label="Transactions" value={broker.activeTransactions || 0} />
        <Metric label="HOTs" value={broker.hotsInProgress} />
        <Metric label="Expected Comm." value={formatCurrency(broker.projectedCommission || 0)} />
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-sm font-semibold text-slate-500">Pipeline</span>
        <span className="text-sm font-semibold text-[#102236]">{formatCurrency(broker.pipelineValue)}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">{broker.capacityLabel} capacity · Last activity {formatDate(broker.lastActivityAt)}</p>
    </Link>
  )
}

function RecordList({ title, rows = [], getTitle, getMeta }) {
  return (
    <section className={CARD_CLASS}>
      <h2 className="text-base font-semibold text-[#102236]">{title}</h2>
      <div className="mt-4 grid gap-2">
        {rows.length ? rows.slice(0, 6).map((row) => (
          <article key={row.id} className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3">
            <p className="text-sm font-semibold text-[#102236]">{getTitle(row)}</p>
            <p className="mt-1 text-xs text-slate-500">{getMeta(row)}</p>
          </article>
        )) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No assigned records.</p>
        )}
      </div>
    </section>
  )
}

function BrokerProfile({ data, brokerId }) {
  const broker = (data?.brokers || []).find((row) => String(row.id) === String(brokerId))
  if (!broker) {
    return <CommercialEmptyState title="Broker not found" description="This broker is not available in the current commercial workspace scope." />
  }

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <Link to="/commercial/brokers" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600"><ArrowLeft size={15} /> Brokers</Link>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{broker.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{titleize(broker.role)} · {broker.branchName}</p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500"><Mail size={15} /> {broker.email || 'No email captured'}</p>
          </div>
          <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{titleize(broker.status)}</span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-8">
        <Metric label="Requirements" value={broker.activeRequirements} />
        <Metric label="Listings" value={broker.activeListings} />
        <Metric label="Deals" value={broker.activeDeals} />
        <Metric label="Transactions" value={broker.activeTransactions || 0} />
        <Metric label="Vacancies" value={broker.vacanciesManaged} />
        <Metric label="Viewings" value={broker.viewingsCompleted || 0} />
        <Metric label="Expected Comm." value={formatCurrency(broker.projectedCommission || 0)} />
        <Metric label="Capacity" value={broker.capacityLabel} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <RecordList title="Assigned Requirements" rows={broker.requirements} getTitle={(row) => row.requirement_name || 'Requirement'} getMeta={(row) => `${titleize(row.stage)} · ${formatNumber(row.min_size_m2, 'm²')} - ${formatNumber(row.max_size_m2, 'm²')}`} />
        <RecordList title="Assigned Listings" rows={broker.listings} getTitle={(row) => row.title || 'Listing'} getMeta={(row) => `${titleize(row.listing_status)} · ${titleize(row.listing_category)} · ${formatCurrency(row.pricing)}`} />
        <RecordList title="Assigned Deals" rows={broker.deals} getTitle={(row) => row.deal_name || 'Deal'} getMeta={(row) => `${titleize(row.stage)} · ${formatCurrency(row.deal_value)}`} />
        <RecordList title="Transactions & Viewings" rows={[...broker.transactions, ...broker.viewings]} getTitle={(row) => row.transaction_name || row.viewing_date || row.id || 'Commercial workflow'} getMeta={(row) => `${titleize(row.status)} · ${formatDate(row.updated_at || row.created_at || row.viewing_date)}`} />
        <RecordList title="Assigned Properties / Vacancies" rows={[...broker.properties, ...broker.vacancies]} getTitle={(row) => row.property_name || row.vacancy_name || 'Commercial stock'} getMeta={(row) => row.available_area_m2 ? `${formatNumber(row.available_area_m2, 'm²')} available` : titleize(row.status)} />
        <RecordList title="HOTs and Leases" rows={[...broker.headsOfTerms, ...broker.leases]} getTitle={(row) => row.premises_description || row.id || 'Commercial record'} getMeta={(row) => `${titleize(row.status)} · ${formatDate(row.updated_at || row.created_at || row.lease_end_date)}`} />
      </section>
    </div>
  )
}

function CommercialBrokersPage() {
  const { brokerId } = useParams()
  const { data, loading, error } = useCommercialData(getCommercialBrokerageData, [])
  const brokers = data?.brokers || []

  if (brokerId) return <BrokerProfile data={data} brokerId={brokerId} />

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Brokers</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Commercial broker directory with branch, workload, pipeline, and activity context.</p>
          </div>
          <Link to="/settings/users" className="inline-flex min-h-10 w-fit items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-[#102236]">
            <Users size={16} /> Manage users
          </Link>
        </div>
      </section>

      {error ? <CommercialEmptyState title="Brokers could not be loaded" description={error} /> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total Brokers" value={loading ? '...' : brokers.length} />
        <Metric label="Active Deals" value={loading ? '...' : brokers.reduce((sum, row) => sum + row.activeDeals, 0)} />
        <Metric label="Active Transactions" value={loading ? '...' : brokers.reduce((sum, row) => sum + (row.activeTransactions || 0), 0)} />
        <Metric label="Active Listings" value={loading ? '...' : brokers.reduce((sum, row) => sum + row.activeListings, 0)} />
        <Metric label="Leases Managed" value={loading ? '...' : brokers.reduce((sum, row) => sum + row.leasesManaged, 0)} />
        <Metric label="Pipeline Value" value={loading ? '...' : formatCurrency(brokers.reduce((sum, row) => sum + row.pipelineValue, 0))} />
        <Metric label="Projected Comm." value={loading ? '...' : formatCurrency(brokers.reduce((sum, row) => sum + (row.projectedCommission || 0), 0))} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {loading ? <div className="h-40 animate-pulse rounded-3xl bg-slate-100" /> : brokers.map((broker) => <BrokerCard key={broker.id} broker={broker} />)}
      </section>

      {!loading && !brokers.length ? <CommercialEmptyState title="No commercial brokers found" description="Add brokers to the organisation user list, then assign requirements, deals, HOTs, vacancies, and leases." /> : null}
    </div>
  )
}

export default CommercialBrokersPage
