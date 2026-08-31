import { CalendarDays, ChevronRight, Loader2, Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { RENTAL_VACANCY_STATUSES } from '../../services/rentals/rentalVacancyModel.js'
import { listRentalVacancies } from '../../services/rentals/rentalVacancyRepository.js'

const text = (value) => String(value ?? '').trim()
const formatStatus = (value) => text(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Draft'
const formatCurrency = (value) => Number(value || 0) > 0 ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(value)) : 'Rent pending'
const formatDate = (value) => value ? new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) : 'Date pending'
const statusStyle = (value) => ({ draft: 'border-[#dbe6f1] bg-[#f8fbff] text-[#4d6782]', preparing: 'border-[#d8e5f5] bg-[#eff6ff] text-[#2563a4]', marketing: 'border-[#d7e7dc] bg-[#effaf3] text-[#26724c]', applications_open: 'border-[#e5dbfa] bg-[#f6f1ff] text-[#6d48a9]', paused: 'border-[#efdcb7] bg-[#fff9ec] text-[#8a641d]', let: 'border-[#cfe8dc] bg-[#effaf3] text-[#26724c]', withdrawn: 'border-[#e4e8ed] bg-[#f6f7f9] text-[#667085]' })[value] || 'border-[#dbe6f1] bg-[#f8fbff] text-[#4d6782]'

function scopeFrom(context = {}) {
  const membership = context.currentMembership || context.organisationMembership || {}
  return { organisationId: text(context.workspace?.id || membership.organisation_id || membership.organisationId), branchId: text(membership.branch_id || membership.branchId) }
}

function VacancyCard({ vacancy }) {
  return <Link to={`/agent/rentals/vacancies/${vacancy.id}`} className="group flex min-h-[238px] flex-col overflow-hidden rounded-[18px] border border-[#dfe7f0] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:border-[#b9cee4]">
    <div className="flex items-start justify-between gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf5ff] text-[#1769d1]"><CalendarDays size={19} /></div><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle(vacancy.status)}`}>{formatStatus(vacancy.status)}</span></div>
    <div className="mt-4"><p className="text-base font-semibold text-[#142132]">Unit {vacancy.unitId || 'pending'}</p><p className="mt-1 text-sm text-[#60758b]">Available {formatDate(vacancy.availableFrom)}</p></div>
    <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-[#e5edf5] bg-[#f9fbfe] p-3"><div><p className="text-[.65rem] font-semibold uppercase tracking-[.08em] text-[#7b8ca2]">Asking rent</p><p className="mt-1 text-sm font-semibold text-[#20364d]">{formatCurrency(vacancy.askingRent)}</p></div><div><p className="text-[.65rem] font-semibold uppercase tracking-[.08em] text-[#7b8ca2]">Lease term</p><p className="mt-1 text-sm font-semibold text-[#20364d]">{vacancy.leaseTermMonths ? `${vacancy.leaseTermMonths} months` : 'TBC'}</p></div></div>
    <p className="mt-3 line-clamp-1 text-xs text-[#60758b]">{vacancy.vacancyReason || 'No vacancy reason captured'}</p>
    <div className="mt-auto flex items-center justify-between border-t border-[#edf2f7] pt-3 text-xs font-semibold text-[#1769d1]"><span>Open vacancy</span><ChevronRight size={15} /></div>
  </Link>
}

export function RentalVacanciesPage() {
  const workspace = useWorkspace(); const scope = useMemo(() => scopeFrom(workspace), [workspace]); const [vacancies, setVacancies] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [status, setStatus] = useState('all'); const [query, setQuery] = useState('')
  const load = useCallback(async () => { if (!scope.organisationId) { setLoading(false); return } try { setLoading(true); setError(''); setVacancies(await listRentalVacancies(scope)) } catch (cause) { setError(cause?.message || 'Unable to load vacancies.'); setVacancies([]) } finally { setLoading(false) } }, [scope])
  useEffect(() => { void load() }, [load])
  const counts = useMemo(() => vacancies.reduce((result, item) => ({ ...result, [item.status]: (result[item.status] || 0) + 1 }), { all: vacancies.length }), [vacancies])
  const rows = useMemo(() => vacancies.filter((item) => (status === 'all' || item.status === status) && [item.unitId, item.vacancyReason, item.status].join(' ').toLowerCase().includes(query.toLowerCase())), [query, status, vacancies])
  const tabs = [{ key: 'all', label: 'All' }, ...RENTAL_VACANCY_STATUSES.map((key) => ({ key, label: formatStatus(key) }))]
  return <main className="mx-auto w-full max-w-[1600px] px-3 py-2 sm:px-5 lg:px-7"><section className="space-y-4 pb-6"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex max-w-full gap-1 overflow-x-auto rounded-[14px] border border-[#dbe4ee] bg-white p-1">{tabs.map((tab) => <button key={tab.key} type="button" onClick={() => setStatus(tab.key)} className={`shrink-0 rounded-[10px] px-3 py-2 text-xs font-semibold ${status === tab.key ? 'bg-[#0f2743] text-white shadow-sm' : 'text-[#51667f] hover:bg-[#f6f9fc]'}`}>{tab.label} <span className="ml-1 opacity-70">{counts[tab.key] || 0}</span></button>)}</div><div className="flex gap-2"><label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[12px] border border-[#dbe4ee] bg-white px-3 lg:w-72"><Search size={15} className="text-[#7b8ca2]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none" placeholder="Search vacancies" /></label><Link to="/agent/rentals/vacancies/new" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[12px] bg-[#0f2743] px-3 text-sm font-semibold text-white"><Plus size={16} />Create vacancy</Link></div></div>{error ? <p className="rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm text-[#9f3131]">{error}</p> : null}{loading ? <div className="grid min-h-56 place-items-center text-sm text-[#60758b]"><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Loading vacancies…</span></div> : rows.length ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map((vacancy) => <VacancyCard key={vacancy.id} vacancy={vacancy} />)}</section> : <section className="rounded-[18px] border border-dashed border-[#d8e4f0] bg-white p-10 text-center"><CalendarDays className="mx-auto text-[#7b8ca2]" size={28} /><p className="mt-3 font-semibold text-[#20364d]">No vacancies in this view</p><p className="mt-1 text-sm text-[#60758b]">Create a draft vacancy from a managed unit when it becomes available.</p><Link to="/agent/rentals/vacancies/new" className="mt-4 inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#0f2743] px-3 text-sm font-semibold text-white"><Plus size={16} />Create vacancy</Link></section>}</section></main>
}

export default RentalVacanciesPage
