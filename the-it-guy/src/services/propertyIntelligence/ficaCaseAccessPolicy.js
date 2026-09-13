const PRIVILEGED_ROLES = new Set(['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin', 'compliance_officer', 'compliance_reviewer'])
const CASE_CREATOR_ROLES = new Set([...PRIVILEGED_ROLES, 'agent'])

function includes(values, value) {
  return Array.isArray(values) && values.includes(value)
}

export function canReadFicaCase({ userId, role, caseRecord = {}, tokenExpired = false } = {}) {
  if (!userId || tokenExpired) return false
  return PRIVILEGED_ROLES.has(role)
    || caseRecord.subject_user_id === userId
    || includes(caseRecord.shared_party_user_ids, userId)
    || includes(caseRecord.assigned_staff_user_ids, userId)
}

export function canCreateFicaCase({ userId, role, tokenExpired = false } = {}) {
  return Boolean(userId) && !tokenExpired && CASE_CREATOR_ROLES.has(role)
}

export function canApproveOrGenerateFicaCertificate({ userId, role, tokenExpired = false } = {}) {
  return Boolean(userId) && !tokenExpired && PRIVILEGED_ROLES.has(role)
}
