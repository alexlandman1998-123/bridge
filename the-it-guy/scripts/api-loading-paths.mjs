import { readFile, stat, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { dirname, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { parse } from '@babel/parser'
import { build } from 'esbuild'

// Source dependency paths and an isolated read bundle, not browser timings or
// Vite production chunk sizes. Packages are excluded consistently from both runs.
const root = resolve(import.meta.dirname, '..')
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')))
const legacy = 'src/lib/api.js'
const readEntry = args['read-entry'] || 'src/domains/developments/api.js'
const entries = [
  'src/main.jsx', 'src/pages/Dashboard.jsx',
  'src/pages/agency/AgencyLeadListRoutePage.jsx',
  'src/pages/agency/AgencyLeadWorkspaceRoutePage.jsx',
  'src/pages/agency/AgencyPipelinePage.jsx',
  'src/pages/DevelopmentDetail.jsx', 'src/pages/mobile/MobileDevelopmentDetailPage.jsx',
  'src/lib/developmentDetailApi.js',
  'src/pages/Developments.jsx', 'src/pages/mobile/MobileDevelopmentsPage.jsx',
  'src/pages/DeveloperLeadsPage.jsx', 'src/components/mobile-shell/MobileLeadUnitPicker.jsx',
  'src/lib/transactionWorkspaceApi.js', 'src/pages/Documents.jsx',
]
const graph = new Map()
async function resolveSource(specifier, importer) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(importer), specifier)
  for (const candidate of [base, ...['.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx'].map((ext) => base + ext)]) {
    if (!/\.[cm]?[jt]sx?$/.test(candidate)) continue
    if (await stat(candidate).then((s) => s.isFile(), () => false)) return candidate
  }
  return null
}
async function inspect(path) {
  if (graph.has(path)) return
  const source = await readFile(path, 'utf8')
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  const imports = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) {
      imports.push({ specifier: node.source.value, dynamic: false })
    } else if (node.type === 'CallExpression' && node.callee?.type === 'Import' && node.arguments[0]?.type === 'StringLiteral') {
      imports.push({ specifier: node.arguments[0].value, dynamic: true })
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'comments', 'tokens'].includes(key)) continue
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object') visit(value)
    }
  }
  visit(ast.program)
  const edges = []
  graph.set(path, { bytes: Buffer.byteLength(source), edges })
  for (const item of imports) {
    const target = await resolveSource(item.specifier, path)
    if (target) edges.push({ target, dynamic: item.dynamic })
  }
  // Serial parsing bounds memory on the development machine.
  for (const edge of edges) await inspect(edge.target)
}
function pathToLegacy(entry, includeDynamic) {
  const queue = [{ path: entry, steps: [] }], seen = new Set()
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index]
    if (seen.has(item.path)) continue
    seen.add(item.path)
    if (relative(root, item.path) === legacy) return item.steps
    for (const edge of graph.get(item.path)?.edges || []) {
      if (edge.dynamic && !includeDynamic) continue
      queue.push({ path: edge.target, steps: [...item.steps, { from: relative(root, item.path), to: relative(root, edge.target), dynamic: edge.dynamic }] })
    }
  }
  return null
}
const routes = []
for (const entry of entries) {
  const path = resolve(root, entry)
  await inspect(path)
  routes.push({ entry, staticPathToLegacy: pathToLegacy(path, false), anyPathToLegacy: pathToLegacy(path, true) })
}
const probes = args.probes
  ? JSON.parse(await readFile(resolve(root, args.probes), 'utf8'))
  : [{ label: 'developmentDetail', entry: readEntry, exports: ['fetchDevelopmentDetail'] }]
const readBundles = []
for (const probe of probes) {
  assert.ok(probe.exports.length && probe.exports.every((name) => /^[A-Za-z_$][\w$]*$/.test(name)), 'Probe exports must be identifiers.')
  const bundle = await build({
    stdin: { contents: `export { ${probe.exports.join(', ')} } from ${JSON.stringify(resolve(root, probe.entry))}`, resolveDir: root, sourcefile: 'read-probe.js' },
    bundle: true, write: false, metafile: true, minify: true, format: 'esm', platform: 'browser', packages: 'external',
    loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
    define: { 'import.meta.env': '{}' }, logLevel: 'silent',
  })
  const contents = bundle.outputFiles[0].contents
  const includesLegacyApi = Object.keys(bundle.metafile.inputs).some((path) => path.endsWith(legacy))
  if (probe.entry !== legacy) assert.equal(includesLegacyApi, false, `${probe.label} must not bundle the legacy API.`)
  readBundles.push({ ...probe, rawBytes: contents.length, gzipBytes: gzipSync(contents).length, includesLegacyApi, sourceModules: Object.keys(bundle.metafile.inputs).length })
}
const report = {
  measurement: 'source-import-paths-and-isolated-esbuild-read-bundle',
  limitations: 'Source graph includes re-exports before tree shaking; isolated bundle excludes packages and is not Vite output, browser transfer size or a load-time benchmark. Dynamic reachability does not imply execution.',
  routes,
  readBundles,
  ...(args.probes ? {} : { developmentRead: readBundles[0] }),
}
if (args.output) await writeFile(resolve(root, args.output), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
