import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(
  new URL('../src/pages/agency/AgencyLeadWorkspaceRoutePage.jsx', import.meta.url),
  'utf8',
)

assert.match(
  source,
  /import LeadWorkspaceHydrationShell from ['"]\.\/LeadWorkspaceHydrationShell['"]/,
  'The lead workspace route should use the lightweight cached lead shell.',
)
assert.match(
  source,
  /<Suspense[\s\S]*?fallback=\{<LeadWorkspaceHydrationShell search=\{location\.search\} \/>\}/,
  'The inner lazy boundary should keep the cached lead identity visible.',
)
assert.doesNotMatch(
  source,
  /AgencyLeadWorkspaceShellPage/,
  'The cached dark lead preview must not flash before the real workspace.',
)

console.log('lead workspace loading shell contract ok')
