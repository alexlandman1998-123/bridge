import { attorneyRoleHasPermission } from '../lib/attorneyPermissions'
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

function toLower(value) {
  return String(value || '').trim().toLowerCase()
}

function isTruthy(value) {
  return value !== null && value !== undefined && value !== ''
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

function isAfter(value, thresholdDate) {
  const timestamp = new Date(value || '').getTime()
  if (!Number.isFinite(timestamp)) return false
  return timestamp >= thresholdDate.getTime()
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
    'id, buyer_id, stage, current_main_stage, current_sub_stage_summary, attorney, assigned_attorney_email, finance_type, onboarding_status, next_action, risk_status, operational_state, attorney_stage, updated_at, created_at'

  let query = await client
    .from('transactions')
    .select(primarySelect)
    .eq('is_active', true)

  if (
    query.error &&
    (isMissingColumnError(query.error, 'current_main_stage') ||
      isMissingColumnError(query.error, 'assigned_attorney_email') ||
      isMissingColumnError(query.error, 'onboarding_status') ||
      isMissingColumnError(query.error, 'operational_state') ||
      isMissingColumnError(query.error, 'attorney_stage') ||
      isMissingColumnError(query.error, 'is_active'))
  ) {
    query = await client
      .from('transactions')
      .select('id, buyer_id, stage, attorney, assigned_attorney_email, finance_type, next_action, updated_at, created_at')
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

function buildOwnerDashboardMember(firm = {}, user = {}) {
  const nowIso = new Date().toISOString()
  return {
    id: `owner-admin-${firm.id}-${user.id}`,
    firmId: firm.id,
    userId: user.id,
    departmentId: null,
    role: 'firm_admin',
    status: 'active',
    invitedBy: user.id,
    joinedAt: firm.createdAt || nowIso,
    createdAt: firm.createdAt || nowIso,
    updatedAt: firm.updatedAt || nowIso,
  }
}

export async function getAttorneyManagementDashboardData(firmId = null) {
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

  const [departmentsRaw, membersRaw, invitesRaw, transactionsRaw, assignmentRows] = await Promise.all([
    getAttorneyFirmDepartments(resolvedFirm.id),
    getAttorneyFirmMembers(resolvedFirm.id),
    getAttorneyFirmInvitations(resolvedFirm.id),
    fetchTransactionsForDashboard(client),
    getFirmAttorneyAssignments(resolvedFirm.id, { includeInactive: true }),
  ])

  const ownerFallbackMembers =
    resolvedFirm.createdBy === authUser.id && !(membersRaw || []).some((member) => member.userId === authUser.id)
      ? [buildOwnerDashboardMember(resolvedFirm, authUser)]
      : []
  const dashboardMembers = [...(membersRaw || []), ...ownerFallbackMembers]

  const departments = departmentsRaw.filter((department) => department.isActive)
  const members = dashboardMembers.filter((member) => member.status !== 'suspended' && member.status !== 'removed')
  const activeMembers = members.filter((member) => member.status === 'active')

  const transactionsById = (transactionsRaw || []).reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})

  const [memberProfilesById, buyersById] = await Promise.all([
    fetchMemberProfilesMap(client, members),
    fetchBuyerMap(
      client,
      Object.values(transactionsById)
        .map((transaction) => transaction.buyer_id)
        .filter(Boolean),
    ),
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

  const weekStart = startOfWeek(new Date())
  const monthStart = startOfMonth(new Date())

  const uniqueTransactionIds = [...new Set(matterUnits.map((item) => item.transactionId).filter(Boolean))]
  const uniqueMatters = uniqueTransactionIds.map((id) => matterUnits.find((item) => item.transactionId === id)).filter(Boolean)

  const currentMemberRecord = activeMembers.find((member) => member.userId === authUser.id) || null
  const currentUserRole = currentMemberRecord?.role || null
  const canViewFirmDashboard = attorneyRoleHasPermission(currentUserRole, 'can_view_firm_dashboard')

  const transferAssignments = matterUnits.filter((item) => item.assignmentType === 'transfer' || item.assignmentType === 'transfer_and_bond')
  const bondAssignments = matterUnits.filter((item) => item.assignmentType === 'bond' || item.assignmentType === 'transfer_and_bond')

  const kpis = {
    activeMatters: uniqueMatters.length,
    transferMatters: transferAssignments.length,
    bondMatters: bondAssignments.length,
    lodgedThisWeek: uniqueMatters.filter((matter) => {
      const stage = toLower(matter.transaction?.stage)
      const mainStage = toLower(matter.transaction?.current_main_stage)
      const attorneyStage = toLower(matter.transaction?.attorney_stage)
      const lodged = stage.includes('lodged') || mainStage.includes('lodged') || attorneyStage === 'lodgement'
      return lodged && isAfter(matter.transaction?.updated_at || matter.transaction?.created_at, weekStart)
    }).length,
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
  }

  const departmentsById = departments.reduce((accumulator, department) => {
    accumulator[department.id] = department
    return accumulator
  }, {})

  const departmentOverview = departments.map((department) => {
    const membersInDepartment = activeMembers.filter((member) => member.departmentId === department.id)
    const assignmentsForDepartment = matterUnits.filter((matter) => matter.departmentId === department.id)

    const fallbackAssignments =
      assignmentsForDepartment.length === 0
        ? matterUnits.filter((matter) => {
            const type = matter.matterType
            const departmentType = String(department.departmentType || '').toLowerCase()
            if (departmentType === 'transfer') return type === 'transfer'
            if (departmentType === 'bond') return type === 'bond'
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

  const staffWorkload = members.map((member) => {
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
        matterReference:
          matter.transaction?.transaction_reference || `Transaction ${String(matter.transactionId || '').slice(0, 8)}`,
        clientName: buyerName || 'Unassigned client',
        department:
          departmentsById[matter.departmentId]?.name || (matter.matterType === 'bond' ? 'Bond Department' : 'Transfer Department'),
        currentStage:
          matter.transaction?.current_sub_stage_summary || matter.transaction?.stage || matter.transaction?.current_main_stage || 'Unknown',
        assignedUser: assignedProfile?.fullName || matter.transaction?.assigned_attorney_email || 'Unassigned',
        issue: matter.issue,
        lastUpdated: matter.transaction?.updated_at || matter.transaction?.created_at || null,
        actionLabel: 'Open Transaction',
        actionHref: `/transactions/${matter.transactionId}`,
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
      message: `Attorney assignment ${matter.assignmentStatus} for ${matter.transaction?.transaction_reference || `transaction ${String(matter.transactionId).slice(0, 8)}`}.`,
      occurredAt: matter.transaction?.updated_at || matter.transaction?.created_at || null,
    })),
  ]
    .filter((entry) => isTruthy(entry.occurredAt))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 12)

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
    departmentOverview,
    staffWorkload,
    mattersRequiringAttention,
    recentActivity,
  }
}
