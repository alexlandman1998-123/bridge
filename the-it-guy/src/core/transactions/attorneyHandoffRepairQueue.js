export const ATTORNEY_HANDOFF_REPAIR_QUEUE_VERSION = 'arch9_attorney_handoff_repair_queue_v1'
export const ATTORNEY_HANDOFF_REPAIR_QUEUE_KEY = 'attorney_handoff_repair'

const ATTORNEY_ROLES = new Set(['transfer_attorney', 'bond_attorney', 'cancellation_attorney'])
const ACTIVE_ROLE_STATUSES = new Set(['', 'active', 'assigned', 'current', 'pending', 'selected', 'in_progress', 'started'])
const BROKEN_ROLE_STATUSES = new Set(['removed', 'declined', 'rejected', 'cancelled', 'inactive'])
const SIGNED_OTP_STATUSES = new Set(['signed_otp_received', 'otp_uploaded'])

const ROLE_LABELS = Object.freeze({
  transfer_attorney: 'Transfer attorney',
  bond_attorney: 'Bond attorney',
  cancellation_attorney: 'Cancellation attorney',
})

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase().replace(/[\s/-]+/g, '_')
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function truthy(value) {
  if (value === true) return true
  const normalized = lower(value)
  return ['1', 'true', 'yes', 'y', 'required', 'requires', 'needed'].includes(normalized)
}

function roleRows(input = {}) {
  return [
    ...(Array.isArray(input.rolePlayers) ? input.rolePlayers : []),
    ...(Array.isArray(input.role_players) ? input.role_players : []),
    ...(Array.isArray(input.transactionRolePlayers) ? input.transactionRolePlayers : []),
    ...(Array.isArray(input.transaction_role_players) ? input.transaction_role_players : []),
    ...(Array.isArray(input.transaction?.rolePlayers) ? input.transaction.rolePlayers : []),
    ...(Array.isArray(input.transaction?.transactionRolePlayers) ? input.transaction.transactionRolePlayers : []),
    ...(Array.isArray(input.transaction?.transaction_role_players) ? input.transaction.transaction_role_players : []),
  ]
}

function roleType(row = {}) {
  const normalized = lower(row.roleType || row.role_type || row.role || row.transactionRole || row.transaction_role)
  if (normalized === 'attorney' || normalized === 'conveyancer') return 'transfer_attorney'
  return normalized
}

function roleStatus(row = {}) {
  return lower(row.assignmentStatus || row.assignment_status || row.status)
}

function roleHasContact(row = {}) {
  return Boolean(
    firstText(
      row.id,
      row.organisationId,
      row.organisation_id,
      row.partnerOrganisationId,
      row.partner_organisation_id,
      row.companyName,
      row.company_name,
      row.partnerName,
      row.partner_name,
      row.contactPerson,
      row.contact_person,
      row.email,
      row.emailAddress,
      row.email_address,
      row.userId,
      row.user_id,
    ),
  )
}

function hasActiveRole(role, rows = []) {
  return rows.some((row) => {
    if (roleType(row) !== role) return false
    const status = roleStatus(row)
    return ACTIVE_ROLE_STATUSES.has(status) && roleHasContact(row)
  })
}

function hasBrokenRole(role, rows = []) {
  return rows.some((row) => roleType(row) === role && BROKEN_ROLE_STATUSES.has(roleStatus(row)))
}

function hasTransactionAttorneySignal(role, transaction = {}) {
  if (role === 'transfer_attorney') {
    return Boolean(
      firstText(
        transaction.assigned_attorney_email,
        transaction.assignedAttorneyEmail,
        transaction.transfer_attorney_email,
        transaction.transferAttorneyEmail,
        transaction.attorney,
        transaction.transfer_attorney,
        transaction.transferAttorney,
        transaction.attorney_firm_id,
        transaction.attorneyFirmId,
      ),
    )
  }

  if (role === 'bond_attorney') {
    return Boolean(
      firstText(
        transaction.assigned_bond_attorney_email,
        transaction.assignedBondAttorneyEmail,
        transaction.bond_attorney_email,
        transaction.bondAttorneyEmail,
        transaction.bond_attorney,
        transaction.bondAttorney,
      ),
    )
  }

  if (role === 'cancellation_attorney') {
    return Boolean(
      firstText(
        transaction.assigned_cancellation_attorney_email,
        transaction.assignedCancellationAttorneyEmail,
        transaction.cancellation_attorney_email,
        transaction.cancellationAttorneyEmail,
        transaction.cancellation_attorney,
        transaction.cancellationAttorney,
      ),
    )
  }

  return false
}

function roleCovered(role, { transaction = {}, rolePlayers = [] } = {}) {
  return hasTransactionAttorneySignal(role, transaction) || hasActiveRole(role, rolePlayers)
}

function requiresCancellationAttorney({ transaction = {}, routingProfile = {} } = {}) {
  return Boolean(
    truthy(routingProfile.requiresCancellationAttorney) ||
      truthy(routingProfile.cancellationRequired) ||
      truthy(transaction.requires_cancellation_attorney) ||
      truthy(transaction.requiresCancellationAttorney) ||
      truthy(transaction.cancellation_required) ||
      truthy(transaction.cancellationRequired) ||
      truthy(transaction.seller_has_existing_bond) ||
      truthy(transaction.sellerHasExistingBond) ||
      truthy(transaction.existing_bond) ||
      truthy(transaction.existingBond),
  )
}

function requiresBondAttorney({ transaction = {}, routingProfile = {}, rolePlayers = [] } = {}) {
  return Boolean(
    truthy(routingProfile.requiresBondAttorney) ||
      truthy(transaction.requires_bond_attorney) ||
      truthy(transaction.requiresBondAttorney) ||
      roleRows({ rolePlayers }).some((row) => roleType(row) === 'bond_attorney'),
  )
}

function hasSignedOtp(transaction = {}, completionHook = {}) {
  const status = lower(transaction.onboarding_status || transaction.onboardingStatus || completionHook.onboardingStatus)
  return SIGNED_OTP_STATUSES.has(status) ||
    Boolean(firstText(transaction.signed_otp_received_at, transaction.signedOtpReceivedAt, transaction.otp_uploaded_at, transaction.otpUploadedAt))
}

function reason(role, key, detail, action = '') {
  return {
    key,
    role,
    label: ROLE_LABELS[role] || role,
    detail,
    action,
  }
}

function requiredRolesForTransaction({ transaction = {}, routingProfile = {}, rolePlayers = [] } = {}) {
  const roles = ['transfer_attorney']
  if (requiresBondAttorney({ transaction, routingProfile, rolePlayers })) roles.push('bond_attorney')
  if (requiresCancellationAttorney({ transaction, routingProfile })) roles.push('cancellation_attorney')
  return roles
}

export function buildAttorneyHandoffRepairQueueCandidate({
  transaction = {},
  onboarding = {},
  rolePlayers = [],
  routingProfile = {},
  completionHook = {},
  completedAt = '',
  source = 'buyer_onboarding_completed',
} = {}) {
  const transactionId = firstText(transaction.id, transaction.transactionId, transaction.transaction_id, onboarding.transaction_id)
  const rows = roleRows({ rolePlayers, transaction })
  const requiredRoles = requiredRolesForTransaction({ transaction, routingProfile, rolePlayers: rows })
  const signedOtp = hasSignedOtp(transaction, completionHook)
  const reasons = []

  for (const role of requiredRoles) {
    if (!ATTORNEY_ROLES.has(role)) continue
    const covered = roleCovered(role, { transaction, rolePlayers: rows })
    const broken = hasBrokenRole(role, rows)

    if (broken && !covered) {
      reasons.push(reason(
        role,
        `${role}_declined_or_removed`,
        `${ROLE_LABELS[role]} was removed, declined, or rejected and has not been replaced.`,
        `Replace the ${ROLE_LABELS[role].toLowerCase()} before handoff continues.`,
      ))
      continue
    }

    if (!covered) {
      reasons.push(reason(
        role,
        `${role}_missing`,
        `${ROLE_LABELS[role]} is required for this transaction, but no active assignment or role-player is linked.`,
        `Assign a ${ROLE_LABELS[role].toLowerCase()} before handoff continues.`,
      ))
    }
  }

  if (!signedOtp) {
    reasons.push(reason(
      'transfer_attorney',
      'awaiting_signed_otp',
      'Transfer handoff remains gated until the signed OTP is uploaded.',
      completionHook.nextAction || 'Upload the signed OTP before legal handoff is released.',
    ))
  }

  const repairReasons = reasons.filter((item) => item.key !== 'awaiting_signed_otp')
  const required = repairReasons.length > 0
  const status = required ? 'queued' : signedOtp ? 'covered' : 'monitor'
  const priority = repairReasons.some((item) => item.key.includes('transfer_attorney')) ? 'high' : required ? 'normal' : 'low'
  const nextAction = repairReasons[0]?.action || reasons[0]?.action || ''

  return {
    version: ATTORNEY_HANDOFF_REPAIR_QUEUE_VERSION,
    queueKey: ATTORNEY_HANDOFF_REPAIR_QUEUE_KEY,
    required,
    status,
    priority,
    transactionId: transactionId || null,
    onboardingId: firstText(onboarding.id, onboarding.onboardingId) || null,
    completedAt: firstText(completedAt, completionHook.completedAt) || null,
    requiredRoles,
    coveredRoles: requiredRoles.filter((role) => roleCovered(role, { transaction, rolePlayers: rows })),
    signedOtp,
    reasons,
    nextAction,
    event: required
      ? {
          type: 'attorney_handoff_repair_queue_candidate',
          data: {
            version: ATTORNEY_HANDOFF_REPAIR_QUEUE_VERSION,
            queueKey: ATTORNEY_HANDOFF_REPAIR_QUEUE_KEY,
            status,
            priority,
            source,
            requiredRoles,
            coveredRoles: requiredRoles.filter((role) => roleCovered(role, { transaction, rolePlayers: rows })),
            signedOtp,
            reasonKeys: reasons.map((item) => item.key),
            nextAction,
          },
        }
      : null,
  }
}
