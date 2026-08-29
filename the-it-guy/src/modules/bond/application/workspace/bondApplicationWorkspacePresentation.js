export const AGENT_BOND_APPLICATION_JOURNEY_VERSION = 'agent-bond-application-journey-v1'
export const AGENT_BOND_APPLICATION_WORKSPACE_HEALTH_VERSION = 'agent-bond-application-workspace-health-v1'

const COMPLETED_STATUSES = new Set(['complete', 'completed', 'done', 'accepted', 'approved'])

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function value(source = {}, camelKey, snakeKey = camelKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null
}

function firstDate(...values) {
  return values.flat(Infinity).find(Boolean) || null
}

function isCompleteStatus(status) {
  return COMPLETED_STATUSES.has(String(status || '').trim().toLowerCase())
}

function hasAcceptedDecision(decisions = [], offers = []) {
  return decisions.some((decision) => ['accepted', 'approved', 'approved_by_buyer'].includes(String(decision?.decision || '').toLowerCase())) ||
    offers.some((offer) => ['accepted', 'accepted_by_buyer', 'approved', 'approved_by_buyer'].includes(String(
      offer?.buyerDecision || offer?.buyer_decision || offer?.status || offer?.quoteStatus || offer?.quote_status || '',
    ).toLowerCase()))
}

function buildSignals(workspace = {}) {
  const application = workspace.application || null
  const originator = workspace.originator || {}
  const finance = workspace.finance || {}
  const packageRecord = originator.package || null
  const applications = list(finance.applications)
  const offers = [...list(finance.quotes || finance.offers), ...list(originator.offerCaptures || originator.offer_captures)]
  const decisions = list(finance.decisions)
  const grants = list(originator.grantCaptures || originator.grant_captures)
  const documentRequests = list(originator.documentRequests || originator.document_requests)
  const guaranteeSteps = list(workspace.guarantees?.steps)
  const instruction = finance.instruction || null
  const applicationDocumentSummary = application?.documentRequirementSummary || application?.document_requirement_summary || {}
  const participantSummary = application?.participantSummary || application?.participant_summary || {}
  const originatorDocumentSummary = originator.documentRequestSummary || originator.document_request_summary || {}
  const openOriginatorDocuments = number(value(originatorDocumentSummary, 'open'))
  const outstandingApplicationDocuments = number(value(applicationDocumentSummary, 'outstanding'))
  const outstandingParticipants = number(value(participantSummary, 'outstanding'))
  const hasDocumentEvidence = number(value(applicationDocumentSummary, 'total')) > 0 || documentRequests.length > 0
  const documentsReceived = Boolean(
    packageRecord?.packageReadyAt ||
    packageRecord?.package_ready_at ||
    packageRecord?.acceptedAt ||
    packageRecord?.accepted_at ||
    (application && hasDocumentEvidence && !openOriginatorDocuments && !outstandingApplicationDocuments && !outstandingParticipants),
  )
  const submittedToBanks = applications.length > 0 || applications.some((row) => value(row, 'submittedAt', 'submitted_at'))
  const quotesReceived = offers.length > 0
  const grantAccepted = grants.length > 0 || hasAcceptedDecision(decisions, offers) || Boolean(
    instruction?.grantReceived || instruction?.grant_received || instruction?.grantSigned || instruction?.grant_signed,
  )
  const attorneyInstruction = Boolean(instruction?.instructionSent || instruction?.instruction_sent)
  const completedGuarantees = guaranteeSteps.filter((step) => isCompleteStatus(step.status) || value(step, 'completedAt', 'completed_at')).length
  const guaranteesComplete = guaranteeSteps.length > 0 && completedGuarantees === guaranteeSteps.length
  const workflowComplete = isCompleteStatus(finance.workflow?.status) || Boolean(value(finance.workflow, 'completedAt', 'completed_at'))

  return {
    application,
    originator,
    finance,
    packageRecord,
    applications,
    offers,
    grants,
    documentRequests,
    guaranteeSteps,
    instruction,
    applicationReceived: Boolean(application),
    documentsReceived,
    submittedToBanks,
    quotesReceived,
    grantAccepted,
    attorneyInstruction,
    guaranteesComplete,
    complete: workflowComplete || (attorneyInstruction && guaranteesComplete),
    openOriginatorDocuments,
    outstandingApplicationDocuments,
    outstandingParticipants,
    completedGuarantees,
  }
}

function buildJourney(signals) {
  const reached = [
    signals.applicationReceived,
    signals.documentsReceived,
    signals.submittedToBanks,
    signals.quotesReceived,
    signals.grantAccepted,
    signals.attorneyInstruction,
    signals.complete,
  ]
  let currentIndex = signals.complete ? 6 : Math.max(0, reached.findLastIndex(Boolean))
  if (!signals.applicationReceived) currentIndex = 0

  const definitions = [
    {
      key: 'application_received',
      label: 'Application Received',
      date: firstDate(signals.application?.submittedAt, signals.application?.submitted_at, signals.application?.createdAt, signals.application?.created_at),
    },
    {
      key: 'documents_received',
      label: 'Documents Received',
      date: firstDate(signals.packageRecord?.packageReadyAt, signals.packageRecord?.package_ready_at),
    },
    {
      key: 'submitted_to_banks',
      label: 'Submitted to Banks',
      date: firstDate(signals.applications.map((row) => value(row, 'submittedAt', 'submitted_at'))),
    },
    {
      key: 'quotes_received',
      label: 'Quotes Received',
      date: firstDate(signals.offers.map((row) => value(row, 'quoteReceivedAt', 'quote_received_at') || value(row, 'publishedAt', 'published_at') || value(row, 'capturedAt', 'captured_at'))),
    },
    {
      key: 'grant_accepted',
      label: 'Grant Accepted',
      date: firstDate(signals.grants.map((row) => value(row, 'publishedAt', 'published_at') || value(row, 'capturedAt', 'captured_at')), value(signals.instruction, 'grantReceivedAt', 'grant_received_at')),
    },
    {
      key: 'attorney_instruction',
      label: 'Attorney Instruction',
      date: value(signals.instruction, 'instructionSentAt', 'instruction_sent_at'),
    },
    {
      key: 'complete',
      label: 'Complete',
      date: value(signals.finance.workflow, 'completedAt', 'completed_at'),
    },
  ]

  return definitions.map((stage, index) => ({
    ...stage,
    state: signals.complete && index === definitions.length - 1
      ? 'completed'
      : index < currentIndex
        ? 'completed'
        : index === currentIndex
          ? 'in_progress'
          : 'pending',
  }))
}

function buildWaitingSteps(signals) {
  const documentsOutstanding = signals.openOriginatorDocuments + signals.outstandingApplicationDocuments + signals.outstandingParticipants
  const definitions = [
    {
      key: 'documents',
      label: 'Waiting on documents',
      detail: documentsOutstanding
        ? `${documentsOutstanding} application item${documentsOutstanding === 1 ? '' : 's'} outstanding`
        : signals.documentsReceived ? 'Application documents received' : 'Application pack is still being prepared',
      waiting: !signals.documentsReceived || documentsOutstanding > 0,
      done: signals.documentsReceived && documentsOutstanding === 0,
      count: signals.openOriginatorDocuments,
    },
    {
      key: 'banks',
      label: 'Waiting on banks',
      detail: signals.applications.length
        ? `${signals.applications.length} bank application${signals.applications.length === 1 ? '' : 's'} tracked`
        : 'No bank submissions yet',
      waiting: signals.documentsReceived && !signals.quotesReceived,
      done: signals.quotesReceived,
    },
    {
      key: 'quotes',
      label: 'Waiting on quotes',
      detail: signals.offers.length
        ? `${signals.offers.length} quote${signals.offers.length === 1 ? '' : 's'} received`
        : 'No bank quotes received yet',
      waiting: signals.submittedToBanks && !signals.quotesReceived,
      done: signals.quotesReceived,
    },
    {
      key: 'grant',
      label: 'Waiting on grant',
      detail: signals.grantAccepted ? 'Grant milestone recorded' : 'No accepted grant recorded yet',
      waiting: signals.quotesReceived && !signals.grantAccepted,
      done: signals.grantAccepted,
    },
    {
      key: 'instruction',
      label: 'Waiting on instruction',
      detail: signals.attorneyInstruction ? 'Attorney instruction sent' : 'Attorney instruction is pending',
      waiting: signals.grantAccepted && !signals.attorneyInstruction,
      done: signals.attorneyInstruction,
    },
    {
      key: 'guarantees',
      label: 'Waiting on guarantees',
      detail: signals.guaranteeSteps.length
        ? `${signals.completedGuarantees} of ${signals.guaranteeSteps.length} guarantee milestones complete`
        : 'Guarantee milestones have not started',
      waiting: signals.attorneyInstruction && !signals.guaranteesComplete,
      done: signals.guaranteesComplete,
    },
  ]

  let activeIndex = definitions.findIndex((step) => step.waiting)
  if (activeIndex < 0) activeIndex = signals.complete ? definitions.length - 1 : 0
  const steps = definitions.map((step, index) => ({
    ...step,
    state: step.done ? 'completed' : index === activeIndex ? 'active' : 'pending',
  }))
  const active = steps[activeIndex]
  const summary = signals.complete
    ? 'The bond finance workflow is complete.'
    : active.key === 'documents'
      ? 'We are waiting for the bond application documents to be completed and accepted by the originator.'
      : active.key === 'banks'
        ? 'The application is with the selected banks. We are waiting for bank feedback.'
        : active.key === 'quotes'
          ? 'Bank applications are submitted. We are waiting for quotes or decisions.'
          : active.key === 'grant'
            ? 'Quotes have been received. We are waiting for the accepted bank grant.'
            : active.key === 'instruction'
              ? 'The grant milestone is recorded. We are waiting for attorney instruction.'
              : 'Attorney instruction is recorded. We are waiting for the guarantee milestones to complete.'

  return { steps, activeKey: signals.complete ? 'complete' : active.key, summary }
}

export function buildAgentBondApplicationJourney(workspace = {}) {
  const signals = buildSignals(workspace)
  const waiting = buildWaitingSteps(signals)
  const journey = buildJourney(signals)
  const currentJourneyStage = journey.find((stage) => stage.state === 'in_progress') || journey.at(-1)
  return Object.freeze({
    version: AGENT_BOND_APPLICATION_JOURNEY_VERSION,
    available: workspace.available === true && workspace.valid !== false && signals.applicationReceived,
    journey,
    currentJourneyStage,
    statusLabel: currentJourneyStage?.state === 'completed' ? 'Complete' : currentJourneyStage?.label || 'Application pending',
    waitingSteps: waiting.steps,
    activeWaitingKey: waiting.activeKey,
    summary: waiting.summary,
  })
}

export function buildAgentBondApplicationWorkspaceHealth({ workspace = {}, liveState = {} } = {}) {
  const state = liveState || {}
  const connectionState = String(state.connectionState || 'idle').toLowerCase()
  const lastRefreshAt = state.lastRefreshAt || null
  const lastErrorAt = state.lastErrorAt || null
  const errorIsLatest = lastErrorAt && (!lastRefreshAt || new Date(lastErrorAt).getTime() > new Date(lastRefreshAt).getTime())

  if (workspace.valid === false) {
    return Object.freeze({
      version: AGENT_BOND_APPLICATION_WORKSPACE_HEALTH_VERSION,
      key: 'identity_error',
      label: 'Application link issue',
      tone: 'danger',
      summary: 'The Finance workspace is not linked to the canonical bond application. Refresh before relying on this status.',
      lastCheckedAt: lastRefreshAt,
    })
  }
  if (errorIsLatest) {
    return Object.freeze({
      version: AGENT_BOND_APPLICATION_WORKSPACE_HEALTH_VERSION,
      key: 'refresh_error',
      label: 'Refresh issue',
      tone: 'warning',
      summary: 'The latest background refresh failed. The last successfully loaded application status remains visible.',
      lastCheckedAt: lastRefreshAt,
    })
  }
  if (workspace.source === 'client_fallback') {
    return Object.freeze({
      version: AGENT_BOND_APPLICATION_WORKSPACE_HEALTH_VERSION,
      key: 'compatibility_mode',
      label: 'Compatibility mode',
      tone: 'warning',
      summary: 'The secured workspace RPC is unavailable. The same application-scoped view is being assembled from existing authorized reads.',
      lastCheckedAt: lastRefreshAt,
    })
  }
  if (connectionState === 'live') {
    return Object.freeze({
      version: AGENT_BOND_APPLICATION_WORKSPACE_HEALTH_VERSION,
      key: 'live',
      label: 'Live sync',
      tone: 'success',
      summary: 'Listening for transaction updates with polling as a fallback.',
      lastCheckedAt: lastRefreshAt,
    })
  }
  if (connectionState === 'polling') {
    return Object.freeze({
      version: AGENT_BOND_APPLICATION_WORKSPACE_HEALTH_VERSION,
      key: 'polling',
      label: 'Polling for updates',
      tone: 'warning',
      summary: 'Realtime is unavailable; the secured workspace will continue refreshing in the background.',
      lastCheckedAt: lastRefreshAt,
    })
  }
  if (connectionState === 'connecting') {
    return Object.freeze({
      version: AGENT_BOND_APPLICATION_WORKSPACE_HEALTH_VERSION,
      key: 'connecting',
      label: 'Connecting',
      tone: 'muted',
      summary: 'Connecting to transaction updates.',
      lastCheckedAt: lastRefreshAt,
    })
  }
  return Object.freeze({
    version: AGENT_BOND_APPLICATION_WORKSPACE_HEALTH_VERSION,
    key: workspace.available ? 'loaded' : 'unavailable',
    label: workspace.available ? 'Loaded' : 'Awaiting application',
    tone: 'muted',
    summary: workspace.available
      ? 'The application workspace is loaded. Updates are checked whenever this transaction reloads.'
      : 'No canonical bond application workspace is available yet.',
    lastCheckedAt: lastRefreshAt,
  })
}
