import {
  ArrowDownUp,
  Building2,
  DoorOpen,
  Edit3,
  Eye,
  Filter,
  Grid2X2,
  LayoutList,
  MoreHorizontal,
  Plus,
  Search,
  Tag,
  UsersRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialFormModal from '../components/CommercialFormModal'
import CommercialRecordDrawer from '../components/CommercialRecordDrawer'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import { normalizeCommercialLifecycleStage } from '../commercialWorkflow'
import {
  getCommercialLookupData,
  resolveCommercialOrganisationContext,
} from '../services/commercialApi'

const TAB_CONFIG = [
  { key: 'properties', label: 'Properties', detail: 'Total properties', icon: Building2, tone: 'blue', createLabel: 'New Property' },
  { key: 'listings', label: 'Listings', detail: 'Sales listings', icon: Tag, tone: 'blue', createLabel: 'Add Sales Listing' },
  { key: 'vacancies', label: 'Vacancies', detail: 'Available spaces', icon: DoorOpen, tone: 'green', createLabel: 'Add Vacancy' },
  { key: 'occupied', label: 'Occupied', detail: 'Active leases', icon: UsersRound, tone: 'purple', createLabel: 'Add Lease' },
]

const TONE_CLASSES = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  orange: 'bg-amber-50 text-amber-700 ring-amber-100',
  purple: 'bg-violet-50 text-violet-700 ring-violet-100',
}

const SORT_OPTIONS = [
  { value: 'updated_desc', label: 'Newest updated' },
  { value: 'updated_asc', label: 'Oldest updated' },
  { value: 'value_desc', label: 'Highest value' },
  { value: 'value_asc', label: 'Lowest value' },
]

const EMPTY_COPY = {
  properties: ['No properties yet.', 'New Property'],
  listings: ['No sales listings yet.', 'Add Sales Listing'],
  vacancies: ['No vacancies yet.', 'Add Vacancy'],
  occupied: ['No occupied leases yet.', 'View Leasing Deals'],
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isActiveStatus(value) {
  return !['archived', 'inactive', 'withdrawn', 'expired', 'terminated'].includes(normalizeLower(value))
}

function isSalesListing(row = {}) {
  const type = normalizeLower(row.listing_type)
  const category = normalizeLower(row.listing_category)
  return ['sale', 'sales', 'for_sale', 'investment', 'development'].includes(type)
    || ['investment', 'development_land'].includes(category)
    || Boolean(numberValue(row.pricing) && type !== 'lease')
}

function isOpenVacancy(row = {}) {
  const stage = normalizeCommercialLifecycleStage('vacancies', row.status, 'draft')
  return ['available', 'marketing', 'under_negotiation', 'hot_in_progress'].includes(stage)
}

function isActiveLease(row = {}) {
  const stage = normalizeCommercialLifecycleStage('leases', row.status, 'draft')
  return ['executed', 'active', 'renewal_pending'].includes(stage)
}

function toLookupOptions(lookups = {}) {
  return {
    companies: (lookups.companies || []).map((row) => ({ value: row.id, label: row.company_name || row.name || 'Unnamed company' })),
    contacts: (lookups.contacts || []).map((row) => ({ value: row.id, label: row.name || [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed contact' })),
    landlords: (lookups.landlords || []).map((row) => ({ value: row.id, label: row.name || 'Unnamed landlord' })),
    tenants: (lookups.tenants || []).map((row) => ({ value: row.id, label: row.name || 'Unnamed tenant' })),
    properties: (lookups.properties || []).map((row) => ({ value: row.id, label: row.property_name || 'Unnamed property' })),
    vacancies: (lookups.vacancies || []).map((row) => ({ value: row.id, label: [row.vacancy_name || 'Unnamed vacancy', row.unit_or_floor].filter(Boolean).join(' · ') })),
    listings: (lookups.listings || []).map((row) => ({ value: row.id, label: row.title || 'Unnamed listing' })),
    requirements: (lookups.requirements || []).map((row) => ({ value: row.id, label: row.requirement_name || 'Unnamed requirement' })),
    deals: (lookups.deals || []).map((row) => ({ value: row.id, label: row.deal_name || 'Unnamed deal' })),
    leases: (lookups.leases || []).map((row) => ({ value: row.id, label: `Lease ${String(row.id || '').slice(0, 8)}` })),
    brokers: (lookups.brokers || []).map((row) => ({
      value: row.userId || row.user_id || row.id,
      label: row.fullName || [row.firstName || row.first_name, row.lastName || row.last_name].filter(Boolean).join(' ') || row.email || 'Broker',
    })).filter((row) => row.value),
    branches: (lookups.branches || []).map((row) => ({ value: row.id, label: row.name || 'Commercial branch' })),
    teams: (lookups.teams || []).map((row) => ({ value: row.id, label: row.name || 'Commercial team' })),
  }
}

function getLookupLabel(options = [], value, fallback = '-') {
  return options.find((option) => String(option.value) === String(value))?.label || fallback
}

function getAddress(row = {}, property = null) {
  return normalizeText(row.formatted_address)
    || normalizeText(row.address)
    || normalizeText([row.street_address, row.suburb || row.city].filter(Boolean).join(', '))
    || normalizeText(property?.formatted_address)
    || normalizeText(property?.address)
    || normalizeText([property?.suburb, property?.city].filter(Boolean).join(', '))
    || '-'
}

function parseObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function getImageUrl(row = {}, property = null) {
  const sources = [row.media_json, row.marketing_json, property?.media_json, property?.marketing_json]
  for (const source of sources) {
    const data = parseObject(source)
    const image = data.coverImage || data.cover_image || data.heroImage || data.hero_image || data.image || data.url
    if (image) return image
    const first = Array.isArray(data.images) ? data.images[0] : Array.isArray(data.photos) ? data.photos[0] : null
    if (typeof first === 'string') return first
    if (first?.url) return first.url
  }
  return ''
}

function initials(value = 'Property') {
  return normalizeText(value)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CP'
}

function PropertyImage({ row, property, className = '' }) {
  const imageUrl = getImageUrl(row, property)
  const label = row.property_name || row.title || row.vacancy_name || property?.property_name || 'Commercial asset'
  if (imageUrl) {
    return <img src={imageUrl} alt="" className={`h-full w-full object-cover ${className}`} />
  }
  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#eef4f8] text-[#123b61] ${className}`}>
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/80 bg-white/80 text-base font-bold shadow-sm">
        {initials(label)}
      </div>
    </div>
  )
}

function buildDrawerFields(kind, lookupOptions = {}) {
  const config = commercialCrudConfigs[kind]
  return (config?.fields || [])
    .filter((field) => field.persist !== false)
    .map((field) => ({
      key: field.name,
      label: field.label,
      render: field.type === 'select'
        ? (row) => getLookupLabel(lookupOptions[field.optionsFrom] || field.options || [], row[field.name], row[field.name] || '-')
        : undefined,
    }))
}

function SelectControl({ label, value, options = [], onChange }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#72839a]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 min-w-0 rounded-2xl border border-[#dbe5ef] bg-white px-3 text-sm font-semibold text-[#102236] outline-none transition focus:border-[#8fb8e8] focus:ring-4 focus:ring-blue-50"
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function PortfolioSwitcher({ activeTab, counts, onChange }) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-[#dde7f0] bg-white shadow-[0_12px_36px_rgba(15,23,42,0.045)]">
      <div className="grid min-w-[720px] grid-cols-4 overflow-x-auto md:min-w-0">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`relative flex min-h-[106px] items-center gap-4 border-r border-[#edf2f7] px-6 text-left transition last:border-r-0 ${active ? 'bg-white' : 'bg-white hover:bg-[#f8fbfd]'}`}
            >
              {active ? <span className="absolute inset-x-0 top-0 h-1 bg-[#0b6dff]" /> : null}
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ${TONE_CLASSES[tab.tone]}`}>
                <Icon size={22} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#60758d]">{tab.label}</span>
                <span className="mt-1 block text-3xl font-semibold tracking-[-0.04em] text-[#102236]">{formatNumber(counts[tab.key] || 0)}</span>
                <span className="mt-1 block text-xs font-medium text-[#60758d]">{tab.detail}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function FilterPanel({
  filters,
  setFilter,
  propertyTypeOptions,
  statusOptions,
  lookupOptions,
  onReset,
}) {
  return (
    <>
      <SelectControl label="Status" value={filters.status} options={statusOptions} onChange={(value) => setFilter('status', value)} />
      <SelectControl label="Property Type" value={filters.propertyType} options={propertyTypeOptions} onChange={(value) => setFilter('propertyType', value)} />
      <SelectControl label="Branch / Office" value={filters.branchId} options={lookupOptions.branches || []} onChange={(value) => setFilter('branchId', value)} />
      <SelectControl label="Team" value={filters.teamId} options={lookupOptions.teams || []} onChange={(value) => setFilter('teamId', value)} />
      <SelectControl label="Broker" value={filters.brokerId} options={lookupOptions.brokers || []} onChange={(value) => setFilter('brokerId', value)} />
      <button
        type="button"
        onClick={onReset}
        className="h-11 self-end rounded-2xl border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-[#f8fbfd]"
      >
        Reset
      </button>
    </>
  )
}

function StatPill({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-[#60758d]">
      <span className="font-semibold text-[#102236]">{value}</span>
      {label}
    </span>
  )
}

function BrokerBadge({ label }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eaf2fb] text-xs font-bold text-[#123b61]">{initials(label)}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[#102236]">{label}</span>
      </span>
    </div>
  )
}

function CardActions({ onView, onEdit, onMore }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onView} title="View" className="grid h-10 w-10 place-items-center rounded-2xl border border-[#dbe5ef] bg-white text-[#123b61] transition hover:bg-[#f8fbfd]">
        <Eye size={16} />
      </button>
      <button type="button" onClick={onEdit} title="Edit" className="grid h-10 w-10 place-items-center rounded-2xl border border-[#dbe5ef] bg-white text-[#123b61] transition hover:bg-[#f8fbfd]">
        <Edit3 size={16} />
      </button>
      <button type="button" onClick={onMore} title="More" className="grid h-10 w-10 place-items-center rounded-2xl border border-[#dbe5ef] bg-white text-[#123b61] transition hover:bg-[#f8fbfd]">
        <MoreHorizontal size={16} />
      </button>
    </div>
  )
}

function PropertyCard({ row, lookupOptions, metrics, onView, onEdit, onArchive, compact }) {
  const landlord = getLookupLabel(lookupOptions.landlords, row.landlord_id, 'Landlord pending')
  const broker = getLookupLabel(lookupOptions.brokers, row.broker_id, 'Unassigned')
  const address = getAddress(row)
  if (compact) {
    return (
      <article className="flex flex-col gap-4 rounded-[22px] border border-[#dde7f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] md:flex-row md:items-center">
        <div className="h-28 overflow-hidden rounded-2xl md:w-44">
          <PropertyImage row={row} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-[#102236]">{row.property_name || 'Commercial property'}</p>
          <p className="mt-1 truncate text-sm text-[#60758d]">{address}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <StatPill label="GLA" value={formatNumber(row.gla_m2, 'm²')} />
            <StatPill label="Vacancy" value={`${formatNumber(metrics.vacancyPercentage)}%`} />
            <StatPill label="Listings" value={metrics.listingCount} />
            <StatPill label="Vacancies" value={metrics.vacancyCount} />
            <StatPill label="Occupied" value={metrics.occupiedCount} />
          </div>
        </div>
        <CardActions onView={onView} onEdit={onEdit} onMore={onArchive} />
      </article>
    )
  }
  return (
    <article className="overflow-hidden rounded-[22px] border border-[#dde7f0] bg-white shadow-[0_12px_34px_rgba(15,23,42,0.055)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
      <div className="h-36">
        <PropertyImage row={row} />
      </div>
      <div className="grid gap-4 p-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-[-0.02em] text-[#102236]">{row.property_name || 'Commercial property'}</p>
              <p className="mt-1 line-clamp-1 text-sm text-[#60758d]">{address}</p>
            </div>
            <CommercialStatusPill value={row.status || 'active'} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <StatPill label="" value={titleize(row.property_type)} />
            <StatPill label="" value={formatNumber(row.gla_m2, 'm²')} />
            <StatPill label="vacancy" value={`${formatNumber(metrics.vacancyPercentage)}%`} />
            <StatPill label="available" value={formatNumber(metrics.availableArea, 'm²')} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#f8fbfd] p-2">
          <div className="rounded-xl bg-white px-3 py-2 text-center"><strong className="block text-[#102236]">{metrics.listingCount}</strong><span className="text-xs text-[#60758d]">Listings</span></div>
          <div className="rounded-xl bg-white px-3 py-2 text-center"><strong className="block text-[#102236]">{metrics.vacancyCount}</strong><span className="text-xs text-[#60758d]">Vacancies</span></div>
          <div className="rounded-xl bg-white px-3 py-2 text-center"><strong className="block text-[#102236]">{metrics.occupiedCount}</strong><span className="text-xs text-[#60758d]">Occupied</span></div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#102236]">{landlord}</p>
            <p className="mt-0.5 truncate text-xs text-[#60758d]">{broker}</p>
          </div>
          <CardActions onView={onView} onEdit={onEdit} onMore={onArchive} />
        </div>
      </div>
    </article>
  )
}

function ListingCard({ row, property, lookupOptions, onView, onEdit, onArchive, compact }) {
  const broker = getLookupLabel(lookupOptions.brokers, row.broker_id, 'Unassigned')
  const status = row.listing_status || row.status || 'published'
  const size = property?.gla_m2 || row.available_area_m2 || row.size_m2
  if (compact) {
    return (
      <article className="flex flex-col gap-4 rounded-[22px] border border-[#dde7f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] md:flex-row md:items-center">
        <div className="h-28 overflow-hidden rounded-2xl md:w-44">
          <PropertyImage row={row} property={property} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><CommercialStatusPill value={status} /></div>
          <p className="mt-2 truncate text-base font-semibold text-[#102236]">{row.title || property?.property_name || 'Sales listing'}</p>
          <p className="mt-1 truncate text-sm text-[#60758d]">{getAddress(row, property)}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <StatPill label="" value={titleize(row.listing_category || property?.property_type)} />
            <StatPill label="" value={formatNumber(size, 'm²')} />
            <StatPill label="" value={formatCurrency(row.pricing || property?.asking_sale_price)} />
          </div>
        </div>
        <CardActions onView={onView} onEdit={onEdit} onMore={onArchive} />
      </article>
    )
  }
  return (
    <article className="overflow-hidden rounded-[22px] border border-[#dde7f0] bg-white shadow-[0_12px_34px_rgba(15,23,42,0.055)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
      <div className="relative h-36">
        <PropertyImage row={row} property={property} />
        <div className="absolute left-4 top-4"><CommercialStatusPill value={status} label={normalizeLower(status) === 'published' ? 'For Sale' : ''} /></div>
      </div>
      <div className="grid gap-4 p-5">
        <div>
          <p className="line-clamp-1 text-base font-semibold tracking-[-0.02em] text-[#102236]">{row.title || property?.property_name || 'Sales listing'}</p>
          <p className="mt-1 line-clamp-1 text-sm text-[#60758d]">{getAddress(row, property)}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm text-[#60758d]">
          <span>{titleize(row.listing_category || property?.property_type)}</span>
          <span>{formatNumber(size, 'm²')}</span>
          <span className="text-right font-semibold text-[#102236]">{formatCurrency(row.pricing || property?.asking_sale_price)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
          <div className="min-w-0">
            <BrokerBadge label={broker} />
            <p className="mt-1 text-xs text-[#60758d]">Updated {formatDate(row.updated_at || row.created_at)}</p>
          </div>
          <CardActions onView={onView} onEdit={onEdit} onMore={onArchive} />
        </div>
      </div>
    </article>
  )
}

function VacancyCard({ row, property, lookupOptions, onView, onEdit, onArchive, compact }) {
  const broker = getLookupLabel(lookupOptions.brokers, row.broker_assignment || row.broker_id, 'Unassigned')
  const status = row.status || 'available'
  const rental = row.asking_rental ? `${formatCurrency(row.asking_rental)}/m²` : '-'
  const body = (
    <>
      <div>
        <div className="flex flex-wrap items-center gap-2"><CommercialStatusPill value={status} /></div>
        <p className="mt-2 line-clamp-1 text-base font-semibold tracking-[-0.02em] text-[#102236]">{row.vacancy_name || row.unit_or_floor || 'Available vacancy'}</p>
        <p className="mt-1 line-clamp-1 text-sm text-[#60758d]">{property?.property_name || getAddress(row, property)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm text-[#60758d]">
        <StatPill label="" value={titleize(property?.property_type || row.listing_category || 'Commercial')} />
        <StatPill label="" value={formatNumber(row.available_area_m2, 'm²')} />
        <StatPill label="" value={rental} />
        <StatPill label="" value={row.availability_date ? formatDate(row.availability_date) : 'Available Immediately'} />
      </div>
    </>
  )
  if (compact) {
    return (
      <article className="flex flex-col gap-4 rounded-[22px] border border-[#dde7f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] md:flex-row md:items-center">
        <div className="min-w-0 flex-1">{body}</div>
        <BrokerBadge label={broker} />
        <CardActions onView={onView} onEdit={onEdit} onMore={onArchive} />
      </article>
    )
  }
  return (
    <article className="grid gap-4 rounded-[22px] border border-[#dde7f0] bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.055)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
      {body}
      <div className="flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
        <BrokerBadge label={broker} />
        <CardActions onView={onView} onEdit={onEdit} onMore={onArchive} />
      </div>
    </article>
  )
}

function OccupiedCard({ row, property, lookupOptions, onView, onEdit, onArchive, compact }) {
  const tenant = getLookupLabel(lookupOptions.tenants, row.tenant_id, 'Tenant pending')
  const broker = getLookupLabel(lookupOptions.brokers, row.broker_id, 'Unassigned')
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CommercialStatusPill value={row.status || 'active'} label="Occupied" />
          <p className="mt-3 line-clamp-1 text-base font-semibold tracking-[-0.02em] text-[#102236]">{property?.property_name || 'Occupied property'}</p>
          <p className="mt-1 line-clamp-1 text-sm text-[#60758d]">{row.unit_or_floor || row.premises_description || getAddress(row, property)}</p>
        </div>
      </div>
      <div className="grid gap-3 rounded-2xl bg-[#f8fbfd] p-3 text-sm text-[#60758d]">
        <StatPill label="tenant" value={tenant} />
        <StatPill label="lease" value={`${formatDate(row.lease_start_date)} to ${formatDate(row.lease_end_date)}`} />
        <StatPill label="rental" value={`${formatCurrency(row.monthly_rental)}/month`} />
        <StatPill label="escalation" value={`${formatNumber(row.escalation_percentage)}%`} />
      </div>
    </>
  )
  if (compact) {
    return (
      <article className="flex flex-col gap-4 rounded-[22px] border border-[#dde7f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] md:flex-row md:items-center">
        <div className="min-w-0 flex-1">{body}</div>
        <BrokerBadge label={broker} />
        <CardActions onView={onView} onEdit={onEdit} onMore={onArchive} />
      </article>
    )
  }
  return (
    <article className="grid gap-4 rounded-[22px] border border-[#dde7f0] bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.055)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
      {body}
      <div className="flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
        <BrokerBadge label={broker} />
        <CardActions onView={onView} onEdit={onEdit} onMore={onArchive} />
      </div>
    </article>
  )
}

function CommercialPropertiesPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('properties')
  const [viewMode, setViewMode] = useState('grid')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sort, setSort] = useState('updated_desc')
  const [filters, setFilters] = useState({ status: 'all', propertyType: 'all', branchId: 'all', teamId: 'all', brokerId: 'all' })
  const [organisationId, setOrganisationId] = useState('')
  const [lookups, setLookups] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [modalState, setModalState] = useState({ open: false, kind: 'properties', mode: 'create', record: null })
  const [drawerState, setDrawerState] = useState({ open: false, kind: 'properties', record: null })

  const loadData = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true)
    setError('')
    try {
      const context = await resolveCommercialOrganisationContext()
      const nextOrganisationId = context.organisationId || ''
      const nextLookups = nextOrganisationId ? await getCommercialLookupData(nextOrganisationId) : {}
      setOrganisationId(nextOrganisationId)
      setLookups(nextLookups || {})
    } catch (loadError) {
      setError(loadError?.message || 'Commercial portfolio data could not be loaded.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!location.state?.openCommercialCreate) return
    setActiveTab('properties')
    setModalState({ open: true, kind: 'properties', mode: 'create', record: location.state?.commercialCreateDraft || null })
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  const lookupOptions = useMemo(() => toLookupOptions(lookups), [lookups])
  const properties = lookups.properties || []
  const propertiesById = useMemo(() => new Map(properties.map((row) => [row.id, row])), [properties])
  const salesListings = useMemo(() => (lookups.listings || []).filter((row) => row.property_id && isSalesListing(row) && isActiveStatus(row.status)), [lookups.listings])
  const openVacancies = useMemo(() => (lookups.vacancies || []).filter((row) => row.property_id && isOpenVacancy(row)), [lookups.vacancies])
  const occupiedLeases = useMemo(() => (lookups.leases || []).filter((row) => row.property_id && isActiveLease(row)), [lookups.leases])
  const propertyMetrics = useMemo(() => {
    const metrics = new Map()
    properties.forEach((property) => {
      const listings = salesListings.filter((row) => row.property_id === property.id)
      const vacancies = openVacancies.filter((row) => row.property_id === property.id)
      const leases = occupiedLeases.filter((row) => row.property_id === property.id)
      const availableArea = vacancies.reduce((sum, row) => sum + numberValue(row.available_area_m2), 0) || numberValue(property.available_space_m2)
      const occupiedArea = Math.max(0, numberValue(property.gla_m2) - availableArea)
      const vacancyPercentage = numberValue(property.vacancy_percentage) || (numberValue(property.gla_m2) ? Math.round((availableArea / numberValue(property.gla_m2)) * 100) : 0)
      metrics.set(property.id, {
        listingCount: listings.length,
        vacancyCount: vacancies.length,
        occupiedCount: leases.length,
        vacancyPercentage,
        availableArea,
        occupiedArea,
        totalGla: numberValue(property.gla_m2),
      })
    })
    return metrics
  }, [occupiedLeases, openVacancies, properties, salesListings])

  const rowsByTab = useMemo(() => ({
    properties: properties.filter((row) => isActiveStatus(row.status)),
    listings: salesListings,
    vacancies: openVacancies,
    occupied: occupiedLeases,
  }), [occupiedLeases, openVacancies, properties, salesListings])

  const counts = {
    properties: rowsByTab.properties.length,
    listings: rowsByTab.listings.length,
    vacancies: rowsByTab.vacancies.length,
    occupied: rowsByTab.occupied.length,
  }

  const activeRows = rowsByTab[activeTab] || []
  const statusOptions = useMemo(() => {
    const values = new Map()
    activeRows.forEach((row) => {
      const status = activeTab === 'listings' ? row.listing_status || row.status : row.status
      if (status) values.set(status, titleize(status))
    })
    return Array.from(values.entries()).map(([value, label]) => ({ value, label }))
  }, [activeRows, activeTab])
  const propertyTypeOptions = useMemo(() => {
    const values = new Map()
    activeRows.forEach((row) => {
      const property = propertiesById.get(row.property_id) || row
      const value = row.property_type || row.listing_category || property?.property_type
      if (value) values.set(value, titleize(value))
    })
    return Array.from(values.entries()).map(([value, label]) => ({ value, label }))
  }, [activeRows, propertiesById])

  function setFilter(key, value) {
    setFilters((previous) => ({ ...previous, [key]: value }))
  }

  function resetFilters() {
    setFilters({ status: 'all', propertyType: 'all', branchId: 'all', teamId: 'all', brokerId: 'all' })
    setSearchTerm('')
  }

  function openCreate(kind = activeTab === 'occupied' ? 'leases' : activeTab) {
    const configKind = kind === 'occupied' ? 'leases' : kind
    setModalState({ open: true, kind: configKind, mode: 'create', record: null })
  }

  function handleEmptyAction() {
    if (activeTab === 'occupied') {
      navigate('/commercial/leasing/deals')
      return
    }
    openCreate(activeKind)
  }

  function openEdit(kind, record) {
    setModalState({ open: true, kind: kind === 'occupied' ? 'leases' : kind, mode: 'edit', record })
  }

  function openDrawer(kind, record) {
    setDrawerState({ open: true, kind: kind === 'occupied' ? 'leases' : kind, record })
  }

  async function handleArchive(kind, record) {
    const configKind = kind === 'occupied' ? 'leases' : kind
    const config = commercialCrudConfigs[configKind]
    if (!record?.id || !config?.archiveRecord) return
    const confirmed = window.confirm(`Archive this ${config.title.toLowerCase().replace(/s$/, '')} record?`)
    if (!confirmed) return
    setActionError('')
    try {
      await config.archiveRecord(record.id)
      setDrawerState({ open: false, kind: configKind, record: null })
      await loadData({ showLoading: false })
    } catch (archiveError) {
      setActionError(archiveError?.message || 'The commercial record could not be archived.')
    }
  }

  async function handleSave(payload) {
    const config = commercialCrudConfigs[modalState.kind]
    if (!organisationId) throw new Error('Commercial organisation context is not available.')
    if (!config) throw new Error('Commercial record type is not configured.')
    const saved = modalState.mode === 'edit' && modalState.record?.id
      ? await config.updateRecord(modalState.record.id, payload)
      : await config.createRecord({ ...payload, organisation_id: organisationId })
    await loadData({ showLoading: false })
    return saved
  }

  const filteredRows = useMemo(() => {
    const query = normalizeLower(searchTerm)
    const [sortKey, sortDirection] = sort.split('_')
    const multiplier = sortDirection === 'asc' ? 1 : -1
    const brokerKey = (row) => row.broker_id || row.broker_assignment || row.assigned_broker || ''
    const getStatus = (row) => activeTab === 'listings' ? row.listing_status || row.status : row.status
    const getType = (row) => {
      const property = propertiesById.get(row.property_id) || row
      return row.property_type || row.listing_category || property?.property_type || ''
    }
    const getValue = (row) => {
      if (activeTab === 'listings') return numberValue(row.pricing || propertiesById.get(row.property_id)?.asking_sale_price)
      if (activeTab === 'vacancies') return numberValue(row.asking_rental)
      if (activeTab === 'occupied') return numberValue(row.monthly_rental)
      return numberValue(row.asking_sale_price || row.annual_income || row.noi)
    }
    const getSearchBlob = (row) => {
      const property = propertiesById.get(row.property_id) || row
      return [
        row.property_name,
        row.title,
        row.vacancy_name,
        row.unit_or_floor,
        property?.property_name,
        getAddress(row, property),
        getLookupLabel(lookupOptions.landlords, row.landlord_id || property?.landlord_id, ''),
        getLookupLabel(lookupOptions.tenants, row.tenant_id, ''),
        getLookupLabel(lookupOptions.brokers, brokerKey(row), ''),
        getType(row),
        getStatus(row),
      ].join(' ').toLowerCase()
    }
    return [...activeRows]
      .filter((row) => filters.status === 'all' || String(getStatus(row)) === String(filters.status))
      .filter((row) => filters.propertyType === 'all' || String(getType(row)) === String(filters.propertyType))
      .filter((row) => filters.branchId === 'all' || String(row.branch_id || propertiesById.get(row.property_id)?.branch_id || '') === String(filters.branchId))
      .filter((row) => filters.teamId === 'all' || String(row.team_id || propertiesById.get(row.property_id)?.team_id || '') === String(filters.teamId))
      .filter((row) => filters.brokerId === 'all' || String(brokerKey(row) || propertiesById.get(row.property_id)?.broker_id || '') === String(filters.brokerId))
      .filter((row) => !query || getSearchBlob(row).includes(query))
      .sort((left, right) => {
        if (sortKey === 'value') return (getValue(left) - getValue(right)) * multiplier
        const leftDate = new Date(left.updated_at || left.created_at || 0).getTime() || 0
        const rightDate = new Date(right.updated_at || right.created_at || 0).getTime() || 0
        return (leftDate - rightDate) * multiplier
      })
  }, [activeRows, activeTab, filters, lookupOptions.brokers, lookupOptions.landlords, lookupOptions.tenants, propertiesById, searchTerm, sort])

  const activeConfig = TAB_CONFIG.find((tab) => tab.key === activeTab) || TAB_CONFIG[0]
  const activeKind = activeTab === 'occupied' ? 'leases' : activeTab
  const modalConfig = commercialCrudConfigs[modalState.kind]
  const CreateModal = modalState.mode === 'create' ? modalConfig?.createModal : null
  const drawerFields = buildDrawerFields(drawerState.kind, lookupOptions)
  const gridClass = viewMode === 'grid'
    ? 'grid gap-5 md:grid-cols-2 xl:grid-cols-3'
    : 'grid gap-3'

  return (
    <div className="grid gap-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#102236]">Portfolio</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-[-0.05em] text-[#102236]">Properties</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">View your commercial property portfolio and related activity.</p>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#082f57] px-5 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(8,47,87,0.18)] transition hover:bg-[#123b61]"
        >
          <Plus size={17} />
          {activeConfig.createLabel}
        </button>
      </section>

      <PortfolioSwitcher activeTab={activeTab} counts={counts} onChange={(tab) => {
        setActiveTab(tab)
        setFiltersOpen(false)
        resetFilters()
      }} />

      <section className="rounded-[22px] border border-[#dde7f0] bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.045)]">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_auto] xl:items-end">
          <label className="flex h-12 min-w-0 items-center gap-3 rounded-2xl border border-[#dbe5ef] bg-white px-4 text-[#60758d]">
            <Search size={17} className="shrink-0" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search listings, properties, addresses, landlords, tenants..."
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-[#102236] outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-[#f8fbfd] md:hidden"
            >
              <Filter size={16} />
              Filters
            </button>
            <label className="grid gap-1">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#72839a]">Sort by</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="h-11 rounded-2xl border border-[#dbe5ef] bg-white px-3 text-sm font-semibold text-[#102236] outline-none transition focus:border-[#8fb8e8] focus:ring-4 focus:ring-blue-50"
              >
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 rounded-2xl border border-[#dbe5ef] bg-[#f8fbfd] p-1">
              <button type="button" onClick={() => setViewMode('grid')} title="Grid" className={`grid h-10 w-10 place-items-center rounded-xl transition ${viewMode === 'grid' ? 'bg-white text-[#0b6dff] shadow-sm' : 'text-[#60758d]'}`}>
                <Grid2X2 size={17} />
              </button>
              <button type="button" onClick={() => setViewMode('list')} title="List" className={`grid h-10 w-10 place-items-center rounded-xl transition ${viewMode === 'list' ? 'bg-white text-[#0b6dff] shadow-sm' : 'text-[#60758d]'}`}>
                <LayoutList size={18} />
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 hidden grid-cols-6 gap-3 md:grid">
          <FilterPanel
            filters={filters}
            setFilter={setFilter}
            propertyTypeOptions={propertyTypeOptions}
            statusOptions={statusOptions}
            lookupOptions={lookupOptions}
            onReset={resetFilters}
          />
        </div>
        {filtersOpen ? (
          <div className="mt-4 grid gap-3 rounded-2xl border border-[#dde7f0] bg-[#f8fbfd] p-3 md:hidden">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#102236]">Filters</span>
              <button type="button" onClick={() => setFiltersOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#60758d]"><X size={16} /></button>
            </div>
            <FilterPanel
              filters={filters}
              setFilter={setFilter}
              propertyTypeOptions={propertyTypeOptions}
              statusOptions={statusOptions}
              lookupOptions={lookupOptions}
              onReset={resetFilters}
            />
          </div>
        ) : null}
      </section>

      {actionError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{actionError}</div>
      ) : null}

      <section className="rounded-[22px] border border-[#dde7f0] bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.045)]">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#102236]">{activeConfig.label} ({filteredRows.length})</h2>
            <p className="mt-1 text-sm text-[#60758d]">{activeConfig.detail}</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl bg-[#f8fbfd] px-3 py-2 text-sm font-semibold text-[#60758d]">
            <ArrowDownUp size={15} />
            {SORT_OPTIONS.find((option) => option.value === sort)?.label}
          </div>
        </div>

        {loading ? (
          <div className={gridClass}>
            {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-72 animate-pulse rounded-[22px] bg-[#eef4f8]" />)}
          </div>
        ) : error ? (
          <CommercialEmptyState title="Portfolio data could not be loaded" description={error} />
        ) : filteredRows.length ? (
          <div className={gridClass}>
            {filteredRows.map((row) => {
              const property = propertiesById.get(row.property_id)
              const sharedProps = {
                row,
                property,
                lookupOptions,
                compact: viewMode === 'list',
                onView: () => openDrawer(activeKind, row),
                onEdit: () => openEdit(activeKind, row),
                onArchive: () => void handleArchive(activeKind, row),
              }
              if (activeTab === 'listings') return <ListingCard key={`${activeTab}-${row.id}`} {...sharedProps} />
              if (activeTab === 'vacancies') return <VacancyCard key={`${activeTab}-${row.id}`} {...sharedProps} />
              if (activeTab === 'occupied') return <OccupiedCard key={`${activeTab}-${row.id}`} {...sharedProps} />
              return <PropertyCard key={`${activeTab}-${row.id}`} {...sharedProps} metrics={propertyMetrics.get(row.id) || {}} />
            })}
          </div>
        ) : (
          <CommercialEmptyState
            title={EMPTY_COPY[activeTab][0]}
            description="Records linked to the active portfolio view will appear here."
            primaryActionLabel={EMPTY_COPY[activeTab][1]}
            onPrimaryAction={handleEmptyAction}
          />
        )}
      </section>

      {CreateModal ? (
        <CreateModal
          open={modalState.open}
          mode={modalState.mode}
          title={modalConfig.title}
          record={modalState.record}
          lookups={lookupOptions}
          rawLookups={lookups}
          onClose={() => setModalState({ open: false, kind: 'properties', mode: 'create', record: null })}
          onSubmit={handleSave}
        />
      ) : (
        <CommercialFormModal
          open={modalState.open}
          mode={modalState.mode}
          title={modalConfig?.title || 'Commercial record'}
          fields={modalConfig?.fields || []}
          record={modalState.record}
          lookups={lookupOptions}
          crossValidate={modalConfig?.crossValidate}
          onClose={() => setModalState({ open: false, kind: 'properties', mode: 'create', record: null })}
          onSubmit={handleSave}
        />
      )}

      <CommercialRecordDrawer
        open={drawerState.open}
        record={drawerState.record}
        kind={drawerState.kind}
        title={commercialCrudConfigs[drawerState.kind]?.title || 'Commercial record'}
        fields={drawerFields}
        lookups={lookupOptions}
        rawLookups={lookups}
        documentsEntityType={commercialCrudConfigs[drawerState.kind]?.documentsEntityType}
        showHeadsOfTerms={commercialCrudConfigs[drawerState.kind]?.showHeadsOfTerms}
        organisationId={organisationId}
        onClose={() => setDrawerState({ open: false, kind: 'properties', record: null })}
        onEdit={() => {
          setModalState({ open: true, kind: drawerState.kind, mode: 'edit', record: drawerState.record })
          setDrawerState({ open: false, kind: 'properties', record: null })
        }}
        onArchive={() => void handleArchive(drawerState.kind, drawerState.record)}
      />
    </div>
  )
}

export default CommercialPropertiesPage
