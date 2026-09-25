import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(
  new URL('../src/pages/agency/AgencyLeadWorkspaceRoutePage.jsx', import.meta.url),
  'utf8',
)

assert.match(
  source,
  /import LeadWorkspaceRouteLoadingShell from ['"]\.\.\/\.\.\/components\/leads\/LeadWorkspaceRouteLoadingShell['"]/,
  'The lead workspace route should use the shared stable loading shell.',
)
assert.match(
  source,
  /<Suspense[\s\S]*?fallback=\{<LeadWorkspaceRouteLoadingShell loadStage="workspace_chunk_loading" \/>\}/,
  'The inner lazy boundary should keep the same shell visible while the workspace loads.',
)
assert.doesNotMatch(
  source,
  /AgencyLeadWorkspaceShellPage/,
  'The cached dark lead preview must not flash before the real workspace.',
)

console.log('lead workspace loading shell contract ok')
