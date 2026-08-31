import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST_ASSETS = path.resolve('dist/assets')
const KIB = 1024
const BUDGETS = Object.freeze({
  entryJavaScriptGzip: 130 * KIB,
  globalCssGzip: 150 * KIB,
  legacyApiGzip: 325 * KIB,
})

function matchingFile(files, pattern, label) {
  const matches = files.filter((file) => pattern.test(file))
  if (matches.length !== 1) {
    throw new Error(`Expected one ${label} asset, found ${matches.length}: ${matches.join(', ') || 'none'}`)
  }
  return matches[0]
}

async function gzipBytes(fileName) {
  return gzipSync(await readFile(path.join(DIST_ASSETS, fileName))).byteLength
}

function staticImports(source = '') {
  const imports = new Set()
  const patterns = [
    /\bfrom\s*["']\.\/([^"']+\.js)["']/g,
    /(?:^|;)import\s*["']\.\/([^"']+\.js)["']/gm,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.add(match[1])
  }
  return [...imports]
}

async function staticDependencyClosure(entryFile) {
  const visited = new Set()
  const pending = [entryFile]
  while (pending.length) {
    const fileName = pending.pop()
    if (!fileName || visited.has(fileName)) continue
    visited.add(fileName)
    const source = await readFile(path.join(DIST_ASSETS, fileName), 'utf8')
    for (const dependency of staticImports(source)) {
      if (!visited.has(dependency)) pending.push(dependency)
    }
  }
  return visited
}

function assertWithinBudget(label, actual, budget) {
  if (actual > budget) {
    throw new Error(`${label} is ${(actual / KIB).toFixed(1)} KiB gzip; budget is ${(budget / KIB).toFixed(1)} KiB.`)
  }
}

const files = await readdir(DIST_ASSETS)
const entryFile = matchingFile(files, /^index-[^.]+\.js$/, 'entry JavaScript')
const cssFile = matchingFile(files, /^index-[^.]+\.css$/, 'global CSS')
const apiFile = matchingFile(files, /^api-[^.]+\.js$/, 'legacy API')
const clientsFile = matchingFile(files, /^Clients-[^.]+\.js$/, 'Clients route')

const [entryGzip, cssGzip, apiGzip, clientsBytes] = await Promise.all([
  gzipBytes(entryFile),
  gzipBytes(cssFile),
  gzipBytes(apiFile),
  stat(path.join(DIST_ASSETS, clientsFile)).then((value) => value.size),
])
const clientDependencies = await staticDependencyClosure(clientsFile)
const legacyApiOnClientsPath = [...clientDependencies].find((file) => /^api-[^.]+\.js$/.test(file))

assertWithinBudget('Entry JavaScript', entryGzip, BUDGETS.entryJavaScriptGzip)
assertWithinBudget('Global CSS', cssGzip, BUDGETS.globalCssGzip)
assertWithinBudget('Legacy API chunk', apiGzip, BUDGETS.legacyApiGzip)
if (legacyApiOnClientsPath) {
  throw new Error(`Clients statically depends on ${legacyApiOnClientsPath}; load legacy mutations only after an explicit action.`)
}

console.log(JSON.stringify({
  status: 'passed',
  entry: { file: entryFile, gzipBytes: entryGzip },
  globalCss: { file: cssFile, gzipBytes: cssGzip },
  legacyApi: { file: apiFile, gzipBytes: apiGzip },
  clients: {
    file: clientsFile,
    bytes: clientsBytes,
    staticDependencyCount: clientDependencies.size,
    legacyApiOnStaticPath: false,
  },
}, null, 2))
