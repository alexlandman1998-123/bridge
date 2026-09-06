import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const acceptance = readFileSync('scripts/agent-phase2-rls-acceptance.mjs', 'utf8')
const attestation = readFileSync('scripts/agent-scale-phase1-migration-attestation.mjs', 'utf8')
const actors = JSON.parse(readFileSync('config/agent-phase2-rls-actors.example.json', 'utf8'))
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const releaseReadiness = readFileSync('scripts/agent-phase6-release-readiness.mjs', 'utf8')

assert.equal(actors.contract, 'arch9-agent-phase2-rls-actors-v2')
assert.equal(actors.deniedOrganisationIdEnv, 'AGENT_RLS_DENIED_ORG_ID')
assert.equal(actors.actors.length, 6)
assert.ok(actors.actors.find((actor) => actor.name === 'branch_manager')?.deniedBranchIdEnv)
assert.match(acceptance, /is_anonymous/)
assert.match(acceptance, /deniedOrganisationProbes/)
assert.match(acceptance, /denied-organisation probe/)
assert.match(acceptance, /denied-branch probe/)
assert.match(acceptance, /userFingerprint/)
assert.doesNotMatch(acceptance, /actorResult = \{ name: actor\.name, userId/)
assert.match(attestation, /supabase['"], \[/)
assert.match(attestation, /migration['"], ['"]list/)
assert.match(attestation, /--require-applied/)
assert.match(releaseReadiness, /arch9-agent-phase2-rls-actors-v2/)
assert.match(releaseReadiness, /Denied-organisation evidence is incomplete/)
assert.match(releaseReadiness, /Denied-branch evidence is incomplete/)

for (const script of ['test:agent-scale-phase1', 'attest:agent-scale-phase1:migration', 'acceptance:agent-scale-phase1', 'verify:agent-scale-phase1']) {
  assert.equal(typeof packageJson.scripts[script], 'string', `Missing package script: ${script}`)
}
assert.match(packageJson.scripts['verify:agent-scale-phase1'], /verify:agent-scale-phase0/)
assert.match(packageJson.scripts['verify:agent-scale-phase1'], /test:agent-scale-phase1/)

console.log('Agent scale Phase 1 access-control checks passed.')
