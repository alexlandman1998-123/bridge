import {
  ATTORNEY_FIRM_MEMBER_STATUS_VALUES,
  ATTORNEY_FIRM_ROLE_VALUES,
  normalizeAttorneyFirmMemberStatus,
  normalizeAttorneyFirmRole,
} from '../lib/attorneyPermissions'
import {
  deriveAttorneyProfessionalProfile,
  resolveAttorneyCompatibilityRole,
} from '../constants/attorneyRoleCatalog.js'
import {
  getAuthenticatedUser,
  isMissingColumnError,
  isMissingTableError,
  mapMemberRow,
  normalizeText,
  requireClient,
} from './attorneyFirmServiceShared'
import {
  ATTORNEY_DEMO_DEPARTMENTS,
  ATTORNEY_DEMO_FIRM_ID,
  buildAttorneyDemoMembership,
  isAttorneyDemoContextEnabled,
} from '../lib/attorneyDemoContext'

function assertRole(value) {
  const normalized = normalizeAttorneyFirmRole(value, '')
  if (!ATTORNEY_FIRM_ROLE_VALUES.includes(normalized)) {
    throw new Error('Role must be one of the approved attorney firm roles.')
  }
  return normalized
}

function assertStatus(value) {
  const normalized = normalizeAttorneyFirmMemberStatus(value, '')
  if (!ATTORNEY_FIRM_MEMBER_STATUS_VALUES.includes(normalized)) {
    throw new Error('Status must be one of invited, active, suspended, or removed.')
  }
  return normalized
}

function resolveProfessionalWriteProfile({ role, professionalRole, practiceQualifications } = {}) {
  const profile = deriveAttorneyProfessionalProfile({ role, professionalRole, practiceQualifications })
  return {
    ...profile,
    role: resolveAttorneyCompatibilityRole(profile, normalizeAttorneyFirmRole(role, 'viewer')),
  }
}

async function ensureActiveFirmAdminRemaining(client, firmId, excludingMemberId = null) {
  let query = client
    .from('attorney_firm_members')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .eq('role', 'firm_admin')
    .eq('status', 'active')

  if (excludingMemberId) {
    query = query.neq('id', excludingMemberId)
  }

  const countQuery = await query
  if (countQuery.error) {
    if (isMissingTableError(countQuery.error, 'attorney_firm_members')) {
      throw new Error('Attorney firm members table is not set up yet.')
    }
    throw countQuery.error
  }

  const count = Number(countQuery.count || 0)
  if (count <= 0) {
    throw new Error('A firm must always have at least one active firm admin.')
  }
}

export async function getAttorneyFirmMembers(firmId) {
  const client = requireClient()
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }

  if (isAttorneyDemoContextEnabled() && normalizedFirmId === ATTORNEY_DEMO_FIRM_ID) {
    try {
      const authUser = await getAuthenticatedUser(client)
      return [
        buildAttorneyDemoMembership({
          userId: authUser.id,
          departmentId: ATTORNEY_DEMO_DEPARTMENTS[0]?.id || null,
          role: 'firm_admin',
        }),
      ]
    } catch {
      return [
        buildAttorneyDemoMembership({
          userId: '',
          departmentId: ATTORNEY_DEMO_DEPARTMENTS[0]?.id || null,
          role: 'firm_admin',
        }),
      ]
    }
  }

  const query = await client
    .from('attorney_firm_members')
    .select('id, firm_id, user_id, department_id, role, professional_role, practice_qualifications, organisation_user_id, status, invited_by, joined_at, created_at, updated_at')
    .eq('firm_id', normalizedFirmId)
    .order('created_at', { ascending: true })

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firm_members')) {
      if (isAttorneyDemoContextEnabled()) {
        try {
          const authUser = await getAuthenticatedUser(client)
          return [
            buildAttorneyDemoMembership({
              userId: authUser.id,
              departmentId: ATTORNEY_DEMO_DEPARTMENTS[0]?.id || null,
              role: 'firm_admin',
            }),
          ]
        } catch {
          return [
            buildAttorneyDemoMembership({
              userId: '',
              departmentId: ATTORNEY_DEMO_DEPARTMENTS[0]?.id || null,
              role: 'firm_admin',
            }),
          ]
        }
      }
      return []
    }
    throw query.error
  }

  return (query.data || []).map(mapMemberRow)
}

export async function updateAttorneyFirmMember(memberId, payload = {}) {
  const client = requireClient()
  const normalizedMemberId = normalizeText(memberId)
  if (!normalizedMemberId) {
    throw new Error('Member id is required.')
  }

  const existingQuery = await client
    .from('attorney_firm_members')
    .select('id, firm_id, role, professional_role, practice_qualifications, status')
    .eq('id', normalizedMemberId)
    .maybeSingle()

  if (existingQuery.error) {
    if (isMissingTableError(existingQuery.error, 'attorney_firm_members')) {
      throw new Error('Attorney firm members table is not set up yet.')
    }
    throw existingQuery.error
  }

  if (!existingQuery.data) {
    throw new Error('Attorney firm member could not be found.')
  }

  const role = payload.role !== undefined ? assertRole(payload.role) : existingQuery.data.role
  const status = payload.status !== undefined ? assertStatus(payload.status) : existingQuery.data.status
  const professionalProfile = resolveProfessionalWriteProfile({
    role,
    professionalRole: payload.professionalRole !== undefined
      ? payload.professionalRole
      : existingQuery.data.professional_role,
    practiceQualifications: payload.practiceQualifications !== undefined
      ? payload.practiceQualifications
      : existingQuery.data.practice_qualifications,
  })
  const compatibilityRole = payload.professionalRole !== undefined || payload.practiceQualifications !== undefined
    ? professionalProfile.role
    : role

  const existingWasActiveAdmin = existingQuery.data.role === 'firm_admin' && existingQuery.data.status === 'active'
  const stillActiveAdmin = compatibilityRole === 'firm_admin' && status === 'active'

  if (existingWasActiveAdmin && !stillActiveAdmin) {
    await ensureActiveFirmAdminRemaining(client, existingQuery.data.firm_id, existingQuery.data.id)
  }

  const updatePayload = {
    role: compatibilityRole,
    professional_role: professionalProfile.professionalRole,
    practice_qualifications: professionalProfile.practiceQualifications,
    status,
  }

  if (payload.departmentId !== undefined) {
    updatePayload.department_id = payload.departmentId || null
  }
  if (payload.joinedAt !== undefined) {
    updatePayload.joined_at = payload.joinedAt || null
  }

  const query = await client
    .from('attorney_firm_members')
    .update(updatePayload)
    .eq('id', normalizedMemberId)
    .select('id, firm_id, user_id, department_id, role, professional_role, practice_qualifications, organisation_user_id, status, invited_by, joined_at, created_at, updated_at')
    .single()

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firm_members')) {
      throw new Error('Attorney firm members table is not set up yet.')
    }
    throw query.error
  }

  const updatedMember = mapMemberRow(query.data)

  if (updatedMember.userId) {
    const profilePatch = {
      attorney_role: updatedMember.role,
    }
    if (status === 'active') {
      profilePatch.primary_attorney_firm_id = updatedMember.firmId
    }

    const profileUpdate = await client
      .from('profiles')
      .update(profilePatch)
      .eq('id', updatedMember.userId)

    if (profileUpdate.error && !isMissingColumnError(profileUpdate.error, 'primary_attorney_firm_id')) {
      throw profileUpdate.error
    }
  }

  return updatedMember
}

export async function removeAttorneyFirmMember(memberId) {
  const client = requireClient()
  const normalizedMemberId = normalizeText(memberId)
  if (!normalizedMemberId) {
    throw new Error('Member id is required.')
  }

  const existingQuery = await client
    .from('attorney_firm_members')
    .select('id, firm_id, role, status')
    .eq('id', normalizedMemberId)
    .maybeSingle()

  if (existingQuery.error) {
    if (isMissingTableError(existingQuery.error, 'attorney_firm_members')) {
      throw new Error('Attorney firm members table is not set up yet.')
    }
    throw existingQuery.error
  }

  if (!existingQuery.data) {
    return null
  }

  if (existingQuery.data.role === 'firm_admin' && existingQuery.data.status === 'active') {
    await ensureActiveFirmAdminRemaining(client, existingQuery.data.firm_id, existingQuery.data.id)
  }

  const deleteQuery = await client
    .from('attorney_firm_members')
    .delete()
    .eq('id', normalizedMemberId)

  if (deleteQuery.error) {
    if (isMissingTableError(deleteQuery.error, 'attorney_firm_members')) {
      throw new Error('Attorney firm members table is not set up yet.')
    }
    throw deleteQuery.error
  }

  return { id: normalizedMemberId, removed: true }
}

export async function createOrActivateAttorneyFirmMember({
  firmId,
  userId,
  role,
  departmentId = null,
  status = 'active',
  invitedBy = null,
  professionalRole = '',
  practiceQualifications = [],
} = {}) {
  const client = requireClient()
  const actor = await getAuthenticatedUser(client)

  const normalizedFirmId = normalizeText(firmId)
  const normalizedUserId = normalizeText(userId)
  if (!normalizedFirmId || !normalizedUserId) {
    throw new Error('Firm id and user id are required.')
  }

  const nowIso = new Date().toISOString()
  const roleValue = assertRole(role || 'viewer')
  const professionalProfile = resolveProfessionalWriteProfile({
    role: roleValue,
    professionalRole,
    practiceQualifications,
  })
  const statusValue = assertStatus(status)

  const query = await client
    .from('attorney_firm_members')
    .upsert(
      {
        firm_id: normalizedFirmId,
        user_id: normalizedUserId,
        department_id: departmentId || null,
        role: professionalProfile.role,
        professional_role: professionalProfile.professionalRole,
        practice_qualifications: professionalProfile.practiceQualifications,
        status: statusValue,
        invited_by: invitedBy || actor.id,
        joined_at: statusValue === 'active' ? nowIso : null,
      },
      { onConflict: 'firm_id,user_id' },
    )
    .select('id, firm_id, user_id, department_id, role, professional_role, practice_qualifications, organisation_user_id, status, invited_by, joined_at, created_at, updated_at')
    .single()

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firm_members')) {
      throw new Error('Attorney firm members table is not set up yet.')
    }
    throw query.error
  }

  return mapMemberRow(query.data)
}
