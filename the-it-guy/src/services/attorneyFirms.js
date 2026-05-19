import {
  ATTORNEY_FIRM_DEPARTMENT_TYPES,
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
  mapMemberRow,
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
const ATTORNEY_FIRM_RECOVERY_CACHE_KEY_PREFIX = 'itg:attorney-firm-recovery'

function buildAttorneyFirmRecoveryCacheKey(userId = '') {
  return `${ATTORNEY_FIRM_RECOVERY_CACHE_KEY_PREFIX}:${normalizeText(userId) || 'anonymous'}`
}

function rememberAttorneyFirmRecovery(userId = '', firm = null) {
  if (typeof window === 'undefined' || !firm?.id) return
  try {
    window.localStorage.setItem(buildAttorneyFirmRecoveryCacheKey(userId), JSON.stringify({
      firm,
      savedAt: new Date().toISOString(),
    }))
  } catch {
    // Recovery cache is best-effort only.
  }
}

function getRememberedAttorneyFirmRecovery(userId = '', expectedFirmId = '') {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(buildAttorneyFirmRecoveryCacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const firm = parsed?.firm || null
    if (!firm?.id) return null
    if (expectedFirmId && firm.id !== expectedFirmId) return null
    return firm
  } catch {
    return null
  }
}

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

function isMissingRpcError(error, rpcName = '') {
  const message = normalizeText(error?.message).toLowerCase()
  const code = normalizeText(error?.code).toLowerCase()
  const status = Number(error?.status || error?.statusCode || 0)
  return (
    status === 404 ||
    code === 'pgrst202' ||
    message.includes(normalizeText(rpcName).toLowerCase()) ||
    message.includes('could not find the function') ||
    message.includes('schema cache')
  )
}

function shouldFallbackFromDepartmentActivationRpc(error) {
  if (!error) return false
  const message = normalizeText(error?.message).toLowerCase()
  const code = normalizeText(error?.code).toLowerCase()
  const status = Number(error?.status || error?.statusCode || 0)
  return (
    isMissingTableError(error, 'set_attorney_firm_department_activation') ||
    isPermissionDeniedError(error) ||
    status === 400 ||
    code === 'pgrst202' ||
    code === '42703' ||
    code === '42883' ||
    code === '42702' ||
    message.includes('set_attorney_firm_department_activation') ||
    message.includes('unnest') ||
    message.includes('ambiguous') ||
    message.includes('could not identify') ||
    message.includes('operator does not exist')
  )
}

function buildSyntheticFirmAdminMembership({ firmId, userId, joinedAt = null } = {}) {
  return mapMemberRow({
    id: `owner-admin-${firmId}-${userId}`,
    firm_id: firmId,
    user_id: userId,
    department_id: null,
    role: 'firm_admin',
    status: 'active',
    invited_by: userId,
    joined_at: joinedAt || new Date().toISOString(),
    created_at: joinedAt || new Date().toISOString(),
    updated_at: joinedAt || new Date().toISOString(),
  })
}

async function bootstrapFirmAdminMembershipWithRpc(client, firmId, userId) {
  const rpcResult = await client.rpc('bootstrap_attorney_firm_admin_membership', {
    target_firm_id: firmId,
  })

  if (!rpcResult.error) {
    return mapMemberRow(rpcResult.data)
  }

  if (!isMissingRpcError(rpcResult.error, 'bootstrap_attorney_firm_admin_membership')) {
    throw rpcResult.error
  }

  const firmLookup = await client
    .from('attorney_firms')
    .select('id, created_by')
    .eq('id', firmId)
    .eq('created_by', userId)
    .maybeSingle()

  if (firmLookup.error) {
    throw firmLookup.error
  }
  if (!firmLookup.data?.id) {
    throw rpcResult.error
  }

  console.warn('[Attorney Onboarding] bootstrap membership RPC unavailable; using owner-admin route fallback.')
  return buildSyntheticFirmAdminMembership({ firmId, userId })
}

export async function ensureCurrentUserAttorneyFirmAdminMembership(firmId) {
  const client = requireClient()
  const user = await getAuthenticatedUser(client)
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }

  const nowIso = new Date().toISOString()
  const membershipPayload = {
    firm_id: normalizedFirmId,
    user_id: user.id,
    role: 'firm_admin',
    status: 'active',
    invited_by: user.id,
    joined_at: nowIso,
  }

  const membershipResult = await client
    .from('attorney_firm_members')
    .upsert(membershipPayload, { onConflict: 'firm_id,user_id' })
    .select('id, firm_id, user_id, department_id, role, status, invited_by, joined_at, created_at, updated_at')
    .maybeSingle()

  if (!membershipResult.error) {
    return mapMemberRow(membershipResult.data) || buildSyntheticFirmAdminMembership({
      firmId: normalizedFirmId,
      userId: user.id,
      joinedAt: nowIso,
    })
  }

  if (isMissingTableError(membershipResult.error, 'attorney_firm_members')) {
    return buildSyntheticFirmAdminMembership({ firmId: normalizedFirmId, userId: user.id, joinedAt: nowIso })
  }

  if (isPermissionDeniedError(membershipResult.error)) {
    return bootstrapFirmAdminMembershipWithRpc(client, normalizedFirmId, user.id)
  }

  throw membershipResult.error
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
      console.warn('[Attorney Onboarding] default department upsert blocked by RLS; continuing without blocking firm setup.', query.error)
      return []
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
    if (isPermissionDeniedError(query.error)) {
      console.warn('[Attorney Firm] department lookup blocked by RLS; continuing with empty departments.', query.error)
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

  if (!shouldFallbackFromDepartmentActivationRpc(rpcResult.error)) {
    throw rpcResult.error
  }

  console.warn('[Attorney Onboarding] department activation RPC unavailable or failed; using client fallback.', rpcResult.error)
  await createDefaultAttorneyDepartments(normalizedFirmId).catch((error) => {
    if (isPermissionDeniedError(error)) {
      console.warn('[Attorney Onboarding] default department fallback blocked by RLS; continuing without blocking firm setup.', error)
      return []
    }
    throw error
  })

  const existingDepartments = await getAttorneyFirmDepartments(normalizedFirmId).catch((error) => {
    if (isPermissionDeniedError(error)) {
      console.warn('[Attorney Onboarding] department lookup blocked by RLS; continuing without blocking firm setup.', error)
      return []
    }
    throw error
  })
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

  if (firm && firm.is_active === false) {
    const reactivateResult = await client
      .from('attorney_firms')
      .update({
        is_active: true,
        updated_at: nowIso,
      })
      .eq('id', firm.id)
      .select(ATTORNEY_FIRM_SELECT_COLUMNS)
      .single()

    if (reactivateResult.error) {
      throw reactivateResult.error
    }

    firm = reactivateResult.data
  }

  await ensureCurrentUserAttorneyFirmAdminMembership(firm.id)

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

async function getCurrentUserOwnedAttorneyFirm(client, userId) {
  const normalizedUserId = normalizeText(userId)
  if (!normalizedUserId) return null

  const query = await client
    .from('attorney_firms')
    .select(ATTORNEY_FIRM_SELECT_COLUMNS)
    .eq('created_by', normalizedUserId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firms')) {
      return null
    }
    if (isPermissionDeniedError(query.error)) {
      console.warn('[Attorney Firm] owned firm lookup blocked by RLS; continuing without owned firm fallback.', query.error)
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
    if (isPermissionDeniedError(membershipsQuery.error)) {
      console.warn('[Attorney Firm] membership firm lookup blocked by RLS; attempting owned-firm fallback.', membershipsQuery.error)
      const ownedFirm = await getCurrentUserOwnedAttorneyFirm(client, user.id)
      if (ownedFirm?.id) {
        return [
          {
            ...ownedFirm,
            membershipRole: 'firm_admin',
            membershipStatus: 'active',
            membershipJoinedAt: ownedFirm.createdAt || null,
          },
        ]
      }
      const rememberedFirm = getRememberedAttorneyFirmRecovery(user.id)
      if (rememberedFirm?.id) {
        return [
          {
            ...rememberedFirm,
            membershipRole: 'firm_admin',
            membershipStatus: 'active',
            membershipJoinedAt: rememberedFirm.createdAt || null,
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
    const ownedFirm = await getCurrentUserOwnedAttorneyFirm(client, user.id)
    if (ownedFirm?.id) {
      return [
        {
          ...ownedFirm,
          membershipRole: 'firm_admin',
          membershipStatus: 'active',
          membershipJoinedAt: ownedFirm.createdAt || null,
        },
      ]
    }

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
    if (isPermissionDeniedError(firmsQuery.error)) {
      console.warn('[Attorney Firm] firm list lookup blocked by RLS; falling back to cached firm if available.', firmsQuery.error)
      const rememberedFirm = getRememberedAttorneyFirmRecovery(user.id)
      if (rememberedFirm?.id) {
        return [
          {
            ...rememberedFirm,
            membershipRole: 'firm_admin',
            membershipStatus: 'active',
            membershipJoinedAt: rememberedFirm.createdAt || null,
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
    let firm = null
    try {
      firm = await getAttorneyFirmById(primaryFirmId)
    } catch (error) {
      if (!isPermissionDeniedError(error)) {
        throw error
      }
      console.warn('[Attorney Firm] primary firm lookup blocked; attempting membership repair.', error)
    }

    if (!firm) {
      try {
        await ensureCurrentUserAttorneyFirmAdminMembership(primaryFirmId)
        firm = await getAttorneyFirmById(primaryFirmId)
      } catch (repairError) {
        console.warn('[Attorney Firm] primary firm membership repair could not be completed.', repairError)
      }
    }

    if (firm) {
      rememberAttorneyFirmRecovery(user.id, firm)
      return firm
    }

    const rememberedFirm = getRememberedAttorneyFirmRecovery(user.id, primaryFirmId)
    if (rememberedFirm) {
      return rememberedFirm
    }
  }

  const firms = await getCurrentUserAttorneyFirms()
  if (!firms.length) {
    const rememberedFirm = getRememberedAttorneyFirmRecovery(user.id)
    if (rememberedFirm) {
      return rememberedFirm
    }
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
    const authUser = await getAuthenticatedUser(requireClient()).catch(() => null)
    rememberAttorneyFirmRecovery(authUser?.id || '', createdFirm)
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
