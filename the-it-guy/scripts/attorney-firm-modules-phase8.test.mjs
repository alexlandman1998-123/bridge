import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

import {
  ATTORNEY_FIRM_MODULE_CONTRACTS,
  buildAttorneyFirmModulesReleaseCertificate,
  runAttorneyFirmModulesReleaseCertification,
} from './attorney-firm-modules-release-certification.mjs'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    getAttorneyFirmModulesLaunchMetrics,
    getAttorneyFirmModulesLaunchReadiness,
    mapAttorneyFirmModulesLaunchMetrics,
    mapAttorneyFirmModulesLaunchReadiness,
  } = await server.ssrLoadModule('/src/services/attorneyFirmModulesService.js')

  const readiness = mapAttorneyFirmModulesLaunchReadiness({
    status: 'ready',
    releaseReady: true,
    strictReleaseReady: true,
    mutatedData: false,
    moduleCount: 3,
    expectedModuleCount: 3,
    activeCount: 1,
    windingDownCount: 1,
    inactiveCount: 1,
    writeGuardInstalled: true,
    publicIntakeGuardInstalled: true,
    lifecycleHistoryInstalled: true,
    issueCodes: [],
  })
  assert.equal(readiness.status, 'READY')
  assert.equal(readiness.strictReleaseReady, true)
  assert.equal(readiness.moduleCount, 3)

  const metrics = mapAttorneyFirmModulesLaunchMetrics({
    status: 'healthy',
    checkedAt: '2026-07-17T12:00:00Z',
    windowHours: 24,
    mutatedData: false,
    readiness,
    currentState: { active: 1, windingDown: 1, inactive: 1 },
    activity: { transitions: 4, windDownsStarted: 2, deactivations: 1, reactivations: 1 },
  })
  assert.equal(metrics.status, 'HEALTHY')
  assert.equal(metrics.activity.transitions, 4)
  assert.equal(metrics.currentState.windingDown, 1)
  assert.equal(metrics.mutatedData, false)

  const rpcCalls = []
  const client = { rpc: async (name, payload) => {
    rpcCalls.push({ name, payload })
    return { data: name.endsWith('launch_readiness') ? readiness : metrics, error: null }
  } }
  await getAttorneyFirmModulesLaunchReadiness('firm-1', { client })
  await getAttorneyFirmModulesLaunchMetrics('firm-1', { client, windowHours: 48 })
  assert.deepEqual(rpcCalls, [
    { name: 'get_attorney_firm_modules_launch_readiness', payload: { p_firm_id: 'firm-1' } },
    { name: 'get_attorney_firm_modules_launch_metrics', payload: { p_firm_id: 'firm-1', p_window_hours: 48 } },
  ])
  await assert.rejects(
    () => getAttorneyFirmModulesLaunchMetrics('firm-1', { client, windowHours: 0 }),
    /between 1 and 168 hours/,
  )

  const passingContracts = ATTORNEY_FIRM_MODULE_CONTRACTS.map((name) => ({ name, passed: true }))
  const goCertificate = buildAttorneyFirmModulesReleaseCertificate({
    firmId: 'private-firm-id',
    readiness,
    launchMetrics: metrics,
    contracts: passingContracts,
  })
  assert.equal(goCertificate.status, 'GO')
  assert.equal(goCertificate.firmFingerprint.length, 16)
  assert.equal(goCertificate.certificateId.length, 64)
  assert.equal(goCertificate.mutatedData, false)
  assert.equal(JSON.stringify(goCertificate).includes('private-firm-id'), false)
  assert.deepEqual(buildAttorneyFirmModulesReleaseCertificate({
    firmId: 'private-firm-id', readiness, launchMetrics: metrics, contracts: passingContracts,
  }), goCertificate)

  const noGoCertificate = buildAttorneyFirmModulesReleaseCertificate({
    firmId: 'private-firm-id',
    readiness: { ...readiness, status: 'READY_WITH_ACTIONS', strictReleaseReady: false },
    launchMetrics: { ...metrics, status: 'ATTENTION' },
    contracts: passingContracts,
  })
  assert.equal(noGoCertificate.status, 'NO_GO')

  const runtimeCalls = []
  const runtimeCertificate = await runAttorneyFirmModulesReleaseCertification({
    firmId: 'firm-runtime',
    client: { rpc: async (name, payload) => {
      runtimeCalls.push({ name, payload })
      return { data: name.endsWith('launch_readiness') ? readiness : metrics, error: null }
    } },
    contractRunner: async (name) => ({ name, passed: true, detail: 'Passed.' }),
  })
  assert.equal(runtimeCertificate.status, 'GO')
  assert.deepEqual(runtimeCalls.map((call) => call.name), [
    'get_attorney_firm_modules_launch_readiness',
    'get_attorney_firm_modules_launch_metrics',
  ])

  const [migration, component, service, certification, runbook, flags, packageJsonSource] = await Promise.all([
    readFile(new URL('../../supabase/migrations/202607170015_attorney_firm_modules_phase8_launch_telemetry.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/attorney/AttorneyFirmModulesSettings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/attorneyFirmModulesService.js', import.meta.url), 'utf8'),
    readFile(new URL('./attorney-firm-modules-release-certification.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../docs/attorney-firm-modules-phase8-launch.md', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/envValidation.js', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ])
  const packageJson = JSON.parse(packageJsonSource)

  assert.match(migration, /get_attorney_firm_modules_launch_readiness/)
  assert.match(migration, /get_attorney_firm_modules_launch_metrics/)
  assert.match(migration, /inactive_modules_have_open_matters/)
  assert.match(migration, /trg_enforce_attorney_assignment_module_write_guard/)
  assert.match(migration, /v_window_hours < 1 or v_window_hours > 168/)
  assert.match(migration, /Returns no firm identifiers, matter identifiers, actor identities, or client information/)
  assert.doesNotMatch(migration, /\b(insert\s+into|update\s+public\.|delete\s+from)\b/i)
  assert.match(component, /Phase 8 launch telemetry/)
  assert.match(component, /No firm IDs, matter IDs, client details, or user identities are exposed/)
  assert.match(service, /getAttorneyFirmModulesLaunchMetrics/)
  assert.match(certification, /createHash\('sha256'\)/)
  assert.match(certification, /mode: 0o600/)
  assert.match(runbook, /never overwrite or reinterpret an earlier result/)
  assert.match(flags, /VITE_FEATURE_ATTORNEY_MODULE_LAUNCH_TELEMETRY, false/)
  assert.equal(packageJson.scripts['test:attorney-firm-modules-phase8'], 'node scripts/attorney-firm-modules-phase8.test.mjs')
  assert.match(packageJson.scripts['verify:attorney-firm-modules-release'], /attorney-firm-modules-release-certification\.mjs/)

  console.log('attorney firm modules Phase 8 launch-certification tests passed')
} finally {
  await server.close()
}
