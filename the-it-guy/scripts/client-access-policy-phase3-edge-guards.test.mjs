import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  onboardingSubmitted: await readFile(new URL('../../supabase/functions/send-email/handlers/onboardingSubmitted.ts', import.meta.url), 'utf8'),
  sellerOnboarding: await readFile(new URL('../../supabase/functions/send-email/handlers/sellerOnboarding.ts', import.meta.url), 'utf8'),
  sendEmailRouter: await readFile(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8'),
  signingEmailSender: await readFile(new URL('../../supabase/functions/send-mandate-signing-email/index.ts', import.meta.url), 'utf8'),
  legalDocumentJobRunner: await readFile(new URL('../../supabase/functions/legal-document-job-runner/index.ts', import.meta.url), 'utf8'),
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

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`)
  assert.ok(start >= 0, `${name} should be present`)
  const nextFunction = source.indexOf('\nfunction ', start + 1)
  return source.slice(start, nextFunction > start ? nextFunction : undefined)
}

function extractConstSet(source, name) {
  const match = source.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`))
  assert.ok(match, `${name} should be present`)
  return match[1]
}

test('buyer portal direct emails are guarded by onboarding or signed OTP readiness', () => {
  assert.match(files.onboardingSubmitted, /TRANSACTION_PORTAL_READINESS_SELECT/)
  assert.match(files.onboardingSubmitted, /onboarding_status, onboarding_completed_at, external_onboarding_submitted_at/)
  assert.match(files.onboardingSubmitted, /function transactionBuyerPortalReady/)
  assert.match(files.onboardingSubmitted, /isClientPortalLinkEmail &&[\s\S]*!transactionBuyerPortalReady/)
  assert.match(files.onboardingSubmitted, /buyer_portal_waiting_for_onboarding_or_otp/)
  assert.match(files.onboardingSubmitted, /Complete buyer onboarding or upload the signed OTP before sending the buyer portal link\./)
})

test('Kingstons buyer portal direct emails require signed OTP evidence', () => {
  assert.match(files.onboardingSubmitted, /function developmentRequiresSignedOtpBeforeBuyerPortal/)
  assert.match(files.onboardingSubmitted, /\.includes\("kingstons"\)/)
  assert.match(files.onboardingSubmitted, /buyer_portal_waiting_for_signed_otp/)
  assert.match(files.onboardingSubmitted, /Upload the signed OTP before sending the buyer portal link for Kingstons\./)
})

test('seller portal direct emails no longer treat listing lifecycle status as signed mandate evidence', () => {
  const readySet = extractConstSet(files.sellerOnboarding, 'SELLER_PORTAL_INVITE_READY_AFTER_MANDATE_SIGNED_STATUS_KEYS')
  for (const retiredStatus of ['active', 'live', 'published', 'sold', 'transaction_created', 'under_offer']) {
    assert.doesNotMatch(readySet, new RegExp(`"${retiredStatus}"`), `${retiredStatus} must not unlock the Seller Portal`)
  }
  for (const signedStatus of ['completed', 'fully_signed', 'mandate_signed', 'signed', 'signed_uploaded', 'uploaded_signed']) {
    assert.match(readySet, new RegExp(`"${signedStatus}"`), `${signedStatus} should remain signed mandate evidence`)
  }

  const listingSignal = extractFunction(files.sellerOnboarding, 'listingHasSignedMandateSignal')
  assert.match(listingSignal, /listing\.mandate_status/)
  assert.doesNotMatch(listingSignal, /listing\.listing_status/)
  assert.doesNotMatch(listingSignal, /listing\.status/)
  assert.match(files.sellerOnboarding, /Upload the signed mandate before sending the Seller Portal invitation\./)
})

test('seller mandate signing links are retired at controlled sender and job-runner entry points', () => {
  assert.match(files.signingEmailSender, /RETIRED_SELLER_MANDATE_SIGNING_EMAIL_TYPES/)
  assert.match(files.signingEmailSender, /SUPPORTED_PACKET_SIGNING_EMAIL_TYPES/)
  assert.match(files.signingEmailSender, /RETIRED_SELLER_MANDATE_SIGNING_EMAIL_TYPES\.has\(type\)/)
  assert.match(files.signingEmailSender, /jsonResponse\(410/)
  assert.match(files.signingEmailSender, /seller_mandate_signing_links_retired/)
  assert.match(files.signingEmailSender, /const isOtpSigning = type === "otp_signing"/)

  assert.match(files.sendEmailRouter, /\["seller_mandate_sent", "seller_mandate"\]\.includes\(type\)/)
  assert.match(files.sendEmailRouter, /jsonResponse\(410/)
  assert.match(files.sendEmailRouter, /seller_mandate_signing_links_retired/)
  assert.match(files.sendEmailRouter, /if \(type === "otp_signing"\)/)
  assert.match(files.sendEmailRouter, /OTP_SIGNING_DELIVERY_ROUTE_RETIRED/)

  assert.match(files.legalDocumentJobRunner, /RETIRED_SELLER_MANDATE_SIGNING_EMAIL_TYPES/)
  assert.match(files.legalDocumentJobRunner, /RETIRED_SELLER_MANDATE_SIGNING_EMAIL_TYPES\.has\(emailType\)/)
  assert.match(files.legalDocumentJobRunner, /status: 410/)
  assert.match(files.legalDocumentJobRunner, /seller_mandate_signing_links_retired/)
  assert.match(files.legalDocumentJobRunner, /SUPPORTED_PACKET_SIGNING_EMAIL_TYPES\.has\(emailType\)/)
})

test('package exposes the Phase 3 edge guard regression', () => {
  assert.equal(
    files.packageJson.scripts?.['test:client-access-policy-phase3'],
    'node scripts/client-access-policy-phase3-edge-guards.test.mjs',
  )
})

console.log('client access policy phase 3 edge guard tests passed')
