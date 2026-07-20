import {
  attorneyRoleHasPermission,
  getCurrentUserAttorneyMembership,
} from '../lib/attorneyPermissions'
import { getFirmAttorneyAssignments } from './transactionAttorneyAssignments'
import {
  getAttorneyFirmById,
  getAttorneyFirmDepartments,
  getCurrentUserPrimaryAttorneyFirm,
} from './attorneyFirms'
import { getAttorneyFirmInvitations } from './attorneyFirmInvitations'
import { getAttorneyFirmMembers } from './attorneyFirmMembers'
import {
  getAuthenticatedUser,
  isMissingColumnError,
  isMissingTableError,
  requireClient,
} from './attorneyFirmServiceShared'
import {
  deriveActiveAttorneyMatterModules,
  isAttorneyMatterModuleEnabled,
} from './attorneyMatterModules'

function toLower(value) {
  return String(value || '').trim().toLowerCase()
}

function isTruthy(value) {
  return value !== null && value !== undefined && value !== ''
}

function getMatterReference(transaction = {}, fallbackId = '') {
  return (
    String(transaction.matter_number || '').trim() ||
    String(transaction.transaction_reference || '').trim() ||
    `MAT-${String(fallbackId || transaction.id || '').slice(0, 8).toUpperCase()}`
  )
}

function startOfWeek(date = new Date()) {
  const cloned = new Date(date)
  const day = cloned.getDay()
  const diff = day === 0 ? -6 : 1 - day
  cloned.setDate(cloned.getDate() + diff)
  cloned.setHours(0, 0, 0, 0)
  return cloned
}

function startOfMonth(date = new Date()) {
  const cloned = new Date(date)
  cloned.setDate(1)
  cloned.setHours(0, 0, 0, 0)
  return cloned
}

function endOfDay(date = new Date()) {
  const cloned = new Date(date)
  cloned.setHours(23, 59, 59, 999)
  return cloned
}

function addDays(date = new Date(), days = 0) {
  const cloned = new Date(date)
  cloned.setDate(cloned.getDate() + Number(days || 0))
  return cloned
}

function isAfter(value, thresholdDate) {
  const timestamp = new Date(value || '').getTime()
  if (!Number.isFinite(timestamp)) return false
  return timestamp >= thresholdDate.getTime()
}

function isBetweenDates(value, startDate, endDate) {
  const timestamp = new Date(value || '').getTime()
  if (!Number.isFinite(timestamp)) return false
  return timestamp >= startDate.getTime() && timestamp <= endDate.getTime()
}

function resolveMatterTypeFromTransaction(transaction = {}) {
  const finance = toLower(transaction.finance_type)
  if (finance.includes('bond') || finance.includes('hybrid') || finance.includes('combination')) {
    return 'bond'
  }
  return 'transfer'
}

function resolveMatterTypeFromAssignment(assignment = {}, transaction = {}) {
  const assignmentType = toLower(assignment.assignmentType || assignment.assignment_type)
  if (assignmentType === 'bond') return 'bond'
  if (assignmentType === 'transfer') return 'transfer'
  if (assignmentType === 'transfer_and_bond') {
    const txType = resolveMatterTypeFromTransaction(transaction)
    return txType === 'bond' ? 'bond' : 'transfer'
  }
  return resolveMatterTypeFromTransaction(transaction)
}

function resolveMatterIssueFlags(transaction = {}) {
  const stage = toLower(transaction.stage)
  const mainStage = toLower(transaction.current_main_stage)
  const subStage = toLower(transaction.current_sub_stage_summary)
  const onboarding = toLower(transaction.onboarding_status)
  const nextAction = toLower(transaction.next_action)
  const riskStatus = toLower(transaction.risk_status)
  const operationalState = toLower(transaction.operational_state)
  const attorneyStage = toLower(transaction.attorney_stage)

  const delayedKeywords = ['delayed', 'blocked', 'stalled', 'overdue', 'at risk']
  const isDelayedByStatus =
    delayedKeywords.some((keyword) => stage.includes(keyword) || mainStage.includes(keyword) || subStage.includes(keyword)) ||
    riskStatus.includes('delayed') ||
    riskStatus.includes('blocked') ||
    operationalState.includes('blocked') ||
    operationalState.includes('at_risk')

  const awaitingFica =
    onboarding.includes('awaiting_client_onboarding') ||
    onboarding.includes('awaiting_supporting_documents') ||
    attorneyStage === 'fica_onboarding' ||
    nextAction.includes('fica')

  const awaitingSignatures =
    stage.includes('awaiting_signed_otp') ||
    mainStage.includes('otp') ||
    attorneyStage === 'signing' ||
    nextAction.includes('sign') ||
    nextAction.includes('awaiting signature')

  const awaitingGuarantees = attorneyStage === 'guarantees' || nextAction.includes('guarantee') || stage.includes('guarantee')
  const awaitingLodgement = attorneyStage === 'lodgement' || nextAction.includes('lodgement') || stage.includes('lodgement')

  return {
    delayed: isDelayedByStatus,
    awaitingFica,
    awaitingSignatures,
    awaitingGuarantees,
    awaitingLodgement,
  }
}

function resolveAttentionIssue(flags = {}) {
  if (flags.delayed) return 'Delayed matter'
  if (flags.awaitingFica) return 'Awaiting FICA'
  if (flags.awaitingSignatures) return 'Awaiting signatures'
  if (flags.awaitingGuarantees) return 'Awaiting guarantees'
  if (flags.awaitingLodgement) return 'Awaiting lodgement'
  return ''
}

async function fetchTransactionsForDashboard(client) {
  const primarySelect =
    'id, organisation_id, buyer_id, matter_number, transaction_reference, title, stage, current_main_stage, current_sub_stage_summary, attorney, assigned_attorney_email, finance_type, onboarding_status, next_action, risk_status, operational_state, attorney_stage, updated_at, created_at, property_description, property_address_line_1, property_address_line_2, suburb, city, province, seller_name, seller_email, seller_has_existing_bond, current_bond_bank, purchase_price, sales_price, bond_amount, deposit_amount, expected_transfer_date, target_registration_date, registration_date, registered_at, lifecycle_state, last_meaningful_activity_at, originating_partner_organisation_id, referral_source_organisation_id, partner_relationship_id'

  let query = await client
    .from('transactions')
    .select(primarySelect)
    .eq('is_active', true)

  if (
    query.error &&
    (isMissingColumnError(query.error, 'current_main_stage') ||
      isMissingColumnError(query.error, 'matter_number') ||
      isMissingColumnError(query.error, 'transaction_reference') ||
      isMissingColumnError(query.error, 'assigned_attorney_email') ||
      isMissingColumnError(query.error, 'onboarding_status') ||
      isMissingColumnError(query.error, 'operational_state') ||
      isMissingColumnError(query.error, 'attorney_stage') ||
      isMissingColumnError(query.error, 'property_description') ||
      isMissingColumnError(query.error, 'current_bond_bank') ||
      isMissingColumnError(query.error, 'purchase_price') ||
      isMissingColumnError(query.error, 'target_registration_date') ||
      isMissingColumnError(query.error, 'last_meaningful_activity_at') ||
      isMissingColumnError(query.error, 'originating_partner_organisation_id') ||
      isMissingColumnError(query.error, 'referral_source_organisation_id') ||
      isMissingColumnError(query.error, 'partner_relationship_id') ||
      isMissingColumnError(query.error, 'is_active'))
  ) {
    query = await client
      .from('transactions')
      .select('id, buyer_id, transaction_reference, stage, attorney, assigned_attorney_email, finance_type, next_action, updated_at, created_at')
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'transactions')) {
      return []
    }
    throw query.error
  }

  return query.data || []
}

async function fetchBuyerMap(client, buyerIds = []) {
  const ids = [...new Set((buyerIds || []).filter(Boolean))]
  if (!ids.length) {
    return {}
  }

  const query = await client
    .from('buyers')
    .select('id, name, email')
    .in('id', ids)

  if (query.error) {
    if (isMissingTableError(query.error, 'buyers')) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})
}

async function fetchOrganisationNameMap(client, organisationIds = []) {
  const ids = [...new Set((organisationIds || []).filter(Boolean))]
  if (!ids.length) {
    return {}
  }

  const query = await client
    .from('organisations')
    .select('id, name, display_name')
    .in('id', ids)

  if (query.error) {
    if (isMissingTableError(query.error, 'organisations')) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    accumulator[row.id] = String(row.display_name || row.name || '').trim()
    return accumulator
  }, {})
}

async function fetchTodayAppointments(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return []

  let query = await client
    .from('appointments')
    .select('appointment_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, status')
    .in('transaction_id', ids)

  if (query.error) {
    if (isMissingTableError(query.error, 'appointments')) return []
    throw query.error
  }

  return (query.data || []).filter((appointment) => {
    const value = appointment.date_time || (appointment.appointment_date ? `${appointment.appointment_date}T${appointment.start_time || '00:00:00'}` : '')
    const timestamp = new Date(value).getTime()
    if (!Number.isFinite(timestamp)) return false
    const date = new Date(timestamp)
    const today = new Date()
    return date.toDateString() === today.toDateString()
  })
}

function formatAppointmentType(value = '') {
  const normalized = String(value || '').trim().replace(/[_-]+/g, ' ')
  if (!normalized) return 'Appointment'
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getAppointmentDateTime(appointment = {}) {
  if (appointment.date_time) return appointment.date_time
  if (appointment.appointment_date && appointment.start_time) return `${appointment.appointment_date}T${appointment.start_time}`
  if (appointment.appointment_date) return `${appointment.appointment_date}T00:00:00`
  return ''
}

function getAppointmentDuration(appointment = {}) {
  if (!appointment.start_time || !appointment.end_time) return ''
  const start = new Date(`2000-01-01T${appointment.start_time}`).getTime()
  const end = new Date(`2000-01-01T${appointment.end_time}`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return ''
  return `${Math.round((end - start) / 60000)} min`
}

async function fetchMemberProfilesMap(client, members = []) {
  const userIds = [...new Set((members || []).map((member) => member.userId).filter(Boolean))]
  if (!userIds.length) {
    return {}
  }

  const query = await client
    .from('profiles')
    .select('id, full_name, first_name, last_name, email')
    .in('id', userIds)

  if (query.error) {
    if (isMissingTableError(query.error, 'profiles')) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    const fullName = String(row.full_name || '').trim() || [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
    accumulator[row.id] = {
      id: row.id,
      fullName: fullName || 'Team Member',
      email: String(row.email || '').trim().toLowerCase() || '',
    }
    return accumulator
  }, {})
}

function resolveMemberStatusFromWorkload({ assignedMatters, delayedMatters }) {
  if (delayedMatters > 0) return 'Needs Attention'
  if (assignedMatters >= 13) return 'Overloaded'
  if (assignedMatters >= 6) return 'Busy'
  return 'Normal'
}

function normalizeAssignmentStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['pending', 'active', 'paused', 'completed', 'removed'].includes(normalized)) {
    return normalized
  }
  return 'active'
}

function isOperationalAssignmentStatus(status) {
  return ['pending', 'active', 'paused'].includes(normalizeAssignmentStatus(status))
}

function getMatterRolesFromUnit(matter = {}) {
  const roles = new Set()
  const assignmentType = toLower(matter.assignmentType)
  const attorneyRole = toLower(matter.attorneyRole)
  const matterType = toLower(matter.matterType)

  if (assignmentType === 'transfer' || assignmentType === 'transfer_and_bond' || attorneyRole === 'transfer_attorney' || matterType === 'transfer') {
    roles.add('transfer')
  }
  if (assignmentType === 'bond' || assignmentType === 'transfer_and_bond' || attorneyRole === 'bond_attorney' || matterType === 'bond') {
    roles.add('bond')
  }
  if (assignmentType === 'cancellation' || attorneyRole === 'cancellation_attorney' || matterType === 'cancellation') {
    roles.add('cancellation')
  }
  if (!roles.size) {
    roles.add('transfer')
  }

  return roles
}

function buildMatterRoleSummaries(matterUnits = []) {
  const byTransactionId = new Map()

  matterUnits.forEach((matter) => {
    const transactionId = matter.transactionId
    if (!transactionId) return
    if (!byTransactionId.has(transactionId)) {
      byTransactionId.set(transactionId, {
        transactionId,
        roles: new Set(),
        units: [],
        delayed: false,
        hasAttention: false,
        transaction: matter.transaction || null,
      })
    }

    const summary = byTransactionId.get(transactionId)
    getMatterRolesFromUnit(matter).forEach((role) => summary.roles.add(role))
    summary.units.push(matter)
    summary.delayed = summary.delayed || Boolean(matter.flags?.delayed)
    summary.hasAttention = summary.hasAttention || Boolean(matter.issue)
  })

  return [...byTransactionId.values()].map((summary) => ({
    ...summary,
    roleList: [...summary.roles],
    isShared: summary.roles.size > 1,
    isFullService: summary.roles.has('transfer') && summary.roles.has('bond') && summary.roles.has('cancellation'),
  }))
}

function matterMatchesRoleView(summary, roleView = 'all') {
  const normalized = toLower(roleView || 'all').replace(/_/g, '-')
  if (normalized === 'transfer') return summary.roles.has('transfer')
  if (normalized === 'bond') return summary.roles.has('bond')
  if (normalized === 'cancellation') return summary.roles.has('cancellation')
  // TODO: once cross-firm participant rows are exposed to this service, shared matters should include matters with multiple firms, not only multi-role matters for this firm.
  if (normalized === 'shared') return summary.isShared
  if (normalized === 'full-service') return summary.isFullService
  return true
}

function resolvePipelineStage(transaction = {}) {
  const haystack = [
    transaction.stage,
    transaction.current_main_stage,
    transaction.current_sub_stage_summary,
    transaction.attorney_stage,
    transaction.next_action,
  ].map(toLower).join(' ')

  if (haystack.includes('registered') || haystack.includes('registration')) return 'registration'
  if (haystack.includes('lodg')) return 'lodgement'
  if (haystack.includes('guarantee')) return 'guarantees'
  if (haystack.includes('sign') || haystack.includes('otp')) return 'signing'
  if (haystack.includes('draft')) return 'drafting'
  if (haystack.includes('fica') || haystack.includes('document')) return 'fica'
  return 'instruction'
}

export function getAttorneyMatterStats({ kpis = {}, matterRoleSummaries = [] } = {}) {
  const roleCounts = getMattersByLegalRole({ matterRoleSummaries })
  return {
    activeMatters: Number(kpis.activeMatters || 0),
    newThisWeek: Number(kpis.newThisWeek || 0),
    lodgementsPending: Number(kpis.lodgementsPending || 0),
    lodgementsToday: Number(kpis.lodgementsToday || 0),
    registrationsThisWeek: Number(kpis.registrationsThisWeek || 0),
    registeredThisMonth: Number(kpis.registeredThisMonth || 0),
    delayedMatters: Number(kpis.delayedMatters || 0),
    awaitingFica: Number(kpis.awaitingFica || 0),
    awaitingSignatures: Number(kpis.awaitingSignatures || 0),
    awaitingGuarantees: Number(kpis.awaitingGuarantees || 0),
    documentRequestsOutstanding: Number(kpis.documentRequestsOutstanding || 0),
    revenuePipelineValue: Number(kpis.revenuePipelineValue || 0),
    averageTransferTimeDays: Number(kpis.averageTransferTimeDays || 0),
    bondMatters: roleCounts.bondOnly + roleCounts.dualRole + roleCounts.allThreeRoles,
    cancellationMatters: roleCounts.cancellationOnly + roleCounts.allThreeRoles,
  }
}

export function getMattersByLegalRole({ matterRoleSummaries = [] } = {}) {
  return matterRoleSummaries.reduce(
    (accumulator, summary) => {
      const roles = summary.roles || new Set(summary.roleList || [])
      const count = roles.size
      if (roles.has('transfer') && count === 1) accumulator.transferOnly += 1
      else if (roles.has('bond') && count === 1) accumulator.bondOnly += 1
      else if (roles.has('cancellation') && count === 1) accumulator.cancellationOnly += 1
      else if (roles.has('transfer') && roles.has('bond') && roles.has('cancellation')) accumulator.allThreeRoles += 1
      else if (count > 1) accumulator.dualRole += 1
      return accumulator
    },
    { transferOnly: 0, bondOnly: 0, cancellationOnly: 0, dualRole: 0, allThreeRoles: 0 },
  )
}

export function getCriticalAlerts({ uniqueMatters = [], kpis = {} } = {}) {
  const lodgedTomorrow = 0 // TODO: connect to matter/lodgement due-date fields when they are available.
  const stalledBondApproval = uniqueMatters.filter((matter) => matter.matterType === 'bond' && matter.flags?.delayed).length
  return [
    { key: 'guarantees', label: 'Matters awaiting guarantees', count: Number(kpis.awaitingGuarantees || 0), tone: 'red' },
    { key: 'fica', label: 'FICA documents overdue', count: Number(kpis.awaitingFica || 0), tone: 'orange' },
    { key: 'documents', label: 'Unsent / unsigned documents', count: Number(kpis.awaitingSignatures || 0), tone: 'amber' },
    { key: 'lodgement', label: 'Lodgement deadline tomorrow', count: lodgedTomorrow, tone: 'purple' },
    { key: 'bond', label: 'Stalled bond approval', count: stalledBondApproval, tone: 'red' },
  ]
}

export function getDepartmentOverview({ departments = [] } = {}) {
  return departments.map((department) => {
    const capacity = Math.min(100, Math.round((Number(department.activeMatters || 0) / 24) * 100))
    return {
      ...department,
      capacity,
      statusTone: Number(department.delayedMatters || 0) > 0 ? 'attention' : Number(department.activeMatters || 0) > 0 ? 'active' : 'idle',
    }
  })
}

export function getStaffWorkload({ staff = [], matterUnits = [] } = {}) {
  const weekStart = startOfWeek(new Date())
  return staff.map((member) => {
    const memberUnits = matterUnits.filter((matter) =>
      [matter.primaryAttorneyId, matter.secretaryId, matter.adminHandlerId].filter(Boolean).includes(member.userId),
    )
    const lodgingThisWeek = memberUnits.filter((matter) => {
      const stage = resolvePipelineStage(matter.transaction)
      return stage === 'lodgement' && isAfter(matter.transaction?.updated_at || matter.transaction?.created_at, weekStart)
    }).length
    const capacity = Math.min(100, Math.round((Number(member.assignedMatters || 0) / 20) * 100))
    return { ...member, lodgingThisWeek, capacity }
  })
}

export function getUpcomingKeyDates({ kpis = {} } = {}) {
  return [
    { key: 'signings', label: 'Signings', helper: 'Scheduled', count: Number(kpis.awaitingSignatures || 0) },
    { key: 'lodgements', label: 'Lodgements', helper: 'Due', count: Number(kpis.lodgementsPending || 0) },
    { key: 'registrations', label: 'Registrations', helper: 'Expected', count: Number(kpis.registeredThisMonth || 0) },
    { key: 'guarantees', label: 'Guarantee', helper: 'Expiring', count: Number(kpis.awaitingGuarantees || 0) },
  ]
}

export function getRecentAttorneyActivity({ rows = [] } = {}) {
  return rows.slice(0, 6)
}

export function getFinancialSnapshot() {
  // TODO: connect this to attorney billing, collection, trust ledger, and fee allocation records once those tables are available.
  return {
    feesBilled: 0,
    feesCollected: 0,
    outstandingFees: 0,
    trustBalance: 0,
  }
}

function daysSince(value) {
  const timestamp = new Date(value || '').getTime()
  if (!Number.isFinite(timestamp)) return 0
  const delta = Date.now() - timestamp
  return Math.max(0, Math.floor(delta / 86400000))
}

function getInstructionDate(transaction = {}) {
  return transaction.instructed_at || transaction.instruction_date || transaction.created_at || transaction.updated_at || null
}

function getLastActivityDate(transaction = {}) {
  return transaction.last_meaningful_activity_at || transaction.updated_at || transaction.created_at || null
}

function getExpectedRegistrationDate(transaction = {}) {
  return transaction.target_registration_date || transaction.expected_transfer_date || transaction.registration_date || transaction.registered_at || null
}

function getMatterText(transaction = {}) {
  return [
    transaction.stage,
    transaction.current_main_stage,
    transaction.current_sub_stage_summary,
    transaction.attorney_stage,
    transaction.next_action,
    transaction.risk_status,
    transaction.operational_state,
  ].map(toLower).join(' ')
}

function isAwaitingClearance(transaction = {}) {
  const haystack = getMatterText(transaction)
  return haystack.includes('clearance') || haystack.includes('rates certificate') || haystack.includes('levy certificate')
}

function isInvoiceOutstanding(transaction = {}) {
  const haystack = getMatterText(transaction)
  return haystack.includes('invoice overdue') || haystack.includes('overdue invoice') || haystack.includes('unpaid invoice') || haystack.includes('outstanding invoice')
}

function isMatterRegistered(matter = {}) {
  const transaction = matter.transaction || {}
  const haystack = getMatterText(transaction)
  return Boolean(transaction.registered_at || transaction.registration_date || haystack.includes('registered'))
}

function isMatterStalled(matter = {}) {
  return matter.flags?.delayed || daysSince(getLastActivityDate(matter.transaction)) >= 14
}

function riskToneFromMatter(matter = {}) {
  if (matter.flags?.delayed) return 'high'
  if (matter.flags?.awaitingGuarantees || matter.flags?.awaitingFica || matter.flags?.awaitingSignatures) return 'attention'
  return 'normal'
}

function buildOperationalMatterLanes({ matterRoleSummaries = [], buyersById = {}, memberProfilesById = {} } = {}) {
  const lanes = {
    transfer: [],
    bond: [],
    cancellation: [],
  }

  matterRoleSummaries.forEach((summary) => {
    const primaryUnit = summary.units?.[0] || {}
    const transaction = summary.transaction || primaryUnit.transaction || {}
    const assignedUserId = primaryUnit.primaryAttorneyId || primaryUnit.secretaryId || primaryUnit.adminHandlerId || null
    const assignedProfile = assignedUserId ? memberProfilesById[assignedUserId] : null
    const buyer = buyersById[transaction.buyer_id] || {}
    const reference = getMatterReference(transaction, summary.transactionId || primaryUnit.transactionId)
    const currentStage = transaction.current_sub_stage_summary || transaction.current_main_stage || transaction.stage || 'Instruction'
    const sellerHasExistingBond =
      transaction.seller_has_existing_bond === true ||
      toLower(transaction.seller_has_existing_bond) === 'true' ||
      toLower(transaction.seller_existing_bond) === 'true'
    const propertyAddress =
      transaction.property_description ||
      [transaction.property_address_line_1, transaction.suburb, transaction.city].filter(Boolean).join(', ') ||
      'Property address pending'
    const buyerName = buyer.name || buyer.email || 'Client pending'
    const sellerName = transaction.seller_name || transaction.seller || 'Seller pending'
    const card = {
      id: summary.transactionId,
      reference,
      propertyAddress,
      buyerName,
      buyerSellerName: sellerName && sellerName !== 'Seller pending' ? `${buyerName} / ${sellerName}` : buyerName,
      contextLine: `${propertyAddress} - ${buyerName}`,
      sellerName,
      bank: transaction.bank || transaction.bond_bank || transaction.financing_bank || 'Bank pending',
      financeType: transaction.finance_type || 'cash',
      purchasePrice: getTransactionValue(transaction),
      sellerHasExistingBond,
      currentBondBank: transaction.current_bond_bank || transaction.bank || '',
      estimatedSettlementAmount: Number(transaction.estimated_settlement_amount || 0),
      lifecycleState: transaction.lifecycle_state || null,
      registrationDate: transaction.registration_date || transaction.registered_at || null,
      linkedReference: reference,
      currentStage,
      progress: Math.min(100, Math.max(12, Math.round(((daysSince(transaction.created_at) + 1) / 90) * 100))),
      assignedStaff: assignedProfile?.fullName || transaction.assigned_attorney_email || 'Unassigned',
      daysInStage: daysSince(transaction.updated_at || transaction.created_at),
      instructedAt: getInstructionDate(transaction),
      expectedRegistrationDate: getExpectedRegistrationDate(transaction),
      lastActivityAt: getLastActivityDate(transaction),
      lastUpdated: getLastActivityDate(transaction),
      value: getTransactionValue(transaction),
      riskTone: riskToneFromMatter(primaryUnit),
      statusLabel: primaryUnit.issue || (primaryUnit.flags?.delayed ? 'Delayed' : 'On track'),
      href: `/transactions/${encodeURIComponent(summary.transactionId)}`,
    }

    if (summary.roles.has('transfer')) lanes.transfer.push(card)
    if (summary.roles.has('bond')) lanes.bond.push(card)
    if (summary.roles.has('cancellation')) lanes.cancellation.push(card)
  })

  return lanes
}

function getTransactionValue(transaction = {}) {
  return Number(transaction.purchase_price || transaction.sales_price || transaction.bond_amount || 0) || 0
}

function getFinanceBucket(transaction = {}) {
  const financeType = toLower(transaction.finance_type)
  if (financeType.includes('hybrid') || financeType.includes('combination')) return 'Hybrid'
  if (financeType.includes('bond')) return 'Bond'
  if (financeType.includes('cash')) return 'Cash'
  return financeType ? financeType.charAt(0).toUpperCase() + financeType.slice(1) : 'Unspecified'
}

function getBankName(transaction = {}) {
  const bank = String(transaction.current_bond_bank || transaction.bank || transaction.bond_bank || transaction.financing_bank || '').trim()
  return bank || 'Bank not captured'
}

function getMatterSourceName({ transaction = {}, index = 0, isDalawyerDemo = false, organisationNamesById = {} } = {}) {
  const explicit = String(
    transaction.referring_agent_name ||
      transaction.referring_agent ||
      transaction.source_name ||
      transaction.lead_source ||
      '',
  ).trim()
  if (explicit) return explicit

  const partnerOrganisationId = transaction.originating_partner_organisation_id || transaction.referral_source_organisation_id || ''
  if (partnerOrganisationId && organisationNamesById[partnerOrganisationId]) {
    return organisationNamesById[partnerOrganisationId]
  }

  if (isDalawyerDemo) {
    const demoSources = ['Atlantic Seaboard Realty', 'Bryanston Property Co.', 'Waterfall Residential', 'Prime Bond Origination', 'Commercial Property Partners', 'Durban North Estates']
    return demoSources[index % demoSources.length]
  }

  return ''
}

function pushAggregate(map, key, value = 0) {
  if (!key) return
  if (!map.has(key)) {
    map.set(key, { label: key, count: 0, value: 0 })
  }
  const row = map.get(key)
  row.count += 1
  row.value += Number(value || 0)
}

function toLeaderboardRows(map, sortKey = 'count', limit = 5) {
  return [...map.values()]
    .sort((left, right) => Number(right[sortKey] || 0) - Number(left[sortKey] || 0))
    .slice(0, limit)
}

function buildBusinessIntelligence({ uniqueMatters = [], matterRoleSummaries = [], isDalawyerDemo = false, organisationNamesById = {} } = {}) {
  const sourceMap = new Map()
  const bankMap = new Map()
  const financeMap = new Map()
  const roleCounts = {
    Transfer: 0,
    Bond: 0,
    Cancellation: 0,
  }
  const registrationDurations = []

  matterRoleSummaries.forEach((summary) => {
    const roles = summary.roles || new Set(summary.roleList || [])
    if (roles.has('transfer')) roleCounts.Transfer += 1
    if (roles.has('bond')) roleCounts.Bond += 1
    if (roles.has('cancellation')) roleCounts.Cancellation += 1
  })

  uniqueMatters.forEach((matter, index) => {
    const transaction = matter.transaction || {}
    const value = getTransactionValue(transaction)
    const sourceName = getMatterSourceName({ transaction, index, isDalawyerDemo, organisationNamesById })
    pushAggregate(sourceMap, sourceName, value)
    pushAggregate(bankMap, getBankName(transaction), Number(transaction.bond_amount || 0) || value)
    pushAggregate(financeMap, getFinanceBucket(transaction), value)

    const registrationValue = transaction.registered_at || transaction.registration_date
    const createdValue = transaction.created_at
    const registrationTimestamp = new Date(registrationValue || '').getTime()
    const createdTimestamp = new Date(createdValue || '').getTime()
    if (Number.isFinite(registrationTimestamp) && Number.isFinite(createdTimestamp) && registrationTimestamp >= createdTimestamp) {
      registrationDurations.push(Math.round((registrationTimestamp - createdTimestamp) / 86400000))
    }
  })

  const activeMatters = uniqueMatters.length || 1
  const averageRegistrationDays = registrationDurations.length
    ? Math.round(registrationDurations.reduce((sum, value) => sum + value, 0) / registrationDurations.length)
    : 0

  return {
    sourceStatus: sourceMap.size ? 'available' : 'empty',
    topAgentsByVolume: toLeaderboardRows(sourceMap, 'count'),
    topAgentsByValue: toLeaderboardRows(sourceMap, 'value'),
    businessBreakdown: Object.entries(roleCounts).map(([label, count]) => ({
      label,
      count,
      percentage: Math.round((count / activeMatters) * 100),
    })),
    bankBreakdown: toLeaderboardRows(bankMap, 'count'),
    financeBreakdown: toLeaderboardRows(financeMap, 'count').map((row) => ({
      ...row,
      percentage: Math.round((row.count / activeMatters) * 100),
    })),
    averageRegistrationDays,
    registrationSampleSize: registrationDurations.length,
  }
}

function getOldestInactiveDays(matters = [], predicate = () => false) {
  return matters.reduce((oldest, matter) => {
    if (!predicate(matter)) return oldest
    return Math.max(oldest, daysSince(getLastActivityDate(matter.transaction)))
  }, 0)
}

function buildAttentionMetrics({ uniqueMatters = [], kpis = {} } = {}) {
  const clearanceCount = uniqueMatters.filter((matter) => isAwaitingClearance(matter.transaction)).length
  const invoiceCount = uniqueMatters.filter((matter) => isInvoiceOutstanding(matter.transaction)).length
  const stalledCount = uniqueMatters.filter((matter) => isMatterStalled(matter)).length

  return [
    {
      key: 'signatures',
      label: 'Signatures Pending',
      count: Number(kpis.awaitingSignatures || 0),
      helper: getOldestInactiveDays(uniqueMatters, (matter) => matter.flags?.awaitingSignatures)
        ? `Oldest ${getOldestInactiveDays(uniqueMatters, (matter) => matter.flags?.awaitingSignatures)} days`
        : 'Ready to chase',
      tone: 'red',
    },
    {
      key: 'guarantees',
      label: 'Guarantees Outstanding',
      count: Number(kpis.awaitingGuarantees || 0),
      helper: 'Banks waiting',
      tone: 'red',
    },
    {
      key: 'clearance',
      label: 'Clearance Certificates',
      count: clearanceCount,
      helper: clearanceCount ? 'Expiring soon' : 'No blocker',
      tone: 'amber',
    },
    {
      key: 'client-documents',
      label: 'Client Documents',
      count: Number(kpis.awaitingFica || 0),
      helper: 'Need follow-up',
      tone: 'red',
    },
    {
      key: 'invoices',
      label: 'Invoices Overdue',
      count: invoiceCount,
      helper: invoiceCount ? 'Total invoices' : 'No overdue invoices',
      tone: 'red',
    },
    {
      key: 'stalled',
      label: 'Matters Stalled',
      count: stalledCount,
      helper: 'No movement >14 days',
      tone: 'red',
    },
  ]
}

function toPercent(count = 0, total = 0) {
  if (!total) return 0
  return Math.round((Number(count || 0) / Number(total || 0)) * 100)
}

function getInitials(value = '') {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return 'PA'
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')
}

function inferPartnerType(value = '') {
  const normalized = toLower(value)
  if (normalized.includes('bond') || normalized.includes('home loan') || normalized.includes('ooba') || normalized.includes('betterbond')) return 'Bond Originator'
  if (normalized.includes('develop') || normalized.includes('properties') || normalized.includes('homes')) return 'Developer'
  if (normalized.includes('realty') || normalized.includes('estate') || normalized.includes('property') || normalized.includes('agency') || normalized.includes('exp')) return 'Agency'
  if (normalized.includes('jacobs') || normalized.includes('landman') || normalized.includes('wyk')) return 'Estate Agent'
  return 'Referral Partner'
}

export function getPartnerAnalytics({ uniqueMatters = [], isDalawyerDemo = false, organisationNamesById = {} } = {}) {
  const monthStart = startOfMonth(new Date())
  const rowsByPartner = new Map()

  uniqueMatters.forEach((matter, index) => {
    const transaction = matter.transaction || {}
    const partnerName = getMatterSourceName({ transaction, index, isDalawyerDemo, organisationNamesById })
    if (!partnerName) return

    if (!rowsByPartner.has(partnerName)) {
      rowsByPartner.set(partnerName, {
        partnerId: partnerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        partner: partnerName,
        partnerName,
        partnerType: inferPartnerType(partnerName),
        avatar: getInitials(partnerName),
        activeMatters: 0,
        newThisMonth: 0,
        revenuePipeline: 0,
        pipelineValue: 0,
        matterCount: 0,
      })
    }

    const row = rowsByPartner.get(partnerName)
    row.activeMatters += 1
    row.matterCount += 1
    row.newThisMonth += isAfter(getInstructionDate(transaction), monthStart) || (isDalawyerDemo && index < 3) ? 1 : 0
    row.pipelineValue += getTransactionValue(transaction)
    row.revenuePipeline = row.pipelineValue
  })

  const rows = [...rowsByPartner.values()]
    .sort((left, right) => Number(right.pipelineValue || 0) - Number(left.pipelineValue || 0))
    .slice(0, 6)
  const maxRevenuePipeline = rows.reduce((max, row) => Math.max(max, Number(row.pipelineValue || 0)), 0)

  return {
    status: rows.length ? 'available' : 'empty',
    rows: rows.map((row) => ({
      ...row,
      revenueShare: maxRevenuePipeline ? Math.round((Number(row.pipelineValue || 0) / maxRevenuePipeline) * 100) : 0,
    })),
  }
}

export function getConveyancingPerformance({ uniqueMatters = [], businessIntelligence = {} } = {}) {
  const now = new Date()
  const weekStart = startOfWeek(now)
  const weekEnd = endOfDay(addDays(weekStart, 6))
  const nextWeekStart = startOfWeek(addDays(now, 7))
  const nextWeekEnd = endOfDay(addDays(nextWeekStart, 6))
  const monthStart = startOfMonth(now)
  const nextMonthStart = startOfMonth(addDays(monthStart, 35))
  const monthEnd = endOfDay(addDays(nextMonthStart, -1))

  const registeredCount = uniqueMatters.filter((matter) => isMatterRegistered(matter)).length
  const delayedCount = uniqueMatters.filter((matter) => matter.flags?.delayed).length
  const completionSample = registeredCount + delayedCount
  const registrationSuccessRate = completionSample ? Math.round((registeredCount / completionSample) * 1000) / 10 : 0

  const expectedDates = uniqueMatters.map((matter) => getExpectedRegistrationDate(matter.transaction)).filter(Boolean)
  const distribution = (businessIntelligence.businessBreakdown || []).map((row) => ({
    label: row.label,
    count: Number(row.count || 0),
    percentage: Number(row.percentage || 0),
  }))

  const registrationForecast = {
    thisWeek: expectedDates.filter((date) => isBetweenDates(date, weekStart, weekEnd)).length,
    nextWeek: expectedDates.filter((date) => isBetweenDates(date, nextWeekStart, nextWeekEnd)).length,
    thisMonth: expectedDates.filter((date) => isBetweenDates(date, monthStart, monthEnd)).length,
  }

  return {
    averageDaysToRegistration: Number(businessIntelligence.averageRegistrationDays || 0),
    registrationSampleSize: Number(businessIntelligence.registrationSampleSize || 0),
    registrationSuccessRate,
    averageDocumentTurnaroundDays: 0,
    registrationForecast,
    matterDistribution: distribution,
  }
}

function withShowcaseConveyancingPerformance(performance = {}, uniqueMatters = []) {
  const total = Math.max(uniqueMatters.length, 1)
  const fallbackDistribution = [
    { label: 'Transfer', count: Math.max(2, Math.ceil(total * 0.5)), percentage: 50 },
    { label: 'Bond', count: Math.max(1, Math.ceil(total * 0.34)), percentage: 34 },
    { label: 'Cancellation', count: Math.max(1, Math.floor(total * 0.16)), percentage: 16 },
  ]
  const distribution = (performance.matterDistribution || []).some((row) => Number(row.count || 0) > 0)
    ? performance.matterDistribution
    : fallbackDistribution

  return {
    ...performance,
    averageDaysToRegistration: Number(performance.averageDaysToRegistration || 0) || 64,
    registrationSampleSize: Number(performance.registrationSampleSize || 0) || 18,
    registrationSuccessRate: Number(performance.registrationSuccessRate || 0) || 92.4,
    averageDocumentTurnaroundDays: Number(performance.averageDocumentTurnaroundDays || 0) || 2.8,
    registrationForecast: {
      thisWeek: Math.max(Number(performance.registrationForecast?.thisWeek || 0), 2),
      nextWeek: Math.max(Number(performance.registrationForecast?.nextWeek || 0), 3),
      thisMonth: Math.max(Number(performance.registrationForecast?.thisMonth || 0), 9),
    },
    matterDistribution: distribution,
  }
}

export function calculateMatterHealth({ uniqueMatters = [] } = {}) {
  const total = uniqueMatters.length
  const critical = uniqueMatters.filter((matter) => matter.flags?.delayed || daysSince(getLastActivityDate(matter.transaction)) >= 21)
  const criticalIds = new Set(critical.map((matter) => matter.transactionId))
  const attention = uniqueMatters.filter((matter) => {
    if (criticalIds.has(matter.transactionId)) return false
    return (
      matter.flags?.awaitingFica ||
      matter.flags?.awaitingSignatures ||
      matter.flags?.awaitingGuarantees ||
      matter.flags?.awaitingLodgement ||
      isAwaitingClearance(matter.transaction) ||
      isInvoiceOutstanding(matter.transaction) ||
      daysSince(getLastActivityDate(matter.transaction)) >= 14
    )
  })
  const attentionIds = new Set(attention.map((matter) => matter.transactionId))
  const onTrack = uniqueMatters.filter((matter) => !criticalIds.has(matter.transactionId) && !attentionIds.has(matter.transactionId))

  return {
    total,
    onTrack: {
      count: onTrack.length,
      percentage: toPercent(onTrack.length, total),
    },
    attention: {
      count: attention.length,
      percentage: toPercent(attention.length, total),
    },
    critical: {
      count: critical.length,
      percentage: toPercent(critical.length, total),
    },
  }
}

async function readDashboardDependency(label, promise, fallback) {
  try {
    return await promise
  } catch (error) {
    console.warn(`[Attorney Dashboard] ${label} could not be loaded; continuing with fallback data.`, error)
    return fallback
  }
}

export async function getAttorneyManagementDashboardData(firmId = null, { roleView = 'all' } = {}) {
  const client = requireClient()
  const authUser = await getAuthenticatedUser(client)

  const resolvedFirm = firmId ? await getAttorneyFirmById(firmId) : await getCurrentUserPrimaryAttorneyFirm()
  if (!resolvedFirm?.id) {
    return {
      firm: null,
      currentUserRole: null,
      canViewFirmDashboard: false,
      departments: [],
      members: [],
      kpis: {
        activeMatters: 0,
        transferMatters: 0,
        bondMatters: 0,
        lodgedThisWeek: 0,
        registeredThisMonth: 0,
        delayedMatters: 0,
        awaitingFica: 0,
        awaitingSignatures: 0,
      },
      departmentOverview: [],
      staffWorkload: [],
      mattersRequiringAttention: [],
      recentActivity: [],
    }
  }

  const currentMembership = await getCurrentUserAttorneyMembership(resolvedFirm.id, authUser.id).catch(() => null)
  const currentUserRole = currentMembership?.isActive ? currentMembership.role : null
  const canViewFirmDashboard = attorneyRoleHasPermission(currentUserRole, 'can_view_firm_dashboard')
  if (!currentMembership?.isActive || !canViewFirmDashboard) {
    return {
      firm: null,
      currentUserRole,
      canViewFirmDashboard: false,
      departments: [],
      members: [],
      kpis: {
        activeMatters: 0,
        transferMatters: 0,
        bondMatters: 0,
        lodgedThisWeek: 0,
        registeredThisMonth: 0,
        delayedMatters: 0,
        awaitingFica: 0,
        awaitingSignatures: 0,
      },
      departmentOverview: [],
      staffWorkload: [],
      mattersRequiringAttention: [],
      recentActivity: [],
    }
  }

  const [departmentsRaw, membersRaw, invitesRaw, transactionsRaw, assignmentRows] = await Promise.all([
    readDashboardDependency('departments', getAttorneyFirmDepartments(resolvedFirm.id), []),
    readDashboardDependency('members', getAttorneyFirmMembers(resolvedFirm.id), []),
    readDashboardDependency('invitations', getAttorneyFirmInvitations(resolvedFirm.id), []),
    readDashboardDependency('transactions', fetchTransactionsForDashboard(client), []),
    readDashboardDependency('assignments', getFirmAttorneyAssignments(resolvedFirm.id, { includeInactive: true }), []),
  ])

  const dashboardMembers = (membersRaw || []).some((member) => member.userId === authUser.id)
    ? membersRaw
    : [...(membersRaw || []), currentMembership]

  const matterModules = deriveActiveAttorneyMatterModules(departmentsRaw)
  const departments = departmentsRaw.filter((department) => department.isActive)
  const members = dashboardMembers.filter((member) => member.status !== 'suspended' && member.status !== 'removed')
  const activeMembers = members.filter((member) => member.status === 'active')
  const isDalawyerDemo = toLower(resolvedFirm.name).includes('dalawyer') && toLower(authUser.email) === 'info@yakstack.co'
  const isShowcaseDemo = isDalawyerDemo || toLower(authUser.email) === 'attorney.demo@arch9.co.za'

  const transactionsById = (transactionsRaw || []).reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})

  const partnerOrganisationIds = Object.values(transactionsById)
    .flatMap((transaction) => [transaction.originating_partner_organisation_id, transaction.referral_source_organisation_id])
    .filter(Boolean)

  const [memberProfilesById, buyersById, organisationNamesById] = await Promise.all([
    readDashboardDependency('member profiles', fetchMemberProfilesMap(client, members), {}),
    readDashboardDependency('buyer summaries', fetchBuyerMap(
      client,
      Object.values(transactionsById)
        .map((transaction) => transaction.buyer_id)
        .filter(Boolean),
    ), {}),
    readDashboardDependency('partner organisation names', fetchOrganisationNameMap(client, partnerOrganisationIds), {}),
  ])

  const firmNameToken = toLower(resolvedFirm.name)
  const assignments = (assignmentRows || []).filter((assignment) => assignment.firmId === resolvedFirm.id)

  let matterUnits = []
  let hasCanonicalAssignments = false

  if (assignments.length) {
    const operationalAssignments = assignments.filter((assignment) => isOperationalAssignmentStatus(assignment.status))

    matterUnits = operationalAssignments
      .map((assignment) => {
        const transaction = transactionsById[assignment.transactionId] || null
        if (!transaction) {
          return null
        }

        const flags = resolveMatterIssueFlags(transaction)
        const issue = resolveAttentionIssue(flags)
        return {
          key: assignment.id,
          transactionId: assignment.transactionId,
          assignmentId: assignment.id,
          assignmentType: assignment.assignmentType,
          assignmentStatus: normalizeAssignmentStatus(assignment.status),
          departmentId: assignment.departmentId || null,
          primaryAttorneyId: assignment.primaryAttorneyId || null,
          secretaryId: assignment.secretaryId || null,
          adminHandlerId: assignment.adminHandlerId || null,
          transaction,
          matterType: resolveMatterTypeFromAssignment(assignment, transaction),
          flags,
          issue,
        }
      })
      .filter(Boolean)

    hasCanonicalAssignments = matterUnits.length > 0
  }

  if (!hasCanonicalAssignments) {
    const memberEmailSet = new Set(
      activeMembers
        .map((member) => memberProfilesById[member.userId]?.email || '')
        .filter(Boolean),
    )

    const fallbackTransactions = (transactionsRaw || []).filter((transaction) => {
      const assignedAttorneyEmail = toLower(transaction.assigned_attorney_email)
      const attorneyName = toLower(transaction.attorney)
      if (assignedAttorneyEmail && memberEmailSet.has(assignedAttorneyEmail)) {
        return true
      }
      if (firmNameToken && attorneyName.includes(firmNameToken)) {
        return true
      }
      return false
    })

    matterUnits = fallbackTransactions.map((transaction) => {
      const flags = resolveMatterIssueFlags(transaction)
      const issue = resolveAttentionIssue(flags)
      return {
        key: transaction.id,
        transactionId: transaction.id,
        assignmentId: null,
        assignmentType: resolveMatterTypeFromTransaction(transaction),
        assignmentStatus: 'active',
        departmentId: null,
        primaryAttorneyId: null,
        secretaryId: null,
        adminHandlerId: null,
        transaction,
        matterType: resolveMatterTypeFromTransaction(transaction),
        flags,
        issue,
      }
    })
  }

  matterUnits = matterUnits.filter((matter) => isAttorneyMatterModuleEnabled(matterModules, matter.matterType))

  const allMatterRoleSummaries = buildMatterRoleSummaries(matterUnits)
  const scopedMatterRoleSummaries = allMatterRoleSummaries.filter((summary) => matterMatchesRoleView(summary, roleView))
  const scopedTransactionIds = new Set(scopedMatterRoleSummaries.map((summary) => summary.transactionId))
  if (toLower(roleView || 'all') !== 'all') {
    matterUnits = matterUnits.filter((matter) => scopedTransactionIds.has(matter.transactionId))
  }

  const weekStart = startOfWeek(new Date())
  const weekEnd = endOfDay(addDays(weekStart, 6))
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = endOfDay(new Date())
  const monthStart = startOfMonth(new Date())

  const uniqueTransactionIds = [...new Set(matterUnits.map((item) => item.transactionId).filter(Boolean))]
  const uniqueMatters = uniqueTransactionIds.map((id) => matterUnits.find((item) => item.transactionId === id)).filter(Boolean)
  const todayAppointments = await readDashboardDependency('today appointments', fetchTodayAppointments(client, uniqueTransactionIds), [])

  const transferAssignments = matterUnits.filter((item) => item.assignmentType === 'transfer' || item.assignmentType === 'transfer_and_bond')
  const bondAssignments = matterUnits.filter((item) => item.assignmentType === 'bond' || item.assignmentType === 'transfer_and_bond')

  const kpis = {
    activeMatters: uniqueMatters.length,
    newThisWeek: uniqueMatters.filter((matter) => isAfter(getInstructionDate(matter.transaction), weekStart)).length,
    transferMatters: transferAssignments.length,
    bondMatters: bondAssignments.length,
    cancellationMatters: scopedMatterRoleSummaries.filter((summary) => summary.roles.has('cancellation')).length,
    lodgementsPending: uniqueMatters.filter((matter) => resolvePipelineStage(matter.transaction) === 'lodgement').length,
    lodgementsToday: uniqueMatters.filter((matter) => (
      resolvePipelineStage(matter.transaction) === 'lodgement' &&
      isBetweenDates(matter.transaction?.updated_at || matter.transaction?.created_at, todayStart, todayEnd)
    )).length,
    lodgedThisWeek: uniqueMatters.filter((matter) => {
      const stage = toLower(matter.transaction?.stage)
      const mainStage = toLower(matter.transaction?.current_main_stage)
      const attorneyStage = toLower(matter.transaction?.attorney_stage)
      const lodged = stage.includes('lodged') || mainStage.includes('lodged') || attorneyStage === 'lodgement'
      return lodged && isAfter(matter.transaction?.updated_at || matter.transaction?.created_at, weekStart)
    }).length,
    registrationsThisWeek: uniqueMatters.filter((matter) => isBetweenDates(getExpectedRegistrationDate(matter.transaction), weekStart, weekEnd)).length,
    registeredThisMonth: uniqueMatters.filter((matter) => {
      const stage = toLower(matter.transaction?.stage)
      const mainStage = toLower(matter.transaction?.current_main_stage)
      const attorneyStage = toLower(matter.transaction?.attorney_stage)
      const registered = stage.includes('registered') || mainStage.includes('reg') || attorneyStage === 'registered'
      return registered && isAfter(matter.transaction?.updated_at || matter.transaction?.created_at, monthStart)
    }).length,
    delayedMatters: uniqueMatters.filter((matter) => matter.flags.delayed).length,
    awaitingFica: uniqueMatters.filter((matter) => matter.flags.awaitingFica).length,
    awaitingSignatures: uniqueMatters.filter((matter) => matter.flags.awaitingSignatures).length,
    awaitingGuarantees: uniqueMatters.filter((matter) => matter.flags.awaitingGuarantees).length,
    documentRequestsOutstanding: uniqueMatters.filter((matter) => matter.flags.awaitingFica || matter.flags.awaitingSignatures).length,
    revenuePipelineValue: uniqueMatters.reduce((sum, matter) => sum + getTransactionValue(matter.transaction), 0),
    averageTransferTimeDays: 0, // TODO: calculate from instruction to registration once dated attorney milestones are stored consistently.
  }

  const departmentsById = departments.reduce((accumulator, department) => {
    accumulator[department.id] = department
    return accumulator
  }, {})

  const rawDepartmentOverview = departments.map((department) => {
    const membersInDepartment = activeMembers.filter((member) => member.departmentId === department.id)
    const assignmentsForDepartment = matterUnits.filter((matter) => matter.departmentId === department.id)

    const fallbackAssignments =
      assignmentsForDepartment.length === 0
        ? matterUnits.filter((matter) => {
            const type = matter.matterType
            const departmentType = String(department.departmentType || '').toLowerCase()
            if (departmentType === 'transfer') return type === 'transfer'
            if (departmentType === 'bond') return type === 'bond'
            if (departmentType === 'cancellation') return type === 'cancellation'
            if (departmentType === 'admin') return matter.flags.awaitingFica || matter.flags.awaitingSignatures
            if (departmentType === 'management') return true
            return false
          })
        : assignmentsForDepartment

    const delayedCount = fallbackAssignments.filter((matter) => matter.flags.delayed).length

    return {
      departmentId: department.id,
      departmentName: department.name,
      departmentType: department.departmentType,
      activeMatters: fallbackAssignments.length,
      assignedStaff: membersInDepartment.length,
      delayedMatters: delayedCount,
      status: delayedCount > 0 ? 'Needs Attention' : fallbackAssignments.length > 0 ? 'Active' : 'Idle',
    }
  })

  const assignmentByUserId = matterUnits.reduce((accumulator, matter) => {
    const userIds = [matter.primaryAttorneyId, matter.secretaryId, matter.adminHandlerId].filter(Boolean)
    userIds.forEach((userId) => {
      if (!accumulator[userId]) accumulator[userId] = []
      accumulator[userId].push(matter)
    })
    return accumulator
  }, {})

  const rawStaffWorkload = members.map((member) => {
    const profile = memberProfilesById[member.userId] || null
    const assigned = assignmentByUserId[member.userId] || []
    const delayedMatters = assigned.filter((matter) => matter.flags.delayed).length

    return {
      memberId: member.id,
      userId: member.userId,
      fullName: profile?.fullName || 'Team Member',
      role: member.role,
      departmentName: departmentsById[member.departmentId]?.name || 'Unassigned',
      assignedMatters: assigned.length,
      delayedMatters,
      status: resolveMemberStatusFromWorkload({ assignedMatters: assigned.length, delayedMatters }),
    }
  })

  const mattersRequiringAttention = uniqueMatters
    .filter((matter) => matter.issue)
    .slice(0, 25)
    .map((matter) => {
      const buyerName =
        buyersById[matter.transaction?.buyer_id]?.name ||
        buyersById[matter.transaction?.buyer_id]?.email ||
        `Buyer ${matter.transaction?.buyer_id || ''}`.trim()

      const assignedUserId = matter.primaryAttorneyId || matter.secretaryId || matter.adminHandlerId || null
      const assignedProfile = assignedUserId ? memberProfilesById[assignedUserId] : null

      return {
        matterId: matter.transactionId,
        matterReference: getMatterReference(matter.transaction, matter.transactionId),
        clientName: buyerName || 'Unassigned client',
        department:
          departmentsById[matter.departmentId]?.name || (matter.matterType === 'bond' ? 'Bond Department' : 'Transfer Department'),
        currentStage:
          matter.transaction?.current_sub_stage_summary || matter.transaction?.stage || matter.transaction?.current_main_stage || 'Unknown',
        assignedUser: assignedProfile?.fullName || matter.transaction?.assigned_attorney_email || 'Unassigned',
        issue: matter.issue,
        daysInactive: daysSince(matter.transaction?.last_meaningful_activity_at || matter.transaction?.updated_at || matter.transaction?.created_at),
        lastUpdated: matter.transaction?.updated_at || matter.transaction?.created_at || null,
        actionLabel: 'Open Transaction',
        actionHref: `/transactions/${encodeURIComponent(matter.transactionId)}`,
      }
    })

  const recentActivity = [
    {
      id: `firm-created-${resolvedFirm.id}`,
      type: 'firm',
      message: 'Firm profile created.',
      occurredAt: resolvedFirm.createdAt,
    },
    ...departments.map((department) => ({
      id: `department-${department.id}`,
      type: 'department',
      message: `${department.name} is active.`,
      occurredAt: department.createdAt,
    })),
    ...members
      .filter((member) => member.joinedAt)
      .map((member) => {
        const profile = memberProfilesById[member.userId]
        return {
          id: `member-${member.id}`,
          type: 'member',
          message: `${profile?.fullName || 'Team member'} joined as ${member.role}.`,
          occurredAt: member.joinedAt,
        }
      }),
    ...invitesRaw
      .filter((invite) => invite.status === 'pending')
      .map((invite) => ({
        id: `invite-${invite.id}`,
        type: 'invite',
        message: `Invitation sent to ${invite.email} for ${invite.role}.`,
        occurredAt: invite.createdAt,
      })),
    ...matterUnits.slice(0, 8).map((matter) => ({
      id: `assignment-${matter.assignmentId || matter.transactionId}`,
      type: 'assignment',
      message: `Attorney assignment ${matter.assignmentStatus} for ${getMatterReference(matter.transaction, matter.transactionId)}.`,
      occurredAt: matter.transaction?.updated_at || matter.transaction?.created_at || null,
    })),
  ]
    .filter((entry) => isTruthy(entry.occurredAt))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 12)

  const matterPipeline = ['instruction', 'fica', 'drafting', 'signing', 'guarantees', 'lodgement', 'registration'].map((stage) => {
    const stageMatters = uniqueMatters.filter((matter) => resolvePipelineStage(matter.transaction) === stage)
    const delayed = stageMatters.filter((matter) => matter.flags.delayed).length
    return {
      key: stage,
      label: stage === 'fica' ? 'FICA' : stage.charAt(0).toUpperCase() + stage.slice(1),
      count: stageMatters.length,
      trend: stageMatters.length ? '+0%' : '—',
      status: delayed > 0 ? 'bottleneck' : stageMatters.length >= 8 ? 'attention' : 'on_track',
    }
  })

  const departmentOverview = getDepartmentOverview({ departments: rawDepartmentOverview })
  const staffWorkload = getStaffWorkload({ staff: rawStaffWorkload, matterUnits })
  const mattersByRole = getMattersByLegalRole({ matterRoleSummaries: scopedMatterRoleSummaries })
  const matterStats = getAttorneyMatterStats({ kpis, matterRoleSummaries: scopedMatterRoleSummaries })
  const criticalAlerts = getCriticalAlerts({ uniqueMatters, kpis })
  const upcomingKeyDates = getUpcomingKeyDates({ kpis })
  const todayCalendar = todayAppointments
    .map((appointment) => {
      const matter = uniqueMatters.find((item) => item.transactionId === appointment.transaction_id)
      return {
        id: appointment.appointment_id,
        dateTime: getAppointmentDateTime(appointment),
        type: formatAppointmentType(appointment.appointment_type || appointment.title),
        matterReference: getMatterReference(matter?.transaction || {}, appointment.transaction_id),
        duration: getAppointmentDuration(appointment),
        status: appointment.status || '',
      }
    })
    .sort((left, right) => new Date(left.dateTime || 0).getTime() - new Date(right.dateTime || 0).getTime())
    .slice(0, 5)
  const financialSnapshot = getFinancialSnapshot()
  const matterLanes = buildOperationalMatterLanes({
    matterRoleSummaries: scopedMatterRoleSummaries,
    buyersById,
    memberProfilesById,
  })
  const businessIntelligence = buildBusinessIntelligence({
    uniqueMatters,
    matterRoleSummaries: scopedMatterRoleSummaries,
    isDalawyerDemo: isShowcaseDemo,
    organisationNamesById,
  })
  const attentionMetrics = buildAttentionMetrics({ uniqueMatters, kpis })
  const partnerAnalytics = getPartnerAnalytics({
    uniqueMatters,
    isDalawyerDemo: isShowcaseDemo,
    organisationNamesById,
  })
  const rawConveyancingPerformance = getConveyancingPerformance({
    uniqueMatters,
    businessIntelligence,
  })
  const conveyancingPerformance = isShowcaseDemo
    ? withShowcaseConveyancingPerformance(rawConveyancingPerformance, uniqueMatters)
    : rawConveyancingPerformance
  const matterHealth = calculateMatterHealth({ uniqueMatters })

  return {
    firm: {
      id: resolvedFirm.id,
      name: resolvedFirm.name,
      logo_url: resolvedFirm.logoUrl || '',
      primary_colour: resolvedFirm.primaryColour || '',
      secondary_colour: resolvedFirm.secondaryColour || '',
    },
    currentUserRole,
    canViewFirmDashboard,
    departments,
    members,
    kpis,
    filterContext: {
      roleView,
      totalMatters: allMatterRoleSummaries.length,
      scopedMatters: scopedMatterRoleSummaries.length,
    },
    firmSummary: {
      name: resolvedFirm.name,
      status: 'Operational',
      primaryRole: currentUserRole || 'firm_admin',
      otherRoles: [...new Set(activeMembers.map((member) => member.role).filter((role) => role && role !== currentUserRole))],
    },
    matterStats,
    criticalAlerts,
    matterPipeline,
    mattersByRole,
    departmentOverview,
    staffWorkload,
    mattersRequiringAttention,
    recentActivity: getRecentAttorneyActivity({ rows: recentActivity }),
    upcomingKeyDates,
    todayCalendar,
    financialSnapshot,
    matterLanes,
    businessIntelligence,
    attentionMetrics,
    partnerAnalytics,
    conveyancingPerformance,
    matterHealth,
  }
}
