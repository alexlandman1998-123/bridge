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
import { isUnsafeFallbackAllowed } from '../lib/envValidation'
import { uploadToStorageCandidateBuckets } from '../lib/storageFallbacks'
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
import { completeOnboarding } from './onboarding/onboardingEngine'
import { projectCanonicalOrganisationOntoAttorneyFirm } from '../core/organisations/attorneyOrganisationFirmProjection'

const ATTORNEY_FIRM_SELECT_COLUMNS =
  'id, organisation_id, name, registration_number, vat_number, website, email, phone, address_line_1, address_line_2, city, province, postal_code, country, logo_url, primary_colour, secondary_colour, created_by, created_at, updated_at, is_active'
const ATTORNEY_FIRM_BRANDING_SELECT_COLUMNS =
  'firm_id, logo_url, logo_bucket, logo_path, logo_dark_url, logo_dark_bucket, logo_dark_path, primary_colour, secondary_colour'
const ATTORNEY_ORGANISATION_SELECT_COLUMNS =
  'id, name, display_name, legal_name, registration_number, vat_number, company_email, company_phone, website, address_line_1, address_line_2, city, province, postal_code, country, logo_url, logo_bucket, logo_path, logo_dark_url, logo_dark_bucket, logo_dark_path, primary_colour, secondary_colour'
const ATTORNEY_ORGANISATION_COMPATIBILITY_SELECT_COLUMNS =
  'id, name, display_name, legal_name, registration_number, company_email, company_phone, website, address_line_1, address_line_2, city, province, postal_code, country, logo_url, primary_colour, secondary_colour'
const ATTORNEY_FIRM_RECOVERY_CACHE_KEY_PREFIX = 'itg:attorney-firm-recovery'
const ATTORNEY_FIRM_LOGO_MAX_BYTES = 5 * 1024 * 1024
const ATTORNEY_BRANDING_BUCKET_CANDIDATES = Array.from(
  new Set([
    ...BRANDING_BUCKET_CANDIDATES.filter((bucketName) => bucketName !== 'documents'),
    'organisation-branding',
    ...BRANDING_BUCKET_CANDIDATES.filter((bucketName) => bucketName === 'documents'),
  ].filter(Boolean)),
)
const ATTORNEY_BRANDING_PAYLOAD_KEYS = [
  'logoUrl',
  'logoBucket',
  'logoPath',
  'logoDarkUrl',
  'logoDarkBucket',
  'logoDarkPath',
  'primaryColour',
  'secondaryColour',
]

function buildAttorneyFirmRecoveryCacheKey(userId = '') {
  return `${ATTORNEY_FIRM_RECOVERY_CACHE_KEY_PREFIX}:${normalizeText(userId) || 'anonymous'}`
}

function hasAttorneyBrandingPayload(payload = {}) {
  return ATTORNEY_BRANDING_PAYLOAD_KEYS.some((key) => Object.prototype.hasOwnProperty.call(payload, key))
}

function rememberAttorneyFirmRecovery(userId = '', firm = null) {
  if (typeof window === 'undefined' || !firm?.id) return
  if (!isUnsafeFallbackAllowed()) return
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
  if (!isUnsafeFallbackAllowed()) return null
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
  if (message.includes('no_active_membership') || message.includes('active membership')) {
    return 'Your firm profile was created, but your firm admin access was not activated. Please retry setup so we can repair your membership.'
  }
  if (code === 'attorney_membership_bootstrap_unavailable' || message.includes('membership bootstrap')) {
    return 'Your firm profile was created, but we could not activate your firm admin access. Please contact support to repair the firm membership.'
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

function buildMembershipBootstrapError(message, cause = null) {
  const error = new Error(message)
  error.code = 'attorney_membership_bootstrap_unavailable'
  if (cause) error.cause = cause
  return error
}

function mapBrandingRow(row) {
  if (!row) return null
  return {
    logoUrl: normalizeText(row.logo_url),
    logoBucket: normalizeText(row.logo_bucket),
    logoPath: normalizeText(row.logo_path),
    logoDarkUrl: normalizeText(row.logo_dark_url),
    logoDarkBucket: normalizeText(row.logo_dark_bucket),
    logoDarkPath: normalizeText(row.logo_dark_path),
    primaryColour: normalizeText(row.primary_colour),
    secondaryColour: normalizeText(row.secondary_colour),
  }
}

function mergeFirmWithBranding(firm, branding = null) {
  if (!firm || !branding) return firm
  return {
    ...firm,
    logoUrl: branding.logoUrl || firm.logoUrl,
    logoBucket: branding.logoBucket || firm.logoBucket || '',
    logoPath: branding.logoPath || firm.logoPath || '',
    logoDarkUrl: branding.logoDarkUrl || firm.logoDarkUrl || '',
    logoDarkBucket: branding.logoDarkBucket || firm.logoDarkBucket || '',
    logoDarkPath: branding.logoDarkPath || firm.logoDarkPath || '',
    primaryColour: branding.primaryColour || firm.primaryColour,
    secondaryColour: branding.secondaryColour || firm.secondaryColour,
  }
}

async function getAttorneyFirmBrandingRow(client, firmId) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) return null

  const query = await client
    .from('attorney_firm_branding')
    .select(ATTORNEY_FIRM_BRANDING_SELECT_COLUMNS)
    .eq('firm_id', normalizedFirmId)
    .maybeSingle()

  if (query.error) {
    if (
      isMissingTableError(query.error, 'attorney_firm_branding') ||
      isMissingColumnError(query.error, 'logo_bucket') ||
      isPermissionDeniedError(query.error)
    ) {
      return null
    }
    throw query.error
  }

  return query.data || null
}

function canUseLegacyOrganisationReadFallback(error) {
  return (
    isMissingColumnError(error) ||
    isMissingTableError(error, 'organisations') ||
    isPermissionDeniedError(error)
  )
}

async function getCanonicalAttorneyOrganisationRows(client, firmRows = []) {
  const organisationIds = [...new Set(
    firmRows
      .map((firm) => normalizeText(firm?.organisation_id || firm?.id))
      .filter(Boolean),
  )]
  if (!organisationIds.length) return new Map()

  let query = await client
    .from('organisations')
    .select(ATTORNEY_ORGANISATION_SELECT_COLUMNS)
    .in('id', organisationIds)

  if (query.error && canUseLegacyOrganisationReadFallback(query.error)) {
    query = await client
      .from('organisations')
      .select(ATTORNEY_ORGANISATION_COMPATIBILITY_SELECT_COLUMNS)
      .in('id', organisationIds)
  }

  if (query.error) {
    if (canUseLegacyOrganisationReadFallback(query.error)) {
      console.warn('[Attorney Firm] canonical organisation read unavailable; using the legacy compatibility projection.', query.error)
      return new Map()
    }
    throw query.error
  }

  return new Map((query.data || []).map((organisation) => [organisation.id, organisation]))
}

async function hydrateAttorneyFirmRowsFromCanonicalOrganisations(client, firmRows = [], brandingRows = []) {
  const organisationById = await getCanonicalAttorneyOrganisationRows(client, firmRows)
  return firmRows.map((firmRow, index) => {
    const firm = mergeFirmWithBranding(mapFirmRow(firmRow), mapBrandingRow(brandingRows[index]))
    const organisationId = normalizeText(firmRow?.organisation_id || firmRow?.id)
    return projectCanonicalOrganisationOntoAttorneyFirm(firm, organisationById.get(organisationId) || null)
  })
}

function buildBrandingPayload(firmId, branding = {}, userId = null, { includeMetadata = true } = {}) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required to save branding.')
  }

  return {
    firm_id: normalizedFirmId,
    logo_url: normalizeNullableText(branding.logoUrl),
    ...(includeMetadata
      ? {
          logo_bucket: normalizeNullableText(branding.logoBucket),
          logo_path: normalizeNullableText(branding.logoPath),
          logo_dark_url: normalizeNullableText(branding.logoDarkUrl),
          logo_dark_bucket: normalizeNullableText(branding.logoDarkBucket),
          logo_dark_path: normalizeNullableText(branding.logoDarkPath),
        }
      : {
          logo_dark_url: normalizeNullableText(branding.logoDarkUrl),
        }),
    primary_colour: normalizeNullableText(branding.primaryColour),
    secondary_colour: normalizeNullableText(branding.secondaryColour),
    ...(userId ? { created_by: userId } : {}),
  }
}

async function saveAttorneyFirmBranding(client, firmId, branding = {}, userId = null) {
  const savePayload = buildBrandingPayload(firmId, branding, userId)
  const query = await client
    .from('attorney_firm_branding')
    .upsert(savePayload, { onConflict: 'firm_id' })
    .select(ATTORNEY_FIRM_BRANDING_SELECT_COLUMNS)
    .maybeSingle()

  if (!query.error) {
    return mapBrandingRow(query.data)
  }

  if (isMissingColumnError(query.error, 'logo_bucket')) {
    const fallbackPayload = buildBrandingPayload(firmId, branding, userId, { includeMetadata: false })
    const fallbackQuery = await client
      .from('attorney_firm_branding')
      .upsert(fallbackPayload, { onConflict: 'firm_id' })
      .select('firm_id, logo_url, logo_dark_url, primary_colour, secondary_colour')
      .maybeSingle()

    if (!fallbackQuery.error) {
      return mapBrandingRow(fallbackQuery.data)
    }
    throw fallbackQuery.error
  }

  if (isMissingTableError(query.error, 'attorney_firm_branding')) {
    return null
  }

  throw query.error
}

async function ensureAttorneyFirmBackingOrganisation(client, firmId) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) return null

  const result = await client.rpc('bridge_ensure_attorney_firm_organisation', {
    target_firm_id: normalizedFirmId,
  })

  if (result.error) {
    if (isMissingRpcError(result.error, 'bridge_ensure_attorney_firm_organisation')) {
      console.warn('[Attorney Onboarding] attorney firm backing organisation RPC unavailable; partner network may need migration.', result.error)
      return null
    }
    throw result.error
  }

  return normalizeText(result.data)
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

  if (!isUnsafeFallbackAllowed()) {
    throw buildMembershipBootstrapError('Attorney firm membership bootstrap is not available in this environment.', rpcResult.error)
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

async function loadCurrentUserAttorneyFirmAdminMembership(client, firmId, userId) {
  const membershipQuery = await client
    .from('attorney_firm_members')
    .select('id, firm_id, user_id, department_id, role, status, invited_by, joined_at, created_at, updated_at')
    .eq('firm_id', firmId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (membershipQuery.error) {
    if (isMissingTableError(membershipQuery.error, 'attorney_firm_members') && isUnsafeFallbackAllowed()) {
      return buildSyntheticFirmAdminMembership({ firmId, userId })
    }
    throw membershipQuery.error
  }

  return mapMemberRow(membershipQuery.data)
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
    const directMembership = mapMemberRow(membershipResult.data)
    if (directMembership?.id) return directMembership

    const visibleMembership = await loadCurrentUserAttorneyFirmAdminMembership(client, normalizedFirmId, user.id)
    if (visibleMembership?.id) return visibleMembership

    return bootstrapFirmAdminMembershipWithRpc(client, normalizedFirmId, user.id)
  }

  if (isMissingTableError(membershipResult.error, 'attorney_firm_members')) {
    if (!isUnsafeFallbackAllowed()) {
      throw buildMembershipBootstrapError('Attorney firm membership storage is not available.', membershipResult.error)
    }
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

  const supportedMime = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'])
  if (!supportedMime.has(String(selectedFile.type || '').toLowerCase())) {
    throw new Error('Upload a PNG, JPG, WebP, or SVG logo.')
  }
  if (Number(selectedFile.size || 0) > ATTORNEY_FIRM_LOGO_MAX_BYTES) {
    throw new Error('Logo file is too large. Please upload a logo smaller than 5 MB.')
  }

  const client = requireClient()
  const user = await getAuthenticatedUser(client)
  const safeVariant = String(variant || 'logo').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'logo'
  const extension = normalizeFileExtension(selectedFile.name, 'png')
  const objectPath = `attorney-firms/${user.id}/branding/${safeVariant}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`

  const { bucket: uploadedBucket } = await uploadToStorageCandidateBuckets({
    bucketCandidates: ATTORNEY_BRANDING_BUCKET_CANDIDATES,
    upload: (bucketName) =>
      client.storage.from(bucketName).upload(objectPath, selectedFile, {
        upsert: true,
        cacheControl: '3600',
        contentType: selectedFile.type || undefined,
      }),
    missingBucketMessage: `Unable to upload logo. Checked buckets: ${ATTORNEY_BRANDING_BUCKET_CANDIDATES.join(', ')}.`,
    accessDeniedMessage: 'Logo storage is not ready for attorney firm branding yet. Please retry after storage access is refreshed.',
    accessDeniedCode: 'attorney_branding_storage_rls',
    genericMessage: 'Unable to upload logo. Please try again.',
  })

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
    resolvedUrl: publicUrl || signedUrl,
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

  const include = (key) => requireName || Object.prototype.hasOwnProperty.call(payload, key)

  return {
    ...(firmName ? { name: firmName } : {}),
    ...(include('registrationNumber') ? { registration_number: normalizeNullableText(payload.registrationNumber) } : {}),
    ...(include('vatNumber') ? { vat_number: normalizeNullableText(payload.vatNumber) } : {}),
    ...(include('website') ? { website: normalizeNullableText(normalizedWebsite) } : {}),
    ...(include('email') ? { email: normalizeNullableText(payload.email ? normalizeEmail(payload.email) : payload.email) } : {}),
    ...(include('phone') ? { phone: normalizeNullableText(payload.phone) } : {}),
    ...(include('addressLine1') ? { address_line_1: normalizeNullableText(payload.addressLine1) } : {}),
    ...(include('addressLine2') ? { address_line_2: normalizeNullableText(payload.addressLine2) } : {}),
    ...(include('city') ? { city: normalizeNullableText(payload.city) } : {}),
    ...(include('province') ? { province: normalizeNullableText(payload.province) } : {}),
    ...(include('postalCode') ? { postal_code: normalizeNullableText(payload.postalCode) } : {}),
    ...(include('country') ? { country: normalizeNullableText(payload.country) || 'South Africa' } : {}),
    ...(include('logoUrl') ? { logo_url: normalizeNullableText(payload.logoUrl) } : {}),
    ...(include('primaryColour') ? { primary_colour: normalizeNullableText(payload.primaryColour) } : {}),
    ...(include('secondaryColour') ? { secondary_colour: normalizeNullableText(payload.secondaryColour) } : {}),
    ...(userId ? { created_by: userId } : {}),
    ...(include('isActive') ? { is_active: payload.isActive === undefined ? true : Boolean(payload.isActive) } : {}),
  }
}

function buildCanonicalAttorneyOrganisationPayload(payload = {}, firmPayload = {}) {
  const organisationPayload = {}
  const sharedColumns = {
    registration_number: 'registration_number',
    vat_number: 'vat_number',
    website: 'website',
    email: 'company_email',
    phone: 'company_phone',
    address_line_1: 'address_line_1',
    address_line_2: 'address_line_2',
    city: 'city',
    province: 'province',
    postal_code: 'postal_code',
    country: 'country',
    logo_url: 'logo_url',
    primary_colour: 'primary_colour',
    secondary_colour: 'secondary_colour',
  }
  for (const [firmColumn, organisationColumn] of Object.entries(sharedColumns)) {
    if (Object.prototype.hasOwnProperty.call(firmPayload, firmColumn)) {
      organisationPayload[organisationColumn] = firmPayload[firmColumn]
    }
  }

  if (firmPayload.name) {
    organisationPayload.name = firmPayload.name
    organisationPayload.display_name = firmPayload.name
    organisationPayload.legal_name = firmPayload.name
  }

  const optionalBrandingFields = {
    logoBucket: 'logo_bucket',
    logoPath: 'logo_path',
    logoDarkUrl: 'logo_dark_url',
    logoDarkBucket: 'logo_dark_bucket',
    logoDarkPath: 'logo_dark_path',
  }
  for (const [inputKey, column] of Object.entries(optionalBrandingFields)) {
    if (Object.prototype.hasOwnProperty.call(payload, inputKey)) {
      organisationPayload[column] = normalizeNullableText(payload[inputKey])
    }
  }

  return organisationPayload
}

function canUseLegacyOrganisationWriteFallback(error) {
  return (
    isMissingColumnError(error) ||
    isMissingTableError(error, 'organisations') ||
    normalizeText(error?.code).toLowerCase() === 'pgrst116'
  )
}

async function updateCanonicalAttorneyOrganisation(client, firmId, payload, firmPayload) {
  const firmLookup = await client
    .from('attorney_firms')
    .select('id, organisation_id')
    .eq('id', firmId)
    .maybeSingle()

  if (firmLookup.error) throw firmLookup.error
  const ensuredOrganisationId = await ensureAttorneyFirmBackingOrganisation(client, firmId)
  const organisationId = normalizeText(ensuredOrganisationId || firmLookup.data?.organisation_id || firmId)
  if (!organisationId) return null

  const query = await client
    .from('organisations')
    .update(buildCanonicalAttorneyOrganisationPayload(payload, firmPayload))
    .eq('id', organisationId)
    .select(ATTORNEY_ORGANISATION_SELECT_COLUMNS)
    .single()

  if (query.error) {
    if (canUseLegacyOrganisationWriteFallback(query.error)) {
      console.warn('[Attorney Firm] canonical organisation columns are not deployed; preserving the legacy settings write path.', query.error)
      return null
    }
    throw query.error
  }

  return query.data
}

async function updateCanonicalAttorneyOrganisationWithRpc(client, firmId, payload, firmPayload) {
  const rpcName = 'bridge_update_attorney_organisation_identity_v3'
  const result = await client.rpc(rpcName, {
    target_firm_id: firmId,
    identity_patch: buildCanonicalAttorneyOrganisationPayload(payload, firmPayload),
  })

  if (result.error) {
    if (isMissingRpcError(result.error, rpcName)) {
      return { available: false, organisation: null }
    }
    throw result.error
  }

  if (!result.data?.success || !result.data?.organisation?.id) {
    throw new Error('Canonical attorney organisation update did not return an organisation.')
  }

  return { available: true, organisation: result.data.organisation }
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

  const rpcResult = await client.rpc('set_attorney_firm_department_activation_v2', {
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
  let matchedExistingFirm = false

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
    matchedExistingFirm = Boolean(firm)
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

  await ensureCurrentUserAttorneyFirmAdminMembership(firm.id)

  if (matchedExistingFirm) {
    const updatePayload = {
      ...firmPayload,
      is_active: true,
      updated_at: nowIso,
    }
    delete updatePayload.created_by

    const updateResult = await client
      .from('attorney_firms')
      .update(updatePayload)
      .eq('id', firm.id)
      .select(ATTORNEY_FIRM_SELECT_COLUMNS)
      .single()

    if (updateResult.error) {
      throw updateResult.error
    }

    firm = updateResult.data
  }

  const backingOrganisationId = await ensureAttorneyFirmBackingOrganisation(client, firm.id)

  await createDefaultAttorneyDepartments(firm.id)

  const profileResult = await client
    .from('profiles')
    .update({
      primary_attorney_firm_id: firm.id,
      attorney_role: 'firm_admin',
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
        updated_at: nowIso,
      })
      .eq('id', user.id)

    if (fallbackProfileResult.error) {
      throw fallbackProfileResult.error
    }
  }

  if (!payload.skipOnboardingCompletion) {
    await completeOnboarding({
      userId: user.id,
      user,
      appRole: 'attorney',
      workspaceType: 'attorney_firm',
      workspaceId: firm.id,
      context: { source: 'attorney_firm_create' },
    })
  }

  return mapFirmRow({
    ...firm,
    organisation_id: backingOrganisationId || firm.organisation_id || null,
  })
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
      ATTORNEY_FIRM_SELECT_COLUMNS,
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

  const brandingRow = await getAttorneyFirmBrandingRow(client, normalizedFirmId)
  const [firm] = await hydrateAttorneyFirmRowsFromCanonicalOrganisations(
    client,
    query.data ? [query.data] : [],
    [brandingRow],
  )
  return firm || null
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

  const brandingRow = await getAttorneyFirmBrandingRow(client, query.data?.id)
  const [firm] = await hydrateAttorneyFirmRowsFromCanonicalOrganisations(
    client,
    query.data ? [query.data] : [],
    [brandingRow],
  )
  return firm || null
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
      ATTORNEY_FIRM_SELECT_COLUMNS,
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

  const brandingRows = await Promise.all((firmsQuery.data || []).map((firmRow) =>
    getAttorneyFirmBrandingRow(client, firmRow.id).catch(() => null),
  ))
  const hydratedFirms = await hydrateAttorneyFirmRowsFromCanonicalOrganisations(
    client,
    firmsQuery.data || [],
    brandingRows,
  )

  return hydratedFirms.map((firm) => {
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

  const canonicalRpc = await updateCanonicalAttorneyOrganisationWithRpc(
    client,
    normalizedFirmId,
    payload,
    firmPayload,
  )

  let query
  if (canonicalRpc.available) {
    // Phase 7: shared identity and branding are projected by the database.
    // Only the operational activation flag may still be written to the firm.
    if (Object.prototype.hasOwnProperty.call(firmPayload, 'is_active')) {
      query = await client
        .from('attorney_firms')
        .update({ is_active: firmPayload.is_active })
        .eq('id', normalizedFirmId)
        .select(ATTORNEY_FIRM_SELECT_COLUMNS)
        .single()
    } else {
      query = await client
        .from('attorney_firms')
        .select(ATTORNEY_FIRM_SELECT_COLUMNS)
        .eq('id', normalizedFirmId)
        .single()
    }
  } else {
    // Mixed-version fallback retained until the Phase 7 RPC is deployed.
    await updateCanonicalAttorneyOrganisation(client, normalizedFirmId, payload, firmPayload)
    query = await client
      .from('attorney_firms')
      .update(firmPayload)
      .eq('id', normalizedFirmId)
      .select(ATTORNEY_FIRM_SELECT_COLUMNS)
      .single()
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firms')) {
      throw new Error('Firm settings are temporarily unavailable. Please retry in a moment.')
    }
    throw query.error
  }

  const branding = !canonicalRpc.available && hasAttorneyBrandingPayload(payload)
    ? await saveAttorneyFirmBranding(client, normalizedFirmId, payload)
    : mapBrandingRow(await getAttorneyFirmBrandingRow(client, normalizedFirmId))
  const [firm] = await hydrateAttorneyFirmRowsFromCanonicalOrganisations(
    client,
    [query.data],
    [branding ? {
      logo_url: branding.logoUrl,
      logo_bucket: branding.logoBucket,
      logo_path: branding.logoPath,
      logo_dark_url: branding.logoDarkUrl,
      logo_dark_bucket: branding.logoDarkBucket,
      logo_dark_path: branding.logoDarkPath,
      primary_colour: branding.primaryColour,
      secondary_colour: branding.secondaryColour,
    } : null],
  )
  return firm
}

async function completeAttorneyFirmOnboardingAtomically({
  firmInformation = {},
  branding = {},
  activeDepartmentTypes = [],
} = {}) {
  const client = requireClient()
  const user = await getAuthenticatedUser(client)
  const rpcName = 'bridge_complete_attorney_firm_onboarding_v3'
  const result = await client.rpc(rpcName, {
    payload: {
      firmInformation,
      branding,
      activeDepartmentTypes,
    },
  })

  if (result.error) throw result.error
  if (!result.data?.success || !result.data?.firm?.id) {
    throw new Error('Attorney firm onboarding did not return a completed workspace.')
  }

  const brandingRecord = mapBrandingRow(result.data.branding)
  const firm = mergeFirmWithBranding(mapFirmRow({
    ...result.data.firm,
    organisation_id: result.data.organisation?.id || result.data.workspace_id || result.data.firm.organisation_id,
  }), brandingRecord)
  const departments = (result.data.departments || []).map(mapDepartmentRow).filter(Boolean)
  rememberAttorneyFirmRecovery(user.id, firm)

  return { firm, departments }
}

async function completeAttorneyFirmOnboardingLegacy({
  firmInformation = {},
  branding = {},
  activeDepartmentTypes = [],
} = {}) {
  const combinedFirmPayload = {
    ...firmInformation,
    ...branding,
  }
  let firm = await createAttorneyFirm(combinedFirmPayload)
  const authUser = await getAuthenticatedUser(requireClient()).catch(() => null)
  const brandingRecord = await saveAttorneyFirmBranding(requireClient(), firm.id, branding, authUser?.id || null)
  firm = mergeFirmWithBranding(firm, brandingRecord)
  rememberAttorneyFirmRecovery(authUser?.id || '', firm)
  const departments = await setAttorneyFirmDepartmentActivation(firm.id, activeDepartmentTypes)

  return { firm, departments }
}

export async function completeAttorneyFirmOnboarding({
  firmInformation = {},
  branding = {},
  activeDepartmentTypes = [],
  invites = [],
} = {}) {
  try {
    let completion
    try {
      completion = await completeAttorneyFirmOnboardingAtomically({
        firmInformation,
        branding,
        activeDepartmentTypes,
      })
    } catch (error) {
      if (!isMissingRpcError(error, 'bridge_complete_attorney_firm_onboarding_v2')) throw error
      console.warn('[Attorney Onboarding] atomic onboarding RPC is unavailable; using the legacy compatibility path.', error)
      completion = await completeAttorneyFirmOnboardingLegacy({
        firmInformation,
        branding,
        activeDepartmentTypes,
      })
    }

    const createdFirm = completion.firm
    const updatedDepartments = completion.departments
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
