import { ChevronRight, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MobileCard, MobileEmptyState } from '../../components/mobile-shell/MobileShellStates'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getRecentSearches, saveRecentSearch, searchMobile } from '../../services/mobileProductivityService'
import { trackMobileMetric } from '../../services/observability/monitoring'

function mapSearchDestination(to, routePrefix) {
  if (routePrefix === '/mobile-demo') return String(to || '').replace(/^\/mobile(?=\/|$)/, '/mobile-demo')
  return to
}

export default function MobileSearchPage({ routePrefix = '/mobile' }) {
  const workspace = useWorkspace()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState(() => getRecentSearches())
  const results = useMemo(() => searchMobile(query, workspace), [query, workspace])

  function openResult(item) {
    const destinationRoute = mapSearchDestination(item.to, routePrefix)
    const nextRecents = saveRecentSearch(query || item.title)
    setRecentSearches(nextRecents)
    void trackMobileMetric('search_used', {
      route: `${routePrefix}/search`,
      metadata: { query: query || item.title, resultType: item.type, destinationRoute },
    })
    navigate(destinationRoute)
  }

  function handleRecentSearch(value) {
    setQuery(value)
    void trackMobileMetric('search_used', {
      route: `${routePrefix}/search`,
      metadata: { query: value, source: 'recent' },
    })
  }

  return (
    <div className="space-y-5" data-phase5-mobile-search>
      <section className="rounded-[30px] bg-[#10243a] p-5 text-white shadow-[0_20px_46px_rgba(15,23,42,0.18)]">
        <p className="text-[11px] font-semibold uppercase text-[#9fe0bd]">Universal Mobile Search</p>
        <h1 className="mt-2 text-[32px] font-semibold text-white">Search</h1>
        <p className="mt-2 text-sm leading-6 text-[#dce8f2]">Find transactions, matters, applications, deals, clients and properties instantly.</p>
      </section>

      <div className="flex min-h-14 items-center gap-2 rounded-2xl border border-[#d7e0ea] bg-white px-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
        <Search className="h-5 w-5 shrink-0 text-[#60758d]" />
        <input
          className="min-h-11 flex-1 bg-transparent text-sm font-semibold text-[#10243a] outline-none"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search mobile workspace"
          autoFocus
        />
        {query ? (
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f1f5f9] text-[#60758d]" onClick={() => setQuery('')} aria-label="Clear search">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {recentSearches.length ? (
        <section>
          <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Recent Searches</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recentSearches.map((item) => (
              <button key={item} type="button" className="min-h-11 shrink-0 rounded-2xl bg-white px-4 text-sm font-semibold text-[#60758d]" onClick={() => handleRecentSearch(item)}>
                {item}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        {results.length ? results.map((item) => (
          <button key={item.id} type="button" className="block min-h-[74px] w-full rounded-[22px] border border-[#e4ebf2] bg-white p-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.06)]" onClick={() => openResult(item)}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#e8f6ef] text-[#1f7a5a]">
                <Search className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#10243a]">{item.title}</span>
                <span className="mt-1 block text-xs text-[#60758d]">{item.type} · {item.description}</span>
              </span>
              <ChevronRight className="h-5 w-5 text-[#94a3b8]" />
            </div>
          </button>
        )) : <MobileEmptyState title="No results found." body="Try a person, property, transaction or status." />}
      </section>

      <MobileCard className="bg-[#10243a] text-white">
        <p className="text-[11px] font-semibold uppercase text-[#9fe0bd]">Search Scope</p>
        <p className="mt-2 text-sm leading-6 text-[#dce8f2]">Results are scoped to the active role so agents, attorneys, originators and commercial users see the objects they work with daily.</p>
      </MobileCard>
    </div>
  )
}
