import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const RUN_ID = `seller-raw-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`

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
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value)))
  const merged = Object.fromEntries(
    Object.entries({
      ...parseEnvFile('.env'),
      ...parseEnvFile('.env.staging.local'),
      ...processOverrides,
    }).map(([key, value]) => [key, cleanEnvValue(value)]),
  )
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
    throw new Error('Missing staging config.')
  }
  if (projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF) {
    throw new Error('Refusing to run outside staging.')
  }
  return { supabaseUrl, serviceRoleKey, anonKey, actorEmail, actorPassword, bondEmail, bondPassword }
}

function createServiceClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

function createAnonClient(config, headers = {}) {
  return createClient(config.supabaseUrl, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers },
  })
}

async function queryRequired(label, query) {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

async function maybeSingle(label, query) {
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

async function signInClient(config, email, password) {
  const client = createAnonClient(config)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
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
  const profiles = await queryRequired('profile lookup', service.from('profiles').select('id,email').eq('email', email).limit(1))
  return profiles?.[0]?.id || null
}

async function resolveActorContext(service, email) {
  const userId = await getAuthUserId(service, email)
  const profile = await maybeSingle('actor profile', service.from('profiles').select('*').eq('id', userId))
  const memberships = await queryRequired(
    'actor memberships',
    service.from('organisation_users').select('*').or(`user_id.eq.${userId},email.eq.${email}`).limit(20),
  )
  const membership =
    memberships.find((row) => ['active', 'accepted'].includes(normalizeText(row.status).toLowerCase())) ||
    memberships[0]
  if (!membership?.organisation_id) throw new Error('Could not resolve actor membership.')
  return {
    userId,
    email,
    profile,
    organisationId: membership.organisation_id,
    branchId: membership.branch_id || membership.primary_branch_id || null,
  }
}

async function resolveTransferAttorney(service, actor) {
  const memberRows = await queryRequired(
    'attorney members',
    service.from('attorney_firm_members').select('*').eq('user_id', actor.userId).limit(10),
  )
  const member = memberRows.find((row) => ['active', 'accepted'].includes(normalizeText(row.status).toLowerCase())) || memberRows[0]
  const firm = await maybeSingle('attorney firm', service.from('attorney_firms').select('*').eq('id', member.firm_id))
  return {
    userId: member.user_id || actor.userId,
    email: actor.email,
    firmId: firm.id,
    organisationId: firm.organisation_id || firm.backing_organisation_id || actor.organisationId,
    workspaceUnitId: member.workspace_unit_id || null,
    branchId: member.branch_id || null,
    companyName: firm.name || firm.display_name || 'Staging Transfer Attorneys',
  }
}

async function resolveBondOriginator(service, config) {
  const memberships = await queryRequired(
    'bond memberships',
    service.from('organisation_users').select('*').eq('email', config.bondEmail).limit(20),
  )
  const membership =
    memberships.find((row) => ['active', 'accepted'].includes(normalizeText(row.status).toLowerCase())) ||
    memberships[0]
  const userId = membership.user_id || (await getAuthUserId(service, config.bondEmail))
  return {
    userId,
    email: config.bondEmail,
    organisationId: membership.organisation_id,
    workspaceUnitId: membership.workspace_unit_id || null,
    branchId: membership.branch_id || membership.primary_branch_id || null,
  }
}

async function resolveExistingBuyerLink(service) {
  return maybeSingle(
    'existing buyer link',
    service
      .from('client_portal_links')
      .select('id,development_id,unit_id,transaction_id,buyer_id,token')
      .eq('is_active', true)
      .not('development_id', 'is', null)
      .not('unit_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1),
  )
}

async function uploadFile(service, path, contents) {
  const bytes = Buffer.from(contents, 'utf8')
  const { error } = await service.storage.from('documents').upload(path, bytes, {
    contentType: 'text/plain',
    upsert: false,
  })
  if (error) throw error
}

async function selectDocs(client, transactionId) {
  const { data, error } = await client
    .from('documents')
    .select('id, transaction_id, name, file_path, category, document_type, visibility_scope, is_client_visible, bucket_key, file_bucket, source, source_document_id, uploaded_by_party, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true })
  if (error) return { error: error.message, rows: [] }
  return { error: null, rows: data || [] }
}

async function trySignedUrl(client, path, bucket = 'documents') {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60)
  return { ok: !error && Boolean(data?.signedUrl), error: error?.message || null }
}

function docNames(rows = []) {
  return rows.map((row) => row.name)
}

const env = loadEnv()
const config = requireConfig(env)
const service = createServiceClient(config)
const actor = await resolveActorContext(service, config.actorEmail)
const transferAttorney = await resolveTransferAttorney(service, actor)
const bondOriginator = await resolveBondOriginator(service, config)
const existingBuyerLink = await resolveExistingBuyerLink(service)

const listingId = crypto.randomUUID()
const onboardingToken = `seller-${crypto.randomUUID().replaceAll('-', '')}`
const buyerId = crypto.randomUUID()
const transactionId = crypto.randomUUID()
const buyerPortalToken = existingBuyerLink.token
const attorneyExternalToken = `tx${crypto.randomUUID().replaceAll('-', '')}`
const bondExternalToken = `tx${crypto.randomUUID().replaceAll('-', '')}`
const nowIso = new Date().toISOString()

await queryRequired(
  'insert listing',
  service
    .from('private_listings')
    .insert({
      id: listingId,
      organisation_id: actor.organisationId,
      branch_id: actor.branchId,
      created_by: actor.userId,
      listing_reference: `PL-${RUN_ID}`,
      listing_status: 'onboarding_sent',
      listing_visibility: 'internal',
      property_category: 'residential',
      listing_source: 'private_listing',
      property_structure_type: 'other',
      property_type: 'house',
      listing_category: 'private_sale',
      title: `${RUN_ID} Listing`,
      asking_price: 1850000,
      address_line_1: `${RUN_ID} Listing Street`,
      suburb: 'Staging',
      city: 'Johannesburg',
      province: 'Gauteng',
      postal_code: '2000',
      seller_type: 'individual',
      mandate_type: 'sole',
      mandate_status: 'not_started',
      seller_onboarding_status: 'sent',
      is_active: false,
    })
    .select('id'),
)

await queryRequired(
  'insert seller onboarding',
  service
    .from('private_listing_seller_onboarding')
    .insert({
      private_listing_id: listingId,
      token: onboardingToken,
      token_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'sent',
      form_data: {},
      submitted_at: null,
    })
    .select('private_listing_id'),
)

await queryRequired(
  'insert buyer',
  service
    .from('buyers')
    .insert({
      id: buyerId,
      name: `Buyer ${RUN_ID}`,
      email: `${RUN_ID}-buyer@example.test`,
      phone: '+27000000001',
    })
    .select('id'),
)

await queryRequired(
  'insert transaction',
  service
    .from('transactions')
    .insert({
      id: transactionId,
      organisation_id: actor.organisationId,
      assigned_branch_id: actor.branchId,
      assigned_user_id: actor.userId,
      owner_user_id: actor.userId,
      buyer_id: buyerId,
      listing_id: listingId,
      transaction_reference: `TX-${RUN_ID}`,
      matter_number: `MAT-${RUN_ID}`,
      transaction_type: 'private_property',
      property_type: 'residential',
      property_address_line_1: `${RUN_ID} Transaction Street`,
      suburb: 'Staging',
      city: 'Johannesburg',
      province: 'Gauteng',
      purchaser_type: 'individual',
      finance_type: 'bond',
      finance_managed_by: 'bond_originator',
      purchase_price: 1850000,
      sales_price: 1850000,
      bond_amount: 1480000,
      deposit_amount: 185000,
      seller_name: `Seller ${RUN_ID}`,
      seller_email: `${RUN_ID}@example.test`,
      seller_phone: '+27000000000',
      stage: 'Reserved',
      current_main_stage: 'OTP',
      risk_status: 'On Track',
      attorney: transferAttorney.companyName,
      assigned_attorney_email: transferAttorney.email,
      bond_originator: 'Bond Originator',
      assigned_bond_originator_email: bondOriginator.email,
      assigned_agent: actor.profile?.full_name || actor.email,
      assigned_agent_email: actor.email,
      access_level: 'shared',
      is_active: true,
      updated_at: nowIso,
      created_at: nowIso,
    })
    .select('id'),
)

await queryRequired(
  'insert transaction onboarding',
  service
    .from('transaction_onboarding')
    .insert({
      transaction_id: transactionId,
      token: `onb-${crypto.randomUUID().replaceAll('-', '')}`,
      status: 'Submitted',
      purchaser_type: 'individual',
      is_active: true,
      updated_at: nowIso,
      created_at: nowIso,
    })
    .select('transaction_id'),
)

await queryRequired(
  'insert required doc',
  service
    .from('transaction_required_documents')
    .insert({
      transaction_id: transactionId,
      document_key: 'rates_clearance_certificate',
      document_label: 'Rates clearance certificate',
      is_required: true,
      is_uploaded: false,
      status: 'requested',
      enabled: true,
      group_key: 'seller_phase4',
      group_label: 'Seller phase4',
      required_from_role: 'seller',
      visibility_scope: 'internal',
      allow_multiple: false,
      sort_order: 1,
      updated_at: nowIso,
      created_at: nowIso,
    })
    .select('transaction_id'),
)

await queryRequired(
  'insert document request',
  service
    .from('document_requests')
    .insert({
      transaction_id: transactionId,
      category: 'transfer',
      document_type: 'rates_clearance_certificate',
      title: 'Rates clearance certificate',
      description: 'Phase 4 seller staging validation request',
      priority: 'required',
      assigned_to_role: 'attorney',
      status: 'requested',
      requires_review: true,
      visibility_scope: 'professional_shared',
      created_by: actor.userId,
      created_by_role: 'attorney',
      lane_key: 'transfer',
      attorney_role: 'transfer_attorney',
      requested_from: 'seller',
      requested_by: actor.userId,
      review_status: 'requested',
      created_at: nowIso,
    })
    .select('id'),
)

await queryRequired(
  'insert transfer roleplayer',
  service
    .from('transaction_role_players')
    .insert({
      id: crypto.randomUUID(),
      transaction_id: transactionId,
      role_type: 'transfer_attorney',
      selection_source: 'connected_partner',
      partner_name: transferAttorney.companyName,
      contact_person: transferAttorney.email,
      email_address: transferAttorney.email,
      organisation_id: transferAttorney.organisationId,
      workspace_unit_id: transferAttorney.workspaceUnitId,
      branch_id: transferAttorney.branchId,
      user_id: transferAttorney.userId,
      status: 'active',
      assignment_status: 'active',
      activated_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id'),
)

await queryRequired(
  'insert bond roleplayer',
  service
    .from('transaction_role_players')
    .insert({
      id: crypto.randomUUID(),
      transaction_id: transactionId,
      role_type: 'bond_originator',
      selection_source: 'connected_partner',
      partner_name: 'Bond Originator',
      contact_person: bondOriginator.email,
      email_address: bondOriginator.email,
      organisation_id: bondOriginator.organisationId,
      workspace_unit_id: bondOriginator.workspaceUnitId,
      branch_id: bondOriginator.branchId,
      user_id: bondOriginator.userId,
      status: 'active',
      assignment_status: 'active',
      activated_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id'),
)

await queryRequired(
  'insert attorney participant',
  service
    .from('transaction_participants')
    .insert({
      id: crypto.randomUUID(),
      transaction_id: transactionId,
      role_type: 'attorney',
      legal_role: 'transfer',
      participant_email: transferAttorney.email,
      participant_name: transferAttorney.companyName,
      user_id: transferAttorney.userId,
      status: 'active',
      visibility_scope: 'shared',
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id'),
)

await queryRequired(
  'insert bond participant',
  service
    .from('transaction_participants')
    .insert({
      id: crypto.randomUUID(),
      transaction_id: transactionId,
      role_type: 'bond_originator',
      legal_role: 'none',
      participant_email: bondOriginator.email,
      participant_name: 'Bond Originator',
      user_id: bondOriginator.userId,
      status: 'active',
      visibility_scope: 'shared',
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id'),
)

await queryRequired(
  'insert attorney assignment',
  service
    .from('transaction_attorney_assignments')
    .insert({
      id: crypto.randomUUID(),
      transaction_id: transactionId,
      firm_id: transferAttorney.firmId,
      attorney_firm_id: transferAttorney.firmId,
      assignment_type: 'transfer',
      attorney_role: 'transfer_attorney',
      primary_attorney_id: transferAttorney.userId,
      attorney_user_id: transferAttorney.userId,
      status: 'active',
      assignment_status: 'active',
      matter_type: 'transfer',
      instruction_status: 'new_instruction',
      is_primary: true,
      visibility_scope: 'assigned_matter',
      assigned_organisation_id: transferAttorney.organisationId,
      assigned_workspace_unit_id: transferAttorney.workspaceUnitId,
      assigned_branch_id: transferAttorney.branchId,
      assigned_user_id: transferAttorney.userId,
      assigned_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id'),
)

const workflowId = crypto.randomUUID()
await queryRequired(
  'insert finance workflow',
  service
    .from('transaction_finance_workflows')
    .insert({
      id: workflowId,
      transaction_id: transactionId,
      workflow_type: 'bond_hybrid',
      current_stage: 'documents_received',
      status: 'active',
      last_updated_by: actor.userId,
      last_updated_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id'),
)

await queryRequired(
  'insert bond application',
  service
    .from('transaction_bond_applications')
    .insert({
      id: crypto.randomUUID(),
      transaction_id: transactionId,
      workflow_id: workflowId,
      bank_name: 'Bond Originator Intake',
      status: 'pending',
      buyer_party_id: buyerId,
      application_type: 'originator_intake',
      assigned_organisation_id: bondOriginator.organisationId,
      assigned_workspace_unit_id: bondOriginator.workspaceUnitId,
      assigned_branch_id: bondOriginator.branchId,
      assigned_user_id: bondOriginator.userId,
      notes: 'Phase 4 staging validation.',
      created_by: actor.userId,
      updated_by: actor.userId,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id'),
)

await queryRequired(
  'insert external attorney access',
  service
    .from('transaction_external_access')
    .insert({
      transaction_id: transactionId,
      buyer_id: buyerId,
      role: 'attorney',
      email: `${RUN_ID}-attorney@example.test`,
      access_token: attorneyExternalToken,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id'),
)

await queryRequired(
  'insert external bond access',
  service
    .from('transaction_external_access')
    .insert({
      transaction_id: transactionId,
      buyer_id: buyerId,
      role: 'bond_originator',
      email: `${RUN_ID}-bond@example.test`,
      access_token: bondExternalToken,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id'),
)

const anonClient = createAnonClient(config)
const transferFileName = `${RUN_ID}-rates-clearance.txt`
const transferPath = `seller-portal/${listingId}/${Date.now()}-${transferFileName}`
await uploadFile(service, transferPath, `${RUN_ID} transfer document`)
const { data: transferRpc, error: transferRpcError } = await anonClient.rpc('bridge_upload_private_listing_seller_document', {
  p_token: onboardingToken,
  p_requirement_key: 'rates_clearance_certificate',
  p_document_name: transferFileName,
  p_storage_path: transferPath,
  p_file_url: null,
  p_document_type: 'rates_clearance_certificate',
  p_category: 'Rates clearance certificate',
})
if (transferRpcError) throw transferRpcError

const financeFileName = `${RUN_ID}-bond-cancellation.txt`
const financePath = `seller-portal/${listingId}/${Date.now()}-${financeFileName}`
await uploadFile(service, financePath, `${RUN_ID} finance document`)
const { data: financeRpc, error: financeRpcError } = await anonClient.rpc('bridge_upload_private_listing_seller_document', {
  p_token: onboardingToken,
  p_requirement_key: 'bond_cancellation_notice',
  p_document_name: financeFileName,
  p_storage_path: financePath,
  p_file_url: null,
  p_document_type: 'bond_cancellation_notice',
  p_category: 'Bond cancellation notice',
})
if (financeRpcError) throw financeRpcError

const privateTransferDoc = await maybeSingle(
  'private transfer doc',
  service.from('private_listing_documents').select('*').eq('private_listing_id', listingId).eq('document_name', transferFileName).limit(1),
)
const privateFinanceDoc = await maybeSingle(
  'private finance doc',
  service.from('private_listing_documents').select('*').eq('private_listing_id', listingId).eq('document_name', financeFileName).limit(1),
)
const promotedTransfer = await maybeSingle(
  'promoted transfer',
  service.from('documents').select('*').eq('source', 'seller_portal').eq('source_document_id', privateTransferDoc.id).limit(1),
)
const promotedFinance = await maybeSingle(
  'promoted finance',
  service.from('documents').select('*').eq('source', 'seller_portal').eq('source_document_id', privateFinanceDoc.id).limit(1),
)

const actorClient = await signInClient(config, config.actorEmail, config.actorPassword)
const bondClient = await signInClient(config, config.bondEmail, config.bondPassword)
const buyerScopedClient = createAnonClient(config, { 'x-bridge-client-portal-token': buyerPortalToken })
const attorneyScopedClient = createAnonClient(config, { 'x-bridge-external-access-token': attorneyExternalToken })
const bondScopedClient = createAnonClient(config, { 'x-bridge-external-access-token': bondExternalToken })

const actorDocs = await selectDocs(actorClient, transactionId)
const bondDocs = await selectDocs(bondClient, transactionId)
const buyerDocsBefore = await selectDocs(buyerScopedClient, existingBuyerLink.transaction_id)
const attorneyExternalDocs = await selectDocs(attorneyScopedClient, transactionId)
const bondExternalDocs = await selectDocs(bondScopedClient, transactionId)

const buyerFileName = `${RUN_ID}-buyer-id.txt`
const buyerPath = `client-portal/${existingBuyerLink.transaction_id}/${Date.now()}-${buyerFileName}`
await uploadFile(service, buyerPath, `${RUN_ID} buyer document`)
const { data: buyerInsert, error: buyerInsertError } = await buyerScopedClient
  .from('documents')
    .insert({
    transaction_id: existingBuyerLink.transaction_id,
    name: buyerFileName,
    file_path: buyerPath,
    category: 'Buyer ID document',
    document_type: 'buyer_id_document',
    visibility_scope: 'shared',
    uploaded_by_user_id: null,
    stage_key: null,
    is_client_visible: true,
    uploaded_by_role: 'client',
    uploaded_by_email: `${RUN_ID}-buyer@example.test`,
  })
  .select('*')
  .single()
if (buyerInsertError) throw buyerInsertError

const buyerDocsAfter = await selectDocs(buyerScopedClient, existingBuyerLink.transaction_id)
const buyerDocSigned = await trySignedUrl(buyerScopedClient, buyerPath, 'documents')
const attorneyTransferSigned = await trySignedUrl(attorneyScopedClient, promotedTransfer.file_path, promotedTransfer.file_bucket || 'documents')
const bondFinanceSigned = await trySignedUrl(bondScopedClient, promotedFinance.file_path, promotedFinance.file_bucket || 'documents')

const requestAfter = await maybeSingle('request after', service.from('document_requests').select('*').eq('transaction_id', transactionId).eq('title', 'Rates clearance certificate').limit(1))
const requiredAfter = await maybeSingle('required after', service.from('transaction_required_documents').select('*').eq('transaction_id', transactionId).eq('document_key', 'rates_clearance_certificate').limit(1))
const readiness = await maybeSingle('readiness', service.from('transaction_readiness_states').select('*').eq('transaction_id', transactionId))
const sellerNotifications = await queryRequired(
  'seller notifications',
  service.from('transaction_notifications').select('role_type,title,dedupe_key,event_type').eq('transaction_id', transactionId).order('created_at', { ascending: true }),
)

const pendingListingId = crypto.randomUUID()
const pendingToken = `seller-${crypto.randomUUID().replaceAll('-', '')}`
await queryRequired(
  'insert pending listing',
  service
    .from('private_listings')
    .insert({
      id: pendingListingId,
      organisation_id: actor.organisationId,
      branch_id: actor.branchId,
      created_by: actor.userId,
      listing_reference: `PL-PENDING-${RUN_ID}`,
      listing_status: 'onboarding_sent',
      listing_visibility: 'internal',
      property_category: 'residential',
      listing_source: 'private_listing',
      property_structure_type: 'other',
      property_type: 'house',
      listing_category: 'private_sale',
      title: `${RUN_ID} Pending Listing`,
      asking_price: 950000,
      address_line_1: `${RUN_ID} Pending Street`,
      suburb: 'Staging',
      city: 'Johannesburg',
      province: 'Gauteng',
      postal_code: '2000',
      seller_type: 'individual',
      mandate_type: 'sole',
      mandate_status: 'not_started',
      seller_onboarding_status: 'sent',
      is_active: false,
    })
    .select('id'),
)
await queryRequired(
  'insert pending token',
  service
    .from('private_listing_seller_onboarding')
    .insert({
      private_listing_id: pendingListingId,
      token: pendingToken,
      token_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'sent',
      form_data: {},
    })
    .select('private_listing_id'),
)
const pendingFileName = `${RUN_ID}-pending-rates-clearance.txt`
const pendingPath = `seller-portal/${pendingListingId}/${Date.now()}-${pendingFileName}`
await uploadFile(service, pendingPath, `${RUN_ID} pending document`)
const { data: pendingRpc, error: pendingRpcError } = await anonClient.rpc('bridge_upload_private_listing_seller_document', {
  p_token: pendingToken,
  p_requirement_key: 'rates_clearance_certificate',
  p_document_name: pendingFileName,
  p_storage_path: pendingPath,
  p_file_url: null,
  p_document_type: 'rates_clearance_certificate',
  p_category: 'Rates clearance certificate',
})
if (pendingRpcError) throw pendingRpcError
const pendingPrivateDoc = await maybeSingle(
  'pending private doc',
  service.from('private_listing_documents').select('*').eq('private_listing_id', pendingListingId).eq('document_name', pendingFileName).limit(1),
)
const pendingBefore = await maybeSingle(
  'pending promoted before',
  service.from('documents').select('*').eq('source_document_id', pendingPrivateDoc.id).eq('source', 'seller_portal').limit(1),
)

const pendingBuyerId = crypto.randomUUID()
const pendingTransactionId = crypto.randomUUID()
await queryRequired('insert pending buyer', service.from('buyers').insert({ id: pendingBuyerId, name: `Pending Buyer ${RUN_ID}`, email: `${RUN_ID}-pending@example.test`, phone: '+27000000005' }).select('id'))
await queryRequired(
  'insert pending transaction',
  service
    .from('transactions')
    .insert({
      id: pendingTransactionId,
      organisation_id: actor.organisationId,
      assigned_branch_id: actor.branchId,
      assigned_user_id: actor.userId,
      owner_user_id: actor.userId,
      buyer_id: pendingBuyerId,
      listing_id: pendingListingId,
      transaction_reference: `TX-PENDING-${RUN_ID}`,
      matter_number: `MAT-PENDING-${RUN_ID}`,
      transaction_type: 'private_property',
      property_type: 'residential',
      property_address_line_1: `${RUN_ID} Pending Tx Street`,
      suburb: 'Staging',
      city: 'Johannesburg',
      province: 'Gauteng',
      purchaser_type: 'individual',
      finance_type: 'cash',
      finance_managed_by: 'internal',
      purchase_price: 950000,
      sales_price: 950000,
      seller_name: `Pending Seller ${RUN_ID}`,
      seller_email: `${RUN_ID}-pending@example.test`,
      seller_phone: '+27000000002',
      stage: 'Reserved',
      current_main_stage: 'OTP',
      risk_status: 'On Track',
      assigned_agent: actor.profile?.full_name || actor.email,
      assigned_agent_email: actor.email,
      access_level: 'shared',
      is_active: true,
      updated_at: nowIso,
      created_at: nowIso,
    })
    .select('id'),
)
await queryRequired(
  'insert pending transaction onboarding',
  service
    .from('transaction_onboarding')
    .insert({
      transaction_id: pendingTransactionId,
      token: `onb-${crypto.randomUUID().replaceAll('-', '')}`,
      status: 'Submitted',
      purchaser_type: 'individual',
      is_active: true,
      updated_at: nowIso,
      created_at: nowIso,
    })
    .select('transaction_id'),
)
const { data: pendingPromotionRun, error: pendingPromotionError } = await service.rpc('bridge_promote_pending_private_listing_documents', {
  p_private_listing_id: pendingListingId,
})
if (pendingPromotionError) throw pendingPromotionError
const pendingAfter = await maybeSingle(
  'pending promoted after',
  service.from('documents').select('*').eq('source_document_id', pendingPrivateDoc.id).eq('source', 'seller_portal').limit(1),
)
const pendingNotifications = await queryRequired(
  'pending notifications',
  service.from('transaction_notifications').select('id,dedupe_key').eq('transaction_id', pendingTransactionId),
)

console.log(JSON.stringify({
  ok: true,
  runId: RUN_ID,
  sellerUpload: {
    promotedTransfer: {
      transaction_id: promotedTransfer.transaction_id,
      source: promotedTransfer.source,
      source_document_id: promotedTransfer.source_document_id,
      file_bucket: promotedTransfer.file_bucket,
      file_path: promotedTransfer.file_path,
      bucket_key: promotedTransfer.bucket_key,
      visibility_scope: promotedTransfer.visibility_scope,
    },
    promotedFinance: {
      transaction_id: promotedFinance.transaction_id,
      source: promotedFinance.source,
      source_document_id: promotedFinance.source_document_id,
      file_bucket: promotedFinance.file_bucket,
      file_path: promotedFinance.file_path,
      bucket_key: promotedFinance.bucket_key,
      visibility_scope: promotedFinance.visibility_scope,
    },
  },
  visibility: {
    actor: { error: actorDocs.error, names: docNames(actorDocs.rows) },
    bondInternal: { error: bondDocs.error, names: docNames(bondDocs.rows) },
    buyerBefore: { error: buyerDocsBefore.error, names: docNames(buyerDocsBefore.rows) },
    buyerAfter: { error: buyerDocsAfter.error, names: docNames(buyerDocsAfter.rows) },
    attorneyExternal: { error: attorneyExternalDocs.error, names: docNames(attorneyExternalDocs.rows) },
    bondExternal: { error: bondExternalDocs.error, names: docNames(bondExternalDocs.rows) },
  },
  signedUrls: {
    attorneyTransferSigned,
    bondFinanceSigned,
    buyerDocSigned,
  },
  requestAndReadiness: {
    documentRequest: requestAfter ? { status: requestAfter.status, uploaded_document_id: requestAfter.uploaded_document_id || null, assigned_to_role: requestAfter.assigned_to_role } : null,
    requiredDocument: requiredAfter ? { is_uploaded: requiredAfter.is_uploaded, uploaded_document_id: requiredAfter.uploaded_document_id || null, status: requiredAfter.status } : null,
    readiness: readiness ? { docs_complete: readiness.docs_complete, finance_lane_ready: readiness.finance_lane_ready, onboarding_complete: readiness.onboarding_complete } : null,
  },
  notifications: sellerNotifications,
  buyerUpload: {
    id: buyerInsert.id,
    visibility_scope: buyerInsert.visibility_scope,
    source: buyerInsert.source || null,
  },
  pendingPromotion: {
    rpcPendingFlag: pendingRpc?.pendingTransactionPromotion || false,
    before: { pending_transaction_promotion: pendingPrivateDoc.pending_transaction_promotion, promotedExists: Boolean(pendingBefore?.id) },
    after: { promotedExists: Boolean(pendingAfter?.id), promotedCount: Array.isArray(pendingPromotionRun) ? pendingPromotionRun.length : null, notifications: pendingNotifications.length },
  },
}, null, 2))
