import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  filterSellerPortalDocuments,
  resolveSellerDocumentAudienceAccess,
} from '../src/services/documents/sellerDocumentVisibilityPolicy.js'
import {
  DOCUMENT_UPLOAD_MALWARE_SCAN_DECISION,
  validateDocumentUploadFile,
} from '../src/lib/documentUploadPolicy.js'
import { normalizeSellerCollaborationWorkspace } from '../src/services/listings/listingSellerCollaborationModel.js'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(appRoot, '..')
const templatePath = path.join(appRoot, 'docs/listing-documents-phase8-controlled-test.template.json')
const riskPath = path.join(appRoot, 'docs/listing-documents-phase8-security-risk.json')
const runbookPath = path.join(appRoot, 'docs/listing-documents-phase8-release-runbook.md')
const packagePath = path.join(appRoot, 'package.json')
const MANUAL_CONTRACT = 'listing-documents-phase8-controlled-test-v1'

function argument(name) {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || ''
}

function assertSafeEvidence(value) {
  const content = JSON.stringify(value)
  assert.doesNotMatch(content, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, 'Do not store emails in release evidence')
  assert.doesNotMatch(content, /(?:bearer|password|secret|credential|access.?token|refresh.?token|signed.?url)/i, 'Do not store credentials or signed links in release evidence')
  assert.doesNotMatch(content, /\+?\d[\d .()/-]{7,}\d/, 'Do not store phone numbers in release evidence')
}

function validateObservation(observation, { template = false } = {}) {
  assert.equal(observation.contract, MANUAL_CONTRACT)
  assert.ok(['staging', 'authorised_test'].includes(observation.environment))
  assert.equal(typeof observation.checks, 'object')
  assert.ok(Object.keys(observation.checks).length >= 40, 'The complete Phase 8 matrix is required')
  for (const [name, passed] of Object.entries(observation.checks)) {
    assert.equal(typeof passed, 'boolean', `${name} must be boolean`)
    if (!template) assert.equal(passed, true, `${name} did not pass`)
  }
  assert.equal(observation.deploymentApproved, false, 'Manual evidence cannot approve deployment')
  assert.equal(observation.remoteDataOperationApproved, false, 'Manual evidence cannot approve remote data operations')
  if (!template) {
    assert.equal(observation.result, 'passed')
    assert.doesNotMatch(observation.listingReference, /^REPLACE_WITH_/)
    assert.doesNotMatch(observation.operatorReference, /^REPLACE_WITH_/)
    assert.match(observation.sourceRevision, /^[a-f0-9]{40}$/i)
    assert.ok(Number.isFinite(Date.parse(observation.testedAt)))
  }
  assertSafeEvidence({ ...observation, notes: '' })
}

test('Phase 8 manual evidence is complete, non-sensitive and fail-closed', async () => {
  const template = JSON.parse(await readFile(templatePath, 'utf8'))
  validateObservation(template, { template: true })
  assert.equal(template.result, 'pending')
  assert.equal(Object.values(template.checks).every((value) => value === false), true)

  const observationPath = argument('observation')
  const requireManual = process.argv.includes('--require-manual')
  if (!observationPath) {
    assert.equal(requireManual, false, 'Phase 8 requires --observation=/absolute/path/to/evidence.json')
    return
  }
  validateObservation(JSON.parse(await readFile(path.resolve(observationPath), 'utf8')))
})

test('seller documents are denied by default and role-player sharing is explicit', () => {
  const requirements = [
    { id: 'seller-fica', visibility: 'seller_visible', applies_to: 'seller' },
    { id: 'compliance-note', visibility: 'compliance_only', applies_to: 'seller' },
    { id: 'attorney-pack', visibility: 'shared_role_players' },
  ]
  const documents = [
    { id: 'fica', requirement_id: 'seller-fica' },
    { id: 'note', requirement_id: 'compliance-note' },
    { id: 'unclassified' },
  ]
  assert.deepEqual(filterSellerPortalDocuments(documents, requirements).map((row) => row.id), ['fica'])
  assert.equal(resolveSellerDocumentAudienceAccess({ visibility: 'seller_visible' }, 'seller'), true)
  assert.equal(resolveSellerDocumentAudienceAccess({ visibility: 'seller_visible' }, 'role_player'), false)
  assert.equal(resolveSellerDocumentAudienceAccess({ visibility: 'shared_role_players' }, 'role_player'), true)
  assert.equal(resolveSellerDocumentAudienceAccess({ visibility: 'compliance_only' }, 'seller'), false)
  assert.equal(resolveSellerDocumentAudienceAccess({}, 'seller'), false)
})

test('concurrent changes and failed delivery remain visible instead of overwriting silently', () => {
  const workspace = normalizeSellerCollaborationWorkspace({
    participants: [{ id: 'owner-1', invitation_delivery_status: 'failed', invitation_error: 'Controlled failure' }],
    notifications: [{ id: 'notification-1', status: 'failed' }],
    changeRequests: [{ id: 'change-1', status: 'conflict', conflict_json: { reason: 'record_version_changed' } }],
  })
  assert.equal(workspace.conflictCount, 1)
  assert.equal(workspace.failedDeliveryCount, 2)
})

test('upload controls reject unsafe file contracts and never claim malware scanning', () => {
  const valid = validateDocumentUploadFile({ name: 'controlled.pdf', type: 'application/pdf', size: 2048 }, { surface: 'listing_seller_documents' })
  assert.equal(valid.malwareScan.scanned, false)
  assert.throws(() => validateDocumentUploadFile({ name: 'empty.pdf', type: 'application/pdf', size: 0 }), /empty or unreadable/i)
  assert.throws(() => validateDocumentUploadFile({ name: 'payload.exe', type: 'application/octet-stream', size: 10 }), /Unsupported file type/i)
  assert.throws(() => validateDocumentUploadFile({ name: 'image.jpg', type: 'image/png', size: 10 }), /does not match/i)
  assert.equal(DOCUMENT_UPLOAD_MALWARE_SCAN_DECISION.status, 'not_configured')
})

test('malware risk is explicit and blocks production until resolved or separately accepted', async () => {
  const risk = JSON.parse(await readFile(riskPath, 'utf8'))
  assert.equal(risk.contract, 'listing-documents-phase8-security-risk-v1')
  assert.equal(risk.status, 'open')
  assert.equal(risk.severity, 'high')
  assert.equal(risk.decision, 'block_production_release')
  assert.equal(risk.acceptedBy, null)
  assert.equal(risk.deploymentApproved, false)
})

test('historical signed files and source uploads are preserved by the compatibility contracts', async () => {
  const [historicalMigration, listingService] = await Promise.all([
    readFile(path.join(root, 'supabase/migrations/20260924161509_listing_seller_historical_normalization_phase9.sql'), 'utf8'),
    readFile(path.join(appRoot, 'src/services/privateListingService.js'), 'utf8'),
  ])
  assert.match(historicalMigration, /immutable_signed_history/)
  assert.doesNotMatch(historicalMigration, /update\s+public\.private_listing_documents/i)
  assert.match(listingService, /pending_transaction_promotion/)
  assert.match(listingService, /promotion_status:\s*'attention'/)
  assert.match(listingService, /agent_listing_upload_promotion_retry/)
})

test('Phase 8 command composes the complete focused suite and preserves approval boundaries', async () => {
  const [pkg, runbook] = await Promise.all([
    readFile(packagePath, 'utf8').then(JSON.parse),
    readFile(runbookPath, 'utf8'),
  ])
  assert.match(pkg.scripts['check:listing-documents'], /verify:seller-document-automation/)
  assert.match(pkg.scripts['check:listing-documents'], /seller-document-conditional-logic-phase2/)
  assert.match(pkg.scripts['check:listing-documents'], /seller-onboarding-south-african-scenarios/)
  assert.match(pkg.scripts['check:listing-documents'], /sellerDocumentVisibilityPolicy\.test/)
  assert.match(pkg.scripts['check:listing-documents'], /listing-documents-phase8-release/)
  assert.match(pkg.scripts['check:listing-documents'], /npm run build/)
  assert.match(runbook, /does not deploy, apply migrations/i)
  assert.match(runbook, /separate explicit approval/i)
  assert.match(runbook, /block_production_release/)
})
