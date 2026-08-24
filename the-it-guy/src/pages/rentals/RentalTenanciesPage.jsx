import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileSignature, KeyRound, Loader2, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  listRentalApplicationsForAgent,
} from '../../services/rentals/rentalApplicationDraftService'
import { listRentalListingsForAgent } from '../../services/rentals/rentalListingDraftService'
import {
  createRentalLeaseWorkflow,
  listRentalLeaseWorkflowsForAgent,
} from '../../services/rentals/rentalLeaseWorkflowService'
import {
  buildRentalLeaseInitialFormFromApplication,
  getRentalLeaseStatusLabel,
  RENTAL_LEASE_INITIAL_FORM,
  RENTAL_LEASE_SELECT_OPTIONS,
  validateRentalLeaseWorkflowForm,
} from '../../services/rentals/rentalLeaseWorkflowModel'
import {
  buildRentalListingQueryOptions,
  resolveRentalWorkspaceScope,
} from '../../services/rentals/rentalWorkspaceScope'

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

function getListingTitle(listing = {}) {
  return normalizeText(listing.listingTitle || listing.title || listing.listingPublicationData?.title) || 'Rental listing'
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

function LeaseCard({ lease }) {
  const activeTone = ['fully_signed', 'active'].includes(lease.leaseStatus)
    ? 'border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]'
    : lease.leaseStatus === 'cancelled'
      ? 'border-[#f2c6c6] bg-[#fff7f7] text-[#9f3131]'
      : 'border-[#dbe6f2] bg-white text-[#42617f]'
  return (
    <article className="rounded-[8px] border border-[#dbe6f2] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[#607891]">{lease.reference || 'Rental lease'}</p>
          <h3 className="mt-1 text-base font-semibold text-[#18324b]">{lease.tenantName || 'Tenant'}</h3>
          <p className="mt-1 text-sm text-[#607891]">{lease.listingTitle || 'Rental listing'}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${activeTone}`}>
          {getRentalLeaseStatusLabel('leaseStatus', lease.leaseStatus) || 'Draft'}
        </span>
      </div>
      <div className="mt-4 grid gap-3 text-sm text-[#203a54] sm:grid-cols-3">
        <span><strong>{formatCurrency(lease.monthlyRent)}</strong><br />Monthly rent</span>
        <span><strong>{getRentalLeaseStatusLabel('signatureStatus', lease.signatureStatus) || 'Not started'}</strong><br />Signature</span>
        <span><strong>{getRentalLeaseStatusLabel('depositStatus', lease.depositStatus) || 'Not requested'}</strong><br />Deposit tracking</span>
      </div>
      <div className="mt-3 grid gap-3 text-sm text-[#203a54] sm:grid-cols-3">
        <span><strong>{lease.occupationDate || 'Pending'}</strong><br />Occupation</span>
        <span><strong>{getRentalLeaseStatusLabel('handoverStatus', lease.handoverStatus) || 'Not started'}</strong><br />Handover</span>
        <span><strong>{getRentalLeaseStatusLabel('checklistStatus', lease.conditionReportStatus) || 'Not started'}</strong><br />Condition report</span>
      </div>
    </article>
  )
}

export default function RentalTenanciesPage() {
  const workspaceContext = useWorkspace()
  const rentalScope = useMemo(() => resolveRentalWorkspaceScope(workspaceContext), [workspaceContext])
  const organisationId = rentalScope.organisationId
  const assignedAgentId = rentalScope.assignedAgentId
  const [form, setForm] = useState(() => ({ ...RENTAL_LEASE_INITIAL_FORM }))
  const [listings, setListings] = useState([])
  const [applications, setApplications] = useState([])
  const [leases, setLeases] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const selectedListing = useMemo(
    () => listings.find((listing) => normalizeText(listing.id) === normalizeText(form.listingId)) || null,
    [form.listingId, listings],
  )
  const selectedApplication = useMemo(
    () => applications.find((application) => normalizeText(application.reference) === normalizeText(form.applicationReference)) || null,
    [applications, form.applicationReference],
  )
  const validationErrors = useMemo(() => validateRentalLeaseWorkflowForm(form), [form])
  const canSubmit = validationErrors.length === 0 && !saving && Boolean(selectedListing)

  const updateForm = useCallback((name, value) => {
    setForm((current) => ({ ...current, [name]: value }))
    setError('')
    setSuccess('')
  }, [])

  const applyApplicationToForm = useCallback((application, listingRows = listings) => {
    if (!application) return
    const listing = listingRows.find((row) => normalizeText(row.id) === normalizeText(application.listingId)) || {}
    setForm(buildRentalLeaseInitialFormFromApplication(application, listing))
    setError('')
    setSuccess('')
  }, [listings])

  const loadData = useCallback(async () => {
    if (!assignedAgentId || !organisationId) {
      setListings([])
      setApplications([])
      setLeases([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      const options = buildRentalListingQueryOptions(rentalScope)
      const [rentalListings, rentalApplications, rentalLeases] = await Promise.all([
        listRentalListingsForAgent(assignedAgentId, options),
        listRentalApplicationsForAgent(assignedAgentId, options),
        listRentalLeaseWorkflowsForAgent(assignedAgentId, options),
      ])
      setListings(rentalListings)
      setApplications(rentalApplications)
      setLeases(rentalLeases)
      setForm((current) => {
        if (current.applicationReference || !rentalApplications[0]) return current
        const listing = rentalListings.find((row) => normalizeText(row.id) === normalizeText(rentalApplications[0].listingId)) || {}
        return buildRentalLeaseInitialFormFromApplication(rentalApplications[0], listing)
      })
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load lease workflows.')
      setListings([])
      setApplications([])
      setLeases([])
    } finally {
      setLoading(false)
    }
  }, [assignedAgentId, organisationId, rentalScope])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) {
      setError(validationErrors[0] || 'Select an application and complete the lease fields.')
      return
    }
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      const created = await createRentalLeaseWorkflow(form, selectedListing, selectedApplication || {}, {
        assignedAgentId,
        performedBy: assignedAgentId,
      })
      setSuccess(`${created.lease.tenantName || 'Tenant'} lease workflow captured.`)
      setLeases((current) => [created.lease, ...current])
      void loadData()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to capture the lease workflow.')
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
              <FileSignature size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase text-[#607891]">Rentals Workspace</p>
              <h1 className="text-2xl font-semibold text-[#18324b]">Leases & Handover</h1>
              <p className="status-message">
                Generate lease workflow records, track signature status, deposit proof, occupation, and check-in.
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
                <p className="text-xs font-semibold uppercase text-[#607891]">Phase 6 Capture</p>
                <h2 className="text-lg font-semibold text-[#18324b]">Create lease workflow</h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#dbe6f2] px-3 py-1 text-xs font-semibold text-[#42617f]">
                <ShieldCheck size={14} aria-hidden="true" />
                No rental accounting
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="form-field md:col-span-2">
                <span>Tenant application</span>
                <select
                  value={form.applicationReference}
                  onChange={(event) => {
                    const application = applications.find((row) => normalizeText(row.reference) === event.target.value)
                    applyApplicationToForm(application)
                  }}
                  disabled={!applications.length}
                >
                  {applications.length ? applications.map((application) => (
                    <option key={application.reference || application.id} value={application.reference}>
                      {application.tenantName || 'Tenant'} - {application.listingTitle || 'Rental listing'}
                    </option>
                  )) : <option value="">Capture a tenant application first</option>}
                </select>
              </label>
              <label className="form-field">
                <span>Rental listing</span>
                <select {...formField('listingId', form.listingId, updateForm)} disabled={!listings.length}>
                  {listings.length ? listings.map((listing) => (
                    <option key={listing.id} value={listing.id}>{getListingTitle(listing)}</option>
                  )) : <option value="">No rental listings</option>}
                </select>
              </label>
              <label className="form-field">
                <span>Tenant name</span>
                <input {...formField('tenantName', form.tenantName, updateForm)} placeholder="Tenant full name" />
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
              <label className="form-field">
                <span>Lease start</span>
                <input type="date" {...formField('leaseStartDate', form.leaseStartDate, updateForm)} />
              </label>
              <label className="form-field">
                <span>Lease end</span>
                <input type="date" {...formField('leaseEndDate', form.leaseEndDate, updateForm)} />
              </label>
              <label className="form-field">
                <span>Occupation date</span>
                <input type="date" {...formField('occupationDate', form.occupationDate, updateForm)} />
              </label>
              <label className="form-field">
                <span>Lease period months</span>
                <input type="number" min="1" {...formField('leasePeriodMonths', form.leasePeriodMonths, updateForm)} />
              </label>
              <label className="form-field">
                <span>Monthly rent</span>
                <input type="number" min="0" {...formField('monthlyRent', form.monthlyRent, updateForm)} />
              </label>
              <label className="form-field">
                <span>Deposit amount</span>
                <input type="number" min="0" {...formField('depositAmount', form.depositAmount, updateForm)} />
              </label>
              <SelectField label="Lease status" name="leaseStatus" value={form.leaseStatus} onChange={updateForm} options={RENTAL_LEASE_SELECT_OPTIONS.leaseStatus} />
              <SelectField label="Signature status" name="signatureStatus" value={form.signatureStatus} onChange={updateForm} options={RENTAL_LEASE_SELECT_OPTIONS.signatureStatus} />
              <SelectField label="Deposit tracking" name="depositStatus" value={form.depositStatus} onChange={updateForm} options={RENTAL_LEASE_SELECT_OPTIONS.depositStatus} />
              <SelectField label="Handover" name="handoverStatus" value={form.handoverStatus} onChange={updateForm} options={RENTAL_LEASE_SELECT_OPTIONS.handoverStatus} />
              <SelectField label="Check-in" name="checkInStatus" value={form.checkInStatus} onChange={updateForm} options={RENTAL_LEASE_SELECT_OPTIONS.checklistStatus} />
              <SelectField label="Keys" name="keysStatus" value={form.keysStatus} onChange={updateForm} options={RENTAL_LEASE_SELECT_OPTIONS.checklistStatus} />
              <SelectField label="Condition report" name="conditionReportStatus" value={form.conditionReportStatus} onChange={updateForm} options={RENTAL_LEASE_SELECT_OPTIONS.checklistStatus} />
              <div className="rounded-[8px] border border-[#dbe6f2] bg-white p-4">
                <p className="text-xs font-semibold uppercase text-[#607891]">Deposit</p>
                <p className="mt-1 text-lg font-semibold text-[#18324b]">{formatCurrency(form.depositAmount)}</p>
                <p className="status-message">Proof tracking only. No rent collection or payout ledger is created.</p>
              </div>
            </div>

            <label className="form-field">
              <span>Lease and handover notes</span>
              <textarea rows={4} {...formField('notes', form.notes, updateForm)} placeholder="Signature notes, occupation logistics, handover checklist context" />
            </label>

            {error ? <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p> : null}
            {success ? (
              <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">
                <CheckCircle2 size={16} aria-hidden="true" />
                {success}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="status-message">
                Required: tenant, rental listing, lease start, occupation date, rent, and deposit status.
              </p>
              <button type="submit" className="ui-pill-button ui-pill-button-active" disabled={!canSubmit}>
                {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                Save lease workflow
              </button>
            </div>
          </form>

          <aside className="grid content-start gap-4">
            <div className="ui-panel ui-panel-body">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-white text-[#42617f]">
                  <KeyRound size={18} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase text-[#607891]">Lease workflow queue</p>
                  <h2 className="text-lg font-semibold text-[#18324b]">{leases.length} workflows</h2>
                </div>
              </div>
              <p className="status-message mt-3">
                These are lease and handover workflow records, not active rental management accounts.
              </p>
            </div>
            {loading ? (
              <div className="ui-panel ui-panel-body flex items-center gap-3 text-sm font-semibold text-[#42617f]">
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Loading lease workflows
              </div>
            ) : leases.length ? (
              leases.map((lease) => <LeaseCard key={lease.id || lease.reference} lease={lease} />)
            ) : (
              <div className="rounded-[8px] border border-dashed border-[#dbe6f2] bg-white p-5 text-sm text-[#607891]">
                No lease workflows captured yet.
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  )
}
