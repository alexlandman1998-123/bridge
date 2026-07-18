import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_A3_WRITE'
const CONFIG_PATH = 'config/legal-document-pilot.json'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const digest = (value) => createHash('sha256').update(value).digest('hex')
const run = (args) => spawnSync('npx', ['supabase', ...args], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
const projectRef = arg('project-ref') || config.activation?.targetProjectRef || ''
const reason = arg('reason')
const deactivatedBy = arg('deactivated-by')
const reference = arg('reference')
const apply = process.argv.includes('--apply')
const blockers = []
if (!projectRef) blockers.push({ code: 'A3_TARGET_PROJECT_REF_MISSING' })
if (!reason) blockers.push({ code: 'A3_DEACTIVATION_REASON_MISSING' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'A3_WRITE_FLAG_MISSING' })
if (apply && arg('confirm-project-ref') !== projectRef) blockers.push({ code: 'A3_PROJECT_CONFIRMATION_MISMATCH' })
if (apply && !deactivatedBy) blockers.push({ code: 'A3_DEACTIVATOR_MISSING' })
if (apply && !reference) blockers.push({ code: 'A3_REFERENCE_MISSING' })

if (!apply || blockers.length) {
  console.log(JSON.stringify({ phase: 'A3', action: 'deactivate', mode: apply ? 'apply' : 'dry-run', status: blockers.length ? 'BLOCKED' : 'DRY_RUN_READY', projectRef: projectRef || null, reason: reason || null, blockers, mutatedData: false }, null, 2))
  if (blockers.length) process.exitCode = 1
} else {
  const setResult = run(['secrets', 'set', 'LEGAL_DOCUMENT_PILOT_ENABLED=false', 'LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS=__none__', '--project-ref', projectRef, '--yes'])
  if (setResult.status !== 0) throw new Error(setResult.stderr || 'Unable to disable the pilot runtime.')
  const listResult = run(['secrets', 'list', '--project-ref', projectRef, '--output', 'json'])
  if (listResult.status !== 0) throw new Error(listResult.stderr || 'Unable to verify the disabled pilot runtime.')
  const secrets = new Map(JSON.parse(listResult.stdout).map((row) => [row.name, row.value]))
  if (secrets.get('LEGAL_DOCUMENT_PILOT_ENABLED') !== digest('false') || secrets.get('LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS') !== digest('__none__')) throw new Error('The runtime kill switch could not be verified.')
  const deactivatedAt = new Date().toISOString()
  const nextConfig = {
    ...config,
    enabled: false,
    activation: {
      ...config.activation,
      status: 'deactivated',
      deactivatedBy,
      deactivatedAt,
      deactivationReason: reason,
      deactivationReference: reference,
    },
  }
  const temporaryPath = `${CONFIG_PATH}.a3.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(nextConfig, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, CONFIG_PATH)
  console.log(JSON.stringify({ phase: 'A3', action: 'deactivate', mode: 'apply', status: 'DEACTIVATED', projectRef, reason, deactivatedAt, secretDigestsVerified: true, mutatedData: true }, null, 2))
}
