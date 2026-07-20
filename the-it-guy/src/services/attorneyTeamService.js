import {
  ATTORNEY_FIRM_ROLE_CATALOG,
  ATTORNEY_PROFESSIONAL_ROLE_VALUES,
  deriveAttorneyProfessionalProfile,
  getAllowedAttorneyDepartmentsForRole,
  getAttorneyProfessionalRoleLabel,
  normalizeAttorneyFirmRole,
  normalizeAttorneyPracticeQualifications,
  normalizeAttorneyProfessionalRole,
  resolveAttorneyCompatibilityRole,
} from '../constants/attorneyRoleCatalog.js'
import {
  acceptAttorneyFirmInvitation,
  getAttorneyFirmInvitations,
  inviteAttorneyFirmMember,
} from './attorneyFirmInvitations'
import {
  getAttorneyFirmMembers,
  removeAttorneyFirmMember,
  updateAttorneyFirmMember,
} from './attorneyFirmMembers'
import {
  isMissingTableError,
  isValidEmail,
  mapDepartmentRow,
  normalizeEmail,
  normalizeText,
  requireClient,
} from './attorneyFirmServiceShared'

export const ATTORNEY_TEAM_ASSIGNABLE_PROFESSIONAL_ROLES = Object.freeze(
  ATTORNEY_PROFESSIONAL_ROLE_VALUES.filter((role) => role !== 'firm_admin'),
)

export function getAttorneyTeamRoleOptions() {
  return ATTORNEY_TEAM_ASSIGNABLE_PROFESSIONAL_ROLES.map((role) => Object.freeze({
    value: role,
    label: getAttorneyProfessionalRoleLabel(role),
    requiresPracticeQualification: role === 'attorney_conveyancer',
  }))
}

export function getAllowedAttorneyTeamDepartments({ professionalRole, practiceQualifications } = {}, departments = []) {
  const profile = deriveAttorneyProfessionalProfile({ professionalRole, practiceQualifications })
  const compatibilityRole = resolveAttorneyCompatibilityRole(profile, 'viewer')
  const allowedTypes = profile.professionalRole === 'attorney_conveyancer'
    ? [...new Set(profile.practiceQualifications.map((qualification) => (
        qualification === 'bond' ? 'bond' : 'transfer'
      )))]
    : getAllowedAttorneyDepartmentsForRole(
        compatibilityRole,
        departments.map((department) => department.departmentType),
      )

  return departments.filter((department) => allowedTypes.includes(department.departmentType))
}

export function normalizeAttorneyTeamInvite(input = {}) {
  const email = normalizeEmail(input.email)
  if (!isValidEmail(email)) {
    throw new Error('A valid team member email address is required.')
  }

  const suppliedCompatibilityRole = normalizeAttorneyFirmRole(input.role, '')
  const professionalRole = normalizeAttorneyProfessionalRole(
    input.professionalRole || input.professional_role || suppliedCompatibilityRole,
    'viewer',
  )
  const practiceQualifications = normalizeAttorneyPracticeQualifications(
    input.practiceQualifications || input.practice_qualifications,
  )
  const profile = deriveAttorneyProfessionalProfile({
    role: suppliedCompatibilityRole,
    professionalRole,
    practiceQualifications,
  })
  const compatibilityRole = resolveAttorneyCompatibilityRole(
    profile,
    suppliedCompatibilityRole || 'viewer',
  )
  const roleDefinition = ATTORNEY_FIRM_ROLE_CATALOG[compatibilityRole]

  if (!roleDefinition?.inviteable || professionalRole === 'firm_admin') {
    throw new Error('Firm administrator access must be granted through the protected ownership workflow.')
  }
  if (professionalRole === 'attorney_conveyancer' && !profile.practiceQualifications.length) {
    throw new Error('Select at least one practice qualification for an attorney / conveyancer.')
  }

  const departmentType = normalizeText(input.departmentType || input.department_type).toLowerCase()
  if (departmentType) {
    const allowedDepartments = professionalRole === 'attorney_conveyancer'
      ? [...new Set(profile.practiceQualifications.map((qualification) => (
          qualification === 'bond' ? 'bond' : 'transfer'
        )))]
      : getAllowedAttorneyDepartmentsForRole(
          compatibilityRole,
          ['transfer', 'bond', 'admin', 'management'],
        )
    if (!allowedDepartments.includes(departmentType)) {
      throw new Error(`${getAttorneyProfessionalRoleLabel(professionalRole)} cannot be assigned to the selected department.`)
    }
  }

  return Object.freeze({
    email,
    role: compatibilityRole,
    professionalRole: profile.professionalRole,
    practiceQualifications: profile.practiceQualifications,
    departmentId: normalizeText(input.departmentId || input.department_id) || null,
    departmentType: departmentType || null,
    expiresInDays: Number.isFinite(Number(input.expiresInDays)) ? Number(input.expiresInDays) : 7,
  })
}

async function resolveDepartmentId(firmId, invite) {
  if (invite.departmentId || !invite.departmentType) return invite.departmentId
  const client = requireClient()
  const result = await client
    .from('attorney_firm_departments')
    .select('id')
    .eq('firm_id', firmId)
    .eq('department_type', invite.departmentType)
    .eq('is_active', true)
    .maybeSingle()

  if (result.error) {
    if (isMissingTableError(result.error, 'attorney_firm_departments')) {
      throw new Error('Attorney departments are not configured yet.')
    }
    throw result.error
  }
  if (!result.data?.id) {
    throw new Error('The selected attorney department is not active.')
  }
  return result.data.id
}

export async function inviteAttorneyTeamMember({ firmId, ...input } = {}) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) throw new Error('Firm id is required.')
  const invite = normalizeAttorneyTeamInvite(input)
  const departmentId = await resolveDepartmentId(normalizedFirmId, invite)

  return inviteAttorneyFirmMember({
    firmId: normalizedFirmId,
    email: invite.email,
    role: invite.role,
    professionalRole: invite.professionalRole,
    practiceQualifications: invite.practiceQualifications,
    departmentId,
    expiresInDays: invite.expiresInDays,
  })
}

export async function getAttorneyTeamDepartments(firmId) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) throw new Error('Firm id is required.')
  const result = await requireClient()
    .from('attorney_firm_departments')
    .select('id, firm_id, name, department_type, is_active, created_at, updated_at')
    .eq('firm_id', normalizedFirmId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (result.error) {
    if (isMissingTableError(result.error, 'attorney_firm_departments')) return []
    throw result.error
  }
  return (result.data || []).map(mapDepartmentRow)
}

export async function getAttorneyTeamRoster(firmId) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) throw new Error('Firm id is required.')
  const [members, invitations] = await Promise.all([
    getAttorneyFirmMembers(normalizedFirmId),
    getAttorneyFirmInvitations(normalizedFirmId, { status: 'pending' }),
  ])
  const userIds = [...new Set(members.map((member) => member.userId).filter(Boolean))]
  const organisationUserIds = [...new Set(members.map((member) => member.organisationUserId).filter(Boolean))]
  const client = requireClient()
  const [profileResult, organisationUserResult] = await Promise.all([
    userIds.length
      ? client.from('profiles').select('id, full_name, first_name, last_name, email').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    organisationUserIds.length
      ? client.from('organisation_users').select('id, first_name, last_name, email, last_active_at').in('id', organisationUserIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const profiles = profileResult.error ? [] : (profileResult.data || [])
  const organisationUsers = organisationUserResult.error ? [] : (organisationUserResult.data || [])
  const profileByUserId = new Map(profiles.map((profile) => [profile.id, profile]))
  const organisationUserById = new Map(organisationUsers.map((user) => [user.id, user]))
  const activeEmails = new Set()
  const roster = members.map((member) => {
    const profile = profileByUserId.get(member.userId) || {}
    const organisationUser = organisationUserById.get(member.organisationUserId) || {}
    const firstName = normalizeText(organisationUser.first_name || profile.first_name)
    const lastName = normalizeText(organisationUser.last_name || profile.last_name)
    const email = normalizeEmail(organisationUser.email || profile.email)
    if (email) activeEmails.add(email)
    return {
      ...member,
      firstName,
      lastName,
      fullName: normalizeText(profile.full_name) || [firstName, lastName].filter(Boolean).join(' '),
      email,
      lastActiveAt: organisationUser.last_active_at || member.updatedAt || member.joinedAt || null,
      source: 'membership',
      isPendingInvitation: false,
    }
  })

  invitations.forEach((invitation) => {
    if (activeEmails.has(normalizeEmail(invitation.email))) return
    roster.push({
      ...invitation,
      id: `invitation:${invitation.id}`,
      invitationId: invitation.id,
      firstName: '',
      lastName: '',
      fullName: '',
      lastActiveAt: null,
      source: 'invitation',
      isPendingInvitation: true,
    })
  })

  return { members, invitations, roster }
}

export async function updateAttorneyTeamMember(memberId, patch = {}) {
  const normalizedMemberId = normalizeText(memberId)
  if (!normalizedMemberId) throw new Error('Member id is required.')
  if (patch.role !== undefined) {
    throw new Error('Use the canonical professional role field when changing attorney team access.')
  }

  const client = requireClient()
  const existingResult = await client
    .from('attorney_firm_members')
    .select('id, firm_id, role, professional_role, practice_qualifications, department_id')
    .eq('id', normalizedMemberId)
    .maybeSingle()
  if (existingResult.error) throw existingResult.error
  if (!existingResult.data) throw new Error('Attorney firm member could not be found.')
  if (existingResult.data.role === 'firm_admin' || existingResult.data.professional_role === 'firm_admin') {
    throw new Error('Firm administrator access must be changed through the protected ownership workflow.')
  }

  const professionalRole = patch.professionalRole === undefined
    ? normalizeAttorneyProfessionalRole(existingResult.data.professional_role, 'viewer')
    : normalizeAttorneyProfessionalRole(patch.professionalRole, '')
  if (!professionalRole) {
    throw new Error('Select an approved attorney professional role.')
  }
  if (professionalRole === 'firm_admin') {
    throw new Error('Firm administrator access must be changed through the protected ownership workflow.')
  }
  const practiceQualifications = patch.practiceQualifications === undefined
    ? normalizeAttorneyPracticeQualifications(existingResult.data.practice_qualifications)
    : normalizeAttorneyPracticeQualifications(patch.practiceQualifications)
  if (professionalRole === 'attorney_conveyancer' && !practiceQualifications?.length) {
    throw new Error('Select at least one practice qualification for an attorney / conveyancer.')
  }
  const departmentId = patch.departmentId === undefined
    ? existingResult.data.department_id
    : normalizeText(patch.departmentId) || null
  if (departmentId) {
    const departmentResult = await client
      .from('attorney_firm_departments')
      .select('id, firm_id, name, department_type, is_active')
      .eq('id', departmentId)
      .eq('firm_id', existingResult.data.firm_id)
      .eq('is_active', true)
      .maybeSingle()
    if (departmentResult.error) throw departmentResult.error
    if (!departmentResult.data) throw new Error('The selected attorney department is not active for this firm.')
    const allowedDepartments = getAllowedAttorneyTeamDepartments(
      { professionalRole, practiceQualifications },
      [mapDepartmentRow(departmentResult.data)],
    )
    if (!allowedDepartments.length) {
      throw new Error(`${getAttorneyProfessionalRoleLabel(professionalRole)} cannot be assigned to the selected department.`)
    }
  }

  return updateAttorneyFirmMember(normalizedMemberId, {
    ...patch,
    professionalRole,
    practiceQualifications,
    departmentId,
  })
}

export async function removeAttorneyTeamMember(memberId) {
  const normalizedMemberId = normalizeText(memberId)
  if (!normalizedMemberId) throw new Error('Member id is required.')
  const result = await requireClient()
    .from('attorney_firm_members')
    .select('id, role, professional_role')
    .eq('id', normalizedMemberId)
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data) return null
  if (result.data.role === 'firm_admin' || result.data.professional_role === 'firm_admin') {
    throw new Error('Firm administrator access must be changed through the protected ownership workflow.')
  }
  return removeAttorneyFirmMember(normalizedMemberId)
}

export async function acceptAttorneyTeamInvitation(token) {
  return acceptAttorneyFirmInvitation(token)
}
