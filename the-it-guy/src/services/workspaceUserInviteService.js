import { buildAgentInviteLink } from '../lib/agentInviteService'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../lib/whatsapp'
import { assignOrganisationUserCommissionProfile, fetchOrganisationSettings } from '../lib/settingsApi'
import { createInvite, INVITE_STATUSES, INVITE_TYPES, InviteValidationError } from './inviteService'
import {
  AGENCY_AUTHORITY_ACTIONS,
  assertAgencyAuthority,
  getAgencyAuthorityLevel,
  normalizeAgencyAuthorityRole,
} from './agencyAuthorityService'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function pickFirstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function isLikelyUuid(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeRole(value, fallback = 'agent') {
  return normalizeText(value).toLowerCase() || fallback
}

function getFirstName(input = {}) {
  return normalizeText(input.firstName || input.first_name || input.name?.split(/\s+/)?.[0])
}

function getLastName(input = {}) {
  const explicit = normalizeText(input.lastName || input.last_name || input.surname)
  if (explicit) return explicit
  const parts = normalizeText(input.name).split(/\s+/).filter(Boolean)
  return parts.length > 1 ? parts.slice(1).join(' ') : ''
}

function formatRoleLabel(value = '') {
  const normalized = normalizeRole(value)
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'Agent'
}

function mapInviteStatus(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === INVITE_STATUSES.accepted) return 'active'
  if (normalized === INVITE_STATUSES.expired) return 'expired'
  if (normalized === INVITE_STATUSES.revoked || normalized === INVITE_STATUSES.cancelled || normalized === INVITE_STATUSES.declined) return 'revoked'
  return 'pending_invite'
}

function isExpired(value = '') {
  if (!value) return false
  const time = new Date(value).getTime()
  return Number.isFinite(time) && time < Date.now()
}

function getInviteeName(input = {}) {
  return [getFirstName(input), getLastName(input)].filter(Boolean).join(' ') || normalizeEmail(input.email) || 'there'
}

function buildInviteMessage({ invite, inviteLink }) {
  const agentName = getInviteeName(invite) || 'Agent'
  const orgName = normalizeText(invite?.organisationName) || 'your organisation'
  if (invite?.inviteType === INVITE_TYPES.principalClaim || invite?.role === 'principal_claim') {
    return `Hi ${agentName},\n\n${orgName} has invited you to claim principal access on Bridge 9.\n\nStart the claim here:\n${inviteLink}\n\n- Bridge`
  }
  return `Hi ${agentName},\n\nYou have been invited to join ${orgName} on Bridge 9.\n\nComplete your onboarding here:\n${inviteLink}\n\n- Bridge`
}

function resolveInviteError(error) {
  if (error instanceof InviteValidationError) {
    return error.details?.message || error.details?.code || error.code || error.message
  }
  return error?.message || 'Unable to create invite.'
}

function isMissingRelationError(error, relationName = '') {
  const code = String(error?.code || '').toUpperCase()
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return code === '42P01' || code === 'PGRST205' || (relationName && message.includes(relationName.toLowerCase()))
}

async function createPrincipalClaimInviteRpc(payload = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Invite creation is unavailable because Supabase is not configured.')
  }
  const result = await supabase.rpc('bridge_create_principal_claim_invite', { payload })
  if (result.error) throw result.error
  if (!result.data?.success) {
    throw new InviteValidationError(result.data?.code || 'principal_claim_invite_create_failed', result.data || {})
  }
  return result.data
}

function resolveInviteBranding(input = {}, context = {}) {
  const organisation = context?.organisation || {}
  const onboarding = context?.agencyOnboarding || context?.onboarding || {}
  const onboardingBranding = onboarding?.branding && typeof onboarding.branding === 'object' ? onboarding.branding : {}
  const settingsJson = organisation?.settingsJson || organisation?.settings_json || {}
  const settingsBranding = settingsJson?.branding && typeof settingsJson.branding === 'object' ? settingsJson.branding : {}
  const agencySettingsBranding =
    settingsJson?.agencyOnboarding?.branding ||
    settingsJson?.agency_onboarding?.branding ||
    {}
  const metadata = input?.metadata && typeof input.metadata === 'object' ? input.metadata : {}

  const organisationLogoUrl = pickFirstText(
    input.organisationLogoUrl,
    input.organisation_logo_url,
    input.logoUrl,
    input.logo_url,
    metadata.organisation_logo_url,
    metadata.organisationLogoUrl,
    organisation.logoUrl,
    organisation.logo_url,
    onboardingBranding.logoLight,
    onboardingBranding.logoLightUrl,
    onboardingBranding.logoDark,
    onboardingBranding.logoDarkUrl,
    settingsBranding.logoLight,
    settingsBranding.logoLightUrl,
    settingsBranding.logoUrl,
    settingsBranding.logo_url,
    settingsBranding.logoDark,
    settingsBranding.logoDarkUrl,
    agencySettingsBranding.logoLight,
    agencySettingsBranding.logoLightUrl,
    agencySettingsBranding.logoUrl,
    agencySettingsBranding.logo_url,
    agencySettingsBranding.logoDark,
    agencySettingsBranding.logoDarkUrl,
  )
  const organisationLogoIconUrl = pickFirstText(
    input.organisationLogoIconUrl,
    input.organisation_logo_icon_url,
    input.logoIconUrl,
    input.logo_icon_url,
    metadata.organisation_logo_icon_url,
    metadata.organisationLogoIconUrl,
    organisation.logoIconUrl,
    organisation.logo_icon_url,
    onboardingBranding.logoIcon,
    onboardingBranding.logoIconUrl,
    settingsBranding.logoIcon,
    settingsBranding.logoIconUrl,
    agencySettingsBranding.logoIcon,
    agencySettingsBranding.logoIconUrl,
  )
  const brandPrimaryColor = pickFirstText(
    input.brandPrimaryColor,
    input.brand_primary_color,
    input.primaryColor,
    input.primary_colour,
    metadata.brand_primary_color,
    metadata.brandPrimaryColor,
    onboardingBranding.primaryColor,
    onboardingBranding.primaryColour,
    settingsBranding.primaryColor,
    settingsBranding.primaryColour,
    agencySettingsBranding.primaryColor,
    agencySettingsBranding.primaryColour,
  )

  return {
    organisationLogoUrl,
    organisationLogoIconUrl,
    brandPrimaryColor,
  }
}

async function resolveWorkspaceDefaults(input = {}) {
  const requestedWorkspaceId = normalizeText(input.workspaceId || input.workspace_id || input.organisationId || input.organisation_id)
  const workspaceId = isLikelyUuid(requestedWorkspaceId) ? requestedWorkspaceId : ''
  const organisationName = normalizeText(input.organisationName || input.organisation_name)
  const inputBranding = resolveInviteBranding(input)
  if (workspaceId && organisationName) {
    return { workspaceId, organisationName, ...inputBranding }
  }

  const context = await fetchOrganisationSettings().catch(() => null)
  const contextBranding = resolveInviteBranding(input, context)
  return {
    workspaceId: workspaceId || normalizeText(context?.organisation?.id),
    organisationName: organisationName || normalizeText(context?.organisation?.displayName || context?.organisation?.name) || 'Bridge Organisation',
    organisationLogoUrl: contextBranding.organisationLogoUrl || inputBranding.organisationLogoUrl,
    organisationLogoIconUrl: contextBranding.organisationLogoIconUrl || inputBranding.organisationLogoIconUrl,
    brandPrimaryColor: contextBranding.brandPrimaryColor || inputBranding.brandPrimaryColor,
  }
}

async function assertWorkspaceUserInviteAuthority({ workspaceId = '', role = '', branchId = '' } = {}) {
  const context = await fetchOrganisationSettings()
  const currentWorkspaceId = normalizeText(context?.organisation?.id)
  if (workspaceId && currentWorkspaceId && workspaceId !== currentWorkspaceId) return
  const workspaceType = normalizeText(context?.organisation?.type || context?.organisation?.workspaceType).toLowerCase()
  if (workspaceType && !['agency', 'residential'].includes(workspaceType)) return

  const actor = {
    role: context?.membershipRole || 'viewer',
    membershipRole: context?.membershipRole || 'viewer',
    branchId: context?.membershipBranchId || context?.membership?.branchId || context?.membership?.branch_id || '',
  }
  const targetRole = normalizeAgencyAuthorityRole(role)
  const actorRole = normalizeAgencyAuthorityRole(actor.role)

  if (targetRole === 'owner') {
    throw new Error('Owner invites are not available from the team invite flow. Use the ownership transfer flow instead.')
  }

  const action = targetRole === 'principal'
    ? AGENCY_AUTHORITY_ACTIONS.invitePrincipal
    : AGENCY_AUTHORITY_ACTIONS.inviteAgent
  assertAgencyAuthority(action, actor, { role, membershipRole: role, branchId }, {
    branchId,
    message: targetRole === 'principal'
      ? 'Only the organisation owner can invite another principal.'
      : 'You do not have authority to invite a user at this level.',
  })

  if (targetRole !== 'principal' && getAgencyAuthorityLevel(actorRole) <= getAgencyAuthorityLevel(targetRole)) {
    throw new Error('You do not have authority to invite a user at this level.')
  }
}

async function getWorkspaceInviteById(inviteId = '', defaults = {}) {
  const safeInviteId = normalizeText(inviteId)
  if (!safeInviteId || !isSupabaseConfigured || !supabase) return null

  const result = await supabase
    .from('invites')
    .select('id, invite_type, status, token, expires_at, target_workspace_id, target_workspace_role, target_branch_id, target_team_id, email, phone, metadata, accepted_at, created_at, updated_at, organisations:target_workspace_id(id, name, display_name, type)')
    .eq('id', safeInviteId)
    .maybeSingle()

  if (result.error) {
    if (isMissingRelationError(result.error, 'invites')) return null
    throw result.error
  }
  if (!result.data?.id) return null
  return normalizeWorkspaceInviteRow(result.data, defaults)
}

async function findActiveWorkspaceUserByEmail({ workspaceId = '', email = '' } = {}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  const safeEmail = normalizeEmail(email)
  if (!safeWorkspaceId || !safeEmail || !isSupabaseConfigured || !supabase) return null

  const result = await supabase
    .from('organisation_users')
    .select('id, user_id, email, role, workspace_role, organisation_role, status, branch_id, primary_branch_id')
    .eq('organisation_id', safeWorkspaceId)
    .eq('status', 'active')
    .ilike('email', safeEmail)
    .limit(1)
    .maybeSingle()

  if (result.error) {
    if (isMissingRelationError(result.error, 'organisation_users')) return null
    throw result.error
  }
  return result.data || null
}

function normalizeWorkspaceInviteRow(row = {}, defaults = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const firstName = normalizeText(metadata.first_name || metadata.firstName)
  const lastName = normalizeText(metadata.last_name || metadata.lastName || metadata.surname)
  const email = normalizeEmail(row.email)
  const status = isExpired(row.expires_at) ? 'expired' : mapInviteStatus(row.status)
  const organisationName = normalizeText(
    defaults.organisationName ||
      row.organisations?.display_name ||
      row.organisations?.name ||
      metadata.organisation_name ||
      metadata.organisationName,
  ) || 'Bridge Organisation'
  const branchName = normalizeText(metadata.branch_name || metadata.branchName)
  const role = normalizeRole(metadata.role || row.target_workspace_role, 'agent')
  const inviteLink = buildAgentInviteLink(row.token)
  const branding = resolveInviteBranding(metadata, { organisation: defaults })

  return {
    id: row.id || '',
    inviteId: row.id || '',
    token: row.token || '',
    inviteToken: row.token || '',
    inviteLink,
    firstName,
    lastName,
    surname: lastName,
    name: [firstName, lastName].filter(Boolean).join(' ') || email || 'Invited user',
    email,
    mobile: normalizeText(row.phone || metadata.mobile),
    phone: normalizeText(row.phone || metadata.mobile),
    organisationId: normalizeText(row.target_workspace_id || defaults.workspaceId),
    organisationName,
    branchId: normalizeText(row.target_branch_id || metadata.branch_id || metadata.branchId),
    branchName,
    office: branchName || organisationName,
    role,
    roleLabel: normalizeText(metadata.role_label || metadata.roleLabel) || formatRoleLabel(role),
    organisationLogoUrl: branding.organisationLogoUrl,
    organisationLogoIconUrl: branding.organisationLogoIconUrl,
    brandPrimaryColor: branding.brandPrimaryColor,
    status,
    inviteStatus: row.status || '',
    invitedAt: row.created_at || null,
    createdAt: row.created_at || null,
    expiresAt: row.expires_at || null,
    activatedAt: row.accepted_at || null,
    lastActiveAt: null,
    commissionStructureId: normalizeText(metadata.commission_structure_id || metadata.commissionStructureId),
    commissionStructureName: normalizeText(metadata.commission_structure_name || metadata.commissionStructureName),
    notes: normalizeText(metadata.notes),
    invitedByName: normalizeText(metadata.invited_by_name || metadata.invitedByName),
    isPendingInvite: status === 'pending_invite',
    isCanonicalInvite: true,
    raw: row,
  }
}

async function sendInviteEmail({ invite, inviteLink }) {
  if (!isSupabaseConfigured) {
    throw new Error('Email sending is unavailable because Supabase is not configured.')
  }

  const response = await invokeEdgeFunction('send-email', {
    body: {
      type: invite.branchId ? 'branch_invite' : 'workspace_invite',
      to: invite.email,
      inviteeName: invite.name || getInviteeName(invite),
      inviterName: invite.invitedByName || '',
      organisationName: invite.organisationName || 'Bridge Organisation',
      workspaceRole: invite.roleLabel || formatRoleLabel(invite.role),
      supportEmail: invite.supportEmail || '',
      organisationLogoUrl: invite.organisationLogoUrl || '',
      organisationLogoIconUrl: invite.organisationLogoIconUrl || '',
      brandPrimaryColor: invite.brandPrimaryColor || '',
      inviteLink,
    },
  })

  const sendError = response?.error || response?.data?.error
  if (sendError) {
    throw new Error(typeof sendError === 'string' ? sendError : sendError?.message || 'Invite was created, but the email could not be sent.')
  }
  return response?.data || null
}

async function sendInviteWhatsApp({ invite, inviteLink }) {
  const recipientPhone = formatSouthAfricanWhatsAppNumber(invite.mobile || invite.phone)
  if (!recipientPhone) return null

  try {
    return await sendWhatsAppNotification({
      to: recipientPhone,
      role: 'agent_invite',
      message: buildInviteMessage({ invite, inviteLink }),
    })
  } catch (error) {
    console.error('[Workspace Invite] WhatsApp send failed', error)
    return null
  }
}

async function deliverWorkspaceInvite({ invite, inviteLink, deliveryPatch = {} } = {}) {
  try {
    const emailResult = await sendInviteEmail({ invite, inviteLink })
    const whatsAppResult = await sendInviteWhatsApp({ invite, inviteLink })
    await rememberInviteDelivery(invite.inviteId || invite.id, {
      ...deliveryPatch,
      last_delivery_status: 'sent',
      last_delivery_error: '',
      last_delivery_channel: whatsAppResult ? 'email_and_whatsapp' : 'email',
    })
    return { emailResult, whatsAppResult }
  } catch (error) {
    await rememberInviteDelivery(invite.inviteId || invite.id, {
      ...deliveryPatch,
      last_delivery_status: 'failed',
      last_delivery_error: error?.message || 'Invite delivery failed.',
      last_delivery_failed_at: new Date().toISOString(),
    })
    throw error
  }
}

async function rememberInviteDelivery(inviteId, patch = {}) {
  if (!inviteId || !isSupabaseConfigured || !supabase) return
  try {
    const current = await supabase
      .from('invites')
      .select('metadata')
      .eq('id', inviteId)
      .maybeSingle()
    if (current.error) return
    const metadata = current.data?.metadata && typeof current.data.metadata === 'object' ? current.data.metadata : {}
    await supabase
      .from('invites')
      .update({
        metadata: {
          ...metadata,
          ...patch,
        },
      })
      .eq('id', inviteId)
  } catch (error) {
    console.warn('[Workspace Invite] delivery metadata update failed', error)
  }
}

export async function listWorkspaceUserInvites(input = {}) {
  if (!isSupabaseConfigured || !supabase) return []

  const defaults = await resolveWorkspaceDefaults(input)
  const { workspaceId } = defaults
  if (!workspaceId) return []

  const branchId = normalizeText(input.branchId || input.branch_id)
  let query = supabase
    .from('invites')
    .select('id, invite_type, status, token, expires_at, target_workspace_id, target_workspace_role, target_branch_id, target_team_id, email, phone, metadata, accepted_at, created_at, updated_at, organisations:target_workspace_id(id, name, display_name, type)')
    .eq('target_workspace_id', workspaceId)
    .in('invite_type', ['workspace_invite', 'branch_invite', 'team_invite'])
    .order('created_at', { ascending: false })

  if (input.status) query = query.eq('status', input.status)
  if (branchId) query = query.eq('target_branch_id', branchId)

  const result = await query
  if (result.error) {
    const code = String(result.error.code || '').toUpperCase()
    const message = String(result.error.message || '').toLowerCase()
    if (code === '42P01' || message.includes('invites')) return []
    throw result.error
  }

  const rows = (result.data || []).map((row) => normalizeWorkspaceInviteRow(row, defaults))
  if (input.includeInactive === true) return rows
  return rows.filter((row) => row.status === 'pending_invite')
}

export async function resendWorkspaceUserInvite(input = {}) {
  const invite = input.raw ? normalizeWorkspaceInviteRow(input.raw, input) : {
    ...input,
    token: input.token || input.inviteToken,
    roleLabel: input.roleLabel || formatRoleLabel(input.role),
  }
  const email = normalizeEmail(invite.email)
  if (!email) throw new Error('Invite email is required before resending.')
  if (!invite.token) throw new Error('Invite token is missing.')

  const inviteLink = buildAgentInviteLink(invite.token)
  const delivery = await deliverWorkspaceInvite({
    invite: {
      ...invite,
      email,
      organisationName: normalizeText(input.organisationName || invite.organisationName) || 'Bridge Organisation',
    },
    inviteLink,
    deliveryPatch: {
      last_resent_at: new Date().toISOString(),
    },
  })

  return {
    invite,
    inviteLink,
    emailResult: delivery.emailResult,
    whatsAppResult: delivery.whatsAppResult,
  }
}

export async function revokeWorkspaceUserInvite(input = {}) {
  const inviteId = normalizeText(input.inviteId || input.id)
  if (!inviteId) throw new Error('Invite id is required before revoking.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Invite revocation is unavailable because Supabase is not configured.')

  const result = await supabase
    .from('invites')
    .update({
      status: INVITE_STATUSES.revoked,
      revoked_at: new Date().toISOString(),
    })
    .eq('id', inviteId)
    .eq('status', INVITE_STATUSES.pending)
    .select('id, invite_type, status, token, expires_at, target_workspace_id, target_workspace_role, target_branch_id, target_team_id, email, phone, metadata, accepted_at, created_at, updated_at, organisations:target_workspace_id(id, name, display_name, type)')
    .maybeSingle()

  if (result.error) throw result.error
  if (!result.data?.id) throw new Error('Invite is no longer pending or could not be found.')
  return normalizeWorkspaceInviteRow(result.data, input)
}

export async function createWorkspaceUserInvite(input = {}) {
  const email = normalizeEmail(input.email)
  if (!email) throw new Error('Invite email is required.')

  const {
    workspaceId,
    organisationName,
    organisationLogoUrl,
    organisationLogoIconUrl,
    brandPrimaryColor,
  } = await resolveWorkspaceDefaults(input)
  if (!workspaceId) throw new Error('A workspace is required before creating an invite.')

  const branchId = normalizeText(input.branchId || input.branch_id)
  const role = normalizeRole(input.role || input.workspaceRole || input.workspace_role || input.organisationRole || input.organisation_role, 'agent')
  const roleLabel = normalizeText(input.roleLabel || input.role_label) || formatRoleLabel(role)
  const firstName = getFirstName(input)
  const lastName = getLastName(input)
  const mobile = normalizeText(input.mobile || input.phone)
  const commissionStructureId = normalizeText(input.commissionStructureId || input.commission_structure_id)
  const commissionStructureName = normalizeText(input.commissionStructureName || input.commission_structure_name)
  const activeMembership = await findActiveWorkspaceUserByEmail({ workspaceId, email })
  if (activeMembership?.id) {
    const assignedBranchId = normalizeText(activeMembership.primary_branch_id || activeMembership.branch_id)
    const sameBranch = !branchId || !assignedBranchId || assignedBranchId === branchId
    const branchHint = sameBranch
      ? 'Manage their role or branch assignment from the user directory instead.'
      : 'Use the branch transfer or branch assignment flow instead of sending another invite.'
    throw new Error(`This email already belongs to an active user in this workspace. ${branchHint}`)
  }

  await assertWorkspaceUserInviteAuthority({ workspaceId, role, branchId })

  let inviteResult
  try {
    inviteResult = await createInvite({
      invite_type: branchId ? 'branch_invite' : 'workspace_invite',
      expires_at: input.expiresAt || input.expires_at || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      target_workspace_id: workspaceId,
      target_workspace_role: role,
      target_branch_id: branchId || null,
      target_team_id: input.teamId || input.team_id || null,
      email,
      phone: mobile,
      metadata: {
        source: normalizeText(input.source) || 'workspace_user_invite',
        first_name: firstName,
        last_name: lastName,
        mobile,
        branch_name: normalizeText(input.branchName || input.branch_name),
        role,
        role_label: roleLabel,
        organisation_name: organisationName,
        organisation_logo_url: organisationLogoUrl,
        organisation_logo_icon_url: organisationLogoIconUrl,
        brand_primary_color: brandPrimaryColor,
        commission_structure_id: commissionStructureId,
        commission_structure_name: commissionStructureName,
        notes: normalizeText(input.notes),
        invited_by_name: normalizeText(input.invitedByName || input.invited_by_name),
        ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
      },
    })
  } catch (error) {
    const duplicateInviteId = error instanceof InviteValidationError && error.code === 'duplicate_pending_invite'
      ? normalizeText(error.details?.invite_id)
      : ''
    if (duplicateInviteId) {
      const existingInvite = await getWorkspaceInviteById(duplicateInviteId, {
        workspaceId,
        organisationName,
        organisationLogoUrl,
        organisationLogoIconUrl,
        brandPrimaryColor,
      })
      if (existingInvite?.id) {
        const resent = await resendWorkspaceUserInvite({
          ...existingInvite,
          firstName: existingInvite.firstName || firstName,
          lastName: existingInvite.lastName || lastName,
          mobile: existingInvite.mobile || mobile,
          organisationName,
          organisationLogoUrl: existingInvite.organisationLogoUrl || organisationLogoUrl,
          organisationLogoIconUrl: existingInvite.organisationLogoIconUrl || organisationLogoIconUrl,
          brandPrimaryColor: existingInvite.brandPrimaryColor || brandPrimaryColor,
        })
        return {
          ...resent,
          onboardingUrl: resent.inviteLink,
          raw: { invite_id: existingInvite.id, token: existingInvite.token, duplicate: true },
          duplicate: true,
          reusedExistingInvite: true,
        }
      }
    }
    throw new Error(resolveInviteError(error))
  }

  const invite = {
    id: inviteResult.invite_id,
    token: inviteResult.token,
    firstName,
    lastName,
    surname: lastName,
    name: [firstName, lastName].filter(Boolean).join(' ') || email,
    email,
    mobile,
    phone: mobile,
    organisationId: workspaceId,
    organisationName,
    organisationLogoUrl,
    organisationLogoIconUrl,
    brandPrimaryColor,
    branchId,
    branchName: normalizeText(input.branchName || input.branch_name),
    role,
    roleLabel,
    commissionStructureId,
    commissionStructureName,
    invitedByName: normalizeText(input.invitedByName || input.invited_by_name),
  }
  const inviteLink = buildAgentInviteLink(invite.token)

  if (commissionStructureId) {
    await assignOrganisationUserCommissionProfile({
      email,
      commissionStructureId,
    })
  }

  const sentAt = new Date().toISOString()
  const delivery = await deliverWorkspaceInvite({
    invite,
    inviteLink,
    deliveryPatch: {
      first_sent_at: sentAt,
      last_sent_at: sentAt,
    },
  })

  return {
    invite,
    inviteLink,
    onboardingUrl: inviteLink,
    emailResult: delivery.emailResult,
    whatsAppResult: delivery.whatsAppResult,
    raw: inviteResult,
  }
}

export async function createPrincipalClaimInvite(input = {}) {
  const email = normalizeEmail(input.email)
  if (!email) throw new Error('Principal email is required.')

  const {
    workspaceId,
    organisationName,
    organisationLogoUrl,
    organisationLogoIconUrl,
    brandPrimaryColor,
  } = await resolveWorkspaceDefaults(input)
  if (!workspaceId) throw new Error('A workspace is required before creating a principal claim invite.')

  const firstName = getFirstName(input)
  const lastName = getLastName(input)
  const mobile = normalizeText(input.mobile || input.phone)
  const activeMembership = await findActiveWorkspaceUserByEmail({ workspaceId, email })
  if (activeMembership?.id) {
    throw new Error('This email already belongs to an active user in this workspace. Manage their role from the user directory instead.')
  }

  let inviteResult
  try {
    inviteResult = await createPrincipalClaimInviteRpc({
      invite_type: INVITE_TYPES.principalClaim,
      expires_at: input.expiresAt || input.expires_at || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      target_workspace_id: workspaceId,
      target_workspace_role: 'principal',
      email,
      phone: mobile,
      metadata: {
        source: normalizeText(input.source) || 'principal_claim_invite',
        claim_type: 'residential_principal_claim',
        requested_role: 'principal',
        first_name: firstName,
        last_name: lastName,
        mobile,
        role: 'principal_claim',
        role_label: 'Principal Claim',
        organisation_name: organisationName,
        organisation_logo_url: organisationLogoUrl,
        organisation_logo_icon_url: organisationLogoIconUrl,
        brand_primary_color: brandPrimaryColor,
        notes: normalizeText(input.notes),
        invited_by_name: normalizeText(input.invitedByName || input.invited_by_name),
        ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
      },
    })
  } catch (error) {
    const duplicateInviteId = error instanceof InviteValidationError && error.code === 'duplicate_pending_invite'
      ? normalizeText(error.details?.invite_id)
      : ''
    if (duplicateInviteId) {
      const existingInvite = await getWorkspaceInviteById(duplicateInviteId, {
        workspaceId,
        organisationName,
        organisationLogoUrl,
        organisationLogoIconUrl,
        brandPrimaryColor,
      })
      if (existingInvite?.id) {
        const resent = await resendWorkspaceUserInvite({
          ...existingInvite,
          firstName: existingInvite.firstName || firstName,
          lastName: existingInvite.lastName || lastName,
          mobile: existingInvite.mobile || mobile,
          organisationName,
          organisationLogoUrl: existingInvite.organisationLogoUrl || organisationLogoUrl,
          organisationLogoIconUrl: existingInvite.organisationLogoIconUrl || organisationLogoIconUrl,
          brandPrimaryColor: existingInvite.brandPrimaryColor || brandPrimaryColor,
          role: 'principal_claim',
          roleLabel: 'Principal Claim',
        })
        return {
          ...resent,
          onboardingUrl: resent.inviteLink,
          raw: { invite_id: existingInvite.id, token: existingInvite.token, duplicate: true },
          duplicate: true,
          reusedExistingInvite: true,
        }
      }
    }
    throw new Error(resolveInviteError(error))
  }

  const invite = {
    id: inviteResult.invite_id,
    inviteId: inviteResult.invite_id,
    inviteType: INVITE_TYPES.principalClaim,
    token: inviteResult.token,
    firstName,
    lastName,
    surname: lastName,
    name: [firstName, lastName].filter(Boolean).join(' ') || email,
    email,
    mobile,
    phone: mobile,
    organisationId: workspaceId,
    organisationName,
    organisationLogoUrl,
    organisationLogoIconUrl,
    brandPrimaryColor,
    role: 'principal_claim',
    roleLabel: 'Principal Claim',
    invitedByName: normalizeText(input.invitedByName || input.invited_by_name),
  }
  const inviteLink = buildAgentInviteLink(invite.token)
  const sentAt = new Date().toISOString()
  const delivery = await deliverWorkspaceInvite({
    invite,
    inviteLink,
    deliveryPatch: {
      first_sent_at: sentAt,
      last_sent_at: sentAt,
    },
  })

  return {
    invite,
    inviteLink,
    onboardingUrl: inviteLink,
    emailResult: delivery.emailResult,
    whatsAppResult: delivery.whatsAppResult,
    raw: inviteResult,
  }
}
