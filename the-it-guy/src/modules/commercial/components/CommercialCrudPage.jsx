import { Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import CommercialFilterBar from './CommercialFilterBar'
import CommercialFormModal from './CommercialFormModal'
import CommercialRecordDrawer from './CommercialRecordDrawer'
import CommercialOnboardingSendModal from './CommercialOnboardingSendModal'
import CommercialTable from './CommercialTable'
import CommercialWorkspaceTabs from './CommercialWorkspaceTabs'
import { formatDate } from '../commercialFormatters'
import {
  createDealFromRequirement,
  createCommercialTransaction,
  getCommercialLookupData,
  resolveCommercialOrganisationContext,
} from '../services/commercialApi'
import {
  buildCommercialOnboardingInviteDraft,
  createCommercialOnboardingInvitation,
} from '../services/commercialOnboardingApi'

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
    companies: (lookups.companies || []).map((row) => ({ value: row.id, label: row.company_name || row.name || 'Unnamed company' })),
    contacts: (lookups.contacts || []).map((row) => ({ value: row.id, label: row.name || [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed contact' })),
    landlords: (lookups.landlords || []).map((row) => ({ value: row.id, label: row.name || 'Unnamed landlord' })),
    tenants: (lookups.tenants || []).map((row) => ({ value: row.id, label: row.name || 'Unnamed tenant' })),
    properties: (lookups.properties || []).map((row) => ({
      value: row.id,
      label: [row.property_name || 'Unnamed property', [row.suburb, row.city].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
    })),
    vacancies: (lookups.vacancies || []).map((row) => ({ value: row.id, label: [row.vacancy_name || 'Unnamed vacancy', row.unit_or_floor].filter(Boolean).join(' · ') })),
    listings: (lookups.listings || []).map((row) => ({ value: row.id, label: row.title || 'Unnamed listing' })),
    requirements: (lookups.requirements || []).map((row) => ({ value: row.id, label: row.requirement_name || 'Unnamed requirement' })),
    deals: (lookups.deals || []).map((row) => ({ value: row.id, label: row.deal_name || 'Unnamed deal' })),
    leases: (lookups.leases || []).map((row) => ({ value: row.id, label: row.id })),
    brokers: (lookups.brokers || []).map((row) => ({
      value: row.userId || row.user_id || row.id,
      label: row.fullName || [row.firstName || row.first_name, row.lastName || row.last_name].filter(Boolean).join(' ') || row.email || 'Broker',
    })).filter((row) => row.value),
    branches: (lookups.branches || []).map((row) => ({ value: row.id, label: row.name || 'Commercial branch' })),
    teams: (lookups.teams || []).map((row) => ({ value: row.id, label: row.name || 'Commercial team' })),
  }
}

function recordMatchesFilters(record, filters, filterDefs = []) {
  return Object.entries(filters).every(([key, value]) => {
    if (!value) return true
    const filter = filterDefs.find((item) => item.key === key)
    if (filter?.type === 'text') return String(record?.[key] || '').toLowerCase().includes(String(value).toLowerCase())
    return String(record?.[key] || '') === String(value)
  })
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase()
}

function getSearchableValue(record, fields = [], lookupSearchFields = [], lookups = {}) {
  const recordValues = fields
    .map((field) => {
      const value = record?.[field]
      if (Array.isArray(value)) return value.join(' ')
      return String(value ?? '')
    })
  const lookupValues = lookupSearchFields.map((field) => {
    const option = (lookups[field.optionsFrom] || []).find((item) => item.value === record?.[field.name])
    return option?.label || ''
  })
  return [...recordValues, ...lookupValues]
    .join(' ')
    .toLowerCase()
}

function compareValues(left, right, direction = 'asc') {
  const multiplier = direction === 'desc' ? -1 : 1
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return (leftNumber - rightNumber) * multiplier
  return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true, sensitivity: 'base' }) * multiplier
}

function renderCardValue(column, row) {
  if (!column) return null
  return column.render ? column.render(row) : (row?.[column.key] ?? '-')
}

function CommercialCrudPage({
  config,
  pageTitle = '',
  pageDescription = '',
  searchPlaceholder = '',
  createLabel = '',
  secondaryActions = [],
  emptyTitle = '',
  emptyDescription = '',
  tabs = [],
  activeTab = '',
  onTabChange = null,
  extraFilter = null,
  drawerPrimaryActionLabel = '',
  onDrawerPrimaryAction = null,
  presentation = 'table',
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [lookups, setLookups] = useState({})
  const [organisationId, setOrganisationId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [filters, setFilters] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [sortState, setSortState] = useState({ key: config.defaultSortKey || config.columns?.[0]?.key || '', direction: config.defaultSortDirection || 'asc' })
  const [page, setPage] = useState(1)
  const pageSize = config.pageSize || 25
  const [modalState, setModalState] = useState({ open: false, mode: 'create', record: null })
  const [drawerRecord, setDrawerRecord] = useState(null)
  const [onboardingModalState, setOnboardingModalState] = useState({ open: false, record: null })
  const CreateModal = modalState.mode === 'create' ? config.createModal : null
  const resolvedPageTitle = pageTitle || config.title
  const resolvedPageDescription = pageDescription || config.description
  const resolvedCreateLabel = createLabel || config.createLabel || 'New record'
  const resolvedSecondaryActions = secondaryActions.length ? secondaryActions : (config.secondaryActions || [])
  const resolvedEmptyTitle = emptyTitle || config.emptyTitle
  const resolvedEmptyDescription = emptyDescription || config.emptyDescription
  const resolvedSearchPlaceholder = searchPlaceholder || `Search ${resolvedPageTitle.toLowerCase()}...`
  const useCardView = presentation === 'cards'

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

  useEffect(() => {
    setPage(1)
  }, [filters, searchTerm, sortState.key, sortState.direction])

  useEffect(() => {
    if (!location.state?.openCommercialCreate) return
    setModalState({ open: true, mode: 'create', record: location.state?.commercialCreateDraft || null })
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const search = params.get('search')
    if (search !== null) setSearchTerm(search)
  }, [location.search])

  const lookupOptions = useMemo(() => toLookupOptions(lookups), [lookups])
  const columns = useMemo(
    () => config.columns.map((column) => ({
      ...column,
      render: column.render ? (row) => column.render(row, lookupOptions) : undefined,
    })),
    [config.columns, lookupOptions],
  )
  const resolvedFilterConfigs = useMemo(
    () => (config.filters || []).map((filter) => ({
      ...filter,
      options: filter.options || lookupOptions[filter.optionsFrom] || [],
    })),
    [config.filters, lookupOptions],
  )
  const drawerFields = useMemo(
    () => config.fields.filter((field) => field.persist !== false).map((field) => ({
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
  const drawerOnboardingDraft = useMemo(
    () => (drawerRecord ? buildCommercialOnboardingInviteDraft({ kind: config.kind, record: drawerRecord, lookups: lookupOptions }) : null),
    [config.kind, drawerRecord, lookupOptions],
  )
  const searchableFields = useMemo(() => {
    const configured = Array.isArray(config.searchFields) ? config.searchFields : []
    if (configured.length) return configured
    return [...new Set([
      ...(config.columns || []).map((column) => column.key).filter(Boolean),
      ...(config.fields || []).map((field) => field.name).filter(Boolean),
    ])]
  }, [config.columns, config.fields, config.searchFields])
  const cardColumns = useMemo(() => (
    useCardView
      ? columns.filter((column) => column.key && !['title'].includes(column.key) && column.sortable !== false && column.key !== 'actions')
      : []
  ), [columns, useCardView])
  const visibleRecords = useMemo(() => {
    const query = normalizeSearch(searchTerm)
    return records
      .filter((record) => recordMatchesFilters(record, filters, resolvedFilterConfigs))
      .filter((record) => (typeof extraFilter === 'function' ? extraFilter(record, { activeTab, lookups, rawLookups: lookups, records }) : true))
      .filter((record) => !query || getSearchableValue(record, searchableFields, config.searchLookupFields || [], lookupOptions).includes(query))
      .sort((left, right) => compareValues(left?.[sortState.key], right?.[sortState.key], sortState.direction))
  }, [activeTab, config.searchLookupFields, extraFilter, filters, lookupOptions, lookups, records, resolvedFilterConfigs, searchTerm, searchableFields, sortState.direction, sortState.key])
  const totalPages = Math.max(1, Math.ceil(visibleRecords.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedRecords = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return visibleRecords.slice(start, start + pageSize)
  }, [pageSize, safePage, visibleRecords])
  const pagination = {
    page: safePage,
    totalPages,
    totalRows: visibleRecords.length,
    startRow: visibleRecords.length ? (safePage - 1) * pageSize + 1 : 0,
    endRow: Math.min(safePage * pageSize, visibleRecords.length),
    canPrevious: safePage > 1,
    canNext: safePage < totalPages,
    onPrevious: () => setPage((previous) => Math.max(1, previous - 1)),
    onNext: () => setPage((previous) => Math.min(totalPages, previous + 1)),
  }

  function handleSort(key) {
    if (!key) return
    setSortState((previous) => ({
      key,
      direction: previous.key === key && previous.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  async function handleSave(payload) {
    setActionError('')
    if (!organisationId) throw new Error('Commercial organisation context is not available.')
    const record = modalState.record
    if (modalState.mode === 'edit' && record?.id) {
      const updated = await config.updateRecord(record.id, payload)
      await loadData()
      return updated
    } else {
      const created = await config.createRecord({ ...payload, organisation_id: organisationId })
      await loadData()
      return created
    }
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

  async function handleCreateTransaction(record) {
    if (!record?.id || !organisationId) return
    if (config.kind === 'requirements') {
      const normalizedType = String(record.requirement_type || '').trim().toLowerCase()
      if (!['lease', 'purchase', 'investment'].includes(normalizedType)) {
        setActionError('Classify this lead as Sales or Leasing before converting it to an opportunity.')
        setModalState({ open: true, mode: 'edit', record })
        return
      }

      const existingDeal = (lookups.deals || []).find((row) => String(row.requirement_id || '') === String(record.id))
      if (existingDeal?.id) {
        navigate(`/commercial/${normalizedType === 'lease' ? 'leasing' : 'sales'}?tab=opportunities&converted=${existingDeal.id}`)
        return
      }

      try {
        const dealType = normalizedType === 'lease' ? 'lease' : 'sale'
        const createdDeal = await createDealFromRequirement(record, {
          organisation_id: organisationId,
          deal_name: `${record.requirement_name || 'Lead'} Opportunity`,
          deal_type: dealType,
          stage: 'new',
          status: 'active',
        })
        setDrawerRecord(null)
        await loadData()
        navigate(`/commercial/${dealType === 'lease' ? 'leasing' : 'sales'}?tab=opportunities&converted=${createdDeal.id}`)
      } catch (createError) {
        setActionError(friendlyError(createError, 'The lead could not be converted into an opportunity.'))
      }
      return
    }

    const payload = config.kind === 'deals'
      ? {
          organisation_id: organisationId,
          deal_id: record.id,
          transaction_type: record.deal_type === 'sale' ? 'sale' : 'lease',
          status: 'negotiating',
        }
      : config.kind === 'vacancies'
        ? {
            organisation_id: organisationId,
            vacancy_id: record.id,
            property_id: record.property_id || '',
            broker_id: record.broker_assignment || record.broker_id || '',
            branch_id: record.branch_id,
            team_id: record.team_id,
            transaction_type: Number(record.asking_rental) > 0 ? 'lease' : 'sale',
            status: 'draft',
            transaction_name: `${record.vacancy_name || 'Vacancy'} Transaction`,
          }
        : null
    if (!payload) return
    setActionError('')
    try {
      const transaction = await createCommercialTransaction(payload)
      navigate(`/commercial/transactions/${transaction.id}`)
    } catch (createError) {
      setActionError(friendlyError(createError, 'The commercial transaction could not be created.'))
    }
  }

  async function handleSendOnboarding(draft = {}) {
    if (!organisationId) throw new Error('Commercial organisation context is not available.')
    const onboardingContact = draft.contact || {}
    const sourceRecord = draft.sourceRecord || drawerRecord || {}
    const invitation = await createCommercialOnboardingInvitation({
      organisationId,
      clientType: draft.clientType || 'tenant',
      transactionType: draft.transactionType || 'lease',
      assetCategory: draft.assetCategory || 'office',
      sourceRecord,
      contact: onboardingContact,
      expiryDays: 30,
    })
    await loadData()
    return invitation
  }

  return (
    <div className="grid gap-5">
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{resolvedPageTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{resolvedPageDescription}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setModalState({ open: true, mode: 'create', record: null })}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]"
          >
            <Plus size={16} />
            {resolvedCreateLabel}
          </button>
          {resolvedSecondaryActions.map((action) => (
            action.to ? (
              <Link
                key={action.to}
                to={action.to}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50"
              >
                {action.label}
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                onClick={() => action.onClick?.({ records, organisationId, lookups, reload: loadData, openCreate: () => setModalState({ open: true, mode: 'create', record: null }) })}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50"
              >
                {action.label}
              </button>
            )
          ))}
        </div>
      </section>

      {tabs.length ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
          <CommercialWorkspaceTabs tabs={tabs} activeTab={activeTab} onChange={onTabChange} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.045)] lg:flex-row lg:items-center lg:justify-between">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-500">
          <Search size={16} className="shrink-0" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={resolvedSearchPlaceholder}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-[#102236] outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="grid gap-1">
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Sort</span>
            <select
              value={`${sortState.key}:${sortState.direction}`}
              onChange={(event) => {
                const [key, direction] = event.target.value.split(':')
                setSortState({ key, direction })
              }}
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
            >
              {(config.sortOptions || [
                { key: 'updated_at', direction: 'desc', label: 'Newest updated' },
                { key: 'updated_at', direction: 'asc', label: 'Oldest updated' },
              ]).map((option) => (
                <option key={`${option.key}:${option.direction}`} value={`${option.key}:${option.direction}`}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm font-semibold text-slate-500">
            {visibleRecords.length} {visibleRecords.length === 1 ? 'record' : 'records'}
          </p>
        </div>
      </section>

      <CommercialFilterBar
        filters={resolvedFilterConfigs}
        values={filters}
        onChange={(key, value) => setFilters((previous) => ({ ...previous, [key]: value }))}
        onClear={() => setFilters({})}
      />

      {actionError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{actionError}</div>
      ) : null}

      {useCardView ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {loading ? (
              <>
                {[0, 1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="h-64 animate-pulse rounded-3xl bg-slate-100" />
                ))}
              </>
            ) : error ? (
              <div className="md:col-span-2 xl:col-span-3">
                <CommercialEmptyState title="Commercial data could not be loaded" description={error} />
              </div>
            ) : paginatedRecords.length ? (
              paginatedRecords.map((row) => (
                <article key={row.id} className="grid gap-4 rounded-3xl border border-slate-200 bg-[#fbfcfe] p-5 shadow-[0_14px_34px_rgba(15,23,42,0.035)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="min-w-0 text-sm font-semibold text-[#102236]">
                        {renderCardValue(columns[0], row)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {row.listing_type ? (
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-500">
                            {String(row.listing_type).replace(/_/g, ' ')}
                          </span>
                        ) : null}
                        {row.listing_category ? (
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-500">
                            {String(row.listing_category).replace(/_/g, ' ')}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                        {row.description || row.notes || 'Commercial listing'}
                      </p>
                    </div>
                    {row.featured ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                        Featured
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {cardColumns.slice(0, 6).map((column) => (
                      <div key={column.key} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{column.label}</p>
                        <div className="mt-1 text-sm font-semibold text-[#102236]">
                          {renderCardValue(column, row)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {row.updated_at || row.created_at ? `Updated ${formatDate(row.updated_at || row.created_at)}` : ' '}
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setDrawerRecord(row)} className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                        View
                      </button>
                      <button type="button" onClick={() => setModalState({ open: true, mode: 'edit', record: row })} className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                        Edit
                      </button>
                      <button type="button" onClick={() => handleArchive(row)} className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">
                        Archive
                      </button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="md:col-span-2 xl:col-span-3">
                <CommercialEmptyState
                  title={resolvedEmptyTitle || 'No commercial records yet'}
                  description={resolvedEmptyDescription || 'Create your first record to start building this commercial workspace.'}
                  primaryActionLabel={resolvedCreateLabel}
                  onPrimaryAction={() => setModalState({ open: true, mode: 'create', record: null })}
                />
              </div>
            )}
          </div>
        </section>
      ) : (
        <CommercialTable
          columns={columns}
          rows={paginatedRecords}
          loading={loading}
          error={error}
          emptyTitle={resolvedEmptyTitle}
          emptyDescription={resolvedEmptyDescription}
          sortKey={sortState.key}
          sortDirection={sortState.direction}
          pagination={pagination}
          onSort={handleSort}
          createLabel={resolvedCreateLabel}
          onCreate={() => setModalState({ open: true, mode: 'create', record: null })}
          onView={setDrawerRecord}
          onEdit={(record) => setModalState({ open: true, mode: 'edit', record })}
          onArchive={handleArchive}
        />
      )}

      {CreateModal ? (
        <CreateModal
          open={modalState.open}
          mode={modalState.mode}
          title={config.title}
          record={modalState.record}
          lookups={lookupOptions}
          rawLookups={lookups}
          onClose={() => setModalState({ open: false, mode: 'create', record: null })}
          onSubmit={handleSave}
        />
      ) : (
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
      )}

      <CommercialRecordDrawer
        open={Boolean(drawerRecord)}
        record={drawerRecord}
        kind={config.kind}
        title={config.title}
        fields={drawerFields}
        lookups={lookupOptions}
        rawLookups={lookups}
        documentsEntityType={config.documentsEntityType}
        showHeadsOfTerms={config.showHeadsOfTerms}
        organisationId={organisationId}
        primaryActionLabel={drawerPrimaryActionLabel}
        onPrimaryAction={onDrawerPrimaryAction || (drawerPrimaryActionLabel ? (record) => void handleCreateTransaction(record) : null)}
        secondaryActionLabel={drawerOnboardingDraft?.label || ''}
        onSecondaryAction={drawerOnboardingDraft ? (record) => setOnboardingModalState({ open: true, record }) : null}
        onClose={() => setDrawerRecord(null)}
        onEdit={() => {
          setModalState({ open: true, mode: 'edit', record: drawerRecord })
          setDrawerRecord(null)
        }}
        onArchive={() => handleArchive(drawerRecord)}
        onCreateTransaction={(record) => void handleCreateTransaction(record)}
      />

      <CommercialOnboardingSendModal
        open={onboardingModalState.open}
        kind={config.kind}
        record={onboardingModalState.record}
        lookups={lookupOptions}
        onClose={() => setOnboardingModalState({ open: false, record: null })}
        onSend={handleSendOnboarding}
      />
    </div>
  )
}

export default CommercialCrudPage
