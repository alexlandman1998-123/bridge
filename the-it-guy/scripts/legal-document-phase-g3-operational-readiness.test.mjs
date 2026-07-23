import assert from 'node:assert/strict'
import fs from 'node:fs'

const verifier = fs.readFileSync('scripts/legal-document-phase-g3-operational-readiness.mjs', 'utf8')
const canonical = fs.readFileSync('scripts/document-generator-phase-g3-operational-readiness.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.match(verifier, /document-generator-phase-g3-operational-readiness\.mjs/)
assert.match(verifier, /spawnSync/)
assert.doesNotMatch(verifier, /legal-document-phase4-monitor\.mjs/)
assert.doesNotMatch(verifier, /assessLegalDocumentOperationalReadiness/)
assert.match(canonical, /legal-document-phase5-reconcile\.mjs/)
assert.match(canonical, /system_health_snapshots/)
assert.match(canonical, /mutatedData: false/)
for (const name of ['test:legal-documents-phase-g3', 'verify:legal-documents:phase-g3', 'test:document-generator-phase-g3', 'verify:document-generator:phase-g3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document G3 operational readiness alias contract passed.')
