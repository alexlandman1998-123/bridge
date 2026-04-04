import {
  createDevelopment,
  fetchDevelopmentAttorneyConfig,
  getOrCreateUserProfile,
  saveDevelopmentAttorneyConfig,
  updateUserProfile,
  updateDevelopmentSettings,
} from './api'
import { DEMO_PROFILE_ID } from './demoIds'
import { normalizeAppRole } from './roles'
import { isSupabaseConfigured, supabase } from './supabaseClient'

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

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
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
        .select('development_id, client_portal_enabled, snag_reporting_enabled, alteration_requests_enabled, service_reviews_enabled')
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

  const profileResult = await client.from('development_profiles').upsert(
    {
      development_id: input.id,
      location: normalizeNullableText(input.location),
      address: normalizeNullableText(input.address),
      description: normalizeNullableText(input.description),
      status: normalizeNullableText(input.status) || 'Planning',
    },
    { onConflict: 'development_id' },
  )

  if (profileResult.error && !isMissingTableError(profileResult.error, 'development_profiles')) {
    throw profileResult.error
  }

  await updateDevelopmentSettings(input.id, {
    client_portal_enabled: Boolean(input.clientPortalEnabled),
    snag_reporting_enabled: Boolean(input.snagReportingEnabled),
    alteration_requests_enabled: Boolean(input.alterationRequestsEnabled),
    service_reviews_enabled: false,
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
  const result = await client.from('development_profiles').upsert(
    {
      development_id: developmentId,
      status: 'Archived',
    },
    { onConflict: 'development_id' },
  )

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
