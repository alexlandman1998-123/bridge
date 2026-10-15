import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { rentalPortalJourneyDatabase, actor, org, tenantMembership, landlordMembership, tenantToken, landlordToken } from '../tests/fixtures/rentalPortalJourneyDatabase.js'
import { rentalOnboardingClient } from '../tests/fixtures/rentalOnboardingClient.js'
import { handlePublicRentalTenantPortal } from './publicRentalTenantPortalApi.js'
import { handlePublicRentalLandlordPortal } from './publicRentalLandlordPortalApi.js'
import { handleRentalClientPortalAccount } from './rentalClientPortalAccountApi.js'
import { getRentalLeaseSigningWorkspace, saveRentalLeaseDraft, prepareRentalLeaseSigning } from '../../src/services/rentals/rentalLeaseSigningRepository.js'
import { rentalLeaseScheduleSigners } from '../../src/services/rentals/rentalLeaseSchedule.js'
import { uploadRentalLeaseDocument } from '../../src/services/rentals/rentalLeaseDocumentUploadService.js'
const mock = vi.hoisted(() => ({ client: null }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => mock.client }))
vi.mock('../../src/lib/supabaseClient.js', () => ({ supabase: null, isSupabaseConfigured: true }))
const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' }
let db, client, tenancyId, leaseId, signing, upload, serviceStorage, uploadClient
const account = (audience = 'tenant', options = {}) => handleRentalClientPortalAccount({ env, headers: { authorization: 'Bearer fixture-agent' }, query: { audience, membershipId: audience === 'tenant' ? tenantMembership : landlordMembership }, ...options })
const tenant = options => handlePublicRentalTenantPortal({ env, token: tenantToken, ...options })
const landlord = options => handlePublicRentalLandlordPortal({ env, token: landlordToken, ...options })
beforeAll(async () => {
  ({ db, client, tenancyId, leaseId } = await rentalPortalJourneyDatabase())
  serviceStorage = { from: vi.fn(bucket => ({ createSignedUrl: async (path, ttl) => {
    const exists = await db.query('select name from storage.objects where bucket_id=$1 and name=$2', [bucket, path])
    return exists.rows.length ? { data: { signedUrl: `https://fixture.test/private/${path}?ttl=${ttl}` } } : { error: new Error('File missing') }
  } })) }
  mock.client = rentalOnboardingClient(db, serviceStorage, actor)
}, 30000)
afterAll(async () => { await db?.close() })

it('returns identical saved progress through tenant token and account access without inventing an active lease', async () => {
  const publicResult = await tenant(), accountResult = await account()
  expect(publicResult.status).toBe(200); expect(accountResult.body).toEqual(publicResult.body)
  expect(accountResult.body.journey).toMatchObject({ tenancyStatus: 'draft', leaseStatus: 'draft', handover: { status: 'not_started' } })
  expect(accountResult.body.journey.payments).toHaveLength(2)
  expect(JSON.stringify(accountResult.body)).not.toMatch(/identityNumber|income|screening|storage_path|terms_json/)
})

it('records signed-in maintenance in the real queue and safely retries the same receipt', async () => {
  const requestId = randomUUID(), body = { requestType: 'maintenance', requestId, maintenance: { category: 'plumbing', title: 'Kitchen tap', description: 'Water leaking under the kitchen sink.', area: 'Kitchen', accessPreference: 'Please call first', availability: 'Monday morning' } }
  const first = await account('tenant', { method: 'POST', body }), retry = await account('tenant', { method: 'POST', body })
  expect(first.status).toBe(201); expect(retry.status).toBe(200)
  expect(retry.body.maintenanceRequest.id).toBe(first.body.maintenanceRequest.id)
  expect((await db.query('select reported_by,client_portal_membership_id,tenant_portal_token_id from rental_maintenance_requests where id=$1', [requestId])).rows[0]).toEqual({ reported_by: actor, client_portal_membership_id: tenantMembership, tenant_portal_token_id: null })
  expect((await db.query('select count(*)::int total from rental_maintenance_tenant_events where request_id=$1', [requestId])).rows[0].total).toBe(1)
  expect((await tenant()).body.maintenanceRequests).toEqual((await account()).body.maintenanceRequests)
  const changed = await account('tenant', { method: 'POST', body: { ...body, maintenance: { ...body.maintenance, description: 'A different problem has been reported.' } } })
  expect(changed.status).toBe(500)
  expect(changed.body.error).toMatch(/another request/)
})

it('rolls back a failed maintenance event and retains public token provenance', async () => {
  const requestId = randomUUID(), body = { requestType: 'maintenance', requestId, maintenance: { category: 'electrical', description: 'The kitchen light does not switch on.' } }
  await db.exec("create function test_refuse_portal_event() returns trigger language plpgsql as $$ begin raise exception 'Fixture event refused'; end $$; create trigger test_refuse_portal_event before insert on rental_maintenance_tenant_events for each row execute function test_refuse_portal_event();")
  expect((await tenant({ method: 'POST', body })).status).toBe(500)
  expect((await db.query('select id from rental_maintenance_requests where id=$1', [requestId])).rows).toHaveLength(0)
  await db.exec('drop trigger test_refuse_portal_event on rental_maintenance_tenant_events')
  expect((await tenant({ method: 'POST', body })).status).toBe(201)
  expect((await db.query('select tenant_portal_token_id,reported_by from rental_maintenance_requests where id=$1', [requestId])).rows[0]).toMatchObject({ reported_by: null, tenant_portal_token_id: expect.any(String) })
})

it('shows the same landlord property progress while excluding tenant snapshots and access arrangements', async () => {
  const publicResult = await landlord(), accountResult = await account('landlord')
  expect(publicResult.status).toBe(200); expect(accountResult.body).toEqual(publicResult.body)
  expect(accountResult.body.tenancies[0]).toMatchObject({ id: tenancyId, status: 'draft', journey: { leaseStatus: 'draft' } })
  expect(accountResult.body.maintenanceRequests).toHaveLength(2)
  expect(JSON.stringify(accountResult.body)).not.toMatch(/Kitchen tap|Please call first|Monday morning|identity|tenantName|fileAccess|storagePath/)
})

it('opens a shared uploaded agreement through either audience while hiding drafts, paths and unrelated receipts', async () => {
  await saveRentalLeaseDraft({ leaseId, expectedVersion: 1, terms: { lease_start_date: '2026-11-01', lease_end_date: '2027-10-31', occupation_date: '2026-11-01', monthly_rent: 11000, deposit_amount: 22000, tenant_notice_address: 'Tenant notice', landlord_name: 'Saved Landlord', landlord_notice_address: 'Landlord notice' } }, { client })
  signing = await getRentalLeaseSigningWorkspace(tenancyId, { client })
  const storage = { from: bucket => ({ upload: async (path, file, options) => { await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)', [bucket, path, JSON.stringify({ size: file.size, mimetype: options.contentType })]); return { data: { path } } } }) }
  uploadClient = rentalOnboardingClient(db, storage, actor, true)
  upload = await uploadRentalLeaseDocument({ workspace: signing, file: { name: 'Reviewed agreement.pdf', type: 'application/pdf', size: 24 } }, { client: uploadClient })
  expect((await tenant()).body.documents).toHaveLength(0)
  expect((await tenant({ method: 'POST', body: { action: 'open_document', documentId: upload.id } })).status).toBe(404)
  await prepareRentalLeaseSigning({ leaseId, expectedVersion: signing.version.version_number, signers: rentalLeaseScheduleSigners(signing.projection, signing.version.version_number) }, { client })
  expect((await tenant()).body.documents[0]).toMatchObject({ id: upload.id, available: true })
  for (const result of [await tenant({ method: 'POST', body: { action: 'open_document', documentId: upload.id } }), await account('tenant', { method: 'POST', body: { action: 'open_document', documentId: upload.id } }), await landlord({ method: 'POST', body: { action: 'open_document', documentId: upload.id } }), await account('landlord', { method: 'POST', body: { action: 'open_document', documentId: upload.id } })]) expect(result).toMatchObject({ status: 200, body: { expiresIn: 300, url: expect.stringContaining('https://fixture.test/private/') } })
  expect((await tenant({ method: 'POST', body: { action: 'open_document', documentId: randomUUID(), storagePath: upload.storage_path } })).status).toBe(404)
  expect(JSON.stringify((await landlord()).body)).not.toMatch(/storagePath|storageBucket|private\//)
})

it('shares only linked payment and handover uploads, with the same saved progress in both portals', async () => {
  const unused = await uploadRentalLeaseDocument({ workspace: signing, file: { name: 'Unlinked internal proof.pdf', type: 'application/pdf', size: 24 }, kind: 'move_in_evidence' }, { client: uploadClient })
  expect((await tenant()).body.documents.some(document => document.id === unused.id)).toBe(false)
  const proof = await uploadRentalLeaseDocument({ workspace: signing, file: { name: 'Deposit proof.pdf', type: 'application/pdf', size: 24 }, kind: 'move_in_evidence' }, { client: uploadClient })
  const item = (await db.query("select id,required_amount from rental_move_in_readiness_items where tenancy_id=$1 and obligation_type='deposit'", [tenancyId])).rows[0]
  const recorded = await client.rpc('rental_record_move_in_readiness', { p_readiness_item_id: item.id, p_status: 'verified', p_received_amount: Number(item.required_amount), p_evidence_link: `${proof.storage_bucket}/${proof.storage_path}` })
  expect(recorded.error).toBeNull()
  const incoming = await client.rpc('rental_start_incoming_inspection', { p_tenancy_id: tenancyId, p_scheduled_for: '2026-11-01T10:00:00Z' })
  expect(incoming.error).toBeNull()
  const report = await uploadRentalLeaseDocument({ workspace: signing, file: { name: 'Condition report.pdf', type: 'application/pdf', size: 24 }, kind: 'move_in_evidence' }, { client: uploadClient })
  const condition = (await db.query("select id from rental_incoming_inspection_items where inspection_id=$1 and item_key='condition_report'", [incoming.data.inspection_id])).rows[0]
  expect((await client.rpc('rental_record_incoming_inspection_item', { p_item_id: condition.id, p_status: 'completed', p_evidence_link: `${report.storage_bucket}/${report.storage_path}`, p_note: 'Condition checked' })).error).toBeNull()
  const view = await tenant(), signedIn = await account(), owner = await landlord()
  expect(view.body).toEqual(signedIn.body)
  expect(view.body.documents).toEqual(expect.arrayContaining([expect.objectContaining({ id: proof.id, category: 'payments', status: 'verified' }), expect.objectContaining({ id: report.id, category: 'inspections' })]))
  expect(view.body.attention[0].title).toBe('Signed copies still required')
  expect(view.body.journey.handover).toMatchObject({ status: 'in_progress', completedItems: 1, totalItems: 5 })
  expect(owner.body.tenancies[0].journey).toEqual(view.body.journey)
  expect(owner.body.leaseDocuments.some(document => document.id === unused.id)).toBe(false)
  expect((await account('landlord', { method: 'POST', body: { action: 'open_document', documentId: proof.id } })).status).toBe(200)
})

it('retains safe historical agreement links while suppressing unsafe URLs and raw bucket references', async () => {
  await db.query('insert into rental_lease_version_documents(lease_version_id,organisation_id,document_label,document_link,created_by) values($1,$2,$3,$4,$5),($1,$2,$6,$7,$5),($1,$2,$8,$9,$5)', [signing.version.id, org, 'Historical agreement', 'https://files.fixture.test/accepted.pdf', actor, 'Unsafe file', 'javascript:alert(1)', 'Unverified bucket file', 'rental-lease-files/arbitrary/path.pdf'])
  const view = await tenant()
  const historical = view.body.documents.find(document => document.label === 'Historical agreement')
  expect(historical).toBeTruthy()
  expect(view.body.documents.some(document => ['Unsafe file', 'Unverified bucket file'].includes(document.label))).toBe(false)
  expect((await tenant({ method: 'POST', body: { action: 'open_document', documentId: historical.id } })).body.url).toBe('https://files.fixture.test/accepted.pdf')
})

it('allows the server role to save maintenance while rechecking the exact active relationship', async () => {
  const token = (await db.query('select id from rental_tenant_portal_access_tokens')).rows[0].id
  const details = { category: 'security', priority: 'routine', description: 'The front gate does not close securely.', area: null, access: null, availability: null }
  const requestId = randomUUID()
  await db.exec('set role service_role')
  try {
    const result = await db.query('select rental_portal_submit_maintenance($1,$2,null,$3,$4) receipt', [tenancyId, token, requestId, JSON.stringify(details)])
    expect(result.rows[0].receipt.request.id).toBe(requestId)
    await expect(db.query('select rental_portal_submit_maintenance($1,$2,null,$3,$4)', [randomUUID(), token, randomUUID(), JSON.stringify(details)])).rejects.toThrow(/unavailable/)
  } finally { await db.exec('reset role') }
})

it('returns a recoverable file error without exposing a path when storage cannot sign the saved file', async () => {
  const original = mock.client.storage
  mock.client.storage = { from: () => ({ createSignedUrl: async () => ({ error: new Error('Fixture storage unavailable') }) }) }
  try {
    expect(await tenant({ method: 'POST', body: { action: 'open_document', documentId: upload.id } })).toEqual({ status: 503, body: { error: 'The saved file could not be opened. Please try again.' } })
  } finally { mock.client.storage = original }
})

it('denies revoked links, revoked memberships, wrong audiences, organisations and users before file signing', async () => {
  const baseline = serviceStorage.from.mock.calls.length
  await db.query("update rental_client_portal_memberships set status='revoked' where id=$1", [tenantMembership])
  expect((await account('tenant', { method: 'POST', body: { action: 'open_document', documentId: upload.id } })).status).toBe(403)
  await db.query("update rental_client_portal_memberships set status='active',organisation_id=$1 where id=$2", [randomUUID(), tenantMembership]).catch(async () => {
    const foreign = randomUUID(); await db.query('insert into organisations(id) values($1)', [foreign]); await db.query("update rental_client_portal_memberships set status='active',organisation_id=$1 where id=$2", [foreign, tenantMembership])
  })
  expect((await account()).status).toBe(403)
  await db.query('update rental_client_portal_memberships set organisation_id=$1 where id=$2', [org, tenantMembership])
  expect((await account('landlord', { query: { membershipId: tenantMembership, audience: 'landlord' } })).status).toBe(403)
  expect((await account('tenant', { headers: { authorization: 'Bearer wrong-user' } })).status).toBe(401)
  const otherUser = randomUUID(); await db.query('insert into auth.users(id) values($1)', [otherUser])
  await db.query('update rental_client_portal_memberships set user_id=$1 where id=$2', [otherUser, tenantMembership])
  expect((await account()).status).toBe(403)
  await db.query('update rental_client_portal_memberships set user_id=$1 where id=$2', [actor, tenantMembership])
  await db.exec("update rental_tenant_portal_access_tokens set expires_at='2000-01-01'")
  expect((await tenant()).status).toBe(401)
  await db.exec("update rental_tenant_portal_access_tokens set expires_at='2099-01-01'")
  await db.exec('update rental_tenant_portal_access_tokens set revoked_at=now()')
  expect((await tenant({ method: 'POST', body: { action: 'open_document', documentId: upload.id } })).status).toBe(401)
  expect(serviceStorage.from.mock.calls.length).toBe(baseline)
})

it('keeps the maintenance command and portal tables inaccessible to browser roles', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    await expect(db.query('select rental_portal_submit_maintenance($1,null,$2,$3,$4)', [tenancyId, tenantMembership, randomUUID(), '{}'])).rejects.toThrow(/permission/)
    await expect(db.exec('insert into rental_tenant_portal_requests(tenancy_id,organisation_id,request_type,message) values(null,null,\'general\',\'Forbidden insert\')')).rejects.toThrow(/permission/)
    await db.exec('reset role')
  }
})

it('uses the real SDK null filter when checking a signed-in membership', async () => {
  const { createClient } = await vi.importActual('@supabase/supabase-js')
  const original = mock.client, urls = []
  mock.client = createClient('https://fixture.invalid', 'fixture-only', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async input => {
    const url = new URL(String(input)); urls.push(url)
    let data = []
    if (url.pathname === '/auth/v1/user') data = { id: actor }
    else if (url.pathname.endsWith('/rental_client_portal_memberships') && url.searchParams.get('revoked_at') === 'is.null') data = [{ id: tenantMembership, organisation_id: org, audience: 'tenant', tenancy_id: tenancyId, property_id: null, status: 'active' }]
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } } })
  try {
    // No tenancy rows in this transport probe: reaching the tenancy lookup
    // proves the active membership survived the actual PostgREST filter.
    expect((await account()).status).toBe(404)
    const membership = urls.find(url => url.pathname.endsWith('/rental_client_portal_memberships'))
    expect(membership.searchParams.get('revoked_at')).toBe('is.null')
    expect(membership.searchParams.get('user_id')).toBe(`eq.${actor}`)
    expect(membership.searchParams.get('audience')).toBe('eq.tenant')
  } finally { mock.client = original }
})
