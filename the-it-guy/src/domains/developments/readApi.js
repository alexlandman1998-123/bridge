// Extracted without changing query, mapping or error behaviour.
import { requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { refreshDevelopmentMedia } from '../../lib/developmentMediaStorage.js'

export const DEFAULT_DEVELOPMENT_FINANCIALS = {
  id: null,
  developmentId: null,
  landCost: null,
  buildCost: null,
  professionalFees: null,
  marketingCost: null,
  infrastructureCost: null,
  otherCosts: null,
  totalProjectedCost: null,
  projectedGrossSalesValue: null,
  projectedProfit: null,
  targetMargin: null,
  notes: '',
}

export function normalizeDevelopmentFinancialsRow(row = {}) {
  const landCost = normalizeOptionalNumber(row.land_cost ?? row.landCost)
  const buildCost = normalizeOptionalNumber(row.build_cost ?? row.buildCost)
  const professionalFees = normalizeOptionalNumber(row.professional_fees ?? row.professionalFees)
  const marketingCost = normalizeOptionalNumber(row.marketing_cost ?? row.marketingCost)
  const infrastructureCost = normalizeOptionalNumber(row.infrastructure_cost ?? row.infrastructureCost)
  const otherCosts = normalizeOptionalNumber(row.other_costs ?? row.otherCosts)
  const computedTotalProjectedCost =
    [landCost, buildCost, professionalFees, marketingCost, infrastructureCost, otherCosts].reduce(
      (sum, value) => sum + (Number.isFinite(value) ? value : 0),
      0,
    ) || null
  const totalProjectedCost =
    normalizeOptionalNumber(row.total_projected_cost ?? row.totalProjectedCost) ?? computedTotalProjectedCost
  const projectedGrossSalesValue = normalizeOptionalNumber(
    row.projected_gross_sales_value ?? row.projectedGrossSalesValue,
  )
  const projectedProfit =
    normalizeOptionalNumber(row.projected_profit ?? row.projectedProfit) ??
    (projectedGrossSalesValue !== null && totalProjectedCost !== null
      ? projectedGrossSalesValue - totalProjectedCost
      : null)

  return {
    id: row.id || null,
    developmentId: row.development_id || row.developmentId || null,
    landCost,
    buildCost,
    professionalFees,
    marketingCost,
    infrastructureCost,
    otherCosts,
    totalProjectedCost,
    projectedGrossSalesValue,
    projectedProfit,
    targetMargin: normalizeOptionalNumber(row.target_margin ?? row.targetMargin),
    notes: normalizeTextValue(row.notes),
  }
}

export function normalizeDevelopmentDocumentRow(row = {}) {
  return {
    id: row.id || null,
    developmentId: row.development_id || row.developmentId || null,
    documentType: normalizeTextValue(row.document_type ?? row.documentType) || 'other',
    title: normalizeTextValue(row.title),
    description: normalizeTextValue(row.description),
    fileUrl: normalizeTextValue(row.file_url ?? row.fileUrl),
    linkedUnitId: row.linked_unit_id || row.linkedUnitId || null,
    linkedUnitType: normalizeTextValue(row.linked_unit_type ?? row.linkedUnitType),
    approvalStatus: normalizeTextValue(row.approval_status ?? row.approvalStatus) || 'approved',
    visibility: normalizeTextValue(row.visibility) || 'internal',
    version: Math.max(1, Number(row.version) || 1),
    supersedesDocumentId: row.supersedes_document_id || row.supersedesDocumentId || null,
    archivedAt: row.archived_at || row.archivedAt || null,
    storageBucket: normalizeTextValue(row.storage_bucket ?? row.storageBucket),
    storagePath: normalizeTextValue(row.storage_path ?? row.storagePath),
    mimeType: normalizeTextValue(row.mime_type ?? row.mimeType),
    fileSizeBytes: Number.isFinite(Number(row.file_size_bytes ?? row.fileSizeBytes))
      ? Number(row.file_size_bytes ?? row.fileSizeBytes)
      : null,
    uploadedAt: row.uploaded_at || row.uploadedAt || null,
    createdAt: row.created_at || row.createdAt || null,
  }
}

export function normalizeDevelopmentMarketingAccessRow(row = {}) {
  return {
    id: row.id || null,
    developmentId: row.development_id || row.developmentId || null,
    organisationId: row.organisation_id || row.organisationId || null,
    userId: row.user_id || row.userId || null,
    inviteeEmail: normalizeTextValue(row.invitee_email ?? row.inviteeEmail).toLowerCase(),
    accessRole: normalizeTextValue(row.access_role ?? row.accessRole) || 'viewer',
    status: normalizeTextValue(row.status) || 'pending',
    invitedBy: row.invited_by || row.invitedBy || null,
    invitedAt: row.invited_at || row.invitedAt || null,
    acceptedAt: row.accepted_at || row.acceptedAt || null,
    expiresAt: row.expires_at || row.expiresAt || null,
    revokedAt: row.revoked_at || row.revokedAt || null,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

export function normalizeDevelopmentMarketingActivityRow(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  return {
    id: row.id || null,
    developmentId: row.development_id || row.developmentId || null,
    documentId: row.development_document_id || row.developmentDocumentId || null,
    marketingAccessId: row.marketing_access_id || row.marketingAccessId || null,
    actorUserId: row.actor_user_id || row.actorUserId || null,
    actionType: normalizeTextValue(row.action_type ?? row.actionType),
    metadata,
    occurredAt: row.occurred_at || row.occurredAt || row.created_at || null,
  }
}

export function normalizeDevelopmentMarketingEventRow(row = {}) {
  return {
    id: row.id || null,
    title: normalizeTextValue(row.title) || 'Marketing event',
    eventType: normalizeTextValue(row.event_type ?? row.eventType) || 'show_day',
    status: normalizeTextValue(row.status) || 'draft',
    startsAt: row.starts_at || row.startsAt || null,
    endsAt: row.ends_at || row.endsAt || null,
    location: normalizeTextValue(row.location || row.address),
    description: normalizeTextValue(row.description),
    imageUrl: normalizeTextValue(row.image_url ?? row.imageUrl),
    createdAt: row.created_at || row.createdAt || null,
    createdBy: row.created_by || row.createdBy || null,
  }
}

export async function fetchDevelopmentFinancials(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    return { ...DEFAULT_DEVELOPMENT_FINANCIALS }
  }

  const { data, error } = await client
    .from('development_financials')
    .select(
      'id, development_id, land_cost, build_cost, professional_fees, marketing_cost, infrastructure_cost, other_costs, total_projected_cost, projected_gross_sales_value, projected_profit, target_margin, notes',
    )
    .eq('development_id', developmentId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'development_financials') || isPermissionDeniedError(error)) {
      return {
        ...DEFAULT_DEVELOPMENT_FINANCIALS,
        developmentId,
      }
    }

    throw error
  }

  return normalizeDevelopmentFinancialsRow({
    ...DEFAULT_DEVELOPMENT_FINANCIALS,
    ...data,
    development_id: developmentId,
  })
}

export async function fetchDevelopmentDocuments(developmentId, { includeHistory = false } = {}) {
  const client = requireClient()

  if (!developmentId) {
    return []
  }

  let { data, error } = await client
    .from('development_documents')
    .select(
      'id, development_id, document_type, title, description, file_url, linked_unit_id, linked_unit_type, approval_status, visibility, version, supersedes_document_id, archived_at, storage_bucket, storage_path, mime_type, file_size_bytes, uploaded_at, created_at',
    )
    .eq('development_id', developmentId)
    .order('created_at', { ascending: false })

  // Marketing-document governance fields were added after the original
  // development document table. Keep older production schemas readable while
  // their migration is pending.
  if (error && isMissingColumnError(error, 'approval_status')) {
    const fallback = await client
      .from('development_documents')
      .select('id, development_id, document_type, title, description, file_url, linked_unit_id, linked_unit_type, uploaded_at, created_at')
      .eq('development_id', developmentId)
      .order('created_at', { ascending: false })
    data = fallback.data
    error = fallback.error
  }

  if (error) {
    if (isMissingTableError(error, 'development_documents') || isPermissionDeniedError(error)) {
      return []
    }
    throw error
  }

  const visible = includeHistory ? data || [] : (data || []).filter(row => !row.archived_at)
  return (await refreshDevelopmentMedia(client, visible)).map((row) => normalizeDevelopmentDocumentRow(row))
}

export async function fetchDevelopmentMarketingAccess(developmentId) {
  const client = requireClient()
  if (!developmentId) return []

  const { data, error } = await client
    .from('development_marketing_access')
    .select('id, development_id, organisation_id, user_id, invitee_email, access_role, status, invited_by, invited_at, accepted_at, expires_at, revoked_at, created_at, updated_at')
    .eq('development_id', developmentId)
    .order('invited_at', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'development_marketing_access') || isPermissionDeniedError(error)) return []
    throw error
  }

  return (data || []).map(normalizeDevelopmentMarketingAccessRow)
}

export async function fetchDevelopmentMarketingInvite(token) {
  const client = requireClient()
  const { data, error } = await client.rpc('bridge_get_development_marketing_invite', { target_invite_token: normalizeTextValue(token) })
  if (error) throw error
  if (!data) throw new Error('Marketing invitation not found.')
  return data
}

export async function fetchDevelopmentMarketingActivity(developmentId, { limit = 12 } = {}) {
  const client = requireClient()
  if (!developmentId) return []
  const { data, error } = await client
    .from('development_marketing_activity')
    .select('id, development_id, development_document_id, marketing_access_id, actor_user_id, action_type, metadata, occurred_at')
    .eq('development_id', developmentId)
    .order('occurred_at', { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 12, 50)))

  if (error) {
    if (isMissingTableError(error, 'development_marketing_activity') || isPermissionDeniedError(error)) return []
    throw error
  }
  return (data || []).map(normalizeDevelopmentMarketingActivityRow)
}

export async function fetchDevelopmentMarketingEvents(developmentId, organisationId = '') {
  const client = requireClient()
  if (!developmentId || !organisationId) return []
  const { data, error } = await client
    .from('marketing_events')
    .select('id, title, event_type, status, starts_at, ends_at, location, address, description, image_url, created_at, created_by')
    .eq('organisation_id', organisationId)
    .eq('subject_type', 'development')
    .eq('subject_id', developmentId)
    .order('starts_at', { ascending: true })

  if (error) {
    if (isMissingTableError(error, 'marketing_events') || isPermissionDeniedError(error)) return []
    throw error
  }
  return (data || []).map(normalizeDevelopmentMarketingEventRow)
}

export async function fetchDevelopmentVisualAnalytics(developmentId, { days = 30 } = {}) {
  const client = requireClient()
  if (!developmentId) return null
  const { data, error } = await client.rpc('get_development_visual_analytics', {
    requested_development_id: developmentId,
    requested_days: Math.max(1, Math.min(Number(days) || 30, 365)),
  })
  if (error) {
    if (isMissingSchemaError(error) || isPermissionDeniedError(error)) return null
    throw error
  }
  return data || null
}

export async function fetchDevelopmentDocumentRequirements(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    return []
  }

  const { data, error } = await client
    .from('document_requirements')
    .select('id, development_id, category_key, label, sort_order')
    .eq('development_id', developmentId)
    .order('sort_order', { ascending: true })

  if (error) {
    if (error.code === '42P01') {
      return []
    }

    throw error
  }

  return data
}
