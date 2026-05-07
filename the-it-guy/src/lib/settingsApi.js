import {
  createDevelopment,
  fetchDevelopmentAttorneyConfig,
  getOrCreateUserProfile,
  saveDevelopmentAttorneyConfig,
  updateUserProfile,
  updateDevelopmentSettings,
} from './api'
import { resolvePortalDocumentMetadata } from '../core/documents/portalDocumentMetadata'
import { DEMO_PROFILE_ID } from './demoIds'
import { normalizeAppRole } from './roles'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import {
  buildDefaultAgencyOnboarding,
  createAgencyInviteDraft,
  mergeAgencyOnboardingDraft,
  normalizeBranchAgentCount,
  normalizeBranchManagerName,
} from './agencyOnboarding'

const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailMentions: true,
  emailDocumentUploads: true,
  emailWorkflowChanges: true,
  inAppNotifications: true,
}

const DEFAULT_ORGANISATION_SETTINGS = {
  onboardingRules: {
    enableEmploymentTypeForBond: true,
    allowHybridFinance: true,
    allowTrustOnboarding: true,
    allowCompanyOnboarding: true,
  },
  documentRules: {
    autoGenerateRequiredDocuments: true,
    requireDocumentApprovalBeforeNextStage: false,
    allowManualDocumentOverrides: true,
    enableSoftRequiredDocuments: true,
    defaultDocumentGroups: ['sale', 'buyer_fica', 'finance', 'transfer', 'handover'],
  },
  workflowDefaults: {
    financeWorkflowEnabled: true,
    transferWorkflowEnabled: true,
    closeOutWorkflowEnabled: true,
    handoverWorkflowEnabledAfterRegistration: true,
    autoCreateUnitAfterRegistration: true,
  },
  automationSettings: {
    autoNotifyOnWorkflowStageChange: true,
    autoCreateDocumentRequirements: true,
    autoLockOnboardingAfterClientSubmission: true,
    allowInternalOnboardingEdits: true,
  },
  organisationHierarchy: {
    branchesEnabled: true,
    reportingMode: 'branch_hierarchy',
    visibilityMode: 'role_based',
  },
}

const DEFAULT_SUBSCRIPTION = {
  id: null,
  planName: 'Professional',
  billingType: 'Monthly',
  monthlyAmount: 0,
  status: 'active',
  renewalDate: null,
  activeDevelopments: 0,
  activeUsers: 0,
  includedDevelopments: 'Unlimited',
  includedUsers: 'Unlimited',
  paymentMethodLast4: '',
}

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY to .env.')
  }

  return supabase
}

function isMissingTableError(error, tableName) {
  if (!error) return false
  const message = String(error.message || '').toLowerCase()
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (message.includes('table') && message.includes(String(tableName || '').toLowerCase()))
  )
}

function isMissingColumnError(error, columnName) {
  if (!error) return false
  const message = String(error.message || '').toLowerCase()
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (message.includes('column') && message.includes(String(columnName || '').toLowerCase()))
  )
}

function isOnConflictConstraintError(error, conflictColumn = '') {
  if (!error) return false
  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  const hint = String(error.hint || '').toLowerCase()
  const normalizedConflictColumn = String(conflictColumn || '').trim().toLowerCase()
  const missingConstraintMessage = 'there is no unique or exclusion constraint matching the on conflict specification'
  const mentionsMissingConstraint =
    message.includes(missingConstraintMessage) || details.includes(missingConstraintMessage)
  const mentionsOnConflict = message.includes('on conflict') || details.includes('on conflict') || hint.includes('on conflict')
  const mentionsConflictColumn = normalizedConflictColumn
    ? message.includes(normalizedConflictColumn) || details.includes(normalizedConflictColumn) || hint.includes(normalizedConflictColumn)
    : false

  return error.code === '42P10' || mentionsMissingConstraint || (mentionsOnConflict && mentionsConflictColumn)
}

async function upsertByDevelopmentIdWithFallback(client, table, payload) {
  const updateResult = await client
    .from(table)
    .update(payload)
    .eq('development_id', payload.development_id)
    .select('development_id')
    .maybeSingle()
  if (!updateResult.error && updateResult.data) {
    return updateResult
  }

  if (updateResult.error && !isOnConflictConstraintError(updateResult.error, 'development_id')) {
    return updateResult
  }

  return client.from(table).insert(payload)
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
}

function isGenericDocumentLabel(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return true
  return ['document', 'documents', 'general', 'other', 'client portal', 'client_portal'].includes(normalized)
}

function buildDocumentMappingReportRows({ sharedRows = [], requiredRows = [] } = {}) {
  const aggregated = new Map()
  let ambiguousCount = 0
  let missingMetadataCount = 0

  const registerIssue = ({ scope, label, reason, workspaceCategory, mappingSource, transactionId, createdAt }) => {
    const normalizedLabel = normalizeText(label) || '(empty)'
    const key = `${scope}|${normalizedLabel.toLowerCase()}|${reason}`
    const existing = aggregated.get(key)
    if (existing) {
      existing.count += 1
      if (transactionId && !existing.sampleTransactionIds.includes(transactionId) && existing.sampleTransactionIds.length < 5) {
        existing.sampleTransactionIds.push(transactionId)
      }
      if (createdAt && (!existing.latestSeenAt || new Date(createdAt).getTime() > new Date(existing.latestSeenAt).getTime())) {
        existing.latestSeenAt = createdAt
      }
      return
    }

    aggregated.set(key, {
      scope,
      label: normalizedLabel,
      reason,
      workspaceCategory: workspaceCategory || 'additional',
      mappingSource: mappingSource || 'fallback',
      count: 1,
      sampleTransactionIds: transactionId ? [transactionId] : [],
      latestSeenAt: createdAt || null,
    })
  }

  for (const row of sharedRows) {
    const metadata = resolvePortalDocumentMetadata({
      document_type: row?.document_type,
      category: row?.category,
      stage_key: row?.stage_key,
      label: row?.name,
      name: row?.name,
    })
    const mappingSource = metadata.portalMappingSource || 'fallback'
    const typeLabel = normalizeText(row?.document_type)
    const categoryLabel = normalizeText(row?.category)
    const label = typeLabel || categoryLabel || normalizeText(row?.name) || 'Unlabeled document'

    if (!typeLabel || isGenericDocumentLabel(typeLabel)) {
      missingMetadataCount += 1
      registerIssue({
        scope: 'shared_document',
        label,
        reason: 'Missing explicit document_type metadata',
        workspaceCategory: metadata.portalWorkspaceCategory,
        mappingSource,
        transactionId: row?.transaction_id || null,
        createdAt: row?.created_at || null,
      })
      continue
    }

    if (metadata.portalMappingAmbiguous) {
      ambiguousCount += 1
      registerIssue({
        scope: 'shared_document',
        label,
        reason: 'Conflicting metadata signals',
        workspaceCategory: metadata.portalWorkspaceCategory,
        mappingSource,
        transactionId: row?.transaction_id || null,
        createdAt: row?.created_at || null,
      })
      continue
    }

    if (mappingSource === 'keyword' || mappingSource === 'fallback') {
      registerIssue({
        scope: 'shared_document',
        label,
        reason: 'Workspace bucket still inferred from label text',
        workspaceCategory: metadata.portalWorkspaceCategory,
        mappingSource,
        transactionId: row?.transaction_id || null,
        createdAt: row?.created_at || null,
      })
    }
  }

  for (const row of requiredRows) {
    const metadata = resolvePortalDocumentMetadata({
      group_key: row?.group_key,
      document_key: row?.document_key,
      key: row?.document_key,
      label: row?.document_label,
    })
    const mappingSource = metadata.portalMappingSource || 'fallback'
    const documentKey = normalizeText(row?.document_key)
    const groupKey = normalizeText(row?.group_key)
    const label = documentKey || normalizeText(row?.document_label) || 'Unlabeled required document'

    if (!documentKey) {
      missingMetadataCount += 1
      registerIssue({
        scope: 'required_document',
        label,
        reason: 'Missing explicit document_key metadata',
        workspaceCategory: metadata.portalWorkspaceCategory,
        mappingSource,
        transactionId: row?.transaction_id || null,
        createdAt: row?.created_at || null,
      })
      continue
    }

    if (!groupKey) {
      missingMetadataCount += 1
      registerIssue({
        scope: 'required_document',
        label,
        reason: 'Missing explicit group_key metadata',
        workspaceCategory: metadata.portalWorkspaceCategory,
        mappingSource,
        transactionId: row?.transaction_id || null,
        createdAt: row?.created_at || null,
      })
      continue
    }

    if (metadata.portalMappingAmbiguous) {
      ambiguousCount += 1
      registerIssue({
        scope: 'required_document',
        label,
        reason: 'Conflicting metadata signals',
        workspaceCategory: metadata.portalWorkspaceCategory,
        mappingSource,
        transactionId: row?.transaction_id || null,
        createdAt: row?.created_at || null,
      })
      continue
    }

    if (mappingSource === 'fallback') {
      registerIssue({
        scope: 'required_document',
        label,
        reason: 'Workspace bucket still inferred from fallback mapping',
        workspaceCategory: metadata.portalWorkspaceCategory,
        mappingSource,
        transactionId: row?.transaction_id || null,
        createdAt: row?.created_at || null,
      })
    }
  }

  const rows = [...aggregated.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return (b.latestSeenAt || '').localeCompare(a.latestSeenAt || '')
  })

  return {
    rows,
    totals: {
      needsReview: rows.reduce((sum, row) => sum + row.count, 0),
      ambiguousCount,
      missingMetadataCount,
    },
  }
}

function safeJson(value, fallback) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...fallback }
  }

  return {
    ...fallback,
    ...value,
  }
}

function buildDefaultOrganisation(profile = null) {
  const baseName = normalizeText(profile?.companyName) || 'Bridge Workspace'

  return {
    id: null,
    name: baseName,
    displayName: baseName,
    logoUrl: '',
    companyEmail: profile?.email || '',
    companyPhone: profile?.phoneNumber || '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    province: '',
    postalCode: '',
    country: 'South Africa',
    supportEmail: profile?.email || '',
    supportPhone: profile?.phoneNumber || '',
    primaryContactPerson: profile?.fullName || '',
  }
}

function normalizeOrganisationRow(row, profile = null) {
  const fallback = buildDefaultOrganisation(profile)

  return {
    id: row?.id || fallback.id,
    name: normalizeText(row?.name) || fallback.name,
    displayName: normalizeText(row?.display_name) || fallback.displayName,
    logoUrl: normalizeText(row?.logo_url),
    companyEmail: normalizeText(row?.company_email) || fallback.companyEmail,
    companyPhone: normalizeText(row?.company_phone) || fallback.companyPhone,
    website: normalizeText(row?.website),
    addressLine1: normalizeText(row?.address_line_1),
    addressLine2: normalizeText(row?.address_line_2),
    city: normalizeText(row?.city),
    province: normalizeText(row?.province),
    postalCode: normalizeText(row?.postal_code),
    country: normalizeText(row?.country) || fallback.country,
    supportEmail: normalizeText(row?.support_email) || fallback.supportEmail,
    supportPhone: normalizeText(row?.support_phone) || fallback.supportPhone,
    primaryContactPerson: normalizeText(row?.primary_contact_person) || fallback.primaryContactPerson,
  }
}

function mapAgencyInviteRoleToOrganisationRole(role = '') {
  const normalized = normalizeText(role).toLowerCase()
  if (normalized === 'administrator') return 'admin'
  if (normalized === 'branch_manager') return 'branch_manager'
  if (normalized === 'agent') return 'agent'
  return 'viewer'
}

function mapAgencyOnboardingToOrganisationPayload(onboarding = {}, fallbackOrganisation = {}) {
  const info = onboarding?.agencyInformation || {}
  const principal = onboarding?.principalInformation || {}
  return {
    name: normalizeText(info.agencyName) || fallbackOrganisation?.name || 'Bridge Agency',
    display_name: normalizeNullableText(info.tradingName) || normalizeText(info.agencyName) || fallbackOrganisation?.displayName || 'Bridge Agency',
    company_email: normalizeNullableText(info.mainEmailAddress),
    company_phone: normalizeNullableText(info.mainOfficeNumber),
    website: normalizeNullableText(info.website),
    address_line_1: normalizeNullableText(info.physicalAddress),
    city: normalizeNullableText(fallbackOrganisation?.city),
    province: normalizeNullableText(info.province),
    country: normalizeNullableText(info.country) || 'South Africa',
    support_email: normalizeNullableText(info.mainEmailAddress),
    support_phone: normalizeNullableText(info.mainOfficeNumber),
    primary_contact_person: normalizeNullableText(principal.principalFullName),
    logo_url: normalizeNullableText(onboarding?.branding?.logoLight),
  }
}

function buildAgencyOnboardingStorageRecord({
  onboarding = {},
  completed = false,
} = {}) {
  const nowIso = new Date().toISOString()
  const merged = mergeAgencyOnboardingDraft(onboarding, {
    status: {
      ...(onboarding?.status || {}),
      lastSavedAt: nowIso,
      completedAt: completed ? nowIso : onboarding?.status?.completedAt || null,
    },
  })

  return {
    ...merged,
    branchStructure: {
      branches: (merged.branchStructure?.branches || []).map((branch) => ({
        ...branch,
        branchManager: normalizeBranchManagerName(branch),
        numberOfAgents: String(normalizeBranchAgentCount(branch)),
      })),
    },
    invitations: (merged.invitations || [])
      .map((invite) => createAgencyInviteDraft(invite))
      .filter((invite) => invite.email),
  }
}

function normalizeAccountSettings(row, profile) {
  return {
    id: row?.id || profile?.id || null,
    firstName: normalizeText(row?.first_name) || profile?.firstName || '',
    lastName: normalizeText(row?.last_name) || profile?.lastName || '',
    email: normalizeText(row?.email) || profile?.email || '',
    phoneNumber: normalizeText(row?.phone_number) || profile?.phoneNumber || '',
    companyName: normalizeText(row?.company_name) || profile?.companyName || '',
    title: normalizeText(row?.title),
    timezone: normalizeText(row?.timezone) || 'Africa/Johannesburg',
    dateFormat: normalizeText(row?.date_format) || 'DD MMM YYYY',
    role: normalizeAppRole(row?.role || profile?.role),
    notificationPreferences: safeJson(row?.notification_preferences_json, DEFAULT_NOTIFICATION_PREFERENCES),
  }
}

async function getAuthenticatedUser() {
  const client = requireClient()
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (!data?.user?.id) {
    throw new Error('Authenticated user is required.')
  }
  return data.user
}

async function ensureOrganisationContext(client) {
  const user = await getAuthenticatedUser()
  const profile = await getOrCreateUserProfile({ user })

  try {
    const membershipQuery = await client
      .from('organisation_users')
      .select('organisation_id, role, status')
      .eq('user_id', user.id)
      .neq('status', 'deactivated')
      .order('created_at', { ascending: true })
      .limit(1)

    if (membershipQuery.error) {
      if (
        isMissingTableError(membershipQuery.error, 'organisation_users') ||
        isMissingColumnError(membershipQuery.error, 'organisation_id')
      ) {
        return {
          organisation: buildDefaultOrganisation(profile),
          organisationSettings: { ...DEFAULT_ORGANISATION_SETTINGS },
          membershipRole: profile.role === 'developer' ? 'admin' : profile.role,
          profile,
          persisted: false,
        }
      }
      throw membershipQuery.error
    }

    let membership = membershipQuery.data?.[0] || null
    let organisation = null

    if (membership?.organisation_id) {
      const orgQuery = await client
        .from('organisations')
        .select(`
          id,
          name,
          display_name,
          logo_url,
          company_email,
          company_phone,
          website,
          address_line_1,
          address_line_2,
          city,
          province,
          postal_code,
          country,
          support_email,
          support_phone,
          primary_contact_person
        `)
        .eq('id', membership.organisation_id)
        .maybeSingle()

      if (!orgQuery.error) {
        organisation = normalizeOrganisationRow(orgQuery.data, profile)
      } else if (!isMissingTableError(orgQuery.error, 'organisations')) {
        throw orgQuery.error
      }
    }

    if (!organisation) {
      const fallbackName = normalizeText(profile.companyName) || 'Bridge Workspace'
      const insertedOrganisation = await client
        .from('organisations')
        .insert({
          name: fallbackName,
          display_name: fallbackName,
          company_email: normalizeNullableText(profile.email),
          company_phone: normalizeNullableText(profile.phoneNumber),
          country: 'South Africa',
          support_email: normalizeNullableText(profile.email),
          support_phone: normalizeNullableText(profile.phoneNumber),
          primary_contact_person: normalizeNullableText(profile.fullName),
        })
        .select(`
          id,
          name,
          display_name,
          logo_url,
          company_email,
          company_phone,
          website,
          address_line_1,
          address_line_2,
          city,
          province,
          postal_code,
          country,
          support_email,
          support_phone,
          primary_contact_person
        `)
        .single()

      if (insertedOrganisation.error) {
        if (isMissingTableError(insertedOrganisation.error, 'organisations')) {
          return {
            organisation: buildDefaultOrganisation(profile),
            organisationSettings: { ...DEFAULT_ORGANISATION_SETTINGS },
            membershipRole: profile.role === 'developer' ? 'admin' : profile.role,
            profile,
            persisted: false,
          }
        }
        throw insertedOrganisation.error
      }

      organisation = normalizeOrganisationRow(insertedOrganisation.data, profile)

      const membershipRole = profile.role === 'developer' ? 'admin' : profile.role
      const membershipInsert = await client.from('organisation_users').upsert(
        {
          organisation_id: organisation.id,
          user_id: user.id,
          first_name: normalizeNullableText(profile.firstName),
          last_name: normalizeNullableText(profile.lastName),
          email: normalizeText(profile.email),
          role: membershipRole,
          status: 'active',
          accepted_at: new Date().toISOString(),
        },
        { onConflict: 'organisation_id,email' },
      )

      if (membershipInsert.error && !isMissingTableError(membershipInsert.error, 'organisation_users')) {
        throw membershipInsert.error
      }

      membership = { organisation_id: organisation.id, role: membershipRole, status: 'active' }
    }

    const settingsQuery = await client
      .from('organisation_settings')
      .select('settings_json')
      .eq('organisation_id', organisation.id)
      .maybeSingle()

    if (settingsQuery.error) {
      if (isMissingTableError(settingsQuery.error, 'organisation_settings')) {
        return {
          organisation,
          organisationSettings: { ...DEFAULT_ORGANISATION_SETTINGS },
          membershipRole: membership?.role || (profile.role === 'developer' ? 'admin' : profile.role),
          profile,
          persisted: false,
        }
      }
      throw settingsQuery.error
    }

    if (!settingsQuery.data) {
      const insertSettings = await client
        .from('organisation_settings')
        .insert({
          organisation_id: organisation.id,
          settings_json: DEFAULT_ORGANISATION_SETTINGS,
        })
        .select('settings_json')
        .single()

      if (insertSettings.error && !isMissingTableError(insertSettings.error, 'organisation_settings')) {
        throw insertSettings.error
      }

      return {
        organisation,
        organisationSettings: safeJson(insertSettings.data?.settings_json, DEFAULT_ORGANISATION_SETTINGS),
        membershipRole: membership?.role || (profile.role === 'developer' ? 'admin' : profile.role),
        profile,
        persisted: !insertSettings.error,
      }
    }

    return {
      organisation,
      organisationSettings: safeJson(settingsQuery.data.settings_json, DEFAULT_ORGANISATION_SETTINGS),
      membershipRole: membership?.role || (profile.role === 'developer' ? 'admin' : profile.role),
      profile,
      persisted: true,
    }
  } catch (error) {
    if (
      isMissingTableError(error, 'organisation_users') ||
      isMissingTableError(error, 'organisations') ||
      isMissingTableError(error, 'organisation_settings')
    ) {
      return {
        organisation: buildDefaultOrganisation(profile),
        organisationSettings: { ...DEFAULT_ORGANISATION_SETTINGS },
        membershipRole: profile.role === 'developer' ? 'admin' : profile.role,
        profile,
        persisted: false,
      }
    }
    throw error
  }
}

function normalizeDevelopmentSettingsRecord({
  development,
  profile,
  settings,
  attorneyConfig,
}) {
  return {
    id: development?.id || null,
    name: normalizeText(development?.name),
    plannedUnits: Number(development?.planned_units || 0),
    code: normalizeText(development?.code),
    location: normalizeText(profile?.location),
    address: normalizeText(profile?.address),
    description: normalizeText(profile?.description),
    status: normalizeText(profile?.status) || 'Planning',
    attorneyName: normalizeText(attorneyConfig?.attorneyFirmName || attorneyConfig?.attorney_firm_name),
    attorneyContactEmail: normalizeText(attorneyConfig?.primaryContactEmail || attorneyConfig?.primary_contact_email),
    clientPortalEnabled: settings?.client_portal_enabled ?? true,
    snagReportingEnabled: settings?.snag_reporting_enabled ?? true,
    alterationRequestsEnabled: settings?.alteration_requests_enabled ?? false,
    handoverEnabled: settings?.client_portal_enabled ?? true,
    reservationDepositEnabledByDefault: Boolean(settings?.reservation_deposit_enabled_by_default),
    reservationDepositAmount:
      settings?.reservation_deposit_amount === null || settings?.reservation_deposit_amount === undefined
        ? ''
        : String(settings.reservation_deposit_amount),
    reservationAccountHolderName: normalizeText(settings?.reservation_deposit_payment_details?.account_holder_name),
    reservationBankName: normalizeText(settings?.reservation_deposit_payment_details?.bank_name),
    reservationAccountNumber: normalizeText(settings?.reservation_deposit_payment_details?.account_number),
    reservationBranchCode: normalizeText(settings?.reservation_deposit_payment_details?.branch_code),
    reservationAccountType: normalizeText(settings?.reservation_deposit_payment_details?.account_type),
    reservationPaymentReferenceFormat: normalizeText(settings?.reservation_deposit_payment_details?.payment_reference_format),
    reservationPaymentInstructions: normalizeText(settings?.reservation_deposit_payment_details?.payment_instructions),
    reservationNotificationRecipients: Array.isArray(settings?.reservation_deposit_notification_recipients)
      ? settings.reservation_deposit_notification_recipients
          .map((item) => normalizeText(item))
          .filter(Boolean)
          .join(', ')
      : '',
  }
}

export async function fetchAccountSettings() {
  if (!isSupabaseConfigured || !supabase) {
    return normalizeAccountSettings({}, {
      id: DEMO_PROFILE_ID,
      firstName: 'Demo',
      lastName: 'User',
      email: '',
      phoneNumber: '',
      companyName: '',
      role: 'developer',
    })
  }

  const client = requireClient()
  const user = await getAuthenticatedUser()
  const profile = await getOrCreateUserProfile({ user })
  const { data, error } = await client
    .from('profiles')
    .select(`
      id,
      email,
      first_name,
      last_name,
      full_name,
      company_name,
      phone_number,
      role,
      title,
      timezone,
      date_format,
      notification_preferences_json
    `)
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'profiles') || isMissingColumnError(error, 'title')) {
      return normalizeAccountSettings({}, profile)
    }
    throw error
  }

  return normalizeAccountSettings(data, profile)
}

export async function updateAccountSettings(input = {}) {
  const client = requireClient()
  const user = await getAuthenticatedUser()

  const payload = {
    id: user.id,
    first_name: normalizeNullableText(input.firstName),
    last_name: normalizeNullableText(input.lastName),
    full_name: normalizeNullableText([input.firstName, input.lastName].filter(Boolean).join(' ')),
    company_name: normalizeNullableText(input.companyName),
    phone_number: normalizeNullableText(input.phoneNumber),
    title: normalizeNullableText(input.title),
    timezone: normalizeNullableText(input.timezone) || 'Africa/Johannesburg',
    date_format: normalizeNullableText(input.dateFormat) || 'DD MMM YYYY',
    notification_preferences_json: {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...(input.notificationPreferences || {}),
    },
  }

  const { data, error } = await client
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select(`
      id,
      email,
      first_name,
      last_name,
      full_name,
      company_name,
      phone_number,
      role,
      title,
      timezone,
      date_format,
      notification_preferences_json
    `)
    .single()

  if (error) {
    if (isMissingColumnError(error, 'title') || isMissingColumnError(error, 'notification_preferences_json')) {
      await updateUserProfile({
        userId: user.id,
        firstName: input.firstName,
        lastName: input.lastName,
        companyName: input.companyName,
        phoneNumber: input.phoneNumber,
      })

      return normalizeAccountSettings(
        {
          id: user.id,
          email: user.email,
          first_name: input.firstName,
          last_name: input.lastName,
          company_name: input.companyName,
          phone_number: input.phoneNumber,
        },
        { id: user.id, email: user.email, role: 'developer' },
      )
    }

    throw error
  }

  return normalizeAccountSettings(data, {
    id: user.id,
    email: user.email,
    role: input.role || 'developer',
  })
}

export async function changePassword({ password }) {
  const client = requireClient()

  if (!normalizeText(password)) {
    throw new Error('A new password is required.')
  }

  const { error } = await client.auth.updateUser({ password })
  if (error) {
    throw error
  }

  return true
}

export async function fetchOrganisationSettings() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      organisation: buildDefaultOrganisation(),
      organisationSettings: { ...DEFAULT_ORGANISATION_SETTINGS },
      membershipRole: 'admin',
      persisted: false,
    }
  }

  return ensureOrganisationContext(requireClient())
}

export async function fetchAgencyOnboardingSettings() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      onboarding: buildDefaultAgencyOnboarding(),
      organisation: buildDefaultOrganisation(),
      membershipRole: 'admin',
      persisted: false,
    }
  }

  const context = await ensureOrganisationContext(requireClient())
  return {
    onboarding: mergeAgencyOnboardingDraft(context.organisationSettings?.agencyOnboarding, {}, context.profile),
    organisation: context.organisation,
    membershipRole: context.membershipRole,
    persisted: context.persisted,
  }
}

export async function saveAgencyOnboardingDraft(input = {}) {
  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  const mergedDraft = buildAgencyOnboardingStorageRecord({
    onboarding: mergeAgencyOnboardingDraft(context.organisationSettings?.agencyOnboarding, input, context.profile),
    completed: false,
  })

  if (!context.organisation.id) {
    return {
      onboarding: mergedDraft,
      organisation: context.organisation,
      membershipRole: context.membershipRole,
      persisted: false,
    }
  }

  const mergedSettings = {
    ...DEFAULT_ORGANISATION_SETTINGS,
    ...safeJson(context.organisationSettings, DEFAULT_ORGANISATION_SETTINGS),
    agencyOnboarding: mergedDraft,
    organisationBranches: mergedDraft.branchStructure?.branches || [],
    organisationPermissions: mergedDraft.permissions || {},
  }

  const { error } = await client
    .from('organisation_settings')
    .upsert(
      {
        organisation_id: context.organisation.id,
        settings_json: mergedSettings,
      },
      { onConflict: 'organisation_id' },
    )

  if (error) {
    throw error
  }

  return {
    onboarding: mergedDraft,
    organisation: context.organisation,
    membershipRole: context.membershipRole,
    persisted: true,
  }
}

export async function completeAgencyOnboarding(input = {}) {
  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  const mergedDraft = buildAgencyOnboardingStorageRecord({
    onboarding: mergeAgencyOnboardingDraft(context.organisationSettings?.agencyOnboarding, input, context.profile),
    completed: true,
  })

  if (!context.organisation.id) {
    throw new Error('Organisation onboarding requires the settings schema to be installed.')
  }

  const organisationPayload = {
    id: context.organisation.id,
    ...mapAgencyOnboardingToOrganisationPayload(mergedDraft, context.organisation),
  }

  const organisationResult = await client
    .from('organisations')
    .upsert(organisationPayload, { onConflict: 'id' })
    .select(`
      id,
      name,
      display_name,
      logo_url,
      company_email,
      company_phone,
      website,
      address_line_1,
      address_line_2,
      city,
      province,
      postal_code,
      country,
      support_email,
      support_phone,
      primary_contact_person
    `)
    .single()

  if (organisationResult.error) {
    throw organisationResult.error
  }

  const user = await getAuthenticatedUser()
  const principalName = normalizeText(mergedDraft?.principalInformation?.principalFullName)
  const principalParts = principalName.split(/\s+/).filter(Boolean)
  const principalFirstName = principalParts[0] || context.profile?.firstName || ''
  const principalLastName = principalParts.slice(1).join(' ') || context.profile?.lastName || ''
  const principalEmail = normalizeText(mergedDraft?.principalInformation?.emailAddress || user.email || context.profile?.email)

  const principalMembershipResult = await client.from('organisation_users').upsert(
    {
      organisation_id: context.organisation.id,
      user_id: user.id,
      first_name: normalizeNullableText(principalFirstName),
      last_name: normalizeNullableText(principalLastName),
      email: principalEmail,
      role: 'admin',
      status: 'active',
      invited_at: new Date().toISOString(),
      accepted_at: new Date().toISOString(),
    },
    { onConflict: 'organisation_id,email' },
  )

  if (principalMembershipResult.error && !isMissingTableError(principalMembershipResult.error, 'organisation_users')) {
    throw principalMembershipResult.error
  }

  const mergedSettings = {
    ...DEFAULT_ORGANISATION_SETTINGS,
    ...safeJson(context.organisationSettings, DEFAULT_ORGANISATION_SETTINGS),
    agencyOnboarding: mergedDraft,
    organisationBranches: mergedDraft.branchStructure?.branches || [],
    organisationPermissions: mergedDraft.permissions || {},
  }

  const settingsResult = await client
    .from('organisation_settings')
    .upsert(
      {
        organisation_id: context.organisation.id,
        settings_json: mergedSettings,
      },
      { onConflict: 'organisation_id' },
    )

  if (settingsResult.error) {
    throw settingsResult.error
  }

  const inviteRows = Array.isArray(mergedDraft.invitations) ? mergedDraft.invitations.filter((invite) => invite.email) : []
  if (inviteRows.length) {
    const invitedAt = new Date().toISOString()
    for (const invite of inviteRows) {
      const fullName = normalizeText(invite.name)
      const fullNameParts = fullName.split(/\s+/).filter(Boolean)
      const firstName = fullNameParts[0] || null
      const lastName = fullNameParts.slice(1).join(' ') || null
      const primaryRole = mapAgencyInviteRoleToOrganisationRole(invite.role)

      const payload = {
        organisation_id: context.organisation.id,
        first_name: normalizeNullableText(firstName),
        last_name: normalizeNullableText(lastName),
        email: normalizeText(invite.email).toLowerCase(),
        role: primaryRole,
        status: 'invited',
        invited_at: invitedAt,
      }

      let inviteResult = await client.from('organisation_users').upsert(payload, { onConflict: 'organisation_id,email' })
      if (inviteResult.error && primaryRole === 'branch_manager') {
        inviteResult = await client
          .from('organisation_users')
          .upsert({ ...payload, role: 'agent' }, { onConflict: 'organisation_id,email' })
      }
      if (inviteResult.error && !isMissingTableError(inviteResult.error, 'organisation_users')) {
        throw inviteResult.error
      }
    }
  }

  await updateUserProfile({
    userId: user.id,
    firstName: principalFirstName,
    lastName: principalLastName,
    companyName: mergedDraft?.agencyInformation?.agencyName || context.profile?.companyName || '',
    phoneNumber: mergedDraft?.principalInformation?.phoneNumber || context.profile?.phoneNumber || '',
    role: 'agent',
    onboardingCompleted: true,
  })

  return {
    onboarding: mergedDraft,
    organisation: normalizeOrganisationRow(organisationResult.data, context.profile),
    membershipRole: 'admin',
    persisted: true,
  }
}

export async function updateOrganisationSettings(input = {}) {
  const client = requireClient()
  const context = await ensureOrganisationContext(client)

  if (!context.organisation.id) {
    return {
      ...context,
      organisation: {
        ...context.organisation,
        ...input,
      },
    }
  }

  const organisationPayload = {
    id: context.organisation.id,
    name: normalizeText(input.name) || context.organisation.name,
    display_name: normalizeNullableText(input.displayName) || normalizeText(input.name) || context.organisation.displayName,
    logo_url: normalizeNullableText(input.logoUrl),
    company_email: normalizeNullableText(input.companyEmail),
    company_phone: normalizeNullableText(input.companyPhone),
    website: normalizeNullableText(input.website),
    address_line_1: normalizeNullableText(input.addressLine1),
    address_line_2: normalizeNullableText(input.addressLine2),
    city: normalizeNullableText(input.city),
    province: normalizeNullableText(input.province),
    postal_code: normalizeNullableText(input.postalCode),
    country: normalizeNullableText(input.country) || 'South Africa',
    support_email: normalizeNullableText(input.supportEmail),
    support_phone: normalizeNullableText(input.supportPhone),
    primary_contact_person: normalizeNullableText(input.primaryContactPerson),
  }

  const { data, error } = await client
    .from('organisations')
    .upsert(organisationPayload, { onConflict: 'id' })
    .select(`
      id,
      name,
      display_name,
      logo_url,
      company_email,
      company_phone,
      website,
      address_line_1,
      address_line_2,
      city,
      province,
      postal_code,
      country,
      support_email,
      support_phone,
      primary_contact_person
    `)
    .single()

  if (error) {
    throw error
  }

  return {
    ...context,
    organisation: normalizeOrganisationRow(data, context.profile),
  }
}

export async function fetchWorkflowSettings() {
  const context = await fetchOrganisationSettings()
  return {
    membershipRole: context.membershipRole,
    persisted: context.persisted,
    ...safeJson(context.organisationSettings, DEFAULT_ORGANISATION_SETTINGS),
  }
}

export async function updateWorkflowSettings(input = {}) {
  const client = requireClient()
  const context = await ensureOrganisationContext(client)

  if (!context.organisation.id) {
    return {
      membershipRole: context.membershipRole,
      persisted: false,
      ...safeJson(input, DEFAULT_ORGANISATION_SETTINGS),
    }
  }

  const merged = {
    ...DEFAULT_ORGANISATION_SETTINGS,
    ...context.organisationSettings,
    ...input,
  }

  const { data, error } = await client
    .from('organisation_settings')
    .upsert(
      {
        organisation_id: context.organisation.id,
        settings_json: merged,
      },
      { onConflict: 'organisation_id' },
    )
    .select('settings_json')
    .single()

  if (error) {
    throw error
  }

  return {
    membershipRole: context.membershipRole,
    persisted: true,
    ...safeJson(data?.settings_json, DEFAULT_ORGANISATION_SETTINGS),
  }
}

export async function fetchDocumentLabelMappingReport({ limit = 300 } = {}) {
  const client = requireClient()
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(50, Math.min(1000, Number(limit))) : 300

  let sharedQuery = await client
    .from('documents')
    .select('id, transaction_id, name, category, document_type, stage_key, created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (
    sharedQuery.error &&
    (isMissingColumnError(sharedQuery.error, 'document_type') || isMissingColumnError(sharedQuery.error, 'stage_key'))
  ) {
    sharedQuery = await client
      .from('documents')
      .select('id, transaction_id, name, category, created_at')
      .order('created_at', { ascending: false })
      .limit(safeLimit)
  }

  if (sharedQuery.error && !isMissingTableError(sharedQuery.error, 'documents')) {
    throw sharedQuery.error
  }

  let requiredQuery = await client
    .from('transaction_required_documents')
    .select('id, transaction_id, document_key, document_label, group_key, created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (requiredQuery.error && isMissingColumnError(requiredQuery.error, 'group_key')) {
    requiredQuery = await client
      .from('transaction_required_documents')
      .select('id, transaction_id, document_key, document_label, created_at')
      .order('created_at', { ascending: false })
      .limit(safeLimit)
  }

  if (requiredQuery.error && !isMissingTableError(requiredQuery.error, 'transaction_required_documents')) {
    throw requiredQuery.error
  }

  const sharedRows = sharedQuery.error ? [] : sharedQuery.data || []
  const requiredRows = requiredQuery.error ? [] : requiredQuery.data || []
  const report = buildDocumentMappingReportRows({ sharedRows, requiredRows })

  return {
    generatedAt: new Date().toISOString(),
    scanned: {
      sharedDocuments: sharedRows.length,
      requiredDocuments: requiredRows.length,
    },
    totals: report.totals,
    rows: report.rows,
  }
}

export async function listDevelopmentSettings() {
  const client = requireClient()
  let baseQuery = await client.from('developments').select('id, name, planned_units, code').order('name')

  if (baseQuery.error && isMissingColumnError(baseQuery.error, 'code')) {
    baseQuery = await client.from('developments').select('id, name, planned_units').order('name')
  }

  const { data: developments, error } = baseQuery

  if (error) {
    throw error
  }

  const developmentIds = (developments || []).map((item) => item.id)
  let profilesById = {}
  let settingsById = {}
  let attorneyById = {}

  if (developmentIds.length) {
    const [profileQuery, settingsQuery, attorneyQuery] = await Promise.all([
      client
        .from('development_profiles')
        .select('development_id, location, address, description, status')
        .in('development_id', developmentIds),
      client
        .from('development_settings')
        .select(
          'development_id, client_portal_enabled, snag_reporting_enabled, alteration_requests_enabled, service_reviews_enabled, reservation_deposit_enabled_by_default, reservation_deposit_amount, reservation_deposit_payment_details, reservation_deposit_notification_recipients',
        )
        .in('development_id', developmentIds),
      client
        .from('development_attorney_configs')
        .select('development_id, attorney_firm_name, primary_contact_email')
        .in('development_id', developmentIds),
    ])

    if (!profileQuery.error) {
      profilesById = Object.fromEntries((profileQuery.data || []).map((row) => [row.development_id, row]))
    } else if (!isMissingTableError(profileQuery.error, 'development_profiles')) {
      throw profileQuery.error
    }

    if (!settingsQuery.error) {
      settingsById = Object.fromEntries((settingsQuery.data || []).map((row) => [row.development_id, row]))
    } else if (
      isMissingColumnError(settingsQuery.error, 'reservation_deposit_enabled_by_default') ||
      isMissingColumnError(settingsQuery.error, 'reservation_deposit_amount') ||
      isMissingColumnError(settingsQuery.error, 'reservation_deposit_payment_details') ||
      isMissingColumnError(settingsQuery.error, 'reservation_deposit_notification_recipients')
    ) {
      const fallbackSettingsQuery = await client
        .from('development_settings')
        .select('development_id, client_portal_enabled, snag_reporting_enabled, alteration_requests_enabled, service_reviews_enabled')
        .in('development_id', developmentIds)

      if (!fallbackSettingsQuery.error) {
        settingsById = Object.fromEntries((fallbackSettingsQuery.data || []).map((row) => [row.development_id, row]))
      } else if (!isMissingTableError(fallbackSettingsQuery.error, 'development_settings')) {
        throw fallbackSettingsQuery.error
      }
    } else if (!isMissingTableError(settingsQuery.error, 'development_settings')) {
      throw settingsQuery.error
    }

    if (!attorneyQuery.error) {
      attorneyById = Object.fromEntries((attorneyQuery.data || []).map((row) => [row.development_id, row]))
    } else if (!isMissingTableError(attorneyQuery.error, 'development_attorney_configs')) {
      throw attorneyQuery.error
    }
  }

  return (developments || []).map((development) =>
    normalizeDevelopmentSettingsRecord({
      development,
      profile: profilesById[development.id],
      settings: settingsById[development.id] || {},
      attorneyConfig: attorneyById[development.id] || {},
    }),
  )
}

export async function listDevelopmentTeamAssignments() {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }

  const client = requireClient()
  let baseQuery = await client.from('developments').select('id, name, planned_units, code').order('name')

  if (baseQuery.error && isMissingColumnError(baseQuery.error, 'code')) {
    baseQuery = await client.from('developments').select('id, name, planned_units').order('name')
  }

  const { data: developments, error } = baseQuery

  if (error) {
    throw error
  }

  const developmentIds = (developments || []).map((item) => item.id).filter(Boolean)
  let settingsById = {}

  if (developmentIds.length) {
    const settingsQuery = await client
      .from('development_settings')
      .select('development_id, stakeholder_teams')
      .in('development_id', developmentIds)

    if (!settingsQuery.error) {
      settingsById = Object.fromEntries((settingsQuery.data || []).map((row) => [row.development_id, row]))
    } else if (
      !isMissingTableError(settingsQuery.error, 'development_settings') &&
      !isMissingColumnError(settingsQuery.error, 'stakeholder_teams')
    ) {
      throw settingsQuery.error
    }
  }

  return (developments || []).map((development) => {
    const rawTeams = settingsById[development.id]?.stakeholder_teams || {}
    const agents = Array.isArray(rawTeams.agents) ? rawTeams.agents : []
    const conveyancers = Array.isArray(rawTeams.conveyancers) ? rawTeams.conveyancers : []
    const bondOriginators = Array.isArray(rawTeams.bondOriginators || rawTeams.bond_originators)
      ? rawTeams.bondOriginators || rawTeams.bond_originators
      : []

    return {
      id: development.id,
      name: normalizeText(development.name) || 'Unnamed development',
      code: normalizeText(development.code),
      plannedUnits: Number(development.planned_units || 0),
      stakeholderTeams: {
        agents,
        conveyancers,
        bondOriginators,
      },
    }
  })
}

export async function saveDevelopmentConfiguration(input = {}) {
  const client = requireClient()

  if (!input.id) {
    const created = await createDevelopment({
      name: input.name,
      plannedUnits: input.plannedUnits,
      profile: {
        location: input.location,
        address: input.address,
        description: input.description,
        status: input.status,
      },
    })

    if (input.code) {
      await client.from('developments').update({ code: normalizeNullableText(input.code) }).eq('id', created.id)
    }

    return {
      id: created.id,
    }
  }

  const { error: developmentError } = await client
    .from('developments')
    .update({
      name: normalizeText(input.name),
      planned_units: Number(input.plannedUnits || 0),
      code: normalizeNullableText(input.code),
    })
    .eq('id', input.id)

  if (developmentError && isMissingColumnError(developmentError, 'code')) {
    const fallbackUpdate = await client
      .from('developments')
      .update({
        name: normalizeText(input.name),
        planned_units: Number(input.plannedUnits || 0),
      })
      .eq('id', input.id)

    if (fallbackUpdate.error) {
      throw fallbackUpdate.error
    }
  } else if (developmentError) {
    throw developmentError
  }

  const profileResult = await upsertByDevelopmentIdWithFallback(client, 'development_profiles', {
    development_id: input.id,
    location: normalizeNullableText(input.location),
    address: normalizeNullableText(input.address),
    description: normalizeNullableText(input.description),
    status: normalizeNullableText(input.status) || 'Planning',
  })

  if (profileResult.error && !isMissingTableError(profileResult.error, 'development_profiles')) {
    throw profileResult.error
  }

  await updateDevelopmentSettings(input.id, {
    client_portal_enabled: Boolean(input.clientPortalEnabled),
    snag_reporting_enabled: Boolean(input.snagReportingEnabled),
    alteration_requests_enabled: Boolean(input.alterationRequestsEnabled),
    service_reviews_enabled: false,
    reservation_deposit_enabled_by_default: Boolean(input.reservationDepositEnabledByDefault),
    reservation_deposit_amount:
      input.reservationDepositAmount === null ||
      input.reservationDepositAmount === undefined ||
      input.reservationDepositAmount === '' ||
      Number.isNaN(Number(input.reservationDepositAmount))
        ? null
        : Number(input.reservationDepositAmount),
    reservation_deposit_payment_details: {
      account_holder_name: normalizeNullableText(input.reservationAccountHolderName),
      bank_name: normalizeNullableText(input.reservationBankName),
      account_number: normalizeNullableText(input.reservationAccountNumber),
      branch_code: normalizeNullableText(input.reservationBranchCode),
      account_type: normalizeNullableText(input.reservationAccountType),
      payment_reference_format: normalizeNullableText(input.reservationPaymentReferenceFormat),
      payment_instructions: normalizeNullableText(input.reservationPaymentInstructions),
    },
    reservation_deposit_notification_recipients: String(input.reservationNotificationRecipients || '')
      .split(',')
      .map((value) => normalizeText(value))
      .filter(Boolean),
  })

  const attorneyConfig = await fetchDevelopmentAttorneyConfig(input.id)
  if (
    normalizeText(attorneyConfig.attorneyFirmName) !== normalizeText(input.attorneyName) ||
    normalizeText(attorneyConfig.primaryContactEmail) !== normalizeText(input.attorneyContactEmail)
  ) {
    await saveDevelopmentAttorneyConfig(input.id, {
      ...attorneyConfig,
      attorneyFirmName: normalizeText(input.attorneyName),
      primaryContactEmail: normalizeText(input.attorneyContactEmail),
    })
  }

  return { id: input.id }
}

export async function archiveDevelopmentSetting(developmentId) {
  const client = requireClient()
  const result = await upsertByDevelopmentIdWithFallback(client, 'development_profiles', {
    development_id: developmentId,
    status: 'Archived',
  })

  if (result.error && !isMissingTableError(result.error, 'development_profiles')) {
    throw result.error
  }

  return true
}

function normalizeOrganisationUserRow(row) {
  return {
    id: row?.id || null,
    userId: row?.user_id || null,
    firstName: normalizeText(row?.first_name),
    lastName: normalizeText(row?.last_name),
    fullName: [normalizeText(row?.first_name), normalizeText(row?.last_name)].filter(Boolean).join(' ') || normalizeText(row?.email),
    email: normalizeText(row?.email),
    role: normalizeText(row?.role) || 'viewer',
    status: normalizeText(row?.status) || 'invited',
    lastActiveAt: row?.last_active_at || null,
    invitedAt: row?.invited_at || null,
    acceptedAt: row?.accepted_at || null,
  }
}

export async function listOrganisationUsers() {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)

  if (!context.organisation.id) {
    return [
      {
        id: context.profile.id,
        userId: context.profile.id,
        firstName: context.profile.firstName,
        lastName: context.profile.lastName,
        fullName: context.profile.fullName || 'Current User',
        email: context.profile.email || '',
        role: context.membershipRole,
        status: 'active',
        lastActiveAt: null,
        invitedAt: null,
        acceptedAt: null,
      },
    ]
  }

  const { data, error } = await client
    .from('organisation_users')
    .select('id, user_id, first_name, last_name, email, role, status, invited_at, accepted_at, last_active_at')
    .eq('organisation_id', context.organisation.id)
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingTableError(error, 'organisation_users')) {
      return []
    }
    throw error
  }

  return (data || []).map(normalizeOrganisationUserRow)
}

export async function inviteOrganisationUser(input = {}) {
  const client = requireClient()
  const context = await ensureOrganisationContext(client)

  if (!context.organisation.id) {
    throw new Error('Organisation membership requires the settings schema to be installed.')
  }

  const payload = {
    organisation_id: context.organisation.id,
    first_name: normalizeNullableText(input.firstName),
    last_name: normalizeNullableText(input.lastName),
    email: normalizeText(input.email),
    role: normalizeText(input.role) || 'viewer',
    status: 'invited',
    invited_at: new Date().toISOString(),
  }

  const { data, error } = await client
    .from('organisation_users')
    .upsert(payload, { onConflict: 'organisation_id,email' })
    .select('id, user_id, first_name, last_name, email, role, status, invited_at, accepted_at, last_active_at')
    .single()

  if (error) {
    throw error
  }

  return normalizeOrganisationUserRow(data)
}

export async function updateOrganisationUserRole(userRowId, role) {
  const client = requireClient()

  const { data, error } = await client
    .from('organisation_users')
    .update({ role: normalizeText(role) || 'viewer' })
    .eq('id', userRowId)
    .select('id, user_id, first_name, last_name, email, role, status, invited_at, accepted_at, last_active_at')
    .single()

  if (error) {
    throw error
  }

  return normalizeOrganisationUserRow(data)
}

export async function deactivateOrganisationUser(userRowId) {
  const client = requireClient()

  const { data, error } = await client
    .from('organisation_users')
    .update({ status: 'deactivated' })
    .eq('id', userRowId)
    .select('id, user_id, first_name, last_name, email, role, status, invited_at, accepted_at, last_active_at')
    .single()

  if (error) {
    throw error
  }

  return normalizeOrganisationUserRow(data)
}

function normalizeSubscriptionRow(row, usage = {}) {
  return {
    id: row?.id || DEFAULT_SUBSCRIPTION.id,
    planName: normalizeText(row?.plan_name) || DEFAULT_SUBSCRIPTION.planName,
    billingType: normalizeText(row?.billing_type) || DEFAULT_SUBSCRIPTION.billingType,
    monthlyAmount: Number(row?.monthly_amount || 0),
    status: normalizeText(row?.status) || DEFAULT_SUBSCRIPTION.status,
    renewalDate: row?.renewal_date || DEFAULT_SUBSCRIPTION.renewalDate,
    activeDevelopments: Number(usage.activeDevelopments || 0),
    activeUsers: Number(usage.activeUsers || 0),
    includedDevelopments: row?.included_developments || 'Unlimited',
    includedUsers: row?.included_users || 'Unlimited',
    paymentMethodLast4: normalizeText(row?.payment_method_last4),
  }
}

export async function getSubscription() {
  if (!isSupabaseConfigured || !supabase) {
    return { ...DEFAULT_SUBSCRIPTION }
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  const [developments, users] = await Promise.all([listDevelopmentSettings(), listOrganisationUsers()])

  if (!context.organisation.id) {
    return normalizeSubscriptionRow({}, {
      activeDevelopments: developments.length,
      activeUsers: users.filter((item) => item.status !== 'deactivated').length,
    })
  }

  const { data, error } = await client
    .from('subscriptions')
    .select('id, plan_name, billing_type, monthly_amount, status, renewal_date, payment_method_last4, included_developments, included_users')
    .eq('organisation_id', context.organisation.id)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'subscriptions')) {
      return normalizeSubscriptionRow({}, {
        activeDevelopments: developments.length,
        activeUsers: users.filter((item) => item.status !== 'deactivated').length,
      })
    }
    throw error
  }

  return normalizeSubscriptionRow(data || {}, {
    activeDevelopments: developments.length,
    activeUsers: users.filter((item) => item.status !== 'deactivated').length,
  })
}

export async function listBillingInvoices() {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)

  if (!context.organisation.id) {
    return []
  }

  const { data, error } = await client
    .from('billing_invoices')
    .select('id, invoice_number, amount, status, issued_at, paid_at, invoice_url')
    .eq('organisation_id', context.organisation.id)
    .order('issued_at', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'billing_invoices')) {
      return []
    }
    throw error
  }

  return (data || []).map((row) => ({
    id: row.id,
    invoiceNumber: normalizeText(row.invoice_number) || 'Invoice',
    amount: Number(row.amount || 0),
    status: normalizeText(row.status) || 'issued',
    issuedAt: row.issued_at || null,
    paidAt: row.paid_at || null,
    invoiceUrl: normalizeText(row.invoice_url),
  }))
}
