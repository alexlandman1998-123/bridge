import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ACTIVE_STATUSES, DEAL_STAGES, PROPERTY_TYPES } from '../commercialCrudConfig'
import { formatCommercialDate, labelFromValue, lookupLabel } from '../commercialPipelineHelpers'
import { formatCurrency } from '../commercialFormatters'
import { getCommercialNextAction } from '../commercialPresentation'
import { normalizeCommercialLifecycleStage } from '../commercialWorkflow'
import CommercialDealDetailDrawer from '../components/CommercialDealDetailDrawer'
import CommercialPipelineBoard from '../components/CommercialPipelineBoard'
import CommercialPipelineCard from '../components/CommercialPipelineCard'
import CommercialPipelineFilters from '../components/CommercialPipelineFilters'
import {
  addCommercialNote,
  getCommercialActivity,
  getCommercialDeals,
  getCommercialLookupData,
  resolveCommercialOrganisationContext,
  updateCommercialDealStage,
} from '../services/commercialApi'

const DEAL_TYPES = [
  { value: 'lease', label: 'Lease' },
  { value: 'sale', label: 'Sale' },
]

function uniqueOptions(rows, key) {
  return Array.from(new Set(rows.map((row) => String(row?.[key] || '').trim()).filter(Boolean))).map((value) => ({
    value,
    label: value.length > 18 ? `${value.slice(0, 8)}...` : value,
  }))
}

function propertyTypeForDeal(deal, lookups) {
  const property = (lookups?.properties || []).find((row) => row.id === deal.property_id)
  return property?.property_type || ''
}

function dateWithinRange(value, from, to) {
  if (!from && !to) return true
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  if (from) {
    const fromDate = new Date(from)
    if (!Number.isNaN(fromDate.getTime()) && date < fromDate) return false
  }
  if (to) {
    const toDate = new Date(to)
    if (!Number.isNaN(toDate.getTime()) && date > toDate) return false
  }
  return true
}

function recordMatchesFilters(record, filters, lookups) {
  if (filters.assigned_broker && String(record.assigned_broker || '') !== filters.assigned_broker) return false
  if (filters.status && String(record.status || '') !== filters.status) return false
  if (filters.deal_type && String(record.deal_type || '') !== filters.deal_type) return false
  if (filters.stage && normalizeCommercialLifecycleStage('deals', record.stage, 'new') !== filters.stage) return false
  if (filters.property_type && propertyTypeForDeal(record, lookups) !== filters.property_type) return false
  if (!dateWithinRange(record.expected_close_date, filters.expected_close_from, filters.expected_close_to)) return false
  return true
}

function CommercialDealsPipelinePage() {
  const [deals, setDeals] = useState([])
  const [lookups, setLookups] = useState({})
  const [organisationId, setOrganisationId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({})
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [noteError, setNoteError] = useState('')
  const [movingId, setMovingId] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const context = await resolveCommercialOrganisationContext()
      const nextOrganisationId = context.organisationId || ''
      const [nextDeals, nextLookups] = await Promise.all([
        nextOrganisationId ? getCommercialDeals(nextOrganisationId) : [],
        nextOrganisationId ? getCommercialLookupData(nextOrganisationId) : {},
      ])
      setOrganisationId(nextOrganisationId)
      setDeals(nextDeals || [])
      setLookups(nextLookups || {})
    } catch (loadError) {
      setError(loadError?.message || 'Commercial deals pipeline could not be loaded.')
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
      setActivity(await getCommercialActivity({ organisationId, entityType: 'commercial_deal', entityId: record.id }))
    } catch (activityError) {
      setNoteError(activityError?.message || 'Activity could not be loaded.')
      setActivity([])
    } finally {
      setActivityLoading(false)
    }
  }, [organisationId])

  useEffect(() => {
    void loadActivity(selectedDeal)
  }, [loadActivity, selectedDeal])

  const visibleDeals = useMemo(
    () => deals.filter((record) => recordMatchesFilters(record, filters, lookups)),
    [deals, filters, lookups],
  )
  const filterConfig = useMemo(() => [
    { key: 'assigned_broker', label: 'Assigned broker', options: uniqueOptions(deals, 'assigned_broker') },
    { key: 'status', label: 'Status', options: ACTIVE_STATUSES },
    { key: 'property_type', label: 'Property type', options: PROPERTY_TYPES },
    { key: 'deal_type', label: 'Deal type', options: DEAL_TYPES },
    { key: 'stage', label: 'Stage', options: DEAL_STAGES },
    { key: 'expected_close_from', label: 'Close from', type: 'date' },
    { key: 'expected_close_to', label: 'Close to', type: 'date' },
  ], [deals])

  async function handleStageChange(record, nextStage) {
    if (!record?.id || record.stage === nextStage) return
    setMovingId(record.id)
    setError('')
    const previousStage = record.stage
    setDeals((current) => current.map((item) => item.id === record.id ? { ...item, stage: nextStage } : item))
    try {
      const updated = await updateCommercialDealStage(record.id, nextStage, previousStage)
      setDeals((current) => current.map((item) => item.id === record.id ? { ...item, ...updated } : item))
      if (selectedDeal?.id === record.id) setSelectedDeal((current) => ({ ...current, ...updated }))
    } catch (stageError) {
      setDeals((current) => current.map((item) => item.id === record.id ? { ...item, stage: previousStage } : item))
      setError(stageError?.message || 'Deal stage could not be updated.')
    } finally {
      setMovingId('')
    }
  }

  async function handleAddNote(body) {
    setNoteError('')
    try {
      await addCommercialNote({ organisationId, entityType: 'commercial_deal', entityId: selectedDeal?.id, body })
      await loadActivity(selectedDeal)
    } catch (noteAddError) {
      setNoteError(noteAddError?.message || 'Note could not be added.')
    }
  }

  return (
    <div className="grid gap-5">
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link to="/commercial/deals" className="inline-flex items-center gap-2 text-sm font-semibold text-[#1267a3]">
            <ArrowLeft size={16} />
            Deal list
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Deals Pipeline</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Progress commercial lease and sale deals through proposal, heads of terms, lease draft, signed, and close-out stages.</p>
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
        stages={DEAL_STAGES}
        records={visibleDeals}
        loading={loading}
        error={error}
        getStage={(record) => normalizeCommercialLifecycleStage('deals', record.stage, 'new')}
        getStageSummary={(stageRecords) => {
          const totalValue = stageRecords.reduce((sum, record) => sum + Number(record.deal_value || 0), 0)
          return totalValue ? `${formatCurrency(totalValue)} pipeline` : ''
        }}
        renderCard={(record) => (
          <CommercialPipelineCard
            key={record.id}
            title={record.deal_name || 'Commercial deal'}
            eyebrow={labelFromValue(record.deal_type)}
            tone={record.deal_type === 'sale' ? 'amber' : 'green'}
            status={record.status}
            stage={normalizeCommercialLifecycleStage('deals', record.stage, 'new')}
            stages={DEAL_STAGES}
            moving={movingId === record.id}
            onOpen={() => setSelectedDeal(record)}
            onStageChange={(nextStage) => handleStageChange(record, nextStage)}
            details={[
              { label: 'Tenant', value: lookupLabel(lookups, 'tenants', record.tenant_id) },
              { label: 'Landlord', value: lookupLabel(lookups, 'landlords', record.landlord_id) },
              { label: 'Property', value: lookupLabel(lookups, 'properties', record.property_id) },
              { label: 'Value', value: formatCurrency(record.deal_value) },
              { label: 'Commission', value: formatCurrency(record.estimated_commission) },
              { label: 'Close', value: formatCommercialDate(record.expected_close_date) },
              { label: 'Next', value: getCommercialNextAction('deals', record) },
            ]}
          />
        )}
      />

      <CommercialDealDetailDrawer
        open={Boolean(selectedDeal)}
        record={selectedDeal}
        organisationId={organisationId}
        lookups={lookups}
        activity={activity}
        activityLoading={activityLoading}
        noteError={noteError}
        onClose={() => setSelectedDeal(null)}
        onAddNote={handleAddNote}
        onActivityChange={() => loadActivity(selectedDeal)}
      />
    </div>
  )
}

export default CommercialDealsPipelinePage
