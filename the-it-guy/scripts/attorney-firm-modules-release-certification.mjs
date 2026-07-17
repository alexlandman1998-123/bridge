import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const ATTORNEY_FIRM_MODULE_CONTRACTS = Object.freeze([
  'test:attorney-firm-modules-phase1',
  'test:attorney-firm-modules-phase2',
  'test:attorney-firm-modules-phase3',
  'test:attorney-firm-modules-phase4',
  'test:attorney-firm-modules-phase5',
  'test:attorney-firm-modules-phase6',
  'test:attorney-firm-modules-phase7',
  'test:attorney-firm-modules-phase8',
])

function argumentValue(name) {
  const prefix = `${name}=`
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim() || ''
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
  }
  return value
}

function fingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

function runNpmContract(scriptName) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', scriptName], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (code) => resolve({
      name: scriptName,
      passed: code === 0,
      detail: code === 0 ? 'Passed.' : (stderr.trim() || stdout.trim() || `Exited with code ${code ?? 1}.`),
    }))
  })
}

export function buildAttorneyFirmModulesReleaseCertificate({ firmId, readiness, launchMetrics, contracts } = {}) {
  const contractResults = contracts || []
  const gates = {
    contractSuite: {
      status: contractResults.length === ATTORNEY_FIRM_MODULE_CONTRACTS.length && contractResults.every((contract) => contract.passed) ? 'pass' : 'blocked',
      passed: contractResults.filter((contract) => contract.passed).length,
      total: ATTORNEY_FIRM_MODULE_CONTRACTS.length,
    },
    moduleIntegrity: {
      status: readiness?.status === 'READY' && readiness?.strictReleaseReady === true && readiness?.mutatedData === false ? 'pass' : 'blocked',
      assessment: readiness?.status || 'UNKNOWN',
      moduleCount: Number(readiness?.moduleCount || 0),
      expectedModuleCount: Number(readiness?.expectedModuleCount || 3),
      issueCodes: Array.isArray(readiness?.issueCodes) ? readiness.issueCodes : [],
    },
    launchTelemetry: {
      status: launchMetrics?.status === 'HEALTHY' && launchMetrics?.mutatedData === false ? 'pass' : 'blocked',
      assessment: launchMetrics?.status || 'UNKNOWN',
      windowHours: Number(launchMetrics?.windowHours || 0),
      currentState: launchMetrics?.currentState || {},
      activity: launchMetrics?.activity || {},
    },
  }
  const status = Object.values(gates).every((gate) => gate.status === 'pass') ? 'GO' : 'NO_GO'
  const certificatePayload = stableValue({
    version: 'attorney-firm-modules-phase8',
    firmFingerprint: fingerprint(firmId || '').slice(0, 16),
    status,
    mutatedData: false,
    gates,
    contracts: contractResults.map(({ name, passed }) => ({ name, passed })),
  })
  return {
    ...certificatePayload,
    certificateId: fingerprint(JSON.stringify(certificatePayload)),
  }
}

export async function runAttorneyFirmModulesReleaseCertification({ client, firmId, contractRunner = runNpmContract } = {}) {
  if (!client) throw new Error('A Supabase client is required for release certification.')
  if (!firmId) throw new Error('An attorney firm is required. Pass --firm-id=<uuid> or set ATTORNEY_FIRM_ID.')

  const contracts = []
  for (const scriptName of ATTORNEY_FIRM_MODULE_CONTRACTS) {
    const result = await contractRunner(scriptName)
    contracts.push(result)
    if (!result.passed) break
  }

  const readinessResult = await client.rpc('get_attorney_firm_modules_launch_readiness', {
    p_firm_id: firmId,
  })
  if (readinessResult.error) {
    const missingRpc = ['42883', 'PGRST202'].includes(String(readinessResult.error.code || '').toUpperCase())
    if (missingRpc) throw new Error('Phase 8 attorney-module readiness is not deployed in this environment yet.')
    throw readinessResult.error
  }

  const metricsResult = await client.rpc('get_attorney_firm_modules_launch_metrics', {
    p_firm_id: firmId,
    p_window_hours: 24,
  })
  if (metricsResult.error) {
    const missingRpc = ['42883', 'PGRST202'].includes(String(metricsResult.error.code || '').toUpperCase())
    if (missingRpc) throw new Error('Phase 8 attorney-module launch telemetry is not deployed in this environment yet.')
    throw metricsResult.error
  }

  const readiness = Array.isArray(readinessResult.data) ? readinessResult.data[0] : readinessResult.data
  const launchMetrics = Array.isArray(metricsResult.data) ? metricsResult.data[0] : metricsResult.data
  return buildAttorneyFirmModulesReleaseCertificate({ firmId, readiness, launchMetrics, contracts })
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  const firmId = argumentValue('--firm-id') || process.env.ATTORNEY_FIRM_ID || ''
  const outputPath = argumentValue('--output')
  if (!url || !serviceKey) {
    throw new Error('VITE_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for release certification.')
  }

  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const certificate = await runAttorneyFirmModulesReleaseCertification({ client, firmId })
  const serialized = `${JSON.stringify({ generatedAt: new Date().toISOString(), ...certificate }, null, 2)}\n`
  if (outputPath) {
    const resolvedOutput = path.resolve(outputPath)
    mkdirSync(path.dirname(resolvedOutput), { recursive: true })
    writeFileSync(resolvedOutput, serialized, { encoding: 'utf8', mode: 0o600 })
  }
  process.stdout.write(serialized)
  if (certificate.status !== 'GO') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
  })
}
