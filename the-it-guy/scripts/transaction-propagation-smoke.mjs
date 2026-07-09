#!/usr/bin/env node
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const RUN_STARTED_AT = new Date().toISOString()
const RUN_ID = `tx-prop-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function cleanEnvValue(value = '') {
  return String(value || '').replace(/^["']|["']$/g, '')
}

function loadEnv() {
  const localEnv = parseEnvFile('.env')
  const stagingEnv = parseEnvFile('.env.staging.local')
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value)))
  const merged = Object.fromEntries(
    Object.entries({ ...localEnv, ...stagingEnv, ...processOverrides }).map(([key, value]) => [key, cleanEnvValue(value)]),
  )
  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY

  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] == null) process.env[key] = value
  }
  return merged
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function requireConfig(env) {
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)
  const anonKey = normalizeText(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY)
  const actorEmail = normalizeEmail(env.STAGING_INTERNAL_EMAIL)
  const actorPassword = normalizeText(env.STAGING_INTERNAL_PASSWORD)
  const projectRef = projectRefFromUrl(supabaseUrl)

  if (!supabaseUrl || !serviceRoleKey || !anonKey || !actorEmail || !actorPassword) {
    throw new Error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY, STAGING_INTERNAL_EMAIL, or STAGING_INTERNAL_PASSWORD.')
  }
  if (projectRef !== STAGING_PROJECT_REF) {
    throw new Error(`Refusing to run outside staging project ${STAGING_PROJECT_REF}; resolved ${projectRef || 'unknown'}.`)
  }
  return { supabaseUrl, serviceRoleKey, anonKey, actorEmail, actorPassword }
}

function createServiceClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

async function getOpenApiColumns(config) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  })
  if (!response.ok) throw new Error(`Unable to read Supabase OpenAPI schema: HTTP ${response.status}`)
  const spec = await response.json()
  const cache = new Map()
  return (table) => {
    if (cache.has(table)) return cache.get(table)
    const properties = spec?.components?.schemas?.[table]?.properties || spec?.definitions?.[table]?.properties || null
    const columns = properties ? new Set(Object.keys(properties)) : new Set()
    cache.set(table, columns)
    return columns
  }
}

function pickColumns(columns, payload) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => columns.has(key)))
}

async function queryRequired(label, query) {
  const { data, error } = await query
  if (error) {
    const wrapped = new Error(`${label}: ${error.message}`)
    wrapped.code = error.code
    wrapped.details = error.details
    wrapped.hint = error.hint
    throw wrapped
  }
  return data
}

async function maybeQuery(label, query) {
  const { data, error } = await query
  if (error) return { data: [], error: `${label}: ${error.message}` }
  return { data: data || [], error: null }
}

async function getAuthUserId(service, email) {
  const authUser = await findAuthUser(service, email).catch(() => null)
  if (authUser?.id) return authUser.id
  const profiles = await queryRequired(
    `profile lookup ${email}`,
    service.from('profiles').select('id,email,updated_at,created_at').eq('email', email).order('updated_at', { ascending: false }).limit(1),
  )
  return profiles?.[0]?.id || null
}

async function findAuthUser(service, email) {
  let page = 1
  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = (data?.users || []).find((user) => normalizeEmail(user.email) === email)
    if (found?.id) return found
    if ((data?.users || []).length < 200) break
    page += 1
  }
  return null
}

async function ensureAuthUserForEmail(service, { email, password }) {
  const existing = await findAuthUser(service, email).catch(() => null)
  if (existing?.id) {
    await ensureProfileForUser(service, { userId: existing.id, email })
    return existing.id
  }
  if (!password) throw new Error(`No password available to create staging auth user for ${email}.`)
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { source: 'transaction_propagation_smoke' },
  })
  if (!error) {
    const userId = data?.user?.id || null
    if (userId) await ensureProfileForUser(service, { userId, email })
    return userId
  }

  if (String(error.message || '').toLowerCase().includes('already been registered')) {
    const login = await service.auth.signInWithPassword({ email, password })
    if (!login.error && login.data?.user?.id) {
      await service.auth.signOut().catch(() => {})
      await ensureProfileForUser(service, { userId: login.data.user.id, email })
      return login.data.user.id
    }
  }

  throw error
}

async function ensureProfileForUser(service, { userId, email }) {
  const existing = await service.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (!existing.error && existing.data?.id) return
  const payload = {
    id: userId,
    email,
    full_name: email,
    role: 'bond_originator',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  let insert = await service.from('profiles').insert(payload).select('id').maybeSingle()
  if (insert.error && String(insert.error.message || '').includes('created_at')) {
    const fallback = { ...payload }
    delete fallback.created_at
    delete fallback.updated_at
    insert = await service.from('profiles').insert(fallback).select('id').maybeSingle()
  }
  if (insert.error && !['23505'].includes(insert.error.code)) {
    throw new Error(`Could not create profile for ${email}: ${insert.error.message}`)
  }
}

async function resolveActorContext(service, actorEmail) {
  const actorUserId = await getAuthUserId(service, actorEmail)
  if (!actorUserId) throw new Error(`Could not resolve actor user for ${actorEmail}.`)

  const profile = await queryRequired(
    'actor profile',
    service.from('profiles').select('*').eq('id', actorUserId).maybeSingle(),
  )
  const memberships = await queryRequired(
    'actor memberships',
    service.from('organisation_users').select('*').or(`user_id.eq.${actorUserId},email.eq.${actorEmail}`).limit(20),
  )
  const membership =
    memberships.find((row) => ['active', 'accepted'].includes(normalizeText(row.status).toLowerCase())) ||
    memberships[0] ||
    null
  if (!membership?.organisation_id) {
    throw new Error(`Could not resolve an organisation membership for ${actorEmail}.`)
  }
  return {
    userId: actorUserId,
    email: actorEmail,
    profile,
    organisationId: membership.organisation_id,
    branchId: membership.branch_id || membership.primary_branch_id || null,
    workspaceUnitId: membership.workspace_unit_id || null,
    role: profile?.role || membership.role || 'agent',
  }
}

async function resolveTransferAttorney(service, actor) {
  const memberRows = await queryRequired(
    'attorney firm member lookup',
    service.from('attorney_firm_members').select('*').eq('user_id', actor.userId).limit(10),
  )
  const member = memberRows.find((row) => ['active', 'accepted'].includes(normalizeText(row.status).toLowerCase())) || memberRows[0]
  let firm = null
  if (member?.firm_id) {
    firm = await queryRequired(
      'attorney firm lookup',
      service.from('attorney_firms').select('*').eq('id', member.firm_id).maybeSingle(),
    )
  }

  if (!firm) {
    const fallbackFirms = await queryRequired(
      'attorney firm fallback lookup',
      service.from('attorney_firms').select('*').limit(1),
    )
    firm = fallbackFirms[0] || null
  }
  if (!firm?.id) throw new Error('Could not resolve a transfer attorney firm.')

  const firmOrganisationId = firm.organisation_id || firm.backing_organisation_id || actor.organisationId
  return {
    firmId: firm.id,
    roleType: 'transfer_attorney',
    source: 'connected_partner',
    partnerOrganisationId: firmOrganisationId,
    userId: member?.user_id || actor.userId,
    workspaceUnitId: member?.workspace_unit_id || null,
    branchId: member?.branch_id || null,
    partner: {
      companyName: firm.name || firm.display_name || 'Smoke Transfer Attorneys',
      contactPerson: actor.profile?.full_name || actor.email,
      email: actor.email,
      phone: firm.phone || null,
    },
  }
}

async function resolveBondOriginator(service, env) {
  const email = normalizeEmail(env.BOND_RUNTIME_CONSULTANT_EMAIL || env.BOND_RUNTIME_AUTH_EMAIL)
  if (!email) throw new Error('Missing BOND_RUNTIME_CONSULTANT_EMAIL/BOND_RUNTIME_AUTH_EMAIL.')

  const memberships = await queryRequired(
    'bond originator memberships',
    service.from('organisation_users').select('*').eq('email', email).limit(20),
  )
  const membership =
    memberships.find((row) => ['active', 'accepted'].includes(normalizeText(row.status).toLowerCase())) ||
    memberships[0] ||
    null
  if (!membership?.organisation_id) throw new Error(`Could not resolve bond originator organisation for ${email}.`)
  let userId = membership.user_id || (await ensureAuthUserForEmail(service, {
    email,
    password: normalizeText(env.BOND_RUNTIME_AUTH_PASSWORD),
  }))
  if (!userId) throw new Error(`Could not resolve bond originator user for ${email}.`)
  if (!membership.user_id) {
    const { error } = await service.from('organisation_users').update({ user_id: userId }).eq('id', membership.id)
    if (error) throw new Error(`Could not link bond originator membership to auth user: ${error.message}`)
    membership.user_id = userId
  }

  const organisation = await queryRequired(
    'bond originator organisation',
    service.from('organisations').select('*').eq('id', membership.organisation_id).maybeSingle(),
  )
  return {
    roleType: 'bond_originator',
    source: 'connected_partner',
    partnerOrganisationId: membership.organisation_id,
    userId,
    workspaceUnitId: membership.workspace_unit_id || null,
    branchId: membership.branch_id || membership.primary_branch_id || null,
    partner: {
      companyName: organisation?.name || organisation?.display_name || 'Smoke Bond Originator',
      contactPerson: membership.first_name || email,
      email,
    },
  }
}

async function findPartnerRelationship(service, sourceOrganisationId, targetOrganisationId) {
  const outgoing = await queryRequired(
    'partner relationship outgoing lookup',
    service
      .from('organisation_partners')
      .select('*')
      .eq('organisation_id', sourceOrganisationId)
      .eq('partner_organisation_id', targetOrganisationId)
      .limit(1),
  )
  if (outgoing[0]?.id) return outgoing[0]

  const incoming = await queryRequired(
    'partner relationship incoming lookup',
    service
      .from('organisation_partners')
      .select('*')
      .eq('organisation_id', targetOrganisationId)
      .eq('partner_organisation_id', sourceOrganisationId)
      .limit(1),
  )
  return incoming[0] || null
}

async function ensurePartnerRelationship(service, columnsFor, { actor, bondOriginator }) {
  const sourceOrganisationId = actor.organisationId
  const targetOrganisationId = bondOriginator.partnerOrganisationId
  const now = new Date().toISOString()
  const existing = await findPartnerRelationship(service, sourceOrganisationId, targetOrganisationId)
  const payload = {
    organisation_id: sourceOrganisationId,
    partner_organisation_id: targetOrganisationId,
    relationship_status: 'accepted',
    status: 'accepted',
    relationship_type: 'preferred',
    partner_type: 'bond_originator',
    visibility_level: 'preferred_partners',
    preferred: true,
    notes: 'Staging transaction propagation smoke partner routing fixture.',
    accepted_by: actor.userId,
    accepted_at: now,
    updated_at: now,
  }

  if (existing?.id) {
    const updatePayload = pickColumns(columnsFor('organisation_partners'), payload)
    const { data, error } = await service
      .from('organisation_partners')
      .update(updatePayload)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(`partner relationship update failed: ${error.message}`)
    return data || existing
  }

  const insertPayload = pickColumns(columnsFor('organisation_partners'), {
    id: crypto.randomUUID(),
    ...payload,
    created_by: actor.userId,
    created_at: now,
  })
  const { data, error } = await service
    .from('organisation_partners')
    .insert(insertPayload)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`partner relationship insert failed: ${error.message}`)
  return data
}

async function ensurePartnerVisibilityPermissions(service, columnsFor, { relationshipId, actor }) {
  const permissions = ['can_view_principal', 'can_view_branch_managers', 'can_view_agents']
  const rows = []
  for (const permissionKey of permissions) {
    const existing = await queryRequired(
      `partner visibility permission lookup ${permissionKey}`,
      service
        .from('partner_visibility_permissions')
        .select('*')
        .eq('relationship_id', relationshipId)
        .eq('permission_key', permissionKey)
        .limit(1),
    )
    const payload = {
      relationship_id: relationshipId,
      permission_key: permissionKey,
      is_enabled: true,
      granted_by: actor.userId,
      granted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (existing[0]?.id) {
      const { data, error } = await service
        .from('partner_visibility_permissions')
        .update(pickColumns(columnsFor('partner_visibility_permissions'), payload))
        .eq('id', existing[0].id)
        .select('*')
        .maybeSingle()
      if (error) throw new Error(`partner visibility permission update failed: ${error.message}`)
      rows.push(data || existing[0])
      continue
    }

    const { data, error } = await service
      .from('partner_visibility_permissions')
      .insert(pickColumns(columnsFor('partner_visibility_permissions'), {
        id: crypto.randomUUID(),
        ...payload,
        created_at: new Date().toISOString(),
      }))
      .select('*')
      .maybeSingle()
    if (error) throw new Error(`partner visibility permission insert failed: ${error.message}`)
    rows.push(data)
  }
  return rows
}

async function ensurePartnerRoutingRule(service, columnsFor, { actor, bondOriginator, relationshipId }) {
  const existingRows = await queryRequired(
    'partner routing rule lookup',
    service
      .from('partner_routing_rules')
      .select('*')
      .eq('source_organisation_id', actor.organisationId)
      .eq('target_organisation_id', bondOriginator.partnerOrganisationId)
      .eq('target_role_type', 'bond_originator')
      .eq('source_scope', 'organisation')
      .eq('target_scope', 'consultant')
      .limit(20),
  )
  const existing =
    existingRows.find((row) => normalizeText(row.target_user_id) === normalizeText(bondOriginator.userId)) ||
    existingRows[0] ||
    null
  const payload = {
    source_organisation_id: actor.organisationId,
    target_organisation_id: bondOriginator.partnerOrganisationId,
    relationship_id: relationshipId,
    rule_name: 'Staging smoke direct bond originator',
    is_active: true,
    is_default: true,
    assignment_priority: 10,
    source_scope: 'organisation',
    source_context_id: null,
    source_user_id: null,
    source_scope_name: actor.profile?.company_name || actor.email || 'Smoke source organisation',
    target_scope: 'consultant',
    target_role_type: 'bond_originator',
    target_region_id: null,
    target_workspace_unit_id: null,
    target_user_id: bondOriginator.userId,
    assignment_mode: 'direct_consultant',
    target_scope_name: bondOriginator.partner.contactPerson || bondOriginator.partner.email,
    notes: 'Used by transaction propagation smoke to verify partner routing resolves without manual fallback.',
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { data, error } = await service
      .from('partner_routing_rules')
      .update(pickColumns(columnsFor('partner_routing_rules'), payload))
      .eq('id', existing.id)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(`partner routing rule update failed: ${error.message}`)
    return data || existing
  }

  const { data, error } = await service
    .from('partner_routing_rules')
    .insert(pickColumns(columnsFor('partner_routing_rules'), {
      id: crypto.randomUUID(),
      ...payload,
      created_at: new Date().toISOString(),
    }))
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`partner routing rule insert failed: ${error.message}`)
  return data
}

async function ensurePartnerRoutingFixture({ service, columnsFor, actor, bondOriginator }) {
  const relationship = await ensurePartnerRelationship(service, columnsFor, { actor, bondOriginator })
  const permissions = await ensurePartnerVisibilityPermissions(service, columnsFor, {
    relationshipId: relationship.id,
    actor,
  })
  const routingRule = await ensurePartnerRoutingRule(service, columnsFor, {
    actor,
    bondOriginator,
    relationshipId: relationship.id,
  })
  return {
    relationshipId: relationship.id,
    routingRuleId: routingRule.id,
    targetOrganisationId: bondOriginator.partnerOrganisationId,
    targetUserId: bondOriginator.userId,
    permissions: permissions.map((row) => ({
      permissionKey: row.permission_key,
      isEnabled: row.is_enabled,
    })),
  }
}

async function createTransactionWithApp({ supabase, createTransactionFromWizard, actor, transferAttorney, bondOriginator, deal }) {
  const rolePlayers = [transferAttorney]

  const buyerToken = crypto.randomUUID().slice(0, 8)
  let result
  try {
    result = await createTransactionFromWizard({
    setup: {
      transactionType: 'private_property',
      propertyType: 'residential',
      propertyAddressLine1: `${RUN_ID} ${deal.label} Smoke Street`,
      suburb: 'Staging',
      city: 'Johannesburg',
      province: 'Gauteng',
      buyerName: `${deal.label} Buyer ${buyerToken}`,
      buyerEmail: `${RUN_ID}-${deal.key}-${buyerToken}@example.test`,
      buyerPhone: '+27000000000',
      sellerName: `${deal.label} Seller`,
      financeType: deal.financeType,
      financeManagedBy: deal.financeType === 'cash' ? 'cash' : 'bond_originator',
      assignedAgent: actor.profile?.full_name || actor.email,
      assignedAgentEmail: actor.email,
      assignedBranchId: actor.branchId,
      accessLevel: 'shared',
      purchasePrice: deal.purchasePrice,
    },
    finance: {
      attorney: transferAttorney.partner.companyName,
      attorneyEmail: transferAttorney.partner.email,
      bondOriginator: bondOriginator?.partner?.companyName || '',
      bondOriginatorEmail: bondOriginator?.partner?.email || '',
      cashAmount: deal.financeType === 'cash' ? deal.purchasePrice : null,
      bondAmount: deal.financeType === 'cash' ? null : Math.round(deal.purchasePrice * 0.8),
      depositAmount: deal.financeType === 'cash' ? null : Math.round(deal.purchasePrice * 0.1),
      nextAction: 'Smoke test roleplayer propagation.',
    },
    status: {
      stage: 'Reserved',
      mainStage: 'OTP',
      riskStatus: 'On Track',
      nextAction: 'Smoke test roleplayer propagation.',
    },
      options: {
        allowIncomplete: false,
        creationOrigin: `smoke:${deal.key}`,
        disableAutoPartnerRouting: !bondOriginator,
        partnerRoleTypes: bondOriginator ? ['bond_originator'] : undefined,
        sourceContext: {
          originLabel: 'transaction_propagation_smoke',
        organisationId: actor.organisationId,
        branchId: actor.branchId,
        workspaceId: actor.organisationId,
      },
      rolePlayers,
    },
    })
  } catch (error) {
    const wrapped = new Error(`app create ${deal.key}: ${error.message}`)
    wrapped.code = error.code
    wrapped.details = error.details
    wrapped.hint = error.hint
    wrapped.stack = error.stack
    throw wrapped
  }

  const transactionId = result?.transactionId || result?.transaction?.id || result?.id
  if (!transactionId) throw new Error(`No transaction id returned for ${deal.label}.`)
  await supabase.auth.getSession()
  return { transactionId, result }
}

async function signInAppUser({ supabase, service, actor, email, password }) {
  let signIn = await supabase.auth.signInWithPassword({ email, password })
  if (!signIn.error) return signIn

  const message = String(signIn.error.message || '').toLowerCase()
  if (!message.includes('invalid login credentials')) throw signIn.error

  const authUserId = actor.userId || (await ensureAuthUserForEmail(service, { email, password }))
  const update = await service.auth.admin.updateUserById(authUserId, {
    password,
    email_confirm: true,
  })
  if (update.error) throw update.error

  signIn = await supabase.auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error
  return signIn
}

async function rerunIdempotency({ saveTransactionRoleplayerSelections, transactionId, transferAttorney, bondOriginator, actorRole }) {
  return saveTransactionRoleplayerSelections({
    transactionId,
    actorRole,
    roleplayers: [transferAttorney, bondOriginator].filter(Boolean).map((selection) => ({
      roleType: selection.roleType,
      organisationId: selection.partnerOrganisationId,
      userId: selection.userId,
      workspaceUnitId: selection.workspaceUnitId,
      branchId: selection.branchId,
      partner: {
        companyName: selection.partner.companyName,
        contactPerson: selection.partner.contactPerson,
        email: selection.partner.email,
        phone: selection.partner.phone,
      },
    })),
  })
}

async function verifyTransaction({ service, columnsFor, txId, expectedRoles, expectBondApplication }) {
  const transaction = await queryRequired(
    `transaction ${txId}`,
    service.from('transactions').select('*').eq('id', txId).maybeSingle(),
  )
  const rolePlayers = await queryRequired(
    `roleplayers ${txId}`,
    service.from('transaction_role_players').select('*').eq('transaction_id', txId),
  )
  const participants = await queryRequired(
    `participants ${txId}`,
    service.from('transaction_participants').select('*').eq('transaction_id', txId),
  )
  const attorneyAssignments = await queryRequired(
    `attorney assignments ${txId}`,
    service.from('transaction_attorney_assignments').select('*').eq('transaction_id', txId),
  )
  const bondApplications = await queryRequired(
    `bond applications ${txId}`,
    service.from('transaction_bond_applications').select('*').eq('transaction_id', txId),
  )
  const events = await queryRequired(
    `events ${txId}`,
    service.from('transaction_events').select('*').eq('transaction_id', txId).order('created_at', { ascending: true }),
  )
  const activeRolePlayers = rolePlayers.filter((row) => !row.removed_at && row.assignment_status !== 'removed')
  const activeAttorneyAssignments = attorneyAssignments.filter((row) => row.assignment_status !== 'removed' && row.status !== 'removed')
  const roleCounts = Object.fromEntries(expectedRoles.map((role) => [role, activeRolePlayers.filter((row) => row.role_type === role).length]))
  const duplicateRolePlayers = Object.entries(roleCounts).filter(([, count]) => count > 1)
  const transferAssignments = activeAttorneyAssignments.filter((row) => (row.attorney_role || row.assignment_type) === 'transfer_attorney' || row.assignment_type === 'transfer')
  const originatorApplications = bondApplications.filter((row) => (row.application_type || 'originator_intake') === 'originator_intake')

  const requiredEventSignals = [
    { key: 'transaction_created', test: (row) => row.event_type === 'transaction_created' },
    { key: 'transfer_attorney_assigned', test: (row) => row.event_type === 'transfer_attorney_assigned' },
    { key: 'attorney_assignment_created', test: (row) => row.event_type === 'attorney_assignment_created' },
    { key: 'roleplayer_visibility_granted', test: (row) => row.event_type === 'roleplayer_visibility_granted' },
  ]
  if (expectedRoles.includes('bond_originator')) {
    requiredEventSignals.push(
      { key: 'bond_originator_assigned', test: (row) => row.event_type === 'bond_originator_assigned' },
      { key: 'bond_application_created', test: (row) => row.event_type === 'bond_application_created' },
    )
  }

  const missingEventSignals = requiredEventSignals
    .filter((signal) => !events.some(signal.test))
    .map((signal) => signal.key)

  const scopeColumns = ['organisation_id', 'workspace_unit_id', 'branch_id', 'user_id', 'assigned_organisation_id', 'assigned_workspace_unit_id', 'assigned_branch_id', 'assigned_region_id', 'assigned_team_id', 'assigned_user_id', 'scope_level', 'scope_metadata']
  const missingRoleplayerScopeColumns = scopeColumns.filter((column) => !columnsFor('transaction_role_players').has(column))
  const missingParticipantScopeColumns = ['assigned_organisation_id', 'assigned_workspace_unit_id', 'assigned_branch_id', 'assigned_region_id', 'assigned_team_id', 'assigned_user_id', 'scope_level', 'scope_metadata'].filter(
    (column) => !columnsFor('transaction_participants').has(column),
  )
  const missingAssignmentScopeColumns = ['assigned_organisation_id', 'assigned_workspace_unit_id', 'assigned_branch_id', 'assigned_region_id', 'assigned_team_id', 'assigned_user_id', 'scope_level', 'scope_metadata'].filter(
    (column) => !columnsFor('transaction_attorney_assignments').has(column),
  )
  const missingBondScopeColumns = ['assigned_organisation_id', 'assigned_workspace_unit_id', 'assigned_branch_id', 'assigned_region_id', 'assigned_team_id', 'assigned_user_id', 'scope_level', 'scope_metadata'].filter(
    (column) => !columnsFor('transaction_bond_applications').has(column),
  )

  const errors = []
  if (!transaction?.id) errors.push('Transaction row missing.')
  for (const role of expectedRoles) {
    if (roleCounts[role] !== 1) errors.push(`Expected one active ${role} roleplayer, found ${roleCounts[role] || 0}.`)
  }
  if (duplicateRolePlayers.length) errors.push(`Duplicate active roleplayer rows: ${duplicateRolePlayers.map(([role, count]) => `${role}:${count}`).join(', ')}.`)
  if (transferAssignments.length !== 1) errors.push(`Expected one active transfer attorney assignment, found ${transferAssignments.length}.`)
  if (expectBondApplication && originatorApplications.length !== 1) errors.push(`Expected one bond originator application, found ${originatorApplications.length}.`)
  if (!expectBondApplication && bondApplications.length !== 0) errors.push(`Expected no bond application, found ${bondApplications.length}.`)
  if (missingEventSignals.length) errors.push(`Missing event signals: ${missingEventSignals.join(', ')}.`)
  if (missingRoleplayerScopeColumns.length) errors.push(`Missing transaction_role_players scope columns: ${missingRoleplayerScopeColumns.join(', ')}.`)
  if (missingParticipantScopeColumns.length) errors.push(`Missing transaction_participants scope columns: ${missingParticipantScopeColumns.join(', ')}.`)
  if (missingAssignmentScopeColumns.length) errors.push(`Missing transaction_attorney_assignments scope columns: ${missingAssignmentScopeColumns.join(', ')}.`)
  if (missingBondScopeColumns.length) errors.push(`Missing transaction_bond_applications scope columns: ${missingBondScopeColumns.join(', ')}.`)

  return {
    transactionId: txId,
    financeType: transaction?.finance_type || null,
    records: {
      transactions: transaction?.id ? 1 : 0,
      transaction_role_players: rolePlayers.length,
      transaction_participants: participants.length,
      transaction_attorney_assignments: attorneyAssignments.length,
      transaction_bond_applications: bondApplications.length,
      transaction_events: events.length,
    },
    activeRoleplayerStatuses: activeRolePlayers.map((row) => ({
      role_type: row.role_type,
      status: row.status,
      assignment_status: row.assignment_status,
      organisation_id: row.organisation_id || null,
      workspace_unit_id: row.workspace_unit_id || null,
      branch_id: row.branch_id || null,
      user_id: row.user_id || null,
    })),
    participants: participants.map((row) => ({ role_type: row.role_type, status: row.status, user_id: row.user_id || null })),
    attorneyAssignments: attorneyAssignments.map((row) => ({
      id: row.id,
      attorney_role: row.attorney_role || null,
      assignment_type: row.assignment_type || null,
      assignment_status: row.assignment_status || row.status || null,
      attorney_user_id: row.attorney_user_id || row.primary_attorney_id || null,
      assigned_organisation_id: row.assigned_organisation_id || null,
      assigned_workspace_unit_id: row.assigned_workspace_unit_id || null,
      assigned_branch_id: row.assigned_branch_id || null,
      assigned_region_id: row.assigned_region_id || null,
      assigned_team_id: row.assigned_team_id || null,
      assigned_user_id: row.assigned_user_id || null,
      scope_level: row.scope_level || null,
    })),
    bondApplications: bondApplications.map((row) => ({
      id: row.id,
      workflow_id: row.workflow_id || null,
      application_type: row.application_type || null,
      status: row.status || null,
      buyer_party_id: row.buyer_party_id || null,
      assigned_organisation_id: row.assigned_organisation_id || null,
      assigned_workspace_unit_id: row.assigned_workspace_unit_id || null,
      assigned_branch_id: row.assigned_branch_id || null,
      assigned_region_id: row.assigned_region_id || null,
      assigned_team_id: row.assigned_team_id || null,
      assigned_user_id: row.assigned_user_id || null,
      scope_level: row.scope_level || null,
      canonicalStatus: row.metadata?.canonicalStatus || null,
    })),
    eventTypes: events.map((row) => ({
      event_type: row.event_type,
      metadataKeys: Object.keys(row.event_data || {}),
      created_by: row.created_by || null,
      created_by_role: row.created_by_role || null,
      created_at: row.created_at || null,
    })),
    schemaWarnings: {
      missingRoleplayerScopeColumns,
      missingParticipantScopeColumns,
      missingAssignmentScopeColumns,
      missingBondScopeColumns,
    },
    pass: errors.length === 0,
    errors,
  }
}

function auditRowMatchesTransaction(row, transactionId) {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  return (
    normalizeText(metadata.transactionId) === transactionId ||
    normalizeText(metadata.transaction_id) === transactionId ||
    normalizeText(row?.target_id).includes(transactionId)
  )
}

async function verifySecurityAuditPersistence({ service, txIds }) {
  const { data, error } = await service
    .from('security_audit_events')
    .select('id,user_id,workspace_id,action,target_type,target_id,metadata,created_at')
    .eq('action', 'assignment.created')
    .gte('created_at', RUN_STARTED_AT)
    .order('created_at', { ascending: false })
    .limit(250)

  if (error) {
    return {
      pass: false,
      error: error.message,
      code: error.code || null,
      rowsFound: 0,
      byTransaction: txIds.map((transactionId) => ({ transactionId, persisted: false, rowCount: 0 })),
    }
  }

  const rows = data || []
  const byTransaction = txIds.map((transactionId) => {
    const matches = rows.filter((row) => auditRowMatchesTransaction(row, transactionId))
    return {
      transactionId,
      persisted: matches.length > 0,
      rowCount: matches.length,
      sample: matches.slice(0, 3).map((row) => ({
        id: row.id,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        userId: row.user_id,
        workspaceId: row.workspace_id,
      })),
    }
  })

  return {
    pass: byTransaction.every((row) => row.persisted),
    rowsFound: rows.length,
    byTransaction,
  }
}

function verifyWorkflowReadinessSchema({ columnsFor }) {
  const expected = [
    { table: 'transaction_checklist_items', column: 'due_date' },
    { table: 'transaction_checklist_items', column: 'auto_rule_key' },
    { table: 'transactions', column: 'seller_onboarding_status' },
    { table: 'documents', column: 'document_name' },
    { table: 'transaction_required_documents', column: 'requirement_key' },
    { table: 'transaction_rollups', column: 'is_stale' },
    { table: 'transaction_rollups', column: 'last_error' },
    { table: 'transaction_rollups', column: 'last_recompute_attempt_at' },
  ]
  const missing = expected
    .filter(({ table, column }) => !columnsFor(table).has(column))
    .map(({ table, column }) => `${table}.${column}`)

  return {
    pass: missing.length === 0,
    expected: expected.map(({ table, column }) => `${table}.${column}`),
    missing,
  }
}

function verifyPartnerRouting({ events = [], expectedRoutedDeals = 0, bondOriginator }) {
  const bondRoutingEvents = (events || [])
    .filter((event) => normalizeText(event.targetRoleType) === 'bond_originator')
    .map((event) => ({
      createdAt: event.createdAt || null,
      targetRoleType: event.targetRoleType || '',
      targetOrganisationId: event.targetOrganisationId || '',
      targetUserId: event.targetUserId || '',
      routingRuleId: event.routingRuleId || '',
      assignmentMode: event.assignmentMode || '',
      resolutionScope: event.resolutionScope || '',
      fallbackUsed: Boolean(event.fallbackUsed),
      resolutionReason: event.resolutionReason || '',
    }))
  const fallbackEvents = bondRoutingEvents.filter((event) => event.fallbackUsed)
  const wrongTargetEvents = bondRoutingEvents.filter(
    (event) =>
      normalizeText(event.targetOrganisationId) !== normalizeText(bondOriginator.partnerOrganisationId) ||
      normalizeText(event.targetUserId) !== normalizeText(bondOriginator.userId),
  )
  const missingRuleEvents = bondRoutingEvents.filter((event) => !normalizeText(event.routingRuleId))
  const errors = []
  if (bondRoutingEvents.length < expectedRoutedDeals) {
    errors.push(`Expected at least ${expectedRoutedDeals} bond originator routing events, found ${bondRoutingEvents.length}.`)
  }
  if (fallbackEvents.length) {
    errors.push(`Bond originator routing used fallback ${fallbackEvents.length} time(s).`)
  }
  if (missingRuleEvents.length) {
    errors.push(`Bond originator routing resolved without a routing rule ${missingRuleEvents.length} time(s).`)
  }
  if (wrongTargetEvents.length) {
    errors.push(`Bond originator routing resolved to an unexpected target ${wrongTargetEvents.length} time(s).`)
  }

  return {
    pass: errors.length === 0,
    expectedRoutedDeals,
    totalEvents: events.length,
    bondOriginatorEvents: bondRoutingEvents,
    fallbackCount: fallbackEvents.length,
    missingRuleCount: missingRuleEvents.length,
    wrongTargetCount: wrongTargetEvents.length,
    errors,
  }
}

async function verifyRls({ service, config, env, txIds, actorEmail, bondOriginatorEmail }) {
  const result = {
    agentCanSeeTransactions: null,
    bondOriginatorCanSeeApplications: null,
    bondOriginatorCanSeeAssignedApplication: null,
    unrelatedBondOriginatorBlocked: null,
    unrelatedBondOriginatorTransactionBlocked: null,
    notes: [],
  }

  const signIn = async (email, password) => {
    const client = createClient(config.supabaseUrl, config.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    const { error } = await client.auth.signInWithPassword({ email, password })
    if (error) throw error
    return client
  }

  try {
    const actorClient = await signIn(actorEmail, env.STAGING_INTERNAL_PASSWORD)
    const { data, error } = await actorClient.from('transactions').select('id').in('id', txIds)
    result.agentCanSeeTransactions = !error && new Set((data || []).map((row) => row.id)).size === txIds.length
    if (error) result.notes.push(`actor transaction select: ${error.message}`)
  } catch (error) {
    result.notes.push(`actor RLS check skipped: ${error.message}`)
  }

  try {
    const bondPassword = normalizeText(env.BOND_RUNTIME_AUTH_PASSWORD)
    if (!bondPassword) throw new Error('BOND_RUNTIME_AUTH_PASSWORD unavailable.')
    const originatorClient = await signIn(bondOriginatorEmail, bondPassword)
    const { data, error } = await originatorClient.from('transaction_bond_applications').select('transaction_id').in('transaction_id', txIds)
    const visible = new Set((data || []).map((row) => row.transaction_id))
    result.bondOriginatorCanSeeApplications = !error && txIds.some((id) => visible.has(id))
    result.bondOriginatorCanSeeAssignedApplication = !error && visible.size >= 1
    if (error) result.notes.push(`originator application select: ${error.message}`)
  } catch (error) {
    result.notes.push(`bond originator RLS check skipped: ${error.message}`)
  }

  try {
    const unrelatedEmail = normalizeEmail(env.BOND_RUNTIME_UNRELATED_EMAIL)
    const bondPassword = normalizeText(env.BOND_RUNTIME_AUTH_PASSWORD)
    if (!unrelatedEmail || !bondPassword) throw new Error('unrelated bond runtime credentials unavailable.')
    await ensureAuthUserForEmail(service, { email: unrelatedEmail, password: bondPassword })
    const unrelatedClient = await signIn(unrelatedEmail, bondPassword)
    const { data, error } = await unrelatedClient.from('transaction_bond_applications').select('transaction_id').in('transaction_id', txIds)
    result.unrelatedBondOriginatorBlocked = !error && (data || []).length === 0
    if (error) result.notes.push(`unrelated application select: ${error.message}`)
    const txSelect = await unrelatedClient.from('transactions').select('id').in('id', txIds)
    result.unrelatedBondOriginatorTransactionBlocked = !txSelect.error && (txSelect.data || []).length === 0
    if (txSelect.error) result.notes.push(`unrelated transaction select: ${txSelect.error.message}`)
  } catch (error) {
    result.notes.push(`unrelated RLS check skipped: ${error.message}`)
  }

  return result
}

async function insertFiltered(service, columnsFor, table, payload, select = '*') {
  const filtered = pickColumns(columnsFor(table), payload)
  const { data, error } = await service.from(table).insert(filtered).select(select).single()
  if (error) throw new Error(`${table} insert failed: ${error.message}`)
  return data
}

async function updateFilteredById(service, columnsFor, table, id, payload, select = '*') {
  const filtered = pickColumns(columnsFor(table), payload)
  const { data, error } = await service.from(table).update(filtered).eq('id', id).select(select).single()
  if (error) throw new Error(`${table} update failed: ${error.message}`)
  return data
}

async function logDirectEvent(service, columnsFor, { transactionId, actor, eventType, metadata }) {
  return insertFiltered(
    service,
    columnsFor,
    'transaction_events',
    {
      id: crypto.randomUUID(),
      transaction_id: transactionId,
      event_type: eventType,
      event_data: metadata,
      created_by: actor.userId,
      created_by_role: actor.role || 'agent',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    'id',
  )
}

async function upsertRolePlayer(service, columnsFor, { transactionId, actor, selection }) {
  const existingRows = await queryRequired(
    `roleplayer lookup ${selection.roleType}`,
    service
      .from('transaction_role_players')
      .select('*')
      .eq('transaction_id', transactionId)
      .eq('role_type', selection.roleType)
      .is('removed_at', null)
      .limit(1),
  )
  const payload = {
    transaction_id: transactionId,
    role_type: selection.roleType,
    selection_source: 'connected_partner',
    partner_name: selection.partner.companyName,
    contact_person: selection.partner.contactPerson || selection.partner.companyName,
    email_address: selection.partner.email,
    organisation_id: selection.partnerOrganisationId || null,
    workspace_unit_id: selection.workspaceUnitId || null,
    branch_id: selection.branchId || null,
    user_id: selection.userId || null,
    status: 'active',
    assignment_status: 'active',
    activation_trigger: 'immediate',
    activated_at: new Date().toISOString(),
    assigned_by: actor.userId,
    snapshot_json: {
      source: 'transaction_propagation_db_smoke',
      roleType: selection.roleType,
      organisationId: selection.partnerOrganisationId || null,
      workspaceUnitId: selection.workspaceUnitId || null,
      branchId: selection.branchId || null,
      userId: selection.userId || null,
    },
    updated_at: new Date().toISOString(),
  }
  if (existingRows[0]?.id) {
    return updateFilteredById(service, columnsFor, 'transaction_role_players', existingRows[0].id, payload)
  }
  return insertFiltered(service, columnsFor, 'transaction_role_players', { id: crypto.randomUUID(), ...payload, created_at: new Date().toISOString() })
}

async function upsertParticipant(service, columnsFor, { transactionId, selection }) {
  const roleType = selection.roleType === 'transfer_attorney' ? 'attorney' : 'bond_originator'
  const legalRole = selection.roleType === 'transfer_attorney' ? 'transfer' : 'none'
  const existingRows = await queryRequired(
    `participant lookup ${roleType}`,
    service
      .from('transaction_participants')
      .select('*')
      .eq('transaction_id', transactionId)
      .eq('role_type', roleType)
      .eq('legal_role', legalRole)
      .limit(1),
  )
  const payload = {
    transaction_id: transactionId,
    role_type: roleType,
    legal_role: legalRole,
    participant_email: selection.partner.email,
    participant_name: selection.partner.companyName,
    user_id: selection.userId || null,
    status: 'active',
    visibility_scope: 'shared',
    metadata: {
      source: 'transaction_propagation_db_smoke',
      canonicalRoleType: selection.roleType,
      organisationId: selection.partnerOrganisationId || null,
      workspaceUnitId: selection.workspaceUnitId || null,
      branchId: selection.branchId || null,
    },
    updated_at: new Date().toISOString(),
  }
  if (existingRows[0]?.id) return updateFilteredById(service, columnsFor, 'transaction_participants', existingRows[0].id, payload)
  return insertFiltered(service, columnsFor, 'transaction_participants', { id: crypto.randomUUID(), ...payload, created_at: new Date().toISOString() })
}

async function upsertAttorneyAssignment(service, columnsFor, { transactionId, actor, transferAttorney }) {
  const existingRows = await queryRequired(
    'attorney assignment lookup',
    service
      .from('transaction_attorney_assignments')
      .select('*')
      .eq('transaction_id', transactionId)
      .eq('attorney_role', 'transfer_attorney')
      .neq('assignment_status', 'removed')
      .limit(1),
  )
  const payload = {
    transaction_id: transactionId,
    firm_id: transferAttorney.firmId || null,
    attorney_firm_id: transferAttorney.firmId || null,
    assignment_type: 'transfer',
    attorney_role: 'transfer_attorney',
    primary_attorney_id: transferAttorney.userId || null,
    attorney_user_id: transferAttorney.userId || null,
    status: 'active',
    assignment_status: 'active',
    matter_type: 'transfer',
    instruction_status: 'new_instruction',
    is_primary: true,
    visibility_scope: 'assigned_matter',
    assigned_organisation_id: transferAttorney.partnerOrganisationId || null,
    assigned_workspace_unit_id: transferAttorney.workspaceUnitId || null,
    assigned_branch_id: transferAttorney.branchId || null,
    assigned_user_id: transferAttorney.userId || null,
    assigned_by: actor.userId,
    assigned_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (existingRows[0]?.id) return updateFilteredById(service, columnsFor, 'transaction_attorney_assignments', existingRows[0].id, payload)
  return insertFiltered(service, columnsFor, 'transaction_attorney_assignments', { id: crypto.randomUUID(), ...payload, created_at: new Date().toISOString() })
}

async function upsertBondApplication(service, columnsFor, { transactionId, actor, buyerId, bondOriginator }) {
  const workflowRows = await queryRequired(
    'finance workflow lookup',
    service
      .from('transaction_finance_workflows')
      .select('*')
      .eq('transaction_id', transactionId)
      .eq('workflow_type', 'bond_hybrid')
      .limit(1),
  )
  const workflow =
    workflowRows[0] ||
    (await insertFiltered(service, columnsFor, 'transaction_finance_workflows', {
      id: crypto.randomUUID(),
      transaction_id: transactionId,
      workflow_type: 'bond_hybrid',
      current_stage: 'intake',
      status: 'active',
      last_updated_by: actor.userId,
      last_updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

  const existingRows = await queryRequired(
    'bond application lookup',
    service
      .from('transaction_bond_applications')
      .select('*')
      .eq('transaction_id', transactionId)
      .eq('workflow_id', workflow.id)
      .limit(1),
  )
  const payload = {
    transaction_id: transactionId,
    workflow_id: workflow.id,
    bank_name: 'Bond Originator Intake',
    status: 'pending',
    buyer_party_id: buyerId || null,
    application_type: 'originator_intake',
    assigned_organisation_id: bondOriginator.partnerOrganisationId || null,
    assigned_workspace_unit_id: bondOriginator.workspaceUnitId || null,
    assigned_branch_id: bondOriginator.branchId || null,
    assigned_user_id: bondOriginator.userId || null,
    notes: 'New bond application workspace created from transaction roleplayer assignment smoke test.',
    metadata: {
      source: 'transaction_propagation_db_smoke',
      canonicalStatus: 'new_application',
    },
    created_by: actor.userId,
    updated_by: actor.userId,
    updated_at: new Date().toISOString(),
  }
  if (existingRows[0]?.id) return updateFilteredById(service, columnsFor, 'transaction_bond_applications', existingRows[0].id, payload)
  return insertFiltered(service, columnsFor, 'transaction_bond_applications', { id: crypto.randomUUID(), ...payload, created_at: new Date().toISOString() })
}

async function createDirectDeal({ service, columnsFor, actor, transferAttorney, bondOriginator, deal }) {
  const txId = crypto.randomUUID()
  const buyerId = crypto.randomUUID()
  const now = new Date().toISOString()
  await insertFiltered(service, columnsFor, 'buyers', {
    id: buyerId,
    name: `${deal.label} Direct Smoke Buyer`,
    email: `${RUN_ID}-${deal.key}@example.test`,
    phone: '+27000000000',
  }, 'id')
  await insertFiltered(service, columnsFor, 'transactions', {
    id: txId,
    organisation_id: actor.organisationId,
    assigned_branch_id: actor.branchId,
    assigned_user_id: actor.userId,
    owner_user_id: actor.userId,
    transaction_reference: `${RUN_ID}-${deal.key.toUpperCase()}`,
    matter_number: `${RUN_ID}-${deal.key.toUpperCase()}`,
    transaction_type: 'private_property',
    property_type: 'residential',
    property_address_line_1: `${RUN_ID} ${deal.label} Direct Smoke Street`,
    city: 'Johannesburg',
    province: 'Gauteng',
    buyer_id: buyerId,
    finance_type: deal.financeType,
    purchaser_type: 'individual',
    finance_managed_by: deal.financeType === 'cash' ? 'internal' : 'bond_originator',
    purchase_price: deal.purchasePrice,
    sales_price: deal.purchasePrice,
    cash_amount: deal.financeType === 'cash' ? deal.purchasePrice : null,
    bond_amount: deal.financeType === 'cash' ? null : Math.round(deal.purchasePrice * 0.8),
    deposit_amount: deal.financeType === 'cash' ? null : Math.round(deal.purchasePrice * 0.1),
    stage: 'Reserved',
    current_main_stage: 'OTP',
    risk_status: 'On Track',
    lifecycle_state: 'active',
    is_active: true,
    access_level: 'shared',
    assigned_agent: actor.profile?.full_name || actor.email,
    assigned_agent_email: actor.email,
    attorney: transferAttorney.partner.companyName,
    assigned_attorney_email: transferAttorney.partner.email,
    bond_originator: bondOriginator?.partner?.companyName || null,
    assigned_bond_originator_email: bondOriginator?.partner?.email || null,
    next_action: 'Smoke test roleplayer propagation.',
    updated_at: now,
    created_at: now,
  }, 'id')

  await logDirectEvent(service, columnsFor, {
    transactionId: txId,
    actor,
    eventType: 'transaction_created',
    metadata: { source: 'transaction_propagation_db_smoke', createdFrom: 'direct-db-smoke', financeType: deal.financeType },
  })

  for (const selection of [transferAttorney, bondOriginator].filter(Boolean)) {
    await upsertRolePlayer(service, columnsFor, { transactionId: txId, actor, selection })
    await upsertParticipant(service, columnsFor, { transactionId: txId, selection })
    await logDirectEvent(service, columnsFor, {
      transactionId: txId,
      actor,
      eventType: selection.roleType === 'bond_originator' ? 'bond_originator_assigned' : 'transfer_attorney_assigned',
      metadata: { roleType: selection.roleType, action: 'assigned', canonicalRecord: 'transaction_role_players' },
    })
    await logDirectEvent(service, columnsFor, {
      transactionId: txId,
      actor,
      eventType: 'roleplayer_visibility_granted',
      metadata: { roleType: selection.roleType, action: 'visibility_granted', canonicalRecord: 'transaction_role_players' },
    })
  }

  await upsertAttorneyAssignment(service, columnsFor, { transactionId: txId, actor, transferAttorney })
  await logDirectEvent(service, columnsFor, {
    transactionId: txId,
    actor,
    eventType: 'attorney_assignment_created',
    metadata: { roleType: 'transfer_attorney', canonicalRecord: 'transaction_attorney_assignments', canonicalStatus: 'new_instruction' },
  })

  if (bondOriginator) {
    await upsertBondApplication(service, columnsFor, { transactionId: txId, actor, buyerId, bondOriginator })
    await logDirectEvent(service, columnsFor, {
      transactionId: txId,
      actor,
      eventType: 'bond_application_created',
      metadata: { roleType: 'bond_originator', canonicalRecord: 'transaction_bond_applications', canonicalStatus: 'new_application' },
    })
  }
  return txId
}

async function runDirectDbSmoke({ service, columnsFor, config, env, actor, transferAttorney, bondOriginator }) {
  const deals = [
    { key: 'cash', label: 'Cash', financeType: 'cash', purchasePrice: 1850000, bondOriginator: null, expectBondApplication: false },
    { key: 'bond', label: 'Bond', financeType: 'bond', purchasePrice: 2350000, bondOriginator, expectBondApplication: true },
    { key: 'hybrid', label: 'Hybrid', financeType: 'hybrid', purchasePrice: 2950000, bondOriginator, expectBondApplication: true },
  ]
  const created = []
  for (const deal of deals) {
    const transactionId = await createDirectDeal({ service, columnsFor, actor, transferAttorney, bondOriginator: deal.bondOriginator, deal })
    created.push({ ...deal, transactionId })
  }

  const beforeIdempotency = await verifyTransaction({
    service,
    columnsFor,
    txId: created.find((deal) => deal.key === 'bond').transactionId,
    expectedRoles: ['transfer_attorney', 'bond_originator'],
    expectBondApplication: true,
  })
  await upsertRolePlayer(service, columnsFor, { transactionId: beforeIdempotency.transactionId, actor, selection: transferAttorney })
  await upsertRolePlayer(service, columnsFor, { transactionId: beforeIdempotency.transactionId, actor, selection: bondOriginator })
  await upsertAttorneyAssignment(service, columnsFor, { transactionId: beforeIdempotency.transactionId, actor, transferAttorney })
  await upsertBondApplication(service, columnsFor, {
    transactionId: beforeIdempotency.transactionId,
    actor,
    buyerId: null,
    bondOriginator,
  })
  await logDirectEvent(service, columnsFor, {
    transactionId: beforeIdempotency.transactionId,
    actor,
    eventType: 'roleplayer_reassigned',
    metadata: { source: 'transaction_propagation_db_smoke', action: 'roleplayer_reassigned_or_updated' },
  })

  const verifications = []
  for (const deal of created) {
    verifications.push({
      key: deal.key,
      label: deal.label,
      ...(await verifyTransaction({
        service,
        columnsFor,
        txId: deal.transactionId,
        expectedRoles: deal.bondOriginator ? ['transfer_attorney', 'bond_originator'] : ['transfer_attorney'],
        expectBondApplication: deal.expectBondApplication,
      })),
    })
  }

  const afterBond = verifications.find((deal) => deal.key === 'bond')
  const idempotency = {
    transactionId: afterBond.transactionId,
    before: beforeIdempotency.records,
    after: afterBond.records,
    pass:
      beforeIdempotency.records.transaction_role_players === afterBond.records.transaction_role_players &&
      beforeIdempotency.records.transaction_attorney_assignments === afterBond.records.transaction_attorney_assignments &&
      beforeIdempotency.records.transaction_bond_applications === afterBond.records.transaction_bond_applications,
  }
  const rls = await verifyRls({
    service,
    config,
    env,
    txIds: created.map((deal) => deal.transactionId),
    actorEmail: config.actorEmail,
    bondOriginatorEmail: bondOriginator.partner.email,
  })
  const workflowSchema = verifyWorkflowReadinessSchema({ columnsFor })

  const report = {
    runId: RUN_ID,
    mode: 'direct-db',
    created: created.map((deal) => ({ key: deal.key, label: deal.label, transactionId: deal.transactionId })),
    verifications,
    idempotency,
    rls,
    workflowSchema,
    acceptance: {
      cashNoBondApplication: verifications.find((deal) => deal.key === 'cash')?.records.transaction_bond_applications === 0,
      bondHasBondApplication: verifications.find((deal) => deal.key === 'bond')?.records.transaction_bond_applications === 1,
      hybridHasBondApplication: verifications.find((deal) => deal.key === 'hybrid')?.records.transaction_bond_applications === 1,
      allRecordsShareTransactionId: verifications.every((deal) => deal.pass),
      noDuplicateDownstreamRecords: idempotency.pass,
      unrelatedRoleplayerBlocked: rls.unrelatedBondOriginatorBlocked === true,
      unrelatedRoleplayerTransactionBlocked: rls.unrelatedBondOriginatorTransactionBlocked === true,
      assignedBondOriginatorCanSeeApplication: rls.bondOriginatorCanSeeAssignedApplication === true,
      rlsChecked: rls.agentCanSeeTransactions !== null || rls.bondOriginatorCanSeeApplications !== null || rls.unrelatedBondOriginatorBlocked !== null,
      workflowReadinessSchemaReady: workflowSchema.pass === true,
    },
  }
  report.pass =
    report.acceptance.cashNoBondApplication &&
    report.acceptance.bondHasBondApplication &&
    report.acceptance.hybridHasBondApplication &&
    report.acceptance.allRecordsShareTransactionId &&
    report.acceptance.noDuplicateDownstreamRecords &&
    report.acceptance.unrelatedRoleplayerBlocked &&
    report.acceptance.unrelatedRoleplayerTransactionBlocked &&
    report.acceptance.assignedBondOriginatorCanSeeApplication &&
    report.acceptance.workflowReadinessSchemaReady
  return report
}

async function main() {
  const env = loadEnv()
  if (process.env.TX_PROP_DEBUG_FETCH === '1') {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init = {}) => {
      const response = await originalFetch(input, init)
      const url = typeof input === 'string' ? input : input?.url
      const shouldInspect = !response.ok || String(url || '').includes('/rest/v1/')
      if (shouldInspect) {
        const body = await response.clone().text().catch(() => '')
        const hasStructuredError = /"code"\s*:\s*"PGRST|PGRST116|multiple \(or no\) rows returned/i.test(body)
        if (!response.ok || hasStructuredError) {
        console.error(JSON.stringify({
          debugFetch: true,
          status: response.status,
          method: init?.method || 'GET',
          url,
          body: body.slice(0, 1000),
        }))
        }
      }
      return response
    }
  }
  const config = requireConfig(env)
  const service = createServiceClient(config)
  const columnsFor = await getOpenApiColumns(config)
  const actor = await resolveActorContext(service, config.actorEmail)
  const transferAttorney = await resolveTransferAttorney(service, actor)
  const bondOriginator = await resolveBondOriginator(service, env)

  if (process.argv.includes('--direct-db')) {
    const report = await runDirectDbSmoke({ service, columnsFor, config, env, actor, transferAttorney, bondOriginator })
    console.log(JSON.stringify(report, null, 2))
    if (!report.pass) process.exitCode = 1
    return
  }

  const { createServer } = await import('vite')
  const vite = await createServer({ logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
  const { supabase } = await vite.ssrLoadModule('/src/lib/supabaseClient.js')
  const { createTransactionFromWizard, saveTransactionRoleplayerSelections } = await vite.ssrLoadModule('/src/lib/api.js')
  const {
    clearUniversalPartnerRoutingEvents,
    getUniversalPartnerRoutingEvents,
  } = await vite.ssrLoadModule('/src/services/universalPartnerRoutingService.js')
  if (!supabase) throw new Error('Frontend Supabase client is not configured.')

  let report
  try {
    const partnerRoutingFixture = await ensurePartnerRoutingFixture({
      service,
      columnsFor,
      actor,
      bondOriginator,
    })
    await signInAppUser({
      supabase,
      service,
      actor,
      email: config.actorEmail,
      password: config.actorPassword,
    })
    clearUniversalPartnerRoutingEvents(actor.organisationId)

    const deals = [
      { key: 'cash', label: 'Cash', financeType: 'cash', purchasePrice: 1850000, bondOriginator: null, expectBondApplication: false },
      { key: 'bond', label: 'Bond', financeType: 'bond', purchasePrice: 2350000, bondOriginator, expectBondApplication: true },
      { key: 'hybrid', label: 'Hybrid', financeType: 'hybrid', purchasePrice: 2950000, bondOriginator, expectBondApplication: true },
    ]

    const created = []
    for (const deal of deals) {
      const { transactionId } = await createTransactionWithApp({
        supabase,
        createTransactionFromWizard,
        actor,
        transferAttorney,
        bondOriginator: deal.bondOriginator,
        deal,
      })
      created.push({ ...deal, transactionId })
    }

    const beforeIdempotency = await verifyTransaction({
      service,
      columnsFor,
      txId: created.find((deal) => deal.key === 'bond').transactionId,
      expectedRoles: ['transfer_attorney', 'bond_originator'],
      expectBondApplication: true,
    })

    await rerunIdempotency({
      saveTransactionRoleplayerSelections,
      transactionId: created.find((deal) => deal.key === 'bond').transactionId,
      transferAttorney,
      bondOriginator,
      actorRole: actor.role,
    })

    const verifications = []
    for (const deal of created) {
      verifications.push({
        key: deal.key,
        label: deal.label,
        ...(await verifyTransaction({
          service,
          columnsFor,
          txId: deal.transactionId,
          expectedRoles: deal.bondOriginator ? ['transfer_attorney', 'bond_originator'] : ['transfer_attorney'],
          expectBondApplication: deal.expectBondApplication,
        })),
      })
    }

    const afterBond = verifications.find((deal) => deal.key === 'bond')
    const idempotency = {
      transactionId: afterBond.transactionId,
      before: beforeIdempotency.records,
      after: afterBond.records,
      pass:
        beforeIdempotency.records.transaction_role_players === afterBond.records.transaction_role_players &&
        beforeIdempotency.records.transaction_attorney_assignments === afterBond.records.transaction_attorney_assignments &&
        beforeIdempotency.records.transaction_bond_applications === afterBond.records.transaction_bond_applications,
    }

    const rls = await verifyRls({
      service,
      config,
      env,
      txIds: created.map((deal) => deal.transactionId),
      actorEmail: config.actorEmail,
      bondOriginatorEmail: bondOriginator.partner.email,
    })
    const audit = await verifySecurityAuditPersistence({
      service,
      txIds: created.map((deal) => deal.transactionId),
    })
    const workflowSchema = verifyWorkflowReadinessSchema({ columnsFor })
    const partnerRouting = verifyPartnerRouting({
      events: getUniversalPartnerRoutingEvents(actor.organisationId),
      expectedRoutedDeals: deals.filter((deal) => deal.bondOriginator).length,
      bondOriginator,
    })

    report = {
      runId: RUN_ID,
      actor: {
        email: actor.email,
        userId: actor.userId,
        organisationId: actor.organisationId,
        branchId: actor.branchId,
        workspaceUnitId: actor.workspaceUnitId,
        role: actor.role,
      },
      selectedRoleplayers: {
        transferAttorney: {
          organisationId: transferAttorney.partnerOrganisationId,
          userId: transferAttorney.userId,
          workspaceUnitId: transferAttorney.workspaceUnitId,
          branchId: transferAttorney.branchId,
          email: transferAttorney.partner.email,
        },
        bondOriginator: {
          organisationId: bondOriginator.partnerOrganisationId,
          userId: bondOriginator.userId,
          workspaceUnitId: bondOriginator.workspaceUnitId,
          branchId: bondOriginator.branchId,
          email: bondOriginator.partner.email,
        },
      },
      created: created.map((deal) => ({ key: deal.key, label: deal.label, transactionId: deal.transactionId })),
      verifications,
      idempotency,
      rls,
      audit,
      workflowSchema,
      partnerRoutingFixture,
      partnerRouting,
      acceptance: {
        cashNoBondApplication: verifications.find((deal) => deal.key === 'cash')?.records.transaction_bond_applications === 0,
        bondHasBondApplication: verifications.find((deal) => deal.key === 'bond')?.records.transaction_bond_applications === 1,
      hybridHasBondApplication: verifications.find((deal) => deal.key === 'hybrid')?.records.transaction_bond_applications === 1,
      allRecordsShareTransactionId: verifications.every((deal) => deal.pass),
      noDuplicateDownstreamRecords: idempotency.pass,
      unrelatedRoleplayerBlocked: rls.unrelatedBondOriginatorBlocked === true,
      unrelatedRoleplayerTransactionBlocked: rls.unrelatedBondOriginatorTransactionBlocked === true,
      assignedBondOriginatorCanSeeApplication: rls.bondOriginatorCanSeeAssignedApplication === true,
      securityAuditEventsPersisted: audit.pass === true,
      workflowReadinessSchemaReady: workflowSchema.pass === true,
      partnerRoutingResolvedWithoutFallback: partnerRouting.pass === true,
      rlsChecked: rls.agentCanSeeTransactions !== null || rls.bondOriginatorCanSeeApplications !== null || rls.unrelatedBondOriginatorBlocked !== null,
      },
    }

    report.pass =
      report.acceptance.cashNoBondApplication &&
      report.acceptance.bondHasBondApplication &&
    report.acceptance.hybridHasBondApplication &&
    report.acceptance.allRecordsShareTransactionId &&
    report.acceptance.noDuplicateDownstreamRecords &&
    report.acceptance.unrelatedRoleplayerBlocked &&
    report.acceptance.unrelatedRoleplayerTransactionBlocked &&
    report.acceptance.assignedBondOriginatorCanSeeApplication &&
    report.acceptance.securityAuditEventsPersisted &&
    report.acceptance.workflowReadinessSchemaReady &&
    report.acceptance.partnerRoutingResolvedWithoutFallback
  } finally {
    await vite.close()
  }

  console.log(JSON.stringify(report, null, 2))
  if (!report.pass) process.exitCode = 1
}

main().catch((error) => {
  console.error(JSON.stringify({
    runId: RUN_ID,
    pass: false,
    error: error.message,
    code: error.code || null,
    details: error.details || null,
    hint: error.hint || null,
    stack: error.stack,
  }, null, 2))
  process.exitCode = 1
})
