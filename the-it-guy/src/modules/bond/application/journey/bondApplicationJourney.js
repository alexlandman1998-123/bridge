import {
  BOND_APPLICATION_INTENTS,
  BOND_APPLICATION_PRE_APPROVAL_STATUSES,
} from '../bondApplicationState.js'

export const BOND_APPLICATION_JOURNEY_VERSION = 'phase-5-stage-gates-v1'

export const BOND_APPLICATION_JOURNEY_STAGE_KEYS = Object.freeze({
  received: 'received',
  documents: 'documents',
  banks: 'banks',
  quotes: 'quotes',
  grant: 'grant',
  instruction: 'instruction',
  complete: 'complete',
})

export const BOND_APPLICATION_JOURNEY_STAGE_DEFINITIONS = Object.freeze([
  {
    key: BOND_APPLICATION_JOURNEY_STAGE_KEYS.received,
    label: 'Application Received',
    iconKey: 'check',
    actionLabel: 'Open application',
    target: 'application',
    requirements: [
      { key: 'application_exists', label: 'Bond application file exists' },
    ],
  },
  {
    key: BOND_APPLICATION_JOURNEY_STAGE_KEYS.documents,
    label: 'Documents Received',
    iconKey: 'documents',
    actionLabel: 'View outstanding documents',
    target: 'documents',
    requirements: [
      { key: 'participant_applications_ready', label: 'All required applicants have completed their details' },
      { key: 'required_documents_received', label: 'All blocking buyer documents received' },
      { key: 'document_pack_ready_for_bank', label: 'Document pack is ready for bank submission' },
    ],
  },
  {
    key: BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks,
    label: 'Submitted to Banks',
    iconKey: 'bank',
    actionLabel: 'Submit to banks',
    target: 'quotes',
    requirements: [
      { key: 'bank_selection_complete', label: 'At least one bank selected' },
      { key: 'bank_submission_sent', label: 'Application pack submitted to at least one bank' },
    ],
  },
  {
    key: BOND_APPLICATION_JOURNEY_STAGE_KEYS.quotes,
    label: 'Quotes Received',
    iconKey: 'quote',
    actionLabel: 'Review quotes',
    target: 'quotes',
    requirements: [
      { key: 'bank_response_received', label: 'At least one bank response or quote captured' },
    ],
  },
  {
    key: BOND_APPLICATION_JOURNEY_STAGE_KEYS.grant,
    label: 'Grant Accepted',
    iconKey: 'grant',
    actionLabel: 'Select preferred offer',
    target: 'quotes',
    requirements: [
      { key: 'preferred_offer_selected', label: 'Preferred bank offer selected and accepted by applicant' },
    ],
  },
  {
    key: BOND_APPLICATION_JOURNEY_STAGE_KEYS.instruction,
    label: 'Attorney Instruction',
    iconKey: 'instruction',
    actionLabel: 'Issue instruction',
    target: 'quotes',
    requirements: [
      { key: 'attorney_instruction_sent', label: 'Attorney instruction issued after grant acceptance' },
    ],
  },
  {
    key: BOND_APPLICATION_JOURNEY_STAGE_KEYS.complete,
    label: 'Complete',
    iconKey: 'check',
    actionLabel: 'View completed file',
    target: 'quotes',
    requirements: [
      { key: 'bond_process_completed', label: 'Bond process registered or marked complete' },
    ],
  },
])

export const BOND_APPLICATION_PRE_APPROVAL_JOURNEY_STAGE_DEFINITIONS = Object.freeze([
  {
    key: BOND_APPLICATION_JOURNEY_STAGE_KEYS.received,
    label: 'Pre-approval Received',
    iconKey: 'check',
    actionLabel: 'Open pre-approval',
    target: 'application',
    requirements: [
      { key: 'application_exists', label: 'Pre-approval file exists' },
    ],
  },
  {
    key: BOND_APPLICATION_JOURNEY_STAGE_KEYS.documents,
    label: 'Documents Received',
    iconKey: 'documents',
    actionLabel: 'View outstanding documents',
    target: 'documents',
    requirements: [
      { key: 'participant_applications_ready', label: 'All required applicants have completed their details' },
      { key: 'required_documents_received', label: 'All blocking pre-approval documents received' },
      { key: 'document_pack_ready_for_bank', label: 'Pre-approval pack is ready for assessment' },
    ],
  },
  {
    key: BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks,
    label: 'Submitted for Pre-approval',
    iconKey: 'bank',
    actionLabel: 'Submit pre-approval',
    target: 'quotes',
    requirements: [
      { key: 'bank_selection_complete', label: 'At least one bank or assessment provider selected' },
      { key: 'bank_submission_sent', label: 'Pre-approval pack submitted for assessment' },
    ],
  },
  {
    key: BOND_APPLICATION_JOURNEY_STAGE_KEYS.quotes,
    label: 'Pre-approval Outcome',
    iconKey: 'quote',
    actionLabel: 'Capture outcome',
    target: 'quotes',
    requirements: [
      { key: 'bank_response_received', label: 'Pre-approval outcome captured' },
    ],
  },
  {
    key: BOND_APPLICATION_JOURNEY_STAGE_KEYS.complete,
    label: 'Complete',
    iconKey: 'check',
    actionLabel: 'View completed file',
    target: 'quotes',
    requirements: [
      { key: 'bond_process_completed', label: 'Pre-approval issued, declined or marked complete' },
    ],
  },
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function present(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function firstPresent(...values) {
  return values.find((value) => present(value))
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function plural(count, singular, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`
}

function resolvePreApprovalValue(source = {}) {
  if (!source || typeof source !== 'object') return null
  return firstPresent(
    source.preApproval,
    source.pre_approval,
    source.application?.preApproval,
    source.application?.pre_approval,
    source.summary?.pre_approval,
    source.sharedSections?.pre_approval,
    source.shared_sections?.pre_approval,
  )
}

function resolveApplicationIntent({ action = {}, applicationState = null, applicationViewModel = null, normalizedApplication = null, workflowData = {} } = {}) {
  return normalizeKey(firstPresent(
    applicationState?.application?.intent,
    applicationState?.summary?.application_intent,
    applicationViewModel?.canonical?.intent,
    applicationViewModel?.application?.intent,
    applicationViewModel?.applicationIntent,
    applicationViewModel?.raw?.application_intent,
    normalizedApplication?.sharedSections?.application_intent?.intent,
    normalizedApplication?.sharedSections?.application_intent,
    normalizedApplication?.shared_sections?.application_intent?.intent,
    normalizedApplication?.shared_sections?.application_intent,
    workflowData.applicationIntent,
    workflowData.application_intent,
    workflowData.intent,
    action.applicationIntent,
    action.application_intent,
    action.intent,
  ) || BOND_APPLICATION_INTENTS.bondApplication)
}

function resolvePreApprovalStatus({ action = {}, applicationState = null, applicationViewModel = null, normalizedApplication = null, workflowData = {} } = {}) {
  const sources = [
    resolvePreApprovalValue(applicationState),
    resolvePreApprovalValue(applicationViewModel),
    resolvePreApprovalValue(normalizedApplication),
    resolvePreApprovalValue(workflowData),
    resolvePreApprovalValue(action),
  ].filter(Boolean)
  return normalizeKey(firstPresent(
    ...sources.map((source) => source?.status),
    workflowData.preApprovalStatus,
    workflowData.pre_approval_status,
    action.preApprovalStatus,
    action.pre_approval_status,
  ) || BOND_APPLICATION_PRE_APPROVAL_STATUSES.none)
}

function isPreApprovalOnlyIntent(intent) {
  return normalizeKey(intent) === BOND_APPLICATION_INTENTS.preApproval
}

function isPreApprovalSubmittedStatus(status) {
  return [
    BOND_APPLICATION_PRE_APPROVAL_STATUSES.submitted,
    BOND_APPLICATION_PRE_APPROVAL_STATUSES.approved,
    BOND_APPLICATION_PRE_APPROVAL_STATUSES.declined,
    BOND_APPLICATION_PRE_APPROVAL_STATUSES.expired,
  ].includes(normalizeKey(status))
}

function isPreApprovalOutcomeStatus(status) {
  return [
    BOND_APPLICATION_PRE_APPROVAL_STATUSES.approved,
    BOND_APPLICATION_PRE_APPROVAL_STATUSES.declined,
    BOND_APPLICATION_PRE_APPROVAL_STATUSES.expired,
  ].includes(normalizeKey(status))
}

function isSubmittedBankRow(row = {}) {
  const status = normalizeKey(row.status || row.submissionStatus || row.submission_status)
  return Boolean(
    row.submittedAt ||
    row.submitted_at ||
    row.lastSubmittedAt ||
    row.last_submitted_at ||
    ['submitted', 'awaiting_response', 'quote_received', 'approved', 'accepted', 'declined', 'additional_documents_required', 'under_review'].includes(status),
  )
}

function getQuoteBankName(quote = {}) {
  return normalizeText(quote.bankName || quote.bank_name || quote.bank || quote.lenderName || quote.lender_name)
}

function isInstructionSent(action = {}, workflowData = {}) {
  const stage = normalizeKey(action.stage || action.currentStage || action.current_stage || workflowData.current_stage)
  const instruction = workflowData.instruction || {}
  return Boolean(
    ['instruction_sent', 'registered', 'complete', 'completed'].includes(stage) ||
    action.instructionSentAt ||
    action.instruction_sent_at ||
    workflowData.instructionSentAt ||
    workflowData.instruction_sent_at ||
    instruction.instructionSentAt ||
    instruction.instruction_sent_at,
  )
}

function isComplete(action = {}, workflowData = {}) {
  const stage = normalizeKey(action.stage || action.currentStage || action.current_stage || workflowData.current_stage)
  return Boolean(
    ['registered', 'complete', 'completed'].includes(stage) ||
    action.registeredAt ||
    action.registered_at ||
    action.completedAt ||
    action.completed_at ||
    workflowData.registeredAt ||
    workflowData.registered_at ||
    workflowData.completedAt ||
    workflowData.completed_at,
  )
}

function resolveDocumentReadiness({ documentHealthSummary = {}, documentProgress = null, missingDocuments = [] } = {}) {
  const missingCount = Number(
    documentHealthSummary.missingCount ??
    documentHealthSummary.missing_count ??
    documentProgress?.blockingMissing?.length ??
    missingDocuments.length ??
    0,
  ) || 0
  const totalRequired = Number(
    documentHealthSummary.totalRequired ??
    documentHealthSummary.total_required ??
    documentProgress?.totalRequired ??
    0,
  ) || 0
  const completedRequired = Number(
    documentHealthSummary.completedRequired ??
    documentHealthSummary.completed_required ??
    documentProgress?.completedRequired ??
    0,
  ) || 0
  const submissionReady = documentHealthSummary.submissionReady === true ||
    documentHealthSummary.submission_ready === true ||
    documentHealthSummary.canContinue === true ||
    documentProgress?.canContinue === true ||
    (totalRequired > 0 && missingCount === 0 && completedRequired >= totalRequired)

  return { missingCount, totalRequired, completedRequired, submissionReady }
}

function isParticipantReady(participant = {}) {
  const status = normalizeKey(participant.status)
  return Boolean(
    participant.ready === true ||
    participant.complete === true ||
    participant.required === false ||
    participant.readyAt ||
    participant.ready_at ||
    ['ready_for_submission', 'awaiting_signature', 'signed', 'completed'].includes(status),
  )
}

function resolveParticipantReadiness({ participantReadiness = [], normalizedApplication = null } = {}) {
  const source = asArray(participantReadiness).length
    ? asArray(participantReadiness)
    : asArray(normalizedApplication?.participants)
      .filter((participant) => !['removed', 'withdrawn', 'declined'].includes(normalizeKey(participant.status)) && !participant.removedAt && !participant.withdrawnAt && !participant.declinedAt)
      .map((participant) => ({
        participantKey: participant.participantKey,
        role: participant.role,
        required: true,
        status: participant.status,
        readyAt: participant.readyAt,
      }))
  const required = source.filter((participant) => participant?.required !== false)
  const outstanding = required.filter((participant) => !isParticipantReady(participant))
  return {
    enabled: required.length > 0,
    totalRequired: required.length,
    readyCount: required.length - outstanding.length,
    outstanding,
    allReady: required.length === 0 || outstanding.length === 0,
  }
}

function buildRequirement(key, complete, detail = '') {
  return {
    key,
    complete: Boolean(complete),
    status: complete ? 'complete' : 'outstanding',
    detail,
  }
}

function mergeRequirementDefinitions(definition = {}, statuses = {}) {
  return definition.requirements.map((requirement) => ({
    ...requirement,
    ...(statuses[requirement.key] || buildRequirement(requirement.key, false)),
  }))
}

export function buildBondApplicationJourneyModel({
  action = {},
  applicationState = null,
  applicationViewModel = null,
  documentHealthSummary = {},
  documentProgress = null,
  missingDocuments = [],
  submissionRows = [],
  quoteRows = [],
  acceptedQuote = null,
  selectedBankIds = null,
  participantReadiness = [],
  normalizedApplication = null,
  workflowData = {},
} = {}) {
  const applicationIntent = resolveApplicationIntent({
    action,
    applicationState,
    applicationViewModel,
    normalizedApplication,
    workflowData,
  })
  const preApprovalStatus = resolvePreApprovalStatus({
    action,
    applicationState,
    applicationViewModel,
    normalizedApplication,
    workflowData,
  })
  const preApprovalOnly = isPreApprovalOnlyIntent(applicationIntent)
  const documentReadiness = resolveDocumentReadiness({ documentHealthSummary, documentProgress, missingDocuments })
  const rawParticipants = resolveParticipantReadiness({ participantReadiness, normalizedApplication })
  const applicationDetailsMissing = !rawParticipants.enabled && documentReadiness.totalRequired === 0 && !documentReadiness.submissionReady
  const participants = {
    ...rawParticipants,
    allReady: applicationDetailsMissing ? false : rawParticipants.allReady,
    applicationDetailsMissing,
  }
  const submittedBanks = asArray(submissionRows).filter(isSubmittedBankRow).length
  const selectedBankList = asArray(selectedBankIds).length
    ? asArray(selectedBankIds)
    : asArray(applicationState?.application?.selectedBankIds).length
      ? asArray(applicationState.application.selectedBankIds)
      : asArray(applicationViewModel?.canonical?.selectedBankIds).length
        ? asArray(applicationViewModel.canonical.selectedBankIds)
        : asArray(applicationViewModel?.application?.selectedBankIds)
  const selectedBanks = Math.max(asArray(submissionRows).length, selectedBankList.length)
  const quotes = asArray(quoteRows).filter((quote) => present(getQuoteBankName(quote)) || present(quote.id))
  const quoteCount = quotes.length
  const preApprovalSubmitted = preApprovalOnly && (submittedBanks > 0 || isPreApprovalSubmittedStatus(preApprovalStatus))
  const preApprovalOutcomeCaptured = preApprovalOnly && (quoteCount > 0 || isPreApprovalOutcomeStatus(preApprovalStatus))
  const acceptedBank = acceptedQuote ? getQuoteBankName(acceptedQuote) : ''
  const instructionSent = isInstructionSent(action, workflowData)
  const completed = isComplete(action, workflowData)
  const workflowCompleted = completed || (preApprovalOnly && preApprovalOutcomeCaptured)
  const applicationReceived = Boolean(applicationState || applicationViewModel || action.applicationId || action.id || action.key)
  const receivedDate = normalizeText(
    applicationViewModel?.application?.createdAtDisplay ||
    applicationViewModel?.application?.receivedAtDisplay ||
    action.receivedAtDisplay ||
    action.received_at_display,
  )

  const requirementStatusByStage = {
    received: {
      application_exists: buildRequirement('application_exists', applicationReceived || true, applicationReceived ? 'Application loaded.' : 'Application shell created.'),
    },
    documents: {
      participant_applications_ready: buildRequirement(
        'participant_applications_ready',
        participants.allReady,
        participants.enabled
          ? participants.allReady
            ? `${participants.readyCount} of ${participants.totalRequired} participant applications ready.`
            : `${participants.outstanding.length} participant${participants.outstanding.length === 1 ? '' : 's'} still need to complete their application details.`
          : 'Buyer application details have not been completed yet.',
      ),
      required_documents_received: buildRequirement(
        'required_documents_received',
        participants.allReady && documentReadiness.submissionReady,
        participants.allReady && documentReadiness.submissionReady
          ? `${documentReadiness.completedRequired || documentReadiness.totalRequired} required documents received.`
          : participants.allReady
            ? `${documentReadiness.missingCount || 'Some'} required document${documentReadiness.missingCount === 1 ? '' : 's'} outstanding.`
            : 'Participant applications must be ready before the full document pack can be treated as received.',
      ),
      document_pack_ready_for_bank: buildRequirement(
        'document_pack_ready_for_bank',
        participants.allReady && documentReadiness.submissionReady,
        participants.allReady && documentReadiness.submissionReady ? 'Ready to submit to banks.' : 'Complete participant readiness and document checklist before bank submission.',
      ),
    },
    banks: {
      bank_selection_complete: buildRequirement(
        'bank_selection_complete',
        preApprovalOnly ? selectedBanks > 0 || isPreApprovalSubmittedStatus(preApprovalStatus) : selectedBanks > 0,
        preApprovalOnly
          ? selectedBanks > 0
            ? `${plural(selectedBanks, 'assessment provider')} selected.`
            : isPreApprovalSubmittedStatus(preApprovalStatus)
              ? 'Pre-approval has already been submitted.'
              : 'Select a bank or assessment provider for the pre-approval request.'
          : selectedBanks > 0
            ? `${plural(selectedBanks, 'bank')} selected.`
            : 'Select at least one bank.',
      ),
      bank_submission_sent: buildRequirement(
        'bank_submission_sent',
        preApprovalOnly ? preApprovalSubmitted : submittedBanks > 0,
        preApprovalOnly
          ? preApprovalSubmitted
            ? 'Pre-approval pack submitted for assessment.'
            : 'Submit the completed pre-approval pack for assessment.'
          : submittedBanks > 0
            ? `${plural(submittedBanks, 'bank submission')} sent.`
            : 'Submit the completed pack to selected banks.',
      ),
    },
    quotes: {
      bank_response_received: buildRequirement(
        'bank_response_received',
        preApprovalOnly ? preApprovalOutcomeCaptured : quoteCount > 0,
        preApprovalOnly
          ? preApprovalOutcomeCaptured
            ? `Pre-approval ${preApprovalStatus || 'outcome'} captured.`
            : 'Awaiting pre-approval assessment outcome.'
          : quoteCount > 0
            ? `${plural(quoteCount, 'quote')} captured.`
            : 'Awaiting bank responses.',
      ),
    },
    grant: {
      preferred_offer_selected: buildRequirement(
        'preferred_offer_selected',
        Boolean(acceptedQuote),
        acceptedQuote ? `${acceptedBank || 'Preferred offer'} accepted.` : 'Compare quotes and record the applicant decision.',
      ),
    },
    instruction: {
      attorney_instruction_sent: buildRequirement(
        'attorney_instruction_sent',
        instructionSent,
        instructionSent ? 'Attorney instruction has been issued.' : 'Prepare and issue the attorney instruction.',
      ),
    },
    complete: {
      bond_process_completed: buildRequirement(
        'bond_process_completed',
        workflowCompleted,
        preApprovalOnly
          ? workflowCompleted
            ? 'Pre-approval workflow complete.'
            : 'Capture the pre-approval outcome to complete this request.'
          : completed
            ? 'Bond process complete.'
            : 'Monitor attorney handoff through registration/completion.',
      ),
    },
  }

  const stageDefinitions = preApprovalOnly
    ? BOND_APPLICATION_PRE_APPROVAL_JOURNEY_STAGE_DEFINITIONS
    : BOND_APPLICATION_JOURNEY_STAGE_DEFINITIONS

  const stages = stageDefinitions.map((definition) => {
    const requirements = mergeRequirementDefinitions(definition, requirementStatusByStage[definition.key])
    const done = requirements.every((requirement) => requirement.complete)
    return {
      ...definition,
      date: definition.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.received ? receivedDate : '',
      done,
      requirements,
    }
  })
  const firstOpenIndex = stages.findIndex((stage) => !stage.done)
  const decoratedStages = stages.map((stage, index) => ({
    ...stage,
    state: stage.done ? 'completed' : index === firstOpenIndex ? 'current' : 'pending',
    statusLabel: stage.done ? (stage.date || 'Completed') : index === firstOpenIndex ? 'In progress' : 'Pending',
    canAdvance: index === firstOpenIndex && stage.requirements.every((requirement) => requirement.complete),
  }))

  const currentStage = decoratedStages.find((stage) => stage.state === 'current') || decoratedStages.at(-1)
  const nextActions = buildBondApplicationJourneyActions({
    currentStage,
    applicationIntent,
    preApprovalOnly,
    preApprovalStatus,
    preApprovalSubmitted,
    preApprovalOutcomeCaptured,
    documentReadiness,
    participants,
    missingDocuments,
    submittedBanks,
    selectedBanks,
    quoteCount,
    acceptedQuote,
    acceptedBank,
    instructionSent,
    completed: workflowCompleted,
  })

  return {
    version: BOND_APPLICATION_JOURNEY_VERSION,
    stages: Object.freeze(decoratedStages),
    currentStage: Object.freeze(buildCurrentStageSummary({ currentStage, nextActions, applicationIntent, preApprovalOnly, preApprovalStatus, preApprovalSubmitted, preApprovalOutcomeCaptured, documentReadiness, participantReadiness: participants, missingDocuments, submittedBanks, selectedBanks, quoteCount, acceptedQuote, acceptedBank, instructionSent, completed: workflowCompleted })),
    nextActions: Object.freeze(nextActions),
    facts: Object.freeze({
      applicationIntent,
      preApprovalStatus,
      preApprovalOnly,
      preApprovalSubmitted,
      preApprovalOutcomeCaptured,
      documentReadiness,
      participantReadiness: participants,
      submittedBanks,
      selectedBanks,
      quoteCount,
      acceptedBank,
      instructionSent,
      completed: workflowCompleted,
    }),
  }
}

function buildBondApplicationJourneyActions({
  currentStage = {},
  preApprovalOnly = false,
  documentReadiness = {},
  participants = {},
  missingDocuments = [],
  submittedBanks = 0,
  selectedBanks = 0,
  quoteCount = 0,
  acceptedQuote = null,
  acceptedBank = '',
  instructionSent = false,
  completed = false,
} = {}) {
  if (completed) {
    return [{
      key: 'view_completed_file',
      label: 'View completed file',
      helper: 'The bond workflow is complete.',
      target: 'quotes',
      priority: 'normal',
    }]
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.documents) {
    if (participants.allReady === false) {
      const helper = participants.enabled
        ? `${participants.outstanding?.length || 'Some'} participant${(participants.outstanding?.length || 0) === 1 ? '' : 's'} still need to complete their details before bank submission.`
        : 'Buyer application details still need to be completed before bank submission.'
      return [{
        key: 'complete_participant_applications',
        label: 'Complete participant applications',
        helper,
        target: 'application',
        priority: 'high',
      }]
    }
    return [{
      key: 'request_outstanding_documents',
      label: 'Request outstanding documents',
      helper: `${documentReadiness.missingCount || missingDocuments.length || 'Some'} document${(documentReadiness.missingCount || missingDocuments.length) === 1 ? '' : 's'} still required before ${preApprovalOnly ? 'pre-approval assessment' : 'bank submission'}.`,
      target: 'documents',
      priority: 'high',
    }]
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks && selectedBanks === 0) {
    return [{
      key: preApprovalOnly ? 'select_pre_approval_provider' : 'select_banks',
      label: preApprovalOnly ? 'Select provider' : 'Select banks',
      helper: preApprovalOnly
        ? 'Choose at least one bank or internal assessment provider for the pre-approval request.'
        : 'Choose at least one bank to receive the application pack.',
      target: 'quotes',
      priority: 'high',
    }]
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks) {
    return [{
      key: preApprovalOnly ? 'submit_pre_approval' : 'submit_to_banks',
      label: preApprovalOnly ? 'Submit pre-approval' : 'Submit to banks',
      helper: preApprovalOnly
        ? `${selectedBanks} selected provider${selectedBanks === 1 ? '' : 's'} waiting for the pre-approval pack.`
        : `${selectedBanks} selected bank${selectedBanks === 1 ? '' : 's'} waiting for submission.`,
      target: 'quotes',
      priority: 'high',
    }]
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.quotes) {
    return [{
      key: preApprovalOnly ? 'capture_pre_approval_outcome' : 'follow_up_bank_responses',
      label: preApprovalOnly ? 'Capture outcome' : 'Follow up bank responses',
      helper: preApprovalOnly
        ? 'Capture the approved, declined or expired pre-approval outcome.'
        : `${submittedBanks} submission${submittedBanks === 1 ? '' : 's'} sent. Capture quote outcomes as they arrive.`,
      target: 'quotes',
      priority: 'normal',
    }]
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.grant) {
    return [{
      key: 'compare_and_accept_offer',
      label: 'Compare and accept offer',
      helper: `${quoteCount} quote${quoteCount === 1 ? '' : 's'} available for applicant decision.`,
      target: 'quotes',
      priority: 'high',
    }]
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.instruction && acceptedQuote && !instructionSent) {
    return [{
      key: 'issue_attorney_instruction',
      label: 'Issue attorney instruction',
      helper: `${acceptedBank || 'The accepted grant'} is ready for attorney handoff.`,
      target: 'quotes',
      priority: 'high',
    }]
  }
  return [{
    key: 'monitor_completion',
    label: 'Monitor completion',
    helper: 'Track attorney handoff through registration/completion.',
    target: 'quotes',
    priority: 'normal',
  }]
}

function buildCurrentStageSummary({
  currentStage = {},
  nextActions = [],
  preApprovalOnly = false,
  preApprovalStatus = '',
  documentReadiness = {},
  participantReadiness = {},
  missingDocuments = [],
  submittedBanks = 0,
  selectedBanks = 0,
  quoteCount = 0,
  acceptedQuote = null,
  acceptedBank = '',
  instructionSent = false,
  completed = false,
} = {}) {
  const primaryAction = nextActions[0] || {}
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.documents) {
    if (participantReadiness.allReady === false) {
      const description = participantReadiness.enabled
        ? `${participantReadiness.outstanding?.length || 'Some'} required participant${(participantReadiness.outstanding?.length || 0) === 1 ? '' : 's'} still need to complete their application details before this file can move to ${preApprovalOnly ? 'pre-approval assessment' : 'bank submission'}.`
        : `Buyer application details still need to be completed before this file can move to ${preApprovalOnly ? 'pre-approval assessment' : 'bank submission'}.`
      return {
        key: currentStage.key,
        eyebrow: 'Current stage',
        title: participantReadiness.enabled ? 'Participants outstanding' : 'Buyer details pending',
        description,
        ctaLabel: primaryAction.label || 'Complete participant applications',
        onOpen: primaryAction.target || 'application',
        documents: [],
        iconKey: currentStage.iconKey,
        requirements: currentStage.requirements || [],
      }
    }
    return {
      key: currentStage.key,
      eyebrow: 'Current stage',
      title: 'Documents outstanding',
      description: `${documentReadiness.missingCount || missingDocuments.length || 'Some'} document${(documentReadiness.missingCount || missingDocuments.length) === 1 ? '' : 's'} still required before this ${preApprovalOnly ? 'pre-approval request can be assessed' : 'application can be submitted to the banks'}.`,
      ctaLabel: primaryAction.label || currentStage.actionLabel,
      onOpen: primaryAction.target || currentStage.target,
      documents: missingDocuments.slice(0, 4),
      iconKey: currentStage.iconKey,
      requirements: currentStage.requirements || [],
    }
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks && selectedBanks === 0) {
    return {
      key: currentStage.key,
      eyebrow: 'Current stage',
      title: preApprovalOnly ? 'Provider not selected' : 'Banks not selected',
      description: preApprovalOnly
        ? 'The pre-approval pack is ready. Select the bank or assessment provider that should assess it.'
        : 'The application pack is ready. Select the banks that should receive this bond application.',
      ctaLabel: primaryAction.label || (preApprovalOnly ? 'Select provider' : 'Select banks'),
      onOpen: primaryAction.target || 'quotes',
      documents: [],
      iconKey: currentStage.iconKey,
      requirements: currentStage.requirements || [],
    }
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks) {
    return {
      key: currentStage.key,
      eyebrow: 'Current stage',
      title: preApprovalOnly ? 'Ready for assessment' : 'Ready to submit',
      description: preApprovalOnly
        ? `The pre-approval pack is complete. ${selectedBanks || 0} provider${selectedBanks === 1 ? '' : 's'} selected.`
        : `The application and supporting documents are complete. ${selectedBanks || 0} bank${selectedBanks === 1 ? '' : 's'} selected.`,
      ctaLabel: primaryAction.label || currentStage.actionLabel,
      onOpen: primaryAction.target || currentStage.target,
      documents: [],
      iconKey: currentStage.iconKey,
      requirements: currentStage.requirements || [],
    }
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.quotes) {
    return {
      key: currentStage.key,
      eyebrow: 'Current stage',
      title: preApprovalOnly ? 'Awaiting pre-approval outcome' : 'Awaiting bank responses',
      description: preApprovalOnly
        ? 'Track the assessment and capture the pre-approval outcome once received.'
        : `${submittedBanks} bank submission${submittedBanks === 1 ? '' : 's'} sent. Track responses and capture quote outcomes as they arrive.`,
      ctaLabel: primaryAction.label || currentStage.actionLabel,
      onOpen: primaryAction.target || currentStage.target,
      documents: [],
      iconKey: 'clock',
      requirements: currentStage.requirements || [],
    }
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.grant) {
    return {
      key: currentStage.key,
      eyebrow: 'Current stage',
      title: 'Quotes available',
      description: `${quoteCount} quote${quoteCount === 1 ? '' : 's'} received. Compare offers and record the buyer decision.`,
      ctaLabel: primaryAction.label || currentStage.actionLabel,
      onOpen: primaryAction.target || currentStage.target,
      documents: [],
      iconKey: currentStage.iconKey,
      requirements: currentStage.requirements || [],
    }
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.instruction && acceptedQuote && !instructionSent) {
    return {
      key: currentStage.key,
      eyebrow: 'Current stage',
      title: 'Attorney instruction pending',
      description: `${acceptedBank || 'The selected bank'} has an accepted grant. Prepare and send the attorney instruction.`,
      ctaLabel: primaryAction.label || currentStage.actionLabel,
      onOpen: primaryAction.target || currentStage.target,
      documents: [],
      iconKey: 'send',
      requirements: currentStage.requirements || [],
    }
  }
  return {
    key: currentStage.key || BOND_APPLICATION_JOURNEY_STAGE_KEYS.complete,
    eyebrow: 'Current stage',
    title: completed ? 'Complete' : preApprovalOnly ? 'Pre-approval outcome captured' : 'Grant accepted',
    description: completed
      ? preApprovalOnly
        ? `This pre-approval request is ${preApprovalStatus || 'complete'}.`
        : 'This bond application has been completed.'
      : preApprovalOnly
        ? `The pre-approval outcome is ${preApprovalStatus || 'captured'}.`
        : `${acceptedBank || 'The selected grant'} has been accepted and the handoff can be monitored through completion.`,
    ctaLabel: primaryAction.label || currentStage.actionLabel || 'View quotes and grant',
    onOpen: primaryAction.target || currentStage.target || 'quotes',
    documents: [],
    iconKey: completed ? 'check' : 'check',
    requirements: currentStage.requirements || [],
  }
}
