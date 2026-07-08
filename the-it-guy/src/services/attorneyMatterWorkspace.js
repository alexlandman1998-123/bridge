import { getAttorneyOperationalWorkspaceData } from './attorneyOperations'

export const ATTORNEY_MATTER_PAGE_SIZES = [20, 50, 100]

const STAGE_STEPS = ['Instruction', 'Documents', 'Signing', 'Finance', 'Lodgement', 'Registration']

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'delayed', label: 'Delayed' },
  { key: 'registered', label: 'Registered' },
  { key: 'archived', label: 'Archived' },
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

const SAVED_VIEWS = [
  { id: 'my-bond-registrations', name: 'My Bond Registrations', filters: { matterType: 'bond', quickFilter: 'my_matters' } },
  { id: 'registrations-this-week', name: 'Registrations This Week', filters: { quickFilter: 'due_for_registration' } },
  { id: 'high-priority', name: 'High Priority', filters: { quickFilter: 'needs_attention' } },
  { id: 'jhb-branch', name: 'JHB Branch', filters: { branch: 'jhb' } },
  { id: 'guarantees-outstanding', name: 'Guarantees Outstanding', filters: { nextAction: 'guarantee' } },
]

function normalize(value = '') {
  return String(value || '').trim().toLowerCase()
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
  if (label.includes('bond')) keys.add('bond')
  if (label.includes('cancellation')) keys.add('cancellation')
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

function normalizeMatterRow(matter = {}, { documentStatus = {}, currentUser = {} } = {}) {
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

  const row = {
    matterId: matter.matterId,
    assignmentId: matter.assignmentId,
    reference: matter.matterReference,
    matterReference: matter.matterReference,
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
    status,
    lastActivity: matter.lastMeaningfulActivityAt || matter.lastUpdated || null,
    createdAt: matter.createdAt || null,
    priority,
    actionHref: matter.actionHref || `/transactions/${matter.matterId}`,
    isMine: [matter.assignedAttorneyId, matter.assignedSecretaryId, matter.assignedAdminHandlerId].filter(Boolean).includes(currentUser?.id),
  }

  row.searchText = [
    row.reference,
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
  const normalized = normalize(view || 'all')
  if (normalized === 'all') return rows
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

function applyWorkspaceFilters(rows = [], { search = '', filters = {}, quickFilter = '' } = {}) {
  const searchTerm = normalize(search)
  const status = normalize(filters.status || 'all')
  const matterType = normalize(filters.matterType || 'all')
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
    if (status !== 'all' && normalize(row.status) !== status) return false
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

function buildSummary(rows = []) {
  const activeRows = rows.filter((row) => ['Active', 'Attention', 'Delayed'].includes(row.status))
  return {
    activeMatters: activeRows.length,
    transferCount: activeRows.filter((row) => row.matterTypeKeys.includes('transfer')).length,
    bondCount: activeRows.filter((row) => row.matterTypeKeys.includes('bond')).length,
    cancellationCount: activeRows.filter((row) => row.matterTypeKeys.includes('cancellation')).length,
    developmentCount: activeRows.filter((row) => row.matterTypeKeys.includes('development')).length,
  }
}

function buildKpis(rows = []) {
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

function buildFilterPayload(operational = {}, rows = []) {
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
    statuses: STATUS_FILTERS,
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
  const documentStatusByMatter = buildDocumentStatusMap(operational.documentQueue || [])
  const baseRows = (operational.matterQueue || []).map((matter) =>
    normalizeMatterRow(matter, {
      documentStatus: documentStatusByMatter[matter.matterId] || {},
      currentUser: operational.currentUser || {},
    }),
  )

  const viewRows = applyBaseView(baseRows, options.view || 'all')
  const filteredRows = sortWorkspaceRows(applyWorkspaceFilters(viewRows, options))
  const pageSize = ATTORNEY_MATTER_PAGE_SIZES.includes(Number(options.pageSize)) ? Number(options.pageSize) : 20
  const page = Math.max(1, Number(options.page || 1))
  const start = (page - 1) * pageSize
  const tableRows = filteredRows.slice(start, start + pageSize)

  return {
    source: operational,
    firm: operational.firm || null,
    currentUser: operational.currentUser || null,
    permissions: operational.permissions || {},
    summary: buildSummary(baseRows),
    filters: buildFilterPayload(operational, baseRows),
    kpis: buildKpis(baseRows),
    savedViews: SAVED_VIEWS,
    quickFilters: QUICK_FILTERS,
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
  const operational = await getAttorneyOperationalWorkspaceData(options.firmId || null, options.userId || null)
  return buildAttorneyMatterWorkspace(operational, options)
}
