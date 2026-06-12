import { CheckCircle2, Clock, Eye, Plus, RefreshCw, Search, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import CommercialFormModal from '../components/CommercialFormModal'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { formatDate } from '../commercialFormatters'
import {
  createCommercialViewing,
  getCommercialLookupData,
  getCommercialViewings,
  resolveCommercialOrganisationContext,
  updateCommercialViewing,
} from '../services/commercialApi'

const VIEWING_STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No Show' },
]

const FILTER_DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7', label: 'Next 7 days' },
  { value: '30', label: 'Next 30 days' },
  { value: 'past', label: 'Past' },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function viewingDate(row = {}) {
  const date = row.viewing_date ? new Date(`${row.viewing_date}T${String(row.viewing_time || '00:00').slice(0, 8)}`) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function lookupOptions(rows = [], labelFor) {
  return rows.map((row) => ({ value: row.id || row.userId || row.user_id, label: labelFor(row) })).filter((row) => row.value)
}

function brokerName(row = {}) {
  return row.fullName || [row.firstName || row.first_name, row.lastName || row.last_name].filter(Boolean).join(' ') || row.email || 'Broker'
}

function toLookupOptions(lookups = {}) {
  return {
    requirements: lookupOptions(lookups.requirements || [], (row) => row.requirement_name || 'Requirement'),
    companies: lookupOptions(lookups.companies || [], (row) => row.company_name || row.name || 'Company'),
    contacts: lookupOptions(lookups.contacts || [], (row) => row.name || [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Contact'),
    properties: lookupOptions(lookups.properties || [], (row) => row.property_name || 'Property'),
    vacancies: lookupOptions(lookups.vacancies || [], (row) => [row.vacancy_name || 'Vacancy', row.unit_or_floor].filter(Boolean).join(' · ')),
    listings: lookupOptions(lookups.listings || [], (row) => row.title || 'Listing'),
    brokers: lookupOptions(lookups.brokers || [], brokerName),
  }
}

function optionLabel(options = [], id, fallback = '-') {
  if (!id) return fallback
  return options.find((item) => String(item.value) === String(id))?.label || fallback
}

function getViewingSortValue(row = {}) {
  const date = viewingDate(row)
  if (!date) return Number.MAX_SAFE_INTEGER
  const status = normalizeLower(row.status)
  const doneWeight = ['completed', 'cancelled', 'no_show'].includes(status) ? 10_000_000_000_000 : 0
  return date.getTime() + doneWeight
}

function matchesDateRange(row = {}, value = '') {
  if (!value) return true
  const date = viewingDate(row)
  if (!date) return false
  const today = startOfToday()
  const end = new Date(today)
  if (value === 'today') {
    end.setDate(end.getDate() + 1)
    return date >= today && date < end
  }
  if (value === 'past') return date < today
  const days = Number(value)
  if (!Number.isFinite(days)) return true
  end.setDate(end.getDate() + days)
  end.setHours(23, 59, 59, 999)
  return date >= today && date <= end
}

function buildViewingFields() {
  return [
    { name: 'requirement_id', label: 'Requirement', type: 'select', optionsFrom: 'requirements', required: true },
    { name: 'company_id', label: 'Company', type: 'select', optionsFrom: 'companies' },
    { name: 'contact_id', label: 'Contact', type: 'select', optionsFrom: 'contacts' },
    { name: 'property_id', label: 'Property', type: 'select', optionsFrom: 'properties' },
    { name: 'vacancy_id', label: 'Vacancy', type: 'select', optionsFrom: 'vacancies' },
    { name: 'listing_id', label: 'Listing', type: 'select', optionsFrom: 'listings' },
    { name: 'broker_id', label: 'Broker', type: 'select', optionsFrom: 'brokers', required: true },
    { name: 'viewing_date', label: 'Date', type: 'date', required: true },
    { name: 'viewing_time', label: 'Time', type: 'time', required: true },
    { name: 'status', label: 'Status', type: 'select', options: VIEWING_STATUSES, defaultValue: 'scheduled' },
    { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    { name: 'feedback', label: 'Feedback', type: 'textarea', span: 'full' },
  ]
}

function CommercialViewingsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [organisationId, setOrganisationId] = useState('')
  const [viewings, setViewings] = useState([])
  const [lookups, setLookups] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({})
  const [search, setSearch] = useState('')
  const [modalState, setModalState] = useState({ open: false, mode: 'create', record: null })
  const [savingId, setSavingId] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const context = await resolveCommercialOrganisationContext()
      const nextOrganisationId = context.organisationId || ''
      const [nextViewings, nextLookups] = await Promise.all([
        nextOrganisationId ? getCommercialViewings(nextOrganisationId) : [],
        nextOrganisationId ? getCommercialLookupData(nextOrganisationId) : {},
      ])
      setOrganisationId(nextOrganisationId)
      setViewings(nextViewings || [])
      setLookups(nextLookups || {})
    } catch (loadError) {
      setError(loadError?.message || 'Commercial viewings could not be loaded.')
      setViewings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!location.state?.openCommercialViewing) return
    setModalState({ open: true, mode: 'create', record: { status: 'scheduled', ...(location.state.viewingDraft || {}) } })
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  const options = useMemo(() => toLookupOptions(lookups), [lookups])
  const fields = useMemo(() => buildViewingFields(), [])
  const visibleRows = useMemo(() => {
    const query = normalizeLower(search)
    return viewings
      .filter((row) => !filters.status || normalizeLower(row.status) === filters.status)
      .filter((row) => !filters.broker_id || String(row.broker_id || '') === String(filters.broker_id))
      .filter((row) => !filters.property_id || String(row.property_id || '') === String(filters.property_id))
      .filter((row) => !filters.company_id || String(row.company_id || '') === String(filters.company_id))
      .filter((row) => matchesDateRange(row, filters.dateRange))
      .filter((row) => {
        if (!query) return true
        const haystack = [
          optionLabel(options.requirements, row.requirement_id),
          optionLabel(options.companies, row.company_id),
          optionLabel(options.contacts, row.contact_id),
          optionLabel(options.properties, row.property_id),
          optionLabel(options.vacancies, row.vacancy_id),
          optionLabel(options.brokers, row.broker_id),
          row.notes,
          row.feedback,
        ].join(' ').toLowerCase()
        return haystack.includes(query)
      })
      .slice()
      .sort((left, right) => getViewingSortValue(left) - getViewingSortValue(right))
  }, [filters, options, search, viewings])

  async function handleSave(payload) {
    if (!organisationId) throw new Error('Commercial organisation context is not available.')
    if (modalState.mode === 'edit' && modalState.record?.id) {
      const updated = await updateCommercialViewing(modalState.record.id, { ...payload, previousRecord: modalState.record })
      setViewings((current) => current.map((row) => row.id === updated.id ? updated : row))
      return
    }
    const created = await createCommercialViewing({ ...payload, organisation_id: organisationId })
    setViewings((current) => [...current, created])
  }

  async function updateStatus(row, status) {
    if (!row?.id || row.status === status) return
    setSavingId(row.id)
    setError('')
    try {
      const updated = await updateCommercialViewing(row.id, { status, previousRecord: row })
      setViewings((current) => current.map((item) => item.id === row.id ? updated : item))
    } catch (statusError) {
      setError(statusError?.message || 'Viewing status could not be updated.')
    } finally {
      setSavingId('')
    }
  }

  return (
    <div className="grid gap-5">
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Commercial Viewings</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Schedule, confirm, complete, cancel, and review inspections linked to commercial requirements, vacancies, properties, and listings.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadData()} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
            <RefreshCw size={16} />
            Refresh
          </button>
          <button type="button" onClick={() => setModalState({ open: true, mode: 'create', record: null })} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
            <Plus size={16} />
            Schedule Viewing
          </button>
        </div>
      </section>

      <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.045)] lg:grid-cols-[minmax(180px,1fr)_repeat(5,minmax(120px,180px))]">
        <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 px-3 text-sm text-slate-500">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search viewings..." className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#102236] outline-none" />
        </label>
        {[
          ['status', 'Status', VIEWING_STATUSES],
          ['broker_id', 'Broker', options.brokers],
          ['property_id', 'Property', options.properties],
          ['company_id', 'Company', options.companies],
          ['dateRange', 'Date Range', FILTER_DATE_RANGES],
        ].map(([key, label, items]) => (
          <label key={key} className="grid gap-1">
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</span>
            <select value={filters[key] || ''} onChange={(event) => setFilters((previous) => ({ ...previous, [key]: event.target.value }))} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]">
              <option value="">All</option>
              {(items || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        ))}
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              <tr>
                {['Date', 'Time', 'Company', 'Contact', 'Property', 'Vacancy', 'Broker', 'Status', 'Actions'].map((heading) => (
                  <th key={heading} className="px-4 py-3">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={9} className="px-4 py-4">
                      <div className="h-8 animate-pulse rounded-xl bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : visibleRows.length ? visibleRows.map((row) => (
                <tr key={row.id} className="align-top text-slate-600">
                  <td className="px-4 py-3 font-semibold text-[#102236]">{formatDate(row.viewing_date)}</td>
                  <td className="px-4 py-3">{String(row.viewing_time || '').slice(0, 5) || '-'}</td>
                  <td className="px-4 py-3">{optionLabel(options.companies, row.company_id)}</td>
                  <td className="px-4 py-3">{optionLabel(options.contacts, row.contact_id)}</td>
                  <td className="px-4 py-3">{optionLabel(options.properties, row.property_id)}</td>
                  <td className="px-4 py-3">{optionLabel(options.vacancies, row.vacancy_id)}</td>
                  <td className="px-4 py-3">{optionLabel(options.brokers, row.broker_id, 'Unassigned')}</td>
                  <td className="px-4 py-3"><CommercialStatusPill value={row.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setModalState({ open: true, mode: 'edit', record: row })} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-[#102236] transition hover:bg-slate-50">
                        <Eye size={14} />
                        Edit
                      </button>
                      <button type="button" disabled={savingId === row.id} onClick={() => updateStatus(row, 'completed')} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
                        <CheckCircle2 size={14} />
                        Complete
                      </button>
                      <button type="button" disabled={savingId === row.id} onClick={() => updateStatus(row, 'cancelled')} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">
                        <XCircle size={14} />
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <Clock className="mx-auto text-slate-300" size={34} />
                    <p className="mt-3 text-sm font-semibold text-[#102236]">No commercial viewings found.</p>
                    <p className="mt-1 text-sm text-slate-500">Schedule a viewing from this page or from a requirement.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="border-t border-slate-100 px-4 py-3 text-sm font-semibold text-slate-500">
          {visibleRows.length} {visibleRows.length === 1 ? 'viewing' : 'viewings'}
        </footer>
      </section>

      <CommercialFormModal
        open={modalState.open}
        mode={modalState.mode}
        title={modalState.mode === 'edit' ? 'Update Viewing' : 'Schedule Viewing'}
        fields={fields}
        record={modalState.record || { status: 'scheduled' }}
        lookups={options}
        onClose={() => setModalState({ open: false, mode: 'create', record: null })}
        onSubmit={handleSave}
      />
    </div>
  )
}

export default CommercialViewingsPage
