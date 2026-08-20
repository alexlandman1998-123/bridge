import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'property24-phase3-'))
const appRoot = fileURLToPath(new URL('..', import.meta.url))
const blockedOutput = path.join(tmpDir, 'blocked.json')
const previewOutput = path.join(tmpDir, 'preview.json')
const submitReadyOutput = path.join(tmpDir, 'submit-ready.json')

execFileSync('node', ['scripts/property24-phase3-mock-preview.mjs', `--output=${blockedOutput}`], {
  cwd: appRoot,
  stdio: 'pipe',
})

const blocked = JSON.parse(fs.readFileSync(blockedOutput, 'utf8'))
assert.equal(blocked.safety.property24ApiCalled, false)
assert.equal(blocked.safety.databaseWritten, false)
assert.equal(blocked.safety.listingPublished, false)
assert.equal(blocked.status, 'BLOCKED')
assert.equal(blocked.canPreview, false)
assert.ok(blocked.dataBlockers.includes('missing_property24_suburb_id'))

execFileSync('node', ['scripts/property24-phase3-mock-preview.mjs', '--suburb-id=12345', `--output=${previewOutput}`], {
  cwd: appRoot,
  stdio: 'pipe',
})

const preview = JSON.parse(fs.readFileSync(previewOutput, 'utf8'))
assert.equal(preview.status, 'PREVIEW_READY')
assert.equal(preview.canPreview, true)
assert.equal(preview.canSubmit, false)
assert.deepEqual(preview.dataBlockers, [])
assert.deepEqual(preview.technicalBlockers, ['listing_image_bytes_not_loaded_for_property24_submit'])
assert.equal(preview.summary.agencyId, 31382)
assert.deepEqual(preview.summary.contactAgentIds, [77959])
assert.equal(preview.summary.agentSourceReference, 'ARCH9-AGENT-001')
assert.equal(preview.summary.suburbId, 12345)
assert.equal(preview.previewPayload.agencyId, 31382)
assert.deepEqual(preview.previewPayload.contactAgentIds, [77959])
assert.equal(preview.previewPayload.photos[0].bytesLoaded, false)

execFileSync('node', ['scripts/property24-phase3-mock-preview.mjs', '--suburb-id=12345', '--with-image-bytes', `--output=${submitReadyOutput}`], {
  cwd: appRoot,
  stdio: 'pipe',
})

const submitReady = JSON.parse(fs.readFileSync(submitReadyOutput, 'utf8'))
assert.equal(submitReady.status, 'PREVIEW_READY')
assert.equal(submitReady.canPreview, true)
assert.equal(submitReady.canSubmit, true)
assert.deepEqual(submitReady.technicalBlockers, [])
assert.equal(submitReady.previewPayload.photos[0].bytesLoaded, true)

console.log('Property24 Phase 3 mock preview contract passed')
