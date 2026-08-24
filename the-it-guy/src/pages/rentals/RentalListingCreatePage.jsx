import { useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Home, Loader2, Save, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { createRentalListingDraft } from '../../services/rentals/rentalListingDraftService'
import {
  buildRentalListingTitle,
  RENTAL_LISTING_INITIAL_FORM,
  RENTAL_SELECT_OPTIONS,
  validateRentalListingDraftForm,
} from '../../services/rentals/rentalListingDraftModel'
import { buildRentalListingCreateProgress } from '../../services/rentals/rentalListingCreateFlowModel'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'

const PROPERTY_TYPE_OPTIONS = Object.freeze([
  { value: 'Apartment', label: 'Apartment' },
  { value: 'House', label: 'House' },
  { value: 'Townhouse', label: 'Townhouse' },
  { value: 'Duplex', label: 'Duplex' },
  { value: 'Studio', label: 'Studio' },
])

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

function FormSection({ eyebrow, title, children }) {
  return (
    <section className="ui-panel ui-panel-body grid gap-4">
      <div>
        <p className="text-xs font-semibold uppercase text-[#607891]">{eyebrow}</p>
        <h2 className="text-lg font-semibold text-[#18324b]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

export default function RentalListingCreatePage() {
  const navigate = useNavigate()
  const workspaceContext = useWorkspace()
  const rentalScope = useMemo(() => resolveRentalWorkspaceScope(workspaceContext), [workspaceContext])
  const organisationId = rentalScope.organisationId
  const branchId = rentalScope.branchId
  const assignedAgentId = rentalScope.assignedAgentId
  const [form, setForm] = useState(() => ({ ...RENTAL_LISTING_INITIAL_FORM }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const progress = useMemo(() => buildRentalListingCreateProgress(form), [form])
  const validationErrors = useMemo(
    () => validateRentalListingDraftForm(form, { organisationId }),
    [form, organisationId],
  )
  const canSubmit = validationErrors.length === 0 && !saving

  function updateForm(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) {
      setError(validationErrors[0] || 'Complete the required rental listing fields.')
      return
    }
    try {
      setSaving(true)
      setError('')
      await createRentalListingDraft(form, {
        organisationId,
        branchId,
        assignedAgentId,
        performedBy: assignedAgentId,
      })
      navigate('/agent/rentals/listings', {
        state: { rentalListingCreatedTitle: buildRentalListingTitle(form) },
      })
    } catch (saveError) {
      setError(saveError?.message || 'Unable to create the rental listing draft.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-content">
      <form onSubmit={handleSubmit} className="ui-section-stack">
        <header className="ui-toolbar">
          <div className="ui-toolbar-group">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]">
              <Home size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase text-[#607891]">Rental listing</p>
              <h1 className="text-2xl font-semibold text-[#18324b]">Create Listing</h1>
              <p className="status-message">
                Capture the landlord, rental terms, inspection status, and marketing readiness needed for a Property24 rental draft.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="ui-pill-button" onClick={() => navigate('/agent/rentals/listings')}>
              <ArrowLeft size={16} aria-hidden="true" />
              Back to Listings
            </button>
            <button type="submit" className="ui-pill-button ui-pill-button-active" disabled={!canSubmit}>
              {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              Save Rental Draft
            </button>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-6">
            <FormSection eyebrow="Step 1" title="Property">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="form-field md:col-span-2">
                  <span>Listing title</span>
                  <input {...formField('title', form.title, updateForm)} placeholder="2 bedroom apartment in Green Point" />
                </label>
                <SelectField label="Property type" name="propertyType" value={form.propertyType} onChange={updateForm} options={PROPERTY_TYPE_OPTIONS} />
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
              </div>
            </FormSection>

            <FormSection eyebrow="Step 2" title="Landlord">
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
            </FormSection>

            <FormSection eyebrow="Step 3" title="Rental Terms">
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
                <SelectField label="Furnished" name="furnishedStatus" value={form.furnishedStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.furnishedStatus} />
                <SelectField label="Pets" name="petsPolicy" value={form.petsPolicy} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.petsPolicy} />
                <SelectField label="Utilities" name="utilitiesPolicy" value={form.utilitiesPolicy} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.utilitiesPolicy} />
                <SelectField label="Inspection" name="inspectionStatus" value={form.inspectionStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.inspectionStatus} />
              </div>
            </FormSection>

            <FormSection eyebrow="Step 4" title="Marketing Notes">
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
            </FormSection>
          </div>

          <aside className="grid content-start gap-4">
            <section className="ui-panel ui-panel-body">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-white text-[#42617f]">
                  <ShieldCheck size={18} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase text-[#607891]">Create readiness</p>
                  <h2 className="text-lg font-semibold text-[#18324b]">{progress.completedSteps}/{progress.totalSteps} sections</h2>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                {progress.steps.map((step) => (
                  <div key={step.key} className="flex items-center justify-between gap-3 rounded-[8px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2">
                    <span className="text-sm font-semibold text-[#18324b]">{step.label}</span>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${step.complete ? 'text-[#286b43]' : 'text-[#607891]'}`}>
                      {step.complete ? <CheckCircle2 size={14} aria-hidden="true" /> : null}
                      {step.completedCount}/{step.totalCount}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[8px] border border-[#dbe6f2] bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-[#607891]">Property24 rental draft</p>
              <p className="mt-2 text-sm text-[#607891]">
                Rental terms, landlord readiness, and marketing approval are captured before portal publishing.
              </p>
            </section>

            {error ? (
              <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p>
            ) : null}
          </aside>
        </div>
      </form>
    </section>
  )
}
