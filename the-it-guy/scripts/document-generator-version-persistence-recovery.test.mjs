import assert from 'node:assert/strict'
import fs from 'node:fs'

const packetService = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
const workspacePage = fs.readFileSync('src/pages/LegalDocumentWorkspacePage.jsx', 'utf8')

assert.match(packetService, /const PACKET_GENERATION_LEASE_TTL_SECONDS = 120/)
assert.match(packetService, /ttlSeconds: PACKET_GENERATION_LEASE_TTL_SECONDS/)
assert.match(packetService, /retryAfterSeconds: PACKET_GENERATION_LEASE_TTL_SECONDS/)

const versionHelper = packetService.slice(
  packetService.indexOf('async function createDocumentPacketVersionSafely'),
  packetService.indexOf('function createPacketError'),
)
assert.match(versionHelper, /originalCode/)
assert.match(versionHelper, /originalMessage/)
assert.match(versionHelper, /causedByTimeout: isRetryablePacketError\(error\)/)

const createVersionIndex = packetService.indexOf('version = await createDocumentPacketVersionSafely({')
const optimisticPacketIndex = packetService.indexOf('const updatedPacket = {', createVersionIndex)
const persistFailureBranch = packetService.slice(createVersionIndex, optimisticPacketIndex)
assert.ok(createVersionIndex > 0 && optimisticPacketIndex > createVersionIndex, 'packet version persistence must be handled before optimistic packet completion')
assert.match(persistFailureBranch, /eventType: 'generation_version_persist_failed'/)
assert.match(persistFailureBranch, /'PACKET_VERSION_CREATE_FAILED'/)
assert.match(persistFailureBranch, /safeToRetry: true/)
assert.match(persistFailureBranch, /generationPhase: 'version_persist'/)

const completionBranch = packetService.slice(optimisticPacketIndex, packetService.indexOf('return {', optimisticPacketIndex))
assert.match(completionBranch, /void updatePacketFresh\(packet\.id/)
assert.match(completionBranch, /void addPacketEvent\({/)
assert.doesNotMatch(completionBranch, /await updatePacketFresh\(packet\.id/)
assert.doesNotMatch(completionBranch, /await addPacketEvent\({/)

const finallyIndex = packetService.indexOf('} finally {', optimisticPacketIndex)
assert.match(packetService.slice(finallyIndex, finallyIndex + 800), /releaseDocumentPacketGenerationLease/)
assert.match(packetService.slice(finallyIndex, finallyIndex + 800), /!deferGenerationLeaseRelease/)

assert.doesNotMatch(
  workspacePage,
  /typeof initialStatus\.versions\[0\]\.validation_summary_json\.generatedDataSnapshot === 'object'/,
)
assert.match(
  workspacePage,
  /typeof initialStatus\?\.versions\?\.\[0\]\?\.validation_summary_json\?\.generatedDataSnapshot === 'object'/,
)
assert.match(workspacePage, /const documentLabel = packetType === 'otp' \? 'OTP' : 'mandate'/)
assert.match(workspacePage, /Rendering and saving \$\{documentLabel\} PDF/)
assert.match(workspacePage, /state: 'PDF_GENERATED'/)
assert.match(workspacePage, /void withLegalWorkspaceTimeout\(\s*resolveDocumentPacketStatus\(/)
assert.doesNotMatch(workspacePage, /onProgress\?\.\('Refreshing draft status\.\.\.'\)/)

console.log('Document generator version persistence recovery contract passed.')
