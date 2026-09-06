import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const sourceRoot = resolve(appRoot, 'src')
const maximumLegacyApiImporters = 59

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return filesUnder(path)
    return /\.(?:js|mjs|cjs|jsx|ts|tsx)$/u.test(entry.name) ? [path] : []
  }))
  return nested.flat()
}

const importers = []
const dashboardFacadeImporters = []
for (const path of await filesUnder(sourceRoot)) {
  const source = await readFile(path, 'utf8')
  const relativePath = path.slice(appRoot.length + 1)
  if (/(?:from\s*|import\s*\()['"][^'"]*\/lib\/api(?:\.js)?['"]/u.test(source)) {
    importers.push(relativePath)
  }
  if (/(?:from\s*|import\s*\()['"][^'"]*\/lib\/api\/dashboardApi(?:\.js)?['"]/u.test(source)) {
    dashboardFacadeImporters.push(relativePath)
  }
}

assert.ok(
  importers.length <= maximumLegacyApiImporters,
  `Legacy lib/api importers increased from the Phase 6 baseline (${maximumLegacyApiImporters}): ${importers.join(', ')}`,
)
assert.deepEqual(
  dashboardFacadeImporters,
  [],
  `New code must import reporting APIs from src/domains/reporting/api.js: ${dashboardFacadeImporters.join(', ')}`,
)

console.log(JSON.stringify({
  version: 'api_split_phase6_retirement_v1',
  legacyApiImporterCount: importers.length,
  maximumLegacyApiImporters,
  dashboardFacadeImporters,
}, null, 2))
