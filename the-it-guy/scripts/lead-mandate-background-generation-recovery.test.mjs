import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const migrationSource = await readFile(new URL('../../supabase/migrations/202607310002_legal_document_job_watchdog_cron.sql', import.meta.url), 'utf8')
const certificationMigrationSource = await readFile(new URL('../../supabase/migrations/202607310003_certify_native_structured_legal_pdf_launch_readiness_fallback.sql', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function getFunctionBlock(name) {
  const declarationMatch = pageSource.match(new RegExp(`(?:async\\s+function|function)\\s+${name}\\s*\\(`))
  assert.ok(declarationMatch, `${name} should remain defined.`)

  const bodyStart = pageSource.indexOf('{', declarationMatch.index)
  assert.notEqual(bodyStart, -1, `${name} should have a function body.`)

  let depth = 0
  for (let index = bodyStart; index < pageSource.length; index += 1) {
    const char = pageSource[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) return pageSource.slice(bodyStart, index + 1)
  }

  assert.fail(`${name} should have a closed function body.`)
}

assert.equal(
  packageJson.scripts?.['test:lead-mandate-background-generation-recovery'],
  'node scripts/lead-mandate-background-generation-recovery.test.mjs',
)

for (const token of [
  'listLegalDocumentJobsForPacket',
  'function isActiveLegalDocumentGenerationJob',
  'function findLatestMandateGenerationJob',
  'function buildMandateGenerationQueuedStatus',
  'Mandate generation is running in the background. Signing will unlock when the PDF is ready.',
  'Seller onboarding submitted. Preparing the mandate in the background...',
  'mandateAutoGenerationAttemptRef',
]) {
  assert.ok(pageSource.includes(token), `AgencyPipelinePage should keep background mandate recovery token: ${token}`)
}

for (const token of [
  'conditionalMasterCoverageReady',
  'conditionalSigningCanPrepare',
  'conditionalPackCanProceed',
]) {
  assert.ok(packetServiceSource.includes(token), `packetService should keep certification provenance token: ${token}`)
}

for (const token of [
  'generatedVersionResult?.backgroundGenerationQueued',
  "const nextLeadMandateStatus = backgroundGenerationQueued ? 'Mandate Generating' : 'Mandate Generated'",
  "activityType: backgroundGenerationQueued ? 'Mandate Generation Started' : 'Mandate Generated'",
  'buildMandateGenerationQueuedStatus',
  'backgroundGenerationQueued,',
]) {
  assert.ok(pageSource.includes(token), `Mandate generation should treat queued jobs as first-class state: ${token}`)
}

const quickStartBlock = getFunctionBlock('handleMandateQuickStartGenerateAndSend')
for (const token of [
  'listLegalDocumentJobsForPacket({ packetId: mandatePacketId, limit: 5 })',
  'isActiveLegalDocumentGenerationJob(generationJob)',
  'Mandate generation is already running in the background.',
  'generated?.backgroundGenerationQueued',
  'return',
]) {
  assert.ok(quickStartBlock.includes(token), `Quick start should not require an immediate generated version: ${token}`)
}

for (const token of [
  'bridge_run_legal_document_job_watchdog_phase9',
  "url := rtrim(project_url, '/') || '/functions/v1/legal-document-job-runner'",
  "'action', 'watchdog_retry'",
  "'arch9-legal-document-job-watchdog-1m'",
  "'* * * * *'",
]) {
  assert.ok(migrationSource.includes(token), `Watchdog cron migration should include ${token}`)
}

for (const token of [
  'v_launch jsonb',
  'v_conditional_master_ready',
  'v_conditional_signing_ready',
  "v_validation#>'{generationPayload,mandateTemplateLaunchReadiness}'",
  "coalesce(v_launch->>'canGenerateWithoutFallback', '') = 'true'",
  'or not v_conditional_master_ready',
  'or not v_conditional_signing_ready',
]) {
  assert.ok(certificationMigrationSource.includes(token), `Certification fallback migration should include ${token}`)
}

console.log('Lead mandate background generation recovery contract passed.')
