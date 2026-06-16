import { ArrowLeft, Building2, CalendarClock, ClipboardList, DoorOpen, FileText, Handshake, ScrollText } from 'lucide-react'
import { createElement, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import CommercialDocumentLibrary from '../components/CommercialDocumentLibrary'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialLandlordOnboardingAction from '../components/CommercialLandlordOnboardingAction'
import CommercialOnboardingSendAction from '../components/CommercialOnboardingSendAction'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { useCommercialData } from '../hooks/useCommercialData'
import { buildCommercialDocumentGeneratorPath } from '../../../services/documents/commercialDocumentAdapterService'
import {
  createCommercialTransaction,
  getCommercialActivity,
  getCommercialAllHeadsOfTerms,
  getCommercialDeals,
  getCommercialLandlords,
  getCommercialLeases,
  getCommercialListings,
  getCommercialProperties,
  getCommercialTransactions,
  getCommercialVacancies,
  getCommercialViewings,
} from '../services/commercialApi'
import { scoreListingQuality } from '../services/commercialIntelligenceApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

const TABS = [
  { id: 'overview', label: 'Overview', icon: ClipboardList },
  { id: 'property', label: 'Property', icon: Building2 },
  { id: 'vacancy', label: 'Vacancy', icon: DoorOpen },
  { id: 'viewings', label: 'Viewings', icon: CalendarClock },
  { id: 'transactions', label: 'Transactions', icon: Handshake },
  { id: 'deals', label: 'Deals', icon: Handshake },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'activity', label: 'Activity', icon: ScrollText },
]

function metadataRows(metadata = {}) {
  function visit(prefix, value, rows) {
    if (value === null || value === undefined || value === '') return
    if (Array.isArray(value)) {
      if (value.length) rows.push([prefix, value.join(', ')])
      return
    }
    if (typeof value === 'object') {
      Object.entries(value).forEach(([key, entry]) => {
        visit(prefix ? `${prefix} · ${titleize(key)}` : titleize(key), entry, rows)
      })
      return
    }
    rows.push([prefix, typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)])
  }

  const rows = []
  visit('', metadata || {}, rows)
  return rows
}

function lookupName(rows, id, field, fallback = '-') {
  if (!id) return fallback
  return rows.find((row) => row.id === id)?.[field] || fallback
}

function resolvePropertyAssetCategory(propertyType = '') {
  const normalized = String(propertyType || '').toLowerCase()
  if (normalized.includes('industrial')) return 'industrial'
  if (normalized.includes('retail') || normalized.includes('centre') || normalized.includes('mall')) return 'retail'
  if (normalized.includes('agricultural') || normalized.includes('farm')) return 'agricultural'
  return 'office'
}

async function loadListingWorkspace(organisationId, listingId) {
  const [listings, landlords, properties, vacancies, deals, headsOfTerms, leases, viewings, transactions, activity] = await Promise.all([
    getCommercialListings(organisationId),
    getCommercialLandlords(organisationId),
    getCommercialProperties(organisationId),
    getCommercialVacancies(organisationId),
    getCommercialDeals(organisationId),
    getCommercialAllHeadsOfTerms(organisationId),
    getCommercialLeases(organisationId),
    getCommercialViewings(organisationId),
    getCommercialTransactions(organisationId),
    getCommercialActivity({ organisationId, entityType: 'commercial_listing', entityId: listingId }),
  ])
  const listing = listings.find((row) => row.id === listingId) || null
  const relatedDeals = deals.filter((deal) => deal.listing_id === listingId || (listing?.property_id && deal.property_id === listing.property_id))
  const relatedTransactions = transactions.filter((transaction) =>
    transaction.listing_id === listingId ||
    (listing?.vacancy_id && transaction.vacancy_id === listing.vacancy_id) ||
    (listing?.property_id && transaction.property_id === listing.property_id)
  )
  const relatedViewings = viewings.filter((viewing) =>
    viewing.listing_id === listingId ||
    (listing?.vacancy_id && viewing.vacancy_id === listing.vacancy_id) ||
    (listing?.property_id && viewing.property_id === listing.property_id)
  )
  const dealIds = new Set(relatedDeals.map((deal) => deal.id))
  const relatedHots = headsOfTerms.filter((hot) => dealIds.has(hot.deal_id))
  const relatedLeases = leases.filter((lease) => dealIds.has(lease.deal_id) || (listing?.property_id && lease.property_id === listing.property_id))
  return { listing, listings, landlords, properties, vacancies, deals: relatedDeals, transactions: relatedTransactions, headsOfTerms: relatedHots, leases: relatedLeases, viewings: relatedViewings, activity }
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

function RelatedList({ rows = [], empty, render }) {
  return rows.length ? (
    <div className="grid gap-3">
      {rows.map(render)}
    </div>
  ) : (
    <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{empty}</p>
  )
}

function CommercialListingWorkspacePage() {
  const { listingId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [actionError, setActionError] = useState('')
  const fetcher = useMemo(() => (organisationId) => loadListingWorkspace(organisationId, listingId), [listingId])
  const { data, loading, error, organisationId } = useCommercialData(fetcher, [fetcher])
  const listing = data?.listing || null
  const activeTab = TABS.some((item) => item.id === searchParams.get('tab')) ? searchParams.get('tab') : 'overview'

  if (error) return <CommercialEmptyState title="Listing workspace could not be loaded" description={error} />
  if (loading) return <div className="h-64 animate-pulse rounded-3xl bg-slate-100" />
  if (!listing) return <CommercialEmptyState title="Listing not found" description="This listing may have been archived or is outside your commercial workspace scope." />

  const landlordName = lookupName(data?.landlords || [], listing.landlord_id, 'name')
  const propertyName = lookupName(data?.properties || [], listing.property_id, 'property_name')
  const vacancyName = lookupName(data?.vacancies || [], listing.vacancy_id, 'vacancy_name')
  const property = (data?.properties || []).find((row) => row.id === listing.property_id) || {}
  const vacancy = (data?.vacancies || []).find((row) => row.id === listing.vacancy_id) || {}
  const landlord = (data?.landlords || []).find((row) => row.id === listing.landlord_id || row.id === property.landlord_id) || null
  const quality = scoreListingQuality(listing, { propertiesById: new Map([[property.id, property]].filter(([id]) => id)) })
  const upcomingViewings = (data?.viewings || []).filter((viewing) => !['completed', 'cancelled', 'no_show'].includes(String(viewing.status || '').toLowerCase()))
  const completedViewings = (data?.viewings || []).filter((viewing) => String(viewing.status || '').toLowerCase() === 'completed')
  const activeTransactions = (data?.transactions || []).filter((transaction) => !['completed', 'lost', 'cancelled'].includes(String(transaction.status || '').toLowerCase()))
  const completedTransactions = (data?.transactions || []).filter((transaction) => String(transaction.status || '').toLowerCase() === 'completed')
  const activeDeals = (data?.deals || []).filter((deal) => !['converted', 'lost'].includes(String(deal.stage || '').toLowerCase()))
  const conversionRate = completedViewings.length ? Math.round((activeDeals.length / completedViewings.length) * 100) : 0

  function changeTab(tabId) {
    const next = new URLSearchParams(searchParams)
    if (tabId === 'overview') next.delete('tab')
    else next.set('tab', tabId)
    setSearchParams(next, { replace: true })
  }

  async function handleCreateTransaction() {
    setActionError('')
    try {
      const transaction = await createCommercialTransaction({
        organisation_id: organisationId,
        listing_id: listing.id,
        property_id: listing.property_id || '',
        vacancy_id: listing.vacancy_id || '',
        broker_id: listing.broker_id || '',
        branch_id: listing.branch_id,
        team_id: listing.team_id,
        transaction_type: listing.listing_type === 'sale' || listing.listing_type === 'investment' ? 'sale' : 'lease',
        status: 'draft',
        transaction_name: `${listing.title || 'Listing'} Transaction`,
      })
      navigate(`/commercial/transactions/${transaction.id}`)
    } catch (transactionError) {
      setActionError(transactionError?.message || 'Transaction could not be created from this listing.')
    }
  }

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <Link to="/commercial/listings" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#102236]">
          <ArrowLeft size={16} />
          Listings
        </Link>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CommercialStatusPill value={listing.listing_status || listing.status} />
              {listing.featured ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Featured</span> : null}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-[#102236]">{listing.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{listing.description || `${titleize(listing.listing_category)} listing linked to ${propertyName}.`}</p>
          </div>
          <div className="grid min-w-[220px] gap-2 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 text-sm">
            <span className="font-semibold text-[#102236]">Listing Quality {quality.score}%</span>
            <span className="font-semibold text-[#102236]">{formatCurrency(listing.pricing)}</span>
            <span className="text-slate-500">Available {formatDate(listing.available_from)}</span>
            <span className="text-slate-500">{titleize(listing.listing_type)} · {titleize(listing.listing_category)}</span>
            <Link
              to={buildCommercialDocumentGeneratorPath({
                packetType: String(listing.listing_type || '').toLowerCase() === 'sale' || String(listing.listing_type || '').toLowerCase() === 'investment' ? 'commercial_sale' : 'commercial_lease',
                assetCategory: resolvePropertyAssetCategory(property.property_type),
                listingId: listing.id,
                propertyId: listing.property_id || '',
                vacancyId: listing.vacancy_id || '',
                landlordId: listing.landlord_id || '',
              })}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] transition hover:bg-slate-50"
            >
              <FileText size={16} />
              Generate document
            </Link>
            <CommercialLandlordOnboardingAction
              organisationId={organisationId}
              landlord={landlord}
              buttonClassName="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50 disabled:opacity-60"
            />
            <CommercialOnboardingSendAction
              organisationId={organisationId}
              kind="listing"
              record={listing}
              lookups={data?.lookups || {}}
              label={String(listing.listing_type || '').toLowerCase() === 'lease' ? 'Send Tenant Onboarding' : 'Send Seller Onboarding'}
            />
            <Link
              to="/commercial/viewings"
              state={{
                openCommercialViewing: true,
                viewingDraft: {
                  listing_id: listing.id,
                  property_id: listing.property_id || '',
                  vacancy_id: listing.vacancy_id || '',
                  broker_id: listing.broker_id || '',
                },
              }}
              className="mt-2 inline-flex min-h-10 items-center justify-center rounded-xl bg-[#102b46] px-3 text-sm font-semibold text-white transition hover:bg-[#163a5b]"
            >
              Schedule Viewing
            </Link>
          </div>
        </div>
        {actionError ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{actionError}</div> : null}
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => changeTab(tab.id)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${activeTab === tab.id ? 'bg-[#102b46] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {createElement(tab.icon, { size: 15 })}
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Overview</h2>
          <div className="mt-4">
            <DetailGrid rows={[
              ['Listing Name', listing.title],
              ['Category', titleize(listing.listing_category)],
              ['Property', propertyName],
              ['Vacancy', vacancyName],
              ['Landlord', landlordName],
              ['Broker', listing.broker_id || 'Unassigned'],
              ['Status', titleize(listing.listing_status)],
              ['Price', formatCurrency(listing.pricing)],
              ['Availability', formatDate(listing.available_from)],
              ['Listing Quality', `${quality.score}%`],
              ['Viewings', formatNumber((data?.viewings || []).length)],
              ['Deals', formatNumber((data?.deals || []).length)],
              ['Transactions', formatNumber((data?.transactions || []).length)],
              ['Conversion Rate', `${formatNumber(conversionRate)}%`],
              ['Missing', quality.missing.join(', ') || 'No critical gaps'],
            ]} />
          </div>
          <div className="mt-5">
            <DetailGrid rows={metadataRows(listing.metadata_json)} />
          </div>
          <div className="mt-5">
            <DetailGrid rows={[
              ['Transactions Count', String((data?.transactions || []).length)],
              ['Active Transactions', String(activeTransactions.length)],
              ['Completed Transactions', String(completedTransactions.length)],
            ]} />
          </div>
        </section>
      ) : null}

      {activeTab === 'property' ? (
        <section className={CARD_CLASS}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Property</h2>
              <p className="mt-1 text-sm text-slate-500">The listing’s parent asset record and current building context.</p>
            </div>
            {property?.id ? <Link to={`/commercial/properties/${property.id}`} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">Open Property</Link> : null}
          </div>
          <div className="mt-4">
            <DetailGrid rows={[
              ['Property Name', property.property_name || 'Property pending'],
              ['Property Type', titleize(property.property_type)],
              ['Landlord', landlordName],
              ['Location', [property.address, property.suburb, property.city, property.province].filter(Boolean).join(', ') || '-'],
              ['Total GLA', formatNumber(property.gla_m2, 'm²')],
              ['Available Space', formatNumber(property.available_space_m2, 'm²')],
              ['Vacancy %', property.vacancy_percentage || property.vacancy_percentage === 0 ? `${formatNumber(property.vacancy_percentage)}%` : '-'],
              ['Broker', property.broker_id || 'Unassigned'],
            ]} />
          </div>
        </section>
      ) : null}

      {activeTab === 'vacancy' ? (
        <section className={CARD_CLASS}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Vacancy</h2>
              <p className="mt-1 text-sm text-slate-500">The specific inventory unit this listing is marketing.</p>
            </div>
            {vacancy?.id ? <Link to={`/commercial/vacancies/${vacancy.id}`} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">Open Vacancy</Link> : null}
          </div>
          <div className="mt-4">
            <DetailGrid rows={[
              ['Vacancy Name', vacancy.vacancy_name || 'Vacancy pending'],
              ['Unit / Floor', vacancy.unit_or_floor || '-'],
              ['Available Area', formatNumber(vacancy.available_area_m2, 'm²')],
              ['Rental', formatCurrency(vacancy.asking_rental)],
              ['Availability Date', formatDate(vacancy.availability_date)],
              ['Status', titleize(vacancy.status)],
              ['Broker', vacancy.broker_assignment || vacancy.broker_id || 'Unassigned'],
              ['Incentives', vacancy.incentives || '-'],
            ]} />
          </div>
        </section>
      ) : null}

      {activeTab === 'viewings' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Viewing Activity</h2>
          <div className="mt-4">
            <DetailGrid rows={[
              ['Upcoming Viewings', formatNumber(upcomingViewings.length)],
              ['Completed Viewings', formatNumber(completedViewings.length)],
              ['Total Viewings', formatNumber((data?.viewings || []).length)],
              ['Conversion Rate', `${formatNumber(conversionRate)}%`],
            ]} />
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-[#102236]">Upcoming Viewings</h3>
              <div className="mt-3">
                <RelatedList
                  rows={upcomingViewings}
                  empty="No upcoming viewings for this listing."
                  render={(viewing) => (
                    <article key={viewing.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                      <p className="text-sm font-semibold text-[#102236]">{formatDate(viewing.viewing_date)} · {String(viewing.viewing_time || '').slice(0, 5) || '-'}</p>
                      <p className="mt-1 text-sm text-slate-500">{titleize(viewing.status)}</p>
                    </article>
                  )}
                />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#102236]">Completed Viewings</h3>
              <div className="mt-3">
                <RelatedList
                  rows={completedViewings}
                  empty="No completed viewings for this listing yet."
                  render={(viewing) => (
                    <article key={viewing.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                      <p className="text-sm font-semibold text-[#102236]">{formatDate(viewing.viewing_date)} · {String(viewing.viewing_time || '').slice(0, 5) || '-'}</p>
                      <p className="mt-1 text-sm text-slate-500">{viewing.feedback || 'Feedback not captured yet.'}</p>
                    </article>
                  )}
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'transactions' ? (
        <section className={CARD_CLASS}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Transactions</h2>
              <p className="mt-1 text-sm text-slate-500">Active and completed transactions linked to this listing.</p>
            </div>
            <button type="button" onClick={() => void handleCreateTransaction()} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#102b46] px-3 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
              Create Transaction
            </button>
          </div>
          <div className="mt-4">
            <DetailGrid rows={[
              ['Transactions Count', String((data?.transactions || []).length)],
              ['Active Transactions', String(activeTransactions.length)],
              ['Completed Transactions', String(completedTransactions.length)],
              ['Conversion Rate', `${formatNumber(conversionRate)}%`],
            ]} />
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-[#102236]">Active Transactions</h3>
              <div className="mt-3">
                <RelatedList
                  rows={activeTransactions}
                  empty="No active transactions linked to this listing yet."
                  render={(transaction) => (
                    <Link key={transaction.id} to={`/commercial/transactions/${transaction.id}`} className="block rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
                      <p className="text-sm font-semibold text-[#102236]">{transaction.transaction_name || transaction.transactionName || transaction.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{titleize(transaction.status)} · {titleize(transaction.transaction_type || transaction.transactionType)}</p>
                    </Link>
                  )}
                />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#102236]">Completed Transactions</h3>
              <div className="mt-3">
                <RelatedList
                  rows={completedTransactions}
                  empty="No completed transactions linked to this listing yet."
                  render={(transaction) => (
                    <Link key={transaction.id} to={`/commercial/transactions/${transaction.id}`} className="block rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
                      <p className="text-sm font-semibold text-[#102236]">{transaction.transaction_name || transaction.transactionName || transaction.title}</p>
                      <p className="mt-1 text-sm text-slate-500">Closed {formatDate(transaction.actual_close_date || transaction.actualCloseDate)} · {titleize(transaction.transaction_type || transaction.transactionType)}</p>
                    </Link>
                  )}
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'deals' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Deals</h2>
          <div className="mt-4">
            <RelatedList
              rows={data?.deals || []}
              empty="No negotiations linked to this listing yet."
              render={(deal) => (
                <Link key={deal.id} to="/commercial/deals/leasing" className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
                  <p className="text-sm font-semibold text-[#102236]">{deal.deal_name}</p>
                  <p className="mt-1 text-sm text-slate-500">{titleize(deal.stage)} · {formatCurrency(deal.deal_value)}</p>
                </Link>
              )}
            />
          </div>
        </section>
      ) : null}

      {activeTab === 'documents' ? (
        <CommercialDocumentLibrary organisationId={organisationId} entityType="commercial_listing" entityId={listing.id} />
      ) : null}

      {activeTab === 'activity' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Activity</h2>
          <div className="mt-4">
            <RelatedList
              rows={data?.activity || []}
              empty="No listing activity yet."
              render={(item) => (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-sm font-semibold text-[#102236]">{item.title || titleize(item.activity_type)}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.body || '-'}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-400">{formatDate(item.created_at)}</p>
                </article>
              )}
            />
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default CommercialListingWorkspacePage
