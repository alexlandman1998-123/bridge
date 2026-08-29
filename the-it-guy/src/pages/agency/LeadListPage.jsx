import {
  AlertTriangle,
  ArrowUpRight,
  CheckSquare,
  Clock3,
  Columns3,
  Filter,
  Home,
  MoreHorizontal,
  Plus,
  Search,
  Table2,
  Trash2,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react'
import { createElement, useState } from 'react'

function MetricCard({ label, value, detail, compare, icon, tone }) {
  return (
    <article className="group min-w-0 rounded-[14px] border border-[#e4ebf2] bg-white/90 px-3 py-2.5 shadow-[0_10px_24px_rgba(24,45,68,0.045)] backdrop-blur transition duration-200 hover:border-[#cddbe9]">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{label}</span>
        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] ${tone}`}>{createElement(icon, { size: 14 })}</span>
      </div>
      <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
        <strong className="block text-[1.55rem] font-semibold leading-none tracking-[-0.04em] text-[#102236] tabular-nums">{value}</strong>
        <span className="truncate text-[0.68rem] font-semibold text-[#6f8398]">{compare}</span>
      </div>
      <p className="mt-1 truncate text-[0.74rem] font-medium text-[#667b92]">{detail}</p>
    </article>
  )
}

function stageTone(label = '') {
  const value = String(label || '').toLowerCase()
  if (value.includes('lost') || value.includes('overdue')) return 'border-[#f1cdc8] bg-[#fff5f4] text-[#9f3028]'
  if (value.includes('converted') || value.includes('signed') || value.includes('live')) return 'border-[#cfe8dc] bg-[#effaf3] text-[#26724c]'
  if (value.includes('attention') || value.includes('pending')) return 'border-[#efdcb7] bg-[#fff9ec] text-[#8a641d]'
  return 'border-[#dbe6f1] bg-[#f8fbff] text-[#4d6782]'
}

function LeadSourceBadge({ source = '' }) {
  return <span className="inline-flex rounded-full border border-[#dbe6f1] bg-white px-2.5 py-1 text-[0.7rem] font-semibold text-[#4d6782]">{source || 'Unknown source'}</span>
}

function LeadActions({ row, openMenuId, setOpenMenuId, onArchive, onDelete }) {
  const open = openMenuId === row.id
  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#dbe4ee] bg-white text-[#5b7289]"
        aria-label={`More actions for ${row.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpenMenuId(open ? '' : row.id)}
      >
        <MoreHorizontal size={17} />
      </button>
      {open ? (
        <div className="absolute right-0 z-[90] mt-2 w-52 overflow-hidden rounded-[16px] border border-[#dbe7f2] bg-white py-2 shadow-[0_18px_40px_rgba(18,44,68,0.16)]" role="menu">
          <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-[#29435d] hover:bg-[#f5f9fc]" onClick={() => { setOpenMenuId(''); onArchive(row.id) }} role="menuitem">
            <X className="h-4 w-4" /> Archive Lead
          </button>
          <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-[#b42318] hover:bg-[#fff5f3]" onClick={() => { setOpenMenuId(''); onDelete(row.id) }} role="menuitem">
            <Trash2 className="h-4 w-4" /> Delete Lead
          </button>
        </div>
      ) : null}
    </div>
  )
}

function EmptyLeads({ total, title, category, onAdd }) {
  return (
    <div className="mx-auto max-w-md rounded-[18px] border border-dashed border-slate-200 bg-[#fbfdff] px-6 py-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-[14px] bg-[#edf4fb] text-[#35546c]"><UserRound size={21} /></div>
      <h4 className="mt-4 text-[1rem] font-semibold tracking-[-0.02em] text-slate-900">{total > 0 ? 'No leads match these filters' : `No ${title.toLowerCase()} yet`}</h4>
      <p className="mt-2 text-sm leading-6 text-slate-500">{total > 0 ? 'Clear the search or filters to show the leads already in this pipeline.' : 'Create your first lead to start building the pipeline.'}</p>
      <button type="button" className="mt-5 inline-flex min-h-[38px] items-center justify-center gap-2 rounded-[12px] bg-[#163247] px-4 py-2 text-sm font-semibold text-white" onClick={() => onAdd(category)}>
        <Plus size={15} /> Create Lead
      </button>
    </div>
  )
}

export default function LeadListPage({
  metrics = {},
  filters = {},
  sources = [],
  stages = [],
  agents = [],
  isPrincipal = false,
  category = 'buyer',
  categoryLabel = 'Buyer',
  categoryTitle = 'Buyer Leads',
  categoryCounts = {},
  categoryTabs = [],
  summary = {},
  sellerJourneyMetrics = {},
  operationalSummary = {},
  showDaySummary = {},
  showDayPrompt = '',
  rows = [],
  kanbanColumns = [],
  viewMode = 'table',
  currentPage = 1,
  totalPages = 1,
  visiblePages = [],
  pageStart = 0,
  pageEnd = 0,
  onFiltersChange,
  onResetFilters,
  onCategoryChange,
  onViewModeChange,
  onPageChange,
  onAddLead,
  onLeadIntent,
  onOpenLead,
  onArchiveLead,
  onDeleteLead,
  onMoveLead,
  onOpenShowDayQueue,
  onOpenShowDayLead,
}) {
  const [openMenuId, setOpenMenuId] = useState('')
  const [draggingId, setDraggingId] = useState('')
  const metricCards = [
    { label: 'New Leads', value: metrics.newLeads || 0, detail: `${metrics.newThisWeek || 0} this week`, compare: 'Current pipeline', icon: UserRound, tone: 'text-[#315f8f] bg-[#edf5ff]' },
    { label: 'Need Attention', value: metrics.needAttention || 0, detail: `${metrics.overdue || 0} overdue`, compare: metrics.overdue ? 'Action required' : 'Clear', icon: AlertTriangle, tone: 'text-[#8a641d] bg-[#fff7e8]' },
    { label: 'Follow-Ups Today', value: metrics.followUpsToday || 0, detail: 'Ready for action', compare: 'Operational queue', icon: CheckSquare, tone: 'text-[#405b75] bg-[#f5f8fc]' },
    { label: 'Overdue', value: metrics.overdueTasks || 0, detail: metrics.overdueTasks ? 'Needs attention' : 'No blockers', compare: metrics.overdueTasks ? 'Prioritize first' : 'Healthy', icon: Clock3, tone: 'text-[#9a4038] bg-[#fff5f4]' },
    { label: 'Converted MTD', value: metrics.convertedMtd || 0, detail: `${metrics.active || 0} active`, compare: 'Month to date', icon: TrendingUp, tone: 'text-[#26724c] bg-[#effaf3]' },
  ]

  return (
    <div className="space-y-5" data-testid="agency-lead-list-page">
      <section className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((card) => <MetricCard key={card.label} {...card} />)}
      </section>

      <section className="rounded-[18px] border border-[#dce7f2] bg-white p-4 shadow-[0_12px_30px_rgba(31,54,78,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d91a8]">Show Day Follow-Up Queue</p>
              <h3 className="mt-1 text-lg font-semibold text-[#17334f]">Phone buyers who already viewed, then move onboarding-ready leads forward.</h3>
              <p className="mt-1 text-sm text-[#60758d]">{showDayPrompt || 'Contact show-day visitors while the property is still fresh and capture their next step.'}</p>
            </div>
            <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-sm font-semibold text-[#35546c]" onClick={onOpenShowDayQueue}><Filter size={15} /> Open Show Day Queue</button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {[['Captured', showDaySummary.captured], ['Viewed', showDaySummary.viewed], ['Due', showDaySummary.due], ['Onboarding Ready', showDaySummary.offerReady]].map(([label, value]) => <div key={label} className="rounded-[12px] border border-[#e5edf6] bg-[#fbfdff] px-3 py-2"><p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[#8296aa]">{label}</p><p className="mt-1 text-xl font-semibold text-[#102236]">{value || 0}</p></div>)}
          </div>
          <div className="mt-4 space-y-2">
            {(showDaySummary.queue || []).length ? (showDaySummary.queue || []).slice(0, 4).map((row) => <div key={row.leadId} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#e5edf6] bg-[#fbfdff] px-3 py-3"><div className="min-w-[220px] flex-1"><p className="text-sm font-semibold text-[#203a54]">{row.name}</p><p className="mt-0.5 text-xs text-[#6f849a]">{row.property || 'Linked property pending'} · {row.dueLabel || 'Follow-up timing pending'}</p></div><div className="flex items-center gap-2">{row.overdue ? <span className="rounded-full border border-[#f1cdc8] bg-[#fff5f4] px-2.5 py-1 text-xs font-semibold text-[#9f3028]">Overdue</span> : null}<button type="button" className="rounded-[10px] border border-[#dbe6f1] bg-white px-3 py-2 text-xs font-semibold text-[#35546c]" onClick={() => onOpenShowDayLead(row, 'activity')}>Open Lead</button><button type="button" className="rounded-[10px] bg-[#0f2743] px-3 py-2 text-xs font-semibold text-white" onClick={() => onOpenShowDayLead(row, 'onboarding_otp')}>Open Setup / Offer</button></div></div>) : <div className="rounded-[14px] border border-dashed border-[#d8e4f0] bg-[#fbfdff] p-4 text-sm text-[#6a8098]">No show-day follow-ups are due right now.</div>}
          </div>
      </section>

      <section id="agency-lead-filters" className="min-w-0 rounded-[16px] border border-[#e4ebf2] bg-white/90 p-2.5 shadow-[0_10px_26px_rgba(24,45,68,0.045)] backdrop-blur">
        <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
          <label className="flex min-h-[38px] min-w-0 flex-1 items-center gap-2.5 rounded-[12px] border border-[#dbe6f1] bg-[#f8fbfe] px-3 focus-within:border-[#9db7cf] focus-within:bg-white">
            <Search size={16} className="shrink-0 text-[#7f92a6]" />
            <input className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-[#162334] outline-none placeholder:text-[#97a7b8]" type="search" placeholder="Search leads, clients, listings..." value={filters.search || ''} onChange={(event) => onFiltersChange({ search: event.target.value })} />
          </label>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:flex xl:shrink-0">
            <select className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056]" value={filters.source || 'all'} onChange={(event) => onFiltersChange({ source: event.target.value })}>
              <option value="all">All Sources</option>{sources.map((source) => <option key={source} value={source}>{source}</option>)}
            </select>
            <select className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056]" value={filters.stage || 'all'} onChange={(event) => onFiltersChange({ stage: event.target.value })}>
              <option value="all">All Stages</option>{stages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
            </select>
            {isPrincipal ? (
              <select className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056]" value={filters.agent || 'all'} onChange={(event) => onFiltersChange({ agent: event.target.value })}>
                <option value="all">All Agents</option>{agents.map((agent) => <option key={agent.id || agent.email} value={agent.id || agent.email}>{agent.name}</option>)}
              </select>
            ) : null}
            <select className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056]" value={filters.sort || 'newest'} onChange={(event) => onFiltersChange({ sort: event.target.value })}>
              <option value="newest">Sort: Newest</option><option value="next_follow_up">Sort: Next Follow-up</option><option value="stage">Sort: Stage</option>
            </select>
            <button type="button" className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#405b75]" onClick={onResetFilters}><Filter size={15} /> Reset</button>
          </div>
        </div>
      </section>

      <article className="flex min-h-[680px] min-w-0 flex-col overflow-visible rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white shadow-[0_16px_42px_rgba(15,23,42,0.045)]">
        <header className="border-b border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div><div className="flex items-center gap-2"><h3 className="text-[1.45rem] font-semibold tracking-[-0.04em] text-[#142132]">{categoryTitle}</h3><span className="rounded-full border border-[#dce7f2] bg-[#f8fbff] px-3 py-1 text-sm font-semibold text-[#35546c]">{summary.filtered || 0}</span></div><p className="mt-1.5 text-sm font-medium text-[#60758b]">Track and manage your buyer and seller leads.</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-[14px] border border-[#dbe4ee] bg-[#f6f9fc] p-0.5">
                <button type="button" className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[12px] px-3 text-xs font-semibold ${viewMode === 'table' ? 'bg-white text-[#163247] shadow' : 'text-[#51667f]'}`} onClick={() => onViewModeChange('table')}><Table2 size={13} /> Table</button>
                <button type="button" className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[12px] px-3 text-xs font-semibold ${viewMode === 'kanban' ? 'bg-white text-[#163247] shadow' : 'text-[#51667f]'}`} onClick={() => onViewModeChange('kanban')}><Columns3 size={13} /> Kanban</button>
              </div>
              {category !== 'archived' ? <button type="button" className="inline-flex min-h-[42px] items-center gap-2 rounded-[14px] bg-[#0f2743] px-4 text-sm font-semibold text-white" onClick={() => onAddLead(category)}><Plus size={16} /> Add {categoryLabel} Lead</button> : null}
            </div>
          </div>
          <div className="mt-4 grid gap-2 rounded-[16px] border border-[#dbe4ee] bg-[#f8fbff] p-1.5 sm:grid-cols-3" role="tablist" aria-label="Lead categories">
            {categoryTabs.map((tab) => {
              const active = category === tab.key
              const Icon = tab.key === 'seller' ? Home : tab.key === 'archived' ? X : UserRound
              return <button key={tab.key} type="button" role="tab" aria-selected={active} className={`flex min-h-[48px] items-center justify-between rounded-[12px] px-3 ${active ? 'bg-white text-[#102236] shadow' : 'text-[#51667f]'}`} onClick={() => onCategoryChange(tab.key)}><span className="inline-flex items-center gap-2"><Icon size={15} /> <span className="text-sm font-semibold">{tab.label}</span></span><span className="rounded-full bg-[#edf5ff] px-2.5 py-1 text-xs font-semibold">{categoryCounts[tab.key] || 0}</span></button>
            })}
          </div>
        </header>

        <div className="shrink-0 border-b border-[rgba(15,23,42,0.06)] px-4 py-2 text-[0.78rem] text-[#73879c]">
          {category === 'seller' ? `${sellerJourneyMetrics.sellerLeads || 0} seller leads · ${sellerJourneyMetrics.mandatesSigned || 0} mandates signed · ${sellerJourneyMetrics.listingsLive || 0} listings live` : `${operationalSummary.total || 0} leads · ${operationalSummary.needAttention || 0} need attention · ${operationalSummary.overdue || 0} overdue`}
        </div>

        {viewMode === 'kanban' ? (
          <div className="min-h-0 max-w-full flex-1 overflow-x-auto p-3">
            <div className="flex min-h-[560px] gap-3">
              {kanbanColumns.map((column) => (
                <section key={column.id} className="flex w-[278px] shrink-0 flex-col rounded-[16px] border border-[#dfe8f3] bg-[#f7faff]" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain') || draggingId; if (id) onMoveLead(id, column.id) }}>
                  <div className="border-b border-[#dfe8f3] px-3 py-2.5"><div className="flex items-center justify-between"><h4 className="text-[0.82rem] font-bold uppercase text-[#172b3f]">{column.label}</h4><span className="rounded-full bg-white px-2 py-0.5 text-xs">{column.cards.length}</span></div><p className="mt-1 text-[0.66rem] text-[#71869d]">{column.description}</p></div>
                  <div className="flex-1 space-y-2.5 p-2.5">
                    {column.cards.map((row) => <article key={row.id} draggable className="cursor-grab rounded-[14px] border border-[#dfe8f3] bg-white p-3 shadow-sm" onPointerEnter={onLeadIntent} onPointerDown={onLeadIntent} onFocus={onLeadIntent} onDragStart={(event) => { setDraggingId(row.id); event.dataTransfer.setData('text/plain', row.id) }} onDragEnd={() => setDraggingId('')} onClick={() => onOpenLead(row.id)}><div className="flex items-start justify-between gap-2"><h5 className="truncate font-bold text-[#172b3f]">{row.name}</h5><span className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${stageTone(row.stage)}`}>{row.stage}</span></div><p className="mt-2 line-clamp-2 text-xs text-[#60758b]">{row.propertyTitle}</p><div className="mt-3 flex items-center justify-between text-xs text-[#60758b]"><span>{row.assignedAgent}</span><span>{row.lastActivity}</span></div></article>)}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="hidden overflow-visible lg:block">
              {rows.length ? <table className="w-full table-fixed text-left"><thead className="bg-[#fbfdff] text-[0.68rem] uppercase tracking-[0.08em] text-[#7890a8]"><tr><th className="w-[24%] px-5 py-3">Lead</th><th className="w-[14%] px-4 py-3">Source</th><th className="w-[24%] px-4 py-3">Property</th><th className="w-[17%] px-4 py-3">Stage</th><th className="w-[15%] px-4 py-3">Last Activity</th><th className="w-[6%] px-4 py-3" /></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="cursor-pointer border-t border-[#edf2f7] hover:bg-[#fbfdff]" onPointerEnter={onLeadIntent} onPointerDown={onLeadIntent} onFocus={onLeadIntent} onClick={() => onOpenLead(row.id)}><td className="px-5 py-4"><div className="font-semibold text-[#142132]">{row.name}</div><div className="mt-1 truncate text-xs text-[#60758b]">{row.phone || row.email || 'No contact details'}</div></td><td className="px-4 py-4"><LeadSourceBadge source={row.source} /></td><td className="px-4 py-4"><div className="truncate font-semibold text-[#20364c]">{row.propertyTitle}</div><div className="mt-1 truncate text-xs text-[#60758b]">{row.propertySubtitle}</div></td><td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${stageTone(row.stage)}`}>{row.stage}</span></td><td className="px-4 py-4"><div className="font-semibold text-[#142132]">{row.lastActivity}</div><div className="mt-1 truncate text-xs text-[#60758b]">{row.nextStep}</div></td><td className="px-4 py-4"><LeadActions row={row} openMenuId={openMenuId} setOpenMenuId={setOpenMenuId} onArchive={onArchiveLead} onDelete={onDeleteLead} /></td></tr>)}</tbody></table> : <EmptyLeads total={summary.total || 0} title={categoryTitle} category={category} onAdd={onAddLead} />}
            </div>
            <div className="space-y-3 p-4 lg:hidden">
              {rows.length ? rows.map((row) => <article key={row.id} className="rounded-[18px] border border-[#e1e8f0] bg-white p-4 shadow-sm" onClick={() => onOpenLead(row.id)}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate font-semibold text-[#142132]">{row.name}</h4><p className="mt-1 truncate text-sm text-[#60758b]">{row.phone || row.email || 'No contact details'}</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${stageTone(row.stage)}`}>{row.stage}</span></div><div className="mt-3 flex items-start gap-2 text-sm text-[#60758b]"><Home size={14} className="mt-0.5 shrink-0" /><span><strong className="block text-[#20364c]">{row.propertyTitle}</strong>{row.propertySubtitle}</span></div><div className="mt-3 flex items-center justify-between border-t border-[#edf2f7] pt-3"><span className="text-sm font-semibold text-[#142132]">{row.lastActivity}</span><div className="flex gap-2" onClick={(event) => event.stopPropagation()}><button type="button" className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#0f2743] px-4 text-sm font-semibold text-white" onClick={() => onOpenLead(row.id)}>Open <ArrowUpRight size={14} /></button><LeadActions row={row} openMenuId={openMenuId} setOpenMenuId={setOpenMenuId} onArchive={onArchiveLead} onDelete={onDeleteLead} /></div></div></article>) : <EmptyLeads total={summary.total || 0} title={categoryTitle} category={category} onAdd={onAddLead} />}
            </div>
          </>
        )}

        <footer className="mt-auto border-t border-[rgba(15,23,42,0.06)] bg-[#fcfdff] px-4 py-4 sm:px-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-medium text-[#60758b]">Showing {pageStart} to {pageEnd} of {summary.filtered || 0} leads</p><div className="flex flex-wrap gap-2"><button type="button" className="h-10 rounded-[12px] border border-[#dbe4ee] bg-white px-3 text-sm font-semibold disabled:opacity-45" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>Previous</button>{visiblePages.map((page) => <button key={page} type="button" className={`h-10 w-10 rounded-[12px] border text-sm font-semibold ${page === currentPage ? 'border-[#0f2743] bg-[#0f2743] text-white' : 'border-[#dbe4ee] bg-white text-[#405b75]'}`} onClick={() => onPageChange(page)}>{page}</button>)}<button type="button" className="h-10 rounded-[12px] border border-[#dbe4ee] bg-white px-3 text-sm font-semibold disabled:opacity-45" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>Next</button></div></div></footer>
      </article>
    </div>
  )
}
