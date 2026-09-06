import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PRODUCTION_PROJECT_REF,
  RELEASE_CONFIRMATION,
  assertProductionTarget,
  parseReleaseArgs,
  validatePhase7Evidence,
  validateReleaseApproval,
} from './public-websites-phase8-release.mjs'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')
const read = (path) => readFileSync(path, 'utf8')
const migration = read(resolve(repositoryRoot, 'supabase/migrations/20260905190023_public_websites_phase8_controlled_production_release.sql'))
const databaseTest = read(resolve(repositoryRoot, 'supabase/tests/public_websites_phase8_controlled_production_release_test.sql'))
const repository = read(resolve(repositoryRoot, 'apps/websites/lib/site-repository.ts'))
const workspaceService = read(resolve(appRoot, 'src/services/websiteWorkspaceService.js'))
const workspace = read(resolve(appRoot, 'src/components/marketing/WebsiteWorkspace.jsx'))
const operator = read(resolve(appRoot, 'scripts/public-websites-phase8-release.mjs'))
const workflow = read(resolve(repositoryRoot, '.github/workflows/public-websites-phase8-production-release.yml'))
const organisationId = '11111111-1111-4111-8111-111111111111'
const sourceCommit = 'a'.repeat(40)

for (const [pattern, message] of [
  [/create table public\.website_production_releases/i, 'creates the production allow-list'],
  [/phase7_evidence_fingerprint/i, 'binds production to pilot evidence'],
  [/rollback_deployment_url/i, 'stores the exact rollback deployment'],
  [/dns_snapshot_json/i, 'preserves website DNS recovery evidence'],
  [/website_production_release_events/i, 'records immutable release events'],
  [/security invoker[\s\S]*set search_path = ''/i, 'uses constrained service-invoker commands'],
  [/emailDnsUnchanged[\s\S]*nameserversUnchanged/i, 'requires email and nameserver safety'],
  [/website_activate_production_release/i, 'has an explicit activation command'],
  [/website_rollback_production_release/i, 'has a fail-closed rollback command'],
  [/revoke all on function public\.website_activate_production_release[\s\S]*from public, anon, authenticated/i, 'blocks browser activation'],
]) assert.match(migration, pattern, message)

assert.match(databaseTest, /plan\(24\)/, 'database test has a fixed plan')
assert.match(databaseTest, /release events are immutable/, 'database contract tests immutable audit history')
assert.match(repository, /WEBSITES_RUNTIME_ENV/, 'public serving requires an explicit runtime environment')
assert.match(repository, /website_production_releases/, 'production serving requires an active production release')
assert.match(repository, /target_hostname.*hostname/s, 'production release is bound to the exact hostname')
assert.match(workspaceService, /website_production_releases/, 'Website Studio reads the production release gate')
assert.match(workspace, /PRODUCTION PREPARATION/, 'Website Studio explains the pre-live state')
assert.match(workspace, /PRODUCTION PAUSED/, 'Website Studio explains the fail-closed production state')

assert.match(operator, /Production project reference does not match the pinned release target/, 'operator pins the production project')
assert.match(operator, /evidence fingerprint does not verify/, 'operator verifies Phase 7 integrity')
assert.match(operator, /AUTHORIZE_ONE_AGENCY_WEBSITE_PRODUCTION_RELEASE/, 'operator requires explicit production approval')
assert.doesNotMatch(operator, /vercel\s+(promote|rollback)/, 'database operator does not secretly mutate hosting')

assert.match(workflow, /environment: public-websites-production/, 'production uses a protected environment')
assert.match(workflow, /vercel promote/, 'workflow promotes the reviewed deployment')
assert.match(workflow, /vercel rollback/, 'workflow has an exact deployment rollback')
assert.match(workflow, /--submit-smoke-lead/, 'workflow verifies real CRM routing')
assert.match(workflow, /Fail closed after an unsuccessful activation/, 'failed activation closes the database gate')

const evidenceCore = {
  contract: 'public-websites-phase7-staging-pilot-v1',
  status: 'PASS',
  readyForPhase8: true,
  target: { organisationId },
  manualAcceptance: { sourceCommit },
}
const evidence = { ...evidenceCore, evidenceFingerprint: createHash('sha256').update(JSON.stringify(evidenceCore)).digest('hex') }
assert.equal(validatePhase7Evidence(evidence, organisationId, sourceCommit), evidence.evidenceFingerprint)
assert.throws(() => validatePhase7Evidence({ ...evidence, status: 'BLOCKED' }, organisationId, sourceCommit), /complete PASS/i)
assert.throws(() => validatePhase7Evidence({ ...evidence, evidenceFingerprint: 'b'.repeat(64) }, organisationId, sourceCommit), /does not verify/i)

const approval = {
  contract: 'public-websites-phase8-production-approval-v1',
  organisationId,
  sourceCommit,
  targetHostname: 'www.example-agency.co.za',
  candidateDeploymentUrl: 'https://agency-candidate.vercel.app',
  rollbackDeploymentUrl: 'https://agency-rollback.vercel.app',
  approvedBy: 'Release owner',
  approvedAt: new Date().toISOString(),
  approvalReference: 'release-approval-1',
  confirmation: RELEASE_CONFIRMATION,
}
assert.equal(validateReleaseApproval(approval, { organisationId, sourceCommit }).targetHostname, approval.targetHostname)
assert.throws(() => validateReleaseApproval({ ...approval, targetHostname: 'mail.example-agency.co.za' }, { organisationId, sourceCommit }), /safe client-owned/i)
assert.throws(() => validateReleaseApproval({ ...approval, confirmation: 'yes' }, { organisationId, sourceCommit }), /requires AUTHORIZE/i)

assert.equal(parseReleaseArgs(['--activate']).action, 'activate')
assert.throws(() => parseReleaseArgs(['--activate', '--rollback']), /only one production release mutation/i)
assert.throws(() => assertProductionTarget({ SUPABASE_PRODUCTION_PROJECT_REF: 'wrongref' }), /pinned release target/i)
assert.doesNotThrow(() => assertProductionTarget({
  SUPABASE_PRODUCTION_PROJECT_REF: PRODUCTION_PROJECT_REF,
  SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-key',
}))

console.log('Public websites phase 8 controlled production release checks passed')
