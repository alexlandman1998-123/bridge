import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertStagingTarget, parsePilotArgs } from './public-websites-phase7-pilot.mjs'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')
const read = (path) => readFileSync(path, 'utf8')

const migration = read(resolve(repositoryRoot, 'supabase/migrations/20260905184642_public_websites_phase7_staging_pilot.sql'))
const databaseTest = read(resolve(repositoryRoot, 'supabase/tests/public_websites_phase7_staging_pilot_rls_test.sql'))
const publicRepository = read(resolve(repositoryRoot, 'apps/websites/lib/site-repository.ts'))
const workspaceService = read(resolve(appRoot, 'src/services/websiteWorkspaceService.js'))
const workspace = read(resolve(appRoot, 'src/components/marketing/WebsiteWorkspace.jsx'))
const pilotRunner = read(resolve(appRoot, 'scripts/public-websites-phase7-pilot.mjs'))
const workflow = read(resolve(repositoryRoot, '.github/workflows/public-websites-phase7-staging-pilot.yml'))
const vercel = JSON.parse(read(resolve(repositoryRoot, 'apps/websites/vercel.json')))

for (const [pattern, message] of [
  [/create table public\.website_pilot_enrolments/i, 'creates the one-agency pilot allow-list'],
  [/website_pilot_enrolments_one_active_idx[\s\S]*where status = 'active'/i, 'allows at most one active pilot agency'],
  [/enable row level security/i, 'enables RLS on the pilot allow-list'],
  [/using \(\(select public\.bridge_is_org_admin\(organisation_id\)\)\)/i, 'limits tenant-visible pilot status to its admins'],
  [/security invoker[\s\S]*set search_path = ''/i, 'uses a constrained invoker command for operator mutations'],
  [/v_hostname like '%\.vercel\.app'[\s\S]*v_hostname like '%\.sites\.propdata\.co\.za'/i, 'allows staging and managed preview hosts only'],
  [/Website creation is limited to the active Phase 7 pilot organisation/i, 'fails closed for website creation'],
  [/Website lead capture is unavailable outside the active Phase 7 pilot/i, 'fails closed for lead capture'],
  [/before insert on public\.website_sites/i, 'gates site creation in the database'],
  [/before insert on public\.website_lead_submissions/i, 'gates CRM lead ingestion in the database'],
  [/revoke all on function public\.website_set_pilot_enrolment[\s\S]*from public, anon, authenticated/i, 'keeps pilot configuration service-only'],
]) assert.match(migration, pattern, message)

assert.match(databaseTest, /plan\(18\)/, 'database contract has a fixed assertion plan')
assert.match(databaseTest, /not has_table_privilege\('authenticated'.*'insert'/, 'database test prevents self-enrolment')
assert.match(databaseTest, /not has_function_privilege\('authenticated'.*website_set_pilot_enrolment/, 'database test blocks browser configuration')
assert.match(databaseTest, /has_function_privilege\('service_role'.*website_set_pilot_enrolment/, 'database test permits the staging operator')

assert.match(publicRepository, /from\('website_pilot_enrolments'\)[\s\S]*\.eq\('status', 'active'\)/, 'public serving requires active pilot enrolment')
assert.match(publicRepository, /if \(!revisionResult\.data \|\| !releaseGateResult\.data\) return null/, 'public serving fails closed')
assert.match(workspaceService, /mode: 'pilot_unavailable'/, 'CRM distinguishes agencies outside the pilot')
assert.match(workspaceService, /mode: 'pilot_paused'/, 'CRM distinguishes paused pilots')
assert.match(workspace, /Website Studio is opening with one agency first/, 'CRM explains the controlled rollout')
assert.match(workspace, /Public serving and new enquiries are paused/, 'CRM explains the fail-closed pause state')

assert.match(pilotRunner, /Refusing to target the production Supabase project/, 'operator refuses production')
assert.match(pilotRunner, /MANAGE_ONE_AGENCY_STAGING_PILOT/, 'operator requires an explicit mutation confirmation')
assert.match(pilotRunner, /public:\$\{path\}/, 'operator performs public route smoke checks')
assert.match(pilotRunner, /spawnSync\('vercel',[\s\S]*'curl',[\s\S]*'--deployment'/, 'operator can pass Vercel Preview protection without making the deployment public')
assert.match(pilotRunner, /VERCEL_TOKEN[\s\S]*VERCEL_ORG_ID[\s\S]*VERCEL_PROJECT_ID/, 'protected smoke checks require explicit scoped Vercel credentials')
assert.match(pilotRunner, /leads:routed-to-crm/, 'operator requires durable CRM lead evidence')
assert.match(pilotRunner, /listings:published-channel/, 'operator requires listing publication evidence')
assert.match(pilotRunner, /publication:rollback-exercised/, 'operator requires a real recovery exercise')
assert.match(pilotRunner, /manual:.*name/, 'operator includes the reviewed cross-device acceptance checks')
assert.match(pilotRunner, /public-websites-phase7-manual-acceptance-v1/, 'operator validates the manual evidence contract')
assert.match(pilotRunner, /different source commit/, 'operator binds reviewed evidence to the deployed source')
assert.match(pilotRunner, /evidenceFingerprint: createHash\('sha256'\)/, 'operator seals the Phase 7 evidence for production approval')
assert.match(pilotRunner, /chmodSync\(outputPath, 0o400\)/, 'operator makes written pilot evidence read-only')
assert.match(pilotRunner, /--require-ready/, 'operator supports a blocking Phase 8 gate')

assert.equal(vercel.framework, 'nextjs', 'public website has an explicit Vercel framework contract')
assert.equal(vercel.installCommand, 'npm ci', 'Vercel uses the lockfile exactly')
assert.match(workflow, /vercel deploy --prebuilt/, 'staging deploys the locally reviewed artifact')
assert.match(workflow, /environment: public-websites-staging/, 'staging secrets are protected by a deployment environment')
assert.match(workflow, /--bind-hostname/, 'the generated Vercel hostname is bound explicitly')
assert.match(workflow, /manual_acceptance_json/, 'the staging workflow accepts reviewed manual evidence')
assert.match(workflow, /--require-ready/, 'CI blocks on incomplete pilot evidence')

assert.deepEqual(parsePilotArgs(['--activate', '--organisation-id', '11111111-1111-4111-8111-111111111111']).status, 'activate')
assert.throws(() => parsePilotArgs(['--activate', '--pause']), /only one pilot status mutation/i)
assert.throws(() => assertStagingTarget({
  SUPABASE_STAGING_PROJECT_REF: 'isdowlnollckzvltkasn',
  SUPABASE_URL: 'https://isdowlnollckzvltkasn.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-key',
}), /Refusing to target the production/i)
assert.doesNotThrow(() => assertStagingTarget({
  SUPABASE_STAGING_PROJECT_REF: 'stagingprojectref',
  SUPABASE_URL: 'https://stagingprojectref.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-key',
}))

console.log('Public websites phase 7 staging pilot checks passed')
