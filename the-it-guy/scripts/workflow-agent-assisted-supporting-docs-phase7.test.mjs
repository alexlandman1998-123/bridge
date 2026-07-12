#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

const PROJECT_ROOT = new URL('../', import.meta.url)

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

const actionAvailabilitySource = readProjectFile('server/services/workflowActionAvailabilityService.js')
const actionServiceSource = readProjectFile('server/services/workflowActionService.js')
const workflowActionTestSource = readProjectFile('server/tests/workflowActionService.test.js')
const packageJson = readProjectFile('package.json')

assert.match(
  actionAvailabilitySource,
  /RECORD_AGENT_ASSISTED_SUPPORTING_DOCS:\s*\{[\s\S]*workflowKey:\s*'sales_otp'[\s\S]*stepKey:\s*'supporting_docs_complete'[\s\S]*actionContext:\s*'agent_assisted_supporting_docs'/,
  'Supporting/FICA documents should have a first-class agent-assisted workflow action.',
)

assert.match(
  actionServiceSource,
  /function resolveSupportingDocsDocumentEvidenceId[\s\S]*supportingDocsDocumentId[\s\S]*supporting_docs_document_id[\s\S]*ficaDocumentId[\s\S]*document_id/,
  'Agent-assisted supporting docs should accept supporting-doc, FICA, or generic uploaded document ids.',
)

assert.match(
  actionServiceSource,
  /RECORD_AGENT_ASSISTED_SUPPORTING_DOCS:\s*\{[\s\S]*resolveEvidenceId:\s*resolveSupportingDocsDocumentEvidenceId[\s\S]*\}/,
  'Agent-assisted supporting docs should attach optional uploaded document evidence.',
)

assert.match(
  workflowActionTestSource,
  /RECORD_AGENT_ASSISTED_SUPPORTING_DOCS[\s\S]*evidence_id === 'RECORD_AGENT_ASSISTED_SUPPORTING_DOCS'[\s\S]*evidence_type,\s*'event'/,
  'Agent-assisted supporting docs should be covered as event evidence, not manual override evidence.',
)

assert.match(
  workflowActionTestSource,
  /supportingDocsDocumentId:\s*'doc-supporting-offline-1'[\s\S]*evidence_id === 'doc-supporting-offline-1'[\s\S]*evidence_type,\s*'document'/,
  'Agent-assisted supporting docs should attach uploaded document pack evidence when provided.',
)

assert.match(
  packageJson,
  /"test:workflow-agent-assisted-supporting-docs-phase7":\s*"node scripts\/workflow-agent-assisted-supporting-docs-phase7\.test\.mjs"/,
  'package.json should expose the Phase 7 agent-assisted supporting docs regression test.',
)

console.log('workflow agent-assisted supporting docs Phase 7 tests passed')
