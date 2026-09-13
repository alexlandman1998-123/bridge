import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// Execute the real save function with storage boundaries mocked: an inactive
// identity must reach the canonical RPC intact, never as a new blank identity.
const source = await readFile(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8')
const start = source.indexOf('export async function saveOrganisationPreferredPartner(')
const end = source.indexOf('export async function removeOrganisationPreferredPartner(', start)
assert.ok(start >= 0 && end > start)
const partner = { id: '88a83299-d341-4ab1-bed6-92f4e46853f7', partnerType: 'referral_agency', companyName: 'Test referral', isActive: false }
let captured
const dependencies = {
  isSupabaseConfigured: true, supabase: {}, requireClient: () => ({}),
  ensureOrganisationContext: async () => ({ organisation: { id: 'agency' } }),
  assertOrganisationAdminAccess: () => {}, normalizePreferredPartnerRecord: (input) => input,
  createLocalPartnerId: () => { throw new Error('Existing partner must not get a new id') },
  listOrganisationPreferredPartners: async (options) => {
    assert.equal(options?.includeInactive, true)
    return [partner]
  },
  normalizePreferredPartnerType: (type) => type,
  mapPreferredPartnerToRow: (input) => ({ ...input }), looksLikeUuid: () => true,
  savePreferredPartnerViaCanonicalRpc: async (_client, org, input) => {
    assert.equal(org, 'agency'); captured = input; return input
  },
}
const save = new Function(...Object.keys(dependencies), `${source.slice(start,end).replace('export ', '')}; return saveOrganisationPreferredPartner`)(...Object.values(dependencies))
const result = await save({ ...partner, isActive: true })
assert.equal(captured.id, partner.id)
assert.equal(result.id, partner.id)
assert.equal(result.isActive, true)
console.log('PASS: reactivation retains the inactive partner identity and does not request a duplicate')
