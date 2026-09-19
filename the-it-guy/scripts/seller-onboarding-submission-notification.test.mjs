import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildSellerOnboardingSubmittedNotification } from '../server/services/sellerOnboardingSubmissionNotificationApi.js'

const onboarding = {
  id: 'onboarding-1',
  private_listing_id: 'listing-1',
  submitted_at: '2026-09-19T10:30:00.000Z',
  form_data: { sellerFirstName: 'Alex', sellerSurname: 'Landman', email: 'seller@example.com' },
}

const listing = {
  id: 'listing-1',
  seller_lead_id: 'lead-1',
  assigned_agent_id: 'agent-1',
  assigned_agent_email: 'agent@example.com',
  assigned_agent_name: 'Jordan Agent',
  organisation_id: 'organisation-1',
  title: '12 Example Street',
}

const first = buildSellerOnboardingSubmittedNotification({ onboarding, listing })
const repeat = buildSellerOnboardingSubmittedNotification({ onboarding, listing })
assert.equal(first.notification.user_id, 'agent-1')
assert.equal(first.notification.title, 'Seller onboarding received')
assert.equal(first.notification.event_data.leadId, 'lead-1')
assert.equal(first.notification.event_data.source, 'seller_onboarding_submitted')
assert.equal(first.notification.dedupe_key, repeat.notification.dedupe_key, 'a retry must reuse the same bell notification')
assert.equal(first.email.type, 'seller_onboarding_submitted')
assert.equal(first.email.to, 'agent@example.com')
assert.equal(first.email.idempotencyKey, first.notification.dedupe_key)

const unassigned = buildSellerOnboardingSubmittedNotification({
  onboarding,
  listing: { ...listing, assigned_agent_id: '', assigned_agent_email: '' },
})
assert.equal(unassigned.notification, null, 'a bell row is only created for an assigned agent')

const pageSource = await readFile(new URL('../src/pages/SellerOnboarding.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /seller-onboarding-submitted-notification/)
assert.doesNotMatch(pageSource, /invokeEdgeFunction\('send-email'/)

console.log('seller onboarding submission notification checks passed')
