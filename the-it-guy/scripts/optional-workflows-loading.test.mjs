import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const routes = {
  Developments: ['AddDevelopmentModal'],
  DevelopmentDetail: [
    'MadisonReservationWorkspace', 'DevelopmentAvailabilityWorkspace',
    'DevelopmentTransactionsWorkspace', 'DevelopmentSnagsWorkspace',
    'DevelopmentMarketingOverview', 'DevelopmentMarketingListings',
    'DevelopmentMarketingEvents', 'DevelopmentMarketingCampaigns',
    'DevelopmentWebsiteAnalytics', 'DevelopmentProductCatalogueModal',
    'DevelopmentStructureSetupModal', 'DevelopmentLeadReservationDialog',
  ],
  DeveloperLeadsPage: ['DeveloperLeadDocuments'],
}
if (process.argv.includes('--audit')) {
  for (const route of ['Dashboard', 'agency/AgencyLeadListRoutePage', 'agency/AgencyLeadWorkspaceRoutePage', 'agency/AgencyPipelinePage', 'Units', 'Documents', 'ClientOnboarding', 'ClientPortal', 'AttorneyTransactionDetail']) routes[route] = []
}
// Match the existing API loading probes: isolate application code, exclude packages,
// and follow emitted static imports rather than counting all asynchronous chunks.
const result = await build({
  absWorkingDir: root,
  entryPoints: Object.keys(routes).map(name => `src/pages/${name}.jsx`),
  bundle: true, splitting: true, format: 'esm', platform: 'browser',
  packages: 'external', jsx: 'automatic', minify: true,
  write: false, metafile: true, outdir: '.optional-workflows-probe',
  loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl' },
  define: { 'import.meta.env.PROD': 'true', 'import.meta.env.DEV': 'false', 'import.meta.env.MODE': '"production"' },
})
const outputs = result.metafile.outputs
const files = new Map(result.outputFiles.map(file => [file.path, file.contents]))
const reportOnly = process.argv.includes('--report-only')
const report = { measurement: 'isolated application code; packages external; static JavaScript closure; not browser timings', routes: [] }
for (const [name, deferred] of Object.entries(routes)) {
  const entry = Object.entries(outputs).find(([, output]) => output.entryPoint === `src/pages/${name}.jsx`)
  assert.ok(entry, `${name} must emit a route entry`)
  const closure = new Set()
  function visit(path) {
    if (closure.has(path)) return
    closure.add(path)
    for (const item of outputs[path].imports) {
      if (!item.external && item.kind !== 'dynamic-import') visit(item.path)
    }
  }
  visit(entry[0])
  const initialInputs = new Set([...closure].flatMap(path => Object.keys(outputs[path].inputs)))
  const optional = deferred.map(component => {
    const input = Object.keys(result.metafile.inputs).find(path => path.endsWith(`/${component}.jsx`))
    assert.ok(input, `${component} must remain reachable`)
    const initiallyLoaded = initialInputs.has(input)
    if (!reportOnly) assert.equal(initiallyLoaded, false, `${name} must defer ${component} until opened`)
    return { component, initiallyLoaded }
  })
  report.routes.push({
    route: name,
    rawBytes: [...closure].reduce((sum, path) => sum + files.get(resolve(root, path)).byteLength, 0),
    gzipBytes: [...closure].reduce((sum, path) => sum + gzipSync(files.get(resolve(root, path))).byteLength, 0),
    initialModules: initialInputs.size,
    legacyApiInitiallyLoaded: initialInputs.has('src/lib/api.js'),
    largestInputs: [...initialInputs].map(input => ({ input, compiledBytes: [...closure].reduce((sum, path) => sum + (outputs[path].inputs[input]?.bytesInOutput || 0), 0) })).sort((a, b) => b.compiledBytes - a.compiledBytes).slice(0, 8),
    optional,
  })
}
const json = JSON.stringify(report, null, 2)
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length)
if (output) await writeFile(resolve(output), `${json}\n`)
console.log(json)
