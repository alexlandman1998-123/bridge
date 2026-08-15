import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  policy: await readFile(new URL('../src/core/clientAccess/clientAccessPolicy.js', import.meta.url), 'utf8'),
  onboardingSubmitted: await readFile(new URL('../../supabase/functions/send-email/handlers/onboardingSubmitted.ts', import.meta.url), 'utf8'),
  sellerOnboarding: await readFile(new URL('../../supabase/functions/send-email/handlers/sellerOnboarding.ts', import.meta.url), 'utf8'),
  sendEmailRouter: await readFile(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8'),
  signingEmailSender: await readFile(new URL('../../supabase/functions/send-mandate-signing-email/index.ts', import.meta.url), 'utf8'),
  legalDocumentJobRunner: await readFile(new URL('../../supabase/functions/legal-document-job-runner/index.ts', import.meta.url), 'utf8'),
  signerAction: await readFile(new URL('../../supabase/functions/signer-signing-action/index.ts', import.meta.url), 'utf8'),
  unitDetail: await readFile(new URL('../src/pages/UnitDetail.jsx', import.meta.url), 'utf8'),
  listingDetail: await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
  agencyPipeline: await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
  legalWorkspace: await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8'),
  releaseDoc: await readFile(new URL('../docs/client-access-policy-phase4-release-readiness.md', import.meta.url), 'utf8'),
  packageJson: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')),
}

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function functionScope(source, name, nextName) {
  const start = source.indexOf(`async function ${name}`)
  assert.ok(start >= 0, `${name} should be present`)
  const end = nextName ? source.indexOf(`async function ${nextName}`, start + 1) : source.indexOf('\nasync function ', start + 1)
  return source.slice(start, end > start ? end : undefined)
}

test('Phase 4 release decision is documented without exposing portal tokens', () => {
  assert.match(files.releaseDoc, /Buyer onboarding is available before OTP globally/)
  assert.match(files.releaseDoc, /Kingstons buyer portal waits for signed OTP/)
  assert.match(files.releaseDoc, /Seller Portal activates only after a manually uploaded signed mandate/)
  assert.match(files.releaseDoc, /Seller mandate signing links are retired/)
  assert.doesNotMatch(files.releaseDoc, /client_portal_token|seller_portal_token|signing_token/i)
})

test('public signer completion cannot auto-send seller mandate signing links', () => {
  const sellerInviteScope = functionScope(
    files.signerAction,
    'maybeSendSellerMandateInvite',
    'appendSellerPortalInviteAfterMandateSignedTrigger',
  )
  const retiredEventIndex = sellerInviteScope.indexOf('seller_mandate_signing_link_retired')
  const retiredReasonIndex = sellerInviteScope.indexOf('seller_mandate_signing_links_retired')
  const returnIndex = sellerInviteScope.indexOf('sellerInviteSent: false')
  const sendIndex = sellerInviteScope.indexOf('const emailResult = await invokeSendEmail')
  const autoCreateIndex = sellerInviteScope.indexOf('seller_signer_auto_created')

  assert.ok(retiredEventIndex > 0, 'retired seller mandate signing event must be recorded')
  assert.ok(retiredReasonIndex > retiredEventIndex, 'retired event should carry the canonical reason')
  assert.ok(returnIndex > retiredReasonIndex, 'retired path must return before old invite work')
  assert.ok(sendIndex > returnIndex, 'any legacy send code must remain after the retired return')
  assert.ok(autoCreateIndex > returnIndex, 'legacy seller signer creation must not run before the retired return')
  assert.match(sellerInviteScope, /Upload the signed mandate manually before activating the Seller Portal/)
})

test('seller mandate signing is retired at every backend delivery doorway while OTP remains packet-bound', () => {
  for (const source of [files.sendEmailRouter, files.signingEmailSender, files.legalDocumentJobRunner]) {
    assert.match(source, /SELLER_MANDATE_SIGNING_LINKS_RETIRED|seller_mandate_signing_links_retired/)
    assert.match(source, /Seller mandate signing links are retired/)
  }
  assert.match(files.sendEmailRouter, /if \(type === "otp_signing"\)[\s\S]*OTP_SIGNING_DELIVERY_ROUTE_RETIRED/)
  assert.match(files.signingEmailSender, /const isOtpSigning = type === "otp_signing"/)
  assert.match(files.signingEmailSender, /bridge_record_otp_signing_delivery_phase2/)
  assert.match(files.legalDocumentJobRunner, /SUPPORTED_PACKET_SIGNING_EMAIL_TYPES[\s\S]*"otp_signing"/)
})

test('buyer and seller portal Edge Function guards match the intended product', () => {
  assert.match(files.onboardingSubmitted, /function transactionBuyerPortalReady/)
  assert.match(files.onboardingSubmitted, /developmentRequiresSignedOtpBeforeBuyerPortal\(developmentName\)/)
  assert.match(files.onboardingSubmitted, /buyer_portal_waiting_for_onboarding_or_otp/)
  assert.match(files.onboardingSubmitted, /buyer_portal_waiting_for_signed_otp/)

  const sellerReadySet = files.sellerOnboarding.match(
    /SELLER_PORTAL_INVITE_READY_AFTER_MANDATE_SIGNED_STATUS_KEYS = new Set\(\[([\s\S]*?)\]\)/,
  )?.[1] || ''
  for (const lifecycleStatus of ['active', 'live', 'published', 'sold', 'transaction_created', 'under_offer']) {
    assert.doesNotMatch(sellerReadySet, new RegExp(`"${lifecycleStatus}"`))
  }
  assert.match(files.sellerOnboarding, /listing\.mandate_status/)
  assert.doesNotMatch(
    files.sellerOnboarding.match(/function listingHasSignedMandateSignal[\s\S]*?function packetHasSignedMandateSignal/)?.[0] || '',
    /listing\.listing_status|listing\.status/,
  )
})

test('frontend workspaces still use policy decisions before portal and mandate actions', () => {
  assert.match(files.unitDetail, /resolveBuyerAccessPolicy/)
  assert.match(files.unitDetail, /kingstonsBuyerPortalLinksDisabled = !buyerPortalAccessDecision\.enabled/)
  assert.match(files.listingDetail, /Upload the signed mandate before activating the Seller Portal\./)
  assert.match(files.agencyPipeline, /actions\.sendMandateSigningLink/)
  assert.match(files.legalWorkspace, /actions\.sendMandateSigningLink/)
})

test('post-signed-mandate Seller Portal invite remains available after final signed mandate evidence', () => {
  const portalInviteScope = functionScope(
    files.signerAction,
    'sendSellerPortalInviteAfterMandateSigned',
    '',
  )
  assert.match(files.signerAction, /function buildSellerPortalInviteEmailPayload[\s\S]*type: "seller_portal_link"/)
  assert.match(portalInviteScope, /operation: "final_delivery"/)
  assert.match(portalInviteScope, /const emailResult = await invokeSendEmail/)
  assert.match(files.sellerOnboarding, /seller_portal_invite_requires_signed_mandate/)
})

test('package exposes Phase 4 and a full client-access verification chain', () => {
  assert.equal(
    files.packageJson.scripts?.['test:client-access-policy-phase4'],
    'node scripts/client-access-policy-phase4-release-readiness.test.mjs',
  )
  assert.match(files.packageJson.scripts?.['verify:client-access-policy'] || '', /test:client-access-policy-phase1/)
  assert.match(files.packageJson.scripts?.['verify:client-access-policy'] || '', /test:client-access-policy-phase4/)
})

console.log('client access policy phase 4 release readiness tests passed')
