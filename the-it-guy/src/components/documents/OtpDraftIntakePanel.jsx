import { cloneElement, isValidElement } from 'react'
import { CheckCircle2, CircleAlert, RotateCcw } from 'lucide-react'
import {
  normalizeLegalMaritalRegime,
  normalizeLegalPropertyTitleType,
  resolveLegalDocumentScenarioProfile,
} from '../../core/documents/legalDocumentScenarioProfile'
import { resolveLegalDocumentScenarioRequirements } from '../../core/documents/legalDocumentScenarioRequirements'
import {
  LEGAL_FACT_DEPOSIT_HOLDER_OPTIONS,
  LEGAL_FACT_VAT_STATUS_OPTIONS,
  LEGAL_FACT_VAT_TREATMENT_OPTIONS,
  LEGAL_FACT_YES_NO_UNKNOWN_OPTIONS,
  buildSouthAfricanLegalDealFacts,
} from '../../core/documents/southAfricanLegalDealFacts'
import {
  LEGAL_INSTRUMENT_FAMILIES,
  LEGAL_INSTRUMENT_FAMILY_DEFINITIONS,
} from '../../core/documents/legalInstrumentFamilyRouter'
import { resolveSouthAfricanLegalClausePacks } from '../../core/documents/southAfricanLegalClausePacks'
import { resolveLegalClausePackTransactionReadiness } from '../../core/documents/legalClausePackTransactionReadiness'
import Button from '../ui/Button'
import { OtpClausePackReadinessPanel } from './OtpClausePackReadinessPanel'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

const FIELD_CLASS = 'min-h-11 w-full rounded-xl border border-[#dbe6f2] bg-white px-3 text-sm font-semibold text-[#102033] outline-none transition placeholder:text-[#9aabba] focus:border-[#0a66ff]'
const LABEL_CLASS = 'text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]'
const SECTION_HEADING_CLASS = 'text-sm font-semibold text-[#142132]'
const OTP_INSTRUMENT_FAMILY_OPTIONS = LEGAL_INSTRUMENT_FAMILY_DEFINITIONS.filter((definition) => definition.packetTypes.includes('otp'))

function getSourceModeLabel(sourceMode = '') {
  const key = normalizeKey(sourceMode)
  if (key === 'manual_details') return 'Manual details'
  if (key === 'send_onboarding') return 'Buyer onboarding'
  if (key === 'saved_details') return 'Saved details'
  return 'Draft details'
}

function buildReadinessChecks(requirements = {}) {
  return (requirements.groups || []).map((group) => ({
    key: group.key,
    label: group.label,
    complete: group.complete,
    missing: group.fields.filter((field) => field.missing).map((field) => field.label).slice(0, 2).join(', '),
  }))
}

function OtpField({ label, children, className = '', fieldKey = '', missing = false }) {
  const control = fieldKey && isValidElement(children)
    ? cloneElement(children, {
        'aria-invalid': missing || undefined,
        'data-otp-field': fieldKey,
        className: `${children.props.className || ''} ${missing ? 'border-[#dc735c] bg-[#fffaf8]' : ''}`.trim(),
      })
    : children
  return (
    <label className={`grid min-w-0 gap-1.5 ${className}`}>
      <span className={missing ? `${LABEL_CLASS} text-[#a43b27]` : LABEL_CLASS}>{label}</span>
      {control}
      {missing ? <span className="text-[0.68rem] font-medium text-[#a43b27]">Required for this OTP</span> : null}
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
  const legalDealFacts = buildSouthAfricanLegalDealFacts({ draft })
  const legalClausePackResolution = resolveSouthAfricanLegalClausePacks(legalDealFacts)
  const transactionReadiness = resolveLegalClausePackTransactionReadiness({
    draft,
    facts: legalDealFacts,
    resolution: legalClausePackResolution,
  })
  const missingFieldKeys = new Set(transactionReadiness.missingFields.map((issue) => issue.fieldKey))
  const selectedInstrumentFamily = legalDealFacts.instrument.familyKey || LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_RESALE
  const selectedInstrumentDefinition = OTP_INSTRUMENT_FAMILY_OPTIONS.find((definition) => definition.key === selectedInstrumentFamily)
  const legalReviewItems = legalClausePackResolution.reviewItems || []
  const legalClauseConflicts = legalClausePackResolution.conflicts || []
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
  const readinessChecks = buildReadinessChecks(requirements)
  const navigateToReadinessIssue = (issue) => {
    const field = document.querySelector(`[data-otp-field="${issue.fieldKey}"]`)
    const section = document.getElementById(`otp-section-${issue.sectionKey}`)
    const target = field || section
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (field && typeof field.focus === 'function') window.setTimeout(() => field.focus(), 300)
  }
  const update = (field) => (event) => {
    const value = event.target.value
    onFieldChange?.(field, value)
    if (field === 'purchasePrice' && financeType === 'cash' && (!draft.cashAmount || draft.cashAmount === draft.purchasePrice)) {
      onFieldChange?.('cashAmount', value)
    }
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
    if (field === 'buyerMaritalRegime' && (!value || value === 'single')) {
      onFieldChange?.('buyerForeignMarriage', 'no')
      onFieldChange?.('buyerMarriageCountry', '')
    }
    if (field === 'sellerMaritalRegime' && value !== 'in_community') {
      for (const dependentField of ['sellerSpouseFullName', 'sellerSpouseIdNumber', 'sellerSpouseEmail']) onFieldChange?.(dependentField, '')
    }
    if (field === 'sellerMaritalRegime' && (!value || value === 'single')) {
      onFieldChange?.('sellerForeignMarriage', 'no')
      onFieldChange?.('sellerMarriageCountry', '')
    }
    if (field === 'propertyTitleType' && value === 'full_title') {
      onFieldChange?.('unitNumber', '')
      onFieldChange?.('complexName', '')
    }
    if (field === 'propertyTitleType' && value === 'sectional_title') onFieldChange?.('erfNumber', '')
    if (field === 'propertyTitleType' && value === 'share_block') {
      onFieldChange?.('legalInstrumentFamily', LEGAL_INSTRUMENT_FAMILIES.SHARE_BLOCK_LIFE_RIGHT)
    }
    if (field === 'propertyTitleType' && value === 'agricultural_holding') {
      onFieldChange?.('legalInstrumentFamily', LEGAL_INSTRUMENT_FAMILIES.AGRICULTURAL_SALE)
    }
    if (field === 'financeType' && value === 'cash') {
      onFieldChange?.('bondAmount', '')
      if (!draft.cashAmount && draft.purchasePrice) onFieldChange?.('cashAmount', draft.purchasePrice)
    }
    if (field === 'financeType' && value === 'bond') onFieldChange?.('cashAmount', '')
    if (field === 'propertyInEstateOrHoa' && value !== 'yes') onFieldChange?.('propertyEstateOrHoaName', '')
    if (field === 'existingLease' && value !== 'yes') onFieldChange?.('leaseExpiryDate', '')
    if (field === 'saleOfExistingPropertyCondition' && value !== 'yes') onFieldChange?.('linkedSaleDeadline', '')
    if (field === 'occupationBeforeTransfer' && value !== 'yes') onFieldChange?.('occupationalRent', '')
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

      <OtpClausePackReadinessPanel
        readiness={transactionReadiness}
        onNavigate={navigateToReadinessIssue}
      />

      <div className="mt-5 grid gap-3 rounded-[18px] border border-[#dbe6f2] bg-[#fbfdff] p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-end">
        <OtpField label="Agreement type">
          <select value={selectedInstrumentFamily} onChange={update('legalInstrumentFamily')} className={FIELD_CLASS}>
            {OTP_INSTRUMENT_FAMILY_OPTIONS.map((definition) => (
              <option key={definition.key} value={definition.key}>{definition.label}</option>
            ))}
          </select>
        </OtpField>
        <div className={`rounded-xl border px-4 py-3 text-sm leading-5 ${
          legalDealFacts.instrument.generationAllowed
            ? 'border-[#d8f0e3] bg-[#effaf4] text-[#20724e]'
            : 'border-[#fde4c7] bg-[#fff8ed] text-[#8d551c]'
        }`}>
          {legalDealFacts.instrument.generationAllowed
            ? 'This agreement family can use the automated residential resale template route.'
            : `${selectedInstrumentDefinition?.label || 'This agreement'} is recognised, but needs an attorney-approved family template before final generation.`}
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
        <div id="otp-section-buyer" className="grid scroll-mt-24 gap-3 border-t border-[#edf2f7] pt-5">
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
            <OtpField label="Buyer name" fieldKey="buyerFullName" missing={missingFieldKeys.has('buyerFullName')}>
              <input value={draft.buyerFullName || ''} onChange={update('buyerFullName')} placeholder="Full name or entity name" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="ID / registration no." fieldKey="buyerIdNumber" missing={missingFieldKeys.has('buyerIdNumber')}>
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
                <OtpField label="Marital position" fieldKey="buyerMaritalRegime" missing={missingFieldKeys.has('buyerMaritalRegime')}>
                  <select value={buyerMaritalRegime} onChange={update('buyerMaritalRegime')} className={FIELD_CLASS}>
                    <option value="">Choose marital position</option>
                    <option value="single">Single / not married</option>
                    <option value="out_of_community">Married out of community</option>
                    <option value="in_community">Married in community</option>
                  </select>
                </OtpField>
                {buyerMaritalRegime && buyerMaritalRegime !== 'single' ? (
                  <>
                    <OtpField label="Marriage governed outside SA?" fieldKey="buyerForeignMarriage" missing={missingFieldKeys.has('buyerForeignMarriage')}>
                      <select value={draft.buyerForeignMarriage || 'unknown'} onChange={update('buyerForeignMarriage')} className={FIELD_CLASS}>
                        {LEGAL_FACT_YES_NO_UNKNOWN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </OtpField>
                    {draft.buyerForeignMarriage === 'yes' ? (
                      <OtpField label="Country of marriage" fieldKey="buyerMarriageCountry" missing={missingFieldKeys.has('buyerMarriageCountry')}>
                        <input value={draft.buyerMarriageCountry || ''} onChange={update('buyerMarriageCountry')} placeholder="Country" className={FIELD_CLASS} />
                      </OtpField>
                    ) : null}
                  </>
                ) : null}
                {buyerMaritalRegime === 'in_community' ? (
                  <>
                    <OtpField label="Spouse full name" fieldKey="buyerSpouseFullName" missing={missingFieldKeys.has('buyerSpouseFullName')}>
                      <input value={draft.buyerSpouseFullName || ''} onChange={update('buyerSpouseFullName')} placeholder="Full legal name" className={FIELD_CLASS} />
                    </OtpField>
                    <OtpField label="Spouse ID number" fieldKey="buyerSpouseIdNumber" missing={missingFieldKeys.has('buyerSpouseIdNumber')}>
                      <input value={draft.buyerSpouseIdNumber || ''} onChange={update('buyerSpouseIdNumber')} placeholder="South African ID or passport" className={FIELD_CLASS} />
                    </OtpField>
                    <OtpField label="Spouse email" fieldKey="buyerSpouseEmail" missing={missingFieldKeys.has('buyerSpouseEmail')}>
                      <input type="email" value={draft.buyerSpouseEmail || ''} onChange={update('buyerSpouseEmail')} placeholder="spouse@example.com" className={FIELD_CLASS} />
                    </OtpField>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <OtpField label="Representative" fieldKey="buyerRepresentativeName" missing={missingFieldKeys.has('buyerRepresentativeName')}>
                  <input value={draft.buyerRepresentativeName || ''} onChange={update('buyerRepresentativeName')} placeholder="Director, trustee..." className={FIELD_CLASS} />
                </OtpField>
                <OtpField label="Capacity" fieldKey="buyerRepresentativeCapacity" missing={missingFieldKeys.has('buyerRepresentativeCapacity')}>
                  <input value={draft.buyerRepresentativeCapacity || ''} onChange={update('buyerRepresentativeCapacity')} placeholder="Signing capacity" className={FIELD_CLASS} />
                </OtpField>
                {buyerEntityType === 'company' ? (
                  <OtpField label="Resolution date" fieldKey="buyerResolutionDate" missing={missingFieldKeys.has('buyerResolutionDate')}>
                    <input type="date" value={draft.buyerResolutionDate || ''} onChange={update('buyerResolutionDate')} className={FIELD_CLASS} />
                  </OtpField>
                ) : null}
                {buyerEntityType === 'trust' ? (
                  <OtpField label="Trustee names" className="md:col-span-2" fieldKey="buyerTrusteeNames" missing={missingFieldKeys.has('buyerTrusteeNames')}>
                    <input value={draft.buyerTrusteeNames || ''} onChange={update('buyerTrusteeNames')} placeholder="Names of authorised trustees" className={FIELD_CLASS} />
                  </OtpField>
                ) : null}
                <OtpField label="Authority / resolution" className="md:col-span-2" fieldKey="buyerAuthorityBasis" missing={missingFieldKeys.has('buyerAuthorityBasis')}>
                  <input value={draft.buyerAuthorityBasis || ''} onChange={update('buyerAuthorityBasis')} placeholder="Board or trustee resolution details" className={FIELD_CLASS} />
                </OtpField>
              </>
            )}
          </div>
        </div>

        <div id="otp-section-seller" className="grid scroll-mt-24 gap-3 border-t border-[#edf2f7] pt-5">
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
            <OtpField label="Seller name" fieldKey="sellerFullName" missing={missingFieldKeys.has('sellerFullName')}>
              <input value={draft.sellerFullName || ''} onChange={update('sellerFullName')} placeholder="Seller legal name" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="ID / registration no." fieldKey="sellerIdNumber" missing={missingFieldKeys.has('sellerIdNumber')}>
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
                <OtpField label="Marital position" fieldKey="sellerMaritalRegime" missing={missingFieldKeys.has('sellerMaritalRegime')}>
                  <select value={sellerMaritalRegime} onChange={update('sellerMaritalRegime')} className={FIELD_CLASS}>
                    <option value="">Choose marital position</option>
                    <option value="single">Single / not married</option>
                    <option value="out_of_community">Married out of community</option>
                    <option value="in_community">Married in community</option>
                  </select>
                </OtpField>
                {sellerMaritalRegime && sellerMaritalRegime !== 'single' ? (
                  <>
                    <OtpField label="Marriage governed outside SA?" fieldKey="sellerForeignMarriage" missing={missingFieldKeys.has('sellerForeignMarriage')}>
                      <select value={draft.sellerForeignMarriage || 'unknown'} onChange={update('sellerForeignMarriage')} className={FIELD_CLASS}>
                        {LEGAL_FACT_YES_NO_UNKNOWN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </OtpField>
                    {draft.sellerForeignMarriage === 'yes' ? (
                      <OtpField label="Country of marriage" fieldKey="sellerMarriageCountry" missing={missingFieldKeys.has('sellerMarriageCountry')}>
                        <input value={draft.sellerMarriageCountry || ''} onChange={update('sellerMarriageCountry')} placeholder="Country" className={FIELD_CLASS} />
                      </OtpField>
                    ) : null}
                  </>
                ) : null}
                {sellerMaritalRegime === 'in_community' ? (
                  <>
                    <OtpField label="Spouse full name" fieldKey="sellerSpouseFullName" missing={missingFieldKeys.has('sellerSpouseFullName')}>
                      <input value={draft.sellerSpouseFullName || ''} onChange={update('sellerSpouseFullName')} placeholder="Full legal name" className={FIELD_CLASS} />
                    </OtpField>
                    <OtpField label="Spouse ID number" fieldKey="sellerSpouseIdNumber" missing={missingFieldKeys.has('sellerSpouseIdNumber')}>
                      <input value={draft.sellerSpouseIdNumber || ''} onChange={update('sellerSpouseIdNumber')} placeholder="South African ID or passport" className={FIELD_CLASS} />
                    </OtpField>
                    <OtpField label="Spouse email" fieldKey="sellerSpouseEmail" missing={missingFieldKeys.has('sellerSpouseEmail')}>
                      <input type="email" value={draft.sellerSpouseEmail || ''} onChange={update('sellerSpouseEmail')} placeholder="spouse@example.com" className={FIELD_CLASS} />
                    </OtpField>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <OtpField label="Representative" fieldKey="sellerRepresentativeName" missing={missingFieldKeys.has('sellerRepresentativeName')}>
                  <input value={draft.sellerRepresentativeName || ''} onChange={update('sellerRepresentativeName')} placeholder="For company or trust" className={FIELD_CLASS} />
                </OtpField>
                <OtpField label="Capacity" fieldKey="sellerRepresentativeCapacity" missing={missingFieldKeys.has('sellerRepresentativeCapacity')}>
                  <input value={draft.sellerRepresentativeCapacity || ''} onChange={update('sellerRepresentativeCapacity')} placeholder="Director, trustee..." className={FIELD_CLASS} />
                </OtpField>
                {['company', 'close_corporation'].includes(sellerEntityType) ? (
                  <OtpField label="Resolution date" fieldKey="sellerResolutionDate" missing={missingFieldKeys.has('sellerResolutionDate')}>
                    <input type="date" value={draft.sellerResolutionDate || ''} onChange={update('sellerResolutionDate')} className={FIELD_CLASS} />
                  </OtpField>
                ) : null}
                {sellerEntityType === 'trust' ? (
                  <OtpField label="Trustee names" className="md:col-span-2" fieldKey="sellerTrusteeNames" missing={missingFieldKeys.has('sellerTrusteeNames')}>
                    <input value={draft.sellerTrusteeNames || ''} onChange={update('sellerTrusteeNames')} placeholder="Names of authorised trustees" className={FIELD_CLASS} />
                  </OtpField>
                ) : null}
                <OtpField label="Authority / resolution" className="md:col-span-2" fieldKey="sellerAuthorityBasis" missing={missingFieldKeys.has('sellerAuthorityBasis')}>
                  <input value={draft.sellerAuthorityBasis || ''} onChange={update('sellerAuthorityBasis')} placeholder="Board or trustee resolution details" className={FIELD_CLASS} />
                </OtpField>
              </>
            )}
            <OtpField label="Registered address">
              <input value={draft.sellerRegisteredAddress || ''} onChange={update('sellerRegisteredAddress')} placeholder="Address for notices" className={FIELD_CLASS} />
            </OtpField>
          </div>
        </div>

        <div id="otp-section-property" className="grid scroll-mt-24 gap-3 border-t border-[#edf2f7] pt-5">
          <div>
            <h3 className={SECTION_HEADING_CLASS}>Property</h3>
            <p className="mt-1 text-xs font-medium text-[#6b7d93]">Confirm the property that the buyer is offering to purchase.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OtpField label="Property address" className="md:col-span-2" fieldKey="propertyAddress" missing={missingFieldKeys.has('propertyAddress')}>
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
                <option value="share_block">Share block / life right</option>
                <option value="agricultural_holding">Agricultural holding / farm</option>
              </select>
            </OtpField>
            {['sectional_title', 'share_block'].includes(propertyTitleType) ? (
              <>
                <OtpField label="Unit / section number" fieldKey="unitNumber" missing={missingFieldKeys.has('unitNumber')}>
                  <input value={draft.unitNumber || ''} onChange={update('unitNumber')} placeholder="Section number" className={FIELD_CLASS} />
                </OtpField>
                <OtpField label="Scheme / complex" fieldKey="complexName" missing={missingFieldKeys.has('complexName')}>
                  <input value={draft.complexName || ''} onChange={update('complexName')} placeholder="Registered scheme name" className={FIELD_CLASS} />
                </OtpField>
              </>
            ) : (
              <OtpField label="Erf number" fieldKey="erfNumber" missing={missingFieldKeys.has('erfNumber')}>
                <input value={draft.erfNumber || ''} onChange={update('erfNumber')} placeholder="Registered erf number" className={FIELD_CLASS} />
              </OtpField>
            )}
            <OtpField label="Estate / HOA rules apply?" fieldKey="propertyInEstateOrHoa" missing={missingFieldKeys.has('propertyInEstateOrHoa')}>
              <select value={draft.propertyInEstateOrHoa || 'unknown'} onChange={update('propertyInEstateOrHoa')} className={FIELD_CLASS}>
                {LEGAL_FACT_YES_NO_UNKNOWN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </OtpField>
            {draft.propertyInEstateOrHoa === 'yes' ? (
              <OtpField label="Estate / HOA name" fieldKey="propertyEstateOrHoaName" missing={missingFieldKeys.has('propertyEstateOrHoaName')}>
                <input value={draft.propertyEstateOrHoaName || ''} onChange={update('propertyEstateOrHoaName')} placeholder="Registered estate or association" className={FIELD_CLASS} />
              </OtpField>
            ) : null}
            {['sectional_title', 'share_block'].includes(propertyTitleType) ? (
              <OtpField label="Exclusive-use areas?" fieldKey="propertyExclusiveUseAreas" missing={missingFieldKeys.has('propertyExclusiveUseAreas')}>
                <select value={draft.propertyExclusiveUseAreas || 'unknown'} onChange={update('propertyExclusiveUseAreas')} className={FIELD_CLASS}>
                  {LEGAL_FACT_YES_NO_UNKNOWN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </OtpField>
            ) : null}
          </div>
        </div>

        <div id="otp-section-terms" className="grid scroll-mt-24 gap-3 border-t border-[#edf2f7] pt-5">
          <div>
            <h3 className={SECTION_HEADING_CLASS}>Commercial terms</h3>
            <p className="mt-1 text-xs font-medium text-[#6b7d93]">These values flow into the draft before signature preparation.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OtpField label="Purchase price" fieldKey="purchasePrice" missing={missingFieldKeys.has('purchasePrice')}>
              <input type="number" min="0" step="1000" value={draft.purchasePrice || ''} onChange={update('purchasePrice')} placeholder="0" className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Deposit">
              <input type="number" min="0" step="1000" value={draft.depositAmount || ''} onChange={update('depositAmount')} placeholder="Optional" className={FIELD_CLASS} />
            </OtpField>
            {Number(draft.depositAmount || 0) > 0 ? (
              <OtpField label="Who holds the deposit?" fieldKey="depositHolder" missing={missingFieldKeys.has('depositHolder')}>
                <select value={draft.depositHolder || 'unknown'} onChange={update('depositHolder')} className={FIELD_CLASS}>
                  {LEGAL_FACT_DEPOSIT_HOLDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </OtpField>
            ) : null}
            <OtpField label="Finance type">
              <select value={financeType} onChange={update('financeType')} className={FIELD_CLASS}>
                <option value="cash">Cash</option>
                <option value="bond">Bond</option>
                <option value="combination">Cash and bond</option>
              </select>
            </OtpField>
            {['bond', 'combination'].includes(financeType) ? (
              <>
                <OtpField label="Bond amount" fieldKey="bondAmount" missing={missingFieldKeys.has('bondAmount')}>
                  <input type="number" min="0" step="1000" value={draft.bondAmount || ''} onChange={update('bondAmount')} placeholder="Bond amount" className={FIELD_CLASS} />
                </OtpField>
                <OtpField label="Bond approval deadline" fieldKey="bondApprovalDeadline" missing={missingFieldKeys.has('bondApprovalDeadline')}>
                  <input type="date" value={draft.bondApprovalDeadline || ''} onChange={update('bondApprovalDeadline')} className={FIELD_CLASS} />
                </OtpField>
              </>
            ) : null}
            {['cash', 'combination'].includes(financeType) ? (
              <OtpField label={financeType === 'cash' ? 'Cash purchase amount' : 'Cash contribution'} fieldKey="cashAmount" missing={missingFieldKeys.has('cashAmount')}>
                <input type="number" min="0" step="1000" value={draft.cashAmount || ''} onChange={update('cashAmount')} placeholder={financeType === 'cash' ? 'Cash purchase amount' : 'Cash contribution'} className={FIELD_CLASS} />
              </OtpField>
            ) : null}
            <OtpField label="Occupation date">
              <input type="date" value={draft.occupationDate || ''} onChange={update('occupationDate')} className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Occupation before transfer?" fieldKey="occupationBeforeTransfer" missing={missingFieldKeys.has('occupationBeforeTransfer')}>
              <select value={draft.occupationBeforeTransfer || 'unknown'} onChange={update('occupationBeforeTransfer')} className={FIELD_CLASS}>
                {LEGAL_FACT_YES_NO_UNKNOWN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </OtpField>
            {draft.occupationBeforeTransfer === 'yes' ? (
              <OtpField label="Occupational rent per month" fieldKey="occupationalRent" missing={missingFieldKeys.has('occupationalRent')}>
                <input type="number" min="0" step="100" value={draft.occupationalRent || ''} onChange={update('occupationalRent')} placeholder="0" className={FIELD_CLASS} />
              </OtpField>
            ) : null}
            <OtpField label="Transfer date">
              <input type="date" value={draft.transferDate || ''} onChange={update('transferDate')} className={FIELD_CLASS} />
            </OtpField>
            <OtpField label="Existing lease / occupier?" fieldKey="existingLease" missing={missingFieldKeys.has('existingLease')}>
              <select value={draft.existingLease || 'unknown'} onChange={update('existingLease')} className={FIELD_CLASS}>
                {LEGAL_FACT_YES_NO_UNKNOWN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </OtpField>
            {draft.existingLease === 'yes' ? (
              <OtpField label="Lease expiry date" fieldKey="leaseExpiryDate" missing={missingFieldKeys.has('leaseExpiryDate')}>
                <input type="date" value={draft.leaseExpiryDate || ''} onChange={update('leaseExpiryDate')} className={FIELD_CLASS} />
              </OtpField>
            ) : null}
            <OtpField label="Subject to buyer selling another property?" fieldKey="saleOfExistingPropertyCondition" missing={missingFieldKeys.has('saleOfExistingPropertyCondition')}>
              <select value={draft.saleOfExistingPropertyCondition || 'unknown'} onChange={update('saleOfExistingPropertyCondition')} className={FIELD_CLASS}>
                {LEGAL_FACT_YES_NO_UNKNOWN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </OtpField>
            {draft.saleOfExistingPropertyCondition === 'yes' ? (
              <OtpField label="Linked-sale deadline" fieldKey="linkedSaleDeadline" missing={missingFieldKeys.has('linkedSaleDeadline')}>
                <input type="date" value={draft.linkedSaleDeadline || ''} onChange={update('linkedSaleDeadline')} className={FIELD_CLASS} />
              </OtpField>
            ) : null}
            <OtpField label="Seller VAT status" fieldKey="sellerVatStatus" missing={missingFieldKeys.has('sellerVatStatus')}>
              <select value={draft.sellerVatStatus || 'unknown'} onChange={update('sellerVatStatus')} className={FIELD_CLASS}>
                {LEGAL_FACT_VAT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </OtpField>
            <OtpField label="VAT / transfer-duty treatment" fieldKey="vatTreatment" missing={missingFieldKeys.has('vatTreatment')}>
              <select value={draft.vatTreatment || 'unknown'} onChange={update('vatTreatment')} className={FIELD_CLASS}>
                {LEGAL_FACT_VAT_TREATMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </OtpField>
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

      {!transactionReadiness.canGenerate ? (
        <p className="mt-5 text-sm font-medium text-[#9a5b1d]">
          Complete the highlighted deal details before generating this OTP. This prevents the wrong clause wording from being assembled.
        </p>
      ) : (
        <p className="mt-5 text-sm font-semibold text-[#20895a]">
          The selected clause groups and their transaction details are ready for draft generation.
        </p>
      )}
      {legalClausePackResolution.activePacks.length ? (
        <div className="mt-4 rounded-[16px] border border-[#d8e9df] bg-[#f5fbf7] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#287454]">What the OTP will include</p>
              <p className="mt-1 text-sm text-[#557264]">Bridge selected these clause groups from the answers above.</p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              transactionReadiness.canSendForSignature
                ? 'border-[#bfe2cc] bg-white text-[#20724e]'
                : 'border-[#f1d8a8] bg-[#fffaf1] text-[#8d5d18]'
            }`}>
              {transactionReadiness.canSendForSignature ? 'Ready for legal checks' : 'Review still needed'}
            </span>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {legalClausePackResolution.activePacks.map((pack) => (
              <li key={pack.key} className="rounded-xl border border-[#dcebe2] bg-white px-3 py-2 text-sm text-[#315e48]">
                <span className="font-semibold">{pack.label}</span>
                <span className="mt-0.5 block text-xs text-[#678373]">{pack.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {legalClauseConflicts.length ? (
        <div className="mt-4 rounded-[16px] border border-[#f3d1ce] bg-[#fff6f5] px-4 py-3" role="alert">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#a42a20]">Answers that conflict</p>
          <ul className="mt-2 grid gap-1 text-sm text-[#81261e]">
            {legalClauseConflicts.map((conflict) => <li key={conflict.code}>• {conflict.message}</li>)}
          </ul>
        </div>
      ) : null}
      {legalReviewItems.length ? (
        <div className="mt-4 rounded-[16px] border border-[#fde4c7] bg-[#fff9f0] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8d551c]">Still to confirm</p>
          <ul className="mt-2 grid gap-1 text-sm text-[#76502b]">
            {legalReviewItems.map((item) => <li key={item.code}>• {item.message}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
