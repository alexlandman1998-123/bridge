import { Building2, MapPin } from 'lucide-react'
import { formatCurrency } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialBrokerageData } from '../services/commercialBrokerageApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

function CommercialBrokerBranchesPage() {
  const { data, loading, error } = useCommercialData(getCommercialBrokerageData, [])
  const rows = data?.branchRows || []

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Branches</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Commercial branch view for HQ, principals, branch managers, and broker distribution.</p>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#123b61]"><Building2 size={18} /></span>
        </div>
      </section>

      {error ? <CommercialEmptyState title="Branches could not be loaded" description={error} /> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? <div className="h-36 animate-pulse rounded-3xl bg-slate-100" /> : rows.map((branch) => (
          <article key={branch.id} className={CARD_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-[#102236]">{branch.name || 'Commercial Branch'}</h2>
                <p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><MapPin size={14} /> {[branch.city, branch.province].filter(Boolean).join(', ') || 'Location pending'}</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{branch.is_active === false ? 'Inactive' : 'Active'}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Brokers</p><p className="mt-1 font-semibold text-[#102236]">{branch.brokers}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Transactions</p><p className="mt-1 font-semibold text-[#102236]">{branch.activeTransactions || 0}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Listings</p><p className="mt-1 font-semibold text-[#102236]">{branch.activeListings || 0}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Vacancies</p><p className="mt-1 font-semibold text-[#102236]">{branch.activeVacancies || 0}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Pipeline</p><p className="mt-1 font-semibold text-[#102236]">{formatCurrency(branch.pipelineValue)}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Revenue</p><p className="mt-1 font-semibold text-[#102236]">{formatCurrency(branch.expectedRevenue || 0)}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Occupancy</p><p className="mt-1 font-semibold text-[#102236]">{Math.round(branch.occupancy || 0)}%</p></div>
            </div>
          </article>
        ))}
      </section>

      {!loading && !rows.length ? <CommercialEmptyState title="No branches found" description="Commercial branches reuse the organisation branch structure from the agency module." /> : null}
    </div>
  )
}

export default CommercialBrokerBranchesPage
