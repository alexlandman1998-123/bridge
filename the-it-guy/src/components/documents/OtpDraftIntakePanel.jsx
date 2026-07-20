import { CheckCircle2, CircleAlert, RotateCcw } from 'lucide-react'
import { cloneElement, isValidElement } from 'react'
import {
  normalizeLegalMaritalRegime,
  normalizeLegalPropertyTitleType,
  resolveLegalDocumentScenarioProfile,
} from '../../core/documents/legalDocumentScenarioProfile'
import {
  getLegalDocumentScenarioDependentFieldClears,
  resolveLegalDocumentScenarioRequirements,
} from '../../core/documents/legalDocumentScenarioRequirements'
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

function OtpField({ label, children, className = '', required = false }) {
  const control = required && isValidElement(children)
    ? cloneElement(children, { required: true, 'aria-required': true })
    : children
  return (
    <label className={`grid min-w-0 gap-1.5 ${className}`}>
      <span className={LABEL_CLASS}>
        {label}{required ? <span className="ml-1 text-[#c2412d]">Required</span> : null}
      </span>
      {control}
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
  const buyerEntityType = normalizeKey(draft.buyerEntityType)
  const sellerEntityType = normalizeKey(draft.sellerEntityType)
  const financeType = normalizeKey(draft.financeType)
  const propertyTitleType = normalizeLegalPropertyTitleType(draft.propertyTitleType)
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
  const requiredFields = new Set(requirements.requiredFieldKeys)
  const activePacks = new Set(scenarioProfile.activePackKeys)
  const isRequired = (field) => requiredFields.has(field)
  const buyerIsIndividual = activePacks.has('buyer_individual_capacity_pack')
  const buyerIsCompany = activePacks.has('buyer_company_authority_pack')
  const buyerIsTrust = activePacks.has('buyer_trust_authority_pack')
  const buyerNeedsSpouse = activePacks.has('buyer_spouse_consent_pack')
  const sellerIsIndividual = activePacks.has('seller_individual_capacity_pack')
  const sellerIsCompany = activePacks.has('seller_company_authority_pack')
  const sellerIsTrust = activePacks.has('seller_trust_authority_pack')
  const sellerNeedsSpouse = activePacks.has('seller_spouse_consent_pack')
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
    for (const dependentField of getLegalDocumentScenarioDependentFieldClears(field, value)) {
      onFieldChange?.(dependentField, '')
    }
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
            Reload saved details
          </Button>
        </div>
      </div>

      <div className="mt-5 rounded-[18px] border border-[#dbeafe] bg-[#f4f8ff] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#456b98]">Prepared for this situation</p>
        {requirements.phase === 'routing' ? (
          <>
            <p className="mt-1 text-sm font-semibold text-[#173b63]">Choose the legal setup to reveal the applicable fields.</p>
            <p className="mt-1 text-xs leading-5 text-[#5f7894]">No party, property or finance wording is assumed.</p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm font-semibold capitalize text-[#173b63]">
              {scenarioProfile.sellerClauseProfile.replace(/_/g, ' ')} seller · {scenarioProfile.buyerClauseProfile.replace(/_/g, ' ')} buyer · {scenarioProfile.propertyClauseProfile.replace(/_/g, ' ')} · {scenarioProfile.financeClauseProfile.replace(/_/g, ' ')}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#5f7894]">Only the legal details required for this combination are shown below.</p>
          </>
        )}
      </div>

      {scenarioProfile.conflictingFacts.length || scenarioProfile.invalidFacts.length ? (
        <div className="mt-3 rounded-[16px] border border-[#f3c9bf] bg-[#fff5f2] px-4 py-3 text-sm font-semibold text-[#a33f2d]">
          Resolve the conflicting or unsupported legal setup values before generating this OTP.
        </div>
      ) : null}

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
            <OtpField label="Buyer type" required={isRequired('buyerEntityType')}>
              <select value={buyerEntityType} onChange={update('buyerEntityType')} className={FIELD_CLASS}>
                <option value="">Choose buyer type</option>
                <option value="individual">Individual</option>
                <option value="company">Company</option>
                <option value="trust">Trust</option>
                <option value="close_corporation">Close corporation</option>
              </select>
            </OtpField>
            <OtpField label="Buyer name" required={isRequired('buyerFullName')}>
              <input value={draft.buyerFullName || ''} onChange={update('buyerFullName')} placeholder="Full name or entity name" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="ID / registration no." required={isRequired('buyerIdNumber')}>
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
            {buyerIsIndividual ? (
              <>
                <OtpField label="Marital position" required={isRequired('buyerMaritalRegime')}>
                  <select value={buyerMaritalRegime} onChange={update('buyerMaritalRegime')} className={FIELD_CLASS}>
                    <option value="">Choose marital position</option>
                    <option value="single">Single / not married</option>
                    <option value="out_of_community">Married out of community</option>
                    <option value="in_community">Married in community</option>
                  </select>
                </OtpField>
                {buyerNeedsSpouse ? (
                  <>
                    <OtpField label="Spouse full name" required={isRequired('buyerSpouseFullName')}>
                      <input value={draft.buyerSpouseFullName || ''} onChange={update('buyerSpouseFullName')} placeholder="Full legal name" className={FIELD_CLASS} />
                    </OtpField>
                    <OtpField label="Spouse ID number" required={isRequired('buyerSpouseIdNumber')}>
                      <input value={draft.buyerSpouseIdNumber || ''} onChange={update('buyerSpouseIdNumber')} placeholder="South African ID or passport" className={FIELD_CLASS} />
                    </OtpField>
                    <OtpField label="Spouse email" required={isRequired('buyerSpouseEmail')}>
                      <input type="email" value={draft.buyerSpouseEmail || ''} onChange={update('buyerSpouseEmail')} placeholder="spouse@example.com" className={FIELD_CLASS} />
                    </OtpField>
                  </>
                ) : null}
              </>
            ) : buyerIsCompany || buyerIsTrust ? (
              <>
                <OtpField label="Representative" required={isRequired('buyerRepresentativeName')}>
                  <input value={draft.buyerRepresentativeName || ''} onChange={update('buyerRepresentativeName')} placeholder="Director, trustee..." className={FIELD_CLASS} />
                </OtpField>
                <OtpField label="Capacity" required={isRequired('buyerRepresentativeCapacity')}>
                  <input value={draft.buyerRepresentativeCapacity || ''} onChange={update('buyerRepresentativeCapacity')} placeholder="Signing capacity" className={FIELD_CLASS} />
                </OtpField>
                {buyerIsCompany ? (
                  <OtpField label="Resolution date" required={isRequired('buyerResolutionDate')}>
                    <input type="date" value={draft.buyerResolutionDate || ''} onChange={update('buyerResolutionDate')} className={FIELD_CLASS} />
                  </OtpField>
                ) : null}
                {buyerIsTrust ? (
                  <OtpField label="Trustee names" className="md:col-span-2" required={isRequired('buyerTrusteeNames')}>
                    <input value={draft.buyerTrusteeNames || ''} onChange={update('buyerTrusteeNames')} placeholder="Names of authorised trustees" className={FIELD_CLASS} />
                  </OtpField>
                ) : null}
                <OtpField label="Authority / resolution" className="md:col-span-2" required={isRequired('buyerAuthorityBasis')}>
                  <input value={draft.buyerAuthorityBasis || ''} onChange={update('buyerAuthorityBasis')} placeholder="Board or trustee resolution details" className={FIELD_CLASS} />
                </OtpField>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 border-t border-[#edf2f7] pt-5">
          <div>
            <h3 className={SECTION_HEADING_CLASS}>Seller</h3>
            <p className="mt-1 text-xs font-medium text-[#6b7d93]">Use the legal seller and signing representative for this offer.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OtpField label="Seller type" required={isRequired('sellerEntityType')}>
              <select value={sellerEntityType} onChange={update('sellerEntityType')} className={FIELD_CLASS}>
                <option value="">Choose seller type</option>
                <option value="individual">Individual</option>
                <option value="company">Company</option>
                <option value="trust">Trust</option>
                <option value="close_corporation">Close corporation</option>
              </select>
            </OtpField>
            <OtpField label="Seller name" required={isRequired('sellerFullName')}>
              <input value={draft.sellerFullName || ''} onChange={update('sellerFullName')} placeholder="Seller legal name" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="ID / registration no." required={isRequired('sellerIdNumber')}>
              <input value={draft.sellerIdNumber || ''} onChange={update('sellerIdNumber')} placeholder="Optional but recommended" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Email">
              <input type="email" value={draft.sellerEmail || ''} onChange={update('sellerEmail')} placeholder="seller@example.com" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Phone">
              <input value={draft.sellerPhone || ''} onChange={update('sellerPhone')} placeholder="+27..." className={FIELD_CLASS} />
            </OtpField>
            {sellerIsIndividual ? (
              <>
                <OtpField label="Marital position" required={isRequired('sellerMaritalRegime')}>
                  <select value={sellerMaritalRegime} onChange={update('sellerMaritalRegime')} className={FIELD_CLASS}>
                    <option value="">Choose marital position</option>
                    <option value="single">Single / not married</option>
                    <option value="out_of_community">Married out of community</option>
                    <option value="in_community">Married in community</option>
                  </select>
                </OtpField>
                {sellerNeedsSpouse ? (
                  <>
                    <OtpField label="Spouse full name" required={isRequired('sellerSpouseFullName')}>
                      <input value={draft.sellerSpouseFullName || ''} onChange={update('sellerSpouseFullName')} placeholder="Full legal name" className={FIELD_CLASS} />
                    </OtpField>
                    <OtpField label="Spouse ID number" required={isRequired('sellerSpouseIdNumber')}>
                      <input value={draft.sellerSpouseIdNumber || ''} onChange={update('sellerSpouseIdNumber')} placeholder="South African ID or passport" className={FIELD_CLASS} />
                    </OtpField>
                    <OtpField label="Spouse email" required={isRequired('sellerSpouseEmail')}>
                      <input type="email" value={draft.sellerSpouseEmail || ''} onChange={update('sellerSpouseEmail')} placeholder="spouse@example.com" className={FIELD_CLASS} />
                    </OtpField>
                  </>
                ) : null}
              </>
            ) : sellerIsCompany || sellerIsTrust ? (
              <>
                <OtpField label="Representative" required={isRequired('sellerRepresentativeName')}>
                  <input value={draft.sellerRepresentativeName || ''} onChange={update('sellerRepresentativeName')} placeholder="For company or trust" className={FIELD_CLASS} />
                </OtpField>
                <OtpField label="Capacity" required={isRequired('sellerRepresentativeCapacity')}>
                  <input value={draft.sellerRepresentativeCapacity || ''} onChange={update('sellerRepresentativeCapacity')} placeholder="Director, trustee..." className={FIELD_CLASS} />
                </OtpField>
                {sellerIsCompany ? (
                  <OtpField label="Resolution date" required={isRequired('sellerResolutionDate')}>
                    <input type="date" value={draft.sellerResolutionDate || ''} onChange={update('sellerResolutionDate')} className={FIELD_CLASS} />
                  </OtpField>
                ) : null}
                {sellerIsTrust ? (
                  <OtpField label="Trustee names" className="md:col-span-2" required={isRequired('sellerTrusteeNames')}>
                    <input value={draft.sellerTrusteeNames || ''} onChange={update('sellerTrusteeNames')} placeholder="Names of authorised trustees" className={FIELD_CLASS} />
                  </OtpField>
                ) : null}
                <OtpField label="Authority / resolution" className="md:col-span-2" required={isRequired('sellerAuthorityBasis')}>
                  <input value={draft.sellerAuthorityBasis || ''} onChange={update('sellerAuthorityBasis')} placeholder="Board or trustee resolution details" className={FIELD_CLASS} />
                </OtpField>
              </>
            ) : null}
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
            <OtpField label="Property address" className="md:col-span-2" required={isRequired('propertyAddress')}>
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
            <OtpField label="Title type" required={isRequired('propertyTitleType')}>
              <select value={propertyTitleType} onChange={update('propertyTitleType')} className={FIELD_CLASS}>
                <option value="">Choose title type</option>
                <option value="full_title">Full title</option>
                <option value="sectional_title">Sectional title</option>
              </select>
            </OtpField>
            {propertyTitleType === 'sectional_title' ? (
              <>
                <OtpField label="Unit / section number" required={isRequired('unitNumber')}>
                  <input value={draft.unitNumber || ''} onChange={update('unitNumber')} placeholder="Section number" className={FIELD_CLASS} />
                </OtpField>
                <OtpField label="Scheme / complex" required={isRequired('complexName')}>
                  <input value={draft.complexName || ''} onChange={update('complexName')} placeholder="Registered scheme name" className={FIELD_CLASS} />
                </OtpField>
              </>
            ) : propertyTitleType === 'full_title' ? (
              <OtpField label="Erf number" required={isRequired('erfNumber')}>
                <input value={draft.erfNumber || ''} onChange={update('erfNumber')} placeholder="Registered erf number" className={FIELD_CLASS} />
              </OtpField>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 border-t border-[#edf2f7] pt-5">
          <div>
            <h3 className={SECTION_HEADING_CLASS}>Commercial terms</h3>
            <p className="mt-1 text-xs font-medium text-[#6b7d93]">These values flow into the draft before signature preparation.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OtpField label="Purchase price" required={isRequired('purchasePrice')}>
              <input type="number" min="0" step="1000" value={draft.purchasePrice || ''} onChange={update('purchasePrice')} placeholder="0" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Deposit">
              <input type="number" min="0" step="1000" value={draft.depositAmount || ''} onChange={update('depositAmount')} placeholder="Optional" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Finance type" required={isRequired('financeType')}>
              <select value={financeType} onChange={update('financeType')} className={FIELD_CLASS}>
                <option value="">Choose finance type</option>
                <option value="cash">Cash</option>
                <option value="bond">Bond</option>
                <option value="combination">Cash and bond</option>
              </select>
            </OtpField>
            {['bond', 'combination'].includes(financeType) ? (
              <OtpField label="Bond amount" required={isRequired('bondAmount')}>
                <input type="number" min="0" step="1000" value={draft.bondAmount || ''} onChange={update('bondAmount')} placeholder="Bond amount" className={FIELD_CLASS} />
              </OtpField>
            ) : null}
            {['cash', 'combination'].includes(financeType) ? (
              <OtpField label={financeType === 'cash' ? 'Cash purchase amount' : 'Cash contribution'} required={isRequired('cashAmount')}>
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
          Complete the required fields above before generating this OTP.
        </p>
      ) : (
        <p className="mt-5 text-sm font-semibold text-[#20895a]">
          Core OTP details are ready for draft generation.
        </p>
      )}
    </section>
  )
}
