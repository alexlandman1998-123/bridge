export const MVP_TRANSACTION_OVERRIDE_AUTHORIZATION_VERSION = 'arch9_mvp_transaction_override_authorization_v1'

const AUTHORISED_OVERRIDE_ROLES = new Set([
  'admin',
  'administrator',
  'agency_manager',
  'agency_principal',
  'broker_owner',
  'branch_manager',
  'director',
  'manager',
  'owner',
  'partner',
  'principal',
  'super_admin',
  'workspace_admin',
  'organisation_admin',
  'organization_admin',
])

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function actorRoleKeys(actor = {}) {
  return [
    actor.role,
    actor.appRole,
    actor.app_role,
    actor.membershipRole,
    actor.membership_role,
    actor.organisationRole,
    actor.organisation_role,
    actor.organizationRole,
    actor.organization_role,
  ].map(key).filter(Boolean)
}

export function resolveTransactionCreationOverrideReason(payload = {}, options = {}) {
  return firstText(
    payload.transactionCreationOverrideReason,
    payload.transaction_creation_override_reason,
    payload.overrideReason,
    payload.override_reason,
    options.transactionCreationOverrideReason,
    options.transaction_creation_override_reason,
    options.overrideReason,
    options.override_reason,
  )
}

export function assessMvpTransactionOverrideAuthorization({
  actor = {},
  payload = {},
  options = {},
  acceptedOfferId = '',
} = {}) {
  const reason = resolveTransactionCreationOverrideReason(payload, options)
  const roleKeys = actorRoleKeys(actor)
  const roleAuthorised = roleKeys.some((role) => AUTHORISED_OVERRIDE_ROLES.has(role))
  const actorAuthorised = Boolean(
    actor.isPrincipal === true ||
      actor.isAdmin === true ||
      actor.canCreateTransactionOverride === true ||
      actor.can_create_transaction_override === true ||
      roleAuthorised,
  )
  const actorId = firstText(actor.id, actor.userId, actor.user_id, actor.email)
  const issues = []

  if (text(acceptedOfferId)) issues.push('accepted_offer_present')
  if (!reason) issues.push('override_reason_missing')
  if (reason && reason.length < 12) issues.push('override_reason_too_short')
  if (!actorId) issues.push('override_actor_missing')
  if (!actorAuthorised) issues.push('override_actor_not_authorised')

  return {
    version: MVP_TRANSACTION_OVERRIDE_AUTHORIZATION_VERSION,
    authorised: issues.length === 0,
    reason: reason || null,
    actorId: actorId || null,
    actorRole: roleKeys[0] || null,
    actorAuthorised,
    issues,
  }
}

export function assertMvpTransactionOverrideAuthorization(input = {}) {
  const assessment = assessMvpTransactionOverrideAuthorization(input)
  if (assessment.authorised) return assessment
  const error = new Error('Manual transaction override requires an authorised principal/admin actor and a written override reason.')
  error.code = 'MVP_TRANSACTION_OVERRIDE_UNAUTHORISED'
  error.details = assessment
  throw error
}
