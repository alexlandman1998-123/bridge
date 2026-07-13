import { CheckCircle2, CircleAlert, Pencil } from 'lucide-react'
import Button from '../ui/Button'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
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
  onConfirm = null,
  onEditSellerDetails = null,
}) {
  const readinessChecks = buildReadinessChecks(draft)
  const missingChecks = readinessChecks.filter((item) => !item.complete)
  const completedCheckCount = readinessChecks.length - missingChecks.length
  const snapshotRows = buildMandateSnapshot(draft)
  const sourceLabel = getSourceModeLabel(sourceMode)
  const hasManualStart = normalizeKey(sourceMode) === 'manual_details'
  const startLabel = normalizeText(documentStart).replace(/_/g, ' ') || 'seller lead mandate'

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
          <Button type="button" onClick={onConfirm}>
            <CheckCircle2 size={15} />
            Looks good
          </Button>
        </div>
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
    </section>
  )
}
