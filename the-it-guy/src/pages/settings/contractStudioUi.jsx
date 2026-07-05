import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileSignature,
  FileText,
  Plus,
  RefreshCw,
  Save,
  XCircle,
} from 'lucide-react'
import { SettingsBanner, settingsFieldClass } from './settingsUi'
import {
  DOCUMENT_CREATION_KIND_OPTIONS,
  DOCUMENT_RUN_SOURCE_OPTIONS,
  getDocumentKindOption,
  getDocumentRunReadiness,
  studioPrimaryButtonClass,
  studioSecondaryButtonClass,
} from './contractStudioConstants'
import MandateDraftIntakePanel from '../../components/documents/MandateDraftIntakePanel'
import OtpDraftIntakePanel from '../../components/documents/OtpDraftIntakePanel'
import { DOCUMENT_START_SOURCE_MODES } from '../../core/documents/documentStartRules'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function statusPillClass(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (['active', 'approved', 'generated', 'completed', 'signed'].includes(normalized)) {
    return 'border-[#cdebd8] bg-[#eef9f1] text-[#128642]'
  }
  if (['draft', 'pending', 'ready_for_generation', 'signing_prep'].includes(normalized)) {
    return 'border-[#dbe7f3] bg-[#f8fbff] text-[#607387]'
  }
  if (['archived', 'voided', 'rejected', 'failed'].includes(normalized)) {
    return 'border-[#f3d5d7] bg-[#fff6f6] text-[#b4383e]'
  }
  return 'border-[#e6edf5] bg-white text-[#607387]'
}

function normalizeValidationIssue(issue) {
  if (typeof issue === 'string') {
    return {
      message: issue,
      sectionLabel: '',
      placeholderLabel: '',
      placeholderKey: '',
    }
  }

  return {
    message: normalizeText(issue?.message || issue?.detail || issue?.label || 'Review this validation issue.'),
    sectionLabel: normalizeText(issue?.sectionLabel || issue?.section_label || issue?.group || issue?.groupLabel),
    placeholderLabel: normalizeText(issue?.placeholderLabel || issue?.placeholder_label || issue?.label),
    placeholderKey: normalizeText(issue?.placeholderKey || issue?.placeholder_key || issue?.field || issue?.key),
  }
}

export function TemplateStatusPill({ status = 'draft', children = null }) {
  const label = children || status || 'Draft'
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.12em] ${statusPillClass(status)}`}>
      {label}
    </span>
  )
}

export function TemplateStudioPanel({ eyebrow = '', title = '', description = '', actions = null, className = '', children }) {
  return (
    <section className={`rounded-[28px] border border-[#dbe7f3] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)] ${className}`.trim()}>
      {(eyebrow || title || description || actions) ? (
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            {eyebrow ? <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7a8da6]">{eyebrow}</p> : null}
            {title ? <h3 className="text-[1.05rem] font-semibold text-[#102033]">{title}</h3> : null}
            {description ? <p className="text-sm leading-6 text-[#6b7c93]">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function TemplateStudioMetricCard({ label, value, description, tone = 'default' }) {
  const toneClasses = tone === 'success'
    ? 'border-[#d6efe1] bg-[#f5fbf8]'
    : tone === 'warning'
      ? 'border-[#f6e4bf] bg-[#fffaf1]'
      : 'border-[#dbe7f3] bg-white'

  return (
    <div className={`rounded-[22px] border p-4 shadow-[0_12px_24px_rgba(15,23,42,0.04)] ${toneClasses}`}>
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">{label}</p>
      <p className="mt-3 text-[1.8rem] font-semibold leading-none text-[#102033]">{value}</p>
      {description ? <p className="mt-2 text-sm leading-5 text-[#6b7c93]">{description}</p> : null}
    </div>
  )
}

export function TemplateStudioTabButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-[16px] px-4 py-2.5 text-sm font-semibold transition',
        active
          ? 'border border-[#b9dfc8] bg-[#edf9f1] text-[#128642] shadow-[0_10px_22px_rgba(18,134,66,0.10)]'
          : 'border border-transparent bg-white/70 text-[#6b7c93] hover:border-[#dbe7f3] hover:text-[#102033]',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

export function DocumentBuilderActionRail({ actions = [] }) {
  return (
    <div className="rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] p-2">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon || FileText
          const active = Boolean(action.active)
          const primary = action.tone === 'primary'
          const disabled = Boolean(action.disabled)
          return (
            <button
              key={action.key || action.label}
              type="button"
              onClick={action.onClick}
              disabled={disabled}
              className={[
                'flex min-h-[72px] min-w-0 items-center gap-3 rounded-[14px] border px-3 py-3 text-left transition',
                disabled ? 'cursor-not-allowed opacity-55' : '',
                primary && !disabled
                  ? 'border-[#128642] bg-[#128642] text-white shadow-[0_14px_26px_rgba(18,134,66,0.20)] hover:bg-[#0f7438]'
                  : active
                    ? 'border-[#96d7ad] bg-[#edf9f1] text-[#0f7438] shadow-[0_10px_20px_rgba(18,134,66,0.08)]'
                    : 'border-[#dbe7f3] bg-white text-[#102033] hover:border-[#bfd5f5] hover:bg-[#f8fbff]',
              ].join(' ')}
            >
              <span className={[
                'grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border',
                primary && !disabled
                  ? 'border-white/20 bg-white/15 text-white'
                  : active
                    ? 'border-[#cdebd8] bg-white text-[#128642]'
                    : 'border-[#e4ebf2] bg-[#f8fbff] text-[#52667d]',
              ].join(' ')}
              >
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-5">{action.label}</span>
                {action.detail ? (
                  <span className={[
                    'mt-1 block text-xs leading-4',
                    primary && !disabled ? 'text-white/78' : 'text-[#607387]',
                  ].join(' ')}
                  >
                    {action.detail}
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ValidationIssueCard({ issue, tone = 'warning', label = 'Issue' }) {
  const normalized = normalizeValidationIssue(issue)
  const Icon = tone === 'error' ? XCircle : AlertTriangle
  const toneClass = tone === 'error'
    ? 'border-[#f3d1ce] bg-[#fff4f3] text-[#8e1f15]'
    : 'border-[#f4e2bf] bg-[#fff8ec] text-[#7d520d]'

  return (
    <div className={`rounded-[16px] border px-4 py-3 text-sm leading-6 ${toneClass}`}>
      <div className="flex items-start gap-2">
        <Icon size={16} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{normalized.message}</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold opacity-80">
            {normalized.sectionLabel ? <span>{label}: {normalized.sectionLabel}</span> : null}
            {normalized.placeholderLabel || normalized.placeholderKey ? (
              <span>Field: {normalized.placeholderLabel || `{{${normalized.placeholderKey}}}`}</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export function DocumentCreationPanel({
  documentRunForm,
  setDocumentRunForm,
  packetType,
  form,
  selectedTemplate,
  templateTypeConfig,
  hasUnsavedChanges,
  testingTemplate,
  creatingDocumentPacket,
  setActiveStudioArea,
  setActiveTab,
  createDefaultDocumentRunForm,
  addendumDetailOptions = [],
  documentLinkOptions = { clients: [], properties: [] },
  documentLinkOptionsLoading = false,
  documentLinkOptionsError = '',
  onRefreshDocumentLinkOptions,
  handleTestGenerateFromRun,
  handleCreateDocumentPacketFromRun,
}) {
  const selectedDocumentKind = getDocumentKindOption(documentRunForm.documentKind).key
  const selectedDocumentKindOption = getDocumentKindOption(documentRunForm.documentKind)
  const selectedSourceOption = DOCUMENT_RUN_SOURCE_OPTIONS.find((option) => option.key === documentRunForm.sourceType) || DOCUMENT_RUN_SOURCE_OPTIONS[0]
  const selectedTemplateLabel = form.templateLabel || selectedTemplate?.template_label || templateTypeConfig?.label || ''
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  const isRelatedDocumentKind = !['standard', 'custom'].includes(selectedDocumentKind)
  const selectedAddendumDetailOption = addendumDetailOptions.find((option) => option.key === documentRunForm.addendumType) || addendumDetailOptions[0] || null
  const addendumDetailFields = selectedAddendumDetailOption?.fields || []
  const shouldShowAddendumDetails = isRelatedDocumentKind && Boolean(selectedAddendumDetailOption && addendumDetailFields.length)
  const defaultManualDraft = createDefaultDocumentRunForm(packetType, selectedTemplateLabel)?.manualDraft || {}
  const manualDraft = {
    ...defaultManualDraft,
    ...(documentRunForm.manualDraftType === normalizedPacketType && documentRunForm.manualDraft && typeof documentRunForm.manualDraft === 'object'
      ? documentRunForm.manualDraft
      : {}),
  }
  const showManualDraftIntake = selectedDocumentKind === 'standard' &&
    ['otp', 'mandate'].includes(normalizedPacketType) &&
    (
      documentRunForm.sourceType === 'manual' ||
      documentRunForm.documentStartSourceMode === DOCUMENT_START_SOURCE_MODES.manual
    )
  const documentRunReadiness = getDocumentRunReadiness({ documentRunForm, addendumDetailFields })
  const readyForGeneratedCreate = !isRelatedDocumentKind || documentRunReadiness.ready
  const readinessStepLabel = shouldShowAddendumDetails ? 'Step 4' : 'Step 3'
  const finalStepLabel = isRelatedDocumentKind ? shouldShowAddendumDetails ? 'Step 5' : 'Step 4' : 'Step 2'
  const createActionLabel = selectedDocumentKind === 'standard' ? 'Create Document' : `Create ${selectedDocumentKindOption.label}`
  const savingActionLabel = selectedDocumentKind === 'standard' ? 'Creating...' : `Creating ${selectedDocumentKindOption.label}...`
  const saveDraftLabel = selectedDocumentKind === 'standard' ? 'Save Draft' : `Save ${selectedDocumentKindOption.label} Draft`
  const clientLinkOptions = Array.isArray(documentLinkOptions.clients) ? documentLinkOptions.clients : []
  const propertyLinkOptions = Array.isArray(documentLinkOptions.properties) ? documentLinkOptions.properties : []

  function updateDocumentKind(option) {
    setDocumentRunForm((previous) => {
      const currentDefault = createDefaultDocumentRunForm(packetType, selectedTemplateLabel)
      const templateLabel = normalizeText(selectedTemplateLabel || templateTypeConfig.shortLabel || 'Document')
      const previousTitle = normalizeText(previous.title)
      const generatedTitle = option.key === 'standard'
        ? currentDefault.title
        : `${option.label} - ${templateLabel}`
      const shouldReplaceTitle = !previousTitle ||
        previousTitle === currentDefault.title ||
        DOCUMENT_CREATION_KIND_OPTIONS.some((kind) => previousTitle.startsWith(`${kind.label} -`))

      return {
        ...previous,
        documentKind: option.key,
        title: shouldReplaceTitle ? generatedTitle : previous.title,
      }
    })
  }

  function updateAddendumType(nextAddendumType) {
    const nextOption = addendumDetailOptions.find((option) => option.key === nextAddendumType) || addendumDetailOptions[0]
    if (!nextOption) return
    const allowedKeys = new Set((nextOption.fields || []).map((field) => field.key))
    setDocumentRunForm((previous) => {
      const nextDetails = Object.entries(previous.addendumDetails || {}).reduce((accumulator, [key, value]) => {
        if (allowedKeys.has(key)) accumulator[key] = value
        return accumulator
      }, {})
      return {
        ...previous,
        addendumType: nextOption.key,
        addendumDetails: nextDetails,
      }
    })
  }

  function updateAddendumDetail(fieldKey, value) {
    setDocumentRunForm((previous) => ({
      ...previous,
      addendumDetails: {
        ...(previous.addendumDetails || {}),
        [fieldKey]: value,
      },
    }))
  }

  function updateManualDraftField(fieldKey, value) {
    setDocumentRunForm((previous) => {
      const previousDraft = previous.manualDraftType === normalizedPacketType && previous.manualDraft && typeof previous.manualDraft === 'object'
        ? previous.manualDraft
        : {}
      return {
        ...previous,
        sourceType: 'manual',
        documentStartSourceMode: previous.documentStartSourceMode || DOCUMENT_START_SOURCE_MODES.manual,
        manualDraftType: normalizedPacketType,
        manualDraft: {
          ...defaultManualDraft,
          ...previousDraft,
          [fieldKey]: value,
        },
      }
    })
  }

  function resetManualDraftFields() {
    setDocumentRunForm((previous) => ({
      ...previous,
      sourceType: 'manual',
      documentStartSourceMode: previous.documentStartSourceMode || DOCUMENT_START_SOURCE_MODES.manual,
      manualDraftType: normalizedPacketType,
      manualDraft: defaultManualDraft,
    }))
  }

  function applySavedClientLink(optionKey = '') {
    const selectedKey = normalizeText(optionKey)
    setDocumentRunForm((previous) => {
      if (!selectedKey) {
        return {
          ...previous,
          linkedClientKey: '',
          leadId: previous.linkedPropertyKey ? previous.leadId || '' : '',
          contactId: '',
        }
      }

      const option = clientLinkOptions.find((item) => item.key === selectedKey)
      if (!option) {
        return {
          ...previous,
          linkedClientKey: selectedKey,
        }
      }

      const previousDraft = previous.manualDraftType === normalizedPacketType && previous.manualDraft && typeof previous.manualDraft === 'object'
        ? previous.manualDraft
        : {}
      const draftPatch = normalizedPacketType === 'mandate'
        ? option.mandateDraftPatch || {}
        : option.otpDraftPatch || {}

      return {
        ...previous,
        sourceType: 'manual',
        documentStartSourceMode: previous.documentStartSourceMode || DOCUMENT_START_SOURCE_MODES.manual,
        linkedClientKey: option.key,
        leadId: option.leadId || previous.leadId || '',
        contactId: option.contactId || previous.contactId || '',
        manualDraftType: normalizedPacketType,
        manualDraft: {
          ...defaultManualDraft,
          ...previousDraft,
          ...draftPatch,
        },
      }
    })
  }

  function applySavedPropertyLink(optionKey = '') {
    const selectedKey = normalizeText(optionKey)
    setDocumentRunForm((previous) => {
      if (!selectedKey) {
        return {
          ...previous,
          linkedPropertyKey: '',
          privateListingId: '',
          leadId: previous.linkedClientKey ? previous.leadId || '' : '',
        }
      }

      const option = propertyLinkOptions.find((item) => item.key === selectedKey)
      if (!option) {
        return {
          ...previous,
          linkedPropertyKey: selectedKey,
        }
      }

      const previousDraft = previous.manualDraftType === normalizedPacketType && previous.manualDraft && typeof previous.manualDraft === 'object'
        ? previous.manualDraft
        : {}
      const draftPatch = normalizedPacketType === 'mandate'
        ? option.mandateDraftPatch || {}
        : option.otpDraftPatch || {}

      return {
        ...previous,
        sourceType: 'manual',
        documentStartSourceMode: previous.documentStartSourceMode || DOCUMENT_START_SOURCE_MODES.manual,
        linkedPropertyKey: option.key,
        privateListingId: option.privateListingId || previous.privateListingId || '',
        leadId: normalizedPacketType === 'mandate' && option.leadId
          ? option.leadId
          : previous.leadId || '',
        manualDraftType: normalizedPacketType,
        manualDraft: {
          ...defaultManualDraft,
          ...previousDraft,
          ...draftPatch,
        },
      }
    })
  }

  return (
    <TemplateStudioPanel
      eyebrow="Create"
      title="Create Document"
      description="Choose what you need, then create it from the selected template."
    >
      <div className="space-y-4">
        <div className="rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">Step 1</p>
          <label className={`${settingsFieldClass} mt-3`}>
            What are you making?
            <select
              value={selectedDocumentKind}
              onChange={(event) => {
                const selectedOption = DOCUMENT_CREATION_KIND_OPTIONS.find((option) => option.key === event.target.value)
                if (selectedOption) updateDocumentKind(selectedOption)
              }}
            >
              {DOCUMENT_CREATION_KIND_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>
          <p className="mt-3 text-sm leading-6 text-[#607387]">{selectedDocumentKindOption.description}</p>
        </div>

        {hasUnsavedChanges ? (
          <SettingsBanner tone="warning">
            Save the selected template before creating a document from it.
          </SettingsBanner>
        ) : null}

        {showManualDraftIntake ? (
          <div className="rounded-[18px] border border-[#dbe7f3] bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">Optional</p>
                <h4 className="mt-2 text-sm font-semibold text-[#102033]">Use saved records (optional)</h4>
                <p className="mt-1 text-sm leading-6 text-[#607387]">
                  Choose a client or property to fill the form below, then edit anything before creating the document.
                </p>
              </div>
              {onRefreshDocumentLinkOptions ? (
                <button
                  type="button"
                  className={`${studioSecondaryButtonClass} shrink-0`}
                  onClick={() => void onRefreshDocumentLinkOptions()}
                  disabled={documentLinkOptionsLoading}
                >
                  <RefreshCw size={14} className={documentLinkOptionsLoading ? 'animate-spin' : ''} />
                  <span>{documentLinkOptionsLoading ? 'Loading...' : 'Refresh'}</span>
                </button>
              ) : null}
            </div>

            {documentLinkOptionsError ? (
              <div className="mt-3 rounded-[14px] border border-[#f4e2bf] bg-[#fff8ec] px-3 py-2 text-sm leading-6 text-[#9a650d]">
                {documentLinkOptionsError}
              </div>
            ) : null}

            <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">
              <label className={`${settingsFieldClass} min-w-0`}>
                Saved client
                <select
                  value={documentRunForm.linkedClientKey || ''}
                  onChange={(event) => applySavedClientLink(event.target.value)}
                  disabled={documentLinkOptionsLoading && !clientLinkOptions.length}
                >
                  <option value="">
                    {documentLinkOptionsLoading && !clientLinkOptions.length ? 'Loading saved clients...' : 'No saved client selected'}
                  </option>
                  {clientLinkOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.helper ? `${option.label} - ${option.helper}` : option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={`${settingsFieldClass} min-w-0`}>
                Saved property
                <select
                  value={documentRunForm.linkedPropertyKey || ''}
                  onChange={(event) => applySavedPropertyLink(event.target.value)}
                  disabled={documentLinkOptionsLoading && !propertyLinkOptions.length}
                >
                  <option value="">
                    {documentLinkOptionsLoading && !propertyLinkOptions.length ? 'Loading saved properties...' : 'No saved property selected'}
                  </option>
                  {propertyLinkOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.helper ? `${option.label} - ${option.helper}` : option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : null}

        {showManualDraftIntake ? (
          normalizedPacketType === 'mandate' ? (
            <MandateDraftIntakePanel
              draft={manualDraft}
              sourceMode={documentRunForm.documentStartSourceMode || DOCUMENT_START_SOURCE_MODES.manual}
              documentStart={documentRunForm.documentStart}
              onFieldChange={updateManualDraftField}
              onReset={resetManualDraftFields}
            />
          ) : (
            <OtpDraftIntakePanel
              draft={manualDraft}
              sourceMode={documentRunForm.documentStartSourceMode || DOCUMENT_START_SOURCE_MODES.manual}
              documentStart={documentRunForm.documentStart}
              onFieldChange={updateManualDraftField}
              onReset={resetManualDraftFields}
            />
          )
        ) : null}

        {isRelatedDocumentKind ? (
          <div className="rounded-[18px] border border-[#dbe7f3] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">Step 2</p>
            <div className="mt-3 space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-[#102033]">Link the original document</h4>
                <p className="mt-1 text-sm leading-6 text-[#607387]">
                  Connect this {selectedDocumentKindOption.label.toLowerCase()} to the existing agreement, mandate, or deal record it changes.
                </p>
              </div>
              <label className={settingsFieldClass}>
                Original document packet ID
                <input
                  type="text"
                  value={documentRunForm.parentDocumentId || ''}
                  onChange={(event) => setDocumentRunForm((previous) => ({ ...previous, parentDocumentId: event.target.value }))}
                  placeholder="UUID"
                />
              </label>
              <label className={settingsFieldClass}>
                Original document reference
                <input
                  type="text"
                  value={documentRunForm.parentDocumentReference || ''}
                  onChange={(event) => setDocumentRunForm((previous) => ({ ...previous, parentDocumentReference: event.target.value }))}
                  placeholder="Signed OTP v1, Sales Mandate, or client reference"
                />
              </label>
              <label className={settingsFieldClass}>
                What changed?
                <textarea
                  rows={3}
                  value={documentRunForm.documentChangeSummary || ''}
                  onChange={(event) => setDocumentRunForm((previous) => ({ ...previous, documentChangeSummary: event.target.value }))}
                  placeholder="Example: update occupation date, add a condition, or clarify a mandate term."
                />
              </label>
            </div>
          </div>
        ) : null}

        {shouldShowAddendumDetails ? (
          <div className="rounded-[18px] border border-[#dbe7f3] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">Step 3</p>
            <div className="mt-3 space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-[#102033]">Fill the addendum details</h4>
                <p className="mt-1 text-sm leading-6 text-[#607387]">
                  These fields feed the generated document so the addendum can be reviewed before signing.
                </p>
              </div>
              <label className={settingsFieldClass}>
                Addendum type
                <select
                  value={selectedAddendumDetailOption.key}
                  onChange={(event) => updateAddendumType(event.target.value)}
                >
                  {addendumDetailOptions.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </label>
              {selectedAddendumDetailOption.helperText ? (
                <p className="rounded-[14px] border border-[#e7eef6] bg-[#fbfdff] px-3 py-2 text-xs leading-5 text-[#607387]">
                  {selectedAddendumDetailOption.helperText}
                </p>
              ) : null}
              <div className="grid min-w-0 gap-3 md:grid-cols-2">
                {addendumDetailFields.map((field) => {
                  const fieldValue = documentRunForm.addendumDetails?.[field.key] || ''
                  const isWide = field.control === 'textarea'
                  return (
                    <label key={field.key} className={`${settingsFieldClass} min-w-0 ${isWide ? 'md:col-span-2' : ''}`}>
                      {field.label}
                      {field.control === 'textarea' ? (
                        <textarea
                          rows={field.rows || 3}
                          value={fieldValue}
                          onChange={(event) => updateAddendumDetail(field.key, event.target.value)}
                          placeholder={field.placeholder || ''}
                        />
                      ) : (
                        <input
                          type={field.control === 'date' ? 'date' : 'text'}
                          value={fieldValue}
                          onChange={(event) => updateAddendumDetail(field.key, event.target.value)}
                          placeholder={field.placeholder || ''}
                        />
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        ) : null}

        {isRelatedDocumentKind ? (
          <div className={[
            'rounded-[18px] border p-4',
            documentRunReadiness.ready
              ? 'border-[#d6efe1] bg-[#f5fbf8]'
              : 'border-[#f4e2bf] bg-[#fff8ec]',
          ].join(' ')}
          >
            <p className={[
              'text-xs font-semibold uppercase tracking-[0.14em]',
              documentRunReadiness.ready ? 'text-[#5a8d6d]' : 'text-[#9a650d]',
            ].join(' ')}
            >
              {readinessStepLabel}
            </p>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-[#102033]">Ready to generate?</h4>
                <p className="mt-1 text-sm leading-6 text-[#607387]">
                  Complete these basics before generating the addendum. You can still save an incomplete draft from More options.
                </p>
              </div>
              <span className={[
                'rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold',
                documentRunReadiness.ready
                  ? 'border-[#cdebd8] bg-white text-[#128642]'
                  : 'border-[#f4e2bf] bg-white text-[#9a650d]',
              ].join(' ')}
              >
                {documentRunReadiness.ready ? 'Ready' : 'Needs details'}
              </span>
            </div>
            <div className="mt-4 grid gap-2">
              {documentRunReadiness.items.map((item) => {
                const Icon = item.passed ? CheckCircle2 : AlertTriangle
                return (
                  <div key={item.key} className="flex items-start gap-3 rounded-[14px] border border-white/70 bg-white px-3 py-3 text-sm">
                    <Icon size={16} className={item.passed ? 'mt-0.5 shrink-0 text-[#128642]' : 'mt-0.5 shrink-0 text-[#b46f00]'} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-[#102033]">{item.label}</span>
                      <span className="mt-1 block leading-5 text-[#607387]">{item.detail}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="rounded-[18px] border border-[#d6efe1] bg-[#f5fbf8] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a8d6d]">{finalStepLabel}</p>
          <button
            type="button"
            className={`${studioPrimaryButtonClass} mt-3 w-full`}
            onClick={() => void handleCreateDocumentPacketFromRun({ autoGenerate: true })}
            disabled={creatingDocumentPacket || !selectedTemplate || hasUnsavedChanges || !readyForGeneratedCreate}
          >
            <FileSignature size={14} />
            <span>{creatingDocumentPacket ? savingActionLabel : createActionLabel}</span>
          </button>
          <p className="mt-3 text-sm leading-6 text-[#4f6d5d]">
            {readyForGeneratedCreate
              ? `Creates a generated ${selectedDocumentKind === 'standard' ? 'draft' : selectedDocumentKindOption.label.toLowerCase()}. You can then prepare signing fields and send links from the document library.`
              : 'Complete the readiness checklist above before generating. Save a draft from More options if you need to come back later.'}
          </p>
        </div>

        <details className="rounded-[16px] border border-[#dbe7f3] bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#102033]">
            <span>More options</span>
            <span className="rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#607387]">
              {selectedSourceOption.label}
            </span>
          </summary>
          <div className="space-y-3 border-t border-[#e7eef6] px-4 py-4">
            <label className={settingsFieldClass}>
              Document title
              <input
                type="text"
                value={documentRunForm.title}
                onChange={(event) => setDocumentRunForm((previous) => ({ ...previous, title: event.target.value }))}
                placeholder={`${templateTypeConfig.shortLabel} document`}
              />
            </label>

            <label className={settingsFieldClass}>
              Link to
              <select
                value={documentRunForm.sourceType}
                onChange={(event) => {
                  const nextSourceType = event.target.value
                  setDocumentRunForm((previous) => ({
                    ...previous,
                    sourceType: nextSourceType,
                    documentStartSourceMode: nextSourceType === 'manual'
                      ? DOCUMENT_START_SOURCE_MODES.manual
                      : previous.documentStartSourceMode,
                  }))
                }}
              >
                {DOCUMENT_RUN_SOURCE_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
            <p className="rounded-[14px] border border-[#e7eef6] bg-[#fbfdff] px-3 py-2 text-xs leading-5 text-[#607387]">
              {selectedSourceOption.description}
            </p>

            <div className="grid gap-3">
              {[
                ['transactionId', 'Transaction ID'],
                ['leadId', 'Lead ID'],
                ['contactId', 'Contact ID'],
                ['dealId', 'Deal ID'],
                ['unitId', 'Unit ID'],
                ['privateListingId', 'Property listing ID'],
              ].map(([key, label]) => (
                <label key={key} className={settingsFieldClass}>
                  {label}
                  <input
                    type="text"
                    value={documentRunForm[key]}
                    onChange={(event) => setDocumentRunForm((previous) => ({ ...previous, [key]: event.target.value }))}
                    placeholder="UUID"
                  />
                </label>
              ))}
            </div>

            <label className="flex items-start gap-3 rounded-[14px] border border-[#dbe7f3] bg-white px-3 py-3 text-sm text-[#445b73]">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(documentRunForm.useSampleFallback)}
                onChange={(event) => setDocumentRunForm((previous) => ({ ...previous, useSampleFallback: event.target.checked }))}
              />
              <span>
                <span className="block font-semibold text-[#102033]">Use safe example values</span>
                <span className="mt-1 block leading-5 text-[#6b7c93]">Useful for drafting before every linked field is ready.</span>
              </span>
            </label>

            <label className={settingsFieldClass}>
              Extra details JSON
              <textarea
                rows={7}
                value={documentRunForm.contextJson}
                onChange={(event) => setDocumentRunForm((previous) => ({ ...previous, contextJson: event.target.value }))}
                placeholder={'{\n  "transaction": { "purchase_price": 3250000 },\n  "sourceContext": { "property_address": "12 Example Street" }\n}'}
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className={`${studioSecondaryButtonClass} w-full`}
                onClick={() => {
                  setActiveStudioArea('templates')
                  setActiveTab('preview')
                  requestAnimationFrame(() => void handleTestGenerateFromRun())
                }}
                disabled={testingTemplate || !selectedTemplate}
              >
                <Eye size={14} />
                <span>{testingTemplate ? 'Previewing...' : 'Preview'}</span>
              </button>
              <button
                type="button"
                className={`${studioSecondaryButtonClass} w-full`}
                onClick={() => void handleCreateDocumentPacketFromRun()}
                disabled={creatingDocumentPacket || !selectedTemplate || hasUnsavedChanges}
              >
                <Save size={14} />
                <span>{creatingDocumentPacket ? 'Saving...' : saveDraftLabel}</span>
              </button>
            </div>
          </div>
        </details>

        <div className="rounded-[16px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3 text-sm leading-6 text-[#607387]">
          After creating, select the document below to prepare fields and send signing links.
        </div>
      </div>
    </TemplateStudioPanel>
  )
}

export function TemplateCreationPanel({
  canEdit,
  cloning,
  saving,
  handleCreateTemplate,
  handleCreateGeneralAddendumTemplate,
  handleCreateAddendumStarterTemplate,
  addendumTemplateStarters = [],
  setActiveStudioArea,
  setActiveTab,
}) {
  function openCreatedTemplate(created) {
    if (!created?.id) return
    setActiveStudioArea('templates')
    setActiveTab('template')
  }

  const commonAddendumStarters = addendumTemplateStarters.filter((starter) => starter.key !== 'general_addendum')

  return (
    <TemplateStudioPanel
      eyebrow="Templates"
      title="Need Another Template?"
      description="Create a reusable template for addendums, annexures, or internal document packs."
    >
      <div className="grid gap-2">
        <button
          type="button"
          className={studioPrimaryButtonClass}
          onClick={() => {
            void handleCreateTemplate().then(openCreatedTemplate)
          }}
          disabled={!canEdit || cloning || saving}
        >
          <Plus size={14} />
          <span>Create Blank Template</span>
        </button>
        <button
          type="button"
          className={studioSecondaryButtonClass}
          onClick={() => {
            void handleCreateGeneralAddendumTemplate().then(openCreatedTemplate)
          }}
          disabled={!canEdit || cloning || saving}
        >
          <FileSignature size={14} />
          <span>General Addendum</span>
        </button>
        {commonAddendumStarters.length ? (
          <details className="rounded-[16px] border border-[#dbe7f3] bg-[#fbfdff]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#102033]">
              <span>Common Addendums</span>
              <span className="rounded-full border border-[#dbe7f3] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#607387]">
                {commonAddendumStarters.length}
              </span>
            </summary>
            <div className="grid gap-2 border-t border-[#e7eef6] px-3 py-3">
              {commonAddendumStarters.map((starter) => (
                <button
                  key={starter.key}
                  type="button"
                  className="rounded-[14px] border border-[#dbe7f3] bg-white px-3 py-2.5 text-left transition hover:border-[#bfd5f5] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    void handleCreateAddendumStarterTemplate(starter.key).then(openCreatedTemplate)
                  }}
                  disabled={!canEdit || cloning || saving}
                >
                  <span className="block text-sm font-semibold text-[#102033]">{starter.shortLabel}</span>
                  <span className="mt-1 block text-xs leading-5 text-[#607387]">{starter.description}</span>
                </button>
              ))}
            </div>
          </details>
        ) : null}
        <button
          type="button"
          className={studioSecondaryButtonClass}
          onClick={() => {
            setActiveStudioArea('templates')
            setActiveTab('template')
          }}
        >
          <FileText size={14} />
          <span>Edit Selected Template</span>
        </button>
      </div>
    </TemplateStudioPanel>
  )
}
