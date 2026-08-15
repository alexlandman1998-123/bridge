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

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function plural(count, singular, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`
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
  applicationViewModel = null,
  documentHealthSummary = {},
  documentProgress = null,
  missingDocuments = [],
  submissionRows = [],
  quoteRows = [],
  acceptedQuote = null,
  selectedBankIds = applicationViewModel?.application?.selectedBankIds || [],
  participantReadiness = [],
  normalizedApplication = null,
  workflowData = {},
} = {}) {
  const documentReadiness = resolveDocumentReadiness({ documentHealthSummary, documentProgress, missingDocuments })
  const participants = resolveParticipantReadiness({ participantReadiness, normalizedApplication })
  const submittedBanks = asArray(submissionRows).filter(isSubmittedBankRow).length
  const selectedBanks = Math.max(asArray(submissionRows).length, asArray(selectedBankIds).length)
  const quotes = asArray(quoteRows).filter((quote) => present(getQuoteBankName(quote)) || present(quote.id))
  const quoteCount = quotes.length
  const acceptedBank = acceptedQuote ? getQuoteBankName(acceptedQuote) : ''
  const instructionSent = isInstructionSent(action, workflowData)
  const completed = isComplete(action, workflowData)
  const applicationReceived = Boolean(applicationViewModel || action.applicationId || action.id || action.key)
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
          : 'No additional participant readiness gate is active.',
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
        selectedBanks > 0,
        selectedBanks > 0 ? `${plural(selectedBanks, 'bank')} selected.` : 'Select at least one bank.',
      ),
      bank_submission_sent: buildRequirement(
        'bank_submission_sent',
        submittedBanks > 0,
        submittedBanks > 0 ? `${plural(submittedBanks, 'bank submission')} sent.` : 'Submit the completed pack to selected banks.',
      ),
    },
    quotes: {
      bank_response_received: buildRequirement(
        'bank_response_received',
        quoteCount > 0,
        quoteCount > 0 ? `${plural(quoteCount, 'quote')} captured.` : 'Awaiting bank responses.',
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
        completed,
        completed ? 'Bond process complete.' : 'Monitor attorney handoff through registration/completion.',
      ),
    },
  }

  const stages = BOND_APPLICATION_JOURNEY_STAGE_DEFINITIONS.map((definition) => {
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
    documentReadiness,
    participants,
    missingDocuments,
    submittedBanks,
    selectedBanks,
    quoteCount,
    acceptedQuote,
    acceptedBank,
    instructionSent,
    completed,
  })

  return {
    version: BOND_APPLICATION_JOURNEY_VERSION,
    stages: Object.freeze(decoratedStages),
    currentStage: Object.freeze(buildCurrentStageSummary({ currentStage, nextActions, documentReadiness, participantReadiness: participants, missingDocuments, submittedBanks, selectedBanks, quoteCount, acceptedQuote, acceptedBank, instructionSent, completed })),
    nextActions: Object.freeze(nextActions),
    facts: Object.freeze({
      documentReadiness,
      participantReadiness: participants,
      submittedBanks,
      selectedBanks,
      quoteCount,
      acceptedBank,
      instructionSent,
      completed,
    }),
  }
}

function buildBondApplicationJourneyActions({
  currentStage = {},
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
      return [{
        key: 'complete_participant_applications',
        label: 'Complete participant applications',
        helper: `${participants.outstanding?.length || 'Some'} participant${(participants.outstanding?.length || 0) === 1 ? '' : 's'} still need to complete their details before bank submission.`,
        target: 'application',
        priority: 'high',
      }]
    }
    return [{
      key: 'request_outstanding_documents',
      label: 'Request outstanding documents',
      helper: `${documentReadiness.missingCount || missingDocuments.length || 'Some'} document${(documentReadiness.missingCount || missingDocuments.length) === 1 ? '' : 's'} still required before bank submission.`,
      target: 'documents',
      priority: 'high',
    }]
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks && selectedBanks === 0) {
    return [{
      key: 'select_banks',
      label: 'Select banks',
      helper: 'Choose at least one bank to receive the application pack.',
      target: 'quotes',
      priority: 'high',
    }]
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks) {
    return [{
      key: 'submit_to_banks',
      label: 'Submit to banks',
      helper: `${selectedBanks} selected bank${selectedBanks === 1 ? '' : 's'} waiting for submission.`,
      target: 'quotes',
      priority: 'high',
    }]
  }
  if (currentStage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.quotes) {
    return [{
      key: 'follow_up_bank_responses',
      label: 'Follow up bank responses',
      helper: `${submittedBanks} submission${submittedBanks === 1 ? '' : 's'} sent. Capture quote outcomes as they arrive.`,
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
      return {
        key: currentStage.key,
        eyebrow: 'Current stage',
        title: 'Participants outstanding',
        description: `${participantReadiness.outstanding?.length || 'Some'} required participant${(participantReadiness.outstanding?.length || 0) === 1 ? '' : 's'} still need to complete their application details before this file can move to bank submission.`,
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
      description: `${documentReadiness.missingCount || missingDocuments.length || 'Some'} document${(documentReadiness.missingCount || missingDocuments.length) === 1 ? '' : 's'} still required before this application can be submitted to the banks.`,
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
      title: 'Banks not selected',
      description: 'The application pack is ready. Select the banks that should receive this bond application.',
      ctaLabel: primaryAction.label || 'Select banks',
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
      title: 'Ready to submit',
      description: `The application and supporting documents are complete. ${selectedBanks || 0} bank${selectedBanks === 1 ? '' : 's'} selected.`,
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
      title: 'Awaiting bank responses',
      description: `${submittedBanks} bank submission${submittedBanks === 1 ? '' : 's'} sent. Track responses and capture quote outcomes as they arrive.`,
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
    title: completed ? 'Complete' : 'Grant accepted',
    description: completed
      ? 'This bond application has been completed.'
      : `${acceptedBank || 'The selected grant'} has been accepted and the handoff can be monitored through completion.`,
    ctaLabel: primaryAction.label || currentStage.actionLabel || 'View quotes and grant',
    onOpen: primaryAction.target || currentStage.target || 'quotes',
    documents: [],
    iconKey: completed ? 'check' : 'check',
    requirements: currentStage.requirements || [],
  }
}
