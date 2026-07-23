import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const helper = read('../supabase/functions/_shared/legalDocumentPilotRelease.ts')
const generator = read('../supabase/functions/generate-mandate/index.ts')
const invite = read('../supabase/functions/send-mandate-signing-email/index.ts')
const finalDelivery = read('../supabase/functions/dispatch-final-signed-document/index.ts')
const finaliser = read('../supabase/functions/generate-final-signed-document/index.ts')
const finalAccess = read('../supabase/functions/resolve-final-signed-document-access/index.ts')
const signerAction = read('../supabase/functions/signer-signing-action/index.ts')

for (const token of [
  'LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT',
  'legal-document-pilot-release-v1',
  'LEGAL_DOCUMENT_PILOT_ENABLED',
  'LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS',
  'LEGAL_DOCUMENT_PILOT_PLAN_DIGEST',
  'LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_REQUIRED',
  'LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_INVALID',
  'LEGAL_DOCUMENT_PILOT_COHORT_INVALID',
  'LEGAL_DOCUMENT_PILOT_ORGANISATION_NOT_ALLOWLISTED',
  'assessLegalDocumentPilotRelease',
  'assertLegalDocumentPilotRelease',
]) assert.ok(helper.includes(token), `Pilot-release helper must retain ${token}.`)

assert.match(helper, /\^sha256:\[a-f0-9\]\{64\}\$\/i/, 'The activation-plan digest must use the complete SHA-256 format.')
assert.match(helper, /environment\(LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_ENV\)/, 'The guard must read the plan digest exclusively from Edge runtime configuration.')
assert.match(helper, /!rawPlanDigest[\s\S]*?LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_REQUIRED/, 'A missing plan digest must fail closed.')
assert.match(helper, /if \(!\/\^sha256:\[a-f0-9\]\{64\}\$\/i\.test\(rawPlanDigest\)\)[\s\S]*?LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_INVALID/, 'A malformed plan digest must fail closed.')
assert.match(helper, /allowlistedOrganisationIds\.has\(resolvedOrganisationId\)/, 'The guard must require an exact configured organisation identifier.')
assert.match(helper, /configuredCohort\.length !== 1/, 'The Phase 4 release guard must reject a broadened multi-organisation allowlist.')
assert.doesNotMatch(helper, /payload\.|req\.|request\./, 'Pilot-release authority must not come from an untrusted request payload.')

assert.match(generator, /assertLegalDocumentPilotRelease\(\{[\s\S]*?operation: "canonical_generation"/, 'Canonical generation must use the shared pilot-release guard.')
assert.match(generator, /LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_REQUIRED/, 'Canonical generation must audit an absent activation-plan digest as a pilot block.')
assert.match(generator, /LEGAL_DOCUMENT_PILOT_COHORT_INVALID/, 'Canonical generation must audit a broadened Phase 4 cohort as a pilot block.')
assert.match(generator, /pilotReleaseContract: context\.errorCode\.startsWith\("LEGAL_DOCUMENT_PILOT_"\)[\s\S]*?LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT/, 'Generation pilot-block evidence must identify the shared release contract.')
assert.match(generator, /if \(!capacityProbe && approval\.isPhase4LegalPacket\)/, 'Capacity probes must remain outside the customer-release guard.')

const inviteIdempotentIndex = invite.indexOf('idempotent: true')
const inviteGuardIndex = invite.indexOf('operation: "signing_invite"')
const inviteProviderIndex = invite.indexOf('const providerResponse = await handleSellerMandateSentEmail')
assert.ok(inviteIdempotentIndex >= 0 && inviteGuardIndex > inviteIdempotentIndex, 'Existing recorded signing dispatches must return before the pilot guard.')
assert.ok(inviteProviderIndex > inviteGuardIndex, 'The signing-invite guard must run before the email provider is called.')
assert.match(invite, /assertLegalDocumentPilotRelease\(\{[\s\S]*?operation: "signing_invite"/, 'Packet-bound signing invitations must use the shared guard.')
assert.match(invite, /pilotReleaseContract: LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT/, 'Signing invitation blocks must identify the release contract.')

const finalPublicationIndex = finalDelivery.indexOf('bridge_record_final_publication_f3')
const finalGuardIndex = finalDelivery.indexOf('operation: "final_delivery"')
const finalClaimIndex = finalDelivery.indexOf('bridge_claim_final_delivery_f3')
assert.ok(finalPublicationIndex >= 0 && finalGuardIndex > finalPublicationIndex, 'Immutable final publication must remain available before an outbound-email hold.')
assert.ok(finalClaimIndex > finalGuardIndex, 'The final-delivery guard must run before a new customer delivery is claimed.')
assert.match(finalDelivery, /hasNewCustomerDelivery/, 'Already-recorded final deliveries must remain idempotent during a later hold.')
assert.match(finalDelivery, /assertLegalDocumentPilotRelease\(\{[\s\S]*?operation: "final_delivery"/, 'Final customer delivery must use the shared guard.')
assert.match(finalDelivery, /pilotReleaseContract: LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT/, 'Final-delivery blocks must identify the release contract.')
assert.match(finalDelivery, /handleSellerMandateSignedEmail/, 'Only the canonical final-delivery dispatcher may invoke the signed-document email handler.')
assert.doesNotMatch(finalDelivery, /functions\/v1\/send-email/, 'Canonical final delivery must not loop a signed-document URL through the generic email endpoint.')

const sellerInviteScope = signerAction.slice(
  signerAction.indexOf('async function maybeSendSellerMandateInvite'),
  signerAction.indexOf('async function appendSellerPortalInviteAfterMandateSignedTrigger'),
)
const sellerPortalInviteScope = signerAction.slice(
  signerAction.indexOf('async function sendSellerPortalInviteAfterMandateSigned'),
  signerAction.indexOf('function humanizePacketEventMessage'),
)
for (const token of [
  'assessLegalDocumentPilotRelease',
  'LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT',
  'seller_signing_email_pilot_blocked',
  'seller_portal_invite_pilot_blocked',
]) assert.ok(signerAction.includes(token), `Legacy signer outbound coverage must retain ${token}.`)
assert.doesNotMatch(signerAction, /assertLegalDocumentPilotRelease/, 'Public signer completion must assess and skip outbound work rather than throw a release block.')

const existingSellerInviteIndex = sellerInviteScope.indexOf('alreadySentSellerInvite')
const sellerInviteGuardIndex = sellerInviteScope.indexOf('operation: "signing_invite"')
const sellerInviteSendIndex = sellerInviteScope.indexOf('const emailResult = await invokeSendEmail')
assert.ok(existingSellerInviteIndex >= 0 && sellerInviteGuardIndex > existingSellerInviteIndex && sellerInviteSendIndex > sellerInviteGuardIndex, 'Legacy seller signing invitations must remain idempotent and guard only new sends.')
assert.match(sellerInviteScope, /if \(!pilotRelease\.allowed\)[\s\S]*?sellerInviteSent: false/, 'A legacy seller invite hold must preserve signer completion and leave the seller pending.')
assert.match(sellerInviteScope, /try \{[\s\S]*?seller_signing_email_pilot_blocked[\s\S]*?\} catch \(error\)/, 'Seller-invite guard audit failures must be non-blocking.')
assert.doesNotMatch(signerAction, /handleSellerMandateSignedEmail|sendFinalSignedMandateEmails|seller_mandate_signed/, 'Public signer completion must not retain a second final-document email path.')

const existingPortalInviteIndex = sellerPortalInviteScope.indexOf('sellerPortalMandateInviteAlreadySent')
const portalGuardIndex = sellerPortalInviteScope.indexOf('operation: "final_delivery"')
const portalSendIndex = sellerPortalInviteScope.indexOf('const emailResult = await invokeSendEmail')
assert.ok(existingPortalInviteIndex >= 0 && portalGuardIndex > existingPortalInviteIndex && portalSendIndex > portalGuardIndex, 'Seller portal invites must preserve idempotence and guard new sends.')
assert.match(sellerPortalInviteScope, /portalInviteStatus: "blocked"[\s\S]*?skipReason: "pilot_release_blocked"[\s\S]*?return \{ skipped: true, reason: "pilot_release_blocked" \}/, 'A portal-invite hold must skip the email without failing signer completion.')

assert.doesNotMatch(finaliser, /legalDocumentPilotRelease/, 'Signer finalisation must remain outside the outbound pilot fence.')
assert.doesNotMatch(finalAccess, /legalDocumentPilotRelease/, 'Existing final-document download resolution must remain outside the outbound pilot fence.')

console.log('Document generator Phase 4 pilot-release guard contract passed.')
