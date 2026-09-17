import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Eye,
  Home,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
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
  previewRentalProperty24Listing,
  publishRentalProperty24Listing,
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
  publishing,
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
  const resolvedMapping = property24Preview?.mapping || {}
  const localBlockers = readiness?.blockers || []
  const blockers = property24Preview ? previewIssues : localBlockers
  const canPublish = Boolean(property24Preview && previewDetails.canSubmit)
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
              onClick={onPublish}
              disabled={!canPublish || publishing}
              title={canPublish ? 'Publish this rental using its assigned Property24 agent mapping' : 'Run a clean Property24 readiness check before publishing'}
            >
              {publishing ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              Publish to Property24
            </button>
          </div>
        </div>

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

function RentalOverview({ detail, onOpenMarketing }) {
  const row = detail.row
  const readiness = detail.readinessItems || []
  const completed = readiness.filter((item) => item.complete).length
  const pipeline = [
    { label: 'Applications', value: row.applicationCount || 0, fill: 100 },
    { label: 'Screening', value: 0, fill: 0 },
    { label: 'Approved', value: 0, fill: 0 },
  ]
  return (
    <section className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FactCard label="Monthly rent" value={formatCurrency(row.monthlyRent)} detail="Rental terms" icon={<Home size={18} aria-hidden="true" />} />
        <FactCard label="Available" value={formatDate(row.availableFrom)} detail={row.leasePeriodMonths ? `${row.leasePeriodMonths} month lease` : 'Lease period pending'} icon={<CalendarDays size={18} aria-hidden="true" />} />
        <FactCard label="Landlord" value={row.landlordName || 'Not captured'} detail={row.landlordContact || 'Contact pending'} icon={<Users size={18} aria-hidden="true" />} />
        <FactCard label="Readiness" value={`${detail.readinessPercent}%`} detail={`${detail.completedReadinessCount}/${detail.totalReadinessCount} checks complete`} icon={<BadgeCheck size={18} aria-hidden="true" />} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Applications', value: row.applicationCount || 0, meta: 'Interested tenants' },
          { label: 'Available from', value: formatDate(row.availableFrom), meta: 'Occupation date' },
          { label: 'Monthly rent', value: formatCurrency(row.monthlyRent), meta: 'Advertised rental' },
          { label: 'Lease term', value: row.leasePeriodMonths ? `${row.leasePeriodMonths} months` : '—', meta: 'Proposed lease period' },
          { label: 'Property24', value: detail.property24StatusLabel, meta: 'Listing channel status' },
        ].map((card) => <article key={card.label} className="flex min-h-[132px] flex-col justify-between rounded-[20px] border border-[#dde4ee] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"><p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{card.label}</p><p className="text-[1.25rem] font-semibold text-[#142132]">{card.value}</p><p className="text-sm text-[#607387]">{card.meta}</p></article>)}
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"><h3 className="text-[1rem] font-semibold text-[#142132]">Listing readiness</h3><p className="mt-1 text-sm text-[#607387]">What the landlord listing still needs before it can go live.</p><div className="mt-5 space-y-3">{readiness.map((item) => <div key={item.key} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-2.5"><span className="text-sm font-medium text-[#22374d]">{item.label}</span><span className={`text-xs font-semibold ${item.complete ? 'text-[#1f7d44]' : 'text-[#9a5b13]'}`}>{item.complete ? 'Complete' : 'Needs attention'}</span></div>)}</div></article>
        <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"><h3 className="text-[1rem] font-semibold text-[#142132]">Tenant journey</h3><p className="mt-1 text-sm text-[#607387]">How prospective tenants are progressing through the rental pipeline.</p><div className="mt-5 space-y-3">{pipeline.map((step) => <div key={step.label} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3.5"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-[#22374d]">{step.label}</span><span className="text-sm font-semibold text-[#142132]">{step.value}</span></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-[#dbe6f2]"><div className="h-full rounded-full bg-[#1f4f78]" style={{ width: `${step.fill}%` }} /></div></div>)}</div></article>
        <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"><h3 className="text-[1rem] font-semibold text-[#142132]">Rental pricing</h3><p className="mt-1 text-sm text-[#607387]">Current advertised monthly rent and rental terms.</p><div className="mt-5 space-y-4"><div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-[#22374d]">Monthly rent</span><span className="text-sm font-semibold text-[#142132]">{formatCurrency(row.monthlyRent)}</span></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-[#dbe6f2]"><div className="h-full w-full rounded-full bg-[#1f4f78]" /></div></div><div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4"><p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Deposit</p><p className="mt-2 text-[1.2rem] font-semibold text-[#142132]">{formatCurrency(row.depositAmount)}</p><p className="mt-1 text-sm text-[#607387]">{row.furnishedStatus || 'Rental terms pending'}</p></div></div></article>
      </section>

      <section className="grid gap-5 xl:grid-cols-2"><article className="flex flex-col rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"><p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Next best action</p><h3 className="mt-2 text-[1.02rem] font-semibold text-[#142132]">{row.nextAction || 'Prepare rental marketing'}</h3><p className="mt-2 text-sm leading-6 text-[#607387]">{completed} of {readiness.length} listing readiness checks are complete. Use Marketing to prepare the public listing and Property24 publishing.</p><div className="mt-5"><button type="button" className="ui-pill-button ui-pill-button-active" onClick={onOpenMarketing}>Open Marketing</button></div></article><article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"><h3 className="text-[1rem] font-semibold text-[#142132]">Landlord and listing activity</h3><p className="mt-1 text-sm text-[#607387]">Latest rental listing updates and required landlord actions.</p><div className="mt-4 rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3.5"><p className="text-sm font-semibold text-[#22374d]">Rental listing ready for review</p><p className="mt-1 text-sm text-[#607387]">Complete any outstanding listing details, then publish through the Marketing workspace.</p></div></article></section>
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
    const readyItems = (detail.readinessItems || []).filter((item) => item.complete).length
    const readinessPercent = detail.readinessPercent || 0
    const channelLive = ['published', 'live', 'active', 'on_portal'].includes(String(row.property24Status || '').toLowerCase()) ? 1 : 0
    const remainingReadinessCount = Math.max(0, (detail.totalReadinessCount || 0) - readyItems)
    return (
      <section className="space-y-5">
        <section className="overflow-hidden rounded-[22px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]"><div className="grid sm:grid-cols-3"><div className="border-b border-[#edf2f7] p-5 sm:border-b-0 sm:border-r"><p className="text-2xl font-semibold text-[#142132]">{readinessPercent}%</p><p className="text-sm font-semibold text-[#607387]">Listing readiness</p><button type="button" onClick={onOpenEdit} className="mt-1 text-xs font-semibold text-[#1f4f78]">View checklist</button></div><div className="border-b border-[#edf2f7] p-5 sm:border-b-0 sm:border-r"><p className="text-2xl font-semibold text-[#142132]">{channelLive} / 1</p><p className="text-sm font-semibold text-[#607387]">Channels live</p><button type="button" onClick={onCheckProperty24} className="mt-1 text-xs font-semibold text-[#1f4f78]">View channels</button></div><div className="p-5"><p className="text-2xl font-semibold text-[#142132]">{row.property24ExpiryDate ? formatDate(row.property24ExpiryDate) : '—'}</p><p className="text-sm font-semibold text-[#607387]">Last synced</p></div></div>{remainingReadinessCount ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf2f7] bg-[#fffaf0] px-5 py-3 text-sm font-semibold text-[#8a5b13]"><span>Complete {remainingReadinessCount} remaining item{remainingReadinessCount === 1 ? '' : 's'} before publishing.</span><button type="button" onClick={onOpenEdit} className="rounded-lg border border-[#f1dfb8] bg-white px-3 py-2 text-xs font-semibold">View readiness items</button></div> : null}</section>
        <section className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.8fr)]"><article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]"><div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-[#142132]">Listing Content</h3><p className="mt-1 text-sm text-[#607387]">Marketing-facing copy tenants will see.</p></div><button type="button" className="ui-pill-button" onClick={onOpenEdit}>Edit property details</button></div><div className="mt-5 grid gap-4"><div><p className="text-sm font-semibold text-[#2d445e]">Headline</p><p className="mt-2 rounded-[12px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-3 text-sm text-[#22374d]">{row.title}</p></div><div><p className="text-sm font-semibold text-[#2d445e]">Description</p><p className="mt-2 min-h-36 rounded-[12px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-3 text-sm leading-6 text-[#607387]">{detail.listing?.description || 'Add a public rental description for prospective tenants.'}</p></div></div></article><article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]"><div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-[#142132]">Media</h3><p className="mt-1 text-sm text-[#607387]">Control what tenants see across your marketing channels.</p></div><button type="button" className="ui-pill-button" onClick={onOpenEdit}>Edit Media</button></div><div className="mt-5 flex gap-3 overflow-x-auto pb-2"><div className="w-[440px] max-w-[68vw] shrink-0 overflow-hidden rounded-[14px] border border-[#1f4f78] bg-white"><div className="relative h-[184px]"><RentalListingImage src={row.imageUrl} title={row.title} /><span className="absolute left-2 top-2 rounded-full bg-[#123955] px-2 py-1 text-[0.62rem] font-semibold text-white">Cover</span></div><div className="h-11 border-t border-[#edf2f7] px-3 py-3 text-xs font-semibold text-[#607387]">Cover selected</div></div><button type="button" onClick={onOpenEdit} className="grid h-[229px] w-[150px] shrink-0 place-items-center rounded-[14px] border border-dashed border-[#c9d8e8] bg-[#fbfdff] text-xs font-semibold text-[#5f7894]"><span><Home className="mx-auto mb-1" size={18} />Add Photos</span></button></div><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-[#d8eddf] bg-[#ecfaf1] px-3 py-1 text-xs font-semibold text-[#1f7d44]">{row.imageUrl ? '1 photo' : 'No photos'}</span><span className="rounded-full border border-[#d8eddf] bg-[#ecfaf1] px-3 py-1 text-xs font-semibold text-[#1f7d44]">Cover selected</span><span className="rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#607387]">Floor plan missing</span></div></article></section>
        <article className="overflow-hidden rounded-[22px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf2f7] p-5"><div><h3 className="text-base font-semibold text-[#142132]">Listing Channels</h3><p className="mt-1 text-sm text-[#607387]">Manage where this rental is advertised.</p></div><button type="button" className="ui-pill-button" onClick={onCheckProperty24} disabled={checkingProperty24}>{checkingProperty24 ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}Manage</button></div><div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#edf2f7] p-5"><div><p className="font-semibold text-[#142132]">Property24</p><p className="mt-1 text-sm text-[#607387]">South Africa's property portal</p></div><span className="text-sm font-semibold text-[#607387]">{previewStatus.label}</span><div className="flex gap-2"><button type="button" className="ui-pill-button" onClick={onCheckProperty24} disabled={checkingProperty24}>Preview readiness</button><button type="button" className="ui-pill-button ui-pill-button-active" onClick={onPublish} disabled={publishing || !getProperty24PreviewDetails(property24Preview).canSubmit}>{publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Publish</button></div></div><WebsiteListingPublicationPanel variant="channel" listingId={detail.listing?.id || row.id} listingTitle={row.title} onPrepare={onPrepareWebsitePublication} /></article>
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
        <header className="relative isolate min-h-[330px] overflow-hidden rounded-[24px] border border-[#d7e1eb] bg-[#153751] shadow-[0_12px_28px_rgba(15,23,42,0.12)] sm:min-h-[360px]">
          <div className="absolute inset-0 -z-20">
            <RentalListingImage src={row.imageUrl} title={row.title} />
          </div>
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(8,35,56,0.94)_0%,rgba(13,49,75,0.83)_46%,rgba(20,55,81,0.42)_100%)]" />
          <div className="flex min-h-[330px] flex-col justify-between gap-8 p-5 sm:min-h-[360px] sm:p-8 lg:p-10">
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
            <div className="max-w-5xl">
              <h1 className="text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl lg:text-[2.75rem]">{row.title}</h1>
              <p className="mt-3 text-base font-medium text-white/85 sm:text-lg">{[row.address, row.location].filter(Boolean).join(', ') || 'Location pending'}</p>
              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold text-white/85 sm:text-base">
                <span>{row.propertyType || 'Rental property'}</span>
                {row.bedrooms ? <><span className="text-white/50">•</span><span>{row.bedrooms} {Number(row.bedrooms) === 1 ? 'bed' : 'beds'}</span></> : null}
                {row.bathrooms ? <><span className="text-white/50">•</span><span>{row.bathrooms} {Number(row.bathrooms) === 1 ? 'bath' : 'baths'}</span></> : null}
                {row.parkingBays ? <><span className="text-white/50">•</span><span>{row.parkingBays} parking {Number(row.parkingBays) === 1 ? 'bay' : 'bays'}</span></> : null}
              </div>
              <p className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">{formatCurrency(row.monthlyRent)} <span className="text-base font-medium text-white/75 sm:text-lg">per month</span></p>
            </div>
          </div>
        </header>

        {successMessage ? (
          <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">
            <CheckCircle2 size={16} aria-hidden="true" />
            {successMessage}
          </p>
        ) : null}

        <ListingAgentReassignmentPanel
          listingId={row.id}
          listing={listing}
          listingType="rental"
          onReassigned={async () => {
            await loadListing()
            setSuccessMessage('Rental listing agent reassigned successfully.')
          }}
        />

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

        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)]" data-testid="rental-listing-shared-workspace-tabs">
          <ListingWorkspaceTabs
            className="rounded-[18px] border border-[#e1e8ef] bg-[#fbfdff] p-1.5 [&_button]:rounded-[13px] [&_button]:border-b-0 [&_button]:px-5 [&_button]:text-center [&_button]:text-[#64788f] sm:[&_button]:flex-1 [&_button[aria-selected=true]]:bg-[#153f60] [&_button[aria-selected=true]]:text-white [&_button[aria-selected=true]]:shadow-[0_5px_14px_rgba(15,54,82,0.18)]"
            tabs={rentalWorkspaceTabs}
            activeTab={activeRentalWorkspaceTab}
            onTabChange={openRentalListingWorkspaceTab}
            ariaLabel="Rental listing workspace sections"
          />
        </section>

        <RentalTabContent
          activeTab={activeTab}
          detail={detail}
          onPublish={handleProperty24Publish}
          publishing={publishing}
          publishError={publishError}
          property24Preview={property24Preview}
          checkingProperty24={checkingProperty24}
          property24PreviewError={property24PreviewError}
          onCheckProperty24={handleCheckProperty24Readiness}
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
