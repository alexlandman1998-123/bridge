import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList, Loader2, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  createRentalApplicationDraft,
  listRentalApplicationsForAgent,
} from '../../services/rentals/rentalApplicationDraftService'
import {
  calculateRentalAffordability,
  getRentalApplicationStatusLabel,
  RENTAL_APPLICATION_INITIAL_FORM,
  RENTAL_APPLICATION_SELECT_OPTIONS,
  validateRentalApplicationDraftForm,
} from '../../services/rentals/rentalApplicationDraftModel'
import { listRentalListingsForAgent } from '../../services/rentals/rentalListingDraftService'

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

function formatRatio(value) {
  const ratio = Number(value)
  if (!Number.isFinite(ratio) || ratio <= 0) return 'Unknown'
  return `${ratio.toFixed(1)}x rent`
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

function getListingTitle(listing = {}) {
  return normalizeText(listing.listingTitle || listing.title || listing.listingPublicationData?.title) || 'Rental listing'
}

function getListingRent(listing = {}) {
  return listing.askingPrice ||
    listing.asking_price ||
    listing.listingPublicationData?.askingPrice ||
    listing.listingPublicationData?.asking_price ||
    null
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

function ApplicationCard({ application }) {
  const toneClass = application.affordabilityScore === 'strong'
    ? 'border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]'
    : application.affordabilityScore === 'review'
      ? 'border-[#f0dfb3] bg-[#fffaf0] text-[#8a641d]'
      : application.affordabilityScore === 'weak'
        ? 'border-[#f2c6c6] bg-[#fff7f7] text-[#9f3131]'
        : 'border-[#dbe6f2] bg-white text-[#42617f]'
  return (
    <article className="rounded-[8px] border border-[#dbe6f2] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[#607891]">{application.reference || 'Rental application'}</p>
          <h3 className="mt-1 text-base font-semibold text-[#18324b]">{application.tenantName || 'Tenant'}</h3>
          <p className="mt-1 text-sm text-[#607891]">{application.listingTitle || 'Rental listing'}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneClass}`}>
          {application.affordabilityScore}
        </span>
      </div>
      <div className="mt-4 grid gap-3 text-sm text-[#203a54] sm:grid-cols-3">
        <span><strong>{getRentalApplicationStatusLabel('applicationStatus', application.applicationStatus) || 'Draft'}</strong><br />Application</span>
        <span><strong>{getRentalApplicationStatusLabel('creditCheckStatus', application.creditCheckStatus) || 'Not started'}</strong><br />Credit check</span>
        <span><strong>{getRentalApplicationStatusLabel('landlordApprovalStatus', application.landlordApprovalStatus) || 'Not sent'}</strong><br />Landlord approval</span>
      </div>
      <p className="mt-3 text-sm text-[#607891]">
        {application.tenantEmail || application.tenantPhone || 'Tenant contact pending'}
      </p>
    </article>
  )
}

export default function RentalApplicationsPage() {
  const workspaceContext = useWorkspace()
  const organisationId = useMemo(() => resolveOrganisationId(workspaceContext), [workspaceContext])
  const assignedAgentId = normalizeText(workspaceContext.profile?.id)
  const includeAllOrganisationListings = canSeeOrganisationListings(workspaceContext)
  const [form, setForm] = useState(() => ({ ...RENTAL_APPLICATION_INITIAL_FORM }))
  const [listings, setListings] = useState([])
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const selectedListing = useMemo(
    () => listings.find((listing) => normalizeText(listing.id) === normalizeText(form.listingId)) || null,
    [form.listingId, listings],
  )
  const affordability = useMemo(
    () => calculateRentalAffordability(form, selectedListing || {}),
    [form, selectedListing],
  )
  const validationErrors = useMemo(() => validateRentalApplicationDraftForm(form), [form])
  const canSubmit = validationErrors.length === 0 && !saving && Boolean(selectedListing)

  const updateForm = useCallback((name, value) => {
    setForm((current) => ({ ...current, [name]: value }))
    setError('')
    setSuccess('')
  }, [])

  const loadData = useCallback(async () => {
    if (!assignedAgentId || !organisationId) {
      setListings([])
      setApplications([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      const options = { organisationId, includeAllOrganisationListings }
      const [rentalListings, rentalApplications] = await Promise.all([
        listRentalListingsForAgent(assignedAgentId, options),
        listRentalApplicationsForAgent(assignedAgentId, options),
      ])
      setListings(rentalListings)
      setApplications(rentalApplications)
      setForm((current) => current.listingId || !rentalListings[0]?.id
        ? current
        : { ...current, listingId: rentalListings[0].id })
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load rental applications.')
      setListings([])
      setApplications([])
    } finally {
      setLoading(false)
    }
  }, [assignedAgentId, includeAllOrganisationListings, organisationId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) {
      setError(validationErrors[0] || 'Select a rental listing and complete the tenant application fields.')
      return
    }
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      const created = await createRentalApplicationDraft(form, selectedListing, {
        assignedAgentId,
        performedBy: assignedAgentId,
      })
      setSuccess(`${created.application.tenantName || 'Tenant'} application captured.`)
      setForm((current) => ({ ...RENTAL_APPLICATION_INITIAL_FORM, listingId: current.listingId }))
      setApplications((current) => [created.application, ...current])
      void loadData()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to capture the rental application.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-content">
      <div className="ui-section-stack">
        <header className="ui-toolbar">
          <div className="ui-toolbar-group">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-white text-[#42617f]">
              <ClipboardList size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase text-[#607891]">Rentals Workspace</p>
              <h1 className="text-2xl font-semibold text-[#18324b]">Tenant Applications</h1>
              <p className="status-message">
                Capture tenant application, documents, affordability, references, credit status, and landlord approval.
              </p>
            </div>
          </div>
          <button type="button" className="ui-pill-button" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
            Refresh
          </button>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <form onSubmit={handleSubmit} className="ui-panel ui-panel-body grid gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-[#607891]">Phase 5 Capture</p>
                <h2 className="text-lg font-semibold text-[#18324b]">Create tenant application</h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#dbe6f2] px-3 py-1 text-xs font-semibold text-[#42617f]">
                <ShieldCheck size={14} aria-hidden="true" />
                Staging gated
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="form-field md:col-span-2">
                <span>Rental listing</span>
                <select {...formField('listingId', form.listingId, updateForm)} disabled={!listings.length}>
                  {listings.length ? listings.map((listing) => (
                    <option key={listing.id} value={listing.id}>
                      {getListingTitle(listing)} - {formatCurrency(getListingRent(listing))}
                    </option>
                  )) : <option value="">Create a rental listing first</option>}
                </select>
              </label>
              <label className="form-field">
                <span>Occupation date</span>
                <input type="date" {...formField('intendedOccupationDate', form.intendedOccupationDate, updateForm)} />
              </label>
              <label className="form-field">
                <span>Tenant name</span>
                <input {...formField('tenantName', form.tenantName, updateForm)} placeholder="Applicant full name" />
              </label>
              <label className="form-field">
                <span>Tenant email</span>
                <input type="email" {...formField('tenantEmail', form.tenantEmail, updateForm)} placeholder="tenant@example.com" />
              </label>
              <label className="form-field">
                <span>Tenant phone</span>
                <input {...formField('tenantPhone', form.tenantPhone, updateForm)} placeholder="+27..." />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <SelectField label="Employment" name="employmentStatus" value={form.employmentStatus} onChange={updateForm} options={RENTAL_APPLICATION_SELECT_OPTIONS.employmentStatus} />
              <label className="form-field">
                <span>Employer</span>
                <input {...formField('employerName', form.employerName, updateForm)} placeholder="Employer name" />
              </label>
              <label className="form-field">
                <span>Household size</span>
                <input type="number" min="1" {...formField('householdSize', form.householdSize, updateForm)} />
              </label>
              <label className="form-field">
                <span>Monthly income</span>
                <input type="number" min="0" {...formField('monthlyIncome', form.monthlyIncome, updateForm)} placeholder="62000" />
              </label>
              <label className="form-field">
                <span>Other income</span>
                <input type="number" min="0" {...formField('otherIncome', form.otherIncome, updateForm)} />
              </label>
              <label className="form-field">
                <span>Monthly obligations</span>
                <input type="number" min="0" {...formField('monthlyObligations', form.monthlyObligations, updateForm)} />
              </label>
              <div className="rounded-[8px] border border-[#dbe6f2] bg-white p-4 md:col-span-2">
                <p className="text-xs font-semibold uppercase text-[#607891]">Affordability</p>
                <p className="mt-1 text-lg font-semibold text-[#18324b]">{affordability.score}</p>
                <p className="status-message">
                  {formatCurrency(affordability.netAvailableIncome)} available income, {formatRatio(affordability.rentToIncomeRatio)}.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <SelectField label="ID document" name="idDocumentStatus" value={form.idDocumentStatus} onChange={updateForm} options={RENTAL_APPLICATION_SELECT_OPTIONS.documentStatus} />
              <SelectField label="Proof of income" name="proofOfIncomeStatus" value={form.proofOfIncomeStatus} onChange={updateForm} options={RENTAL_APPLICATION_SELECT_OPTIONS.documentStatus} />
              <SelectField label="Bank statements" name="bankStatementsStatus" value={form.bankStatementsStatus} onChange={updateForm} options={RENTAL_APPLICATION_SELECT_OPTIONS.documentStatus} />
              <SelectField label="Reference consent" name="referenceConsentStatus" value={form.referenceConsentStatus} onChange={updateForm} options={RENTAL_APPLICATION_SELECT_OPTIONS.documentStatus} />
              <SelectField label="Credit check" name="creditCheckStatus" value={form.creditCheckStatus} onChange={updateForm} options={RENTAL_APPLICATION_SELECT_OPTIONS.creditCheckStatus} />
              <SelectField label="Application status" name="applicationStatus" value={form.applicationStatus} onChange={updateForm} options={RENTAL_APPLICATION_SELECT_OPTIONS.applicationStatus} />
              <SelectField label="Landlord approval" name="landlordApprovalStatus" value={form.landlordApprovalStatus} onChange={updateForm} options={RENTAL_APPLICATION_SELECT_OPTIONS.landlordApprovalStatus} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="form-field">
                <span>Current landlord reference</span>
                <input {...formField('currentLandlordName', form.currentLandlordName, updateForm)} placeholder="Name" />
              </label>
              <label className="form-field">
                <span>Current landlord phone</span>
                <input {...formField('currentLandlordPhone', form.currentLandlordPhone, updateForm)} placeholder="+27..." />
              </label>
              <label className="form-field">
                <span>Employer reference</span>
                <input {...formField('employerReferenceName', form.employerReferenceName, updateForm)} placeholder="Name" />
              </label>
              <label className="form-field">
                <span>Employer reference phone</span>
                <input {...formField('employerReferencePhone', form.employerReferencePhone, updateForm)} placeholder="+27..." />
              </label>
              <label className="form-field md:col-span-2">
                <span>Application notes</span>
                <textarea rows={4} {...formField('notes', form.notes, updateForm)} placeholder="Applicant context, document follow-ups, landlord comments" />
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
                Required: rental listing, tenant name, tenant contact, and income.
              </p>
              <button type="submit" className="ui-pill-button ui-pill-button-active" disabled={!canSubmit}>
                {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                Save application
              </button>
            </div>
          </form>

          <aside className="grid content-start gap-4">
            <div className="ui-panel ui-panel-body">
              <p className="text-xs font-semibold uppercase text-[#607891]">Application queue</p>
              <h2 className="mt-1 text-lg font-semibold text-[#18324b]">{applications.length} applications</h2>
              <p className="status-message mt-2">
                Stored as rental application activity against the selected rental listing until dedicated tables are introduced.
              </p>
            </div>
            {loading ? (
              <div className="ui-panel ui-panel-body flex items-center gap-3 text-sm font-semibold text-[#42617f]">
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Loading applications
              </div>
            ) : applications.length ? (
              applications.map((application) => <ApplicationCard key={application.id || application.reference} application={application} />)
            ) : (
              <div className="rounded-[8px] border border-dashed border-[#dbe6f2] bg-white p-5 text-sm text-[#607891]">
                No tenant applications captured yet.
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  )
}
