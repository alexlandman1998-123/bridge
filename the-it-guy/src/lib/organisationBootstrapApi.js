import { isActiveMembershipStatus, normalizeMembershipStatus } from '../constants/membershipStatuses'
import { normalizeOrganisationMembershipRole } from './organisationAccess'
import {
  buildDefaultAgencyOnboarding,
  mergeAgencyOnboardingDraft,
} from './agencyOnboarding'
import { getDefaultEmailTemplateSettings } from './emailTemplateSettings'
import { isUnsafeFallbackAllowed } from './envValidation'
import { getOrCreateUserProfile } from './profileApi'
import {
  clearSupabaseLocalAuthState,
  isSupabaseConfigured,
  isUserFromSubClaimMissingError,
  supabase,
} from './supabaseClient'
import {
  logUnsafeFallbackBlocked,
  resolveCurrentWorkspace,
  WorkspaceContextError,
} from '../services/workspaceResolutionService'

const ORGANISATION_CONTEXT_CACHE_TTL_MS = 60 * 1000

const DEFAULT_DEVELOPER_PROFILE_SETTINGS = {
  entityType: 'company',
  legalName: '',
  tradingName: '',
  registrationNumber: '',
  vatNumber: '',
  registeredAddress: '',
  postalAddress: '',
  email: '',
  phone: '',
  vatTreatment: '',
  notes: '',
  defaultSignatory: {
    fullName: '',
    role: '',
    idNumber: '',
    email: '',
    phone: '',
    signingCapacity: '',
  },
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
    organisation_structure_type: 'independent',
    structureType: 'independent',
  },
  preferredPartners: [],
  partnerRoutingRules: [],
  commissionStructures: [],
  commissionProfiles: [],
  emailTemplates: getDefaultEmailTemplateSettings(),
  partnerProfileContent: {
    agency: {
      aboutCompany: '',
      serviceDelivery: '',
    },
    bond_originator: {
      aboutCompany: '',
      serviceDelivery: '',
    },
    attorney_firm: {
      aboutCompany: '',
      serviceDelivery: '',
    },
    developer_company: {
      aboutCompany: '',
      serviceDelivery: '',
    },
  },
  developerProfile: DEFAULT_DEVELOPER_PROFILE_SETTINGS,
}

let organisationContextCache = null
let organisationContextInflight = null

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
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

function isFreshCacheEntry(entry) {
  return Boolean(entry?.value && Number(entry?.expiresAt || 0) > Date.now())
}

export function clearOrganisationRuntimeCache() {
  organisationContextCache = null
  organisationContextInflight = null
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
  if (message.includes('permission denied')) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (
      message.includes(String(tableName || '').toLowerCase()) &&
      (message.includes('does not exist') || message.includes('schema cache'))
    )
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

function isRlsPolicyError(error) {
  if (!error) return false
  const code = String(error.code || '').trim()
  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  return code === '42501' || message.includes('row-level security') || details.includes('row-level security')
}

function isPermissionDeniedError(error) {
  if (!error) return false
  if (isRlsPolicyError(error)) return true
  const code = String(error.code || '').trim().toLowerCase()
  const status = Number(error?.status || error?.statusCode || 0)
  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  return (
    status === 403 ||
    code === '403' ||
    code === 'permission_denied' ||
    message.includes('permission denied') ||
    details.includes('permission denied')
  )
}

function isUniqueConstraintError(error) {
  if (!error) return false
  const code = String(error.code || '').trim()
  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  return code === '23505' || message.includes('duplicate key') || details.includes('duplicate key')
}

function normalizeOrganisationDeveloperProfile(profile = {}) {
  const source = profile && typeof profile === 'object' ? profile : {}
  const defaultSignatorySource =
    source.defaultSignatory ||
    source.default_signatory ||
    source.authorisedSignatory ||
    source.authorizedSignatory ||
    source.signatory ||
    (Array.isArray(source.signatories) ? source.signatories[0] : null) ||
    {}

  return {
    ...DEFAULT_DEVELOPER_PROFILE_SETTINGS,
    entityType: source.entityType || source.entity_type || DEFAULT_DEVELOPER_PROFILE_SETTINGS.entityType,
    legalName: source.legalName || source.legal_name || source.name || '',
    tradingName: source.tradingName || source.trading_name || source.displayName || source.display_name || '',
    registrationNumber: source.registrationNumber || source.registration_number || source.companyRegistrationNumber || '',
    vatNumber: source.vatNumber || source.vat_number || '',
    registeredAddress: source.registeredAddress || source.registered_address || source.address || '',
    postalAddress: source.postalAddress || source.postal_address || '',
    email: source.email || source.companyEmail || source.company_email || '',
    phone: source.phone || source.companyPhone || source.company_phone || source.mobile || '',
    vatTreatment: source.vatTreatment || source.vat_treatment || '',
    notes: source.notes || '',
    defaultSignatory: {
      ...DEFAULT_DEVELOPER_PROFILE_SETTINGS.defaultSignatory,
      fullName: defaultSignatorySource.fullName || defaultSignatorySource.full_name || defaultSignatorySource.name || '',
      role: defaultSignatorySource.role || defaultSignatorySource.title || '',
      idNumber: defaultSignatorySource.idNumber || defaultSignatorySource.id_number || defaultSignatorySource.identityNumber || '',
      email: defaultSignatorySource.email || '',
      phone: defaultSignatorySource.phone || defaultSignatorySource.mobile || '',
      signingCapacity: defaultSignatorySource.signingCapacity || defaultSignatorySource.signing_capacity || defaultSignatorySource.capacity || '',
    },
  }
}

function buildDefaultOrganisation(profile = null) {
  const baseName = normalizeText(profile?.companyName) || 'Arch9 Workspace'

  return {
    id: null,
    name: baseName,
    displayName: baseName,
    type: 'agency',
    workspaceKind: 'agency',
    workspace_kind: 'agency',
    logoUrl: '',
    logoIconUrl: '',
    companyEmail: profile?.email || '',
    companyPhone: profile?.phoneNumber || '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    formattedAddress: '',
    suburb: '',
    city: '',
    province: '',
    postalCode: '',
    country: 'South Africa',
    latitude: null,
    longitude: null,
    googlePlaceId: '',
    supportEmail: profile?.email || '',
    supportPhone: profile?.phoneNumber || '',
    primaryContactPerson: profile?.fullName || '',
    settingsJson: {
      developerProfile: DEFAULT_DEVELOPER_PROFILE_SETTINGS,
    },
  }
}

function normalizeOrganisationRow(row, profile = null) {
  const fallback = buildDefaultOrganisation(profile)

  return {
    id: row?.id || fallback.id,
    name: normalizeText(row?.name) || fallback.name,
    displayName: normalizeText(row?.display_name) || fallback.displayName,
    type: normalizeText(row?.type) || fallback.type,
    workspaceKind: normalizeText(row?.workspace_kind || row?.workspaceKind) || fallback.workspaceKind,
    workspace_kind: normalizeText(row?.workspace_kind || row?.workspaceKind) || fallback.workspace_kind,
    logoUrl: normalizeText(row?.logo_url),
    logoIconUrl: normalizeText(row?.logo_icon_url || row?.logoIconUrl),
    companyEmail: normalizeText(row?.company_email) || fallback.companyEmail,
    companyPhone: normalizeText(row?.company_phone) || fallback.companyPhone,
    website: normalizeText(row?.website),
    addressLine1: normalizeText(row?.address_line_1),
    addressLine2: normalizeText(row?.address_line_2),
    formattedAddress: normalizeText(row?.formatted_address),
    suburb: normalizeText(row?.suburb),
    city: normalizeText(row?.city),
    province: normalizeText(row?.province),
    postalCode: normalizeText(row?.postal_code),
    country: normalizeText(row?.country) || fallback.country,
    latitude: row?.latitude === null || row?.latitude === undefined ? null : Number(row.latitude),
    longitude: row?.longitude === null || row?.longitude === undefined ? null : Number(row.longitude),
    googlePlaceId: normalizeText(row?.google_place_id),
    supportEmail: normalizeText(row?.support_email) || fallback.supportEmail,
    supportPhone: normalizeText(row?.support_phone) || fallback.supportPhone,
    primaryContactPerson: normalizeText(row?.primary_contact_person) || fallback.primaryContactPerson,
    settingsJson: (() => {
      const settingsJson = safeJson(row?.settings_json, {})
      return {
        ...settingsJson,
        developerProfile: normalizeOrganisationDeveloperProfile(settingsJson.developerProfile),
      }
    })(),
  }
}

function buildOrganisationContextResult({
  organisation,
  organisationSettings,
  membership,
  membershipRole,
  membershipStatus,
  onboardingMode,
  profile,
  persisted,
} = {}) {
  return {
    organisation,
    organisationSettings,
    membershipRole,
    membershipStatus,
    membership,
    membershipId: membership?.id || null,
    membershipBranchId: membership?.branch_id || membership?.primary_branch_id || null,
    membershipPrimaryBranchId: membership?.primary_branch_id || membership?.branch_id || null,
    membershipBranchScope: membership?.branch_scope || null,
    onboardingMode,
    profile,
    persisted,
  }
}

function blockUnsafeSettingsFallback({ service = '', attemptedFallbackType = '', profile = null, error = null } = {}) {
  logUnsafeFallbackBlocked({
    userId: profile?.id || '',
    service,
    missingContextType: 'workspace_context',
    attemptedFallbackType,
    metadata: { errorCode: error?.code || '', errorMessage: error?.message || '' },
  })
  throw new WorkspaceContextError('workspace_context_missing', {
    service,
    attemptedFallbackType,
    userId: profile?.id || '',
  })
}

async function getAuthenticatedUser() {
  const client = requireClient()
  const { data, error } = await client.auth.getUser()
  if (error) {
    if (isUserFromSubClaimMissingError(error)) {
      await clearSupabaseLocalAuthState()
      throw new Error('Your session is out of sync with this environment. Please sign in again.')
    }
    throw error
  }
  if (!data?.user?.id) {
    throw new Error('Authenticated user is required.')
  }
  return data.user
}

async function findActiveMembershipByUserId(client, userId) {
  const membershipQuery = await client
    .from('organisation_users')
    .select('id, organisation_id, role, status, email, branch_id, primary_branch_id, branch_scope')
    .eq('user_id', userId)
    .neq('status', 'deactivated')
    .order('updated_at', { ascending: false })
    .limit(10)

  if (membershipQuery.error) {
    if (
      isMissingColumnError(membershipQuery.error, 'branch_id') ||
      isMissingColumnError(membershipQuery.error, 'primary_branch_id') ||
      isMissingColumnError(membershipQuery.error, 'branch_scope')
    ) {
      const fallbackQuery = await client
        .from('organisation_users')
        .select('id, organisation_id, role, status, email')
        .eq('user_id', userId)
        .neq('status', 'deactivated')
        .order('updated_at', { ascending: false })
        .limit(10)

      if (fallbackQuery.error) {
        throw fallbackQuery.error
      }

      const fallbackRows = fallbackQuery.data || []
      return fallbackRows.find((row) => isActiveMembershipStatus(row?.status)) || fallbackRows[0] || null
    }
    throw membershipQuery.error
  }

  const rows = membershipQuery.data || []
  return (
    rows.find((row) => isActiveMembershipStatus(row?.status)) ||
    rows.find((row) => normalizeMembershipStatus(row?.status) === 'pending') ||
    rows[0] ||
    null
  )
}

async function findPendingInviteByEmail(client, email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  const inviteQuery = await client
    .from('organisation_users')
    .select('id, organisation_id, role, status, email')
    .eq('email', normalizedEmail)
    .eq('status', 'invited')
    .order('created_at', { ascending: true })
    .limit(1)

  if (inviteQuery.error) {
    throw inviteQuery.error
  }

  const invite = inviteQuery.data?.[0] || null
  if (!invite?.id) return invite

  let inviteWithExpiry = invite
  const expiryQuery = await client
    .from('organisation_users')
    .select('invitation_expires_at')
    .eq('id', invite.id)
    .maybeSingle()

  if (!expiryQuery.error && expiryQuery.data) {
    inviteWithExpiry = {
      ...invite,
      invitation_expires_at: expiryQuery.data.invitation_expires_at || null,
    }
  } else if (expiryQuery.error && !isMissingColumnError(expiryQuery.error, 'invitation_expires_at')) {
    throw expiryQuery.error
  }

  if (!inviteWithExpiry?.invitation_expires_at) return inviteWithExpiry
  const expiryTs = new Date(inviteWithExpiry.invitation_expires_at).getTime()
  if (!Number.isFinite(expiryTs) || expiryTs >= Date.now()) {
    return inviteWithExpiry
  }
  return null
}

async function activatePendingInviteMembership(client, { userId, inviteRowId }) {
  const rpcResult = await client.rpc('bridge_claim_pending_org_invite')
  if (!rpcResult.error) {
    const firstRow = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data
    if (firstRow?.id) {
      return firstRow
    }
  }

  const nowIso = new Date().toISOString()
  const fallbackResult = await client
    .from('organisation_users')
    .update({
      user_id: userId,
      status: 'active',
      accepted_at: nowIso,
    })
    .eq('id', inviteRowId)
    .eq('status', 'invited')
    .select('id, organisation_id, role, status, email, branch_id, primary_branch_id, branch_scope')
    .maybeSingle()

  if (fallbackResult.error) {
    if (
      isMissingColumnError(fallbackResult.error, 'branch_id') ||
      isMissingColumnError(fallbackResult.error, 'primary_branch_id') ||
      isMissingColumnError(fallbackResult.error, 'branch_scope')
    ) {
      const legacyResult = await client
        .from('organisation_users')
        .update({
          user_id: userId,
          status: 'active',
          accepted_at: nowIso,
        })
        .eq('id', inviteRowId)
        .eq('status', 'invited')
        .select('id, organisation_id, role, status, email')
        .maybeSingle()

      if (legacyResult.error) {
        if (rpcResult.error) {
          throw rpcResult.error
        }
        throw legacyResult.error
      }

      return legacyResult.data || null
    }
    if (rpcResult.error) {
      throw rpcResult.error
    }
    throw fallbackResult.error
  }

  return fallbackResult.data || null
}

async function syncProfileRoleFromMembership({ userId, profile, membershipRole }) {
  if (userId && membershipRole) {
    console.warn('[AUTH] legacy role sync skipped: membership.role must not overwrite profiles.role', {
      userId,
      membershipRole,
      profileRole: profile?.role || null,
    })
  }
  return profile
}

async function ensureOrganisationContext(client) {
  const user = await getAuthenticatedUser()
  let profile = await getOrCreateUserProfile({ user })
  console.debug('[ONBOARDING] org-context:start', {
    userId: user?.id || null,
    role: profile?.role || null,
    onboardingCompleted: Boolean(profile?.onboardingCompleted),
  })

  try {
    let membership = null

    try {
      const workspaceResolution = await resolveCurrentWorkspace(user.id, {
        client,
        user,
        profile,
        persistPreference: false,
      })
      const isOrganisationMembershipSource = (entry) => ['organisation_users', 'organization_members'].includes(normalizeText(entry?.source))
      const resolvedMembership = isOrganisationMembershipSource(workspaceResolution.currentMembership)
        ? workspaceResolution.currentMembership
        : (workspaceResolution.activeMemberships || []).find(isOrganisationMembershipSource) || null
      const pendingResolvedMembership = !resolvedMembership
        ? (workspaceResolution.pendingMemberships || []).find(isOrganisationMembershipSource) || null
        : null
      const rawResolvedMembership = resolvedMembership?.raw && typeof resolvedMembership.raw === 'object'
        ? resolvedMembership.raw
        : pendingResolvedMembership?.raw && typeof pendingResolvedMembership.raw === 'object'
          ? pendingResolvedMembership.raw
          : null

      const selectedResolvedMembership = resolvedMembership || pendingResolvedMembership

      membership = selectedResolvedMembership
        ? {
            ...(rawResolvedMembership || {}),
            id: normalizeText(rawResolvedMembership?.id || selectedResolvedMembership.id),
            organisation_id: normalizeText(rawResolvedMembership?.organisation_id || rawResolvedMembership?.organization_id || selectedResolvedMembership.workspaceId),
            role: normalizeText(
              rawResolvedMembership?.workspace_role ||
                rawResolvedMembership?.organisation_role ||
                rawResolvedMembership?.organization_role ||
                rawResolvedMembership?.role ||
                selectedResolvedMembership.workspaceRole ||
                selectedResolvedMembership.role,
            ),
            status: normalizeText(rawResolvedMembership?.status || rawResolvedMembership?.membership_status || selectedResolvedMembership.status || 'active'),
            email: normalizeText(rawResolvedMembership?.email || user.email || profile?.email),
            branch_id: rawResolvedMembership?.branch_id || selectedResolvedMembership.branchId || null,
            primary_branch_id: rawResolvedMembership?.primary_branch_id || selectedResolvedMembership.primaryBranchId || selectedResolvedMembership.branchId || null,
            branch_scope: rawResolvedMembership?.branch_scope || selectedResolvedMembership.branchScope || null,
          }
        : await findActiveMembershipByUserId(client, user.id)
    } catch (membershipError) {
      if (
        isMissingTableError(membershipError, 'organisation_users') ||
        isMissingColumnError(membershipError, 'organisation_id') ||
        isPermissionDeniedError(membershipError)
      ) {
        if (!isUnsafeFallbackAllowed()) {
          blockUnsafeSettingsFallback({
            service: 'organisationBootstrapApi.ensureOrganisationContext',
            attemptedFallbackType: 'default_organisation_membership_lookup_failed',
            profile,
            error: membershipError,
          })
        }
        return {
          organisation: buildDefaultOrganisation(profile),
          organisationSettings: { ...DEFAULT_ORGANISATION_SETTINGS },
          membershipRole: normalizeOrganisationMembershipRole(profile.role),
          membershipStatus: 'pending',
          onboardingMode: 'principal_setup',
          profile,
          persisted: false,
        }
      }
      throw membershipError
    }

    if (!membership) {
      const pendingInvite = await findPendingInviteByEmail(client, user.email)
      if (pendingInvite?.id) {
        console.debug('[ONBOARDING] org-invite:found', {
          inviteId: pendingInvite.id,
          organisationId: pendingInvite.organisation_id || null,
        })
        const activatedMembership = await activatePendingInviteMembership(client, {
          userId: user.id,
          inviteRowId: pendingInvite.id,
        })
        membership = activatedMembership || (await findActiveMembershipByUserId(client, user.id))
        console.debug('[ONBOARDING] org-invite:activated', {
          membershipRole: membership?.role || null,
          membershipStatus: membership?.status || null,
        })
      }
    }

    if (membership?.role) {
      profile = await syncProfileRoleFromMembership({
        userId: user.id,
        profile,
        membershipRole: membership.role,
      })
    }

    let organisation = null

    if (membership?.organisation_id) {
      const orgQuery = await client
        .from('organisations')
        .select(`
          id,
          name,
          display_name,
          type,
          workspace_kind,
          logo_url,
          settings_json,
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

    const resolvedOnboardingMode =
      !profile?.onboardingCompleted &&
      membership &&
      !['super_admin', 'principal', 'admin', 'developer'].includes(normalizeOrganisationMembershipRole(membership.role))
        ? 'invited_member'
        : 'principal_setup'

    if (!organisation) {
      if (profile?.onboardingCompleted && !isUnsafeFallbackAllowed()) {
        blockUnsafeSettingsFallback({
          service: 'organisationBootstrapApi.ensureOrganisationContext',
          attemptedFallbackType: 'default_organisation_missing_workspace',
          profile,
        })
      }
      return {
        organisation: buildDefaultOrganisation(profile),
        organisationSettings: { ...DEFAULT_ORGANISATION_SETTINGS },
        membershipRole: normalizeOrganisationMembershipRole(membership?.role || profile.role),
        membershipStatus: membership?.status || 'pending',
        onboardingMode: resolvedOnboardingMode,
        profile,
        persisted: false,
      }
    }

    const settingsQuery = await client
      .from('organisation_settings')
      .select('settings_json')
      .eq('organisation_id', organisation.id)
      .maybeSingle()

    if (settingsQuery.error) {
      if (isMissingTableError(settingsQuery.error, 'organisation_settings')) {
        if (!isUnsafeFallbackAllowed()) {
          blockUnsafeSettingsFallback({
            service: 'organisationBootstrapApi.ensureOrganisationContext',
            attemptedFallbackType: 'default_organisation_settings_missing_table',
            profile,
            error: settingsQuery.error,
          })
        }
        return {
          organisation,
          organisationSettings: { ...DEFAULT_ORGANISATION_SETTINGS },
          membershipRole: normalizeOrganisationMembershipRole(membership?.role || profile.role),
          membershipStatus: membership?.status || 'active',
          onboardingMode: resolvedOnboardingMode,
          profile,
          persisted: false,
        }
      }
      if (isRlsPolicyError(settingsQuery.error)) {
        if (!isUnsafeFallbackAllowed()) {
          blockUnsafeSettingsFallback({
            service: 'organisationBootstrapApi.ensureOrganisationContext',
            attemptedFallbackType: 'default_organisation_settings_rls_denied',
            profile,
            error: settingsQuery.error,
          })
        }
        return {
          organisation,
          organisationSettings: { ...DEFAULT_ORGANISATION_SETTINGS },
          membershipRole: normalizeOrganisationMembershipRole(membership?.role || profile.role),
          membershipStatus: membership?.status || 'active',
          onboardingMode: resolvedOnboardingMode,
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

      if (insertSettings.error) {
        if (isUniqueConstraintError(insertSettings.error)) {
          const existingSettings = await client
            .from('organisation_settings')
            .select('settings_json')
            .eq('organisation_id', organisation.id)
            .maybeSingle()

          if (!existingSettings.error && existingSettings.data) {
            return buildOrganisationContextResult({
              organisation,
              organisationSettings: safeJson(existingSettings.data.settings_json, DEFAULT_ORGANISATION_SETTINGS),
              membershipRole: normalizeOrganisationMembershipRole(membership?.role || profile.role),
              membershipStatus: membership?.status || 'active',
              membership,
              onboardingMode: resolvedOnboardingMode,
              profile,
              persisted: true,
            })
          }

          if (
            !existingSettings.error ||
            isMissingTableError(existingSettings.error, 'organisation_settings') ||
            isRlsPolicyError(existingSettings.error)
          ) {
            return buildOrganisationContextResult({
              organisation,
              organisationSettings: { ...DEFAULT_ORGANISATION_SETTINGS },
              membershipRole: normalizeOrganisationMembershipRole(membership?.role || profile.role),
              membershipStatus: membership?.status || 'active',
              membership,
              onboardingMode: resolvedOnboardingMode,
              profile,
              persisted: false,
            })
          }

          throw existingSettings.error
        }

        if (
          !isMissingTableError(insertSettings.error, 'organisation_settings') &&
          !isRlsPolicyError(insertSettings.error)
        ) {
          throw insertSettings.error
        }
      }

      return buildOrganisationContextResult({
        organisation,
        organisationSettings: safeJson(insertSettings.data?.settings_json, DEFAULT_ORGANISATION_SETTINGS),
        membershipRole: normalizeOrganisationMembershipRole(membership?.role || profile.role),
        membershipStatus: membership?.status || 'active',
        membership,
        onboardingMode: resolvedOnboardingMode,
        profile,
        persisted: !insertSettings.error,
      })
    }

    return buildOrganisationContextResult({
      organisation,
      organisationSettings: safeJson(settingsQuery.data.settings_json, DEFAULT_ORGANISATION_SETTINGS),
      membershipRole: normalizeOrganisationMembershipRole(membership?.role || profile.role),
      membershipStatus: membership?.status || 'active',
      membership,
      onboardingMode: resolvedOnboardingMode,
      profile,
      persisted: true,
    })
  } catch (error) {
    console.error('[ONBOARDING] org-context:failed', error)
    if (
      isMissingTableError(error, 'organisation_users') ||
      isMissingTableError(error, 'organisations') ||
      isMissingTableError(error, 'organisation_settings') ||
      isPermissionDeniedError(error)
    ) {
      if (!isUnsafeFallbackAllowed()) {
        blockUnsafeSettingsFallback({
          service: 'organisationBootstrapApi.ensureOrganisationContext',
          attemptedFallbackType: 'default_organisation_context_error',
          profile,
          error,
        })
      }
      return {
        organisation: buildDefaultOrganisation(profile),
        organisationSettings: { ...DEFAULT_ORGANISATION_SETTINGS },
        membershipRole: normalizeOrganisationMembershipRole(profile.role),
        membershipStatus: 'pending',
        onboardingMode: 'principal_setup',
        profile,
        persisted: false,
      }
    }
    throw error
  }
}

async function ensureOrganisationContextCached(client) {
  if (isFreshCacheEntry(organisationContextCache)) {
    return organisationContextCache.value
  }
  if (organisationContextInflight) {
    return organisationContextInflight
  }

  organisationContextInflight = ensureOrganisationContext(client)
    .then((context) => {
      organisationContextCache = {
        value: context,
        expiresAt: Date.now() + ORGANISATION_CONTEXT_CACHE_TTL_MS,
      }
      return context
    })
    .finally(() => {
      organisationContextInflight = null
    })

  return organisationContextInflight
}

function resolveBrandingAssetSource({ bucket = '', path = '', fallbackUrl = '' } = {}) {
  let safeBucket = normalizeText(bucket)
  let safePath = normalizeText(path)
  const safeFallback = normalizeText(fallbackUrl)
  if ((!safeBucket || !safePath) && safeFallback) {
    const storageMatch = safeFallback.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/i)
    if (storageMatch?.[1] && storageMatch?.[2]) {
      safeBucket = decodeURIComponent(storageMatch[1])
      safePath = decodeURIComponent(storageMatch[2])
    }
  }

  return {
    bucket: safeBucket,
    path: safePath,
    fallbackUrl: safeFallback,
  }
}

async function resolveBrandingStorageAssetUrl(client, { bucket = '', path = '' } = {}) {
  const safeBucket = normalizeText(bucket)
  const safePath = normalizeText(path)
  if (!safeBucket || !safePath) {
    return ''
  }

  const storage = client.storage.from(safeBucket)
  const signedResult = await storage.createSignedUrl(safePath, 60 * 60 * 24 * 30)
  const signedUrl = normalizeText(signedResult?.data?.signedUrl)
  if (!signedResult?.error && signedUrl) {
    return signedUrl
  }

  const { data: publicUrlData } = storage.getPublicUrl(safePath)
  return normalizeText(publicUrlData?.publicUrl)
}

async function resolveBrandingAssetUrl(client, input = {}) {
  const source = resolveBrandingAssetSource(input)
  if (!source.bucket || !source.path) {
    return source.fallbackUrl
  }

  const resolvedUrl = await resolveBrandingStorageAssetUrl(client, source)
  return resolvedUrl || source.fallbackUrl
}

async function hydrateAgencyOnboardingBrandingUrls(client, onboarding = {}) {
  const branding = onboarding?.branding && typeof onboarding.branding === 'object' ? onboarding.branding : {}
  const storageUrlRequests = new Map()
  const resolveAsset = (input = {}) => {
    const source = resolveBrandingAssetSource(input)
    if (!source.bucket || !source.path) {
      return Promise.resolve(source.fallbackUrl)
    }

    // Multiple branding slots commonly reuse one source image. Share the
    // signing request while still applying each slot's own fallback URL.
    const sourceKey = `${source.bucket}\u0000${source.path}`
    let request = storageUrlRequests.get(sourceKey)
    if (!request) {
      request = resolveBrandingStorageAssetUrl(client, source)
      storageUrlRequests.set(sourceKey, request)
    }

    return request.then((resolvedUrl) => resolvedUrl || source.fallbackUrl)
  }

  // Branding does not have ordering dependencies. Starting all resolves at
  // once removes a multi-request storage waterfall from organisation bootstrap.
  const [lightUrl, iconUrl, darkUrl, faviconUrl, portalIconUrl, mobileIconUrl, browserTileUrl] = await Promise.all([
    resolveAsset({
      bucket: branding.logoLightBucket,
      path: branding.logoLightPath,
      fallbackUrl: branding.logoLight,
    }),
    resolveAsset({
      bucket: branding.logoIconBucket,
      path: branding.logoIconPath,
      fallbackUrl: branding.logoIcon || branding.logoIconUrl,
    }),
    resolveAsset({
      bucket: branding.logoDarkBucket,
      path: branding.logoDarkPath,
      fallbackUrl: branding.logoDark,
    }),
    resolveAsset({
      bucket: branding.faviconBucket,
      path: branding.faviconPath,
      fallbackUrl: branding.favicon,
    }),
    resolveAsset({
      bucket: branding.portalIconBucket,
      path: branding.portalIconPath,
      fallbackUrl: branding.portalIcon,
    }),
    resolveAsset({
      bucket: branding.mobileIconBucket,
      path: branding.mobileIconPath,
      fallbackUrl: branding.mobileIcon,
    }),
    resolveAsset({
      bucket: branding.browserTileBucket,
      path: branding.browserTilePath,
      fallbackUrl: branding.browserTile,
    }),
  ])

  return {
    ...onboarding,
    branding: {
      ...branding,
      logoLight: lightUrl || normalizeText(branding.logoLight),
      logoIcon: iconUrl || normalizeText(branding.logoIcon || branding.logoIconUrl),
      logoDark: darkUrl || normalizeText(branding.logoDark),
      favicon: faviconUrl || normalizeText(branding.favicon),
      portalIcon: portalIconUrl || normalizeText(branding.portalIcon),
      mobileIcon: mobileIconUrl || normalizeText(branding.mobileIcon),
      browserTile: browserTileUrl || normalizeText(branding.browserTile),
    },
  }
}

export async function fetchAgencyOnboardingSettings({ forceRefresh = false } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    if (!isUnsafeFallbackAllowed()) {
      blockUnsafeSettingsFallback({
        service: 'organisationBootstrapApi.fetchAgencyOnboardingSettings',
        attemptedFallbackType: 'demo_agency_onboarding_no_supabase',
      })
    }
    console.debug('[ONBOARDING] agency-settings:fallback-demo')
    return {
      onboarding: buildDefaultAgencyOnboarding(),
      organisation: buildDefaultOrganisation(),
      membershipRole: 'viewer',
      membershipStatus: 'pending',
      onboardingMode: 'principal_setup',
      persisted: false,
    }
  }

  console.debug('[ONBOARDING] agency-settings:start')
  try {
    if (forceRefresh) {
      clearOrganisationRuntimeCache()
    }
    const client = requireClient()
    const context = await ensureOrganisationContextCached(client)
    const mergedOnboarding = mergeAgencyOnboardingDraft(context.organisationSettings?.agencyOnboarding, {}, context.profile)
    const hydratedOnboarding = await hydrateAgencyOnboardingBrandingUrls(client, mergedOnboarding)
    const response = {
      onboarding: hydratedOnboarding,
      organisation: context.organisation,
      membershipRole: context.membershipRole,
      membershipStatus: context.membershipStatus,
      onboardingMode: context.onboardingMode,
      persisted: context.persisted,
    }
    console.debug('[ONBOARDING] agency-settings:success', {
      organisationId: context?.organisation?.id || null,
      onboardingMode: context?.onboardingMode || 'principal_setup',
      membershipRole: context?.membershipRole || null,
      membershipStatus: context?.membershipStatus || null,
      persisted: Boolean(context?.persisted),
    })
    return response
  } catch (error) {
    console.error('[ONBOARDING] agency-settings:failed', error)
    throw error
  }
}

export const __organisationBootstrapApiTestUtils = Object.freeze({
  hydrateAgencyOnboardingBrandingUrls,
  resolveBrandingAssetSource,
  resolveBrandingAssetUrl,
  resolveBrandingStorageAssetUrl,
})
