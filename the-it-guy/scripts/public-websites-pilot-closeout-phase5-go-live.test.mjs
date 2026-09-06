import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GO_LIVE_CONFIRMATION,
  PRODUCTION_PROJECT_REF,
  assertProductionTarget,
  parseGoLiveArgs,
  validateGoLiveApproval,
  validatePhase4Evidence,
} from './public-websites-pilot-closeout-phase5-go-live.mjs'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')
const read = (path) => readFileSync(path, 'utf8')
const migration = read(resolve(repositoryRoot, 'supabase/migrations/20260906123000_public_websites_pilot_closeout_phase5_go_live.sql'))
const databaseTest = read(resolve(repositoryRoot, 'supabase/tests/public_websites_pilot_closeout_phase5_go_live_test.sql'))
const operator = read(resolve(appRoot, 'scripts/public-websites-pilot-closeout-phase5-go-live.mjs'))
const layout = read(resolve(repositoryRoot, 'apps/websites/app/layout.tsx'))
const workflow = read(resolve(repositoryRoot, '.github/workflows/public-websites-pilot-closeout-phase5-go-live.yml'))
const organisationId = '11111111-1111-4111-8111-111111111111'
const approval = {
  contract: 'public-websites-pilot-closeout-phase5-go-live-approval-v1',
  organisationId,
  targetHostname: 'www.kingstons.co.za',
  sourceCommit: 'a'.repeat(40),
  candidateDeploymentUrl: 'https://kingstons-candidate.vercel.app',
  rollbackDeploymentUrl: 'https://kingstons-rollback.vercel.app',
  phase4EvidenceFingerprint: 'b'.repeat(64),
  clientApproved: true,
  clientApproverName: 'Kingstons approver',
  clientApproverRole: 'Director',
  approvedAt: new Date().toISOString(),
  approvalReference: 'Kingstons go-live approval',
  emailDnsChangesAllowed: false,
  nameserverChangesAllowed: false,
  confirmation: GO_LIVE_CONFIRMATION,
}

for (const [pattern, message] of [
  [/origin_dark_launch_id/i, 'binds the release to the production dark launch'],
  [/client_approval_json/i, 'stores immutable client approval evidence'],
  [/website_approve_dark_launch_go_live/i, 'provides a service-only go-live approval transition'],
  [/clientApproved":true[\s\S]*emailDnsChangesAllowed":false[\s\S]*nameserverChangesAllowed":false/i, 'requires safe client approval'],
  [/launch\.status = 'active'/i, 'requires the active dark launch'],
  [/v_rollback <> v_launch\.candidate_deployment_url/i, 'uses the active dark launch as the rollback target'],
  [/revision\.content_fingerprint = v_launch\.production_content_fingerprint/i, 'binds the reviewed production content'],
  [/domainLinked', false[\s\S]*dnsChanged', false/i, 'does not link or change DNS during approval'],
  [/Recorded client go-live approval evidence is immutable/i, 'makes recorded client approval immutable'],
  [/clientApprovalFingerprint/i, 'fingerprints client approval in the immutable event ledger'],
  [/revoke all on function public\.website_approve_dark_launch_go_live[\s\S]*public, anon, authenticated/i, 'blocks browser callers'],
]) assert.match(migration, pattern, message)

assert.match(operator, /resolveMx[\s\S]*resolveNs[\s\S]*resolveTxt/, 'captures mail, nameserver and TXT baselines')
assert.match(databaseTest, /plan\(11\)/, 'database contract has a fixed plan')
assert.match(operator, /BLOCKED_PRE_LINK/, 'reports the intentional pre-link state')
assert.doesNotMatch(operator, /vercel\s+domains\s+add|vercel\s+promote/i, 'operator cannot attach or promote a domain')
assert.match(layout, /@vercel\/analytics\/next[\s\S]*<Analytics\s*\/?>/, 'public runtime includes analytics')
assert.match(workflow, /options: \[preflight, approve\]/, 'workflow exposes only pre-link operations')
assert.doesNotMatch(workflow, /vercel\s+(?:domains|promote|rollback)|dns\s+(?:add|rm)|supabase\s+functions\s+deploy/i, 'workflow cannot mutate hosting, DNS or email delivery')

const validated = validateGoLiveApproval(approval)
assert.equal(validated.targetHostname, 'www.kingstons.co.za')
assert.throws(() => validateGoLiveApproval({ ...approval, clientApproved: false }), /Named client approval/i)
assert.throws(() => validateGoLiveApproval({ ...approval, emailDnsChangesAllowed: true }), /may not authorise email DNS/i)
assert.throws(() => validateGoLiveApproval({ ...approval, targetHostname: 'mail.kingstons.co.za' }), /safe client-owned/i)
assert.throws(() => validateGoLiveApproval({ ...approval, confirmation: 'yes' }), /requires AUTHORIZE/i)

const evidenceCore = {
  contract: 'public-websites-pilot-closeout-phase4-evidence-v1',
  status: 'ACTIVE', active: true, target: { organisationId },
}
const evidenceFingerprint = createHash('sha256').update(JSON.stringify(evidenceCore)).digest('hex')
const evidence = { ...evidenceCore, evidenceFingerprint }
assert.equal(validatePhase4Evidence(evidence, { ...approval, phase4EvidenceFingerprint: evidenceFingerprint }), evidenceFingerprint)
assert.throws(() => validatePhase4Evidence({ ...evidence, status: 'BLOCKED' }, approval), /active Phase 4/i)
assert.equal(parseGoLiveArgs(['--preflight']).action, 'preflight')
assert.throws(() => parseGoLiveArgs(['--preflight', '--approve']), /only one/i)
assert.doesNotThrow(() => assertProductionTarget({
  SUPABASE_PRODUCTION_PROJECT_REF: PRODUCTION_PROJECT_REF,
  SUPABASE_PRODUCTION_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
  SUPABASE_PRODUCTION_SERVICE_ROLE_KEY: 'not-a-real-key',
}))

console.log('Public websites pilot closeout Phase 5 go-live checks passed')
