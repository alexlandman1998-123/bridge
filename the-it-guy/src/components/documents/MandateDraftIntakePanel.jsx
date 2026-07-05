import { CheckCircle2, CircleAlert, RotateCcw } from 'lucide-react'
import Button from '../ui/Button'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

const FIELD_CLASS = 'min-h-11 w-full rounded-xl border border-[#dbe6f2] bg-white px-3 text-sm font-semibold text-[#102033] outline-none transition placeholder:text-[#9aabba] focus:border-[#0a66ff]'
const LABEL_CLASS = 'text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]'
const SECTION_HEADING_CLASS = 'text-sm font-semibold text-[#142132]'

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

function MandateField({ label, children }) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className={LABEL_CLASS}>{label}</span>
      {children}
    </label>
  )
}

export default function MandateDraftIntakePanel({
  draft = {},
  sourceMode = '',
  documentStart = '',
  onFieldChange = null,
  onReset = null,
}) {
  const readinessChecks = buildReadinessChecks(draft)
  const missingChecks = readinessChecks.filter((item) => !item.complete)
  const commissionStructure = normalizeKey(draft.commissionStructure || 'percentage') || 'percentage'
  const sourceLabel = getSourceModeLabel(sourceMode)
  const hasManualStart = normalizeKey(sourceMode) === 'manual_details'
  const startLabel = normalizeText(documentStart).replace(/_/g, ' ') || 'seller lead mandate'
  const update = (field) => (event) => {
    onFieldChange?.(field, event.target.value)
  }

  return (
    <section className="mb-5 rounded-[24px] border border-[#e3ebf4] bg-white p-5 shadow-[0_14px_34px_rgba(16,32,51,0.05)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Generate Mandate</p>
            <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-2.5 py-1 text-xs font-semibold text-[#2563eb]">
              {sourceLabel}
            </span>
            {hasManualStart ? (
              <span className="rounded-full border border-[#fde6c8] bg-[#fff8ed] px-2.5 py-1 text-xs font-semibold text-[#a15c13]">
                Manual capture
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 text-xl font-semibold text-[#142132]">Check the mandate details</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#607387]">
            Fill only what is missing. Saved lead and onboarding details are already prefilled where Arch9 can find them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#e6edf7] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold capitalize text-[#607387]">
            {startLabel}
          </span>
          <Button type="button" variant="secondary" onClick={onReset}>
            <RotateCcw size={14} />
            Use defaults
          </Button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
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

      <div className="mt-6 grid gap-6">
        <div className="grid gap-3 border-t border-[#edf2f7] pt-5">
          <div>
            <h3 className={SECTION_HEADING_CLASS}>Seller</h3>
            <p className="mt-1 text-xs font-medium text-[#6b7d93]">Capture the seller exactly as it should appear on the mandate.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MandateField label="Seller type">
              <select value={draft.sellerEntityType || 'individual'} onChange={update('sellerEntityType')} className={FIELD_CLASS}>
                <option value="individual">Individual</option>
                <option value="company">Company</option>
                <option value="trust">Trust</option>
              </select>
            </MandateField>
            <MandateField label="Seller name">
              <input value={draft.sellerFullName || ''} onChange={update('sellerFullName')} placeholder="Full name or entity name" className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="ID / registration no.">
              <input value={draft.sellerIdNumber || ''} onChange={update('sellerIdNumber')} placeholder="Optional but recommended" className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="Email">
              <input type="email" value={draft.sellerEmail || ''} onChange={update('sellerEmail')} placeholder="seller@example.com" className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="Phone">
              <input value={draft.sellerPhone || ''} onChange={update('sellerPhone')} placeholder="+27..." className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="Domicilium address">
              <input value={draft.sellerDomiciliumAddress || ''} onChange={update('sellerDomiciliumAddress')} placeholder="Address for notices" className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="Representative">
              <input value={draft.sellerRepresentativeName || ''} onChange={update('sellerRepresentativeName')} placeholder="For company or trust" className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="Capacity">
              <input value={draft.sellerRepresentativeCapacity || ''} onChange={update('sellerRepresentativeCapacity')} placeholder="Director, trustee..." className={FIELD_CLASS} />
            </MandateField>
          </div>
        </div>

        <div className="grid gap-3 border-t border-[#edf2f7] pt-5">
          <div>
            <h3 className={SECTION_HEADING_CLASS}>Property</h3>
            <p className="mt-1 text-xs font-medium text-[#6b7d93]">Use the physical address and price that should appear in the mandate.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MandateField label="Property address">
              <input value={draft.propertyAddress || ''} onChange={update('propertyAddress')} placeholder="Street address" className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="Suburb">
              <input value={draft.propertySuburb || ''} onChange={update('propertySuburb')} placeholder="Suburb" className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="City">
              <input value={draft.propertyCity || ''} onChange={update('propertyCity')} placeholder="City" className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="Property type">
              <input value={draft.propertyType || ''} onChange={update('propertyType')} placeholder="House, apartment..." className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="Unit number">
              <input value={draft.unitNumber || ''} onChange={update('unitNumber')} placeholder="Optional" className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="Complex / estate">
              <input value={draft.complexName || ''} onChange={update('complexName')} placeholder="Optional" className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="Erf / section no.">
              <input value={draft.erfNumber || ''} onChange={update('erfNumber')} placeholder="Optional" className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="Asking price">
              <input type="number" min="0" step="1000" value={draft.askingPrice || ''} onChange={update('askingPrice')} placeholder="0" className={FIELD_CLASS} />
            </MandateField>
          </div>
        </div>

        <div className="grid gap-3 border-t border-[#edf2f7] pt-5">
          <div>
            <h3 className={SECTION_HEADING_CLASS}>Mandate and commission</h3>
            <p className="mt-1 text-xs font-medium text-[#6b7d93]">These values flow into the draft before signature prep.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MandateField label="Mandate type">
              <select value={draft.mandateType || 'sole'} onChange={update('mandateType')} className={FIELD_CLASS}>
                <option value="sole">Sole mandate</option>
                <option value="exclusive">Exclusive mandate</option>
                <option value="open">Open mandate</option>
                <option value="dual">Dual mandate</option>
              </select>
            </MandateField>
            <MandateField label="Start date">
              <input type="date" value={draft.mandateStartDate || ''} onChange={update('mandateStartDate')} className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="Expiry date">
              <input type="date" value={draft.mandateEndDate || ''} onChange={update('mandateEndDate')} className={FIELD_CLASS} />
            </MandateField>
            <MandateField label="VAT handling">
              <select value={draft.vatHandling || 'exclusive'} onChange={update('vatHandling')} className={FIELD_CLASS}>
                <option value="exclusive">VAT exclusive</option>
                <option value="inclusive">VAT inclusive</option>
                <option value="not_applicable">No VAT</option>
              </select>
            </MandateField>
            <MandateField label="Commission structure">
              <select value={commissionStructure} onChange={update('commissionStructure')} className={FIELD_CLASS}>
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </MandateField>
            {commissionStructure === 'fixed' ? (
              <MandateField label="Fixed commission">
                <input type="number" min="0" step="100" value={draft.commissionAmount || ''} onChange={update('commissionAmount')} placeholder="0" className={FIELD_CLASS} />
              </MandateField>
            ) : (
              <>
                <MandateField label="Commission %">
                  <input type="number" min="0" step="0.1" value={draft.commissionPercent || ''} onChange={update('commissionPercent')} placeholder="7.5" className={FIELD_CLASS} />
                </MandateField>
                <MandateField label="Amount override">
                  <input type="number" min="0" step="100" value={draft.commissionAmount || ''} onChange={update('commissionAmount')} placeholder="Optional" className={FIELD_CLASS} />
                </MandateField>
              </>
            )}
            <div className="hidden xl:block" aria-hidden="true" />
            <label className="grid gap-1.5 md:col-span-2 xl:col-span-4">
              <span className={LABEL_CLASS}>Special conditions</span>
              <textarea
                rows={3}
                value={draft.specialConditions || ''}
                onChange={update('specialConditions')}
                placeholder="Any additional terms that should appear on the mandate."
                className="min-h-[92px] w-full rounded-xl border border-[#dbe6f2] bg-white px-3 py-3 text-sm font-medium text-[#102033] outline-none transition placeholder:text-[#9aabba] focus:border-[#0a66ff]"
              />
            </label>
          </div>
        </div>
      </div>

      {missingChecks.length ? (
        <p className="mt-5 text-sm font-medium text-[#9a5b1d]">
          You can still generate a draft with gaps, but filling the red chips first will make the mandate cleaner.
        </p>
      ) : (
        <p className="mt-5 text-sm font-semibold text-[#20895a]">
          Core mandate details are ready for draft generation.
        </p>
      )}
    </section>
  )
}
