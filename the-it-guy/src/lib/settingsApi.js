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
import { normalizeOrganisationMembershipRole } from './organisationAccess'
import { normalizeAppRole } from './roles'
import {
  BRANDING_BUCKET_CANDIDATES,
  PROFILE_AVATAR_BUCKET_CANDIDATES,
  clearSupabaseLocalAuthState,
  invokeEdgeFunction,
  isSupabaseConfigured,
  isUserFromSubClaimMissingError,
  supabase,
} from './supabaseClient'
import {
  buildDefaultAgencyOnboarding,
  createAgencyInviteDraft,
  isCommercialAgencyType,
  mergeAgencyOnboardingDraft,
  normalizeAgencyType,
  normalizeBranchAgentCount,
  normalizeBranchManagerName,
} from './agencyOnboarding'
import {
  PREFERRED_PARTNER_TYPE_VALUES,
  normalizePreferredPartnerType,
  sortPreferredPartners,
} from './preferredPartners'
import {
  getDefaultEmailTemplateSettings,
  getEmailTemplateSettingsFromOrganisationSettings,
  sanitizeEmailTemplateSettings,
} from './emailTemplateSettings'
import {
  PARTNER_ROUTING_MODES,
  PARTNER_ROUTING_SOURCE_TYPES,
  PARTNER_ROUTING_TARGET_TYPES,
} from '../constants/bondRoutingContract'
import { assertPermission } from '../auth/permissions/permissionResolver'
import { PERMISSIONS } from '../auth/permissions/permissionRegistry'
import { ENTITLEMENT_KEYS } from '../constants/workspaceEntitlements'
import { recordSecurityAuditEvent } from '../services/auditLogService'
import {
  AGENCY_AUTHORITY_ACTIONS,
  assertAgencyAuthority,
  classifyRoleTransition,
  recordAgencyGovernanceAudit,
} from '../services/agencyAuthorityService'
import { completeOnboarding } from '../services/onboarding/onboardingEngine'
import { logUnsafeFallbackBlocked, resolveCurrentWorkspace, WorkspaceContextError } from '../services/workspaceResolutionService'
import { assertMembershipStatusTransition } from '../services/transitions/stateTransitionEngine'
import { assertWorkspaceEntitlementLimit } from '../services/workspaceEntitlementsService'
import { isUnsafeFallbackAllowed } from './envValidation'
import { loadSignupIntentForUser } from './signupIntent'

const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailMentions: true,
  emailDocumentUploads: true,
  emailWorkflowChanges: true,
  inAppNotifications: true,
}

const PROFILE_AVATAR_UPLOAD_CONTENT_TYPE = 'image/jpeg'

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

const ORGANISATION_CONTEXT_CACHE_TTL_MS = 60 * 1000
const ORGANISATION_USERS_CACHE_TTL_MS = 60 * 1000
let organisationContextCache = null
let organisationContextInflight = null
let organisationUsersCache = null
let organisationUsersInflight = null

const ROUTING_RULE_DEFAULT_PRIORITY = 500
const ROUTING_RULE_SOURCE_TYPES = new Set(Object.values(PARTNER_ROUTING_SOURCE_TYPES))
const ROUTING_RULE_TARGET_TYPES = new Set(Object.values(PARTNER_ROUTING_TARGET_TYPES))
const ROUTING_RULE_METHODS = new Set(Object.values(PARTNER_ROUTING_MODES))

function isFreshCacheEntry(entry) {
  return Boolean(entry?.value && Number(entry?.expiresAt || 0) > Date.now())
}

export function clearOrganisationRuntimeCache() {
  organisationContextCache = null
  organisationContextInflight = null
  organisationUsersCache = null
  organisationUsersInflight = null
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
  if (message.includes('permission denied')) {
    return false
  }
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (
      message.includes(String(tableName || '').toLowerCase())
      && (message.includes('does not exist') || message.includes('schema cache'))
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

function getMissingColumnNameFromError(error) {
  if (!error) return ''
  const message = String(error.message || '')
  const quotedMatch = message.match(/'([a-zA-Z0-9_]+)'/)
  if (quotedMatch?.[1]) return quotedMatch[1]
  const details = String(error.details || '')
  const detailsMatch = details.match(/column\s+"?([a-zA-Z0-9_]+)"?/i)
  if (detailsMatch?.[1]) return detailsMatch[1]
  return ''
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

function isCheckConstraintError(error, constraintName = '') {
  if (!error) return false
  const code = String(error.code || '').trim()
  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  const normalizedConstraint = String(constraintName || '').trim().toLowerCase()
  return (
    code === '23514' &&
    (!normalizedConstraint || message.includes(normalizedConstraint) || details.includes(normalizedConstraint))
  )
}

function isUniqueConstraintError(error) {
  if (!error) return false
  const code = String(error.code || '').trim()
  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  return code === '23505' || message.includes('duplicate key') || details.includes('duplicate key')
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

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeFileExtension(fileName = '', fallback = 'png') {
  const normalizedName = normalizeText(fileName)
  const match = normalizedName.match(/\.([a-z0-9]+)$/i)
  const extension = String(match?.[1] || '').trim().toLowerCase()
  if (extension) return extension
  return fallback
}

function normalizeStorageSafeName(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function isMissingStorageBucketError(error) {
  if (!error) return false
  const message = String(error.message || '').toLowerCase()
  const code = String(error.code || '').toLowerCase()
  return (
    message.includes('bucket') &&
    (message.includes('not found') || message.includes('does not exist') || message.includes('unknown')) ||
    code === 'bucket_not_found'
  )
}

function createInviteToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `org-${crypto.randomUUID()}`
  }
  return `org-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`
}

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const randomNibble = Math.floor(Math.random() * 16)
    const value = token === 'x' ? randomNibble : (randomNibble & 0x3) | 0x8
    return value.toString(16)
  })
}

function resolveInviteExpiryIso(days = 7) {
  const now = Date.now()
  const expires = now + days * 24 * 60 * 60 * 1000
  return new Date(expires).toISOString()
}

function assertOrganisationAdminAccess(context, actionLabel = 'perform this action') {
  const action = normalizeText(actionLabel).toLowerCase()
  const requiredPermission = action.includes('member') || action.includes('user')
    ? PERMISSIONS.manageUsers
    : PERMISSIONS.manageWorkspaceSettings
  assertPermission(requiredPermission, {
    profile: context?.profile,
    appRole: context?.profile?.role,
    organisationRole: context?.membershipRole,
    membershipStatus: context?.membershipStatus,
    currentMembership: {
      id: context?.membershipId || context?.organisation?.id || 'current-membership',
      role: normalizeOrganisationMembershipRole(context?.membershipRole),
      status: context?.membershipStatus || 'active',
      workspaceType: context?.organisation?.type || '',
      workspaceId: context?.organisation?.id || '',
      workspace: context?.organisation?.id ? { id: context.organisation.id, type: context?.organisation?.type || '' } : null,
    },
    currentWorkspace: context?.organisation?.id ? { id: context.organisation.id, type: context?.organisation?.type || '' } : null,
    workspaceType: context?.organisation?.type || '',
  }, `You do not have permission to ${actionLabel}.`)
}

function getAuthorityActorFromContext(context = {}) {
  return {
    id: context?.profile?.id || '',
    userId: context?.profile?.id || '',
    email: context?.profile?.email || '',
    role: context?.membershipRole || context?.profile?.role || 'viewer',
    membershipRole: context?.membershipRole || 'viewer',
    branchId: context?.membershipBranchId || context?.branchId || context?.profile?.branchId || '',
  }
}

function getAuthorityTargetFromOrganisationUser(row = {}) {
  return {
    id: row?.id || '',
    organisationUserId: row?.id || '',
    userId: row?.user_id || row?.userId || '',
    email: row?.email || '',
    role: row?.role || row?.workspace_role || row?.organisation_role || 'viewer',
    membershipRole: row?.role || row?.workspace_role || row?.organisation_role || 'viewer',
    branchId: row?.branch_id || row?.primary_branch_id || '',
  }
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

function createLocalPartnerId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizePreferredPartnerRecord(input = {}, fallback = {}) {
  const partnerType = normalizePreferredPartnerType(input.partnerType || fallback.partnerType || 'transfer_attorney')
  const sourceId = String(input.id || fallback.id || '').trim()
  const normalizedId = sourceId || createLocalPartnerId()

  return {
    id: normalizedId,
    partnerType: PREFERRED_PARTNER_TYPE_VALUES.includes(partnerType) ? partnerType : 'transfer_attorney',
    companyName: normalizeText(input.companyName || fallback.companyName),
    contactPerson: normalizeText(input.contactPerson || fallback.contactPerson),
    email: normalizeText(input.email || fallback.email).toLowerCase(),
    phone: normalizeText(input.phone || fallback.phone),
    website: normalizeText(input.website || fallback.website),
    physicalAddress: normalizeText(input.physicalAddress || fallback.physicalAddress),
    province: normalizeText(input.province || fallback.province),
    notes: normalizeText(input.notes || fallback.notes),
    isActive: typeof input.isActive === 'boolean' ? input.isActive : typeof fallback.isActive === 'boolean' ? fallback.isActive : true,
    isPreferredDefault:
      typeof input.isPreferredDefault === 'boolean'
        ? input.isPreferredDefault
        : typeof fallback.isPreferredDefault === 'boolean'
          ? fallback.isPreferredDefault
          : false,
    createdAt: input.createdAt || fallback.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function normalizePreferredPartnerRow(row = {}) {
  return normalizePreferredPartnerRecord({
    id: row.id,
    partnerType: row.partner_type,
    companyName: row.company_name,
    contactPerson: row.contact_person,
    email: row.email_address,
    phone: row.phone_number,
    website: row.website,
    physicalAddress: row.physical_address,
    province: row.province,
    notes: row.notes,
    isActive: row.is_active,
    isPreferredDefault: row.is_preferred_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapPreferredPartnerToRow(partner = {}, organisationId = '') {
  return {
    id: String(partner.id || '').trim() || undefined,
    organisation_id: organisationId || null,
    partner_type: normalizePreferredPartnerType(partner.partnerType),
    company_name: normalizeNullableText(partner.companyName),
    contact_person: normalizeNullableText(partner.contactPerson),
    email_address: normalizeNullableText(partner.email)?.toLowerCase() || null,
    phone_number: normalizeNullableText(partner.phone),
    website: normalizeNullableText(partner.website),
    physical_address: normalizeNullableText(partner.physicalAddress),
    province: normalizeNullableText(partner.province),
    notes: normalizeNullableText(partner.notes),
    is_active: Boolean(partner.isActive),
    is_preferred_default: Boolean(partner.isPreferredDefault),
    updated_at: new Date().toISOString(),
  }
}

function readPreferredPartnersFromSettings(settings = {}) {
  const rows = Array.isArray(settings?.preferredPartners)
    ? settings.preferredPartners
    : Array.isArray(settings?.preferred_partners)
      ? settings.preferred_partners
      : []

  return sortPreferredPartners(rows.map((row) => normalizePreferredPartnerRecord(row)))
}

async function persistPreferredPartnersToSettings(client, context, partners = []) {
  const mergedSettings = {
    ...DEFAULT_ORGANISATION_SETTINGS,
    ...safeJson(context.organisationSettings, DEFAULT_ORGANISATION_SETTINGS),
    preferredPartners: sortPreferredPartners(
      partners.map((item) =>
        normalizePreferredPartnerRecord(item, {
          createdAt: item.createdAt,
        }),
      ),
    ),
  }

  const saveResult = await client
    .from('organisation_settings')
    .upsert(
      {
        organisation_id: context.organisation.id,
        settings_json: mergedSettings,
      },
      { onConflict: 'organisation_id' },
    )

  if (saveResult.error) {
    throw saveResult.error
  }

  return mergedSettings.preferredPartners
}

function normalizePartnerRoutingRuleRecord(input = {}, fallback = {}) {
  const rawSourceScopeType = normalizeText(
    input.sourceScopeType || input.source_scope || input.source_scope_type || input.sourceScope || input.sourceType || '',
  )
  const rawTargetScopeType = normalizeText(
    input.targetScopeType || input.target_scope || input.target_scope_type || input.targetScope || input.targetType || '',
  )
  const assignmentMode = normalizeText(input.assignmentMode || input.assignment_mode || input.assignmentMethod || input.method)

  return {
    id: normalizeText(input.id || fallback.id) || createLocalPartnerRoutingRuleId(),
    ruleName: normalizeText(input.ruleName || input.rule_name || input.name || fallback.ruleName || 'Routing Rule'),
    isActive:
      typeof input.isActive === 'boolean'
        ? input.isActive
        : typeof fallback.isActive === 'boolean'
        ? fallback.isActive
        : true,
    isDefault:
      typeof input.isDefault === 'boolean'
        ? input.isDefault
        : typeof fallback.isDefault === 'boolean'
        ? fallback.isDefault
        : false,
    assignmentPriority:
      Number.isFinite(Number(input.assignmentPriority))
        ? Number(input.assignmentPriority)
        : Number.isFinite(Number(input.assignment_priority))
          ? Number(input.assignment_priority)
          : Number.isFinite(Number(fallback.assignmentPriority))
            ? Number(fallback.assignmentPriority)
            : Number.isFinite(Number(fallback.priority))
              ? Number(fallback.priority)
              : ROUTING_RULE_DEFAULT_PRIORITY,
    sourceScopeType: ROUTING_RULE_SOURCE_TYPES.has(rawSourceScopeType)
      ? rawSourceScopeType
      : PARTNER_ROUTING_SOURCE_TYPES.organisation,
    sourceScopeId: normalizeText(
      input.sourceScopeId || input.source_context_id || input.sourceContextId || input.source_scope_id || input.sourceId || '',
    ),
    sourceUserId: normalizeText(input.sourceUserId || input.source_user_id || input.sourceConsultantUserId || ''),
    sourceScopeName: normalizeText(input.sourceScopeName || input.source_scope_name || ''),
    targetScopeType: ROUTING_RULE_TARGET_TYPES.has(normalizeText(rawTargetScopeType))
      ? normalizeText(rawTargetScopeType)
      : PARTNER_ROUTING_TARGET_TYPES.organisation_queue,
    targetScopeId: normalizeText(
      input.targetScopeId || input.target_context_id || input.targetContextId || input.target_scope_id || input.targetId || '',
    ),
    targetRegionId: normalizeText(input.targetRegionId || input.target_region_id || ''),
    targetWorkspaceUnitId: normalizeText(input.targetWorkspaceUnitId || input.target_workspace_unit_id || ''),
    targetScopeName: normalizeText(input.targetScopeName || input.target_scope_name || ''),
    targetConsultantUserId: normalizeText(
      input.targetConsultantUserId || input.targetUserId || input.target_user_id || input.targetUser || '',
    ),
    assignmentMode: ROUTING_RULE_METHODS.has(assignmentMode) ? assignmentMode : PARTNER_ROUTING_MODES.manual,
    assignmentMethod: ROUTING_RULE_METHODS.has(assignmentMode) ? assignmentMode : PARTNER_ROUTING_MODES.manual,
    notes: normalizeText(input.notes || fallback.notes),
    createdAt: input.createdAt || fallback.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function normalizePartnerRoutingRuleRow(row = {}) {
  const rawSourceScopeType = normalizeText(row.source_scope || row.source_scope_type || row.sourceScopeType || '')
  const rawTargetScopeType = normalizeText(row.target_scope || row.target_scope_type || row.targetScopeType || '')
  return normalizePartnerRoutingRuleRecord({
    id: row.id,
    ruleName: row.rule_name || row.name,
    isActive: row.is_active,
    isDefault: row.is_default,
    assignmentPriority: row.assignment_priority,
    sourceScopeType: rawSourceScopeType || null,
    sourceScopeId:
      rawSourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.agent
        ? row.source_user_id || row.sourceUserId || ''
        : row.source_context_id || row.sourceScopeId || row.source_scope_id || '',
    sourceUserId: row.source_user_id || row.sourceUserId || '',
    sourceScopeName: row.source_scope_name || row.sourceScopeName,
    targetScopeType: rawTargetScopeType || null,
    targetScopeId: (() => {
      if (String(row.target_scope || '').trim() === PARTNER_ROUTING_TARGET_TYPES.region) {
        return row.target_region_id || ''
      }
      if (
        String(row.target_scope || '').trim() === PARTNER_ROUTING_TARGET_TYPES.branch ||
        String(row.target_scope || '').trim() === PARTNER_ROUTING_TARGET_TYPES.team
      ) {
        return row.target_workspace_unit_id || ''
      }
      if (String(row.target_scope || '').trim() === PARTNER_ROUTING_TARGET_TYPES.consultant) {
        return row.target_user_id || ''
      }
      return row.target_scope_id || row.targetScopeId || ''
    })(),
    targetRegionId: row.target_region_id || row.targetRegionId || '',
    targetWorkspaceUnitId: row.target_workspace_unit_id || row.targetWorkspaceUnitId || '',
    targetScopeName: row.target_scope_name || row.targetScopeName,
    targetConsultantUserId:
      row.target_consultant_user_id || row.target_user_id || row.targetUserId || row.target_user || '',
    assignmentMode: row.assignment_mode || row.assignmentMethod || row.method,
    assignmentMethod: row.assignment_mode || row.assignmentMethod || row.method,
    notes: row.notes,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  })
}

function mapPartnerRoutingRuleToRow(rule = {}, organisationId = '') {
  const sourceScopeType = ROUTING_RULE_SOURCE_TYPES.has(normalizeText(rule.sourceScopeType).toLowerCase())
    ? normalizeText(rule.sourceScopeType).toLowerCase()
    : PARTNER_ROUTING_SOURCE_TYPES.organisation

  const targetScopeType = ROUTING_RULE_TARGET_TYPES.has(normalizeText(rule.targetScopeType).toLowerCase())
    ? normalizeText(rule.targetScopeType).toLowerCase()
    : PARTNER_ROUTING_TARGET_TYPES.organisation_queue

  const assignmentMode = normalizeText(rule.assignmentMode || rule.assignment_method || rule.assignmentMethod || '')
  const sourceScopeId = normalizeText(rule.sourceScopeId || rule.sourceContextId || rule.source_context_id || '')
  const sourceUserId = normalizeText(rule.sourceUserId || rule.source_user_id || '')
  const targetScopeId = normalizeText(rule.targetScopeId || rule.target_scope_id || rule.targetScope || '')
  const targetRegionId = normalizeText(rule.targetRegionId || rule.target_region_id || '')
  const targetWorkspaceUnitId = normalizeText(rule.targetWorkspaceUnitId || rule.target_workspace_unit_id || '')
  const targetConsultantUserId = normalizeText(
    rule.targetConsultantUserId || rule.target_user_id || rule.targetScope || rule.targetId || '',
  )

  return {
    id: String(rule.id || '').trim() || undefined,
    source_organisation_id: organisationId || null,
    target_organisation_id: organisationId || null,
    rule_name: normalizeText(rule.ruleName || rule.name) || 'Routing Rule',
    is_active: Boolean(rule.isActive),
    is_default: Boolean(rule.isDefault),
    assignment_priority: Number.isFinite(Number(rule.assignmentPriority))
      ? Number(rule.assignmentPriority)
      : Number.isFinite(Number(rule.priority))
        ? Number(rule.priority)
        : ROUTING_RULE_DEFAULT_PRIORITY,
    source_scope: sourceScopeType,
    source_context_id: sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.agent ? null : sourceScopeId || null,
    source_user_id: sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.agent ? sourceUserId || null : null,
    target_scope: targetScopeType,
    target_region_id: targetScopeType === PARTNER_ROUTING_TARGET_TYPES.region ? targetRegionId || targetScopeId || null : null,
    target_workspace_unit_id:
      targetScopeType === PARTNER_ROUTING_TARGET_TYPES.branch || targetScopeType === PARTNER_ROUTING_TARGET_TYPES.team
        ? targetWorkspaceUnitId || targetScopeId || null
        : null,
    target_user_id: targetScopeType === PARTNER_ROUTING_TARGET_TYPES.consultant ? targetConsultantUserId || targetScopeId || null : null,
    assignment_mode: ROUTING_RULE_METHODS.has(assignmentMode) ? assignmentMode : PARTNER_ROUTING_MODES.manual,
    source_scope_name: normalizeText(rule.sourceScopeName) || null,
    target_scope_name: normalizeText(rule.targetScopeName) || null,
    notes: normalizeText(rule.notes || ''),
    updated_at: new Date().toISOString(),
  }
}

function readPartnerRoutingRulesFromSettings(settings = {}) {
  const rows = Array.isArray(settings?.partnerRoutingRules)
    ? settings.partnerRoutingRules
    : Array.isArray(settings?.partner_routing_rules)
      ? settings.partner_routing_rules
      : []
  return [...rows].map((row) => normalizePartnerRoutingRuleRecord(row)).sort(sortPartnerRoutingRules)
}

function sortPartnerRoutingRules(a = {}, b = {}) {
  const aPriority = Number.isFinite(Number(a.assignmentPriority || a.priority))
    ? Number(a.assignmentPriority || a.priority)
    : ROUTING_RULE_DEFAULT_PRIORITY
  const bPriority = Number.isFinite(Number(b.assignmentPriority || b.priority))
    ? Number(b.assignmentPriority || b.priority)
    : ROUTING_RULE_DEFAULT_PRIORITY
  const activeSort = Number(Boolean(b.isActive)) - Number(Boolean(a.isActive))
  if (activeSort) {
    return activeSort
  }
  if (aPriority !== bPriority) {
    return aPriority - bPriority
  }
  return String(a.ruleName || '').localeCompare(String(b.ruleName || ''))
}

function createLocalPartnerRoutingRuleId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `partner-routing-rule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function persistPartnerRoutingRulesToSettings(client, context, rules = []) {
  const mergedSettings = {
    ...DEFAULT_ORGANISATION_SETTINGS,
    ...safeJson(context.organisationSettings, DEFAULT_ORGANISATION_SETTINGS),
    partnerRoutingRules: [...(rules || [])].map((item) =>
      normalizePartnerRoutingRuleRecord(item, {
        createdAt: item.createdAt,
      }),
    ),
  }

  const saveResult = await client
    .from('organisation_settings')
    .upsert(
      {
        organisation_id: context.organisation.id,
        settings_json: mergedSettings,
      },
      { onConflict: 'organisation_id' },
    )

  if (saveResult.error) {
    throw saveResult.error
  }

  return mergedSettings.partnerRoutingRules
}

function normalizePercentage(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  const clamped = Math.max(0, Math.min(100, numeric))
  return Number(clamped.toFixed(2))
}

function createLocalCommissionStructureId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `commission-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createLocalCommissionProfileId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `commission-profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeCommissionStructureRecord(input = {}, fallback = {}) {
  const id = normalizeText(input.id || fallback.id) || createLocalCommissionStructureId()
  const name = normalizeText(input.name || fallback.name) || 'Standard 60/40'
  const preferredAgentSplit = input.agentSplitPercentage ?? fallback.agentSplitPercentage ?? 60
  const agentSplitPercentage = normalizePercentage(preferredAgentSplit, 60)
  const agencySplitPercentage = normalizePercentage(100 - agentSplitPercentage, 40)

  return {
    id,
    name,
    agentSplitPercentage,
    agencySplitPercentage,
    isDefault:
      typeof input.isDefault === 'boolean'
        ? input.isDefault
        : typeof fallback.isDefault === 'boolean'
          ? fallback.isDefault
          : false,
    isActive:
      typeof input.isActive === 'boolean'
        ? input.isActive
        : typeof fallback.isActive === 'boolean'
          ? fallback.isActive
          : true,
    notes: normalizeText(input.notes || fallback.notes),
    assignedAgentsCount: Number(input.assignedAgentsCount ?? fallback.assignedAgentsCount ?? 0) || 0,
    createdAt: input.createdAt || fallback.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function normalizeCommissionStructureRow(row = {}) {
  return normalizeCommissionStructureRecord({
    id: row.id,
    name: row.name,
    agentSplitPercentage: row.agent_split_percentage,
    isDefault: row.is_default,
    isActive: row.is_active,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapCommissionStructureToRow(structure = {}, organisationId = '', actorUserId = null) {
  const normalized = normalizeCommissionStructureRecord(structure)
  return {
    id: looksLikeUuid(normalized.id) ? normalized.id : undefined,
    organisation_id: organisationId || null,
    name: normalizeNullableText(normalized.name),
    agent_split_percentage: normalizePercentage(normalized.agentSplitPercentage, 60),
    agency_split_percentage: normalizePercentage(normalized.agencySplitPercentage, 40),
    is_default: Boolean(normalized.isDefault),
    is_active: Boolean(normalized.isActive),
    notes: normalizeNullableText(normalized.notes),
    created_by: actorUserId || null,
    updated_at: new Date().toISOString(),
  }
}

function sortCommissionStructures(rows = []) {
  return [...rows].sort((left, right) => {
    if (Boolean(left.isDefault) !== Boolean(right.isDefault)) return left.isDefault ? -1 : 1
    if (Boolean(left.isActive) !== Boolean(right.isActive)) return left.isActive ? -1 : 1
    return String(left.name || '').localeCompare(String(right.name || ''))
  })
}

function readCommissionStructuresFromSettings(settings = {}) {
  const rows = Array.isArray(settings?.commissionStructures)
    ? settings.commissionStructures
    : Array.isArray(settings?.commission_structures)
      ? settings.commission_structures
      : []
  return sortCommissionStructures(rows.map((item) => normalizeCommissionStructureRecord(item)))
}

function normalizeCommissionProfileRecord(input = {}, fallback = {}) {
  return {
    id: normalizeText(input.id || fallback.id) || createLocalCommissionProfileId(),
    organisationUserId: normalizeText(input.organisationUserId || fallback.organisationUserId),
    userId: normalizeText(input.userId || fallback.userId),
    email: normalizeText(input.email || fallback.email).toLowerCase(),
    commissionStructureId: normalizeText(input.commissionStructureId || fallback.commissionStructureId),
    commissionStructureName: normalizeText(input.commissionStructureName || fallback.commissionStructureName),
    overrideAgentSplitPercentage:
      input.overrideAgentSplitPercentage === null || input.overrideAgentSplitPercentage === ''
        ? null
        : Number.isFinite(Number(input.overrideAgentSplitPercentage))
          ? normalizePercentage(input.overrideAgentSplitPercentage, 0)
          : Number.isFinite(Number(fallback.overrideAgentSplitPercentage))
            ? normalizePercentage(fallback.overrideAgentSplitPercentage, 0)
            : null,
    effectiveFrom: normalizeText(input.effectiveFrom || fallback.effectiveFrom) || new Date().toISOString().slice(0, 10),
    isActive:
      typeof input.isActive === 'boolean'
        ? input.isActive
        : typeof fallback.isActive === 'boolean'
          ? fallback.isActive
          : true,
    createdAt: input.createdAt || fallback.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function normalizeCommissionProfileRow(row = {}, structuresById = null) {
  const structureId = normalizeText(row.commission_structure_id)
  const matchedStructure = structuresById instanceof Map ? structuresById.get(structureId) : null
  return normalizeCommissionProfileRecord(
    {
      id: row.id,
      organisationUserId: row.organisation_user_id,
      userId: row.user_id,
      email: row.email_address,
      commissionStructureId: structureId,
      commissionStructureName: matchedStructure?.name || '',
      overrideAgentSplitPercentage: row.override_agent_split_percentage,
      effectiveFrom: row.effective_from,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    {
      commissionStructureName: matchedStructure?.name || '',
    },
  )
}

function readCommissionProfilesFromSettings(settings = {}) {
  const rows = Array.isArray(settings?.commissionProfiles)
    ? settings.commissionProfiles
    : Array.isArray(settings?.commission_profiles)
      ? settings.commission_profiles
      : []
  return rows.map((item) => normalizeCommissionProfileRecord(item))
}

function mapCommissionProfileToRow(profile = {}, organisationId = '', actorUserId = null) {
  const normalized = normalizeCommissionProfileRecord(profile)
  return {
    id: looksLikeUuid(normalized.id) ? normalized.id : undefined,
    organisation_id: organisationId || null,
    organisation_user_id: normalizeNullableText(normalized.organisationUserId),
    user_id: normalizeNullableText(normalized.userId),
    email_address: normalizeNullableText(normalized.email)?.toLowerCase() || null,
    commission_structure_id: normalizeNullableText(normalized.commissionStructureId),
    override_agent_split_percentage:
      normalized.overrideAgentSplitPercentage === null ? null : normalizePercentage(normalized.overrideAgentSplitPercentage, 0),
    effective_from: normalizeNullableText(normalized.effectiveFrom),
    is_active: Boolean(normalized.isActive),
    created_by: actorUserId || null,
    updated_at: new Date().toISOString(),
  }
}

async function persistCommissionSettingsToOrganisationSettings(client, context, { structures = [], profiles = [] } = {}) {
  const mergedSettings = {
    ...DEFAULT_ORGANISATION_SETTINGS,
    ...safeJson(context.organisationSettings, DEFAULT_ORGANISATION_SETTINGS),
    commissionStructures: sortCommissionStructures(structures.map((item) => normalizeCommissionStructureRecord(item))),
    commissionProfiles: profiles.map((item) => normalizeCommissionProfileRecord(item)),
  }

  const saveResult = await client
    .from('organisation_settings')
    .upsert(
      {
        organisation_id: context.organisation.id,
        settings_json: mergedSettings,
      },
      { onConflict: 'organisation_id' },
    )

  if (saveResult.error) {
    throw saveResult.error
  }

  return {
    structures: mergedSettings.commissionStructures,
    profiles: mergedSettings.commissionProfiles,
  }
}

function resolveCommissionCalculation({
  salePrice = 0,
  grossCommissionPercentage = 0,
  agentSplitPercentage = 0,
} = {}) {
  const normalizedSalePrice = Number(salePrice)
  const normalizedGrossPercentage = normalizePercentage(grossCommissionPercentage, 0)
  const normalizedAgentSplit = normalizePercentage(agentSplitPercentage, 0)
  const normalizedAgencySplit = normalizePercentage(100 - normalizedAgentSplit, 0)
  const grossCommissionAmount = Number.isFinite(normalizedSalePrice)
    ? Number(((normalizedSalePrice * normalizedGrossPercentage) / 100).toFixed(2))
    : 0
  const agentCommissionAmount = Number(((grossCommissionAmount * normalizedAgentSplit) / 100).toFixed(2))
  const agencyCommissionAmount = Number(((grossCommissionAmount * normalizedAgencySplit) / 100).toFixed(2))

  return {
    salePrice: Number.isFinite(normalizedSalePrice) ? normalizedSalePrice : 0,
    grossCommissionPercentage: normalizedGrossPercentage,
    grossCommissionAmount,
    agentSplitPercentage: normalizedAgentSplit,
    agencySplitPercentage: normalizedAgencySplit,
    agentCommissionAmount,
    agencyCommissionAmount,
  }
}

function buildDefaultOrganisation(profile = null) {
  const baseName = normalizeText(profile?.companyName) || 'Bridge Workspace'

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
    city: '',
    province: '',
    postalCode: '',
    country: 'South Africa',
    supportEmail: profile?.email || '',
    supportPhone: profile?.phoneNumber || '',
    primaryContactPerson: profile?.fullName || '',
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
  if (normalized === 'super_admin' || normalized === 'superadmin') return 'super_admin'
  if (normalized === 'principal' || normalized === 'owner') return 'principal'
  if (normalized === 'administrator' || normalized === 'admin') return 'admin'
  if (normalized === 'branch_manager') return 'branch_manager'
  if (normalized === 'assistant') return 'assistant'
  if (normalized === 'transaction_coordinator') return 'transaction_coordinator'
  if (normalized === 'listing_coordinator') return 'listing_coordinator'
  if (normalized === 'admin_coordinator') return 'admin_coordinator'
  if (normalized === 'agent') return 'agent'
  return 'viewer'
}

function normalizeOrganisationUserRole(role = '', fallback = 'viewer') {
  const normalized = normalizeOrganisationMembershipRole(role)
  if (
    [
      'super_admin',
      'owner',
      'principal',
      'admin',
      'branch_manager',
      'team_lead',
      'manager',
      'senior_agent',
      'assistant',
      'transaction_coordinator',
      'listing_coordinator',
      'admin_coordinator',
      'developer',
      'agent',
      'attorney',
      'bond_originator',
      'viewer',
    ].includes(normalized)
  ) {
    return normalized
  }
  return normalizeOrganisationMembershipRole(fallback)
}

async function upsertOrganisationUserInvite(client, payload = {}) {
  let invitePayload = {
    ...payload,
    email: normalizeEmail(payload.email),
  }

  const isSelfActivationWrite =
    Boolean(invitePayload?.user_id) &&
    normalizeText(invitePayload?.status).toLowerCase() === 'active' &&
    Boolean(invitePayload?.organisation_id) &&
    Boolean(invitePayload?.email)

  if (isSelfActivationWrite) {
    let selfInsert = await client.from('organisation_users').insert(invitePayload).select('id, organisation_id, role, status, email').single()
    if (
      selfInsert.error &&
      (isMissingColumnError(selfInsert.error, 'invitation_token') || isMissingColumnError(selfInsert.error, 'invitation_expires_at'))
    ) {
      const fallbackPayload = { ...invitePayload }
      delete fallbackPayload.invitation_token
      delete fallbackPayload.invitation_expires_at
      selfInsert = await client.from('organisation_users').insert(fallbackPayload).select('id, organisation_id, role, status, email').single()
      invitePayload = fallbackPayload
    }

    if (!selfInsert.error) {
      return { data: [selfInsert.data], error: null }
    }

    if (!isUniqueConstraintError(selfInsert.error)) {
      // continue with legacy upsert path for non-unique failures
    } else {
      const existingMembership = await client
        .from('organisation_users')
        .select('id, organisation_id, role, status, email, user_id')
        .eq('organisation_id', invitePayload.organisation_id)
        .eq('email', invitePayload.email)
        .maybeSingle()

      if (existingMembership.error) {
        return { data: null, error: existingMembership.error }
      }

      if (existingMembership.data) {
        const row = existingMembership.data
        const rowUserId = normalizeText(row?.user_id)
        const targetUserId = normalizeText(invitePayload.user_id)
        const rowStatus = normalizeText(row?.status).toLowerCase()

        if (rowUserId && rowUserId === targetUserId && rowStatus === 'active') {
          return {
            data: [{
              id: row.id,
              organisation_id: row.organisation_id,
              role: row.role,
              status: row.status,
              email: row.email,
            }],
            error: null,
          }
        }

        if (!rowUserId && rowStatus === 'invited') {
          try {
            const activated = await activatePendingInviteMembership(client, {
              userId: invitePayload.user_id,
              inviteRowId: row.id,
            })
            if (activated?.id) {
              return { data: [activated], error: null }
            }
          } catch (activateError) {
            return { data: null, error: activateError }
          }
        }
      }
    }
  }

  const tryUpsert = async (rowPayload) => client.from('organisation_users').upsert(rowPayload, { onConflict: 'organisation_id,email' })
  const tryUpdateByOrgAndEmail = async (rowPayload) =>
    client
      .from('organisation_users')
      .update(rowPayload)
      .eq('organisation_id', rowPayload.organisation_id)
      .eq('email', rowPayload.email)
      .select('id')
      .limit(1)

  let result = await tryUpsert(invitePayload)

  if (
    result.error &&
    (isMissingColumnError(result.error, 'invitation_token') || isMissingColumnError(result.error, 'invitation_expires_at'))
  ) {
    const fallbackPayload = { ...invitePayload }
    delete fallbackPayload.invitation_token
    delete fallbackPayload.invitation_expires_at
    result = await tryUpsert(fallbackPayload)
    invitePayload = fallbackPayload
  }

  // Gracefully degrade for stale PostgREST schema caches (e.g. missing joined_at).
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!result.error) break
    if (!isMissingColumnError(result.error, '')) break
    const missingColumn = getMissingColumnNameFromError(result.error)
    if (!missingColumn || !(missingColumn in invitePayload)) break
    const retryPayload = { ...invitePayload }
    delete retryPayload[missingColumn]
    result = await tryUpsert(retryPayload)
    invitePayload = retryPayload
  }

  if (result.error && isOnConflictConstraintError(result.error, 'organisation_id')) {
    let updateResult = await tryUpdateByOrgAndEmail(invitePayload)
    if (
      updateResult.error &&
      (isMissingColumnError(updateResult.error, 'invitation_token') || isMissingColumnError(updateResult.error, 'invitation_expires_at'))
    ) {
      const fallbackPayload = { ...invitePayload }
      delete fallbackPayload.invitation_token
      delete fallbackPayload.invitation_expires_at
      updateResult = await tryUpdateByOrgAndEmail(fallbackPayload)
      if (!updateResult.error && Array.isArray(updateResult.data) && updateResult.data.length > 0) {
        return updateResult
      }
      return client.from('organisation_users').insert(fallbackPayload)
    }

    if (!updateResult.error && Array.isArray(updateResult.data) && updateResult.data.length > 0) {
      return updateResult
    }

    return client.from('organisation_users').insert(invitePayload)
  }

  return result
}

async function upsertOrganisationMembershipWithRoleFallback(client, payload = {}, roleFallbacks = []) {
  const normalizedEmail = normalizeEmail(payload.email)
  const fallbackRoles = [payload.role, ...roleFallbacks]
    .map((role) => normalizeOrganisationUserRole(role, 'viewer'))
    .filter((role, index, list) => role && list.indexOf(role) === index)

  let lastError = null
  for (const candidateRole of fallbackRoles) {
    const membershipPayload = {
      ...payload,
      role: candidateRole,
      email: normalizedEmail,
    }
    const result = await upsertOrganisationUserInvite(client, membershipPayload)
    if (!result.error) {
      return { result, resolvedRole: candidateRole }
    }
    lastError = result.error
    if (!isCheckConstraintError(result.error, 'organisation_users_role_check')) {
      return { result, resolvedRole: candidateRole }
    }
  }

  return { result: { error: lastError }, resolvedRole: normalizeOrganisationUserRole(payload.role, 'viewer') }
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

function buildAtomicAgencyOnboardingPayload({ mergedDraft = {}, context = {}, user = null, intent = null } = {}) {
  const info = mergedDraft.agencyInformation || {}
  const principal = mergedDraft.principalInformation || {}
  const agencyType = normalizeAgencyType(info.agencyType)
  const hasCommercialModule = isCommercialAgencyType(agencyType)
  const principalName = normalizeText(principal.principalFullName || context.profile?.fullName)
  const principalParts = principalName.split(/\s+/).filter(Boolean)
  const principalFirstName = principalParts[0] || context.profile?.firstName || ''
  const principalLastName = principalParts.slice(1).join(' ') || context.profile?.lastName || ''
  const agencyName = normalizeText(info.agencyName || context.profile?.companyName) || 'Bridge Agency'
  const settings = {
    ...DEFAULT_ORGANISATION_SETTINGS,
    ...safeJson(context.organisationSettings, DEFAULT_ORGANISATION_SETTINGS),
    agencyOnboarding: mergedDraft,
    agencyType,
    enabledModules: {
      ...(safeJson(context.organisationSettings, DEFAULT_ORGANISATION_SETTINGS).enabledModules || {}),
      residential: agencyType !== 'commercial',
      commercial: hasCommercialModule,
    },
    commercialWorkspace: {
      ...(safeJson(context.organisationSettings, DEFAULT_ORGANISATION_SETTINGS).commercialWorkspace || {}),
      status: hasCommercialModule ? 'active' : 'disabled',
      source: hasCommercialModule ? 'signup' : 'not_selected',
      mode: agencyType === 'commercial' ? 'commercial_only' : agencyType === 'mixed' ? 'mixed_residential_commercial' : 'residential_only',
      signupOnboardingPath: normalizeText(intent?.onboarding_path),
      enabledAt: hasCommercialModule ? new Date().toISOString() : null,
    },
    organisationBranches: mergedDraft.branchStructure?.branches || [],
    organisationPermissions: mergedDraft.permissions || {},
  }
  const branches = (mergedDraft.branchStructure?.branches || [])
    .map((branch) => ({
      name: normalizeText(branch.branchName) || 'Head Office',
      address: normalizeText(branch.officeLocation || info.physicalAddress),
      location: normalizeText(branch.officeLocation || info.province),
      manager_name: normalizeBranchManagerName(branch) || principalName,
      agent_count: normalizeBranchAgentCount(branch),
      province: normalizeText(info.province),
      email: normalizeEmail(info.mainEmailAddress || principal.emailAddress || user?.email),
      phone: normalizeText(info.mainOfficeNumber || principal.phoneNumber),
    }))
    .filter((branch) => branch.name)

  const invites = (mergedDraft.invitations || [])
    .map((invite) => ({
      email: normalizeEmail(invite.email),
      workspace_role: mapAgencyInviteRoleToOrganisationRole(invite.role),
      branch_name: normalizeText(
        (mergedDraft.branchStructure?.branches || []).find((branch) => branch.id === invite.branchId)?.branchName,
      ) || branches[0]?.name || 'Head Office',
      name: normalizeText(invite.name),
    }))
    .filter((invite) => invite.email)

  return {
    signup_intent_id: intent?.id || null,
    idempotency_key: `agency:${intent?.id || user?.id || 'unknown'}:${agencyName.toLowerCase()}`,
    workspace_type: 'agency',
    workspace_kind: 'agency',
    workspace_action: 'create_workspace',
    onboarding_path: intent?.onboarding_path || 'agency_owner',
    organisation: {
      name: agencyName,
      legal_name: normalizeText(info.agencyName) || agencyName,
      trading_name: normalizeText(info.tradingName) || agencyName,
      registration_number: normalizeText(info.companyRegistrationNumber),
      email: normalizeEmail(info.mainEmailAddress || principal.emailAddress || user?.email || context.profile?.email),
      phone: normalizeText(info.mainOfficeNumber || principal.phoneNumber || context.profile?.phoneNumber),
      website: normalizeText(info.website),
      address: normalizeText(info.physicalAddress),
      province: normalizeText(info.province),
      country: normalizeText(info.country) || 'South Africa',
    },
    owner: {
      user_id: user?.id || context.profile?.id || '',
      workspace_role: 'principal',
      first_name: principalFirstName,
      last_name: principalLastName,
      full_name: principalName,
      email: normalizeEmail(principal.emailAddress || user?.email || context.profile?.email),
      phone: normalizeText(principal.phoneNumber || context.profile?.phoneNumber),
    },
    branches,
    settings,
    invites,
  }
}

const COMMERCIAL_ORGANISATION_MODULE_SOURCES = new Set(['signup', 'principal_request', 'platform_admin', 'billing', 'settings_backfill', 'manual'])
const AGENCY_SETTINGS_AGENCY_TYPES = new Set(['residential', 'commercial', 'mixed'])

function normalizeCommercialOrganisationModuleSource(value = '', fallback = 'signup') {
  const normalized = normalizeText(value)
  return COMMERCIAL_ORGANISATION_MODULE_SOURCES.has(normalized) ? normalized : fallback
}

function buildCommercialSignupMembershipMetadata({ agencyType = '', intent = null, mergedDraft = {}, userId = '', source = 'signup' } = {}) {
  const normalizedAgencyType = normalizeAgencyType(agencyType)
  return {
    module: 'commercial',
    module_context: 'commercial',
    source: normalizeText(intent?.commercial_activation_source) || source,
    signup_onboarding_path: normalizeText(intent?.onboarding_path),
    agency_type: normalizedAgencyType,
    commercial_mode: normalizedAgencyType === 'commercial' ? 'commercial_only' : 'mixed_residential_commercial',
    activated_at: new Date().toISOString(),
    activated_by: normalizeText(userId),
    business_name: normalizeText(mergedDraft?.agencyInformation?.agencyName),
  }
}

function buildCommercialOrganisationModuleMetadata({ agencyType = '', intent = null, mergedDraft = {}, userId = '', source = 'signup' } = {}) {
  const normalizedAgencyType = normalizeAgencyType(agencyType)
  return {
    module: 'commercial',
    source: normalizeText(intent?.commercial_activation_source) || source,
    signup_onboarding_path: normalizeText(intent?.onboarding_path),
    agency_type: normalizedAgencyType,
    commercial_mode: normalizedAgencyType === 'commercial' ? 'commercial_only' : 'mixed_residential_commercial',
    enabled_at: new Date().toISOString(),
    enabled_by: normalizeText(userId),
    business_name: normalizeText(mergedDraft?.agencyInformation?.agencyName),
  }
}

function buildAgencyOnboardingSettings({ context = {}, mergedDraft = {} } = {}) {
  const rawAgencyType = normalizeText(mergedDraft?.agencyInformation?.agencyType).toLowerCase()
  const existingSettings = safeJson(context.organisationSettings, DEFAULT_ORGANISATION_SETTINGS)

  if (!AGENCY_SETTINGS_AGENCY_TYPES.has(rawAgencyType)) {
    return {
      ...DEFAULT_ORGANISATION_SETTINGS,
      ...existingSettings,
      agencyOnboarding: mergedDraft,
      organisationBranches: mergedDraft.branchStructure?.branches || [],
      organisationPermissions: mergedDraft.permissions || {},
    }
  }

  const agencyType = normalizeAgencyType(rawAgencyType)
  const hasCommercialModule = isCommercialAgencyType(agencyType)

  return {
    ...DEFAULT_ORGANISATION_SETTINGS,
    ...existingSettings,
    agencyOnboarding: mergedDraft,
    agencyType,
    enabledModules: {
      ...(existingSettings.enabledModules || {}),
      residential: agencyType !== 'commercial',
      commercial: hasCommercialModule,
    },
    commercialWorkspace: {
      ...(existingSettings.commercialWorkspace || {}),
      status: hasCommercialModule ? 'active' : 'disabled',
      source: hasCommercialModule ? 'settings' : 'not_selected',
      mode: agencyType === 'commercial' ? 'commercial_only' : agencyType === 'mixed' ? 'mixed_residential_commercial' : 'residential_only',
      enabledAt: hasCommercialModule ? new Date().toISOString() : existingSettings.commercialWorkspace?.enabledAt || null,
    },
    organisationBranches: mergedDraft.branchStructure?.branches || [],
    organisationPermissions: mergedDraft.permissions || {},
  }
}

async function assertCommercialSignupSchemaInstalled(client) {
  const probes = [
    { table: 'organisation_modules', fields: 'id, organisation_id, module_key, status, source, metadata', label: 'commercial organisation module entitlement' },
    { table: 'organisation_users', fields: 'id, module_context, module_metadata', label: 'organisation commercial activation columns' },
    { table: 'commercial_teams', fields: 'id', label: 'commercial teams' },
    { table: 'commercial_landlords', fields: 'id', label: 'commercial landlords' },
  ]

  for (const probe of probes) {
    const result = await client.from(probe.table).select(probe.fields).limit(1)
    if (!result.error) continue
    if (
      isMissingTableError(result.error, probe.table) ||
      isMissingColumnError(result.error, 'module_context') ||
      isMissingColumnError(result.error, 'module_metadata') ||
      isMissingColumnError(result.error, 'module_key') ||
      isMissingColumnError(result.error, 'status') ||
      isMissingColumnError(result.error, 'source')
    ) {
      throw new Error(`Commercial is not installed on this environment. Missing ${probe.label}. Contact platform support.`)
    }
    throw result.error
  }
}

async function activateCommercialOrganisationModuleForAgencySignup(client, { workspaceId = '', userId = '', agencyType = '', intent = null, mergedDraft = {}, source = 'signup' } = {}) {
  const normalizedAgencyType = normalizeAgencyType(agencyType)
  if (!isCommercialAgencyType(normalizedAgencyType)) return { activated: false, skipped: 'not_commercial_signup' }
  if (!workspaceId || !userId) return { activated: false, skipped: 'missing_workspace_or_user' }

  const nowIso = new Date().toISOString()
  const moduleSource = normalizeCommercialOrganisationModuleSource(source)
  const metadata = buildCommercialOrganisationModuleMetadata({ agencyType: normalizedAgencyType, intent, mergedDraft, userId, source: moduleSource })
  const upsert = await client
    .from('organisation_modules')
    .upsert(
      {
        organisation_id: workspaceId,
        module_key: 'commercial',
        status: 'active',
        source: moduleSource,
        enabled_by: userId,
        enabled_at: nowIso,
        disabled_by: null,
        disabled_at: null,
        metadata,
      },
      { onConflict: 'organisation_id,module_key' },
    )
    .select('id, organisation_id, module_key, status, source, enabled_by, enabled_at, metadata')
    .maybeSingle()

  if (upsert.error) {
    if (
      isMissingTableError(upsert.error, 'organisation_modules') ||
      isMissingColumnError(upsert.error, 'module_key') ||
      isMissingColumnError(upsert.error, 'status')
    ) {
      throw new Error('Commercial entitlement setup is not installed on this environment. Contact platform support.')
    }
    throw upsert.error
  }

  return { activated: upsert.data?.status === 'active', module: upsert.data || null }
}

async function activateCommercialMembershipForAgencySignup(client, { workspaceId = '', userId = '', agencyType = '', intent = null, mergedDraft = {}, source = 'signup' } = {}) {
  const normalizedAgencyType = normalizeAgencyType(agencyType)
  if (!isCommercialAgencyType(normalizedAgencyType)) return { activated: false, skipped: 'not_commercial_signup' }
  if (!workspaceId || !userId) return { activated: false, skipped: 'missing_workspace_or_user' }

  const metadata = buildCommercialSignupMembershipMetadata({ agencyType: normalizedAgencyType, intent, mergedDraft, userId, source })
  let update = await client
    .from('organisation_users')
    .update({
      module_context: 'commercial',
      module_metadata: metadata,
    })
    .eq('organisation_id', workspaceId)
    .eq('user_id', userId)
    .select('id, organisation_id, user_id, module_context, module_metadata')
    .maybeSingle()

  if (update.error && isMissingColumnError(update.error, 'module_metadata')) {
    update = await client
      .from('organisation_users')
      .update({ module_context: 'commercial' })
      .eq('organisation_id', workspaceId)
      .eq('user_id', userId)
      .select('id, organisation_id, user_id, module_context')
      .maybeSingle()
  }

  if (update.error && isMissingColumnError(update.error, 'module_context')) {
    throw new Error('Commercial is not installed on this environment. Contact platform support.')
  }

  if (update.error) throw update.error
  return { activated: Boolean(update.data?.id), membership: update.data || null }
}

function createAtomicOnboardingError(rpcResult = {}, fallbackMessage = 'Agency setup failed.') {
  const message = normalizeText(rpcResult?.message) || fallbackMessage
  const error = new Error(message)
  error.code = normalizeText(rpcResult?.code) || 'atomic_onboarding_failed'
  error.details = rpcResult?.details || {}
  return error
}

function getAppOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return normalizeText(import.meta.env?.VITE_APP_URL) || 'https://app.bridgenine.co.za'
}

function getInviteeFirstName(name = '') {
  return normalizeText(name).split(/\s+/).filter(Boolean)[0] || ''
}

async function dispatchAgencyInviteEmails({ client, workspaceId, mergedDraft, organisationName, inviterName, supportEmail }) {
  const inviteDrafts = (mergedDraft?.invitations || [])
    .map((invite) => ({
      email: normalizeEmail(invite.email),
      name: normalizeText(invite.name),
      workspaceRole: mapAgencyInviteRoleToOrganisationRole(invite.role),
    }))
    .filter((invite) => invite.email)

  if (!inviteDrafts.length || !workspaceId) return { sent: [], warnings: [] }

  const inviteEmails = [...new Set(inviteDrafts.map((invite) => invite.email))]
  const query = await client
    .from('workspace_invites')
    .select('id, token, invited_email, organisation_role, status, expires_at')
    .eq('workspace_id', workspaceId)
    .in('invited_email', inviteEmails)
    .eq('status', 'pending')

  if (query.error) {
    return {
      sent: [],
      warnings: [`Invite records were created, but Bridge could not load invite links for email delivery: ${query.error.message}`],
    }
  }

  const rowsByEmail = new Map((query.data || []).map((row) => [normalizeEmail(row.invited_email), row]))
  const sent = []
  const warnings = []
  const origin = getAppOrigin()

  for (const invite of inviteDrafts) {
    const row = rowsByEmail.get(invite.email)
    if (!row?.token) {
      warnings.push(`Invite email was not sent to ${invite.email}: invite token was not available.`)
      continue
    }

    const inviteLink = `${origin}/invite/${encodeURIComponent(row.token)}`
    const response = await invokeEdgeFunction('send-email', {
      body: {
        type: 'workspace_invite',
        to: invite.email,
        inviteeName: getInviteeFirstName(invite.name),
        inviterName,
        organisationName,
        workspaceRole: row.organisation_role || invite.workspaceRole,
        supportEmail,
        inviteLink,
      },
      client,
    })
    const sendError = response?.error || response?.data?.error
    if (sendError) {
      warnings.push(`Invite email was not sent to ${invite.email}: ${typeof sendError === 'string' ? sendError : sendError?.message || 'email provider rejected the request.'}`)
      continue
    }
    sent.push({ email: invite.email, inviteId: row.id, token: row.token, emailId: response?.data?.emailId || null })
  }

  return { sent, warnings }
}

function normalizeAccountSettings(row, profile) {
  return {
    id: row?.id || profile?.id || null,
    firstName: normalizeText(row?.first_name) || profile?.firstName || '',
    lastName: normalizeText(row?.last_name) || profile?.lastName || '',
    email: normalizeText(row?.email) || profile?.email || '',
    phoneNumber: normalizeText(row?.phone_number) || profile?.phoneNumber || '',
    avatarUrl: normalizeText(row?.avatar_url) || profile?.avatarUrl || '',
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
    .order('created_at', { ascending: true })
    .limit(1)

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
        .order('created_at', { ascending: true })
        .limit(1)

      if (fallbackQuery.error) {
        throw fallbackQuery.error
      }

      return fallbackQuery.data?.[0] || null
    }
    throw membershipQuery.error
  }

  return membershipQuery.data?.[0] || null
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
      membership = await findActiveMembershipByUserId(client, user.id)
    } catch (membershipError) {
      if (
        isMissingTableError(membershipError, 'organisation_users') ||
        isMissingColumnError(membershipError, 'organisation_id') ||
        isPermissionDeniedError(membershipError)
      ) {
        if (!isUnsafeFallbackAllowed()) {
          blockUnsafeSettingsFallback({
            service: 'settingsApi.ensureOrganisationContext',
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

    // Phase 1 auth foundation rule: organisation lookup must not create workspaces.
    // Workspace creation remains an explicit onboarding/setup action.
    const canAutoCreateOrganisation = false

    if (!organisation && canAutoCreateOrganisation) {
      console.debug('[ONBOARDING] org:auto-create:start', { userId: user.id })
      const fallbackName = normalizeText(profile.companyName) || 'Bridge Workspace'
      const organisationId = createUuid()
      const ownerEmail = normalizeEmail(profile.email || user.email)
      if (!ownerEmail) {
        throw new Error('Organisation onboarding requires a valid account email before workspace setup can continue.')
      }
      const nowIso = new Date().toISOString()
      const organisationInsertPayload = {
        id: organisationId,
        name: fallbackName,
        display_name: fallbackName,
        company_email: normalizeNullableText(profile.email || user.email),
        company_phone: normalizeNullableText(profile.phoneNumber),
        country: 'South Africa',
        support_email: normalizeNullableText(profile.email || user.email),
        support_phone: normalizeNullableText(profile.phoneNumber),
        primary_contact_person: normalizeNullableText(profile.fullName),
      }
      const insertedOrganisation = await client
        .from('organisations')
        .insert(organisationInsertPayload)

      if (insertedOrganisation.error) {
        if (isMissingTableError(insertedOrganisation.error, 'organisations')) {
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
        throw insertedOrganisation.error
      }

      const preferredMembershipRole = profile.role === 'developer' ? 'developer' : 'principal'
      const roleFallbacks = profile.role === 'developer'
        ? ['admin', 'agent', 'viewer']
        : ['admin', 'agent', 'viewer']
      const membershipInsert = await upsertOrganisationMembershipWithRoleFallback(
        client,
        {
          organisation_id: organisationId,
          user_id: user.id,
          first_name: normalizeNullableText(profile.firstName),
          last_name: normalizeNullableText(profile.lastName),
          email: ownerEmail,
          role: preferredMembershipRole,
          status: 'active',
          invited_at: nowIso,
          accepted_at: nowIso,
        },
        roleFallbacks,
      )

      if (membershipInsert.result.error && !isMissingTableError(membershipInsert.result.error, 'organisation_users')) {
        throw membershipInsert.result.error
      }

      const orgQuery = await client
        .from('organisations')
        .select(`
          id,
          name,
          display_name,
          type,
          workspace_kind,
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
        .eq('id', organisationId)
        .maybeSingle()

      if (!orgQuery.error) {
        organisation = normalizeOrganisationRow(orgQuery.data || organisationInsertPayload, profile)
      } else if (!isMissingTableError(orgQuery.error, 'organisations')) {
        throw orgQuery.error
      } else {
        organisation = normalizeOrganisationRow(organisationInsertPayload, profile)
      }

      const membershipRole = membershipInsert.resolvedRole || preferredMembershipRole
      membership = { organisation_id: organisationId, role: membershipRole, status: 'active' }
      profile = await syncProfileRoleFromMembership({
        userId: user.id,
        profile,
        membershipRole,
      })
      console.debug('[ONBOARDING] org:auto-create:success', {
        organisationId,
        membershipRole,
      })
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
          service: 'settingsApi.ensureOrganisationContext',
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
            service: 'settingsApi.ensureOrganisationContext',
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
            service: 'settingsApi.ensureOrganisationContext',
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
        if (
          !isMissingTableError(insertSettings.error, 'organisation_settings')
          && !isRlsPolicyError(insertSettings.error)
        ) {
          throw insertSettings.error
        }
      }

      return {
        organisation,
        organisationSettings: safeJson(insertSettings.data?.settings_json, DEFAULT_ORGANISATION_SETTINGS),
        membershipRole: normalizeOrganisationMembershipRole(membership?.role || profile.role),
        membershipStatus: membership?.status || 'active',
        membershipId: membership?.id || null,
        membershipBranchId: membership?.branch_id || membership?.primary_branch_id || null,
        membershipPrimaryBranchId: membership?.primary_branch_id || membership?.branch_id || null,
        membershipBranchScope: membership?.branch_scope || null,
        onboardingMode: resolvedOnboardingMode,
        profile,
        persisted: !insertSettings.error,
      }
    }

    return {
      organisation,
      organisationSettings: safeJson(settingsQuery.data.settings_json, DEFAULT_ORGANISATION_SETTINGS),
      membershipRole: normalizeOrganisationMembershipRole(membership?.role || profile.role),
      membershipStatus: membership?.status || 'active',
      membershipId: membership?.id || null,
      membershipBranchId: membership?.branch_id || membership?.primary_branch_id || null,
      membershipPrimaryBranchId: membership?.primary_branch_id || membership?.branch_id || null,
      membershipBranchScope: membership?.branch_scope || null,
      onboardingMode: resolvedOnboardingMode,
      profile,
      persisted: true,
    }
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
          service: 'settingsApi.ensureOrganisationContext',
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
    if (!isUnsafeFallbackAllowed()) {
      blockUnsafeSettingsFallback({
        service: 'settingsApi.fetchAccountSettings',
        attemptedFallbackType: 'demo_profile_no_supabase',
      })
    }
    return normalizeAccountSettings({}, {
      id: DEMO_PROFILE_ID,
      firstName: 'Demo',
      lastName: 'User',
      email: '',
      phoneNumber: '',
      avatarUrl: '',
      companyName: '',
      role: 'viewer',
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
      avatar_url,
      role,
      title,
      timezone,
      date_format,
      notification_preferences_json
    `)
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'profiles') || isMissingColumnError(error, 'title') || isMissingColumnError(error, 'avatar_url')) {
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
    avatar_url: normalizeNullableText(input.avatarUrl),
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
      avatar_url,
      role,
      title,
      timezone,
      date_format,
      notification_preferences_json
    `)
    .single()

  if (error) {
    if (isMissingColumnError(error, 'title') || isMissingColumnError(error, 'notification_preferences_json') || isMissingColumnError(error, 'avatar_url')) {
      await updateUserProfile({
        userId: user.id,
        firstName: input.firstName,
        lastName: input.lastName,
        companyName: input.companyName,
        phoneNumber: input.phoneNumber,
        avatarUrl: input.avatarUrl,
      })

      clearOrganisationRuntimeCache()

      return normalizeAccountSettings(
        {
          id: user.id,
          email: user.email,
          first_name: input.firstName,
          last_name: input.lastName,
          company_name: input.companyName,
          phone_number: input.phoneNumber,
          avatar_url: input.avatarUrl,
        },
        { id: user.id, email: user.email, role: 'viewer' },
      )
    }

    throw error
  }

  clearOrganisationRuntimeCache()

  return normalizeAccountSettings(data, {
    id: user.id,
    email: user.email,
    role: input.role || 'viewer',
  })
}

export async function uploadAccountAvatar({ file } = {}) {
  const selectedFile = typeof Blob !== 'undefined' && file instanceof Blob ? file : null
  if (!selectedFile) {
    throw new Error('Select a valid profile picture before uploading.')
  }

  const client = requireClient()
  const user = await getAuthenticatedUser()
  const extension = normalizeFileExtension(file?.name, 'jpg')
  const safeExtension = extension === 'jpeg' ? 'jpg' : extension
  const objectPath = `${user.id}/avatar-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${safeExtension}`
  let uploadedBucket = ''
  let uploadError = null

  for (const bucketName of PROFILE_AVATAR_BUCKET_CANDIDATES) {
    const { error } = await client.storage.from(bucketName).upload(objectPath, selectedFile, {
      upsert: true,
      cacheControl: '31536000',
      contentType: selectedFile.type || PROFILE_AVATAR_UPLOAD_CONTENT_TYPE,
    })

    if (!error) {
      uploadedBucket = bucketName
      uploadError = null
      break
    }

    if (isMissingStorageBucketError(error)) {
      uploadError = error
      continue
    }

    throw error
  }

  if (!uploadedBucket) {
    const checked = PROFILE_AVATAR_BUCKET_CANDIDATES.join(', ')
    if (uploadError) {
      throw new Error(`Unable to upload profile picture. Checked storage buckets: ${checked}. Run the profile avatar storage migration for this environment.`)
    }
    throw new Error('Unable to upload profile picture.')
  }

  const { data: publicUrlData } = client.storage.from(uploadedBucket).getPublicUrl(objectPath)
  const publicUrl = normalizeText(publicUrlData?.publicUrl)

  if (!publicUrl) {
    throw new Error('Profile picture uploaded, but Bridge could not resolve its public URL.')
  }

  return {
    bucket: uploadedBucket,
    path: objectPath,
    publicUrl,
    resolvedUrl: publicUrl,
  }
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

export async function fetchOrganisationSettings({ forceRefresh = false } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    if (!isUnsafeFallbackAllowed()) {
      blockUnsafeSettingsFallback({
        service: 'settingsApi.fetchOrganisationSettings',
        attemptedFallbackType: 'default_organisation_no_supabase',
      })
    }
    return {
      organisation: buildDefaultOrganisation(),
      organisationSettings: { ...DEFAULT_ORGANISATION_SETTINGS },
      membershipRole: 'viewer',
      membershipStatus: 'pending',
      onboardingMode: 'principal_setup',
      persisted: false,
    }
  }

  if (forceRefresh) {
    clearOrganisationRuntimeCache()
  }

  return ensureOrganisationContextCached(requireClient())
}

export async function fetchAgencyOnboardingSettings({ forceRefresh = false } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    if (!isUnsafeFallbackAllowed()) {
      blockUnsafeSettingsFallback({
        service: 'settingsApi.fetchAgencyOnboardingSettings',
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
    const context = await ensureOrganisationContextCached(requireClient())
    const mergedOnboarding = mergeAgencyOnboardingDraft(context.organisationSettings?.agencyOnboarding, {}, context.profile)
    const hydratedOnboarding = await hydrateAgencyOnboardingBrandingUrls(requireClient(), mergedOnboarding)
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

async function resolveBrandingAssetUrl(client, { bucket = '', path = '', fallbackUrl = '' } = {}) {
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
  if (!safeBucket || !safePath) {
    return safeFallback
  }

  const signedResult = await client.storage.from(safeBucket).createSignedUrl(safePath, 60 * 60 * 24 * 30)
  const signedUrl = normalizeText(signedResult?.data?.signedUrl)
  if (!signedResult?.error && signedUrl) {
    return signedUrl
  }

  const { data: publicUrlData } = client.storage.from(safeBucket).getPublicUrl(safePath)
  return normalizeText(publicUrlData?.publicUrl) || safeFallback
}

async function hydrateAgencyOnboardingBrandingUrls(client, onboarding = {}) {
  const branding = onboarding?.branding && typeof onboarding.branding === 'object' ? onboarding.branding : {}
  const lightUrl = await resolveBrandingAssetUrl(client, {
    bucket: branding.logoLightBucket,
    path: branding.logoLightPath,
    fallbackUrl: branding.logoLight,
  })
  const iconUrl = await resolveBrandingAssetUrl(client, {
    bucket: branding.logoIconBucket,
    path: branding.logoIconPath,
    fallbackUrl: branding.logoIcon || branding.logoIconUrl,
  })
  const darkUrl = await resolveBrandingAssetUrl(client, {
    bucket: branding.logoDarkBucket,
    path: branding.logoDarkPath,
    fallbackUrl: branding.logoDark,
  })

  return {
    ...onboarding,
    branding: {
      ...branding,
      logoLight: lightUrl || normalizeText(branding.logoLight),
      logoIcon: iconUrl || normalizeText(branding.logoIcon || branding.logoIconUrl),
      logoDark: darkUrl || normalizeText(branding.logoDark),
    },
  }
}

export async function uploadOrganisationBrandingAsset({ file, variant = 'light' } = {}) {
  const selectedFile = typeof File !== 'undefined' && file instanceof File ? file : null
  if (!selectedFile) {
    throw new Error('Select a valid logo file before uploading.')
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  const organisationScope = normalizeText(context.organisation?.id || context.profile?.id || 'draft')
  const safeVariant = normalizeStorageSafeName(variant) || 'logo'
  const extension = normalizeFileExtension(selectedFile.name, 'png')
  const objectPath = `organisations/${organisationScope}/branding/${safeVariant}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`

  let uploadedBucket = ''
  let uploadError = null

  for (const bucketName of BRANDING_BUCKET_CANDIDATES) {
    const { error } = await client.storage.from(bucketName).upload(objectPath, selectedFile, {
      upsert: true,
      cacheControl: '3600',
      contentType: selectedFile.type || undefined,
    })

    if (!error) {
      uploadedBucket = bucketName
      uploadError = null
      break
    }

    if (isMissingStorageBucketError(error)) {
      uploadError = error
      continue
    }

    throw error
  }

  if (!uploadedBucket) {
    const checked = BRANDING_BUCKET_CANDIDATES.join(', ')
    if (uploadError) {
      throw new Error(`Unable to upload organisation logo. Checked storage buckets: ${checked}. Configure a branding bucket for this environment.`)
    }
    throw new Error('Unable to upload organisation logo.')
  }

  const signedResult = await client.storage.from(uploadedBucket).createSignedUrl(objectPath, 60 * 60 * 24 * 30)
  const signedUrl = normalizeText(signedResult?.data?.signedUrl)
  const { data: publicUrlData } = client.storage.from(uploadedBucket).getPublicUrl(objectPath)
  const publicUrl = normalizeText(publicUrlData?.publicUrl)
  const resolvedUrl = signedUrl || publicUrl

  return {
    bucket: uploadedBucket,
    path: objectPath,
    publicUrl,
    signedUrl,
    resolvedUrl,
    fileName: selectedFile.name,
  }
}

export async function saveAgencyOnboardingDraft(input = {}, options = {}) {
  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  const mergedDraft = buildAgencyOnboardingStorageRecord({
    onboarding: mergeAgencyOnboardingDraft(context.organisationSettings?.agencyOnboarding, input, context.profile),
    completed: false,
  })
  console.debug('[ONBOARDING] agency-draft:save', {
    organisationId: context.organisation?.id || null,
    persisted: Boolean(context.organisation?.id),
  })

  if (!context.organisation.id) {
    return {
      onboarding: mergedDraft,
      organisation: context.organisation,
      membershipRole: context.membershipRole,
      persisted: false,
    }
  }

  const mergedSettings = buildAgencyOnboardingSettings({ context, mergedDraft })

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

  const agencyType = normalizeAgencyType(mergedDraft?.agencyInformation?.agencyType)
  if (options?.syncCommercialAccess && isCommercialAgencyType(agencyType)) {
    await assertCommercialSignupSchemaInstalled(client)
    const user = await getAuthenticatedUser()
    const settingsActivationIntent = {
      commercial_activation_source: 'settings_update',
      onboarding_path: 'organisation_settings',
    }
    await activateCommercialOrganisationModuleForAgencySignup(client, {
      workspaceId: context.organisation.id,
      userId: user.id,
      agencyType,
      intent: settingsActivationIntent,
      mergedDraft,
      source: 'manual',
    })
    await activateCommercialMembershipForAgencySignup(client, {
      workspaceId: context.organisation.id,
      userId: user.id,
      agencyType,
      intent: settingsActivationIntent,
      mergedDraft,
      source: 'manual',
    })
  }

  clearOrganisationRuntimeCache()
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
  console.debug('[ONBOARDING] agency-complete:start', {
    organisationId: context.organisation?.id || null,
    profileId: context.profile?.id || null,
  })

  const user = await getAuthenticatedUser()
  const intent = await loadSignupIntentForUser({ user })
  const agencyType = normalizeAgencyType(mergedDraft?.agencyInformation?.agencyType)
  if (isCommercialAgencyType(agencyType)) {
    await assertCommercialSignupSchemaInstalled(client)
  }
  const principalEmail = normalizeEmail(user.email || context.profile?.email || mergedDraft?.principalInformation?.emailAddress)
  if (!principalEmail) {
    throw new Error('Organisation onboarding cannot complete without a valid principal email address.')
  }

  const payload = buildAtomicAgencyOnboardingPayload({ mergedDraft, context, user, intent })
  const rpcResponse = await client.rpc('bridge_complete_workspace_onboarding', { payload })
  if (rpcResponse.error) {
    const rpcErrorMessage = `${rpcResponse.error?.message || ''} ${rpcResponse.error?.details || ''} ${rpcResponse.error?.hint || ''}`.toLowerCase()
    if (isMissingTableError(rpcResponse.error, 'bridge_complete_workspace_onboarding') || rpcErrorMessage.includes('bridge_complete_workspace_onboarding')) {
      throw new Error('Atomic onboarding is not installed. Apply the bridge_complete_workspace_onboarding migration before completing agency setup.')
    }
    throw rpcResponse.error
  }

  const completion = rpcResponse.data || {}
  if (!completion.success) {
    throw createAtomicOnboardingError(completion, 'Agency setup failed before onboarding could be completed.')
  }

  const workspaceResolution = await resolveCurrentWorkspace(user.id, {
    client,
    user,
    requestedWorkspaceId: completion.workspace_id || completion.organisation_id,
  })

  if (!workspaceResolution.ok) {
    throw createAtomicOnboardingError(
      {
        code: workspaceResolution.reason || 'workspace_resolution_failed',
        message: 'Agency setup completed, but the workspace could not be resolved. Use onboarding recovery before loading the dashboard.',
        details: workspaceResolution.diagnostics || {},
      },
      'Workspace resolution failed after agency setup.',
    )
  }

  console.debug('[PROFILE] write:agency-onboarding-complete', {
    userId: user.id,
    role: 'agent',
    completedViaRpc: true,
    workspaceId: workspaceResolution.currentWorkspace?.id || completion.workspace_id || null,
  })

  const workspaceId = workspaceResolution.currentWorkspace?.id || completion.workspace_id || completion.organisation_id
  const commercialModuleActivation = await activateCommercialOrganisationModuleForAgencySignup(client, {
    workspaceId,
    userId: user.id,
    agencyType,
    intent,
    mergedDraft,
  })
  const commercialActivation = await activateCommercialMembershipForAgencySignup(client, {
    workspaceId,
    userId: user.id,
    agencyType,
    intent,
    mergedDraft,
  })

  const inviteEmailDelivery = await dispatchAgencyInviteEmails({
    client,
    workspaceId,
    mergedDraft,
    organisationName: workspaceResolution.currentWorkspace?.name || completion.organisation?.display_name || completion.organisation?.name || mergedDraft?.agencyInformation?.agencyName,
    inviterName: mergedDraft?.principalInformation?.principalFullName || context.profile?.fullName || user.email,
    supportEmail: mergedDraft?.agencyInformation?.mainEmailAddress || context.profile?.email || user.email,
  })

  clearOrganisationRuntimeCache()
  return {
    onboarding: mergedDraft,
    organisation: normalizeOrganisationRow(
      {
        ...(completion.organisation || {}),
        id: workspaceResolution.currentWorkspace?.id || completion.workspace_id || completion.organisation_id,
        name: workspaceResolution.currentWorkspace?.name || completion.organisation?.name,
        display_name: workspaceResolution.currentWorkspace?.displayName || completion.organisation?.display_name,
        type: workspaceResolution.currentWorkspace?.type || completion.workspace_type,
      },
      context.profile,
    ),
    membershipRole: workspaceResolution.currentMembership?.workspaceRole || workspaceResolution.currentMembership?.role || 'principal',
    workspaceResolution,
    completion,
    commercialModuleActivation,
    commercialActivation,
    inviteEmailDelivery,
    persisted: true,
  }
}

export async function updateOrganisationSettings(input = {}) {
  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'update organisation settings')

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
      type,
      workspace_kind,
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

  void recordSecurityAuditEvent({
    userId: context.profile?.id,
    workspaceId: context.organisation.id,
    action: 'workspace_settings_updated',
    targetType: 'organisation',
    targetId: context.organisation.id,
    metadata: { fields: Object.keys(input || {}) },
  })
  clearOrganisationRuntimeCache()
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
  assertOrganisationAdminAccess(context, 'update workflow settings')

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

  void recordSecurityAuditEvent({
    userId: context.profile?.id,
    workspaceId: context.organisation.id,
    action: 'workflow_settings_updated',
    targetType: 'organisation_settings',
    targetId: context.organisation.id,
  })
  clearOrganisationRuntimeCache()
  return {
    membershipRole: context.membershipRole,
    persisted: true,
    ...safeJson(data?.settings_json, DEFAULT_ORGANISATION_SETTINGS),
  }
}

export async function updateBondOrganisationStructureSettings(input = {}) {
  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'update bond organisation structure settings')

  const structureType = normalizeText(input.organisation_structure_type || input.organisationStructureType || input.structureType)
  const existingSettings = safeJson(context.organisationSettings, DEFAULT_ORGANISATION_SETTINGS)
  const existingHierarchy = existingSettings.organisationHierarchy && typeof existingSettings.organisationHierarchy === 'object'
    ? existingSettings.organisationHierarchy
    : {}
  const mergedHierarchy = {
    ...DEFAULT_ORGANISATION_SETTINGS.organisationHierarchy,
    ...existingHierarchy,
    ...(structureType ? {
      organisation_structure_type: structureType,
      organisationStructureType: structureType,
      structureType,
    } : {}),
  }

  if (!context.organisation.id) {
    return {
      membershipRole: context.membershipRole,
      persisted: false,
      organisationHierarchy: mergedHierarchy,
    }
  }

  const merged = {
    ...DEFAULT_ORGANISATION_SETTINGS,
    ...existingSettings,
    organisationHierarchy: mergedHierarchy,
    ...(structureType ? {
      organisation_structure_type: structureType,
      organisationStructureType: structureType,
    } : {}),
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

  void recordSecurityAuditEvent({
    userId: context.profile?.id,
    workspaceId: context.organisation.id,
    action: 'bond_organisation_structure_updated',
    targetType: 'organisation_settings',
    targetId: context.organisation.id,
    metadata: { organisation_structure_type: structureType || null },
  })
  clearOrganisationRuntimeCache()
  return {
    membershipRole: context.membershipRole,
    persisted: true,
    organisationHierarchy: safeJson(data?.settings_json, DEFAULT_ORGANISATION_SETTINGS).organisationHierarchy,
  }
}

export async function fetchEmailTemplateSettings() {
  const context = await fetchOrganisationSettings()
  return {
    membershipRole: context.membershipRole,
    persisted: context.persisted,
    templates: getEmailTemplateSettingsFromOrganisationSettings(context.organisationSettings),
  }
}

export async function updateEmailTemplateSettings(input = {}) {
  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'update email template settings')

  const templates = sanitizeEmailTemplateSettings(input)
  if (!context.organisation.id) {
    return {
      membershipRole: context.membershipRole,
      persisted: false,
      templates,
    }
  }

  const merged = {
    ...DEFAULT_ORGANISATION_SETTINGS,
    ...safeJson(context.organisationSettings, DEFAULT_ORGANISATION_SETTINGS),
    emailTemplates: templates,
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

  void recordSecurityAuditEvent({
    userId: context.profile?.id,
    workspaceId: context.organisation.id,
    action: 'email_template_settings_updated',
    targetType: 'organisation_settings',
    targetId: context.organisation.id,
  })
  clearOrganisationRuntimeCache()
  return {
    membershipRole: context.membershipRole,
    persisted: true,
    templates: getEmailTemplateSettingsFromOrganisationSettings(safeJson(data?.settings_json, DEFAULT_ORGANISATION_SETTINGS)),
  }
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

export async function listOrganisationPreferredPartners() {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  if (!context.organisation.id) {
    return readPreferredPartnersFromSettings(context.organisationSettings)
  }

  const query = await client
    .from('organisation_preferred_partners')
    .select(
      'id, partner_type, company_name, contact_person, email_address, phone_number, website, physical_address, province, notes, is_active, is_preferred_default, created_at, updated_at',
    )
    .eq('organisation_id', context.organisation.id)
    .order('company_name', { ascending: true })

  if (!query.error) {
    return sortPreferredPartners((query.data || []).map(normalizePreferredPartnerRow))
  }

  if (
    !isMissingTableError(query.error, 'organisation_preferred_partners') &&
    !isMissingColumnError(query.error, 'partner_type') &&
    !isMissingColumnError(query.error, 'is_preferred_default')
  ) {
    throw query.error
  }

  return readPreferredPartnersFromSettings(context.organisationSettings)
}

export async function saveOrganisationPreferredPartner(input = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return normalizePreferredPartnerRecord(input)
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'manage preferred partners')
  const normalizedInput = normalizePreferredPartnerRecord(input, { id: String(input?.id || '').trim() || createLocalPartnerId() })

  if (!context.organisation.id) {
    return normalizedInput
  }

  const existing = await listOrganisationPreferredPartners()
  const withUpdated = (() => {
    const hasExisting = existing.some((item) => String(item.id) === String(normalizedInput.id))
    const rows = hasExisting
      ? existing.map((item) => (String(item.id) === String(normalizedInput.id) ? normalizePreferredPartnerRecord(normalizedInput, item) : item))
      : [...existing, normalizedInput]

    return rows.map((item) => {
      if (normalizePreferredPartnerType(item.partnerType) !== normalizePreferredPartnerType(normalizedInput.partnerType)) {
        return item
      }
      if (!normalizedInput.isPreferredDefault) {
        return item
      }
      return String(item.id) === String(normalizedInput.id) ? { ...item, isPreferredDefault: true } : { ...item, isPreferredDefault: false }
    })
  })()

  const rowPayload = mapPreferredPartnerToRow(normalizedInput, context.organisation.id)
  if (!looksLikeUuid(rowPayload.id)) {
    delete rowPayload.id
  }

  if (normalizedInput.isPreferredDefault) {
    const clearDefaultResult = await client
      .from('organisation_preferred_partners')
      .update({ is_preferred_default: false, updated_at: new Date().toISOString() })
      .eq('organisation_id', context.organisation.id)
      .eq('partner_type', normalizePreferredPartnerType(normalizedInput.partnerType))

    if (
      clearDefaultResult.error &&
      !isMissingTableError(clearDefaultResult.error, 'organisation_preferred_partners') &&
      !isMissingColumnError(clearDefaultResult.error, 'is_preferred_default')
    ) {
      throw clearDefaultResult.error
    }
  }

  const saveResult = await client
    .from('organisation_preferred_partners')
    .upsert(rowPayload, { onConflict: 'id' })
    .select(
      'id, partner_type, company_name, contact_person, email_address, phone_number, website, physical_address, province, notes, is_active, is_preferred_default, created_at, updated_at',
    )
    .single()

  if (!saveResult.error) {
    return normalizePreferredPartnerRow(saveResult.data)
  }

  if (
    !isMissingTableError(saveResult.error, 'organisation_preferred_partners') &&
    !isMissingColumnError(saveResult.error, 'partner_type') &&
    !isMissingColumnError(saveResult.error, 'is_preferred_default') &&
    !isOnConflictConstraintError(saveResult.error, 'id')
  ) {
    throw saveResult.error
  }

  const fallback = await persistPreferredPartnersToSettings(client, context, withUpdated)
  return fallback.find((item) => String(item.id) === String(normalizedInput.id)) || normalizePreferredPartnerRecord(normalizedInput)
}

export async function removeOrganisationPreferredPartner(partnerId) {
  const normalizedId = String(partnerId || '').trim()
  if (!normalizedId) {
    throw new Error('Preferred partner id is required.')
  }

  if (!isSupabaseConfigured || !supabase) {
    return true
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'manage preferred partners')
  if (!context.organisation.id) {
    return true
  }

  const removeResult = await client.from('organisation_preferred_partners').delete().eq('id', normalizedId)
  if (!removeResult.error) {
    return true
  }

  if (
    !isMissingTableError(removeResult.error, 'organisation_preferred_partners') &&
    !isMissingColumnError(removeResult.error, 'partner_type')
  ) {
    throw removeResult.error
  }

  const existing = readPreferredPartnersFromSettings(context.organisationSettings)
  const next = existing.filter((item) => String(item.id) !== normalizedId)
  await persistPreferredPartnersToSettings(client, context, next)
  return true
}

export async function listOrganisationPartnerRoutingRules() {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  if (!context.organisation.id) {
    return readPartnerRoutingRulesFromSettings(context.organisationSettings)
  }

  const query = await client
    .from('partner_routing_rules')
    .select(
      'id, is_active, is_default, assignment_priority, source_scope, source_context_id, source_user_id, source_scope_name, target_scope, target_region_id, target_workspace_unit_id, target_user_id, assignment_mode, rule_name, notes, created_at, updated_at',
    )
    .eq('source_organisation_id', context.organisation.id)
    .order('is_default', { ascending: false })
    .order('assignment_priority', { ascending: true })
    .order('rule_name', { ascending: true })

  if (!query.error) {
    return sortPartnerRoutingRules((query.data || []).map(normalizePartnerRoutingRuleRow))
  }

  if (
    !isMissingTableError(query.error, 'partner_routing_rules') &&
    !isMissingColumnError(query.error, 'is_active') &&
    !isMissingColumnError(query.error, 'source_scope') &&
    !isMissingColumnError(query.error, 'target_scope') &&
    !isMissingColumnError(query.error, 'assignment_mode') &&
    !isMissingColumnError(query.error, 'is_default')
  ) {
    throw query.error
  }

  return readPartnerRoutingRulesFromSettings(context.organisationSettings)
}

export async function saveOrganisationPartnerRoutingRule(input = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return normalizePartnerRoutingRuleRecord(input)
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'manage partner routing rules')
  const normalizedInput = normalizePartnerRoutingRuleRecord(input, {
    id: String(input?.id || '').trim() || createLocalPartnerRoutingRuleId(),
  })

  if (!context.organisation.id) {
    return normalizedInput
  }

  const existing = await listOrganisationPartnerRoutingRules()
  const withUpdated = (() => {
    const hasExisting = existing.some((item) => String(item.id) === String(normalizedInput.id))
    const rows = hasExisting
      ? existing.map((item) => (String(item.id) === String(normalizedInput.id) ? normalizePartnerRoutingRuleRecord(normalizedInput, item) : item))
      : [...existing, normalizedInput]

    return rows.map((item) => {
      if (!normalizedInput.isDefault) {
        return item
      }
      return String(item.id) === String(normalizedInput.id)
        ? { ...item, isDefault: true }
        : { ...item, isDefault: false }
    })
  })()

  const rowPayload = mapPartnerRoutingRuleToRow(normalizedInput, context.organisation.id)
  if (!looksLikeUuid(rowPayload.id)) {
    delete rowPayload.id
  }

  const saveResult = await client
    .from('partner_routing_rules')
    .upsert(rowPayload, { onConflict: 'id' })
    .select(
      'id, is_active, is_default, assignment_priority, source_scope, source_context_id, source_user_id, source_scope_name, target_scope, target_region_id, target_workspace_unit_id, target_user_id, assignment_mode, rule_name, notes, created_at, updated_at',
    )
    .single()

  if (!saveResult.error) {
    return normalizePartnerRoutingRuleRecord(saveResult.data)
  }

  if (
    !isMissingTableError(saveResult.error, 'partner_routing_rules') &&
    !isMissingColumnError(saveResult.error, 'is_active') &&
    !isMissingColumnError(saveResult.error, 'is_default') &&
    !isMissingColumnError(saveResult.error, 'source_scope') &&
    !isMissingColumnError(saveResult.error, 'target_scope') &&
    !isMissingColumnError(saveResult.error, 'assignment_mode') &&
    !isMissingColumnError(saveResult.error, 'target_user_id') &&
    !isMissingColumnError(saveResult.error, 'rule_name') &&
    !isOnConflictConstraintError(saveResult.error, 'id')
  ) {
    throw saveResult.error
  }

  const fallback = await persistPartnerRoutingRulesToSettings(client, context, withUpdated)
  return fallback.find((item) => String(item.id) === String(normalizedInput.id)) || normalizedInput
}

export async function removeOrganisationPartnerRoutingRule(ruleId) {
  const normalizedId = String(ruleId || '').trim()
  if (!normalizedId) {
    throw new Error('Partner routing rule id is required.')
  }

  if (!isSupabaseConfigured || !supabase) {
    return true
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'manage partner routing rules')
  if (!context.organisation.id) {
    return true
  }

  const removeResult = await client.from('partner_routing_rules').delete().eq('id', normalizedId)
  if (!removeResult.error) {
    return true
  }

  if (
    !isMissingTableError(removeResult.error, 'partner_routing_rules') &&
    !isMissingColumnError(removeResult.error, 'is_active') &&
    !isMissingColumnError(removeResult.error, 'is_default') &&
    !isMissingColumnError(removeResult.error, 'source_scope') &&
    !isMissingColumnError(removeResult.error, 'target_scope')
  ) {
    throw removeResult.error
  }

  const existing = readPartnerRoutingRulesFromSettings(context.organisationSettings)
  const next = existing.filter((item) => String(item.id) !== normalizedId)
  await persistPartnerRoutingRulesToSettings(client, context, next)
  return true
}

export async function listOrganisationCommissionStructures() {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  if (!context.organisation.id) {
    return readCommissionStructuresFromSettings(context.organisationSettings)
  }

  const baseQuery = await client
    .from('organisation_commission_structures')
    .select('id, name, agent_split_percentage, agency_split_percentage, is_default, is_active, notes, created_at, updated_at')
    .eq('organisation_id', context.organisation.id)
    .order('name', { ascending: true })

  let structures = []
  if (!baseQuery.error) {
    structures = (baseQuery.data || []).map((row) => normalizeCommissionStructureRow(row))
  } else if (
    !isMissingTableError(baseQuery.error, 'organisation_commission_structures') &&
    !isMissingColumnError(baseQuery.error, 'agent_split_percentage')
  ) {
    throw baseQuery.error
  } else {
    structures = readCommissionStructuresFromSettings(context.organisationSettings)
  }

  const countByStructureId = new Map()
  const countsQuery = await client
    .from('organisation_user_commission_profiles')
    .select('commission_structure_id')
    .eq('organisation_id', context.organisation.id)
    .eq('is_active', true)

  if (!countsQuery.error) {
    for (const row of countsQuery.data || []) {
      const key = normalizeText(row?.commission_structure_id)
      if (!key) continue
      countByStructureId.set(key, (countByStructureId.get(key) || 0) + 1)
    }
  } else if (
    !isMissingTableError(countsQuery.error, 'organisation_user_commission_profiles') &&
    !isMissingColumnError(countsQuery.error, 'commission_structure_id')
  ) {
    throw countsQuery.error
  }

  return sortCommissionStructures(
    structures.map((structure) => ({
      ...structure,
      assignedAgentsCount: countByStructureId.get(normalizeText(structure.id)) || 0,
    })),
  )
}

export async function saveOrganisationCommissionStructure(input = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return normalizeCommissionStructureRecord(input)
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'manage commission structures')
  if (!context.organisation.id) {
    return normalizeCommissionStructureRecord(input)
  }

  const user = await getAuthenticatedUser()
  const normalizedInput = normalizeCommissionStructureRecord(input, {
    id: normalizeText(input?.id) || createLocalCommissionStructureId(),
  })

  const existing = await listOrganisationCommissionStructures()
  const nextRows = existing.some((item) => normalizeText(item.id) === normalizeText(normalizedInput.id))
    ? existing.map((item) => (normalizeText(item.id) === normalizeText(normalizedInput.id) ? normalizedInput : item))
    : [...existing, normalizedInput]
  const withDefault = nextRows.map((item) => {
    if (!normalizedInput.isDefault) return item
    return normalizeText(item.id) === normalizeText(normalizedInput.id)
      ? { ...item, isDefault: true }
      : { ...item, isDefault: false }
  })

  if (normalizedInput.isDefault) {
    const clearDefault = await client
      .from('organisation_commission_structures')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('organisation_id', context.organisation.id)

    if (
      clearDefault.error &&
      !isMissingTableError(clearDefault.error, 'organisation_commission_structures') &&
      !isMissingColumnError(clearDefault.error, 'is_default')
    ) {
      throw clearDefault.error
    }
  }

  const payload = mapCommissionStructureToRow(normalizedInput, context.organisation.id, user.id)
  if (!looksLikeUuid(payload.id)) {
    delete payload.id
  }
  const saveResult = await client
    .from('organisation_commission_structures')
    .upsert(payload, { onConflict: 'id' })
    .select('id, name, agent_split_percentage, agency_split_percentage, is_default, is_active, notes, created_at, updated_at')
    .single()

  if (!saveResult.error) {
    return normalizeCommissionStructureRow(saveResult.data)
  }

  if (
    !isMissingTableError(saveResult.error, 'organisation_commission_structures') &&
    !isMissingColumnError(saveResult.error, 'agent_split_percentage') &&
    !isOnConflictConstraintError(saveResult.error, 'id')
  ) {
    throw saveResult.error
  }

  const fallback = await persistCommissionSettingsToOrganisationSettings(client, context, {
    structures: withDefault,
    profiles: readCommissionProfilesFromSettings(context.organisationSettings),
  })
  return (
    fallback.structures.find((item) => normalizeText(item.id) === normalizeText(normalizedInput.id)) ||
    normalizeCommissionStructureRecord(normalizedInput)
  )
}

export async function removeOrganisationCommissionStructure(structureId) {
  const normalizedId = normalizeText(structureId)
  if (!normalizedId) {
    throw new Error('Commission structure id is required.')
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'manage commission structures')
  if (!context.organisation.id) {
    return true
  }

  const removeResult = await client
    .from('organisation_commission_structures')
    .delete()
    .eq('organisation_id', context.organisation.id)
    .eq('id', normalizedId)

  if (!removeResult.error) {
    return true
  }

  if (
    !isMissingTableError(removeResult.error, 'organisation_commission_structures') &&
    !isMissingColumnError(removeResult.error, 'agent_split_percentage')
  ) {
    throw removeResult.error
  }

  const existingStructures = readCommissionStructuresFromSettings(context.organisationSettings)
  const nextStructures = existingStructures.filter((item) => normalizeText(item.id) !== normalizedId)
  const existingProfiles = readCommissionProfilesFromSettings(context.organisationSettings).map((profile) =>
    normalizeText(profile.commissionStructureId) === normalizedId
      ? { ...profile, commissionStructureId: '' }
      : profile,
  )
  await persistCommissionSettingsToOrganisationSettings(client, context, {
    structures: nextStructures,
    profiles: existingProfiles,
  })
  return true
}

export async function listOrganisationUserCommissionProfiles() {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  if (!context.organisation.id) {
    return readCommissionProfilesFromSettings(context.organisationSettings)
  }

  const structures = await listOrganisationCommissionStructures()
  const structureMap = new Map(structures.map((item) => [normalizeText(item.id), item]))
  const profilesQuery = await client
    .from('organisation_user_commission_profiles')
    .select('id, organisation_user_id, user_id, email_address, commission_structure_id, override_agent_split_percentage, effective_from, is_active, created_at, updated_at')
    .eq('organisation_id', context.organisation.id)
    .eq('is_active', true)

  if (!profilesQuery.error) {
    return (profilesQuery.data || []).map((row) => normalizeCommissionProfileRow(row, structureMap))
  }

  if (
    !isMissingTableError(profilesQuery.error, 'organisation_user_commission_profiles') &&
    !isMissingColumnError(profilesQuery.error, 'commission_structure_id')
  ) {
    throw profilesQuery.error
  }

  return readCommissionProfilesFromSettings(context.organisationSettings)
}

export async function assignOrganisationUserCommissionProfile({
  organisationUserId = '',
  userId = '',
  email = '',
  commissionStructureId = '',
  overrideAgentSplitPercentage = null,
  effectiveFrom = '',
  isActive = true,
} = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'manage commission profiles')
  if (!context.organisation.id) {
    return null
  }

  const normalizedOrganisationUserId = normalizeText(organisationUserId)
  const normalizedUserId = normalizeText(userId)
  const normalizedEmail = normalizeText(email).toLowerCase()
  if (!normalizedOrganisationUserId && !normalizedUserId && !normalizedEmail) {
    throw new Error('A target user is required to assign a commission structure.')
  }

  const structureId = normalizeText(commissionStructureId)
  const user = await getAuthenticatedUser()
  const profilePayload = mapCommissionProfileToRow(
    {
      organisationUserId: normalizedOrganisationUserId,
      userId: normalizedUserId,
      email: normalizedEmail,
      commissionStructureId: structureId,
      overrideAgentSplitPercentage,
      effectiveFrom,
      isActive,
    },
    context.organisation.id,
    user.id,
  )

  const upsertPayload = {
    ...profilePayload,
    id: undefined,
  }

  let clearResult = null
  let useSettingsFallback = false
  const clearPayload = { is_active: false, updated_at: new Date().toISOString() }
  if (normalizedOrganisationUserId) {
    clearResult = await client
      .from('organisation_user_commission_profiles')
      .update(clearPayload)
      .eq('organisation_id', context.organisation.id)
      .eq('organisation_user_id', normalizedOrganisationUserId)
  } else if (normalizedUserId) {
    clearResult = await client
      .from('organisation_user_commission_profiles')
      .update(clearPayload)
      .eq('organisation_id', context.organisation.id)
      .eq('user_id', normalizedUserId)
  } else {
    clearResult = await client
      .from('organisation_user_commission_profiles')
      .update(clearPayload)
      .eq('organisation_id', context.organisation.id)
      .eq('email_address', normalizedEmail)
  }

  if (
    clearResult?.error &&
    !isMissingTableError(clearResult.error, 'organisation_user_commission_profiles') &&
    !isMissingColumnError(clearResult.error, 'commission_structure_id')
  ) {
    throw clearResult.error
  }
  useSettingsFallback = Boolean(
    clearResult?.error &&
      (isMissingTableError(clearResult.error, 'organisation_user_commission_profiles') ||
        isMissingColumnError(clearResult.error, 'commission_structure_id')),
  )

  if (!structureId) {
    if (useSettingsFallback) {
      const existingStructures = readCommissionStructuresFromSettings(context.organisationSettings)
      const existingProfiles = readCommissionProfilesFromSettings(context.organisationSettings)
      const nextProfiles = existingProfiles.filter((item) => {
        if (normalizedOrganisationUserId) return normalizeText(item.organisationUserId) !== normalizedOrganisationUserId
        if (normalizedUserId) return normalizeText(item.userId) !== normalizedUserId
        return normalizeText(item.email).toLowerCase() !== normalizedEmail
      })
      await persistCommissionSettingsToOrganisationSettings(client, context, {
        structures: existingStructures,
        profiles: nextProfiles,
      })
    }
    return null
  }

  const createResult = await client
    .from('organisation_user_commission_profiles')
    .insert(upsertPayload)
    .select('id, organisation_user_id, user_id, email_address, commission_structure_id, override_agent_split_percentage, effective_from, is_active, created_at, updated_at')
    .single()

  if (!createResult.error) {
    return normalizeCommissionProfileRow(createResult.data)
  }

  if (
    !isMissingTableError(createResult.error, 'organisation_user_commission_profiles') &&
    !isMissingColumnError(createResult.error, 'commission_structure_id')
  ) {
    throw createResult.error
  }

  const existingStructures = readCommissionStructuresFromSettings(context.organisationSettings)
  const existingProfiles = readCommissionProfilesFromSettings(context.organisationSettings)
  const normalizedProfile = normalizeCommissionProfileRecord({
    organisationUserId: normalizedOrganisationUserId,
    userId: normalizedUserId,
    email: normalizedEmail,
    commissionStructureId: structureId,
    overrideAgentSplitPercentage,
    effectiveFrom,
    isActive,
  })
  const nextProfiles = [
    ...existingProfiles.filter((item) => {
      if (normalizedOrganisationUserId) return normalizeText(item.organisationUserId) !== normalizedOrganisationUserId
      if (normalizedUserId) return normalizeText(item.userId) !== normalizedUserId
      return normalizeText(item.email) !== normalizedEmail
    }),
    normalizedProfile,
  ]
  await persistCommissionSettingsToOrganisationSettings(client, context, {
    structures: existingStructures,
    profiles: nextProfiles,
  })

  return normalizedProfile
}

export async function resolveCommissionSnapshotForAgent({
  assignedAgentUserId = '',
  assignedAgentEmail = '',
  salePrice = 0,
  grossCommissionPercentage = 0,
} = {}) {
  if (!isSupabaseConfigured || !supabase) {
    const fallback = resolveCommissionCalculation({
      salePrice,
      grossCommissionPercentage,
      agentSplitPercentage: 70,
    })
    return {
      ...fallback,
      organisationId: null,
      commissionStructureId: null,
      commissionStructureName: '',
      overrideAgentSplitPercentage: null,
      isFallback: true,
    }
  }

  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  if (!context.organisation.id) {
    const fallback = resolveCommissionCalculation({
      salePrice,
      grossCommissionPercentage,
      agentSplitPercentage: 70,
    })
    return {
      ...fallback,
      organisationId: null,
      commissionStructureId: null,
      commissionStructureName: '',
      isFallback: true,
    }
  }

  const structures = await listOrganisationCommissionStructures()
  const structureMap = new Map(structures.map((item) => [normalizeText(item.id), item]))
  const activeProfiles = await listOrganisationUserCommissionProfiles()

  const normalizedUserId = normalizeText(assignedAgentUserId)
  const normalizedEmail = normalizeText(assignedAgentEmail).toLowerCase()
  const targetProfile =
    activeProfiles.find((profile) => normalizedUserId && normalizeText(profile.userId) === normalizedUserId) ||
    activeProfiles.find((profile) => normalizedEmail && normalizeText(profile.email).toLowerCase() === normalizedEmail) ||
    null

  let structure = null
  if (targetProfile?.commissionStructureId) {
    structure = structureMap.get(normalizeText(targetProfile.commissionStructureId)) || null
  }

  if (!structure) {
    structure = structures.find((item) => item.isDefault && item.isActive) || null
  }

  if (!structure) {
    structure = structures.find((item) => item.isActive) || null
  }

  const fallbackAgentSplit = Number.isFinite(Number(targetProfile?.overrideAgentSplitPercentage))
    ? normalizePercentage(targetProfile.overrideAgentSplitPercentage, 70)
    : structure
      ? normalizePercentage(structure.agentSplitPercentage, 70)
      : 70

  const calculation = resolveCommissionCalculation({
    salePrice,
    grossCommissionPercentage,
    agentSplitPercentage: fallbackAgentSplit,
  })

  return {
    ...calculation,
    organisationId: context.organisation.id,
    commissionStructureId: normalizeText(structure?.id),
    commissionStructureName: normalizeText(structure?.name),
    overrideAgentSplitPercentage: targetProfile?.overrideAgentSplitPercentage ?? null,
    isFallback: !structure,
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

async function listScopedDevelopments(client) {
  const context = await ensureOrganisationContext(client)
  const organisationId = normalizeText(context?.organisation?.id)

  if (!organisationId) {
    return []
  }

  let baseQuery = await client
    .from('developments')
    .select('id, name, planned_units, code, organisation_id')
    .eq('organisation_id', organisationId)
    .order('name')

  if (baseQuery.error && isMissingColumnError(baseQuery.error, 'code')) {
    baseQuery = await client
      .from('developments')
      .select('id, name, planned_units, organisation_id')
      .eq('organisation_id', organisationId)
      .order('name')
  }

  if (baseQuery.error && isMissingColumnError(baseQuery.error, 'organisation_id')) {
    console.warn('[SETTINGS] developments:missing-organisation-id-column')
    return []
  }

  if (baseQuery.error) {
    throw baseQuery.error
  }

  return baseQuery.data || []
}

export async function listDevelopmentSettings() {
  const client = requireClient()
  const developments = await listScopedDevelopments(client)

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
  const developments = await listScopedDevelopments(client)

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
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'update development settings')

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
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'archive development settings')
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
    organisationId: row?.organisation_id || null,
    branchId: row?.branch_id || null,
    firstName: normalizeText(row?.first_name),
    lastName: normalizeText(row?.last_name),
    fullName: [normalizeText(row?.first_name), normalizeText(row?.last_name)].filter(Boolean).join(' ') || normalizeText(row?.email),
    email: normalizeText(row?.email),
    avatarUrl: normalizeText(row?.avatarUrl || row?.avatar_url || row?.profile?.avatar_url),
    role: normalizeText(row?.role) || 'viewer',
    status: normalizeText(row?.status) || 'invited',
    lastActiveAt: row?.last_active_at || null,
    invitedAt: row?.invited_at || null,
    acceptedAt: row?.accepted_at || null,
  }
}

async function fetchOrganisationUserProfileAvatars(client, rows = []) {
  const userIds = [...new Set(rows.map((row) => normalizeText(row?.user_id || row?.userId)).filter(Boolean))]
  const emails = [...new Set(rows.map((row) => normalizeEmail(row?.email)).filter(Boolean))]
  if (!userIds.length && !emails.length) return { byUserId: {}, byEmail: {} }

  async function fetchProfilesBy(column, values) {
    if (!values.length) return []

    const { data, error } = await client
      .from('profiles')
      .select('id, email, avatar_url')
      .in(column, values)

    if (error) {
      if (isMissingTableError(error, 'profiles') || isMissingColumnError(error, 'avatar_url') || isPermissionDeniedError(error)) {
        return []
      }
      throw error
    }

    return Array.isArray(data) ? data : []
  }

  const [profilesById, profilesByEmail] = await Promise.all([
    fetchProfilesBy('id', userIds),
    fetchProfilesBy('email', emails),
  ])

  return [...profilesById, ...profilesByEmail].reduce((accumulator, row) => {
    const avatarUrl = normalizeText(row?.avatar_url)
    if (!avatarUrl) return accumulator
    const id = normalizeText(row?.id)
    const email = normalizeEmail(row?.email)
    if (id) accumulator.byUserId[id] = avatarUrl
    if (email) accumulator.byEmail[email] = avatarUrl
    return accumulator
  }, { byUserId: {}, byEmail: {} })
}

export async function listOrganisationUsers() {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }

  const client = requireClient()
  if (isFreshCacheEntry(organisationUsersCache)) {
    return organisationUsersCache.value
  }
  if (organisationUsersInflight) {
    return organisationUsersInflight
  }

  organisationUsersInflight = (async () => {
    const context = await ensureOrganisationContextCached(client)

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
      .select('id, organisation_id, user_id, branch_id, first_name, last_name, email, role, status, invited_at, accepted_at, last_active_at')
      .eq('organisation_id', context.organisation.id)
      .order('created_at', { ascending: true })

    if (error) {
      if (isMissingTableError(error, 'organisation_users')) {
        return []
      }
      throw error
    }

    const avatarLookup = await fetchOrganisationUserProfileAvatars(client, data || [])
    return (data || []).map((row) => normalizeOrganisationUserRow({
      ...row,
      avatar_url:
        normalizeText(row?.avatar_url) ||
        avatarLookup.byUserId[normalizeText(row?.user_id)] ||
        avatarLookup.byEmail[normalizeEmail(row?.email)] ||
        '',
    }))
  })()
    .then((users) => {
      organisationUsersCache = {
        value: users,
        expiresAt: Date.now() + ORGANISATION_USERS_CACHE_TTL_MS,
      }
      return users
    })
    .finally(() => {
      organisationUsersInflight = null
    })

  return organisationUsersInflight
}

export async function inviteOrganisationUser(input = {}) {
  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'manage organisation members')

  if (!context.organisation.id) {
    throw new Error('Organisation membership requires the settings schema to be installed.')
  }

  const user = await getAuthenticatedUser()
  const email = normalizeEmail(input.email)
  const existingInvite = await client
    .from('organisation_users')
    .select('id, status')
    .eq('organisation_id', context.organisation.id)
    .eq('email', email)
    .maybeSingle()

  if (existingInvite.error && !isMissingTableError(existingInvite.error, 'organisation_users')) {
    throw existingInvite.error
  }
  if (!existingInvite.data || !['active', 'invited', 'pending'].includes(normalizeText(existingInvite.data?.status))) {
    await assertWorkspaceEntitlementLimit({
      workspaceId: context.organisation.id,
      workspaceType: context.organisation.type,
      workspaceKind: context.organisation.workspaceKind,
      entitlementKey: ENTITLEMENT_KEYS.maxUsers,
    })
  }

  const inviteToken = createInviteToken()
  const payload = {
    organisation_id: context.organisation.id,
    user_id: null,
    branch_id: input.branchId || null,
    first_name: normalizeNullableText(input.firstName),
    last_name: normalizeNullableText(input.lastName),
    email,
    role: normalizeOrganisationUserRole(input.role, 'viewer'),
    status: 'invited',
    invited_at: new Date().toISOString(),
    invited_by_user_id: user.id,
    invitation_token: inviteToken,
    invitation_expires_at: resolveInviteExpiryIso(7),
  }

  assertAgencyAuthority(
    payload.role === 'principal' || payload.role === 'owner' || payload.role === 'super_admin'
      ? AGENCY_AUTHORITY_ACTIONS.invitePrincipal
      : AGENCY_AUTHORITY_ACTIONS.inviteAgent,
    getAuthorityActorFromContext(context),
    { email: payload.email, role: payload.role, branchId: payload.branch_id },
    {
      nextRole: payload.role,
      message: 'You do not have authority to invite a user at this level.',
    },
  )

  let result = await upsertOrganisationUserInvite(client, payload)
  if (result.error && payload.role === 'branch_manager') {
    result = await upsertOrganisationUserInvite(client, { ...payload, role: 'agent' })
  }

  if (result.error) {
    throw result.error
  }

  const { data, error } = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, first_name, last_name, email, role, status, invited_at, accepted_at, last_active_at')
    .eq('organisation_id', context.organisation.id)
    .eq('email', payload.email)
    .maybeSingle()

  if (error) {
    throw error
  }

  void recordSecurityAuditEvent({
    userId: context.profile?.id,
    workspaceId: context.organisation.id,
    action: 'invite_sent',
    targetType: 'organisation_user',
    targetId: data?.id,
    metadata: { email: payload.email, role: payload.role },
  })
  organisationUsersCache = null
  return normalizeOrganisationUserRow(data)
}

export async function updateOrganisationUserRole(userRowId, role) {
  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'manage organisation members')
  const nextRole = normalizeOrganisationUserRole(role, 'viewer')

  const existing = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, email, role, status')
    .eq('id', userRowId)
    .eq('organisation_id', context.organisation.id)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (!existing.data?.id) throw new Error('Organisation user not found.')

  const transitionType = classifyRoleTransition(existing.data.role, nextRole)
  assertAgencyAuthority(
    transitionType === 'promotion' ? AGENCY_AUTHORITY_ACTIONS.promoteUser : AGENCY_AUTHORITY_ACTIONS.demoteUser,
    getAuthorityActorFromContext(context),
    getAuthorityTargetFromOrganisationUser(existing.data),
    {
      nextRole,
      message: transitionType === 'promotion'
        ? 'You do not have authority to promote this organisation user.'
        : 'You do not have authority to demote this organisation user.',
    },
  )

  const { data, error } = await client
    .from('organisation_users')
    .update({ role: nextRole })
    .eq('id', userRowId)
    .eq('organisation_id', context.organisation.id)
    .select('id, organisation_id, user_id, branch_id, first_name, last_name, email, role, status, invited_at, accepted_at, last_active_at')
    .single()

  if (error) {
    throw error
  }

  void recordSecurityAuditEvent({
    userId: context.profile?.id,
    workspaceId: context.organisation.id,
    action: transitionType === 'promotion' ? 'agency_user_promoted' : transitionType === 'demotion' ? 'agency_user_demoted' : 'role_changed',
    targetType: 'organisation_user',
    targetId: userRowId,
    metadata: { previousRole: existing.data.role, role: nextRole, transitionType },
  })
  void recordAgencyGovernanceAudit({
    actor: getAuthorityActorFromContext(context),
    workspaceId: context.organisation.id,
    action: transitionType === 'promotion' ? 'principal_promoted' : transitionType === 'demotion' ? 'agency_user_demoted' : 'agency_user_role_changed',
    target: getAuthorityTargetFromOrganisationUser(data),
    previousRole: existing.data.role,
    nextRole,
  })
  organisationUsersCache = null
  return normalizeOrganisationUserRow(data)
}

export async function deactivateOrganisationUser(userRowId) {
  const client = requireClient()
  const context = await ensureOrganisationContext(client)
  assertOrganisationAdminAccess(context, 'manage organisation members')

  const existing = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, email, role, status')
    .eq('id', userRowId)
    .eq('organisation_id', context.organisation.id)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (!existing.data?.id) throw new Error('Organisation user not found.')
  assertAgencyAuthority(
    AGENCY_AUTHORITY_ACTIONS.deactivateAgent,
    getAuthorityActorFromContext(context),
    getAuthorityTargetFromOrganisationUser(existing.data),
    { message: 'You do not have authority to deactivate this organisation user.' },
  )
  assertMembershipStatusTransition(existing.data?.status, 'deactivated')

  const { data, error } = await client
    .from('organisation_users')
    .update({ status: 'deactivated' })
    .eq('id', userRowId)
    .eq('organisation_id', context.organisation.id)
    .select('id, organisation_id, user_id, branch_id, first_name, last_name, email, role, status, invited_at, accepted_at, last_active_at')
    .single()

  if (error) {
    throw error
  }

  void recordSecurityAuditEvent({
    userId: context.profile?.id,
    workspaceId: context.organisation.id,
    action: 'membership_deactivated',
    targetType: 'organisation_user',
    targetId: userRowId,
  })
  void recordAgencyGovernanceAudit({
    actor: getAuthorityActorFromContext(context),
    workspaceId: context.organisation.id,
    action: 'agency_user_deactivated',
    target: getAuthorityTargetFromOrganisationUser(existing.data),
    previousRole: existing.data.role,
    metadata: { previousStatus: existing.data.status, newStatus: 'deactivated' },
  })
  organisationUsersCache = null
  return normalizeOrganisationUserRow(data)
}

export async function fetchOrganisationInviteByToken(token) {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) {
    return { ok: false, reason: 'not_found', invite: null }
  }

  const client = requireClient()
  const inviteQuery = await client
    .from('organisation_users')
    .select('id, organisation_id, branch_id, first_name, last_name, email, role, status, invited_at, accepted_at, invitation_token, invitation_expires_at')
    .eq('invitation_token', normalizedToken)
    .maybeSingle()

  if (inviteQuery.error) {
    if (isMissingColumnError(inviteQuery.error, 'invitation_token') || isMissingColumnError(inviteQuery.error, 'invitation_expires_at')) {
      return { ok: false, reason: 'invite_schema_missing', invite: null }
    }
    throw inviteQuery.error
  }

  const inviteRow = inviteQuery.data
  if (!inviteRow) {
    return { ok: false, reason: 'not_found', invite: null }
  }

  const status = normalizeText(inviteRow.status).toLowerCase() || 'invited'
  if (status === 'deactivated') {
    return { ok: false, reason: 'revoked', invite: null }
  }
  if (status === 'active' && inviteRow.accepted_at) {
    return { ok: false, reason: 'already_accepted', invite: null }
  }

  const expiresAt = inviteRow.invitation_expires_at ? new Date(inviteRow.invitation_expires_at).getTime() : null
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    return { ok: false, reason: 'expired', invite: null }
  }

  let organisationName = 'Bridge Organisation'
  if (inviteRow.organisation_id) {
    const orgQuery = await client
      .from('organisations')
      .select('name, display_name')
      .eq('id', inviteRow.organisation_id)
      .maybeSingle()
    if (!orgQuery.error && orgQuery.data) {
      organisationName = normalizeText(orgQuery.data.display_name || orgQuery.data.name) || organisationName
    }
  }

  let branchName = ''
  if (inviteRow.branch_id) {
    const branchQuery = await client
      .from('organisation_branches')
      .select('name')
      .eq('id', inviteRow.branch_id)
      .maybeSingle()
    if (branchQuery.error && !isMissingTableError(branchQuery.error, 'organisation_branches')) {
      throw branchQuery.error
    }
    if (!branchQuery.error && branchQuery.data) {
      branchName = normalizeText(branchQuery.data.name)
    }
  }

  return {
    ok: true,
    reason: '',
    invite: {
      id: inviteRow.id,
      organisationId: inviteRow.organisation_id,
      organisationName,
      branchId: inviteRow.branch_id || null,
      branchName,
      email: normalizeEmail(inviteRow.email),
      role: normalizeOrganisationMembershipRole(inviteRow.role),
      firstName: normalizeText(inviteRow.first_name),
      lastName: normalizeText(inviteRow.last_name),
      invitedAt: inviteRow.invited_at || null,
      expiresAt: inviteRow.invitation_expires_at || null,
      token: normalizedToken,
    },
  }
}

export async function completeInvitedMemberOnboarding(input = {}) {
  const token = normalizeText(input.token)
  if (!token) {
    throw new Error('Invite token is required.')
  }

  const client = requireClient()
  const user = await getAuthenticatedUser()
  const inviteContext = await fetchOrganisationInviteByToken(token)

  if (!inviteContext.ok || !inviteContext.invite) {
    if (inviteContext.reason === 'expired') throw new Error('This invite link has expired.')
    if (inviteContext.reason === 'already_accepted') throw new Error('This invite has already been accepted.')
    if (inviteContext.reason === 'invite_schema_missing') throw new Error('Invite token columns are missing in the database schema.')
    throw new Error('Invite is invalid or no longer available.')
  }

  const invite = inviteContext.invite
  const userEmail = normalizeEmail(user.email)
  if (!userEmail || userEmail !== normalizeEmail(invite.email)) {
    throw new Error(`Sign in with ${invite.email} to accept this invitation.`)
  }

  let claimResult = await client.rpc('bridge_claim_org_invite', { invite_token: token })
  if (claimResult.error || !Array.isArray(claimResult.data) || !claimResult.data[0]?.id) {
    const nowIso = new Date().toISOString()
    claimResult = await client
      .from('organisation_users')
      .update({
        user_id: user.id,
        status: 'active',
        accepted_at: nowIso,
      })
      .eq('id', invite.id)
      .select('id, organisation_id, role')
      .maybeSingle()
    if (claimResult.error) {
      throw claimResult.error
    }
  }

  const claimedRow = Array.isArray(claimResult.data) ? claimResult.data[0] : claimResult.data

  const firstName = normalizeText(input.firstName || invite.firstName)
  const lastName = normalizeText(input.lastName || invite.lastName)
  const existingProfile = await getOrCreateUserProfile({ user })
  const existingAppRole = normalizeAppRole(existingProfile?.role)
  const appRole = normalizeAppRole(input.appRole || (existingAppRole === 'viewer' ? 'agent' : existingAppRole) || 'agent')
  const completion = await completeOnboarding({
    userId: user.id,
    user,
    appRole,
    workspaceType: 'agency',
    workspaceId: claimedRow?.organisation_id || invite.organisationId,
    profilePatch: {
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      phone_number: normalizeText(input.phoneNumber || '') || undefined,
      avatar_url: normalizeText(input.avatarUrl || input.photoUrl || '') || undefined,
    },
    context: { source: 'legacy_org_invite_acceptance', inviteId: invite.id },
  })

  return {
    ok: true,
    organisationId: claimedRow?.organisation_id || invite.organisationId,
    role: appRole,
    profile: completion.profile,
  }
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
