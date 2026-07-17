import { getAttorneyOperationalWorkspaceData } from './attorneyOperations'
import { getAttorneyIncomingMatterQueue } from './attorneyIncomingMatterQueue'
import {
  buildAttorneyWorkflowPath,
  getAttorneyMatterListWorkflowDetailKey,
} from '../core/transactions/attorneyMatterWorkflowNavigation.js'
import { buildAttorneyMatterReferenceSearchText } from './attorneyMatterNumberingService.js'
import { filterAttorneyRecordsByModules } from './attorneyModuleDataScope.js'

export const ATTORNEY_MATTER_PAGE_SIZES = [20, 50, 100]

const STAGE_STEPS = ['Instruction', 'Documents', 'Signing', 'Finance', 'Lodgement', 'Registration']
const INCOMING_STAGE_STEPS = ['Buyer', 'Onboarding', 'OTP', 'Documents', 'Acceptance']

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'delayed', label: 'Delayed' },
  { key: 'registered', label: 'Registered' },
  { key: 'archived', label: 'Archived' },
]

const INCOMING_STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'awaiting_buyer', label: 'Awaiting Buyer' },
  { key: 'awaiting_signed_otp', label: 'Awaiting Signed OTP' },
  { key: 'awaiting_documents', label: 'Awaiting Documents' },
  { key: 'ready_for_acceptance', label: 'Ready For Acceptance' },
]

const MATTER_TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'bond', label: 'Bond Registration' },
  { key: 'cancellation', label: 'Bond Cancellation' },
  { key: 'development', label: 'Development' },
]

const QUICK_FILTERS = [
  { key: 'today', label: 'Today', query: { expected_action: 'today' } },
  { key: 'this_week', label: 'This Week', query: { expected_action: 'this_week' } },
  { key: 'needs_attention', label: 'Needs Attention', query: { matter_health: 'attention' } },
  { key: 'my_matters', label: 'My Matters', query: { assignee: 'me' } },
  { key: 'unassigned', label: 'Unassigned', query: { assignee: 'unassigned' } },
  { key: 'awaiting_client', label: 'Awaiting Client', query: { client_action_required: true } },
  { key: 'delayed', label: 'Delayed', query: { status: 'delayed' } },
  { key: 'due_for_registration', label: 'Due for Registration', query: { expected_registration: 'this_week' } },
]

const INCOMING_QUICK_FILTERS = [
  { key: 'awaiting_buyer', label: 'Awaiting Buyer', query: { status: 'awaiting_buyer' } },
  { key: 'awaiting_signed_otp', label: 'Awaiting OTP', query: { status: 'awaiting_signed_otp' } },
  { key: 'awaiting_documents', label: 'Awaiting Documents', query: { status: 'awaiting_documents' } },
  { key: 'ready_for_acceptance', label: 'Ready For Acceptance', query: { status: 'ready_for_acceptance' } },
  { key: 'document_blockers', label: 'Document Blockers', query: { documents: 'blocked' } },
  { key: 'my_matters', label: 'My Matters', query: { assignee: 'me' } },
  { key: 'unassigned', label: 'Unassigned', query: { assignee: 'unassigned' } },
]

const SAVED_VIEWS = [
  { id: 'my-bond-registrations', name: 'My Bond Registrations', filters: { matterType: 'bond', quickFilter: 'my_matters' } },
  { id: 'registrations-this-week', name: 'Registrations This Week', filters: { quickFilter: 'due_for_registration' } },
  { id: 'high-priority', name: 'High Priority', filters: { quickFilter: 'needs_attention' } },
  { id: 'jhb-branch', name: 'JHB Branch', filters: { branch: 'jhb' } },
  { id: 'guarantees-outstanding', name: 'Guarantees Outstanding', filters: { nextAction: 'guarantee' } },
]

const INCOMING_SAVED_VIEWS = [
  { id: 'incoming-awaiting-buyer', name: 'Awaiting Buyer', filters: { status: 'awaiting_buyer' } },
  { id: 'incoming-awaiting-otp', name: 'Awaiting OTP', filters: { status: 'awaiting_signed_otp' } },
  { id: 'incoming-awaiting-documents', name: 'Awaiting Documents', filters: { status: 'awaiting_documents' } },
  { id: 'incoming-ready-for-acceptance', name: 'Ready For Acceptance', filters: { status: 'ready_for_acceptance' } },
  { id: 'incoming-my-matters', name: 'My Incoming Matters', filters: { quickFilter: 'my_matters' } },
  { id: 'incoming-document-blockers', name: 'Document Blockers', filters: { quickFilter: 'document_blockers' } },
]

const ATTORNEY_MATTER_VIEW_CONFIGS = {
  all: {
    key: 'all',
    title: 'All Matters',
    description: 'Every active firm matter across transfer, bond, cancellation, and development work.',
    primaryMetric: 'activeMatters',
    primaryMetricLabel: 'Active Matters',
    itemLabel: 'matters',
  },
  active: {
    key: 'active',
    title: 'Incoming Matters',
    description: 'Allocated mandates and transfer instructions received by the firm before they become active matters.',
    primaryMetric: 'incomingMatters',
    primaryMetricLabel: 'Incoming Matters',
    itemLabel: 'incoming matters',
    usesIncomingQueue: true,
  },
  transfer: {
    key: 'transfer',
    title: 'Transfer Matters',
    description: 'Transfer instructions through preparation, signing, lodgement, and registration.',
    primaryMetric: 'activeMatters',
    primaryMetricLabel: 'Active Transfer Matters',
    itemLabel: 'transfer matters',
    lockedMatterType: 'transfer',
  },
  bond: {
    key: 'bond',
    title: 'Bond Matters',
    description: 'Bond registration work, guarantees, bank conditions, and signing tasks.',
    primaryMetric: 'activeMatters',
    primaryMetricLabel: 'Active Bond Matters',
    itemLabel: 'bond matters',
    lockedMatterType: 'bond',
  },
  cancellation: {
    key: 'cancellation',
    title: 'Cancellation Matters',
    description: 'Bond cancellation instructions, releases, and related follow-up work.',
    primaryMetric: 'activeMatters',
    primaryMetricLabel: 'Active Cancellation Matters',
    itemLabel: 'cancellation matters',
    lockedMatterType: 'cancellation',
  },
  development: {
    key: 'development',
    title: 'Development Matters',
    description: 'Development-linked matters with unit, phase, and project context.',
    primaryMetric: 'activeMatters',
    primaryMetricLabel: 'Active Development Matters',
    itemLabel: 'development matters',
    lockedMatterType: 'development',
  },
  registered: {
    key: 'registered',
    title: 'Registered Matters',
    description: 'Matters that have reached confirmed registration.',
    primaryMetric: 'registeredMatters',
    primaryMetricLabel: 'Registered Matters',
    itemLabel: 'registered matters',
  },
  archived: {
    key: 'archived',
    title: 'Archived Matters',
    description: 'Closed, archived, or cancelled matters kept for firm reference.',
    primaryMetric: 'archivedMatters',
    primaryMetricLabel: 'Archived Matters',
    itemLabel: 'archived matters',
  },
  delayed: {
    key: 'delayed',
    title: 'Delayed Matters',
    description: 'Matters currently marked as delayed or critical.',
    primaryMetric: 'delayedMatters',
    primaryMetricLabel: 'Delayed Matters',
    itemLabel: 'delayed matters',
  },
}

export function getAttorneyMatterActionHref(row = {}, viewKey = 'all') {
  const detailKey = getAttorneyMatterListWorkflowDetailKey(viewKey)
  const transactionId = row.matterId || row.transactionId
  if (!detailKey || !transactionId) return row.actionHref || ''
  return buildAttorneyWorkflowPath(`/transactions/${encodeURIComponent(transactionId)}`, detailKey)
}

function normalize(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isIncomingQueueRow(row = {}) {
  return ['incoming', 'pre_instruction'].includes(row.rowKind)
}

function getAttorneyMatterViewConfig(view = 'all') {
  const normalized = normalize(view || 'all')
  return ATTORNEY_MATTER_VIEW_CONFIGS[normalized] || ATTORNEY_MATTER_VIEW_CONFIGS.all
}

function normalizeDate(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(date = new Date()) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date = new Date()) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function startOfWeek(date = new Date()) {
  const next = startOfDay(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  return next
}

function endOfWeek(date = new Date()) {
  const next = startOfWeek(date)
  next.setDate(next.getDate() + 6)
  return endOfDay(next)
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isSameDay(value, date = new Date()) {
  const parsed = normalizeDate(value)
  if (!parsed) return false
  return parsed >= startOfDay(date) && parsed <= endOfDay(date)
}

function isWithin(value, start, end) {
  const parsed = normalizeDate(value)
  if (!parsed) return false
  return parsed >= start && parsed <= end
}

function daysSince(value) {
  const parsed = normalizeDate(value)
  if (!parsed) return 0
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000))
}

function getInitials(value = '') {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!parts.length) return 'UN'
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')
}

function getMatterTypeKeys(matter = {}) {
  const label = normalize(matter.matterType)
  const keys = new Set()
  if (!label || label.includes('transfer')) keys.add('transfer')
  if (label.includes('cancellation')) keys.add('cancellation')
  if (label.includes('bond') && (!label.includes('cancellation') || label.includes('+'))) keys.add('bond')
  if (
    matter.developmentId ||
    matter.unitId ||
    (matter.developmentName && normalize(matter.developmentName) !== 'standalone matter')
  ) {
    keys.add('development')
  }
  return [...keys]
}

function getMatterTypeLabel(matter = {}) {
  const keys = getMatterTypeKeys(matter)
  if (keys.includes('development')) return 'Development'
  if (keys.includes('bond') && keys.includes('cancellation')) return 'Bond Cancellation'
  if (keys.includes('bond')) return 'Bond Registration'
  if (keys.includes('cancellation')) return 'Bond Cancellation'
  return 'Transfer'
}

function getIncomingMatterStage(row = {}) {
  const status = normalize(row.status)
  const index = status === 'ready_for_acceptance'
    ? 4
    : status === 'awaiting_documents'
      ? 3
      : status === 'awaiting_signed_otp'
        ? 2
        : status === 'awaiting_client_onboarding'
          ? 1
          : 0

  return {
    key: normalize(INCOMING_STAGE_STEPS[index]),
    label: row.statusLabel || INCOMING_STAGE_STEPS[index],
    index,
    steps: INCOMING_STAGE_STEPS,
  }
}

function getIncomingMatterHealth(row = {}) {
  if (row.status === 'ready_for_acceptance') {
    return { key: 'on_track', label: 'Ready', tone: 'active', rank: 2 }
  }

  if (row.documents?.rejectedCount || row.status === 'awaiting_documents') {
    return { key: 'attention', label: 'Attention', tone: 'attention', rank: 1 }
  }

  return { key: 'attention', label: 'Waiting', tone: 'attention', rank: 0 }
}

function normalizeIncomingMatterRow(row = {}, { currentUser = {} } = {}) {
  const stage = getIncomingMatterStage(row)
  const health = getIncomingMatterHealth(row)
  const assignedAttorneyName = row.assignedAttorney?.name || 'Unassigned'
  const assignedAssistant = row.assignedSecretary?.id ? row.assignedSecretary : row.assignedAdminHandler
  const assistantName = assignedAssistant?.name || ''
  const waitingOnLabels = Array.isArray(row.waitingOnLabels) ? row.waitingOnLabels : []
  const statusKey = row.status || ''

  const nextRow = {
    rowKind: row.rowKind || 'incoming',
    isPreInstruction: Boolean(row.isPreInstruction),
    incomingSortRank: statusKey === 'awaiting_buyer' ? -1 : statusKey === 'awaiting_signed_otp' ? 0 : statusKey === 'awaiting_documents' ? 1 : statusKey === 'ready_for_acceptance' ? 2 : 9,
    matterId: row.matterId || row.transactionId,
    privateListingId: row.privateListingId || '',
    mandatePacketId: row.mandatePacketId || '',
    assignmentId: row.assignmentId || row.id,
    reference: row.reference || row.matterReference,
    matterReference: row.reference || row.matterReference,
    matterType: row.matterType || 'Transfer',
    matterTypeKeys: getMatterTypeKeys(row),
    property: row.property || 'Property pending',
    buyer: row.buyerName || 'Buyer pending',
    seller: row.sellerName || 'Seller pending',
    development: row.development || '',
    unit: row.unit || '',
    phase: row.phase || '',
    erf: '',
    stage,
    nextAction: row.nextAction || waitingOnLabels.join(', ') || 'Review incoming instruction',
    expectedDue: null,
    expectedRegistration: null,
    expectedLodgement: null,
    health,
    clientActionRequired: Boolean(row.waitingOn?.includes?.('signed_otp') || row.waitingOn?.includes?.('documents')),
    assignedAttorney: {
      id: row.assignedAttorney?.id || '',
      name: assignedAttorneyName,
      initials: row.assignedAttorney?.initials || getInitials(assignedAttorneyName),
    },
    assignedAssistant: {
      id: assignedAssistant?.id || '',
      name: assistantName,
      initials: assignedAssistant?.initials || getInitials(assistantName),
    },
    agent: row.agent || '',
    bondOriginator: '',
    bank: '',
    matterValue: Number(row.purchasePrice || 0),
    financeType: row.financeType || '',
    purchasePrice: Number(row.purchasePrice || 0),
    propertyLabel: row.property || 'Property pending',
    buyerName: row.buyerName || 'Buyer pending',
    sellerName: row.sellerName || 'Seller pending',
    currentStage: stage.label,
    lastUpdated: row.incomingSince || null,
    status: row.statusLabel || 'Incoming',
    statusKey,
    lastActivity: row.incomingSince || null,
    createdAt: row.incomingSince || null,
    priority: health.key === 'attention' ? 'Medium' : 'Normal',
    actionHref: row.actionHref || (row.transactionId ? `/transactions/${encodeURIComponent(row.transactionId)}` : ''),
    isMine: [row.assignedAttorney?.id, row.assignedSecretary?.id, row.assignedAdminHandler?.id].filter(Boolean).includes(currentUser?.id),
    waitingOn: row.waitingOn || [],
    waitingOnLabels,
    incomingAgeDays: row.incomingAgeDays || 0,
    documents: row.documents || {},
    otpStatus: row.otpStatus || null,
  }

  nextRow.searchText = [
    nextRow.reference,
    nextRow.buyer,
    nextRow.seller,
    nextRow.property,
    nextRow.development,
    nextRow.unit,
    nextRow.assignedAttorney.name,
    nextRow.assignedAssistant.name,
    nextRow.agent,
    nextRow.stage.label,
    nextRow.nextAction,
    nextRow.status,
    nextRow.statusKey,
    ...(nextRow.waitingOnLabels || []),
  ].map(normalize).join(' ')

  return nextRow
}

function isRegisteredMatter(matter = {}) {
  const lifecycle = normalize(matter.lifecycleState)
  const stage = normalize(matter.currentStage)
  return Boolean(matter.registrationDate) || lifecycle.includes('registered') || stage.includes('registered')
}

function isArchivedMatter(matter = {}) {
  const lifecycle = normalize(matter.lifecycleState)
  const status = normalize(matter.status)
  return lifecycle.includes('archived') || lifecycle.includes('closed') || status.includes('archived') || status.includes('cancel')
}

function resolveStage(matter = {}) {
  const signal = normalize(`${matter.currentStage || ''} ${matter.nextAction || ''} ${matter.lifecycleState || ''}`)
  let currentIndex = 0

  if (isRegisteredMatter(matter) || signal.includes('registration confirmed')) currentIndex = 5
  else if (signal.includes('lodg') || signal.includes('deeds')) currentIndex = 4
  else if (signal.includes('finance') || signal.includes('bank') || signal.includes('bond') || signal.includes('guarantee')) currentIndex = 3
  else if (signal.includes('sign') || signal.includes('otp')) currentIndex = 2
  else if (signal.includes('document') || signal.includes('fica') || signal.includes('clearance')) currentIndex = 1

  return {
    key: normalize(STAGE_STEPS[currentIndex]),
    label: STAGE_STEPS[currentIndex],
    index: currentIndex,
    steps: STAGE_STEPS,
  }
}

function resolveExpectedDue(matter = {}, stage = resolveStage(matter)) {
  if (matter.nextActionDueAt) return matter.nextActionDueAt
  if (stage.label === 'Lodgement' && matter.expectedLodgementDate) return matter.expectedLodgementDate
  if (matter.expectedRegistrationDate) return matter.expectedRegistrationDate
  return null
}

function resolveNextAction(matter = {}, { documentStatus = {} } = {}) {
  const rawAction = String(matter.nextAction || '').trim()
  const stage = resolveStage(matter)

  if (matter.flags?.delayed) return rawAction || 'Review delayed matter'
  if (matter.flags?.guaranteesOutstanding) return 'Awaiting guarantees'
  if (matter.flags?.awaitingSignatures) return 'Client signature'
  if (matter.flags?.awaitingFica || documentStatus.outstanding > 0) return 'Request documents'
  if (matter.flags?.bankConditionsPending) return 'Bank approval'
  if (matter.flags?.lodgementPending && isSameDay(resolveExpectedDue(matter, stage))) return 'Lodgement today'
  if (normalize(matter.currentStage).includes('clearance')) return 'Certificate of balance'
  if (rawAction) return rawAction

  if (stage.label === 'Instruction') return 'Confirm instruction'
  if (stage.label === 'Documents') return 'Request documents'
  if (stage.label === 'Signing') return 'Client signature'
  if (stage.label === 'Finance') return 'Bank approval'
  if (stage.label === 'Lodgement') return 'Prepare lodgement'
  return 'Confirm registration'
}

export function calculateMatterHealth(matter = {}, { documentStatus = {} } = {}) {
  if (isRegisteredMatter(matter)) {
    return { key: 'registered', label: 'Registered', tone: 'registered', rank: 4 }
  }

  if (isArchivedMatter(matter)) {
    return { key: 'archived', label: 'Archived', tone: 'archived', rank: 5 }
  }

  const today = startOfDay()
  const due = resolveExpectedDue(matter)
  const dueDate = normalizeDate(due)
  const expectedRegistration = normalizeDate(matter.expectedRegistrationDate)
  const stalledDays = daysSince(matter.lastMeaningfulActivityAt || matter.lastUpdated)
  const isOverdue = dueDate ? dueDate < today : false
  const registrationMissed = expectedRegistration ? expectedRegistration < today : false
  const rejectedDocsUnresolved = Number(documentStatus.rejected || 0) > 0

  if (isOverdue || stalledDays > 21 || rejectedDocsUnresolved || registrationMissed || matter.flags?.delayed) {
    return { key: 'critical', label: 'Critical', tone: 'critical', rank: 0 }
  }

  if (
    matter.flags?.awaitingSignatures ||
    matter.flags?.guaranteesOutstanding ||
    matter.flags?.awaitingFica ||
    matter.flags?.bankConditionsPending ||
    Number(documentStatus.outstanding || 0) > 0 ||
    stalledDays > 14
  ) {
    return { key: 'attention', label: 'Attention', tone: 'attention', rank: 1 }
  }

  return { key: 'on_track', label: 'Active', tone: 'active', rank: 3 }
}

function buildDocumentStatusMap(documentQueue = []) {
  return (documentQueue || []).reduce((accumulator, item) => {
    const matterId = item.transactionId || item.transaction_id
    if (!matterId) return accumulator
    if (!accumulator[matterId]) {
      accumulator[matterId] = { outstanding: 0, rejected: 0 }
    }
    const status = normalize(item.status)
    if (['requested', 'uploaded', 'rejected'].includes(status)) {
      accumulator[matterId].outstanding += 1
    }
    if (status === 'rejected') {
      accumulator[matterId].rejected += 1
    }
    return accumulator
  }, {})
}

function normalizeMatterRow(matter = {}, { documentStatus = {}, currentUser = {}, referenceLane = '' } = {}) {
  const stage = resolveStage(matter)
  const health = calculateMatterHealth(matter, { documentStatus })
  const expectedDue = resolveExpectedDue(matter, stage)
  const nextAction = resolveNextAction(matter, { documentStatus })
  const assignedAttorneyName = matter.assignedAttorneyName || 'Unassigned'
  const assistantName = matter.assignedSecretaryName || matter.assignedAdminHandlerName || ''
  const matterTypeKeys = getMatterTypeKeys(matter)
  const priority = health.key === 'critical' ? 'High' : health.key === 'attention' ? 'Medium' : 'Normal'
  const status =
    health.key === 'registered'
      ? 'Registered'
      : health.key === 'archived'
        ? 'Archived'
        : health.key === 'critical'
          ? 'Delayed'
          : health.key === 'attention'
            ? 'Attention'
            : 'Active'
  const laneReference = referenceLane ? matter.matterReferencesByLane?.[referenceLane] : null
  const matterReference = laneReference?.effectiveReference || matter.matterReference
  const platformReference = laneReference?.platformReference || matter.platformReference || ''
  const referenceAliases = laneReference?.referenceAliases || matter.matterReferenceAliases || []

  const row = {
    matterId: matter.matterId,
    assignmentId: matter.assignmentId,
    reference: matterReference,
    matterReference,
    platformReference,
    provisionalReference: laneReference?.provisionalReference || matter.provisionalReference || '',
    filingReference: laneReference?.filingReference || matter.filingReference || '',
    referenceStatus: laneReference?.referenceStatus || matter.matterReferenceStatus || 'provisional',
    referenceAliases,
    referenceLane: referenceLane || matter.matterReferenceLane || 'transfer',
    matterType: getMatterTypeLabel(matter),
    matterTypeKeys,
    property: matter.propertyLabel || 'Property pending',
    buyer: matter.buyerName || matter.clientName || 'Buyer pending',
    seller: matter.sellerName || 'Seller pending',
    development: matter.developmentName && normalize(matter.developmentName) !== 'standalone matter' ? matter.developmentName : '',
    unit: matter.unitNumber || '',
    phase: matter.phase || '',
    erf: matter.erfNumber || '',
    stage,
    nextAction,
    expectedDue,
    expectedRegistration: matter.expectedRegistrationDate || null,
    expectedLodgement: matter.expectedLodgementDate || null,
    health,
    clientActionRequired: Boolean(
      matter.flags?.awaitingFica ||
        matter.flags?.awaitingSignatures ||
        matter.flags?.guaranteesOutstanding ||
        documentStatus.outstanding > 0,
    ),
    assignedAttorney: {
      id: matter.assignedAttorneyId || '',
      name: assignedAttorneyName,
      initials: getInitials(assignedAttorneyName),
    },
    assignedAssistant: {
      id: matter.assignedSecretaryId || matter.assignedAdminHandlerId || '',
      name: assistantName,
      initials: getInitials(assistantName),
    },
    agent: matter.assignedAgentName || matter.assignedAgentEmail || '',
    bondOriginator: matter.bondOriginatorName || matter.assignedBondOriginatorEmail || '',
    bank: matter.bank || '',
    matterValue: Number(matter.purchasePrice || 0),
    financeType: matter.financeType || '',
    purchasePrice: Number(matter.purchasePrice || 0),
    propertyLabel: matter.propertyLabel || 'Property pending',
    buyerName: matter.buyerName || matter.clientName || 'Buyer pending',
    sellerName: matter.sellerName || 'Seller pending',
    sellerHasExistingBond: matter.sellerHasExistingBond || false,
    currentBondBank: matter.currentBondBank || matter.bank || '',
    estimatedSettlementAmount: matter.estimatedSettlementAmount || 0,
    lifecycleState: matter.lifecycleState || 'active',
    currentStage: matter.currentStage || stage.label,
    registrationDate: matter.registrationDate || null,
    lastUpdated: matter.lastUpdated || matter.lastMeaningfulActivityAt || null,
    developmentName: matter.developmentName || '',
    status,
    lastActivity: matter.lastMeaningfulActivityAt || matter.lastUpdated || null,
    createdAt: matter.createdAt || null,
    priority,
    actionHref: matter.actionHref || (matter.matterId ? `/transactions/${encodeURIComponent(matter.matterId)}` : ''),
    isMine: [matter.assignedAttorneyId, matter.assignedSecretaryId, matter.assignedAdminHandlerId].filter(Boolean).includes(currentUser?.id),
  }

  row.searchText = [
    buildAttorneyMatterReferenceSearchText({
      effectiveReference: row.reference,
      filingReference: row.filingReference,
      provisionalReference: row.provisionalReference,
      platformReference: row.platformReference,
      referenceAliases: row.referenceAliases,
    }),
    row.buyer,
    row.seller,
    row.property,
    row.development,
    row.unit,
    row.phase,
    row.erf,
    row.assignedAttorney.name,
    row.assignedAssistant.name,
    row.agent,
    row.bondOriginator,
    row.bank,
    row.stage.label,
    row.nextAction,
    row.status,
  ].map(normalize).join(' ')

  return row
}

function applyBaseView(rows = [], view = 'all') {
  const normalized = getAttorneyMatterViewConfig(view).key
  if (normalized === 'all') return rows
  if (normalized === 'active' && rows.some(isIncomingQueueRow)) return rows
  if (normalized === 'active') return rows.filter((row) => ['Active', 'Attention', 'Delayed'].includes(row.status))
  if (normalized === 'registered') return rows.filter((row) => row.status === 'Registered')
  if (normalized === 'archived') return rows.filter((row) => row.status === 'Archived')
  if (normalized === 'delayed') return rows.filter((row) => row.status === 'Delayed')
  if (['transfer', 'bond', 'cancellation', 'development'].includes(normalized)) {
    return rows.filter((row) => row.matterTypeKeys.includes(normalized))
  }
  return rows
}

function matchesDateBucket(value, bucket = 'all') {
  const normalized = normalize(bucket || 'all')
  if (normalized === 'all') return true
  if (normalized === 'today') return isSameDay(value)
  if (normalized === 'this_week') return isWithin(value, startOfWeek(), endOfWeek())
  if (normalized === 'next_week') {
    const nextWeekStart = addDays(endOfWeek(), 1)
    return isWithin(value, nextWeekStart, endOfWeek(nextWeekStart))
  }
  return true
}

function matchesMatterValue(value, bucket = 'all') {
  const normalized = normalize(bucket || 'all')
  const amount = Number(value || 0)
  if (normalized === 'all') return true
  if (normalized === '0-1000000') return amount > 0 && amount < 1000000
  if (normalized === '1000000-3000000') return amount >= 1000000 && amount <= 3000000
  if (normalized === '3000000+') return amount > 3000000
  return true
}

function applyWorkspaceFilters(rows = [], { search = '', filters = {}, quickFilter = '', view = 'all' } = {}) {
  const viewConfig = getAttorneyMatterViewConfig(view)
  const searchTerm = normalize(search)
  const status = normalize(filters.status || 'all')
  const matterType = viewConfig.lockedMatterType || viewConfig.usesIncomingQueue ? 'all' : normalize(filters.matterType || 'all')
  const attorney = normalize(filters.attorney || 'all')
  const assistant = normalize(filters.assistant || 'all')
  const partner = normalize(filters.partner || 'all')
  const development = normalize(filters.development || 'all')
  const bank = normalize(filters.bank || 'all')
  const priority = normalize(filters.priority || 'all')
  const dateInstructed = normalize(filters.dateInstructed || 'all')
  const expectedRegistration = normalize(filters.expectedRegistration || 'all')
  const expectedLodgement = normalize(filters.expectedLodgement || 'all')
  const matterValue = normalize(filters.matterValue || 'all')
  const quick = normalize(quickFilter)
  const today = new Date()
  const weekStart = startOfWeek(today)
  const weekEnd = endOfWeek(today)

  return rows.filter((row) => {
    if (searchTerm && !row.searchText.includes(searchTerm)) return false
    if (status !== 'all' && ![normalize(row.status), normalize(row.statusKey)].includes(status)) return false
    if (matterType !== 'all' && !row.matterTypeKeys.includes(matterType)) return false
    if (attorney !== 'all' && normalize(row.assignedAttorney.id || row.assignedAttorney.name) !== attorney) return false
    if (assistant !== 'all' && normalize(row.assignedAssistant.id || row.assignedAssistant.name) !== assistant) return false
    if (partner !== 'all' && ![row.agent, row.bondOriginator].map(normalize).includes(partner)) return false
    if (development !== 'all' && normalize(row.development) !== development) return false
    if (bank !== 'all' && normalize(row.bank) !== bank) return false
    if (priority !== 'all' && normalize(row.priority) !== priority) return false
    if (!matchesDateBucket(row.createdAt, dateInstructed)) return false
    if (!matchesDateBucket(row.expectedRegistration, expectedRegistration)) return false
    if (!matchesDateBucket(row.expectedLodgement, expectedLodgement)) return false
    if (!matchesMatterValue(row.matterValue, matterValue)) return false

    if (quick === 'today') return isSameDay(row.expectedDue)
    if (quick === 'this_week') return isWithin(row.expectedDue || row.expectedRegistration, weekStart, weekEnd)
    if (quick === 'needs_attention') return ['critical', 'attention'].includes(row.health.key)
    if (quick === 'awaiting_buyer') return row.statusKey === 'awaiting_buyer'
    if (quick === 'awaiting_signed_otp') return row.statusKey === 'awaiting_signed_otp'
    if (quick === 'awaiting_documents') return row.statusKey === 'awaiting_documents'
    if (quick === 'ready_for_acceptance') return row.statusKey === 'ready_for_acceptance'
    if (quick === 'document_blockers') return Boolean(row.documents?.openCount || row.documents?.reviewCount || row.documents?.rejectedCount)
    if (quick === 'my_matters') return row.isMine
    if (quick === 'unassigned') return !row.assignedAttorney.id
    if (quick === 'awaiting_client') return row.clientActionRequired
    if (quick === 'delayed') return row.status === 'Delayed'
    if (quick === 'due_for_registration') return isWithin(row.expectedRegistration, weekStart, weekEnd)

    return true
  })
}

function sortWorkspaceRows(rows = []) {
  return [...rows].sort((left, right) => {
    if (isIncomingQueueRow(left) || isIncomingQueueRow(right)) {
      const incomingDiff = (left.incomingSortRank ?? 99) - (right.incomingSortRank ?? 99)
      if (incomingDiff !== 0) return incomingDiff

      const ageDiff = (right.incomingAgeDays || 0) - (left.incomingAgeDays || 0)
      if (ageDiff !== 0) return ageDiff
    }

    const healthDiff = left.health.rank - right.health.rank
    if (healthDiff !== 0) return healthDiff

    const leftDueToday = isSameDay(left.expectedDue) ? 0 : 1
    const rightDueToday = isSameDay(right.expectedDue) ? 0 : 1
    if (leftDueToday !== rightDueToday) return leftDueToday - rightDueToday

    const leftDueTime = normalizeDate(left.expectedRegistration || left.expectedDue)?.getTime() || Number.MAX_SAFE_INTEGER
    const rightDueTime = normalizeDate(right.expectedRegistration || right.expectedDue)?.getTime() || Number.MAX_SAFE_INTEGER
    if (leftDueTime !== rightDueTime) return leftDueTime - rightDueTime

    return (normalizeDate(right.lastActivity)?.getTime() || 0) - (normalizeDate(left.lastActivity)?.getTime() || 0)
  })
}

function createSparkline(value = 0, slope = 1) {
  const base = Math.max(0, Number(value || 0))
  if (!base) return [0, 1, 0, 2, 1, 3]
  return [0.62, 0.68, 0.61, 0.78, 0.73, 0.88].map((ratio, index) =>
    Math.max(1, Math.round(base * ratio + index * slope)),
  )
}

function buildSummary(rows = [], { usesIncomingQueue = false } = {}) {
  const incomingRows = rows.filter(isIncomingQueueRow)
  if (usesIncomingQueue || incomingRows.length) {
    return {
      totalMatters: incomingRows.length,
      activeMatters: incomingRows.length,
      incomingMatters: incomingRows.length,
      attentionMatters: incomingRows.filter((row) => ['awaiting_signed_otp', 'awaiting_documents'].includes(row.statusKey)).length,
      delayedMatters: 0,
      registeredMatters: 0,
      archivedMatters: 0,
      awaitingBuyer: incomingRows.filter((row) => row.statusKey === 'awaiting_buyer').length,
      awaitingSignedOtp: incomingRows.filter((row) => row.statusKey === 'awaiting_signed_otp').length,
      awaitingDocuments: incomingRows.filter((row) => row.statusKey === 'awaiting_documents').length,
      readyForAcceptance: incomingRows.filter((row) => row.statusKey === 'ready_for_acceptance').length,
      transferCount: incomingRows.length,
      bondCount: 0,
      cancellationCount: 0,
      developmentCount: incomingRows.filter((row) => row.development).length,
    }
  }

  const activeRows = rows.filter((row) => ['Active', 'Attention', 'Delayed'].includes(row.status))
  return {
    totalMatters: rows.length,
    activeMatters: activeRows.length,
    attentionMatters: activeRows.filter((row) => row.status === 'Attention').length,
    delayedMatters: activeRows.filter((row) => row.status === 'Delayed').length,
    registeredMatters: rows.filter((row) => row.status === 'Registered').length,
    archivedMatters: rows.filter((row) => row.status === 'Archived').length,
    transferCount: activeRows.filter((row) => row.matterTypeKeys.includes('transfer')).length,
    bondCount: activeRows.filter((row) => row.matterTypeKeys.includes('bond')).length,
    cancellationCount: activeRows.filter((row) => row.matterTypeKeys.includes('cancellation')).length,
    developmentCount: activeRows.filter((row) => row.matterTypeKeys.includes('development')).length,
  }
}

function buildKpis(rows = [], { usesIncomingQueue = false } = {}) {
  const incomingRows = rows.filter(isIncomingQueueRow)
  if (usesIncomingQueue || incomingRows.length) {
    const awaitingBuyer = incomingRows.filter((row) => row.statusKey === 'awaiting_buyer')
    const awaitingSignedOtp = incomingRows.filter((row) => row.statusKey === 'awaiting_signed_otp')
    const awaitingDocuments = incomingRows.filter((row) => row.statusKey === 'awaiting_documents')
    const readyForAcceptance = incomingRows.filter((row) => row.statusKey === 'ready_for_acceptance')
    const documentBlockers = incomingRows.filter((row) => row.documents?.openCount || row.documents?.reviewCount)
    const oldestIncomingDays = incomingRows.reduce((max, row) => Math.max(max, row.incomingAgeDays || 0), 0)

    return [
      {
        key: 'active_matters',
        label: 'Incoming Matters',
        value: incomingRows.length,
        helper: oldestIncomingDays ? `Oldest ${oldestIncomingDays} days` : 'Ready for intake',
        tone: 'emerald',
        sparkline: createSparkline(incomingRows.length),
      },
      {
        key: 'awaiting_client',
        label: 'Awaiting Buyer',
        value: awaitingBuyer.length,
        helper: 'Mandate allocated',
        tone: 'amber',
        sparkline: createSparkline(awaitingBuyer.length, 2),
      },
      {
        key: 'lodgement_today',
        label: 'Awaiting Signed OTP',
        value: awaitingSignedOtp.length,
        helper: 'Buyer signature needed',
        tone: 'blue',
        sparkline: createSparkline(awaitingSignedOtp.length, 2),
      },
      {
        key: 'registration_this_week',
        label: 'Awaiting Documents',
        value: awaitingDocuments.length,
        helper: `${documentBlockers.length} blockers`,
        tone: 'violet',
        sparkline: createSparkline(awaitingDocuments.length),
      },
      {
        key: 'delayed',
        label: 'Ready For Acceptance',
        value: readyForAcceptance.length,
        helper: 'Attorney action',
        tone: 'red',
        sparkline: createSparkline(readyForAcceptance.length),
      },
    ]
  }

  const today = new Date()
  const weekStart = startOfWeek(today)
  const weekEnd = endOfWeek(today)
  const nextWeekStart = addDays(weekEnd, 1)
  const nextWeekEnd = endOfWeek(nextWeekStart)
  const activeRows = rows.filter((row) => ['Active', 'Attention', 'Delayed'].includes(row.status))
  const awaitingClient = activeRows.filter((row) => row.clientActionRequired)
  const lodgementToday = activeRows.filter((row) => row.stage.label === 'Lodgement' && isSameDay(row.expectedDue))
  const registrationThisWeek = activeRows.filter((row) => isWithin(row.expectedRegistration, weekStart, weekEnd))
  const registrationsNextWeek = activeRows.filter((row) => isWithin(row.expectedRegistration, nextWeekStart, nextWeekEnd))
  const delayed = activeRows.filter((row) => row.status === 'Delayed')
  const newThisWeek = activeRows.filter((row) => isWithin(row.createdAt || row.lastActivity, weekStart, weekEnd)).length
  const oldestAwaitingDays = awaitingClient.reduce((max, row) => Math.max(max, daysSince(row.lastActivity)), 0)

  return [
    {
      key: 'active_matters',
      label: 'Active Matters',
      value: activeRows.length,
      helper: `${newThisWeek >= 0 ? '+' : ''}${newThisWeek} this week`,
      tone: 'emerald',
      sparkline: createSparkline(activeRows.length),
    },
    {
      key: 'awaiting_client',
      label: 'Awaiting Client',
      value: awaitingClient.length,
      helper: oldestAwaitingDays ? `Oldest ${oldestAwaitingDays} days` : 'No client blockers',
      tone: 'amber',
      sparkline: createSparkline(awaitingClient.length, 2),
    },
    {
      key: 'lodgement_today',
      label: 'Lodgement Today',
      value: lodgementToday.length,
      helper: `${lodgementToday.filter((row) => row.health.key === 'critical').length} urgent`,
      tone: 'blue',
      sparkline: createSparkline(lodgementToday.length),
    },
    {
      key: 'registration_this_week',
      label: 'Registration This Week',
      value: registrationThisWeek.length,
      helper: `Next: ${registrationsNextWeek.length}`,
      tone: 'violet',
      sparkline: createSparkline(registrationThisWeek.length),
    },
    {
      key: 'delayed',
      label: 'Delayed',
      value: delayed.length,
      helper: 'Require attention',
      tone: 'red',
      sparkline: createSparkline(delayed.length, 2),
    },
  ]
}

function buildFilterPayload(operational = {}, rows = [], { view = 'all' } = {}) {
  const viewConfig = getAttorneyMatterViewConfig(view)
  const memberOptions = (operational.availableFilters?.members || []).map((member) => ({
    value: member.value,
    label: member.label,
    role: member.role,
  }))
  const developmentOptions = [...new Set(rows.map((row) => row.development).filter(Boolean))]
    .map((value) => ({ value: normalize(value), label: value }))
  const partnerOptions = [...new Set(rows.flatMap((row) => [row.agent, row.bondOriginator]).filter(Boolean))]
    .map((value) => ({ value: normalize(value), label: value }))
  const bankOptions = [...new Set(rows.map((row) => row.bank).filter(Boolean))]
    .map((value) => ({ value: normalize(value), label: value }))

  return {
    statuses: viewConfig.usesIncomingQueue ? INCOMING_STATUS_FILTERS : STATUS_FILTERS,
    matterTypes: MATTER_TYPE_FILTERS,
    attorneys: [{ value: 'all', label: 'All Attorneys' }, ...memberOptions],
    assistants: [{ value: 'all', label: 'All Assistants' }, ...memberOptions],
    branches: [{ value: 'all', label: 'All Branches' }],
    partners: [{ value: 'all', label: 'All Partners' }, ...partnerOptions],
    developments: [{ value: 'all', label: 'All Developments' }, ...developmentOptions],
    municipalities: [{ value: 'all', label: 'All Municipalities' }],
    banks: [{ value: 'all', label: 'All Banks' }, ...bankOptions],
    priorities: [
      { value: 'all', label: 'All Priorities' },
      { value: 'high', label: 'High' },
      { value: 'medium', label: 'Medium' },
      { value: 'normal', label: 'Normal' },
    ],
    dateRanges: [
      { value: 'all', label: 'Any date' },
      { value: 'today', label: 'Today' },
      { value: 'this_week', label: 'This week' },
      { value: 'next_week', label: 'Next week' },
    ],
    matterValues: [
      { value: 'all', label: 'Any value' },
      { value: '0-1000000', label: 'Under R1m' },
      { value: '1000000-3000000', label: 'R1m - R3m' },
      { value: '3000000+', label: 'R3m+' },
    ],
  }
}

export function buildAttorneyMatterWorkspace(operational = {}, options = {}) {
  const viewConfig = getAttorneyMatterViewConfig(options.view || 'all')
  const documentStatusByMatter = buildDocumentStatusMap(operational.documentQueue || [])
  const incomingMatterQueue = operational.incomingMatterQueue || operational.incomingMatterSource?.filteredRows || []
  const normalizedRowsUnscoped = viewConfig.usesIncomingQueue && (operational.incomingMatterSource || incomingMatterQueue.length)
      ? incomingMatterQueue.map((matter) =>
        normalizeIncomingMatterRow(matter, {
          currentUser: operational.currentUser || {},
        }),
      )
    : (operational.matterQueue || []).map((matter) =>
        normalizeMatterRow(matter, {
          documentStatus: documentStatusByMatter[matter.matterId] || {},
          currentUser: operational.currentUser || {},
          referenceLane: ['transfer', 'bond', 'cancellation'].includes(viewConfig.lockedMatterType)
            ? viewConfig.lockedMatterType
            : '',
        }),
      )
  const normalizedRows = Array.isArray(options.moduleKeys)
    ? filterAttorneyRecordsByModules(normalizedRowsUnscoped, options.moduleKeys)
    : normalizedRowsUnscoped
  const baseRows = normalizedRows.map((row) => ({
    ...row,
    actionHref: getAttorneyMatterActionHref(row, viewConfig.key),
  }))

  const viewRows = applyBaseView(baseRows, viewConfig.key)
  const filteredRows = sortWorkspaceRows(applyWorkspaceFilters(viewRows, { ...options, view: viewConfig.key }))
  const pageSize = ATTORNEY_MATTER_PAGE_SIZES.includes(Number(options.pageSize)) ? Number(options.pageSize) : 20
  const page = Math.max(1, Number(options.page || 1))
  const start = (page - 1) * pageSize
  const tableRows = filteredRows.slice(start, start + pageSize)

  return {
    source: operational,
    firm: operational.firm || null,
    currentUser: operational.currentUser || null,
    permissions: operational.permissions || {},
    view: viewConfig,
    summary: buildSummary(viewRows, { usesIncomingQueue: viewConfig.usesIncomingQueue }),
    filters: buildFilterPayload(operational, baseRows, { view: viewConfig.key }),
    kpis: buildKpis(viewRows, { usesIncomingQueue: viewConfig.usesIncomingQueue }),
    savedViews: viewConfig.usesIncomingQueue ? INCOMING_SAVED_VIEWS : SAVED_VIEWS,
    quickFilters: viewConfig.usesIncomingQueue ? INCOMING_QUICK_FILTERS : QUICK_FILTERS,
    tableRows,
    allRows: baseRows,
    filteredRows,
    pagination: {
      page,
      pageSize,
      pageSizeOptions: ATTORNEY_MATTER_PAGE_SIZES,
      totalRows: filteredRows.length,
      totalPages: Math.max(1, Math.ceil(filteredRows.length / pageSize)),
      showingFrom: filteredRows.length ? start + 1 : 0,
      showingTo: Math.min(start + pageSize, filteredRows.length),
    },
  }
}

export async function getAttorneyMatterWorkspace(options = {}) {
  const viewConfig = getAttorneyMatterViewConfig(options.view || 'all')
  const [operational, incomingMatterSource] = await Promise.all([
    getAttorneyOperationalWorkspaceData(options.firmId || null, options.userId || null, {
      moduleKeys: Array.isArray(options.moduleKeys) ? options.moduleKeys : null,
    }),
    viewConfig.usesIncomingQueue
      ? getAttorneyIncomingMatterQueue({
          firmId: options.firmId || null,
          userId: options.userId || null,
          moduleKeys: Array.isArray(options.moduleKeys) ? options.moduleKeys : null,
        })
      : Promise.resolve(null),
  ])

  if (incomingMatterSource) {
    operational.incomingMatterSource = incomingMatterSource
    operational.incomingMatterQueue = incomingMatterSource.filteredRows || incomingMatterSource.rows || []
    operational.firm = incomingMatterSource.firm || operational.firm
    operational.currentUser = incomingMatterSource.currentUser || operational.currentUser
  }

  return buildAttorneyMatterWorkspace(operational, options)
}
