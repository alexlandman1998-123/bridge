import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const service = await readFile(
  new URL('../src/services/privateListingService.js', import.meta.url),
  'utf8',
)

assert.match(
  service,
  /import \{ orchestrateSellerPostMandateDocumentRequest \} from '\.\/sellerPostMandateDocumentOrchestrationService\.js'/,
  'private listing service should import the post-mandate document orchestrator.',
)

assert.match(
  service,
  /export async function sendSellerPortalInviteAfterMandateSigned/,
  'mandate completion entrypoint should remain available for workspace and backfill callers.',
)

const triggerStart = service.indexOf('export async function sendSellerPortalInviteAfterMandateSigned')
assert.ok(triggerStart >= 0, 'trigger function should exist.')
const triggerBody = service.slice(triggerStart, service.indexOf('export async function backfillSellerPortalInvitesAfterSignedMandates', triggerStart))

assert.match(
  triggerBody,
  /getPrivateListing\(resolvedListingId, \{ includeRequirementsAndDocuments: true \}\)/,
  'trigger should load seller requirements and uploaded documents before orchestration.',
)
assert.match(
  triggerBody,
  /orchestrateSellerPostMandateDocumentRequest\(\{/,
  'trigger should delegate document request, portal invite and email delivery to the orchestration service.',
)
assert.match(
  triggerBody,
  /mandateSigned:\s*true/,
  'trigger context should explicitly mark the mandate as signed.',
)
assert.match(
  triggerBody,
  /hasAlreadyCompleted:\s*async \(\{ documentPackFingerprint, workflowRunDedupeKey \}\) => hasSellerPortalMandateInviteBeenSent/,
  'trigger should retain pack-level idempotency.',
)
assert.match(
  triggerBody,
  /documentPackFingerprint,\s*workflowRunDedupeKey/,
  'trigger idempotency should compare the current document pack fingerprint and workflow run key.',
)
assert.match(
  triggerBody,
  /documentPackFingerprint: normalizeText\(payload\.documentPackFingerprint\)/,
  'trigger should record the document pack fingerprint in legacy mandate invite events.',
)
assert.match(
  triggerBody,
  /ensurePortalContext:\s*async/,
  'trigger should sync seller portal context through the orchestrator adapter.',
)
assert.match(
  triggerBody,
  /issuePortalInvite:\s*async/,
  'trigger should create a time-limited seller portal invite link through the orchestrator adapter.',
)
assert.match(
  triggerBody,
  /createNotification:\s*async/,
  'trigger should create the seller portal document notification as a non-blocking adapter.',
)
assert.match(
  triggerBody,
  /SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_SENT_EVENT/,
  'trigger should preserve the existing sent event for continuity reports.',
)
assert.match(
  triggerBody,
  /SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_SKIPPED_EVENT/,
  'trigger should preserve skipped event recording.',
)
assert.match(
  triggerBody,
  /SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_FAILED_EVENT/,
  'trigger should preserve failed event recording.',
)

console.log('seller post-mandate document trigger tests passed')
