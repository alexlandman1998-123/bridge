import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const appRoot = new URL('../', import.meta.url)
const workspaceRoot = new URL('../../', import.meta.url)

async function readAppFile(path) {
  return fs.readFile(new URL(path, appRoot), 'utf8')
}

async function readWorkspaceFile(path) {
  return fs.readFile(new URL(path, workspaceRoot), 'utf8')
}

function assertContract(source, pattern, message) {
  assert.match(source, pattern, message)
}

function assertNoContract(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message)
}

const sellerOnboardingPage = await readAppFile('src/pages/SellerOnboarding.jsx')
assertContract(
  sellerOnboardingPage,
  /function patchPropertyDisclosure\(patchOrKey = \{\}, value = undefined\)[\s\S]*const patch = typeof patchOrKey === 'string' \? \{ \[patchOrKey\]: value \} : patchOrKey/,
  'Seller declaration/property disclosure checkboxes should pass explicit values into the form update handler.',
)
assertContract(
  sellerOnboardingPage,
  /onChange=\{\(event\) => onDisclosureChange\('declarationAccepted', event\.target\.checked\)\}/,
  'Seller declaration acceptance should send the checked state rather than relying on implicit event data.',
)
assertContract(
  sellerOnboardingPage,
  /getEdgeFunctionInvokeError\(notificationResult\)/,
  'Seller onboarding submit should detect send-email invoke failures.',
)
assertContract(
  sellerOnboardingPage,
  /void notifyAssignedAgentOfSellerOnboarding\(updated, form\)/,
  'Seller onboarding submit should still trigger assigned-agent notification after save.',
)

const submittedHandler = await readWorkspaceFile('supabase/functions/send-email/handlers/sellerOnboardingSubmitted.ts')
assertContract(
  submittedHandler,
  /resolveAssignedAgentRecipient/,
  'Assigned-agent seller onboarding email should resolve recipients server-side.',
)
for (const source of [
  /\.from\("private_listings"\)/,
  /\.from\("leads"\)/,
  /\.from\("profiles"\)/,
]) {
  assertContract(submittedHandler, source, 'Assigned-agent lookup should include listing, lead, and profile fallbacks.')
}
assertContract(
  submittedHandler,
  /prepareEmailDelivery[\s\S]*seller_onboarding_submitted_agent/,
  'Assigned-agent seller onboarding email should prepare a communication delivery row.',
)
assertContract(
  submittedHandler,
  /markEmailDeliverySent[\s\S]*delivery\?\.id/,
  'Assigned-agent seller onboarding email should mark delivery success.',
)
assertContract(
  submittedHandler,
  /markEmailDeliveryFailed[\s\S]*delivery\?\.id/,
  'Assigned-agent seller onboarding email should mark delivery failures.',
)
assertContract(
  submittedHandler,
  /deliveryId: delivery\?\.id \|\| null/,
  'Assigned-agent seller onboarding email should return the delivery id for diagnostics.',
)
assertNoContract(
  submittedHandler,
  /Missing required field: to/,
  'Assigned-agent seller onboarding email must not require an explicit recipient before fallback resolution.',
)

const sellerEmailHandler = await readWorkspaceFile('supabase/functions/send-email/handlers/sellerOnboarding.ts')
assertContract(
  sellerEmailHandler,
  /seller_portal_link_seller/,
  'Seller portal link email should use a distinct communication type.',
)
assertContract(
  sellerEmailHandler,
  /seller_onboarding_link_seller/,
  'Initial seller onboarding link email should use a distinct communication type.',
)
assertContract(
  sellerEmailHandler,
  /deliveryId: delivery\?\.id \|\| null/,
  'Seller-facing onboarding/portal emails should return delivery ids.',
)
assertContract(
  sellerEmailHandler,
  /logo_dark_url\)[\s\S]*logo_light_url\)/,
  'Seller-facing onboarding/portal emails should prefer dark-header organisation logos.',
)

const sellerEmailContent = await readWorkspaceFile('supabase/functions/send-email/content/sellerOnboarding.ts')
assertContract(
  sellerEmailContent,
  /set a password before uploading the documents/,
  'Seller portal email copy should tell sellers they will set a password before uploads.',
)
assertContract(
  sellerEmailContent,
  /Open your secure seller portal and set your password/,
  'Seller portal email steps should mention password setup.',
)

const migration = await readWorkspaceFile('supabase/migrations/202606220002_seller_portal_password_access_phase3.sql')
for (const field of [
  'seller_portal_password_hash',
  'seller_portal_password_set_at',
  'seller_portal_last_login_at',
  'seller_portal_access_token_hash',
  'seller_portal_access_token_expires_at',
]) {
  assertContract(migration, new RegExp(field), `Seller portal migration should include ${field}.`)
}
for (const fn of [
  'bridge_private_listing_seller_portal_access_state',
  'bridge_set_private_listing_seller_portal_password',
  'bridge_verify_private_listing_seller_portal_password',
  'bridge_reset_private_listing_seller_portal_password',
  'bridge_private_listing_seller_portal_payload',
  'bridge_upload_private_listing_seller_document',
]) {
  assertContract(migration, new RegExp(fn), `Seller portal migration should define ${fn}.`)
}
assertContract(
  migration,
  /to_jsonb\(v_onboarding\) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash'/,
  'Seller portal payloads must strip password and access-token hashes.',
)
assertContract(
  migration,
  /p_require_access and not v_access_granted/,
  'Seller portal payload RPC should enforce access when the app requests portal access.',
)
assertContract(
  migration,
  /grant execute on function public\.bridge_reset_private_listing_seller_portal_password\(text\) to authenticated/,
  'Password resets should be available to authenticated internal users, not anonymous portal users.',
)

const privateListingService = await readAppFile('src/services/privateListingService.js')
for (const method of [
  'getStoredSellerPortalAccessToken',
  'storeSellerPortalAccessToken',
  'clearSellerPortalAccessToken',
  'setSellerPortalPassword',
  'verifySellerPortalPassword',
  'resetSellerPortalPassword',
]) {
  assertContract(privateListingService, new RegExp(`export (async )?function ${method}`), `privateListingService should export ${method}.`)
}
assertContract(
  privateListingService,
  /requirePortalAccess: true/,
  'Seller portal document actions should require a verified portal session.',
)
assertContract(
  privateListingService,
  /p_access_token: accessToken \|\| getStoredSellerPortalAccessToken/,
  'Seller portal document uploads should pass the stored access token to the RPC.',
)

const clientPortalService = await readAppFile('src/services/clientPortalWorkspaceService.js')
assertContract(
  clientPortalService,
  /requirePortalAccess: true/,
  'Seller portal workspace loads should require portal access.',
)
assertContract(
  clientPortalService,
  /sellerPortalAccessToken: options\?\.sellerPortalAccessToken/,
  'Seller portal workspace loader should pass through the session token.',
)

const clientPortalPage = await readAppFile('src/pages/ClientPortal.jsx')
assertContract(clientPortalPage, /function SellerPortalPasswordGate/, 'Client portal should render a seller portal password gate.')
assertContract(clientPortalPage, /setSellerPortalPassword\(\{ token, password \}\)/, 'Client portal should support first-time seller portal password setup.')
assertContract(clientPortalPage, /verifySellerPortalPassword\(\{ token, password \}\)/, 'Client portal should support seller portal password sign-in.')
assertContract(clientPortalPage, /isSellerPortalAuthRequiredError/, 'Client portal should branch cleanly when portal access is required.')
assertContract(clientPortalPage, /sellerPortalAccessToken: isSellerPortalToken \? sellerPortalAccessToken : ''/, 'Client portal data loads should pass seller portal session tokens only for seller links.')
assertContract(clientPortalPage, /accessToken: sellerPortalAccessToken/, 'Seller portal uploads and signed URLs should use the active session token.')

const agentListingDetail = await readAppFile('src/pages/AgentListingDetail.jsx')
assertContract(agentListingDetail, /getSellerPortalAccessState/, 'Listing detail should load seller portal access state.')
assertContract(agentListingDetail, /sellerPortalPasswordStatus/, 'Listing detail should expose seller portal password status.')
assertContract(agentListingDetail, /resetSellerPortalPassword\(token\)/, 'Listing detail should reset seller portal password via the service helper.')
assertContract(agentListingDetail, /handleResetSellerPortalPasswordAndResend/, 'Listing detail should pair password reset with resending the seller portal link.')
assertContract(agentListingDetail, /Reset Portal Password/, 'Listing detail should expose a visible reset portal password action.')
assertContract(agentListingDetail, /Portal Password/, 'Listing detail should expose a visible portal password status label.')

const packageJson = await readAppFile('package.json')
assertContract(
  packageJson,
  /"test:seller-onboarding-phase5": "node scripts\/seller-onboarding-phase5\.test\.mjs"/,
  'package.json should expose the Phase 5 seller onboarding diagnostic.',
)

console.log('seller onboarding phase 5 diagnostics passed')
