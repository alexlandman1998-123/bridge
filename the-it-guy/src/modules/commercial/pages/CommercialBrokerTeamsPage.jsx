import { Network } from 'lucide-react'
import { formatCurrency } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialBrokerageData } from '../services/commercialBrokerageApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

function CommercialBrokerTeamsPage() {
  const { data, loading, error } = useCommercialData(getCommercialBrokerageData, [])
  const teams = data?.teams || []

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Teams</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Optional commercial team layer beneath branch and above broker.</p>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#123b61]"><Network size={18} /></span>
        </div>
      </section>

      {error ? <CommercialEmptyState title="Teams could not be loaded" description={error} /> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? <div className="h-32 animate-pulse rounded-3xl bg-slate-100" /> : teams.map((team) => (
          <article key={team.id} className={CARD_CLASS}>
            <h2 className="text-base font-semibold text-[#102236]">{team.name}</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Brokers</p><p className="mt-1 font-semibold text-[#102236]">{team.brokers}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Deals</p><p className="mt-1 font-semibold text-[#102236]">{team.activeDeals}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3 md:col-span-2"><p className="text-xs text-slate-400">Pipeline</p><p className="mt-1 font-semibold text-[#102236]">{formatCurrency(team.pipelineValue)}</p></div>
            </div>
          </article>
        ))}
      </section>

      {!loading && !teams.length ? <CommercialEmptyState title="No teams found" description="Teams are optional. Brokers can operate directly under a branch when no team is assigned." /> : null}
    </div>
  )
}

export default CommercialBrokerTeamsPage
