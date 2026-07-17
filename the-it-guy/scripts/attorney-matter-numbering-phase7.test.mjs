import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { mapAttorneyMatterNumberingReadiness } from '../src/services/attorneyMatterNumberingService.js'
import { runAttorneyMatterNumberingReadiness } from './attorney-matter-numbering-readiness.mjs'

const mapped = mapAttorneyMatterNumberingReadiness({
  firmId: 'firm-1',
  assessedAt: '2026-07-17T10:00:00Z',
  status: 'needs_backfill',
  releaseReady: false,
  strictReleaseReady: false,
  coveragePercent: '75.50',
  expectedFileCount: 4,
  coveredFileCount: 3,
  missingFileCount: 1,
  duplicateReferenceGroupCount: 0,
  issueCodes: ['missing_matter_files'],
})
assert.equal(mapped.status, 'NEEDS_BACKFILL')
assert.equal(mapped.coveragePercent, 75.5)
assert.equal(mapped.missingFileCount, 1)
assert.deepEqual(mapped.issueCodes, ['missing_matter_files'])

const calls = []
const client = {
  rpc: async (name, parameters) => {
    calls.push({ name, parameters })
    return { data: { status: 'READY', strictReleaseReady: true }, error: null }
  },
}
const ready = await runAttorneyMatterNumberingReadiness({ client, firmId: 'firm-1', strict: true })
assert.equal(ready.status, 'READY')
assert.deepEqual(calls, [{
  name: 'get_attorney_matter_numbering_readiness',
  parameters: { p_attorney_firm_id: 'firm-1' },
}])

const previousExitCode = process.exitCode
process.exitCode = undefined
await runAttorneyMatterNumberingReadiness({
  client: { rpc: async () => ({ data: { status: 'BLOCKED', strictReleaseReady: false }, error: null }) },
  firmId: 'firm-1',
  strict: true,
})
assert.equal(process.exitCode, 1, 'strict mode must fail a blocked release assessment')
process.exitCode = previousExitCode

const [migration, component, service, cli, runbook, packageJsonSource] = await Promise.all([
  readFile(new URL('../../supabase/migrations/202607170010_attorney_matter_numbering_phase7_rollout_readiness.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/attorney/AttorneyMatterNumberingSettings.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/attorneyMatterNumberingService.js', import.meta.url), 'utf8'),
  readFile(new URL('./attorney-matter-numbering-readiness.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../docs/attorney-matter-numbering-phase7-rollout.md', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
])
const packageJson = JSON.parse(packageJsonSource)

assert.match(migration, /auth\.role\(\) is distinct from 'service_role'/)
assert.match(migration, /attorney_user_is_firm_lead/)
assert.match(migration, /duplicate_effective_references/)
assert.match(migration, /missing_reference_history/)
assert.match(migration, /strictReleaseReady/)
assert.doesNotMatch(migration, /\b(insert|update|delete)\s+(into|public\.|from)/i, 'readiness RPC must remain read-only')
assert.match(component, /Phase 7 rollout gate/)
assert.match(component, /getAttorneyMatterNumberingReadiness/)
assert.match(service, /get_attorney_matter_numbering_readiness/)
assert.match(cli, /mutatedData: false/)
assert.match(runbook, /strict command exits unsuccessfully unless the status is exactly `READY`/)
assert.match(runbook, /Roll back the application release first/)
assert.equal(packageJson.scripts['test:attorney-matter-numbering-phase7'], 'node scripts/attorney-matter-numbering-phase7.test.mjs')
assert.match(packageJson.scripts['verify:attorney-matter-numbering-readiness'], /--strict/)

console.log('attorney matter-numbering Phase 7 tests passed')
