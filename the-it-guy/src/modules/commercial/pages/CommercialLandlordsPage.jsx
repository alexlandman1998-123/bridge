import {
  Building2,
  DoorOpen,
  Edit3,
  Eye,
  FileText,
  Filter,
  Grid2X2,
  LayoutList,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  UsersRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import CommercialLandlordOnboardingInviteModal from '../components/CommercialLandlordOnboardingInviteModal'
import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialFormModal from '../components/CommercialFormModal'
import CommercialRecordDrawer from '../components/CommercialRecordDrawer'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { formatNumber, titleize } from '../commercialFormatters'
import { normalizeCommercialLifecycleStage } from '../commercialWorkflow'
import {
  getCommercialLookupData,
  resolveCommercialOrganisationContext,
} from '../services/commercialApi'
import { createCommercialLandlordOnboarding } from '../services/commercialLandlordService'

const SUMMARY_TABS = [
  { key: 'landlords', label: 'Landlords', detail: 'Total landlords', icon: UsersRound, tone: 'blue' },
  { key: 'portfolios', label: 'Portfolios', detail: 'Property portfolios', icon: Building2, tone: 'blue' },
  { key: 'mandates', label: 'Mandates', detail: 'Active mandates', icon: FileText, tone: 'purple' },
  { key: 'vacancies', label: 'Vacancies', detail: 'Available spaces', icon: DoorOpen, tone: 'green' },
  { key: 'occupied', label: 'Occupied', detail: 'Active leases', icon: UsersRound, tone: 'purple' },
]

const TONE_CLASSES = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  purple: 'bg-violet-50 text-violet-700 ring-violet-100',
}

const SORT_OPTIONS = [
  { value: 'updated_desc', label: 'Newest updated' },
  { value: 'name_asc', label: 'A-Z' },
  { value: 'properties_desc', label: 'Most properties' },
  { value: 'vacancy_desc', label: 'Highest vacancy' },
  { value: 'portfolio_desc', label: 'Largest portfolio' },
]

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

function isActiveRecord(value) {
  return !['archived', 'inactive', 'withdrawn', 'expired', 'terminated'].includes(normalizeLower(value))
}

function isOpenVacancy(row = {}) {
  const stage = normalizeCommercialLifecycleStage('vacancies', row.status, 'draft')
  return ['available', 'marketing', 'under_negotiation', 'hot_in_progress'].includes(stage)
}

function isActiveLease(row = {}) {
  const stage = normalizeCommercialLifecycleStage('leases', row.status, 'draft')
  return ['executed', 'active', 'renewal_pending'].includes(stage)
}

function isActiveMandate(row = {}) {
  const status = normalizeCommercialLifecycleStage('listings', row.listing_status || row.status, 'draft')
  return ['internal_review', 'approved', 'published', 'under_offer'].includes(status)
}

function toLookupOptions(lookups = {}) {
  return {
    landlords: (lookups.landlords || []).map((row) => ({ value: row.id, label: row.legal_name || row.name || 'Landlord' })),
    properties: (lookups.properties || []).map((row) => ({ value: row.id, label: row.property_name || 'Property' })),
    vacancies: (lookups.vacancies || []).map((row) => ({ value: row.id, label: [row.vacancy_name || 'Vacancy', row.unit_or_floor].filter(Boolean).join(' · ') })),
    listings: (lookups.listings || []).map((row) => ({ value: row.id, label: row.title || 'Listing' })),
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

function getMediaUrl(...sources) {
  for (const source of sources) {
    const data = parseObject(source)
    const image = data.logo || data.logoUrl || data.coverImage || data.cover_image || data.heroImage || data.image || data.url
    if (image) return image
    const first = Array.isArray(data.images) ? data.images[0] : Array.isArray(data.photos) ? data.photos[0] : null
    if (typeof first === 'string') return first
    if (first?.url) return first.url
  }
  return ''
}

function initials(value = 'Landlord') {
  return normalizeText(value)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'LL'
}

function primaryLocation(landlord = {}, properties = []) {
  const locations = Array.from(new Set(properties.map((property) => [property.suburb, property.city].filter(Boolean).join(', ')).filter(Boolean)))
  if (locations.length > 1) return 'Multiple Regions'
  return locations[0]
    || [landlord.suburb, landlord.city].filter(Boolean).join(', ')
    || landlord.registered_address
    || landlord.formatted_address
    || 'Location pending'
}

function healthTone(rate) {
  if (rate >= 30) return 'bg-rose-500'
  if (rate >= 15) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function healthLabel(rate) {
  if (rate >= 30) return 'High vacancy'
  if (rate >= 15) return 'Moderate'
  return 'Healthy'
}

function buildDrawerFields(lookupOptions = {}) {
  const config = commercialCrudConfigs.landlords
  return (config.fields || [])
    .filter((field) => field.persist !== false)
    .map((field) => ({
      key: field.name,
      label: field.label,
      render: field.type === 'select'
        ? (row) => getLookupLabel(lookupOptions[field.optionsFrom] || field.options || [], row[field.name], titleize(row[field.name]))
        : undefined,
    }))
}

function LandlordAvatar({ landlord }) {
  const label = landlord.legal_name || landlord.name || 'Landlord'
  const logoUrl = getMediaUrl(landlord.metadata_json)
  if (logoUrl) return <img src={logoUrl} alt="" className="h-14 w-14 rounded-full border-4 border-white object-cover shadow-[0_10px_24px_rgba(15,23,42,0.16)]" />
  return (
    <span className="grid h-14 w-14 place-items-center rounded-full border-4 border-white bg-[#082f57] text-sm font-bold text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
      {initials(label)}
    </span>
  )
}

function CoverImage({ landlord, properties = [], listings = [] }) {
  const image = getMediaUrl(
    landlord.metadata_json,
    listings[0]?.media_json,
    listings[0]?.marketing_json,
    properties[0]?.metadata_json,
  )
  if (image) return <img src={image} alt="" className="h-full w-full object-cover" />
  return (
    <div className="h-full w-full bg-[linear-gradient(135deg,#0a3158_0%,#e9f2f8_68%,#ffffff_100%)]" />
  )
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
        {options.map((option) => <option key={`${label}-${option.value}`} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function SummaryStrip({ active, counts, onChange }) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-[#dde7f0] bg-white shadow-[0_12px_36px_rgba(15,23,42,0.045)]">
      <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-5">
        {SUMMARY_TABS.map((tab) => {
          const Icon = tab.icon
          const selected = active === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`relative flex min-h-[104px] items-center gap-4 border-b border-r border-[#edf2f7] px-5 text-left transition last:border-r-0 xl:border-b-0 ${selected ? 'bg-white' : 'hover:bg-[#f8fbfd]'}`}
            >
              {selected ? <span className="absolute inset-x-0 top-0 h-1 bg-[#0b6dff]" /> : null}
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ${TONE_CLASSES[tab.tone]}`}>
                <Icon size={22} />
              </span>
              <span>
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

function FilterPanel({ filters, setFilter, lookupOptions, landlordTypeOptions, statusOptions, onReset }) {
  return (
    <>
      <SelectControl label="Status" value={filters.status} options={statusOptions} onChange={(value) => setFilter('status', value)} />
      <SelectControl label="Landlord Type" value={filters.landlordType} options={landlordTypeOptions} onChange={(value) => setFilter('landlordType', value)} />
      <SelectControl label="Branch / Office" value={filters.branchId} options={lookupOptions.branches || []} onChange={(value) => setFilter('branchId', value)} />
      <SelectControl label="Team" value={filters.teamId} options={lookupOptions.teams || []} onChange={(value) => setFilter('teamId', value)} />
      <SelectControl label="Relationship Owner" value={filters.brokerId} options={lookupOptions.brokers || []} onChange={(value) => setFilter('brokerId', value)} />
      <button type="button" onClick={onReset} className="h-11 self-end rounded-2xl border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-[#f8fbfd]">Reset</button>
    </>
  )
}

function RelationshipOwner({ owner }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e8eef8] text-xs font-bold text-[#123b61]">{initials(owner)}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[#102236]">{owner}</span>
        <span className="block text-xs text-[#60758d]">Relationship Owner</span>
      </span>
    </div>
  )
}

function ActionButtons({ onView, onEdit, onMore }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onView} title="View" className="grid h-10 w-10 place-items-center rounded-2xl border border-[#dbe5ef] bg-white text-[#123b61] transition hover:bg-[#f8fbfd]"><Eye size={16} /></button>
      <button type="button" onClick={onEdit} title="Edit" className="grid h-10 w-10 place-items-center rounded-2xl border border-[#dbe5ef] bg-white text-[#123b61] transition hover:bg-[#f8fbfd]"><Edit3 size={16} /></button>
      <button type="button" onClick={onMore} title="More" className="grid h-10 w-10 place-items-center rounded-2xl border border-[#dbe5ef] bg-white text-[#123b61] transition hover:bg-[#f8fbfd]"><MoreHorizontal size={16} /></button>
    </div>
  )
}

function LandlordMenu({ landlord, onClose, onOpen, onEdit, onSendOnboarding, onArchive }) {
  return (
    <div className="absolute bottom-14 right-0 z-20 w-56 rounded-2xl border border-[#dbe5ef] bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
      <button type="button" onClick={onOpen} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#102236] hover:bg-[#f8fbfd]">Open Landlord</button>
      <Link to={`/commercial/landlords/${landlord.id}`} onClick={onClose} className="block rounded-xl px-3 py-2 text-sm font-semibold text-[#102236] hover:bg-[#f8fbfd]">View Portfolio</Link>
      <Link to="/commercial/properties" onClick={onClose} className="block rounded-xl px-3 py-2 text-sm font-semibold text-[#102236] hover:bg-[#f8fbfd]">View Properties</Link>
      <Link to="/commercial/leasing/vacancies" onClick={onClose} className="block rounded-xl px-3 py-2 text-sm font-semibold text-[#102236] hover:bg-[#f8fbfd]">View Vacancies</Link>
      <Link to="/commercial/leases" onClick={onClose} className="block rounded-xl px-3 py-2 text-sm font-semibold text-[#102236] hover:bg-[#f8fbfd]">View Leases</Link>
      <button type="button" onClick={onEdit} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#102236] hover:bg-[#f8fbfd]">Edit</button>
      <button type="button" onClick={onSendOnboarding} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#102236] hover:bg-[#f8fbfd]">Send Onboarding</button>
      <button type="button" onClick={onArchive} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50">Archive</button>
    </div>
  )
}

function LandlordCard({
  landlord,
  metrics,
  lookupOptions,
  menuOpen,
  compact,
  onView,
  onOpen,
  onEdit,
  onMore,
  onCloseMenu,
  onSendOnboarding,
  onArchive,
}) {
  const name = landlord.legal_name || landlord.name || 'Commercial landlord'
  const type = titleize(landlord.entity_type || landlord.landlord_type || 'landlord')
  const owner = getLookupLabel(lookupOptions.brokers, metrics.relationshipOwnerId || landlord.broker_id, 'Unassigned')
  const vacancyRate = Math.max(0, Math.min(100, metrics.vacancyRate || 0))
  const onboarding = titleize(landlord.onboarding_status || 'not_sent')

  if (compact) {
    return (
      <article className="relative flex flex-col gap-4 rounded-[22px] border border-[#dde7f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] md:flex-row md:items-center">
        <LandlordAvatar landlord={landlord} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-semibold text-[#102236]">{name}</p>
            <CommercialStatusPill value={landlord.status || 'active'} />
          </div>
          <p className="mt-1 text-sm text-[#60758d]">{type} · {metrics.location}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#60758d]">
            <span><strong className="text-[#102236]">{metrics.propertyCount}</strong> Properties</span>
            <span><strong className="text-[#102236]">{formatNumber(metrics.totalGla, 'm²')}</strong> GLA</span>
            <span><strong className="text-[#102236]">{metrics.vacancyCount}</strong> Vacancies</span>
            <span><strong className="text-[#102236]">{metrics.activeLeaseCount}</strong> Leases</span>
          </div>
        </div>
        <RelationshipOwner owner={owner} />
        <ActionButtons onView={onView} onEdit={onEdit} onMore={onMore} />
        {menuOpen ? <LandlordMenu landlord={landlord} onClose={onCloseMenu} onOpen={onOpen} onEdit={onEdit} onSendOnboarding={onSendOnboarding} onArchive={onArchive} /> : null}
      </article>
    )
  }

  return (
    <article className="relative overflow-hidden rounded-[22px] border border-[#dde7f0] bg-white shadow-[0_12px_34px_rgba(15,23,42,0.055)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
      <div className="h-24">
        <CoverImage landlord={landlord} properties={metrics.properties} listings={metrics.mandates} />
      </div>
      <div className="relative grid gap-4 p-5 pt-0">
        <div className="-mt-7 flex items-start gap-4">
          <LandlordAvatar landlord={landlord} />
          <div className="min-w-0 flex-1 pt-8">
            <div className="flex items-center gap-2">
              <p className="truncate text-base font-semibold tracking-[-0.02em] text-[#102236]">{name}</p>
              <CommercialStatusPill value={landlord.status || 'active'} />
            </div>
            <p className="mt-1 text-sm text-[#60758d]">{type}</p>
            <p className="mt-1 line-clamp-1 text-sm text-[#60758d]">{metrics.location}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 rounded-2xl bg-[#f8fbfd] p-2 text-center">
          <div className="rounded-xl bg-white px-2 py-2"><strong className="block text-[#102236]">{metrics.propertyCount}</strong><span className="text-xs text-[#60758d]">Properties</span></div>
          <div className="rounded-xl bg-white px-2 py-2"><strong className="block text-[#102236]">{formatNumber(metrics.totalGla, 'm²')}</strong><span className="text-xs text-[#60758d]">GLA</span></div>
          <div className="rounded-xl bg-white px-2 py-2"><strong className="block text-[#102236]">{metrics.vacancyCount}</strong><span className="text-xs text-[#60758d]">Vacancies</span></div>
          <div className="rounded-xl bg-white px-2 py-2"><strong className="block text-[#102236]">{metrics.activeLeaseCount}</strong><span className="text-xs text-[#60758d]">Leases</span></div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-[#60758d]">Vacancy Rate</span>
            <span className="font-semibold text-[#102236]">{formatNumber(vacancyRate)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#e8eef5]">
            <span className={`block h-full rounded-full ${healthTone(vacancyRate)}`} style={{ width: `${vacancyRate}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-[#60758d]">
            <span>{healthLabel(vacancyRate)}</span>
            <span>{onboarding}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
          <RelationshipOwner owner={owner} />
          <ActionButtons onView={onView} onEdit={onEdit} onMore={onMore} />
        </div>
        {menuOpen ? <LandlordMenu landlord={landlord} onClose={onCloseMenu} onOpen={onOpen} onEdit={onEdit} onSendOnboarding={onSendOnboarding} onArchive={onArchive} /> : null}
      </div>
    </article>
  )
}

function CommercialLandlordsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [landlordOptions, setLandlordOptions] = useState([])
  const [summaryFilter, setSummaryFilter] = useState('landlords')
  const [viewMode, setViewMode] = useState('grid')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [openMenuId, setOpenMenuId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [sort, setSort] = useState('updated_desc')
  const [filters, setFilters] = useState({ status: 'all', landlordType: 'all', branchId: 'all', teamId: 'all', brokerId: 'all' })
  const [organisationId, setOrganisationId] = useState('')
  const [lookups, setLookups] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [modalState, setModalState] = useState({ open: false, mode: 'create', record: null })
  const [drawerRecord, setDrawerRecord] = useState(null)

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
      setError(loadError?.message || 'Commercial landlord data could not be loaded.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!location.state?.openCommercialCreate) return
    setModalState({ open: true, mode: 'create', record: location.state?.commercialCreateDraft || null })
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  const lookupOptions = useMemo(() => toLookupOptions(lookups), [lookups])
  const landlords = useMemo(() => lookups.landlords || [], [lookups.landlords])
  const activeLandlords = useMemo(() => landlords.filter((row) => isActiveRecord(row.status)), [landlords])
  const metricsByLandlord = useMemo(() => {
    const map = new Map()
    activeLandlords.forEach((landlord) => {
      const properties = (lookups.properties || []).filter((row) => row.landlord_id === landlord.id && isActiveRecord(row.status))
      const propertyIds = new Set(properties.map((property) => property.id))
      const mandates = (lookups.listings || []).filter((row) => isActiveMandate(row) && (row.landlord_id === landlord.id || propertyIds.has(row.property_id)))
      const vacancies = (lookups.vacancies || []).filter((row) => isOpenVacancy(row) && (row.landlord_id === landlord.id || propertyIds.has(row.property_id)))
      const leases = (lookups.leases || []).filter((row) => isActiveLease(row) && (row.landlord_id === landlord.id || propertyIds.has(row.property_id)))
      const totalGla = properties.reduce((sum, property) => sum + numberValue(property.gla_m2), 0) || numberValue(landlord.total_gla_estimate)
      const availableArea = vacancies.reduce((sum, vacancy) => sum + numberValue(vacancy.available_area_m2), 0)
        || properties.reduce((sum, property) => sum + numberValue(property.available_space_m2), 0)
      const relationshipOwnerId = landlord.broker_id || properties.find((property) => property.broker_id)?.broker_id || ''
      map.set(landlord.id, {
        properties,
        mandates,
        vacancies,
        leases,
        propertyCount: properties.length || numberValue(landlord.number_of_properties_estimate),
        totalGla,
        vacancyCount: vacancies.length,
        activeLeaseCount: leases.length,
        activeMandateCount: mandates.length,
        availableArea,
        vacancyRate: totalGla ? Math.round((availableArea / totalGla) * 100) : 0,
        location: primaryLocation(landlord, properties),
        relationshipOwnerId,
      })
    })
    return map
  }, [activeLandlords, lookups.leases, lookups.listings, lookups.properties, lookups.vacancies])

  const counts = useMemo(() => {
    const values = Array.from(metricsByLandlord.values())
    return {
      landlords: activeLandlords.length,
      portfolios: values.reduce((sum, item) => sum + item.propertyCount, 0),
      mandates: values.reduce((sum, item) => sum + item.activeMandateCount, 0),
      vacancies: values.reduce((sum, item) => sum + item.vacancyCount, 0),
      occupied: values.reduce((sum, item) => sum + item.activeLeaseCount, 0),
    }
  }, [activeLandlords.length, metricsByLandlord])

  const statusOptions = useMemo(() => {
    const values = new Map()
    landlords.forEach((landlord) => {
      if (landlord.status) values.set(landlord.status, titleize(landlord.status))
      if (landlord.onboarding_status) values.set(landlord.onboarding_status, titleize(landlord.onboarding_status))
    })
    return Array.from(values.entries()).map(([value, label]) => ({ value, label }))
  }, [landlords])

  const landlordTypeOptions = useMemo(() => {
    const values = new Map()
    landlords.forEach((landlord) => {
      const value = landlord.entity_type || landlord.landlord_type
      if (value) values.set(value, titleize(value))
    })
    return Array.from(values.entries()).map(([value, label]) => ({ value, label }))
  }, [landlords])

  const filteredLandlords = useMemo(() => {
    const query = normalizeLower(searchTerm)
    const [sortKey, direction] = sort.split('_')
    const multiplier = direction === 'asc' ? 1 : -1
    return activeLandlords
      .filter((landlord) => {
        const metrics = metricsByLandlord.get(landlord.id) || {}
        if (summaryFilter === 'portfolios' && !metrics.propertyCount) return false
        if (summaryFilter === 'mandates' && !metrics.activeMandateCount) return false
        if (summaryFilter === 'vacancies' && !metrics.vacancyCount) return false
        if (summaryFilter === 'occupied' && !metrics.activeLeaseCount) return false
        return true
      })
      .filter((landlord) => filters.status === 'all' || String(landlord.status || landlord.onboarding_status || '') === String(filters.status) || String(landlord.onboarding_status || '') === String(filters.status))
      .filter((landlord) => filters.landlordType === 'all' || String(landlord.entity_type || landlord.landlord_type || '') === String(filters.landlordType))
      .filter((landlord) => filters.branchId === 'all' || String(landlord.branch_id || '') === String(filters.branchId))
      .filter((landlord) => filters.teamId === 'all' || String(landlord.team_id || '') === String(filters.teamId))
      .filter((landlord) => {
        const owner = metricsByLandlord.get(landlord.id)?.relationshipOwnerId || landlord.broker_id || ''
        return filters.brokerId === 'all' || String(owner) === String(filters.brokerId)
      })
      .filter((landlord) => {
        if (!query) return true
        const metrics = metricsByLandlord.get(landlord.id) || {}
        const propertyNames = (metrics.properties || []).map((property) => property.property_name).join(' ')
        const blob = [
          landlord.name,
          landlord.legal_name,
          landlord.trading_name,
          landlord.contact_person,
          landlord.main_email,
          landlord.email,
          landlord.entity_type,
          landlord.landlord_type,
          metrics.location,
          propertyNames,
          getLookupLabel(lookupOptions.brokers, metrics.relationshipOwnerId || landlord.broker_id, ''),
        ].join(' ').toLowerCase()
        return blob.includes(query)
      })
      .sort((left, right) => {
        const leftMetrics = metricsByLandlord.get(left.id) || {}
        const rightMetrics = metricsByLandlord.get(right.id) || {}
        if (sortKey === 'name') return normalizeText(left.legal_name || left.name).localeCompare(normalizeText(right.legal_name || right.name))
        if (sortKey === 'properties') return (numberValue(leftMetrics.propertyCount) - numberValue(rightMetrics.propertyCount)) * multiplier
        if (sortKey === 'vacancy') return (numberValue(leftMetrics.vacancyRate) - numberValue(rightMetrics.vacancyRate)) * multiplier
        if (sortKey === 'portfolio') return (numberValue(leftMetrics.totalGla) - numberValue(rightMetrics.totalGla)) * multiplier
        const leftDate = new Date(left.updated_at || left.created_at || 0).getTime() || 0
        const rightDate = new Date(right.updated_at || right.created_at || 0).getTime() || 0
        return (leftDate - rightDate) * multiplier
      })
  }, [activeLandlords, filters, lookupOptions.brokers, metricsByLandlord, searchTerm, sort, summaryFilter])

  function setFilter(key, value) {
    setFilters((previous) => ({ ...previous, [key]: value }))
  }

  function resetFilters() {
    setFilters({ status: 'all', landlordType: 'all', branchId: 'all', teamId: 'all', brokerId: 'all' })
    setSearchTerm('')
  }

  function openInviteFor(landlord = null) {
    const rows = landlord ? [landlord] : landlords
    setLandlordOptions((rows || []).map((row) => ({
      value: row.id,
      label: row.legal_name || row.name || 'Landlord',
      email: row.main_email || row.email || '',
      phone: row.main_phone || row.phone || '',
      contactPerson: row.contact_person || '',
    })))
    setInviteOpen(true)
    setOpenMenuId('')
  }

  async function handleCreateOnboarding(payload) {
    await createCommercialLandlordOnboarding(payload)
    setInviteOpen(false)
    await loadData({ showLoading: false })
  }

  async function handleSave(payload) {
    const config = commercialCrudConfigs.landlords
    if (!organisationId) throw new Error('Commercial organisation context is not available.')
    const saved = modalState.mode === 'edit' && modalState.record?.id
      ? await config.updateRecord(modalState.record.id, payload)
      : await config.createRecord({ ...payload, organisation_id: organisationId })
    await loadData({ showLoading: false })
    return saved
  }

  async function handleArchive(landlord) {
    if (!landlord?.id) return
    const confirmed = window.confirm('Archive this landlord record?')
    if (!confirmed) return
    setActionError('')
    try {
      await commercialCrudConfigs.landlords.archiveRecord(landlord.id)
      setOpenMenuId('')
      setDrawerRecord(null)
      await loadData({ showLoading: false })
    } catch (archiveError) {
      setActionError(archiveError?.message || 'The landlord record could not be archived.')
    }
  }

  const drawerFields = useMemo(() => buildDrawerFields(lookupOptions), [lookupOptions])
  const gridClass = viewMode === 'grid' ? 'grid gap-5 md:grid-cols-2 xl:grid-cols-3' : 'grid gap-3'

  return (
    <div className="grid gap-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#102236]">Portfolio</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-[-0.05em] text-[#102236]">Landlords</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">Manage landlord relationships, portfolios and related activity.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setModalState({ open: true, mode: 'create', record: null })} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#082f57] px-5 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(8,47,87,0.18)] transition hover:bg-[#123b61]">
            <Plus size={17} />
            Create Landlord
          </button>
          <button type="button" onClick={() => openInviteFor()} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#dbe5ef] bg-white px-5 text-sm font-semibold text-[#102236] transition hover:bg-[#f8fbfd]">
            <Send size={17} />
            Send Landlord Onboarding
          </button>
        </div>
      </section>

      <SummaryStrip active={summaryFilter} counts={counts} onChange={setSummaryFilter} />

      <section className="rounded-[22px] border border-[#dde7f0] bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.045)]">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_auto] xl:items-end">
          <label className="flex h-12 min-w-0 items-center gap-3 rounded-2xl border border-[#dbe5ef] bg-white px-4 text-[#60758d]">
            <Search size={17} className="shrink-0" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search landlords, companies, contacts, properties..."
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-[#102236] outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setFiltersOpen((open) => !open)} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-[#f8fbfd] md:hidden">
              <Filter size={16} />
              Filters
            </button>
            <label className="grid gap-1">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#72839a]">Sort by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-11 rounded-2xl border border-[#dbe5ef] bg-white px-3 text-sm font-semibold text-[#102236] outline-none transition focus:border-[#8fb8e8] focus:ring-4 focus:ring-blue-50">
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 rounded-2xl border border-[#dbe5ef] bg-[#f8fbfd] p-1">
              <button type="button" onClick={() => setViewMode('grid')} title="Grid" className={`grid h-10 w-10 place-items-center rounded-xl transition ${viewMode === 'grid' ? 'bg-white text-[#0b6dff] shadow-sm' : 'text-[#60758d]'}`}><Grid2X2 size={17} /></button>
              <button type="button" onClick={() => setViewMode('list')} title="List" className={`grid h-10 w-10 place-items-center rounded-xl transition ${viewMode === 'list' ? 'bg-white text-[#0b6dff] shadow-sm' : 'text-[#60758d]'}`}><LayoutList size={18} /></button>
            </div>
          </div>
        </div>
        <div className="mt-4 hidden grid-cols-6 gap-3 md:grid">
          <FilterPanel filters={filters} setFilter={setFilter} lookupOptions={lookupOptions} landlordTypeOptions={landlordTypeOptions} statusOptions={statusOptions} onReset={resetFilters} />
        </div>
        {filtersOpen ? (
          <div className="mt-4 grid gap-3 rounded-2xl border border-[#dde7f0] bg-[#f8fbfd] p-3 md:hidden">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#102236]">Filters</span>
              <button type="button" onClick={() => setFiltersOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#60758d]"><X size={16} /></button>
            </div>
            <FilterPanel filters={filters} setFilter={setFilter} lookupOptions={lookupOptions} landlordTypeOptions={landlordTypeOptions} statusOptions={statusOptions} onReset={resetFilters} />
          </div>
        ) : null}
      </section>

      {actionError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{actionError}</div> : null}

      <section className="rounded-[22px] border border-[#dde7f0] bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.045)]">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#102236]">Landlord Relationships ({filteredLandlords.length})</h2>
            <p className="mt-1 text-sm text-[#60758d]">Portfolio ownership, vacancy exposure, mandate activity and relationship ownership.</p>
          </div>
          <p className="rounded-2xl bg-[#f8fbfd] px-3 py-2 text-sm font-semibold text-[#60758d]">{SORT_OPTIONS.find((option) => option.value === sort)?.label}</p>
        </div>

        {loading ? (
          <div className={gridClass}>
            {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-72 animate-pulse rounded-[22px] bg-[#eef4f8]" />)}
          </div>
        ) : error ? (
          <CommercialEmptyState title="Landlord data could not be loaded" description={error} />
        ) : filteredLandlords.length ? (
          <div className={gridClass}>
            {filteredLandlords.map((landlord) => {
              const metrics = metricsByLandlord.get(landlord.id) || { properties: [], mandates: [], propertyCount: 0, totalGla: 0, vacancyCount: 0, activeLeaseCount: 0, vacancyRate: 0, location: 'Location pending' }
              return (
                <LandlordCard
                  key={landlord.id}
                  landlord={landlord}
                  metrics={metrics}
                  lookupOptions={lookupOptions}
                  menuOpen={openMenuId === landlord.id}
                  compact={viewMode === 'list'}
                  onView={() => setDrawerRecord(landlord)}
                  onOpen={() => navigate(`/commercial/landlords/${landlord.id}`)}
                  onEdit={() => {
                    setModalState({ open: true, mode: 'edit', record: landlord })
                    setOpenMenuId('')
                  }}
                  onMore={() => setOpenMenuId((current) => current === landlord.id ? '' : landlord.id)}
                  onCloseMenu={() => setOpenMenuId('')}
                  onSendOnboarding={() => openInviteFor(landlord)}
                  onArchive={() => void handleArchive(landlord)}
                />
              )
            })}
          </div>
        ) : (
          <CommercialEmptyState
            title="No landlords yet."
            description="Create a landlord or send onboarding to start building a commercial relationship portfolio."
            primaryActionLabel="Create Landlord"
            onPrimaryAction={() => setModalState({ open: true, mode: 'create', record: null })}
          />
        )}
      </section>

      <CommercialFormModal
        open={modalState.open}
        mode={modalState.mode}
        title={commercialCrudConfigs.landlords.title}
        fields={commercialCrudConfigs.landlords.fields}
        record={modalState.record}
        lookups={lookupOptions}
        crossValidate={commercialCrudConfigs.landlords.crossValidate}
        onClose={() => setModalState({ open: false, mode: 'create', record: null })}
        onSubmit={handleSave}
      />

      <CommercialRecordDrawer
        open={Boolean(drawerRecord)}
        record={drawerRecord}
        kind="landlords"
        title={commercialCrudConfigs.landlords.title}
        fields={drawerFields}
        lookups={lookupOptions}
        rawLookups={lookups}
        documentsEntityType={commercialCrudConfigs.landlords.documentsEntityType}
        organisationId={organisationId}
        secondaryActionLabel="Send Onboarding"
        onSecondaryAction={(record) => openInviteFor(record)}
        onClose={() => setDrawerRecord(null)}
        onEdit={() => {
          setModalState({ open: true, mode: 'edit', record: drawerRecord })
          setDrawerRecord(null)
        }}
        onArchive={() => void handleArchive(drawerRecord)}
      />

      <CommercialLandlordOnboardingInviteModal
        open={inviteOpen}
        landlordOptions={landlordOptions}
        onClose={() => setInviteOpen(false)}
        onSubmit={handleCreateOnboarding}
      />
    </div>
  )
}

export default CommercialLandlordsPage
