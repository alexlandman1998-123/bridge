import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const [routeSource, shellSource, packageSource] = await Promise.all([
  readFile(resolve(root, 'src/pages/agency/AgencyLeadWorkspaceRoutePage.jsx'), 'utf8'),
  readFile(resolve(root, 'src/components/leads/LeadWorkspaceRouteLoadingShell.jsx'), 'utf8'),
  readFile(resolve(root, 'package.json'), 'utf8'),
])

assert.match(routeSource, /const AgencyPipelinePage = lazy\(loadAgencyLeadWorkspace\)/, 'the 900 KB workspace must remain behind a route-level lazy boundary')
assert.match(routeSource, /fallback=\{<LeadWorkspaceRouteLoadingShell loadStage="workspace_chunk_loading" \/>\}/, 'the detail route must retain the same stable shell while the workspace chunk loads')
assert.doesNotMatch(routeSource, /fallback=\{\(?\s*<LeadsRouteShell/, 'the lead detail route must not fall back to a generic blank skeleton')
assert.match(shellSource, /LeadWorkspaceLoadingShell/, 'the route shell must use the shared workspace-loading surface')
assert.match(shellSource, /recordLeadWorkspaceLoadStage/, 'the route shell must retain loading telemetry')

const shellBuild = await build({
  entryPoints: [resolve(root, 'src/components/leads/LeadWorkspaceRouteLoadingShell.jsx')],
  bundle: true,
  write: false,
  minify: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  external: [
    'react',
    'react/jsx-runtime',
    'react-router-dom',
    'lucide-react',
    '../../pages/agency/LeadWorkspaceLoadingShell',
    '../../services/observability/leadWorkspaceLoadingTrace',
  ],
})
const shellAsset = shellBuild.outputFiles[0]?.contents
assert.ok(shellAsset, 'the lead hydration shell must build independently')
assert.ok(shellAsset.byteLength <= 24_000, `lead route shell exceeded its 24 KB raw budget (${shellAsset.byteLength} bytes)`)
assert.ok(gzipSync(shellAsset).byteLength <= 8_000, 'lead route shell exceeded its 8 KB gzip budget')

const packageJson = JSON.parse(packageSource)
assert.match(packageJson.scripts['verify:buyer-lead-overview'] || '', /test:buyer-lead-overview-phase6$/, 'Phase 6 must be part of the unified release check')

console.log('buyer lead overview Phase 6 route shell and lazy-workspace contracts passed')
