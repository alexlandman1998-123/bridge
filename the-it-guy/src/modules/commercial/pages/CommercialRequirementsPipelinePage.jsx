import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ACTIVE_STATUSES, commercialCrudConfigs, PROPERTY_TYPES, REQUIREMENT_STAGES } from '../commercialCrudConfig'
import { formatBudgetRange, formatCommercialList, formatSizeRange, labelFromValue, lookupLabel, toLookupOptions } from '../commercialPipelineHelpers'
import { formatNumber } from '../commercialFormatters'
import { getCommercialNextAction } from '../commercialPresentation'
import { normalizeCommercialLifecycleStage } from '../commercialWorkflow'
import CommercialFormModal from '../components/CommercialFormModal'
import CommercialPipelineBoard from '../components/CommercialPipelineBoard'
import CommercialPipelineCard from '../components/CommercialPipelineCard'
import CommercialPipelineFilters from '../components/CommercialPipelineFilters'
import CommercialRequirementDetailDrawer from '../components/CommercialRequirementDetailDrawer'
import {
  addCommercialNote,
  createDealFromRequirement,
  createCommercialTransaction,
  createCommercialViewing,
  getCommercialActivity,
  getCommercialDeals,
  getCommercialLookupData,
  getCommercialRequirements,
  getCommercialViewings,
  resolveCommercialOrganisationContext,
  updateCommercialRequirementStage,
  updateCommercialViewing,
} from '../services/commercialApi'

const VIEWING_STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No Show' },
]

const VIEWING_FIELDS = [
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

function uniqueOptions(rows, key) {
  return Array.from(new Set(rows.map((row) => String(row?.[key] || '').trim()).filter(Boolean))).map((value) => ({
    value,
    label: value.length > 18 ? `${value.slice(0, 8)}...` : value,
  }))
}

function recordMatchesFilters(record, filters) {
  if (filters.status && String(record.status || '') !== filters.status) return false
  if (filters.stage && normalizeCommercialLifecycleStage('requirements', record.stage, 'new') !== filters.stage) return false
  if (filters.property_type && String(record.property_type || '') !== filters.property_type) return false
  if (filters.assigned_broker && String(record.assigned_broker || '') !== filters.assigned_broker) return false
  return true
}

function CommercialRequirementsPipelinePage() {
  const navigate = useNavigate()
  const [requirements, setRequirements] = useState([])
  const [deals, setDeals] = useState([])
  const [viewings, setViewings] = useState([])
  const [lookups, setLookups] = useState({})
  const [organisationId, setOrganisationId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({})
  const [selectedRequirement, setSelectedRequirement] = useState(null)
  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [noteError, setNoteError] = useState('')
  const [movingId, setMovingId] = useState('')
  const [dealModalOpen, setDealModalOpen] = useState(false)
  const [viewingModal, setViewingModal] = useState({ open: false, record: null })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const context = await resolveCommercialOrganisationContext()
      const nextOrganisationId = context.organisationId || ''
      const [nextRequirements, nextDeals, nextViewings, nextLookups] = await Promise.all([
        nextOrganisationId ? getCommercialRequirements(nextOrganisationId) : [],
        nextOrganisationId ? getCommercialDeals(nextOrganisationId) : [],
        nextOrganisationId ? getCommercialViewings(nextOrganisationId) : [],
        nextOrganisationId ? getCommercialLookupData(nextOrganisationId) : {},
      ])
      setOrganisationId(nextOrganisationId)
      setRequirements(nextRequirements || [])
      setDeals(nextDeals || [])
      setViewings(nextViewings || [])
      setLookups(nextLookups || {})
    } catch (loadError) {
      setError(loadError?.message || 'Commercial requirements pipeline could not be loaded.')
      setRequirements([])
      setDeals([])
      setViewings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const loadActivity = useCallback(async (record) => {
    if (!record?.id || !organisationId) {
      setActivity([])
      return
    }
    setActivityLoading(true)
    setNoteError('')
    try {
      setActivity(await getCommercialActivity({ organisationId, entityType: 'commercial_requirement', entityId: record.id }))
    } catch (activityError) {
      setNoteError(activityError?.message || 'Activity could not be loaded.')
      setActivity([])
    } finally {
      setActivityLoading(false)
    }
  }, [organisationId])

  useEffect(() => {
    void loadActivity(selectedRequirement)
  }, [loadActivity, selectedRequirement])

  const lookupOptions = useMemo(() => toLookupOptions(lookups), [lookups])
  const relatedDeals = useMemo(
    () => deals.filter((deal) => selectedRequirement?.id && deal.requirement_id === selectedRequirement.id),
    [deals, selectedRequirement],
  )
  const relatedViewings = useMemo(
    () => viewings.filter((viewing) => selectedRequirement?.id && viewing.requirement_id === selectedRequirement.id),
    [selectedRequirement, viewings],
  )
  const relatedTransactions = useMemo(
    () => (lookups.transactions || []).filter((transaction) => selectedRequirement?.id && transaction.requirement_id === selectedRequirement.id),
    [lookups.transactions, selectedRequirement],
  )
  const visibleRequirements = useMemo(
    () => requirements.filter((record) => recordMatchesFilters(record, filters)),
    [filters, requirements],
  )
  const filterConfig = useMemo(() => [
    { key: 'assigned_broker', label: 'Assigned broker', options: uniqueOptions(requirements, 'assigned_broker') },
    { key: 'status', label: 'Status', options: ACTIVE_STATUSES },
    { key: 'property_type', label: 'Property type', options: PROPERTY_TYPES },
    { key: 'stage', label: 'Stage', options: REQUIREMENT_STAGES },
  ], [requirements])

  async function handleStageChange(record, nextStage) {
    if (!record?.id || record.stage === nextStage) return
    setMovingId(record.id)
    setError('')
    const previousStage = record.stage
    setRequirements((current) => current.map((item) => item.id === record.id ? { ...item, stage: nextStage } : item))
    try {
      const updated = await updateCommercialRequirementStage(record.id, nextStage, previousStage)
      setRequirements((current) => current.map((item) => item.id === record.id ? { ...item, ...updated } : item))
      if (selectedRequirement?.id === record.id) setSelectedRequirement((current) => ({ ...current, ...updated }))
    } catch (stageError) {
      setRequirements((current) => current.map((item) => item.id === record.id ? { ...item, stage: previousStage } : item))
      setError(stageError?.message || 'Requirement stage could not be updated.')
    } finally {
      setMovingId('')
    }
  }

  async function handleAddNote(body) {
    setNoteError('')
    try {
      await addCommercialNote({ organisationId, entityType: 'commercial_requirement', entityId: selectedRequirement?.id, body })
      await loadActivity(selectedRequirement)
    } catch (noteAddError) {
      setNoteError(noteAddError?.message || 'Note could not be added.')
    }
  }

  async function handleCreateDeal(payload) {
    if (!selectedRequirement) return
    await createDealFromRequirement(selectedRequirement, {
      ...payload,
      organisation_id: organisationId,
      requirement_id: selectedRequirement.id,
    })
    setDealModalOpen(false)
    await loadData()
    await loadActivity(selectedRequirement)
  }

  async function handleScheduleViewing(payload) {
    if (!selectedRequirement) return
    const created = await createCommercialViewing({
      ...payload,
      organisation_id: organisationId,
      requirement_id: selectedRequirement.id,
      company_id: payload.company_id || selectedRequirement.company_id || selectedRequirement.tenant_id,
      contact_id: payload.contact_id || selectedRequirement.contact_id || '',
      broker_id: payload.broker_id || selectedRequirement.assigned_broker || selectedRequirement.broker_id,
      branch_id: payload.branch_id || selectedRequirement.branch_id,
      team_id: payload.team_id || selectedRequirement.team_id,
    })
    setViewingModal({ open: false, record: null })
    setViewings((current) => [...current, created])
    await loadData()
    await loadActivity(selectedRequirement)
  }

  async function handleViewingStatus(viewing, status) {
    if (!viewing?.id) return
    const updated = await updateCommercialViewing(viewing.id, { status, previousRecord: viewing })
    setViewings((current) => current.map((row) => row.id === viewing.id ? updated : row))
    await loadActivity(selectedRequirement)
  }

  async function handleCreateTransaction() {
    if (!selectedRequirement) return
    setError('')
    try {
      const created = await createCommercialTransaction({
        organisation_id: organisationId,
        requirement_id: selectedRequirement.id,
        company_id: selectedRequirement.company_id || selectedRequirement.tenant_id || '',
        contact_id: selectedRequirement.contact_id || '',
        property_id: '',
        vacancy_id: '',
        listing_id: '',
        broker_id: selectedRequirement.assigned_broker || selectedRequirement.broker_id || '',
        branch_id: selectedRequirement.branch_id,
        team_id: selectedRequirement.team_id,
        transaction_type: selectedRequirement.requirement_type === 'purchase' || selectedRequirement.requirement_type === 'investment' ? 'sale' : 'lease',
        status: 'draft',
        transaction_name: `${selectedRequirement.requirement_name || 'Requirement'} Transaction`,
        notes: selectedRequirement.notes || '',
      })
      await loadData()
      navigate(`/commercial/transactions/${created.id}`)
    } catch (transactionError) {
      setError(transactionError?.message || 'Transaction could not be created from this requirement.')
    }
  }

  function openViewingModal(seed = {}) {
    if (!selectedRequirement) return
    const vacancy = (lookups.vacancies || []).find((row) => row.id === seed.vacancy_id) || {}
    const listing = (lookups.listings || []).find((row) => row.vacancy_id === seed.vacancy_id || row.id === seed.listing_id) || {}
    setViewingModal({
      open: true,
      record: {
        requirement_id: selectedRequirement.id,
        company_id: selectedRequirement.company_id || selectedRequirement.tenant_id || '',
        contact_id: selectedRequirement.contact_id || '',
        property_id: seed.property_id || vacancy.property_id || listing.property_id || '',
        vacancy_id: seed.vacancy_id || listing.vacancy_id || '',
        listing_id: seed.listing_id || listing.id || '',
        broker_id: selectedRequirement.assigned_broker || selectedRequirement.broker_id || vacancy.broker_assignment || vacancy.broker_id || listing.broker_id || '',
        status: 'scheduled',
      },
    })
  }

  const dealDraft = selectedRequirement ? {
    deal_name: `${selectedRequirement.requirement_name || 'Requirement'} Deal`,
    deal_type: selectedRequirement.requirement_type === 'purchase' || selectedRequirement.requirement_type === 'investment' ? 'sale' : 'lease',
    requirement_id: selectedRequirement.id,
    company_id: selectedRequirement.company_id,
    contact_id: selectedRequirement.contact_id,
    tenant_id: selectedRequirement.tenant_id,
    assigned_broker: selectedRequirement.assigned_broker,
    stage: 'new',
    status: 'active',
  } : null

  return (
    <div className="grid gap-5">
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link to="/commercial/requirements" className="inline-flex items-center gap-2 text-sm font-semibold text-[#1267a3]">
            <ArrowLeft size={16} />
            Requirement list
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Requirements Pipeline</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Move tenant and investor requirements through shortlisting, viewings, proposals, negotiation, and close-out.</p>
        </div>
        <button type="button" onClick={() => void loadData()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
          <RefreshCw size={16} />
          Refresh
        </button>
      </section>

      <CommercialPipelineFilters
        filters={filterConfig}
        values={filters}
        onChange={(key, value) => setFilters((previous) => ({ ...previous, [key]: value }))}
        onClear={() => setFilters({})}
      />

      <CommercialPipelineBoard
        stages={REQUIREMENT_STAGES}
        records={visibleRequirements}
        loading={loading}
        error={error}
        getStage={(record) => normalizeCommercialLifecycleStage('requirements', record.stage, 'new')}
        getStageSummary={(stageRecords) => {
          const totalGla = stageRecords.reduce((sum, record) => sum + Number(record.max_size_m2 || record.min_size_m2 || 0), 0)
          return totalGla ? `${formatNumber(totalGla, 'm²')} demand` : ''
        }}
        renderCard={(record) => (
          <CommercialPipelineCard
            key={record.id}
            title={record.requirement_name || 'Commercial requirement'}
            eyebrow={labelFromValue(record.requirement_type)}
            status={record.status}
            stage={normalizeCommercialLifecycleStage('requirements', record.stage, 'new')}
            stages={REQUIREMENT_STAGES}
            moving={movingId === record.id}
            onOpen={() => setSelectedRequirement(record)}
            onStageChange={(nextStage) => handleStageChange(record, nextStage)}
            details={[
              { label: 'Company', value: lookupLabel(lookups, 'companies', record.company_id, lookupLabel(lookups, 'tenants', record.tenant_id, labelFromValue(record.client_type))) },
              { label: 'Contact', value: lookupLabel(lookups, 'contacts', record.contact_id, '-') },
              { label: 'Type', value: labelFromValue(record.property_type) },
              { label: 'Size', value: formatSizeRange(record) },
              { label: 'Location', value: formatCommercialList(record.preferred_locations) },
              { label: 'Budget', value: formatBudgetRange(record) },
              { label: 'Broker', value: record.assigned_broker || 'Unassigned' },
              { label: 'Next', value: getCommercialNextAction('requirements', record) },
            ]}
          />
        )}
      />

      <CommercialRequirementDetailDrawer
        open={Boolean(selectedRequirement)}
        record={selectedRequirement}
        organisationId={organisationId}
        lookups={lookups}
        relatedDeals={relatedDeals}
        relatedViewings={relatedViewings}
        relatedTransactions={relatedTransactions}
        activity={activity}
        activityLoading={activityLoading}
        noteError={noteError}
        onClose={() => setSelectedRequirement(null)}
        onCreateDeal={() => setDealModalOpen(true)}
        onCreateTransaction={() => void handleCreateTransaction()}
        onScheduleViewing={openViewingModal}
        onViewingStatusChange={handleViewingStatus}
        onAddNote={handleAddNote}
        onActivityChange={() => loadActivity(selectedRequirement)}
      />

      <CommercialFormModal
        open={dealModalOpen}
        mode="create"
        title="Deal from requirement"
        fields={commercialCrudConfigs.deals.fields}
        record={dealDraft}
        lookups={lookupOptions}
        onClose={() => setDealModalOpen(false)}
        onSubmit={handleCreateDeal}
      />

      <CommercialFormModal
        open={viewingModal.open}
        mode="create"
        title="Schedule Viewing"
        fields={VIEWING_FIELDS}
        record={viewingModal.record}
        lookups={lookupOptions}
        onClose={() => setViewingModal({ open: false, record: null })}
        onSubmit={handleScheduleViewing}
      />
    </div>
  )
}

export default CommercialRequirementsPipelinePage
