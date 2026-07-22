import { Building2, Check, CheckCircle2, ChevronDown, CircleAlert, Landmark, Pencil, Star } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { resolveLegalDocumentScenarioProfile } from '../../core/documents/legalDocumentScenarioProfile'
import { resolveLegalDocumentScenarioRequirements } from '../../core/documents/legalDocumentScenarioRequirements'
import Button from '../ui/Button'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function getAttorneyInitials(attorney = {}) {
  const source = normalizeText(attorney.companyName || attorney.contactPerson)
  const words = source.split(/\s+/).filter(Boolean)
  if (!words.length) return 'TA'
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}

function AttorneyAvatar({ attorney = {}, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'h-9 w-9 text-[0.68rem]' : 'h-11 w-11 text-xs'
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[#cfe0f2] bg-gradient-to-br from-[#edf5ff] to-[#e5f0fb] font-bold tracking-[0.04em] text-[#285b88] ${sizeClass}`}>
      {getAttorneyInitials(attorney)}
    </span>
  )
}

function getSourceModeLabel(sourceMode = '') {
  const key = normalizeKey(sourceMode)
  if (key === 'manual_details') return 'Manual details'
  if (key === 'send_onboarding') return 'Seller onboarding'
  if (key === 'saved_details') return 'Saved details'
  return 'Draft details'
}

function getFieldValue(draft = {}, field = '') {
  return normalizeText(draft?.[field])
}

function hasAnyDraftValue(draft = {}, fields = []) {
  return fields.some((field) => getFieldValue(draft, field))
}

function buildReadinessChecks(draft = {}) {
  const commissionStructure = normalizeKey(draft.commissionStructure || 'percentage') || 'percentage'
  return [
    {
      key: 'seller',
      label: 'Seller',
      complete: hasAnyDraftValue(draft, ['sellerFullName', 'sellerIdNumber']),
      missing: 'Name or ID',
    },
    {
      key: 'property',
      label: 'Property',
      complete: hasAnyDraftValue(draft, ['propertyAddress']),
      missing: 'Address',
    },
    {
      key: 'price',
      label: 'Price',
      complete: hasAnyDraftValue(draft, ['askingPrice']),
      missing: 'Asking price',
    },
    {
      key: 'dates',
      label: 'Dates',
      complete: Boolean(getFieldValue(draft, 'mandateStartDate') && getFieldValue(draft, 'mandateEndDate')),
      missing: 'Start and end',
    },
    {
      key: 'commission',
      label: 'Commission',
      complete: commissionStructure === 'fixed'
        ? hasAnyDraftValue(draft, ['commissionAmount'])
        : hasAnyDraftValue(draft, ['commissionPercent']),
      missing: commissionStructure === 'fixed' ? 'Fixed amount' : 'Percentage',
    },
    {
      key: 'transfer_attorney',
      label: 'Transfer attorney',
      complete: Boolean(
        getFieldValue(draft, 'transferAttorneyPreferredPartnerId') ||
        draft.transferAttorneySelectionDeferred,
      ),
      missing: 'Select or defer',
    },
  ]
}

function formatMoney(value = '') {
  const number = Number(normalizeText(value))
  if (!Number.isFinite(number) || number <= 0) return ''
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(number)
}

function formatDateLabel(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function buildMandateSnapshot(draft = {}) {
  const commissionStructure = normalizeKey(draft.commissionStructure || 'percentage') || 'percentage'
  const commissionValue = commissionStructure === 'fixed'
    ? formatMoney(draft.commissionAmount)
    : normalizeText(draft.commissionPercent)
      ? `${normalizeText(draft.commissionPercent)}%`
      : ''
  const period = [formatDateLabel(draft.mandateStartDate), formatDateLabel(draft.mandateEndDate)].filter(Boolean).join(' to ')
  return [
    {
      key: 'seller',
      label: 'Seller',
      value: normalizeText(draft.sellerFullName) || 'Needs seller update',
    },
    {
      key: 'property',
      label: 'Property',
      value: normalizeText(draft.propertyAddress) || 'Needs property update',
    },
    {
      key: 'mandate',
      label: 'Mandate',
      value: [
        normalizeText(draft.mandateType || 'sole').replace(/_/g, ' '),
        period,
      ].filter(Boolean).join(' · ') || 'Needs mandate dates',
    },
    {
      key: 'commission',
      label: 'Commission',
      value: commissionValue || 'Needs commission',
    },
  ]
}

export default function MandateDraftIntakePanel({
  draft = {},
  sourceMode = '',
  documentStart = '',
  preferredAttorneys = [],
  preferredAttorneysLoading = false,
  preferredAttorneysError = '',
  selectedAttorneyId = '',
  attorneySelectionDeferred = false,
  onAttorneyChange = null,
  onAttorneySelectionDeferredChange = null,
  onConfirm = null,
  onEditSellerDetails = null,
}) {
  const [attorneyMenuOpen, setAttorneyMenuOpen] = useState(false)
  const attorneyMenuRef = useRef(null)
  const readinessChecks = buildReadinessChecks(draft)
  const missingChecks = readinessChecks.filter((item) => !item.complete)
  const completedCheckCount = readinessChecks.length - missingChecks.length
  const snapshotRows = buildMandateSnapshot(draft)
  const sourceLabel = getSourceModeLabel(sourceMode)
  const hasManualStart = normalizeKey(sourceMode) === 'manual_details'
  const startLabel = normalizeText(documentStart).replace(/_/g, ' ') || 'seller lead mandate'
  const propertyTitleType = normalizeKey(draft.propertyTitleType)
  const scenarioProfile = resolveLegalDocumentScenarioProfile({
    packetType: 'mandate',
    seller: {
      entityType: draft.sellerEntityType || '',
      maritalStatus: draft.sellerMaritalRegime || draft.sellerMaritalStatus,
    },
    property: { propertyType: propertyTitleType },
  })
  const legalRequirements = resolveLegalDocumentScenarioRequirements({
    scenarioProfile,
    draft: { ...draft, propertyTitleType },
  })
  const legalMissingLabels = legalRequirements.missingFields.map((field) => field.label)
  const selectedAttorney = attorneySelectionDeferred
    ? null
    : preferredAttorneys.find((attorney) => String(attorney.id) === String(selectedAttorneyId)) || null
  const attorneyReady = Boolean(selectedAttorneyId || attorneySelectionDeferred)

  useEffect(() => {
    if (!attorneyMenuOpen) return undefined
    function closeOnOutsideClick(event) {
      if (!attorneyMenuRef.current?.contains(event.target)) setAttorneyMenuOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setAttorneyMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [attorneyMenuOpen])

  useEffect(() => {
    if (preferredAttorneysLoading || attorneySelectionDeferred) setAttorneyMenuOpen(false)
  }, [attorneySelectionDeferred, preferredAttorneysLoading])

  return (
    <section className="mb-5 rounded-[24px] border border-[#dbe7f4] bg-white p-4 shadow-[0_14px_34px_rgba(16,32,51,0.05)] sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Mandate check</p>
            <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-2.5 py-1 text-xs font-semibold text-[#2563eb]">
              {sourceLabel}
            </span>
            {hasManualStart ? (
              <span className="rounded-full border border-[#fde6c8] bg-[#fff8ed] px-2.5 py-1 text-xs font-semibold text-[#a15c13]">
                Manual capture
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 text-xl font-semibold text-[#142132]">Confirm the seller facts</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#607387]">
            Seller, property and mandate choices are managed from the Seller workspace. Confirm this snapshot, or go back to Seller to update the source details before generating.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <span className="rounded-full border border-[#e6edf7] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold capitalize text-[#607387]">
            {startLabel}
          </span>
          {onEditSellerDetails ? (
            <Button type="button" variant="secondary" onClick={onEditSellerDetails}>
              <Pencil size={14} />
              Edit in Seller
            </Button>
          ) : null}
          <Button type="button" onClick={onConfirm} disabled={!attorneyReady || !legalRequirements.complete}>
            <CheckCircle2 size={15} />
            Looks good
          </Button>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 rounded-[18px] border border-[#dbeafe] bg-[#f4f8ff] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#456b98]">Legal situation</p>
          {scenarioProfile.complete ? (
            <p className="mt-1 text-sm font-semibold capitalize text-[#173b63]">
              {scenarioProfile.sellerClauseProfile.replace(/_/g, ' ')} seller · {scenarioProfile.propertyClauseProfile.replace(/_/g, ' ')}
            </p>
          ) : (
            <p className="mt-1 text-sm font-semibold text-[#9a5b1d]">Complete the seller legal setup before confirming.</p>
          )}
        </div>
        <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${legalRequirements.complete ? 'border-[#cdebd8] bg-white text-[#20895a]' : 'border-[#f5d9b8] bg-[#fffaf3] text-[#9a5b1d]'}`}>
          {legalRequirements.complete ? 'Legal details ready' : `${legalRequirements.missingFields.length} legal detail${legalRequirements.missingFields.length === 1 ? '' : 's'} to check`}
        </span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="rounded-[18px] border border-[#d8f0e3] bg-[#f5fbf7] p-4">
          <p className="text-sm font-semibold text-[#1e6845]">
            {completedCheckCount}/{readinessChecks.length} essentials ready
          </p>
          <p className="mt-1 text-sm leading-5 text-[#47705d]">
            {missingChecks.length ? `${missingChecks.length} item${missingChecks.length === 1 ? '' : 's'} need a quick check.` : 'Ready for draft generation.'}
          </p>
        </div>
        <div className="flex flex-wrap content-start gap-2 rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] p-4">
          {readinessChecks.map((check) => {
            const Icon = check.complete ? CheckCircle2 : CircleAlert
            return (
              <span
                key={check.key}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  check.complete
                    ? 'border-[#d8f0e3] bg-[#effaf4] text-[#20895a]'
                    : 'border-[#fde4de] bg-[#fff5f2] text-[#b64d32]'
                }`}
              >
                <Icon size={14} />
                {check.complete ? check.label : `${check.label}: ${check.missing}`}
              </span>
            )
          })}
        </div>
      </div>

      <div className="mt-4 rounded-[18px] border border-[#dbe7f4] bg-[#fbfdff] p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr] lg:items-end">
          <div className="block">
            <span className="text-sm font-semibold text-[#243b53]">Seller's transferring attorney</span>
            <span className="mt-1 block text-xs leading-5 text-[#6b7d93]">
              Select the attorney allocated under this mandate. The formal transfer instruction remains inactive until a buyer and accepted OTP exist.
            </span>
            <div ref={attorneyMenuRef} className="relative mt-2">
              <button
                type="button"
                className="flex min-h-[58px] w-full items-center gap-3 rounded-[14px] border border-[#d7e1ec] bg-white px-3 py-2 text-left outline-none transition hover:border-[#b8cee5] focus:border-[#2f6fed] focus:ring-2 focus:ring-[#2f6fed]/15 disabled:cursor-not-allowed disabled:bg-[#f4f7fa] disabled:opacity-70"
                disabled={preferredAttorneysLoading || attorneySelectionDeferred}
                aria-haspopup="listbox"
                aria-expanded={attorneyMenuOpen}
                onClick={() => setAttorneyMenuOpen((open) => !open)}
              >
                {selectedAttorney ? <AttorneyAvatar attorney={selectedAttorney} /> : (
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-[#c9d8e8] bg-[#f7faff] text-[#6c849b]">
                    <Landmark size={18} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-[#142132]">
                      {preferredAttorneysLoading ? 'Loading preferred attorneys…' : selectedAttorney?.companyName || 'Select transfer attorney'}
                    </span>
                    {selectedAttorney?.isPreferredDefault ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fff7df] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.06em] text-[#946200]">
                        <Star size={10} fill="currentColor" /> Preferred
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[#6b7d93]">
                    {selectedAttorney
                      ? selectedAttorney.contactPerson || selectedAttorney.email || 'Transfer attorney'
                      : 'View the agency’s approved attorney partners'}
                  </span>
                </span>
                <ChevronDown size={18} className={`shrink-0 text-[#6b7d93] transition-transform ${attorneyMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {attorneyMenuOpen ? (
                <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-[16px] border border-[#d7e1ec] bg-white p-1.5 shadow-[0_18px_45px_rgba(29,55,82,0.18)]" role="listbox" aria-label="Preferred transfer attorneys">
                  <div className="border-b border-[#edf2f7] px-3 py-2">
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[#7b8ca2]">Approved attorney partners</p>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {preferredAttorneys.map((attorney) => {
                      const selected = String(attorney.id) === String(selectedAttorneyId)
                      return (
                        <button
                          key={attorney.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition ${selected ? 'bg-[#eef6ff]' : 'hover:bg-[#f7faff]'}`}
                          onClick={() => {
                            onAttorneyChange?.(attorney.id)
                            setAttorneyMenuOpen(false)
                          }}
                        >
                          <AttorneyAvatar attorney={attorney} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-[#172334]">{attorney.companyName}</span>
                              {attorney.isPreferredDefault ? <Star size={13} className="shrink-0 text-[#d29610]" fill="currentColor" /> : null}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[#6b7d93]">
                              <Building2 size={12} className="shrink-0" />
                              <span className="truncate">{attorney.contactPerson || attorney.email || attorney.province || 'Transfer attorney'}</span>
                            </span>
                          </span>
                          {selected ? <Check size={17} className="shrink-0 text-[#2877c8]" /> : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-[14px] border border-[#e6edf7] bg-white px-4 py-3 text-sm text-[#607387]">
            {selectedAttorney ? (
              <>
                <p className="font-semibold text-[#142132]">{selectedAttorney.companyName}</p>
                <p className="mt-1">{selectedAttorney.contactPerson || 'Contact pending'}</p>
                <p className="mt-1">{selectedAttorney.email || 'No email'}{selectedAttorney.phone ? ` · ${selectedAttorney.phone}` : ''}</p>
              </>
            ) : preferredAttorneysError ? (
              <p className="font-semibold text-[#a33b2f]">{preferredAttorneysError}</p>
            ) : preferredAttorneys.length ? (
              <p>Select the attorney that should receive this listing after signature.</p>
            ) : (
              <p>No preferred transfer attorneys are configured. Add one under Organisation → Partners, or defer the selection.</p>
            )}
          </div>
        </div>
        <label className="mt-3 flex items-start gap-3 rounded-[14px] border border-[#e6edf7] bg-white px-4 py-3 text-sm text-[#455d75]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={attorneySelectionDeferred}
            onChange={(event) => onAttorneySelectionDeferredChange?.(event.target.checked)}
          />
          <span>
            <strong className="block text-[#243b53]">Seller will nominate the transferring attorney later</strong>
            Use this exception only when the mandate does not yet authorise an allocation. The listing will require attorney selection before instruction.
          </span>
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {snapshotRows.map((row) => (
          <div key={row.key} className="min-w-0 rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{row.label}</p>
            <p className="mt-2 min-w-0 text-sm font-semibold leading-6 text-[#102033]">{row.value}</p>
          </div>
        ))}
      </div>

      {missingChecks.length ? (
        <div className="mt-4 rounded-[18px] border border-[#fde4de] bg-[#fff8f5] px-4 py-3 text-sm font-semibold text-[#9b452e]">
          Update missing items in Seller before generating if they are required for this mandate.
        </div>
      ) : null}

      {legalMissingLabels.length ? (
        <div className="mt-3 rounded-[18px] border border-[#f5d9b8] bg-[#fffaf3] px-4 py-3 text-sm text-[#8a541f]">
          <p className="font-semibold">Required for this legal situation</p>
          <p className="mt-1 leading-5">{legalMissingLabels.slice(0, 6).join(', ')}{legalMissingLabels.length > 6 ? ` and ${legalMissingLabels.length - 6} more` : ''}.</p>
          <p className="mt-1 text-xs font-medium">Update these values in Seller; fields that do not apply to this scenario are not required.</p>
        </div>
      ) : null}
    </section>
  )
}
