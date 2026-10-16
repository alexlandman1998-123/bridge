import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const { client } = vi.hoisted(() => ({ client: { from: vi.fn(), rpc: vi.fn(), auth: { getUser: vi.fn() }, storage: { from: vi.fn() } } }))
vi.mock('../../lib/supabaseClient', () => ({
  supabase: client, isSupabaseConfigured: true, createScopedSupabaseClient: () => client,
  DOCUMENTS_BUCKET: 'documents', DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
  BRANDING_BUCKET_CANDIDATES: ['branding'], PROFILE_AVATAR_BUCKET_CANDIDATES: ['avatars'], LEGAL_TEMPLATES_BUCKET_CANDIDATES: ['legal-templates'],
}))
import { uploadPrivateListingDocument, getPrivateListingDocuments } from '../privateListingService.js'

let tables, events, objects
const listingId = '00000000-0000-4000-8000-000000000001'
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request') }))
  events = []; objects = new Map()
  tables = {
    private_listings: [{ id: listingId, organisation_id: '00000000-0000-4000-8000-000000000003', listing_status: 'onboarding_sent', listing_visibility: 'internal', is_active: false }],
    private_listing_seller_onboarding: [{ id: '00000000-0000-4000-8000-000000000002', private_listing_id: listingId, status: 'sent', seller_type: 'individual', form_data: { ownershipType: 'individual', maritalStatus: 'not_married', propertyStructureType: 'sectional_title' } }],
    private_listing_document_requirements: [], private_listing_documents: [],
  }
  client.auth.getUser.mockResolvedValue({ data: { user: { id: '00000000-0000-4000-8000-000000000004' } }, error: null })
  client.rpc.mockImplementation(async name => ({ data: name === 'bridge_promote_private_listing_document_row' ? { promotion_status: 'pending_transaction' } : null, error: null }))
  client.from.mockImplementation(table => {
    const filters = []; let action = 'read', payload, single = false, result
    const query = {
      select() { return this }, order() { return this }, limit() { return this }, range() { return this }, abortSignal() { return this },
      eq(key, value) { filters.push(row => row[key] === value); return this },
      in(key, values) { filters.push(row => values.includes(row[key])); return this },
      insert(value) { action = 'insert'; payload = value; return this },
      upsert(value) { action = 'upsert'; payload = value; return this },
      update(value) { action = 'update'; payload = value; return this },
      single() { single = true; return this }, maybeSingle() { single = true; return this },
      then(resolve, reject) {
        if (!result) result = Promise.resolve().then(() => {
          const rows = tables[table] ||= []
          let data = rows.filter(row => filters.every(filter => filter(row)))
          if (action === 'insert' || action === 'upsert') {
            data = (Array.isArray(payload) ? payload : [payload]).map(value => {
              if (table === 'private_listing_documents' && !tables.private_listing_document_requirements.some(row => row.id === value.requirement_id)) throw new Error('A file must link to its saved exact requirement')
              const existing = action === 'upsert' && rows.find(row => row.private_listing_id === value.private_listing_id && row.requirement_key === value.requirement_key)
              const row = { id: crypto.randomUUID(), ...value }
              if (table === 'private_listing_document_requirements') row.canonical_requirement_instance_id = crypto.randomUUID()
              if (existing) Object.assign(existing, value)
              else rows.push(row)
              events.push(`${action}:${table}`)
              return existing || row
            })
          } else if (action === 'update') data.forEach(row => Object.assign(row, payload))
          return { data: structuredClone(single ? data[0] || null : data), error: null }
        })
        return result.then(resolve, reject)
      },
    }
    return query
  })
  client.storage.from.mockReturnValue({
    upload: async (path, body) => { events.push('storage'); objects.set(path, body); return { data: { path }, error: null } },
    createSignedUrl: async path => ({ data: { signedUrl: `https://storage.invalid/${path}` }, error: null }),
    remove: async () => { throw new Error('A confirmed upload must not be removed') },
  })
})
afterEach(() => vi.unstubAllGlobals())

it.each(['signed_mandate', 'signed_disclosure_form', 'signed_fica_declaration'])('saves %s on the first attempt before onboarding capture finishes', async requirementKey => {
  const file = new File(['%PDF-1.4\nSynthetic signed upload'], `${requirementKey}.pdf`, { type: 'application/pdf' })
  const result = await uploadPrivateListingDocument(listingId, file, { requirementKey, documentType: requirementKey, visibility: 'internal', existingSignedEvidence: true, deferMandateSigning: true })
  const savedRequirement = tables.private_listing_document_requirements.find(row => row.requirement_key === requirementKey)
  expect(result).toMatchObject({ requirement_id: savedRequirement.id, status: 'uploaded', persistence: { recordVerified: true } })
  expect(tables.private_listing_document_requirements).toHaveLength(1)
  expect(tables.private_listing_documents).toHaveLength(1)
  expect(tables.private_listing_documents[0].canonical_requirement_instance_id).toBe(savedRequirement.canonical_requirement_instance_id)
  expect(events.indexOf('upsert:private_listing_document_requirements')).toBeLessThan(events.indexOf('storage'))
  expect(await objects.get(result.storage_path).text()).toBe(await file.text())
  const reloaded = await getPrivateListingDocuments(listingId)
  expect(reloaded[0]).toMatchObject({ id: result.id, requirement_id: savedRequirement.id, fileUrl: result.url })
  const reopened = await uploadPrivateListingDocument(listingId, file, { requirementKey, documentType: requirementKey, visibility: 'internal', existingSignedEvidence: true, deferMandateSigning: true })
  expect(reopened.id).toBe(result.id)
  expect(objects.size).toBe(1)
  expect(tables.private_listing_documents).toHaveLength(1)
})

it('rejects a retired visible target before uploading or creating another requirement', async () => {
  tables.private_listing_document_requirements.push({ id: crypto.randomUUID(), private_listing_id: listingId, requirement_key: 'signed_mandate', status: 'not_applicable', is_required: false })
  await expect(uploadPrivateListingDocument(listingId, new File(['%PDF-1.4'], 'mandate.pdf', { type: 'application/pdf' }), { requirementKey: 'signed_mandate', documentType: 'signed_mandate', existingSignedEvidence: true }))
    .rejects.toThrow(/No active seller requirement/)
  expect(events).toEqual([])
  expect(objects.size).toBe(0)
})
