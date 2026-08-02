#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const script = await readFile(new URL('./postgrest-schema-cache-incident.mjs', import.meta.url), 'utf8')
const authContext = await readFile(new URL('../src/context/AuthSessionContext.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

assertIncludes(
  script,
  "notify pgrst, 'reload schema';",
  'PostgREST incident diagnostic reload hook',
)

assertIncludes(
  script,
  'PGRST002_SCHEMA_CACHE_REBUILD_FAILED',
  'PostgREST incident diagnostic PGRST002 classification',
)

assertIncludes(
  script,
  'AbortSignal.timeout(12000)',
  'PostgREST incident diagnostic REST timeout',
)

assertIncludes(
  script,
  'prefer: \'count=exact\'',
  'PostgREST incident diagnostic metadata-only REST probe',
)

assertIncludes(
  script,
  'redact(stdout.trim())',
  'PostgREST incident diagnostic stdout redaction',
)

assertIncludes(
  script,
  'Supabase REST/PostgREST is reachable but cannot rebuild its schema cache',
  'PostgREST incident diagnostic next action',
)

assertIncludes(
  authContext,
  'function isPostgrestSchemaCacheBootstrapError(error)',
  'Auth bootstrap schema-cache classifier',
)

assertIncludes(
  authContext,
  'Arch9’s database API is temporarily rebuilding its schema cache',
  'Auth bootstrap friendly schema-cache message',
)

assert.equal(
  packageJson.scripts?.['diagnose:postgrest-schema-cache'],
  'node --env-file=.env --env-file=.env.staging.local scripts/postgrest-schema-cache-incident.mjs',
)

assert.equal(
  packageJson.scripts?.['test:postgrest-schema-cache-incident'],
  'node scripts/postgrest-schema-cache-incident.test.mjs',
)

console.log('PostgREST schema-cache incident contract passed.')
