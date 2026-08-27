import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Home,
  Loader2,
  MoreVertical,
  Plus,
  Search,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import FinalListingModuleOverview from '../../components/listings/FinalListingModuleOverview'
import { buildFinalListingModuleOverview } from '../../services/listings/finalListingModuleModel'
import { listRentalListingsForAgent } from '../../services/rentals/rentalListingDraftService'
import {
  buildRentalListingIndexRows,
  filterRentalListingIndexRows,
  formatRentalIndexStatusLabel,
  summarizeRentalListingIndexRows,
} from '../../services/rentals/rentalListingIndexModel'
import {
  buildRentalListingQueryOptions,
  resolveRentalWorkspaceScope,
} from '../../services/rentals/rentalWorkspaceScope'

const RENTAL_LISTING_SORT_OPTIONS = Object.freeze([
  { value: 'newest', label: 'Newest' },
  { value: 'rent_desc', label: 'Rent high to low' },
  { value: 'rent_asc', label: 'Rent low to high' },
  { value: 'available', label: 'Availability' },
  { value: 'status', label: 'Status' },
])

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Not captured'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(value) {
  if (!value) return 'Not captured'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function getRentalListingSortTimestamp(row = {}) {
  const raw = row.raw || {}
  const value = raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || ''
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function sortRentalListingRows(rows = [], sortBy = 'newest') {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    if (sortBy === 'rent_desc') return Number(right.monthlyRent || 0) - Number(left.monthlyRent || 0)
    if (sortBy === 'rent_asc') return Number(left.monthlyRent || 0) - Number(right.monthlyRent || 0)
    if (sortBy === 'available') {
      const leftTime = new Date(left.availableFrom || 0).getTime() || Number.MAX_SAFE_INTEGER
      const rightTime = new Date(right.availableFrom || 0).getTime() || Number.MAX_SAFE_INTEGER
      return leftTime - rightTime
    }
    if (sortBy === 'status') {
      return String(left.statusGroup || '').localeCompare(String(right.statusGroup || ''))
    }
    return getRentalListingSortTimestamp(right) - getRentalListingSortTimestamp(left)
  })
}

function ListingCardImage({ src = '', alt = '' }) {
  if (src) return <img src={src} alt={alt} className="h-full w-full object-cover" />

  return (
    <div className="relative h-full w-full bg-[linear-gradient(140deg,#1f4f78_0%,#4a7da8_55%,#a8c2dc_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(255,255,255,0.24),transparent_52%)]" />
      <div className="absolute bottom-3 left-3 rounded-full border border-white/35 bg-white/20 px-2.5 py-1 text-[0.68rem] font-semibold uppercase text-white">
        Listing image
      </div>
    </div>
  )
}

function rentalDotClass(statusGroup = '') {
  if (statusGroup === 'published') return 'bg-[#1f9f5f]'
  if (statusGroup === 'ready') return 'bg-[#2f80ed]'
  if (statusGroup === 'mandate') return 'bg-[#f59e0b]'
  return 'bg-[#7b8ca2]'
}

function RentalAgentAvatar({ row = {} }) {
  const name = row.assignedAgentName || ''
  const source = name || row.landlordName || 'Rental'
  const initials = source
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || 'R'

  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d7e2ee] bg-[#eef4fa] text-[0.72rem] font-bold text-[#1f4f78]">
      {initials}
    </span>
  )
}

function RentalListingIndexCard({ row, menuOpen = false, onOpen, onToggleMenu, onOpenApplications }) {
  const facts = [
    row.bedrooms !== null && row.bedrooms !== undefined ? `${row.bedrooms} Beds` : '',
    row.bathrooms !== null && row.bathrooms !== undefined ? `${row.bathrooms} Baths` : '',
    row.parkingBays !== null && row.parkingBays !== undefined ? `${row.parkingBays} Parking` : '',
  ].filter(Boolean)

  return (
    <article
      onClick={onOpen}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[8px] border border-[#dce6f2] bg-white shadow-[0_6px_16px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.09)]"
    >
      <div className="relative h-[132px] w-full overflow-hidden border-b border-[#e5edf6]">
        <ListingCardImage src={row.imageUrl} alt={row.title} />
        <div className="absolute left-3 right-14 top-3 inline-flex max-w-[calc(100%-4.5rem)] items-center gap-2 rounded-full border border-white/25 bg-[#091322]/58 px-3 py-1 text-[0.68rem] font-semibold uppercase text-white shadow-[0_8px_18px_rgba(9,19,34,0.18)] backdrop-blur">
          <span className={`h-2 w-2 rounded-full ${rentalDotClass(row.statusGroup)}`} />
          <span className="truncate">{formatRentalIndexStatusLabel(row.statusGroup)}</span>
        </div>
        <div className="absolute right-3 top-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggleMenu?.()
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/45 bg-white/90 text-[#607387] shadow-[0_8px_18px_rgba(9,19,34,0.14)] transition hover:bg-white"
            aria-label={`Open actions for ${row.title}`}
          >
            <MoreVertical size={16} aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div
              className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-[12px] border border-[#dce6f2] bg-white py-1 shadow-[0_14px_30px_rgba(15,23,42,0.16)]"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={onOpen}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8rem] font-semibold text-[#1f4f78] transition hover:bg-[#f5f9fd]"
              >
                <ArrowRight size={14} aria-hidden="true" />
                Open Listing
              </button>
              <button
                type="button"
                onClick={onOpenApplications}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8rem] font-semibold text-[#1f4f78] transition hover:bg-[#f5f9fd]"
              >
                <CalendarDays size={14} aria-hidden="true" />
                Applications
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="line-clamp-2 text-[1.02rem] font-semibold leading-6 text-[#142132]">{row.title}</h3>
          <p className="mt-2 text-[1.05rem] font-semibold text-[#1f4f78]">{formatCurrency(row.monthlyRent)}</p>
          <p className="mt-1 line-clamp-1 text-xs font-semibold text-[#6d8095]">{row.address || row.location || 'Address pending'}</p>
        </div>

        {facts.length ? (
          <div className="grid gap-2 rounded-[12px] border border-[#dbe6f2] bg-[#f9fbfe] px-3 py-2 text-center text-[0.76rem] font-semibold text-[#35546c]" style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}>
            {facts.map((fact) => <span key={fact} className="truncate">{fact}</span>)}
          </div>
        ) : null}

        <div className="grid gap-2 text-[0.72rem] font-semibold text-[#607387]">
          <div className="flex items-center justify-between gap-2">
            <span>Available</span>
            <span className="truncate text-right text-[#20364d]">{formatDate(row.availableFrom)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>P24</span>
            <span className="truncate text-right text-[#20364d]">{formatRentalIndexStatusLabel(row.property24Status)}</span>
          </div>
        </div>

        <div className="mt-auto flex min-w-0 items-center gap-3 border-t border-[#eef3f8] pt-3">
          <RentalAgentAvatar row={row} />
          <div className="min-w-0">
            <p className="truncate text-[0.84rem] font-semibold text-[#20364d]">{row.assignedAgentName || row.landlordName || 'Unassigned'}</p>
            <p className="mt-0.5 truncate text-[0.72rem] text-[#6d8095]">{row.landlordContact || row.location || row.nextAction}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
          className="inline-flex min-h-9 w-full min-w-0 items-center justify-center gap-1.5 rounded-full border border-[#c6d8ea] bg-white px-3 text-[0.76rem] font-semibold text-[#1f4f78] transition hover:border-[#9fb7d1] hover:bg-[#f6faff]"
        >
          <span className="truncate">Open</span>
          <ArrowRight size={14} className="shrink-0" aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

export default function RentalListingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const workspaceContext = useWorkspace()
  const rentalScope = useMemo(() => resolveRentalWorkspaceScope(workspaceContext), [workspaceContext])
  const organisationId = rentalScope.organisationId
  const assignedAgentId = rentalScope.assignedAgentId
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [query, setQuery] = useState('')
  const [statusTab, setStatusTab] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [openRentalMenuId, setOpenRentalMenuId] = useState('')

  const rentalRows = useMemo(() => buildRentalListingIndexRows(listings), [listings])
  const summary = useMemo(() => summarizeRentalListingIndexRows(rentalRows), [rentalRows])
  const finalListingModuleOverview = useMemo(
    () => buildFinalListingModuleOverview({
      activeType: 'rentals',
      salesCount: null,
      rentalCount: summary.total,
      developmentCount: null,
    }),
    [summary.total],
  )
  const filteredRows = useMemo(
    () => sortRentalListingRows(filterRentalListingIndexRows(rentalRows, { query, status: statusTab }), sortBy),
    [query, rentalRows, sortBy, statusTab],
  )

  const loadListings = useCallback(async () => {
    if (!assignedAgentId || !organisationId) {
      setListings([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      const rows = await listRentalListingsForAgent(assignedAgentId, buildRentalListingQueryOptions(rentalScope))
      setListings(rows)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load rental listings.')
      setListings([])
    } finally {
      setLoading(false)
    }
  }, [assignedAgentId, organisationId, rentalScope])

  useEffect(() => {
    void loadListings()
  }, [loadListings])

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    if (params.get('create') === 'rental') {
      navigate('/agent/rentals/listings/new', { replace: true })
    }
  }, [location.search, navigate])

  useEffect(() => {
    const createdTitle = location.state?.rentalListingCreatedTitle
    if (createdTitle) {
      setSuccessMessage(`${createdTitle} was captured as a rental listing draft.`)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  return (
    <section className="page-content">
      <div className="ui-section-stack">
        <FinalListingModuleOverview
          overview={finalListingModuleOverview}
          onNavigate={(path) => path && navigate(path)}
        />

        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-[minmax(260px,1fr)_220px] xl:max-w-[720px]">
              <label className="grid gap-2">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Search</span>
                <div className="flex h-[44px] items-center gap-2 rounded-[14px] border border-[#dce6f2] bg-white px-3">
                  <Search size={15} className="text-[#7b8ca2]" aria-hidden="true" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="w-full border-0 bg-transparent p-0 text-sm text-[#142132] outline-none"
                    placeholder="Search rental, landlord, suburb..."
                  />
                </div>
              </label>
              <label className="grid gap-2">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Sort by</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="h-[44px] rounded-[14px] border border-[#dce6f2] bg-white px-3 text-sm font-semibold text-[#142132] outline-none transition focus:border-[#7aa7cf] focus:ring-2 focus:ring-[#dbeafe]"
                >
                  {RENTAL_LISTING_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-[#dce6f2] bg-white px-5 text-sm font-semibold text-[#142132] shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:border-[#b8c9dc] hover:bg-[#f8fbff]"
                onClick={() => navigate('/agent/rentals/listings/new')}
              >
                <Plus size={16} aria-hidden="true" />
                Add Listing
              </button>
            </div>
          </div>
        </section>

        {error ? <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p> : null}
        {successMessage ? (
          <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">
            <CheckCircle2 size={16} aria-hidden="true" />
            {successMessage}
          </p>
        ) : null}

        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-[1.02rem] font-semibold text-[#142132]">Rental Listings</h2>
              <p className="mt-1 text-sm text-[#607387]">
                Rental stock, landlord readiness, applications, and Property24 rental preparation.
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-1.5 rounded-[18px] border border-[#dbe6f2] bg-[#f5f9fd] p-1.5 sm:max-w-[460px]">
              {[
                { key: 'all', label: 'Rentals', count: summary.total },
                { key: 'applications', label: 'Applications', count: summary.applications || 0 },
              ].map((tab) => {
                const active = statusTab === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusTab(tab.key)}
                    className={`min-w-0 w-full rounded-[12px] border px-2.5 py-2 text-left transition ${
                      active
                        ? 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-[0_8px_16px_rgba(31,79,120,0.2)]'
                        : 'border-[#d8e3ef] bg-white text-[#35546c] hover:border-[#b7c8db]'
                    }`}
                  >
                    <span className="block truncate text-[0.84rem] font-semibold leading-5">{tab.label}</span>
                    <span className={`mt-0.5 block truncate text-[0.7rem] font-medium leading-4 ${active ? 'text-white/82' : 'text-[#7b8ca2]'}`}>
                      {tab.count} item{tab.count === 1 ? '' : 's'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-6 text-sm font-semibold text-[#6c7f95]">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Loading rental listings
            </div>
          ) : filteredRows.length ? (
            <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredRows.map((row) => (
                <RentalListingIndexCard
                  key={row.id}
                  row={row}
                  menuOpen={openRentalMenuId === row.id}
                  onToggleMenu={() => setOpenRentalMenuId((previous) => (previous === row.id ? '' : row.id))}
                  onOpen={() => navigate(`/agent/rentals/listings/${encodeURIComponent(row.id)}`)}
                  onOpenApplications={() => navigate(`/agent/rentals/listings/${encodeURIComponent(row.id)}/applications`)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-5 py-10 text-center">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-[#f8fafc] text-[#42617f]">
                <CalendarDays size={22} aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-[#18324b]">No rental listings found</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-[#607891]">
                Create a rental listing draft or adjust the search and status filters.
              </p>
              <button type="button" className="ui-pill-button ui-pill-button-active mx-auto mt-4" onClick={() => navigate('/agent/rentals/listings/new')}>
                <Plus size={16} aria-hidden="true" />
                Create Rental Listing
              </button>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
