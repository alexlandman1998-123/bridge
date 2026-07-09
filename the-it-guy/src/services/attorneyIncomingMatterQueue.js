import {
  getAttorneyRolePermissions,
  getCurrentUserAttorneyMembership,
} from '../lib/attorneyPermissions'
import {
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES,
  ATTORNEY_INCOMING_WAITING_ON,
  buildAttorneyIncomingMatterContract,
  getAttorneyDocumentRequestsInReview,
  getOpenAttorneyDocumentRequests,
  isAttorneyInstructionClosedStatus,
  isTransferAttorneyAssignment,
} from '../core/transactions/attorneyIncomingMatterContract'
import {
  getAuthenticatedUser,
  isMissingColumnError,
  isMissingTableError,
  isPermissionDeniedError,
  normalizeText,
  requireClient,
} from './attorneyFirmServiceShared'
import { getAttorneyFirmById, getCurrentUserPrimaryAttorneyFirm } from './attorneyFirms'

export const ATTORNEY_INCOMING_MATTER_PAGE_SIZES = [20, 50, 100]

const MANAGEMENT_ROLES = new Set(['firm_admin', 'director_partner'])

const ASSIGNMENT_COLUMNS = [
  'id',
  'transaction_id',
  'firm_id',
  'attorney_firm_id',
  'assignment_type',
  'attorney_role',
  'matter_type',
  'instruction_status',
  'department_id',
  'attorney_department_id',
  'primary_attorney_id',
  'attorney_user_id',
  'secretary_id',
  'admin_handler_id',
  'assigned_user_id',
  'assigned_organisation_id',
  'assigned_workspace_unit_id',
  'assigned_branch_id',
  'assigned_region_id',
  'assigned_team_id',
  'scope_level',
  'status',
  'assignment_status',
  'is_primary',
  'assigned_by',
  'assigned_at',
  'created_at',
  'updated_at',
]

const TRANSACTION_COLUMNS = [
  'id',
  'organisation_id',
  'development_id',
  'unit_id',
  'buyer_id',
  'matter_number',
  'transaction_reference',
  'property_address_line_1',
  'property_address_line_2',
  'suburb',
  'city',
  'province',
  'property_description',
  'purchase_price',
  'sales_price',
  'finance_type',
  'onboarding_status',
  'onboarding_completed_at',
  'external_onboarding_submitted_at',
  'current_main_stage',
  'current_sub_stage_summary',
  'stage',
  'attorney_stage',
  'next_action',
  'assigned_agent',
  'assigned_agent_email',
  'seller_name',
  'seller_email',
  'last_meaningful_activity_at',
  'is_active',
  'created_at',
  'updated_at',
]

const ONBOARDING_COLUMNS = [
  'id',
  'transaction_id',
  'status',
  'purchaser_type',
  'submitted_at',
  'is_active',
  'created_at',
  'updated_at',
]

const DOCUMENT_REQUEST_COLUMNS = [
  'id',
  'transaction_id',
  'category',
  'document_type',
  'title',
  'description',
  'priority',
  'status',
  'review_status',
  'due_date',
  'lane_key',
  'attorney_role',
  'requested_from',
  'assigned_to_role',
  'created_at',
  'updated_at',
]

const BUYER_COLUMNS = ['id', 'name', 'email']
const UNIT_COLUMNS = ['id', 'development_id', 'unit_number', 'unit_label', 'phase', 'block', 'status']
const DEVELOPMENT_COLUMNS = ['id', 'name', 'development_name', 'code']
const PROFILE_COLUMNS = ['id', 'full_name', 'first_name', 'last_name', 'email']

const STATUS_SORT_RANK = {
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp]: 0,
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments]: 1,
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance]: 2,
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding]: 3,
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction]: 4,
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted]: 5,
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined]: 6,
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.removed]: 7,
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.completed]: 8,
}

const WAITING_ON_LABELS = {
  [ATTORNEY_INCOMING_WAITING_ON.buyerOnboarding]: 'Buyer onboarding',
  [ATTORNEY_INCOMING_WAITING_ON.signedOtp]: 'Signed OTP',
  [ATTORNEY_INCOMING_WAITING_ON.documents]: 'Documents',
  [ATTORNEY_INCOMING_WAITING_ON.attorneyAcceptance]: 'Attorney acceptance',
  [ATTORNEY_INCOMING_WAITING_ON.instructionReview]: 'Instruction review',
}

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s/-]+/g, '_')
}

function compact(values = []) {
  return values.map((value) => String(value || '').trim()).filter(Boolean)
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function safeNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function normalizeDate(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? null : date
}

function daysSince(value) {
  const date = normalizeDate(value)
  if (!date) return null
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
}

function getInitials(value = '') {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'UN'
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')
}

function getPersonName(profile = null, fallback = 'Unassigned') {
  if (!profile) return fallback
  return compact([
    profile.full_name,
    [profile.first_name, profile.last_name].filter(Boolean).join(' '),
    profile.email,
  ])[0] || fallback
}

function getMatterReference(transaction = {}, fallbackId = '') {
  return (
    normalizeText(transaction.matter_number) ||
    normalizeText(transaction.transaction_reference) ||
    `MAT-${String(fallbackId || transaction.id || '').slice(0, 8).toUpperCase()}`
  )
}

function getPropertyLabel(transaction = {}, unit = null) {
  return (
    normalizeText(transaction.property_description) ||
    compact([transaction.property_address_line_1, transaction.suburb, transaction.city]).join(', ') ||
    (unit?.unit_label ? `Unit ${unit.unit_label}` : '') ||
    (unit?.unit_number ? `Unit ${unit.unit_number}` : '') ||
    'Property pending'
  )
}

function getDevelopmentName(transaction = {}, unit = null, development = null) {
  return (
    normalizeText(transaction.development_name) ||
    normalizeText(development?.development_name) ||
    normalizeText(development?.name) ||
    (unit?.development_id ? 'Development pending' : '')
  )
}

function getIncomingSince({ transaction = {}, assignment = {}, onboarding = {}, status = '' } = {}) {
  const transactionRow = transaction || {}
  const assignmentRow = assignment || {}
  const onboardingRow = onboarding || {}

  if (status === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp) {
    return (
      transactionRow.external_onboarding_submitted_at ||
      transactionRow.onboarding_completed_at ||
      onboardingRow.submitted_at ||
      assignmentRow.assigned_at ||
      assignmentRow.created_at ||
      transactionRow.created_at ||
      null
    )
  }

  if (status === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments) {
    return (
      transactionRow.last_meaningful_activity_at ||
      transactionRow.external_onboarding_submitted_at ||
      transactionRow.onboarding_completed_at ||
      onboardingRow.submitted_at ||
      assignmentRow.assigned_at ||
      assignmentRow.created_at ||
      null
    )
  }

  if (status === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance) {
    return (
      transactionRow.last_meaningful_activity_at ||
      transactionRow.updated_at ||
      transactionRow.external_onboarding_submitted_at ||
      assignmentRow.updated_at ||
      null
    )
  }

  return assignmentRow.assigned_at || assignmentRow.created_at || transactionRow.created_at || null
}

function getOtpStatus({ transaction = {}, status = '' } = {}) {
  const transactionRow = transaction || {}
  const onboardingStatus = normalizeKey(transactionRow.onboarding_status || transactionRow.onboardingStatus)
  const mainStage = String(transactionRow.current_main_stage || transactionRow.currentMainStage || '').trim().toUpperCase()

  if (onboardingStatus === 'signed_otp_received' || ['ATT', 'ATTY', 'XFER', 'REG'].includes(mainStage)) {
    return { key: 'received', label: 'Signed OTP received' }
  }

  if (status === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp) {
    return { key: 'awaiting_signature', label: 'Waiting for signed OTP' }
  }

  if (status === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance) {
    return { key: 'ready', label: 'Ready' }
  }

  return { key: 'not_ready', label: 'Not ready' }
}

function getNextAction({ transaction = {}, contract = {}, documents = {} } = {}) {
  const explicit = normalizeText(transaction.next_action)
  if (explicit) return explicit

  if (contract.status === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp) {
    return 'Wait for signed OTP before legal handoff.'
  }

  if (contract.status === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments) {
    if (documents.rejectedCount) return 'Resolve rejected document requests.'
    if (documents.openCount) return 'Follow up outstanding document requests.'
    return 'Review uploaded documents.'
  }

  if (contract.status === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance) {
    return 'Accept the transfer instruction.'
  }

  if (contract.status === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding) {
    return 'Wait for buyer onboarding submission.'
  }

  return 'Review instruction.'
}

function mapById(rows = [], idKey = 'id') {
  return (rows || []).reduce((accumulator, row) => {
    const id = row?.[idKey]
    if (id) accumulator[id] = row
    return accumulator
  }, {})
}

function groupBy(rows = [], key) {
  return (rows || []).reduce((accumulator, row) => {
    const value = row?.[key]
    if (!value) return accumulator
    if (!accumulator[value]) accumulator[value] = []
    accumulator[value].push(row)
    return accumulator
  }, {})
}

function inferAttorneyRole(row = {}) {
  const explicitRole = row.attorney_role || row.attorneyRole || ''
  if (explicitRole) return explicitRole

  const assignmentType = normalizeKey(row.assignment_type || row.assignmentType || row.matter_type || row.matterType)
  if (assignmentType === 'transfer' || assignmentType === 'transfer_and_bond') return 'transfer_attorney'
  if (assignmentType === 'bond' || assignmentType === 'bond_registration') return 'bond_attorney'
  if (assignmentType === 'cancellation' || assignmentType === 'bond_cancellation') return 'cancellation_attorney'
  return ''
}

function normalizeAssignment(row = {}) {
  const assignmentType = row.assignment_type || row.assignmentType || row.matter_type || row.matterType || ''
  const attorneyRole = inferAttorneyRole(row)
  const attorneyUserId = row.attorney_user_id || row.primary_attorney_id || row.assigned_user_id || null
  return {
    ...row,
    assignmentType,
    assignment_type: assignmentType,
    attorneyRole,
    attorney_role: attorneyRole,
    instructionStatus: row.instruction_status || '',
    instruction_status: row.instruction_status || '',
    assignmentStatus: row.assignment_status || row.status || '',
    assignment_status: row.assignment_status || row.status || '',
    primaryAttorneyId: row.primary_attorney_id || attorneyUserId,
    primary_attorney_id: row.primary_attorney_id || attorneyUserId,
    attorneyUserId,
    attorney_user_id: attorneyUserId,
  }
}

function buildDocumentSummary(documentRequests = []) {
  const openRequests = getOpenAttorneyDocumentRequests(documentRequests)
  const reviewRequests = getAttorneyDocumentRequestsInReview(documentRequests)
  const rejectedRequests = documentRequests.filter((request) => normalizeKey(request.status) === 'rejected')
  return {
    totalCount: documentRequests.length,
    openCount: openRequests.length,
    reviewCount: reviewRequests.length,
    rejectedCount: rejectedRequests.length,
    openRequests,
    reviewRequests,
    missingLabels: openRequests.map((request) => request.title || request.document_type || request.category || 'Document'),
  }
}

function buildSearchText(row = {}) {
  return [
    row.reference,
    row.buyerName,
    row.sellerName,
    row.property,
    row.development,
    row.unit,
    row.statusLabel,
    row.nextAction,
    row.assignedAttorney?.name,
    row.agent,
    row.otpStatus?.label,
    ...(row.waitingOnLabels || []),
  ].map((value) => normalizeKey(value)).join(' ')
}

function buildIncomingMatterRow({ assignment, transaction, onboarding, documentRequests, buyer, unit, development, profilesById }) {
  const normalizedAssignment = normalizeAssignment(assignment)
  const contract = buildAttorneyIncomingMatterContract({
    assignment: normalizedAssignment,
    transaction,
    onboarding,
    documentRequests,
  })
  const primaryAttorneyId = normalizedAssignment.primary_attorney_id || normalizedAssignment.attorney_user_id || null
  const primaryProfile = profilesById[primaryAttorneyId] || null
  const secretaryProfile = profilesById[normalizedAssignment.secretary_id] || null
  const adminProfile = profilesById[normalizedAssignment.admin_handler_id] || null
  const documentSummary = buildDocumentSummary(documentRequests)
  const incomingSince = getIncomingSince({ transaction, assignment: normalizedAssignment, onboarding, status: contract.status })
  const assignedAttorneyName = getPersonName(primaryProfile, normalizedAssignment.attorney_firm_name || 'Unassigned')
  const waitingOnLabels = contract.waitingOn.map((item) => WAITING_ON_LABELS[item] || item)
  const row = {
    id: normalizedAssignment.id,
    assignmentId: normalizedAssignment.id,
    transactionId: transaction.id,
    matterId: transaction.id,
    reference: getMatterReference(transaction, transaction.id),
    matterType: normalizedAssignment.assignment_type === 'transfer_and_bond' ? 'Transfer + Bond' : 'Transfer',
    status: contract.status,
    statusLabel: contract.label,
    waitingOn: contract.waitingOn,
    waitingOnLabels,
    incomingSince,
    incomingAgeDays: daysSince(incomingSince),
    buyerName: buyer?.name || buyer?.email || 'Buyer pending',
    buyerEmail: buyer?.email || '',
    sellerName: transaction.seller_name || transaction.seller_email || 'Seller pending',
    property: getPropertyLabel(transaction, unit),
    development: getDevelopmentName(transaction, unit, development),
    unit: unit?.unit_label || unit?.unit_number || '',
    phase: unit?.phase || unit?.block || '',
    purchasePrice: safeNumber(transaction.purchase_price || transaction.sales_price),
    financeType: transaction.finance_type || '',
    onboardingStatus: transaction.onboarding_status || onboarding?.status || '',
    onboardingSubmittedAt: transaction.external_onboarding_submitted_at || transaction.onboarding_completed_at || onboarding?.submitted_at || null,
    otpStatus: getOtpStatus({ transaction, status: contract.status }),
    documents: documentSummary,
    nextAction: getNextAction({ transaction, contract, documents: documentSummary }),
    assignedAttorney: {
      id: primaryAttorneyId || '',
      name: assignedAttorneyName,
      initials: getInitials(assignedAttorneyName),
      email: primaryProfile?.email || '',
    },
    assignedSecretary: {
      id: normalizedAssignment.secretary_id || '',
      name: getPersonName(secretaryProfile, ''),
      initials: getInitials(getPersonName(secretaryProfile, '')),
      email: secretaryProfile?.email || '',
    },
    assignedAdminHandler: {
      id: normalizedAssignment.admin_handler_id || '',
      name: getPersonName(adminProfile, ''),
      initials: getInitials(getPersonName(adminProfile, '')),
      email: adminProfile?.email || '',
    },
    agent: transaction.assigned_agent || transaction.assigned_agent_email || '',
    actionHref: `/transactions/${transaction.id}`,
    contract,
    raw: {
      assignment: normalizedAssignment,
      transaction,
      onboarding,
      documentRequests,
      buyer,
      unit,
      development,
    },
  }
  row.searchText = buildSearchText(row)
  return row
}

function sortRows(rows = []) {
  return [...rows].sort((left, right) => {
    const statusDiff = (STATUS_SORT_RANK[left.status] ?? 99) - (STATUS_SORT_RANK[right.status] ?? 99)
    if (statusDiff !== 0) return statusDiff

    const leftAge = left.incomingAgeDays ?? -1
    const rightAge = right.incomingAgeDays ?? -1
    if (leftAge !== rightAge) return rightAge - leftAge

    return String(left.reference || '').localeCompare(String(right.reference || ''))
  })
}

function filterRows(rows = [], { includePreIncoming = false, includeClosed = false, search = '' } = {}) {
  const searchTerm = normalizeKey(search)
  return rows.filter((row) => {
    if (!includePreIncoming && row.contract.visibleInPreIncoming) return false
    if (!includeClosed && isAttorneyInstructionClosedStatus(row.status)) return false
    if (!row.contract.visibleInIncomingQueue && !includePreIncoming && !includeClosed) return false
    if (searchTerm && !row.searchText.includes(searchTerm)) return false
    return true
  })
}

function paginateRows(rows = [], { page = 1, pageSize = 20 } = {}) {
  const resolvedPageSize = ATTORNEY_INCOMING_MATTER_PAGE_SIZES.includes(Number(pageSize)) ? Number(pageSize) : 20
  const resolvedPage = Math.max(1, Number(page || 1))
  const start = (resolvedPage - 1) * resolvedPageSize
  const tableRows = rows.slice(start, start + resolvedPageSize)
  return {
    tableRows,
    pagination: {
      page: resolvedPage,
      pageSize: resolvedPageSize,
      totalRows: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / resolvedPageSize)),
      showingFrom: rows.length ? start + 1 : 0,
      showingTo: Math.min(start + resolvedPageSize, rows.length),
    },
  }
}

function buildSummary(rows = [], allRows = []) {
  const oldestIncomingDays = rows.reduce((max, row) => Math.max(max, row.incomingAgeDays || 0), 0)
  return {
    totalIncoming: rows.length,
    allTransferInstructions: allRows.length,
    awaitingSignedOtp: rows.filter((row) => row.status === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp).length,
    awaitingDocuments: rows.filter((row) => row.status === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments).length,
    readyForAcceptance: rows.filter((row) => row.status === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance).length,
    documentBlockers: rows.filter((row) => row.documents.openCount || row.documents.reviewCount).length,
    oldestIncomingDays,
  }
}

export function buildAttorneyIncomingMatterQueueFromSources({
  firm = null,
  currentUser = null,
  assignments = [],
  transactions = [],
  onboardingRows = [],
  documentRequests = [],
  buyers = [],
  units = [],
  developments = [],
  profiles = [],
} = {}, options = {}) {
  const transactionsById = mapById(transactions)
  const onboardingByTransactionId = groupBy(onboardingRows, 'transaction_id')
  const documentRequestsByTransactionId = groupBy(documentRequests, 'transaction_id')
  const buyersById = mapById(buyers)
  const unitsById = mapById(units)
  const developmentsById = mapById(developments)
  const profilesById = mapById(profiles)

  const allRows = (assignments || [])
    .map(normalizeAssignment)
    .filter((assignment) => isTransferAttorneyAssignment(assignment))
    .map((assignment) => {
      const transaction = transactionsById[assignment.transaction_id]
      if (!transaction || transaction.is_active === false) return null
      const unit = unitsById[transaction.unit_id] || null
      const development = developmentsById[transaction.development_id || unit?.development_id] || null
      const onboarding = (onboardingByTransactionId[transaction.id] || [])
        .sort((left, right) => new Date(right.submitted_at || right.updated_at || 0) - new Date(left.submitted_at || left.updated_at || 0))[0] || null
      return buildIncomingMatterRow({
        assignment,
        transaction,
        onboarding,
        documentRequests: documentRequestsByTransactionId[transaction.id] || [],
        buyer: buyersById[transaction.buyer_id] || null,
        unit,
        development,
        profilesById,
      })
    })
    .filter(Boolean)

  const filteredRows = sortRows(filterRows(allRows, options))
  const { tableRows, pagination } = paginateRows(filteredRows, options)

  return {
    firm,
    currentUser,
    summary: buildSummary(filteredRows, allRows),
    rows: tableRows,
    tableRows,
    filteredRows,
    allRows,
    pagination,
    pageSizeOptions: ATTORNEY_INCOMING_MATTER_PAGE_SIZES,
  }
}

async function selectWithMissingColumnFallback(client, table, columns, applyQuery, { allowMissingTable = true, allowPermissionDenied = true } = {}) {
  let activeColumns = [...columns]
  let lastError = null

  for (let attempt = 0; attempt <= columns.length; attempt += 1) {
    const baseQuery = client.from(table).select(activeColumns.join(', '))
    const query = applyQuery ? applyQuery(baseQuery) : baseQuery
    const result = await query
    if (!result.error) return result.data || []

    if (allowMissingTable && isMissingTableError(result.error, table)) return []
    if (allowPermissionDenied && isPermissionDeniedError(result.error)) return []

    const missingColumn = activeColumns.find((column) => errorMentionsColumn(result.error, column))
    if (!missingColumn) throw result.error
    lastError = result.error
    activeColumns = activeColumns.filter((column) => column !== missingColumn)
    if (!activeColumns.length) break
  }

  if (lastError) throw lastError
  return []
}

function errorMentionsColumn(error, column = '') {
  if (!column || !isMissingColumnError(error, column)) return false
  const normalizedColumn = String(column).toLowerCase()
  const text = ` ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''} `.toLowerCase()
  return (
    text.includes(`'${normalizedColumn}'`) ||
    text.includes(`"${normalizedColumn}"`) ||
    text.includes(`.${normalizedColumn}`) ||
    text.includes(` ${normalizedColumn} `) ||
    text.includes(`column ${normalizedColumn}`)
  )
}

function errorMentionsAnyColumn(error, columns = []) {
  return columns.filter(Boolean).some((column) => errorMentionsColumn(error, column))
}

function applyAssignmentQuery(query, { firmId, userId, canViewAll, statusColumn = 'assignment_status', orderColumn = 'updated_at' }) {
  let nextQuery = query.eq('attorney_firm_id', firmId)
  if (!canViewAll) {
    nextQuery = nextQuery.or(`attorney_user_id.eq.${userId},primary_attorney_id.eq.${userId},secretary_id.eq.${userId},admin_handler_id.eq.${userId},assigned_user_id.eq.${userId}`)
  }
  if (statusColumn) nextQuery = nextQuery.neq(statusColumn, 'removed')
  if (orderColumn) nextQuery = nextQuery.order(orderColumn, { ascending: false })
  return nextQuery
}

async function fetchAssignments(client, { firmId, userId, canViewAll }) {
  const attempts = [
    { statusColumn: 'assignment_status', orderColumn: 'updated_at' },
    { statusColumn: 'status', orderColumn: 'updated_at' },
    { statusColumn: null, orderColumn: 'updated_at' },
    { statusColumn: 'assignment_status', orderColumn: 'created_at' },
    { statusColumn: 'status', orderColumn: 'created_at' },
    { statusColumn: null, orderColumn: 'created_at' },
    { statusColumn: null, orderColumn: null },
  ]
  let lastMissingColumnError = null

  for (const attempt of attempts) {
    try {
      return await selectWithMissingColumnFallback(
        client,
        'transaction_attorney_assignments',
        ASSIGNMENT_COLUMNS,
        (query) => applyAssignmentQuery(query, { firmId, userId, canViewAll, ...attempt }),
      )
    } catch (error) {
      if (errorMentionsAnyColumn(error, [attempt.statusColumn, attempt.orderColumn])) {
        lastMissingColumnError = error
        continue
      }
      throw error
    }
  }

  if (lastMissingColumnError) throw lastMissingColumnError
  return []
}

async function fetchRowsByIds(client, table, columns, ids, column = 'id') {
  const resolvedIds = unique(ids)
  if (!resolvedIds.length) return []
  return selectWithMissingColumnFallback(client, table, columns, (query) => query.in(column, resolvedIds))
}

async function fetchDocumentRequests(client, transactionIds = []) {
  const ids = unique(transactionIds)
  if (!ids.length) return []
  return selectWithMissingColumnFallback(
    client,
    'document_requests',
    DOCUMENT_REQUEST_COLUMNS,
    (query) => query.in('transaction_id', ids).order('created_at', { ascending: false }),
  )
}

async function fetchOnboardingRows(client, transactionIds = []) {
  const ids = unique(transactionIds)
  if (!ids.length) return []
  return selectWithMissingColumnFallback(
    client,
    'transaction_onboarding',
    ONBOARDING_COLUMNS,
    (query) => query.in('transaction_id', ids).order('updated_at', { ascending: false }),
  )
}

function mapCurrentUser(authUser = {}, membership = null, permissions = {}) {
  return {
    id: authUser.id || '',
    email: authUser.email || '',
    role: membership?.role || authUser.user_metadata?.attorney_role || 'candidate_attorney',
    permissions,
  }
}

export async function getAttorneyIncomingMatterQueue(options = {}) {
  const client = options.client || requireClient()
  const authUser = options.authUser || await getAuthenticatedUser(client)
  const currentUserId = options.userId || authUser.id
  const firm = options.firm || (options.firmId ? await getAttorneyFirmById(options.firmId) : await getCurrentUserPrimaryAttorneyFirm())

  if (!firm?.id) {
    return buildAttorneyIncomingMatterQueueFromSources({}, options)
  }

  const membership = options.membership || await getCurrentUserAttorneyMembership(firm.id, currentUserId).catch(() => null)
  const role = membership?.role || authUser.user_metadata?.attorney_role || 'candidate_attorney'
  const permissions = getAttorneyRolePermissions(role)
  const canViewAll = Boolean(permissions.can_view_all_firm_matters || MANAGEMENT_ROLES.has(role))

  const assignments = await fetchAssignments(client, {
    firmId: firm.id,
    userId: currentUserId,
    canViewAll,
  })
  const transferAssignments = assignments.map(normalizeAssignment).filter(isTransferAttorneyAssignment)
  const transactionIds = unique(transferAssignments.map((assignment) => assignment.transaction_id))
  const transactions = await fetchRowsByIds(client, 'transactions', TRANSACTION_COLUMNS, transactionIds)
  const [onboardingRows, documentRequests] = await Promise.all([
    fetchOnboardingRows(client, transactionIds),
    fetchDocumentRequests(client, transactionIds),
  ])

  const buyerIds = unique(transactions.map((transaction) => transaction.buyer_id))
  const unitIds = unique(transactions.map((transaction) => transaction.unit_id))
  const units = await fetchRowsByIds(client, 'units', UNIT_COLUMNS, unitIds)
  const developmentIds = unique([
    ...transactions.map((transaction) => transaction.development_id),
    ...units.map((unit) => unit.development_id),
  ])
  const profileIds = unique(transferAssignments.flatMap((assignment) => [
    assignment.primary_attorney_id,
    assignment.attorney_user_id,
    assignment.secretary_id,
    assignment.admin_handler_id,
    assignment.assigned_user_id,
  ]))

  const [buyers, developments, profiles] = await Promise.all([
    fetchRowsByIds(client, 'buyers', BUYER_COLUMNS, buyerIds),
    fetchRowsByIds(client, 'developments', DEVELOPMENT_COLUMNS, developmentIds),
    fetchRowsByIds(client, 'profiles', PROFILE_COLUMNS, profileIds),
  ])

  return buildAttorneyIncomingMatterQueueFromSources({
    firm,
    currentUser: mapCurrentUser(authUser, membership, permissions),
    assignments: transferAssignments,
    transactions,
    onboardingRows,
    documentRequests,
    buyers,
    units,
    developments,
    profiles,
  }, options)
}

export const __attorneyIncomingMatterQueueTestUtils = Object.freeze({
  errorMentionsColumn,
  buildAttorneyIncomingMatterQueueFromSources,
  buildDocumentSummary,
  getIncomingSince,
  getOtpStatus,
  normalizeAssignment,
  sortRows,
})
