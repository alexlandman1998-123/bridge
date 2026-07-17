import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

import { runAttorneyMatterNumberingReadiness } from './attorney-matter-numbering-readiness.mjs'

export const ATTORNEY_MATTER_NUMBERING_CONTRACTS = Object.freeze([
  'test:attorney-matter-numbering-phase4',
  'test:attorney-matter-numbering-phase5',
  'test:attorney-matter-numbering-phase6',
  'test:attorney-matter-numbering-phase7',
  'test:attorney-matter-numbering-phase8',
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

export function buildAttorneyMatterNumberingReleaseCertificate({ firmId, readiness, launchMetrics, contracts } = {}) {
  const contractResults = contracts || []
  const gates = {
    contractSuite: {
      status: contractResults.length === ATTORNEY_MATTER_NUMBERING_CONTRACTS.length && contractResults.every((contract) => contract.passed) ? 'pass' : 'blocked',
      passed: contractResults.filter((contract) => contract.passed).length,
      total: ATTORNEY_MATTER_NUMBERING_CONTRACTS.length,
    },
    integrity: {
      status: readiness?.strictReleaseReady === true ? 'pass' : 'blocked',
      assessment: readiness?.status || 'UNKNOWN',
      coveragePercent: Number(readiness?.coveragePercent || 0),
      issueCodes: Array.isArray(readiness?.issueCodes) ? readiness.issueCodes : [],
    },
    launchTelemetry: {
      status: launchMetrics?.status === 'HEALTHY' && launchMetrics?.mutatedData === false ? 'pass' : 'blocked',
      assessment: launchMetrics?.status || 'UNKNOWN',
      windowHours: Number(launchMetrics?.windowHours || 0),
      activity: launchMetrics?.activity || {},
    },
  }
  const status = Object.values(gates).every((gate) => gate.status === 'pass') ? 'GO' : 'NO_GO'
  const certificatePayload = stableValue({
    version: 'attorney-matter-numbering-phase8',
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

export async function runAttorneyMatterNumberingReleaseCertification({ client, firmId, contractRunner = runNpmContract } = {}) {
  if (!client) throw new Error('A Supabase client is required for release certification.')
  if (!firmId) throw new Error('An attorney firm is required. Pass --firm-id=<uuid> or set ATTORNEY_FIRM_ID.')

  const contracts = []
  for (const scriptName of ATTORNEY_MATTER_NUMBERING_CONTRACTS) {
    const result = await contractRunner(scriptName)
    contracts.push(result)
    if (!result.passed) break
  }

  const readiness = await runAttorneyMatterNumberingReadiness({ client, firmId })
  const launchResult = await client.rpc('get_attorney_matter_numbering_launch_metrics', {
    p_attorney_firm_id: firmId,
    p_window_hours: 24,
  })
  if (launchResult.error) {
    const missingRpc = ['42883', 'PGRST202'].includes(String(launchResult.error.code || '').toUpperCase())
    if (missingRpc) throw new Error('Phase 8 matter-number launch telemetry is not deployed in this environment yet.')
    throw launchResult.error
  }
  const launchMetrics = Array.isArray(launchResult.data) ? launchResult.data[0] : launchResult.data
  return buildAttorneyMatterNumberingReleaseCertificate({ firmId, readiness, launchMetrics, contracts })
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
  const certificate = await runAttorneyMatterNumberingReleaseCertification({ client, firmId })
  const report = { generatedAt: new Date().toISOString(), ...certificate }
  const serialized = `${JSON.stringify(report, null, 2)}\n`
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
