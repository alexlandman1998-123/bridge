import assert from 'node:assert/strict'
import fs from 'node:fs'

const configPath = 'config/legal-document-final-mile-phase0-scope.json'
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

assert.equal(config.phase, 'document-generator-final-mile-phase-0')
assert.equal(config.status, 'scope_frozen')
assert.equal(config.decision, 'repair_existing_final_mile')
assert.equal(config.rebuildPolicy, 'do_not_rebuild_generator_today')

const requiredFixAreas = [
  'final_signed_completion_status',
  'recipient_delivery_evidence',
  'controlled_test_recipient_delivery',
  'final_signed_access_resolution',
  'workspace_final_completion_ui',
  'document_generator_smoke_harness',
  'affected_staging_packet_recovery',
]
assert.deepEqual(config.allowedFixAreas, requiredFixAreas)
assert.ok(config.outOfScope.includes('new_document_generator_architecture'))
assert.ok(config.outOfScope.includes('new_template_engine'))

const packets = config.affectedStagingPackets || []
assert.equal(packets.length, 2)
assert.ok(packets.some((packet) => packet.packetType === 'otp' && packet.packetId === '9ea0cf58-0e0f-47f4-b120-c4cde8d70c7c'))
assert.ok(packets.some((packet) => packet.packetType === 'mandate' && packet.packetId === '92d1a77a-26a6-4373-87d4-ec1871851f39'))

const requiredDecisionPaths = [
  'completed',
  'delivered',
  'controlledTestRecipient',
  'downloadable',
  'accessFence',
  'retryable',
  'workspaceUi',
  'smokeHarness',
]
assert.deepEqual(Object.keys(config.decisionPaths), requiredDecisionPaths)

for (const key of requiredDecisionPaths) {
  const entry = config.decisionPaths[key]
  assert.ok(entry.owner, `${key} should name an owner.`)
  assert.ok(entry.file, `${key} should name a file.`)
  assert.ok(entry.requiredTruth, `${key} should state the required truth.`)
  assert.ok(fs.existsSync(entry.file), `${key} owner file is missing: ${entry.file}`)
}

const sourceChecks = [
  {
    key: 'completed',
    patterns: [
      /bridge_get_final_completion_status_f5/,
      /deliveredRecipientCount/,
      /retryable/,
    ],
  },
  {
    key: 'delivered',
    patterns: [
      /bridge_record_final_delivery_f3/,
      /assessControlledTestRecipient/,
      /handleSellerMandateSignedEmail/,
    ],
  },
  {
    key: 'controlledTestRecipient',
    patterns: [
      /assessControlledTestRecipient/,
      /external notification delivery is suppressed/,
    ],
  },
  {
    key: 'downloadable',
    patterns: [
      /resolvePublishedFinalSignedArtifact/,
      /authorizeWorkspace/,
      /context/,
    ],
  },
  {
    key: 'accessFence',
    patterns: [
      /resolvePublishedFinalSignedArtifact/,
      /createSignedUrl/,
      /finalArtifact/,
    ],
  },
  {
    key: 'retryable',
    patterns: [
      /retry-final-document-completion failed/,
      /bridge_claim_final_completion_retry_f5/,
      /dispatch-final-signed-document/,
    ],
  },
  {
    key: 'workspaceUi',
    patterns: [
      /final-completion-state/,
      /Completed everywhere/,
      /Retry completion/,
    ],
  },
  {
    key: 'smokeHarness',
    patterns: [
      /Download Signed OTP/,
      /Download Signed Mandate/,
      /getByRole\('textbox',\{name:\/\^password\$\/i\}\)/,
    ],
  },
]

for (const check of sourceChecks) {
  const source = fs.readFileSync(config.decisionPaths[check.key].file, 'utf8')
  for (const pattern of check.patterns) {
    assert.match(source, pattern, `${check.key} source should keep ${pattern}`)
  }
}

const audit = fs.readFileSync('docs/audits/document-generator-final-mile-phase-0.md', 'utf8')
for (const reference of [
  'Repair the existing final-mile flow today',
  'Do not rebuild the document generator',
  'bridge_get_final_completion_status_f5',
  'dispatch-final-signed-document',
  'resolve-final-signed-document-access',
]) {
  assert.ok(audit.includes(reference), `Phase 0 audit should keep: ${reference}`)
}

console.log('document-generator Phase 0 final-mile scope freeze passed.')
