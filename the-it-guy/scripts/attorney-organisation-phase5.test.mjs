import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildMembershipParity, parseArgs } from './attorney-organisation-runtime-readiness.mjs'

assert.deepEqual(parseArgs(['--skip-network', '--fail-on-blocked', '--expected-project-ref=project-1']), {
  skipNetwork: true,
  failOnBlocked: true,
  outputPath: '',
  expectedProjectRef: 'project-1',
})
assert.throws(() => parseArgs(['--unknown']), /Unknown option/)

const membership = buildMembershipParity({
  firms: [
    { id: 'firm-1', organisation_id: 'org-1' },
    { id: 'firm-2', organisation_id: 'org-2' },
  ],
  firmMembers: [
    { firm_id: 'firm-1', user_id: 'user-1', status: 'active' },
    { firm_id: 'firm-1', user_id: 'user-2', status: 'removed' },
    { firm_id: 'firm-2', user_id: 'user-3', status: 'active' },
  ],
  organisationUsers: [
    { organisation_id: 'org-1', user_id: 'user-1', status: 'active' },
    { organisation_id: 'org-2', user_id: 'user-3', status: 'invited' },
  ],
})

assert.deepEqual(membership, {
  activeFirmMembers: 2,
  matchedOrganisationMembers: 1,
  missingOrganisationMembers: 1,
})

const readinessPath = fileURLToPath(new URL('./attorney-organisation-runtime-readiness.mjs', import.meta.url))
const staticRun = spawnSync(process.execPath, [readinessPath, '--skip-network'], {
  encoding: 'utf8',
  env: { PATH: process.env.PATH || '' },
})
assert.equal(staticRun.status, 0, staticRun.stderr)
const staticReport = JSON.parse(staticRun.stdout)
assert.equal(staticReport.phase, 5)
assert.equal(staticReport.mode, 'static')
assert.equal(staticReport.summary.status, 'BLOCKED')
assert.equal(staticReport.summary.criticalCount, 0)
assert.equal(staticReport.findings.some((finding) => finding.area === 'Static Contract' && finding.status === 'PASS'), true)
assert.equal(staticReport.runtime.driftSummary, null)

const readinessSource = readFileSync(readinessPath, 'utf8')
assert.match(readinessSource, /Accept: 'application\/openapi\+json'/)
assert.match(readinessSource, /buildAttorneyOrganisationDriftReport/)
assert.match(readinessSource, /buildMembershipParity/)
assert.match(readinessSource, /serviceRoleKey/)
assert.doesNotMatch(readinessSource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)

const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
assert.match(packageSource, /verify:attorney-organisation:readiness/)

console.log('attorney organisation Phase 5 runtime readiness contracts passed')
