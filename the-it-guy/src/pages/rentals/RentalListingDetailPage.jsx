import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Eye,
  Home,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  getRentalListingForAgent,
  prepareRentalProperty24PublishRequest,
  previewRentalProperty24Listing,
  updateRentalListingDraft,
} from '../../services/rentals/rentalListingDraftService'
import {
  RENTAL_LISTING_INITIAL_FORM,
  RENTAL_SELECT_OPTIONS,
} from '../../services/rentals/rentalListingDraftModel'
import {
  buildRentalListingEditForm,
  validateRentalListingEditForm,
} from '../../services/rentals/rentalListingEditModel'
import {
  buildRentalListingDetailPath,
  buildRentalListingDetailView,
  resolveRentalListingDetailTab,
} from '../../services/rentals/rentalListingDetailModel'
import {
  buildRentalListingQueryOptions,
  resolveRentalWorkspaceScope,
} from '../../services/rentals/rentalWorkspaceScope'

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
    ...details.dataBlockers.map((item) => ({ key: `data:${item}`, label: formatProperty24PreviewBlocker(item), detail: 'Fix this rental listing field before Property24 can accept it.' })),
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
  onPreparePublish,
  preparingPublish,
  publishError,
  property24Preview,
  checkingProperty24,
  property24PreviewError,
  onCheckProperty24,
}) {
  const readiness = detail.property24Readiness
  const previewDetails = getProperty24PreviewDetails(property24Preview)
  const previewStatus = getProperty24ReadinessStatus(property24Preview)
  const previewIssues = getProperty24PreviewIssues(property24Preview)
  const payload = previewDetails.redactedPayload || readiness?.payloadPreview || {}
  const localBlockers = readiness?.blockers || []
  const blockers = property24Preview ? previewIssues : localBlockers
  const canPrepareHandoff = Boolean(property24Preview && previewDetails.canSubmit && readiness.readyToPublish)
  const statusToneClasses = previewStatus.tone === 'success'
    ? 'border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]'
    : previewStatus.tone === 'warning'
      ? 'border-[#f0d5b5] bg-[#fffaf2] text-[#9f5f15]'
      : 'border-[#dbe6f2] bg-white text-[#42617f]'
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <DetailPanel eyebrow="Syndication" title="Property24 Rental Readiness">
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
              onClick={onPreparePublish}
              disabled={!canPrepareHandoff || preparingPublish}
              title={canPrepareHandoff ? 'Prepare internal Property24 rental handoff' : 'Run a clean Property24 readiness check before preparing a handoff'}
            >
              {preparingPublish ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              Prepare Handoff
            </button>
          </div>
        </div>

        {property24PreviewError ? (
          <p className="mb-4 rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{property24PreviewError}</p>
        ) : null}

        {publishError ? (
          <p className="mb-4 rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{publishError}</p>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
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
            detail={property24Preview ? `${previewDetails.imagesLoaded} photos checked, ${previewDetails.imagesFailed} errors` : 'Run backend check before handoff'}
            icon={<ShieldCheck size={18} aria-hidden="true" />}
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
              {property24Preview ? 'The backend preview did not find any Property24 blockers.' : 'Local rental readiness looks complete. Run the backend check before handoff.'}
            </p>
          )}
        </DetailPanel>

        <DetailPanel eyebrow={property24Preview ? 'Backend payload preview' : 'Local payload preview'} title="Listing Service v53">
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
  return (
    <form onSubmit={onSubmit} className="ui-panel ui-panel-body grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[#607891]">Edit listing facts</p>
          <h2 className="text-lg font-semibold text-[#18324b]">Rental Listing Details</h2>
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

      <div className="grid gap-4 md:grid-cols-3">
        <label className="form-field md:col-span-2">
          <span>Listing title</span>
          <input {...formField('title', form.title, onChange)} placeholder="2 bedroom apartment in Green Point" />
        </label>
        <label className="form-field">
          <span>Property type</span>
          <input {...formField('propertyType', form.propertyType, onChange)} />
        </label>
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
          <span>Monthly rent</span>
          <input type="number" min="0" {...formField('monthlyRent', form.monthlyRent, onChange)} />
        </label>
        <label className="form-field">
          <span>Deposit</span>
          <input type="number" min="0" {...formField('depositAmount', form.depositAmount, onChange)} />
        </label>
        <label className="form-field">
          <span>Available from</span>
          <input type="date" {...formField('availableFrom', form.availableFrom, onChange)} />
        </label>
        <label className="form-field">
          <span>Lease period months</span>
          <input type="number" min="1" {...formField('leasePeriodMonths', form.leasePeriodMonths, onChange)} />
        </label>
        <label className="form-field">
          <span>Deposit multiplier</span>
          <input type="number" min="0" step="0.5" {...formField('depositMultiplier', form.depositMultiplier, onChange)} />
        </label>
        <label className="form-field">
          <span>Occupation date</span>
          <input type="date" {...formField('occupationDate', form.occupationDate, onChange)} />
        </label>
        <SelectField label="Lease period type" name="leasePeriodType" value={form.leasePeriodType} onChange={onChange} options={RENTAL_SELECT_OPTIONS.leasePeriodType} />
        <label className="form-field">
          <span>Bedrooms</span>
          <input type="number" min="0" {...formField('bedrooms', form.bedrooms, onChange)} />
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
        <label className="form-field md:col-span-2">
          <span>Deposit requirements</span>
          <input {...formField('depositRequirement', form.depositRequirement, onChange)} />
        </label>
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

function RentalTabContent({
  activeTab,
  detail,
  onPreparePublish,
  preparingPublish,
  publishError,
  property24Preview,
  checkingProperty24,
  property24PreviewError,
  onCheckProperty24,
  onOpenSyndication,
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
    const previewStatus = getProperty24ReadinessStatus(property24Preview)
    const statusToneClasses = previewStatus.tone === 'success'
      ? 'border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]'
      : previewStatus.tone === 'warning'
        ? 'border-[#f0d5b5] bg-[#fffaf2] text-[#9f5f15]'
        : 'border-[#dbe6f2] bg-white text-[#42617f]'
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <DetailPanel eyebrow="Marketing" title="Marketing Approval">
          <DetailRow label="Approval status" value={detail.marketingApprovalStatusLabel} />
          <DetailRow label="Property24 status" value={detail.property24StatusLabel} />
        </DetailPanel>
        <DetailPanel eyebrow="Property24" title="Rental Readiness">
          <div className="flex items-start gap-3 rounded-[8px] border border-[#dbe6f2] bg-[#fbfdff] p-4">
            <img src="/lead-sources/property24.png" alt="Property24" className="h-12 w-16 shrink-0 object-contain" />
            <div className="min-w-0 flex-1">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusToneClasses}`}>
                {previewStatus.tone === 'success' ? <CheckCircle2 size={14} aria-hidden="true" /> : previewStatus.tone === 'warning' ? <CircleAlert size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
                {previewStatus.label}
              </span>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#607891]">{previewStatus.detail}</p>
              {property24PreviewError ? <p className="mt-2 text-sm font-semibold text-[#9f3131]">{property24PreviewError}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="ui-pill-button ui-pill-button-active" onClick={onCheckProperty24} disabled={checkingProperty24}>
                  {checkingProperty24 ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  Check Readiness
                </button>
                <button type="button" className="ui-pill-button" onClick={onOpenSyndication}>
                  Open Syndication
                </button>
              </div>
            </div>
          </div>
        </DetailPanel>
      </div>
    )
  }
  if (activeTab === 'syndication') {
    return (
      <Property24SyndicationPanel
        detail={detail}
        onPreparePublish={onPreparePublish}
        preparingPublish={preparingPublish}
        publishError={publishError}
        property24Preview={property24Preview}
        checkingProperty24={checkingProperty24}
          property24PreviewError={property24PreviewError}
          onCheckProperty24={onCheckProperty24}
          onOpenSyndication={onOpenSyndication}
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
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState(() => ({ ...RENTAL_LISTING_INITIAL_FORM }))
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [preparingPublish, setPreparingPublish] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [property24Preview, setProperty24Preview] = useState(null)
  const [checkingProperty24, setCheckingProperty24] = useState(false)
  const [property24PreviewError, setProperty24PreviewError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const detail = useMemo(() => (listing ? buildRentalListingDetailView(listing) : null), [listing])
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

  function openEditPanel() {
    if (listing) setEditForm(buildRentalListingEditForm(listing))
    setEditError('')
    setSuccessMessage('')
    setEditOpen(true)
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

  async function handlePrepareProperty24Publish() {
    const previewDetails = getProperty24PreviewDetails(property24Preview)
    if (!property24Preview || !previewDetails.canSubmit || !detail?.property24Readiness?.readyToPublish) {
      setPublishError('Run a clean Property24 readiness check before preparing the internal handoff.')
      return
    }
    try {
      setPreparingPublish(true)
      setPublishError('')
      setSuccessMessage('')
      await prepareRentalProperty24PublishRequest(listingId, {
        organisationId,
        assignedAgentId,
        performedBy: assignedAgentId,
        requestedBy: assignedAgentId,
      })
      setSuccessMessage('Property24 rental publish request was prepared for backend handoff.')
      await loadListing()
    } catch (publishRequestError) {
      setPublishError(publishRequestError?.message || 'Unable to prepare the Property24 rental publish request.')
    } finally {
      setPreparingPublish(false)
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
            <button type="button" className="ui-pill-button ui-pill-button-active" onClick={openEditPanel}>
              <Pencil size={16} aria-hidden="true" />
              Edit Details
            </button>
          </div>
        </header>

        {successMessage ? (
          <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">
            <CheckCircle2 size={16} aria-hidden="true" />
            {successMessage}
          </p>
        ) : null}

        {editOpen ? (
          <RentalListingEditPanel
            form={editForm}
            onChange={updateEditForm}
            onCancel={() => {
              setEditOpen(false)
              setEditError('')
              if (listing) setEditForm(buildRentalListingEditForm(listing))
            }}
            onSubmit={handleEditSubmit}
            saving={savingEdit}
            canSubmit={canSaveEdit}
            error={editError}
          />
        ) : null}

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

        <RentalTabContent
          activeTab={activeTab}
          detail={detail}
          onPreparePublish={handlePrepareProperty24Publish}
          preparingPublish={preparingPublish}
          publishError={publishError}
          property24Preview={property24Preview}
          checkingProperty24={checkingProperty24}
          property24PreviewError={property24PreviewError}
          onCheckProperty24={handleCheckProperty24Readiness}
          onOpenSyndication={() => navigate(buildRentalListingDetailPath(row.id, 'syndication'))}
        />
      </div>
    </section>
  )
}
