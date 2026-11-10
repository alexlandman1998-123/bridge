import assert from 'node:assert/strict'
import test from 'node:test'
import { handleScreening } from '../../supabase/functions/meta-integrations/screening.js'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const org = id(1), actorId = id(3), listingId = id(6), senderId = id(4)
const listing = { id: listingId, title: 'Canonical Listing', suburb: 'Suburb', city: 'City', asking_price: 1500000, listing_category: 'sale' }
const template = { id: '900', name: 'screening', language: 'en_US', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'Thanks for enquiring about {{1}}. Up to {{2}} questions. START to begin, AGENT for help, STOP to stop.' }] }
const profile = { deliveryMode: 'test', testPhone: '+27 82 123 4567', listingId, senderId, kind: 'buyer', context: { propertyLabel: 'Caller invented title', location: 'Caller invented place', price: 1, agencyName: 'Agency', conditions: 'Verified terms', petPolicy: 'Verified policy', privacyUrl: 'https://agency.test/privacy', privacyContact: 'privacy@agency.test', retention: 'Approved criteria', rates: 1000, levy: 0 }, template, values: { 'body.1': { source: 'property' }, 'body.2': { source: 'question_count' } } }
function fixture() {
  const f = { listing, owner: null, admin: true, template, rpcCalls: [], visible: true }
  const userDb = { from: () => { const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: f.visible ? f.listing : null }) }; return chain } }
  const run = (action, payload = {}) => handleScreening({ org, action, payload, actor: { userId: actorId, isAdmin: f.admin, userDb }, channel: async () => ({ id: senderId, owner_user_id: f.owner, connection_status: 'connected', waba_id: '200' }), graph: async () => ({ data: [f.template] }), senderToken: async () => 'fixture-token', db: { rpc: async (name, args) => { f.rpcCalls.push({ name, args }); return { data: { ok: true } } } } })
  return { f, run }
}
test('the server binds approved screening to the visible canonical property and current template', async () => {
  const { f, run } = fixture()
  await run('screening_save', { profile })
  const saved = f.rpcCalls[0].args.p_config
  assert.equal(saved.context.propertyLabel, listing.title)
  assert.equal(saved.context.location, 'Suburb, City')
  assert.equal(saved.context.price, listing.asking_price)
  assert.equal(saved.flowVersion, 1)
  assert.equal(saved.deliveryMode, 'test')
  assert.equal(saved.testPhone, '27821234567')
  assert.equal(f.rpcCalls[0].args.p_actor, actorId)
})
test('personal senders, hidden listings, changed templates and unconfirmed activation cannot save or enable', async () => {
  for (const setup of [f => { f.owner = actorId }, f => { f.visible = false }, f => { f.template = { ...template, components: [] } }, f => { f.admin = false }]) {
    const { f, run } = fixture(); setup(f)
    await assert.rejects(run('screening_save', { profile }))
    assert.equal(f.rpcCalls.length, 0)
  }
  const { f, run } = fixture()
  await assert.rejects(run('screening_enable', { id: id(9), version: 1 }), /Confirm automatic/)
  assert.equal(f.rpcCalls.length, 0)
})


test('new screening defaults to test-only and requires an explicit international test recipient', async () => {
  const { f, run } = fixture()
  await assert.rejects(run('screening_save', { profile: { ...profile, deliveryMode: undefined, testPhone: '' } }), /test recipient/)
  assert.equal(f.rpcCalls.length, 0)
  await run('screening_save', { profile: { ...profile, deliveryMode: undefined } })
  assert.equal(f.rpcCalls[0].args.p_config.deliveryMode, 'test')
  await run('screening_save', { profile: { ...profile, deliveryMode: 'live', testPhone: '' } })
  assert.equal(f.rpcCalls[1].args.p_config.deliveryMode, 'live')
  assert.equal(f.rpcCalls[1].args.p_config.testPhone, null)
})
