import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const [listingPage, transactionPage, apiSource, queueSource, migrationSource] = await Promise.all([
  readFile(resolve(root, 'src/pages/AgentListingDetail.jsx'), 'utf8'),
  readFile(resolve(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8'),
  readFile(resolve(root, 'src/lib/api.js'), 'utf8'),
  readFile(resolve(root, 'src/services/bondOperationalQueueService.js'), 'utf8'),
  readFile(resolve(root, '../supabase/migrations/202607140011_buyer_onboarding_originator_handoff_phase3.sql'), 'utf8'),
])

assert.doesNotMatch(
  listingPage.slice(
    listingPage.indexOf('async function handleCanonicalListingOfferConversion'),
    listingPage.indexOf('async function handleStartAcceptedOfferOtpDocument'),
  ),
  /type:\s*'client_onboarding'/,
  'Accepted-offer conversion must not send onboarding before originator confirmation.',
)
assert.match(listingPage, /openBuyerOnboardingRoleplayers:\s*true/)
assert.match(transactionPage, /The buyer does not reselect the seller's transferring attorney/)
assert.match(transactionPage, /No bond originator required/)
assert.match(transactionPage, /The selected originator receives an inbox item as soon as buyer onboarding is sent/)
const copyLinkHandler = transactionPage.slice(
  transactionPage.indexOf('async function handleCopyBuyerOnboardingLinkFromConfirmation'),
  transactionPage.indexOf('async function handleAgentHeaderOnboardingAction'),
)
assert.match(copyLinkHandler, /saveTransactionRoleplayerSelections/)
assert.match(copyLinkHandler, /recordBuyerOnboardingSent/)
assert.match(apiSource, /bond_assignment_status:\s*'awaiting_buyer_onboarding'/)
assert.match(queueSource, /BOND_INTAKE_STATUSES\.AWAITING_BUYER_APPLICATION/)
assert.match(migrationSource, /buyer_onboarding_send/)
assert.match(migrationSource, /seller_mandate/)

console.log('Buyer onboarding originator handoff Phase 3 checks passed.')
