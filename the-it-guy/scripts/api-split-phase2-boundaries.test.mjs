import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const requiredDomains = [
  'transactions', 'developments', 'documents', 'onboarding', 'clientPortal',
  'bond', 'attorneys', 'stakeholders', 'partners', 'access',
]
const requiredSharedModules = ['clients.js', 'storage.js', 'errors.js', 'schemaCompatibility.js']

for (const domain of requiredDomains) {
  const path = resolve(appRoot, 'src/domains', domain)
  assert.equal((await stat(path)).isDirectory(), true, `missing domain boundary: ${domain}`)
}
for (const module of requiredSharedModules) {
  await stat(resolve(appRoot, 'src/lib/api/shared', module))
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return filesUnder(path)
    return /\.(?:js|mjs|cjs|jsx|ts|tsx)$/u.test(entry.name) ? [path] : []
  }))
  return nested.flat()
}

for (const path of await filesUnder(resolve(appRoot, 'src/domains'))) {
  const source = await readFile(path, 'utf8')
  assert.doesNotMatch(source, /from\s+['"][^'"]*\/(?:pages|components)\//u, `${path} must not depend on UI modules`)
  assert.doesNotMatch(source, /from\s+['"][^'"]*lib\/api(?:\.js)?['"]/u, `${path} must not depend on the legacy API facade`)
}

console.log('API-split Phase 2 boundary tests passed.')
