import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const leadWorkspaceSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
const workflowSmokeSource = await readFile(new URL('./agency-workflow-smoke.test.mjs', import.meta.url), 'utf8')
const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8')

assert.match(
  leadWorkspaceSource,
  /const BUYER_AGENT_DOCUMENT_TYPES = \[/,
  'Phase 64 should define agent-selectable buyer document types.',
)

for (const label of [
  'Buyer ID document',
  'Buyer proof of address',
  'Proof of funds',
  'Bank statements',
  'Bond pre-approval',
]) {
  assert.match(leadWorkspaceSource, new RegExp(label), `Phase 64 should expose ${label}.`)
}

assert.match(
  leadWorkspaceSource,
  /function getAgentUploadedBuyerDocuments\(row = \{\}\)/,
  'Phase 64 should read agent-uploaded buyer documents from the buyer lead payload.',
)

assert.match(
  leadWorkspaceSource,
  /getAgentUploadedBuyerDocuments\(row\),/,
  'Buyer document readiness should include agent-uploaded buyer lead documents.',
)

assert.match(
  leadWorkspaceSource,
  /async function uploadAgentBuyerLeadDocument\(/,
  'Phase 64 should provide a buyer lead document upload routine.',
)

assert.match(
  leadWorkspaceSource,
  /uploadToStorageCandidateBuckets\(\{[\s\S]*buyer lead document upload/,
  'Agent-assisted buyer document upload should use configured document storage buckets.',
)

assert.match(
  leadWorkspaceSource,
  /agentUploadedBuyerDocuments/,
  'Agent-uploaded buyer document metadata should be persisted on the lead payload.',
)

assert.match(
  leadWorkspaceSource,
  /updateAgencyCrmLeadRecord\(workspaceId, leadId,[\s\S]*rawEnquiryPayload: nextRawPayload/,
  'Agent-uploaded buyer document metadata should save through the CRM lead update path.',
)

assert.match(
  leadWorkspaceSource,
  /Buyer Document Uploaded By Agent/,
  'Agent-uploaded buyer documents should leave an activity audit trail.',
)

assert.match(
  leadWorkspaceSource,
  /Use this when the buyer emailed documents to the agent\./,
  'Buyer document centre should explain the emailed-document manual upload path.',
)

assert.match(
  leadWorkspaceSource,
  /Upload Buyer Document/,
  'Buyer document centre should expose an agent upload button.',
)

assert.match(
  leadWorkspaceSource,
  /\{ key: 'documents', label: 'Documents' \}/,
  'Buyer workspace should expose the Documents tab to agents.',
)

assert.match(
  workflowSmokeSource,
  /test:agent-assisted-buyer-document-upload-phase64/,
  'Agency workflow smoke should include the Phase 64 buyer document upload contract.',
)

assert.match(
  packageJson,
  /"test:agent-assisted-buyer-document-upload-phase64": "node scripts\/agent-assisted-buyer-document-upload-phase64\.test\.mjs"/,
  'package.json should expose the Phase 64 buyer document upload test.',
)

console.log('agent-assisted buyer document upload Phase 64 contract passed.')
