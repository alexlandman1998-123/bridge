import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distAssetsDir = path.join(appRoot, 'dist/assets')
const enforce = process.argv.includes('--enforce')
const json = process.argv.includes('--json')
const maxApiGzipKb = readNumberArg('--max-api-gzip-kb', 400)

async function main() {
  if (!existsSync(distAssetsDir)) {
    throw new Error(`Build assets not found at ${distAssetsDir}. Run npm run build first.`)
  }

  const assets = await readAssets()
  const dashboardChunk = findDashboardChunk(assets)
  if (!dashboardChunk) {
    throw new Error('Dashboard route chunk was not found in dist/assets.')
  }

  const staticDependencyPaths = await collectStaticDependencies(dashboardChunk.path, assets)
  const staticDependencies = staticDependencyPaths
    .map((assetPath) => assets.get(assetPath))
    .filter(Boolean)
    .sort((left, right) => right.rawBytes - left.rawBytes)
  const apiStaticDependencies = staticDependencies.filter((asset) => /^api-[A-Za-z0-9_-]+\.js$/.test(path.basename(asset.path)))
  const dashboardPreloadReferences = findVitePreloadReferences(dashboardChunk.source)
  const apiPreloadReferences = dashboardPreloadReferences.filter((assetPath) =>
    /^assets\/api-[A-Za-z0-9_-]+\.js$/.test(assetPath),
  )
  const apiRouteDependencies = dedupeAssets([
    ...apiStaticDependencies,
    ...apiPreloadReferences.map((assetPath) => assets.get(assetPath)).filter(Boolean),
  ])

  const report = {
    enforce,
    maxApiGzipBytes: maxApiGzipKb * 1024,
    dashboardChunk: summarizeAsset(dashboardChunk),
    dashboardStaticDependencyCount: staticDependencies.length,
    dashboardStaticScriptGzipBytes: staticDependencies
      .filter((asset) => asset.path.endsWith('.js') || asset.path.endsWith('.mjs'))
      .reduce((sum, asset) => sum + asset.gzipBytes, 0),
    apiStaticDependencies: apiStaticDependencies.map(summarizeAsset),
    apiRouteDependencies: apiRouteDependencies.map(summarizeAsset),
    apiPreloadReferences,
    largestStaticDependencies: staticDependencies.slice(0, 12).map(summarizeAsset),
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printReport(report)
  }

  if (enforce) {
    const oversizedApiDependencies = apiRouteDependencies.filter((asset) => asset.gzipBytes > report.maxApiGzipBytes)
    if (oversizedApiDependencies.length) {
      throw new Error(
        `Dashboard depends on oversized API chunk(s): ${oversizedApiDependencies
          .map((asset) => `${asset.path} (${formatBytes(asset.gzipBytes)} gzip)`)
          .join(', ')}. Limit is ${formatBytes(report.maxApiGzipBytes)} gzip.`,
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

function findDashboardChunk(assets) {
  return [...assets.values()]
    .filter((asset) => /^Dashboard-[A-Za-z0-9_-]+\.js$/.test(asset.name))
    .sort((left, right) => right.rawBytes - left.rawBytes)[0]
}

async function collectStaticDependencies(entryPath, assets) {
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

function dedupeAssets(assets) {
  const byPath = new Map()
  for (const asset of assets) {
    byPath.set(asset.path, asset)
  }
  return [...byPath.values()].sort((left, right) => right.rawBytes - left.rawBytes)
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
  console.log('dashboard API chunk audit')
  console.log(`  dashboard chunk: ${report.dashboardChunk.path}`)
  console.log(
    `    raw ${formatBytes(report.dashboardChunk.rawBytes)}, gzip ${formatBytes(report.dashboardChunk.gzipBytes)}`,
  )
  console.log(`  static dependencies: ${report.dashboardStaticDependencyCount}`)
  console.log(`  static script dependency gzip: ${formatBytes(report.dashboardStaticScriptGzipBytes)}`)

  if (report.apiStaticDependencies.length) {
    console.log('  API chunks statically imported by dashboard:')
    for (const asset of report.apiStaticDependencies) {
      console.log(`    - ${asset.path}: raw ${formatBytes(asset.rawBytes)}, gzip ${formatBytes(asset.gzipBytes)}`)
    }
  } else {
    console.log('  API chunks statically imported by dashboard: none')
  }

  if (report.apiPreloadReferences.length) {
    console.log('  API chunks referenced in dashboard preload map:')
    for (const assetPath of report.apiPreloadReferences) {
      console.log(`    - ${assetPath}`)
    }
  }

  if (report.apiRouteDependencies.length) {
    console.log('  API route dependencies considered for enforcement:')
    for (const asset of report.apiRouteDependencies) {
      console.log(`    - ${asset.path}: raw ${formatBytes(asset.rawBytes)}, gzip ${formatBytes(asset.gzipBytes)}`)
    }
  }

  console.log(`  enforce mode: ${report.enforce ? 'on' : 'off'}; API gzip limit ${formatBytes(report.maxApiGzipBytes)}`)
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
