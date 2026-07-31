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
const MISSING_FIELD_CLASS = 'border-[#f2a995] bg-[#fff8f6] ring-2 ring-[#fde4de] focus:border-[#b64d32] focus:ring-[#f2a995]'
const LABEL_CLASS = 'text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]'
const SECTION_HEADING_CLASS = 'text-sm font-semibold text-[#142132]'
const READY_GROUPS = Object.freeze([
  { key: 'buyer', label: 'Buyer details', groups: ['Buyer', 'Buyer authority', 'Buyer spouse'] },
  { key: 'seller', label: 'Seller details', groups: ['Seller', 'Seller authority', 'Seller spouse'] },
  { key: 'property', label: 'Property details', groups: ['Property', 'Sectional title', 'Full title'] },
  { key: 'finance', label: 'Finance terms', groups: ['Finance'] },
])
const SECTION_DETAILS = Object.freeze({
  buyer: {
    title: 'Buyer',
    description: 'Capture the purchaser exactly as it should appear in the OTP.',
  },
  seller: {
    title: 'Seller',
    description: 'Use the legal seller and signing representative for this offer.',
  },
  property: {
    title: 'Property',
    description: 'Confirm the property that the buyer is offering to purchase.',
  },
  finance: {
    title: 'Commercial terms',
    description: 'These values flow into the draft before signature preparation.',
  },
})
const ROUTING_FACT_LABELS = Object.freeze({
  seller_entity_type: 'Choose the seller type.',
  seller_marital_regime: 'Choose the seller marital position.',
  buyer_entity_type: 'Choose the buyer type.',
  buyer_marital_regime: 'Choose the buyer marital position.',
  property_title_type: 'Choose the property title type.',
  finance_type: 'Choose the finance type.',
})
const ROUTING_FACT_FIELD_KEYS = Object.freeze({
  seller_entity_type: 'sellerEntityType',
  seller_marital_regime: 'sellerMaritalRegime',
  buyer_entity_type: 'buyerEntityType',
  buyer_marital_regime: 'buyerMaritalRegime',
  property_title_type: 'propertyTitleType',
  finance_type: 'financeType',
})
const FIELD_ACTION_LABELS = Object.freeze({
  sellerFullName: 'Add the seller legal name.',
  sellerIdNumber: 'Add the seller ID or registration number.',
  sellerMaritalRegime: 'Choose the seller marital position.',
  sellerRepresentativeName: 'Add the seller representative.',
  sellerRepresentativeCapacity: 'Add the seller representative capacity.',
  sellerResolutionDate: 'Add the seller resolution date.',
  sellerTrusteeNames: 'Add the seller trustee names.',
  sellerAuthorityBasis: 'Add the seller authority or resolution.',
  sellerSpouseFullName: 'Add the seller spouse name.',
  sellerSpouseIdNumber: 'Add the seller spouse ID number.',
  sellerSpouseEmail: 'Add the seller spouse email.',
  buyerFullName: 'Add the buyer legal name.',
  buyerIdNumber: 'Add the buyer ID or registration number.',
  buyerMaritalRegime: 'Choose the buyer marital position.',
  buyerRepresentativeName: 'Add the buyer representative.',
  buyerRepresentativeCapacity: 'Add the buyer representative capacity.',
  buyerResolutionDate: 'Add the buyer resolution date.',
  buyerTrusteeNames: 'Add the buyer trustee names.',
  buyerAuthorityBasis: 'Add the buyer authority or resolution.',
  buyerSpouseFullName: 'Add the buyer spouse name.',
  buyerSpouseIdNumber: 'Add the buyer spouse ID number.',
  buyerSpouseEmail: 'Add the buyer spouse email.',
  propertyAddress: 'Add the property address.',
  propertyTitleType: 'Choose the property title type.',
  unitNumber: 'Add the section or unit number.',
  complexName: 'Add the scheme or complex name.',
  erfNumber: 'Add the title, ERF, or portion number.',
  purchasePrice: 'Add the purchase price.',
  bondAmount: 'Add the bond amount.',
  cashAmount: 'Add the cash amount.',
})

function getSourceModeLabel(sourceMode = '') {
  const key = normalizeKey(sourceMode)
  if (key === 'manual_details') return 'Manual details'
  if (key === 'send_onboarding') return 'Buyer onboarding'
  if (key === 'saved_details') return 'Saved details'
  return 'Draft details'
}

function formatOtpMoney(value = '') {
  const text = normalizeText(value)
  if (!text) return 'Not set'
  const number = Number(text)
  if (!Number.isFinite(number)) return text
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(number)
}

function humanizeKey(value = '') {
  return normalizeText(value).replace(/_/g, ' ') || 'Not set'
}

function buildGenerationSummaryItems({ draft = {}, scenarioProfile = {}, propertyTitleType = '', financeType = '' } = {}) {
  const addressParts = [
    draft.propertyAddress,
    draft.propertySuburb,
    draft.propertyCity,
  ].map(normalizeText).filter(Boolean)
  const financeParts = [
    humanizeKey(financeType),
    ['bond', 'combination'].includes(financeType) && draft.bondAmount ? `bond ${formatOtpMoney(draft.bondAmount)}` : '',
    ['cash', 'combination'].includes(financeType) && draft.cashAmount ? `cash ${formatOtpMoney(draft.cashAmount)}` : '',
  ].filter(Boolean)

  return [
    { label: 'Buyer', value: normalizeText(draft.buyerFullName) || 'Not set' },
    { label: 'Seller', value: normalizeText(draft.sellerFullName) || 'Not set' },
    { label: 'Property', value: addressParts.join(', ') || 'Not set' },
    { label: 'Purchase price', value: formatOtpMoney(draft.purchasePrice) },
    { label: 'Finance', value: financeParts.join(' · ') || 'Not set' },
    {
      label: 'Legal route',
      value: [
        scenarioProfile.sellerClauseProfile,
        scenarioProfile.buyerClauseProfile,
        propertyTitleType,
        scenarioProfile.financeClauseProfile,
      ].map(humanizeKey).join(' · '),
    },
  ]
}

function buildGenerationDecision({
  generationReady = false,
  readyCheckCount = 0,
  readinessTotal = 0,
  nextRequiredAction = null,
  signingReadiness = null,
  hasGenerationWorkspaceTarget = false,
} = {}) {
  if (!generationReady) {
    return {
      status: 'blocked',
      label: 'Generation blocked',
      heading: 'Fix the highlighted details before generating.',
      body: nextRequiredAction?.label || 'Complete the required OTP details, then use the Generate action in the workspace below.',
      actionLabel: nextRequiredAction?.fieldKey ? 'Fix next blocker' : '',
      fieldKey: nextRequiredAction?.fieldKey || '',
    }
  }

  const signingReady = signingReadiness?.ready === true
  return {
    status: 'ready',
    label: 'Ready for generation',
    heading: hasGenerationWorkspaceTarget ? 'Generate the OTP draft from the workspace below.' : 'Ready for OTP draft generation.',
    body: signingReady
      ? 'The certified OTP PDF is already available for signer setup after review.'
      : hasGenerationWorkspaceTarget
        ? 'Generation creates the review PDF first. Signing links are prepared only after that OTP PDF exists.'
        : 'Use the current document run action after reviewing these OTP details. Signing links are prepared only after the OTP PDF exists.',
    actionLabel: hasGenerationWorkspaceTarget ? 'Jump to generate action' : '',
    fieldKey: '',
    readinessLabel: readinessTotal ? `${readyCheckCount}/${readinessTotal} readiness areas ready` : '',
  }
}

function OtpField({ label, children, className = '', fieldKey = '', missing = false }) {
  return (
    <label id={fieldKey ? `otp-field-${fieldKey}` : undefined} className={`grid min-w-0 gap-1.5 scroll-mt-28 ${className}`}>
      <span className="flex min-w-0 items-center gap-2">
        <span className={LABEL_CLASS}>{label}</span>
        {missing ? (
          <span className="rounded-full border border-[#f7d9d2] bg-[#fff6f4] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-[#b64d32]">
            Required
          </span>
        ) : null}
      </span>
      {children}
    </label>
  )
}

function buildFieldAction(field = {}) {
  return {
    label: FIELD_ACTION_LABELS[field.key] || `Add ${normalizeText(field.label).toLowerCase() || 'the missing detail'}.`,
    fieldKey: field.key || '',
  }
}

function buildReadinessGroups({ requirements = {}, scenarioProfile = {}, sourceSummary = {}, signingReadiness = null } = {}) {
  const requirementGroups = Array.isArray(requirements.groups) ? requirements.groups : []
  const groups = READY_GROUPS.map((config) => {
    const matchedGroups = requirementGroups.filter((group) => config.groups.includes(group.label))
    const missingFields = matchedGroups.flatMap((group) => group.fields || []).filter((field) => field.missing)
    return {
      key: config.key,
      label: config.label,
      source: sourceSummary[config.key] || null,
      status: missingFields.length ? 'needs_attention' : 'ready',
      message: missingFields.length
        ? `${missingFields.length} detail${missingFields.length === 1 ? '' : 's'} to complete.`
        : 'Ready.',
      actions: missingFields.map(buildFieldAction),
    }
  })

  const missingRoutingFacts = Array.isArray(scenarioProfile.missingRoutingFacts)
    ? scenarioProfile.missingRoutingFacts.filter(Boolean)
    : []
  groups.push({
    key: 'legal_route',
    label: 'Legal route',
    source: sourceSummary.legal_route || sourceSummary.legalRoute || null,
    status: missingRoutingFacts.length ? 'needs_attention' : 'ready',
    message: missingRoutingFacts.length
      ? `${missingRoutingFacts.length} route detail${missingRoutingFacts.length === 1 ? '' : 's'} missing.`
      : 'Correct wording route selected.',
    actions: missingRoutingFacts.map((fact) => ({
      label: ROUTING_FACT_LABELS[fact] || `Complete ${fact.replace(/_/g, ' ')}.`,
      fieldKey: ROUTING_FACT_FIELD_KEYS[fact] || '',
    })),
  })

  groups.push({
    key: 'template',
    label: 'Template readiness',
    source: sourceSummary.template || { label: 'Checked on generate', status: 'pending' },
    status: missingRoutingFacts.length ? 'needs_attention' : 'pending',
    message: missingRoutingFacts.length
      ? 'Template route cannot be selected yet.'
      : 'Approved OTP template is checked when you generate.',
    actions: missingRoutingFacts.length
      ? [{ label: 'Complete the legal route before generating the OTP.', fieldKey: ROUTING_FACT_FIELD_KEYS[missingRoutingFacts[0]] || '' }]
      : [{ label: 'If generation is blocked, publish an approved OTP template for this legal route.', fieldKey: '' }],
  })

  const signingReady = signingReadiness?.ready === true
  groups.push({
    key: 'signing',
    label: 'Signing readiness',
    source: signingReady ? { label: 'From generated OTP', status: 'source' } : { label: 'After generation', status: 'pending' },
    status: signingReady ? 'ready' : 'pending',
    message: signingReady ? 'Certified OTP PDF is ready for signer setup.' : 'Available after the OTP PDF is generated.',
    actions: signingReady ? [] : [{ label: 'Generate the OTP before preparing signing links.', fieldKey: '' }],
  })

  return groups
}

function buildSectionReadiness({ requirements = {}, sourceSummary = {} } = {}) {
  const requirementGroups = Array.isArray(requirements.groups) ? requirements.groups : []
  return READY_GROUPS.reduce((sections, config) => {
    const matchedGroups = requirementGroups.filter((group) => config.groups.includes(group.label))
    const fields = matchedGroups.flatMap((group) => group.fields || [])
    const missingFields = fields.filter((field) => field.missing)
    sections[config.key] = {
      key: config.key,
      requiredCount: fields.length,
      completeCount: Math.max(0, fields.length - missingFields.length),
      missingCount: missingFields.length,
      source: sourceSummary[config.key] || null,
      firstAction: missingFields[0] ? buildFieldAction(missingFields[0]) : null,
    }
    return sections
  }, {})
}

function readinessTone(status = '') {
  if (status === 'ready') {
    return {
      box: 'border-[#d8f0e3] bg-[#f5fbf7]',
      icon: 'text-[#20895a]',
      title: 'text-[#1e6845]',
      text: 'text-[#47705d]',
    }
  }
  if (status === 'needs_attention') {
    return {
      box: 'border-[#f7d9d2] bg-[#fff6f4]',
      icon: 'text-[#b64d32]',
      title: 'text-[#8d3521]',
      text: 'text-[#7f564c]',
    }
  }
  return {
    box: 'border-[#dbe7f4] bg-[#fbfdff]',
    icon: 'text-[#607387]',
    title: 'text-[#243b53]',
    text: 'text-[#607387]',
  }
}

function OtpSectionHeader({ title, description, readiness = null, onJumpToField = null }) {
  const missingCount = Number(readiness?.missingCount || 0)
  const requiredCount = Number(readiness?.requiredCount || 0)
  const completeCount = Number(readiness?.completeCount || 0)
  const ready = missingCount === 0
  const firstAction = readiness?.firstAction || null

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={SECTION_HEADING_CLASS}>{title}</h3>
          <span className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.06em] ${
            ready
              ? 'border-[#d8f0e3] bg-[#f5fbf7] text-[#20895a]'
              : 'border-[#f7d9d2] bg-[#fff6f4] text-[#b64d32]'
          }`}
          >
            {ready ? 'Complete' : `${missingCount} to fix`}
          </span>
          {readiness?.source?.label ? (
            <span className="rounded-full border border-[#e6edf7] bg-[#fbfdff] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.06em] text-[#607387]">
              {readiness.source.label}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs font-medium text-[#6b7d93]">{description}</p>
        <p className={`mt-1 text-xs font-semibold ${ready ? 'text-[#20895a]' : 'text-[#8d3521]'}`}>
          {requiredCount ? `${completeCount}/${requiredCount} required details complete.` : 'No required details for this route.'}
        </p>
      </div>
      {firstAction?.fieldKey ? (
        <button
          type="button"
          onClick={() => onJumpToField?.(firstAction.fieldKey)}
          className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-[#f2a995] bg-[#fff8f6] px-3 text-xs font-semibold text-[#8d3521] transition hover:border-[#d87557] hover:bg-[#fff1ed]"
        >
          Fix next
        </button>
      ) : null}
    </div>
  )
}

function OtpSectionNavigator({ sections = {}, onJumpToSection = null }) {
  return (
    <div className="mt-5 rounded-[18px] border border-[#e6edf7] bg-[#fbfdff] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#607387]">Review sections</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {READY_GROUPS.map((section) => {
          const detail = SECTION_DETAILS[section.key] || {}
          const readiness = sections[section.key] || {}
          const missingCount = Number(readiness.missingCount || 0)
          const requiredCount = Number(readiness.requiredCount || 0)
          const completeCount = Number(readiness.completeCount || 0)
          const ready = missingCount === 0
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => onJumpToSection?.(section.key)}
              className={`flex min-h-[4.5rem] min-w-0 flex-col items-start justify-between rounded-xl border p-3 text-left transition ${
                ready
                  ? 'border-[#d8f0e3] bg-[#f5fbf7] hover:border-[#9fd9bb]'
                  : 'border-[#f7d9d2] bg-[#fff8f6] hover:border-[#f2a995]'
              }`}
            >
              <span className={`text-sm font-semibold ${ready ? 'text-[#1e6845]' : 'text-[#8d3521]'}`}>{detail.title || section.label}</span>
              <span className={`mt-2 text-xs font-semibold ${ready ? 'text-[#47705d]' : 'text-[#7f564c]'}`}>
                {requiredCount ? `${completeCount}/${requiredCount} complete` : 'No required details'}
              </span>
              <span className={`mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.06em] ${ready ? 'text-[#20895a]' : 'text-[#b64d32]'}`}>
                {ready ? 'Complete' : `${missingCount} to fix`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OtpGenerationReviewCard({
  items = [],
  generationReady = false,
  manualChangeCount = 0,
  nextAction = null,
  onJumpToField = null,
}) {
  return (
    <div className={`mt-5 rounded-[18px] border p-4 ${
      generationReady ? 'border-[#d8f0e3] bg-[#f7fcf9]' : 'border-[#e6edf7] bg-[#fbfdff]'
    }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#607387]">Final review before generation</p>
          <p className="mt-1 text-sm font-semibold text-[#142132]">
            {generationReady ? 'Ready for OTP draft generation.' : 'Review these details while completing the remaining blockers.'}
          </p>
        </div>
        <span className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold ${
          manualChangeCount
            ? 'border-[#fde6c8] bg-[#fff8ed] text-[#a15c13]'
            : 'border-[#d8f0e3] bg-[#f5fbf7] text-[#20895a]'
        }`}
        >
          {manualChangeCount ? `${manualChangeCount} manual change${manualChangeCount === 1 ? '' : 's'}` : 'Using defaults'}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 rounded-xl border border-[#edf2f7] bg-white px-3 py-2">
            <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{item.label}</dt>
            <dd className="mt-1 truncate text-sm font-semibold text-[#142132]" title={item.value}>{item.value}</dd>
          </div>
        ))}
      </dl>
      {!generationReady && nextAction?.fieldKey ? (
        <button
          type="button"
          onClick={() => onJumpToField?.(nextAction.fieldKey)}
          className="mt-4 inline-flex min-h-9 items-center justify-center rounded-lg border border-[#f2a995] bg-[#fff8f6] px-3 text-xs font-semibold text-[#8d3521] transition hover:border-[#d87557] hover:bg-[#fff1ed]"
        >
          Fix next blocker
        </button>
      ) : null}
    </div>
  )
}

function OtpGenerationDecisionBar({
  decision = {},
  generationReady = false,
  onJumpToField = null,
  onJumpToWorkspace = null,
}) {
  return (
    <div className={`mt-5 rounded-[18px] border px-4 py-3 ${
      generationReady ? 'border-[#d8f0e3] bg-[#f5fbf7]' : 'border-[#f7d9d2] bg-[#fff6f4]'
    }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {generationReady ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#20895a]" />
          ) : (
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-[#b64d32]" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-sm font-semibold ${generationReady ? 'text-[#1e6845]' : 'text-[#8d3521]'}`}>{decision.heading}</p>
              <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.06em] ${
                generationReady
                  ? 'border-[#cde8d6] bg-white/70 text-[#20895a]'
                  : 'border-[#f2c7ba] bg-white/70 text-[#b64d32]'
              }`}
              >
                {decision.label}
              </span>
            </div>
            <p className={`mt-1 text-xs leading-5 ${generationReady ? 'text-[#47705d]' : 'text-[#7f564c]'}`}>{decision.body}</p>
            {decision.readinessLabel ? (
              <p className="mt-1 text-xs font-semibold text-[#47705d]">{decision.readinessLabel}.</p>
            ) : null}
          </div>
        </div>
        {generationReady && decision.actionLabel && onJumpToWorkspace ? (
          <button
            type="button"
            onClick={onJumpToWorkspace}
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-[#9fd9bb] bg-white px-3 text-xs font-semibold text-[#1e6845] transition hover:border-[#66bd90] hover:bg-[#f7fcf9]"
          >
            {decision.actionLabel}
          </button>
        ) : decision.fieldKey ? (
          <button
            type="button"
            onClick={() => onJumpToField?.(decision.fieldKey)}
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-[#f2a995] bg-white px-3 text-xs font-semibold text-[#8d3521] transition hover:border-[#d87557] hover:bg-[#fff8f6]"
          >
            {decision.actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default function OtpDraftIntakePanel({
  draft = {},
  sourceMode = '',
  documentStart = '',
  sourceSummary = {},
  signingReadiness = null,
  manualChangeCount = 0,
  generationWorkspaceId = '',
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
  const missingRequirementFields = (Array.isArray(requirements.groups) ? requirements.groups : [])
    .flatMap((group) => group.fields || [])
    .filter((field) => field.missing)
  const missingRoutingFieldKeys = new Set(
    (Array.isArray(scenarioProfile.missingRoutingFacts) ? scenarioProfile.missingRoutingFacts : [])
      .map((fact) => ROUTING_FACT_FIELD_KEYS[fact])
      .filter(Boolean),
  )
  const missingFieldKeys = new Set([
    ...missingRequirementFields.map((field) => field.key).filter(Boolean),
    ...missingRoutingFieldKeys,
  ])
  const readinessChecks = buildReadinessGroups({ requirements, scenarioProfile, sourceSummary, signingReadiness })
  const sectionReadiness = buildSectionReadiness({ requirements, sourceSummary })
  const missingChecks = readinessChecks.filter((item) => item.status === 'needs_attention')
  const readyCheckCount = readinessChecks.filter((item) => item.status === 'ready').length
  const generationReady = requirements.complete && missingChecks.length === 0
  const nextRequiredAction = readinessChecks.flatMap((check) => check.actions || []).find((action) => action.fieldKey)
  const hasGenerationWorkspaceTarget = Boolean(normalizeText(generationWorkspaceId))
  const generationSummaryItems = buildGenerationSummaryItems({
    draft,
    scenarioProfile,
    propertyTitleType,
    financeType,
  })
  const generationDecision = buildGenerationDecision({
    generationReady,
    readyCheckCount,
    readinessTotal: readinessChecks.length,
    nextRequiredAction,
    signingReadiness,
    hasGenerationWorkspaceTarget,
  })
  const isFieldMissing = (fieldKey) => missingFieldKeys.has(fieldKey)
  const controlClass = (fieldKey, baseClass = FIELD_CLASS) => (
    isFieldMissing(fieldKey) ? `${baseClass} ${MISSING_FIELD_CLASS}` : baseClass
  )
  const handleJumpToField = (fieldKey = '') => {
    const field = document.getElementById(`otp-field-${fieldKey}`)
    if (!field) return
    field.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const control = field.querySelector('input, select, textarea')
    if (control && typeof control.focus === 'function') {
      window.setTimeout(() => control.focus(), 160)
    }
  }
  const handleJumpToSection = (sectionKey = '') => {
    const section = document.getElementById(`otp-section-${sectionKey}`)
    if (!section) return
    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const control = section.querySelector('[aria-invalid="true"], input, select, textarea')
    if (control && typeof control.focus === 'function') {
      window.setTimeout(() => control.focus(), 160)
    }
  }
  const handleJumpToWorkspace = () => {
    const workspace = document.getElementById(generationWorkspaceId)
    if (!workspace) return
    workspace.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const action = workspace.querySelector('button, [role="button"], a')
    if (action && typeof action.focus === 'function') {
      window.setTimeout(() => action.focus(), 160)
    }
  }
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

      <div className="mt-5 grid gap-3 lg:grid-cols-[0.68fr_1.32fr]">
        <div className={`rounded-[18px] border p-4 ${generationReady ? 'border-[#d8f0e3] bg-[#f5fbf7]' : 'border-[#f7d9d2] bg-[#fff6f4]'}`}>
          <p className={`text-sm font-semibold ${generationReady ? 'text-[#1e6845]' : 'text-[#8d3521]'}`}>
            {generationReady ? 'Ready to generate' : 'Needs attention'}
          </p>
          <p className={`mt-1 text-sm leading-5 ${generationReady ? 'text-[#47705d]' : 'text-[#7f564c]'}`}>
            {readyCheckCount}/{readinessChecks.length} readiness areas ready.
          </p>
	          <p className={`mt-2 text-xs leading-5 ${generationReady ? 'text-[#47705d]' : 'text-[#7f564c]'}`}>
	            {generationReady ? 'The OTP details are ready for draft generation.' : 'Complete the highlighted details before generating the OTP.'}
	          </p>
	          {nextRequiredAction?.fieldKey ? (
	            <button
	              type="button"
	              onClick={() => handleJumpToField(nextRequiredAction.fieldKey)}
	              className="mt-3 inline-flex min-h-9 items-center justify-center rounded-lg border border-[#f2a995] bg-white px-3 text-xs font-semibold text-[#8d3521] transition hover:border-[#d87557] hover:bg-[#fff8f6]"
	            >
	              Fix next required field
	            </button>
	          ) : null}
	        </div>
        <div className="grid gap-2 rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] p-3 md:grid-cols-2 xl:grid-cols-3">
          {readinessChecks.map((check) => {
            const tone = readinessTone(check.status)
            const Icon = check.status === 'ready' ? CheckCircle2 : CircleAlert
            return (
              <div key={check.key} className={`min-w-0 rounded-[14px] border p-3 ${tone.box}`}>
                <div className="flex items-start gap-2">
                  <Icon size={16} className={`mt-0.5 shrink-0 ${tone.icon}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className={`text-sm font-semibold ${tone.title}`}>{check.label}</p>
                      {check.source?.label ? (
                        <span className="rounded-full border border-white/70 bg-white/80 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.06em] text-[#607387]">
                          {check.source.label}
                        </span>
                      ) : null}
                    </div>
                    <p className={`mt-1 text-xs leading-5 ${tone.text}`}>{check.message}</p>
                  </div>
                </div>
	                {check.actions.length ? (
	                  <ul className={`mt-2 grid gap-1 text-xs leading-5 ${tone.text}`}>
	                    {check.actions.slice(0, 3).map((action) => (
	                      <li key={`${check.key}-${action.label}`}>
	                        {action.fieldKey ? (
	                          <button
	                            type="button"
	                            onClick={() => handleJumpToField(action.fieldKey)}
	                            className="text-left font-semibold underline decoration-current/30 underline-offset-2 transition hover:decoration-current"
	                          >
	                            {action.label}
	                          </button>
	                        ) : (
	                          <span>{action.label}</span>
	                        )}
	                      </li>
	                    ))}
	                  </ul>
	                ) : null}
              </div>
            )
          })}
	        </div>
	      </div>

	      <OtpSectionNavigator
	        sections={sectionReadiness}
	        onJumpToSection={handleJumpToSection}
	      />

	      <OtpGenerationReviewCard
	        items={generationSummaryItems}
	        generationReady={generationReady}
	        manualChangeCount={manualChangeCount}
	        nextAction={nextRequiredAction}
	        onJumpToField={handleJumpToField}
	      />

	      <OtpGenerationDecisionBar
	        decision={generationDecision}
	        generationReady={generationReady}
	        onJumpToField={handleJumpToField}
	        onJumpToWorkspace={hasGenerationWorkspaceTarget ? handleJumpToWorkspace : null}
	      />

	      <div className="mt-6 grid gap-6">
		        <div id="otp-section-buyer" className="grid scroll-mt-28 gap-3 border-t border-[#edf2f7] pt-5">
	          <OtpSectionHeader
	            {...SECTION_DETAILS.buyer}
	            readiness={sectionReadiness.buyer}
	            onJumpToField={handleJumpToField}
	          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
	            <OtpField label="Buyer type" fieldKey="buyerEntityType" missing={isFieldMissing('buyerEntityType')}>
	              <select value={buyerEntityType} onChange={update('buyerEntityType')} className={controlClass('buyerEntityType')}>
                <option value="individual">Individual</option>
                <option value="company">Company</option>
                <option value="trust">Trust</option>
              </select>
            </OtpField>
	            <OtpField label="Buyer name" fieldKey="buyerFullName" missing={isFieldMissing('buyerFullName')}>
	              <input value={draft.buyerFullName || ''} onChange={update('buyerFullName')} placeholder="Full name or entity name" className={controlClass('buyerFullName')} aria-invalid={isFieldMissing('buyerFullName')} />
	            </OtpField>
	            <OtpField label="ID / registration no." fieldKey="buyerIdNumber" missing={isFieldMissing('buyerIdNumber')}>
	              <input value={draft.buyerIdNumber || ''} onChange={update('buyerIdNumber')} placeholder="Optional but recommended" className={controlClass('buyerIdNumber')} aria-invalid={isFieldMissing('buyerIdNumber')} />
	            </OtpField>
	            <OtpField label="Email" fieldKey="buyerEmail" missing={isFieldMissing('buyerEmail')}>
	              <input type="email" value={draft.buyerEmail || ''} onChange={update('buyerEmail')} placeholder="buyer@example.com" className={controlClass('buyerEmail')} aria-invalid={isFieldMissing('buyerEmail')} />
	            </OtpField>
	            <OtpField label="Phone" fieldKey="buyerPhone" missing={isFieldMissing('buyerPhone')}>
	              <input value={draft.buyerPhone || ''} onChange={update('buyerPhone')} placeholder="+27..." className={controlClass('buyerPhone')} aria-invalid={isFieldMissing('buyerPhone')} />
	            </OtpField>
	            <OtpField label="Co-buyer name" fieldKey="coBuyerFullName" missing={isFieldMissing('coBuyerFullName')}>
	              <input value={draft.coBuyerFullName || ''} onChange={update('coBuyerFullName')} placeholder="Optional" className={controlClass('coBuyerFullName')} aria-invalid={isFieldMissing('coBuyerFullName')} />
	            </OtpField>
	            <OtpField label="Co-buyer email" fieldKey="coBuyerEmail" missing={isFieldMissing('coBuyerEmail')}>
	              <input type="email" value={draft.coBuyerEmail || ''} onChange={update('coBuyerEmail')} placeholder="Optional" className={controlClass('coBuyerEmail')} aria-invalid={isFieldMissing('coBuyerEmail')} />
	            </OtpField>
	            <OtpField label="Domicilium address" fieldKey="buyerDomiciliumAddress" missing={isFieldMissing('buyerDomiciliumAddress')}>
	              <input value={draft.buyerDomiciliumAddress || ''} onChange={update('buyerDomiciliumAddress')} placeholder="Address for notices" className={controlClass('buyerDomiciliumAddress')} aria-invalid={isFieldMissing('buyerDomiciliumAddress')} />
            </OtpField>
            {buyerEntityType === 'individual' ? (
              <>
	                <OtpField label="Marital position" fieldKey="buyerMaritalRegime" missing={isFieldMissing('buyerMaritalRegime')}>
	                  <select value={buyerMaritalRegime} onChange={update('buyerMaritalRegime')} className={controlClass('buyerMaritalRegime')} aria-invalid={isFieldMissing('buyerMaritalRegime')}>
                    <option value="">Choose marital position</option>
                    <option value="single">Single / not married</option>
                    <option value="out_of_community">Married out of community</option>
                    <option value="in_community">Married in community</option>
                  </select>
                </OtpField>
                {buyerMaritalRegime === 'in_community' ? (
                  <>
	                    <OtpField label="Spouse full name" fieldKey="buyerSpouseFullName" missing={isFieldMissing('buyerSpouseFullName')}>
	                      <input value={draft.buyerSpouseFullName || ''} onChange={update('buyerSpouseFullName')} placeholder="Full legal name" className={controlClass('buyerSpouseFullName')} aria-invalid={isFieldMissing('buyerSpouseFullName')} />
	                    </OtpField>
	                    <OtpField label="Spouse ID number" fieldKey="buyerSpouseIdNumber" missing={isFieldMissing('buyerSpouseIdNumber')}>
	                      <input value={draft.buyerSpouseIdNumber || ''} onChange={update('buyerSpouseIdNumber')} placeholder="South African ID or passport" className={controlClass('buyerSpouseIdNumber')} aria-invalid={isFieldMissing('buyerSpouseIdNumber')} />
	                    </OtpField>
	                    <OtpField label="Spouse email" fieldKey="buyerSpouseEmail" missing={isFieldMissing('buyerSpouseEmail')}>
	                      <input type="email" value={draft.buyerSpouseEmail || ''} onChange={update('buyerSpouseEmail')} placeholder="spouse@example.com" className={controlClass('buyerSpouseEmail')} aria-invalid={isFieldMissing('buyerSpouseEmail')} />
                    </OtpField>
                  </>
                ) : null}
              </>
            ) : (
              <>
	                <OtpField label="Representative" fieldKey="buyerRepresentativeName" missing={isFieldMissing('buyerRepresentativeName')}>
	                  <input value={draft.buyerRepresentativeName || ''} onChange={update('buyerRepresentativeName')} placeholder="Director, trustee..." className={controlClass('buyerRepresentativeName')} aria-invalid={isFieldMissing('buyerRepresentativeName')} />
	                </OtpField>
	                <OtpField label="Capacity" fieldKey="buyerRepresentativeCapacity" missing={isFieldMissing('buyerRepresentativeCapacity')}>
	                  <input value={draft.buyerRepresentativeCapacity || ''} onChange={update('buyerRepresentativeCapacity')} placeholder="Signing capacity" className={controlClass('buyerRepresentativeCapacity')} aria-invalid={isFieldMissing('buyerRepresentativeCapacity')} />
	                </OtpField>
	                {buyerEntityType === 'company' ? (
	                  <OtpField label="Resolution date" fieldKey="buyerResolutionDate" missing={isFieldMissing('buyerResolutionDate')}>
	                    <input type="date" value={draft.buyerResolutionDate || ''} onChange={update('buyerResolutionDate')} className={controlClass('buyerResolutionDate')} aria-invalid={isFieldMissing('buyerResolutionDate')} />
	                  </OtpField>
	                ) : null}
	                {buyerEntityType === 'trust' ? (
	                  <OtpField label="Trustee names" fieldKey="buyerTrusteeNames" missing={isFieldMissing('buyerTrusteeNames')} className="md:col-span-2">
	                    <input value={draft.buyerTrusteeNames || ''} onChange={update('buyerTrusteeNames')} placeholder="Names of authorised trustees" className={controlClass('buyerTrusteeNames')} aria-invalid={isFieldMissing('buyerTrusteeNames')} />
	                  </OtpField>
	                ) : null}
	                <OtpField label="Authority / resolution" fieldKey="buyerAuthorityBasis" missing={isFieldMissing('buyerAuthorityBasis')} className="md:col-span-2">
	                  <input value={draft.buyerAuthorityBasis || ''} onChange={update('buyerAuthorityBasis')} placeholder="Board or trustee resolution details" className={controlClass('buyerAuthorityBasis')} aria-invalid={isFieldMissing('buyerAuthorityBasis')} />
                </OtpField>
              </>
            )}
          </div>
        </div>

		        <div id="otp-section-seller" className="grid scroll-mt-28 gap-3 border-t border-[#edf2f7] pt-5">
	          <OtpSectionHeader
	            {...SECTION_DETAILS.seller}
	            readiness={sectionReadiness.seller}
	            onJumpToField={handleJumpToField}
	          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
	            <OtpField label="Seller type" fieldKey="sellerEntityType" missing={isFieldMissing('sellerEntityType')}>
	              <select value={sellerEntityType} onChange={update('sellerEntityType')} className={controlClass('sellerEntityType')} aria-invalid={isFieldMissing('sellerEntityType')}>
                <option value="individual">Individual</option>
                <option value="company">Company</option>
                <option value="trust">Trust</option>
                <option value="close_corporation">Close corporation</option>
              </select>
            </OtpField>
	            <OtpField label="Seller name" fieldKey="sellerFullName" missing={isFieldMissing('sellerFullName')}>
	              <input value={draft.sellerFullName || ''} onChange={update('sellerFullName')} placeholder="Seller legal name" className={controlClass('sellerFullName')} aria-invalid={isFieldMissing('sellerFullName')} />
	            </OtpField>
	            <OtpField label="ID / registration no." fieldKey="sellerIdNumber" missing={isFieldMissing('sellerIdNumber')}>
	              <input value={draft.sellerIdNumber || ''} onChange={update('sellerIdNumber')} placeholder="Optional but recommended" className={controlClass('sellerIdNumber')} aria-invalid={isFieldMissing('sellerIdNumber')} />
	            </OtpField>
	            <OtpField label="Email" fieldKey="sellerEmail" missing={isFieldMissing('sellerEmail')}>
	              <input type="email" value={draft.sellerEmail || ''} onChange={update('sellerEmail')} placeholder="seller@example.com" className={controlClass('sellerEmail')} aria-invalid={isFieldMissing('sellerEmail')} />
	            </OtpField>
	            <OtpField label="Phone" fieldKey="sellerPhone" missing={isFieldMissing('sellerPhone')}>
	              <input value={draft.sellerPhone || ''} onChange={update('sellerPhone')} placeholder="+27..." className={controlClass('sellerPhone')} aria-invalid={isFieldMissing('sellerPhone')} />
            </OtpField>
            {sellerEntityType === 'individual' ? (
              <>
	                <OtpField label="Marital position" fieldKey="sellerMaritalRegime" missing={isFieldMissing('sellerMaritalRegime')}>
	                  <select value={sellerMaritalRegime} onChange={update('sellerMaritalRegime')} className={controlClass('sellerMaritalRegime')} aria-invalid={isFieldMissing('sellerMaritalRegime')}>
                    <option value="">Choose marital position</option>
                    <option value="single">Single / not married</option>
                    <option value="out_of_community">Married out of community</option>
                    <option value="in_community">Married in community</option>
                  </select>
                </OtpField>
                {sellerMaritalRegime === 'in_community' ? (
                  <>
	                    <OtpField label="Spouse full name" fieldKey="sellerSpouseFullName" missing={isFieldMissing('sellerSpouseFullName')}>
	                      <input value={draft.sellerSpouseFullName || ''} onChange={update('sellerSpouseFullName')} placeholder="Full legal name" className={controlClass('sellerSpouseFullName')} aria-invalid={isFieldMissing('sellerSpouseFullName')} />
	                    </OtpField>
	                    <OtpField label="Spouse ID number" fieldKey="sellerSpouseIdNumber" missing={isFieldMissing('sellerSpouseIdNumber')}>
	                      <input value={draft.sellerSpouseIdNumber || ''} onChange={update('sellerSpouseIdNumber')} placeholder="South African ID or passport" className={controlClass('sellerSpouseIdNumber')} aria-invalid={isFieldMissing('sellerSpouseIdNumber')} />
	                    </OtpField>
	                    <OtpField label="Spouse email" fieldKey="sellerSpouseEmail" missing={isFieldMissing('sellerSpouseEmail')}>
	                      <input type="email" value={draft.sellerSpouseEmail || ''} onChange={update('sellerSpouseEmail')} placeholder="spouse@example.com" className={controlClass('sellerSpouseEmail')} aria-invalid={isFieldMissing('sellerSpouseEmail')} />
                    </OtpField>
                  </>
                ) : null}
              </>
            ) : (
              <>
	                <OtpField label="Representative" fieldKey="sellerRepresentativeName" missing={isFieldMissing('sellerRepresentativeName')}>
	                  <input value={draft.sellerRepresentativeName || ''} onChange={update('sellerRepresentativeName')} placeholder="For company or trust" className={controlClass('sellerRepresentativeName')} aria-invalid={isFieldMissing('sellerRepresentativeName')} />
	                </OtpField>
	                <OtpField label="Capacity" fieldKey="sellerRepresentativeCapacity" missing={isFieldMissing('sellerRepresentativeCapacity')}>
	                  <input value={draft.sellerRepresentativeCapacity || ''} onChange={update('sellerRepresentativeCapacity')} placeholder="Director, trustee..." className={controlClass('sellerRepresentativeCapacity')} aria-invalid={isFieldMissing('sellerRepresentativeCapacity')} />
	                </OtpField>
	                {['company', 'close_corporation'].includes(sellerEntityType) ? (
	                  <OtpField label="Resolution date" fieldKey="sellerResolutionDate" missing={isFieldMissing('sellerResolutionDate')}>
	                    <input type="date" value={draft.sellerResolutionDate || ''} onChange={update('sellerResolutionDate')} className={controlClass('sellerResolutionDate')} aria-invalid={isFieldMissing('sellerResolutionDate')} />
	                  </OtpField>
	                ) : null}
	                {sellerEntityType === 'trust' ? (
	                  <OtpField label="Trustee names" fieldKey="sellerTrusteeNames" missing={isFieldMissing('sellerTrusteeNames')} className="md:col-span-2">
	                    <input value={draft.sellerTrusteeNames || ''} onChange={update('sellerTrusteeNames')} placeholder="Names of authorised trustees" className={controlClass('sellerTrusteeNames')} aria-invalid={isFieldMissing('sellerTrusteeNames')} />
	                  </OtpField>
	                ) : null}
	                <OtpField label="Authority / resolution" fieldKey="sellerAuthorityBasis" missing={isFieldMissing('sellerAuthorityBasis')} className="md:col-span-2">
	                  <input value={draft.sellerAuthorityBasis || ''} onChange={update('sellerAuthorityBasis')} placeholder="Board or trustee resolution details" className={controlClass('sellerAuthorityBasis')} aria-invalid={isFieldMissing('sellerAuthorityBasis')} />
	                </OtpField>
              </>
            )}
	            <OtpField label="Registered address" fieldKey="sellerRegisteredAddress" missing={isFieldMissing('sellerRegisteredAddress')}>
	              <input value={draft.sellerRegisteredAddress || ''} onChange={update('sellerRegisteredAddress')} placeholder="Address for notices" className={controlClass('sellerRegisteredAddress')} aria-invalid={isFieldMissing('sellerRegisteredAddress')} />
            </OtpField>
          </div>
        </div>

		        <div id="otp-section-property" className="grid scroll-mt-28 gap-3 border-t border-[#edf2f7] pt-5">
	          <OtpSectionHeader
	            {...SECTION_DETAILS.property}
	            readiness={sectionReadiness.property}
	            onJumpToField={handleJumpToField}
	          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
	            <OtpField label="Property address" fieldKey="propertyAddress" missing={isFieldMissing('propertyAddress')} className="md:col-span-2">
	              <input value={draft.propertyAddress || ''} onChange={update('propertyAddress')} placeholder="Street address" className={controlClass('propertyAddress')} aria-invalid={isFieldMissing('propertyAddress')} />
	            </OtpField>
	            <OtpField label="Suburb" fieldKey="propertySuburb" missing={isFieldMissing('propertySuburb')}>
	              <input value={draft.propertySuburb || ''} onChange={update('propertySuburb')} placeholder="Suburb" className={controlClass('propertySuburb')} aria-invalid={isFieldMissing('propertySuburb')} />
	            </OtpField>
	            <OtpField label="City" fieldKey="propertyCity" missing={isFieldMissing('propertyCity')}>
	              <input value={draft.propertyCity || ''} onChange={update('propertyCity')} placeholder="City" className={controlClass('propertyCity')} aria-invalid={isFieldMissing('propertyCity')} />
	            </OtpField>
	            <OtpField label="Property type" fieldKey="propertyType" missing={isFieldMissing('propertyType')}>
	              <input value={draft.propertyType || ''} onChange={update('propertyType')} placeholder="House, apartment..." className={controlClass('propertyType')} aria-invalid={isFieldMissing('propertyType')} />
	            </OtpField>
	            <OtpField label="Title type" fieldKey="propertyTitleType" missing={isFieldMissing('propertyTitleType')}>
	              <select value={propertyTitleType} onChange={update('propertyTitleType')} className={controlClass('propertyTitleType')} aria-invalid={isFieldMissing('propertyTitleType')}>
                <option value="full_title">Full title</option>
                <option value="sectional_title">Sectional title</option>
              </select>
            </OtpField>
            {propertyTitleType === 'sectional_title' ? (
              <>
	                <OtpField label="Unit / section number" fieldKey="unitNumber" missing={isFieldMissing('unitNumber')}>
	                  <input value={draft.unitNumber || ''} onChange={update('unitNumber')} placeholder="Section number" className={controlClass('unitNumber')} aria-invalid={isFieldMissing('unitNumber')} />
	                </OtpField>
	                <OtpField label="Scheme / complex" fieldKey="complexName" missing={isFieldMissing('complexName')}>
	                  <input value={draft.complexName || ''} onChange={update('complexName')} placeholder="Registered scheme name" className={controlClass('complexName')} aria-invalid={isFieldMissing('complexName')} />
	                </OtpField>
              </>
            ) : (
	              <OtpField label="Erf number" fieldKey="erfNumber" missing={isFieldMissing('erfNumber')}>
	                <input value={draft.erfNumber || ''} onChange={update('erfNumber')} placeholder="Registered erf number" className={controlClass('erfNumber')} aria-invalid={isFieldMissing('erfNumber')} />
              </OtpField>
            )}
          </div>
        </div>

		        <div id="otp-section-finance" className="grid scroll-mt-28 gap-3 border-t border-[#edf2f7] pt-5">
	          <OtpSectionHeader
	            {...SECTION_DETAILS.finance}
	            readiness={sectionReadiness.finance}
	            onJumpToField={handleJumpToField}
	          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
	            <OtpField label="Purchase price" fieldKey="purchasePrice" missing={isFieldMissing('purchasePrice')}>
	              <input type="number" min="0" step="1000" value={draft.purchasePrice || ''} onChange={update('purchasePrice')} placeholder="0" className={controlClass('purchasePrice')} aria-invalid={isFieldMissing('purchasePrice')} />
	            </OtpField>
	            <OtpField label="Deposit" fieldKey="depositAmount" missing={isFieldMissing('depositAmount')}>
	              <input type="number" min="0" step="1000" value={draft.depositAmount || ''} onChange={update('depositAmount')} placeholder="Optional" className={controlClass('depositAmount')} aria-invalid={isFieldMissing('depositAmount')} />
	            </OtpField>
	            <OtpField label="Finance type" fieldKey="financeType" missing={isFieldMissing('financeType')}>
	              <select value={financeType} onChange={update('financeType')} className={controlClass('financeType')} aria-invalid={isFieldMissing('financeType')}>
                <option value="cash">Cash</option>
                <option value="bond">Bond</option>
                <option value="combination">Cash and bond</option>
              </select>
            </OtpField>
            {['bond', 'combination'].includes(financeType) ? (
	              <OtpField label="Bond amount" fieldKey="bondAmount" missing={isFieldMissing('bondAmount')}>
	                <input type="number" min="0" step="1000" value={draft.bondAmount || ''} onChange={update('bondAmount')} placeholder="Bond amount" className={controlClass('bondAmount')} aria-invalid={isFieldMissing('bondAmount')} />
	              </OtpField>
	            ) : null}
	            {['cash', 'combination'].includes(financeType) ? (
	              <OtpField label={financeType === 'cash' ? 'Cash purchase amount' : 'Cash contribution'} fieldKey="cashAmount" missing={isFieldMissing('cashAmount')}>
	                <input type="number" min="0" step="1000" value={draft.cashAmount || ''} onChange={update('cashAmount')} placeholder={financeType === 'cash' ? 'Cash purchase amount' : 'Cash contribution'} className={controlClass('cashAmount')} aria-invalid={isFieldMissing('cashAmount')} />
	              </OtpField>
	            ) : null}
	            <OtpField label="Occupation date" fieldKey="occupationDate" missing={isFieldMissing('occupationDate')}>
	              <input type="date" value={draft.occupationDate || ''} onChange={update('occupationDate')} className={controlClass('occupationDate')} aria-invalid={isFieldMissing('occupationDate')} />
	            </OtpField>
	            <OtpField label="Transfer date" fieldKey="transferDate" missing={isFieldMissing('transferDate')}>
	              <input type="date" value={draft.transferDate || ''} onChange={update('transferDate')} className={controlClass('transferDate')} aria-invalid={isFieldMissing('transferDate')} />
	            </OtpField>
	            <div className="hidden xl:block" aria-hidden="true" />
	            <OtpField label="Suspensive conditions" fieldKey="suspensiveConditions" missing={isFieldMissing('suspensiveConditions')} className="md:col-span-2">
	              <textarea
	                rows={3}
	                value={draft.suspensiveConditions || ''}
	                onChange={update('suspensiveConditions')}
	                placeholder="Bond approval, sale of existing property, inspection conditions..."
	                className={controlClass('suspensiveConditions', 'min-h-[92px] w-full rounded-xl border border-[#dbe6f2] bg-white px-3 py-3 text-sm font-medium text-[#102033] outline-none transition placeholder:text-[#9aabba] focus:border-[#0a66ff]')}
	                aria-invalid={isFieldMissing('suspensiveConditions')}
	              />
	            </OtpField>
	            <OtpField label="Special conditions" fieldKey="specialConditions" missing={isFieldMissing('specialConditions')} className="md:col-span-2">
	              <textarea
	                rows={3}
	                value={draft.specialConditions || ''}
	                onChange={update('specialConditions')}
	                placeholder="Any additional terms that should appear in the OTP."
	                className={controlClass('specialConditions', 'min-h-[92px] w-full rounded-xl border border-[#dbe6f2] bg-white px-3 py-3 text-sm font-medium text-[#102033] outline-none transition placeholder:text-[#9aabba] focus:border-[#0a66ff]')}
	                aria-invalid={isFieldMissing('specialConditions')}
	              />
            </OtpField>
          </div>
        </div>
      </div>

      {missingChecks.length ? (
        <p className="mt-5 text-sm font-medium text-[#8d3521]">
          OTP generation is blocked until the required buyer, seller, property and finance details are complete.
        </p>
      ) : (
        <p className="mt-5 text-sm font-semibold text-[#20895a]">
          Ready to generate the OTP draft.
        </p>
      )}
    </section>
  )
}
