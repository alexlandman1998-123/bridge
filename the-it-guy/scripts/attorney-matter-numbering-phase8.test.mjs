import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { mapAttorneyMatterNumberingLaunchMetrics } from '../src/services/attorneyMatterNumberingService.js'
import {
  ATTORNEY_MATTER_NUMBERING_CONTRACTS,
  buildAttorneyMatterNumberingReleaseCertificate,
  runAttorneyMatterNumberingReleaseCertification,
} from './attorney-matter-numbering-release-certification.mjs'

const mapped = mapAttorneyMatterNumberingLaunchMetrics({
  status: 'healthy',
  checkedAt: '2026-07-17T12:00:00Z',
  windowHours: 24,
  mutatedData: false,
  readiness: { status: 'READY', strictReleaseReady: true, coveragePercent: 100 },
  activity: { filesOpened: 2, referencesGenerated: 2, referencesConfirmed: 1, referencesChanged: 1 },
})
assert.equal(mapped.status, 'HEALTHY')
assert.equal(mapped.activity.referencesConfirmed, 1)
assert.equal(mapped.mutatedData, false)

const passingContracts = ATTORNEY_MATTER_NUMBERING_CONTRACTS.map((name) => ({ name, passed: true, detail: 'Passed.' }))
const goCertificate = buildAttorneyMatterNumberingReleaseCertificate({
  firmId: 'firm-secret-value',
  readiness: { status: 'READY', strictReleaseReady: true, coveragePercent: 100, issueCodes: [] },
  launchMetrics: { status: 'HEALTHY', mutatedData: false, windowHours: 24, activity: { filesOpened: 1 } },
  contracts: passingContracts,
})
assert.equal(goCertificate.status, 'GO')
assert.equal(goCertificate.firmFingerprint.length, 16)
assert.equal(goCertificate.mutatedData, false)
assert.equal(JSON.stringify(goCertificate).includes('firm-secret-value'), false)
assert.equal(goCertificate.certificateId.length, 64)
assert.deepEqual(
  buildAttorneyMatterNumberingReleaseCertificate({
    firmId: 'firm-secret-value',
    readiness: { status: 'READY', strictReleaseReady: true, coveragePercent: 100, issueCodes: [] },
    launchMetrics: { status: 'HEALTHY', mutatedData: false, windowHours: 24, activity: { filesOpened: 1 } },
    contracts: passingContracts,
  }),
  goCertificate,
  'the same assessed payload must produce the same certificate',
)

const noGoCertificate = buildAttorneyMatterNumberingReleaseCertificate({
  firmId: 'firm-secret-value',
  readiness: { status: 'NEEDS_BACKFILL', strictReleaseReady: false, coveragePercent: 90, issueCodes: ['missing_matter_files'] },
  launchMetrics: { status: 'BLOCKED', mutatedData: false, windowHours: 24, activity: {} },
  contracts: passingContracts,
})
assert.equal(noGoCertificate.status, 'NO_GO')

const rpcCalls = []
const runtimeCertificate = await runAttorneyMatterNumberingReleaseCertification({
  firmId: 'firm-runtime',
  client: { rpc: async (name, parameters) => {
    rpcCalls.push({ name, parameters })
    if (name === 'get_attorney_matter_numbering_readiness') {
      return { data: { status: 'READY', strictReleaseReady: true, coveragePercent: 100, issueCodes: [] }, error: null }
    }
    return { data: { status: 'HEALTHY', mutatedData: false, windowHours: 24, activity: {} }, error: null }
  } },
  contractRunner: async (name) => ({ name, passed: true, detail: 'Passed.' }),
})
assert.equal(runtimeCertificate.status, 'GO')
assert.deepEqual(rpcCalls.map((call) => call.name), [
  'get_attorney_matter_numbering_readiness',
  'get_attorney_matter_numbering_launch_metrics',
])

const [migration, component, service, certification, runbook, packageJsonSource] = await Promise.all([
  readFile(new URL('../../supabase/migrations/202607170011_attorney_matter_numbering_phase8_launch_telemetry.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/attorney/AttorneyMatterNumberingSettings.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/attorneyMatterNumberingService.js', import.meta.url), 'utf8'),
  readFile(new URL('./attorney-matter-numbering-release-certification.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../docs/attorney-matter-numbering-phase8-launch.md', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
])
const packageJson = JSON.parse(packageJsonSource)

assert.match(migration, /get_attorney_matter_numbering_launch_metrics/)
assert.match(migration, /v_window_hours < 1 or v_window_hours > 168/)
assert.match(migration, /get_attorney_matter_numbering_readiness/)
assert.match(migration, /Returns no matter references, transaction identifiers, or actor identities/)
assert.doesNotMatch(migration, /\b(insert|update|delete)\s+(into|public\.|from)/i)
assert.match(component, /Phase 8 launch telemetry/)
assert.match(component, /No matter numbers, transaction IDs, or user identities are exposed/)
assert.match(service, /getAttorneyMatterNumberingLaunchMetrics/)
assert.match(certification, /createHash\('sha256'\)/)
assert.match(certification, /mode: 0o600/)
assert.match(runbook, /never overwrite or reinterpret the earlier evidence/)
assert.equal(packageJson.scripts['test:attorney-matter-numbering-phase8'], 'node scripts/attorney-matter-numbering-phase8.test.mjs')
assert.match(packageJson.scripts['verify:attorney-matter-numbering-release'], /attorney-matter-numbering-release-certification\.mjs/)

console.log('attorney matter-numbering Phase 8 tests passed')
