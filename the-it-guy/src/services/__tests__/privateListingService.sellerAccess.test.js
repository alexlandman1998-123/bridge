import { PGlite } from '@electric-sql/pglite'
import { buildListingSellerCanonicalUpdate } from '../listings/listingSellerCanonicalUpdateModel.js'
import { syncSellerDocumentRequirements } from '../../lib/sellerDocumentRequirementEngine.js'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { client } = vi.hoisted(() => ({ client: { rpc: vi.fn(), from: vi.fn(), auth: { getUser: vi.fn() } } }))
vi.mock('../../lib/supabaseClient', () => ({
  supabase: client, isSupabaseConfigured: true, createScopedSupabaseClient: () => client,
  DOCUMENTS_BUCKET: 'documents', DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
  BRANDING_BUCKET_CANDIDATES: ['branding'], PROFILE_AVATAR_BUCKET_CANDIDATES: ['avatars'],
  LEGAL_TEMPLATES_BUCKET_CANDIDATES: ['legal-templates'],
}))
import { getSellerOnboardingByToken, submitSellerOnboarding, updateSellerOnboardingProgress, savePrivateListingSellerCanonicalUpdate, syncPrivateListingRequirements, ensurePrivateListingDocumentRequirements } from '../privateListingService'

const listingId = '00000000-0000-4000-8000-000000000001'
const onboardingId = '00000000-0000-4000-8000-000000000002'
const rpcResult = (data, error = null) => Object.assign(Promise.resolve({ data, error }), { abortSignal() { return this } })

beforeEach(() => {
  vi.clearAllMocks()
  client.from.mockImplementation(() => { throw new Error('Unexpected direct table access') })
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network access') }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('seller token mutation boundary', () => {
  it.each(['PGRST202', '57014', '42501'])('progress fails closed for %s without a table fallback', async (code) => {
    const error = { code, message: 'bridge_update_private_listing_seller_onboarding_progress unavailable' }
    client.rpc.mockReturnValue(rpcResult(null, error))
    await expect(updateSellerOnboardingProgress('valid-token', { formData: { sellerName: 'Owner' } })).rejects.toEqual(error)
    expect(client.from).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('a missing submit RPC fails closed without a table fallback', async () => {
    const error = { code: 'PGRST202', message: 'bridge_complete_private_listing_seller_onboarding missing' }
    client.rpc.mockReturnValue(rpcResult(null, error))
    await expect(submitSellerOnboarding('valid-token', { formData: {} })).rejects.toEqual(error)
    expect(client.from).not.toHaveBeenCalled()
  })

  it('valid progress returns saved data without anonymous projection writes', async () => {
    client.rpc.mockImplementation((name) => rpcResult(name === 'bridge_can_access_private_listing' ? false : {
      listing: { id: listingId, listing_status: 'onboarding_sent' },
      onboarding: { id: onboardingId, private_listing_id: listingId, form_data: { sellerName: 'Owner', currentStep: 2 }, status: 'in_progress' },
    }))
    const result = await updateSellerOnboardingProgress('valid-token', { listingSnapshot: { id: listingId }, currentStep: 2, formData: { sellerFirstName: 'Owner', sellerSurname: 'Person' } })
    expect(result.listing.id).toBe(listingId)
    expect(result.onboarding.form_data.currentStep).toBe(2)
    const [, args] = client.rpc.mock.calls.find(([name]) => name === 'bridge_update_private_listing_seller_onboarding_progress')
    expect(args.p_form_data.canonicalSellerFacts.context.listing_id).toBe(listingId)
    expect(args.p_form_data.canonicalSellerFacts.seller.first_name).toBe('Owner')
    await vi.waitFor(() => expect(client.rpc).toHaveBeenCalledWith('bridge_can_access_private_listing', { target_listing_id: listingId }))
    expect(client.from).not.toHaveBeenCalled()
  })

  it('valid submission and timeout recovery retain the token receipt without anonymous follow-up writes', async () => {
    const receipt = { listingId, onboardingId, status: 'completed', submittedAt: '2026-10-01T10:00:00Z' }
    for (const timeout of [false, true]) {
      client.rpc.mockImplementation((name) => {
        if (name === 'bridge_can_access_private_listing') return rpcResult(false)
        if (timeout && name === 'bridge_complete_private_listing_seller_onboarding') return rpcResult(null, { code: '57014', message: 'canceling statement due to statement timeout' })
        return rpcResult(receipt)
      })
      const result = await submitSellerOnboarding('valid-token', { listingSnapshot: { id: listingId }, formData: { sellerName: 'Owner' } })
      expect(result.listing.id).toBe(listingId)
      expect(result.onboarding.status).toBe('completed')
    }
    expect(client.from).not.toHaveBeenCalled()
  })

  it.each([false, true])('reopening hydrates saved fields without table access (RPC pending deployment: %s)', async (rpcMissing) => {
    const form = { sellerName: 'Owner', currentStep: 3, companyRegistrationNumber: 'REG-TEST' }
    fetch.mockImplementation(async (url) => ({ ok: url.startsWith('/api/public/seller-onboarding-core?'), status: url.startsWith('/api/public/seller-onboarding-core?') ? 200 : 404, json: async () => ({ listing: { id: listingId }, onboarding: { id: onboardingId, private_listing_id: listingId, form_data: form } }) }))
    client.rpc.mockImplementation((name) => name === 'bridge_get_private_listing_seller_onboarding_form' && rpcMissing
      ? rpcResult(null, { code: 'PGRST202', message: 'bridge_get_private_listing_seller_onboarding_form missing' })
      : rpcResult(
      name === 'bridge_private_listing_seller_portal_core_payload'
        ? { listing: { id: listingId }, onboarding: { id: onboardingId, private_listing_id: listingId, form_data: { sellerName: 'Owner' } } }
        : name === 'bridge_get_private_listing_seller_onboarding_form'
          ? { id: onboardingId, private_listing_id: listingId, form_data: form }
          : null,
    ))
    client.from.mockImplementation((table) => {
      if (table === 'private_listing_seller_onboarding') throw new Error('Public table read is forbidden')
      const query = new Proxy({}, { get: (_target, property) => property === 'then'
        ? (resolve) => resolve({ data: [], error: null })
        : () => query })
      return query
    })
    const result = await getSellerOnboardingByToken('valid-token', { corePayload: true })
    expect(result.onboarding.form_data.companyRegistrationNumber).toBe('REG-TEST')
    expect(result.listing.sellerOnboarding.formData.currentStep).toBe(3)
    expect(client.rpc).toHaveBeenCalledWith('bridge_get_private_listing_seller_onboarding_form', { p_token: 'valid-token' })
    expect(client.from.mock.calls.some(([table]) => table === 'private_listing_seller_onboarding')).toBe(false)
  })

  it.each([
    { code: '57014', message: 'canceling statement due to statement timeout' },
    { status: 503, message: 'server error' },
  ])('secure core retries still call the authenticated reader after a temporary failure: $code $status', async (temporaryError) => {
    client.rpc.mockReturnValueOnce(rpcResult(null, temporaryError))
      .mockReturnValueOnce(rpcResult({ authRequired: true, passwordSet: true, sessionExpired: true }))
    const options = { corePayload: true, requirePortalAccess: true, sellerPortalAccessToken: 'test-session' }
    await expect(getSellerOnboardingByToken('stable-token', options)).rejects.toMatchObject({ portalAuth: { authRequired: true } })
    expect(client.rpc).toHaveBeenCalledTimes(2)
    expect(client.rpc).toHaveBeenLastCalledWith('bridge_private_listing_seller_portal_core_payload', {
      p_token: 'stable-token', p_access_token: 'test-session', p_require_access: true,
    })
    expect(client.from).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('secure workspace RPC failure never downgrades to the public API or tables', async () => {
    client.rpc.mockReturnValue(rpcResult(null, { code: 'PGRST202', message: 'bridge_private_listing_seller_portal_core_payload unavailable' }))
    await expect(getSellerOnboardingByToken('stable-token', { corePayload: true, requirePortalAccess: true })).rejects.toThrow('secure seller portal')
    expect(client.from).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('canonical seller save confirmation', () => {
  it('distinguishes committed data from a failed refresh', async () => {
    const { savePrivateListingSellerCanonicalUpdate } = await import('../privateListingService')
    const mutationId = '00000000-0000-4000-8000-000000000099'
    client.rpc.mockReturnValue(rpcResult({
      listing: { id: listingId, seller_canonical_facts_json: { sellerName: 'Saved Owner' } },
      onboarding: { id: onboardingId, private_listing_id: listingId, form_data: { sellerName: 'Saved Owner' }, status: 'in_progress' },
      mutationId,
    }))
    await expect(savePrivateListingSellerCanonicalUpdate({ listingId, mutationId, nextFormData: { sellerName: 'Saved Owner' } })).rejects.toMatchObject({
      code: 'SELLER_READBACK_FAILED', committed: true, listing: { sellerName: 'Saved Owner' },
    })
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })

  it('does not claim success when the RPC returns no receipt', async () => {
    const { savePrivateListingSellerCanonicalUpdate } = await import('../privateListingService')
    client.rpc.mockReturnValue(rpcResult(null))
    await expect(savePrivateListingSellerCanonicalUpdate({ listingId, mutationId: '00000000-0000-4000-8000-000000000099' })).rejects.toMatchObject({ code: 'SELLER_SAVE_UNCONFIRMED' })
    expect(client.from).not.toHaveBeenCalled()
  })
})

describe('seller checklist persistence with PostgreSQL date fields', () => {
  let db
  let batches
  const savedListing = {
    id: listingId, sellerType: 'individual', sellerOnboardingStatus: 'completed',
    sellerOnboarding: { status: 'completed', formData: {
      ownerEntityType: 'natural_person', ownerStructureType: 'individual', sellerFirstName: 'Saved', sellerSurname: 'Owner',
      sellerOnboardingManualSigningPack: { documents: [{ versionId: 'saved-copy', generatedHtml: 'Approved HTML' }] },
    } },
  }
  const readRows = async () => (await db.query('select to_jsonb(r) as row from private_listing_document_requirements r order by requirement_key')).rows.map(({ row }) => row)
  const writeRows = async (rows) => {
    const columns = [...new Set(rows.flatMap(row => Object.keys(row)))]
    for (const column of columns) expect(column).toMatch(/^[a-z_]+$/)
    return (await db.query(`insert into private_listing_document_requirements (${columns.join(',')})
      select ${columns.join(',')} from jsonb_populate_recordset(null::private_listing_document_requirements, $1::jsonb)
      on conflict(private_listing_id,requirement_key) do update set ${columns.map(column => `${column}=excluded.${column}`).join(',')}
      returning to_jsonb(private_listing_document_requirements) as row`, [JSON.stringify(rows)])).rows.map(({ row }) => row)
  }

  beforeEach(async () => {
    db = new PGlite()
    batches = []
    await db.exec(`create table private_listing_document_requirements (
      id uuid primary key default gen_random_uuid(), private_listing_id uuid not null, requirement_key text not null,
      requirement_name text, requirement_description text, requirement_group text, document_visibility text, applies_to text, visibility text,
      status text, is_required boolean, generated_from jsonb, canonical_requirement_instance_id uuid,
      requested_from_role text, request_stage text, request_priority text, request_due_date date,
      request_delivery_channels jsonb, request_dedupe_key text, request_source text, requested_at timestamptz,
      request_revision integer, last_request_reason text, request_metadata jsonb,
      satisfied_by_document_id uuid, satisfaction_verified_at timestamptz, assurance_metadata jsonb,
      created_at timestamptz default now(), updated_at timestamptz default now(),
      unique(private_listing_id,requirement_key))`)
    client.from.mockImplementation((table) => {
      let payload = null
      let single = false
      const query = {
        select: () => query, eq: () => query, order: () => query,
        maybeSingle: () => { single = true; return query },
        upsert: (rows) => { payload = rows; batches.push(rows); return query },
        then: (resolve, reject) => (async () => {
          if (table !== 'private_listing_document_requirements') {
            if (!['private_listing_documents', 'private_listing_seller_onboarding'].includes(table) || payload) throw new Error(`Unexpected table: ${table}`)
            return { data: single ? null : [], error: null }
          }
          try { return { data: payload ? await writeRows(payload) : await readRows(), error: null } }
          catch (error) { return { data: null, error } }
        })().then(resolve, reject),
      }
      return query
    })
  })
  afterEach(async () => { await db.close() })

  it('refreshes the saved signing pack with unset dates and retains approved requirements and document links', async () => {
    const seed = syncSellerDocumentRequirements(savedListing, []).upsertRows.map(row => ({ ...row, id: crypto.randomUUID(),
      status: 'approved', satisfied_by_document_id: crypto.randomUUID(), satisfaction_verified_at: '2026-10-05T07:00:00Z',
      assurance_metadata: { approved: true }, request_due_date: null, requested_at: null }))
    await writeRows(seed)
    const before = await readRows()
    const result = await syncPrivateListingRequirements(savedListing, { emitActivity: false })
    const after = await readRows()
    expect(result.requirements).toHaveLength(before.length)
    expect(result.requestIssuance.counts.failed).toBe(0)
    for (const row of after) {
      const previous = before.find(item => item.requirement_key === row.requirement_key)
      expect(row).toMatchObject({ id: previous.id, status: 'approved', request_due_date: null, requested_at: null,
        satisfied_by_document_id: previous.satisfied_by_document_id, satisfaction_verified_at: previous.satisfaction_verified_at,
        assurance_metadata: previous.assurance_metadata })
    }
    expect(result.listing.sellerOnboarding.formData.sellerOnboardingManualSigningPack).toEqual(savedListing.sellerOnboarding.formData.sellerOnboardingManualSigningPack)
    expect(batches.flat().every(row => row.request_due_date !== '' && row.requested_at !== '')).toBe(true)
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('keeps existing request dates and metadata when refreshing approved rows', async () => {
    const seed = syncSellerDocumentRequirements(savedListing, []).upsertRows.map(row => ({ ...row, id: crypto.randomUUID(), status: 'approved',
      request_due_date: '2026-10-12', requested_at: '2026-10-05T07:00:00Z', request_dedupe_key: 'saved-request',
      canonical_requirement_instance_id: crypto.randomUUID(), request_revision: 3, request_metadata: { delivery: 'recorded' } }))
    await writeRows(seed)
    await syncPrivateListingRequirements(savedListing, { emitActivity: false })
    for (const row of await readRows()) expect(row).toMatchObject({ request_due_date: '2026-10-12',
      requested_at: '2026-10-05T07:00:00+00:00', request_dedupe_key: 'saved-request', request_revision: 3,
      canonical_requirement_instance_id: seed.find(item => item.requirement_key === row.requirement_key).canonical_requirement_instance_id,
      request_metadata: { delivery: 'recorded' } })
  })

  it('repairs the checklist when preparing an already saved pack without reloading unrelated listing data', async () => {
    await writeRows(syncSellerDocumentRequirements(savedListing, []).upsertRows.map(row => ({ ...row, id: crypto.randomUUID(), status: 'approved' })))
    const update = { ...buildListingSellerCanonicalUpdate({ listing: savedListing, formPatch: { notes: 'Prepared pack saved' },
      onboardingStatus: 'completed', mutationId: '00000000-0000-4000-8000-000000000099' }), requirementsAffected: false }
    client.rpc.mockReturnValue(rpcResult({ mutationId: update.mutationId,
      listing: { id: listingId, seller_type: update.sellerType, seller_onboarding_status: 'completed', seller_canonical_facts_json: update.canonicalFacts },
      onboarding: { id: onboardingId, private_listing_id: listingId, status: 'completed', form_data: update.nextFormData, canonical_facts_json: update.canonicalFacts },
    }))
    const result = await savePrivateListingSellerCanonicalUpdate(update, { includeRequirementsAndDocuments: false, forceRequirementSync: true })
    expect(result.listing.sellerOnboarding.formData.sellerOnboardingManualSigningPack.documents[0].versionId).toBe('saved-copy')
    expect(result.requirementSyncResult.requirements.length).toBeGreaterThan(0)
    expect(result.requirementSyncResult.requestIssuance.counts.failed).toBe(0)
    expect(result.snapshotOnly).toBe(true)
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.from.mock.calls.some(([table]) => table === 'private_listings')).toBe(false)
  })

  it('saves new and existing requirements together without nulling a saved id or leaking blank dates', async () => {
    const id = crypto.randomUUID()
    await writeRows([{ id, private_listing_id: listingId, requirement_key: 'proof_of_address', requirement_name: 'Address', status: 'approved' }])
    const result = await ensurePrivateListingDocumentRequirements(listingId, [
      { requirementKey: 'proof_of_address', requirementName: 'Address', requestDueDate: '', requestedAt: '' },
      { requirementKey: 'id_document', requirementName: 'Identity', requestDueDate: '2026-10-12', requestedAt: '2026-10-05T07:00:00Z' },
    ])
    expect(result).toHaveLength(2)
    expect(result.find(row => row.requirement_key === 'proof_of_address')).toMatchObject({ id, status: 'approved' })
    expect(result.find(row => row.requirement_key === 'id_document').id).toMatch(/^[0-9a-f-]{36}$/)
    expect((await readRows()).find(row => row.requirement_key === 'id_document').request_due_date).toBe('2026-10-12')
    for (const batch of batches) expect(new Set(batch.map(row => Object.keys(row).sort().join(','))).size).toBe(1)
  })

  it('still rejects a nonblank invalid date without claiming the checklist saved', async () => {
    await expect(ensurePrivateListingDocumentRequirements(listingId, [{ requirementKey: 'id_document', requirementName: 'Identity', requestDueDate: '2026-02-30' }]))
      .rejects.toMatchObject({ code: '22008' })
    expect(await readRows()).toHaveLength(0)
  })
})

describe('canonical seller save confirmation', () => {
  const update = () => buildListingSellerCanonicalUpdate({
    listing: { id: listingId, updatedAt: '2026-10-05T06:00:00Z', sellerOnboarding: {
      status: 'completed', formData: { ownerEntityType: 'natural_person', ownerStructureType: 'individual',
        sellerFirstName: 'Saved', sellerSurname: 'Owner', sellerPostOnboardingDrafts: { documents: [{ generatedHtml: 'Old draft' }] } },
    } },
    mutationId: '00000000-0000-4000-8000-000000000099', onboardingStatus: 'completed',
    formPatch: { sellerOnboardingManualSigningPack: { documents: [{ versionId: 'prepared-copy', generatedHtml: 'Approved copy' }] } },
  })
  const receiptFor = (value) => ({
    mutationId: value.mutationId,
    listing: { id: listingId, updated_at: value.now, seller_canonical_facts_json: value.canonicalFacts,
      seller_onboarding_status: value.onboardingStatus, seller_type: value.sellerType,
      address_line_1: value.listingPatch.addressLine1, mandate_type: value.listingPatch.mandateType },
    onboarding: { id: onboardingId, private_listing_id: listingId, status: value.onboardingStatus,
      canonical_facts_json: value.canonicalFacts, form_data: value.nextFormData },
  })
  const recoveryReads = (receipt) => client.from.mockImplementation((table) => {
    const query = {
      select: vi.fn(() => query), eq: vi.fn(() => query),
      maybeSingle: () => rpcResult(table === 'private_listings' ? receipt.listing : receipt.onboarding),
    }
    return query
  })

  it('uses the committed RPC snapshot for pack preparation without another listing reload', async () => {
    const value = update()
    client.rpc.mockReturnValue(rpcResult(receiptFor(value)))
    const result = await savePrivateListingSellerCanonicalUpdate(value, { includeRequirementsAndDocuments: false })
    expect(result.listing.sellerOnboarding.formData.sellerOnboardingManualSigningPack.documents[0].versionId).toBe('prepared-copy')
    expect(client.from).not.toHaveBeenCalled()
    expect(client.rpc.mock.calls[0][1].p_form_data.sellerPostOnboardingDrafts).toBeUndefined()
    expect(client.rpc.mock.calls[0][1].p_listing_patch.sellerCanonicalFacts).toBeUndefined()
  })

  it('lets a pack save complete after the previous 25-second deadline', async () => {
    vi.useFakeTimers()
    const value = update()
    client.rpc.mockReturnValue(Object.assign(new Promise(resolve => setTimeout(() => resolve({ data: receiptFor(value), error: null }), 35000)),
      { abortSignal() { return this } }))
    const saved = savePrivateListingSellerCanonicalUpdate(value, { includeRequirementsAndDocuments: false })
    await vi.advanceTimersByTimeAsync(35000)
    await expect(saved).resolves.toMatchObject({ receipt: { mutationId: value.mutationId } })
    expect(client.from).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['returned abort', 'thrown abort', 'stalled auth'])('recovers a committed save after %s without another write', async (failure) => {
    vi.useFakeTimers()
    const value = update()
    const aborted = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })
    client.rpc.mockReturnValue(failure === 'returned abort' ? rpcResult(null, aborted)
      : failure === 'thrown abort' ? { abortSignal: () => Promise.reject(aborted) }
        : Object.assign(new Promise(() => {}), { abortSignal() { return this } }))
    recoveryReads(receiptFor(value))
    const saved = savePrivateListingSellerCanonicalUpdate(value, { includeRequirementsAndDocuments: false })
    await vi.advanceTimersByTimeAsync(failure === 'stalled auth' ? 40000 : 0)
    await expect(saved).resolves.toMatchObject({ receipt: { recoveredAfterTimeout: true, mutationId: value.mutationId } })
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.from.mock.calls.map(([table]) => table).sort()).toEqual(['private_listing_seller_onboarding', 'private_listings'])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('confirms a late commit after the first recovery read without saving twice', async () => {
    vi.useFakeTimers()
    const value = update()
    const committed = receiptFor(value)
    const pending = { ...committed, listing: { ...committed.listing, seller_canonical_facts_json: {} },
      onboarding: { ...committed.onboarding, canonical_facts_json: {} } }
    client.rpc.mockReturnValue(rpcResult(null, { message: 'AbortError: This operation was aborted' }))
    let reads = 0
    client.from.mockImplementation((table) => {
      const receipt = reads++ < 2 ? pending : committed
      const query = { select: () => query, eq: () => query,
        maybeSingle: () => rpcResult(table === 'private_listings' ? receipt.listing : receipt.onboarding) }
      return query
    })
    const saved = savePrivateListingSellerCanonicalUpdate(value, { includeRequirementsAndDocuments: false })
    await vi.advanceTimersByTimeAsync(500)
    await expect(saved).resolves.toMatchObject({ receipt: { recoveredAfterTimeout: true, mutationId: value.mutationId } })
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.from).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['different mutation', 'later document edit', 'permission failure'])('leaves a timeout unconfirmed after %s', async (failure) => {
    const value = update()
    const receipt = receiptFor(value)
    if (failure === 'different mutation') receipt.onboarding.canonical_facts_json = { context: { canonical_update: { mutation_id: 'another-save' } } }
    if (failure === 'later document edit') receipt.onboarding.form_data = { ...value.nextFormData, sellerOnboardingManualSigningPack: { documents: [] } }
    client.rpc.mockReturnValue(rpcResult(null, { message: 'AbortError: This operation was aborted' }))
    recoveryReads(receipt)
    if (failure === 'permission failure') client.from.mockImplementation(() => { throw new Error('Access denied') })
    await expect(savePrivateListingSellerCanonicalUpdate(value, { includeRequirementsAndDocuments: false }))
      .rejects.toMatchObject({ code: 'SELLER_PROFILE_SAVE_TIMEOUT', mutationId: value.mutationId })
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })

  it('bounds recovery even when both save and confirmation reads stall', async () => {
    vi.useFakeTimers()
    const stalled = Object.assign(new Promise(() => {}), { abortSignal() { return this } })
    client.rpc.mockReturnValue(stalled)
    client.from.mockImplementation(() => {
      const query = { select: () => query, eq: () => query, maybeSingle: () => stalled }
      return query
    })
    const saved = savePrivateListingSellerCanonicalUpdate(update(), { includeRequirementsAndDocuments: false })
    const rejected = expect(saved).rejects.toMatchObject({ code: 'SELLER_PROFILE_SAVE_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(48000)
    await rejected
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['40001', '42501', 'PGRST202'])('does not attempt timeout recovery or retry a rejected save for %s', async (code) => {
    client.rpc.mockReturnValue(rpcResult(null, { code, message: 'save_private_listing_seller_canonical_update rejected' }))
    await expect(savePrivateListingSellerCanonicalUpdate(update())).rejects.toBeTruthy()
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.from).not.toHaveBeenCalled()
  })

  it('distinguishes committed data from a failed refresh', async () => {
    const { savePrivateListingSellerCanonicalUpdate } = await import('../privateListingService')
    const mutationId = '00000000-0000-4000-8000-000000000099'
    client.rpc.mockReturnValue(rpcResult({
      listing: { id: listingId, seller_canonical_facts_json: { sellerName: 'Saved Owner' } },
      onboarding: { id: onboardingId, private_listing_id: listingId, form_data: { sellerName: 'Saved Owner' }, status: 'in_progress' },
      mutationId,
    }))
    await expect(savePrivateListingSellerCanonicalUpdate({ listingId, mutationId, nextFormData: { sellerName: 'Saved Owner' } })).rejects.toMatchObject({
      code: 'SELLER_READBACK_FAILED', committed: true, listing: { sellerName: 'Saved Owner' },
    })
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })

  it('does not claim success when the RPC returns no receipt', async () => {
    const { savePrivateListingSellerCanonicalUpdate } = await import('../privateListingService')
    client.rpc.mockReturnValue(rpcResult(null))
    await expect(savePrivateListingSellerCanonicalUpdate({ listingId, mutationId: '00000000-0000-4000-8000-000000000099' })).rejects.toMatchObject({ code: 'SELLER_SAVE_UNCONFIRMED' })
    expect(client.from).not.toHaveBeenCalled()
  })
})
