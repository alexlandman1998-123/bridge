import assert from 'node:assert/strict'
import fs from 'node:fs'

const config = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
const activate = fs.readFileSync('scripts/legal-document-phase-a3-activate.mjs', 'utf8')
const deactivate = fs.readFileSync('scripts/legal-document-phase-a3-deactivate.mjs', 'utf8')
const verify = fs.readFileSync('scripts/legal-document-phase-a3-verify.mjs', 'utf8')
const smoke = fs.readFileSync('scripts/legal-document-phase4-staging-smoke.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.ok(config.activation && typeof config.activation === 'object')
assert.ok(['inactive', 'active', 'deactivated'].includes(config.activation.status))
assert.ok(Array.isArray(config.activation.activatedOrganisationIds))
if (config.activation.status === 'active') {
  assert.equal(config.enabled, true)
  assert.deepEqual([...config.activation.activatedOrganisationIds].sort(), [...config.organisationIds].sort())
  assert.ok(config.activation.targetProjectRef)
  assert.ok(config.activation.activatedBy)
  assert.ok(config.activation.activatedAt)
  assert.ok(config.activation.activationReference)
}
assert.match(activate, /legal-document-phase-a2-readiness\.mjs/)
assert.match(activate, /READY_FOR_A3/)
assert.match(activate, /LEGAL_DOCUMENT_PHASE_A3_WRITE/)
assert.match(activate, /confirm-project-ref/)
assert.match(activate, /confirm-organisation-ids/)
assert.match(activate, /LEGAL_DOCUMENT_PILOT_ENABLED=true/)
assert.match(activate, /LEGAL_DOCUMENT_PILOT_ENABLED=false/)
assert.match(activate, /secretDigestsVerified/)
assert.match(deactivate, /LEGAL_DOCUMENT_PILOT_ENABLED=false/)
assert.match(deactivate, /LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS=__none__/)
assert.match(deactivate, /secretDigestsVerified/)
assert.match(verify, /legal-document-phase4-release-gate\.mjs/)
assert.match(verify, /A3_RUNTIME_SECRET_MISMATCH/)
assert.match(smoke, /LOCKED_TEMPLATE_PROBE_ID/)
assert.match(smoke, /unapproved_packet_template/)
assert.match(smoke, /template_source_mismatch/)
assert.doesNotMatch(activate, /shell:\s*true/)
assert.doesNotMatch(deactivate, /shell:\s*true/)
for (const scriptName of [
  'test:legal-documents-phase-a3',
  'activate:legal-documents:phase-a3',
  'deactivate:legal-documents:phase-a3',
  'verify:legal-documents:phase-a3',
]) assert.ok(pkg.scripts[scriptName], `Missing package script ${scriptName}`)

console.log('Legal document Phase A3 controlled-activation contract passed')
