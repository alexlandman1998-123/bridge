import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Home,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getRentalListingForAgent } from '../../services/rentals/rentalListingDraftService'
import {
  buildRentalListingDetailPath,
  buildRentalListingDetailView,
  resolveRentalListingDetailTab,
} from '../../services/rentals/rentalListingDetailModel'
import {
  buildRentalListingQueryOptions,
  resolveRentalWorkspaceScope,
} from '../../services/rentals/rentalWorkspaceScope'

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

function RentalTabContent({ activeTab, detail }) {
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
      <DetailPanel eyebrow="Landlord" title="Landlord Relationship">
        <DetailRow label="Name" value={row.landlordName} />
        <DetailRow label="Email" value={row.landlordEmail} />
        <DetailRow label="Phone" value={row.landlordPhone} />
        <DetailRow label="Client record" value="Not linked" />
      </DetailPanel>
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
    return (
      <DetailPanel eyebrow="Mandate" title="Rental Mandate">
        <DetailRow label="Status" value={detail.mandateStatusLabel} />
        <DetailRow label="Next action" value={row.nextAction} />
      </DetailPanel>
    )
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
    return (
      <DetailPanel eyebrow="Marketing" title="Marketing Approval">
        <DetailRow label="Approval status" value={detail.marketingApprovalStatusLabel} />
        <DetailRow label="Property24 status" value={detail.property24StatusLabel} />
      </DetailPanel>
    )
  }
  if (activeTab === 'syndication') {
    return (
      <DetailPanel eyebrow="Syndication" title="Property24 Rental">
        <DetailRow label="Portal status" value={detail.property24StatusLabel} />
        <DetailRow label="Listing type" value="Rental" />
        <DetailRow label="Publishing readiness" value={`${detail.readinessPercent}%`} />
      </DetailPanel>
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
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <DetailPanel eyebrow="Readiness" title="Listing Readiness">
        <div className="grid gap-3 md:grid-cols-2">
          {detail.readinessItems.map((item) => <ReadinessCard key={item.key} item={item} />)}
        </div>
      </DetailPanel>
      <DetailPanel eyebrow="Next action" title={row.nextAction}>
        <DetailRow label="Mandate" value={detail.mandateStatusLabel} />
        <DetailRow label="Marketing" value={detail.marketingApprovalStatusLabel} />
        <DetailRow label="Property24" value={detail.property24StatusLabel} />
        <DetailRow label="Applications" value={row.applicationCount} />
      </DetailPanel>
    </div>
  )
}

export default function RentalListingDetailPage() {
  const navigate = useNavigate()
  const params = useParams()
  const listingId = params.listingId || ''
  const activeTab = resolveRentalListingDetailTab(params.detailTab || 'overview')
  const workspaceContext = useWorkspace()
  const rentalScope = useMemo(() => resolveRentalWorkspaceScope(workspaceContext), [workspaceContext])
  const organisationId = rentalScope.organisationId
  const assignedAgentId = rentalScope.assignedAgentId
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const detail = useMemo(() => (listing ? buildRentalListingDetailView(listing) : null), [listing])

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

  return (
    <section className="page-content">
      <div className="ui-section-stack">
        <header className="ui-toolbar">
          <div className="ui-toolbar-group">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]">
              <Home size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase text-[#607891]">Rental listing</p>
              <h1 className="text-2xl font-semibold text-[#18324b]">{row.title}</h1>
              <p className="status-message">{row.address || 'Address pending'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="ui-pill-button" onClick={() => navigate('/agent/rentals/listings')}>
              <ArrowLeft size={16} aria-hidden="true" />
              Back to Listings
            </button>
            <button type="button" className="ui-pill-button" onClick={loadListing} disabled={loading}>
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FactCard label="Monthly rent" value={formatCurrency(row.monthlyRent)} detail="Rental terms" icon={<Home size={18} aria-hidden="true" />} />
          <FactCard label="Available" value={formatDate(row.availableFrom)} detail={row.leasePeriodMonths ? `${row.leasePeriodMonths} month lease` : 'Lease period pending'} icon={<CalendarDays size={18} aria-hidden="true" />} />
          <FactCard label="Landlord" value={row.landlordName || 'Not captured'} detail={row.landlordContact || 'Contact pending'} icon={<Users size={18} aria-hidden="true" />} />
          <FactCard label="Readiness" value={`${detail.readinessPercent}%`} detail={`${detail.completedReadinessCount}/${detail.totalReadinessCount} checks complete`} icon={<BadgeCheck size={18} aria-hidden="true" />} />
        </div>

        <div className="ui-panel ui-panel-body">
          <div className="flex flex-wrap gap-2">
            {detail.tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`ui-pill-button ${activeTab === tab.key ? 'ui-pill-button-active' : ''}`}
                onClick={() => navigate(buildRentalListingDetailPath(row.id, tab.key))}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <FactCard label="Mandate" value={detail.mandateStatusLabel} detail="Rental authority" icon={<ClipboardList size={18} aria-hidden="true" />} />
          <FactCard label="Marketing" value={detail.marketingApprovalStatusLabel} detail="Landlord approval" icon={<ShieldCheck size={18} aria-hidden="true" />} />
          <FactCard label="Property24" value={detail.property24StatusLabel} detail="Rental syndication" icon={<CheckCircle2 size={18} aria-hidden="true" />} />
        </div>

        <RentalTabContent activeTab={activeTab} detail={detail} />
      </div>
    </section>
  )
}
