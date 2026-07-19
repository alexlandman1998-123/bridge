import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { resolveOfferLinkDeliveryPlan } = await server.ssrLoadModule('/src/lib/offerLinkDeliveryPlan.js')
  const email = resolveOfferLinkDeliveryPlan({ clientIntakePreference: 'digital_portal', notificationMode: 'email', email: 'buyer@example.test' })
  assert.equal(email.deliversLink, true)
  assert.deepEqual(email.channels, ['email'])

  const whatsapp = resolveOfferLinkDeliveryPlan({ clientIntakePreference: 'digital_portal', notificationMode: 'whatsapp', phone: '27820000000' })
  assert.equal(whatsapp.deliversLink, true)
  assert.deepEqual(whatsapp.channels, ['whatsapp'])

  const missing = resolveOfferLinkDeliveryPlan({ clientIntakePreference: 'digital_portal', notificationMode: 'email' })
  assert.equal(missing.deliversLink, false)
  assert.equal(missing.blockers.length, 1)

  const hardCopy = resolveOfferLinkDeliveryPlan({ clientIntakePreference: 'hard_copy' })
  assert.equal(hardCopy.deliversLink, false)
  assert.equal(hardCopy.handoffRequired, true)
} finally {
  await server.close()
}

const listingDetail = fs.readFileSync('src/pages/AgentListingDetail.jsx', 'utf8')
assert.match(listingDetail, /resolveOfferLinkDeliveryPlan/)
assert.match(listingDetail, /prepareNotificationOutbox/)
assert.match(listingDetail, /updateOfferOutbox/)
assert.match(listingDetail, /buyer_offer_hard_copy_handoff/)
console.log('offer-link-delivery-plan: passed')
