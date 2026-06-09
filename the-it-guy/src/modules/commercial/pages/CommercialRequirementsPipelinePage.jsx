import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
  getCommercialActivity,
  getCommercialDeals,
  getCommercialLookupData,
  getCommercialRequirements,
  resolveCommercialOrganisationContext,
  updateCommercialRequirementStage,
} from '../services/commercialApi'

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
  const [requirements, setRequirements] = useState([])
  const [deals, setDeals] = useState([])
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

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const context = await resolveCommercialOrganisationContext()
      const nextOrganisationId = context.organisationId || ''
      const [nextRequirements, nextDeals, nextLookups] = await Promise.all([
        nextOrganisationId ? getCommercialRequirements(nextOrganisationId) : [],
        nextOrganisationId ? getCommercialDeals(nextOrganisationId) : [],
        nextOrganisationId ? getCommercialLookupData(nextOrganisationId) : {},
      ])
      setOrganisationId(nextOrganisationId)
      setRequirements(nextRequirements || [])
      setDeals(nextDeals || [])
      setLookups(nextLookups || {})
    } catch (loadError) {
      setError(loadError?.message || 'Commercial requirements pipeline could not be loaded.')
      setRequirements([])
      setDeals([])
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

  const dealDraft = selectedRequirement ? {
    deal_name: `${selectedRequirement.requirement_name || 'Requirement'} Deal`,
    deal_type: selectedRequirement.requirement_type === 'purchase' || selectedRequirement.requirement_type === 'investment' ? 'sale' : 'lease',
    requirement_id: selectedRequirement.id,
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
              { label: 'Client', value: lookupLabel(lookups, 'tenants', record.tenant_id, labelFromValue(record.client_type)) },
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
        activity={activity}
        activityLoading={activityLoading}
        noteError={noteError}
        onClose={() => setSelectedRequirement(null)}
        onCreateDeal={() => setDealModalOpen(true)}
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
    </div>
  )
}

export default CommercialRequirementsPipelinePage
