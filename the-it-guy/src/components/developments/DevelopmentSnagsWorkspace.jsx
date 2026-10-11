import { createElement, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, CalendarDays, CheckCircle2, ClipboardCheck, Clock3, Home, RefreshCw, Search, UserRound, Wrench } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { fetchDevelopmentSnagSubmissions } from '../../services/developmentSnagsService.js'
import { getSnagCountdown, groupDevelopmentSnags, isSnagResolved } from '../../core/developments/developmentSnags.js'

const SNAG_PERIOD_DAYS = 90
const formatDate = value => {
  if (!value) return 'Not recorded'
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}
const unitName = group => group.unit?.unit_number ? `Unit ${group.unit.unit_number}` : 'Unit not recorded'

function Countdown({ value }) {
  const active = ['active', 'closing'].includes(value.state)
  const closing = value.state === 'closing'
  return <div className={`rounded-[18px] border p-4 ${closing ? 'border-[#f0dcba] bg-[#fff8ec] text-[#875820]' : value.state === 'expired' ? 'border-[#e3e9ef] bg-[#f7f9fb] text-[#61738a]' : 'border-[#d8e9df] bg-[#eff7f3] text-[#195c42]'}`}>
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em]"><Clock3 size={14} aria-hidden="true" />Snag period remaining</div>
    {active ? <div className="mt-3 flex items-baseline gap-5" role="timer" aria-label={`${value.days} days, ${value.hours} hours, ${value.minutes} minutes remaining`}>
      {[[value.days, 'Days'], [value.hours, 'Hours'], [value.minutes, 'Mins']].map(([number, label]) => <div key={label}><strong className="block text-[28px] font-semibold leading-none tabular-nums">{String(number).padStart(2, '0')}</strong><span className="mt-1 block text-[11px] font-medium opacity-75">{label}</span></div>)}
    </div> : <strong className="mt-3 block text-lg font-semibold">{value.label}</strong>}
    {value.deadline ? <p className="mt-3 text-xs opacity-80">{closing ? 'Closing soon · ' : ''}Ends {formatDate(value.deadline)}</p> : null}
  </div>
}

export function DevelopmentSnagsView({ issues = [], loading = false, error = '', onRefresh, refreshing = false, periodDays = SNAG_PERIOD_DAYS }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  const groups = useMemo(() => groupDevelopmentSnags(issues), [issues])
  const countdownFor = group => getSnagCountdown({ handoverDate: group.handover?.handover_date, periodDays, now })
  const visible = groups.filter(group => {
    const query = search.trim().toLowerCase()
    if (query && ![unitName(group), group.owner?.name].some(value => String(value || '').toLowerCase().includes(query))) return false
    if (filter === 'open') return group.openCount > 0
    if (filter === 'resolved') return group.openCount === 0
    if (filter === 'closing') return countdownFor(group).state === 'closing'
    return true
  })
  const selected = groups.find(group => group.id === selectedId)
  const metrics = [
    { label: 'Submitted lists', value: groups.length, icon: ClipboardCheck },
    { label: 'Open items', value: groups.reduce((sum, group) => sum + group.openCount, 0), icon: Wrench },
    { label: 'Closing in 7 days', value: groups.filter(group => countdownFor(group).state === 'closing').length, icon: Clock3 },
  ]
  return <section className="mt-5 grid min-w-0 gap-5" aria-label="Development snags">
    <div className="relative overflow-hidden rounded-[24px] border border-[#183a3c] bg-[#0c2527] p-5 text-white shadow-[0_20px_48px_rgba(15,23,42,0.14)] sm:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(69,160,124,0.34),transparent_45%),radial-gradient(circle_at_95%_10%,rgba(225,179,85,0.18),transparent_30%)]" aria-hidden="true" />
      <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] xl:items-center">
        <div><span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a8cebd]">After handover</span><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">Snag workspace</h2><p className="mt-2 text-sm text-[#c0d3cd]">Submitted lists · {periodDays}-day snag period</p></div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">{metrics.map(({ label, value, icon }) => <div key={label} className="min-w-0 rounded-[16px] border border-white/10 bg-white/[0.06] p-3 sm:p-4">{createElement(icon, { size: 18, className: 'text-[#a8cebd]', 'aria-hidden': true })}<strong className="mt-3 block text-2xl font-semibold tabular-nums sm:text-3xl">{loading || error ? '—' : value}</strong><span className="mt-1 block text-xs leading-5 text-[#c0d3cd]">{label}</span></div>)}</div>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-[#e2eaf3] bg-white p-4">
      <label className="relative min-w-0 flex-1 basis-56"><span className="sr-only">Search snag lists</span><Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a9bb0]" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search unit or owner" className="h-11 w-full rounded-xl border border-[#e2eaf3] bg-[#fbfcfe] pl-10 pr-3 text-sm text-[#31475c] focus:outline-none focus:ring-2 focus:ring-[#238355]" /></label>
      <select value={filter} onChange={event => setFilter(event.target.value)} aria-label="Filter snag lists" className="h-11 min-w-0 flex-1 basis-44 rounded-xl border border-[#e2eaf3] bg-white px-3 text-sm text-[#31475c] sm:max-w-[220px]"><option value="all">All submitted lists</option><option value="open">With open items</option><option value="resolved">All items resolved</option><option value="closing">Period closing soon</option></select>
      <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading || refreshing}><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />Refresh</Button>
    </div>
    {error ? <div role="alert" className="rounded-[20px] border border-[#f0d6cf] bg-[#fff8f6] p-5 text-sm text-[#b42318]">{error}</div> : loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading snag lists" aria-busy="true">{[1, 2, 3].map(item => <div key={item} className="h-[390px] animate-pulse rounded-[24px] border border-[#e2eaf3] bg-white motion-reduce:animate-none" />)}</div> : visible.length ? <div className="grid items-stretch gap-5 md:grid-cols-2 2xl:grid-cols-3">
      {visible.map(group => <article key={group.id} className="flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-[#dfe8f1] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.045)] transition-shadow hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
        <div className="flex items-start justify-between gap-3 border-b border-[#edf2f7] bg-[#fbfcfe] p-5"><div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eaf4ee] text-[#28724e]"><Home size={21} aria-hidden="true" /></span><div className="min-w-0"><h3 className="break-words text-lg font-semibold text-[#142132]">{unitName(group)}</h3><span className="text-xs text-[#8090a4]">Submitted {formatDate(group.latestSubmission)}</span></div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${group.openCount ? 'bg-[#fff2df] text-[#a26321]' : 'bg-[#eaf7ee] text-[#22824d]'}`}>{group.openCount ? `${group.openCount} open` : 'Resolved'}</span></div>
        <div className="grid flex-1 gap-5 p-5">
          <dl className="grid gap-4"><div><dt className="flex items-center gap-2 text-xs font-medium text-[#8293a7]"><UserRound size={14} aria-hidden="true" />Owner</dt><dd className="mt-1.5 break-words text-sm font-semibold text-[#31475c]">{group.owner?.name || 'Owner not recorded'}</dd></div><div><dt className="flex items-center gap-2 text-xs font-medium text-[#8293a7]"><CalendarDays size={14} aria-hidden="true" />Handover date</dt><dd className="mt-1.5 text-sm font-semibold text-[#31475c]">{formatDate(group.handover?.handover_date)}</dd></div></dl>
          <Countdown value={countdownFor(group)} />
          <div><div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-[#53697f]">Items resolved</span><span className="text-[#8293a7]">{group.resolvedCount} of {group.issues.length}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf2f7]"><div className="h-full rounded-full bg-[#288052]" style={{ width: `${group.resolvedCount / group.issues.length * 100}%` }} /></div></div>
        </div>
        <button type="button" onClick={() => setSelectedId(group.id)} aria-label={`View snag list for ${unitName(group)}`} className="flex w-full items-center justify-between border-t border-[#edf2f7] px-5 py-4 text-sm font-semibold text-[#28724e] transition hover:bg-[#f3f9f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#238355]">View snag list<ArrowUpRight size={17} aria-hidden="true" /></button>
      </article>)}
    </div> : <div className="grid justify-items-center gap-3 rounded-[24px] border border-dashed border-[#d8e2ee] bg-white px-5 py-14 text-center"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#edf5f0] text-[#28724e]"><ClipboardCheck size={25} aria-hidden="true" /></span><h3 className="text-lg font-semibold text-[#142132]">{groups.length ? 'No matching snag lists' : 'No snag lists submitted yet'}</h3><p className="text-sm text-[#718299]">{groups.length ? 'Try another unit, owner or filter.' : 'Submitted unit snag lists will appear here.'}</p></div>}
    <Modal open={Boolean(selected)} onClose={() => setSelectedId(null)} title={selected ? `${unitName(selected)} · Snag list` : ''} className="w-full max-w-5xl">
      {selected ? <div className="grid gap-5">
        <div className="grid gap-4 rounded-[20px] border border-[#e1eaf2] bg-[#f8fbfa] p-5 sm:grid-cols-2"><div><span className="text-xs text-[#718299]">Owner</span><strong className="mt-1 block text-base text-[#31475c]">{selected.owner?.name || 'Owner not recorded'}</strong><span className="mt-3 block text-xs text-[#718299]">Handover · {formatDate(selected.handover?.handover_date)}</span></div><Countdown value={countdownFor(selected)} /></div>
        <div className="flex items-center justify-between"><h4 className="text-base font-semibold text-[#142132]">Submitted items</h4><span className="text-xs text-[#718299]">{selected.issues.length} items · {selected.openCount} open</span></div>
        {selected.issues.map((issue, index) => <article key={issue.id} className="rounded-[18px] border border-[#e1eaf2] bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f0f5f3] text-xs font-semibold text-[#28724e]">{String(index + 1).padStart(2, '0')}</span><div><h5 className="text-sm font-semibold text-[#31475c]">{issue.category || 'Snag item'}</h5><p className="mt-1 text-xs text-[#8293a7]">{issue.location || 'Location not recorded'} · {formatDate(issue.created_at)}</p></div></div><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${isSnagResolved(issue.status) ? 'bg-[#eaf7ee] text-[#22824d]' : 'bg-[#fff2df] text-[#a26321]'}`}>{isSnagResolved(issue.status) ? <CheckCircle2 size={13} aria-hidden="true" /> : <Wrench size={13} aria-hidden="true" />}{String(issue.status || 'Open').replaceAll('_', ' ')}</span></div><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-[#53697f]">{issue.description || 'No description submitted.'}</p></article>)}
      </div> : null}
    </Modal>
  </section>
}

export default function DevelopmentSnagsWorkspace({ developmentId }) {
  const [state, setState] = useState({ issues: [], loading: true, refreshing: false, error: '' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetchDevelopmentSnagSubmissions({ developmentId, signal: controller.signal }).then(issues => {
      if (!controller.signal.aborted) setState({ issues, loading: false, refreshing: false, error: '' })
    }).catch(error => {
      if (!controller.signal.aborted) setState({ issues: [], loading: false, refreshing: false, error: error.message || 'Unable to load snag submissions.' })
    })
    return () => controller.abort()
  }, [developmentId, revision])
  return <DevelopmentSnagsView {...state} onRefresh={() => {
    setState(current => ({ ...current, loading: !current.issues.length, refreshing: true, error: '' }))
    setRevision(value => value + 1)
  }} />
}
