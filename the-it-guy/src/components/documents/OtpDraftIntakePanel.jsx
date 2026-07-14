import { CheckCircle2, CircleAlert, RotateCcw } from 'lucide-react'
import {
  normalizeLegalMaritalRegime,
  normalizeLegalPropertyTitleType,
  resolveLegalDocumentScenarioProfile,
} from '../../core/documents/legalDocumentScenarioProfile'
import { resolveLegalDocumentScenarioRequirements } from '../../core/documents/legalDocumentScenarioRequirements'
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
  if (key === 'send_onboarding') return 'Buyer onboarding'
  if (key === 'saved_details') return 'Saved details'
  return 'Draft details'
}

function OtpField({ label, children, className = '' }) {
  return (
    <label className={`grid min-w-0 gap-1.5 ${className}`}>
      <span className={LABEL_CLASS}>{label}</span>
      {children}
    </label>
  )
}

export default function OtpDraftIntakePanel({
  draft = {},
  sourceMode = '',
  documentStart = '',
  onFieldChange = null,
  onReset = null,
}) {
  const sourceLabel = getSourceModeLabel(sourceMode)
  const hasManualStart = normalizeKey(sourceMode) === 'manual_details'
  const startLabel = normalizeText(documentStart).replace(/_/g, ' ') || 'transaction otp'
  const buyerEntityType = normalizeKey(draft.buyerEntityType || 'individual') || 'individual'
  const sellerEntityType = normalizeKey(draft.sellerEntityType || 'company') || 'company'
  const financeType = normalizeKey(draft.financeType || 'cash') || 'cash'
  const propertyTitleType = normalizeLegalPropertyTitleType(
    draft.propertyTitleType || (draft.unitNumber || draft.complexName ? 'sectional_title' : 'full_title'),
  ) || 'full_title'
  const buyerMaritalRegime = normalizeLegalMaritalRegime(draft.buyerMaritalRegime || '')
  const sellerMaritalRegime = normalizeLegalMaritalRegime(draft.sellerMaritalRegime || '')
  const scenarioProfile = resolveLegalDocumentScenarioProfile({
    packetType: 'otp',
    seller: { entityType: sellerEntityType, maritalStatus: sellerMaritalRegime },
    buyer: { entityType: buyerEntityType, maritalStatus: buyerMaritalRegime },
    property: { propertyType: propertyTitleType },
    transaction: { financeType },
  })
  const requirements = resolveLegalDocumentScenarioRequirements({
    scenarioProfile,
    draft: { ...draft, propertyTitleType },
  })
  const readinessChecks = requirements.groups.map((group) => ({
    key: group.key,
    label: group.label,
    complete: group.complete,
    missing: group.fields.filter((field) => field.missing).map((field) => field.label).slice(0, 2).join(', '),
  }))
  const missingChecks = readinessChecks.filter((item) => !item.complete)
  const update = (field) => (event) => {
    const value = event.target.value
    onFieldChange?.(field, value)
    const role = field === 'buyerEntityType' ? 'buyer' : field === 'sellerEntityType' ? 'seller' : ''
    if (role && value !== 'individual') {
      for (const dependentField of ['MaritalRegime', 'SpouseFullName', 'SpouseIdNumber', 'SpouseEmail']) {
        onFieldChange?.(`${role}${dependentField}`, '')
      }
    }
    if (role && value !== 'trust') onFieldChange?.(`${role}TrusteeNames`, '')
    if (role && !['company', 'close_corporation'].includes(value)) onFieldChange?.(`${role}ResolutionDate`, '')
    if (role && value === 'individual') {
      for (const dependentField of ['RepresentativeName', 'RepresentativeCapacity', 'ResolutionDate', 'AuthorityBasis']) {
        onFieldChange?.(`${role}${dependentField}`, '')
      }
    }
    if (field === 'buyerMaritalRegime' && value !== 'in_community') {
      for (const dependentField of ['buyerSpouseFullName', 'buyerSpouseIdNumber', 'buyerSpouseEmail']) onFieldChange?.(dependentField, '')
    }
    if (field === 'sellerMaritalRegime' && value !== 'in_community') {
      for (const dependentField of ['sellerSpouseFullName', 'sellerSpouseIdNumber', 'sellerSpouseEmail']) onFieldChange?.(dependentField, '')
    }
    if (field === 'propertyTitleType' && value === 'full_title') {
      onFieldChange?.('unitNumber', '')
      onFieldChange?.('complexName', '')
    }
    if (field === 'propertyTitleType' && value === 'sectional_title') onFieldChange?.('erfNumber', '')
    if (field === 'financeType' && value === 'cash') onFieldChange?.('bondAmount', '')
    if (field === 'financeType' && value === 'bond') onFieldChange?.('cashAmount', '')
  }

  return (
    <section className="mb-5 rounded-[24px] border border-[#e3ebf4] bg-white p-5 shadow-[0_14px_34px_rgba(16,32,51,0.05)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Generate OTP</p>
            <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-2.5 py-1 text-xs font-semibold text-[#2563eb]">
              {sourceLabel}
            </span>
            {hasManualStart ? (
              <span className="rounded-full border border-[#fde6c8] bg-[#fff8ed] px-2.5 py-1 text-xs font-semibold text-[#a15c13]">
                Manual capture
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 text-xl font-semibold text-[#142132]">Check the OTP details</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#607387]">
            Fill only the details needed for this offer. Saved transaction and buyer details are already prefilled where Arch9 can find them.
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

      <div className="mt-5 rounded-[18px] border border-[#dbeafe] bg-[#f4f8ff] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#456b98]">Prepared for this situation</p>
        <p className="mt-1 text-sm font-semibold capitalize text-[#173b63]">
          {scenarioProfile.sellerClauseProfile.replace(/_/g, ' ')} seller · {scenarioProfile.buyerClauseProfile.replace(/_/g, ' ')} buyer · {scenarioProfile.propertyClauseProfile.replace(/_/g, ' ')} · {scenarioProfile.financeClauseProfile.replace(/_/g, ' ')}
        </p>
        <p className="mt-1 text-xs leading-5 text-[#5f7894]">Only the legal details required for this combination are shown below.</p>
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
            <h3 className={SECTION_HEADING_CLASS}>Buyer</h3>
            <p className="mt-1 text-xs font-medium text-[#6b7d93]">Capture the purchaser exactly as it should appear in the OTP.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OtpField label="Buyer type">
              <select value={buyerEntityType} onChange={update('buyerEntityType')} className={FIELD_CLASS}>
                <option value="individual">Individual</option>
                <option value="company">Company</option>
                <option value="trust">Trust</option>
              </select>
            </OtpField>
            <OtpField label="Buyer name">
              <input value={draft.buyerFullName || ''} onChange={update('buyerFullName')} placeholder="Full name or entity name" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="ID / registration no.">
              <input value={draft.buyerIdNumber || ''} onChange={update('buyerIdNumber')} placeholder="Optional but recommended" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Email">
              <input type="email" value={draft.buyerEmail || ''} onChange={update('buyerEmail')} placeholder="buyer@example.com" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Phone">
              <input value={draft.buyerPhone || ''} onChange={update('buyerPhone')} placeholder="+27..." className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Co-buyer name">
              <input value={draft.coBuyerFullName || ''} onChange={update('coBuyerFullName')} placeholder="Optional" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Co-buyer email">
              <input type="email" value={draft.coBuyerEmail || ''} onChange={update('coBuyerEmail')} placeholder="Optional" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Domicilium address">
              <input value={draft.buyerDomiciliumAddress || ''} onChange={update('buyerDomiciliumAddress')} placeholder="Address for notices" className={FIELD_CLASS} />
            </OtpField>
            {buyerEntityType === 'individual' ? (
              <>
                <OtpField label="Marital position">
                  <select value={buyerMaritalRegime} onChange={update('buyerMaritalRegime')} className={FIELD_CLASS}>
                    <option value="">Choose marital position</option>
                    <option value="single">Single / not married</option>
                    <option value="out_of_community">Married out of community</option>
                    <option value="in_community">Married in community</option>
                  </select>
                </OtpField>
                {buyerMaritalRegime === 'in_community' ? (
                  <>
                    <OtpField label="Spouse full name">
                      <input value={draft.buyerSpouseFullName || ''} onChange={update('buyerSpouseFullName')} placeholder="Full legal name" className={FIELD_CLASS} />
                    </OtpField>
                    <OtpField label="Spouse ID number">
                      <input value={draft.buyerSpouseIdNumber || ''} onChange={update('buyerSpouseIdNumber')} placeholder="South African ID or passport" className={FIELD_CLASS} />
                    </OtpField>
                    <OtpField label="Spouse email">
                      <input type="email" value={draft.buyerSpouseEmail || ''} onChange={update('buyerSpouseEmail')} placeholder="spouse@example.com" className={FIELD_CLASS} />
                    </OtpField>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <OtpField label="Representative">
                  <input value={draft.buyerRepresentativeName || ''} onChange={update('buyerRepresentativeName')} placeholder="Director, trustee..." className={FIELD_CLASS} />
                </OtpField>
                <OtpField label="Capacity">
                  <input value={draft.buyerRepresentativeCapacity || ''} onChange={update('buyerRepresentativeCapacity')} placeholder="Signing capacity" className={FIELD_CLASS} />
                </OtpField>
                {buyerEntityType === 'company' ? (
                  <OtpField label="Resolution date">
                    <input type="date" value={draft.buyerResolutionDate || ''} onChange={update('buyerResolutionDate')} className={FIELD_CLASS} />
                  </OtpField>
                ) : null}
                {buyerEntityType === 'trust' ? (
                  <OtpField label="Trustee names" className="md:col-span-2">
                    <input value={draft.buyerTrusteeNames || ''} onChange={update('buyerTrusteeNames')} placeholder="Names of authorised trustees" className={FIELD_CLASS} />
                  </OtpField>
                ) : null}
                <OtpField label="Authority / resolution" className="md:col-span-2">
                  <input value={draft.buyerAuthorityBasis || ''} onChange={update('buyerAuthorityBasis')} placeholder="Board or trustee resolution details" className={FIELD_CLASS} />
                </OtpField>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-3 border-t border-[#edf2f7] pt-5">
          <div>
            <h3 className={SECTION_HEADING_CLASS}>Seller</h3>
            <p className="mt-1 text-xs font-medium text-[#6b7d93]">Use the legal seller and signing representative for this offer.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OtpField label="Seller type">
              <select value={sellerEntityType} onChange={update('sellerEntityType')} className={FIELD_CLASS}>
                <option value="individual">Individual</option>
                <option value="company">Company</option>
                <option value="trust">Trust</option>
                <option value="close_corporation">Close corporation</option>
              </select>
            </OtpField>
            <OtpField label="Seller name">
              <input value={draft.sellerFullName || ''} onChange={update('sellerFullName')} placeholder="Seller legal name" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="ID / registration no.">
              <input value={draft.sellerIdNumber || ''} onChange={update('sellerIdNumber')} placeholder="Optional but recommended" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Email">
              <input type="email" value={draft.sellerEmail || ''} onChange={update('sellerEmail')} placeholder="seller@example.com" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Phone">
              <input value={draft.sellerPhone || ''} onChange={update('sellerPhone')} placeholder="+27..." className={FIELD_CLASS} />
            </OtpField>
            {sellerEntityType === 'individual' ? (
              <>
                <OtpField label="Marital position">
                  <select value={sellerMaritalRegime} onChange={update('sellerMaritalRegime')} className={FIELD_CLASS}>
                    <option value="">Choose marital position</option>
                    <option value="single">Single / not married</option>
                    <option value="out_of_community">Married out of community</option>
                    <option value="in_community">Married in community</option>
                  </select>
                </OtpField>
                {sellerMaritalRegime === 'in_community' ? (
                  <>
                    <OtpField label="Spouse full name">
                      <input value={draft.sellerSpouseFullName || ''} onChange={update('sellerSpouseFullName')} placeholder="Full legal name" className={FIELD_CLASS} />
                    </OtpField>
                    <OtpField label="Spouse ID number">
                      <input value={draft.sellerSpouseIdNumber || ''} onChange={update('sellerSpouseIdNumber')} placeholder="South African ID or passport" className={FIELD_CLASS} />
                    </OtpField>
                    <OtpField label="Spouse email">
                      <input type="email" value={draft.sellerSpouseEmail || ''} onChange={update('sellerSpouseEmail')} placeholder="spouse@example.com" className={FIELD_CLASS} />
                    </OtpField>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <OtpField label="Representative">
                  <input value={draft.sellerRepresentativeName || ''} onChange={update('sellerRepresentativeName')} placeholder="For company or trust" className={FIELD_CLASS} />
                </OtpField>
                <OtpField label="Capacity">
                  <input value={draft.sellerRepresentativeCapacity || ''} onChange={update('sellerRepresentativeCapacity')} placeholder="Director, trustee..." className={FIELD_CLASS} />
                </OtpField>
                {['company', 'close_corporation'].includes(sellerEntityType) ? (
                  <OtpField label="Resolution date">
                    <input type="date" value={draft.sellerResolutionDate || ''} onChange={update('sellerResolutionDate')} className={FIELD_CLASS} />
                  </OtpField>
                ) : null}
                {sellerEntityType === 'trust' ? (
                  <OtpField label="Trustee names" className="md:col-span-2">
                    <input value={draft.sellerTrusteeNames || ''} onChange={update('sellerTrusteeNames')} placeholder="Names of authorised trustees" className={FIELD_CLASS} />
                  </OtpField>
                ) : null}
                <OtpField label="Authority / resolution" className="md:col-span-2">
                  <input value={draft.sellerAuthorityBasis || ''} onChange={update('sellerAuthorityBasis')} placeholder="Board or trustee resolution details" className={FIELD_CLASS} />
                </OtpField>
              </>
            )}
            <OtpField label="Registered address">
              <input value={draft.sellerRegisteredAddress || ''} onChange={update('sellerRegisteredAddress')} placeholder="Address for notices" className={FIELD_CLASS} />
            </OtpField>
          </div>
        </div>

        <div className="grid gap-3 border-t border-[#edf2f7] pt-5">
          <div>
            <h3 className={SECTION_HEADING_CLASS}>Property</h3>
            <p className="mt-1 text-xs font-medium text-[#6b7d93]">Confirm the property that the buyer is offering to purchase.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OtpField label="Property address" className="md:col-span-2">
              <input value={draft.propertyAddress || ''} onChange={update('propertyAddress')} placeholder="Street address" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Suburb">
              <input value={draft.propertySuburb || ''} onChange={update('propertySuburb')} placeholder="Suburb" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="City">
              <input value={draft.propertyCity || ''} onChange={update('propertyCity')} placeholder="City" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Property type">
              <input value={draft.propertyType || ''} onChange={update('propertyType')} placeholder="House, apartment..." className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Title type">
              <select value={propertyTitleType} onChange={update('propertyTitleType')} className={FIELD_CLASS}>
                <option value="full_title">Full title</option>
                <option value="sectional_title">Sectional title</option>
              </select>
            </OtpField>
            {propertyTitleType === 'sectional_title' ? (
              <>
                <OtpField label="Unit / section number">
                  <input value={draft.unitNumber || ''} onChange={update('unitNumber')} placeholder="Section number" className={FIELD_CLASS} />
                </OtpField>
                <OtpField label="Scheme / complex">
                  <input value={draft.complexName || ''} onChange={update('complexName')} placeholder="Registered scheme name" className={FIELD_CLASS} />
                </OtpField>
              </>
            ) : (
              <OtpField label="Erf number">
                <input value={draft.erfNumber || ''} onChange={update('erfNumber')} placeholder="Registered erf number" className={FIELD_CLASS} />
              </OtpField>
            )}
          </div>
        </div>

        <div className="grid gap-3 border-t border-[#edf2f7] pt-5">
          <div>
            <h3 className={SECTION_HEADING_CLASS}>Commercial terms</h3>
            <p className="mt-1 text-xs font-medium text-[#6b7d93]">These values flow into the draft before signature preparation.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OtpField label="Purchase price">
              <input type="number" min="0" step="1000" value={draft.purchasePrice || ''} onChange={update('purchasePrice')} placeholder="0" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Deposit">
              <input type="number" min="0" step="1000" value={draft.depositAmount || ''} onChange={update('depositAmount')} placeholder="Optional" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Finance type">
              <select value={financeType} onChange={update('financeType')} className={FIELD_CLASS}>
                <option value="cash">Cash</option>
                <option value="bond">Bond</option>
                <option value="combination">Cash and bond</option>
              </select>
            </OtpField>
            {['bond', 'combination'].includes(financeType) ? (
              <OtpField label="Bond amount">
                <input type="number" min="0" step="1000" value={draft.bondAmount || ''} onChange={update('bondAmount')} placeholder="Bond amount" className={FIELD_CLASS} />
              </OtpField>
            ) : null}
            {['cash', 'combination'].includes(financeType) ? (
              <OtpField label={financeType === 'cash' ? 'Cash purchase amount' : 'Cash contribution'}>
                <input type="number" min="0" step="1000" value={draft.cashAmount || ''} onChange={update('cashAmount')} placeholder={financeType === 'cash' ? 'Cash purchase amount' : 'Cash contribution'} className={FIELD_CLASS} />
              </OtpField>
            ) : null}
            <OtpField label="Occupation date">
              <input type="date" value={draft.occupationDate || ''} onChange={update('occupationDate')} className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Transfer date">
              <input type="date" value={draft.transferDate || ''} onChange={update('transferDate')} className={FIELD_CLASS} />
            </OtpField>
            <div className="hidden xl:block" aria-hidden="true" />
            <OtpField label="Suspensive conditions" className="md:col-span-2">
              <textarea
                rows={3}
                value={draft.suspensiveConditions || ''}
                onChange={update('suspensiveConditions')}
                placeholder="Bond approval, sale of existing property, inspection conditions..."
                className="min-h-[92px] w-full rounded-xl border border-[#dbe6f2] bg-white px-3 py-3 text-sm font-medium text-[#102033] outline-none transition placeholder:text-[#9aabba] focus:border-[#0a66ff]"
              />
            </OtpField>
            <OtpField label="Special conditions" className="md:col-span-2">
              <textarea
                rows={3}
                value={draft.specialConditions || ''}
                onChange={update('specialConditions')}
                placeholder="Any additional terms that should appear in the OTP."
                className="min-h-[92px] w-full rounded-xl border border-[#dbe6f2] bg-white px-3 py-3 text-sm font-medium text-[#102033] outline-none transition placeholder:text-[#9aabba] focus:border-[#0a66ff]"
              />
            </OtpField>
          </div>
        </div>
      </div>

      {missingChecks.length ? (
        <p className="mt-5 text-sm font-medium text-[#9a5b1d]">
          You can still generate a draft with gaps, but filling the red chips first will make the OTP cleaner.
        </p>
      ) : (
        <p className="mt-5 text-sm font-semibold text-[#20895a]">
          Core OTP details are ready for draft generation.
        </p>
      )}
    </section>
  )
}
