import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { resolveCurrentWorkspace } from './workspaceResolutionService'
import { resolveWorkspaceRole, resolveTransactionRole } from './roleResolutionService'

export const INVITE_TYPES = Object.freeze({
  workspace: 'workspace_invite',
  transaction: 'transaction_invite',
  workspaceAndTransaction: 'workspace_and_transaction_invite',
  branch: 'branch_invite',
  team: 'team_invite',
  client: 'client_invite',
  externalCollaborator: 'external_collaborator_invite',
})

export const INVITE_STATUSES = Object.freeze({
  pending: 'pending',
  accepted: 'accepted',
  declined: 'declined',
  expired: 'expired',
  revoked: 'revoked',
  cancelled: 'cancelled',
})

export class InviteValidationError extends Error {
  constructor(code = 'invite_invalid', details = {}) {
    super(code)
    this.name = 'InviteValidationError'
    this.code = code
    this.details = details
  }
}

function requireClient(clientOverride = null) {
  if (clientOverride) return clientOverride
  if (!isSupabaseConfigured || !supabase) {
    throw new InviteValidationError('invite_backend_unavailable')
  }
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeInviteRow(row = {}) {
  return {
    id: row.id || '',
    inviteType: row.invite_type || '',
    status: row.status || '',
    token: row.token || '',
    expiresAt: row.expires_at || null,
    inviterUserId: row.inviter_user_id || null,
    targetWorkspaceId: row.target_workspace_id || null,
    targetWorkspaceRole: resolveWorkspaceRole({ workspace_role: row.target_workspace_role, workspace_type: row.metadata?.workspace_type }),
    targetTransactionId: row.target_transaction_id || null,
    targetTransactionRole: resolveTransactionRole({ transaction_role: row.target_transaction_role, role_type: row.target_transaction_role }),
    targetBranchId: row.target_branch_id || null,
    targetTeamId: row.target_team_id || null,
    email: normalizeEmail(row.email),
    phone: normalizeText(row.phone),
    inviteeUserId: row.invitee_user_id || null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    acceptedAt: row.accepted_at || null,
    acceptedByUserId: row.accepted_by_user_id || null,
    revokedAt: row.revoked_at || null,
    revokedByUserId: row.revoked_by_user_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    workspace: row.organisations || null,
  }
}

function isMissingInviteSchemaError(error) {
  return String(error?.code || '').toUpperCase() === '42P01' || String(error?.message || '').toLowerCase().includes('invites')
}

function isMissingInviteLookupRpcError(error) {
  const code = String(error?.code || '').toUpperCase()
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return code === '42883' || code === 'PGRST202' || message.includes('bridge_lookup_invite_by_token')
}

function isRlsVisibilityError(error) {
  const code = String(error?.code || '').toUpperCase()
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return code === '42501' || message.includes('permission denied') || message.includes('violates row-level security')
}

function resolveInviteContext(invite = {}) {
  if (!invite.id) return { ok: false, reason: 'not_found', invite: null }
  if (invite.status === INVITE_STATUSES.revoked) return { ok: false, reason: 'revoked', invite }
  if (invite.status === INVITE_STATUSES.accepted) return { ok: false, reason: 'already_accepted', invite }
  const expiresAt = invite.expiresAt ? new Date(invite.expiresAt).getTime() : null
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return { ok: false, reason: 'expired', invite }
  return { ok: true, reason: '', invite }
}

async function getInviteByTokenViaLookupRpc(client, safeToken) {
  if (!safeToken || typeof client?.rpc !== 'function') return null
  const result = await client.rpc('bridge_lookup_invite_by_token', { p_token: safeToken })
  if (result.error) {
    if (isMissingInviteLookupRpcError(result.error)) return null
    throw result.error
  }
  const payload = result.data || {}
  if (!payload.success) {
    return { ok: false, reason: payload.code || 'not_found', invite: null }
  }
  return resolveInviteContext(normalizeInviteRow(payload.invite || {}))
}

export function resolveInviteAction(invite = {}) {
  const inviteType = invite.inviteType || invite.invite_type || ''
  return {
    createWorkspaceMembership: [
      INVITE_TYPES.workspace,
      INVITE_TYPES.workspaceAndTransaction,
      INVITE_TYPES.branch,
      INVITE_TYPES.team,
    ].includes(inviteType),
    createTransactionParticipant: [
      INVITE_TYPES.transaction,
      INVITE_TYPES.workspaceAndTransaction,
      INVITE_TYPES.client,
      INVITE_TYPES.externalCollaborator,
    ].includes(inviteType),
    requiresWorkspaceResolution: [
      INVITE_TYPES.workspace,
      INVITE_TYPES.workspaceAndTransaction,
      INVITE_TYPES.branch,
      INVITE_TYPES.team,
    ].includes(inviteType),
  }
}

export function assertInviteCanBeAccepted(invite = {}, user = {}) {
  if (!invite?.id) throw new InviteValidationError('invite_not_found')
  if (invite.status !== INVITE_STATUSES.pending) {
    throw new InviteValidationError(`invite_${invite.status || 'not_pending'}`, { inviteId: invite.id })
  }
  const expiresAt = invite.expiresAt ? new Date(invite.expiresAt).getTime() : null
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    throw new InviteValidationError('invite_expired', { inviteId: invite.id })
  }
  const inviteEmail = normalizeEmail(invite.email)
  const userEmail = normalizeEmail(user.email)
  if (inviteEmail && userEmail && inviteEmail !== userEmail) {
    throw new InviteValidationError('invite_email_mismatch', {
      inviteId: invite.id,
      inviteEmail,
      userEmail,
    })
  }
  return true
}

export async function getInviteByToken(token, options = {}) {
  const client = requireClient(options.client)
  const safeToken = normalizeText(token)
  if (!safeToken) return { ok: false, reason: 'missing_token', invite: null }

  const result = await client
    .from('invites')
    .select('id, invite_type, status, token, expires_at, inviter_user_id, target_workspace_id, target_workspace_role, target_transaction_id, target_transaction_role, target_branch_id, target_team_id, email, phone, invitee_user_id, metadata, accepted_at, accepted_by_user_id, revoked_at, revoked_by_user_id, created_at, updated_at, organisations:target_workspace_id(id, name, display_name, type, logo_url)')
    .eq('token', safeToken)
    .maybeSingle()

  if (result.error) {
    if (isRlsVisibilityError(result.error)) {
      const rpcContext = await getInviteByTokenViaLookupRpc(client, safeToken)
      if (rpcContext) return rpcContext
    }
    if (isMissingInviteSchemaError(result.error)) {
      return { ok: false, reason: 'invite_schema_missing', invite: null }
    }
    throw result.error
  }

  const invite = normalizeInviteRow(result.data || {})
  if (!invite.id) {
    const rpcContext = await getInviteByTokenViaLookupRpc(client, safeToken)
    if (rpcContext) return rpcContext
  }
  return resolveInviteContext(invite)
}

export async function createInvite(payload = {}) {
  const client = requireClient()
  const result = await client.rpc('bridge_create_invite', { payload })
  if (result.error) throw result.error
  if (!result.data?.success) {
    throw new InviteValidationError(result.data?.code || 'invite_create_failed', result.data || {})
  }
  return result.data
}

export async function createWorkspaceMembershipFromInvite(invite, user) {
  assertInviteCanBeAccepted(invite, user)
  const action = resolveInviteAction(invite)
  if (!action.createWorkspaceMembership) return null
  return { inviteId: invite.id, workspaceId: invite.targetWorkspaceId, userId: user.id }
}

export async function createTransactionParticipantFromInvite(invite, user) {
  assertInviteCanBeAccepted(invite, user)
  const action = resolveInviteAction(invite)
  if (!action.createTransactionParticipant) return null
  return { inviteId: invite.id, transactionId: invite.targetTransactionId, userId: user.id }
}

export async function acceptInvite(token, options = {}) {
  const client = requireClient()
  const authResult = await client.auth.getUser()
  const user = options.user || authResult.data?.user || null
  if (!user?.id) throw new InviteValidationError('not_authenticated')

  const context = await getInviteByToken(token)
  if (!context.ok || !context.invite) {
    throw new InviteValidationError(context.reason || 'invite_not_found', { token })
  }
  assertInviteCanBeAccepted(context.invite, user)

  const result = await client.rpc('bridge_accept_invite', { p_token: normalizeText(token) })
  if (result.error) throw result.error
  if (!result.data?.success) {
    throw new InviteValidationError(result.data?.code || 'invite_accept_failed', result.data || {})
  }

  let workspaceResolution = null
  if (result.data.workspace_id) {
    workspaceResolution = await resolveCurrentWorkspace(user.id, {
      client,
      user,
      requestedWorkspaceId: result.data.workspace_id,
    })
    if (!workspaceResolution.ok) {
      throw new InviteValidationError('workspace_resolution_failed_after_invite', {
        inviteId: result.data.invite_id,
        reason: workspaceResolution.reason,
      })
    }
  }

  return {
    ...result.data,
    invite: context.invite,
    workspaceResolution,
  }
}
