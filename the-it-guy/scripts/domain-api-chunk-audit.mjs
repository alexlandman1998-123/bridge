import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distAssetsDir = path.join(appRoot, 'dist/assets')
const enforce = process.argv.includes('--enforce')
const json = process.argv.includes('--json')
const enforcePreloadReferences = process.argv.includes('--enforce-preload-references')
const selectedDomain = readStringArg('--domain', '')
const maxApiGzipKb = readNumberArg('--max-api-gzip-kb', 1)

const DOMAIN_CONFIGS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    roles: ['developer', 'principal'],
    chunkPattern: /^Dashboard-[A-Za-z0-9_-]+\.js$/,
    enforceClean: true,
    maxEntryGzipKb: 95,
    maxStaticScriptGzipKb: 475,
  },
  {
    key: 'client-portal',
    label: 'Client Portal',
    roles: ['client'],
    chunkPattern: /^ClientPortal-[A-Za-z0-9_-]+\.js$/,
    enforceClean: false,
    maxEntryGzipKb: 130,
    maxStaticScriptGzipKb: 625,
  },
  {
    key: 'attorney-transaction-detail',
    label: 'Attorney Transaction Detail',
    roles: ['attorney', 'conveyancer'],
    chunkPattern: /^AttorneyTransactionDetail-[A-Za-z0-9_-]+\.js$/,
    enforceClean: false,
    maxEntryGzipKb: 130,
    maxStaticScriptGzipKb: 675,
  },
  {
    key: 'pipeline',
    label: 'Pipeline',
    roles: ['agent', 'principal'],
    chunkPattern: /^Pipeline-[A-Za-z0-9_-]+\.js$/,
    enforceClean: false,
    maxEntryGzipKb: 140,
    maxStaticScriptGzipKb: 700,
  },
  {
    key: 'agent-listing-detail',
    label: 'Agent Listing Detail',
    roles: ['agent', 'principal'],
    chunkPattern: /^AgentListingDetail-[A-Za-z0-9_-]+\.js$/,
    enforceClean: false,
    maxEntryGzipKb: 140,
    maxStaticScriptGzipKb: 750,
  },
  {
    key: 'unit-detail',
    label: 'Unit Detail',
    roles: ['developer', 'principal', 'agent'],
    chunkPattern: /^UnitDetail-[A-Za-z0-9_-]+\.js$/,
    enforceClean: false,
    maxEntryGzipKb: 140,
    maxStaticScriptGzipKb: 750,
  },
]

async function main() {
  if (!existsSync(distAssetsDir)) {
    throw new Error(`Build assets not found at ${distAssetsDir}. Run npm run build first.`)
  }

  const assets = await readAssets()
  const configs = selectedDomain
    ? DOMAIN_CONFIGS.filter((domain) => domain.key === selectedDomain)
    : DOMAIN_CONFIGS

  if (selectedDomain && !configs.length) {
    throw new Error(`Unknown domain "${selectedDomain}". Known domains: ${DOMAIN_CONFIGS.map((domain) => domain.key).join(', ')}`)
  }

  const reports = configs.map((config) => buildDomainReport(config, assets))
  const report = {
    enforce,
    enforcePreloadReferences,
    maxApiGzipBytes: maxApiGzipKb * 1024,
    domains: reports,
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printReport(report)
  }

  if (enforce) {
    const failingDomains = reports.filter((domain) => {
      if (!selectedDomain && !domain.enforceClean) return false
      return collectBudgetFailures(domain).length > 0
    })

    if (failingDomains.length) {
      throw new Error(
        `Domain API chunk audit failed: ${failingDomains
          .map((domain) => `${domain.key} -> ${collectBudgetFailures(domain).join(', ')}`)
          .join('; ')}`,
      )
    }
  }
}

async function readAssets() {
  const entries = await fs.readdir(distAssetsDir, { withFileTypes: true })
  const assets = new Map()

  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const fullPath = path.join(distAssetsDir, entry.name)
        const buffer = await fs.readFile(fullPath)
        const assetPath = `assets/${entry.name}`
        const source = isScript(entry.name) ? buffer.toString('utf8') : ''
        assets.set(assetPath, {
          path: assetPath,
          name: entry.name,
          rawBytes: buffer.length,
          gzipBytes: gzipSync(buffer).length,
          source,
        })
      }),
  )

  return assets
}

function buildDomainReport(config, assets) {
  const entryChunk = findEntryChunk(assets, config.chunkPattern)
  if (!entryChunk) {
    return {
      key: config.key,
      label: config.label,
      roles: config.roles,
      enforceClean: config.enforceClean,
      missing: true,
      budgetStatus: buildBudgetStatus(config, {
        entryGzipBytes: Number.POSITIVE_INFINITY,
        staticScriptGzipBytes: Number.POSITIVE_INFINITY,
        apiRouteGzipBytes: Number.POSITIVE_INFINITY,
      }),
      entryChunk: null,
      staticDependencyCount: 0,
      staticScriptGzipBytes: 0,
      apiStaticDependencies: [],
      apiPreloadReferences: [],
      apiRouteDependencies: [],
      largestStaticDependencies: [],
    }
  }

  const staticDependencyPaths = collectStaticDependencies(entryChunk.path, assets)
  const staticDependencies = staticDependencyPaths
    .map((assetPath) => assets.get(assetPath))
    .filter(Boolean)
    .sort((left, right) => right.rawBytes - left.rawBytes)
  const apiStaticDependencies = staticDependencies.filter(isApiChunk)
  const preloadReferences = findVitePreloadReferences(entryChunk.source)
  const apiPreloadReferences = preloadReferences.filter((assetPath) => /^assets\/api-[A-Za-z0-9_-]+\.js$/.test(assetPath))
  const apiRouteDependencies = dedupeAssets([
    ...apiStaticDependencies,
    ...(enforcePreloadReferences ? apiPreloadReferences.map((assetPath) => assets.get(assetPath)).filter(Boolean) : []),
  ])
  const staticScriptGzipBytes = staticDependencies
    .filter((asset) => asset.path.endsWith('.js') || asset.path.endsWith('.mjs'))
    .reduce((sum, asset) => sum + asset.gzipBytes, 0)
  const apiRouteGzipBytes = apiRouteDependencies.reduce(
    (largest, asset) => Math.max(largest, asset.gzipBytes),
    0,
  )

  return {
    key: config.key,
    label: config.label,
    roles: config.roles,
    enforceClean: config.enforceClean,
    missing: false,
    budgetStatus: buildBudgetStatus(config, {
      entryGzipBytes: entryChunk.gzipBytes,
      staticScriptGzipBytes,
      apiRouteGzipBytes,
    }),
    entryChunk: summarizeAsset(entryChunk),
    staticDependencyCount: staticDependencies.length,
    staticScriptGzipBytes,
    apiStaticDependencies: apiStaticDependencies.map(summarizeAsset),
    apiPreloadReferences,
    apiRouteDependencies: apiRouteDependencies.map(summarizeAsset),
    largestStaticDependencies: staticDependencies.slice(0, 8).map(summarizeAsset),
  }
}

function findEntryChunk(assets, pattern) {
  return [...assets.values()]
    .filter((asset) => pattern.test(asset.name))
    .sort((left, right) => right.rawBytes - left.rawBytes)[0]
}

function collectStaticDependencies(entryPath, assets) {
  const visited = new Set()
  const stack = [entryPath]

  while (stack.length) {
    const currentPath = stack.pop()
    if (!currentPath || visited.has(currentPath)) continue
    visited.add(currentPath)

    const asset = assets.get(currentPath)
    if (!asset?.source) continue

    for (const importedPath of parseStaticImports(asset.source, currentPath)) {
      if (assets.has(importedPath) && !visited.has(importedPath)) {
        stack.push(importedPath)
      }
    }
  }

  visited.delete(entryPath)
  return [...visited]
}

function parseStaticImports(source, importerPath) {
  const imports = []
  const bareImportPattern = /\bimport\s*["']([^"']+)["']/g
  const importFromPattern = /\bimport[^;]*?\bfrom\s*["']([^"']+)["']/g
  const exportPattern = /\bexport[^;]*?\bfrom\s*["']([^"']+)["']/g

  for (const pattern of [bareImportPattern, importFromPattern, exportPattern]) {
    for (const match of source.matchAll(pattern)) {
      const resolved = resolveRelativeAssetPath(match[1], importerPath)
      if (resolved) imports.push(resolved)
    }
  }

  return imports
}

function findVitePreloadReferences(source) {
  const match = source.match(/m\.f\|\|\(m\.f=\[(.*?)\]\)/s)
  if (!match) return []

  const references = []
  const stringPattern = /"([^"]+)"/g
  for (const item of match[1].matchAll(stringPattern)) {
    references.push(item[1])
  }
  return references
}

function resolveRelativeAssetPath(specifier, importerPath) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null
  const importerDir = path.posix.dirname(importerPath)
  return path.posix.normalize(path.posix.join(importerDir, specifier))
}

function readNumberArg(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  const value = Number(process.argv[index + 1])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function readStringArg(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return String(process.argv[index + 1] || '').trim() || fallback
}

function dedupeAssets(assets) {
  const byPath = new Map()
  for (const asset of assets) {
    byPath.set(asset.path, asset)
  }
  return [...byPath.values()].sort((left, right) => right.rawBytes - left.rawBytes)
}

function buildBudgetStatus(config, values) {
  return {
    entryGzip: summarizeBudget(values.entryGzipBytes, config.maxEntryGzipKb * 1024),
    staticScriptGzip: summarizeBudget(values.staticScriptGzipBytes, config.maxStaticScriptGzipKb * 1024),
    apiRouteGzip: summarizeBudget(values.apiRouteGzipBytes, maxApiGzipKb * 1024),
  }
}

function summarizeBudget(actualBytes, limitBytes) {
  return {
    actualBytes,
    limitBytes,
    pass: actualBytes <= limitBytes,
  }
}

function collectBudgetFailures(domain) {
  const failures = []
  for (const [key, budget] of Object.entries(domain.budgetStatus || {})) {
    if (!budget.pass) {
      failures.push(`${key} ${formatBytes(budget.actualBytes)} exceeds ${formatBytes(budget.limitBytes)}`)
    }
  }
  return failures
}

function isApiChunk(asset) {
  return /^api-[A-Za-z0-9_-]+\.js$/.test(path.basename(asset.path))
}

function isScript(fileName) {
  return fileName.endsWith('.js') || fileName.endsWith('.mjs')
}

function summarizeAsset(asset) {
  return {
    path: asset.path,
    rawBytes: asset.rawBytes,
    gzipBytes: asset.gzipBytes,
  }
}

function printReport(report) {
  console.log('domain API chunk audit')
  console.log(`  enforce mode: ${report.enforce ? 'on' : 'off'}; API gzip limit ${formatBytes(report.maxApiGzipBytes)}`)
  console.log(`  preload references enforced: ${report.enforcePreloadReferences ? 'yes' : 'no'}`)

  for (const domain of report.domains) {
    console.log('')
    console.log(`${domain.label} (${domain.key})${domain.enforceClean ? ' [enforced]' : ' [report-only]'}`)
    console.log(`  roles: ${(domain.roles || []).join(', ') || 'unspecified'}`)

    if (domain.missing) {
      console.log('  entry chunk: missing')
      printBudgetStatus(domain.budgetStatus)
      continue
    }

    console.log(`  entry chunk: ${domain.entryChunk.path}`)
    console.log(`    raw ${formatBytes(domain.entryChunk.rawBytes)}, gzip ${formatBytes(domain.entryChunk.gzipBytes)}`)
    console.log(`  static dependencies: ${domain.staticDependencyCount}`)
    console.log(`  static script dependency gzip: ${formatBytes(domain.staticScriptGzipBytes)}`)
    printBudgetStatus(domain.budgetStatus)

    if (domain.apiStaticDependencies.length) {
      console.log('  API chunks statically imported:')
      for (const asset of domain.apiStaticDependencies) {
        console.log(`    - ${asset.path}: raw ${formatBytes(asset.rawBytes)}, gzip ${formatBytes(asset.gzipBytes)}`)
      }
    } else {
      console.log('  API chunks statically imported: none')
    }

    if (domain.apiPreloadReferences.length) {
      console.log('  API chunks referenced in preload map:')
      for (const assetPath of domain.apiPreloadReferences) {
        console.log(`    - ${assetPath}`)
      }
    }

    if (domain.largestStaticDependencies.length) {
      console.log('  largest static dependencies:')
      for (const asset of domain.largestStaticDependencies.slice(0, 5)) {
        console.log(`    - ${asset.path}: gzip ${formatBytes(asset.gzipBytes)}`)
      }
    }
  }
}

function printBudgetStatus(budgetStatus) {
  console.log('  budgets:')
  for (const [key, budget] of Object.entries(budgetStatus || {})) {
    const marker = budget.pass ? 'pass' : 'fail'
    console.log(`    - ${key}: ${formatBytes(budget.actualBytes)} / ${formatBytes(budget.limitBytes)} ${marker}`)
  }
}

function formatBytes(bytes) {
  if (bytes === Number.POSITIVE_INFINITY) return 'missing'
  if (!Number.isFinite(bytes)) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
