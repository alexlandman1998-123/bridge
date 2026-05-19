import { getAttorneyRolePermissions, getCurrentUserAttorneyMembership } from '../lib/attorneyPermissions'
import { getFirmAttorneyAssignments, getUserAttorneyAssignments } from './transactionAttorneyAssignments'
import { getAttorneyFirmById, getAttorneyFirmDepartments, getCurrentUserPrimaryAttorneyFirm } from './attorneyFirms'
import { getAttorneyFirmMembers } from './attorneyFirmMembers'
import {
  getAuthenticatedUser,
  isMissingColumnError,
  isMissingTableError,
  normalizeText,
  requireClient,
} from './attorneyFirmServiceShared'
import { getAppointmentTypeLabel, normalizeAppointmentTypeKey } from '../lib/appointmentTypeDefinitions'
import {
  notifyAppointmentParticipants,
  scheduleAppointmentReminders,
  cancelAppointmentReminders,
} from './appointmentNotificationService'
import {
  proposeAppointmentReschedule,
  resolveAppointmentRescheduleRequest,
} from './appointmentRescheduleService'

const MANAGEMENT_ROLES = new Set(['firm_admin', 'director_partner'])

const ATTORNEY_STAGE_LABELS = {
  instruction_received: 'Instruction Received',
  fica_onboarding: 'FICA Received',
  drafting: 'Transfer Documents Prepared',
  signing: 'Buyer/Seller Signed Documents',
  guarantees: 'Guarantees Received',
  clearances: 'Clearances In Progress',
  lodgement: 'Lodgement Submitted',
  registration_preparation: 'Registration Preparation',
  registered: 'Registration Confirmed',
}

const MAIN_STAGE_LABELS = {
  AVAIL: 'Instruction Received',
  DEP: 'FICA Received',
  OTP: 'Buyer/Seller Signed Documents',
  FIN: 'Finance In Progress',
  ATTY: 'Attorney Preparation',
  XFER: 'Transfer In Progress',
  REG: 'Registration Confirmed',
}

const ROLE_COPY = {
  transfer_attorney: 'Manage your transfer matters, signatures, lodgement steps, and client-facing updates.',
  bond_attorney: 'Manage your bond matters, bank conditions, grant documents, and bond registration progress.',
  conveyancing_secretary: 'Coordinate assigned matters, document requests, signature scheduling, and client follow-ups.',
  admin_staff: 'Track document requests, uploads, reviews, and outstanding admin actions.',
  reception_scheduling: 'Coordinate signing appointments, confirmations, and day-to-day schedule readiness.',
  candidate_attorney: 'Follow your assigned matters, complete internal tasks, and support document preparation workflows.',
  firm_admin: 'Monitor and execute operational work across the firm while retaining management visibility.',
  director_partner: 'Track leadership-level operational workload and support execution across departments.',
}

function toLower(value) {
  return String(value || '').trim().toLowerCase()
}

function isTruthy(value) {
  return value !== null && value !== undefined && value !== ''
}

function normalizeRoleLabel(value) {
  return String(value || '')
    .trim()
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function buildBootstrapMembership({ firmId = '', userId = '', role = 'firm_admin' } = {}) {
  const nowIso = new Date().toISOString()
  return {
    id: `bootstrap-${firmId}-${userId}`,
    firmId,
    userId,
    departmentId: null,
    role,
    status: 'active',
    joinedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    isActive: true,
  }
}

function resolveOperationalMembership({ listedMembership = null, fallbackMembership = null, firmId = '', userId = '' } = {}) {
  const explicitStatus = toLower(listedMembership?.status)
  if (['suspended', 'removed'].includes(explicitStatus)) {
    return listedMembership
  }

  const candidate = listedMembership || fallbackMembership
  if (candidate) {
    return {
      ...candidate,
      role: candidate.role || 'firm_admin',
      status: ['suspended', 'removed'].includes(toLower(candidate.status)) ? candidate.status : 'active',
      isActive: !['suspended', 'removed'].includes(toLower(candidate.status)),
    }
  }

  if (firmId && userId) {
    return buildBootstrapMembership({ firmId, userId })
  }

  return null
}

function buildStageLabel(transaction = {}) {
  const attorneyStage = toLower(transaction.attorney_stage)
  if (ATTORNEY_STAGE_LABELS[attorneyStage]) {
    return ATTORNEY_STAGE_LABELS[attorneyStage]
  }

  const mainStage = String(transaction.current_main_stage || '').trim().toUpperCase()
  if (MAIN_STAGE_LABELS[mainStage]) {
    return MAIN_STAGE_LABELS[mainStage]
  }

  return transaction.current_sub_stage_summary || transaction.stage || 'Unknown stage'
}

function resolveMatterType(transaction = {}, assignmentType = '') {
  const normalizedAssignmentType = toLower(assignmentType)
  if (normalizedAssignmentType === 'transfer') return 'Transfer'
  if (normalizedAssignmentType === 'bond') return 'Bond'
  if (normalizedAssignmentType === 'cancellation') return 'Cancellation'
  if (normalizedAssignmentType === 'transfer_and_bond') return 'Transfer + Bond'
  if (normalizedAssignmentType === 'transfer_bond_cancellation') return 'Transfer + Bond + Cancellation'
  if (normalizedAssignmentType === 'bond_cancellation') return 'Bond + Cancellation'
  if (normalizedAssignmentType === 'transfer_cancellation') return 'Transfer + Cancellation'

  const financeType = toLower(transaction.finance_type)
  const sellerHasExistingBond =
    transaction.seller_has_existing_bond === true ||
    toLower(transaction.seller_has_existing_bond) === 'true' ||
    toLower(transaction.seller_existing_bond) === 'true'
  if (financeType.includes('bond') || financeType.includes('hybrid') || financeType.includes('combination')) {
    return sellerHasExistingBond ? 'Transfer + Bond + Cancellation' : 'Transfer + Bond'
  }
  return sellerHasExistingBond ? 'Transfer + Cancellation' : 'Transfer'
}

function resolveMatterFlags(transaction = {}) {
  const riskStatus = toLower(transaction.risk_status)
  const operationalState = toLower(transaction.operational_state)
  const stage = toLower(transaction.stage)
  const nextAction = toLower(transaction.next_action)
  const attorneyStage = toLower(transaction.attorney_stage)

  const delayed =
    riskStatus.includes('delayed') ||
    riskStatus.includes('blocked') ||
    operationalState.includes('blocked') ||
    operationalState.includes('at_risk') ||
    stage.includes('delayed') ||
    stage.includes('blocked')

  const awaitingFica = attorneyStage === 'fica_onboarding' || nextAction.includes('fica') || nextAction.includes('client documents')

  const awaitingSignatures =
    attorneyStage === 'signing' ||
    nextAction.includes('sign') ||
    (stage.includes('otp signed') === false && nextAction.includes('otp'))

  const guaranteesOutstanding = attorneyStage === 'guarantees' || nextAction.includes('guarantee')
  const bankConditionsPending = nextAction.includes('bank condition') || nextAction.includes('bank approval')
  const lodgementPending = attorneyStage === 'lodgement' || nextAction.includes('lodgement')

  return {
    delayed,
    awaitingFica,
    awaitingSignatures,
    guaranteesOutstanding,
    bankConditionsPending,
    lodgementPending,
  }
}

function resolvePriorityOrder(priority) {
  const normalized = toLower(priority)
  if (normalized === 'high') return 0
  if (normalized === 'medium') return 1
  return 2
}

function buildPriorityLabel(raw) {
  const normalized = toLower(raw)
  if (normalized === 'high') return 'High'
  if (normalized === 'medium') return 'Medium'
  return 'Low'
}

function startOfDay(date = new Date()) {
  const cloned = new Date(date)
  cloned.setHours(0, 0, 0, 0)
  return cloned
}

function endOfDay(date = new Date()) {
  const cloned = new Date(date)
  cloned.setHours(23, 59, 59, 999)
  return cloned
}

function isDateWithinToday(value) {
  const timestamp = new Date(value || '').getTime()
  if (!Number.isFinite(timestamp)) return false
  const start = startOfDay().getTime()
  const end = endOfDay().getTime()
  return timestamp >= start && timestamp <= end
}

async function fetchTransactions(client, ids = []) {
  const transactionIds = [...new Set((ids || []).filter(Boolean))]
  if (!transactionIds.length) return []

  const primarySelect =
    'id, organisation_id, buyer_id, transaction_reference, stage, current_main_stage, current_sub_stage_summary, finance_type, risk_status, operational_state, attorney_stage, next_action, updated_at, created_at, assigned_attorney_email, attorney, property_description, property_address_line_1, property_address_line_2, suburb, city, province, seller_name, seller_email, seller_phone, seller_has_existing_bond, current_bond_bank, current_bond_account_number, estimated_settlement_amount, purchase_price, sales_price, expected_transfer_date, registration_date, registered_at, lifecycle_state'

  let query = await client
    .from('transactions')
    .select(primarySelect)
    .in('id', transactionIds)

  if (
    query.error &&
    (isMissingColumnError(query.error, 'current_main_stage') ||
      isMissingColumnError(query.error, 'assigned_attorney_email') ||
      isMissingColumnError(query.error, 'operational_state') ||
      isMissingColumnError(query.error, 'attorney_stage') ||
      isMissingColumnError(query.error, 'property_description') ||
      isMissingColumnError(query.error, 'seller_has_existing_bond') ||
      isMissingColumnError(query.error, 'current_bond_bank'))
  ) {
    query = await client
      .from('transactions')
      .select('id, organisation_id, buyer_id, transaction_reference, stage, finance_type, risk_status, next_action, updated_at, created_at, attorney')
      .in('id', transactionIds)
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'transactions')) return []
    throw query.error
  }

  return query.data || []
}

async function fetchBuyersById(client, ids = []) {
  const buyerIds = [...new Set((ids || []).filter(Boolean))]
  if (!buyerIds.length) return {}

  const query = await client.from('buyers').select('id, name, email').in('id', buyerIds)
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

async function fetchProfilesById(client, ids = []) {
  const profileIds = [...new Set((ids || []).filter(Boolean))]
  if (!profileIds.length) return {}

  const query = await client
    .from('profiles')
    .select('id, first_name, last_name, full_name, email')
    .in('id', profileIds)

  if (query.error) {
    if (isMissingTableError(query.error, 'profiles')) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    const fullName =
      String(row.full_name || '').trim() ||
      [row.first_name, row.last_name].map((value) => String(value || '').trim()).filter(Boolean).join(' ').trim()

    accumulator[row.id] = {
      id: row.id,
      name: fullName || 'Team Member',
      email: toLower(row.email),
    }
    return accumulator
  }, {})
}

async function fetchChecklistItems(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return []

  const query = await client
    .from('transaction_checklist_items')
    .select('id, transaction_id, stage, label, status, priority, owner_role, owner_user_id, updated_at, created_at')
    .in('transaction_id', ids)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_checklist_items')) {
      return []
    }
    throw query.error
  }

  return query.data || []
}

async function fetchDocumentRequests(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return []

  const query = await client
    .from('document_requests')
    .select('id, transaction_id, category, document_type, title, priority, due_date, assigned_to_role, assigned_to_user_id, status, updated_at, created_at')
    .in('transaction_id', ids)

  if (query.error) {
    if (isMissingTableError(query.error, 'document_requests')) {
      return []
    }
    throw query.error
  }

  return query.data || []
}

async function fetchAppointments(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return []

  let query = await client
    .from('appointments')
    .select('appointment_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, linked_workflow, linked_workflow_stage, linked_transaction_stage, visibility_scope, appointment_instructions, required_documents, status, calendar_event_uid, external_calendar_status, external_calendar_provider, external_calendar_event_id, ics_generated_at, updated_at, created_at')
    .in('transaction_id', ids)

  if (
    query.error &&
    (isMissingColumnError(query.error, 'linked_workflow') ||
      isMissingColumnError(query.error, 'linked_workflow_stage') ||
      isMissingColumnError(query.error, 'linked_transaction_stage') ||
      isMissingColumnError(query.error, 'visibility_scope') ||
      isMissingColumnError(query.error, 'appointment_instructions') ||
      isMissingColumnError(query.error, 'required_documents') ||
      isMissingColumnError(query.error, 'calendar_event_uid') ||
      isMissingColumnError(query.error, 'external_calendar_status'))
  ) {
    query = await client
      .from('appointments')
      .select('appointment_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, status, updated_at, created_at')
      .in('transaction_id', ids)
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'appointments')) {
      return []
    }
    throw query.error
  }

  return query.data || []
}

async function fetchParticipantsByAppointment(client, appointmentIds = []) {
  const ids = [...new Set((appointmentIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const query = await client
    .from('appointment_participants')
    .select('appointment_id, name, email, participant_role')
    .in('appointment_id', ids)

  if (query.error) {
    if (isMissingTableError(query.error, 'appointment_participants')) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    if (!accumulator[row.appointment_id]) {
      accumulator[row.appointment_id] = []
    }
    accumulator[row.appointment_id].push({
      name: row.name,
      email: toLower(row.email),
      participantRole: row.participant_role || 'Participant',
    })
    return accumulator
  }, {})
}

async function fetchRescheduleRequestsByAppointment(client, appointmentIds = []) {
  const ids = [...new Set((appointmentIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const query = await client
    .from('appointment_reschedule_requests')
    .select('id, appointment_id, requested_by_role, reason, preferred_start, preferred_end, status, created_at, updated_at')
    .in('appointment_id', ids)
    .order('created_at', { ascending: false })

  if (query.error) {
    if (isMissingTableError(query.error, 'appointment_reschedule_requests')) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    const appointmentId = row?.appointment_id
    if (!appointmentId) return accumulator
    if (!accumulator[appointmentId]) {
      accumulator[appointmentId] = []
    }
    accumulator[appointmentId].push({
      id: row?.id,
      requestedByRole: row?.requested_by_role || null,
      reason: row?.reason || null,
      preferredStart: row?.preferred_start || null,
      preferredEnd: row?.preferred_end || null,
      status: row?.status || 'pending',
      createdAt: row?.created_at || null,
      updatedAt: row?.updated_at || null,
    })
    return accumulator
  }, {})
}

async function fetchPacketSigners(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return []

  const packetQuery = await client
    .from('document_packets')
    .select('id, transaction_id, packet_type, title, status')
    .in('transaction_id', ids)

  if (packetQuery.error) {
    if (isMissingTableError(packetQuery.error, 'document_packets')) {
      return []
    }
    throw packetQuery.error
  }

  const packets = packetQuery.data || []
  const packetIds = packets.map((packet) => packet.id).filter(Boolean)
  if (!packetIds.length) return []

  const signerQuery = await client
    .from('document_packet_signers')
    .select('id, packet_id, signer_role, signer_name, signer_email, status, updated_at, created_at')
    .in('packet_id', packetIds)

  if (signerQuery.error) {
    if (isMissingTableError(signerQuery.error, 'document_packet_signers')) {
      return []
    }
    throw signerQuery.error
  }

  const packetById = packets.reduce((accumulator, packet) => {
    accumulator[packet.id] = packet
    return accumulator
  }, {})

  return (signerQuery.data || []).map((signer) => ({
    ...signer,
    packet: packetById[signer.packet_id] || null,
  }))
}

function resolveRoleSpecificKpis({ role, matters, documentQueue, appointmentQueue, priorityQueue, packetSigners, checklistItems, permissions, userContext }) {
  if (role === 'transfer_attorney') {
    return [
      {
        key: 'lodgements_pending',
        label: 'Lodgements Pending',
        value: matters.filter((matter) => matter.flags.lodgementPending).length,
      },
      {
        key: 'guarantees_outstanding',
        label: 'Guarantees Outstanding',
        value: matters.filter((matter) => matter.flags.guaranteesOutstanding).length,
      },
    ]
  }

  if (role === 'bond_attorney') {
    return [
      {
        key: 'bank_conditions_pending',
        label: 'Bank Conditions Pending',
        value: matters.filter((matter) => matter.flags.bankConditionsPending).length,
      },
      {
        key: 'grants_awaiting_signature',
        label: 'Grants Awaiting Signature',
        value: packetSigners.filter((signer) => ['pending', 'sent', 'viewed'].includes(toLower(signer.status))).length,
      },
    ]
  }

  if (role === 'admin_staff') {
    return [
      {
        key: 'documents_to_review',
        label: 'Documents To Review',
        value: documentQueue.filter((item) => toLower(item.status) === 'uploaded').length,
      },
      {
        key: 'fica_outstanding',
        label: 'FICA Outstanding',
        value: matters.filter((matter) => matter.flags.awaitingFica).length,
      },
    ]
  }

  if (role === 'reception_scheduling') {
    return [
      {
        key: 'appointments_today',
        label: 'Appointments Today',
        value: appointmentQueue.filter((item) => isDateWithinToday(item.rawDateTime)).length,
      },
      {
        key: 'confirmations_pending',
        label: 'Confirmations Pending',
        value: appointmentQueue.filter((item) => ['requested', 'proposed', 'pending confirmation', 'needs reschedule'].includes(toLower(item.status))).length,
      },
    ]
  }

  if (role === 'candidate_attorney') {
    const ownChecklist = checklistItems.filter((item) => item.owner_user_id === userContext.id)
    return [
      {
        key: 'internal_tasks',
        label: 'Internal Tasks',
        value: ownChecklist.filter((item) => ['pending', 'in_progress', 'blocked'].includes(toLower(item.status))).length,
      },
      {
        key: 'priority_actions',
        label: 'Priority Actions',
        value: priorityQueue.filter((item) => item.priority === 'High').length,
      },
    ]
  }

  if (permissions.can_view_firm_dashboard) {
    return [
      {
        key: 'firm_wide_priority',
        label: 'High Priority Items',
        value: priorityQueue.filter((item) => item.priority === 'High').length,
      },
      {
        key: 'pending_signers',
        label: 'Pending Signers',
        value: packetSigners.filter((signer) => ['pending', 'sent', 'viewed'].includes(toLower(signer.status))).length,
      },
    ]
  }

  return []
}

function buildQueuePriority({ dueDate = null, isBlocked = false, isOverdue = false, pending = false }) {
  if (isBlocked || isOverdue) return 'High'
  if (pending || dueDate) return 'Medium'
  return 'Low'
}

function buildDateTimeFromAppointment(appointment = {}) {
  if (appointment.date_time) return appointment.date_time
  if (appointment.appointment_date && appointment.start_time) {
    return `${appointment.appointment_date}T${appointment.start_time}`
  }
  if (appointment.appointment_date) {
    return `${appointment.appointment_date}T00:00:00`
  }
  return appointment.created_at || appointment.updated_at || null
}

export async function getAttorneyOperationalWorkspaceData(firmId = null, userId = null) {
  const client = requireClient()
  const authUser = await getAuthenticatedUser(client)

  const resolvedFirm = firmId ? await getAttorneyFirmById(firmId) : await getCurrentUserPrimaryAttorneyFirm()

  if (!resolvedFirm?.id) {
    return {
      firm: null,
      currentUser: null,
      permissions: {},
      kpis: {
        myActiveMatters: 0,
        tasksDueToday: 0,
        outstandingDocuments: 0,
        pendingSignatures: 0,
        delayedMatters: 0,
        upcomingAppointments: 0,
        transferMatters: 0,
        bondMatters: 0,
        roleSpecific: [],
      },
      priorityQueue: [],
      matterQueue: [],
      documentQueue: [],
      appointmentQueue: [],
      recentUpdates: [],
      accessBlocked: false,
      availableFilters: {
        departments: [],
        members: [],
        matterTypes: ['Transfer', 'Bond', 'Transfer + Bond', 'Admin'],
        statuses: [],
      },
    }
  }

  const [departments, members, fallbackMembership] = await Promise.all([
    getAttorneyFirmDepartments(resolvedFirm.id).catch(() => []),
    getAttorneyFirmMembers(resolvedFirm.id).catch(() => []),
    getCurrentUserAttorneyMembership(resolvedFirm.id, userId || authUser.id).catch(() => null),
  ])

  const currentUserId = userId || authUser.id
  const listedMembership = (members || []).find((member) => member.userId === currentUserId) || null
  const currentMembership = resolveOperationalMembership({
    listedMembership,
    fallbackMembership,
    firmId: resolvedFirm.id,
    userId: currentUserId,
  })
  const membersWithCurrent = currentMembership && !(members || []).some((member) => member.userId === currentUserId)
    ? [...(members || []), currentMembership]
    : (members || [])
  const activeMembers = membersWithCurrent.filter((member) => !['suspended', 'removed'].includes(toLower(member.status)))

  const allProfileIds = [...new Set(activeMembers.map((member) => member.userId).filter(Boolean))]
  const profilesById = await fetchProfilesById(client, allProfileIds)

  const currentProfile = profilesById[currentUserId] || {
    id: currentUserId,
    name: authUser.user_metadata?.full_name || authUser.email || 'Attorney User',
    email: toLower(authUser.email),
  }

  const currentRole = currentMembership?.role || normalizeText(authUser.user_metadata?.attorney_role || '') || 'candidate_attorney'
  const permissions = getAttorneyRolePermissions(currentRole)

  const departmentById = (departments || []).reduce((accumulator, department) => {
    accumulator[department.id] = department
    return accumulator
  }, {})

  const currentDepartment = currentMembership?.departmentId ? departmentById[currentMembership.departmentId] : null

  const assignments = MANAGEMENT_ROLES.has(currentRole) || permissions.can_view_all_firm_matters
    ? await getFirmAttorneyAssignments(resolvedFirm.id)
    : currentMembership
      ? await getUserAttorneyAssignments(resolvedFirm.id, currentUserId)
      : []

  const relevantAssignments = assignments.filter((assignment) => ['pending', 'active', 'paused'].includes(toLower(assignment.status)))

  const transactionIds = [...new Set(relevantAssignments.map((assignment) => assignment.transactionId).filter(Boolean))]
  const transactions = await fetchTransactions(client, transactionIds)
  const transactionsById = transactions.reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})

  const [buyersById, checklistItems, documentRequests, appointments, packetSigners] = await Promise.all([
    fetchBuyersById(client, transactions.map((transaction) => transaction.buyer_id).filter(Boolean)),
    fetchChecklistItems(client, transactionIds),
    fetchDocumentRequests(client, transactionIds),
    fetchAppointments(client, transactionIds),
    fetchPacketSigners(client, transactionIds),
  ])

  const participantsByAppointment = await fetchParticipantsByAppointment(
    client,
    appointments.map((appointment) => appointment.appointment_id).filter(Boolean),
  )
  const rescheduleRequestsByAppointment = await fetchRescheduleRequestsByAppointment(
    client,
    appointments.map((appointment) => appointment.appointment_id).filter(Boolean),
  )

  const matterQueue = relevantAssignments
    .map((assignment) => {
      const transaction = transactionsById[assignment.transactionId]
      if (!transaction) return null

      const flags = resolveMatterFlags(transaction)
      const matterType = resolveMatterType(transaction, assignment.assignmentType)
      const status = flags.delayed
        ? 'Needs Attention'
        : flags.awaitingSignatures
          ? 'Awaiting Signature'
          : flags.awaitingFica
            ? 'Awaiting FICA'
            : 'On Track'

      const clientName =
        buyersById[transaction.buyer_id]?.name ||
        buyersById[transaction.buyer_id]?.email ||
        `Buyer ${String(transaction.buyer_id || '').slice(0, 8)}`

      const assignmentRole =
        assignment.primaryAttorneyId === currentUserId
          ? 'Primary Attorney'
          : assignment.secretaryId === currentUserId
            ? 'Secretary'
            : assignment.adminHandlerId === currentUserId
              ? 'Admin Handler'
              : normalizeRoleLabel(currentRole)

      return {
        assignmentId: assignment.id,
        matterId: transaction.id,
        organisationId: transaction.organisation_id || null,
        matterReference: transaction.transaction_reference || `Transaction ${String(transaction.id || '').slice(0, 8)}`,
        clientName,
        buyerName: clientName,
        sellerName: transaction.seller_name || transaction.seller_email || 'Seller pending',
        propertyLabel:
          transaction.property_description ||
          [transaction.property_address_line_1, transaction.suburb, transaction.city].filter(Boolean).join(', ') ||
          'Property pending',
        developmentName: transaction.development_name || 'Standalone matter',
        financeType: transaction.finance_type || 'cash',
        purchasePrice: Number(transaction.purchase_price || transaction.sales_price || 0),
        sellerHasExistingBond:
          transaction.seller_has_existing_bond === true ||
          toLower(transaction.seller_has_existing_bond) === 'true' ||
          toLower(transaction.seller_existing_bond) === 'true',
        currentBondBank: transaction.current_bond_bank || '',
        estimatedSettlementAmount: Number(transaction.estimated_settlement_amount || 0),
        registrationDate: transaction.registration_date || transaction.registered_at || null,
        lifecycleState: transaction.lifecycle_state || null,
        matterType,
        currentStage: buildStageLabel(transaction),
        assignedRole: assignmentRole,
        assignedUserId: assignment.primaryAttorneyId || null,
        assignedAttorneyId: assignment.primaryAttorneyId || null,
        assignedSecretaryId: assignment.secretaryId || null,
        assignedAdminHandlerId: assignment.adminHandlerId || null,
        assignedAttorneyName: assignment.primaryAttorney?.name || assignment.firm?.name || null,
        assignedSecretaryName: assignment.secretary?.name || null,
        assignedAdminHandlerName: assignment.adminHandler?.name || null,
        assignedDepartmentId: assignment.departmentId || null,
        lastUpdated: transaction.updated_at || transaction.created_at || null,
        status,
        flags,
        actionLabel: 'Open Matter',
        actionHref: `/transactions/${transaction.id}`,
      }
    })
    .filter(Boolean)

  const canAccessDocumentQueue =
    permissions.can_request_documents || permissions.can_review_documents || permissions.can_upload_documents

  const documentQueue = canAccessDocumentQueue
    ? (documentRequests || []).map((request) => {
        const matter = matterQueue.find((item) => item.matterId === request.transaction_id)
        return {
          id: request.id,
          matterReference: matter?.matterReference || `Transaction ${String(request.transaction_id || '').slice(0, 8)}`,
          clientName: matter?.clientName || 'Unassigned client',
          documentType: request.document_type || request.title || request.category || 'Document',
          status: normalizeText(request.status || 'requested') || 'requested',
          requestedFrom: request.assigned_to_role || 'client',
          lastUpdated: request.updated_at || request.created_at || null,
          dueDate: request.due_date || null,
          priority: request.priority || 'required',
          actionLabel: 'Open Matter',
          actionHref: request.transaction_id ? `/transactions/${request.transaction_id}` : '',
          transactionId: request.transaction_id,
        }
      })
    : []

  const canAccessAppointments = permissions.can_manage_signing_appointments

  const appointmentQueue = canAccessAppointments
    ? (appointments || []).map((appointment) => {
        const matter = matterQueue.find((item) => item.matterId === appointment.transaction_id)
        const attendeesDetailed = participantsByAppointment[appointment.appointment_id] || []
        const attendees = attendeesDetailed.map((row) => row.name).filter(Boolean)
        const rescheduleRequests = rescheduleRequestsByAppointment[appointment.appointment_id] || []
        const latestRescheduleRequest = rescheduleRequests[0] || null
        const dateTime = buildDateTimeFromAppointment(appointment)
        const appointmentTypeKey = normalizeAppointmentTypeKey(appointment.appointment_type)
        const appointmentTypeLabel = getAppointmentTypeLabel(appointmentTypeKey)
        const appointmentStatus = normalizeText(appointment.status || 'Pending Confirmation') || 'Pending Confirmation'
        const statusWithRescheduleContext = latestRescheduleRequest
          ? (
              toLower(latestRescheduleRequest.status) === 'proposed'
                ? 'Proposed'
                : 'Reschedule Requested'
            )
          : appointmentStatus
        return {
          id: appointment.appointment_id,
          appointmentType: appointmentTypeLabel || appointment.title || 'General consultation',
          appointmentTypeKey,
          matterReference: matter?.matterReference || `Transaction ${String(appointment.transaction_id || '').slice(0, 8)}`,
          transactionId: appointment.transaction_id || null,
          organisationId: matter?.organisationId || null,
          clientName: matter?.clientName || 'Unassigned client',
          dateTime,
          rawDateTime: dateTime,
          attendees,
          attendeesDetailed,
          linkedWorkflow: appointment.linked_workflow || null,
          linkedWorkflowStage: appointment.linked_workflow_stage || appointment.linked_transaction_stage || null,
          location: appointment.location || '',
          instructions: appointment.appointment_instructions || null,
          requiredDocuments: Array.isArray(appointment.required_documents) ? appointment.required_documents : [],
          visibility: appointment.visibility_scope || 'shared_role_players',
          calendarEventUid: appointment.calendar_event_uid || null,
          externalCalendarStatus: appointment.external_calendar_status || 'not_synced',
          externalCalendarProvider: appointment.external_calendar_provider || null,
          externalCalendarEventId: appointment.external_calendar_event_id || null,
          icsGeneratedAt: appointment.ics_generated_at || null,
          status: statusWithRescheduleContext,
          rescheduleRequests,
          latestRescheduleRequest,
          assignedAttorneyId: matter?.assignedAttorneyId || null,
          assignedSecretaryId: matter?.assignedSecretaryId || null,
          assignedAdminHandlerId: matter?.assignedAdminHandlerId || null,
          assignedAttorneyName: matter?.assignedAttorneyName || null,
          assignedSecretaryName: matter?.assignedSecretaryName || null,
          assignedAdminHandlerName: matter?.assignedAdminHandlerName || null,
          matterType: matter?.matterType || null,
          flags: matter?.flags || {},
          actionLabel: 'Open Matter',
          actionHref: appointment.transaction_id ? `/transactions/${appointment.transaction_id}` : '',
        }
      })
    : []

  const pendingSignerStatuses = new Set(['pending', 'sent', 'viewed'])
  const pendingSignaturesCount = packetSigners.filter((signer) => pendingSignerStatuses.has(toLower(signer.status))).length

  const checklistTaskCount = (checklistItems || []).filter((item) => {
    const pending = ['pending', 'in_progress', 'blocked'].includes(toLower(item.status))
    if (!pending) return false
    if (permissions.can_view_all_firm_matters || MANAGEMENT_ROLES.has(currentRole)) return true
    return item.owner_user_id === currentUserId || !item.owner_user_id
  }).length

  const tasksDueToday =
    documentQueue.filter((item) => item.dueDate && isDateWithinToday(item.dueDate)).length +
    appointmentQueue.filter((item) => isDateWithinToday(item.rawDateTime)).length +
    checklistTaskCount

  const outstandingDocuments = documentQueue.filter((item) => ['requested', 'uploaded', 'rejected'].includes(toLower(item.status))).length
  const delayedMatters = matterQueue.filter((item) => item.flags?.delayed).length

  const upcomingAppointments = appointmentQueue.filter((item) => {
    const status = toLower(item.status)
    if (['completed', 'cancelled'].includes(status)) return false
    const timestamp = new Date(item.rawDateTime || '').getTime()
    return Number.isFinite(timestamp) && timestamp >= Date.now()
  }).length

  const priorityQueue = []

  matterQueue.forEach((matter) => {
    if (matter.flags?.delayed || matter.flags?.awaitingFica || matter.flags?.awaitingSignatures || matter.flags?.guaranteesOutstanding || matter.flags?.bankConditionsPending) {
      const issue = matter.flags?.delayed
        ? 'Matter stalled or delayed'
        : matter.flags?.awaitingFica
          ? 'Missing FICA documentation'
          : matter.flags?.awaitingSignatures
            ? 'Signature action pending'
            : matter.flags?.guaranteesOutstanding
              ? 'Guarantee outstanding'
              : 'Bank condition pending'

      priorityQueue.push({
        id: `matter-${matter.assignmentId || matter.matterId}`,
        priority: buildPriorityLabel(
          buildQueuePriority({
            isBlocked: matter.flags?.delayed,
            pending: true,
          }),
        ),
        matterReference: matter.matterReference,
        clientName: matter.clientName,
        issue,
        dueDate: matter.lastUpdated,
        assignedRole: matter.assignedRole,
        actionLabel: 'Open Matter',
        actionHref: matter.actionHref,
      })
    }
  })

  documentQueue.forEach((documentItem) => {
    if (!['requested', 'uploaded', 'rejected'].includes(toLower(documentItem.status))) return

    const isRejected = toLower(documentItem.status) === 'rejected'
    const dueDate = documentItem.dueDate || null
    const isOverdue = dueDate ? new Date(dueDate).getTime() < Date.now() : false

    priorityQueue.push({
      id: `document-${documentItem.id}`,
      priority: buildPriorityLabel(
        buildQueuePriority({ isBlocked: isRejected, isOverdue, dueDate, pending: true }),
      ),
      matterReference: documentItem.matterReference,
      clientName: documentItem.clientName,
      issue: isRejected ? 'Document rejected and requires follow-up' : 'Outstanding document action',
      dueDate,
      assignedRole: normalizeRoleLabel(currentRole),
      actionLabel: 'Open Matter',
      actionHref: documentItem.actionHref,
    })
  })

  appointmentQueue.forEach((appointmentItem) => {
    const normalizedStatus = toLower(appointmentItem.status)
    if (!['pending confirmation', 'needs reschedule', 'reschedule requested', 'requested', 'proposed'].includes(normalizedStatus)) return

    priorityQueue.push({
      id: `appointment-${appointmentItem.id}`,
      priority: buildPriorityLabel(
        buildQueuePriority({
          isBlocked: normalizedStatus === 'needs reschedule' || normalizedStatus === 'reschedule requested',
          pending: true,
          dueDate: appointmentItem.rawDateTime,
        }),
      ),
      matterReference: appointmentItem.matterReference,
      clientName: appointmentItem.clientName,
      issue: normalizedStatus === 'needs reschedule' || normalizedStatus === 'reschedule requested'
        ? 'Appointment needs reschedule'
        : 'Appointment confirmation needed',
      dueDate: appointmentItem.rawDateTime,
      assignedRole: normalizeRoleLabel(currentRole),
      actionLabel: 'Open Matter',
      actionHref: appointmentItem.actionHref,
    })
  })

  const dedupedPriorityQueue = Object.values(
    priorityQueue.reduce((accumulator, item) => {
      if (!accumulator[item.id]) {
        accumulator[item.id] = item
      }
      return accumulator
    }, {}),
  )
    .sort((a, b) => {
      const priorityDiff = resolvePriorityOrder(a.priority) - resolvePriorityOrder(b.priority)
      if (priorityDiff !== 0) return priorityDiff
      return new Date(b.dueDate || 0).getTime() - new Date(a.dueDate || 0).getTime()
    })
    .slice(0, 30)

  const recentUpdates = [
    ...priorityQueue.slice(0, 8).map((item) => ({
      id: `priority-update-${item.id}`,
      message: `${item.issue} on ${item.matterReference}.`,
      occurredAt: item.dueDate || null,
      source: 'System',
    })),
    ...appointmentQueue.slice(0, 6).map((item) => ({
      id: `appointment-update-${item.id}`,
      message: `${item.appointmentType} appointment is ${item.status.toLowerCase()}.`,
      occurredAt: item.rawDateTime || null,
      source: 'Scheduling',
    })),
    ...relevantAssignments.slice(0, 6).map((assignment) => ({
      id: `assignment-update-${assignment.id}`,
      message: `${normalizeRoleLabel(assignment.assignmentType)} assignment is ${assignment.status}.`,
      occurredAt: assignment.updatedAt || assignment.assignedAt || assignment.createdAt,
      source: 'Assignment',
    })),
  ]
    .filter((item) => isTruthy(item.occurredAt))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 12)

  const roleSpecific = resolveRoleSpecificKpis({
    role: currentRole,
    matters: matterQueue,
    documentQueue,
    appointmentQueue,
    priorityQueue: dedupedPriorityQueue,
    packetSigners,
    checklistItems,
    permissions,
    userContext: currentProfile,
  })

  const transferMatterCount = matterQueue.filter((matter) => ['Transfer', 'Transfer + Bond'].includes(matter.matterType)).length
  const bondMatterCount = matterQueue.filter((matter) => ['Bond', 'Transfer + Bond'].includes(matter.matterType)).length

  return {
    firm: {
      id: resolvedFirm.id,
      name: resolvedFirm.name,
      logo_url: resolvedFirm.logoUrl || '',
      primary_colour: resolvedFirm.primaryColour || '',
      secondary_colour: resolvedFirm.secondaryColour || '',
    },
    currentUser: {
      id: currentUserId,
      name: currentProfile.name,
      email: currentProfile.email,
      role: currentRole,
      roleLabel: normalizeRoleLabel(currentRole),
      department: currentDepartment?.name || 'Unassigned Department',
      roleCopy: ROLE_COPY[currentRole] || 'Your assigned matters, document tasks, and signing actions in one place.',
      status: currentMembership?.status || 'unknown',
    },
    permissions,
    kpis: {
      myActiveMatters: matterQueue.length,
      transferMatters: transferMatterCount,
      bondMatters: bondMatterCount,
      tasksDueToday,
      outstandingDocuments,
      pendingSignatures: pendingSignaturesCount,
      delayedMatters,
      upcomingAppointments,
      roleSpecific,
    },
    priorityQueue: dedupedPriorityQueue,
    matterQueue,
    documentQueue,
    appointmentQueue,
    recentUpdates,
    accessBlocked: !currentMembership || ['suspended', 'removed'].includes(toLower(currentMembership.status)),
    canViewFirmDashboard: Boolean(permissions.can_view_firm_dashboard),
    availableFilters: {
      departments: (departments || [])
        .filter((department) => department.isActive)
        .map((department) => ({ value: department.id, label: department.name, type: department.departmentType })),
      members: activeMembers.map((member) => ({
        value: member.userId,
        label: profilesById[member.userId]?.name || 'Team Member',
        role: member.role,
      })),
      matterTypes: ['Transfer', 'Bond', 'Transfer + Bond', 'Admin'],
      statuses: [...new Set(matterQueue.map((matter) => matter.status).filter(Boolean))],
    },
  }
}

function normalizeAppointmentOperationalStatus(value = '') {
  const normalized = toLower(value)
  if (!normalized) return 'awaiting_confirmation'
  if (normalized.includes('cancel')) return 'cancelled'
  if (normalized.includes('complete')) return 'completed'
  if (normalized.includes('declin')) return 'cancelled'
  if (normalized.includes('progress')) return 'in_progress'
  if (normalized.includes('reschedule')) return 'reschedule_requested'
  if (normalized.includes('confirm')) return 'confirmed'
  if (normalized.includes('proposed')) return 'awaiting_confirmation'
  if (normalized.includes('pending') || normalized.includes('requested')) return 'awaiting_confirmation'
  if (normalized === 'ready') return 'ready'
  if (normalized === 'blocked') return 'blocked'
  if (normalized === 'draft') return 'draft'
  return 'awaiting_confirmation'
}

function mapOperationalToDbStatus(value = '') {
  const normalized = normalizeAppointmentOperationalStatus(value)
  if (normalized === 'cancelled') return 'Cancelled'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'confirmed') return 'Confirmed'
  if (normalized === 'reschedule_requested') return 'Reschedule Requested'
  if (normalized === 'in_progress') return 'Confirmed'
  if (normalized === 'ready') return 'Confirmed'
  if (normalized === 'blocked') return 'Needs Reschedule'
  if (normalized === 'draft') return 'Draft'
  return 'Pending Confirmation'
}

export async function updateAttorneyAppointmentOperationalStatus(appointmentId, operationalStatus, options = {}) {
  const client = requireClient()
  const scopedAppointmentId = normalizeText(appointmentId)
  if (!scopedAppointmentId) {
    throw new Error('Appointment is required.')
  }

  const status = mapOperationalToDbStatus(operationalStatus)
  const nowIso = new Date().toISOString()
  const updatePayload = {
    status,
    updated_at: nowIso,
  }
  if (status === 'Completed') {
    updatePayload.completed_at = nowIso
  }

  const update = await client
    .from('appointments')
    .update(updatePayload)
    .eq('appointment_id', scopedAppointmentId)
    .select('appointment_id, transaction_id, status, visibility_scope')
    .maybeSingle()

  if (update.error) throw update.error

  const appointment = update.data || null
  if (!appointment) {
    throw new Error('Appointment could not be updated.')
  }

  if (status === 'Completed') {
    await cancelAppointmentReminders(scopedAppointmentId).catch(() => null)
    await notifyAppointmentParticipants(scopedAppointmentId, 'appointment_completed', {
      visibility: appointment.visibility_scope || 'shared_role_players',
      metadata: {
        source: 'updateAttorneyAppointmentOperationalStatus',
        actorRole: normalizeText(options?.actorRole || 'attorney'),
      },
    }).catch(() => null)
  } else if (status === 'Confirmed') {
    await notifyAppointmentParticipants(scopedAppointmentId, 'appointment_confirmed', {
      visibility: appointment.visibility_scope || 'shared_role_players',
      metadata: {
        source: 'updateAttorneyAppointmentOperationalStatus',
        actorRole: normalizeText(options?.actorRole || 'attorney'),
      },
    }).catch(() => null)
    await scheduleAppointmentReminders(scopedAppointmentId).catch(() => null)
  }

  return {
    appointmentId: appointment.appointment_id,
    transactionId: appointment.transaction_id || null,
    status,
    operationalStatus: normalizeAppointmentOperationalStatus(status),
  }
}

export async function assignAttorneyAppointmentResource(appointmentId, resourceId = null) {
  const client = requireClient()
  const scopedAppointmentId = normalizeText(appointmentId)
  if (!scopedAppointmentId) {
    throw new Error('Appointment is required.')
  }

  const normalizedResourceId = normalizeText(resourceId) || null
  const update = await client
    .from('appointments')
    .update({
      resource_id: normalizedResourceId,
      updated_at: new Date().toISOString(),
    })
    .eq('appointment_id', scopedAppointmentId)
    .select('appointment_id, resource_id')
    .maybeSingle()

  if (update.error) throw update.error
  return {
    appointmentId: update.data?.appointment_id || scopedAppointmentId,
    resourceId: update.data?.resource_id || null,
  }
}

export async function upsertAttorneyAppointmentParticipant(appointmentId, payload = {}) {
  const client = requireClient()
  const scopedAppointmentId = normalizeText(appointmentId)
  if (!scopedAppointmentId) {
    throw new Error('Appointment is required.')
  }

  const participantRole = normalizeText(payload?.participantRole || payload?.participant_role || 'Participant')
  const participantName = normalizeText(payload?.name || payload?.participantName)
  const participantEmail = toLower(payload?.email)

  if (!participantName && !participantEmail) {
    throw new Error('Participant name or email is required.')
  }

  const lookup = await client
    .from('appointment_participants')
    .select('participant_id')
    .eq('appointment_id', scopedAppointmentId)
    .eq('participant_role', participantRole)
    .limit(1)
    .maybeSingle()

  if (lookup.error && !isMissingTableError(lookup.error, 'appointment_participants')) {
    throw lookup.error
  }

  if (lookup.data?.participant_id) {
    const update = await client
      .from('appointment_participants')
      .update({
        name: participantName || 'Participant',
        email: participantEmail || null,
        updated_at: new Date().toISOString(),
      })
      .eq('participant_id', lookup.data.participant_id)
      .select('participant_id, appointment_id, name, email, participant_role')
      .maybeSingle()
    if (update.error) throw update.error
    return update.data
  }

  const appointmentLookup = await client
    .from('appointments')
    .select('organisation_id')
    .eq('appointment_id', scopedAppointmentId)
    .maybeSingle()
  if (appointmentLookup.error) throw appointmentLookup.error

  const insert = await client
    .from('appointment_participants')
    .insert({
      appointment_id: scopedAppointmentId,
      organisation_id: appointmentLookup.data?.organisation_id || null,
      name: participantName || 'Participant',
      email: participantEmail || null,
      participant_role: participantRole,
      rsvp_status: 'Pending',
    })
    .select('participant_id, appointment_id, name, email, participant_role')
    .maybeSingle()
  if (insert.error) throw insert.error
  return insert.data
}

export async function resendAttorneyAppointmentCommunication(appointmentId, communicationType = 'confirmation') {
  const client = requireClient()
  const scopedAppointmentId = normalizeText(appointmentId)
  if (!scopedAppointmentId) {
    throw new Error('Appointment is required.')
  }

  const appointmentQuery = await client
    .from('appointments')
    .select('appointment_id, visibility_scope')
    .eq('appointment_id', scopedAppointmentId)
    .maybeSingle()
  if (appointmentQuery.error) throw appointmentQuery.error

  const visibility = appointmentQuery.data?.visibility_scope || 'shared_role_players'
  let eventType = 'appointment_confirmation_required'
  if (communicationType === 'calendar') {
    eventType = 'appointment_scheduled'
  } else if (communicationType === 'documents') {
    eventType = 'appointment_documents_required'
  } else if (communicationType === 'reminder') {
    eventType = 'appointment_reminder_due'
  } else if (communicationType === 'portal') {
    eventType = 'appointment_updated'
  }

  const result = await notifyAppointmentParticipants(scopedAppointmentId, eventType, {
    visibility,
    metadata: {
      source: 'resendAttorneyAppointmentCommunication',
      communicationType,
    },
  })

  return {
    appointmentId: scopedAppointmentId,
    eventType,
    deliveredCount: Array.isArray(result) ? result.length : 0,
  }
}

export async function proposeAttorneyAppointmentReschedule(requestId, payload = {}) {
  return proposeAppointmentReschedule(requestId, payload)
}

export async function resolveAttorneyAppointmentReschedule(requestId, payload = {}) {
  return resolveAppointmentRescheduleRequest(requestId, payload)
}
