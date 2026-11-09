// Extracted without changing validation, persistence order or recovery behaviour.
import { requireClient, normalizeTextValue, normalizeOptionalNumber, normalizeNullableText, normalizeOptionalDate, isMissingColumnError, isMissingTableError, isPermissionDeniedError, isMissingSchemaError } from '../../lib/api/shared/readHelpers.js'
import { normalizeListValue, normalizeDevelopmentSellerDetails, normalizeMarketingContent, DEFAULT_DEVELOPMENT_PROFILE, normalizeDevelopmentProfile } from './profileNormalization.js'
import { retireLegacyVisualMapFields } from '../../core/developments/developmentVisualMap.js'
import { persistDevelopmentMedia } from '../../lib/developmentMediaStorage.js'
import { upsertByDevelopmentIdWithFallback } from './persistenceHelpers.js'
import { ensureDevelopmentSettings, DEFAULT_DEVELOPMENT_SETTINGS } from './configurationApi.js'
import { updateDevelopmentSettings } from './configurationActions.js'
import { invalidateDevelopmentOptionsCache } from './selectionReadApi.js'

export function normalizeDevelopmentProfileStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['planning', 'planned', 'in_planning'].includes(normalized)) return 'active'
  return ['draft', 'active', 'completed', 'archived'].includes(normalized) ? normalized : 'active'
}

export async function saveDevelopmentDetails(developmentId, input = {}, { allowNoopUpdate = false, reportWarnings = false } = {}) {
  const client = requireClient()
  const warnings = []

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  const developmentPayload = {
    name: normalizeTextValue(input.name),
    planned_units: Math.trunc(normalizeOptionalNumber(input.totalUnitsExpected ?? input.plannedUnits) ?? 0),
    code: normalizeNullableText(input.code),
    location: normalizeNullableText(input.location),
    address: normalizeNullableText(input.address),
    formatted_address: normalizeNullableText(input.formattedAddress),
    street_address: normalizeNullableText(input.streetAddress || input.address),
    suburb: normalizeNullableText(input.suburb),
    city: normalizeNullableText(input.city),
    province: normalizeNullableText(input.province),
    country: normalizeNullableText(input.country) || 'South Africa',
    postal_code: normalizeNullableText(input.postalCode),
    latitude: normalizeOptionalNumber(input.latitude),
    longitude: normalizeOptionalNumber(input.longitude),
    google_place_id: normalizeNullableText(input.googlePlaceId || input.placeId),
    description: normalizeNullableText(input.description),
    status: normalizeDevelopmentProfileStatus(input.status),
    developer_company: normalizeNullableText(input.developerCompany),
    total_units_expected: Math.trunc(normalizeOptionalNumber(input.totalUnitsExpected ?? input.plannedUnits) ?? 0),
    launch_date: normalizeOptionalDate(input.launchDate),
    expected_completion_date: normalizeOptionalDate(input.expectedCompletionDate),
    handover_enabled: input.handoverEnabled === undefined ? true : Boolean(input.handoverEnabled),
    snag_tracking_enabled: input.snagTrackingEnabled === undefined ? true : Boolean(input.snagTrackingEnabled),
    alterations_enabled: input.alterationsEnabled === undefined ? false : Boolean(input.alterationsEnabled),
    onboarding_enabled: input.onboardingEnabled === undefined ? true : Boolean(input.onboardingEnabled),
  }

  let updatePayload = { ...developmentPayload }
  let updateResult = null
  for (let attempt = 0; attempt <= DEVELOPMENT_CREATE_OPTIONAL_COLUMNS.length; attempt += 1) {
    updateResult = await client
      .from('developments')
      .update(updatePayload)
      .eq('id', developmentId)
      .select('id')
      .maybeSingle()

    if (!updateResult.error || !isDevelopmentCreateMissingColumnError(updateResult.error)) {
      break
    }

    const missingColumnName = getMissingColumnNameFromError(updateResult.error, DEVELOPMENT_CREATE_OPTIONAL_COLUMNS)
    if (!missingColumnName || !Object.prototype.hasOwnProperty.call(updatePayload, missingColumnName)) {
      break
    }
    delete updatePayload[missingColumnName]
  }

  if (updateResult.error) {
    throw updateResult.error
  }

  if (!updateResult.data && !allowNoopUpdate) {
    throw new Error(
      'Development details were not saved because this workspace does not have update access to the development.',
    )
  }
  if (!updateResult.data) {
    warnings.push({ message: 'The development was created, but its details update could not be confirmed.' })
  }

  const profilePayload = {
    development_id: developmentId,
    code: normalizeNullableText(input.code),
    location: normalizeNullableText(input.location),
    suburb: normalizeNullableText(input.suburb),
    city: normalizeNullableText(input.city),
    province: normalizeNullableText(input.province),
    country: normalizeNullableText(input.country) || 'South Africa',
    address: normalizeNullableText(input.address),
    formatted_address: normalizeNullableText(input.formattedAddress),
    street_address: normalizeNullableText(input.streetAddress || input.address),
    postal_code: normalizeNullableText(input.postalCode),
    latitude: normalizeOptionalNumber(input.latitude),
    longitude: normalizeOptionalNumber(input.longitude),
    google_place_id: normalizeNullableText(input.googlePlaceId || input.placeId),
    description: normalizeNullableText(input.description),
    status: normalizeDevelopmentProfileStatus(input.status),
    developer_company: normalizeNullableText(input.developerCompany),
    launch_date: normalizeOptionalDate(input.launchDate),
    expected_completion_date: normalizeOptionalDate(input.expectedCompletionDate),
    plans: normalizeListValue(input.plans),
    site_plans: normalizeListValue(input.sitePlans),
    image_links: normalizeListValue(input.imageLinks),
    supporting_documents: normalizeListValue(input.supportingDocuments),
    seller_details: normalizeDevelopmentSellerDetails(input.sellerDetails || input.seller_details),
  }

  if (input.marketingContent !== undefined) {
    const marketingContent = normalizeMarketingContent(input.marketingContent)
    profilePayload.marketing_content = {
      ...marketingContent,
      mediaLibrary: retireLegacyVisualMapFields(marketingContent.mediaLibrary),
    }
  }

  Object.assign(profilePayload, persistDevelopmentMedia(client, profilePayload, developmentId))

  let profileResult = await upsertByDevelopmentIdWithFallback(client, {
    table: 'development_profiles',
    payload: profilePayload,
  })

  if (profileResult.error && isMissingColumnError(profileResult.error, 'seller_details')) {
    const fallbackPayload = { ...profilePayload }
    delete fallbackPayload.seller_details
    profileResult = await upsertByDevelopmentIdWithFallback(client, {
      table: 'development_profiles',
      payload: fallbackPayload,
    })
  }

  const modernProfileColumns = [
    'address',
    'formatted_address',
    'street_address',
    'suburb',
    'city',
    'province',
    'country',
    'postal_code',
    'latitude',
    'longitude',
    'google_place_id',
    'marketing_content',
  ]

  if (profileResult.error && modernProfileColumns.some((column) => isMissingColumnError(profileResult.error, column))) {
    if (input.marketingContent !== undefined) {
      warnings.push({ message: 'The development type could not be saved because this environment has an older development profile.' })
    }
    const legacyPayload = { ...profilePayload }
    for (const column of modernProfileColumns) {
      delete legacyPayload[column]
    }
    profileResult = await upsertByDevelopmentIdWithFallback(client, {
      table: 'development_profiles',
      payload: legacyPayload,
    })
  }

  if (
    profileResult.error &&
    !isMissingTableError(profileResult.error, 'development_profiles') &&
    !isPermissionDeniedError(profileResult.error)
  ) {
    throw profileResult.error
  } else if (profileResult.error && isPermissionDeniedError(profileResult.error)) {
    console.warn(
      '[Developments] Development profile was not saved because development_profiles RLS blocked the write.',
      profileResult.error,
    )
  }
  if (profileResult.error) {
    warnings.push({ message: 'The development profile, including its type, could not be saved. Check it in the development workspace.' })
  }

  // Keep development_settings feature toggles aligned with development-level module switches
  // so transaction and portal views resolve the same module state.
  try {
    const currentSettings = await ensureDevelopmentSettings(client, developmentId)
    await updateDevelopmentSettings(developmentId, {
      ...currentSettings,
      snag_reporting_enabled: developmentPayload.snag_tracking_enabled,
      alteration_requests_enabled: developmentPayload.alterations_enabled,
    })
  } catch (settingsSyncError) {
    if (!(
      isMissingSchemaError(settingsSyncError) ||
      isMissingColumnError(settingsSyncError, 'enabled_modules') ||
      isPermissionDeniedError(settingsSyncError) ||
      /development_settings table not found/i.test(String(settingsSyncError?.message || ''))
    )) {
      throw settingsSyncError
    }
  }

  invalidateDevelopmentOptionsCache()

  return reportWarnings ? { saved: Boolean(updateResult.data), warnings } : true
}

export const DEVELOPMENT_CREATE_OPTIONAL_COLUMNS = [
  'organisation_id',
  'code',
  'location',
  'address',
  'formatted_address',
  'street_address',
  'suburb',
  'city',
  'province',
  'country',
  'postal_code',
  'latitude',
  'longitude',
  'google_place_id',
  'description',
  'status',
  'developer_company',
  'total_units_expected',
  'launch_date',
  'expected_completion_date',
  'handover_enabled',
  'snag_tracking_enabled',
  'alterations_enabled',
  'onboarding_enabled',
]

export function isDevelopmentCreateMissingColumnError(error) {
  return DEVELOPMENT_CREATE_OPTIONAL_COLUMNS.some((columnName) => isMissingColumnError(error, columnName))
}

export function getMissingColumnNameFromError(error, candidateColumns = []) {
  if (!error) return ''

  for (const columnName of candidateColumns) {
    if (isMissingColumnError(error, columnName)) {
      return columnName
    }
  }

  const sources = [error.message, error.details, error.hint].map((source) => String(source || ''))
  const patterns = [
    /column\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s+does not exist/i,
    /could not find the ['"]([a-zA-Z0-9_]+)['"] column/i,
    /['"]([a-zA-Z0-9_]+)['"]\s+column/i,
  ]

  for (const source of sources) {
    for (const pattern of patterns) {
      const match = pattern.exec(source)
      const columnName = String(match?.[1] || '').trim()
      if (columnName && candidateColumns.includes(columnName)) {
        return columnName
      }
    }
  }

  return ''
}

export function buildDevelopmentSelectColumns(payload = {}) {
  const columns = ['id', 'name', 'planned_units']
  for (const columnName of DEVELOPMENT_CREATE_OPTIONAL_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(payload, columnName)) {
      columns.push(columnName)
    }
  }
  return columns.join(', ')
}

export function createClientUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16)
    const resolvedValue = character === 'x' ? value : (value & 0x3) | 0x8
    return resolvedValue.toString(16)
  })
}

export async function createDevelopment({ name, plannedUnits, profile = {} }) {
  const client = requireClient()
  const trimmedName = name?.trim()

  if (!trimmedName) {
    throw new Error('Development name is required.')
  }

  const normalizedPlannedUnits =
    plannedUnits === null || plannedUnits === undefined || plannedUnits === '' ? 0 : Number(plannedUnits)

  if (Number.isNaN(normalizedPlannedUnits) || normalizedPlannedUnits < 0) {
    throw new Error('Planned units must be 0 or greater.')
  }

  const basePayload = {
    id: createClientUuid(),
    name: trimmedName,
    planned_units: Math.trunc(normalizedPlannedUnits),
    organisation_id: normalizeNullableText(profile.organisationId || profile.organisation_id),
    code: normalizeNullableText(profile.code),
    location: normalizeNullableText(profile.location),
    address: normalizeNullableText(profile.address),
    formatted_address: normalizeNullableText(profile.formattedAddress || profile.formatted_address),
    street_address: normalizeNullableText(profile.streetAddress || profile.street_address || profile.address),
    suburb: normalizeNullableText(profile.suburb),
    city: normalizeNullableText(profile.city),
    province: normalizeNullableText(profile.province),
    country: normalizeNullableText(profile.country) || 'South Africa',
    postal_code: normalizeNullableText(profile.postalCode || profile.postal_code),
    latitude: normalizeOptionalNumber(profile.latitude),
    longitude: normalizeOptionalNumber(profile.longitude),
    google_place_id: normalizeNullableText(profile.googlePlaceId || profile.google_place_id || profile.placeId),
    description: normalizeNullableText(profile.description),
    status: normalizeNullableText(profile.status) || DEFAULT_DEVELOPMENT_PROFILE.status,
    developer_company: normalizeNullableText(profile.developerCompany || profile.developer_company),
    total_units_expected: Math.trunc(normalizedPlannedUnits),
    launch_date: normalizeOptionalDate(profile.launchDate || profile.launch_date),
    expected_completion_date: normalizeOptionalDate(profile.expectedCompletionDate || profile.expected_completion_date),
    handover_enabled: profile.handoverEnabled === undefined ? true : Boolean(profile.handoverEnabled),
    snag_tracking_enabled: profile.snagTrackingEnabled === undefined ? true : Boolean(profile.snagTrackingEnabled),
    alterations_enabled: profile.alterationsEnabled === undefined ? false : Boolean(profile.alterationsEnabled),
    onboarding_enabled: profile.onboardingEnabled === undefined ? true : Boolean(profile.onboardingEnabled),
  }

  let insertPayload = { ...basePayload }
  let result = null
  for (let attempt = 0; attempt <= DEVELOPMENT_CREATE_OPTIONAL_COLUMNS.length; attempt += 1) {
    result = await client.from('developments').insert(insertPayload)

    if (!result.error || !isDevelopmentCreateMissingColumnError(result.error)) {
      break
    }

    const missingColumnName = getMissingColumnNameFromError(result.error, DEVELOPMENT_CREATE_OPTIONAL_COLUMNS)
    if (!missingColumnName || !Object.prototype.hasOwnProperty.call(insertPayload, missingColumnName)) {
      break
    }
    delete insertPayload[missingColumnName]
  }

  if (result.error) {
    throw result.error
  }

  let selectPayload = { ...insertPayload }
  for (let attempt = 0; attempt <= DEVELOPMENT_CREATE_OPTIONAL_COLUMNS.length; attempt += 1) {
    result = await client
      .from('developments')
      .select(buildDevelopmentSelectColumns(selectPayload))
      .eq('id', insertPayload.id)
      .single()

    if (!result.error || !isDevelopmentCreateMissingColumnError(result.error)) {
      break
    }

    const missingColumnName = getMissingColumnNameFromError(result.error, DEVELOPMENT_CREATE_OPTIONAL_COLUMNS)
    if (!missingColumnName || !Object.prototype.hasOwnProperty.call(selectPayload, missingColumnName)) {
      break
    }
    delete selectPayload[missingColumnName]
  }

  if (result.error) {
    throw Object.assign(new Error('The development was created, but its saved record could not be loaded. Open its workspace to check the details.', { cause: result.error }), { developmentId: insertPayload.id })
  }

  try {
    await client.from('development_settings').upsert(
      {
        development_id: result.data.id,
        client_portal_enabled: DEFAULT_DEVELOPMENT_SETTINGS.client_portal_enabled,
        snag_reporting_enabled: DEFAULT_DEVELOPMENT_SETTINGS.snag_reporting_enabled,
        alteration_requests_enabled: DEFAULT_DEVELOPMENT_SETTINGS.alteration_requests_enabled,
        service_reviews_enabled: DEFAULT_DEVELOPMENT_SETTINGS.service_reviews_enabled,
        reservation_deposit_enabled_by_default: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_enabled_by_default,
        reservation_deposit_amount: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_amount,
        reservation_deposit_amount_type: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_amount_type,
        reservation_deposit_treatment: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_treatment,
        reservation_deposit_payable_to: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_payable_to,
        reservation_deposit_payment_details: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_payment_details,
        reservation_deposit_notification_recipients:
          DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_notification_recipients,
        default_alteration_charge_treatment: DEFAULT_DEVELOPMENT_SETTINGS.default_alteration_charge_treatment,
        enabled_modules: DEFAULT_DEVELOPMENT_SETTINGS.enabledModules,
        stakeholder_teams: DEFAULT_DEVELOPMENT_SETTINGS.stakeholderTeams,
      },
      { onConflict: 'development_id' },
    )
  } catch {
    // Non-blocking for backwards compatibility where table may not exist yet.
  }

  const normalizedProfile = normalizeDevelopmentProfile(persistDevelopmentMedia(client, profile, result.data.id))

  try {
    await client.from('development_profiles').upsert(
      {
        development_id: result.data.id,
        code: normalizedProfile.code || null,
        location: normalizedProfile.location || null,
        suburb: normalizedProfile.suburb || null,
        city: normalizedProfile.city || null,
        province: normalizedProfile.province || null,
        country: normalizedProfile.country || DEFAULT_DEVELOPMENT_PROFILE.country,
        address: normalizedProfile.address || null,
        formatted_address: normalizedProfile.formattedAddress || null,
        street_address: normalizedProfile.streetAddress || null,
        postal_code: normalizedProfile.postalCode || null,
        latitude: normalizedProfile.latitude,
        longitude: normalizedProfile.longitude,
        google_place_id: normalizedProfile.googlePlaceId || null,
        description: normalizedProfile.description || null,
        status: normalizedProfile.status || DEFAULT_DEVELOPMENT_PROFILE.status,
        developer_company: normalizedProfile.developerCompany || null,
        launch_date: normalizedProfile.launchDate || null,
        expected_completion_date: normalizedProfile.expectedCompletionDate || null,
        plans: normalizedProfile.plans,
        site_plans: normalizedProfile.sitePlans,
        image_links: normalizedProfile.imageLinks,
        supporting_documents: normalizedProfile.supportingDocuments,
        seller_details: normalizeDevelopmentSellerDetails(profile.sellerDetails || profile.seller_details),
        marketing_content: (() => {
          const marketingContent = normalizeMarketingContent(profile.marketingContent)
          return {
            ...marketingContent,
            mediaLibrary: retireLegacyVisualMapFields(marketingContent.mediaLibrary),
          }
        })(),
      },
      { onConflict: 'development_id' },
    )
  } catch {
    // Non-blocking for environments where development_profiles is not yet available.
  }

  invalidateDevelopmentOptionsCache()

  return {
    ...result.data,
    planned_units: typeof result.data.planned_units === 'number' ? result.data.planned_units : null,
    profile: normalizedProfile,
  }
}
