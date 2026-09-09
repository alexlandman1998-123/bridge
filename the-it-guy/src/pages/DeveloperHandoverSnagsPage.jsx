import { AlertTriangle, Building2, CalendarDays, ClipboardCheck, RefreshCw, Wrench } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SummaryCards from '../components/SummaryCards'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import SearchInput from '../components/ui/SearchInput'
import { fetchDevelopmentDetail, fetchDevelopmentsData, upsertTransactionHandover } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const COMPLETE_HANDOVER_STATUSES = new Set(['completed', 'closed', 'registered'])

function asDate(value) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function isOverdue(handover) {
  const date = asDate(handover?.handoverDate)
  if (!date || COMPLETE_HANDOVER_STATUSES.has(String(handover?.status || '').toLowerCase())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date < today
}

function handoverStatusLabel(handover) {
  if (isOverdue(handover)) return 'Overdue'
  const status = String(handover?.status || 'not_started').replaceAll('_', ' ')
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function handoverTone(handover) {
  if (isOverdue(handover)) return 'bg-rose-50 text-rose-700 ring-rose-200'
  if (COMPLETE_HANDOVER_STATUSES.has(String(handover?.status || '').toLowerCase())) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (handover?.handoverDate) return 'bg-amber-50 text-amber-700 ring-amber-200'
  return 'bg-slate-100 text-slate-600 ring-slate-200'
}

function formatDate(value) {
  const date = asDate(value)
  return date ? date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not scheduled'
}

function flattenRows(details = []) {
  return details.flatMap((detail) =>
    (detail?.rows || [])
      .filter((row) => row?.transaction?.id)
      .map((row) => ({ ...row, development: detail.development || row.development || {} })),
  )
}

function DeveloperHandoverSnagsPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [developments, setDevelopments] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingUnitId, setSavingUnitId] = useState('')
  const [developmentId, setDevelopmentId] = useState('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const loadWorkspace = useCallback(async ({ refresh = false } = {}) => {
    if (!isSupabaseConfigured) {
      setError('Connect Supabase to load development handovers and snags.')
      setLoading(false)
      return
    }

    refresh ? setRefreshing(true) : setLoading(true)
    setError('')
    try {
      const summary = await fetchDevelopmentsData()
      const nextDevelopments = summary?.developments || []
      const details = await Promise.all(nextDevelopments.map((development) => fetchDevelopmentDetail(development.id)))
      setDevelopments(nextDevelopments)
      setRows(flattenRows(details))
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load the handover and snags workspace.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (developmentId !== 'all' && String(row.development?.id) !== developmentId) return false
      if (!query) return true
      return [row.development?.name, row.unit?.unit_number, row.unit?.unit_label, row.buyer?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [developmentId, rows, search])

  const metrics = useMemo(() => {
    const scheduled = visibleRows.filter((row) => row.handover?.handoverDate && !COMPLETE_HANDOVER_STATUSES.has(String(row.handover?.status || '').toLowerCase()))
    return {
      scheduled: scheduled.length,
      overdue: scheduled.filter((row) => isOverdue(row.handover)).length,
      unscheduled: visibleRows.filter((row) => !row.handover?.handoverDate).length,
      openSnags: visibleRows.reduce((total, row) => total + Number(row.snagSummary?.openCount || 0), 0),
    }
  }, [visibleRows])

  async function saveHandoverDate(row, handoverDate) {
    setSavingUnitId(row.unit.id)
    setFeedback('')
    setError('')
    try {
      const handover = await upsertTransactionHandover({
        transactionId: row.transaction.id,
        handover: { ...(row.handover || {}), handoverDate, status: row.handover?.status || 'in_progress' },
      })
      setRows((current) => current.map((item) => (item.unit?.id === row.unit.id ? { ...item, handover } : item)))
      setFeedback(`Handover date saved for Unit ${row.unit?.unit_number || row.unit?.unit_label || ''}.`)
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save the handover date.')
    } finally {
      setSavingUnitId('')
    }
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading development handovers and snags…</div>

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Developer workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Handover &amp; Snags</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Schedule handovers and monitor snag resolution for active development-sale units. Resale and private-sale work is excluded.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate('/snags')}><Wrench className="h-4 w-4" />Manage snag register</Button>
          <Button variant="secondary" disabled={refreshing} onClick={() => void loadWorkspace({ refresh: true })}><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</Button>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {feedback ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{feedback}</div> : null}

      <SummaryCards items={[
        { label: 'Scheduled handovers', value: metrics.scheduled, meta: 'Active dates on development sales', icon: <CalendarDays className="h-5 w-5" /> },
        { label: 'Overdue handovers', value: metrics.overdue, meta: metrics.overdue ? 'Needs attention' : 'None overdue', icon: <AlertTriangle className="h-5 w-5" /> },
        { label: 'Ready to schedule', value: metrics.unscheduled, meta: 'Active units with no date', icon: <ClipboardCheck className="h-5 w-5" /> },
        { label: 'Open snags', value: metrics.openSnags, meta: 'Across active development sales', icon: <Wrench className="h-5 w-5" /> },
      ]} />

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="text-lg font-semibold text-slate-900">Unit handover schedule</h2><p className="mt-1 text-sm text-slate-500">Dates are saved on the transaction and remain visible from the development unit workspace.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Field as="select" value={developmentId} onChange={(event) => setDevelopmentId(event.target.value)} aria-label="Filter by development"><option value="all">All developments</option>{developments.map((development) => <option key={development.id} value={development.id}>{development.name}</option>)}</Field>
            <SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search unit or buyer" />
          </div>
        </div>
        {!visibleRows.length ? <div className="p-10 text-center text-sm text-slate-500">There are no active development-sale units matching these filters.</div> : (
          <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100 text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Development / unit</th><th className="px-5 py-3">Buyer</th><th className="px-5 py-3">Handover</th><th className="px-5 py-3">Schedule date</th><th className="px-5 py-3">Snags</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">
            {visibleRows.map((row) => <tr key={row.unit.id} className="align-middle"><td className="px-5 py-4"><div className="font-semibold text-slate-900">{row.development?.name || 'Development'} · Unit {row.unit?.unit_number || row.unit?.unit_label || '—'}</div><div className="mt-1 text-xs text-slate-500">{row.unit?.unit_label || 'Development sale'}</div></td><td className="px-5 py-4 text-slate-700">{row.buyer?.name || 'Buyer pending'}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${handoverTone(row.handover)}`}>{handoverStatusLabel(row.handover)}</span><div className="mt-1 text-xs text-slate-500">{formatDate(row.handover?.handoverDate)}</div></td><td className="px-5 py-4"><Field type="date" value={row.handover?.handoverDate || ''} disabled={savingUnitId === row.unit.id} onChange={(event) => void saveHandoverDate(row, event.target.value)} aria-label={`Handover date for unit ${row.unit?.unit_number || ''}`} /></td><td className="px-5 py-4"><span className={row.snagSummary?.openCount ? 'font-semibold text-amber-700' : 'text-emerald-700'}>{row.snagSummary?.openCount ? `${row.snagSummary.openCount} open` : 'Clear'}</span><div className="mt-1 text-xs text-slate-500">{row.snagSummary?.totalCount || 0} total</div></td><td className="px-5 py-4 text-right"><Button size="sm" variant="ghost" onClick={() => navigate(`/developer/developments/${row.development?.id}`)}><Building2 className="h-4 w-4" />Open</Button></td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </main>
  )
}

export default DeveloperHandoverSnagsPage
