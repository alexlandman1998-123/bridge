import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const agencyPageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const workspacePageSource = await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8')
const runnerSource = await readFile(new URL('../../supabase/functions/legal-document-job-runner/index.ts', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} did not match ${pattern}`)
}

assert.equal(
  packageJson.scripts?.['test:legal-document-server-pdf-generation-phase3'],
  'node scripts/legal-document-server-pdf-generation-phase3.test.mjs',
)

for (const token of [
  'LEGAL_DOCUMENT_SERVER_PDF_GENERATION_JOB_ENABLED',
  'VITE_LEGAL_DOCUMENT_SERVER_PDF_GENERATION_JOB_ENABLED',
  'generate_ready_packet',
  'legal-document-job-runner',
  "jobDisplayType: 'generate_mandate_pdf'",
  'phase3ServerPdfGeneration: true',
  'backgroundGenerationQueued: true',
  'deferGenerationLeaseRelease = true',
]) {
  assertIncludes(packetServiceSource, token, 'Phase 3 packet service server PDF job')
}

assertMatches(
  packetServiceSource,
  /LEGAL_DOCUMENT_SERVER_PDF_GENERATION_JOB_ENABLED[\s\S]+readBooleanFlag\(import\.meta\.env\.VITE_LEGAL_DOCUMENT_SERVER_PDF_GENERATION_JOB_ENABLED, true\)/,
  'Server PDF job generation should default on behind an explicit env flag',
)

assertMatches(
  packetServiceSource,
  /\(LEGAL_DOCUMENT_SERVER_PDF_GENERATION_JOB_ENABLED \|\| LEGAL_DOCUMENT_BROWSER_BACKGROUND_GENERATION_ENABLED\)[\s\S]+validation\.packetType === 'mandate'[\s\S]+renderMode === 'native_structured'/,
  'Native mandate PDF generation should enqueue instead of rendering in the modal',
)

assertMatches(
  packetServiceSource,
  /invokeEdgeFunction\('legal-document-job-runner'[\s\S]+action: 'generate_ready_packet'[\s\S]+background: true[\s\S]+jobDisplayType: 'generate_mandate_pdf'/,
  'Generate mandate should create a background legal document job',
)

for (const token of [
  'phase3ServerPdfGeneration: true',
  'jobDisplayType: "generate_mandate_pdf"',
  'bridge_create_legal_document_job_phase1',
  'p_job_type: "generate_packet_version"',
  'runGeneratePacketVersionJob',
  'callGenerateMandateFunction',
  'createPacketVersionWithTransientRetry',
  'bridge_certify_native_structured_legal_pdf',
]) {
  assertIncludes(runnerSource, token, 'Phase 3 job runner PDF generation')
}

assertMatches(
  runnerSource,
  /p_metadata_json:[\s\S]+phase3ServerPdfGeneration: true[\s\S]+jobDisplayType:[\s\S]+"generate_mandate_pdf"/,
  'Created job rows should expose Phase 3 generate mandate PDF metadata',
)

assertMatches(
  runnerSource,
  /callGenerateMandateFunction[\s\S]+createPacketVersionWithTransientRetry[\s\S]+bridge_certify_native_structured_legal_pdf[\s\S]+status: "succeeded"/,
  'The job should render, persist, certify, and complete outside the modal',
)

for (const token of [
  'backgroundGenerationQueued',
  'Mandate generation is running in the background',
  'job: generatedVersionResult?.job || null',
]) {
  assertIncludes(agencyPageSource, token, 'Phase 3 agency modal queued state')
}

for (const token of [
  'backgroundGenerationQueued',
  'GENERATION_QUEUED',
  'Mandate generation started. You can leave this screen while the PDF is prepared.',
]) {
  assertIncludes(workspacePageSource, token, 'Phase 3 workspace queued state')
}

console.log('Legal document server PDF generation phase 3 contract passed.')
