import fs from 'node:fs'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const RUN_ID = `seller-bridge-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`

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

function cleanEnvValue(value = '') {
  return String(value || '').replace(/^["']|["']$/g, '')
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function loadEnv() {
  const processOverrides = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => normalizeText(value)),
  )
  const merged = Object.fromEntries(
    Object.entries({
      ...parseEnvFile('.env'),
      ...parseEnvFile('.env.staging.local'),
      ...processOverrides,
    }).map(([key, value]) => [key, cleanEnvValue(value)]),
  )
  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] == null) process.env[key] = value
  }
  return merged
}

function requireConfig(env) {
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)
  const anonKey = normalizeText(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY)
  const actorEmail = normalizeEmail(env.STAGING_INTERNAL_EMAIL)
  const actorPassword = normalizeText(env.STAGING_INTERNAL_PASSWORD)
  const bondEmail = normalizeEmail(env.BOND_RUNTIME_CONSULTANT_EMAIL || env.BOND_RUNTIME_AUTH_EMAIL)
  const bondPassword = normalizeText(env.BOND_RUNTIME_AUTH_PASSWORD)

  if (!supabaseUrl || !serviceRoleKey || !anonKey || !actorEmail || !actorPassword || !bondEmail || !bondPassword) {
    throw new Error('Missing staging Supabase/app credentials.')
  }
  const projectRef = projectRefFromUrl(supabaseUrl)
  if (projectRef !== STAGING_PROJECT_REF) {
    throw new Error(`Refusing to run outside staging project ${STAGING_PROJECT_REF}; resolved ${projectRef || 'unknown'}.`)
  }
  return { supabaseUrl, serviceRoleKey, anonKey, actorEmail, actorPassword, bondEmail, bondPassword }
}

function createServiceClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

async function queryRequired(label, query) {
  const { data, error } = await query
  if (error) {
    throw new Error(`${label}: ${error.message}`)
  }
  return data
}

async function maybeSingle(label, query) {
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`${label}: ${error.message}`)
  }
  return data
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

async function getAuthUserId(service, email) {
  const authUser = await findAuthUser(service, email).catch(() => null)
  if (authUser?.id) return authUser.id
  const profiles = await queryRequired(
    `profile lookup ${email}`,
    service.from('profiles').select('id,email').eq('email', email).limit(1),
  )
  return profiles?.[0]?.id || null
}

async function resolveActorContext(service, actorEmail) {
  const actorUserId = await getAuthUserId(service, actorEmail)
  if (!actorUserId) throw new Error(`Could not resolve actor user for ${actorEmail}.`)

  const profile = await maybeSingle(
    'actor profile',
    service.from('profiles').select('*').eq('id', actorUserId),
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
    throw new Error(`Could not resolve organisation membership for ${actorEmail}.`)
  }
  return {
    userId: actorUserId,
    email: actorEmail,
    profile,
    organisationId: membership.organisation_id,
    branchId: membership.branch_id || membership.primary_branch_id || null,
  }
}

async function resolveTransferAttorney(service, actor) {
  const memberRows = await queryRequired(
    'attorney firm member lookup',
    service.from('attorney_firm_members').select('*').eq('user_id', actor.userId).limit(10),
  )
  const member = memberRows.find((row) => ['active', 'accepted'].includes(normalizeText(row.status).toLowerCase())) || memberRows[0]
  if (!member?.firm_id) throw new Error('Could not resolve transfer attorney firm member.')

  const firm = await maybeSingle(
    'attorney firm lookup',
    service.from('attorney_firms').select('*').eq('id', member.firm_id),
  )
  if (!firm?.id) throw new Error('Could not resolve transfer attorney firm.')

  return {
    roleType: 'transfer_attorney',
    source: 'connected_partner',
    partnerOrganisationId: firm.organisation_id || firm.backing_organisation_id || actor.organisationId,
    userId: member.user_id || actor.userId,
    workspaceUnitId: member.workspace_unit_id || null,
    branchId: member.branch_id || null,
    firmId: firm.id,
    partner: {
      companyName: firm.name || firm.display_name || 'Staging Transfer Attorneys',
      contactPerson: actor.profile?.full_name || actor.email,
      email: actor.email,
      phone: firm.phone || null,
    },
  }
}

async function resolveBondOriginator(service, config) {
  const memberships = await queryRequired(
    'bond originator memberships',
    service.from('organisation_users').select('*').eq('email', config.bondEmail).limit(20),
  )
  const membership =
    memberships.find((row) => ['active', 'accepted'].includes(normalizeText(row.status).toLowerCase())) ||
    memberships[0] ||
    null
  if (!membership?.organisation_id) throw new Error(`Could not resolve bond originator organisation for ${config.bondEmail}.`)
  const userId = membership.user_id || (await getAuthUserId(service, config.bondEmail))
  if (!userId) throw new Error(`Could not resolve bond originator user for ${config.bondEmail}.`)
  const organisation = await maybeSingle(
    'bond originator organisation',
    service.from('organisations').select('*').eq('id', membership.organisation_id),
  )
  return {
    roleType: 'bond_originator',
    source: 'connected_partner',
    partnerOrganisationId: membership.organisation_id,
    userId,
    workspaceUnitId: membership.workspace_unit_id || null,
    branchId: membership.branch_id || membership.primary_branch_id || null,
    partner: {
      companyName: organisation?.name || organisation?.display_name || 'Staging Bond Originator',
      contactPerson: config.bondEmail,
      email: config.bondEmail,
    },
  }
}

async function ensureDevelopmentId(service) {
  const activeLink = await maybeSingle(
    'active client portal link',
    service
      .from('client_portal_links')
      .select('development_id')
      .eq('is_active', true)
      .not('development_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1),
  )
  if (activeLink?.development_id) return activeLink.development_id

  const development = await maybeSingle(
    'fallback development',
    service.from('developments').select('id').limit(1),
  )
  if (!development?.id) throw new Error('Could not resolve a development_id for the buyer portal fixture.')
  return development.id
}

async function signInSupabaseApp(supabase, email, password) {
  await supabase.auth.signOut().catch(() => {})
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

async function signOutSupabaseApp(supabase) {
  await supabase.auth.signOut().catch(() => {})
}

async function upsertTransactionRequiredDocument(service, transactionId, documentKey, documentLabel) {
  const row = {
    transaction_id: transactionId,
    document_key: documentKey,
    document_label: documentLabel,
    is_required: true,
    is_uploaded: false,
    status: 'requested',
    enabled: true,
    group_key: 'seller_phase4',
    group_label: 'Seller phase4',
    description: `${documentLabel} required for phase 4 smoke.`,
    required_from_role: 'seller',
    visibility_scope: 'internal',
    allow_multiple: false,
    sort_order: 999,
    updated_at: new Date().toISOString(),
  }
  const { error } = await service
    .from('transaction_required_documents')
    .upsert(row, { onConflict: 'transaction_id,document_key' })
  if (error) throw error
}

async function insertDocumentRequest(service, transactionId, actorId, title, documentType, assignedToRole = 'attorney') {
  const payload = {
    transaction_id: transactionId,
    category: 'transfer',
    document_type: documentType,
    title,
    description: `${title} requested for phase 4 smoke.`,
    priority: 'required',
    assigned_to_role: assignedToRole,
    status: 'requested',
    requires_review: true,
    visibility_scope: 'professional_shared',
    created_by: actorId,
    created_by_role: 'attorney',
    lane_key: 'transfer',
    attorney_role: 'transfer_attorney',
    requested_from: 'seller',
    requested_by: actorId,
    review_status: 'requested',
  }
  let result = await service.from('document_requests').insert(payload).select('*').single()
  if (
    result.error &&
    ['lane_key', 'review_status', 'visibility_scope', 'attorney_role', 'requested_from', 'requested_by'].some((column) =>
      String(result.error.message || '').includes(column),
    )
  ) {
    const fallback = { ...payload }
    delete fallback.lane_key
    delete fallback.review_status
    delete fallback.visibility_scope
    delete fallback.attorney_role
    delete fallback.requested_from
    delete fallback.requested_by
    result = await service.from('document_requests').insert(fallback).select('*').single()
  }
  if (result.error) throw result.error
  return result.data
}

async function addCancellationAttorneyRole(service, transactionId, transferAttorney) {
  const nowIso = new Date().toISOString()
  const { error } = await service.from('transaction_role_players').insert({
    id: crypto.randomUUID(),
    transaction_id: transactionId,
    role_type: 'cancellation_attorney',
    selection_source: 'connected_partner',
    partner_name: transferAttorney.partner.companyName,
    contact_person: transferAttorney.partner.contactPerson,
    email_address: transferAttorney.partner.email,
    organisation_id: transferAttorney.partnerOrganisationId,
    workspace_unit_id: transferAttorney.workspaceUnitId,
    branch_id: transferAttorney.branchId,
    user_id: transferAttorney.userId,
    status: 'active',
    assignment_status: 'active',
    activation_trigger: 'phase4_smoke',
    activated_at: nowIso,
    snapshot_json: {
      source: 'phase4_seller_bridge_smoke',
      roleType: 'cancellation_attorney',
    },
    created_at: nowIso,
    updated_at: nowIso,
  })
  if (error && error.code !== '23505') throw error
}

async function fetchLatestPrivateListingDoc(service, listingId, name) {
  return maybeSingle(
    `private listing doc ${name}`,
    service
      .from('private_listing_documents')
      .select('*')
      .eq('private_listing_id', listingId)
      .eq('document_name', name)
      .order('uploaded_at', { ascending: false })
      .limit(1),
  )
}

async function fetchPromotedDoc(service, sourceDocumentId) {
  return maybeSingle(
    `promoted doc ${sourceDocumentId}`,
    service
      .from('documents')
      .select('*')
      .eq('source', 'seller_portal')
      .eq('source_document_id', sourceDocumentId)
      .limit(1),
  )
}

async function countPromotedDocs(service, sourceDocumentId) {
  const { count, error } = await service
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'seller_portal')
    .eq('source_document_id', sourceDocumentId)
  if (error) throw error
  return count || 0
}

async function loadNotifications(service, transactionId, prefix = '') {
  let query = service
    .from('transaction_notifications')
    .select('id, role_type, title, message, dedupe_key, event_type, event_data, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true })
  if (prefix) query = query.ilike('dedupe_key', `${prefix}%`)
  return queryRequired(`notifications ${prefix}`, query)
}

async function loadBuyerLink(service, transactionId, buyerId, developmentId) {
  const token = `phase4-${crypto.randomUUID().replaceAll('-', '')}`
  const row = await maybeSingle(
    'existing buyer link',
    service
      .from('client_portal_links')
      .select('*')
      .eq('transaction_id', transactionId)
      .eq('is_active', true)
      .limit(1),
  )
  if (row?.token) return row
  const { data, error } = await service
    .from('client_portal_links')
    .insert({
      development_id: developmentId,
      unit_id: null,
      transaction_id: transactionId,
      buyer_id: buyerId,
      token,
      is_active: true,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

function summarizeDocuments(documents = []) {
  return documents.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    document_type: item.document_type,
    visibility_scope: item.visibility_scope,
    bucket_key: item.bucket_key,
    file_bucket: item.file_bucket,
    source: item.source,
    uploaded_by_party: item.uploaded_by_party,
    has_url: Boolean(item.url),
  }))
}

const env = loadEnv()
const config = requireConfig(env)
const service = createServiceClient(config)

const { supabase } = await import('../src/lib/supabaseClient.js')
const {
  createTransactionFromWizard,
  createExternalAccessLink,
  fetchExternalTransactionPortal,
  fetchClientPortalByToken,
  fetchTransactionById,
  fetchTransactionsByParticipant,
  uploadClientPortalDocument,
} = await import('../src/lib/api.js')
const {
  createPrivateListing,
  getSellerOnboardingByToken,
  sendSellerOnboarding,
  uploadSellerClientPortalDocument,
} = await import('../src/services/privateListingService.js')

const actor = await resolveActorContext(service, config.actorEmail)
const transferAttorney = await resolveTransferAttorney(service, actor)
const bondOriginator = await resolveBondOriginator(service, config)
const buyerDevelopmentId = await ensureDevelopmentId(service)

await signInSupabaseApp(supabase, config.actorEmail, config.actorPassword)

const listingResult = await createPrivateListing({
  origin: 'phase4_smoke',
  source: 'phase4_smoke',
  title: `${RUN_ID} Seller Portal Listing`,
  propertyType: 'house',
  listingCategory: 'sale',
  addressLine1: `${RUN_ID} Seller Smoke Street`,
  suburb: 'Staging',
  city: 'Johannesburg',
  province: 'Gauteng',
  postalCode: '2000',
  sellerType: 'individual',
  sellerName: `Seller ${RUN_ID}`,
  sellerEmail: `${RUN_ID}@example.test`,
  sellerPhone: '+27000000000',
  askingPrice: 1850000,
  sellerOnboardingStatus: 'not_started',
})
const listing = listingResult.listing
assert.ok(listing?.id, 'listing should be created')

const onboarding = await sendSellerOnboarding(listing.id, {
  sellerContactEmail: `${RUN_ID}@example.test`,
  sellerContactPhone: '+27000000000',
})
assert.ok(onboarding?.token, 'seller onboarding token should exist')

const txCreate = await createTransactionFromWizard({
  setup: {
    transactionType: 'private_property',
    propertyType: 'residential',
    propertyAddressLine1: `${RUN_ID} Transaction Smoke Street`,
    suburb: 'Staging',
    city: 'Johannesburg',
    province: 'Gauteng',
    postalCode: '2000',
    buyerName: `Buyer ${RUN_ID}`,
    buyerEmail: `${RUN_ID}-buyer@example.test`,
    buyerPhone: '+27000000001',
    sellerName: `Seller ${RUN_ID}`,
    sellerEmail: `${RUN_ID}@example.test`,
    sellerPhone: '+27000000000',
    financeType: 'bond',
    financeManagedBy: 'bond_originator',
    assignedAgent: actor.profile?.full_name || actor.email,
    assignedAgentEmail: actor.email,
    assignedBranchId: actor.branchId,
    accessLevel: 'shared',
    purchasePrice: 1850000,
  },
  finance: {
    attorney: transferAttorney.partner.companyName,
    attorneyEmail: transferAttorney.partner.email,
    bondOriginator: bondOriginator.partner.companyName,
    bondOriginatorEmail: bondOriginator.partner.email,
    bondAmount: 1480000,
    depositAmount: 185000,
    nextAction: 'Phase 4 seller bridge staging validation.',
  },
  status: {
    stage: 'Reserved',
    mainStage: 'OTP',
    riskStatus: 'On Track',
    nextAction: 'Phase 4 seller bridge staging validation.',
  },
  options: {
    allowIncomplete: false,
    creationOrigin: 'phase4_seller_bridge_smoke',
    sourceContext: {
      originLabel: 'phase4_seller_bridge_smoke',
      organisationId: actor.organisationId,
      branchId: actor.branchId,
      workspaceId: actor.organisationId,
    },
    rolePlayers: [transferAttorney, bondOriginator],
  },
})
const transactionId = txCreate?.transactionId || txCreate?.transaction?.id || txCreate?.id
assert.ok(transactionId, 'transaction should be created')

await addCancellationAttorneyRole(service, transactionId, transferAttorney)

const transactionRow = await maybeSingle(
  'created transaction',
  service.from('transactions').select('id,buyer_id').eq('id', transactionId),
)
assert.ok(transactionRow?.buyer_id, 'transaction buyer should exist')

const { error: linkListingError } = await service
  .from('transactions')
  .update({ listing_id: listing.id, updated_at: new Date().toISOString() })
  .eq('id', transactionId)
if (linkListingError) throw linkListingError

const requiredKey = 'rates_clearance_certificate'
const financeKey = 'bond_cancellation_notice'
await queryRequired(
  'disable existing required docs',
  service
    .from('transaction_required_documents')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('transaction_id', transactionId)
    .select('id'),
)
await upsertTransactionRequiredDocument(service, transactionId, requiredKey, 'Rates clearance certificate')

await queryRequired(
  'set transaction onboarding submitted',
  service
    .from('transaction_onboarding')
    .upsert({
      transaction_id: transactionId,
      status: 'Submitted',
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'transaction_id' })
    .select('transaction_id'),
)

const requestRow = await insertDocumentRequest(
  service,
  transactionId,
  actor.userId,
  'Rates clearance certificate',
  requiredKey,
  'attorney',
)

const attorneyExternal = await createExternalAccessLink({
  transactionId,
  buyerId: transactionRow.buyer_id,
  email: `${RUN_ID}-attorney@example.test`,
  role: 'attorney',
  expiresDays: 14,
})
const bondExternal = await createExternalAccessLink({
  transactionId,
  buyerId: transactionRow.buyer_id,
  email: `${RUN_ID}-bond@example.test`,
  role: 'bond_originator',
  expiresDays: 14,
})

const buyerLink = await loadBuyerLink(service, transactionId, transactionRow.buyer_id, buyerDevelopmentId)

await signOutSupabaseApp(supabase)

const transferFile = new File([Buffer.from(`${RUN_ID} transfer document`)], `${RUN_ID}-rates-clearance.txt`, { type: 'text/plain' })
const transferUpload = await uploadSellerClientPortalDocument({
  token: onboarding.token,
  file: transferFile,
  requirementKey: requiredKey,
  documentType: requiredKey,
  category: 'Rates clearance certificate',
})
assert.ok(transferUpload?.document?.id, 'seller transfer upload should create private listing document')

const financeFile = new File([Buffer.from(`${RUN_ID} finance document`)], `${RUN_ID}-bond-cancellation.txt`, { type: 'text/plain' })
const financeUpload = await uploadSellerClientPortalDocument({
  token: onboarding.token,
  file: financeFile,
  requirementKey: financeKey,
  documentType: financeKey,
  category: 'Bond cancellation notice',
})
assert.ok(financeUpload?.document?.id, 'seller finance upload should create private listing document')

const privateTransferDoc = await fetchLatestPrivateListingDoc(service, listing.id, transferFile.name)
const promotedTransferDoc = await fetchPromotedDoc(service, privateTransferDoc.id)
const privateFinanceDoc = await fetchLatestPrivateListingDoc(service, listing.id, financeFile.name)
const promotedFinanceDoc = await fetchPromotedDoc(service, privateFinanceDoc.id)

assert.equal(promotedTransferDoc?.transaction_id, transactionId, 'promoted transfer doc should target transaction')
assert.equal(promotedTransferDoc?.source, 'seller_portal', 'promoted transfer doc should carry seller_portal source')
assert.equal(promotedTransferDoc?.source_document_id, privateTransferDoc.id, 'promoted transfer doc should point back to private listing doc')
assert.equal(promotedTransferDoc?.file_bucket, 'documents', 'promoted transfer doc should preserve bucket metadata')
assert.equal(privateTransferDoc?.pending_transaction_promotion, false, 'promoted transfer doc should not remain pending')

const transferDocCountAfterUpload = await countPromotedDocs(service, privateTransferDoc.id)
assert.equal(transferDocCountAfterUpload, 1, 'seller transfer upload should be idempotently promoted once')

const requestAfterUpload = await maybeSingle(
  'document request after seller upload',
  service.from('document_requests').select('*').eq('id', requestRow.id),
)
const requiredAfterUpload = await maybeSingle(
  'required doc after seller upload',
  service
    .from('transaction_required_documents')
    .select('*')
    .eq('transaction_id', transactionId)
    .eq('document_key', requiredKey),
)
const readinessAfterUpload = await maybeSingle(
  'readiness state',
  service.from('transaction_readiness_states').select('*').eq('transaction_id', transactionId),
)

const uploadNotifications = await loadNotifications(service, transactionId, `seller-doc-upload:${privateTransferDoc.id}`)
const laneNotifications = await loadNotifications(service, transactionId, 'seller-doc-ready:')

await signInSupabaseApp(supabase, config.actorEmail, config.actorPassword)
const agentInternalView = await fetchTransactionById(transactionId)

await signInSupabaseApp(supabase, config.bondEmail, config.bondPassword)
const bondParticipantList = await fetchTransactionsByParticipant({
  userId: bondOriginator.userId,
  roleType: 'bond_originator',
})
const bondInternalView = await fetchTransactionById(transactionId)

await signInSupabaseApp(supabase, config.actorEmail, config.actorPassword)
const attorneyExternalView = await fetchExternalTransactionPortal(attorneyExternal.access_token)
const bondExternalView = await fetchExternalTransactionPortal(bondExternal.access_token)
const sellerView = await getSellerOnboardingByToken(onboarding.token, { includeRequirementsAndDocuments: true })
const buyerPortalBeforeBuyerUpload = await fetchClientPortalByToken(buyerLink.token)

const buyerFile = new File([Buffer.from(`${RUN_ID} buyer document`)], `${RUN_ID}-buyer-id.txt`, { type: 'text/plain' })
const buyerUpload = await uploadClientPortalDocument({
  token: buyerLink.token,
  file: buyerFile,
  category: 'Buyer ID document',
  documentType: 'buyer_id_document',
})
assert.ok(buyerUpload?.id, 'buyer upload should create a shared document row')
const buyerPortalAfterBuyerUpload = await fetchClientPortalByToken(buyerLink.token)

const buyerDocumentRow = await maybeSingle(
  'buyer document row',
  service
    .from('documents')
    .select('*')
    .eq('id', buyerUpload.id),
)

const buyerNotifications = await loadNotifications(service, transactionId)
const buyerUploadNotification = buyerNotifications.find(
  (row) => row.event_type === 'DocumentUploaded' && String(row?.event_data?.documentId || '') === String(buyerUpload.id),
)

const pendingListingResult = await createPrivateListing({
  origin: 'phase4_pending_smoke',
  source: 'phase4_pending_smoke',
  title: `${RUN_ID} Pending Promotion Listing`,
  propertyType: 'house',
  listingCategory: 'sale',
  addressLine1: `${RUN_ID} Pending Smoke Street`,
  suburb: 'Staging',
  city: 'Johannesburg',
  province: 'Gauteng',
  postalCode: '2000',
  sellerType: 'individual',
  sellerName: `Pending Seller ${RUN_ID}`,
  sellerEmail: `${RUN_ID}-pending@example.test`,
  sellerPhone: '+27000000002',
  askingPrice: 950000,
})
const pendingListing = pendingListingResult.listing
const pendingOnboarding = await sendSellerOnboarding(pendingListing.id, {
  sellerContactEmail: `${RUN_ID}-pending@example.test`,
  sellerContactPhone: '+27000000002',
})

await signOutSupabaseApp(supabase)
const pendingFile = new File([Buffer.from(`${RUN_ID} pending document`)], `${RUN_ID}-pending-rates-clearance.txt`, { type: 'text/plain' })
const pendingUpload = await uploadSellerClientPortalDocument({
  token: pendingOnboarding.token,
  file: pendingFile,
  requirementKey: requiredKey,
  documentType: requiredKey,
  category: 'Rates clearance certificate',
})
const pendingPrivateDoc = await fetchLatestPrivateListingDoc(service, pendingListing.id, pendingFile.name)
const pendingPromotedBefore = await fetchPromotedDoc(service, pendingPrivateDoc.id)

await signInSupabaseApp(supabase, config.actorEmail, config.actorPassword)
const pendingTxCreate = await createTransactionFromWizard({
  setup: {
    transactionType: 'private_property',
    propertyType: 'residential',
    propertyAddressLine1: `${RUN_ID} Pending Promotion Transaction Street`,
    suburb: 'Staging',
    city: 'Johannesburg',
    province: 'Gauteng',
    postalCode: '2000',
    buyerName: `Pending Buyer ${RUN_ID}`,
    buyerEmail: `${RUN_ID}-pending-buyer@example.test`,
    buyerPhone: '+27000000003',
    sellerName: `Pending Seller ${RUN_ID}`,
    sellerEmail: `${RUN_ID}-pending@example.test`,
    sellerPhone: '+27000000002',
    financeType: 'cash',
    financeManagedBy: 'cash',
    assignedAgent: actor.profile?.full_name || actor.email,
    assignedAgentEmail: actor.email,
    assignedBranchId: actor.branchId,
    accessLevel: 'shared',
    purchasePrice: 950000,
  },
  finance: {
    attorney: transferAttorney.partner.companyName,
    attorneyEmail: transferAttorney.partner.email,
    nextAction: 'Pending promotion smoke transaction.',
  },
  status: {
    stage: 'Reserved',
    mainStage: 'OTP',
    riskStatus: 'On Track',
    nextAction: 'Pending promotion smoke transaction.',
  },
  options: {
    allowIncomplete: false,
    creationOrigin: 'phase4_pending_promotion_smoke',
    sourceContext: {
      originLabel: 'phase4_pending_promotion_smoke',
      organisationId: actor.organisationId,
      branchId: actor.branchId,
      workspaceId: actor.organisationId,
    },
    rolePlayers: [transferAttorney],
  },
})
const pendingTransactionId = pendingTxCreate?.transactionId || pendingTxCreate?.transaction?.id || pendingTxCreate?.id
assert.ok(pendingTransactionId, 'pending promotion transaction should be created')

await queryRequired(
  'link pending transaction to listing',
  service
    .from('transactions')
    .update({ listing_id: pendingListing.id, updated_at: new Date().toISOString() })
    .eq('id', pendingTransactionId)
    .select('id'),
)
await queryRequired(
  'set pending onboarding submitted',
  service
    .from('transaction_onboarding')
    .upsert({
      transaction_id: pendingTransactionId,
      status: 'Submitted',
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'transaction_id' })
    .select('transaction_id'),
)
await queryRequired(
  'disable pending existing required docs',
  service
    .from('transaction_required_documents')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('transaction_id', pendingTransactionId)
    .select('id'),
)
await upsertTransactionRequiredDocument(service, pendingTransactionId, requiredKey, 'Rates clearance certificate')

const pendingNotificationsBefore = await loadNotifications(service, pendingTransactionId)
await fetchTransactionById(pendingTransactionId)
const pendingPromotedAfter = await fetchPromotedDoc(service, pendingPrivateDoc.id)
const pendingPrivateDocAfter = await fetchLatestPrivateListingDoc(service, pendingListing.id, pendingFile.name)
const pendingNotificationsAfterFirst = await loadNotifications(service, pendingTransactionId)
await fetchTransactionById(pendingTransactionId)
const pendingNotificationsAfterSecond = await loadNotifications(service, pendingTransactionId)
const pendingPromotedCount = await countPromotedDocs(service, pendingPrivateDoc.id)

const result = {
  ok: true,
  runId: RUN_ID,
  appliedProjectRef: STAGING_PROJECT_REF,
  fixtures: {
    listingId: listing.id,
    transactionId,
    buyerId: transactionRow.buyer_id,
    sellerOnboardingToken: onboarding.token,
    buyerPortalToken: buyerLink.token,
    attorneyExternalToken: attorneyExternal.access_token,
    bondExternalToken: bondExternal.access_token,
    pendingListingId: pendingListing.id,
    pendingTransactionId,
    pendingSellerToken: pendingOnboarding.token,
  },
  sellerUpload: {
    privateListingDocument: {
      id: privateTransferDoc.id,
      storage_path: privateTransferDoc.storage_path,
      pending_transaction_promotion: privateTransferDoc.pending_transaction_promotion,
    },
    promotedDocument: {
      id: promotedTransferDoc.id,
      transaction_id: promotedTransferDoc.transaction_id,
      source: promotedTransferDoc.source,
      source_document_id: promotedTransferDoc.source_document_id,
      file_bucket: promotedTransferDoc.file_bucket,
      file_path: promotedTransferDoc.file_path,
      bucket_key: promotedTransferDoc.bucket_key,
      visibility_scope: promotedTransferDoc.visibility_scope,
    },
    financeDocument: {
      privateListingDocumentId: privateFinanceDoc.id,
      promotedId: promotedFinanceDoc?.id || null,
      bucket_key: promotedFinanceDoc?.bucket_key || null,
      visibility_scope: promotedFinanceDoc?.visibility_scope || null,
    },
    duplicatePromotionCount: transferDocCountAfterUpload,
  },
  requestAndReadiness: {
    documentRequest: requestAfterUpload
      ? {
          id: requestAfterUpload.id,
          status: requestAfterUpload.status,
          review_status: requestAfterUpload.review_status || null,
          uploaded_document_id: requestAfterUpload.uploaded_document_id || null,
          linked_document_id: requestAfterUpload.linked_document_id || null,
          assigned_to_role: requestAfterUpload.assigned_to_role,
        }
      : null,
    transactionRequiredDocument: requiredAfterUpload
      ? {
          id: requiredAfterUpload.id,
          status: requiredAfterUpload.status,
          is_uploaded: requiredAfterUpload.is_uploaded,
          uploaded_document_id: requiredAfterUpload.uploaded_document_id || null,
          enabled: requiredAfterUpload.enabled,
        }
      : null,
    readiness: readinessAfterUpload
      ? {
          onboarding_status: readinessAfterUpload.onboarding_status,
          onboarding_complete: readinessAfterUpload.onboarding_complete,
          docs_complete: readinessAfterUpload.docs_complete,
          finance_lane_ready: readinessAfterUpload.finance_lane_ready,
          attorney_lane_ready: readinessAfterUpload.attorney_lane_ready,
          stage_ready: readinessAfterUpload.stage_ready,
          missing_required_docs: readinessAfterUpload.missing_required_docs,
          uploaded_required_docs: readinessAfterUpload.uploaded_required_docs,
          total_required_docs: readinessAfterUpload.total_required_docs,
        }
      : null,
  },
  notifications: {
    sellerUploadNotificationCount: uploadNotifications.length,
    sellerUploadRoles: uploadNotifications.map((row) => row.role_type),
    laneNotificationTitles: laneNotifications.map((row) => row.title),
    buyerUploadNotificationFound: Boolean(buyerUploadNotification),
  },
  visibility: {
    agentInternalDocs: summarizeDocuments(agentInternalView?.documents || []),
    bondParticipantSeesTransaction: (bondParticipantList || []).some((row) => row?.id === transactionId),
    bondInternalDocs: summarizeDocuments(bondInternalView?.documents || []),
    attorneyExternalDocs: summarizeDocuments(attorneyExternalView?.documents || []),
    bondExternalDocs: summarizeDocuments(bondExternalView?.documents || []),
    sellerPortalDocs: summarizeDocuments(sellerView?.listing?.documents || []),
    buyerPortalDocsBeforeBuyerUpload: summarizeDocuments(buyerPortalBeforeBuyerUpload?.documents || []),
    buyerPortalDocsAfterBuyerUpload: summarizeDocuments(buyerPortalAfterBuyerUpload?.documents || []),
  },
  buyerRegression: {
    buyerUploadDocument: {
      id: buyerUpload.id,
      transaction_id: buyerDocumentRow?.transaction_id || null,
      visibility_scope: buyerDocumentRow?.visibility_scope || null,
      source: buyerDocumentRow?.source || null,
      name: buyerDocumentRow?.name || null,
    },
  },
  pendingPromotion: {
    uploadReturnedPending: Boolean(pendingUpload?.pendingTransactionPromotion),
    pendingBeforeLink: {
      privateListingDocumentId: pendingPrivateDoc.id,
      pending_transaction_promotion: pendingPrivateDoc.pending_transaction_promotion,
      promoted_document_id: pendingPrivateDoc.promoted_document_id || null,
      promotedDocumentExists: Boolean(pendingPromotedBefore?.id),
    },
    afterWorkspaceOpen: {
      pending_transaction_promotion: pendingPrivateDocAfter?.pending_transaction_promotion,
      promoted_document_id: pendingPrivateDocAfter?.promoted_document_id || null,
      promotedDocumentId: pendingPromotedAfter?.id || null,
      promotedDocumentCount: pendingPromotedCount,
      notificationsBefore: pendingNotificationsBefore.length,
      notificationsAfterFirstOpen: pendingNotificationsAfterFirst.length,
      notificationsAfterSecondOpen: pendingNotificationsAfterSecond.length,
    },
  },
}

console.log(JSON.stringify(result, null, 2))
