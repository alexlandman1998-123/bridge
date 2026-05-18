import { Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CommercialFilterBar from './CommercialFilterBar'
import CommercialFormModal from './CommercialFormModal'
import CommercialRecordDrawer from './CommercialRecordDrawer'
import CommercialTable from './CommercialTable'
import {
  getCommercialLookupData,
  resolveCommercialOrganisationContext,
} from '../services/commercialApi'

function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  const message = String(error?.message || error || '').trim()
  if (!message) return fallback
  if (/row-level security|permission denied|not authorized/i.test(message)) return 'You do not have permission to manage this commercial record.'
  if (/auth session|session is missing/i.test(message)) return 'Your session is not ready. Please sign in again before saving.'
  if (/organisation context/i.test(message)) return 'A valid organisation is required before commercial records can be saved.'
  if (/supabase is not configured/i.test(message)) return 'Commercial data storage is not configured in this environment.'
  return fallback
}

function toLookupOptions(lookups = {}) {
  return {
    landlords: (lookups.landlords || []).map((row) => ({ value: row.id, label: row.name || 'Unnamed landlord' })),
    tenants: (lookups.tenants || []).map((row) => ({ value: row.id, label: row.name || 'Unnamed tenant' })),
    properties: (lookups.properties || []).map((row) => ({ value: row.id, label: row.property_name || 'Unnamed property' })),
    requirements: (lookups.requirements || []).map((row) => ({ value: row.id, label: row.requirement_name || 'Unnamed requirement' })),
    deals: (lookups.deals || []).map((row) => ({ value: row.id, label: row.deal_name || 'Unnamed deal' })),
    leases: (lookups.leases || []).map((row) => ({ value: row.id, label: row.id })),
  }
}

function recordMatchesFilters(record, filters) {
  return Object.entries(filters).every(([key, value]) => {
    if (!value) return true
    return String(record?.[key] || '') === String(value)
  })
}

function CommercialCrudPage({ config }) {
  const [records, setRecords] = useState([])
  const [lookups, setLookups] = useState({})
  const [organisationId, setOrganisationId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [filters, setFilters] = useState({})
  const [modalState, setModalState] = useState({ open: false, mode: 'create', record: null })
  const [drawerRecord, setDrawerRecord] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const context = await resolveCommercialOrganisationContext()
      const nextOrganisationId = context.organisationId || ''
      const [nextRecords, nextLookups] = await Promise.all([
        nextOrganisationId ? config.fetchRecords(nextOrganisationId) : [],
        nextOrganisationId ? getCommercialLookupData(nextOrganisationId) : {},
      ])
      setOrganisationId(nextOrganisationId)
      setRecords(nextRecords || [])
      setLookups(nextLookups || {})
    } catch (loadError) {
      setError(friendlyError(loadError, 'Commercial records could not be loaded.'))
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const lookupOptions = useMemo(() => toLookupOptions(lookups), [lookups])
  const columns = useMemo(
    () => config.columns.map((column) => ({
      ...column,
      render: column.render ? (row) => column.render(row, lookupOptions) : undefined,
    })),
    [config.columns, lookupOptions],
  )
  const drawerFields = useMemo(
    () => config.fields.map((field) => ({
      key: field.name,
      label: field.label,
      render: field.type === 'select'
        ? (row) => {
            const option = (field.options || lookupOptions[field.optionsFrom] || []).find((item) => item.value === row[field.name])
            return option?.label || row[field.name] || '-'
          }
        : undefined,
    })),
    [config.fields, lookupOptions],
  )
  const visibleRecords = useMemo(() => records.filter((record) => recordMatchesFilters(record, filters)), [filters, records])

  async function handleSave(payload) {
    setActionError('')
    if (!organisationId) throw new Error('Commercial organisation context is not available.')
    const record = modalState.record
    if (modalState.mode === 'edit' && record?.id) {
      await config.updateRecord(record.id, payload)
    } else {
      await config.createRecord({ ...payload, organisation_id: organisationId })
    }
    await loadData()
  }

  async function handleArchive(record) {
    if (!record?.id) return
    const confirmed = window.confirm(`Archive this ${config.title.toLowerCase().replace(/s$/, '')} record?`)
    if (!confirmed) return
    setActionError('')
    try {
      await config.archiveRecord(record.id)
      setDrawerRecord(null)
      await loadData()
    } catch (archiveError) {
      setActionError(friendlyError(archiveError, 'The commercial record could not be archived.'))
    }
  }

  return (
    <div className="grid gap-5">
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{config.title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{config.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(config.secondaryActions || []).map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50"
            >
              {action.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setModalState({ open: true, mode: 'create', record: null })}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(16,43,70,0.22)] transition hover:bg-[#163a5b]"
          >
            <Plus size={17} />
            {config.createLabel}
          </button>
        </div>
      </section>

      <CommercialFilterBar
        filters={config.filters || []}
        values={filters}
        onChange={(key, value) => setFilters((previous) => ({ ...previous, [key]: value }))}
        onClear={() => setFilters({})}
      />

      {actionError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{actionError}</div>
      ) : null}

      <CommercialTable
        columns={columns}
        rows={visibleRecords}
        loading={loading}
        error={error}
        emptyTitle={config.emptyTitle}
        emptyDescription={config.emptyDescription}
        onView={setDrawerRecord}
        onEdit={(record) => setModalState({ open: true, mode: 'edit', record })}
        onArchive={handleArchive}
      />

      <CommercialFormModal
        open={modalState.open}
        mode={modalState.mode}
        title={config.title}
        fields={config.fields}
        record={modalState.record}
        lookups={lookupOptions}
        crossValidate={config.crossValidate}
        onClose={() => setModalState({ open: false, mode: 'create', record: null })}
        onSubmit={handleSave}
      />

      <CommercialRecordDrawer
        open={Boolean(drawerRecord)}
        record={drawerRecord}
        title={config.title}
        fields={drawerFields}
        documentsEntityType={config.documentsEntityType}
        showHeadsOfTerms={config.showHeadsOfTerms}
        organisationId={organisationId}
        onClose={() => setDrawerRecord(null)}
        onEdit={() => {
          setModalState({ open: true, mode: 'edit', record: drawerRecord })
          setDrawerRecord(null)
        }}
        onArchive={() => handleArchive(drawerRecord)}
      />
    </div>
  )
}

export default CommercialCrudPage
