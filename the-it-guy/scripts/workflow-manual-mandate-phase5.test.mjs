#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

const PROJECT_ROOT = new URL('../', import.meta.url)

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

const workspaceSource = readProjectFile('src/components/documents/LegalDocumentWorkspace.jsx')
const workspacePageSource = readProjectFile('src/pages/LegalDocumentWorkspacePage.jsx')
const packageJson = readProjectFile('package.json')

assert.match(
  workspaceSource,
  /onManualSignedMandateUploaded = null/,
  'LegalDocumentWorkspace should expose an optional manual signed mandate completion callback.',
)

assert.match(
  workspaceSource,
  /await onManualSignedMandateUploaded\?\.\(\{[\s\S]*packetId:\s*resolvedPacketId[\s\S]*signingMethod:\s*'physical'[\s\S]*signingStatus:\s*'uploaded_signed'[\s\S]*completionMode:\s*'manual_uploaded'/,
  'Manual signed mandate uploads should emit a physical/manual_uploaded completion payload.',
)

assert.match(
  workspaceSource,
  /manual signed mandate listing sync skipped/,
  'Manual signed mandate listing sync failures should not roll back the completed packet upload.',
)

assert.match(
  workspacePageSource,
  /const handleManualSignedMandateUploaded = useCallback/,
  'LegalDocumentWorkspacePage should handle manual signed mandate upload completion.',
)

assert.match(
  workspacePageSource,
  /syncLeadMandateState\(\{[\s\S]*stage:\s*'Mandate Signed'[\s\S]*mandateStatus:\s*'signed_uploaded'[\s\S]*mandateSigningMethod:\s*'physical'/,
  'Manual signed mandate upload should sync the lead journey as Mandate Signed.',
)

assert.match(
  workspacePageSource,
  /updatePrivateListing\(\s*linkedListingId,[\s\S]*listingStatus,[\s\S]*mandateStatus:\s*'signed_uploaded'/,
  'Manual signed mandate upload should sync the linked private listing mandate status.',
)

assert.match(
  workspacePageSource,
  /createPrivateListingActivity\(\{[\s\S]*activityType:\s*'mandate_signed'[\s\S]*source:\s*'manual_signed_mandate_upload'[\s\S]*completionMode:\s*'manual_uploaded'/,
  'Manual signed mandate upload should write private-listing activity metadata.',
)

assert.match(
  workspacePageSource,
  /onManualSignedMandateUploaded=\{handleManualSignedMandateUploaded\}/,
  'LegalDocumentWorkspacePage should wire the manual signed mandate handler into the workspace.',
)

assert.match(
  packageJson,
  /"test:workflow-manual-mandate-phase5":\s*"node scripts\/workflow-manual-mandate-phase5\.test\.mjs"/,
  'package.json should expose the Phase 5 manual mandate regression test.',
)

console.log('workflow manual mandate Phase 5 tests passed')
