import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { SETTINGS_RELEASE_2_VERSION } from '../src/lib/settingsRelease2.js'
import {
  SETTINGS_RELEASE_3_REQUIRED_MIGRATIONS,
  buildSettingsRelease3Readiness,
} from '../src/lib/settingsRelease3.js'

const workspaceRoot = process.cwd()
const migrationDirectory = resolve(workspaceRoot, '../supabase/migrations')
const config = JSON.parse(readFileSync(resolve(workspaceRoot, 'config/settings-release-3.json'), 'utf8'))
const migrationFiles = readdirSync(migrationDirectory).filter((file) => file.endsWith('.sql'))
const versions = migrationFiles.map((file) => file.split('_')[0])
const uniqueMigrationVersions = new Set(versions).size === versions.length
const requiredMigrationsPresent = SETTINGS_RELEASE_3_REQUIRED_MIGRATIONS.every((file) => migrationFiles.includes(file))

function run(command, args) {
  const result = spawnSync(command, args, { cwd: workspaceRoot, encoding: 'utf8', env: process.env })
  return { pass: result.status === 0, status: result.status, stdout: result.stdout, stderr: result.stderr }
}

const phaseTests = [
  'settings-functional-core-phase1.test.mjs',
  'settings-profile-persistence-phase2-1.test.mjs',
  'settings-membership-resolution-phase2-2.test.mjs',
  'settings-job-title-governance-phase3-1.test.mjs',
  'settings-role-permission-governance-phase3-2.test.mjs',
  'settings-ownership-transfer-phase3-3.test.mjs',
  'settings-cross-module-experience-phase4.test.mjs',
  'settings-release-readiness-phase5.test.mjs',
  'settings-operational-visibility-phase6.test.mjs',
]
const testResults = phaseTests.map((file) => ({ file, ...run(process.execPath, [resolve(workspaceRoot, 'scripts', file)]) }))
const priorReleaseContracts = [
  'settings-release1-gate.test.mjs',
  'settings-release2-gate.test.mjs',
].map((file) => ({ file, ...run(process.execPath, [resolve(workspaceRoot, 'scripts', file)]) }))
const skipBuild = process.argv.includes('--skip-build')
const buildResult = skipBuild ? { pass: false, status: null, stdout: '', stderr: 'Build deliberately skipped.' } : run('npm', ['run', 'build'])

let liveEvidence = {}
const evidencePath = String(process.env.SETTINGS_RELEASE3_EVIDENCE || '').trim()
if (evidencePath) liveEvidence = JSON.parse(readFileSync(resolve(workspaceRoot, evidencePath), 'utf8'))
const release2PromotionVerified = liveEvidence?.release2?.status === 'GO'
  && liveEvidence?.release2?.version === SETTINGS_RELEASE_2_VERSION
  && Boolean(liveEvidence?.release2?.completedAt)

const report = buildSettingsRelease3Readiness({
  config,
  evidence: {
    uniqueMigrationVersions,
    requiredMigrationsPresent,
    phaseContractsPass: testResults.every((result) => result.pass),
    priorReleaseContractsPass: priorReleaseContracts.every((result) => result.pass),
    release2PromotionVerified,
    productionBuildPass: buildResult.pass,
    liveSchemaChecked: Boolean(evidencePath),
    monitoringSource: liveEvidence.monitoringSource,
    observationHours: liveEvidence.observationHours,
    workspaceTypesObserved: liveEvidence.workspaceTypesObserved,
    schema: liveEvidence.schema || {},
    metrics: liveEvidence.metrics || {},
  },
})

console.log(JSON.stringify({
  ...report,
  evidence: {
    uniqueMigrationVersions,
    requiredMigrationsPresent,
    phaseTests: testResults.map(({ file, pass, status }) => ({ file, pass, status })),
    priorReleaseContracts: priorReleaseContracts.map(({ file, pass, status }) => ({ file, pass, status })),
    release2PromotionVerified,
    productionBuild: { pass: buildResult.pass, status: buildResult.status, skipped: skipBuild },
    liveEvidence: evidencePath || null,
    monitoringSource: liveEvidence.monitoringSource || null,
  },
}, null, 2))

if (!report.releaseRecommended) process.exitCode = 1
