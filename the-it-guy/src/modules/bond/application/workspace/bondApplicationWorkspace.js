import { buildBondApplicationIdentity } from '../identity/index.js'

export const AGENT_BOND_APPLICATION_WORKSPACE_VERSION = 'agent-bond-application-workspace-v1'
export const AGENT_BOND_APPLICATION_WORKSPACE_FALLBACK_VERSION = 'agent-bond-application-workspace-fallback-v1'

function array(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function value(source = {}, camelKey, snakeKey = camelKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null
}

function latestDate(...values) {
  const dates = values
    .flat(Infinity)
    .filter(Boolean)
    .map((entry) => new Date(entry))
    .filter((entry) => !Number.isNaN(entry.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())
  return dates[0]?.toISOString() || null
}

function pickApplication(application = null) {
  if (!application) return null
  const participants = array(application.participants).map((participant) => ({
    id: participant.id || null,
    participantKey: value(participant, 'participantKey', 'participant_key'),
    role: participant.role || null,
    ordinal: participant.ordinal ?? null,
    status: participant.status || null,
    invitationStatus: value(participant, 'invitationStatus', 'invitation_status'),
    readyAt: value(participant, 'readyAt', 'ready_at'),
    awaitingSignatureAt: value(participant, 'awaitingSignatureAt', 'awaiting_signature_at'),
    signedAt: value(participant, 'signedAt', 'signed_at'),
    completedAt: value(participant, 'completedAt', 'completed_at'),
    updatedAt: value(participant, 'updatedAt', 'updated_at'),
  }))
  const documentRequirements = array(application.documentRequirements || application.document_requirements).map((requirement) => ({
    id: requirement.id || null,
    participantId: value(requirement, 'participantId', 'participant_id'),
    requirementKey: value(requirement, 'requirementKey', 'requirement_key'),
    canonicalDocumentType: value(requirement, 'canonicalDocumentType', 'canonical_document_type'),
    requiredBefore: value(requirement, 'requiredBefore', 'required_before'),
    satisfactionMode: value(requirement, 'satisfactionMode', 'satisfaction_mode'),
    status: requirement.status || null,
    source: requirement.source || null,
    transactionRequiredDocumentId: value(requirement, 'transactionRequiredDocumentId', 'transaction_required_document_id'),
  }))
  const readyParticipants = participants.filter((participant) =>
    ['ready_for_submission', 'awaiting_signature', 'signed', 'completed'].includes(String(participant.status || '').toLowerCase()),
  ).length
  const activeRequirements = documentRequirements.filter((requirement) => requirement.status !== 'inactive')
  const satisfiedRequirements = activeRequirements.filter((requirement) =>
    ['satisfied', 'waived'].includes(String(requirement.status || '').toLowerCase()),
  ).length

  return {
    id: application.id || null,
    transactionId: value(application, 'transactionId', 'transaction_id'),
    status: application.status || null,
    revision: application.revision ?? null,
    schemaVersion: value(application, 'schemaVersion', 'schema_version'),
    flowVersion: value(application, 'flowVersion', 'flow_version'),
    storageMode: value(application, 'storageMode', 'storage_mode'),
    activeSubmissionId: value(application, 'activeSubmissionId', 'active_submission_id'),
    lockedAt: value(application, 'lockedAt', 'locked_at'),
    submittedAt: value(application, 'submittedAt', 'submitted_at'),
    createdAt: value(application, 'createdAt', 'created_at'),
    updatedAt: value(application, 'updatedAt', 'updated_at'),
    participants,
    documentRequirements,
    participantSummary: application.participantSummary || {
      total: participants.length,
      ready: readyParticipants,
      outstanding: Math.max(0, participants.length - readyParticipants),
    },
    documentRequirementSummary: application.documentRequirementSummary || {
      total: activeRequirements.length,
      satisfied: satisfiedRequirements,
      outstanding: activeRequirements.filter((requirement) => requirement.status === 'active').length,
    },
  }
}

function pickFinance(finance = null) {
  const workflow = finance?.workflow || null
  return {
    workflow: workflow ? {
      id: workflow.id || null,
      transactionId: value(workflow, 'transactionId', 'transaction_id'),
      workflowType: value(workflow, 'workflowType', 'workflow_type'),
      currentStage: value(workflow, 'currentStage', 'current_stage'),
      status: workflow.status || null,
      lastUpdatedAt: value(workflow, 'lastUpdatedAt', 'last_updated_at'),
      completedAt: value(workflow, 'completedAt', 'completed_at'),
      createdAt: value(workflow, 'createdAt', 'created_at'),
      updatedAt: value(workflow, 'updatedAt', 'updated_at'),
    } : null,
    applications: array(finance?.applications).map((row) => ({
      id: row.id || null,
      transactionId: value(row, 'transactionId', 'transaction_id'),
      workflowId: value(row, 'workflowId', 'workflow_id'),
      applicationType: value(row, 'applicationType', 'application_type'),
      bankName: value(row, 'bankName', 'bank_name'),
      status: row.status || null,
      submittedAt: value(row, 'submittedAt', 'submitted_at'),
      feedbackReceivedAt: value(row, 'feedbackReceivedAt', 'feedback_received_at'),
      referenceNumber: value(row, 'referenceNumber', 'reference_number'),
      applicationReference: value(row, 'applicationReference', 'application_reference'),
      createdAt: value(row, 'createdAt', 'created_at'),
      updatedAt: value(row, 'updatedAt', 'updated_at'),
    })),
    quotes: array(finance?.quotes || finance?.offers).map((row) => ({
      id: row.id || null,
      transactionId: value(row, 'transactionId', 'transaction_id'),
      workflowId: value(row, 'workflowId', 'workflow_id'),
      bondApplicationId: value(row, 'bondApplicationId', 'bond_application_id'),
      bankName: value(row, 'bankName', 'bank_name'),
      quotedAmount: value(row, 'quotedAmount', 'quoted_amount'),
      interestRate: value(row, 'interestRate', 'interest_rate'),
      interestRateDisplay: value(row, 'interestRateDisplay', 'interest_rate_display'),
      monthlyRepayment: value(row, 'monthlyRepayment', 'monthly_repayment'),
      termMonths: value(row, 'termMonths', 'term_months'),
      quoteStatus: value(row, 'quoteStatus', 'quote_status'),
      quoteReceivedAt: value(row, 'quoteReceivedAt', 'quote_received_at'),
      validUntil: value(row, 'validUntil', 'valid_until'),
      quoteDocumentId: value(row, 'quoteDocumentId', 'quote_document_id'),
      createdAt: value(row, 'createdAt', 'created_at'),
      updatedAt: value(row, 'updatedAt', 'updated_at'),
    })),
    decisions: array(finance?.decisions).map((row) => ({
      id: row.id || null,
      bondOfferId: value(row, 'bondOfferId', 'bond_offer_id'),
      decision: row.decision || null,
      decidedByRole: value(row, 'decidedByRole', 'decided_by_role'),
      decisionAt: value(row, 'decisionAt', 'decision_at'),
      createdAt: value(row, 'createdAt', 'created_at'),
      updatedAt: value(row, 'updatedAt', 'updated_at'),
    })),
    instruction: finance?.instruction ? {
      id: finance.instruction.id || null,
      transactionId: value(finance.instruction, 'transactionId', 'transaction_id'),
      acceptedBondOfferId: value(finance.instruction, 'acceptedBondOfferId', 'accepted_bond_offer_id'),
      grantReceived: value(finance.instruction, 'grantReceived', 'grant_received') === true,
      grantReceivedAt: value(finance.instruction, 'grantReceivedAt', 'grant_received_at'),
      grantSigned: value(finance.instruction, 'grantSigned', 'grant_signed') === true,
      grantSignedAt: value(finance.instruction, 'grantSignedAt', 'grant_signed_at'),
      grantSubmitted: value(finance.instruction, 'grantSubmitted', 'grant_submitted') === true,
      grantSubmittedAt: value(finance.instruction, 'grantSubmittedAt', 'grant_submitted_at'),
      instructionSent: value(finance.instruction, 'instructionSent', 'instruction_sent') === true,
      instructionSentAt: value(finance.instruction, 'instructionSentAt', 'instruction_sent_at'),
    } : null,
    bankOutcomes: array(finance?.bankOutcomes || finance?.bank_outcomes).map((row) => ({
      id: row.id || null,
      transactionId: value(row, 'transactionId', 'transaction_id'),
      workflowId: value(row, 'workflowId', 'workflow_id'),
      bondApplicationId: value(row, 'bondApplicationId', 'bond_application_id'),
      bankName: value(row, 'bankName', 'bank_name'),
      outcome: row.outcome || null,
      outcomeAt: value(row, 'outcomeAt', 'outcome_at'),
      approvedAmount: value(row, 'approvedAmount', 'approved_amount'),
      conditions: row.conditions || null,
      declineReason: value(row, 'declineReason', 'decline_reason'),
      createdAt: value(row, 'createdAt', 'created_at'),
    })),
  }
}

function pickOriginator(progress = null) {
  if (!progress) {
    return { package: null, progressEvents: [], documentRequests: [], offerCaptures: [], grantCaptures: [] }
  }
  if ('package' in progress) {
    return {
      ...progress,
      progressEvents: array(progress.progressEvents || progress.progress_events),
      documentRequests: array(progress.documentRequests || progress.document_requests),
      offerCaptures: array(progress.offerCaptures || progress.offer_captures),
      grantCaptures: array(progress.grantCaptures || progress.grant_captures),
    }
  }
  return {
    package: {
      id: progress.id || null,
      transactionId: value(progress, 'transactionId', 'transaction_id'),
      canonicalBondApplicationId: value(progress, 'bondApplicationId', 'bond_application_id'),
      activeSubmissionId: value(progress, 'submissionId', 'submission_id'),
      transactionBondApplicationId: value(progress, 'transactionBondApplicationId', 'transaction_bond_application_id'),
      destinationKey: value(progress, 'destinationKey', 'destination_key'),
      destinationType: value(progress, 'destinationType', 'destination_type'),
      status: progress.status || null,
      originatorRecipientName: value(progress, 'originatorRecipientName', 'originator_recipient_name'),
      packageReadyAt: value(progress, 'packageReadyAt', 'package_ready_at'),
      acceptedAt: value(progress, 'acceptedAt', 'accepted_at'),
      lastDownloadedAt: value(progress, 'lastDownloadedAt', 'last_downloaded_at'),
      createdAt: value(progress, 'createdAt', 'created_at'),
      updatedAt: value(progress, 'updatedAt', 'updated_at'),
      downloadCount: value(progress, 'downloadCount', 'download_count') || 0,
    },
    progressEvents: array(progress.progressEvents || progress.progress_events),
    documentRequests: array(progress.documentRequests || progress.document_requests),
    offerCaptures: array(progress.offerCaptures || progress.offer_captures),
    grantCaptures: array(progress.grantCaptures || progress.grant_captures),
    documentRequestSummary: progress.documentRequestSummary || progress.document_request_summary || {},
    offerGrantSummary: progress.offerGrantSummary || progress.offer_grant_summary || {},
  }
}

function buildPackageApplicationReference(originator = {}, transaction = null) {
  const packageRecord = originator?.package
  const canonicalApplicationId = value(packageRecord, 'canonicalBondApplicationId', 'bond_application_id')
  if (!packageRecord || !canonicalApplicationId) return null
  return {
    id: canonicalApplicationId,
    transactionId: value(packageRecord, 'transactionId', 'transaction_id') || value(transaction, 'transactionId', 'id'),
    status: packageRecord.status || null,
    activeSubmissionId: value(packageRecord, 'activeSubmissionId', 'submission_id'),
    submittedAt: value(packageRecord, 'packageReadyAt', 'package_ready_at'),
    createdAt: value(packageRecord, 'createdAt', 'created_at') || value(packageRecord, 'packageReadyAt', 'package_ready_at'),
    updatedAt: value(packageRecord, 'updatedAt', 'updated_at') || value(packageRecord, 'acceptedAt', 'accepted_at'),
    participants: [],
    documentRequirements: [],
    participantSummary: { total: 0, ready: 0, outstanding: 0 },
    documentRequirementSummary: { total: 0, satisfied: 0, outstanding: 0 },
  }
}

export function buildAgentBondApplicationWorkspace({
  workspaceView = null,
  transaction = null,
  bondApplication = null,
  originatorProgress = null,
  financeWorkflow = null,
  serverIdentity = null,
} = {}) {
  const originator = pickOriginator(workspaceView?.originator || originatorProgress)
  const persistedApplication = pickApplication(workspaceView?.application || bondApplication)
  const application = persistedApplication || buildPackageApplicationReference(originator, transaction)
  const finance = pickFinance(workspaceView?.finance || financeWorkflow)
  const identity = buildBondApplicationIdentity({
    transaction,
    bondApplication: application,
    originatorProgress: originator.package,
    financeWorkflow: finance,
    serverIdentity: workspaceView?.identity || serverIdentity,
  })
  const serverVersion = workspaceView?.version
  const lastUpdatedAt = workspaceView?.lastUpdatedAt || latestDate(
    application?.updatedAt,
    application?.submittedAt,
    originator.package?.updatedAt,
    originator.package?.packageReadyAt,
    originator.package?.acceptedAt,
    originator.package?.lastDownloadedAt,
    finance.workflow?.updatedAt,
    finance.workflow?.lastUpdatedAt,
    originator.progressEvents.map((entry) => value(entry, 'occurredAt', 'occurred_at')),
    originator.documentRequests.map((entry) => value(entry, 'updatedAt', 'updated_at')),
    originator.offerCaptures.map((entry) => value(entry, 'capturedAt', 'captured_at')),
    originator.grantCaptures.map((entry) => value(entry, 'capturedAt', 'captured_at')),
    workspaceView?.guarantees?.steps?.map((entry) => value(entry, 'updatedAt', 'updated_at')),
  )

  return Object.freeze({
    version: serverVersion || AGENT_BOND_APPLICATION_WORKSPACE_FALLBACK_VERSION,
    source: workspaceView ? 'database_rpc' : 'client_fallback',
    available: Boolean(workspaceView?.available ?? identity.available),
    valid: identity.valid,
    identity,
    application,
    applicationSource: persistedApplication ? 'canonical_application' : application ? 'originator_package_reference' : 'unavailable',
    originator,
    finance,
    guarantees: {
      steps: array(workspaceView?.guarantees?.steps),
    },
    lastUpdatedAt,
  })
}
