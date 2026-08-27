export const MVP_TRANSACTION_OVERRIDE_AUTHORIZATION_VERSION = 'arch9_mvp_transaction_override_authorization_v1'
export const SIGNED_OTP_INTAKE_AUTHORIZATION_VERSION = 'arch9_signed_otp_intake_authorization_v1'
export const SIGNED_OTP_INTAKE_CREATION_MODE = 'signed_otp_intake'
export const BUYER_ONBOARDING_INTAKE_AUTHORIZATION_VERSION = 'arch9_buyer_onboarding_intake_authorization_v1'
export const BUYER_ONBOARDING_INTAKE_CREATION_MODE = 'buyer_onboarding_intake'

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

function resolveCreationMode(payload = {}, options = {}) {
  return key(
    payload.creationMode ||
      payload.creation_mode ||
      options.creationMode ||
      options.creation_mode,
  )
}

function resolveSignedOtpEvidence(payload = {}, options = {}) {
  const evidence =
    payload.signedOtpEvidence ||
    payload.signed_otp_evidence ||
    options.signedOtpEvidence ||
    options.signed_otp_evidence ||
    {}
  return evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence : {}
}

function resolveAssignedAgentIdentity(payload = {}, options = {}) {
  return {
    id: firstText(
      payload.assignedAgentId,
      payload.assigned_agent_id,
      options.assignedAgentId,
      options.assigned_agent_id,
    ),
    email: firstText(
      payload.assignedAgentEmail,
      payload.assigned_agent_email,
      options.assignedAgentEmail,
      options.assigned_agent_email,
    ).toLowerCase(),
  }
}

function actorMatchesAssignedAgent(actor = {}, payload = {}, options = {}) {
  const assigned = resolveAssignedAgentIdentity(payload, options)
  const actorIds = [actor.id, actor.userId, actor.user_id].map(text).filter(Boolean)
  const actorEmails = [actor.email, actor.userEmail, actor.user_email].map((value) => text(value).toLowerCase()).filter(Boolean)
  return Boolean(
    (assigned.id && actorIds.includes(assigned.id)) ||
      (assigned.email && actorEmails.includes(assigned.email)),
  )
}

function assessSignedOtpEvidence(evidence = {}) {
  const storagePath = firstText(evidence.storagePath, evidence.storage_path, evidence.filePath, evidence.file_path)
  const uploadedAt = firstText(evidence.uploadedAt, evidence.uploaded_at)
  const signedByAllPartiesConfirmed =
    evidence.signedByAllPartiesConfirmed === true || evidence.signed_by_all_parties_confirmed === true
  const arch9TermsIncludedConfirmed =
    evidence.arch9TermsIncludedConfirmed === true || evidence.arch9_terms_included_confirmed === true
  const issues = []
  if (!storagePath) issues.push('signed_otp_storage_path_missing')
  if (!uploadedAt) issues.push('signed_otp_uploaded_at_missing')
  if (!signedByAllPartiesConfirmed) issues.push('signed_otp_parties_confirmation_missing')
  if (!arch9TermsIncludedConfirmed) issues.push('signed_otp_terms_confirmation_missing')
  return {
    ready: issues.length === 0,
    storagePath: storagePath || null,
    uploadedAt: uploadedAt || null,
    signedByAllPartiesConfirmed,
    arch9TermsIncludedConfirmed,
    issues,
  }
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
  const creationMode = resolveCreationMode(payload, options)
  const signedOtpIntake = creationMode === SIGNED_OTP_INTAKE_CREATION_MODE
  const buyerOnboardingIntake = creationMode === BUYER_ONBOARDING_INTAKE_CREATION_MODE
  const assignedBuyerIntake = signedOtpIntake || buyerOnboardingIntake
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
  const assignedAgentMatch = actorMatchesAssignedAgent(actor, payload, options)
  const signedOtpEvidence = assessSignedOtpEvidence(resolveSignedOtpEvidence(payload, options))
  const issues = []

  if (text(acceptedOfferId)) issues.push('accepted_offer_present')
  if (!actorId) issues.push('override_actor_missing')
  if (assignedBuyerIntake) {
    if (!assignedAgentMatch && !actorAuthorised) issues.push('buyer_intake_actor_not_assigned')
    if (signedOtpIntake) issues.push(...signedOtpEvidence.issues)
  } else {
    if (!reason) issues.push('override_reason_missing')
    if (reason && reason.length < 12) issues.push('override_reason_too_short')
    if (!actorAuthorised) issues.push('override_actor_not_authorised')
  }

  return {
    version: signedOtpIntake
      ? SIGNED_OTP_INTAKE_AUTHORIZATION_VERSION
      : buyerOnboardingIntake
        ? BUYER_ONBOARDING_INTAKE_AUTHORIZATION_VERSION
        : MVP_TRANSACTION_OVERRIDE_AUTHORIZATION_VERSION,
    authorised: issues.length === 0,
    authorizationType: signedOtpIntake
      ? SIGNED_OTP_INTAKE_CREATION_MODE
      : buyerOnboardingIntake
        ? BUYER_ONBOARDING_INTAKE_CREATION_MODE
        : 'manual_override',
    creationMode: creationMode || null,
    reason: reason || null,
    actorId: actorId || null,
    actorRole: roleKeys[0] || null,
    actorAuthorised,
    assignedAgentMatch,
    signedOtpEvidence: signedOtpIntake ? signedOtpEvidence : null,
    issues,
  }
}

export function assertMvpTransactionOverrideAuthorization(input = {}) {
  const assessment = assessMvpTransactionOverrideAuthorization(input)
  if (assessment.authorised) return assessment
  const signedOtpIntake = assessment.authorizationType === SIGNED_OTP_INTAKE_CREATION_MODE
  const buyerOnboardingIntake = assessment.authorizationType === BUYER_ONBOARDING_INTAKE_CREATION_MODE
  const error = new Error(signedOtpIntake
    ? 'Signed OTP intake requires complete upload evidence and the assigned agent or an authorised manager.'
    : buyerOnboardingIntake
      ? 'Buyer onboarding intake requires the assigned agent or an authorised manager.'
      : 'Manual transaction override requires an authorised principal/admin actor and a written override reason.')
  error.code = signedOtpIntake
    ? 'SIGNED_OTP_INTAKE_UNAUTHORISED'
    : buyerOnboardingIntake
      ? 'BUYER_ONBOARDING_INTAKE_UNAUTHORISED'
      : 'MVP_TRANSACTION_OVERRIDE_UNAUTHORISED'
  error.details = assessment
  throw error
}
