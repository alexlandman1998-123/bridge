import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildDocumentExperienceReadiness } from '../src/core/documents/documentExperienceReadiness.js'

const source = await readFile(new URL('../src/core/documents/documentExperienceReadiness.js', import.meta.url), 'utf8')
const result = buildDocumentExperienceReadiness()

assert.match(source, /arch9-document-experience-readiness-v1/)
assert.match(source, /N1_NO_REACHABLE_ACTION/)
assert.match(source, /N1_AUDIENCE_COVERAGE_MISSING/)
assert.equal(result.status, 'READY_FOR_N2')
assert.equal(result.coverage.scenarioCount, 8)
assert.equal(result.blockers.length, 0)
assert.equal(result.mutatedData, false)

console.log('Document generator N1 cross-role journey readiness contract passed.')
