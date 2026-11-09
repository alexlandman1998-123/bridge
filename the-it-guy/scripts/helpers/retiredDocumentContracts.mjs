// Local-only endpoint contract. No Deno server or hosted function is started.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { retiredDocumentGenerator } from '../../../supabase/functions/_shared/retiredDocumentGenerator.ts'

export async function assertRetiredDocumentEndpoint(name) {
  const entry = readFileSync(new URL(`../../../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8')
  assert.match(entry, /import \{ retiredDocumentGenerator \} from ['"]\.\.\/_shared\/retiredDocumentGenerator\.ts['"]/)
  assert.match(entry, /Deno\.serve\((?:withApiCredentials\()?retiredDocumentGenerator\)?\)/)
  assert.equal((entry.match(/import /g) || []).length, entry.includes('withApiCredentials') ? 2 : 1, 'No renderer, storage or database dependency may be reachable')
  assert.doesNotMatch(entry, /\b(?:createClient|fetch)\s*\(|\.storage\b|\.from\s*\(|\bimport\s*\(/)
  const config = readFileSync(new URL('../../../supabase/config.toml', import.meta.url), 'utf8')
  assert.match(config, new RegExp(`\\[functions\\.${name}\\]\\s+enabled = false`))
  for (const method of ['GET', 'POST']) {
    const response = retiredDocumentGenerator(new Request(`https://example.test/${name}`, { method }))
    assert.equal(response.status, 410)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    const body = await response.json()
    assert.equal(body.errorCode, 'document_generator_retired')
    assert.equal(body.retryable, false)
  }
  assert.equal(retiredDocumentGenerator(new Request('https://example.test', { method: 'OPTIONS' })).status, 204)
}
