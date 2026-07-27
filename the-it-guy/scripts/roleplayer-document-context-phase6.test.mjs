import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./roleplayer-document-context-phase6-evidence.mjs', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['export:roleplayer-document-context:evidence'],
  'node scripts/roleplayer-document-context-phase6-evidence.mjs',
  'package.json should expose the Phase 6 roleplayer document context evidence export',
)
assert.equal(
  packageJson.scripts['test:roleplayer-document-context-phase6'],
  'node scripts/roleplayer-document-context-phase6.test.mjs',
  'package.json should expose the Phase 6 evidence-export contract test',
)

assert.match(source, /roleplayer_document_context_phase6_evidence_v1/, 'evidence export should report a stable contract version')
assert.match(source, /phase:\s*'6'/, 'evidence export should report itself as Phase 6')
assert.match(source, /roleplayer-document-context-operational-readiness\.mjs/, 'evidence export should run the Phase 5 operational readiness gate')
assert.match(source, /private-evidence/, 'evidence export should write only under private-evidence')
assert.match(source, /roleplayer-document-context-phase6-evidence\.json/, 'evidence export should write a JSON evidence artifact')
assert.match(source, /roleplayer-document-context-phase6-summary\.md/, 'evidence export should write a markdown summary')
assert.match(source, /roleplayer-document-context-phase6-manifest\.json/, 'evidence export should write a manifest')
assert.match(source, /sha256/, 'evidence export should digest evidence artifacts')
assert.match(source, /readyForRelease/, 'evidence export should expose release readiness')
assert.match(source, /readyForBuildVerification/, 'evidence export should expose preflight readiness')
assert.match(source, /sellerNames:\s*'omitted'/, 'evidence export should omit seller names')
assert.match(source, /sellerIdNumbers:\s*'omitted'/, 'evidence export should omit seller ID numbers')
assert.match(source, /documentHtml:\s*'omitted'/, 'evidence export should omit document HTML')
assert.match(source, /mutatedData:\s*false/, 'evidence export must be explicitly read-only')
assert.match(source, /process\.exitCode = 1/, 'evidence export should fail the process when readiness is blocked')

assert.doesNotMatch(source, /createClient/, 'evidence export should not create a Supabase client directly')
assert.doesNotMatch(source, /\.from\(/, 'evidence export should not access application data tables directly')
assert.doesNotMatch(source, /\.(insert|upsert|delete)\(/, 'evidence export should not mutate application data')

console.log('roleplayer document context phase 6 tests passed')
