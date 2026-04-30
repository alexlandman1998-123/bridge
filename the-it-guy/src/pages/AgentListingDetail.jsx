import { ArrowLeft, Building2, CalendarDays, ExternalLink, Mail, Phone, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDevelopmentOptions } from '../lib/api'
import { OFFER_STATUS, readAgentPrivateListings, writeAgentPrivateListings } from '../lib/agentListingStorage'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { useEffect } from 'react'

const DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'seller', label: 'Seller' },
  { key: 'documents', label: 'Documents' },
  { key: 'offers', label: 'Offers' },
  { key: 'activity', label: 'Activity' },
]

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Price on request'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatStatusLabel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Requested'
  return normalized
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function statusClass(status) {
  const key = String(status || '').trim().toLowerCase()
  if (key === 'approved' || key === 'completed') return 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
  if (key === 'uploaded' || key === 'under_review' || key === 'reviewed') return 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]'
  if (key === 'rejected') return 'border-[#f6d7d7] bg-[#fff5f5] text-[#b42318]'
  return 'border-[#dbe4ef] bg-[#f8fbff] text-[#48627f]'
}

function offerStatusClass(status) {
  const key = String(status || '').trim().toLowerCase()
  if (key === OFFER_STATUS.ACCEPTED) return 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
  if (key === OFFER_STATUS.REJECTED || key === OFFER_STATUS.EXPIRED) return 'border-[#f6d7d7] bg-[#fff5f5] text-[#b42318]'
  return 'border-[#dbe6f2] bg-[#f5f9fd] text-[#35546c]'
}

function getOnboardingStatusLabel(status) {
  const key = String(status || '').trim().toLowerCase()
  if (key === 'completed') return 'Completed'
  if (key === 'in_progress') return 'In Progress'
  return 'Not Started'
}

function getImageBlock(mediaUrl, title) {
  if (mediaUrl) {
    return <img src={mediaUrl} alt={title} className="h-full w-full object-cover" />
  }
  return (
    <div className="relative h-full w-full bg-[linear-gradient(130deg,#1f4f78_0%,#4b81ad_55%,#afc8df_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.25),transparent_50%)]" />
      <div className="absolute bottom-4 left-4 rounded-full border border-white/35 bg-white/20 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white">
        Property image
      </div>
    </div>
  )
}

function AgentListingDetail() {
  const navigate = useNavigate()
  const { listingId: encodedListingId } = useParams()
  const listingId = decodeURIComponent(String(encodedListingId || ''))
  const { profile } = useWorkspace()

  const [activeTab, setActiveTab] = useState('overview')
  const [privateListings, setPrivateListings] = useState([])
  const [developmentOptions, setDevelopmentOptions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        setLoading(true)
        const listings = readAgentPrivateListings()
        const developments = isSupabaseConfigured ? await fetchDevelopmentOptions() : []
        if (!active) return
        setPrivateListings(Array.isArray(listings) ? listings : [])
        setDevelopmentOptions(Array.isArray(developments) ? developments : [])
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const listingRecord = useMemo(() => {
    if (!listingId) return null

    if (listingId.startsWith('development-')) {
      const developmentId = listingId.replace('development-', '')
      const development = developmentOptions.find((item) => String(item.id) === developmentId)
      if (!development) return null
      return {
        id: listingId,
        listingType: 'development',
        listingTitle: development.name,
        propertyType: 'Development',
        suburb: development.location || '',
        city: '',
        askingPrice: 0,
        status: 'active',
        mandateType: 'programmatic',
        seller: {
          name: 'Developer Programme',
          email: '',
          phone: '',
        },
        sellerOnboarding: {
          status: 'completed',
          link: '',
        },
        requiredDocuments: [],
        offers: [],
        marketing: {
          mediaUrl: '',
          source: 'Development',
        },
        createdAt: null,
      }
    }

    const privateListing = privateListings.find((item) => String(item.id) === listingId)
    if (!privateListing) return null
    return {
      ...privateListing,
      listingType: 'private',
    }
  }, [developmentOptions, listingId, privateListings])

  const offerRows = useMemo(() => {
    const rows = Array.isArray(listingRecord?.offers) ? listingRecord.offers : []
    return [...rows].sort((a, b) => new Date(b?.offerDate || 0) - new Date(a?.offerDate || 0))
  }, [listingRecord?.offers])

  function patchListing(updater) {
    if (!listingRecord || listingRecord.listingType !== 'private') return
    const nextRows = privateListings.map((item) => (String(item.id) === String(listingRecord.id) ? updater({ ...item }) : item))
    setPrivateListings(nextRows)
    writeAgentPrivateListings(nextRows)
  }

  function handleOfferDecision(offerId, nextStatus) {
    if (!offerId || !nextStatus) return
    patchListing((row) => ({
      ...row,
      offers: (row.offers || []).map((offer) =>
        String(offer.id) === String(offerId)
          ? { ...offer, status: nextStatus, decidedAt: new Date().toISOString() }
          : nextStatus === OFFER_STATUS.ACCEPTED
            ? { ...offer, status: offer.status === OFFER_STATUS.ACCEPTED ? OFFER_STATUS.REJECTED : offer.status }
            : offer,
      ),
      status: nextStatus === OFFER_STATUS.ACCEPTED ? 'under_offer' : row.status,
    }))
  }

  const onboardingStatusLabel = getOnboardingStatusLabel(listingRecord?.sellerOnboarding?.status)

  if (loading) {
    return (
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <p className="text-sm text-[#6b7d93]">Loading listing...</p>
      </section>
    )
  }

  if (!listingRecord) {
    return (
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <p className="text-sm text-[#6b7d93]">Listing not found.</p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/listings')}>
            Back to Listings
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <section className="overflow-hidden rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="h-[280px] w-full border-b border-[#e5edf6]">{getImageBlock(String(listingRecord?.marketing?.mediaUrl || '').trim(), listingRecord.listingTitle)}</div>
        <div className="p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/listings')}
                  className="inline-flex items-center gap-1 rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.74rem] font-semibold text-[#35546c]"
                >
                  <ArrowLeft size={13} />
                  Back
                </button>
                <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                  {listingRecord.listingType === 'development' ? 'Development' : 'Private Sale'}
                </span>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(listingRecord.status || 'active')}`}>
                  {formatStatusLabel(listingRecord.status || 'active')}
                </span>
              </div>
              <h2 className="mt-3 text-[1.35rem] font-semibold tracking-[-0.03em] text-[#142132]">{listingRecord.listingTitle}</h2>
              <p className="mt-1 text-sm text-[#607387]">{[listingRecord.suburb, listingRecord.city].filter(Boolean).join(', ') || 'Location pending'}</p>
              <p className="mt-3 text-[1.4rem] font-semibold text-[#1f4f78]">{formatCurrency(listingRecord.askingPrice)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary">Edit Listing</Button>
              <Button>Change Status</Button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {DETAIL_TABS.map((tab) => {
            const active = tab.key === activeTab
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? 'border-[#1f4f78] bg-[#1f4f78] text-white'
                    : 'border-[#d4deea] bg-[#f8fbff] text-[#35546c] hover:border-[#b7c8db]'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {activeTab === 'overview' ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3">
              <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Property Type</p>
              <p className="mt-1 text-sm font-semibold text-[#22374d]">{listingRecord.propertyType || 'Not captured'}</p>
            </div>
            <div className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3">
              <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Mandate</p>
              <p className="mt-1 text-sm font-semibold capitalize text-[#22374d]">{listingRecord.mandateType || 'Not captured'}</p>
              <p className="mt-1 text-xs text-[#607387]">{listingRecord.mandateStartDate || 'Start pending'} {listingRecord.mandateEndDate ? `→ ${listingRecord.mandateEndDate}` : ''}</p>
            </div>
            <div className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3">
              <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Assigned Agent</p>
              <p className="mt-1 text-sm font-semibold text-[#22374d]">{String(profile?.fullName || profile?.email || 'Assigned Agent')}</p>
            </div>
            <div className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3">
              <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Created</p>
              <p className="mt-1 text-sm font-semibold text-[#22374d]">{listingRecord.createdAt ? new Date(listingRecord.createdAt).toLocaleDateString('en-ZA') : '—'}</p>
            </div>
          </div>
        ) : null}

        {activeTab === 'seller' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[14px] border border-[#dce6f2] bg-white p-4">
              <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Seller Details</p>
              <p className="mt-2 text-sm font-semibold text-[#22374d]">{listingRecord?.seller?.name || 'Not captured'}</p>
              <p className="mt-1 text-sm text-[#607387]">{listingRecord?.seller?.email || 'Email pending'}</p>
              <p className="mt-1 text-sm text-[#607387]">{listingRecord?.seller?.phone || 'Phone pending'}</p>
            </div>
            <div className="rounded-[14px] border border-[#dce6f2] bg-white p-4">
              <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Onboarding Status</p>
              <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[0.74rem] font-semibold ${statusClass(listingRecord?.sellerOnboarding?.status || '')}`}>
                {onboardingStatusLabel}
              </span>
              {listingRecord?.sellerOnboarding?.link ? (
                <a href={listingRecord.sellerOnboarding.link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#1f4f78] hover:text-[#173d5e]">
                  <ExternalLink size={14} />
                  Open Seller Onboarding
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === 'documents' ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(listingRecord.requiredDocuments || []).map((doc) => (
              <article key={doc.key} className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                <p className="text-sm font-semibold text-[#22374d]">{doc.label}</p>
                <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(doc.status)}`}>
                  {formatStatusLabel(doc.status)}
                </span>
              </article>
            ))}
            {!listingRecord.requiredDocuments?.length ? (
              <div className="rounded-[14px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-4 text-sm text-[#6b7d93]">
                No document requirements for this listing.
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'offers' ? (
          <div className="space-y-3">
            {offerRows.length ? (
              offerRows.map((offer) => (
                <article key={offer.id} className="rounded-[14px] border border-[#dce6f2] bg-white p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#22374d]">{offer.buyerName || 'Buyer pending'}</p>
                      <p className="mt-1 text-sm text-[#607387]">{formatCurrency(offer.offerPrice)} • {offer.conditions || 'Conditions not set'}</p>
                      <p className="mt-1 text-xs text-[#6b7d93]">{offer.offerDate ? new Date(offer.offerDate).toLocaleDateString('en-ZA') : 'Date pending'}</p>
                    </div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${offerStatusClass(offer.status)}`}>
                      {formatStatusLabel(offer.status || OFFER_STATUS.PENDING)}
                    </span>
                  </div>
                  {listingRecord.listingType === 'private' && String(offer.status || '').toLowerCase() === OFFER_STATUS.PENDING ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" type="button" onClick={() => handleOfferDecision(offer.id, OFFER_STATUS.ACCEPTED)}>Accept</Button>
                      <Button size="sm" variant="secondary" type="button" onClick={() => handleOfferDecision(offer.id, OFFER_STATUS.REJECTED)}>Reject</Button>
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="rounded-[14px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-4 text-sm text-[#6b7d93]">
                No offers captured for this listing yet.
              </div>
            )}
          </div>
        ) : null}

        {activeTab === 'activity' ? (
          <div className="space-y-3">
            <article className="rounded-[14px] border border-[#dce6f2] bg-white p-3.5">
              <p className="text-sm font-semibold text-[#22374d]">Listing created</p>
              <p className="mt-1 text-sm text-[#607387]">{listingRecord.createdAt ? new Date(listingRecord.createdAt).toLocaleString('en-ZA') : 'Timestamp unavailable'}</p>
            </article>
            <article className="rounded-[14px] border border-[#dce6f2] bg-white p-3.5">
              <p className="text-sm font-semibold text-[#22374d]">Seller onboarding</p>
              <p className="mt-1 text-sm text-[#607387]">Status: {onboardingStatusLabel}</p>
            </article>
            {(listingRecord.requiredDocuments || []).slice(0, 3).map((doc) => (
              <article key={`activity-doc-${doc.key}`} className="rounded-[14px] border border-[#dce6f2] bg-white p-3.5">
                <p className="text-sm font-semibold text-[#22374d]">Document update</p>
                <p className="mt-1 text-sm text-[#607387]">{doc.label}: {formatStatusLabel(doc.status)}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  )
}

export default AgentListingDetail
