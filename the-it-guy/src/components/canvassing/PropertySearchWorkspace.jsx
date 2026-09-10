import { Info, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { propertyDataProvider } from '../../services/propertyIntelligence/propertyDataProvider'
import { PROPERTY_REPORT_TYPE_LIST } from '../../services/propertyIntelligence/propertyDataProviderContract'
import { getKnowledgeFactoryMapStatus, searchKnowledgeFactoryMap } from '../../services/propertyIntelligence/knowledgeFactoryMapService'
import KnowledgeFactoryParcelMap from './KnowledgeFactoryParcelMap'
import MockParcelMap from './MockParcelMap'
import PropertyReportBasket from './PropertyReportBasket'

const INITIAL_FILTERS = Object.freeze({ query: '', area: '', propertyType: '', transferPeriod: '', valueRange: '' })
const FILTER_CLASS = 'min-h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const KNOWLEDGE_FACTORY_MAP_ENABLED = String(import.meta.env.VITE_KNOWLEDGE_FACTORY_MAP_ENABLED || '').trim().toLowerCase() === 'true'

function providerFilters(filters) {
  const nextFilters = { query: filters.query, area: filters.area, propertyType: filters.propertyType, limit: 500 }
  if (filters.transferPeriod === 'since-2022') nextFilters.transferDateFrom = '2022-01-01'
  if (filters.transferPeriod === 'since-2020') nextFilters.transferDateFrom = '2020-01-01'
  if (filters.valueRange === 'under-2m') nextFilters.maxValue = 2000000
  if (filters.valueRange === '2m-4m') {
    nextFilters.minValue = 2000000
    nextFilters.maxValue = 4000000
  }
  if (filters.valueRange === 'over-4m') nextFilters.minValue = 4000000
  return nextFilters
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export default function PropertySearchWorkspace() {
  const navigate = useNavigate()
  const { currentWorkspace, profile } = useWorkspace()
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [propertyState, setPropertyState] = useState({ status: 'loading', properties: [], total: 0, error: '' })
  const [focusedPropertyId, setFocusedPropertyId] = useState('')
  const [selectedProperties, setSelectedProperties] = useState([])
  const [selectedReportTypeIds, setSelectedReportTypeIds] = useState(() => PROPERTY_REPORT_TYPE_LIST.map((reportType) => reportType.id))
  const [quoteState, setQuoteState] = useState({ status: 'idle', quote: null, error: '' })
  const [orderState, setOrderState] = useState({ status: 'idle', order: null, error: '' })
  const [mapPurpose, setMapPurpose] = useState('Canvassing potential seller opportunities')
  const [knowledgeFactoryState, setKnowledgeFactoryState] = useState({ status: KNOWLEDGE_FACTORY_MAP_ENABLED ? 'loading' : 'inactive', properties: [], count: 0, error: '', message: '' })
  const orderRunRef = useRef(0)
  const organisationId = currentWorkspace?.organisationId || currentWorkspace?.organisation_id || currentWorkspace?.id || ''

  useEffect(() => {
    if (KNOWLEDGE_FACTORY_MAP_ENABLED) return undefined
    let active = true
    const timer = window.setTimeout(() => {
      setPropertyState((previous) => ({ ...previous, status: 'loading', error: '' }))
      propertyDataProvider.getPropertiesInBounds(propertyDataProvider.defaultBounds, providerFilters(filters))
        .then((result) => {
          if (active) setPropertyState({ status: 'ready', properties: result.items, total: result.total, error: '' })
        })
        .catch((error) => {
          if (active) setPropertyState({ status: 'error', properties: [], total: 0, error: error?.message || 'Property data is unavailable.' })
        })
    }, 180)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [filters])

  useEffect(() => {
    if (!KNOWLEDGE_FACTORY_MAP_ENABLED || !organisationId) return undefined
    let active = true
    getKnowledgeFactoryMapStatus({ organisationId })
      .then((status) => {
        if (!active) return
        setKnowledgeFactoryState((previous) => ({ ...previous, status: status.livePropertySearchEnabled ? 'ready' : 'blocked', message: status.message || '', error: '' }))
      })
      .catch((error) => {
        if (active) setKnowledgeFactoryState((previous) => ({ ...previous, status: 'error', error: error?.message || 'Property intelligence is unavailable.' }))
      })
    return () => { active = false }
  }, [organisationId])

  const selectedPropertyIds = useMemo(() => selectedProperties.map((property) => property.id), [selectedProperties])
  const focusedProperty = useMemo(() => propertyState.properties.find((property) => property.id === focusedPropertyId) || null, [focusedPropertyId, propertyState.properties])
  const availableAreas = useMemo(() => [...new Set(propertyState.properties.map((property) => property.suburb).filter(Boolean))].sort(), [propertyState.properties])
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key !== 'query' && Boolean(value)).length
  const propertySelectionSignature = selectedPropertyIds.join('|')
  const reportSelectionSignature = selectedReportTypeIds.join('|')
  const isOrdering = ['submitting', 'queued', 'processing'].includes(orderState.status)

  useEffect(() => {
    let active = true
    orderRunRef.current += 1
    setOrderState({ status: 'idle', order: null, error: '' })
    if (!selectedPropertyIds.length || !selectedReportTypeIds.length) {
      setQuoteState({ status: 'idle', quote: null, error: '' })
      return () => {
        active = false
      }
    }

    setQuoteState({ status: 'loading', quote: null, error: '' })
    propertyDataProvider.priceReports({ propertyIds: selectedPropertyIds, reportTypes: selectedReportTypeIds })
      .then((quote) => {
        if (active) setQuoteState({ status: 'ready', quote, error: '' })
      })
      .catch((error) => {
        if (active) setQuoteState({ status: 'error', quote: null, error: error?.message || 'Unable to price the selected reports.' })
      })
    return () => {
      active = false
    }
  }, [propertySelectionSignature, reportSelectionSignature])

  useEffect(() => () => {
    orderRunRef.current += 1
  }, [])

  function updateFilter(key, value) {
    setFilters((previous) => ({ ...previous, [key]: value }))
  }

  function toggleProperty(property) {
    if (isOrdering) return
    setSelectedProperties((previous) => previous.some((selected) => selected.id === property.id)
      ? previous.filter((selected) => selected.id !== property.id)
      : [...previous, property])
  }

  function removeProperty(propertyId) {
    if (isOrdering) return
    setSelectedProperties((previous) => previous.filter((property) => property.id !== propertyId))
  }

  function toggleReportType(reportTypeId) {
    if (isOrdering) return
    setSelectedReportTypeIds((previous) => previous.includes(reportTypeId)
      ? previous.filter((selectedId) => selectedId !== reportTypeId)
      : [...previous, reportTypeId])
  }

  async function requestPropertyReports() {
    if (!selectedPropertyIds.length || !selectedReportTypeIds.length || quoteState.status !== 'ready') return
    const runId = orderRunRef.current + 1
    orderRunRef.current = runId
    try {
      setOrderState({ status: 'submitting', order: null, error: '' })
      const order = await propertyDataProvider.requestReports({
        organisationId: currentWorkspace?.id || '',
        requestedBy: profile?.id || profile?.userId || profile?.email || '',
        requestedByName: profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.email || 'Demo agent',
        propertyIds: selectedPropertyIds,
        reportTypes: selectedReportTypeIds,
      })
      if (orderRunRef.current !== runId) return
      setOrderState({ status: order.status || 'queued', order, error: '' })

      for (let attempt = 0; attempt < 8; attempt += 1) {
        await delay(400)
        if (orderRunRef.current !== runId) return
        const orders = await propertyDataProvider.getReportOrders({ organisationId: currentWorkspace?.id || '' })
        const refreshedOrder = orders.items.find((item) => item.id === order.id)
        if (!refreshedOrder) throw new Error('The property report order could not be refreshed.')
        setOrderState({ status: refreshedOrder.status, order: refreshedOrder, error: '' })
        if (refreshedOrder.status === 'ready') return
      }
      throw new Error('The property reports took too long to generate. Please try again.')
    } catch (error) {
      if (orderRunRef.current === runId) setOrderState({ status: 'error', order: null, error: error?.message || 'Unable to generate property reports.' })
    }
  }

  async function searchMapArea(bounds) {
    if (knowledgeFactoryState.status === 'loading') return
    try {
      setKnowledgeFactoryState((previous) => ({ ...previous, status: 'searching', error: '' }))
      const result = await searchKnowledgeFactoryMap({ organisationId, purpose: mapPurpose, bounds })
      setFocusedPropertyId('')
      setKnowledgeFactoryState({ status: 'ready', properties: result.items || [], count: Number(result.count || 0), error: '', message: result.count ? '' : 'No mapped parcels were returned for this area.' })
    } catch (error) {
      setKnowledgeFactoryState((previous) => ({ ...previous, status: 'error', error: error?.message || 'Property intelligence is unavailable.' }))
    }
  }

  if (KNOWLEDGE_FACTORY_MAP_ENABLED) {
    const focusedParcel = knowledgeFactoryState.properties.find((property) => property.id === focusedPropertyId) || null
    const blocked = ['blocked', 'error'].includes(knowledgeFactoryState.status)
    return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:h-[calc(100dvh-14.5rem)] xl:min-h-[620px] xl:max-h-[760px]" data-canvassing-workspace="knowledge-factory-map">
      <div className="flex min-h-[680px] flex-col xl:h-full xl:min-h-0">
        <div className="border-b border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><label className="block min-w-[min(100%,420px)] flex-1"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Business purpose for this lookup</span><input value={mapPurpose} onChange={(event) => setMapPurpose(event.target.value)} maxLength={500} className={`${FILTER_CLASS} w-full font-normal`} placeholder="e.g. Canvassing potential seller opportunities" /></label><span className="max-w-sm text-xs leading-5 text-slate-500">Parcel-only map search. Each search is permission-checked, cost-audited, and capped at 25 results.</span></div>
          {knowledgeFactoryState.message || knowledgeFactoryState.error ? <p role="status" className={`mt-3 text-sm ${knowledgeFactoryState.error ? 'text-rose-700' : 'text-slate-600'}`}>{knowledgeFactoryState.error || knowledgeFactoryState.message}</p> : null}
        </div>
        {blocked ? <div className="grid min-h-[520px] flex-1 place-items-center bg-slate-50 p-6 text-center"><div className="max-w-md"><h3 className="font-semibold text-slate-900">Property intelligence is not available</h3><p className="mt-2 text-sm leading-6 text-slate-600">{knowledgeFactoryState.error || knowledgeFactoryState.message || 'Your organisation needs an approved Knowledge Factory entitlement and named-user permission.'}</p></div></div> : <KnowledgeFactoryParcelMap properties={knowledgeFactoryState.properties} loading={knowledgeFactoryState.status === 'searching'} focusedProperty={focusedParcel} onFocusProperty={(property) => setFocusedPropertyId(property?.id || '')} onSearchArea={searchMapArea} onPrepareReport={(property) => navigate('/pipeline/canvassing/property-reports', { state: { propertyId: property?.propertyId || property?.id || '' } })} />}
      </div>
    </section>
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:h-[calc(100dvh-14.5rem)] xl:min-h-[620px] xl:max-h-[760px]" data-canvassing-workspace="property-search">
      <div className="grid min-h-[680px] xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-[580px] min-w-0 flex-col border-b border-slate-200 xl:min-h-0 xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-200 bg-white p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_repeat(4,minmax(130px,auto))]">
              <label className="relative block">
                <span className="sr-only">Search properties</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input type="search" value={filters.query} onChange={(event) => updateFilter('query', event.target.value)} placeholder="Search address, suburb, estate or erf number" className={`${FILTER_CLASS} w-full pl-10 font-normal`} />
              </label>
              <select aria-label="Filter by area" value={filters.area} onChange={(event) => updateFilter('area', event.target.value)} className={FILTER_CLASS}>
                <option value="">All areas</option>{availableAreas.map((area) => <option key={area} value={area}>{area}</option>)}
              </select>
              <select aria-label="Filter by property type" value={filters.propertyType} onChange={(event) => updateFilter('propertyType', event.target.value)} className={FILTER_CLASS}>
                <option value="">Property type</option><option value="House">House</option><option value="Townhouse">Townhouse</option><option value="Apartment">Apartment</option><option value="Vacant Land">Vacant land</option>
              </select>
              <select aria-label="Filter by transfer date" value={filters.transferPeriod} onChange={(event) => updateFilter('transferPeriod', event.target.value)} className={FILTER_CLASS}>
                <option value="">Transfer date</option><option value="since-2022">Since 2022</option><option value="since-2020">Since 2020</option>
              </select>
              <select aria-label="Filter by value range" value={filters.valueRange} onChange={(event) => updateFilter('valueRange', event.target.value)} className={FILTER_CLASS}>
                <option value="">Value range</option><option value="under-2m">Under R2m</option><option value="2m-4m">R2m – R4m</option><option value="over-4m">R4m+</option>
              </select>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <div className="flex flex-wrap items-center gap-2.5">
                <span>{propertyState.status === 'error' ? propertyState.error : `${propertyState.total} matching properties`}</span>
                {propertyDataProvider.isDemoData ? (
                  <span className="group relative inline-flex" data-property-provider-mode={propertyDataProvider.mode}>
                    <button type="button" className="inline-flex min-h-7 items-center gap-1 rounded-lg bg-blue-50 px-2 text-[0.66rem] font-bold tracking-[0.04em] text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-200" aria-describedby="canvassing-demo-data-tooltip">DEMO DATA <Info size={13} /></button>
                    <span id="canvassing-demo-data-tooltip" role="tooltip" className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-slate-950 px-3 py-2 text-xs font-medium leading-5 text-white opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-within:opacity-100">Demonstration property intelligence. Records are fictional and no live provider charges apply.</span>
                  </span>
                ) : null}
              </div>
              <span className="inline-flex items-center gap-1.5"><SlidersHorizontal size={14} />{activeFilterCount ? `${activeFilterCount} active ${activeFilterCount === 1 ? 'filter' : 'filters'}` : 'Showing the current property area'}</span>
            </div>
          </div>

          <MockParcelMap properties={propertyState.properties} bounds={propertyDataProvider.defaultBounds} focusedProperty={focusedProperty} selectedPropertyIds={selectedPropertyIds} isDemoData={propertyDataProvider.isDemoData} loading={propertyState.status === 'loading'} onFocusProperty={(property) => setFocusedPropertyId(property?.id || '')} onToggleProperty={toggleProperty} />
        </div>

        <PropertyReportBasket
          properties={selectedProperties}
          reportTypes={PROPERTY_REPORT_TYPE_LIST}
          selectedReportTypeIds={selectedReportTypeIds}
          quote={quoteState.quote}
          quoteStatus={quoteState.status}
          quoteError={quoteState.error}
          orderState={orderState}
          isDemoData={propertyDataProvider.isDemoData}
          onRemoveProperty={removeProperty}
          onClear={() => {
            if (!isOrdering) setSelectedProperties([])
          }}
          onToggleReportType={toggleReportType}
          onRequestReports={requestPropertyReports}
          onViewReports={() => navigate('/pipeline/canvassing/property-reports')}
        />
      </div>
    </section>
  )
}
