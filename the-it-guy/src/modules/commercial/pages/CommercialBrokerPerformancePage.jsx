import { BarChart3 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency, formatDate } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialBrokerageData } from '../services/commercialBrokerageApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

function CommercialBrokerPerformancePage() {
  const [period, setPeriod] = useState('month')
  const [branchId, setBranchId] = useState('')
  const [teamId, setTeamId] = useState('')
  const { data, loading, error } = useCommercialData(getCommercialBrokerageData, [])
  const brokers = useMemo(() => (data?.brokers || []).filter((broker) => {
    if (branchId && broker.branchId !== branchId) return false
    if (teamId && broker.teamId !== teamId) return false
    return true
  }), [branchId, data?.brokers, teamId])
  const branches = data?.branches || []
  const teams = data?.teams || []

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Broker Performance</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Broker workload, active pipeline, HOT movement, leases managed, and recent activity.</p>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#123b61]"><BarChart3 size={18} /></span>
        </div>
      </section>

      {error ? <CommercialEmptyState title="Performance data could not be loaded" description={error} /> : null}

      <section className={`${CARD_CLASS} grid gap-3 md:grid-cols-3`}>
        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Period</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none">
            <option value="month">This month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Branch</span>
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none">
            <option value="">All branches</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Team</span>
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none">
            <option value="">All teams</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
      </section>

      <section className={CARD_CLASS}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {brokers.slice(0, 4).map((broker, index) => (
            <article key={broker.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">#{index + 1}</p>
              <p className="mt-1 truncate text-sm font-semibold text-[#102236]">{broker.name}</p>
              <p className="mt-2 text-base font-semibold text-[#102236]">{formatCurrency(broker.pipelineValue)} Pipeline</p>
            </article>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
              <tr>
                <th className="px-3 py-3">Broker</th>
                <th className="px-3 py-3">Branch</th>
                <th className="px-3 py-3 text-right">Requirements</th>
                <th className="px-3 py-3 text-right">Deals</th>
                <th className="px-3 py-3 text-right">HOTs Sent</th>
                <th className="px-3 py-3 text-right">HOTs Signed</th>
                <th className="px-3 py-3 text-right">Leases</th>
                <th className="px-3 py-3 text-right">Pipeline</th>
                <th className="px-3 py-3 text-right">Commission</th>
                <th className="px-3 py-3 text-right">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="px-3 py-5 text-slate-500" colSpan={10}>Loading broker performance...</td></tr>
              ) : brokers.length ? brokers.map((broker) => (
                <tr key={broker.id} className="align-top hover:bg-slate-50">
                  <td className="px-3 py-3 font-semibold text-[#102236]"><Link to={`/commercial/brokers/${encodeURIComponent(broker.id)}`}>{broker.name}</Link></td>
                  <td className="px-3 py-3 text-slate-600">{broker.branchName}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{broker.activeRequirements}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{broker.activeDeals}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{broker.hotsInProgress}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{broker.hotsSigned || 0}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{broker.leasesManaged}</td>
                  <td className="px-3 py-3 text-right font-semibold text-[#102236]">{formatCurrency(broker.pipelineValue)}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{formatCurrency(broker.commissionValue || 0)}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{formatDate(broker.lastActivityAt)}</td>
                </tr>
              )) : (
                <tr><td className="px-3 py-5 text-slate-500" colSpan={10}>No brokers found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default CommercialBrokerPerformancePage
