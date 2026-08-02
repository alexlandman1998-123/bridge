import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const documentPacketsApi = fs.readFileSync(path.join(root, 'src', 'lib', 'documentPacketsApi.js'), 'utf8')
const workspacePage = fs.readFileSync(path.join(root, 'src', 'pages', 'LegalDocumentWorkspacePage.jsx'), 'utf8')
const workspace = fs.readFileSync(path.join(root, 'src', 'components', 'documents', 'LegalDocumentWorkspace.jsx'), 'utf8')

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} did not match ${pattern}`)
}

for (const token of [
  'listLegalDocumentJobsForPacket',
  'bridge_list_legal_document_jobs_for_packet_phase1',
  'legal-document-job-phase1-list-v1',
]) {
  assertIncludes(documentPacketsApi, token, 'Phase 7 job API')
}

assertIncludes(workspacePage, 'legalDocumentJob: generationResult.job || null', 'Phase 7 queued status job handoff')

for (const token of [
  'listLegalDocumentJobsForPacket',
  'backgroundGenerationJob',
  'LEGAL_DOCUMENT_JOB_POLL_DELAYS_MS',
  'isActiveLegalDocumentGenerationJob',
  'Mandate generation is running in the background',
  'Mandate PDF generated and ready to review.',
  'backgroundGenerationActive',
  '!backgroundGenerationActive',
  'generationResult?.backgroundGenerationQueued',
  'setBackgroundGenerationJob(generationResult.job || generationResult.status?.legalDocumentJob || null)',
]) {
  assertIncludes(workspace, token, 'Phase 7 workspace job-aware switch')
}

assertMatches(
  workspace,
  /listLegalDocumentJobsForPacket\(\{ packetId: packetIdForJob, limit: 5 \}\)[\s\S]+latestStatus === 'succeeded'[\s\S]+refreshWorkspaceData\(\{ force: true \}\)/,
  'Workspace must poll the legal-document job and refresh into the generated packet on success',
)
assertMatches(
  workspace,
  /latestStatus === 'cancelled' \|\| \(latestStatus === 'failed'[\s\S]+setLoadError/,
  'Workspace must surface terminal background generation failures',
)
assertMatches(
  workspace,
  /const showGeneratePdfButton =[\s\S]+!backgroundGenerationActive[\s\S]+\(!hasGeneratedMandateVersion/,
  'Workspace must block duplicate generate actions while background generation is active',
)
assertMatches(
  workspace,
  /generationResult\?\.backgroundGenerationQueued[\s\S]+setActionFeedback\(generationResult\.actionFeedback[\s\S]+return[\s\S]+const hasGeneratedVersion/,
  'Workspace must return immediately after background generation is queued instead of refreshing a draft that cannot exist yet',
)

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:legal-document-background-generation-phase7-ui-switch'],
  'node scripts/legal-document-background-generation-phase7-ui-switch.test.mjs',
)

console.log('Legal document background generation phase 7 UI switch contract passed.')
