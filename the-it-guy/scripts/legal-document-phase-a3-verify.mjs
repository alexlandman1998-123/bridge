import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const config = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
const projectRef = config.activation?.targetProjectRef || ''
const cohortValue = [...new Set(config.organisationIds || [])].sort().join(',')
const digest = (value) => createHash('sha256').update(value).digest('hex')
const blockers = []
let secretDigestsVerified = false
let release = null

if (!config.enabled || config.activation?.status !== 'active') blockers.push({ code: 'A3_NOT_ACTIVE', detail: 'The repository activation state is not active.' })
if (!projectRef) blockers.push({ code: 'A3_TARGET_PROJECT_REF_MISSING' })
if (!cohortValue) blockers.push({ code: 'A3_ACTIVE_COHORT_EMPTY' })

if (!blockers.length) {
  const secretsResult = spawnSync('npx', ['supabase', 'secrets', 'list', '--project-ref', projectRef, '--output', 'json'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
  if (secretsResult.status !== 0) blockers.push({ code: 'A3_SECRET_VERIFICATION_UNAVAILABLE', detail: secretsResult.stderr })
  else {
    const secrets = new Map(JSON.parse(secretsResult.stdout).map((row) => [row.name, row.value]))
    secretDigestsVerified = secrets.get('LEGAL_DOCUMENT_PILOT_ENABLED') === digest('true') && secrets.get('LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS') === digest(cohortValue)
    if (!secretDigestsVerified) blockers.push({ code: 'A3_RUNTIME_SECRET_MISMATCH', detail: 'Runtime pilot secrets do not match the approved repository state.' })
  }
  const releaseResult = spawnSync(process.execPath, ['scripts/legal-document-phase4-release-gate.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 240_000, maxBuffer: 10 * 1024 * 1024 })
  try { release = JSON.parse(releaseResult.stdout) } catch {}
  if (release?.status !== 'GO') blockers.push({ code: 'A3_RELEASE_GATE_NOT_GO', detail: 'The complete release gate is not GO.' })
}

console.log(JSON.stringify({ phase: 'A3', status: blockers.length ? 'NOT_HEALTHY' : 'HEALTHY', projectRef: projectRef || null, organisationIds: config.organisationIds || [], blockers, secretDigestsVerified, releaseStatus: release?.status || null, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (blockers.length) process.exitCode = 1
