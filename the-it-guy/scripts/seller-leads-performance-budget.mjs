import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const outdir = resolve(root, '.seller-leads-performance-budget')
const budgets = Object.freeze({
  leadList: Object.freeze({ rawBytes: 460_000, gzipBytes: 130_000 }),
  workspaceShell: Object.freeze({ rawBytes: 30_000, gzipBytes: 10_000 }),
})

// The controller is intentionally fetched only after lead intent. Keeping it external here
// lets this gate measure the initial route closures without parsing unrelated deferred code.
const deferWorkspaceController = {
  name: 'defer-seller-leads-workspace-controller',
  setup(buildApi) {
    buildApi.onResolve({ filter: /AgencyPipelinePage$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path),
      external: true,
    }))
  },
}

const result = await build({
  entryPoints: [
    resolve(root, 'src/pages/agency/AgencyLeadListRoutePage.jsx'),
    resolve(root, 'src/pages/agency/AgencyLeadWorkspaceRoutePage.jsx'),
  ],
  bundle: true,
  splitting: true,
  write: false,
  metafile: true,
  minify: true,
  outdir,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  plugins: [deferWorkspaceController],
  define: {
    'import.meta.env.PROD': 'true',
    'import.meta.env.DEV': 'false',
    'import.meta.env.MODE': '"production"',
    'import.meta.env.VITE_SUPABASE_URL': '""',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
  },
  external: ['react', 'react/jsx-runtime', 'react-router-dom'],
})

const outputFiles = new Map(result.outputFiles.map((file) => [file.path, file]))

function normalizeOutputPath(path) {
  if (result.metafile.outputs[path]) return path
  const absolutePath = resolve(root, path)
  return result.metafile.outputs[absolutePath] ? absolutePath : path
}

function getStaticClosure(entryPath) {
  const closure = new Set()
  const visit = (candidatePath) => {
    const outputPath = normalizeOutputPath(candidatePath)
    if (closure.has(outputPath) || !result.metafile.outputs[outputPath]) return
    closure.add(outputPath)
    result.metafile.outputs[outputPath].imports.forEach((item) => {
      if (item.kind === 'import-statement' && !item.external) visit(item.path)
    })
  }
  visit(entryPath)
  return [...closure]
}

function measureEntry(entryFileName, budget) {
  const entry = Object.entries(result.metafile.outputs).find(([, output]) => (
    output.entryPoint?.endsWith(entryFileName)
  ))
  assert.ok(entry, `${entryFileName} should produce a route entry.`)

  const closure = getStaticClosure(entry[0])
  const inputFiles = new Set()
  let rawBytes = 0
  let gzipBytes = 0

  closure.forEach((outputPath) => {
    const output = result.metafile.outputs[outputPath]
    Object.keys(output.inputs).forEach((input) => inputFiles.add(input))
    const file = outputFiles.get(outputPath) || outputFiles.get(resolve(root, outputPath))
    assert.ok(file, `Unable to inspect generated route asset ${outputPath}.`)
    rawBytes += file.contents.byteLength
    gzipBytes += gzipSync(file.contents).byteLength
  })

  assert.equal(
    [...inputFiles].some((input) => input.endsWith('/Pipeline.jsx')),
    false,
    `${entryFileName} must not load the legacy Pipeline controller initially.`,
  )
  assert.equal(
    [...inputFiles].some((input) => input.endsWith('/AgencyPipelinePage.jsx')),
    false,
    `${entryFileName} must keep the agency workspace controller deferred.`,
  )
  assert.ok(rawBytes <= budget.rawBytes, `${entryFileName} initial closure is ${rawBytes} bytes; budget is ${budget.rawBytes}.`)
  assert.ok(gzipBytes <= budget.gzipBytes, `${entryFileName} initial closure is ${gzipBytes} gzip bytes; budget is ${budget.gzipBytes}.`)

  return {
    entry: entryFileName,
    assetCount: closure.length,
    rawBytes,
    rawBudgetBytes: budget.rawBytes,
    gzipBytes,
    gzipBudgetBytes: budget.gzipBytes,
  }
}

const report = {
  status: 'within_budget',
  contract: 'arch9-seller-leads-route-budget-v2',
  routes: [
    measureEntry('AgencyLeadListRoutePage.jsx', budgets.leadList),
    measureEntry('AgencyLeadWorkspaceRoutePage.jsx', budgets.workspaceShell),
  ],
}

console.log(JSON.stringify(report, null, 2))
