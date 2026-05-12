import {
  ATTORNEY_FIRM_DEPARTMENT_TYPES,
  ATTORNEY_FIRM_ROLE_VALUES,
  normalizeAttorneyDepartmentType,
  normalizeAttorneyFirmRole,
} from '../lib/attorneyPermissions'
import {
  ATTORNEY_DEMO_FIRM_ID,
  buildAttorneyDemoDepartments,
  buildAttorneyDemoFirm,
  isAttorneyDemoContextEnabled,
} from '../lib/attorneyDemoContext'
import { BRANDING_BUCKET_CANDIDATES } from '../lib/supabaseClient'
import {
  DEFAULT_ATTORNEY_DEPARTMENTS,
  getAuthenticatedUser,
  isMissingColumnError,
  isPermissionDeniedError,
  isMissingTableError,
  mapDepartmentRow,
  mapFirmRow,
  normalizeEmail,
  normalizeNullableText,
  normalizeText,
  normalizeWebsite,
  requireClient,
  isValidEmail,
  isValidWebsite,
} from './attorneyFirmServiceShared'
import { inviteAttorneyFirmMember } from './attorneyFirmInvitations'

const ATTORNEY_FIRM_SELECT_COLUMNS =
  'id, name, registration_number, vat_number, website, email, phone, address_line_1, address_line_2, city, province, postal_code, country, logo_url, primary_colour, secondary_colour, created_by, created_at, updated_at, is_active'

export function resolveAttorneyOnboardingErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase()
  const code = String(error?.code || '').toLowerCase()

  if (code === '42p01' || code === 'pgrst205' || message.includes('table is not set up')) {
    return 'We are having trouble setting up your firm right now. Please try again in a moment or contact support.'
  }
  if (code === '23505' || message.includes('duplicate key')) {
    return 'A firm profile with these details already exists. Please review and try again.'
  }
  if (code === '23503' || message.includes('foreign key')) {
    return 'Some setup references are out of date. Please retry so we can refresh your onboarding context.'
  }
  if (code === '42501' || message.includes('row-level security') || message.includes('permission')) {
    return 'Your account could not complete this step due to access controls. Please sign out, sign in, and try again.'
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'Network connection issue while setting up your firm. Please check your connection and retry.'
  }
  return 'We could not complete your firm setup just now. Please retry in a moment.'
}

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

function normalizeFileExtension(fileName = '', fallback = 'png') {
  const normalized = String(fileName || '').trim().toLowerCase()
  const dotIndex = normalized.lastIndexOf('.')
  if (dotIndex === -1 || dotIndex === normalized.length - 1) return fallback
  const extension = normalized.slice(dotIndex + 1).replace(/[^a-z0-9]/g, '')
  if (!extension) return fallback
  return extension
}

function isMissingStorageBucketError(error) {
  const message = String(error?.message || '').toLowerCase()
  return (
    String(error?.statusCode || '') === '404' ||
    String(error?.status || '') === '404' ||
    message.includes('bucket') ||
    message.includes('not found')
  )
}

export async function uploadAttorneyFirmBrandingAsset({ file, variant = 'light' } = {}) {
  const selectedFile = typeof File !== 'undefined' && file instanceof File ? file : null
  if (!selectedFile) {
    throw new Error('Select a valid logo file before uploading.')
  }

  const supportedMime = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'])
  if (!supportedMime.has(String(selectedFile.type || '').toLowerCase())) {
    throw new Error('Upload a PNG, JPG, or SVG logo.')
  }

  const client = requireClient()
  const user = await getAuthenticatedUser(client)
  const safeVariant = String(variant || 'logo').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'logo'
  const extension = normalizeFileExtension(selectedFile.name, 'png')
  const objectPath = `attorney-firms/${user.id}/branding/${safeVariant}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`

  let uploadedBucket = ''
  let latestBucketError = null

  for (const bucketName of BRANDING_BUCKET_CANDIDATES) {
    const uploadResult = await client.storage.from(bucketName).upload(objectPath, selectedFile, {
      upsert: true,
      cacheControl: '3600',
      contentType: selectedFile.type || undefined,
    })
    if (!uploadResult.error) {
      uploadedBucket = bucketName
      latestBucketError = null
      break
    }
    if (isMissingStorageBucketError(uploadResult.error)) {
      latestBucketError = uploadResult.error
      continue
    }
    throw uploadResult.error
  }

  if (!uploadedBucket) {
    const checked = BRANDING_BUCKET_CANDIDATES.join(', ')
    if (latestBucketError) {
      throw new Error(`Unable to upload logo. Checked buckets: ${checked}.`)
    }
    throw new Error('Unable to upload logo. Please try again.')
  }

  const signedResult = await client.storage.from(uploadedBucket).createSignedUrl(objectPath, 60 * 60 * 24 * 30)
  const signedUrl = normalizeText(signedResult?.data?.signedUrl)
  const { data: publicUrlData } = client.storage.from(uploadedBucket).getPublicUrl(objectPath)
  const publicUrl = normalizeText(publicUrlData?.publicUrl)

  return {
    bucket: uploadedBucket,
    path: objectPath,
    fileName: selectedFile.name,
    publicUrl,
    signedUrl,
    resolvedUrl: signedUrl || publicUrl,
  }
}

function buildFirmPayload(payload = {}, userId = null, { requireName = true } = {}) {
  const firmName = normalizeText(payload.name)
  if (requireName && !firmName) {
    throw new Error('Firm name is required.')
  }

  if (payload.email && !isValidEmail(payload.email)) {
    throw new Error('Firm email must be a valid email address.')
  }

  if (payload.website && !isValidWebsite(payload.website)) {
    throw new Error('Firm website must be a valid URL.')
  }

  const normalizedWebsite = normalizeWebsite(payload.website)
  if (payload.website && !normalizedWebsite) {
    throw new Error('Firm website must be a valid domain, such as yourfirm.com.')
  }

  return {
    ...(firmName ? { name: firmName } : {}),
    registration_number: normalizeNullableText(payload.registrationNumber),
    vat_number: normalizeNullableText(payload.vatNumber),
    website: normalizeNullableText(normalizedWebsite),
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
      throw new Error('We could not prepare your firm departments yet. Please retry in a moment.')
    }
    if (isPermissionDeniedError(query.error)) {
      const existingDepartments = await getAttorneyFirmDepartments(normalizedFirmId).catch(() => [])
      if (existingDepartments.length) return existingDepartments
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

  if (isAttorneyDemoContextEnabled() && normalizedFirmId === ATTORNEY_DEMO_FIRM_ID) {
    return buildAttorneyDemoDepartments()
  }

  const query = await client
    .from('attorney_firm_departments')
    .select('id, firm_id, name, department_type, is_active, created_at, updated_at')
    .eq('firm_id', normalizedFirmId)
    .order('name', { ascending: true })

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firm_departments')) {
      if (isAttorneyDemoContextEnabled()) {
        return buildAttorneyDemoDepartments()
      }
      return []
    }
    throw query.error
  }

  const rows = (query.data || []).map(mapDepartmentRow)
  if (!rows.length && isAttorneyDemoContextEnabled() && normalizedFirmId === ATTORNEY_DEMO_FIRM_ID) {
    return buildAttorneyDemoDepartments()
  }
  return rows
}

export async function setAttorneyFirmDepartmentActivation(firmId, activeDepartmentTypes = []) {
  const client = requireClient()
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }

  const normalizedRequestedTypes = [...new Set((activeDepartmentTypes || []).map((value) => assertDepartmentType(value)))]
  const enforcedTypes = new Set([...normalizedRequestedTypes, 'management'])

  const rpcResult = await client.rpc('set_attorney_firm_department_activation', {
    target_firm_id: normalizedFirmId,
    active_department_types: [...enforcedTypes],
  })

  if (!rpcResult.error) {
    return (rpcResult.data || []).map(mapDepartmentRow)
  }

  const rpcUnavailable = isMissingTableError(rpcResult.error, 'set_attorney_firm_department_activation') ||
    String(rpcResult.error?.code || '').toLowerCase() === 'pgrst202' ||
    String(rpcResult.error?.message || '').toLowerCase().includes('set_attorney_firm_department_activation')
  if (!rpcUnavailable && !isPermissionDeniedError(rpcResult.error)) {
    throw rpcResult.error
  }

  await createDefaultAttorneyDepartments(normalizedFirmId)

  const existingDepartments = await getAttorneyFirmDepartments(normalizedFirmId)
  if (!existingDepartments.length) {
    return []
  }

  const updateResults = await Promise.all(existingDepartments.map((department) =>
    client
      .from('attorney_firm_departments')
      .update({ is_active: enforcedTypes.has(department.departmentType) })
      .eq('id', department.id)
      .eq('firm_id', normalizedFirmId)
      .select('id, firm_id, name, department_type, is_active, created_at, updated_at')
      .maybeSingle(),
  ))

  const updateError = updateResults.find((result) => result.error)?.error || null

  if (updateError) {
    if (isMissingTableError(updateError, 'attorney_firm_departments')) {
      throw new Error('We could not save your selected departments yet. Please retry in a moment.')
    }
    if (isPermissionDeniedError(updateError)) {
      console.warn('[Attorney Onboarding] department activation blocked by RLS; continuing with local department selection.', updateError)
      return existingDepartments.map((department) => ({
        ...department,
        isActive: enforcedTypes.has(department.departmentType),
      }))
    }
    throw updateError
  }

  return updateResults
    .map((result, index) => mapDepartmentRow(result.data) || {
      ...existingDepartments[index],
      isActive: enforcedTypes.has(existingDepartments[index]?.departmentType),
    })
    .filter(Boolean)
}

export async function createAttorneyFirm(payload = {}) {
  const client = requireClient()
  const user = await getAuthenticatedUser(client)

  const firmPayload = buildFirmPayload(payload, user.id)
  const firmName = normalizeText(firmPayload.name)
  let firm = null

  if (firmName) {
    const existingResult = await client
      .from('attorney_firms')
      .select(ATTORNEY_FIRM_SELECT_COLUMNS)
      .eq('created_by', user.id)
      .eq('name', firmName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingResult.error && !isMissingTableError(existingResult.error, 'attorney_firms')) {
      throw existingResult.error
    }
    firm = existingResult.data || null
  }

  if (!firm) {
    const insertResult = await client
      .from('attorney_firms')
      .insert(firmPayload)
      .select(ATTORNEY_FIRM_SELECT_COLUMNS)
      .single()

    if (insertResult.error) {
      if (isMissingTableError(insertResult.error, 'attorney_firms')) {
        throw new Error('We are having trouble setting up your firm right now. Please try again in a moment or contact support.')
      }
      throw insertResult.error
    }

    firm = insertResult.data
  }
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
      onboarding_completed: true,
      updated_at: nowIso,
    })
    .eq('id', user.id)

  if (profileResult.error) {
    const canRetryWithoutAttorneyColumns =
      isMissingColumnError(profileResult.error, 'primary_attorney_firm_id') ||
      isMissingColumnError(profileResult.error, 'attorney_role')

    if (!canRetryWithoutAttorneyColumns) {
      throw profileResult.error
    }

    const fallbackProfileResult = await client
      .from('profiles')
      .update({
        onboarding_completed: true,
        updated_at: nowIso,
      })
      .eq('id', user.id)

    if (fallbackProfileResult.error && !isMissingColumnError(fallbackProfileResult.error, 'onboarding_completed')) {
      throw fallbackProfileResult.error
    }
  }

  return mapFirmRow(firm)
}

export async function getAttorneyFirmById(firmId) {
  const client = requireClient()
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }

  if (isAttorneyDemoContextEnabled() && normalizedFirmId === ATTORNEY_DEMO_FIRM_ID) {
    return buildAttorneyDemoFirm()
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
      if (isAttorneyDemoContextEnabled() && normalizedFirmId === ATTORNEY_DEMO_FIRM_ID) {
        return buildAttorneyDemoFirm()
      }
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
      if (isAttorneyDemoContextEnabled()) {
        const demoFirm = buildAttorneyDemoFirm()
        return [
          {
            ...demoFirm,
            membershipRole: 'firm_admin',
            membershipStatus: 'active',
            membershipJoinedAt: null,
          },
        ]
      }
      return []
    }
    throw membershipsQuery.error
  }

  const rows = membershipsQuery.data || []
  const firmIds = [...new Set(rows.map((item) => item.firm_id).filter(Boolean))]
  if (!firmIds.length) {
    if (isAttorneyDemoContextEnabled()) {
      const demoFirm = buildAttorneyDemoFirm()
      return [
        {
          ...demoFirm,
          membershipRole: 'firm_admin',
          membershipStatus: 'active',
          membershipJoinedAt: null,
        },
      ]
    }
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
      if (isAttorneyDemoContextEnabled()) {
        const demoFirm = buildAttorneyDemoFirm()
        return [
          {
            ...demoFirm,
            membershipRole: 'firm_admin',
            membershipStatus: 'active',
            membershipJoinedAt: null,
          },
        ]
      }
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
    if (isAttorneyDemoContextEnabled()) {
      return buildAttorneyDemoFirm()
    }
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

  const firmPayload = buildFirmPayload(payload, null, { requireName: false })
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
      throw new Error('Firm settings are temporarily unavailable. Please retry in a moment.')
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

  try {
    const createdFirm = await createAttorneyFirm(combinedFirmPayload)
    const updatedDepartments = await setAttorneyFirmDepartmentActivation(createdFirm.id, activeDepartmentTypes)
    const activeDepartments = updatedDepartments.filter((department) => department.isActive)
    const departmentIdByType = activeDepartments.reduce((accumulator, department) => {
      accumulator[department.departmentType] = department.id
      return accumulator
    }, {})

    const createdInvitations = []
    const inviteWarnings = []
    const normalizedInvites = [...new Map((invites || []).map((invite) => [String(invite.email || '').trim().toLowerCase(), invite])).values()]

    for (const invite of normalizedInvites) {
      if (normalizeAttorneyFirmRole(invite.role, '') === 'firm_admin') {
        inviteWarnings.push('Firm admin invitations are skipped during onboarding and can be added later in settings.')
        continue
      }
      try {
        const invitation = await inviteAttorneyFirmMember({
          firmId: createdFirm.id,
          email: invite.email,
          role: invite.role,
          departmentId: departmentIdByType[invite.departmentType] || null,
          expiresInDays: 14,
        })
        createdInvitations.push(invitation)
      } catch {
        inviteWarnings.push(`Invitation could not be sent to ${String(invite.email || '').trim()}. You can resend it later from firm settings.`)
      }
    }

    return {
      firm: createdFirm,
      departments: updatedDepartments,
      invitations: createdInvitations,
      inviteWarnings,
    }
  } catch (error) {
    console.error('[Attorney Onboarding] firm setup failed', error)
    throw new Error(resolveAttorneyOnboardingErrorMessage(error))
  }
}
