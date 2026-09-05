import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const script = fs.readFileSync('scripts/bond-application-portal-phase0-boundary-audit.mjs', 'utf8')
const docs = fs.readFileSync('docs/bond-application-portal-phase0-boundary-audit.md', 'utf8')

assert.equal(packageJson.scripts['test:bond-application-portal-phase0'], 'node scripts/bond-application-portal-phase0-boundary-audit.test.mjs')
assert.match(script, /saveClientPortalOnboardingDraft/)
assert.match(script, /reconcileClientPortalBondDocumentRequirements/)
assert.match(script, /prepareClientPortalBondApplicationSubmission/)
assert.match(script, /mutatedData: false/)
assert.match(docs, /## Freeze rules/)
assert.match(docs, /Do not create a duplicate/)
assert.match(docs, /canonical document/i)

console.log('bond application portal Phase 0 boundary-audit contract tests passed')
