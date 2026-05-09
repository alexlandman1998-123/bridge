import {
  ATTORNEY_FIRM_DEPARTMENT_TYPES,
  ATTORNEY_FIRM_ROLE_VALUES,
  normalizeAttorneyDepartmentType,
  normalizeAttorneyFirmRole,
} from '../lib/attorneyPermissions'
import {
  DEFAULT_ATTORNEY_DEPARTMENTS,
  getAuthenticatedUser,
  isMissingColumnError,
  isMissingTableError,
  mapDepartmentRow,
  mapFirmRow,
  normalizeEmail,
  normalizeNullableText,
  normalizeText,
  requireClient,
  isValidEmail,
  isValidWebsite,
} from './attorneyFirmServiceShared'
import { inviteAttorneyFirmMember } from './attorneyFirmInvitations'

function assertFirmRole(value) {
  const role = normalizeAttorneyFirmRole(value, '')
  if (!ATTORNEY_FIRM_ROLE_VALUES.includes(role)) {
    throw new Error('Invalid attorney role provided.')
  }
  return role
}

function assertDepartmentType(value) {
  const departmentType = normalizeAttorneyDepartmentType(value, '')
  if (!ATTORNEY_FIRM_DEPARTMENT_TYPES.includes(departmentType)) {
    throw new Error('Invalid department type provided.')
  }
  return departmentType
}

function buildFirmPayload(payload = {}, userId = null) {
  const firmName = normalizeText(payload.name)
  if (!firmName) {
    throw new Error('Firm name is required.')
  }

  if (payload.email && !isValidEmail(payload.email)) {
    throw new Error('Firm email must be a valid email address.')
  }

  if (payload.website && !isValidWebsite(payload.website)) {
    throw new Error('Firm website must be a valid URL.')
  }

  return {
    name: firmName,
    registration_number: normalizeNullableText(payload.registrationNumber),
    vat_number: normalizeNullableText(payload.vatNumber),
    website: normalizeNullableText(payload.website),
    email: normalizeNullableText(payload.email ? normalizeEmail(payload.email) : payload.email),
    phone: normalizeNullableText(payload.phone),
    address_line_1: normalizeNullableText(payload.addressLine1),
    address_line_2: normalizeNullableText(payload.addressLine2),
    city: normalizeNullableText(payload.city),
    province: normalizeNullableText(payload.province),
    postal_code: normalizeNullableText(payload.postalCode),
    country: normalizeNullableText(payload.country) || 'South Africa',
    logo_url: normalizeNullableText(payload.logoUrl),
    primary_colour: normalizeNullableText(payload.primaryColour),
    secondary_colour: normalizeNullableText(payload.secondaryColour),
    created_by: userId,
    is_active: payload.isActive === undefined ? true : Boolean(payload.isActive),
  }
}

export async function createDefaultAttorneyDepartments(firmId) {
  const client = requireClient()
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required to create departments.')
  }

  const payload = DEFAULT_ATTORNEY_DEPARTMENTS.map((department) => ({
    firm_id: normalizedFirmId,
    name: department.name,
    department_type: assertDepartmentType(department.department_type),
    is_active: true,
  }))

  const query = await client
    .from('attorney_firm_departments')
    .upsert(payload, { onConflict: 'firm_id,department_type' })
    .select('id, firm_id, name, department_type, is_active, created_at, updated_at')

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firm_departments')) {
      throw new Error('Attorney firm departments table is not set up yet. Run the attorney firm migration first.')
    }
    throw query.error
  }

  return (query.data || []).map(mapDepartmentRow)
}

export async function getAttorneyFirmDepartments(firmId) {
  const client = requireClient()
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }

  const query = await client
    .from('attorney_firm_departments')
    .select('id, firm_id, name, department_type, is_active, created_at, updated_at')
    .eq('firm_id', normalizedFirmId)
    .order('name', { ascending: true })

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firm_departments')) {
      return []
    }
    throw query.error
  }

  return (query.data || []).map(mapDepartmentRow)
}

export async function setAttorneyFirmDepartmentActivation(firmId, activeDepartmentTypes = []) {
  const client = requireClient()
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }

  const normalizedRequestedTypes = [...new Set((activeDepartmentTypes || []).map((value) => assertDepartmentType(value)))]
  const enforcedTypes = new Set([...normalizedRequestedTypes, 'management'])

  await createDefaultAttorneyDepartments(normalizedFirmId)

  const existingDepartments = await getAttorneyFirmDepartments(normalizedFirmId)
  if (!existingDepartments.length) {
    return []
  }

  const updates = existingDepartments.map((department) => ({
    id: department.id,
    is_active: enforcedTypes.has(department.departmentType),
  }))

  const updateResult = await client
    .from('attorney_firm_departments')
    .upsert(updates, { onConflict: 'id' })
    .select('id, firm_id, name, department_type, is_active, created_at, updated_at')

  if (updateResult.error) {
    if (isMissingTableError(updateResult.error, 'attorney_firm_departments')) {
      throw new Error('Attorney firm departments table is not set up yet. Run the attorney firm migration first.')
    }
    throw updateResult.error
  }

  return (updateResult.data || []).map(mapDepartmentRow)
}

export async function createAttorneyFirm(payload = {}) {
  const client = requireClient()
  const user = await getAuthenticatedUser(client)

  const firmPayload = buildFirmPayload(payload, user.id)
  const insertResult = await client
    .from('attorney_firms')
    .insert(firmPayload)
    .select(
      'id, name, registration_number, vat_number, website, email, phone, address_line_1, address_line_2, city, province, postal_code, country, logo_url, primary_colour, secondary_colour, created_by, created_at, updated_at, is_active',
    )
    .single()

  if (insertResult.error) {
    if (isMissingTableError(insertResult.error, 'attorney_firms')) {
      throw new Error('Attorney firms table is not set up yet. Run the attorney firm migration first.')
    }
    throw insertResult.error
  }

  const firm = insertResult.data
  const nowIso = new Date().toISOString()

  const membershipResult = await client
    .from('attorney_firm_members')
    .upsert(
      {
        firm_id: firm.id,
        user_id: user.id,
        role: assertFirmRole('firm_admin'),
        status: 'active',
        invited_by: user.id,
        joined_at: nowIso,
      },
      { onConflict: 'firm_id,user_id' },
    )

  if (membershipResult.error && !isMissingTableError(membershipResult.error, 'attorney_firm_members')) {
    throw membershipResult.error
  }

  await createDefaultAttorneyDepartments(firm.id)

  const profileResult = await client
    .from('profiles')
    .update({
      primary_attorney_firm_id: firm.id,
      attorney_role: 'firm_admin',
      updated_at: nowIso,
    })
    .eq('id', user.id)

  if (profileResult.error && !isMissingColumnError(profileResult.error, 'primary_attorney_firm_id')) {
    throw profileResult.error
  }

  return mapFirmRow(firm)
}

export async function getAttorneyFirmById(firmId) {
  const client = requireClient()
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }

  const query = await client
    .from('attorney_firms')
    .select(
      'id, name, registration_number, vat_number, website, email, phone, address_line_1, address_line_2, city, province, postal_code, country, logo_url, primary_colour, secondary_colour, created_by, created_at, updated_at, is_active',
    )
    .eq('id', normalizedFirmId)
    .maybeSingle()

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firms')) {
      return null
    }
    throw query.error
  }

  return mapFirmRow(query.data)
}

export async function getCurrentUserAttorneyFirms() {
  const client = requireClient()
  const user = await getAuthenticatedUser(client)

  const membershipsQuery = await client
    .from('attorney_firm_members')
    .select('firm_id, role, status, joined_at')
    .eq('user_id', user.id)
    .in('status', ['active', 'invited'])

  if (membershipsQuery.error) {
    if (isMissingTableError(membershipsQuery.error, 'attorney_firm_members')) {
      return []
    }
    throw membershipsQuery.error
  }

  const rows = membershipsQuery.data || []
  const firmIds = [...new Set(rows.map((item) => item.firm_id).filter(Boolean))]
  if (!firmIds.length) {
    return []
  }

  const firmsQuery = await client
    .from('attorney_firms')
    .select(
      'id, name, registration_number, vat_number, website, email, phone, address_line_1, address_line_2, city, province, postal_code, country, logo_url, primary_colour, secondary_colour, created_by, created_at, updated_at, is_active',
    )
    .in('id', firmIds)

  if (firmsQuery.error) {
    if (isMissingTableError(firmsQuery.error, 'attorney_firms')) {
      return []
    }
    throw firmsQuery.error
  }

  const roleByFirmId = rows.reduce((accumulator, item) => {
    accumulator[item.firm_id] = {
      role: item.role,
      status: item.status,
      joinedAt: item.joined_at || null,
    }
    return accumulator
  }, {})

  return (firmsQuery.data || []).map((firmRow) => {
    const firm = mapFirmRow(firmRow)
    const membership = roleByFirmId[firm.id] || {}
    return {
      ...firm,
      membershipRole: membership.role || null,
      membershipStatus: membership.status || null,
      membershipJoinedAt: membership.joinedAt || null,
    }
  })
}

export async function getCurrentUserPrimaryAttorneyFirm() {
  const client = requireClient()
  const user = await getAuthenticatedUser(client)

  const profileQuery = await client
    .from('profiles')
    .select('primary_attorney_firm_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileQuery.error && !isMissingColumnError(profileQuery.error, 'primary_attorney_firm_id')) {
    throw profileQuery.error
  }

  const primaryFirmId = profileQuery.data?.primary_attorney_firm_id || null
  if (primaryFirmId) {
    const firm = await getAttorneyFirmById(primaryFirmId)
    if (firm) {
      return firm
    }
  }

  const firms = await getCurrentUserAttorneyFirms()
  if (!firms.length) {
    return null
  }

  return firms[0]
}

export async function updateAttorneyFirm(firmId, payload = {}) {
  const client = requireClient()
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }

  const firmPayload = buildFirmPayload(payload)
  delete firmPayload.created_by

  const query = await client
    .from('attorney_firms')
    .update(firmPayload)
    .eq('id', normalizedFirmId)
    .select(
      'id, name, registration_number, vat_number, website, email, phone, address_line_1, address_line_2, city, province, postal_code, country, logo_url, primary_colour, secondary_colour, created_by, created_at, updated_at, is_active',
    )
    .single()

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firms')) {
      throw new Error('Attorney firms table is not set up yet. Run the attorney firm migration first.')
    }
    throw query.error
  }

  return mapFirmRow(query.data)
}

export async function completeAttorneyFirmOnboarding({
  firmInformation = {},
  branding = {},
  activeDepartmentTypes = [],
  invites = [],
} = {}) {
  const combinedFirmPayload = {
    ...firmInformation,
    ...branding,
  }

  const createdFirm = await createAttorneyFirm(combinedFirmPayload)
  const updatedDepartments = await setAttorneyFirmDepartmentActivation(createdFirm.id, activeDepartmentTypes)
  const activeDepartments = updatedDepartments.filter((department) => department.isActive)
  const departmentIdByType = activeDepartments.reduce((accumulator, department) => {
    accumulator[department.departmentType] = department.id
    return accumulator
  }, {})

  const createdInvitations = []
  const normalizedInvites = [...new Map((invites || []).map((invite) => [String(invite.email || '').trim().toLowerCase(), invite])).values()]

  for (const invite of normalizedInvites) {
    if (normalizeAttorneyFirmRole(invite.role, '') === 'firm_admin') {
      throw new Error('Firm admin invitations are not allowed during onboarding.')
    }
    const invitation = await inviteAttorneyFirmMember({
      firmId: createdFirm.id,
      email: invite.email,
      role: invite.role,
      departmentId: departmentIdByType[invite.departmentType] || null,
      expiresInDays: 14,
    })
    createdInvitations.push(invitation)
  }

  return {
    firm: createdFirm,
    departments: updatedDepartments,
    invitations: createdInvitations,
  }
}
