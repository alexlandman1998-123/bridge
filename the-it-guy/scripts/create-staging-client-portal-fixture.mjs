import { spawnSync } from 'node:child_process'

function hasArg(name) {
  return process.argv.includes(name)
}

function getArgValue(name) {
  const prefix = `${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  return arg ? arg.slice(prefix.length).trim() : ''
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

function runLinkedQuery(sql) {
  const result = spawnSync('npx', ['supabase', 'db', 'query', '--linked', sql], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Supabase linked query failed.')
  }

  return `${result.stdout || ''}${result.stderr || ''}`.trim()
}

const write = hasArg('--write')
const confirmed = hasArg('--confirm-staging') && process.env.CANONICAL_STAGING_CLIENT_PORTAL_FIXTURE_WRITE === 'true'
const transactionId = getArgValue('--transaction-id')

if (write && !confirmed) {
  throw new Error('Write mode requires --confirm-staging and CANONICAL_STAGING_CLIENT_PORTAL_FIXTURE_WRITE=true.')
}

const dryRunSql = `
with candidate as (
  select
    t.id as transaction_id,
    t.development_id,
    t.unit_id,
    t.buyer_id,
    t.finance_type,
    t.stage,
    count(dri.id) as canonical_requirement_count
  from public.transactions t
  join public.document_requirement_instances dri on dri.transaction_id = t.id
  left join public.development_settings ds on ds.development_id = t.development_id
  where t.development_id is not null
    and t.unit_id is not null
    and coalesce(ds.client_portal_enabled, true) is true
    ${transactionId ? `and t.id = '${transactionId}'::uuid` : ''}
  group by t.id
  order by count(dri.id) desc, max(dri.created_at) desc nulls last
  limit 1
)
select jsonb_build_object(
  'mode', 'dry_run',
  'wouldMutate', false,
  'candidate', coalesce((select to_jsonb(candidate) from candidate), null),
  'existingActiveLinks', coalesce((
    select count(*)
    from public.client_portal_links cpl
    join candidate c on c.transaction_id = cpl.transaction_id
    where cpl.is_active is true
  ), 0),
  'writeCommand', 'CANONICAL_STAGING_CLIENT_PORTAL_FIXTURE_WRITE=true npm run fixture:client-portal:staging -- --write --confirm-staging'
) as fixture_plan;
`

const writeSql = `
select public.bridge_create_staging_client_portal_fixture(
  'confirm_staging_browser_verification_fixture',
  ${transactionId ? `'${transactionId}'::uuid` : 'null::uuid'}
) as fixture;
`

const output = runLinkedQuery(write ? writeSql : dryRunSql)

console.log(safeJson({
  mode: write ? 'write' : 'dry_run',
  rolloutModeChanged: false,
  canonicalPrimaryEnabled: false,
  canonicalOnlyEnabled: false,
  hardWorkflowBlocksEnabled: false,
  externalRemindersEnabled: false,
  output,
}))
