import { normalizeProperty24Text } from './client.js'

function normalizeEmail(value = '') {
  return normalizeProperty24Text(value).toLowerCase()
}

function normalizePhone(value = '') {
  return normalizeProperty24Text(value).replace(/[^0-9+]+/g, '')
}

function profileError(code, message, status = 400) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

export function normalizeCanonicalProperty24AgentProfile({ membership = {}, profile = {} } = {}) {
  const firstName = normalizeProperty24Text(profile.first_name || profile.firstName || membership.first_name || membership.firstName)
  const lastName = normalizeProperty24Text(profile.last_name || profile.lastName || membership.last_name || membership.lastName)
  const email = normalizeEmail(profile.email || membership.email)
  const fullName = normalizeProperty24Text(
    profile.full_name || profile.fullName || membership.full_name || membership.fullName || [firstName, lastName].filter(Boolean).join(' ') || email,
  )
  const nameParts = fullName.split(/\s+/).filter(Boolean)
  const status = normalizeProperty24Text(membership.membership_status || membership.status || 'active').toLowerCase()

  return {
    userId: normalizeProperty24Text(membership.user_id || membership.userId || profile.id),
    membershipId: normalizeProperty24Text(membership.id),
    firstName: firstName || nameParts[0] || '',
    lastName: lastName || nameParts.slice(1).join(' '),
    fullName,
    email,
    phone: normalizePhone(
      profile.phone_number || profile.phoneNumber || profile.phone || membership.phone_number || membership.phoneNumber || membership.phone || membership.mobile,
    ),
    avatarUrl: normalizeProperty24Text(
      profile.avatar_url || profile.avatarUrl || membership.avatar_url || membership.avatarUrl,
    ),
    jobTitle: normalizeProperty24Text(membership.job_title || membership.jobTitle || 'Agent'),
    status,
  }
}

export async function fetchCanonicalProperty24AgentProfile({
  supabase,
  organisationId,
  arch9UserId = '',
  arch9MembershipId = '',
} = {}) {
  if (!supabase?.from) throw profileError('supabase_required', 'Supabase client is required.', 500)
  const normalizedOrganisationId = normalizeProperty24Text(organisationId)
  const normalizedUserId = normalizeProperty24Text(arch9UserId)
  const normalizedMembershipId = normalizeProperty24Text(arch9MembershipId)
  if (!normalizedOrganisationId) throw profileError('organisation_id_required', 'Organisation ID is required.')
  if (!normalizedUserId && !normalizedMembershipId) {
    throw profileError('arch9_agent_id_required', 'Choose an Arch9 agent profile before creating a Property24 agent.')
  }

  let membershipQuery = supabase
    .from('organisation_users')
    .select('*')
    .eq('organisation_id', normalizedOrganisationId)
  membershipQuery = normalizedMembershipId
    ? membershipQuery.eq('id', normalizedMembershipId)
    : membershipQuery.eq('user_id', normalizedUserId)
  const membershipResult = await membershipQuery.maybeSingle()
  if (membershipResult.error && membershipResult.error.code !== 'PGRST116') throw membershipResult.error
  if (!membershipResult.data) {
    throw profileError('arch9_agent_not_found', 'The selected Arch9 agent does not belong to this organisation.', 404)
  }

  const membership = membershipResult.data
  const userId = normalizeProperty24Text(membership.user_id || normalizedUserId)
  const email = normalizeEmail(membership.email)
  let profile = null
  if (userId || email) {
    let profileQuery = supabase
      .from('profiles')
      .select('id, email, first_name, last_name, full_name, phone_number, avatar_url')
    profileQuery = userId ? profileQuery.eq('id', userId) : profileQuery.eq('email', email)
    const profileResult = await profileQuery.maybeSingle()
    if (profileResult.error && profileResult.error.code !== 'PGRST116') throw profileResult.error
    profile = profileResult.data || null
  }

  const canonical = normalizeCanonicalProperty24AgentProfile({ membership, profile: profile || {} })
  if (['inactive', 'deactivated', 'revoked', 'removed', 'archived', 'disabled'].includes(canonical.status)) {
    throw profileError('arch9_agent_inactive', 'Reactivate the Arch9 agent before creating or updating their Property24 profile.', 409)
  }
  return canonical
}
