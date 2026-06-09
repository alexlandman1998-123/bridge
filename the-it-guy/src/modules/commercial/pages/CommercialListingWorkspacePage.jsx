import { ArrowLeft, BarChart3, ClipboardList, FileText, Handshake, Images, ScrollText } from 'lucide-react'
import { createElement, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import CommercialDocumentLibrary from '../components/CommercialDocumentLibrary'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { useCommercialData } from '../hooks/useCommercialData'
import {
  getCommercialActivity,
  getCommercialAllHeadsOfTerms,
  getCommercialDeals,
  getCommercialLandlords,
  getCommercialLeases,
  getCommercialListings,
  getCommercialProperties,
  getCommercialVacancies,
} from '../services/commercialApi'
import { scoreListingQuality } from '../services/commercialIntelligenceApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

const TABS = [
  { id: 'overview', label: 'Overview', icon: ClipboardList },
  { id: 'marketing', label: 'Marketing', icon: Images },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'activity', label: 'Activity', icon: ScrollText },
  { id: 'deals', label: 'Deals', icon: Handshake },
  { id: 'hots', label: 'HOTs', icon: FileText },
  { id: 'leases', label: 'Leases', icon: FileText },
  { id: 'performance', label: 'Performance', icon: BarChart3 },
]

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function metadataRows(metadata = {}) {
  return Object.entries(metadata || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => [titleize(key), typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)])
}

function lookupName(rows, id, field, fallback = '-') {
  if (!id) return fallback
  return rows.find((row) => row.id === id)?.[field] || fallback
}

async function loadListingWorkspace(organisationId, listingId) {
  const [listings, landlords, properties, vacancies, deals, headsOfTerms, leases, activity] = await Promise.all([
    getCommercialListings(organisationId),
    getCommercialLandlords(organisationId),
    getCommercialProperties(organisationId),
    getCommercialVacancies(organisationId),
    getCommercialDeals(organisationId),
    getCommercialAllHeadsOfTerms(organisationId),
    getCommercialLeases(organisationId),
    getCommercialActivity({ organisationId, entityType: 'commercial_listing', entityId: listingId }),
  ])
  const listing = listings.find((row) => row.id === listingId) || null
  const relatedDeals = deals.filter((deal) => deal.listing_id === listingId || (listing?.property_id && deal.property_id === listing.property_id))
  const dealIds = new Set(relatedDeals.map((deal) => deal.id))
  const relatedHots = headsOfTerms.filter((hot) => dealIds.has(hot.deal_id))
  const relatedLeases = leases.filter((lease) => dealIds.has(lease.deal_id) || (listing?.property_id && lease.property_id === listing.property_id))
  return { listing, listings, landlords, properties, vacancies, deals: relatedDeals, headsOfTerms: relatedHots, leases: relatedLeases, activity }
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
  const [activeTab, setActiveTab] = useState('overview')
  const fetcher = useMemo(() => (organisationId) => loadListingWorkspace(organisationId, listingId), [listingId])
  const { data, loading, error, organisationId } = useCommercialData(fetcher, [fetcher])
  const listing = data?.listing || null
  const performance = listing?.performance_json || {}
  const marketing = listing?.marketing_json || {}
  const media = listing?.media_json || {}

  if (error) return <CommercialEmptyState title="Listing workspace could not be loaded" description={error} />
  if (loading) return <div className="h-64 animate-pulse rounded-3xl bg-slate-100" />
  if (!listing) return <CommercialEmptyState title="Listing not found" description="This listing may have been archived or is outside your commercial workspace scope." />

  const landlordName = lookupName(data?.landlords || [], listing.landlord_id, 'name')
  const propertyName = lookupName(data?.properties || [], listing.property_id, 'property_name')
  const vacancyName = lookupName(data?.vacancies || [], listing.vacancy_id, 'vacancy_name')
  const property = (data?.properties || []).find((row) => row.id === listing.property_id) || {}
  const quality = scoreListingQuality(listing, { propertiesById: new Map([[property.id, property]].filter(([id]) => id)) })

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
          </div>
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
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
              ['Missing', quality.missing.join(', ') || 'No critical gaps'],
            ]} />
          </div>
          <div className="mt-5">
            <DetailGrid rows={metadataRows(listing.metadata_json)} />
          </div>
        </section>
      ) : null}

      {activeTab === 'marketing' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Marketing</h2>
          <div className="mt-4">
            <DetailGrid rows={[
              ['Photos', formatNumber(asArray(media.photos).length)],
              ['Videos', formatNumber(asArray(media.videos).length)],
              ['Brochure', media.brochure ? 'Available' : 'Not uploaded'],
              ['Marketing Status', titleize(marketing.status || 'draft')],
              ['Featured Status', listing.featured ? 'Featured' : 'Standard'],
              ['Description', listing.description || '-'],
            ]} />
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

      {activeTab === 'hots' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">HOTs</h2>
          <div className="mt-4">
            <RelatedList
              rows={data?.headsOfTerms || []}
              empty="No Heads of Terms linked through this listing's deals yet."
              render={(hot) => (
                <article key={hot.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-sm font-semibold text-[#102236]">{hot.premises_description || 'Heads of Terms'}</p>
                  <p className="mt-1 text-sm text-slate-500">{titleize(hot.status)} · {formatCurrency(hot.monthly_rental)}</p>
                </article>
              )}
            />
          </div>
        </section>
      ) : null}

      {activeTab === 'leases' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Leases</h2>
          <div className="mt-4">
            <RelatedList
              rows={data?.leases || []}
              empty="No leases linked to this listing yet."
              render={(lease) => (
                <article key={lease.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-sm font-semibold text-[#102236]">Lease {String(lease.id).slice(0, 8)}</p>
                  <p className="mt-1 text-sm text-slate-500">{formatDate(lease.lease_start_date)} to {formatDate(lease.lease_end_date)} · {formatCurrency(lease.monthly_rental)}</p>
                </article>
              )}
            />
          </div>
        </section>
      ) : null}

      {activeTab === 'performance' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Performance</h2>
          <div className="mt-4">
            <DetailGrid rows={[
              ['Views', formatNumber(performance.views)],
              ['Enquiries', formatNumber(performance.enquiries)],
              ['Requirements Matched', formatNumber(performance.requirements_matched)],
              ['Deals Created', formatNumber(performance.deals_created)],
              ['Conversion Rate', `${formatNumber(performance.conversion_rate)}%`],
            ]} />
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default CommercialListingWorkspacePage
