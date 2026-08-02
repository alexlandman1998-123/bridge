import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/lib/documentPacketsApi.js', import.meta.url), 'utf8')
const migration = await readFile(
  new URL('../../supabase/migrations/202608020002_render_freeze_fast_retry.sql', import.meta.url),
  'utf8',
)
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} did not match ${pattern}`)
}

assert.equal(
  packageJson.scripts?.['test:lead-mandate-freeze-fast-retry'],
  'node scripts/lead-mandate-freeze-fast-retry.test.mjs',
)

for (const token of [
  'document_packet_versions_packet_latest_freeze_idx',
  "perform set_config('lock_timeout', '5000', true)",
  'LEGAL_DOCUMENT_RENDER_FREEZE_LOCK_BUSY',
  "'reused', true",
  'lock_not_available',
]) {
  assertIncludes(migration, token, 'Freeze fast retry migration')
}

assertMatches(
  migration,
  /if lower\(coalesce\(v_version\.render_freeze_status, ''\)\) = 'frozen'[\s\S]+v_version\.render_content_fingerprint[\s\S]+return jsonb_build_object/,
  'Freeze RPC should return an existing matching frozen revision instead of mutating again',
)

for (const token of [
  'buildRenderFreezeFromEditableVersion',
  'findEditableMandateSourceVersion',
  'Reusing frozen mandate source',
]) {
  assertIncludes(pageSource, token, 'Agency mandate frozen-source reuse')
}

assertMatches(
  pageSource,
  /const existingRenderFreeze = buildRenderFreezeFromEditableVersion\(renderSourceVersion\)[\s\S]+renderFreeze = existingRenderFreeze[\s\S]+freezeEditableDocumentRevisionForRender/,
  'Agency generate mandate should skip the freeze RPC when the source is already frozen',
)

assertMatches(
  apiSource,
  /error\?\.code === '55P03'[\s\S]+LEGAL_DOCUMENT_RENDER_FREEZE_LOCK_BUSY/,
  'Document packet API should expose freeze lock contention as a retryable app error',
)

console.log('Lead mandate freeze fast retry contract passed.')
