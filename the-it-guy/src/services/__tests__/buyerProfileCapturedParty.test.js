import { expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: null }))
import { linkReusableBuyerProfileToTransaction } from '../buyerProfileReuseService.js'

function database({ alreadyLinked = false } = {}) {
  const writes = []
  const captured = { id: 'person', buyer_party_id: alreadyLinked ? 'other' : null, ownership_percentage: 50, signing_required: false, buyer_metadata: { imported: true } }
  const from = vi.fn(table => {
    const filters = []; let operation = 'select'; let payload
    const query = {
      select() { return query }, eq(key, value) { filters.push([key, value]); return query }, is() { return query },
      update(value) { operation = 'update'; payload = value; return query },
      insert(value) { operation = 'insert'; payload = value; return query },
      upsert(value) { operation = 'upsert'; payload = value; return query }, order() { return query },
      single() { return execute() }, maybeSingle() { return execute() },
      then(resolve, reject) { return execute().then(resolve, reject) },
    }
    async function execute() {
      if (operation !== 'select') { writes.push({ table, operation, payload, filters }); return { data: { id: 'person', ...payload } } }
      if (table === 'buyers') return { data: { id: 'profile', name: 'Saved Buyer' } }
      if (table === 'buyer_profile_documents') return { data: [] }
      if (table === 'buyer_profile_data') return { data: null }
      if (table === 'transaction_participants') return { data: filters.some(([key]) => key === 'buyer_party_id') ? null : captured }
      return { data: null }
    }
    return query
  })
  return { client: { from }, writes }
}

it('links manual capture to its exact participant, retaining ownership, signature and metadata', async () => {
  const { client, writes } = database()
  await linkReusableBuyerProfileToTransaction({ transactionId: 'tx', buyerId: 'profile', participantId: 'person', isPrimary: true, client })
  const saved = writes.find(write => write.table === 'transaction_participants' && write.payload.buyer_party_id)
  expect(saved.operation).toBe('update')
  expect(saved.filters).toContainEqual(['id', 'person'])
  expect(saved.filters).toContainEqual(['transaction_id', 'tx'])
  expect(saved.payload).toMatchObject({ ownership_percentage: 50, signing_required: false, buyer_metadata: { imported: true } })
  expect(writes.some(write => write.table === 'transaction_participants' && write.operation === 'insert')).toBe(false)
  expect(saved.payload.buyer_onboarding_status).toBeUndefined()
})

it('refuses to replace an existing profile before making any writes', async () => {
  const { client, writes } = database({ alreadyLinked: true })
  await expect(linkReusableBuyerProfileToTransaction({ transactionId: 'tx', buyerId: 'profile', participantId: 'person', isPrimary: true, client })).rejects.toThrow('already has a linked profile')
  expect(writes).toEqual([])
})
