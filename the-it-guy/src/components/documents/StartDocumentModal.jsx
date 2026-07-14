import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Database,
  FileSignature,
  FileText,
  PencilLine,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  DOCUMENT_START_DOCUMENT_KINDS,
  DOCUMENT_START_SOURCE_MODES,
  getDocumentStartEntryPointRule,
  getDocumentStartModeOptions,
  validateDocumentStartRequest,
} from '../../core/documents/documentStartRules'
import {
  DOCUMENT_START_FINANCE_TYPES,
  DOCUMENT_START_MARITAL_REGIMES,
  DOCUMENT_START_PARTY_TYPES,
  DOCUMENT_START_PROPERTY_TITLE_TYPES,
  getDocumentStartLegalScenarioInclusions,
  normalizeDocumentStartLegalScenario,
} from '../../core/documents/documentStartLegalScenario'
import Button from '../ui/Button'
import Modal from '../ui/Modal'

const modeIcons = {
  [DOCUMENT_START_SOURCE_MODES.saved]: Database,
  [DOCUMENT_START_SOURCE_MODES.manual]: PencilLine,
  [DOCUMENT_START_SOURCE_MODES.onboarding]: Send,
}

const modeToneClasses = {
  [DOCUMENT_START_SOURCE_MODES.saved]: {
    icon: 'bg-[#eaf3ff] text-[#1d65b7]',
    active: 'border-[#9fc6f2] bg-[#f7fbff] shadow-[0_14px_30px_rgba(29,101,183,0.10)]',
  },
  [DOCUMENT_START_SOURCE_MODES.manual]: {
    icon: 'bg-[#f5f8fc] text-[#41556b]',
    active: 'border-[#bdd0e5] bg-white shadow-[0_14px_30px_rgba(65,85,107,0.10)]',
  },
  [DOCUMENT_START_SOURCE_MODES.onboarding]: {
    icon: 'bg-[#eaf8ef] text-[#128642]',
    active: 'border-[#a9dec0] bg-[#f7fcf9] shadow-[0_14px_30px_rgba(18,134,66,0.10)]',
  },
}

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function getDefaultSourceMode(options = [], preferredSourceMode = DOCUMENT_START_SOURCE_MODES.saved) {
  return (
    options.find((option) => option.key === preferredSourceMode && !option.disabled)?.key ||
    options.find((option) => option.recommended && !option.disabled)?.key ||
    options.find((option) => !option.disabled)?.key ||
    options[0]?.key ||
    DOCUMENT_START_SOURCE_MODES.saved
  )
}

function getDocumentLabel(packetType = '', documentKind = DOCUMENT_START_DOCUMENT_KINDS.standard) {
  if (documentKind === DOCUMENT_START_DOCUMENT_KINDS.addendum) return 'addendum'
  if (documentKind === DOCUMENT_START_DOCUMENT_KINDS.amendment) return 'amendment'
  if (documentKind === DOCUMENT_START_DOCUMENT_KINDS.annexure) return 'annexure'
  return packetType === 'otp' ? 'OTP' : 'mandate'
}

function getNextStepCopy(sourceMode = DOCUMENT_START_SOURCE_MODES.saved, documentLabel = 'document') {
  if (sourceMode === DOCUMENT_START_SOURCE_MODES.manual) {
    return `Next, capture only the fields needed for this ${documentLabel}, then open the document editor before signing.`
  }
  if (sourceMode === DOCUMENT_START_SOURCE_MODES.onboarding) {
    return 'Next, send the client link and keep the document waiting until their details come back.'
  }
  return `Next, review the saved details, fill any gaps, then open the ${documentLabel} in the document editor.`
}

const LEGAL_FIELD_CLASS = 'min-h-11 w-full rounded-xl border border-[#dbe6f2] bg-white px-3 text-sm font-semibold text-[#102033] outline-none transition focus:border-[#0a66ff]'
const LEGAL_FIELD_LABELS = {
  seller_entity_type: 'seller type',
  seller_marital_regime: 'seller marital position',
  buyer_entity_type: 'buyer type',
  buyer_marital_regime: 'buyer marital position',
  property_title_type: 'property title',
  finance_type: 'finance type',
}

function LegalScenarioField({ label, value, options, placeholder, onChange }) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8fa7]">{label}</span>
      <select className={LEGAL_FIELD_CLASS} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

export default function StartDocumentModal({
  open,
  onClose,
  entryPoint = '',
  packetType = '',
  documentKind = '',
  initialSourceMode = '',
  hasExistingContext = true,
  hasClientContact = true,
  hasParentDocument = true,
  contextSummary = [],
  initialLegalScenario = null,
  title = '',
  subtitle = '',
  busy = false,
  onSelectSourceMode,
  onContinue,
}) {
  const rule = useMemo(() => getDocumentStartEntryPointRule(entryPoint), [entryPoint])
  const resolvedPacketType = normalizeText(packetType || rule?.packetType || 'mandate')
  const resolvedDocumentKind = normalizeText(documentKind || rule?.defaultDocumentKind || DOCUMENT_START_DOCUMENT_KINDS.standard)
  const documentLabel = getDocumentLabel(resolvedPacketType, resolvedDocumentKind)
  const requiresLegalScenario = resolvedDocumentKind === DOCUMENT_START_DOCUMENT_KINDS.standard && ['mandate', 'otp'].includes(resolvedPacketType)
  const modeOptions = useMemo(
    () => getDocumentStartModeOptions({
      entryPoint,
      documentKind: resolvedDocumentKind,
      hasExistingContext,
      hasClientContact,
      hasParentDocument,
    }),
    [entryPoint, hasClientContact, hasExistingContext, hasParentDocument, resolvedDocumentKind],
  )
  const preferredSourceMode = normalizeText(initialSourceMode || rule?.preferredSourceMode || DOCUMENT_START_SOURCE_MODES.saved)
  const [requestedSourceMode, setRequestedSourceMode] = useState(() => getDefaultSourceMode(modeOptions, preferredSourceMode))
  const legalScenarioSeed = useMemo(
    () => normalizeDocumentStartLegalScenario(initialLegalScenario || {}, resolvedPacketType),
    [initialLegalScenario, resolvedPacketType],
  )
  const legalScenarioSeedKey = JSON.stringify(legalScenarioSeed)
  const [legalScenario, setLegalScenario] = useState(legalScenarioSeed)
  useEffect(() => {
    if (!open) return
    setLegalScenario(JSON.parse(legalScenarioSeedKey))
  }, [legalScenarioSeedKey, open])
  const fallbackSourceMode = useMemo(
    () => getDefaultSourceMode(modeOptions, preferredSourceMode),
    [modeOptions, preferredSourceMode],
  )
  useEffect(() => {
    if (!open) return
    setRequestedSourceMode(fallbackSourceMode)
  }, [fallbackSourceMode, open])
  const selectedSourceMode = useMemo(() => {
    const requestedOption = modeOptions.find((option) => option.key === requestedSourceMode)
    return requestedOption && !requestedOption.disabled ? requestedSourceMode : fallbackSourceMode
  }, [fallbackSourceMode, modeOptions, requestedSourceMode])

  const validation = useMemo(
    () => validateDocumentStartRequest({
      packetType: resolvedPacketType,
      documentKind: resolvedDocumentKind,
      sourceMode: selectedSourceMode,
      entryPoint,
      hasExistingContext,
      hasClientContact,
      hasParentDocument,
    }),
    [
      entryPoint,
      hasClientContact,
      hasExistingContext,
      hasParentDocument,
      resolvedDocumentKind,
      resolvedPacketType,
      selectedSourceMode,
    ],
  )
  const selectedOption = modeOptions.find((option) => option.key === selectedSourceMode) || modeOptions[0]
  const isOnboardingStart = selectedSourceMode === DOCUMENT_START_SOURCE_MODES.onboarding
  const legalScenarioReady = !requiresLegalScenario || isOnboardingStart || legalScenario.complete
  const legalInclusions = requiresLegalScenario
    ? getDocumentStartLegalScenarioInclusions(legalScenario, resolvedPacketType)
    : []
  const modalTitle = title || rule?.title || `Create ${documentLabel}`
  const modalSubtitle = subtitle || `Choose the easiest way to start this ${documentLabel}. You can still review the document before signing.`
  const visibleSummary = Array.isArray(contextSummary)
    ? contextSummary.filter((item) => normalizeText(item?.label || item?.value))
    : []
  const canContinue = validation.canStart && legalScenarioReady && !selectedOption?.disabled && !busy
  const RequiredIcon = validation.canStart && legalScenarioReady ? CheckCircle2 : AlertTriangle

  function updateLegalScenario(field, value) {
    setLegalScenario((previous) => normalizeDocumentStartLegalScenario({ ...previous, [field]: value }, resolvedPacketType))
  }

  function selectMode(option) {
    if (!option || option.disabled || busy) return
    setRequestedSourceMode(option.key)
    onSelectSourceMode?.(option.key, option)
  }

  function handleContinue() {
    if (!canContinue) return
    onContinue?.({
      sourceMode: selectedSourceMode,
      packetType: resolvedPacketType,
      documentKind: resolvedDocumentKind,
      entryPoint,
      rule,
      validation,
      legalScenario: {
        ...legalScenario,
        confirmed: legalScenario.complete,
      },
    })
  }

  const scenarioIssue = requiresLegalScenario && !isOnboardingStart && !legalScenario.complete
    ? `Confirm ${legalScenario.missingFields.map((field) => LEGAL_FIELD_LABELS[field] || field.replace(/_/g, ' ')).join(', ')} before continuing.`
    : ''
  const primaryLabel = busy
    ? 'Preparing...'
    : isOnboardingStart
      ? 'Send onboarding'
      : requiresLegalScenario
        ? 'Confirm & continue to draft'
        : 'Continue'

  const footer = (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs leading-5 text-[#607387]">
        {scenarioIssue || (validation.canStart ? 'Drafts stay editable until you generate or send.' : validation.issues[0] || 'Complete the required setup first.')}
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={handleContinue} disabled={!canContinue}>
          <span>{primaryLabel}</span>
          <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      className="max-w-[760px]"
      footer={footer}
    >
      <div className="grid min-w-0 gap-5" data-testid="start-document-modal">
        <section className="rounded-[20px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Start path</p>
              <h4 className="mt-1 text-base font-semibold text-[#102033]">How do you want to create this {documentLabel}?</h4>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#dbe7f3] bg-white px-3 py-1 text-xs font-semibold text-[#51657c]">
              {resolvedDocumentKind === DOCUMENT_START_DOCUMENT_KINDS.standard ? <FileText size={14} /> : <FileSignature size={14} />}
              {documentLabel}
            </span>
          </div>

          {visibleSummary.length ? (
            <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
              {visibleSummary.slice(0, 4).map((item) => (
                <div key={`${item.label}-${item.value}`} className="min-w-0 rounded-[14px] border border-[#e2ebf5] bg-white px-3 py-2">
                  <p className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8fa7]">{item.label}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-[#102033]">{item.value || 'Not set'}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {requiresLegalScenario ? (
          <section className="rounded-[20px] border border-[#dbe7f3] bg-white p-4" data-testid="document-start-legal-scenario">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Legal setup</p>
                <h4 className="mt-1 text-base font-semibold text-[#102033]">Confirm the legal situation</h4>
                <p className="mt-1 text-sm leading-6 text-[#607387]">Arch9 uses these answers to select the correct wording. No template choice is needed.</p>
              </div>
              <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${legalScenario.complete ? 'border-[#cdebd8] bg-[#f1fbf5] text-[#128642]' : 'border-[#f4dfbf] bg-[#fff8ed] text-[#9b6b1c]'}`}>
                {legalScenario.complete ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {legalScenario.complete ? 'Ready' : `${legalScenario.missingFields.length} answer${legalScenario.missingFields.length === 1 ? '' : 's'} needed`}
              </span>
            </div>

            <div className={`mt-4 grid gap-4 ${resolvedPacketType === 'otp' ? 'md:grid-cols-2' : 'md:grid-cols-2'}`}>
              <LegalScenarioField
                label="Seller type"
                value={legalScenario.sellerEntityType}
                options={DOCUMENT_START_PARTY_TYPES}
                placeholder="Choose seller type"
                onChange={(value) => updateLegalScenario('sellerEntityType', value)}
              />
              {legalScenario.sellerEntityType === 'individual' ? (
                <LegalScenarioField
                  label="Seller marital position"
                  value={legalScenario.sellerMaritalRegime}
                  options={DOCUMENT_START_MARITAL_REGIMES}
                  placeholder="Choose marital position"
                  onChange={(value) => updateLegalScenario('sellerMaritalRegime', value)}
                />
              ) : null}
              {resolvedPacketType === 'otp' ? (
                <LegalScenarioField
                  label="Buyer type"
                  value={legalScenario.buyerEntityType}
                  options={DOCUMENT_START_PARTY_TYPES}
                  placeholder="Choose buyer type"
                  onChange={(value) => updateLegalScenario('buyerEntityType', value)}
                />
              ) : null}
              {resolvedPacketType === 'otp' && legalScenario.buyerEntityType === 'individual' ? (
                <LegalScenarioField
                  label="Buyer marital position"
                  value={legalScenario.buyerMaritalRegime}
                  options={DOCUMENT_START_MARITAL_REGIMES}
                  placeholder="Choose marital position"
                  onChange={(value) => updateLegalScenario('buyerMaritalRegime', value)}
                />
              ) : null}
              <LegalScenarioField
                label="Property title"
                value={legalScenario.propertyTitleType}
                options={DOCUMENT_START_PROPERTY_TITLE_TYPES}
                placeholder="Choose title type"
                onChange={(value) => updateLegalScenario('propertyTitleType', value)}
              />
              {resolvedPacketType === 'otp' ? (
                <LegalScenarioField
                  label="Finance"
                  value={legalScenario.financeType}
                  options={DOCUMENT_START_FINANCE_TYPES}
                  placeholder="Choose finance type"
                  onChange={(value) => updateLegalScenario('financeType', value)}
                />
              ) : null}
            </div>

            <div className={`mt-4 rounded-[18px] border px-4 py-3 ${legalScenario.complete ? 'border-[#d8f0e3] bg-[#f5fbf7]' : 'border-[#f4dfbf] bg-[#fff8ed]'}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] ${legalScenario.complete ? 'bg-[#eaf8ef] text-[#128642]' : 'bg-[#fff3dd] text-[#9b6b1c]'}`}>
                  <ShieldCheck size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#102033]">{legalScenario.complete ? 'Arch9 will prepare' : 'Complete the legal setup'}</p>
                  <p className="mt-1 text-sm leading-6 text-[#607387]">{legalScenario.summaryLabel || 'Choose the party and property details above.'}</p>
                  {legalInclusions.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {legalInclusions.map((item) => (
                        <span key={item} className="rounded-full border border-[#dbe7f3] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#51657c]">{item}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <details className="group rounded-[20px] border border-[#dbe7f3] bg-white p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8fa7]">Details source</p>
              <p className="mt-1 text-sm font-semibold text-[#102033]">{selectedOption?.label || 'Choose how to start'}</p>
            </div>
            <ChevronDown size={17} className="text-[#6b7c93] transition group-open:rotate-180" />
          </summary>
          <div className="mt-4 grid min-w-0 gap-2 md:grid-cols-3" role="radiogroup" aria-label="Document start options">
            {modeOptions.map((option) => {
              const active = option.key === selectedSourceMode
              const Icon = modeIcons[option.key] || FileText
              const tone = modeToneClasses[option.key] || modeToneClasses[DOCUMENT_START_SOURCE_MODES.manual]
              return (
                <button
                  key={option.key}
                  type="button"
                  className={[
                    'flex min-w-0 items-start gap-3 rounded-[16px] border p-3 text-left transition',
                    active ? tone.active : 'border-[#e0e8f2] bg-white hover:border-[#c8d7e7] hover:bg-[#fbfdff]',
                    option.disabled || busy ? 'cursor-not-allowed opacity-60' : '',
                  ].join(' ')}
                  onClick={() => selectMode(option)}
                  disabled={option.disabled || busy}
                  aria-pressed={active}
                  data-testid={`document-start-mode-${option.key}`}
                >
                  <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] ${tone.icon}`}><Icon size={15} /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#102033]">{option.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-[#607387]">{option.disabled ? option.disabledReason : option.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </details>

        <section className="grid min-w-0 gap-3 rounded-[20px] border border-[#dbe7f3] bg-white p-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <span className={[
                'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px]',
                validation.canStart ? 'bg-[#eaf8ef] text-[#128642]' : 'bg-[#fff6e9] text-[#b66b12]',
              ].join(' ')}
              >
                <RequiredIcon size={16} />
              </span>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-[#102033]">What happens next</h4>
                <p className="mt-1 text-sm leading-6 text-[#607387]">
                  {getNextStepCopy(selectedSourceMode, documentLabel)}
                </p>
                {!validation.canStart || scenarioIssue ? (
                  <ul className="mt-3 grid gap-1.5 text-xs leading-5 text-[#9a650d]">
                    {[...validation.issues, scenarioIssue].filter(Boolean).map((issue) => (
                      <li key={issue} className="flex gap-2">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>
          <div className="min-w-0 rounded-[16px] border border-[#e5edf6] bg-[#fbfdff] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8fa7]">Needed for this path</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {validation.requiredFields.length ? (
                validation.requiredFields.map((field) => (
                  <span key={field} className="rounded-full border border-[#dbe7f3] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#51657c]">
                    {field.replace(/_/g, ' ')}
                  </span>
                ))
              ) : (
                <span className="text-xs leading-5 text-[#607387]">No extra fields required yet.</span>
              )}
            </div>
          </div>
        </section>
      </div>
    </Modal>
  )
}
