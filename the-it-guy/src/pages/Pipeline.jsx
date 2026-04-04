import { Funnel, KanbanSquare, Plus, Table2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingSkeleton from '../components/LoadingSkeleton'
import Button from '../components/ui/Button'
import DataTable, { DataTableInner } from '../components/ui/DataTable'
import Field from '../components/ui/Field'
import { ViewToggle } from '../components/ui/FilterBar'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDevelopmentOptions, fetchUnitsData } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const STORAGE_KEY = 'itg:pipeline-leads:v1'

const SOURCE_OPTIONS = ['Property24', 'Website', 'Show Day', 'Referral', 'Walk-in', 'Facebook', 'Other']
const STATUS_OPTIONS = ['Active', 'Not Active', 'Closed', 'Lost', 'Follow Up', 'Negotiating']

const STATUS_COLUMNS = [
  { id: 'prospecting', label: 'Prospecting', statuses: ['Active', 'Follow Up'] },
  { id: 'negotiation', label: 'Negotiation', statuses: ['Negotiating'] },
  { id: 'closed', label: 'Closed Outcomes', statuses: ['Closed', 'Lost', 'Not Active'] },
]

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `lead_${Date.now()}`
}

function readLeads() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLeads(leads) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leads))
}

function getStatusBadgeClass(status) {
  if (status === 'Closed') {
    return 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
  }

  if (status === 'Negotiating' || status === 'Follow Up') {
    return 'border-[#dbe6f2] bg-[#f5f9fd] text-[#35546c]'
  }

  if (status === 'Lost' || status === 'Not Active') {
    return 'border-[#e6eaf0] bg-[#f8fafc] text-[#66758b]'
  }

  return 'border-[#d9e3ef] bg-[#f7fbff] text-[#31506a]'
}

function Pipeline() {
  const { workspace } = useWorkspace()
  const [viewMode, setViewMode] = useState('table')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [developmentOptions, setDevelopmentOptions] = useState([])
  const [unitOptions, setUnitOptions] = useState([])
  const [leads, setLeads] = useState([])
  const [filters, setFilters] = useState({
    status: 'all',
    source: 'all',
    developmentId: workspace.id === 'all' ? 'all' : workspace.id,
  })
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    developmentId: workspace.id === 'all' ? '' : workspace.id,
    unitId: '',
    source: SOURCE_OPTIONS[0],
    status: STATUS_OPTIONS[0],
    notes: '',
  })

  const loadOptions = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      const options = await fetchDevelopmentOptions()
      setDevelopmentOptions(options)
      setLeads(readLeads())
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  useEffect(() => {
    setFilters((previous) => ({
      ...previous,
      developmentId: workspace.id === 'all' ? previous.developmentId : workspace.id,
    }))

    setForm((previous) => ({
      ...previous,
      developmentId: workspace.id === 'all' ? previous.developmentId : workspace.id,
      unitId: '',
    }))
  }, [workspace.id])

  useEffect(() => {
    async function loadUnits() {
      if (!isSupabaseConfigured || !form.developmentId) {
        setUnitOptions([])
        return
      }

      try {
        const rows = await fetchUnitsData({
          developmentId: form.developmentId,
          stage: 'all',
          financeType: 'all',
        })
        setUnitOptions(rows.map((row) => ({ id: row.unit.id, label: row.unit.unit_number })))
      } catch {
        setUnitOptions([])
      }
    }

    void loadUnits()
  }, [form.developmentId])

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function handleCreateLead(event) {
    event.preventDefault()

    if (!form.name.trim()) {
      setError('Lead name is required.')
      return
    }

    if (!form.developmentId) {
      setError('Select a development.')
      return
    }

    setError('')
    const development = developmentOptions.find((item) => item.id === form.developmentId)
    const unit = unitOptions.find((item) => item.id === form.unitId)

    const next = [
      {
        id: generateId(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        developmentId: form.developmentId,
        developmentName: development?.name || 'Unknown Development',
        unitId: form.unitId || null,
        unitNumber: unit?.label || '-',
        source: form.source,
        status: form.status,
        notes: form.notes.trim(),
        createdAt: new Date().toISOString(),
      },
      ...leads,
    ]

    setLeads(next)
    writeLeads(next)
    setForm((previous) => ({
      ...previous,
      name: '',
      phone: '',
      email: '',
      unitId: '',
      source: SOURCE_OPTIONS[0],
      status: STATUS_OPTIONS[0],
      notes: '',
    }))
    setShowForm(false)
  }

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const scopeMatch = filters.developmentId === 'all' ? true : lead.developmentId === filters.developmentId
      const statusMatch = filters.status === 'all' ? true : lead.status === filters.status
      const sourceMatch = filters.source === 'all' ? true : lead.source === filters.source
      return scopeMatch && statusMatch && sourceMatch
    })
  }, [leads, filters.developmentId, filters.source, filters.status])

  const grouped = useMemo(() => {
    return STATUS_COLUMNS.map((column) => ({
      ...column,
      leads: filteredLeads.filter((lead) => column.statuses.includes(lead.status)),
    }))
  }, [filteredLeads])

  const summaryCards = useMemo(() => {
    const openPipeline = filteredLeads.filter((lead) => ['Active', 'Follow Up', 'Negotiating'].includes(lead.status)).length
    const followUps = filteredLeads.filter((lead) => lead.status === 'Follow Up').length
    const closed = filteredLeads.filter((lead) => ['Closed', 'Lost', 'Not Active'].includes(lead.status)).length

    return [
      { label: 'Total Leads', value: filteredLeads.length, tone: 'bg-[#f8fbff] text-[#31506a]' },
      { label: 'Open Pipeline', value: openPipeline, tone: 'bg-[#eef7f2] text-[#1c7d45]' },
      { label: 'Follow Ups', value: followUps, tone: 'bg-[#f7f9fc] text-[#5b7087]' },
      { label: 'Closed Outcomes', value: closed, tone: 'bg-[#fff7ed] text-[#9a5b13]' },
    ]
  }, [filteredLeads])

  if (!isSupabaseConfigured) {
    return (
      <section className="space-y-5">
        <div className="rounded-[24px] border border-[#f6d4d4] bg-[#fff5f5] px-5 py-4 text-sm text-[#b42318]">
          Supabase is not configured for this workspace.
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div key={card.label} className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
              <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{card.label}</span>
              <div className="mt-3 flex items-center justify-between gap-3">
                <strong className="text-[1.5rem] font-semibold tracking-[-0.03em] text-[#142132]">{card.value}</strong>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${card.tone}`}>Live</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-[22px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#35546c]">
            <Funnel size={15} />
            <span>Pipeline Filters</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Development</span>
              <Field
                as="select"
                value={filters.developmentId}
                onChange={(event) => setFilters((previous) => ({ ...previous, developmentId: event.target.value }))}
                disabled={workspace.id !== 'all'}
              >
                <option value="all">All Developments</option>
                {developmentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Status</span>
              <Field
                as="select"
                value={filters.status}
                onChange={(event) => setFilters((previous) => ({ ...previous, status: event.target.value }))}
              >
                <option value="all">All Statuses</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Source</span>
              <Field
                as="select"
                value={filters.source}
                onChange={(event) => setFilters((previous) => ({ ...previous, source: event.target.value }))}
              >
                <option value="all">All Sources</option>
                {SOURCE_OPTIONS.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </Field>
            </label>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-[22px] border border-[#f6d4d4] bg-[#fff5f5] px-5 py-4 text-sm text-[#b42318]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <LoadingSkeleton lines={10} />
        </div>
      ) : null}

      {!loading && showForm ? (
        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-2">
            <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Add Lead</h3>
            <p className="text-sm leading-7 text-[#6b7d93]">Capture a manual lead and drop it directly into the active pipeline.</p>
          </div>

          <form className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleCreateLead}>
            <label className="grid gap-2 xl:col-span-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Lead Name</span>
              <Field value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Client or entity name" />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Phone</span>
              <Field value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} placeholder="+27 ..." />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Email</span>
              <Field type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} placeholder="name@email.com" />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Development</span>
              <Field
                as="select"
                value={form.developmentId}
                onChange={(event) => updateForm('developmentId', event.target.value)}
                disabled={workspace.id !== 'all'}
              >
                <option value="">Select development</option>
                {developmentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Unit Interested In</span>
              <Field as="select" value={form.unitId} onChange={(event) => updateForm('unitId', event.target.value)}>
                <option value="">Not selected</option>
                {unitOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    Unit {option.label}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Source</span>
              <Field as="select" value={form.source} onChange={(event) => updateForm('source', event.target.value)}>
                {SOURCE_OPTIONS.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Status</span>
              <Field as="select" value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2 md:col-span-2 xl:col-span-4">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Notes</span>
              <Field as="textarea" rows={4} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Context, timing, objections, or next step." />
            </label>
            <div className="flex flex-wrap items-center gap-3 xl:col-span-4">
              <Button type="submit">
                <Plus size={16} />
                Save Lead
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {!loading && viewMode === 'table' ? (
        <DataTable
          title="Lead Register"
          copy="Structured lead list across the selected development scope."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-[#d9e3ef] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#5c738d]">
                {filteredLeads.length} leads
              </span>
              <ViewToggle
                items={[
                  { key: 'table', label: 'Table', icon: Table2 },
                  { key: 'board', label: 'Board', icon: KanbanSquare },
                ]}
                value={viewMode}
                onChange={setViewMode}
              />
              <Button onClick={() => setShowForm((previous) => !previous)}>
                <Plus size={16} />
                {showForm ? 'Close Lead Form' : 'New Lead'}
              </Button>
            </div>
          }
        >
          <DataTableInner>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Development</th>
                <th>Source</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <div className="flex flex-col gap-1">
                      <strong className="text-sm font-semibold text-[#142132]">{lead.name}</strong>
                      <span className="text-sm text-[#6b7d93]">{lead.phone || lead.email || 'No contact details yet'}</span>
                      {lead.phone && lead.email ? <span className="text-sm text-[#6b7d93]">{lead.email}</span> : null}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <strong className="text-sm font-semibold text-[#142132]">{lead.developmentName || '-'}</strong>
                      <span className="text-sm text-[#6b7d93]">{lead.unitNumber && lead.unitNumber !== '-' ? `Unit ${lead.unitNumber}` : 'No unit linked'}</span>
                    </div>
                  </td>
                  <td>{lead.source}</td>
                  <td>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.78rem] font-semibold ${getStatusBadgeClass(lead.status)}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="max-w-[320px]">
                    <span className="line-clamp-2 text-sm text-[#51657b]">{lead.notes || 'No notes captured yet.'}</span>
                  </td>
                </tr>
              ))}
              {!filteredLeads.length ? (
                <tr>
                  <td colSpan={5}>
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                      <strong className="text-base font-semibold text-[#142132]">No leads for the selected filters.</strong>
                      <span className="text-sm text-[#6b7d93]">Adjust the development, source, or status filters, or add a new lead.</span>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </DataTableInner>
        </DataTable>
      ) : null}

      {!loading && viewMode === 'board' ? (
        <section className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-3 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-[#d9e3ef] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#5c738d]">
                {filteredLeads.length} leads
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ViewToggle
                items={[
                  { key: 'table', label: 'Table', icon: Table2 },
                  { key: 'board', label: 'Board', icon: KanbanSquare },
                ]}
                value={viewMode}
                onChange={setViewMode}
              />
              <Button onClick={() => setShowForm((previous) => !previous)}>
                <Plus size={16} />
                {showForm ? 'Close Lead Form' : 'New Lead'}
              </Button>
            </div>
          </div>
          {grouped.map((column) => (
            <article
              className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]"
              key={column.id}
            >
              <header className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[1.05rem] font-semibold tracking-[-0.025em] text-[#142132]">{column.label}</h3>
                  <p className="mt-1 text-sm text-[#6b7d93]">Leads currently sitting in this lane.</p>
                </div>
                <span className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-full border border-[#d9e3ef] bg-[#f7f9fc] px-3 text-sm font-semibold text-[#5c738d]">
                  {column.leads.length}
                </span>
              </header>
              <div className="space-y-3">
                {column.leads.map((lead) => (
                  <article key={lead.id} className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <strong className="block text-base font-semibold text-[#142132]">{lead.name}</strong>
                        <p className="mt-1 text-sm text-[#6b7d93]">
                          {lead.developmentName} • {lead.unitNumber && lead.unitNumber !== '-' ? `Unit ${lead.unitNumber}` : 'No unit'}
                        </p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[0.78rem] font-semibold ${getStatusBadgeClass(lead.status)}`}>
                        {lead.status}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-[0.78rem] font-medium text-[#5b7087]">
                      <span className="rounded-full bg-white px-2.5 py-1">{lead.source}</span>
                      {lead.phone ? <span className="rounded-full bg-white px-2.5 py-1">{lead.phone}</span> : null}
                      {lead.email ? <span className="rounded-full bg-white px-2.5 py-1">{lead.email}</span> : null}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-[#51657b]">{lead.notes || 'No notes captured yet.'}</p>
                  </article>
                ))}
                {!column.leads.length ? (
                  <div className="rounded-[20px] border border-dashed border-[#d9e3ef] bg-[#fbfcfe] px-4 py-8 text-center text-sm text-[#6b7d93]">
                    No leads in this lane.
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </section>
  )
}

export default Pipeline
