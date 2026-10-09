import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

const { client } = vi.hoisted(() => ({ client: { rpc: vi.fn(), from: vi.fn(), auth: { getUser: vi.fn() } } }))
vi.mock('../../lib/supabaseClient', () => ({
  supabase: client, isSupabaseConfigured: true, createScopedSupabaseClient: () => client,
  DOCUMENTS_BUCKET: 'documents', DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
  BRANDING_BUCKET_CANDIDATES: ['branding'], PROFILE_AVATAR_BUCKET_CANDIDATES: ['avatars'],
  LEGAL_TEMPLATES_BUCKET_CANDIDATES: ['legal-templates'],
}))
import { getSellerOnboardingByToken, submitSellerOnboarding, updateSellerOnboardingProgress, savePrivateListingSellerCanonicalUpdate, syncPrivateListingRequirements, ensurePrivateListingDocumentRequirements, resolvePrivateListingDocumentRequirement } from '../privateListingService'
import { repairSellerDocumentRequirementLinks, isUnlinkedSellerReviewDocument } from '../sellerDocumentReviewWorkflowService.js'
import { buildListingSellerCanonicalUpdate } from '../listings/listingSellerCanonicalUpdateModel.js'
import { syncSellerDocumentRequirements } from '../../lib/sellerDocumentRequirementEngine.js'
import { buildListingSellerProfileFormPatch, createListingSellerProfileBuilderDraft, selectListingSellerProfileBranch } from '../../lib/listingSellerProfileBuilderModel.js'

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
  it('agent submission records its capture actor and a later seller submission preserves it', async () => {
    client.rpc.mockImplementation(name => rpcResult(name === 'bridge_can_access_private_listing' ? false : { listingId, onboardingId, status: 'completed', submittedAt: '2026-10-09T10:00:00Z' }))
    const capture = { mode: 'agent_assisted', status: 'awaiting_seller_review_and_signature', capturedBy: 'original-agent', capturedAt: '2026-10-09T09:00:00Z' }
    await submitSellerOnboarding('valid-token', { completionMode: 'agent_assisted', completedBy: 'agent-a', listingSnapshot: { id: listingId }, formData: { sellerDisclosureCapture: capture } })
    let calls = client.rpc.mock.calls.filter(([name]) => name === 'bridge_complete_private_listing_seller_onboarding')
    expect(calls.at(-1)[1].p_form_data.sellerDisclosureCapture).toEqual({ ...capture, capturedBy: 'agent-a' })
    await submitSellerOnboarding('valid-token', { listingSnapshot: { id: listingId }, formData: { sellerDisclosureCapture: capture } })
    calls = client.rpc.mock.calls.filter(([name]) => name === 'bridge_complete_private_listing_seller_onboarding')
    expect(calls.at(-1)[1].p_form_data.sellerDisclosureCapture).toEqual(capture)
  })

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

describe('seller checklist persistence with PostgreSQL date fields', () => {
  let db
  let batches
  let requestFailure
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
    requestFailure = null
    await db.exec(`create table private_listing_document_requirements (
      id uuid primary key default gen_random_uuid(), private_listing_id uuid not null, requirement_key text not null,
      requirement_name text, requirement_description text, requirement_group text, document_visibility text, applies_to text, visibility text,
      status text, is_required boolean, generated_from jsonb, canonical_requirement_instance_id uuid,
      requested_from_role text, request_stage text, request_priority text, request_due_date date,
      request_delivery_channels jsonb, request_dedupe_key text, request_source text, requested_at timestamptz,
      request_revision integer, last_request_reason text, request_metadata jsonb,
      satisfied_by_document_id uuid, satisfaction_verified_at timestamptz, assurance_metadata jsonb,
      created_at timestamptz default now(), updated_at timestamptz default now(),
      unique(private_listing_id,requirement_key));
      create unique index private_listing_document_requirements_request_dedupe_idx
      on private_listing_document_requirements(request_dedupe_key) where request_dedupe_key is not null`)
    client.from.mockImplementation((table) => {
      let payload = null
      let single = false
      let update = null
      const filters = []
      const query = {
        select: () => query, order: () => query,
        eq: (key, value) => { filters.push(row => row[key] === value); return query },
        in: (key, values) => { filters.push(row => values.includes(row[key])); return query },
        update: (value) => { update = value; return query },
        maybeSingle: () => { single = true; return query },
        upsert: (rows) => { payload = rows; batches.push(rows); return query },
        then: (resolve, reject) => (async () => {
          if (table !== 'private_listing_document_requirements') {
            if (!['private_listing_documents', 'private_listing_seller_onboarding'].includes(table) || payload) throw new Error(`Unexpected table: ${table}`)
            return { data: single ? null : [], error: null }
          }
          try {
            if (update && requestFailure) return { data: null, error: requestFailure }
            let rows = payload ? await writeRows(payload) : (await readRows()).filter(row => filters.every(filter => filter(row)))
            if (update && rows.length) rows = await writeRows(rows.map(row => ({ ...row, ...update })))
            return { data: single ? rows[0] || null : rows, error: null }
          }
          catch (error) { return { data: null, error } }
        })().then(resolve, reject),
      }
      return query
    })
  })
  afterEach(async () => { await db.close() })

  function confirmSave(update) {
    client.rpc.mockReturnValue(rpcResult({ mutationId: update.mutationId,
      listing: { id: listingId, listing_status: 'listing_review', seller_type: update.sellerType, seller_onboarding_status: 'completed', seller_canonical_facts_json: update.canonicalFacts },
      onboarding: { id: onboardingId, private_listing_id: listingId, status: 'completed', form_data: update.nextFormData, canonical_facts_json: update.canonicalFacts },
    }))
  }

  it('saves ownership corrections, issues the new checklist and retires old requests without deleting documents', async () => {
    let listing = { ...savedListing, listingStatus: 'listing_review' }
    await syncPrivateListingRequirements(listing, { emitActivity: false })
    const retainedId = (await readRows()).find(row => row.requirement_key === 'id_document').id
    for (const branch of ['company', 'trust', 'multiple_owners', 'individual']) {
      const draft = { ...selectListingSellerProfileBranch(createListingSellerProfileBuilderDraft(listing), branch),
        companyName: branch === 'company' ? 'Corrected Company' : '',
        trustName: branch === 'trust' ? 'Corrected Trust' : '',
        multipleOwners: branch === 'multiple_owners' ? [
          { name: 'Saved', surname: 'Owner', email: 'owner@example.test' },
          { name: 'Second', surname: 'Owner', email: 'second@example.test' },
        ] : [],
      }
      const update = buildListingSellerCanonicalUpdate({ listing, formPatch: buildListingSellerProfileFormPatch(draft),
        mutationType: 'seller_profile_capture', mutationId: crypto.randomUUID() })
      confirmSave(update)
      const result = await savePrivateListingSellerCanonicalUpdate(update, {
        includeRequirementsAndDocuments: false, forceRequirementSync: true,
      })
      listing = result.listing
      expect(listing.sellerOnboarding.formData.ownerStructureType).toBe(branch)
      const rows = await readRows()
      const expectedKeys = new Set(syncSellerDocumentRequirements(listing, []).upsertRows.map(row => row.requirement_key))
      expect(result.requirementSyncResult.requestIssuance.counts.failed).toBe(0)
      for (const row of rows) {
        if (expectedKeys.has(row.requirement_key)) {
          if (row.status === 'required') expect(result.requirementSyncResult.requestIssuance.suppressed.some(item => item.key === row.requirement_key), row.requirement_key).toBe(true)
          else expect(['requested', 'approved', 'uploaded', 'under_review']).toContain(row.status)
        }
        else expect(row).toMatchObject({ status: 'not_applicable', is_required: false })
      }
      if (branch === 'company') expect(rows.find(row => row.requirement_key === 'company_registration')).toMatchObject({ status: 'requested', is_required: true })
      if (branch === 'trust') expect(rows.find(row => row.requirement_key === 'seller_trust_deed')).toMatchObject({ status: 'requested', is_required: true })
      if (branch === 'multiple_owners') expect(rows.find(row => row.requirement_key === 'owner_2_id_document')).toMatchObject({ status: 'requested', is_required: true })
    }
    expect((await readRows()).find(row => row.requirement_key === 'id_document').id).toBe(retainedId)
    expect(client.from.mock.calls.some(([table]) => table === 'private_listings')).toBe(false)
  })

  it.each(['commercial', 'mixed_use'])('refreshes a saved company profile for %s without duplicate occupation-certificate writes', async (propertyCategory) => {
    const oldOnboardingId = crypto.randomUUID()
    await writeRows([{ id: oldOnboardingId, private_listing_id: listingId,
      requirement_key: 'seller_onboarding_submission', requirement_name: 'Seller Onboarding Submission',
      status: 'requested', is_required: true }])
    const listing = { ...savedListing, listingStatus: 'onboarding_completed', sellerType: 'company',
      sellerOnboarding: { ...savedListing.sellerOnboarding, formData: { ...savedListing.sellerOnboarding.formData,
        ownerStructureType: 'company', ownerEntityType: 'company', sellerBranch: 'individual',
        propertyCategory, propertyBranch: 'residential', propertyStructureType: 'full_title',
        ownershipScheme: 'agricultural_holding', occupancyStatus: 'owner_occupied', bondStatus: 'no_bond',
      } } }
    const update = buildListingSellerCanonicalUpdate({ listing, formPatch: { sellerSurname: 'Corrected' },
      mutationType: 'seller_profile_capture', mutationId: crypto.randomUUID() })
    confirmSave(update)
    const options = { includeRequirementsAndDocuments: false, forceRequirementSync: true }
    const first = await savePrivateListingSellerCanonicalUpdate(update, options)
    expect(first.requirementSyncResult.requestIssuance.counts.failed).toBe(0)
    let rows = await readRows()
    expect(rows.find(row => row.id === oldOnboardingId)).toMatchObject({ status: 'not_applicable', is_required: false })
    for (const key of ['signed_mandate', 'signed_fica_declaration', 'company_registration', 'occupation_certificate']) {
      expect(rows.filter(row => row.requirement_key === key)).toHaveLength(1)
    }
    const certificate = rows.find(row => row.requirement_key === 'occupation_certificate')
    const documentId = crypto.randomUUID()
    await writeRows([{ ...certificate, status: 'approved', satisfied_by_document_id: documentId,
      request_metadata: { delivered: true }, request_due_date: '2026-10-12' }])
    const retried = await savePrivateListingSellerCanonicalUpdate(update, options)
    expect(retried.requirementSyncResult.requestIssuance.counts.failed).toBe(0)
    rows = await readRows()
    expect(rows.filter(row => row.requirement_key === 'occupation_certificate')).toHaveLength(1)
    expect(rows.find(row => row.requirement_key === 'occupation_certificate')).toMatchObject({
      id: certificate.id, status: 'approved', satisfied_by_document_id: documentId,
      request_metadata: { delivered: true }, request_due_date: '2026-10-12',
    })
    for (const batch of batches) {
      const keys = batch.map(row => `${row.private_listing_id}:${row.requirement_key}`)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('reports a committed correction when request issuance fails, then refreshes on a forced retry', async () => {
    const update = { ...buildListingSellerCanonicalUpdate({ listing: savedListing, formPatch: { sellerSurname: 'Corrected' }, mutationId: crypto.randomUUID() }), requirementsAffected: false }
    confirmSave(update)
    requestFailure = { code: '42501', message: 'request update denied' }
    await expect(savePrivateListingSellerCanonicalUpdate(update, { includeRequirementsAndDocuments: false, forceRequirementSync: true }))
      .rejects.toMatchObject({ code: 'SELLER_REQUIREMENT_SYNC_FAILED', committed: true, cause: requestFailure,
        listing: { sellerOnboarding: { formData: { sellerSurname: 'Corrected' } } } })
    expect((await readRows()).some(row => row.status === 'required')).toBe(true)
    requestFailure = null
    const retry = await savePrivateListingSellerCanonicalUpdate(update, { includeRequirementsAndDocuments: false, forceRequirementSync: true })
    expect(retry.requirementSyncResult.requestIssuance.counts.applied).toBeGreaterThan(0)
    expect(retry.requirementSyncResult.requestIssuance.counts.failed).toBe(0)
  })

  it('does not report a successful checklist refresh when every supported schema rejects the save', async () => {
    // Schema failures are cached for the lifetime of a browser module. Isolate
    // this unavailable-environment fixture from the healthy-environment tests.
    vi.resetModules()
    const isolatedService = await import('../privateListingService')
    const update = buildListingSellerCanonicalUpdate({ listing: savedListing, formPatch: { sellerSurname: 'Corrected' }, mutationId: crypto.randomUUID() })
    confirmSave(update)
    const createQuery = client.from.getMockImplementation()
    client.from.mockImplementation(table => {
      const query = createQuery(table)
      if (table === 'private_listing_document_requirements') query.upsert = () => ({ select: () => rpcResult(null, { code: '42703', message: 'column requirement_key does not exist' }) })
      return query
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await expect(isolatedService.savePrivateListingSellerCanonicalUpdate(update, { includeRequirementsAndDocuments: false, forceRequirementSync: true }))
        .rejects.toMatchObject({ code: 'SELLER_REQUIREMENT_SYNC_FAILED', committed: true,
          cause: { message: 'The seller document checklist is unavailable in this environment.' } })
    } finally { warn.mockRestore(); vi.resetModules() }
  })

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
      request_due_date: '2026-10-12', requested_at: '2026-10-05T07:00:00Z', request_dedupe_key: `saved-request:${row.requirement_key}`,
      canonical_requirement_instance_id: crypto.randomUUID(), request_revision: 3, request_metadata: { delivery: 'recorded' } }))
    await writeRows(seed)
    await syncPrivateListingRequirements(savedListing, { emitActivity: false })
    for (const row of await readRows()) expect(row).toMatchObject({ request_due_date: '2026-10-12',
      requested_at: '2026-10-05T07:00:00+00:00', request_dedupe_key: `saved-request:${row.requirement_key}`, request_revision: 3,
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

  it('creates a separate spouse request without reusing the seller identity or its dedupe key', async () => {
    const id = crypto.randomUUID()
    await writeRows([{ id, private_listing_id: listingId, requirement_key: 'id_document', status: 'approved',
      request_dedupe_key: 'seller-id-request', satisfied_by_document_id: crypto.randomUUID() }])
    const before = await readRows()
    const result = await ensurePrivateListingDocumentRequirements(listingId, [{ requirementKey: 'spouse_id_document', requirementName: 'Spouse identity' }])
    expect(result).toHaveLength(2)
    expect((await readRows()).find(row => row.requirement_key === 'id_document')).toEqual(before[0])
    expect(result.find(row => row.requirement_key === 'spouse_id_document')).toMatchObject({ status: 'required' })
    expect(result.find(row => row.requirement_key === 'spouse_id_document').id).not.toBe(id)
    expect(result.find(row => row.requirement_key === 'spouse_id_document').request_dedupe_key).not.toBe('seller-id-request')
  })

  it('prefers each exact request over a similar document key and preserves their approvals', async () => {
    await writeRows(['id_document', 'spouse_id_document'].map(key => ({ id: crypto.randomUUID(), private_listing_id: listingId,
      requirement_key: key, status: 'approved', request_dedupe_key: `${key}-request`, satisfied_by_document_id: crypto.randomUUID() })))
    const before = await readRows()
    await ensurePrivateListingDocumentRequirements(listingId, ['id_document','spouse_id_document'].map(requirementKey => ({ requirementKey })))
    for (const row of await readRows()) {
      const old = before.find(item => item.requirement_key === row.requirement_key)
      expect(row).toMatchObject({ id: old.id, status: old.status, request_dedupe_key: old.request_dedupe_key, satisfied_by_document_id: old.satisfied_by_document_id })
    }
  })

  it('reuses explicit legacy aliases without renaming or inserting the same request twice', async () => {
    const id = crypto.randomUUID()
    await writeRows([{ id, private_listing_id: listingId, requirement_key: 'signed_defect_form', status: 'approved', request_dedupe_key: 'disclosure-request' }])
    const result = await ensurePrivateListingDocumentRequirements(listingId, [{ requirementKey: 'signed_disclosure_form' }, { requirementKey: 'signed_defect_form' }])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id, requirement_key: 'signed_defect_form', status: 'approved', request_dedupe_key: 'disclosure-request' })
  })

  it('does not create requests when existing checklist identities cannot be read', async () => {
    const error = { code: '42501', message: 'Checklist read denied' }
    const query = { select: () => query, eq: () => query, order: () => query,
      then: (resolve) => Promise.resolve({ data: null, error }).then(resolve) }
    client.from.mockImplementationOnce(() => query)
    await expect(ensurePrivateListingDocumentRequirements(listingId, [{ requirementKey: 'id_document' }])).rejects.toEqual(error)
    expect(batches).toHaveLength(0)
    expect(await readRows()).toHaveLength(0)
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


describe('exact upload requirement resolution', () => {
  const requirement = (key, id = listingId, extra = {}) => ({ id, requirement_key: key, is_required: true, status: 'required', ...extra })
  it('prefers an exact key over a legacy alias and retains the persisted id', () => {
    const rows = [requirement('seller_id', onboardingId), requirement('id_document')]
    expect(resolvePrivateListingDocumentRequirement(rows, { requirementKey: 'id_document' }).id).toBe(listingId)
  })
  it('never links a spouse file to the main identity requirement by substring', () => {
    expect(() => resolvePrivateListingDocumentRequirement([requirement('id_document')], { requirementKey: 'spouse_id_document' })).toThrow(/No active/)
  })
  it('supports explicit aliases, while refusing multiple alias candidates', () => {
    expect(resolvePrivateListingDocumentRequirement([requirement('seller_id')], { requirementKey: 'id_document' }).id).toBe(listingId)
    expect(() => resolvePrivateListingDocumentRequirement([requirement('seller_id'), requirement('passport', onboardingId)], { requirementKey: 'id_document' })).toThrow(/More than one/)
  })
  it.each([{ is_required: false }, { status: 'not_applicable' }])('never attaches an inactive requirement: %j', (extra) => {
    expect(() => resolvePrivateListingDocumentRequirement([requirement('id_document', listingId, extra)], { requirementId: listingId, documentType: 'id_document' })).toThrow(/unavailable/)
  })
  it('rejects a missing explicit id even when another requirement has the same key', () => {
    expect(() => resolvePrivateListingDocumentRequirement([requirement('id_document')], { requirementId: onboardingId, requirementKey: 'id_document' })).toThrow(/unavailable/)
  })
  it('rejects an explicit id paired with another document type', () => {
    expect(() => resolvePrivateListingDocumentRequirement([requirement('id_document')], { requirementId: listingId, requirementKey: 'company_address_proof' })).toThrow(/does not match/)
  })
  it('permits generic internal files without inventing a requirement', () => {
    expect(resolvePrivateListingDocumentRequirement([], { documentType: 'listing_document', required: false })).toBeNull()
  })
})


describe('seller document repair receipt', () => {
  it('uses the scoped command and returns a verified repair receipt', async () => {
    client.rpc.mockReturnValue(rpcResult({ ok: true, linkedCount: 1, remainingCount: 2 }))
    await expect(repairSellerDocumentRequirementLinks({ listingId })).resolves.toEqual({ ok: true, linkedCount: 1, remainingCount: 2 })
    expect(client.rpc).toHaveBeenCalledWith('bridge_repair_private_listing_seller_document_links', { p_listing_id: listingId })
    expect(client.from).not.toHaveBeenCalled()
  })
  it('refuses an unavailable command without using direct table updates', async () => {
    client.rpc.mockReturnValue(rpcResult(null, { code: 'PGRST202', message: 'Could not find the function' }))
    await expect(repairSellerDocumentRequirementLinks({ listingId })).rejects.toThrow(/must be deployed/)
    expect(client.from).not.toHaveBeenCalled()
  })
  it('does not claim success for an empty command response', async () => {
    client.rpc.mockReturnValue(rpcResult(null))
    await expect(repairSellerDocumentRequirementLinks({ listingId })).rejects.toThrow(/could not be verified/)
  })
})


it('flags pending seller files while retaining generic internal and buyer offer evidence', () => {
  expect(isUnlinkedSellerReviewDocument({ document_type:'cipc_documents',status:'uploaded' })).toBe(true)
  expect(isUnlinkedSellerReviewDocument({ document_type:'listing_document',status:'uploaded' })).toBe(false)
  expect(isUnlinkedSellerReviewDocument({ document_type:'wet_ink_otp_buyer',category:'buyer_offer',status:'uploaded' })).toBe(false)
  expect(isUnlinkedSellerReviewDocument({ document_type:'cipc_documents',status:'approved' })).toBe(false)
})
