import {
  ATTORNEY_FIRM_ROLE_VALUES,
  ATTORNEY_INVITATION_STATUS_VALUES,
  normalizeAttorneyFirmRole,
  normalizeAttorneyInvitationStatus,
} from '../lib/attorneyPermissions'
import {
  createInviteToken,
  getAuthenticatedUser,
  isMissingColumnError,
  isPermissionDeniedError,
  isMissingTableError,
  isValidEmail,
  mapInvitationRow,
  normalizeEmail,
  normalizeText,
  requireClient,
  resolveInviteExpiryIso,
} from './attorneyFirmServiceShared'
import { createOrActivateAttorneyFirmMember } from './attorneyFirmMembers'

function assertRole(value) {
  const normalized = normalizeAttorneyFirmRole(value, '')
  if (!ATTORNEY_FIRM_ROLE_VALUES.includes(normalized)) {
    throw new Error('Invitation role must be one of the approved attorney firm roles.')
  }
  return normalized
}

function assertInvitationStatus(value) {
  const normalized = normalizeAttorneyInvitationStatus(value, '')
  if (!ATTORNEY_INVITATION_STATUS_VALUES.includes(normalized)) {
    throw new Error('Invitation status is invalid.')
  }
  return normalized
}

export async function inviteAttorneyFirmMember({
  firmId,
  email,
  role,
  departmentId = null,
  expiresInDays = 7,
} = {}) {
  const client = requireClient()
  const actor = await getAuthenticatedUser(client)

  const normalizedFirmId = normalizeText(firmId)
  const normalizedEmail = normalizeEmail(email)
  const normalizedRole = assertRole(role)

  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }
  if (!isValidEmail(normalizedEmail)) {
    throw new Error('Invitation email is required and must be valid.')
  }

  const token = createInviteToken('attorney-invite')
  const payload = {
    firm_id: normalizedFirmId,
    email: normalizedEmail,
    role: normalizedRole,
    department_id: departmentId || null,
    invited_by: actor.id,
    token,
    status: 'pending',
    expires_at: resolveInviteExpiryIso(expiresInDays),
  }

  const query = await client
    .from('attorney_firm_invitations')
    .insert(payload)
    .select('id, firm_id, email, role, department_id, invited_by, token, status, expires_at, accepted_at, created_at, updated_at')
    .single()

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firm_invitations')) {
      throw new Error('Invitations are temporarily unavailable. You can continue setup and invite team members later.')
    }
    throw query.error
  }

  return mapInvitationRow(query.data)
}

export async function getAttorneyFirmInvitations(firmId, { status = null } = {}) {
  const client = requireClient()
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }

  let query = client
    .from('attorney_firm_invitations')
    .select('id, firm_id, email, role, department_id, invited_by, token, status, expires_at, accepted_at, created_at, updated_at')
    .eq('firm_id', normalizedFirmId)
    .order('created_at', { ascending: false })

  if (status) {
    const normalizedStatus = assertInvitationStatus(status)
    query = query.eq('status', normalizedStatus)
  }

  const result = await query
  if (result.error) {
    if (isMissingTableError(result.error, 'attorney_firm_invitations')) {
      return []
    }
    if (isPermissionDeniedError(result.error)) {
      console.warn('[Attorney Firm] invitation lookup blocked by RLS; continuing with empty invitations.', result.error)
      return []
    }
    throw result.error
  }

  return (result.data || []).map(mapInvitationRow)
}

export async function acceptAttorneyFirmInvitation(token) {
  const client = requireClient()
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) {
    throw new Error('Invitation token is required.')
  }

  const user = await getAuthenticatedUser(client)
  const userEmail = normalizeEmail(user.email)
  if (!userEmail) {
    throw new Error('Authenticated user email is required to accept an invitation.')
  }

  const nowIso = new Date().toISOString()
  const invitationQuery = await client
    .from('attorney_firm_invitations')
    .select('id, firm_id, email, role, department_id, invited_by, token, status, expires_at, accepted_at, created_at, updated_at')
    .eq('token', normalizedToken)
    .maybeSingle()

  if (invitationQuery.error) {
    if (isMissingTableError(invitationQuery.error, 'attorney_firm_invitations')) {
      throw new Error('Invitation records are temporarily unavailable. Please ask your firm admin to resend your invite.')
    }
    throw invitationQuery.error
  }

  const invitation = invitationQuery.data
  if (!invitation) {
    throw new Error('Invitation was not found.')
  }

  const invitationStatus = assertInvitationStatus(invitation.status)
  if (invitationStatus !== 'pending') {
    throw new Error('This invitation is no longer pending.')
  }

  const invitationEmail = normalizeEmail(invitation.email)
  if (invitationEmail !== userEmail) {
    throw new Error('This invitation does not match your signed-in email address.')
  }

  if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) {
    await client
      .from('attorney_firm_invitations')
      .update({ status: 'expired' })
      .eq('id', invitation.id)
    throw new Error('This invitation has expired.')
  }

  const membership = await createOrActivateAttorneyFirmMember({
    firmId: invitation.firm_id,
    userId: user.id,
    role: invitation.role,
    departmentId: invitation.department_id || null,
    status: 'active',
    invitedBy: invitation.invited_by || null,
  })

  const inviteUpdate = await client
    .from('attorney_firm_invitations')
    .update({
      status: 'accepted',
      accepted_at: nowIso,
    })
    .eq('id', invitation.id)
    .select('id, firm_id, email, role, department_id, invited_by, token, status, expires_at, accepted_at, created_at, updated_at')
    .single()

  if (inviteUpdate.error) {
    throw inviteUpdate.error
  }

  const profileUpdate = await client
    .from('profiles')
    .update({
      primary_attorney_firm_id: invitation.firm_id,
      attorney_role: invitation.role,
      updated_at: nowIso,
    })
    .eq('id', user.id)

  if (profileUpdate.error && !isMissingColumnError(profileUpdate.error, 'primary_attorney_firm_id')) {
    throw profileUpdate.error
  }

  return {
    invitation: mapInvitationRow(inviteUpdate.data),
    membership,
  }
}
