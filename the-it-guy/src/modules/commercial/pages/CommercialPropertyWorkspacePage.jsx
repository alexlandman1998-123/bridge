import { Activity, ArrowLeft, Building2, DoorOpen, FileText, Handshake, LayoutList, MapPinned, Radar } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CommercialDocumentLibrary from '../components/CommercialDocumentLibrary'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialLandlordOnboardingAction from '../components/CommercialLandlordOnboardingAction'
import CommercialOnboardingSendAction from '../components/CommercialOnboardingSendAction'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import { buildCommercialCanvassingPath } from '../commercialCanvassingLinks'
import { buildCommercialDocumentGeneratorPath } from '../../../services/documents/commercialDocumentAdapterService'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialActivity, getCommercialLookupData } from '../services/commercialApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

const TABS = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'vacancies', label: 'Vacancies', icon: DoorOpen },
  { id: 'listings', label: 'Listings', icon: LayoutList },
  { id: 'transactions', label: 'Transactions', icon: Handshake },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'activity', label: 'Activity', icon: Activity },
]

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function resolvePropertyAssetCategory(propertyType = '') {
  const normalized = String(propertyType || '').toLowerCase()
  if (normalized.includes('industrial')) return 'industrial'
  if (normalized.includes('retail') || normalized.includes('centre') || normalized.includes('mall')) return 'retail'
  if (normalized.includes('agricultural') || normalized.includes('farm')) return 'agricultural'
  return 'office'
}

function daysBetween(startValue, endValue = new Date()) {
  const start = startValue ? new Date(startValue) : null
  const end = endValue ? new Date(endValue) : null
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000))
}

function categoryRows(property = {}) {
  const numeric = (value, suffix = '') => (value || value === 0 ? formatNumber(value, suffix) : null)
  const boolean = (value) => (typeof value === 'boolean' ? (value ? 'Yes' : 'No') : null)
  const rows = [
    ['Building Grade', property.building_grade],
    ['Parking Ratio', property.parking_ratio],
    ['Backup Power', boolean(property.backup_power)],
    ['Generator', boolean(property.generator)],
    ['Solar', boolean(property.solar)],
    ['Fibre', boolean(property.fibre)],
    ['Number Of Lifts', numeric(property.number_of_lifts)],
    ['Amenities', property.amenities],
    ['Power Supply', property.power_supply],
    ['Yard Size', numeric(property.yard_size_m2, 'm²')],
    ['Eaves Height', numeric(property.eaves_height_m, 'm')],
    ['Roller Doors', numeric(property.roller_doors)],
    ['Truck Access', boolean(property.truck_access)],
    ['Sprinklers', boolean(property.sprinklers)],
    ['Warehouse Area', numeric(property.warehouse_area_m2, 'm²')],
    ['Office Area', numeric(property.office_area_m2, 'm²')],
    ['Frontage', numeric(property.frontage_m, 'm')],
    ['Anchor Tenants', property.anchor_tenants],
    ['Foot Traffic', property.foot_traffic],
    ['Trading Hours', property.trading_hours],
    ['Mall Type', property.mall_type],
    ['Visibility Rating', property.visibility_rating],
    ['NOI', property.noi || property.noi === 0 ? formatCurrency(property.noi) : null],
    ['Cap Rate', property.cap_rate ? `${formatNumber(property.cap_rate)}%` : '-'],
    ['WALE', property.wale_months ? `${formatNumber(property.wale_months)} months` : '-'],
    ['Gross Yield', property.gross_yield ? `${formatNumber(property.gross_yield)}%` : '-'],
    ['Net Yield', property.net_yield ? `${formatNumber(property.net_yield)}%` : '-'],
    ['Annual Income', property.annual_income || property.annual_income === 0 ? formatCurrency(property.annual_income) : null],
    ['Land Size', numeric(property.land_size_m2, 'm²')],
    ['Bulk', property.bulk],
    ['Coverage', property.coverage],
    ['Services Available', property.services_available],
    ['Environmental Status', property.environmental_status],
    ['Farm Size', numeric(property.farm_size_ha, 'ha')],
    ['Water Rights', property.water_rights],
    ['Irrigation', property.irrigation],
    ['Crop Type', property.crop_type],
    ['Livestock Capacity', property.livestock_capacity],
  ]
  return rows.filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== '-')
}

async function getPropertyWorkspaceData(organisationId, propertyId) {
  const lookups = await getCommercialLookupData(organisationId)
  const property = (lookups.properties || []).find((row) => row.id === propertyId) || null
  const vacancies = (lookups.vacancies || []).filter((row) => row.property_id === propertyId)
  const listings = (lookups.listings || []).filter((row) => row.property_id === propertyId)
  const deals = (lookups.deals || []).filter((row) => row.property_id === propertyId)
  const transactions = (lookups.transactions || []).filter((row) => row.property_id === propertyId)
  const viewings = (lookups.viewings || []).filter((row) => row.property_id === propertyId)
  const activityGroups = await Promise.all([
    getCommercialActivity({ organisationId, entityType: 'commercial_property', entityId: propertyId }),
    ...vacancies.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_vacancy', entityId: row.id })),
    ...listings.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_listing', entityId: row.id })),
    ...transactions.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_transaction', entityId: row.id })),
  ])
  const activity = activityGroups.flat().filter(Boolean).sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
  return { property, vacancies, listings, deals, transactions, viewings, activity, lookups }
}

function KpiCard({ label, value, detail }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  )
}

function DetailGrid({ rows = [] }) {
  return (
    <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
          <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</dt>
          <dd className="mt-1 text-sm font-semibold text-[#102236]">{value || '-'}</dd>
        </div>
      ))}
    </dl>
  )
}

function LinkedList({ rows = [], empty, to, renderTitle, renderDetail, renderMeta }) {
  if (!rows.length) return <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{empty}</p>
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <Link key={row.id} to={typeof to === 'function' ? to(row) : to} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#102236]">{renderTitle(row)}</p>
              <p className="mt-1 truncate text-sm text-slate-500">{renderDetail(row)}</p>
            </div>
            {renderMeta ? <span className="shrink-0 text-xs font-semibold text-slate-400">{renderMeta(row)}</span> : null}
          </div>
        </Link>
      ))}
    </div>
  )
}

function ActivityList({ rows = [] }) {
  if (!rows.length) return <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No property activity has been recorded yet.</p>
  return (
    <div className="grid gap-3">
      {rows.map((item) => (
        <article key={item.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
          <p className="text-sm font-semibold text-[#102236]">{item.title || titleize(item.activity_type)}</p>
          <p className="mt-1 text-sm text-slate-500">{item.body || '-'}</p>
          <p className="mt-2 text-xs font-semibold text-slate-400">{formatDate(item.created_at)}</p>
        </article>
      ))}
    </div>
  )
}

function CommercialPropertyWorkspacePage() {
  const { propertyId } = useParams()
  const [activeTab, setActiveTab] = useState('overview')
  const fetcher = useMemo(() => (organisationId) => getPropertyWorkspaceData(organisationId, propertyId), [propertyId])
  const { data, loading, error, organisationId } = useCommercialData(fetcher, [fetcher])
  const property = data?.property || null

  if (error) return <CommercialEmptyState title="Commercial property could not be loaded" description={error} />
  if (loading) return <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
  if (!property) return <CommercialEmptyState title="Property not found" description="This commercial property may have been archived or sits outside your current scope." />

  const landlord = (data?.lookups?.landlords || []).find((row) => row.id === property.landlord_id) || null
  const activeVacancies = (data?.vacancies || []).filter((row) => !['occupied', 'archived', 'withdrawn'].includes(String(row.status || '').toLowerCase()))
  const activeListings = (data?.listings || []).filter((row) => !['closed', 'archived', 'withdrawn', 'expired'].includes(String(row.listing_status || '').toLowerCase()))
  const activeTransactions = (data?.transactions || []).filter((row) => !['completed', 'lost', 'cancelled'].includes(String(row.status || '').toLowerCase()))
  const totalGla = toNumber(property.gla_m2)
  const availableGla = (data?.vacancies || []).length
    ? activeVacancies.reduce((sum, row) => sum + toNumber(row.available_area_m2), 0)
    : toNumber(property.available_space_m2)
  const occupancyPct = totalGla ? Math.max(0, Math.round(((totalGla - availableGla) / totalGla) * 1000) / 10) : 0
  const vacancyPct = totalGla ? Math.max(0, Math.round((availableGla / totalGla) * 1000) / 10) : toNumber(property.vacancy_percentage)
  const activeViewings = (data?.viewings || []).filter((row) => !['completed', 'cancelled', 'no_show'].includes(String(row.status || '').toLowerCase()))
  const avgVacancyDuration = activeVacancies.length
    ? Math.round(activeVacancies.reduce((total, row) => total + (daysBetween(row.availability_date || row.created_at) || 0), 0) / activeVacancies.length)
    : 0
  const leasingVelocity = activeVacancies.length
    ? Math.round(((data?.deals || []).filter((row) => row.property_id === property.id).length / activeVacancies.length) * 100)
    : 0
  const canvassingPath = buildCommercialCanvassingPath({
    companyName: landlord?.name || property.property_name,
    area: [property.suburb, property.city].filter(Boolean).join(', ') || property.address || property.property_name,
    propertyType: property.property_type,
    propertyId: property.id,
    linkedEntityType: 'commercial_property',
    linkedEntityId: property.id,
    followUpNote: `Follow up from ${property.property_name}`,
  })
  const overviewRows = [
    ['Property Name', property.property_name],
    ['Property Type', titleize(property.property_type)],
    ['Owner', landlord?.name || 'Landlord pending'],
    ['Location', [property.address, property.suburb, property.city, property.province].filter(Boolean).join(', ') || '-'],
    ['GLA', formatNumber(property.gla_m2, 'm²')],
    ['Vacancy %', `${formatNumber(vacancyPct)}%`],
    ['Available Space', formatNumber(availableGla, 'm²')],
    ['Number Of Units', formatNumber(property.number_of_units)],
    ['Property Status', titleize(property.status)],
    ['Assigned Broker', property.broker_id || 'Unassigned'],
  ]

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <Link to="/commercial/properties" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#102236]">
          <ArrowLeft size={16} />
          Properties
        </Link>
        <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CommercialStatusPill value={property.status} />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{titleize(property.property_type)}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-[#102236]">{property.property_name}</h1>
            <p className="mt-2 text-sm text-slate-500">{landlord?.name || 'Landlord pending'} · {[property.suburb, property.city].filter(Boolean).join(', ') || property.address || 'Location pending'}</p>
          </div>
          <div className="grid min-w-[260px] gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <CommercialLandlordOnboardingAction
              organisationId={organisationId}
              landlord={landlord}
            />
            <Link
              to={buildCommercialDocumentGeneratorPath({
                packetType: 'commercial_lease',
                assetCategory: resolvePropertyAssetCategory(property.property_type),
                propertyId: property.id,
                landlordId: property.landlord_id || '',
              })}
              className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50"
            >
              <FileText size={16} />
              Generate document
            </Link>
            <CommercialOnboardingSendAction
              organisationId={organisationId}
              kind="property"
              record={property}
              lookups={data?.lookups || {}}
              label="Send Seller Onboarding"
            />
            <Link to={canvassingPath} className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
              <Radar size={16} />
              Canvass follow-up
            </Link>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Occupancy</p>
              <p className="mt-1 text-sm font-semibold text-[#102236]">{formatNumber(occupancyPct)}%</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Available GLA</p>
              <p className="mt-1 text-sm font-semibold text-[#102236]">{formatNumber(availableGla, 'm²')}</p>
            </div>
          </div>
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${activeTab === tab.id ? 'bg-[#102b46] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <section className="grid gap-5">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <KpiCard label="Total GLA" value={formatNumber(totalGla, 'm²')} detail="Tracked gross lettable area." />
            <KpiCard label="Available GLA" value={formatNumber(availableGla, 'm²')} detail="Current stock available to lease or sell." />
            <KpiCard label="Occupancy %" value={`${formatNumber(occupancyPct)}%`} detail={`${formatNumber(vacancyPct)}% vacancy exposure.`} />
            <KpiCard label="Active Vacancies" value={formatNumber(activeVacancies.length)} detail="Open stock still being worked." />
            <KpiCard label="Active Listings" value={formatNumber(activeListings.length)} detail="Market-facing opportunities." />
            <KpiCard label="Active Transactions" value={formatNumber(activeTransactions.length)} detail="Execution-stage opportunities." />
          </section>

          <section className={CARD_CLASS}>
            <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Overview</h2>
            <div className="mt-4">
              <DetailGrid rows={overviewRows} />
            </div>
          </section>

          <section className={CARD_CLASS}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Property Health</h2>
                <p className="mt-1 text-sm text-slate-500">A quick operational view of how this asset is performing.</p>
              </div>
              <MapPinned size={18} className="text-slate-400" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <KpiCard label="Vacancy %" value={`${formatNumber(vacancyPct)}%`} detail="Current vacant share." />
              <KpiCard label="Avg Vacancy Duration" value={avgVacancyDuration ? `${formatNumber(avgVacancyDuration)} days` : '-'} detail="Open vacancy age." />
              <KpiCard label="Active Deals" value={formatNumber((data?.deals || []).length)} detail="Demand progressing on this asset." />
              <KpiCard label="Active Viewings" value={formatNumber(activeViewings.length)} detail="Upcoming inspections." />
              <KpiCard label="Leasing Velocity" value={`${formatNumber(leasingVelocity)}%`} detail="Deals per active vacancy." />
            </div>
          </section>

          {categoryRows(property).length ? (
            <section className={CARD_CLASS}>
              <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Category Fields</h2>
              <div className="mt-4">
                <DetailGrid rows={categoryRows(property)} />
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'vacancies' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={data?.vacancies || []}
            empty="No vacancies linked to this property yet."
            to={(row) => `/commercial/vacancies/${row.id}`}
            renderTitle={(row) => row.vacancy_name || 'Commercial vacancy'}
            renderDetail={(row) => [row.unit_or_floor || 'Unit pending', formatNumber(row.available_area_m2, 'm²'), titleize(row.status)].filter(Boolean).join(' · ')}
            renderMeta={(row) => formatDate(row.availability_date)}
          />
        </section>
      ) : null}

      {activeTab === 'listings' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={data?.listings || []}
            empty="No listings linked to this property yet."
            to={(row) => `/commercial/listings/${row.id}`}
            renderTitle={(row) => row.title || 'Commercial listing'}
            renderDetail={(row) => [titleize(row.listing_category), titleize(row.listing_status), formatCurrency(row.pricing)].filter(Boolean).join(' · ')}
            renderMeta={(row) => formatDate(row.updated_at || row.created_at)}
          />
        </section>
      ) : null}

      {activeTab === 'transactions' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={data?.transactions || []}
            empty="No transactions linked to this property yet."
            to={(row) => `/commercial/transactions/${row.id}`}
            renderTitle={(row) => row.transaction_name || row.title || 'Commercial transaction'}
            renderDetail={(row) => [titleize(row.transaction_type), titleize(row.status), formatCurrency(row.target_value || row.value)].filter(Boolean).join(' · ')}
            renderMeta={(row) => formatDate(row.expected_close_date || row.expectedCloseDate)}
          />
        </section>
      ) : null}

      {activeTab === 'documents' ? (
        <CommercialDocumentLibrary organisationId={organisationId} entityType="commercial_property" entityId={property.id} />
      ) : null}

      {activeTab === 'activity' ? (
        <section className={CARD_CLASS}>
          <ActivityList rows={data?.activity || []} />
        </section>
      ) : null}
    </div>
  )
}

export default CommercialPropertyWorkspacePage
