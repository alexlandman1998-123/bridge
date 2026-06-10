import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

function excludes(source, marker, message) {
  assert.ok(!source.includes(marker), message || `Expected source not to include ${marker}`)
}

const commercialApi = await read('../src/modules/commercial/services/commercialApi.js')
for (const marker of [
  'export async function activateCommercialWorkspaceForCurrentUser',
  "module_context: 'commercial'",
  "module: 'commercial'",
  "source: 'commercial_access_setup_prompt'",
  'return resolveCommercialAccessContext({ forceRefresh: true })',
]) {
  includes(commercialApi, marker, `Commercial activation should persist and refresh the explicit commercial membership marker: ${marker}`)
}

excludes(
  commercialApi,
  "role: 'commercial_hq_admin'",
  'Commercial activation must not silently rewrite the existing organisation role.',
)
excludes(
  commercialApi,
  "workspace_role: 'commercial_hq_admin'",
  'Commercial activation must not silently rewrite the existing workspace role.',
)

const commercialLayout = await read('../src/modules/commercial/components/CommercialLayout.jsx')
for (const marker of [
  'Set up Commercial workspace',
  'Activate Commercial',
  'activateCommercialWorkspaceForCurrentUser',
  'Back to Residential',
]) {
  includes(commercialLayout, marker, `Commercial no-access state should be actionable without weakening the gate: ${marker}`)
}

console.log('commercial access setup diagnostics passed')
