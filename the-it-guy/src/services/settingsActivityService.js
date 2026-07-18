import { canManageOrganisationSettings } from '../lib/organisationAccess'
import { fetchOrganisationSettings } from '../lib/settingsApi'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { listWorkspaceBillingActivity } from './workspaceEntitlementsService'

const SETTINGS_ACTION_PATTERN = /(setting|workflow|organisation|organization|invite|role|user|member|owner|job_title|template|brand|profile|password|billing|plan)/i

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeMetadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function isMissingActivityTable(error, table) {
  if (!error) return false
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return ['42p01', 'pgrst205'].includes(String(error.code || '').toLowerCase()) || message.includes(table)
}

export function getSettingsActivityCategory(action = '') {
  const normalized = normalizeText(action).toLowerCase()
  if (/(plan|billing|subscription|invoice)/.test(normalized)) return 'billing'
  if (/(invite|role|user|member|owner|job_title|principal)/.test(normalized)) return 'team'
  if (/(password|security|auth)/.test(normalized)) return 'security'
  if (/(profile|avatar|account)/.test(normalized)) return 'account'
  return 'workspace'
}

export function formatSettingsActivityAction(action = '') {
  const normalized = normalizeText(action).replace(/^agency_/, '').replaceAll('_', ' ')
  if (!normalized) return 'Settings activity'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function normalizeActivityItem({ id, action, actorUserId, targetId, metadata, createdAt, source }) {
  const normalizedMetadata = normalizeMetadata(metadata)
  return {
    id: `${source}:${id}`,
    action: normalizeText(action),
    actionLabel: formatSettingsActivityAction(action),
    category: getSettingsActivityCategory(action),
    actorUserId: normalizeText(actorUserId),
    actorName: '',
    targetId: normalizeText(targetId),
    targetLabel: normalizeText(
      normalizedMetadata.targetEmail ||
      normalizedMetadata.email ||
      normalizedMetadata.targetName ||
      normalizedMetadata.newOwnerMembershipId ||
      targetId,
    ),
    metadata: normalizedMetadata,
    createdAt: createdAt || null,
    source,
  }
}

async function resolveActorNames(items) {
  const actorIds = [...new Set(items.map((item) => item.actorUserId).filter(Boolean))]
  if (!actorIds.length) return items

  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email')
    .in('id', actorIds)

  if (error) return items
  const names = new Map((data || []).map((profile) => [
    profile.id,
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email || 'Workspace user',
  ]))
  return items.map((item) => ({
    ...item,
    actorName: names.get(item.actorUserId) || (item.actorUserId ? 'Workspace user' : 'System'),
  }))
}

export async function listSettingsActivity({ limit = 100 } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Settings activity requires a configured Supabase workspace.')
  }

  const context = await fetchOrganisationSettings()
  const workspaceId = context?.organisation?.id || ''
  if (!workspaceId) throw new Error('An active organisation workspace is required.')
  if (!canManageOrganisationSettings({
    appRole: context?.profile?.role,
    membershipRole: context?.membershipRole,
    workspaceType: context?.organisation?.type,
  })) {
    throw new Error('You do not have permission to view organisation settings activity.')
  }

  const safeLimit = Math.max(20, Math.min(Number(limit) || 100, 200))
  const [securityResult, organisationResult, billingResult] = await Promise.all([
    supabase
      .from('security_audit_events')
      .select('id, user_id, action, target_type, target_id, metadata, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(safeLimit),
    supabase
      .from('organization_events')
      .select('id, actor_user_id, target_user_id, event_type, event_data, created_at')
      .eq('organization_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(safeLimit),
    listWorkspaceBillingActivity({ workspaceId, limit: Math.min(safeLimit, 50) }).catch(() => ({ events: [] })),
  ])

  if (securityResult.error && !isMissingActivityTable(securityResult.error, 'security_audit_events')) throw securityResult.error
  if (organisationResult.error && !isMissingActivityTable(organisationResult.error, 'organization_events')) throw organisationResult.error

  const organisationRows = organisationResult.error ? [] : (organisationResult.data || [])
  const hasAtomicOwnershipEvent = organisationRows.some((row) => row.event_type === 'ownership_transferred')
  const securityItems = (securityResult.error ? [] : securityResult.data || [])
    .filter((row) => SETTINGS_ACTION_PATTERN.test(row.action || ''))
    .filter((row) => !(hasAtomicOwnershipEvent && row.action === 'organisation_ownership_transferred'))
    .map((row) => normalizeActivityItem({
      id: row.id,
      action: row.action,
      actorUserId: row.user_id,
      targetId: row.target_id,
      metadata: row.metadata,
      createdAt: row.created_at,
      source: 'security',
    }))
  const organisationItems = organisationRows
    .filter((row) => SETTINGS_ACTION_PATTERN.test(row.event_type || ''))
    .map((row) => normalizeActivityItem({
      id: row.id,
      action: row.event_type,
      actorUserId: row.actor_user_id,
      targetId: row.target_user_id,
      metadata: row.event_data,
      createdAt: row.created_at,
      source: 'organisation',
    }))
  const billingItems = (billingResult.events || []).map((row) => normalizeActivityItem({
    id: row.id,
    action: row.eventType,
    actorUserId: row.actorUserId,
    targetId: row.requestId || row.subscriptionId,
    metadata: {
      ...row.metadata,
      previousPlanKey: row.previousPlanKey,
      nextPlanKey: row.nextPlanKey,
    },
    createdAt: row.createdAt,
    source: 'billing',
  }))

  const items = [...securityItems, ...organisationItems, ...billingItems]
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
    .slice(0, safeLimit)

  return {
    workspaceId,
    items: await resolveActorNames(items),
  }
}
