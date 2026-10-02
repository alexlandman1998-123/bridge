import { ArrowUpRight, Trophy, Users } from 'lucide-react'

function rankBranchPerformers(agents = []) {
  return agents
    .filter((agent) => Number(agent.transactions) > 0 || Number(agent.listings) > 0)
    .slice()
    .sort((a, b) => Number(b.transactions || 0) - Number(a.transactions || 0)
      || Number(b.listings || 0) - Number(a.listings || 0)
      || String(a.name || '').localeCompare(String(b.name || '')))
    .slice(0, 5)
}

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

export default function BranchTopPerformers({ agents = [], canViewFinancials = false, onOpenAgent }) {
  const performers = rankBranchPerformers(agents)
  return (
    <section aria-labelledby="branch-top-performers" className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="branch-top-performers" className="text-lg font-medium text-[#142132]">Top five performers</h2>
          <p className="mt-1 text-sm text-[#71849a]">Ranked by registered deals, then active listings. Deals follow the selected reporting period.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#edf7f2] px-3 py-1.5 text-xs font-medium text-[#08784b]"><Trophy size={14} /> Branch leaderboard</span>
      </div>
      <div className="mt-5 grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => {
          const agent = performers[index]
          if (!agent) return (
            <div key={`empty-${index}`} className="flex min-h-[250px] flex-col items-center justify-center rounded-[18px] border border-dashed border-[#dfe8f1] bg-[#fbfdff] px-5 py-6 text-center">
              <span className="mb-4 rounded-full bg-[#f0f4f8] p-3 text-[#9aabba]"><Users size={21} /></span>
              <p className="text-sm font-medium text-[#60758b]">Awaiting performance</p>
              <p className="mt-2 max-w-[170px] text-xs leading-5 text-[#8495a7]">Agents appear here when they have active listings or registered deals.</p>
            </div>
          )
          const first = index === 0
          const initials = String(agent.name || 'Agent').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('')
          return (
            <button key={agent.id} type="button" onClick={() => onOpenAgent?.(agent)} aria-label={`View ${agent.name}'s performance`} className={`group flex min-w-0 flex-col rounded-[18px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#08784b] ${first ? 'border-[#c3e0d1] bg-gradient-to-br from-[#edf8f2] to-white' : 'border-[#e3edf5] bg-[#fbfdff] hover:border-[#b8d6c6]'}`}>
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${first ? 'bg-[#08784b] text-white' : 'bg-[#edf2f7] text-[#60758b]'}`}>{first ? <Trophy size={12} /> : null} #{index + 1}</span>
                <ArrowUpRight size={17} className="text-[#8495a7] transition group-hover:text-[#08784b]" />
              </div>
              <div className="mt-5 flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-white bg-[#e5eee9] text-lg font-medium text-[#08784b] shadow-sm">
                {agent.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
              </div>
              <p className="mt-3 break-words text-sm font-medium leading-5 text-[#142132]">{agent.name}</p>
              <p className="mt-1 text-xs text-[#71849a]">{first ? 'Leading the branch' : 'Branch performer'}</p>
              <dl className="mt-auto pt-5">
                <div className="grid grid-cols-2 gap-2 border-t border-[#dfe8e4] pt-3">
                  <div><dt className="text-[11px] text-[#71849a]">Registered deals</dt><dd className="mt-1 text-xl font-medium text-[#08784b]">{agent.transactions ?? '—'}</dd></div>
                  <div><dt className="text-[11px] text-[#71849a]">Active listings</dt><dd className="mt-1 text-xl font-medium text-[#142132]">{agent.listings ?? '—'}</dd></div>
                </div>
                {canViewFinancials ? <div className="mt-3 flex flex-wrap items-center justify-between gap-1 border-t border-[#e3edf5] pt-3"><dt className="text-[11px] text-[#71849a]">Agent commission</dt><dd className="text-xs font-medium text-[#405b75]">{agent.commission == null ? '—' : currency.format(agent.commission)}</dd></div> : null}
              </dl>
            </button>
          )
        })}
      </div>
    </section>
  )
}
