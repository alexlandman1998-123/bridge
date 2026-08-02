import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/202608020003_prefer_signable_document_packet_status.sql', import.meta.url),
  'utf8',
)
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

assert.equal(
  packageJson.scripts?.['test:lead-mandate-status-prefers-signable-packet'],
  'node scripts/lead-mandate-status-prefers-signable-packet.test.mjs',
)

for (const token of [
  'document_packet_versions_signable_generated_idx',
  'bridge_get_document_workspace_status_p2',
  'exists (',
  "lower(coalesce(generated_version.render_status, '')) = 'generated'",
  'generated_version.rendered_document_id is not null',
  "lower(coalesce(generated_version.rendered_media_type, '')) = 'application/pdf'",
  'coalesce(generated_version.transaction_pdf_persisted, false)',
  "when lower(coalesce(packet_row.status, '')) = 'draft' then 5",
]) {
  assertIncludes(migration, token, 'Signable-packet status migration')
}

console.log('Lead mandate status prefers signable packet contract passed.')
