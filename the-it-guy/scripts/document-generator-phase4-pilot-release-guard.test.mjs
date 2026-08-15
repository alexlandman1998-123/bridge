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
  'LEGAL_DOCUMENT_PILOT_PLAN_DIGEST',
  'LEGAL_DOCUMENT_OPEN_RELEASE_PLAN_DIGEST',
  'assessLegalDocumentPilotRelease',
  'assertLegalDocumentPilotRelease',
]) assert.ok(helper.includes(token), `Pilot-release helper must retain ${token}.`)

assert.match(helper, /sha256:0000000000000000000000000000000000000000000000000000000000000000/, 'The open-release digest must use the complete SHA-256 format.')
assert.match(helper, /allowed: true/, 'The current release helper must be open for approved templates.')
assert.match(helper, /planDigest: LEGAL_DOCUMENT_OPEN_RELEASE_PLAN_DIGEST/, 'Open release decisions must carry the open-release digest.')
assert.doesNotMatch(helper, /LEGAL_DOCUMENT_PILOT_ENABLED|LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS/, 'The release helper must not depend on old pilot allowlist secrets.')
assert.doesNotMatch(helper, /payload\.|req\.|request\./, 'Pilot-release authority must not come from an untrusted request payload.')

assert.match(generator, /assertLegalDocumentPilotRelease\(\{[\s\S]*?operation: "canonical_generation"/, 'Canonical generation must use the shared pilot-release guard.')
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
const historicalCompletionIndex = finalDelivery.indexOf('historicalCompletedArtifact')
assert.ok(historicalCompletionIndex >= 0 && finalGuardIndex > historicalCompletionIndex, 'Historical completed artifacts must remain readable before a release hold.')
assert.ok(finalPublicationIndex > finalGuardIndex, 'New immutable final publication must be release-bound before its first write.')
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
  'seller_mandate_signing_link_retired',
  'seller_portal_invite_pilot_blocked',
]) assert.ok(signerAction.includes(token), `Legacy signer outbound coverage must retain ${token}.`)
assert.doesNotMatch(signerAction, /assertLegalDocumentPilotRelease/, 'Public signer completion must assess and skip outbound work rather than throw a release block.')

const retiredSellerInviteIndex = sellerInviteScope.indexOf('seller_mandate_signing_link_retired')
const retiredSellerInviteReturnIndex = sellerInviteScope.indexOf('sellerInviteSent: false')
const sellerInviteSendIndex = sellerInviteScope.indexOf('const emailResult = await invokeSendEmail')
assert.ok(retiredSellerInviteIndex >= 0, 'Legacy seller signing invitations must record the retired-link event.')
assert.ok(retiredSellerInviteReturnIndex > retiredSellerInviteIndex, 'Legacy seller signing invitations must return before any old send work.')
assert.ok(sellerInviteSendIndex > retiredSellerInviteReturnIndex, 'Any old seller signing send code must remain unreachable behind the retired return.')
assert.match(sellerInviteScope, /reason: "seller_mandate_signing_links_retired"/, 'Retired seller signing audit must carry the canonical reason.')
assert.doesNotMatch(signerAction, /handleSellerMandateSignedEmail|sendFinalSignedMandateEmails|seller_mandate_signed/, 'Public signer completion must not retain a second final-document email path.')

const existingPortalInviteIndex = sellerPortalInviteScope.indexOf('sellerPortalMandateInviteAlreadySent')
const portalGuardIndex = sellerPortalInviteScope.indexOf('operation: "final_delivery"')
const portalSendIndex = sellerPortalInviteScope.indexOf('const emailResult = await invokeSendEmail')
assert.ok(existingPortalInviteIndex >= 0 && portalGuardIndex > existingPortalInviteIndex && portalSendIndex > portalGuardIndex, 'Seller portal invites must preserve idempotence and guard new sends.')
assert.match(sellerPortalInviteScope, /portalInviteStatus: "blocked"[\s\S]*?skipReason: "pilot_release_blocked"[\s\S]*?return \{ skipped: true, reason: "pilot_release_blocked" \}/, 'A portal-invite hold must skip the email without failing signer completion.')

assert.match(finaliser, /assertLegalDocumentPilotRelease\(\{[\s\S]*?operation: "final_delivery"/, 'Signer finalisation must use the shared final-delivery release contract.')
assert.match(finaliser, /pilotReleaseContract: LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT/, 'Signer finalisation release blocks must identify the release contract.')
assert.doesNotMatch(finalAccess, /legalDocumentPilotRelease/, 'Existing final-document download resolution must remain outside the outbound pilot fence.')

console.log('Document generator Phase 4 pilot-release guard contract passed.')
