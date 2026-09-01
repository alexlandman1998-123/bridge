import { Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { propertyDataProvider } from '../../services/propertyIntelligence/propertyDataProvider'
import { PROPERTY_REPORT_TYPE_LIST } from '../../services/propertyIntelligence/propertyDataProviderContract'
import MockParcelMap from './MockParcelMap'
import PropertyReportBasket from './PropertyReportBasket'

const INITIAL_FILTERS = Object.freeze({ query: '', area: '', propertyType: '', transferPeriod: '', valueRange: '' })
const FILTER_CLASS = 'min-h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

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
  const orderRunRef = useRef(0)

  useEffect(() => {
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

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-canvassing-workspace="property-search">
      <div className="grid min-h-[680px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-[580px] min-w-0 flex-col border-b border-slate-200 xl:border-b-0 xl:border-r">
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
              <span className="inline-flex items-center gap-1.5"><SlidersHorizontal size={14} />{activeFilterCount ? `${activeFilterCount} active ${activeFilterCount === 1 ? 'filter' : 'filters'}` : propertyDataProvider.isDemoData ? 'Showing the full fictional demonstration area' : 'Showing the current provider area'}</span>
              <span>{propertyState.status === 'error' ? propertyState.error : `${propertyState.total} matching properties`}</span>
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
