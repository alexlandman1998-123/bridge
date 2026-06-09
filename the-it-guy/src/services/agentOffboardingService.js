import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

const ACTIVE_LEAD_EXCLUSIONS = new Set(['lost', 'archived', 'converted to transaction', 'converted'])
const ACTIVE_LISTING_EXCLUSIONS = new Set(['withdrawn', 'archived', 'sold_archived', 'deleted'])
const ACTIVE_TRANSACTION_EXCLUSIONS = new Set(['registered', 'completed', 'archived', 'cancelled', 'canceled', 'deleted'])
const ACTIVE_APPOINTMENT_EXCLUSIONS = new Set(['completed', 'cancelled', 'canceled', 'declined', 'no_show', 'no show'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeUuid(value) {
  const normalized = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : ''
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function isMissingSchemaError(error) {
  const code = normalizeText(error?.code)
  const message = normalizeLower(error?.message)
  return (
    code === '42P01' ||
    code === '42703' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  )
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function compactPayload(payload = {}) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

function getAgentKeys(agent = {}) {
  return {
    id: normalizeUuid(agent.userId || agent.user_id || agent.id),
    email: normalizeEmail(agent.email || agent.assignedAgentEmail || agent.assigned_agent_email),
  }
}

function getRowOwnerKey(row = {}) {
  return {
    assignedUserId: normalizeUuid(row.assigned_user_id || row.assignedUserId),
    assignedAgentId: normalizeUuid(row.assigned_agent_id || row.assignedAgentId || row.agent_id || row.agentId),
    ownerUserId: normalizeUuid(row.owner_user_id || row.ownerUserId),
    assignedAgentEmail: normalizeEmail(row.assigned_agent_email || row.assignedAgentEmail),
  }
}

function ownedByAgent(row = {}, agent = {}) {
  const keys = getAgentKeys(agent)
  const rowKeys = getRowOwnerKey(row)
  if (keys.id && [rowKeys.assignedUserId, rowKeys.assignedAgentId, rowKeys.ownerUserId].includes(keys.id)) return true
  return Boolean(keys.email && rowKeys.assignedAgentEmail === keys.email)
}

function isActiveLead(row = {}) {
  const status = normalizeLower(row.status || row.stage || row.lead_stage)
  return !ACTIVE_LEAD_EXCLUSIONS.has(status)
}

function isActiveListing(row = {}) {
  const status = normalizeLower(row.listing_status || row.status)
  const visibility = normalizeLower(row.listing_visibility || row.visibility)
  return !ACTIVE_LISTING_EXCLUSIONS.has(status) && !ACTIVE_LISTING_EXCLUSIONS.has(visibility)
}

function isActiveTransaction(row = {}) {
  const state = normalizeLower(row.lifecycle_state || row.stage || row.current_main_stage)
  const stage = normalizeLower(row.stage || row.current_main_stage)
  if (row.is_active === false) return false
  if (row.deleted_at) return false
  return !ACTIVE_TRANSACTION_EXCLUSIONS.has(state) && !ACTIVE_TRANSACTION_EXCLUSIONS.has(stage)
}

function isFutureOrActiveAppointment(row = {}) {
  const status = normalizeLower(row.status)
  if (ACTIVE_APPOINTMENT_EXCLUSIONS.has(status)) return false
  const dateValue = row.date_time || row.start_time || row.appointment_date
  if (!dateValue) return true
  const time = new Date(dateValue).getTime()
  if (Number.isNaN(time)) return true
  return time >= Date.now()
}

async function safeSelect(table, fields, organisationId, { order = 'updated_at', limit = 5000 } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  let query = supabase.from(table).select(fields)
  if (organisationId) query = query.eq('organisation_id', organisationId)
  if (order) query = query.order(order, { ascending: false })
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) {
    if (isMissingSchemaError(error)) return []
    throw error
  }
  return asArray(data)
}

function splitLeads(leads = []) {
  return leads.reduce((accumulator, lead) => {
    const category = normalizeLower(lead.lead_category || lead.category || lead.lead_type || lead.type)
    const direction = normalizeLower(lead.lead_direction || lead.direction)
    const source = normalizeLower(lead.lead_source || lead.source)
    const isSeller = category.includes('seller') || direction.includes('seller') || source.includes('seller')
    const bucket = isSeller ? 'sellerLeads' : 'buyerLeads'
    accumulator[bucket].push(lead)
    return accumulator
  }, { sellerLeads: [], buyerLeads: [] })
}

export function summarizeAgentAssets(assets = {}) {
  const leads = splitLeads(assets.leads)
  const activeListings = asArray(assets.listings).filter(isActiveListing)
  const activeTransactions = asArray(assets.transactions).filter(isActiveTransaction)
  const futureAppointments = asArray(assets.appointments).filter(isFutureOrActiveAppointment)
  const activeTasks = asArray(assets.tasks).filter((task) => !['completed', 'cancelled', 'canceled'].includes(normalizeLower(task.status)))

  return {
    sellerLeads: leads.sellerLeads.length,
    buyerLeads: leads.buyerLeads.length,
    contacts: asArray(assets.contacts).length,
    tasks: activeTasks.length,
    listings: asArray(assets.listings).length,
    activeListings: activeListings.length,
    transactions: asArray(assets.transactions).length,
    activeTransactions: activeTransactions.length,
    appointments: futureAppointments.length,
    documentPackets: asArray(assets.documentPackets).length,
    openDocumentRequests: asArray(assets.documentRequests).length,
    pendingSellerUploads: asArray(assets.pendingSellerUploads).length,
    totalAssets:
      leads.sellerLeads.length +
      leads.buyerLeads.length +
      asArray(assets.contacts).length +
      activeTasks.length +
      asArray(assets.listings).length +
      asArray(assets.transactions).length +
      futureAppointments.length +
      asArray(assets.documentPackets).length +
      asArray(assets.documentRequests).length +
      asArray(assets.pendingSellerUploads).length,
  }
}

export function hasBlockingAgentAssets(summary = {}) {
  return Number(summary.totalAssets || 0) > 0
}

export async function discoverAgentOffboardingAssets({ organisationId = '', agent = {} } = {}) {
  const normalizedOrgId = normalizeUuid(organisationId || agent.organisationId || agent.organisation_id)
  if (!normalizedOrgId) throw new Error('Organisation id is required before offboarding an agent.')

  const [
    leads,
    contacts,
    tasks,
    listings,
    transactions,
    appointments,
    documentPackets,
    documentRequests,
    sellerRequirements,
  ] = await Promise.all([
    safeSelect('leads', 'lead_id, organisation_id, branch_id, assigned_user_id, assigned_agent_id, assigned_agent_email, created_by, lead_category, lead_direction, lead_source, stage, status, created_at, updated_at', normalizedOrgId),
    safeSelect('contacts', 'contact_id, organisation_id, assigned_agent_id, first_name, last_name, email, phone, contact_type, created_at, updated_at', normalizedOrgId),
    safeSelect('tasks', 'task_id, organisation_id, lead_id, transaction_id, assigned_agent_id, title, status, due_date, created_at, updated_at', normalizedOrgId),
    safeSelect('private_listings', 'id, organisation_id, branch_id, assigned_agent_id, assigned_agent_email, created_by, listing_status, listing_visibility, title, listing_reference, mandate_status, seller_onboarding_status, created_at, updated_at', normalizedOrgId),
    safeSelect('transactions', 'id, organisation_id, assigned_branch_id, assigned_user_id, assigned_agent_id, owner_user_id, assigned_agent, assigned_agent_email, created_by, lifecycle_state, stage, current_main_stage, is_active, deleted_at, transaction_reference, property_address_line_1, created_at, updated_at', normalizedOrgId),
    safeSelect('appointments', 'appointment_id, organisation_id, lead_id, contact_id, transaction_id, agent_id, created_by, title, appointment_type, status, date_time, appointment_date, created_at, updated_at', normalizedOrgId, { order: 'date_time' }),
    safeSelect('document_packets', 'id, organisation_id, transaction_id, lead_id, contact_id, assigned_agent_id, created_by, title, status, packet_type, created_at, updated_at', normalizedOrgId),
    safeSelect('document_requests', 'id, organisation_id, transaction_id, assigned_to_user_id, created_by, created_by_role, title, status, request_type, created_at, updated_at', normalizedOrgId),
    safeSelect('private_listing_document_requirements', 'id, private_listing_id, requirement_name, requirement_group, status, is_required, created_at, updated_at', '', { order: 'updated_at' }),
  ])

  const ownedListings = listings.filter((row) => ownedByAgent(row, agent))
  const ownedListingIds = new Set(ownedListings.map((row) => normalizeUuid(row.id)).filter(Boolean))
  const pendingSellerUploads = sellerRequirements.filter((row) => {
    const status = normalizeLower(row.status)
    return ownedListingIds.has(normalizeUuid(row.private_listing_id)) && ['required', 'requested', 'rejected', 'under_review'].includes(status)
  })

  const assets = {
    leads: leads.filter((row) => ownedByAgent(row, agent) && isActiveLead(row)),
    contacts: contacts.filter((row) => ownedByAgent(row, agent)),
    tasks: tasks.filter((row) => ownedByAgent(row, agent)),
    listings: ownedListings.filter(isActiveListing),
    transactions: transactions.filter((row) => ownedByAgent(row, agent) && isActiveTransaction(row)),
    appointments: appointments.filter((row) => ownedByAgent(row, agent) && isFutureOrActiveAppointment(row)),
    documentPackets: documentPackets.filter((row) => ownedByAgent(row, agent)),
    documentRequests: documentRequests.filter((row) => normalizeUuid(row.assigned_to_user_id) === getAgentKeys(agent).id && !['completed', 'cancelled', 'canceled', 'approved'].includes(normalizeLower(row.status))),
    pendingSellerUploads,
  }
  return {
    assets,
    summary: summarizeAgentAssets(assets),
  }
}

function resolveDestination(strategy = {}, assetType = '') {
  if (strategy.mode === 'split') return strategy.byType?.[assetType] || strategy.defaultAgent || null
  if (strategy.mode === 'branch_pool') return null
  return strategy.defaultAgent || null
}

function requireDestination(strategy, assetType) {
  const destination = resolveDestination(strategy, assetType)
  if (!destination?.userId && strategy?.mode !== 'branch_pool') {
    throw new Error(`Choose a destination agent for ${assetType}.`)
  }
  return destination
}

async function auditEvent({ actorId, organisationId, action, targetType, targetId, metadata }) {
  if (!isSupabaseConfigured || !supabase) return null
  const { error } = await supabase.from('security_audit_events').insert({
    user_id: normalizeUuid(actorId) || null,
    workspace_id: normalizeUuid(organisationId) || null,
    action,
    target_type: targetType,
    target_id: normalizeText(targetId),
    metadata: metadata || {},
  })
  if (error && !isMissingSchemaError(error)) {
    console.warn('[Agent Offboarding] audit event skipped', error)
  }
  return null
}

async function updateRows(table, idColumn, rows, patchFactory, auditFactory) {
  const updated = []
  for (const row of rows) {
    const rowId = normalizeText(row[idColumn])
    if (!rowId) continue
    const patch = compactPayload(patchFactory(row))
    const { error } = await supabase.from(table).update(patch).eq(idColumn, rowId)
    if (error) {
      if (isMissingSchemaError(error)) continue
      throw error
    }
    updated.push(row)
    if (auditFactory) await auditFactory(row, patch)
  }
  return updated.length
}

async function insertListingActivity(listingId, actorId, reason, metadata) {
  const { error } = await supabase.from('private_listing_activity').insert({
    private_listing_id: listingId,
    activity_type: 'listing_ownership_transferred',
    activity_title: 'Listing ownership transferred',
    activity_description: reason || 'Listing reassigned during agent offboarding.',
    performed_by: normalizeUuid(actorId) || null,
    visibility: 'internal',
    metadata: metadata || {},
  })
  if (error && !isMissingSchemaError(error)) {
    console.warn('[Agent Offboarding] listing activity skipped', error)
  }
}

export async function executeAgentAssetReassignment({
  organisationId = '',
  agent = {},
  assets = {},
  strategy = {},
  actor = {},
  reason = 'Agent offboarding',
  appointmentAction = 'reassign',
} = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is required before agent offboarding can continue.')
  const normalizedOrgId = normalizeUuid(organisationId || agent.organisationId || agent.organisation_id)
  const sourceAgentId = getAgentKeys(agent).id
  if (!normalizedOrgId || !sourceAgentId) throw new Error('Agent and organisation context are required before reassignment.')

  const now = new Date().toISOString()
  const actorId = normalizeUuid(actor?.id || actor?.userId)
  const results = {
    leads: 0,
    contacts: 0,
    tasks: 0,
    listings: 0,
    transactions: 0,
    appointments: 0,
    documentPackets: 0,
    documentRequests: 0,
  }

  const leadDestination = resolveDestination(strategy, 'leads')
  if (assets.leads?.length && !leadDestination?.userId && strategy.mode !== 'branch_pool') throw new Error('Choose a destination for leads.')
  results.leads = await updateRows('leads', 'lead_id', asArray(assets.leads), () => {
    if (strategy.mode === 'branch_pool') {
      return {
        assigned_user_id: null,
        assigned_agent_id: null,
        assigned_queue_id: 'branch_pool',
        ownership_status: 'awaiting_assignment',
        assigned_at: now,
        updated_at: now,
      }
    }
    return {
      assigned_user_id: normalizeUuid(leadDestination.userId),
      assigned_agent_id: normalizeUuid(leadDestination.userId),
      assigned_agent_email: normalizeEmail(leadDestination.email) || null,
      branch_id: normalizeUuid(leadDestination.branchId) || undefined,
      assigned_queue_id: null,
      ownership_status: 'assigned',
      assigned_at: now,
      updated_at: now,
    }
  }, async (row) => {
    await auditEvent({
      actorId,
      organisationId: normalizedOrgId,
      action: 'lead_ownership_transferred',
      targetType: 'lead',
      targetId: row.lead_id,
      metadata: { previousOwnerUserId: sourceAgentId, newOwnerUserId: leadDestination?.userId || null, reason },
    })
  })

  const listingDestination = assets.listings?.length ? requireDestination(strategy, 'listings') : null
  results.listings = await updateRows('private_listings', 'id', asArray(assets.listings), () => ({
    assigned_agent_id: normalizeUuid(listingDestination?.userId),
    assigned_agent_email: normalizeEmail(listingDestination?.email) || null,
    branch_id: normalizeUuid(listingDestination?.branchId) || undefined,
    updated_at: now,
  }), async (row) => {
    const metadata = { previousOwnerUserId: sourceAgentId, newOwnerUserId: listingDestination?.userId, reason }
    await insertListingActivity(row.id, actorId, reason, metadata)
    await auditEvent({ actorId, organisationId: normalizedOrgId, action: 'listing_ownership_transferred', targetType: 'private_listing', targetId: row.id, metadata })
  })

  const transactionDestination = assets.transactions?.length ? requireDestination(strategy, 'transactions') : null
  results.transactions = await updateRows('transactions', 'id', asArray(assets.transactions), () => ({
    owner_user_id: normalizeUuid(transactionDestination?.userId),
    assigned_user_id: normalizeUuid(transactionDestination?.userId),
    assigned_agent_id: normalizeUuid(transactionDestination?.userId),
    assigned_agent: normalizeText(transactionDestination?.name) || null,
    assigned_agent_email: normalizeEmail(transactionDestination?.email) || null,
    assigned_branch_id: normalizeUuid(transactionDestination?.branchId) || undefined,
    updated_at: now,
  }), async (row) => {
    const metadata = { previousOwnerUserId: sourceAgentId, newOwnerUserId: transactionDestination?.userId, reason }
    await auditEvent({ actorId, organisationId: normalizedOrgId, action: 'transaction_ownership_transferred', targetType: 'transaction', targetId: row.id, metadata })
  })

  if (appointmentAction === 'reassign') {
    const appointmentDestination = assets.appointments?.length ? requireDestination(strategy, 'appointments') : null
    results.appointments = await updateRows('appointments', 'appointment_id', asArray(assets.appointments), () => ({
      agent_id: normalizeUuid(appointmentDestination?.userId),
      updated_at: now,
    }), async (row) => {
      const metadata = { previousOwnerUserId: sourceAgentId, newOwnerUserId: appointmentDestination?.userId, reason }
      await auditEvent({ actorId, organisationId: normalizedOrgId, action: 'appointment_ownership_transferred', targetType: 'appointment', targetId: row.appointment_id, metadata })
    })
  } else if (appointmentAction === 'cancel') {
    results.appointments = await updateRows('appointments', 'appointment_id', asArray(assets.appointments), () => ({
      status: 'Cancelled',
      cancelled_at: now,
      cancelled_by: actorId || null,
      cancellation_reason: reason,
      updated_at: now,
    }), async (row) => {
      await auditEvent({ actorId, organisationId: normalizedOrgId, action: 'appointment_cancelled_for_offboarding', targetType: 'appointment', targetId: row.appointment_id, metadata: { previousOwnerUserId: sourceAgentId, reason } })
    })
  }

  const contactDestination = resolveDestination(strategy, 'contacts') || leadDestination || listingDestination || transactionDestination
  if (contactDestination?.userId) {
    results.contacts = await updateRows('contacts', 'contact_id', asArray(assets.contacts), () => ({
      assigned_agent_id: normalizeUuid(contactDestination.userId),
      updated_at: now,
    }), async (row) => {
      await auditEvent({ actorId, organisationId: normalizedOrgId, action: 'contact_ownership_transferred', targetType: 'contact', targetId: row.contact_id, metadata: { previousOwnerUserId: sourceAgentId, newOwnerUserId: contactDestination.userId, reason } })
    })
  }

  const taskDestination = resolveDestination(strategy, 'tasks') || leadDestination || transactionDestination
  if (taskDestination?.userId) {
    results.tasks = await updateRows('tasks', 'task_id', asArray(assets.tasks), () => ({
      assigned_agent_id: normalizeUuid(taskDestination.userId),
      updated_at: now,
    }), async (row) => {
      await auditEvent({ actorId, organisationId: normalizedOrgId, action: 'task_ownership_transferred', targetType: 'task', targetId: row.task_id, metadata: { previousOwnerUserId: sourceAgentId, newOwnerUserId: taskDestination.userId, reason } })
    })
  }

  const packetDestination = resolveDestination(strategy, 'documentPackets') || transactionDestination || listingDestination || leadDestination
  if (packetDestination?.userId) {
    results.documentPackets = await updateRows('document_packets', 'id', asArray(assets.documentPackets), () => ({
      assigned_agent_id: normalizeUuid(packetDestination.userId),
      updated_at: now,
    }), async (row) => {
      await auditEvent({ actorId, organisationId: normalizedOrgId, action: 'document_packet_ownership_transferred', targetType: 'document_packet', targetId: row.id, metadata: { previousOwnerUserId: sourceAgentId, newOwnerUserId: packetDestination.userId, reason } })
    })
  }

  const documentRequestDestination = resolveDestination(strategy, 'documentRequests') || transactionDestination || leadDestination
  if (documentRequestDestination?.userId) {
    results.documentRequests = await updateRows('document_requests', 'id', asArray(assets.documentRequests), () => ({
      assigned_to_user_id: normalizeUuid(documentRequestDestination.userId),
      updated_at: now,
    }), async (row) => {
      await auditEvent({ actorId, organisationId: normalizedOrgId, action: 'document_request_ownership_transferred', targetType: 'document_request', targetId: row.id, metadata: { previousOwnerUserId: sourceAgentId, newOwnerUserId: documentRequestDestination.userId, reason } })
    })
  }

  await auditEvent({
    actorId,
    organisationId: normalizedOrgId,
    action: 'agent_offboarding_assets_reassigned',
    targetType: 'organisation_user',
    targetId: agent.organisationUserId || sourceAgentId,
    metadata: { sourceAgentId, reason, strategyMode: strategy.mode || 'single', results },
  })

  return results
}
