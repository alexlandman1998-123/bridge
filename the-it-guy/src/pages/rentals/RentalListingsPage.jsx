import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Home, Loader2, Plus, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  createRentalListingDraft,
  listRentalListingsForAgent,
} from '../../services/rentals/rentalListingDraftService'
import {
  buildRentalListingTitle,
  RENTAL_LISTING_INITIAL_FORM,
  RENTAL_SELECT_OPTIONS,
  validateRentalListingDraftForm,
} from '../../services/rentals/rentalListingDraftModel'

function normalizeText(value) {
  return String(value || '').trim()
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

function resolveOrganisationId(workspaceContext = {}) {
  const membership = workspaceContext.currentMembership || {}
  return normalizeText(
    workspaceContext.currentWorkspace?.id ||
      workspaceContext.workspace?.id ||
      membership.organisationId ||
      membership.organisation_id ||
      membership.organizationId ||
      membership.organization_id ||
      membership.workspaceId ||
      membership.workspace_id ||
      membership.raw?.organisation_id ||
      membership.raw?.organization_id,
  )
}

function resolveBranchId(workspaceContext = {}) {
  const membership = workspaceContext.currentMembership || {}
  return normalizeText(
    membership.branchId ||
      membership.branch_id ||
      membership.organisationBranchId ||
      membership.organisation_branch_id ||
      membership.raw?.branch_id ||
      membership.raw?.organisation_branch_id,
  )
}

function canSeeOrganisationListings(workspaceContext = {}) {
  const role = normalizeText(
    workspaceContext.workspaceRole ||
      workspaceContext.currentMembership?.workspaceRole ||
      workspaceContext.currentMembership?.workspace_role ||
      workspaceContext.currentMembership?.role,
  ).toLowerCase()
  return workspaceContext.agencyWorkflowMode === 'principal' ||
    ['owner', 'principal', 'admin', 'agency_admin', 'manager', 'branch_manager'].includes(role)
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

function RentalListingCard({ listing }) {
  const publication = listing.listingPublicationData || {}
  const title = listing.listingTitle || listing.title || publication.title || 'Rental listing'
  const rent = listing.askingPrice || listing.asking_price || publication.askingPrice || publication.asking_price
  const status = listing.mandateStatus || listing.mandate_status || 'not_started'
  const address = listing.propertyAddress || listing.formattedAddress || listing.formatted_address || publication.address || ''
  return (
    <article className="rounded-[8px] border border-[#dbe6f2] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[#607891]">Rental Draft</p>
          <h3 className="mt-1 text-base font-semibold text-[#18324b]">{title}</h3>
          <p className="mt-1 text-sm text-[#607891]">{address || 'Address pending'}</p>
        </div>
        <span className="rounded-full border border-[#dbe6f2] px-3 py-1 text-xs font-semibold text-[#42617f]">
          {String(status).replaceAll('_', ' ')}
        </span>
      </div>
      <div className="mt-4 grid gap-3 text-sm text-[#203a54] sm:grid-cols-3">
        <span><strong>{formatCurrency(rent)}</strong><br />Monthly rent</span>
        <span><strong>{publication.status || 'Draft'}</strong><br />Marketing draft</span>
        <span><strong>Property24 Rental</strong><br />Listing type</span>
      </div>
    </article>
  )
}

export default function RentalListingsPage() {
  const workspaceContext = useWorkspace()
  const organisationId = useMemo(() => resolveOrganisationId(workspaceContext), [workspaceContext])
  const branchId = useMemo(() => resolveBranchId(workspaceContext), [workspaceContext])
  const assignedAgentId = normalizeText(workspaceContext.profile?.id)
  const [form, setForm] = useState(() => ({ ...RENTAL_LISTING_INITIAL_FORM }))
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const validationErrors = useMemo(
    () => validateRentalListingDraftForm(form, { organisationId }),
    [form, organisationId],
  )
  const canSubmit = validationErrors.length === 0 && !saving

  const updateForm = useCallback((name, value) => {
    setForm((current) => ({ ...current, [name]: value }))
    setError('')
    setSuccess('')
  }, [])

  const loadListings = useCallback(async () => {
    if (!assignedAgentId || !organisationId) {
      setListings([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      const rows = await listRentalListingsForAgent(assignedAgentId, {
        organisationId,
        includeAllOrganisationListings: canSeeOrganisationListings(workspaceContext),
      })
      setListings(rows)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load rental listings.')
      setListings([])
    } finally {
      setLoading(false)
    }
  }, [assignedAgentId, organisationId, workspaceContext])

  useEffect(() => {
    void loadListings()
  }, [loadListings])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) {
      setError(validationErrors[0] || 'Complete the required rental listing fields.')
      return
    }
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      const created = await createRentalListingDraft(form, {
        organisationId,
        branchId,
        assignedAgentId,
        performedBy: assignedAgentId,
      })
      setSuccess(`${buildRentalListingTitle(form)} was captured as a rental listing draft.`)
      setForm({ ...RENTAL_LISTING_INITIAL_FORM })
      setListings((current) => [created.listing, ...current])
      void loadListings()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to create the rental listing draft.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-content">
      <div className="ui-section-stack">
        <header className="ui-toolbar">
          <div className="ui-toolbar-group">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]">
              <Home size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase text-[#607891]">Rentals Workspace</p>
              <h1 className="text-2xl font-semibold text-[#18324b]">Rental Listings</h1>
              <p className="status-message">
                Capture landlord, mandate, availability, deposit, lease, inspection, and Property24 rental draft details.
              </p>
            </div>
          </div>
          <button type="button" className="ui-pill-button" onClick={loadListings} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
            Refresh
          </button>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <form onSubmit={handleSubmit} className="ui-panel ui-panel-body grid gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-[#607891]">Phase 4 Capture</p>
                <h2 className="text-lg font-semibold text-[#18324b]">Create rental draft</h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#dbe6f2] px-3 py-1 text-xs font-semibold text-[#42617f]">
                <ShieldCheck size={14} aria-hidden="true" />
                Staging gated
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="form-field md:col-span-2">
                <span>Listing title</span>
                <input {...formField('title', form.title, updateForm)} placeholder="2 bedroom apartment in Green Point" />
              </label>
              <SelectField label="Property type" name="propertyType" value={form.propertyType} onChange={updateForm} options={[
                { value: 'Apartment', label: 'Apartment' },
                { value: 'House', label: 'House' },
                { value: 'Townhouse', label: 'Townhouse' },
                { value: 'Duplex', label: 'Duplex' },
                { value: 'Studio', label: 'Studio' },
              ]} />
              <label className="form-field md:col-span-3">
                <span>Property address</span>
                <input {...formField('propertyAddress', form.propertyAddress, updateForm)} placeholder="Street address or complex name" />
              </label>
              <label className="form-field">
                <span>Suburb</span>
                <input {...formField('suburb', form.suburb, updateForm)} placeholder="Suburb" />
              </label>
              <label className="form-field">
                <span>City</span>
                <input {...formField('city', form.city, updateForm)} placeholder="City" />
              </label>
              <label className="form-field">
                <span>Province</span>
                <input {...formField('province', form.province, updateForm)} placeholder="Province" />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="form-field">
                <span>Landlord name</span>
                <input {...formField('landlordName', form.landlordName, updateForm)} placeholder="Landlord or entity name" />
              </label>
              <label className="form-field">
                <span>Landlord email</span>
                <input type="email" {...formField('landlordEmail', form.landlordEmail, updateForm)} placeholder="landlord@example.com" />
              </label>
              <label className="form-field">
                <span>Landlord phone</span>
                <input {...formField('landlordPhone', form.landlordPhone, updateForm)} placeholder="+27..." />
              </label>
              <SelectField label="Landlord type" name="landlordType" value={form.landlordType} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.landlordType} />
              <SelectField label="Rental mandate" name="mandateStatus" value={form.mandateStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.mandateStatus} />
              <SelectField label="Marketing approval" name="marketingApprovalStatus" value={form.marketingApprovalStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.marketingApprovalStatus} />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <label className="form-field">
                <span>Monthly rent</span>
                <input type="number" min="0" {...formField('monthlyRent', form.monthlyRent, updateForm)} placeholder="18500" />
              </label>
              <label className="form-field">
                <span>Deposit</span>
                <input type="number" min="0" {...formField('depositAmount', form.depositAmount, updateForm)} placeholder="37000" />
              </label>
              <label className="form-field">
                <span>Available from</span>
                <input type="date" {...formField('availableFrom', form.availableFrom, updateForm)} />
              </label>
              <label className="form-field">
                <span>Lease period months</span>
                <input type="number" min="1" {...formField('leasePeriodMonths', form.leasePeriodMonths, updateForm)} />
              </label>
              <label className="form-field">
                <span>Bedrooms</span>
                <input type="number" min="0" {...formField('bedrooms', form.bedrooms, updateForm)} />
              </label>
              <label className="form-field">
                <span>Bathrooms</span>
                <input type="number" min="0" step="0.5" {...formField('bathrooms', form.bathrooms, updateForm)} />
              </label>
              <label className="form-field">
                <span>Parking bays</span>
                <input type="number" min="0" {...formField('parkingBays', form.parkingBays, updateForm)} />
              </label>
              <SelectField label="Furnished" name="furnishedStatus" value={form.furnishedStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.furnishedStatus} />
              <SelectField label="Pets" name="petsPolicy" value={form.petsPolicy} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.petsPolicy} />
              <SelectField label="Utilities" name="utilitiesPolicy" value={form.utilitiesPolicy} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.utilitiesPolicy} />
              <SelectField label="Inspection" name="inspectionStatus" value={form.inspectionStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.inspectionStatus} />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="form-field">
                <span>Public description</span>
                <textarea rows={5} {...formField('description', form.description, updateForm)} placeholder="Short rental marketing description" />
              </label>
              <label className="form-field">
                <span>Inspection notes</span>
                <textarea rows={5} {...formField('inspectionNotes', form.inspectionNotes, updateForm)} placeholder="Inspection checklist status, repairs, access notes" />
              </label>
              <label className="form-field">
                <span>Internal notes</span>
                <textarea rows={5} {...formField('internalNotes', form.internalNotes, updateForm)} placeholder="Landlord preferences, tenant profile, team notes" />
              </label>
            </div>

            {error ? <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p> : null}
            {success ? (
              <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">
                <CheckCircle2 size={16} aria-hidden="true" />
                {success}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="status-message">
                Required: landlord name, landlord contact, property address, monthly rent, and availability date.
              </p>
              <button type="submit" className="ui-pill-button ui-pill-button-active" disabled={!canSubmit}>
                {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                Save rental draft
              </button>
            </div>
          </form>

          <aside className="grid content-start gap-4">
            <div className="ui-panel ui-panel-body">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-white text-[#42617f]">
                  <Plus size={18} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase text-[#607891]">Captured rentals</p>
                  <h2 className="text-lg font-semibold text-[#18324b]">{listings.length} drafts</h2>
                </div>
              </div>
              <p className="status-message mt-3">
                These are rental private listings and Property24 rental publication drafts, not lease accounts.
              </p>
            </div>
            {loading ? (
              <div className="ui-panel ui-panel-body flex items-center gap-3 text-sm font-semibold text-[#42617f]">
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Loading rentals
              </div>
            ) : listings.length ? (
              listings.map((listing) => <RentalListingCard key={listing.id || listing.listingReference || listing.title} listing={listing} />)
            ) : (
              <div className="rounded-[8px] border border-dashed border-[#dbe6f2] bg-white p-5 text-sm text-[#607891]">
                No rental drafts yet.
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  )
}
