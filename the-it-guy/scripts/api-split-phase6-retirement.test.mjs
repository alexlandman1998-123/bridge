import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@babel/parser'

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const retiredApi = resolve(appRoot, 'src/lib/api.js')
const dashboardFacade = resolve(appRoot, 'src/lib/api/dashboardApi.js')
async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : /\.(?:js|mjs|cjs|jsx|ts|tsx)$/u.test(entry.name) ? [path] : []
  }))
  return nested.flat()
}

const importers = []
const dashboardFacadeImporters = []
for (const path of await filesUnder(resolve(appRoot, 'src'))) {
  const source = await readFile(path, 'utf8')
  if (!path.includes('/__tests__/') && !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path)) {
    assert.doesNotMatch(source, /(?:from\s*|import\s*\()['"][^'"]*scripts\/helpers\/domainApi/u, `${path} must not load the test-only aggregate capability helpers`)
  }
  for (const match of source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)['"`]([^'"`]+)['"`]/gu)) {
    if (!match[1].startsWith('.')) continue
    const target = resolve(dirname(path), match[1]).replace(/\.js$/u, '')
    if (target === retiredApi.slice(0, -3)) importers.push(path.slice(appRoot.length + 1))
    if (target === dashboardFacade.slice(0, -3)) dashboardFacadeImporters.push(path.slice(appRoot.length + 1))
  }
}
assert.deepEqual(importers, [], `Retired API imports must stay at zero: ${importers.join(', ')}`)
assert.deepEqual(dashboardFacadeImporters, [], 'Import reporting operations from their owning domain.')
assert.equal(existsSync(retiredApi), false, 'The old runtime API entry point must remain retired.')

const contract = JSON.parse(await readFile(resolve(appRoot, 'src/lib/api/__tests__/fixtures/domain-api-contract.json'), 'utf8'))
const modules = [...new Set(contract.declarations.map(item => item.module))]
const edges = new Map()
for (const module of modules) {
  const source = await readFile(resolve(appRoot, module), 'utf8')
  assert.ok(source.split('\n').length <= 4000, `${module} exceeds the reviewed module size budget`)
  const imports = parse(source, { sourceType: 'module' }).program.body.filter(node => node.type === 'ImportDeclaration' && node.source.value.startsWith('.'))
  edges.set(module, imports.map(node => resolve(dirname(resolve(appRoot, module)), node.source.value).slice(appRoot.length + 1)).filter(item => modules.includes(item)))
}
const done = new Set(), visiting = new Set()
function visit(module) {
  assert.equal(visiting.has(module), false, `Final extraction introduced a module cycle at ${module}`)
  if (done.has(module)) return
  visiting.add(module)
  for (const dependency of edges.get(module)) visit(dependency)
  visiting.delete(module)
  done.add(module)
}
modules.forEach(visit)
console.log(JSON.stringify({ version: 'api_retirement_v2', legacyApiImporterCount: 0, maximumLegacyApiImporters: 0, retiredEntryPointExists: false, publicCapabilities: Object.keys(contract.exports).length, extractedModules: modules.length, moduleCycles: 0, dashboardFacadeImporters }, null, 2))
