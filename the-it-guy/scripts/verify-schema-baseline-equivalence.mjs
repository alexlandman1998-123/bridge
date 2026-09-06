#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const strict = process.argv.includes('--strict')
const sql = `select json_build_object(
  'relations', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')),
  'functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'policies', (select count(*) from pg_policies where schemaname='public'),
  'triggers', (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
  'indexes', (select count(*) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'extensions', (select json_agg(extname order by extname) from pg_extension where extname in ('btree_gist','pg_net','pg_cron','pgcrypto','uuid-ossp'))
) as snapshot;`

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.status !== 0) throw new Error(result.stderr.trim() || `${command} failed`)
  return result.stdout.trim()
}

function parseProduction(output) {
  const data = JSON.parse(output.slice(output.indexOf('{')))
  return data.rows[0].snapshot
}

const production = parseProduction(run('supabase', ['db', 'query', '--linked', '--output-format', 'json', sql]))
const password = run('security', ['find-generic-password', '-a', process.env.USER || '', '-s', 'Arch9 Schema Baseline Rehearsal Supabase DB', '-w'])
const rehearsalRaw = run('/opt/homebrew/opt/libpq/bin/psql', [
  '--host', 'aws-1-eu-west-1.pooler.supabase.com', '--port', '5432',
  '--username', 'postgres.rlavzicedrilmpaamviu', '--dbname', 'postgres', '--no-password',
  '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', sql,
], { env: { ...process.env, PGPASSWORD: password } })
const rehearsal = JSON.parse(rehearsalRaw)
const differences = Object.keys(production).filter((key) => JSON.stringify(production[key]) !== JSON.stringify(rehearsal[key]))
const report = { version: 1, production, rehearsal, equivalent: differences.length === 0, differences }
console.log(JSON.stringify(report, null, 2))
if (strict && !report.equivalent) process.exitCode = 1
