import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CalendarClock, CheckCircle2, CircleAlert, ClipboardList, KeyRound, Megaphone, RefreshCw, ShieldAlert, UsersRound } from 'lucide-react'
import { getRentalOperationsDashboard } from '../../services/rentals/rentalOperationsDashboardRepository.js'

const number = (value) => Number(value || 0).toLocaleString()
const attentionHref = (item) => {
  if (item.kind === 'notice' && item.tenancy_id) return `/agent/rentals/tenancies/${item.tenancy_id}/notice`
  if (item.kind === 'renewal' && item.tenancy_id) return `/agent/rentals/tenancies/${item.tenancy_id}/renewal`
  if (item.kind === 'application') return '/agent/rentals/applications'
  if (item.kind === 'maintenance') return '/agent/rentals/maintenance'
  return '/agent/rentals/operations'
}

const upcomingHref = (item) => item.kind === 'inspection' && item.tenancy_id
  ? '/agent/rentals/inspections'
  : '/agent/rentals/tenancies'

const QUICK_ACTIONS = [
  ['Create vacancy', '/agent/rentals/vacancies/new'],
  ['Review applications', '/agent/rentals/applications'],
  ['Manage tenancies', '/agent/rentals/tenancies'],
  ['Maintenance', '/agent/rentals/maintenance'],
  ['Inspections', '/agent/rentals/inspections'],
  ['Screening', '/agent/rentals/screening'],
  ['Reminders', '/agent/rentals/reminders'],
  ['Operational report', '/agent/rentals/reports'],
  ['Financial reconciliation', '/agent/rentals/financial-reconciliation'],
  ['Pilot readiness', '/agent/rentals/pilot-readiness'],
  ['Rollout controls', '/agent/rentals/rollout-controls'],
]

export function RentalOperationsDashboardPage() {
  const [snapshot, setSnapshot] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const load = useCallback(async () => { try { setLoading(true); setError(''); setSnapshot(await getRentalOperationsDashboard()) } catch (cause) { setError(cause?.message || 'Unable to load the Rentals dashboard.') } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  const metrics = snapshot?.metrics || {}; const attention = snapshot?.attention || []; const upcoming = snapshot?.upcoming || []
  const cards = [
    ['Managed properties', metrics.managed_properties, Building2, '/agent/rentals/portfolio/properties'],
    ['Occupied units', metrics.occupied_units, KeyRound, '/agent/rentals/tenancies'],
    ['Open vacancies', metrics.open_vacancies, Megaphone, '/agent/rentals/vacancies'],
    ['Active tenancies', metrics.active_tenancies, UsersRound, '/agent/rentals/tenancies'],
  ]
  const exceptionCount = Number(metrics.notices_to_acknowledge || 0) + Number(metrics.renewals_due || 0) + Number(metrics.urgent_maintenance || 0) + Number(metrics.applications_to_review || 0)
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 pb-12"><header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-sky-700">Arch9 Rentals</p><h1 className="text-2xl font-bold text-slate-900">Operations dashboard</h1><p className="mt-1 text-sm text-slate-600">One access-scoped snapshot of availability, tenancy health and work requiring action.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"><RefreshCw className="h-4 w-4" />Refresh</button><Link to="/agent/rentals/vacancies/new" className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white">Create vacancy</Link></div></header>{error ? <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><b>Dashboard unavailable.</b> {error}</section> : null}<section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, Icon, href]) => <Link key={label} to={href} className="rounded-xl border bg-white p-4 shadow-sm transition hover:border-sky-300"><Icon className="h-5 w-5 text-sky-700" /><p className="mt-3 text-2xl font-bold">{loading ? '—' : number(value)}</p><p className="text-sm text-slate-600">{label}</p></Link>)}</section><section className="grid gap-4 lg:grid-cols-3"><article className="rounded-xl border bg-white p-5 lg:col-span-2"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-amber-700">Needs attention</p><h2 className="text-lg font-bold">{loading ? 'Loading…' : `${number(exceptionCount)} operational exceptions`}</h2></div><CircleAlert className="h-6 w-6 text-amber-600" /></div>{!loading && !attention.length ? <div className="mt-5 flex items-center gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5" />Nothing currently needs a Rentals intervention.</div> : <ul className="mt-4 divide-y">{attention.map((item, index) => <li key={`${item.kind}-${item.record_id}-${index}`}><Link to={attentionHref(item)} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-sky-700"><span className="flex items-center gap-3"><ShieldAlert className={`h-4 w-4 ${item.urgency === 'urgent' || item.urgency === 'overdue' ? 'text-red-600' : 'text-amber-600'}`} /><span><b>{item.title}</b><span className="ml-2 text-slate-500">{item.due_on ? `Due ${item.due_on}` : 'Review required'}</span></span></span><span className="capitalize text-slate-500">{item.urgency}</span></Link></li>)}</ul>}</article><article className="rounded-xl border bg-white p-5"><p className="text-sm font-semibold text-sky-700">Lettings health</p><h2 className="text-lg font-bold">Availability</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-slate-600">Total units</dt><dd className="font-semibold">{loading ? '—' : number(metrics.total_units)}</dd></div><div className="flex justify-between"><dt className="text-slate-600">Vacant units</dt><dd className="font-semibold">{loading ? '—' : number(metrics.vacant_units)}</dd></div><div className="flex justify-between"><dt className="text-slate-600">Applications to review</dt><dd className="font-semibold">{loading ? '—' : number(metrics.applications_to_review)}</dd></div><div className="flex justify-between"><dt className="text-slate-600">Urgent maintenance</dt><dd className="font-semibold">{loading ? '—' : number(metrics.urgent_maintenance)}</dd></div></dl></article></section><section className="grid gap-4 lg:grid-cols-3"><article className="rounded-xl border bg-white p-5 lg:col-span-2"><div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-sky-700" /><div><p className="text-sm font-semibold text-sky-700">Next 30 days</p><h2 className="text-lg font-bold">Upcoming tenancy actions</h2></div></div>{!loading && !upcoming.length ? <p className="mt-4 text-sm text-slate-600">No notices, renewals or inspections are scheduled in the next 30 days.</p> : <ul className="mt-4 divide-y">{upcoming.map((item, index) => <li key={`${item.kind}-${item.tenancy_id}-${index}`}><Link to={upcomingHref(item)} className="flex justify-between gap-3 py-3 text-sm hover:text-sky-700"><span><b>{item.title}</b><span className="ml-2 text-slate-500">Tenancy {item.tenancy_id?.slice(0, 8)}</span></span><span className="whitespace-nowrap text-slate-600">{item.due_on}</span></Link></li>)}</ul>}</article><article className="rounded-xl border bg-slate-900 p-5 text-white"><p className="text-sm font-semibold text-sky-200">Quick actions</p><div className="mt-4 grid gap-2">{QUICK_ACTIONS.map(([label, href]) => <Link key={href} to={href} className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20">{label}</Link>)}</div><ClipboardList className="mt-5 h-6 w-6 text-sky-200" /></article></section></main>
}
