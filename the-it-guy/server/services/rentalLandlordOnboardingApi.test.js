import { beforeEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
import {
  handlePublicRentalLandlordOnboarding,
  handleRentalLandlordOnboarding,
} from './rentalLandlordOnboardingApi.js'
const env = {
  SUPABASE_URL: 'https://example.test',
  SUPABASE_ANON_KEY: 'public-test',
  SUPABASE_SERVICE_ROLE_KEY: 'server-test',
}
let db, scoped, lead, saved, access, storage, doc, readbackError
const agent = (body = {}, method = 'POST') =>
  handleRentalLandlordOnboarding({
    method,
    body: { leadId: 'lead', ...body },
    headers: { Authorization: 'Bearer agent-token' },
    env,
  })
const landlord = (body = {}, method = 'POST') =>
  handlePublicRentalLandlordOnboarding({
    method,
    body,
    headers: { Authorization: 'Bearer landlord-token' },
    env,
  })
beforeEach(() => {
  vi.clearAllMocks()
  doc = null
  readbackError = false
  lead = {
    lead_id: 'lead',
    organisation_id: 'org',
    branch_id: 'branch',
    assigned_agent_id: 'actor',
    raw_enquiry_payload: {
      rentalCrm: {
        role: 'landlord',
        notes: 'internal',
        landlordProfile: {
          type: 'individual',
          name: 'Owner',
          email: 'owner@example.test',
          idNumber: 'A',
          notes: 'private',
        },
        landlordPortfolio: [
          {
            id: 'home',
            title: 'Home',
            address: 'One Road',
            canonicalPropertyId: 'managed',
            mandateId: 'private-mandate',
            currentTenant: 'private-tenant',
          },
        ],
      },
    },
  }
  saved = {
    payload: lead.raw_enquiry_payload,
    version: 2,
    status: 'draft',
    requirements: [
      {
        id: 'requirement',
        subject_id: 'primary',
        scope_key: 'identity',
        purpose: 'identity',
        required: true,
        active: true,
        generation: 3,
        state: 'missing',
        fingerprint_json: { idNumber: 'secret' },
        current_landlord_document_id: null,
      },
    ],
    documents: [],
  }
  access = {
    lead_id: 'lead',
    organisation_id: 'org',
    expires_at: '2099-01-01',
    revoked_at: null,
  }
  storage = {
    createSignedUploadUrl: vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://example.test/upload' },
    }),
    info: vi.fn().mockResolvedValue({
      data: { size: 123, contentType: 'application/pdf' },
    }),
    remove: vi.fn().mockResolvedValue({}),
    createSignedUrl: vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://example.test/view' } }),
  }
  const query = (table) => {
    const q = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'link-id' } }),
      maybeSingle: vi.fn(async () => ({
        data:
          table === 'leads'
            ? lead
            : table === 'rental_landlord_onboarding_access'
              ? access
              : table === 'rental_properties'
                ? { organisation_id: 'org', branch_id: 'branch' }
                : doc,
        ...(table === 'leads' && readbackError
          ? { error: { message: 'read unavailable' } }
          : {}),
      })),
    }
    return q
  }
  db = {
    from: vi.fn(query),
    storage: { from: vi.fn().mockReturnValue(storage) },
    rpc: vi.fn(async (name, args) => {
      if (name === 'rental_landlord_onboarding_snapshot') return { data: saved }
      saved.version++
      if (args.p_command === 'save') {
        lead.raw_enquiry_payload.rentalCrm.landlordProfile =
          args.p_payload.profile
        lead.raw_enquiry_payload.rentalCrm.landlordPortfolio =
          args.p_payload.portfolio
      }
      return { data: { version: saved.version, status: saved.status } }
    }),
  }
  scoped = {
    rpc: vi.fn().mockResolvedValue({data:true}),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'actor' } } }),
    },
    from: vi.fn(query),
  }
  mocks.createClient.mockImplementation((_url, key) =>
    key === 'public-test' ? scoped : db,
  )
})
it('requires an RLS-visible lead before creating the privileged client', async () => {
  expect((await handleRentalLandlordOnboarding({ env })).status).toBe(401)
  expect(mocks.createClient).not.toHaveBeenCalled()
  lead = null
  expect((await agent({}, 'GET')).status).toBe(404)
  expect(mocks.createClient).toHaveBeenCalledTimes(1)
  expect(db.rpc).not.toHaveBeenCalled()
})
it('hashes public tokens, rejects expired or revoked access and ignores a supplied alternate lead', async () => {
  const result = await landlord({ leadId: 'other' }, 'GET')
  expect(result.body.onboarding.id).toBe('lead')
  const q = db.from.mock.results.find(
    (_r, index) =>
      db.from.mock.calls[index][0] === 'rental_landlord_onboarding_access',
  ).value
  expect(q.eq).toHaveBeenCalledWith(
    'token_hash',
    createHash('sha256').update('landlord-token').digest('hex'),
  )
  access.revoked_at = '2026-01-01'
  expect((await landlord({}, 'GET')).status).toBe(401)
  access.revoked_at = null
  access.expires_at = '2000-01-01'
  expect((await landlord({}, 'GET')).status).toBe(401)
})
it('projects landlord responses and preserves private property links during a public save', async () => {
  const result = await landlord({}, 'GET')
  const data = result.body.onboarding.data
  expect(data.profile.notes).toBeUndefined()
  expect(data.portfolio[0].canonicalPropertyId).toBeUndefined()
  expect(JSON.stringify(result.body)).not.toMatch(
    /private-tenant|private-mandate|fingerprint|savedDiscovery|internal/,
  )
  const response = await landlord(
    {
      version: 2,
      patch: {
        profile: { name: 'New owner', notes: 'injected' },
        portfolio: [
          { id: 'home', address: 'Changed Road', canonicalPropertyId: 'other' },
        ],
      },
    },
    'PATCH',
  )
  expect(response.status).toBe(200)
  const call = db.rpc.mock.calls.find(
    ([name]) => name === 'rental_landlord_onboarding_command',
  )[1]
  expect(call.p_payload.profile.notes).toBe('private')
  expect(call.p_payload.portfolio[0].canonicalPropertyId).toBe('managed')
  expect(call.p_payload.portfolio[0].address).toBe('Changed Road')
  expect(call.p_scope).toEqual({
    organisation_id: 'org',
    branch_id: 'branch',
    assigned_agent_id: 'actor',
  })
})
it('rejects stale saves and public changes to the property list or review state', async () => {
  expect((await landlord({ version: 1, patch: {} }, 'PATCH')).status).toBe(409)
  expect(
    (await landlord({ version: 2, patch: { portfolio: [] } }, 'PATCH')).status,
  ).toBe(400)
  expect(
    (
      await landlord({
        version: 2,
        action: 'review_document',
        patch: { status: 'accepted' },
      })
    ).status,
  ).toBe(400)
  expect(
    db.rpc.mock.calls.every(
      ([name]) => name === 'rental_landlord_onboarding_snapshot',
    ),
  ).toBe(true)
})
const preparation = {
  action: 'prepare_upload',
  version: 2,
  requirementId: 'requirement',
  generation: 3,
  fileName: 'ID.pdf',
  mimeType: 'application/pdf',
  fileSize: 123,
}
it('binds receipts to the saved generation, source, version and private storage file', async () => {
  expect((await agent({ ...preparation, generation: 1 })).status).toBe(409)
  expect(storage.createSignedUploadUrl).not.toHaveBeenCalled()
  const ready = await agent(preparation)
  expect(ready.status).toBe(201)
  expect(storage.createSignedUploadUrl.mock.calls[0][0]).toMatch(/^org\/lead\//)
  expect(storage.createSignedUploadUrl.mock.calls[0][1]).toEqual({
    upsert: false,
  })
  expect(
    (
      await landlord({
        action: 'complete_upload',
        version: 2,
        ticket: ready.body.ticket,
      })
    ).status,
  ).toBe(400)
  expect(
    (
      await agent({
        action: 'complete_upload',
        version: 2,
        ticket: ready.body.ticket + 'x',
      })
    ).status,
  ).toBe(400)
  storage.info.mockResolvedValueOnce({
    data: { size: 124, contentType: 'application/pdf' },
  })
  expect(
    (
      await agent({
        action: 'complete_upload',
        version: 2,
        ticket: ready.body.ticket,
      })
    ).status,
  ).toBe(400)
  const complete = await agent({
    action: 'complete_upload',
    version: 2,
    ticket: ready.body.ticket,
  })
  expect(complete.status).toBe(200)
  const call = db.rpc.mock.calls.find(
    ([name]) => name === 'rental_landlord_onboarding_command',
  )[1]
  expect(call.p_payload).toMatchObject({
    leadId: 'lead',
    organisationId: 'org',
    requirementId: 'requirement',
    generation: 3,
    version: 2,
    source: 'agent',
  })
})
it('removes an uncommitted failed upload but retains a file when its row was committed', async () => {
  const ready = await agent(preparation)
  const rpc = db.rpc.getMockImplementation()
  db.rpc.mockImplementation((name, args) =>
    name === 'rental_landlord_onboarding_command'
      ? { error: { message: 'Landlord onboarding changed' } }
      : rpc(name, args),
  )
  expect(
    (
      await agent({
        action: 'complete_upload',
        version: 2,
        ticket: ready.body.ticket,
      })
    ).status,
  ).toBe(409)
  expect(storage.remove).toHaveBeenCalledOnce()
  storage.remove.mockClear()
  doc = { id: 'committed' }
  expect(
    (
      await agent({
        action: 'complete_upload',
        version: 2,
        ticket: ready.body.ticket,
      })
    ).status,
  ).toBe(409)
  expect(storage.remove).not.toHaveBeenCalled()
})
it('retains the acknowledged version when readback fails after a committed save', async () => {
  readbackError = true
  // The RLS parent succeeds; only the privileged post-save readback fails.
  scoped.from.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: lead }),
  })
  const result = await agent(
    { version: 2, patch: { profile: { name: 'Saved owner' } } },
    'PATCH',
  )
  expect(result).toEqual({
    status: 200,
    body: {
      saved: true,
      version: 3,
      status: 'draft',
      documentId: undefined,
      checklistUnavailable: true,
    },
  })
})
it('stores only a token hash and returns a newly generated secure link once', async () => {
  const result = await agent({ action: 'create_access' })
  expect(result.status).toBe(201)
  expect(result.body.token.length).toBeGreaterThanOrEqual(40)
  const q = db.from.mock.results.find(
    (_r, index) =>
      db.from.mock.calls[index][0] === 'rental_landlord_onboarding_access',
  ).value
  expect(q.insert.mock.calls[0][0]).toMatchObject({
    lead_id: 'lead',
    organisation_id: 'org',
    created_by: 'actor',
    token_hash: createHash('sha256').update(result.body.token).digest('hex'),
  })
  expect(q.insert.mock.calls[0][0].token).toBeUndefined()
})
it('requires the current rental branch in addition to the parent lead permissions',async () => {
 scoped.rpc.mockResolvedValue({data:false})
 const result=await agent({},'GET')
 expect(result.status).toBe(404);expect(mocks.createClient).toHaveBeenCalledTimes(1)
 expect(scoped.rpc).toHaveBeenCalledWith('rental_branch_access',{target_org:'org',target_branch:'branch'})
 expect(db.rpc).not.toHaveBeenCalled()
})
it('allows agent bookkeeping links after submission while keeping discovery locked',async () => {
 saved.status='submitted'
 expect((await agent({version:2,patch:{profile:{name:'Changed'}}},'PATCH')).status).toBe(409)
 const result=await agent({version:2,action:'link_property',patch:{propertyId:'home',mandateId:'mandate'}})
 expect(result.status).toBe(200)
 expect(db.rpc).toHaveBeenCalledWith('rental_landlord_onboarding_link_property',expect.objectContaining({p_expected_version:2,p_actor:'actor',p_payload:{propertyId:'home',mandateId:'mandate'}}))
 // An older version must reach the locked command, which determines whether it is a committed retry.
 expect((await agent({version:2,action:'link_property',patch:{propertyId:'home',mandateId:'mandate'}})).status).toBe(200)
 expect((await agent({version:null,action:'link_property',patch:{propertyId:'home',mandateId:'mandate'}})).status).toBe(400)
 expect((await landlord({version:3,action:'link_property',patch:{propertyId:'home',mandateId:'mandate'}})).status).toBe(400)
})
it('checks listing permissions before privileged handoff writes',async () => {
 const result=await agent({version:2,action:'link_property',patch:{propertyId:'home',listingId:'hidden'}})
 expect(result.status).toBe(404)
 expect(mocks.createClient).toHaveBeenCalledOnce()
 expect(db.rpc).not.toHaveBeenCalled()
})
