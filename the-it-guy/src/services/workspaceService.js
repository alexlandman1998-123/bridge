import { APP_ROLES, normalizeCanonicalAppRole } from '../constants/appRoles'
import { MEMBERSHIP_STATUSES, normalizeMembershipStatus } from '../constants/membershipStatuses'
import { ONBOARDING_EVENT_TYPES, ONBOARDING_STATUSES, ONBOARDING_STEPS } from '../constants/onboardingStatuses'
import { normalizeOrgRole, ORG_ROLES } from '../constants/orgRoles'
import { SIGNUP_WORKSPACE_ACTIONS } from '../constants/signupIntents'
import { WORKSPACE_TYPES, inferWorkspaceTypeFromAppRole, normalizeWorkspaceType } from '../constants/workspaceTypes'
import { normalizeSignupIntent } from '../lib/signupIntent'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { assertPermission } from '../auth/permissions/permissionResolver'
import { PERMISSIONS } from '../auth/permissions/permissionRegistry'
import { createAttorneyFirm } from './attorneyFirms'
import { recordSecurityAuditEvent } from './auditLogService'
import { completeOnboarding } from './onboarding/onboardingEngine'
import { recordOnboardingEvent, upsertOnboardingState } from './onboarding/onboardingPersistence'

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required for workspace setup.')
  }
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'main'
}

function isMissingSchemaError(error, token = '') {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

function splitFullName(name = '') {
  const parts = normalizeText(name).split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function mapOwnerRole(intent) {
  const workspaceType = normalizeWorkspaceType(intent?.workspace_type, inferWorkspaceTypeFromAppRole(intent?.app_role))
  const intended = normalizeOrgRole(intent?.intended_org_role, { appRole: intent?.app_role, workspaceType })
  if (workspaceType === WORKSPACE_TYPES.agency) return intended === ORG_ROLES.owner ? ORG_ROLES.owner : ORG_ROLES.principal
  if (workspaceType === WORKSPACE_TYPES.developerCompany) return [ORG_ROLES.director, ORG_ROLES.owner].includes(intended) ? intended : ORG_ROLES.owner
  if (workspaceType === WORKSPACE_TYPES.bondOriginator) return [ORG_ROLES.manager, ORG_ROLES.owner].includes(intended) ? intended : ORG_ROLES.owner
  return intended || ORG_ROLES.owner
}

function buildOrganisationSettings({ intent, workspace, form }) {
  return {
    workspaceType: intent.workspace_type,
    onboardingPath: intent.onboarding_path,
    workspaceAction: intent.workspace_action,
    profile: {
      legalName: normalizeText(form.legalName),
      registrationNumber: normalizeText(form.registrationNumber),
      province: normalizeText(form.province),
      operatingArea: normalizeText(form.operatingArea),
    },
    workspace: {
      id: workspace?.id || '',
      name: workspace?.name || normalizeText(form.name),
      createdFrom: 'phase_3_workspace_engine',
    },
    setup: {
      completedAt: new Date().toISOString(),
      defaultStructureCreated: true,
    },
  }
}

function buildOrganisationPayload({ intent, user, form }) {
  const workspaceType = normalizeWorkspaceType(intent.workspace_type)
  const name = normalizeText(form.name || form.companyName || form.agencyName || form.firmName || form.businessName)
  const legalName = normalizeText(form.legalName || name)
  if (!name) throw new Error('Workspace name is required.')

  return {
    name,
    display_name: name,
    type: workspaceType,
    legal_name: legalName || null,
    registration_number: normalizeText(form.registrationNumber) || null,
    company_email: normalizeEmail(form.businessEmail || form.email || user.email) || null,
    company_phone: normalizeText(form.contactNumber || form.phone) || null,
    support_email: normalizeEmail(form.businessEmail || form.email || user.email) || null,
    support_phone: normalizeText(form.contactNumber || form.phone) || null,
    province: normalizeText(form.province) || null,
    city: normalizeText(form.city || form.operatingArea) || null,
    country: 'South Africa',
    primary_contact_person: normalizeText(form.primaryContactName || user.user_metadata?.full_name || user.email) || null,
    status: 'active',
    created_by: user.id,
    settings_json: {
      workspaceType,
      source: 'phase_3_workspace_engine',
    },
  }
}

async function upsertOrganisationSettings(client, { organisationId, settings }) {
  const result = await client
    .from('organisation_settings')
    .upsert(
      {
        organisation_id: organisationId,
        settings_json: settings,
      },
      { onConflict: 'organisation_id' },
    )

  if (result.error) {
    throw result.error
  }
}

async function assertCurrentUserCanInvite(client, workspaceId, actor) {
  const membership = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, role, status, app_role, workspace_type, organisations:organisation_id(id, type)')
    .eq('organisation_id', workspaceId)
    .eq('user_id', actor.id)
    .eq('status', MEMBERSHIP_STATUSES.active)
    .maybeSingle()

  if (membership.error) throw membership.error
  const row = membership.data
  assertPermission(PERMISSIONS.inviteUsers, {
    appRole: row?.app_role || actor.user_metadata?.app_role || actor.user_metadata?.role,
    organisationRole: row?.role,
    currentMembership: {
      id: row?.id,
      role: row?.role,
      status: row?.status,
      workspaceType: row?.workspace_type || row?.organisations?.type,
      workspaceId,
      workspace: { id: workspaceId, type: row?.workspace_type || row?.organisations?.type },
    },
    currentWorkspace: { id: workspaceId, type: row?.workspace_type || row?.organisations?.type },
    workspaceType: row?.workspace_type || row?.organisations?.type,
  })
}

export async function createDefaultBranchOrTeam(workspace, { user = null, form = {}, intent = null } = {}) {
  const client = requireClient()
  const workspaceId = normalizeText(workspace?.id || workspace?.workspaceId)
  const workspaceType = normalizeWorkspaceType(workspace?.type || intent?.workspace_type)
  if (!workspaceId) throw new Error('Workspace id is required before creating default structure.')

  const defaultName =
    normalizeText(form.mainBranchName) ||
    normalizeText(form.defaultTeamName) ||
    (workspaceType === WORKSPACE_TYPES.agency ? 'Main Branch' : workspaceType === WORKSPACE_TYPES.bondOriginator ? 'Main Team' : 'Head Office')
  const slug = slugify(defaultName)

  const existing = await client
    .from('organisation_branches')
    .select('id, organisation_id, name, slug, is_head_office, is_active')
    .eq('organisation_id', workspaceId)
    .eq('slug', slug)
    .maybeSingle()

  if (existing.error && !isMissingSchemaError(existing.error, 'organisation_branches')) {
    throw existing.error
  }
  if (existing.data?.id) return existing.data

  const result = await client
    .from('organisation_branches')
    .insert({
      organisation_id: workspaceId,
      name: defaultName,
      slug,
      province: normalizeText(form.province) || null,
      city: normalizeText(form.city || form.operatingArea) || null,
      location: normalizeText(form.location || form.province || form.operatingArea) || null,
      principal_user_id: user?.id || null,
      phone: normalizeText(form.contactNumber || form.phone) || null,
      email: normalizeEmail(form.businessEmail || form.email || user?.email) || null,
      is_head_office: true,
      is_active: true,
      metadata_json: {
        workspaceType,
        defaultStructure: true,
        source: 'phase_3_workspace_engine',
      },
    })
    .select('id, organisation_id, name, slug, is_head_office, is_active')
    .single()

  if (result.error) {
    throw result.error
  }
  return result.data
}

export async function createMembership(user, workspace, role, options = {}) {
  const client = requireClient()
  const workspaceId = normalizeText(workspace?.id || workspace?.workspaceId)
  if (!user?.id || !workspaceId) throw new Error('User and workspace are required before creating membership.')

  const appRole = normalizeCanonicalAppRole(options.appRole || options.app_role || user.user_metadata?.app_role || user.user_metadata?.role, '')
  const workspaceType = normalizeWorkspaceType(options.workspaceType || options.workspace_type || workspace.type, inferWorkspaceTypeFromAppRole(appRole))
  const organisationRole = normalizeOrgRole(role, { appRole, workspaceType })
  const nameParts = splitFullName(options.fullName || user.user_metadata?.full_name || '')
  const email = normalizeEmail(options.email || user.email)

  const result = await client
    .from('organisation_users')
    .upsert(
      {
        organisation_id: workspaceId,
        user_id: user.id,
        branch_id: options.branchId || options.branch_id || null,
        first_name: normalizeText(options.firstName || nameParts.firstName) || null,
        last_name: normalizeText(options.lastName || nameParts.lastName) || null,
        email,
        role: organisationRole,
        organisation_role: organisationRole,
        app_role: appRole || null,
        workspace_type: workspaceType || null,
        status: normalizeMembershipStatus(options.status || MEMBERSHIP_STATUSES.active),
        invited_by_user_id: options.invitedBy || options.invited_by || null,
        created_by: options.createdBy || options.created_by || null,
        invited_at: options.invitedAt || new Date().toISOString(),
        accepted_at: options.acceptedAt || new Date().toISOString(),
        joined_at: options.joinedAt || new Date().toISOString(),
      },
      { onConflict: 'organisation_id,email' },
    )
    .select('id, organisation_id, user_id, branch_id, email, role, organisation_role, app_role, workspace_type, status, created_at, updated_at')
    .single()

  if (result.error) {
    throw result.error
  }
  return result.data
}

async function updateCreatorMembershipBranch(client, membershipId, branchId) {
  if (!membershipId || !branchId) return
  const result = await client
    .from('organisation_users')
    .update({ branch_id: branchId })
    .eq('id', membershipId)

  if (result.error) {
    throw result.error
  }
}

async function createOrganisationWorkspaceFromIntent(intent, user, form = {}) {
  const client = requireClient()
  const organisationPayload = buildOrganisationPayload({ intent, user, form })
  const orgResult = await client
    .from('organisations')
    .insert(organisationPayload)
    .select('id, name, display_name, type, legal_name, registration_number, company_email, company_phone, province, city, status, created_by')
    .single()

  if (orgResult.error) {
    if (isMissingSchemaError(orgResult.error, 'type')) {
      throw new Error('Workspace schema is missing organisation type fields. Apply the Phase 3 workspace migration before setup.')
    }
    throw orgResult.error
  }

  const workspace = {
    id: orgResult.data.id,
    name: orgResult.data.display_name || orgResult.data.name,
    type: orgResult.data.type || intent.workspace_type,
    raw: orgResult.data,
  }
  const ownerRole = mapOwnerRole(intent)
  const membership = await createMembership(user, workspace, ownerRole, {
    appRole: intent.app_role,
    workspaceType: intent.workspace_type,
    status: MEMBERSHIP_STATUSES.active,
    fullName: form.primaryContactName,
    email: user.email,
    createdBy: user.id,
    invitedBy: user.id,
  })

  const shouldCreateDefaultStructure =
    intent.workspace_type === WORKSPACE_TYPES.agency ||
    intent.workspace_type === WORKSPACE_TYPES.bondOriginator ||
    intent.workspace_type === WORKSPACE_TYPES.developerCompany
  const defaultStructure = shouldCreateDefaultStructure
    ? await createDefaultBranchOrTeam(workspace, { user, form, intent })
    : null

  if (defaultStructure?.id) {
    await updateCreatorMembershipBranch(client, membership.id, defaultStructure.id)
  }

  await upsertOrganisationSettings(client, {
    organisationId: workspace.id,
    settings: buildOrganisationSettings({ intent, workspace, form }),
  })

  return {
    workspace,
    membership: defaultStructure?.id ? { ...membership, branch_id: defaultStructure.id } : membership,
    defaultStructure,
  }
}

async function createAttorneyWorkspaceFromIntent(intent, user, form = {}) {
  const firm = await createAttorneyFirm({
    name: normalizeText(form.name || form.firmName || form.legalName),
    registrationNumber: normalizeText(form.registrationNumber),
    email: normalizeEmail(form.businessEmail || form.email || user.email),
    phone: normalizeText(form.contactNumber || form.phone),
    province: normalizeText(form.province),
    city: normalizeText(form.city),
    skipOnboardingCompletion: true,
  })

  return {
    workspace: {
      id: firm.id,
      name: firm.name,
      type: WORKSPACE_TYPES.attorneyFirm,
      raw: firm,
    },
    membership: {
      workspaceId: firm.id,
      role: ORG_ROLES.owner,
      status: MEMBERSHIP_STATUSES.active,
      source: 'attorney_firm_members',
    },
    defaultStructure: null,
  }
}

export async function validateWorkspaceCompletion(userId, options = {}) {
  const client = requireClient()
  const appRole = normalizeCanonicalAppRole(options.appRole || options.app_role, '')
  const workspaceType = normalizeWorkspaceType(options.workspaceType || options.workspace_type, inferWorkspaceTypeFromAppRole(appRole))
  const workspaceId = normalizeText(options.workspaceId || options.workspace_id)
  if (!userId) return { ok: false, reason: 'missing_user' }

  if (workspaceType === WORKSPACE_TYPES.attorneyFirm || appRole === APP_ROLES.attorney) {
    const memberQuery = await client
      .from('attorney_firm_members')
      .select('id, firm_id, role, status')
      .eq('user_id', userId)
      .eq('status', MEMBERSHIP_STATUSES.active)
      .limit(1)
      .maybeSingle()

    if (memberQuery.error) return { ok: false, reason: 'attorney_membership_lookup_failed', error: memberQuery.error }
    if (!memberQuery.data?.id) return { ok: false, reason: 'no_active_attorney_membership' }
    return { ok: true, reason: '', membership: memberQuery.data, workspaceId: memberQuery.data.firm_id }
  }

  const membershipQuery = await client
    .from('organisation_users')
    .select('id, organisation_id, branch_id, role, status, organisations:organisation_id(id, type)')
    .eq('user_id', userId)
    .eq('status', MEMBERSHIP_STATUSES.active)
    .limit(10)

  if (membershipQuery.error) return { ok: false, reason: 'membership_lookup_failed', error: membershipQuery.error }
  const activeMemberships = (membershipQuery.data || []).filter((row) => {
    if (!workspaceId && !workspaceType) return true
    const matchesWorkspace = workspaceId ? row.organisation_id === workspaceId : true
    const matchesType = workspaceType ? (row.organisations?.type || workspaceType) === workspaceType : true
    return matchesWorkspace && matchesType
  })

  if (!activeMemberships.length) return { ok: false, reason: 'no_active_membership' }
  const membership = activeMemberships[0]
  if (workspaceType === WORKSPACE_TYPES.agency && !membership.branch_id) {
    const branchQuery = await client
      .from('organisation_branches')
      .select('id')
      .eq('organisation_id', membership.organisation_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (branchQuery.error) return { ok: false, reason: 'branch_lookup_failed', error: branchQuery.error }
    if (!branchQuery.data?.id) return { ok: false, reason: 'missing_default_branch' }
  }

  return { ok: true, reason: '', membership, workspaceId: membership.organisation_id }
}

export async function createWorkspaceFromIntent(intentInput, user, form = {}) {
  const intent = normalizeSignupIntent(intentInput)
  if (!intent) throw new Error('Workspace setup requires a valid signup intent.')
  if (!user?.id) throw new Error('You must be signed in before creating a workspace.')
  if (intent.workspace_action !== SIGNUP_WORKSPACE_ACTIONS.createWorkspace) {
    throw new Error('This signup path cannot create a workspace. Use invite acceptance or request access.')
  }

  const result =
    intent.workspace_type === WORKSPACE_TYPES.attorneyFirm
      ? await createAttorneyWorkspaceFromIntent(intent, user, form)
      : await createOrganisationWorkspaceFromIntent(intent, user, form)

  const validation = await validateWorkspaceCompletion(user.id, {
    appRole: intent.app_role,
    workspaceType: intent.workspace_type,
    workspaceId: result.workspace.id,
  })
  if (!validation.ok) {
    throw new Error(`Workspace setup is incomplete: ${validation.reason}.`)
  }

  const completion = await completeOnboarding({
    userId: user.id,
    user,
    intent,
    appRole: intent.app_role,
    workspaceType: intent.workspace_type,
    workspaceId: result.workspace.id,
    profilePatch: {
      first_name: form.firstName || undefined,
      last_name: form.lastName || undefined,
      company_name: result.workspace.name,
      phone_number: form.contactNumber || form.phone || undefined,
    },
    context: { source: 'workspace_create' },
  })
  void recordSecurityAuditEvent({
    userId: user.id,
    workspaceId: result.workspace.id,
    action: 'workspace_created',
    targetType: 'workspace',
    targetId: result.workspace.id,
    metadata: { workspaceType: intent.workspace_type, organisationRole: result.membership?.role },
  })
  void recordOnboardingEvent({
    userId: user.id,
    workspaceId: result.workspace.id,
    eventType: ONBOARDING_EVENT_TYPES.workspaceCreated,
    onboardingStep: ONBOARDING_STEPS.createOrJoinWorkspace,
    metadata: { workspaceType: intent.workspace_type, organisationRole: result.membership?.role },
  })

  return {
    ...result,
    validation: completion.validation || validation,
  }
}

export async function loadWorkspace(workspaceId) {
  const client = requireClient()
  const id = normalizeText(workspaceId)
  if (!id) return null
  const result = await client
    .from('organisations')
    .select('id, name, display_name, type, legal_name, registration_number, company_email, company_phone, province, city, status, created_by')
    .eq('id', id)
    .maybeSingle()

  if (result.error) throw result.error
  return result.data || null
}

export async function loadUserMemberships(userId) {
  const client = requireClient()
  if (!userId) return []
  const result = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, email, role, organisation_role, app_role, workspace_type, status, created_at, updated_at, organisations:organisation_id(id, name, display_name, type)')
    .eq('user_id', userId)

  if (result.error) throw result.error
  return result.data || []
}

export async function getWorkspaceInviteByToken(token) {
  const client = requireClient()
  const safeToken = normalizeText(token)
  if (!safeToken) return { ok: false, reason: 'not_found', invite: null }

  const result = await client
    .from('workspace_invites')
    .select('id, workspace_id, workspace_type, invited_email, app_role, organisation_role, branch_id, department_id, team_id, token, status, expires_at, invited_by, accepted_by, accepted_at, created_at, organisations:workspace_id(id, name, display_name, type)')
    .eq('token', safeToken)
    .maybeSingle()

  if (result.error) {
    if (isMissingSchemaError(result.error, 'workspace_invites')) {
      return { ok: false, reason: 'invite_schema_missing', invite: null }
    }
    throw result.error
  }
  const invite = result.data
  if (!invite) return { ok: false, reason: 'not_found', invite: null }
  if (invite.status === 'revoked') return { ok: false, reason: 'revoked', invite }
  if (invite.status === 'accepted') return { ok: false, reason: 'already_accepted', invite }
  const expiresAt = invite.expires_at ? new Date(invite.expires_at).getTime() : null
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return { ok: false, reason: 'expired', invite }
  return { ok: true, reason: '', invite }
}

export async function createWorkspaceInvite(input = {}, actor = null) {
  const client = requireClient()
  const workspaceId = normalizeText(input.workspaceId || input.workspace_id)
  const invitedEmail = normalizeEmail(input.invitedEmail || input.invited_email)
  const appRole = normalizeCanonicalAppRole(input.appRole || input.app_role, '')
  const workspaceType = normalizeWorkspaceType(input.workspaceType || input.workspace_type, inferWorkspaceTypeFromAppRole(appRole))
  const organisationRole = normalizeOrgRole(input.organisationRole || input.organisation_role, { appRole, workspaceType })
  if (!workspaceId) throw new Error('Workspace is required before creating an invite.')
  if (!invitedEmail) throw new Error('Invite email is required.')
  if (!appRole || !workspaceType || !organisationRole) throw new Error('Invite role context is incomplete.')

  let inviter = actor
  if (!inviter?.id) {
    const authUser = await client.auth.getUser()
    inviter = authUser.data?.user || null
  }
  if (!inviter?.id) throw new Error('You must be signed in before creating an invite.')
  await assertCurrentUserCanInvite(client, workspaceId, inviter)

  const expiresInDays = Number(input.expiresInDays || input.expires_in_days || 14)
  const expiresAt = new Date(Date.now() + (Number.isFinite(expiresInDays) ? expiresInDays : 14) * 24 * 60 * 60 * 1000).toISOString()

  const result = await client
    .from('workspace_invites')
    .insert({
      workspace_id: workspaceId,
      workspace_type: workspaceType,
      invited_email: invitedEmail,
      app_role: appRole,
      organisation_role: organisationRole,
      branch_id: input.branchId || input.branch_id || null,
      department_id: input.departmentId || input.department_id || null,
      team_id: input.teamId || input.team_id || null,
      status: 'pending',
      expires_at: input.expiresAt || input.expires_at || expiresAt,
      invited_by: inviter.id,
    })
    .select('id, workspace_id, workspace_type, invited_email, app_role, organisation_role, branch_id, department_id, team_id, token, status, expires_at, invited_by, created_at')
    .single()

  if (result.error) {
    if (isMissingSchemaError(result.error, 'workspace_invites')) {
      throw new Error('Workspace invites are not configured yet. Apply the Phase 3 workspace migration.')
    }
    throw result.error
  }
  void recordSecurityAuditEvent({
    userId: inviter.id,
    workspaceId,
    action: 'invite_sent',
    targetType: 'workspace_invite',
    targetId: result.data?.id,
    metadata: { invitedEmail, appRole, organisationRole },
  })
  return result.data
}

export async function joinWorkspaceFromInvite(inviteToken, user, options = {}) {
  const client = requireClient()
  if (!user?.id) throw new Error('Sign in before accepting an invite.')
  const context = await getWorkspaceInviteByToken(inviteToken)
  if (!context.ok || !context.invite) {
    if (context.reason === 'expired') throw new Error('This invite link has expired.')
    if (context.reason === 'revoked') throw new Error('This invite link has been revoked.')
    if (context.reason === 'already_accepted') throw new Error('This invite has already been accepted.')
    throw new Error('Invalid invite link.')
  }

  const invite = context.invite
  const userEmail = normalizeEmail(user.email)
  const invitedEmail = normalizeEmail(invite.invited_email)
  if (invitedEmail && userEmail !== invitedEmail) {
    throw new Error(`Sign in as ${invite.invited_email} to accept this invite.`)
  }

  const membership = await createMembership(user, { id: invite.workspace_id, type: invite.workspace_type }, invite.organisation_role, {
    appRole: invite.app_role,
    workspaceType: invite.workspace_type,
    branchId: invite.branch_id,
    status: MEMBERSHIP_STATUSES.active,
    invitedBy: invite.invited_by,
  })

  const updateInvite = await client
    .from('workspace_invites')
    .update({
      status: 'accepted',
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq('id', invite.id)

  if (updateInvite.error) throw updateInvite.error

  await completeOnboarding({
    userId: user.id,
    user,
    intent: options.intent || null,
    appRole: invite.app_role,
    workspaceType: invite.workspace_type,
    workspaceId: invite.workspace_id,
    context: { source: 'workspace_invite_acceptance', inviteId: invite.id },
  })
  void recordSecurityAuditEvent({
    userId: user.id,
    workspaceId: invite.workspace_id,
    action: 'invite_accepted',
    targetType: 'workspace_invite',
    targetId: invite.id,
    metadata: { appRole: invite.app_role, organisationRole: invite.organisation_role },
  })
  void recordOnboardingEvent({
    userId: user.id,
    workspaceId: invite.workspace_id,
    eventType: ONBOARDING_EVENT_TYPES.inviteAccepted,
    onboardingStep: ONBOARDING_STEPS.createOrJoinWorkspace,
    metadata: { appRole: invite.app_role, organisationRole: invite.organisation_role },
  })

  return {
    invite,
    membership,
  }
}

export async function requestWorkspaceAccess(intentInput, user, payload = {}) {
  const client = requireClient()
  const intent = normalizeSignupIntent(intentInput)
  if (!intent) throw new Error('A valid signup intent is required before requesting workspace access.')
  if (!user?.id) throw new Error('Sign in before requesting workspace access.')
  if (intent.workspace_action !== SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace) {
    throw new Error('This signup path is not an access-request path.')
  }

  const result = await client
    .from('workspace_access_requests')
    .insert({
      requester_user_id: user.id,
      requester_email: normalizeEmail(user.email),
      app_role: intent.app_role,
      workspace_type: intent.workspace_type,
      requested_workspace_id: normalizeText(payload.workspaceId) || null,
      requested_workspace_name: normalizeText(payload.workspaceName) || null,
      intended_org_role: intent.intended_org_role,
      status: 'pending',
      message: normalizeText(payload.message) || null,
    })
    .select('id, requester_user_id, requester_email, app_role, workspace_type, requested_workspace_id, requested_workspace_name, intended_org_role, status, message, created_at, updated_at')
    .single()

  if (result.error) {
    if (isMissingSchemaError(result.error, 'workspace_access_requests')) {
      throw new Error('Workspace access requests are not configured yet. Apply the Phase 3 workspace migration.')
    }
    throw result.error
  }

  await upsertOnboardingState({
    userId: user.id,
    intent,
    patch: {
      onboardingStatus: ONBOARDING_STATUSES.workspacePendingApproval,
      onboardingStep: ONBOARDING_STEPS.createOrJoinWorkspace,
    },
    context: { source: 'workspace_access_request', accessRequestId: result.data?.id },
  })

  void recordSecurityAuditEvent({
    userId: user.id,
    workspaceId: result.data?.requested_workspace_id || null,
    action: 'workspace_access_requested',
    targetType: 'workspace_access_request',
    targetId: result.data?.id,
    metadata: { workspaceType: intent.workspace_type, intendedOrgRole: intent.intended_org_role },
  })
  void recordOnboardingEvent({
    userId: user.id,
    workspaceId: result.data?.requested_workspace_id || null,
    eventType: ONBOARDING_EVENT_TYPES.accessRequested,
    onboardingStep: ONBOARDING_STEPS.createOrJoinWorkspace,
    metadata: { workspaceType: intent.workspace_type, intendedOrgRole: intent.intended_org_role },
  })

  return result.data
}

export async function getWorkspaceSetupStatus(userId, options = {}) {
  const validation = await validateWorkspaceCompletion(userId, options)
  if (validation.ok) return { status: 'complete', validation }
  if (validation.reason === 'no_active_membership') return { status: 'pending_membership', validation }
  if (validation.reason === 'missing_default_branch') return { status: 'repair_required', validation }
  return { status: 'setup_required', validation }
}

export async function repairWorkspaceSetup(userId, options = {}) {
  const status = await getWorkspaceSetupStatus(userId, options)
  if (status.status === 'complete') return status
  throw new Error(`Workspace repair requires an explicit admin action: ${status.validation.reason}.`)
}
