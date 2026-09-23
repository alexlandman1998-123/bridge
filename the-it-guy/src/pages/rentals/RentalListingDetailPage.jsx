import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Building2,
  Eye,
  Home,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { ListingWorkspaceTabs } from '../../components/listings/ListingWorkspaceShell'
import ListingAgentReassignmentPanel from '../../components/listings/ListingAgentReassignmentPanel'
import WebsiteListingPublicationPanel from '../../components/listings/WebsiteListingPublicationPanel'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  getRentalListingForAgent,
  previewPrivatePropertyRentalListing,
  publishPrivatePropertyRentalListing,
  expirePrivatePropertyRentalListing,
  previewRentalProperty24Listing,
  publishRentalProperty24Listing,
  expireRentalProperty24Listing,
  updateRentalListingDraft,
} from '../../services/rentals/rentalListingDraftService'
import { deletePrivateListing } from '../../services/privateListingService'
import {
  RENTAL_LISTING_INITIAL_FORM,
  RENTAL_SELECT_OPTIONS,
} from '../../services/rentals/rentalListingDraftModel'
import {
  buildRentalListingEditForm,
  validateRentalListingEditForm,
} from '../../services/rentals/rentalListingEditModel'
import {
  buildRentalListingDetailView,
  resolveRentalListingDetailTab,
} from '../../services/rentals/rentalListingDetailModel'
import {
  buildRentalListingQueryOptions,
  resolveRentalWorkspaceScope,
} from '../../services/rentals/rentalWorkspaceScope'
import {
  buildListingWorkspaceTabs,
  resolveRentalListingWorkspaceTabFromDetailTab,
  resolveRentalListingWorkspaceTarget,
} from '../../services/listings/listingWorkspaceUiModel'

const PORTAL_FEATURE_FIELDS = Object.freeze([
  ['garden', 'Garden'],
  ['pool', 'Pool'],
  ['flatlet', 'Flatlet'],
  ['accessGate', 'Access gate'],
  ['alarm', 'Alarm'],
  ['electricFencing', 'Electric fencing'],
  ['securityPost', 'Security post'],
  ['builtInCupboards', 'Built-in cupboards'],
  ['fibreInternet', 'Fibre internet'],
  ['prepaidElectricity', 'Prepaid electricity'],
  ['prepaidWater', 'Prepaid water'],
  ['borehole', 'Borehole'],
  ['backupWater', 'Backup water'],
  ['solarBackup', 'Solar / inverter'],
  ['balcony', 'Balcony'],
  ['patio', 'Patio'],
  ['builtInBraai', 'Built-in braai'],
  ['clubhouse', 'Clubhouse'],
  ['gym', 'Gym'],
  ['laundry', 'Laundry'],
  ['scenicView', 'Scenic view'],
  ['satellite', 'Satellite'],
])

const PROPERTY_CATEGORY_OPTIONS = Object.freeze([
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'retail', label: 'Retail' },
  { value: 'agricultural', label: 'Farm / agricultural' },
  { value: 'vacant_land', label: 'Vacant land' },
  { value: 'mixed_use', label: 'Mixed use' },
])

const PER_SQUARE_METRE_RENTAL_CATEGORIES = new Set(['commercial', 'industrial', 'retail', 'vacant_land', 'mixed_use'])

function rentalPriceFrequencyOptions(propertyCategory) {
  return RENTAL_SELECT_OPTIONS.rentalPriceFrequency.filter((option) => (
    option.value !== 'per_square_metre' || PER_SQUARE_METRE_RENTAL_CATEGORIES.has(propertyCategory)
  ))
}

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

function formatDateTime(value) {
  if (!value) return 'Not yet updated'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatRentalHeroAddress(row = {}) {
  const address = String(row.address || '').trim()
  const location = [row.suburb, row.city]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ')
  if (!address) return location || 'Location pending'
  if (!location || address.toLocaleLowerCase().includes(location.toLocaleLowerCase())) return address
  return `${address}, ${location}`
}

function formatRelativeTime(value) {
  if (!value) return ''
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return ''
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000))
  if (elapsedMinutes < 1) return 'Just now'
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`
  const elapsedHours = Math.round(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`
  const elapsedDays = Math.round(elapsedHours / 24)
  return `${elapsedDays}d ago`
}

function RentalDistributionChannel({
  icon = Building2,
  logoSrc = '',
  name,
  subtitle = '',
  reference = '',
  status = 'not_published',
  contextTitle = '',
  lastSynced = '',
  actions = [],
}) {
  const Icon = icon
  const statusKey = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const live = ['live', 'published', 'active'].includes(statusKey)
  const syncing = ['syncing', 'updating', 'publishing', 'submitted', 'pending'].includes(statusKey)
  const attention = ['needs_attention', 'attention', 'warning', 'blocked', 'missing', 'failed', 'error'].includes(statusKey)
  const dotClass = live ? 'bg-[#1f9d64]' : attention ? 'bg-[#d99321]' : syncing ? 'bg-[#2f6fb3]' : 'border border-[#aebdca] bg-white'
  const statusTextClass = live ? 'text-[#18713e]' : attention ? 'text-[#9a5b13]' : syncing ? 'text-[#2f6fb3]' : 'text-[#526a82]'
  const statusLabel = live ? 'Live' : attention ? 'Needs attention' : syncing ? 'Syncing' : 'Not published'

  return (
    <div className="grid gap-4 border-b border-[#edf2f7] px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(250px,1fr)_minmax(170px,0.7fr)_minmax(130px,170px)_auto] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-[#dbe6f2] bg-white text-[#1f4f78]">
          {logoSrc ? <img src={logoSrc} alt={`${name} logo`} className="max-h-7 max-w-8 object-contain" /> : <Icon size={18} />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-5 text-[#142132]">{name}</p>
          {subtitle ? <p className="truncate text-xs leading-5 text-[#607387]">{subtitle}</p> : null}
          {reference ? <span className="mt-1 inline-flex max-w-full rounded-full border border-[#dbe6f2] bg-[#f8fbfd] px-2 py-0.5 text-[0.68rem] font-semibold text-[#607387]"><span className="truncate">{reference}</span></span> : null}
          {contextTitle ? <p className="mt-1 text-xs font-semibold leading-5 text-[#8a5b13]">{contextTitle}</p> : null}
        </div>
      </div>
      <div className="min-w-0 md:justify-self-start"><p className={`inline-flex items-center gap-2 text-sm font-semibold ${statusTextClass}`}><span className={`h-2 w-2 rounded-full ${dotClass}`} />{statusLabel}</p></div>
      <div className="min-w-0">
        {lastSynced ? <><p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">Last synced</p><p className="mt-0.5 text-xs font-semibold text-[#607387]">{lastSynced}</p></> : null}
      </div>
      <div className="flex justify-start lg:justify-end">
        <details className="relative open:z-40">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-sm font-semibold text-[#35546c] transition hover:border-[#b7c8db] hover:bg-[#f7fbff] [&::-webkit-details-marker]:hidden"><SlidersHorizontal size={15} />Manage</summary>
          <div className="absolute right-0 z-30 mt-2 grid w-56 gap-1.5 overflow-hidden rounded-[16px] border border-[#dbe6f2] bg-white p-1.5 shadow-[0_18px_34px_rgba(15,23,42,0.14)]">{actions}</div>
        </details>
      </div>
    </div>
  )
}

function RentalListingImage({ src, title }) {
  if (src) {
    return <img src={src} alt={title} className="h-full w-full object-cover" />
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[linear-gradient(130deg,#163956_0%,#1f4f78_55%,#aac6dc_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(255,255,255,0.28),transparent_48%)]" />
      <Home className="relative text-white/80" size={42} aria-hidden="true" />
    </div>
  )
}

function RentalMarketingOverview({ detail, row, galleryImages, onOpenEdit }) {
  const listing = detail?.listing || {}
  const facts = listing.sellerCanonicalFacts && typeof listing.sellerCanonicalFacts === 'object' ? listing.sellerCanonicalFacts : {}
  const publication = listing.listingPublicationData && typeof listing.listingPublicationData === 'object'
    ? listing.listingPublicationData
    : listing.publicationData && typeof listing.publicationData === 'object' ? listing.publicationData : {}
  const propertyProfile = facts.propertyProfile && typeof facts.propertyProfile === 'object' ? facts.propertyProfile : {}
  const imageUrl = (image) => image?.file_url || image?.fileUrl || image?.public_url || image?.publicUrl || image?.url || ''
  const isCover = (image) => Boolean(image?.is_cover || image?.isCover || image?.cover)
  const imageMedia = galleryImages.length
    ? galleryImages
    : row.imageUrl
      ? [{ id: 'listing-cover', file_url: row.imageUrl, is_cover: true }]
      : []
  const orderedImages = [...imageMedia].sort((first, second) => Number(isCover(second)) - Number(isCover(first)))
  const listingMedia = Array.isArray(listing.listingMedia) ? listing.listingMedia : []
  const hasFloorPlan = listingMedia.some((item) => String(item?.media_type || item?.mediaType || '').toLowerCase().includes('floor'))
  const videoLink = listing.video_link || listing.videoLink || publication.video_link || publication.videoLink || ''
  const virtualTourLink = listing.virtual_tour_link || listing.virtualTourLink || publication.virtual_tour_link || publication.virtualTourLink || ''
  const sellingPoints = Array.isArray(propertyProfile.selectedFeatures)
    ? propertyProfile.selectedFeatures
    : Array.isArray(listing.selectedFeatures)
      ? listing.selectedFeatures
      : Array.isArray(publication.features)
        ? publication.features
        : Array.isArray(listing.features)
          ? listing.features
      : []
  const outlinedButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-sm font-semibold text-[#35546c] shadow-sm transition hover:border-[#b7c8db] hover:bg-[#f7fbff]'
  const mediaActionClass = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#dbe6f2] bg-white text-[#42617f] shadow-sm transition hover:border-[#b7c8db] hover:bg-[#f7fbff]'

  return (
    <section className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.8fr)]">
      <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[#142132]">Listing Content</h3>
            <p className="mt-1 text-sm text-[#607387]">Marketing-facing copy tenants will see.</p>
          </div>
          <button type="button" className={outlinedButtonClass} onClick={onOpenEdit}>
            Edit property details <ArrowLeft className="rotate-180" size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 grid gap-4">
          <div>
            <p className="text-sm font-semibold text-[#2d445e]">Headline</p>
            <p className="mt-2 rounded-[12px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-3 text-sm text-[#22374d]">{row.title}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#2d445e]">Description</p>
            <p className="mt-2 min-h-36 rounded-[12px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-3 text-sm leading-6 text-[#607387]">{listing.description || 'Add a public rental description for prospective tenants.'}</p>
          </div>
          {sellingPoints.length ? (
            <div>
              <p className="text-sm font-semibold text-[#2d445e]">Key selling points</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sellingPoints.slice(0, 8).map((point) => <span key={point} className="rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#42617f]">{point}</span>)}
                <button type="button" className={outlinedButtonClass} onClick={onOpenEdit}>Edit</button>
              </div>
            </div>
          ) : null}
        </div>
      </article>

      <article className="min-w-0 overflow-hidden rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[#142132]">Media</h3>
            <p className="mt-1 text-sm text-[#607387]">Control what tenants see across your marketing channels.</p>
          </div>
          <button type="button" className={outlinedButtonClass} onClick={onOpenEdit}>
            <Pencil size={16} aria-hidden="true" /> Edit Media
          </button>
        </div>

        <div className="mt-5 max-w-full overflow-x-auto pb-2">
          <div className="flex w-max min-w-full gap-3">
            {orderedImages.map((image, index) => {
              const cover = index === 0
              return (
                <div key={image.id || image.file_id || imageUrl(image) || index} className={`shrink-0 overflow-hidden rounded-[14px] border bg-white ${cover ? 'w-[440px] max-w-[68vw] border-[#1f4f78]' : 'w-[170px] border-[#dbe6f2]'}`}>
                  <div className={`relative ${cover ? 'h-[184px]' : 'h-[184px]'}`}>
                    <RentalListingImage src={imageUrl(image)} title={row.title} />
                    {cover ? <span className="absolute left-2 top-2 rounded-full bg-[#123955] px-2 py-1 text-[0.62rem] font-semibold text-white">Cover</span> : null}
                  </div>
                  <div className="flex h-11 items-center justify-between gap-2 border-t border-[#edf2f7] px-3">
                    <span className="text-xs font-semibold text-[#42617f]">{cover ? 'Cover' : 'Photo'}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={onOpenEdit} className={mediaActionClass} aria-label="Open media editor"><ArrowLeft size={14} /></button>
                      <button type="button" onClick={onOpenEdit} className={mediaActionClass} aria-label="Open media editor"><ArrowLeft className="rotate-180" size={14} /></button>
                      <button type="button" onClick={onOpenEdit} className={`${mediaActionClass} text-[#c74d4d]`} aria-label="Open media editor"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              )
            })}
            <button type="button" onClick={onOpenEdit} className="grid h-[229px] w-[150px] shrink-0 place-items-center rounded-[14px] border border-dashed border-[#c9d8e8] bg-[#fbfdff] text-xs font-semibold text-[#5f7894]"><span><Home className="mx-auto mb-1" size={18} />Add Photos</span></button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-[#d8eddf] bg-[#ecfaf1] px-3 py-1 text-xs font-semibold text-[#1f7d44]">{orderedImages.length ? `${orderedImages.length} photo${orderedImages.length === 1 ? '' : 's'}` : 'No photos'}</span>
          <span className="rounded-full border border-[#d8eddf] bg-[#ecfaf1] px-3 py-1 text-xs font-semibold text-[#1f7d44]">{orderedImages.length ? 'Cover selected' : 'Cover missing'}</span>
          <span className="rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#607387]">{hasFloorPlan ? 'Floor plan added' : 'Floor plan missing'}</span>
          <span className="rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#607387]">{videoLink ? 'Video added' : 'Video not added'}</span>
          <span className="rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#607387]">{virtualTourLink ? 'Virtual tour added' : 'Virtual tour not added'}</span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <button type="button" onClick={onOpenEdit} className="min-w-0 text-left">
            <span className="text-sm font-semibold text-[#2d445e]">Video Link</span>
            <span className="mt-2 block truncate rounded-[12px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-3 text-sm text-[#90a0b2]">{videoLink || 'https://youtu.be/...'}</span>
          </button>
          <button type="button" onClick={onOpenEdit} className="min-w-0 text-left">
            <span className="text-sm font-semibold text-[#2d445e]">Virtual Tour Link</span>
            <span className="mt-2 block truncate rounded-[12px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-3 text-sm text-[#90a0b2]">{virtualTourLink || 'https://my.matterport.com/...'}</span>
          </button>
        </div>
        <button type="button" onClick={onOpenEdit} className={`mt-4 w-full ${outlinedButtonClass}`}><Pencil size={16} aria-hidden="true" /> Upload Floor Plan</button>
      </article>
    </section>
  )
}

function FactCard({ label, value, detail, icon }) {
  return (
    <article className="rounded-[8px] border border-[#dbe6f2] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[#607891]">{label}</p>
          <p className="mt-2 text-lg font-semibold text-[#18324b]">{value}</p>
          {detail ? <p className="mt-1 text-sm text-[#607891]">{detail}</p> : null}
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-[#f8fafc] text-[#42617f]">
          {icon}
        </span>
      </div>
    </article>
  )
}

function DetailRow({ label, value }) {
  const displayValue = value === null || value === undefined || value === '' ? 'Not captured' : value
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#edf2f7] py-3 last:border-b-0">
      <span className="text-sm font-medium text-[#607891]">{label}</span>
      <strong className="max-w-[60%] text-right text-sm font-semibold text-[#18324b]">{displayValue}</strong>
    </div>
  )
}

function ReadinessCard({ item }) {
  return (
    <div className="rounded-[8px] border border-[#edf2f7] bg-[#fbfdff] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#18324b]">{item.label}</p>
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${item.complete ? 'border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]' : 'border-[#dbe6f2] bg-white text-[#8aa0b5]'}`}>
          {item.complete ? <CheckCircle2 size={15} aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
        </span>
      </div>
      <p className="mt-1 text-xs font-semibold text-[#607891]">{item.detail}</p>
    </div>
  )
}

function DetailPanel({ title, eyebrow, children }) {
  return (
    <section className="ui-panel ui-panel-body">
      <div>
        <p className="text-xs font-semibold uppercase text-[#607891]">{eyebrow}</p>
        <h2 className="text-lg font-semibold text-[#18324b]">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ListingDocumentsPanel({ documents = [] }) {
  const documentRows = Array.isArray(documents) ? documents : []
  const tenantDocuments = documentRows.filter((document) => /tenant|applicant|application|fica|screening|lease/i.test(String(document.party || document.owner || document.category || document.document_type || document.type || document.name || document.file_name || '')))
  const landlordDocuments = documentRows.filter((document) => !tenantDocuments.includes(document))

  const renderDocumentList = (rows, emptyMessage) => (
    rows.length ? (
      <div className="mt-4 divide-y divide-[#e7eef5] rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-4">
        {rows.map((document, index) => (
          <div key={document.id || document.path || `${document.name || document.file_name || 'document'}-${index}`} className="py-3">
            <p className="text-sm font-semibold text-[#22374d]">{document.name || document.file_name || document.label || document.document_type || 'Listing document'}</p>
            <p className="mt-1 text-xs text-[#607387]">{document.status || document.created_at || document.createdAt || 'On file'}</p>
          </div>
        ))}
      </div>
    ) : <p className="mt-4 rounded-[14px] border border-dashed border-[#cbd9e7] bg-[#fbfdff] px-4 py-8 text-center text-sm text-[#607387]">{emptyMessage}</p>
  )

  return (
    <section className="grid gap-5 xl:grid-cols-2">
      <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#607891]">Landlord documents</p>
        <h2 className="mt-1 text-lg font-semibold text-[#18324b]">Ownership and mandate</h2>
        <p className="mt-1 text-sm text-[#607387]">Mandates, proof of ownership, and landlord supporting documents.</p>
        {renderDocumentList(landlordDocuments, 'No landlord documents have been added to this listing yet.')}
      </article>
      <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#607891]">Tenant documents</p>
        <h2 className="mt-1 text-lg font-semibold text-[#18324b]">Application and tenancy</h2>
        <p className="mt-1 text-sm text-[#607387]">Tenant applications, screening records, and tenancy documents.</p>
        {renderDocumentList(tenantDocuments, 'No tenant documents have been linked to this listing yet.')}
      </article>
    </section>
  )
}

function formatProperty24PreviewBlocker(value = '') {
  return String(value || '')
    .replace(/^missing_/, 'Missing ')
    .replace(/^listing_/, 'Listing ')
    .replace(/_/g, ' ')
    .replace(/\bproperty24\b/gi, 'Property24')
}

function getProperty24PreviewDetails(preview = null) {
  const reportPreview = preview?.report?.preview || preview?.preview || {}
  const dataBlockers = Array.isArray(reportPreview.dataBlockers) ? reportPreview.dataBlockers : []
  const technicalBlockers = Array.isArray(reportPreview.technicalBlockers) ? reportPreview.technicalBlockers : []
  const imageSummary = reportPreview.imageByteLoad?.summary || {}
  const canSubmit = Boolean(reportPreview.canSubmit)
  const sandboxAgentPending = technicalBlockers.includes('sandbox_property24_agent_id_required_before_submit')
  const blockerCount = dataBlockers.length + technicalBlockers.length
  const redactedPayload = preview?.report?.redactedPreviewPayload || preview?.report?.redactedPayload || null
  return {
    canSubmit,
    dataBlockers,
    technicalBlockers,
    sandboxAgentPending,
    blockerCount,
    imagesLoaded: Number(imageSummary.loaded || 0) || 0,
    imagesFailed: Number(imageSummary.failed || 0) || 0,
    redactedPayload,
    status: preview?.status || '',
  }
}

function getProperty24PreviewIssues(preview = null) {
  const details = getProperty24PreviewDetails(preview)
  return [
    ...details.dataBlockers.map((item) => ({
      key: `data:${item}`,
      label: item === 'missing_property24_agent_id' ? 'Assigned agent is not mapped to Property24' : formatProperty24PreviewBlocker(item),
      detail: item === 'missing_property24_agent_id'
        ? 'Map the assigned agent under Settings → Property24 Agents. Their phone and photo remain on the Arch9 agent profile.'
        : 'Fix this rental listing field before Property24 can accept it.',
    })),
    ...details.technicalBlockers.map((item) => ({
      key: `technical:${item}`,
      label: item === 'sandbox_property24_agent_id_required_before_submit' ? 'Property24 agent ID needed for real publishing' : formatProperty24PreviewBlocker(item),
      detail: item === 'sandbox_property24_agent_id_required_before_submit'
        ? 'This is expected in the ExDev sandbox when Property24 has not returned a real agent ID yet.'
        : 'This setup item must be resolved before a live submit.',
    })),
  ]
}

function getProperty24ReadinessStatus(preview = null) {
  if (!preview) {
    return {
      label: 'Not checked',
      tone: 'neutral',
      detail: 'Run the readiness check to ask the backend what Property24 would accept.',
    }
  }
  const details = getProperty24PreviewDetails(preview)
  if (details.dataBlockers.length) {
    return {
      label: 'Needs listing info',
      tone: 'warning',
      detail: 'Property24 found rental data that must be completed first.',
    }
  }
  if (details.sandboxAgentPending && details.technicalBlockers.length === 1) {
    return {
      label: 'Sandbox review ready',
      tone: 'warning',
      detail: 'The rental payload is safe to review in ExDev. Real publishing still needs Property24 agent IDs.',
    }
  }
  if (details.technicalBlockers.length) {
    return {
      label: 'Setup needed',
      tone: 'warning',
      detail: 'The listing data is close, but Property24 setup still has a blocker.',
    }
  }
  if (details.canSubmit) {
    return {
      label: 'Ready',
      tone: 'success',
      detail: 'The backend preview says this rental can be submitted when live publishing is enabled.',
    }
  }
  return {
    label: 'Checked',
    tone: 'neutral',
    detail: 'The backend preview completed. Review the details below before publishing.',
  }
}

function Property24ReadinessItem({ item }) {
  return (
    <div className="flex items-start gap-3 rounded-[8px] border border-[#edf2f7] bg-white p-3">
      <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${item.complete ? 'border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]' : 'border-[#f0d5b5] bg-[#fffaf2] text-[#9f5f15]'}`}>
        {item.complete ? <CheckCircle2 size={15} aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#18324b]">{item.label}</p>
        <p className="mt-1 text-xs font-semibold text-[#607891]">{item.detail || item.blocker}</p>
      </div>
    </div>
  )
}

function Property24SyndicationPanel({
  detail,
  onPublish,
  onExpireProperty24,
  publishing,
  publishError,
  property24Preview,
  checkingProperty24,
  property24PreviewError,
  onCheckProperty24,
  privatePropertyPreview,
  checkingPrivateProperty,
  publishingPrivateProperty,
  privatePropertyError,
  onCheckPrivateProperty,
  onPublishPrivateProperty,
  onExpirePrivateProperty,
}) {
  const readiness = detail.property24Readiness
  const previewDetails = getProperty24PreviewDetails(property24Preview)
  const previewStatus = getProperty24ReadinessStatus(property24Preview)
  const previewIssues = getProperty24PreviewIssues(property24Preview)
  const payload = previewDetails.redactedPayload || readiness?.payloadPreview || {}
  const resolvedMapping = property24Preview?.mapping || {}
  const localBlockers = readiness?.blockers || []
  const blockers = property24Preview ? previewIssues : localBlockers
  const canPublish = Boolean(property24Preview && previewDetails.canSubmit)
  const selectedDistributionLabels = (detail.selectedDistributionChannels || []).map((channel) => channel.label)
  const statusToneClasses = previewStatus.tone === 'success'
    ? 'border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]'
    : previewStatus.tone === 'warning'
      ? 'border-[#f0d5b5] bg-[#fffaf2] text-[#9f5f15]'
      : 'border-[#dbe6f2] bg-white text-[#42617f]'
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <DetailPanel eyebrow="Syndication" title="Property24 Rental Readiness">
        <div className="mb-4 rounded-[8px] border border-[#cfe0ef] bg-[#f8fbff] p-4">
          <p className="text-sm font-semibold text-[#18324b]">Selected distribution</p>
          <p className="mt-1 text-xs font-semibold text-[#607891]">
            {selectedDistributionLabels.length
              ? `${selectedDistributionLabels.join(', ')} selected at review. Run each readiness check, then confirm publication.`
              : 'No channels were selected at review. You can still check readiness here before deciding where to publish.'}
          </p>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-[8px] border border-[#dbe6f2] bg-[#fbfdff] p-4">
          <div className="flex min-w-0 items-center gap-4">
            <img src="/lead-sources/property24.png" alt="Property24" className="h-14 w-20 shrink-0 object-contain" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[#18324b]">Property24 rental check</p>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusToneClasses}`}>
                  {previewStatus.tone === 'success' ? <CheckCircle2 size={14} aria-hidden="true" /> : previewStatus.tone === 'warning' ? <CircleAlert size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
                  {previewStatus.label}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold text-[#607891]">{previewStatus.detail}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="ui-pill-button ui-pill-button-active"
              onClick={onCheckProperty24}
              disabled={checkingProperty24}
            >
              {checkingProperty24 ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              Check Readiness
            </button>
            <button
              type="button"
              className="ui-pill-button"
              onClick={onPublish}
              disabled={!canPublish || publishing}
              title={canPublish ? 'Publish this rental using its assigned Property24 agent mapping' : 'Run a clean Property24 readiness check before publishing'}
            >
              {publishing ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              Publish to Property24
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-[8px] border border-[#dbe6f2] bg-[#fbfdff] p-4">
          <div>
            <p className="text-sm font-semibold text-[#18324b]">Private Property rental check</p>
            <p className="mt-1 text-xs font-semibold text-[#607891]">
              {privatePropertyPreview?.ready ? 'Ready to submit.' : 'Check the live rental payload and connection before submitting.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-pill-button ui-pill-button-active" onClick={onCheckPrivateProperty} disabled={checkingPrivateProperty}>
              {checkingPrivateProperty ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              Check Readiness
            </button>
            <button type="button" className="ui-pill-button" onClick={onPublishPrivateProperty} disabled={!privatePropertyPreview?.ready || publishingPrivateProperty}>
              {publishingPrivateProperty ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              Publish to Private Property
            </button>
          </div>
        </div>

        {privatePropertyError ? <p className="mb-4 rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{privatePropertyError}</p> : null}

        {property24PreviewError ? (
          <p className="mb-4 rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{property24PreviewError}</p>
        ) : null}

        {publishError ? (
          <p className="mb-4 rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{publishError}</p>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FactCard
            label="Portal status"
            value={detail.property24StatusLabel}
            detail="Current sync state"
            icon={<CheckCircle2 size={18} aria-hidden="true" />}
          />
          <FactCard
            label="Backend check"
            value={property24Preview ? previewStatus.label : `${readiness.readinessPercent}%`}
            detail={property24Preview ? `Status: ${previewDetails.status || 'Checked'}` : `${readiness.completedCount}/${readiness.totalCount} local checks complete`}
            icon={<BadgeCheck size={18} aria-hidden="true" />}
          />
          <FactCard
            label={property24Preview ? 'Backend blockers' : 'Local blockers'}
            value={String(property24Preview ? previewDetails.blockerCount : localBlockers.length)}
            detail={property24Preview ? `${previewDetails.imagesLoaded} photos checked, ${previewDetails.imagesFailed} errors` : 'Run backend check before publishing'}
            icon={<ShieldCheck size={18} aria-hidden="true" />}
          />
          <FactCard
            label="Assigned agent mapping"
            value={resolvedMapping.property24AgentId ? `Property24 #${resolvedMapping.property24AgentId}` : property24Preview ? 'Not mapped' : 'Not checked'}
            detail={resolvedMapping.arch9Email || 'Resolved from the assigned Arch9 agent'}
            icon={<Users size={18} aria-hidden="true" />}
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {readiness.items.map((item) => <Property24ReadinessItem key={item.key} item={item} />)}
        </div>
      </DetailPanel>

      <div className="grid gap-4">
        <DetailPanel eyebrow={property24Preview ? 'Backend result' : 'Local readiness'} title={blockers.length ? 'Resolve Before Publishing' : 'No Blockers'}>
          {blockers.length ? (
            <div className="grid gap-2">
              {blockers.map((blocker) => (
                <div key={blocker.key} className="rounded-[8px] border border-[#f0d5b5] bg-[#fffaf2] p-3">
                  <p className="text-sm font-semibold text-[#18324b]">{blocker.label}</p>
                  <p className="mt-1 text-xs font-semibold text-[#9f5f15]">{blocker.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] p-3 text-sm font-semibold text-[#286b43]">
              {property24Preview ? 'The backend preview did not find any Property24 blockers.' : 'Local rental readiness looks complete. Run the backend check before publishing.'}
            </p>
          )}
        </DetailPanel>

        <DetailPanel eyebrow={property24Preview ? 'Backend payload preview' : 'Local payload preview'} title="Listing Service v55">
          <pre className="max-h-[520px] overflow-auto rounded-[8px] border border-[#dbe6f2] bg-[#0f1f2f] p-4 text-xs font-semibold leading-relaxed text-[#d8e7f5]">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </DetailPanel>
      </div>
    </div>
  )
}

function formField(name, value, onChange) {
  return {
    value,
    onChange: (event) => onChange(name, event.target.value),
  }
}

function SelectField({ label, name, value, options, onChange }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <select {...formField(name, value, onChange)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function RentalListingEditPanel({ form, onChange, onCancel, onSubmit, saving, canSubmit, error }) {
  const priceFrequencyOptions = rentalPriceFrequencyOptions(form.propertyCategory)
  return (
    <form onSubmit={onSubmit} className="ui-panel ui-panel-body grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[#607891]">Listing publication</p>
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#18324b]">Property, marketing &amp; syndication</h2>
          <p className="mt-1 text-sm text-[#607387]">Update rental property data, public marketing content, and distribution details.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ui-pill-button" onClick={onCancel}>
            <X size={16} aria-hidden="true" />
            Cancel
          </button>
          <button type="submit" className="ui-pill-button ui-pill-button-active" disabled={!canSubmit}>
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            Save Changes
          </button>
        </div>
      </div>

      <nav className="grid gap-2 rounded-[18px] border border-[#dbe6f2] bg-[#fbfdff] p-2 sm:grid-cols-4" aria-label="Rental listing edit steps">
        {['Property', 'Marketing', 'Syndication', 'Review'].map((step, index) => <div key={step} className={`flex min-h-12 items-center gap-3 rounded-[12px] px-3 ${index === 0 ? 'bg-white text-[#18324b] shadow-sm' : 'text-[#607387]'}`}><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${index === 0 ? 'bg-[#1f7d44] text-white' : 'bg-[#edf2f7] text-[#607387]'}`}>{index + 1}</span><span><strong className="block text-sm">{step}</strong><small className="block text-xs">{index === 0 ? 'Rental details' : index === 1 ? 'Photos & description' : index === 2 ? 'Publish to portals' : 'Confirm changes'}</small></span></div>)}
      </nav>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="form-field md:col-span-2">
          <span>Listing title</span>
          <input {...formField('title', form.title, onChange)} placeholder="2 bedroom apartment in Green Point" />
        </label>
        <label className="form-field">
          <span>Property type</span>
          <input {...formField('propertyType', form.propertyType, onChange)} />
        </label>
        <SelectField label="Property category" name="propertyCategory" value={form.propertyCategory} onChange={onChange} options={PROPERTY_CATEGORY_OPTIONS} />
        <SelectField label="Retirement accommodation (optional)" name="retirementAccommodation" value={form.retirementAccommodation} onChange={onChange} options={RENTAL_SELECT_OPTIONS.retirementAccommodation} />
        <label className="form-field md:col-span-3">
          <span>Property address</span>
          <input {...formField('propertyAddress', form.propertyAddress, onChange)} />
        </label>
        <label className="form-field">
          <span>Unit number</span>
          <input {...formField('unitNumber', form.unitNumber, onChange)} />
        </label>
        <label className="form-field">
          <span>Complex / building</span>
          <input {...formField('complexName', form.complexName, onChange)} />
        </label>
        <label className="form-field">
          <span>Street number</span>
          <input {...formField('streetNumber', form.streetNumber, onChange)} />
        </label>
        <label className="form-field">
          <span>Street name</span>
          <input {...formField('streetName', form.streetName, onChange)} />
        </label>
        <label className="form-field">
          <span>Suburb</span>
          <input {...formField('suburb', form.suburb, onChange)} />
        </label>
        <label className="form-field">
          <span>City</span>
          <input {...formField('city', form.city, onChange)} />
        </label>
        <label className="form-field">
          <span>Province</span>
          <input {...formField('province', form.province, onChange)} />
        </label>
        <label className="form-field">
          <span>Postal code</span>
          <input {...formField('postalCode', form.postalCode, onChange)} />
        </label>
        <SelectField label="Portal address display" name="exactAddressVisibility" value={form.exactAddressVisibility} onChange={onChange} options={RENTAL_SELECT_OPTIONS.exactAddressVisibility} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="form-field">
          <span>Landlord name</span>
          <input {...formField('landlordName', form.landlordName, onChange)} />
        </label>
        <label className="form-field">
          <span>Landlord email</span>
          <input type="email" {...formField('landlordEmail', form.landlordEmail, onChange)} />
        </label>
        <label className="form-field">
          <span>Landlord phone</span>
          <input {...formField('landlordPhone', form.landlordPhone, onChange)} />
        </label>
        <SelectField label="Landlord type" name="landlordType" value={form.landlordType} onChange={onChange} options={RENTAL_SELECT_OPTIONS.landlordType} />
        <SelectField label="Rental mandate" name="mandateStatus" value={form.mandateStatus} onChange={onChange} options={RENTAL_SELECT_OPTIONS.mandateStatus} />
        <SelectField label="Marketing approval" name="marketingApprovalStatus" value={form.marketingApprovalStatus} onChange={onChange} options={RENTAL_SELECT_OPTIONS.marketingApprovalStatus} />
        <label className="form-field">
          <span>Mandate start date</span>
          <input type="date" {...formField('mandateStartDate', form.mandateStartDate, onChange)} />
        </label>
        <label className="form-field">
          <span>Mandate end / expiry date</span>
          <input type="date" {...formField('mandateEndDate', form.mandateEndDate, onChange)} />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <label className="form-field">
          <span>Rental amount</span>
          <input type="number" min="0" {...formField('monthlyRent', form.monthlyRent, onChange)} />
        </label>
        <SelectField label="Rental price frequency" name="rentalPriceFrequency" value={form.rentalPriceFrequency} onChange={onChange} options={priceFrequencyOptions} />
        <SelectField label="Rental type" name="rentalMandateType" value={form.rentalMandateType} onChange={onChange} options={RENTAL_SELECT_OPTIONS.rentalMandateType} />
        <SelectField label="Deposit policy" name="depositPolicy" value={form.depositPolicy} onChange={onChange} options={RENTAL_SELECT_OPTIONS.depositPolicy} />
        {form.depositPolicy !== 'no_deposit' ? <label className="form-field">
          <span>Deposit</span>
          <input type="number" min="0" {...formField('depositAmount', form.depositAmount, onChange)} />
        </label> : null}
        <label className="form-field">
          <span>Available from</span>
          <input type="date" {...formField('availableFrom', form.availableFrom, onChange)} />
        </label>
        <label className="form-field">
          <span>Lease period months</span>
          <input type="number" min="1" {...formField('leasePeriodMonths', form.leasePeriodMonths, onChange)} />
        </label>
        {form.depositPolicy !== 'no_deposit' ? <label className="form-field">
          <span>Deposit multiplier</span>
          <input type="number" min="0" step="0.5" {...formField('depositMultiplier', form.depositMultiplier, onChange)} />
        </label> : null}
        <label className="form-field">
          <span>Occupation date</span>
          <input type="date" {...formField('occupationDate', form.occupationDate, onChange)} />
        </label>
        <SelectField label="Lease period type" name="leasePeriodType" value={form.leasePeriodType} onChange={onChange} options={RENTAL_SELECT_OPTIONS.leasePeriodType} />
        <label className="form-field">
          <span>Bedrooms</span>
          <input type="number" min="0" step="0.5" {...formField('bedrooms', form.bedrooms, onChange)} />
        </label>
        <label className="form-field">
          <span>Bathrooms</span>
          <input type="number" min="0" step="0.5" {...formField('bathrooms', form.bathrooms, onChange)} />
        </label>
        <label className="form-field">
          <span>En-suite bathrooms</span>
          <input type="number" min="0" step="0.5" {...formField('enSuiteBathrooms', form.enSuiteBathrooms, onChange)} />
        </label>
        <label className="form-field">
          <span>Parking bays</span>
          <input type="number" min="0" {...formField('parkingBays', form.parkingBays, onChange)} />
        </label>
        <label className="form-field">
          <span>Garages</span>
          <input type="number" min="0" {...formField('garages', form.garages, onChange)} />
        </label>
        <label className="form-field">
          <span>Covered parking</span>
          <input type="number" min="0" {...formField('coveredParking', form.coveredParking, onChange)} />
        </label>
        <label className="form-field">
          <span>Open parking</span>
          <input type="number" min="0" {...formField('openParking', form.openParking, onChange)} />
        </label>
        <label className="form-field">
          <span>Carports</span>
          <input type="number" min="0" {...formField('carports', form.carports, onChange)} />
        </label>
        <label className="form-field">
          <span>Lounges</span>
          <input type="number" min="0" {...formField('lounges', form.lounges, onChange)} />
        </label>
        <label className="form-field">
          <span>Dining rooms</span>
          <input type="number" min="0" {...formField('diningRooms', form.diningRooms, onChange)} />
        </label>
        <label className="form-field">
          <span>Kitchens</span>
          <input type="number" min="0" {...formField('kitchens', form.kitchens, onChange)} />
        </label>
        <label className="form-field">
          <span>Studies</span>
          <input type="number" min="0" {...formField('studies', form.studies, onChange)} />
        </label>
        <label className="form-field">
          <span>Storerooms</span>
          <input type="number" min="0" {...formField('storerooms', form.storerooms, onChange)} />
        </label>
        <label className="form-field">
          <span>Staff rooms</span>
          <input type="number" min="0" {...formField('staffRooms', form.staffRooms, onChange)} />
        </label>
        <SelectField label="Furnished" name="furnishedStatus" value={form.furnishedStatus} onChange={onChange} options={RENTAL_SELECT_OPTIONS.furnishedStatus} />
        <SelectField label="Pets" name="petsPolicy" value={form.petsPolicy} onChange={onChange} options={RENTAL_SELECT_OPTIONS.petsPolicy} />
        <SelectField label="Utilities" name="utilitiesPolicy" value={form.utilitiesPolicy} onChange={onChange} options={RENTAL_SELECT_OPTIONS.utilitiesPolicy} />
        <SelectField label="Inspection" name="inspectionStatus" value={form.inspectionStatus} onChange={onChange} options={RENTAL_SELECT_OPTIONS.inspectionStatus} />
        {form.depositPolicy !== 'no_deposit' ? <label className="form-field md:col-span-2">
          <span>Deposit requirements</span>
          <input {...formField('depositRequirement', form.depositRequirement, onChange)} />
        </label> : null}
        <label className="form-field">
          <span>Application fee</span>
          <input type="number" min="0" {...formField('applicationFee', form.applicationFee, onChange)} />
        </label>
        <label className="form-field">
          <span>Lease admin fee</span>
          <input type="number" min="0" {...formField('leaseAdminFee', form.leaseAdminFee, onChange)} />
        </label>
        <label className="form-field">
          <span>Credit check fee</span>
          <input type="number" min="0" {...formField('creditCheckFee', form.creditCheckFee, onChange)} />
        </label>
        <label className="form-field">
          <span>Key deposit</span>
          <input type="number" min="0" {...formField('keyDepositAmount', form.keyDepositAmount, onChange)} />
        </label>
        <label className="form-field">
          <span>Utility deposit</span>
          <input type="number" min="0" {...formField('utilityDepositAmount', form.utilityDepositAmount, onChange)} />
        </label>
        <label className="form-field md:col-span-2">
          <span>Rental includes</span>
          <input {...formField('rentalIncludes', form.rentalIncludes, onChange)} />
        </label>
        <label className="form-field md:col-span-2">
          <span>Rental excludes</span>
          <input {...formField('rentalExcludes', form.rentalExcludes, onChange)} />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {PORTAL_FEATURE_FIELDS.map(([name, label]) => (
          <SelectField
            key={name}
            label={label}
            name={name}
            value={form[name]}
            onChange={onChange}
            options={RENTAL_SELECT_OPTIONS.yesNoUnknown}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="form-field">
          <span>Public description</span>
          <textarea rows={5} {...formField('description', form.description, onChange)} />
        </label>
        <label className="form-field">
          <span>Inspection notes</span>
          <textarea rows={5} {...formField('inspectionNotes', form.inspectionNotes, onChange)} />
        </label>
        <label className="form-field">
          <span>Internal notes</span>
          <textarea rows={5} {...formField('internalNotes', form.internalNotes, onChange)} />
        </label>
      </div>

      {error ? <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p> : null}
    </form>
  )
}

function RentalOverview({ detail, onOpenMarketing }) {
  const row = detail.row
  const applicationCount = Number(row.applicationCount || 0)
  const metrics = [
    { label: 'Views', value: '0', meta: 'No analytics yet', icon: Eye, tone: 'border-t-[#76c6fb] bg-[#e8f4ff] text-[#2363a0]' },
    { label: 'Applications', value: applicationCount, meta: applicationCount ? 'In the tenant queue' : 'No applications yet', icon: Users, tone: 'border-t-[#38d39f] bg-[#e4fbf3] text-[#0b9270]' },
    { label: 'Viewings', value: '0', meta: '0 upcoming', icon: CalendarDays, tone: 'border-t-[#6e91ff] bg-[#edf1ff] text-[#365caf]' },
    { label: 'Offers', value: '0', meta: '0 active', icon: BadgeCheck, tone: 'border-t-[#f9b528] bg-[#fff3d9] text-[#aa7416]' },
    { label: 'Days listed', value: '—', meta: 'Rental draft', icon: Home, tone: 'border-t-[#9baabd] bg-[#f2f5f8] text-[#526b83]' },
  ]
  return (
    <section className="space-y-5">
      <section className="rounded-[28px] border border-[#e1e9f1] bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.055)] sm:p-7">
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.map((metric) => {
            const Icon = metric.icon
            return (
              <article key={metric.label} className={`flex min-h-[184px] flex-col justify-between rounded-[16px] border border-[#e0e9f2] border-t-[4px] bg-gradient-to-br from-white to-[#fbfdff] p-4 ${metric.tone.split(' ').at(0)}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[0.82rem] font-semibold text-[#637996]">{metric.label}</p>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[11px] ${metric.tone.split(' ').slice(1).join(' ')}`}><Icon size={17} /></span>
                </div>
                <p className="mt-4 text-[2.35rem] font-semibold leading-none tracking-[-0.05em] text-[#10243a]">{metric.value}</p>
                <span className="mt-4 inline-flex w-fit rounded-[10px] bg-[#f3f6f8] px-2.5 py-1.5 text-xs font-semibold text-[#60758c]">{metric.meta}</span>
              </article>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <span className="inline-flex min-h-9 items-center rounded-lg border border-[#dbe6f2] bg-[#f7fbff] px-3 text-xs font-semibold text-[#35546c]">Current listing period</span>
        </div>
      </section>

      <section className="grid items-stretch gap-5 xl:grid-cols-2">
        <article className="flex h-full flex-col rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
          <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-[#142132]">Latest Tenant Activity</h2><span className="text-xs font-semibold text-[#1f4f78]">View applications</span></div>
          <div className="mt-4 flex-1 rounded-[14px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-4 py-6 text-sm text-[#607387]">No tenant activity yet.</div>
        </article>
        <article className="flex h-full flex-col rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
          <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-[#142132]">Upcoming Viewings</h2><span className="text-xs font-semibold text-[#1f4f78]">View all</span></div>
          <div className="mt-4 flex-1 rounded-[14px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-4 py-6 text-sm text-[#607387]">No upcoming viewings.</div>
        </article>
      </section>

      <section className="grid items-stretch gap-5 xl:grid-cols-3">
        <article className="rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-[#142132]">Tenant</h2><span className="text-xs font-semibold text-[#1f4f78]">Open tenant</span></div><p className="mt-4 text-sm font-semibold text-[#142132]">No tenant placed</p><p className="mt-2 text-sm text-[#607387]">A tenant profile will appear here once an application is approved.</p></article>
        <article className="rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-[#142132]">Marketing</h2><button type="button" onClick={onOpenMarketing} className="text-xs font-semibold text-[#1f4f78]">Open marketing</button></div><div className="mt-4 space-y-2 text-sm text-[#607387]"><div className="flex justify-between border-b border-[#edf2f7] py-2"><span>Property24</span><strong>{detail.property24StatusLabel}</strong></div><div className="flex justify-between py-2"><span>Readiness</span><strong>{detail.readinessPercent}%</strong></div></div></article>
        <article className="rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]"><h2 className="text-base font-semibold text-[#142132]">Rental Position</h2><div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2"><div><p className="text-xs text-[#6b7d93]">Monthly rent</p><p className="mt-1 font-semibold text-[#142132]">{formatCurrency(row.monthlyRent)}</p></div><div><p className="text-xs text-[#6b7d93]">Available from</p><p className="mt-1 font-semibold text-[#142132]">{formatDate(row.availableFrom)}</p></div><div><p className="text-xs text-[#6b7d93]">Deposit</p><p className="mt-1 font-semibold text-[#142132]">{formatCurrency(row.depositAmount)}</p></div><div><p className="text-xs text-[#6b7d93]">Lease term</p><p className="mt-1 font-semibold text-[#142132]">{row.leasePeriodMonths ? `${row.leasePeriodMonths} months` : '—'}</p></div></div></article>
      </section>
    </section>
  )
}

function RentalTabContent({
  activeTab,
  detail,
  onPublish,
  publishing,
  publishError,
  property24Preview,
  checkingProperty24,
  property24PreviewError,
  onCheckProperty24,
  privatePropertyPreview,
  checkingPrivateProperty,
  publishingPrivateProperty,
  privatePropertyError,
  onCheckPrivateProperty,
  onPublishPrivateProperty,
  onExpireProperty24,
  onExpirePrivateProperty,
  onOpenMarketing,
  onOpenEdit,
  property24ExpiryDate,
  onProperty24ExpiryChange,
  onSaveProperty24Expiry,
  savingProperty24Expiry,
  onPrepareWebsitePublication,
  landlordForm,
  onLandlordChange,
  onSaveLandlord,
  savingLandlord,
  landlordError,
}) {
  const row = detail.row
  if (activeTab === 'property') {
    return (
      <DetailPanel eyebrow="Property" title="Property Details">
        <DetailRow label="Address" value={row.address} />
        <DetailRow label="Location" value={row.location} />
        <DetailRow label="Property type" value={row.propertyType} />
        <DetailRow label="Bedrooms" value={row.bedrooms} />
        <DetailRow label="Bathrooms" value={row.bathrooms} />
        <DetailRow label="Parking bays" value={row.parkingBays} />
      </DetailPanel>
    )
  }
  if (activeTab === 'landlord') {
    return (
      <form onSubmit={onSaveLandlord} className="ui-panel ui-panel-body">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase text-[#607891]">Landlord</p><h2 className="text-lg font-semibold text-[#18324b]">Landlord Relationship</h2><p className="mt-1 text-sm text-[#607387]">Update the landlord contact details for this rental listing.</p></div>
          <button type="submit" className="ui-pill-button ui-pill-button-active" disabled={savingLandlord}>{savingLandlord ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Save landlord details</button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="form-field"><span>Landlord name</span><input value={landlordForm.landlordName || ''} onChange={(event) => onLandlordChange('landlordName', event.target.value)} /></label>
          <label className="form-field"><span>Landlord email</span><input type="email" value={landlordForm.landlordEmail || ''} onChange={(event) => onLandlordChange('landlordEmail', event.target.value)} /></label>
          <label className="form-field"><span>Landlord phone</span><input value={landlordForm.landlordPhone || ''} onChange={(event) => onLandlordChange('landlordPhone', event.target.value)} /></label>
          <SelectField label="Landlord type" name="landlordType" value={landlordForm.landlordType || ''} onChange={(name, value) => onLandlordChange(name, value)} options={RENTAL_SELECT_OPTIONS.landlordType} />
        </div>
        {landlordError ? <p className="mt-4 rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{landlordError}</p> : null}
      </form>
    )
  }
  if (activeTab === 'terms') {
    return (
      <DetailPanel eyebrow="Rental terms" title="Rent, Deposit, and Availability">
        <DetailRow label="Monthly rent" value={formatCurrency(row.monthlyRent)} />
        <DetailRow label="Deposit" value={formatCurrency(row.depositAmount)} />
        <DetailRow label="Available from" value={formatDate(row.availableFrom)} />
        <DetailRow label="Lease period" value={row.leasePeriodMonths ? `${row.leasePeriodMonths} months` : ''} />
        <DetailRow label="Furnished" value={row.furnishedStatus} />
        <DetailRow label="Pets" value={row.petsPolicy} />
        <DetailRow label="Utilities" value={row.utilitiesPolicy} />
      </DetailPanel>
    )
  }
  if (activeTab === 'mandate') {
    return <ListingDocumentsPanel documents={detail.listing?.documents} />
  }
  if (activeTab === 'inspection') {
    return (
      <DetailPanel eyebrow="Inspection" title="Inspection and Access">
        <DetailRow label="Inspection status" value={row.inspectionStatus} />
        <DetailRow label="Condition checklist" value="No checklist captured" />
      </DetailPanel>
    )
  }
  if (activeTab === 'marketing') {
    const previewStatus = getProperty24ReadinessStatus(property24Preview)
    const galleryImages = (Array.isArray(detail.listing?.listingMedia) ? detail.listing.listingMedia : Array.isArray(detail.listing?.galleryImages) ? detail.listing.galleryImages : [])
      .filter((item) => String(item?.media_type || item?.mediaType || 'image').toLowerCase() === 'image')
    const readyItems = (detail.readinessItems || []).filter((item) => item.complete).length
    const readinessPercent = detail.readinessPercent || 0
    const remainingReadinessCount = Math.max(0, (detail.totalReadinessCount || 0) - readyItems)
    const listing = detail.listing || {}
    const publication = listing.listingPublicationData && typeof listing.listingPublicationData === 'object'
      ? listing.listingPublicationData
      : listing.publicationData && typeof listing.publicationData === 'object' ? listing.publicationData : {}
    const findChannel = (key) => detail.channels.find((channel) => channel.key === key) || {}
    const property24Channel = findChannel('property24')
    const privatePropertyChannel = findChannel('private_property')
    const property24Status = property24Channel.status || 'not_published'
    const privatePropertyStatus = privatePropertyChannel.status || 'not_published'
    const property24Reference = listing.property24Reference || listing.property24_reference || publication.property24Reference || publication.property24_reference || ''
    const privatePropertyReference = listing.privatePropertyReference || listing.private_property_reference || publication.privatePropertyReference || publication.private_property_reference || ''
    const property24Url = listing.property24ListingUrl || listing.property24_listing_url || publication.property24ListingUrl || publication.property24_listing_url || ''
    const privatePropertyUrl = listing.privatePropertyListingUrl || listing.private_property_listing_url || publication.privatePropertyListingUrl || publication.private_property_listing_url || ''
    const property24LastSynced = formatRelativeTime(listing.property24LastSyncedAt || listing.property24_last_synced_at || publication.property24LastSyncedAt || publication.property24_last_synced_at)
    const privatePropertyLastSynced = formatRelativeTime(listing.privatePropertyLastSyncedAt || listing.private_property_last_synced_at || publication.privatePropertyLastSyncedAt || publication.private_property_last_synced_at)
    const channelMenuItemClass = 'flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-sm font-semibold text-[#243d56] transition hover:bg-[#f7fbff] disabled:cursor-not-allowed disabled:opacity-50'
    return (
      <section className="space-y-5">
        <section className="overflow-hidden rounded-[22px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]"><div className="grid sm:grid-cols-3"><div className="border-b border-[#edf2f7] p-5 sm:border-b-0 sm:border-r"><p className="text-2xl font-semibold text-[#142132]">{readinessPercent}%</p><p className="text-sm font-semibold text-[#607387]">Listing readiness</p><button type="button" onClick={onOpenEdit} className="mt-1 text-xs font-semibold text-[#1f4f78]">Open multi-step editor</button></div><div className="border-b border-[#edf2f7] p-5 sm:border-b-0 sm:border-r"><p className="text-2xl font-semibold text-[#142132]">{detail.liveChannelCount} / {detail.channelCount}</p><p className="text-sm font-semibold text-[#607387]">Channels live</p><button type="button" onClick={onCheckProperty24} className="mt-1 text-xs font-semibold text-[#1f4f78]">View channels</button></div><div className="p-5"><p className="text-xl font-semibold text-[#142132]">{formatDateTime(detail.lastUpdatedAt)}</p><p className="text-sm font-semibold text-[#607387]">Last listing update</p></div></div>{remainingReadinessCount ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf2f7] bg-[#fffaf0] px-5 py-3 text-sm font-semibold text-[#8a5b13]"><span>Complete {remainingReadinessCount} remaining item{remainingReadinessCount === 1 ? '' : 's'} before publishing.</span><button type="button" onClick={onOpenEdit} className="rounded-lg border border-[#f1dfb8] bg-white px-3 py-2 text-xs font-semibold">Open multi-step editor</button></div> : null}</section>
        <RentalMarketingOverview detail={detail} row={row} galleryImages={galleryImages} onOpenEdit={onOpenEdit} />
        <article id="listing-distribution-channels" className="overflow-visible rounded-[22px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
          <div className="border-b border-[#edf2f7] p-5"><h3 className="text-base font-semibold text-[#142132]">Listing Channels</h3><p className="mt-1 text-sm text-[#607387]">Manage where this rental is advertised.</p></div>
          <RentalDistributionChannel
            logoSrc="/lead-sources/property24.png"
            name="Property24"
            subtitle="South Africa's property portal"
            reference={property24Reference ? `Ref: ${property24Reference}` : ''}
            status={property24Status}
            contextTitle={['published', 'live', 'active'].includes(String(property24Status).toLowerCase()) ? 'Published and up to date' : previewStatus.label === 'Ready to publish' ? 'Ready to publish' : 'Run readiness check before publishing'}
            lastSynced={property24LastSynced}
            actions={[
              property24Url ? <a key="view" href={property24Url} target="_blank" rel="noreferrer" className={channelMenuItemClass}><Eye size={15} />View live listing</a> : null,
              <button key="check" type="button" onClick={onCheckProperty24} disabled={checkingProperty24 || publishing} className={channelMenuItemClass}>{checkingProperty24 ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}Check readiness</button>,
              <button key="publish" type="button" onClick={onPublish} disabled={publishing || !getProperty24PreviewDetails(property24Preview).canSubmit} className={channelMenuItemClass}>{publishing ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Publish</button>,
              ['published', 'live', 'active'].includes(String(property24Status).toLowerCase()) ? <button key="expire" type="button" onClick={onExpireProperty24} disabled={publishing} className={`${channelMenuItemClass} text-[#a43d35] hover:bg-[#fff5f5]`}>{publishing ? <Loader2 size={15} className="animate-spin" /> : <CalendarDays size={15} />}Expire listing</button> : null,
            ].filter(Boolean)}
          />
          <RentalDistributionChannel
            icon={Home}
            logoSrc="/lead-sources/private-property.jpeg"
            name="Private Property"
            subtitle="Property portal"
            reference={privatePropertyReference ? `Ref: ${privatePropertyReference}` : ''}
            status={privatePropertyStatus}
            contextTitle={['published', 'live', 'active'].includes(String(privatePropertyStatus).toLowerCase()) ? 'Published and up to date' : privatePropertyPreview?.ready ? 'Ready to publish' : 'Run readiness check before publishing'}
            lastSynced={privatePropertyLastSynced}
            actions={[
              privatePropertyUrl ? <a key="view" href={privatePropertyUrl} target="_blank" rel="noreferrer" className={channelMenuItemClass}><Eye size={15} />View live listing</a> : null,
              <button key="check" type="button" onClick={onCheckPrivateProperty} disabled={checkingPrivateProperty || publishingPrivateProperty} className={channelMenuItemClass}>{checkingPrivateProperty ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}Check readiness</button>,
              <button key="publish" type="button" onClick={onPublishPrivateProperty} disabled={!privatePropertyPreview?.ready || publishingPrivateProperty} className={channelMenuItemClass}>{publishingPrivateProperty ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Publish</button>,
              ['published', 'live', 'active'].includes(String(privatePropertyStatus).toLowerCase()) ? <button key="expire" type="button" onClick={onExpirePrivateProperty} disabled={publishingPrivateProperty} className={`${channelMenuItemClass} text-[#a43d35] hover:bg-[#fff5f5]`}>{publishingPrivateProperty ? <Loader2 size={15} className="animate-spin" /> : <CalendarDays size={15} />}Expire listing</button> : null,
            ].filter(Boolean)}
          />
          <WebsiteListingPublicationPanel variant="channel" listingId={detail.listing?.id || row.id} listingTitle={row.title} onPrepare={onPrepareWebsitePublication} />
        </article>
        {property24Preview && getProperty24PreviewIssues(property24Preview).length ? (
          <section className="rounded-[18px] border border-[#f1dfb8] bg-[#fffaf0] p-4">
            <p className="text-sm font-semibold text-[#8a5b13]">Property24 needs attention</p>
            <div className="mt-3 grid gap-2">
              {getProperty24PreviewIssues(property24Preview).map((issue) => (
                <div key={issue.key} className="rounded-xl border border-[#f1dfb8] bg-white px-3 py-2">
                  <p className="text-sm font-semibold text-[#18324b]">{issue.label}</p>
                  <p className="mt-1 text-xs text-[#8a5b13]">{issue.detail}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {privatePropertyError ? <p className="rounded-[12px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{privatePropertyError}</p> : null}
        <section className="rounded-[18px] border border-[#cfe0ef] bg-[#f8fbff] p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-semibold text-[#1f4f78]">Property24 expiry date</p><p className="mt-1 text-sm text-[#607387]">Set when this rental should be removed from Property24.</p></div><div className="flex flex-wrap gap-2"><input type="date" value={property24ExpiryDate} onChange={(event) => onProperty24ExpiryChange(event.target.value)} className="min-h-10 rounded-xl border border-[#dbe6f2] bg-white px-3 text-sm" disabled={savingProperty24Expiry} /><button type="button" className="ui-pill-button ui-pill-button-active" onClick={onSaveProperty24Expiry} disabled={savingProperty24Expiry}>Save expiry</button></div></div></section>
        {property24PreviewError ? <p className="rounded-[12px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{property24PreviewError}</p> : null}
      </section>
    )
  }
  if (activeTab === 'syndication') {
    return (
      <Property24SyndicationPanel
        detail={detail}
        onPublish={onPublish}
        publishing={publishing}
        publishError={publishError}
        property24Preview={property24Preview}
        checkingProperty24={checkingProperty24}
        property24PreviewError={property24PreviewError}
        onCheckProperty24={onCheckProperty24}
        privatePropertyPreview={privatePropertyPreview}
        checkingPrivateProperty={checkingPrivateProperty}
        publishingPrivateProperty={publishingPrivateProperty}
        privatePropertyError={privatePropertyError}
        onCheckPrivateProperty={onCheckPrivateProperty}
        onPublishPrivateProperty={onPublishPrivateProperty}
      />
    )
  }
  if (activeTab === 'applications') {
    return (
      <DetailPanel eyebrow="Applications" title="Tenant Applications">
        <DetailRow label="Application count" value={row.applicationCount} />
        <DetailRow label="Latest application" value="No application activity" />
      </DetailPanel>
    )
  }
  if (activeTab === 'activity') {
    return (
      <DetailPanel eyebrow="Activity" title="Activity Timeline">
        <DetailRow label="Next action" value={row.nextAction} />
        <DetailRow label="Timeline" value="No activity captured" />
      </DetailPanel>
    )
  }
  return <RentalOverview detail={detail} onOpenMarketing={onOpenMarketing} />
}

export default function RentalListingDetailPage() {
  const navigate = useNavigate()
  const params = useParams()
  const listingId = params.listingId || ''
  const routeTab = resolveRentalListingDetailTab(params.detailTab || 'overview')
  const [activeTab, setActiveTab] = useState(routeTab)
  const workspaceContext = useWorkspace()
  const rentalScope = useMemo(() => resolveRentalWorkspaceScope(workspaceContext), [workspaceContext])
  const organisationId = rentalScope.organisationId
  const assignedAgentId = rentalScope.assignedAgentId
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState(() => ({ ...RENTAL_LISTING_INITIAL_FORM }))
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [property24Preview, setProperty24Preview] = useState(null)
  const [checkingProperty24, setCheckingProperty24] = useState(false)
  const [privatePropertyPreview, setPrivatePropertyPreview] = useState(null)
  const [checkingPrivateProperty, setCheckingPrivateProperty] = useState(false)
  const [publishingPrivateProperty, setPublishingPrivateProperty] = useState(false)
  const [privatePropertyError, setPrivatePropertyError] = useState('')
  const [property24PreviewError, setProperty24PreviewError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [property24ExpiryDate, setProperty24ExpiryDate] = useState('')
  const [savingProperty24Expiry, setSavingProperty24Expiry] = useState(false)
  const [deletingListing, setDeletingListing] = useState(false)

  const detail = useMemo(() => (listing ? buildRentalListingDetailView(listing) : null), [listing])
  const rentalWorkspaceTabs = useMemo(() => buildListingWorkspaceTabs('rentals', {
    hiddenTabs: ['property', 'features', 'media', 'syndication'],
  }).map((tab) => tab.key === 'mandate' ? { ...tab, label: 'Documents', shortLabel: 'Documents' } : tab), [])
  const activeRentalWorkspaceTab = useMemo(
    () => resolveRentalListingWorkspaceTabFromDetailTab(activeTab),
    [activeTab],
  )
  const editValidationErrors = useMemo(
    () => validateRentalListingEditForm(editForm, { organisationId }),
    [editForm, organisationId],
  )
  const canSaveEdit = editValidationErrors.length === 0 && !savingEdit

  const loadListing = useCallback(async () => {
    if (!listingId || !assignedAgentId || !organisationId) {
      setListing(null)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      const row = await getRentalListingForAgent(
        listingId,
        assignedAgentId,
        buildRentalListingQueryOptions(rentalScope),
      )
      if (!row) {
        setListing(null)
        setError('Rental listing not found.')
        return
      }
      setListing(row)
      setEditForm(buildRentalListingEditForm(row))
      setProperty24ExpiryDate(buildRentalListingEditForm(row).property24ExpiryDate || '')
      setProperty24Preview(null)
      setProperty24PreviewError('')
    } catch (loadError) {
      setListing(null)
      setError(loadError?.message || 'Unable to load the rental listing.')
    } finally {
      setLoading(false)
    }
  }, [assignedAgentId, listingId, organisationId, rentalScope])

  useEffect(() => {
    void loadListing()
  }, [loadListing])

  useEffect(() => {
    setActiveTab(routeTab)
  }, [routeTab])

  function openEditPanel() {
    navigate(`/agent/rentals/listings/${encodeURIComponent(listingId)}/edit`)
  }

  function updateEditForm(name, value) {
    setEditForm((current) => ({ ...current, [name]: value }))
    setEditError('')
    setSuccessMessage('')
  }

  async function handleEditSubmit(event) {
    event.preventDefault()
    if (!canSaveEdit) {
      setEditError(editValidationErrors[0] || 'Complete the required rental listing fields.')
      return
    }
    try {
      setSavingEdit(true)
      setEditError('')
      setSuccessMessage('')
      const result = await updateRentalListingDraft(listingId, editForm, {
        organisationId,
        assignedAgentId,
        performedBy: assignedAgentId,
      })
      setListing(result.listing)
      setEditForm(buildRentalListingEditForm(result.listing))
      setProperty24Preview(null)
      setProperty24PreviewError('')
      setEditOpen(false)
      setSuccessMessage('Rental listing details were saved.')
    } catch (saveError) {
      setEditError(saveError?.message || 'Unable to save rental listing details.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleLandlordSave(event) {
    event.preventDefault()
    try {
      setSavingEdit(true)
      setEditError('')
      setSuccessMessage('')
      const result = await updateRentalListingDraft(listingId, editForm, {
        organisationId,
        assignedAgentId,
        performedBy: assignedAgentId,
      })
      setListing(result.listing)
      setEditForm(buildRentalListingEditForm(result.listing))
      setSuccessMessage('Landlord details were saved.')
    } catch (saveError) {
      setEditError(saveError?.message || 'Unable to save landlord details.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function prepareRentalWebsitePublication() {
    if (!canSaveEdit) {
      const preparationError = new Error(editValidationErrors[0] || 'Complete the required rental listing fields before publishing to the website.')
      setEditError(preparationError.message)
      throw preparationError
    }
    try {
      setSavingEdit(true)
      setEditError('')
      const result = await updateRentalListingDraft(listingId, {
        ...editForm,
        marketingApprovalStatus: 'approved',
      }, {
        organisationId,
        assignedAgentId,
        performedBy: assignedAgentId,
        publicationStatus: 'Published',
      })
      setListing(result.listing)
      setEditForm(buildRentalListingEditForm(result.listing))
      return { ok: true, distributionSync: result.publicationResult }
    } catch (saveError) {
      setEditError(saveError?.message || 'Unable to prepare this rental for website publication.')
      throw saveError
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleProperty24Publish() {
    const previewDetails = getProperty24PreviewDetails(property24Preview)
    if (!property24Preview || !previewDetails.canSubmit) {
      setPublishError('Run a clean Property24 readiness check before publishing this rental.')
      return
    }
    try {
      setPublishing(true)
      setPublishError('')
      setSuccessMessage('')
      const result = await publishRentalProperty24Listing(listingId)
      const listingNumber = result?.report?.databaseWrite?.listingNumber ||
        result?.report?.property24Response?.data?.listingNumber ||
        result?.report?.property24Response?.data?.ListingNumber ||
        ''
      setSuccessMessage(listingNumber
        ? `Rental published to Property24. Listing number ${listingNumber}.`
        : 'Rental published to Property24.')
      await loadListing()
    } catch (publishRequestError) {
      setPublishError(publishRequestError?.message || 'Unable to publish this rental to Property24.')
    } finally {
      setPublishing(false)
    }
  }

  async function handleProperty24Expire() {
    if (!window.confirm('Expire this rental on Property24? It will no longer be advertised there.')) return
    try {
      setPublishing(true)
      setPublishError('')
      await expireRentalProperty24Listing(listingId)
      setSuccessMessage('Rental expired on Property24.')
      await loadListing()
    } catch (expireError) {
      setPublishError(expireError?.message || 'Unable to expire this rental on Property24.')
    } finally {
      setPublishing(false)
    }
  }

  async function handleCheckProperty24Readiness() {
    try {
      setCheckingProperty24(true)
      setProperty24PreviewError('')
      setPublishError('')
      setSuccessMessage('')
      const payload = await previewRentalProperty24Listing(listingId)
      const previewDetails = getProperty24PreviewDetails(payload)
      setProperty24Preview(payload)
      if (previewDetails.dataBlockers.length) {
        setSuccessMessage('')
        return
      }
      if (previewDetails.sandboxAgentPending && previewDetails.technicalBlockers.length === 1) {
        setSuccessMessage('Property24 sandbox preview is ready. Real publishing still needs the Property24 agent ID.')
        return
      }
      if (previewDetails.technicalBlockers.length) {
        setSuccessMessage('')
        return
      }
      setSuccessMessage('Property24 rental readiness check passed.')
    } catch (previewError) {
      setProperty24Preview(null)
      setProperty24PreviewError(previewError?.message || 'Unable to check Property24 rental readiness.')
    } finally {
      setCheckingProperty24(false)
    }
  }

  async function handleCheckPrivatePropertyReadiness() {
    try {
      setCheckingPrivateProperty(true)
      setPrivatePropertyError('')
      const payload = await previewPrivatePropertyRentalListing(listingId)
      setPrivatePropertyPreview(payload)
      setSuccessMessage(payload?.ready ? 'Private Property rental readiness check passed.' : 'Private Property has blockers to resolve before publishing.')
    } catch (previewError) {
      setPrivatePropertyPreview(null)
      setPrivatePropertyError(previewError?.message || 'Unable to check Private Property rental readiness.')
    } finally {
      setCheckingPrivateProperty(false)
    }
  }

  async function handlePrivatePropertyPublish() {
    if (!privatePropertyPreview?.ready) {
      setPrivatePropertyError('Run a clean Private Property readiness check before publishing this rental.')
      return
    }
    if (!window.confirm('Submit this rental listing to Private Property production?')) return
    try {
      setPublishingPrivateProperty(true)
      setPrivatePropertyError('')
      const result = await publishPrivatePropertyRentalListing(listingId)
      const reference = result?.report?.privatePropertyReference || result?.report?.syncResult?.privatePropertyRef || ''
      setSuccessMessage(reference ? `Rental submitted to Private Property. Reference ${reference}.` : 'Rental submitted to Private Property.')
      await loadListing()
    } catch (publishError) {
      setPrivatePropertyError(publishError?.message || 'Unable to publish this rental to Private Property.')
    } finally {
      setPublishingPrivateProperty(false)
    }
  }

  async function handlePrivatePropertyExpire() {
    if (!window.confirm('Expire this rental on Private Property? It will no longer be advertised there.')) return
    try {
      setPublishingPrivateProperty(true)
      setPrivatePropertyError('')
      await expirePrivatePropertyRentalListing(listingId)
      setSuccessMessage('Rental expired on Private Property.')
      await loadListing()
    } catch (expireError) {
      setPrivatePropertyError(expireError?.message || 'Unable to expire this rental on Private Property.')
    } finally {
      setPublishingPrivateProperty(false)
    }
  }

  async function handleSaveProperty24Expiry() {
    if (!property24ExpiryDate) {
      setProperty24PreviewError('Choose a Property24 expiry date before saving.')
      return
    }
    if (property24ExpiryDate <= new Date().toISOString().slice(0, 10)) {
      setProperty24PreviewError('Property24 expiry must be a future date.')
      return
    }
    try {
      setSavingProperty24Expiry(true)
      setProperty24PreviewError('')
      const result = await updateRentalListingDraft(listingId, { ...editForm, property24ExpiryDate }, {
        organisationId,
        assignedAgentId,
        performedBy: assignedAgentId,
      })
      setListing(result.listing)
      setEditForm(buildRentalListingEditForm(result.listing))
      setSuccessMessage('Property24 expiry date saved.')
    } catch (saveError) {
      setProperty24PreviewError(saveError?.message || 'Unable to save the Property24 expiry date.')
    } finally {
      setSavingProperty24Expiry(false)
    }
  }

  async function handleDeleteRentalListing() {
    const title = String(row?.title || 'this rental listing').trim()
    if (!window.confirm(`Permanently delete "${title}"?\n\nThis removes the rental listing and its linked workflow data. This cannot be undone.`)) return
    try {
      setDeletingListing(true)
      setError('')
      await deletePrivateListing(listingId, { organisationId })
      navigate('/agent/rentals/listings', { replace: true, state: { message: `"${title}" was permanently deleted.` } })
    } catch (deleteError) {
      setError(deleteError?.message || 'Unable to delete this rental listing.')
    } finally {
      setDeletingListing(false)
    }
  }

  if (loading) {
    return (
      <section className="page-content">
        <div className="ui-panel ui-panel-body flex items-center gap-3 text-sm font-semibold text-[#42617f]">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Loading rental listing
        </div>
      </section>
    )
  }

  if (!detail) {
    return (
      <section className="page-content">
        <div className="rounded-[8px] border border-dashed border-[#dbe6f2] bg-white p-8 text-center">
          <h1 className="text-xl font-semibold text-[#18324b]">{error || 'Rental listing not found.'}</h1>
          <button type="button" className="ui-pill-button ui-pill-button-active mx-auto mt-4" onClick={() => navigate('/agent/rentals/listings')}>
            <ArrowLeft size={16} aria-hidden="true" />
            Back to Listings
          </button>
        </div>
      </section>
    )
  }

  const row = detail.row

  function openRentalListingWorkspaceTab(tabKey) {
    const target = resolveRentalListingWorkspaceTarget(tabKey)
    setActiveTab(target.detailTab || 'overview')
  }

  return (
    <section className="page-content">
      <div className="ui-section-stack">
        <header className="relative isolate min-h-[240px] overflow-hidden rounded-[24px] border border-[#d7e1eb] bg-[#153751] shadow-[0_12px_28px_rgba(15,23,42,0.12)] sm:min-h-[300px]">
          <div className="absolute inset-0 -z-20">
            <RentalListingImage src={row.imageUrl} title={row.title} />
          </div>
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(8,35,56,0.94)_0%,rgba(13,49,75,0.83)_46%,rgba(20,55,81,0.42)_100%)]" />
          <div className="flex min-h-[240px] flex-col justify-between gap-6 p-5 sm:min-h-[300px] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/agent/rentals/listings')}
                  className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[0.74rem] font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
                >
                  <ArrowLeft size={13} aria-hidden="true" />
                  Back to listings
                </button>
                <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[0.72rem] font-semibold text-white/90 backdrop-blur-sm">Rental listing</span>
                <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[0.72rem] font-semibold text-white/90 backdrop-blur-sm">{detail.statusLabel}</span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" className="ui-pill-button border-white/20 bg-white/10 text-white shadow-none hover:bg-white/20" onClick={loadListing} disabled={loading}>
                  <RefreshCw size={16} aria-hidden="true" />
                  Refresh
                </button>
                <button type="button" className="ui-pill-button border-white bg-white text-[#163956] shadow-none hover:bg-[#edf5fb]" onClick={openEditPanel}>
                  <Pencil size={16} aria-hidden="true" />
                  Edit Listing
                </button>
                <button type="button" className="ui-pill-button border-white/20 bg-white/10 text-white shadow-none hover:bg-white/20" onClick={handleDeleteRentalListing} disabled={deletingListing}>
                  {deletingListing ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
                  Delete Listing
                </button>
              </div>
            </div>
            <div className="max-w-4xl">
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">{row.title}</h1>
              <p className="mt-2 text-base font-semibold text-white/90 sm:text-lg">{formatRentalHeroAddress(row)}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold text-white/90">
                <span>{row.propertyType || 'Rental property'}</span>
                {row.bedrooms ? <><span className="text-white/50">•</span><span>{row.bedrooms} {Number(row.bedrooms) === 1 ? 'bed' : 'beds'}</span></> : null}
                {row.bathrooms ? <><span className="text-white/50">•</span><span>{row.bathrooms} {Number(row.bathrooms) === 1 ? 'bath' : 'baths'}</span></> : null}
                {row.parkingBays ? <><span className="text-white/50">•</span><span>{row.parkingBays} parking {Number(row.parkingBays) === 1 ? 'bay' : 'bays'}</span></> : null}
              </div>
              <p className="mt-4 text-xl font-semibold tracking-[-0.03em] text-white sm:text-2xl">{formatCurrency(row.monthlyRent)} <span className="text-sm font-medium text-white/75 sm:text-base">per month</span></p>
            </div>
          </div>
        </header>

        {successMessage ? (
          <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">
            <CheckCircle2 size={16} aria-hidden="true" />
            {successMessage}
          </p>
        ) : null}

        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)]" data-testid="rental-listing-shared-workspace-tabs">
          <ListingWorkspaceTabs
            className="rounded-[18px] border border-[#e1e8ef] bg-[#fbfdff] p-1.5 [&_button]:rounded-[13px] [&_button]:border-b-0 [&_button]:px-5 [&_button]:text-center [&_button]:text-[#64788f] sm:[&_button]:flex-1 [&_button[aria-selected=true]]:bg-[#153f60] [&_button[aria-selected=true]]:text-white [&_button[aria-selected=true]]:shadow-[0_5px_14px_rgba(15,54,82,0.18)]"
            tabs={rentalWorkspaceTabs}
            activeTab={activeRentalWorkspaceTab}
            onTabChange={openRentalListingWorkspaceTab}
            ariaLabel="Rental listing workspace sections"
          />
        </section>

        <ListingAgentReassignmentPanel
          listingId={row.id}
          listing={listing}
          listingType="rental"
          onReassigned={async () => {
            await loadListing()
            setSuccessMessage('Rental listing agent reassigned successfully.')
          }}
        />

        <RentalTabContent
          activeTab={activeTab}
          detail={detail}
          onPublish={handleProperty24Publish}
          onExpireProperty24={handleProperty24Expire}
          publishing={publishing}
          publishError={publishError}
          property24Preview={property24Preview}
          checkingProperty24={checkingProperty24}
          property24PreviewError={property24PreviewError}
          onCheckProperty24={handleCheckProperty24Readiness}
          privatePropertyPreview={privatePropertyPreview}
          checkingPrivateProperty={checkingPrivateProperty}
          publishingPrivateProperty={publishingPrivateProperty}
          privatePropertyError={privatePropertyError}
          onCheckPrivateProperty={handleCheckPrivatePropertyReadiness}
          onPublishPrivateProperty={handlePrivatePropertyPublish}
          onExpirePrivateProperty={handlePrivatePropertyExpire}
          onOpenMarketing={() => setActiveTab('marketing')}
          onOpenEdit={openEditPanel}
          property24ExpiryDate={property24ExpiryDate}
          onProperty24ExpiryChange={setProperty24ExpiryDate}
          onSaveProperty24Expiry={handleSaveProperty24Expiry}
          savingProperty24Expiry={savingProperty24Expiry}
          onPrepareWebsitePublication={prepareRentalWebsitePublication}
          landlordForm={editForm}
          onLandlordChange={updateEditForm}
          onSaveLandlord={handleLandlordSave}
          savingLandlord={savingEdit}
          landlordError={editError}
        />
      </div>
    </section>
  )
}
