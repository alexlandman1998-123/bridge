import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8')

assert.match(
  source,
  /const LISTING_FOLLOW_UP_SLA_DAYS = \{/,
  'Phase 6 should define SLA days for listing follow-up reminders.',
)

for (const key of [
  'send_onboarding',
  'add_seller_contact',
  'add_seller_identity',
  'add_seller_fica',
  'upload_signed_mandate',
  'confirm_commission',
  'add_photos',
  'add_external_link',
]) {
  assert.match(source, new RegExp(`${key}: \\d+`), `Missing SLA for ${key}.`)
}

assert.match(
  source,
  /function getFollowUpReminderStatus\(item = \{\}, listing = \{\}, now = Date\.now\(\)\)/,
  'Phase 6 should calculate due and overdue reminder state per follow-up item.',
)

assert.match(
  source,
  /function withFollowUpReminderStatus\(card = \{\}, now = Date\.now\(\)\)/,
  'Listing cards should be enriched with reminder status metadata.',
)

assert.match(
  source,
  /overdueFollowUpCount:/,
  'Listing cards should count overdue follow-ups.',
)

assert.match(
  source,
  /dueTodayFollowUpCount:/,
  'Listing cards should count follow-ups due today.',
)

assert.doesNotMatch(
  source,
  /function buildListingFollowUpEscalationSummary\(cards = \[\], insights = \{\}\)/,
  'Listing page should no longer generate an oversight chase list.',
)

assert.doesNotMatch(
  source,
  /Copy Chase List/,
  'Listing page should no longer expose a copy chase list action.',
)

assert.doesNotMatch(
  source,
  /Manual listing chase list copied for follow-up\./,
  'Listing page should no longer show a chase-list copy confirmation.',
)

assert.doesNotMatch(
  source,
  /item\.reminderLabel/,
  'Listing cards should not restore the removed multi-item reminder queue.',
)

assert.match(
  source,
  /card\.quickAddPrimaryAction\.label/,
  'Listing cards should surface one focused Quick Add handoff action.',
)

assert.match(
  packageJson,
  /"test:manual-listing-reminders": "node scripts\/manual-listing-reminders\.test\.mjs"/,
  'package.json should expose the Phase 6 reminder test.',
)

console.log('manual-listing-reminders tests passed')
