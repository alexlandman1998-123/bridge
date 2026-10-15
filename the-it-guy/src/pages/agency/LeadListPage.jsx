import {
  ArrowUpRight,
  Building2,
  Clock3,
  Columns3,
  Filter,
  Home,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Trash2,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react'
import { createElement, useState } from 'react'

function MetricCard({ label, value, detail, compare, icon, tone, neutral = false }) {
  return (
    <article className={`group min-w-0 rounded-[14px] px-3 py-2.5 transition duration-200 ${neutral ? 'border border-zinc-200 bg-white shadow-sm hover:border-zinc-300 [&_strong]:text-zinc-900 [&_p]:text-zinc-500 [&_span]:text-zinc-500' : 'border border-[#e4ebf2] bg-white/90 shadow-[0_10px_24px_rgba(24,45,68,0.045)] backdrop-blur hover:border-[#cddbe9]'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{label}</span>
        <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[10px] ${neutral ? 'bg-zinc-100 text-zinc-500' : tone}`}>{createElement(icon, { size: 14 })}</span>
      </div>
      <div className="mt-1 flex min-w-0 items-end justify-between gap-3">
        <strong title={String(value)} className="block min-w-0 truncate text-[1.35rem] font-semibold leading-none sm:text-[1.55rem] tracking-[-0.04em] text-[#102236] tabular-nums">{value}</strong>
        <span className="hidden truncate text-[0.68rem] font-semibold text-[#6f8398] sm:block">{compare}</span>
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

function normalizedSource(source = '') {
  return String(source || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function LeadSourceBrand({ source = '', compact = false }) {
  const sourceKey = normalizedSource(source)
  const asset = sourceKey.includes('property24')
    ? { src: '/lead-sources/property24.png', alt: 'Property24' }
    : sourceKey.includes('privateproperty')
      ? { src: '/lead-sources/private-property.jpeg', alt: 'Private Property' }
      : null

  return asset ? (
    <img src={asset.src} alt={asset.alt} className={compact ? 'max-h-4 max-w-[86px] object-contain object-left' : 'max-h-7 max-w-[110px] object-contain object-left'} />
  ) : <span className={compact ? 'block truncate text-[0.68rem] font-medium text-zinc-600' : 'text-[0.8rem] font-semibold text-[#4d6782]'}>{source || 'Unknown source'}</span>
}

function initialsOf(name = '') {
  return String(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join('')
}

function KanbanCover({ row }) {
  const [failed, setFailed] = useState(false)
  return row.propertyImageUrl && !failed ? (
    <img src={row.propertyImageUrl} alt={row.propertyTitle} draggable={false} loading="lazy" decoding="async" className="h-[104px] w-full border-b border-zinc-100 object-cover" onError={() => setFailed(true)} />
  ) : (
    <div className="flex h-12 items-center gap-2.5 border-b border-zinc-100 bg-zinc-50 px-3.5" aria-label="Lead initials">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white text-[0.68rem] font-semibold text-zinc-600">{initialsOf(row.name) || <UserRound size={14} />}</span>
      <span className="text-[0.65rem] font-medium uppercase tracking-[0.1em] text-zinc-400">Lead</span>
    </div>
  )
}

function followUpPresentation(value) {
  if (!value) return { label: '', tone: 'neutral' }
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
  const due = dateOnly ? new Date(...String(value).split('-').map((part, index) => Number(part) - (index === 1 ? 1 : 0))) : new Date(value)
  if (!Number.isFinite(due.getTime())) return { label: '', tone: 'neutral' }
  const now = new Date()
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const overdue = dateOnly ? due.toDateString() !== now.toDateString() && due < now : due < now
  const day = due.toDateString() === now.toDateString() ? 'Today' : due.toDateString() === tomorrow.toDateString() ? 'Tomorrow' : due.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', ...(due.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
  const time = dateOnly ? '' : `, ${due.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })}`
  return { label: `${overdue ? 'Overdue · ' : ''}${day}${time}`, tone: overdue ? 'overdue' : due.toDateString() === now.toDateString() ? 'due' : 'neutral' }
}

function KanbanLeadCard({ row, showSellerPhone, dragging, onLeadIntent, onOpenLead, onDragStart, onDragEnd }) {
  const followUp = followUpPresentation(row.nextStepDueDate)
  const followUpTone = followUp.tone === 'overdue' ? 'border-red-100 bg-red-50 text-red-700' : followUp.tone === 'due' ? 'border-amber-100 bg-amber-50 text-amber-800' : 'border-zinc-100 bg-zinc-50 text-zinc-600'
  const assigned = row.assignedAgent && row.assignedAgent !== 'Unassigned'
  const propertyMeta = [
    row.propertySubtitle !== 'Property details pending' ? row.propertySubtitle : '',
    row.unitLabel ? (/^unit\b/i.test(row.unitLabel) ? row.unitLabel : `Unit ${row.unitLabel}`) : '',
  ].filter(Boolean).join(' · ')
  return (
    <article draggable tabIndex={0} role="button" aria-label={`Open lead ${row.name}`} className={`group cursor-grab overflow-hidden rounded-[12px] border border-zinc-200 bg-white shadow-[0_2px_5px_rgba(0,0,0,0.025)] transition duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_6px_14px_rgba(0,0,0,0.07)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 active:cursor-grabbing motion-reduce:transform-none ${dragging ? 'opacity-50' : ''}`} onPointerEnter={() => onLeadIntent?.(row.id)} onPointerDown={() => onLeadIntent?.(row.id)} onFocus={() => onLeadIntent?.(row.id)} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={() => onOpenLead(row.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenLead(row.id) } }}>
      <KanbanCover key={row.propertyImageUrl || 'initials'} row={row} />
      <div className="px-3.5 pb-3.5 pt-3">
        <h5 className="line-clamp-2 text-[0.96rem] font-semibold leading-5 tracking-[-0.02em] text-zinc-900">{row.name}</h5>
        {showSellerPhone ? <p className="mt-1 text-[0.76rem] leading-5 text-zinc-600">{row.phone || 'No phone number yet'}</p> : null}
        <p className="mt-1.5 line-clamp-2 text-[0.76rem] leading-5 text-zinc-600">{row.propertyTitle}</p>
        {propertyMeta ? <p className="mt-0.5 line-clamp-1 text-[0.68rem] text-zinc-400">{propertyMeta}</p> : null}
        <div className={`mt-3 flex items-start gap-2 rounded-lg border px-2.5 py-2 ${followUpTone}`}>
          <Clock3 size={13} className="mt-0.5 shrink-0" />
          <div className="min-w-0"><p className="line-clamp-2 text-[0.7rem] font-medium leading-4 text-inherit">{row.nextStep || 'No follow-up scheduled'}</p>{followUp.label ? <p className="mt-0.5 text-[0.65rem] leading-4 text-inherit">{followUp.label}</p> : null}</div>
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2 border-t border-zinc-100 px-3.5 py-2.5">
        <span className="min-w-0 rounded-md border border-zinc-100 bg-white px-1.5 py-1" title={row.source}><LeadSourceBrand source={row.source} compact /></span>
        <div className="flex shrink-0 items-center gap-1.5"><span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-[0.6rem] font-semibold text-zinc-600" title={row.assignedAgent || 'Unassigned'} aria-label={`Assigned agent: ${row.assignedAgent || 'Unassigned'}`}>{assigned ? initialsOf(row.assignedAgent) : <UserRound size={12} />}</span><span className="text-[0.65rem] text-zinc-400" title="Last activity">{row.lastActivity}</span></div>
      </div>
    </article>
  )
}

export function PropertyThumbnail({ row }) {
  const [failed, setFailed] = useState(false)
  const imageUrl = row.propertyImageUrl
  return imageUrl && !failed ? (
    <img src={imageUrl} alt="" className="h-12 w-[72px] shrink-0 rounded-lg object-cover" loading="lazy" onError={() => setFailed(true)} />
  ) : (
    <span className="inline-flex h-12 w-[72px] shrink-0 items-center justify-center rounded-lg bg-[#edf4fa] text-[#66819a]" aria-label="Property image unavailable"><Home size={18} /></span>
  )
}

export function StagePill({ stage = '' }) {
  const value = String(stage).toLowerCase()
  const dot = value.includes('lost') || value.includes('overdue') ? 'bg-[#c74b43]' : value.includes('converted') || value.includes('signed') || value.includes('live') || value.includes('qualified') ? 'bg-[#21a365]' : value.includes('attention') || value.includes('pending') ? 'bg-[#c6902d]' : 'bg-[#3978d6]'
  return <span className={`inline-flex h-[30px] items-center gap-2 rounded-full border px-3 text-xs font-medium ${stageTone(stage)}`}><span className={`h-2 w-2 rounded-full ${dot}`} />{stage}</span>
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
  rows = [],
  kanbanColumns = [],
  viewMode = 'table',
  refreshing = false,
  currentPage = 1,
  totalPages = 1,
  visiblePages = [],
  pageStart = 0,
  pageEnd = 0,
  onFiltersChange,
  onResetFilters,
  onCategoryChange,
  onViewModeChange,
  onRefresh,
  onPageChange,
  onAddLead,
  onLeadIntent,
  onOpenLead,
  onArchiveLead,
  onDeleteLead,
  onMoveLead,
}) {
  const [openMenuId, setOpenMenuId] = useState('')
  const [draggingId, setDraggingId] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const isKanban = viewMode === 'kanban'
  const activeFilterCount = ['source', 'stage', ...(isPrincipal ? ['agent'] : [])]
    .filter((key) => filters[key] && filters[key] !== 'all').length
  const metricCards = [
    { label: 'New Leads', value: metrics.newLeads || 0, detail: `${metrics.totalActive || 0} active leads`, compare: 'Awaiting progress', icon: UserRound, tone: 'text-[#315f8f] bg-[#edf5ff]' },
    { label: 'Converted MTD', value: metrics.convertedMtd || 0, detail: `${metrics.buyerConvertedMtd || 0} transactions · ${metrics.sellerMandatesMtd || 0} mandates`, compare: 'Month to date', icon: TrendingUp, tone: 'text-[#26724c] bg-[#effaf3]' },
    { label: 'Top Source', value: metrics.topSource || 'No source data', detail: `${metrics.topSourceCount || 0} leads`, compare: 'All captured leads', icon: ArrowUpRight, tone: 'text-[#405b75] bg-[#f5f8fc]' },
    { label: 'Lost Rate', value: `${metrics.lostRate || 0}%`, detail: `${metrics.lostLeads || 0} archived or lost`, compare: `${metrics.totalLeads || 0} total leads`, icon: Trash2, tone: 'text-[#9a4038] bg-[#fff5f4]' },
  ]

  return (
    <div className="flex flex-col gap-3" data-testid="agency-lead-list-page">
      <section className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Lead summary">
        {metricCards.map((card) => <MetricCard key={card.label} {...card} neutral={isKanban} />)}
      </section>

      <article className="flex min-w-0 flex-col overflow-visible rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white shadow-[0_16px_42px_rgba(15,23,42,0.045)]">
        <header className={`border-b border-[rgba(15,23,42,0.06)] px-4 py-3 sm:px-5 sm:py-4 ${isKanban ? 'bg-white' : 'bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)]'}`}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-center gap-2"><h3 className="text-[1.45rem] font-semibold tracking-[-0.04em] text-[#142132]">{categoryTitle}</h3><span className="rounded-full border border-[#dce7f2] bg-[#f8fbff] px-3 py-1 text-sm font-semibold text-[#35546c]">{summary.filtered || 0}</span></div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-[14px] border border-[#dbe4ee] bg-[#f6f9fc] p-0.5" role="group" aria-label="Preferred lead view">
                <button type="button" aria-pressed={viewMode === 'table'} className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[12px] px-3 text-xs font-semibold ${viewMode === 'table' ? 'bg-white text-[#163247] shadow' : 'text-[#51667f]'}`} onClick={() => onViewModeChange('table')}><Table2 size={13} /> Table</button>
                <button type="button" aria-pressed={viewMode === 'kanban'} className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[12px] px-3 text-xs font-semibold ${viewMode === 'kanban' ? 'bg-white text-[#163247] shadow' : 'text-[#51667f]'}`} onClick={() => onViewModeChange('kanban')}><Columns3 size={13} /> Kanban</button>
              </div>
              {onRefresh ? <button type="button" aria-label="Refresh" disabled={refreshing} className="inline-flex min-h-[42px] items-center gap-2 rounded-[14px] border border-[#dbe4ee] bg-white px-4 text-sm font-semibold text-[#405b75] disabled:opacity-60" onClick={onRefresh}><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /><span className="hidden sm:inline">Refresh</span></button> : null}
              {category !== 'archived' ? <button type="button" aria-label={`Add ${categoryLabel} Lead`} className="inline-flex min-h-[42px] items-center gap-2 rounded-[14px] bg-[#0f2743] px-4 text-sm font-semibold text-white" onClick={() => onAddLead(category)}><Plus size={16} /><span className="sm:hidden">Add Lead</span><span className="hidden sm:inline">Add {categoryLabel} Lead</span></button> : null}
            </div>
          </div>
          <div className={`mt-3 grid grid-cols-2 gap-1 rounded-xl border p-1 sm:grid-cols-4 ${isKanban ? 'border-zinc-200 bg-zinc-50' : 'border-[#dbe4ee] bg-[#f8fbff]'}`} role="tablist" aria-label="Lead categories">
            {categoryTabs.map((tab) => {
              const active = category === tab.key
              const Icon = tab.key === 'seller' ? Home : tab.key === 'development' ? Building2 : tab.key === 'archived' ? X : UserRound
              return <button key={tab.key} type="button" role="tab" aria-label={`${tab.label} ${categoryCounts[tab.key] || 0}`} aria-selected={active} className={`flex min-h-[42px] min-w-0 items-center justify-between gap-1 rounded-[12px] px-2 sm:px-3 ${active ? 'bg-white text-[#102236] shadow' : 'text-[#51667f]'}`} onClick={() => onCategoryChange(tab.key)}><span className="inline-flex min-w-0 items-center gap-1.5"><Icon size={15} className="hidden shrink-0 sm:block" /> <span className="truncate text-xs font-semibold sm:text-sm"><span className="sm:hidden">{tab.label.replace(/\s+Leads$/, '')}</span><span className="hidden sm:inline">{tab.label}</span></span></span><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${isKanban ? 'bg-zinc-100 text-zinc-600' : 'bg-[#edf5ff]'}`}>{categoryCounts[tab.key] || 0}</span></button>
            })}
          </div>
        </header>

        <div className="flex shrink-0 flex-col gap-3 border-b border-[rgba(15,23,42,0.06)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.78rem] text-[#73879c]">{category === 'seller' ? `${sellerJourneyMetrics.sellerLeads || 0} seller leads · ${sellerJourneyMetrics.mandatesSigned || 0} mandates signed · ${sellerJourneyMetrics.listingsLive || 0} listings live` : `${operationalSummary.total || 0} leads · ${operationalSummary.needAttention || 0} need attention · ${operationalSummary.overdue || 0} overdue`}</p>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-[#dbe6f1] bg-white px-3 focus-within:border-[#9db7cf] sm:w-[300px]">
              <Search size={16} className="shrink-0 text-[#7f92a6]" />
              <input className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-[#162334] outline-none placeholder:text-[#97a7b8]" type="search" placeholder="Search leads, addresses or names..." value={filters.search || ''} onChange={(event) => onFiltersChange({ search: event.target.value })} />
            </label>
            <button type="button" aria-expanded={filtersOpen} aria-controls="agency-lead-filters" className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[#dbe6f1] bg-white px-3 text-xs font-semibold text-[#405b75]" onClick={() => setFiltersOpen((open) => !open)}><Filter size={15} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</button>
          </div>
        </div>

        {filtersOpen ? (
          <section id="agency-lead-filters" className="min-w-0 border-b border-[#e4ebf2] bg-[#fbfdff] p-3">
            <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
              <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:ml-auto xl:flex xl:shrink-0">
                <select className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056]" aria-label="Filter by source" value={filters.source || 'all'} onChange={(event) => onFiltersChange({ source: event.target.value })}>
                  <option value="all">All Sources</option>{sources.map((source) => <option key={source} value={source}>{source}</option>)}
                </select>
                <select className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056]" aria-label="Filter by stage" value={filters.stage || 'all'} onChange={(event) => onFiltersChange({ stage: event.target.value })}>
                  <option value="all">All Stages</option>{stages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
                </select>
                {isPrincipal ? (
                  <select className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056]" aria-label="Filter by agent" value={filters.agent || 'all'} onChange={(event) => onFiltersChange({ agent: event.target.value })}>
                    <option value="all">All Agents</option>{agents.map((agent) => <option key={agent.id || agent.email} value={agent.id || agent.email}>{agent.name}</option>)}
                  </select>
                ) : null}
                <select className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056]" aria-label="Sort leads" value={filters.sort || 'newest'} onChange={(event) => onFiltersChange({ sort: event.target.value })}>
                  <option value="newest">Sort: Newest</option><option value="next_follow_up">Sort: Next Follow-up</option><option value="stage">Sort: Stage</option>
                </select>
                <button type="button" className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#405b75]" onClick={onResetFilters}><Filter size={15} /> Reset</button>
              </div>
            </div>
          </section>
        ) : null}

        {viewMode === 'kanban' ? (
          <div className="min-h-0 max-w-full flex-1 snap-x snap-proximity overflow-x-auto rounded-b-[18px] bg-white p-3">
            {category !== 'archived' ? (
              <div className="sticky left-0 mb-3 flex w-fit items-center">
                <button type="button" className="inline-flex min-h-[38px] items-center gap-2 rounded-[12px] border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50" onClick={() => onAddLead(category)}>
                  <Plus size={15} /> Create {categoryLabel} Lead
                </button>
              </div>
            ) : null}
            <div className="flex min-h-[560px] gap-3">
              {kanbanColumns.map((column) => (
                <section key={column.id} aria-label={column.label} className="flex w-[310px] shrink-0 snap-start flex-col rounded-[14px] border border-zinc-200 bg-[#f6f6f5]" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain') || draggingId; if (id) onMoveLead(id, column.id) }}>
                  <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-zinc-200 px-3.5 py-3"><h4 className="text-[0.8rem] font-semibold leading-5 text-zinc-700">{column.label}</h4><span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white px-1.5 text-[0.68rem] font-medium tabular-nums text-zinc-500">{column.cards.length}</span></div>
                  <div className="flex-1 space-y-3 p-2.5">
                    {column.cards.map((row) => <KanbanLeadCard key={row.id} row={row} showSellerPhone={category === 'seller'} dragging={draggingId === row.id} onLeadIntent={onLeadIntent} onOpenLead={onOpenLead} onDragStart={(event) => { setDraggingId(row.id); event.dataTransfer.setData('text/plain', row.id) }} onDragEnd={() => setDraggingId('')} />)}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="hidden overflow-visible lg:block">
              {rows.length ? <table className="w-full table-fixed text-left"><thead className="h-11 bg-[#fbfdff] text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-[#7890a8]"><tr><th className="w-[25%] px-5 py-3">Property</th><th className="w-[18%] px-4 py-3">Lead</th><th className="w-[14%] px-4 py-3">Source</th><th className="w-[17%] px-4 py-3">Stage</th><th className="w-[20%] px-4 py-3">Last Activity</th><th className="w-[6%] px-4 py-3">Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} tabIndex={0} className="cursor-pointer border-t border-[#edf2f7] transition-colors duration-150 hover:bg-[#f8fbfe]" onPointerEnter={() => onLeadIntent(row.id)} onPointerDown={() => onLeadIntent(row.id)} onFocus={() => onLeadIntent(row.id)} onClick={() => onOpenLead(row.id)}><td className="px-5 py-3"><div className="flex min-w-0 items-center gap-3"><PropertyThumbnail row={row} /><div className="min-w-0"><div className="truncate text-sm font-semibold text-[#142132]">{row.propertyTitle}</div><div className="mt-1 truncate text-xs text-[#60758b]">{row.propertySubtitle}</div></div></div></td><td className="px-4 py-3"><div className="truncate text-sm font-semibold text-[#142132]">{row.name}</div><div className="mt-1 truncate text-xs text-[#60758b]">{row.phone || row.email || 'No contact details'}</div></td><td className="px-4 py-3"><LeadSourceBrand source={row.source} /></td><td className="px-4 py-3"><StagePill stage={row.stage} /></td><td className="px-4 py-3"><div className="text-sm font-semibold text-[#142132]">{row.lastActivity}</div><div className="mt-1 truncate text-xs text-[#60758b]">{row.nextStep}</div></td><td className="px-4 py-3"><LeadActions row={row} openMenuId={openMenuId} setOpenMenuId={setOpenMenuId} onArchive={onArchiveLead} onDelete={onDeleteLead} /></td></tr>)}</tbody></table> : <EmptyLeads total={summary.total || 0} title={categoryTitle} category={category} onAdd={onAddLead} />}
            </div>
            <div className="space-y-3 p-4 lg:hidden">
              {rows.length ? rows.map((row) => <article key={row.id} tabIndex={0} className="rounded-[18px] border border-[#e1e8f0] bg-white p-4 shadow-sm" onPointerEnter={() => onLeadIntent(row.id)} onPointerDown={() => onLeadIntent(row.id)} onFocus={() => onLeadIntent(row.id)} onClick={() => onOpenLead(row.id)}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate font-semibold text-[#142132]">{row.name}</h4><p className="mt-1 truncate text-sm text-[#60758b]">{row.phone || row.email || 'No contact details'}</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${stageTone(row.stage)}`}>{row.stage}</span></div><div className="mt-3 flex items-start gap-2 text-sm text-[#60758b]"><Home size={14} className="mt-0.5 shrink-0" /><span><strong className="block text-[#20364c]">{row.propertyTitle}</strong>{row.propertySubtitle}</span></div><div className="mt-3 flex items-center justify-between border-t border-[#edf2f7] pt-3"><span className="text-sm font-semibold text-[#142132]">{row.lastActivity}</span><div className="flex gap-2" onClick={(event) => event.stopPropagation()}><button type="button" className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#0f2743] px-4 text-sm font-semibold text-white" onClick={() => onOpenLead(row.id)}>Open <ArrowUpRight size={14} /></button><LeadActions row={row} openMenuId={openMenuId} setOpenMenuId={setOpenMenuId} onArchive={onArchiveLead} onDelete={onDeleteLead} /></div></div></article>) : <EmptyLeads total={summary.total || 0} title={categoryTitle} category={category} onAdd={onAddLead} />}
            </div>
          </>
        )}

        <footer className="mt-auto border-t border-[rgba(15,23,42,0.06)] bg-[#fcfdff] px-4 py-4 sm:px-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-medium text-[#60758b]">Showing {pageStart} to {pageEnd} of {summary.filtered || 0} leads</p><div className="flex flex-wrap gap-2"><button type="button" className="h-10 rounded-[12px] border border-[#dbe4ee] bg-white px-3 text-sm font-semibold disabled:opacity-45" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>Previous</button>{visiblePages.map((page) => <button key={page} type="button" className={`h-10 w-10 rounded-[12px] border text-sm font-semibold ${page === currentPage ? 'border-[#0f2743] bg-[#0f2743] text-white' : 'border-[#dbe4ee] bg-white text-[#405b75]'}`} onClick={() => onPageChange(page)}>{page}</button>)}<button type="button" className="h-10 rounded-[12px] border border-[#dbe4ee] bg-white px-3 text-sm font-semibold disabled:opacity-45" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>Next</button></div></div></footer>
      </article>
    </div>
  )
}
