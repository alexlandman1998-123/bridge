import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

function run(script) {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  let report = null
  try { report = JSON.parse(result.stdout) } catch { report = null }
  return { passed: result.status === 0, report }
}

const release = run('scripts/mvp-release-certification.mjs')
const pilot = run('scripts/mvp-pilot-acceptance.mjs')
const deploymentAssetsPresent = [
  '../../supabase/migrations/202607180046_mvp_atomic_transaction_creation_phase2a.sql',
  '../../.github/workflows/mvp-release-certification.yml',
].every((path) => existsSync(new URL(path, import.meta.url)))
const blockers = []
if (!release.passed) blockers.push('release_certification_failed')
if (pilot.report?.decision !== 'go_for_controlled_pilot') blockers.push('pilot_acceptance_not_green')
if (!deploymentAssetsPresent) blockers.push('deployment_assets_missing')

console.log(JSON.stringify({
  version: 'arch9_mvp_launch_readiness_v1',
  decision: blockers.length ? 'no_go' : 'ready_for_mvp_launch',
  monthlyTransactionTarget: 100,
  releaseCertification: release.passed,
  pilotAcceptance: pilot.report?.decision || 'unavailable',
  deploymentAssetsPresent,
  requiredManualStep: 'Apply the MVP atomic-creation migration to the target Supabase environment before enabling production conversion.',
  blockers,
}, null, 2))

if (blockers.length) process.exit(1)
