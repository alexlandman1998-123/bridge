import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baselinePath = path.join(appRoot, 'docs/performance-baseline.json')
const distDir = path.join(appRoot, 'dist')
const indexPath = path.join(distDir, 'index.html')
const heavyFirstLoadPattern = /vendor-(jspdf|pdf|fflate|canvg|html2canvas)|html2pdf|xlsx|pdf\.worker/i

const budgets = [
  {
    id: 'total gzip',
    value: (summary) => summary.totals.all.gzipBytes,
    relativeTolerance: 0.05,
    absoluteTolerance: 256 * 1024,
  },
  {
    id: 'script gzip',
    value: (summary) => summary.totals.script.gzipBytes,
    relativeTolerance: 0.05,
    absoluteTolerance: 192 * 1024,
  },
  {
    id: 'style gzip',
    value: (summary) => summary.totals.style.gzipBytes,
    relativeTolerance: 0.08,
    absoluteTolerance: 24 * 1024,
  },
  {
    id: 'image gzip',
    value: (summary) => summary.totals.image.gzipBytes,
    relativeTolerance: 0.05,
    absoluteTolerance: 64 * 1024,
  },
  {
    id: 'initial gzip',
    value: (summary) => summary.initialTotals.all.gzipBytes,
    relativeTolerance: 0.03,
    absoluteTolerance: 32 * 1024,
  },
  {
    id: 'initial script gzip',
    value: (summary) => summary.initialTotals.script.gzipBytes,
    relativeTolerance: 0.03,
    absoluteTolerance: 32 * 1024,
  },
  {
    id: 'initial style gzip',
    value: (summary) => summary.initialTotals.style.gzipBytes,
    relativeTolerance: 0.05,
    absoluteTolerance: 16 * 1024,
  },
  {
    id: 'entry script gzip',
    value: (summary) => entryScript(summary)?.gzipBytes ?? 0,
    relativeTolerance: 0.03,
    absoluteTolerance: 32 * 1024,
  },
  {
    id: 'largest script gzip',
    value: (summary) => largestAsset(summary, 'script')?.gzipBytes ?? 0,
    relativeTolerance: 0.05,
    absoluteTolerance: 64 * 1024,
  },
]

async function main() {
  if (!existsSync(baselinePath)) {
    throw new Error(`Performance baseline not found at ${baselinePath}. Run "npm run baseline:performance" first.`)
  }

  if (!existsSync(indexPath)) {
    throw new Error(`Build output not found at ${indexPath}. Run "npm run build" before "npm run test:performance-budget".`)
  }

  const [baseline, current] = await Promise.all([readBaseline(), analyzeDist()])
  const failures = [
    ...compareBudgets(baseline.summary, current),
    ...compareFirstLoadHeavyAssets(baseline.summary, current),
    ...compareEntryPresence(baseline.summary, current),
  ]

  if (failures.length) {
    console.error('performance budget failed')
    for (const failure of failures) {
      console.error(`  - ${failure}`)
    }
    console.error('Refresh the baseline only after confirming the change intentionally improves or preserves real load performance.')
    process.exitCode = 1
    return
  }

  console.log('performance budgets passed')
  printMetric('total gzip', baseline.summary.totals.all.gzipBytes, current.totals.all.gzipBytes)
  printMetric('initial gzip', baseline.summary.initialTotals.all.gzipBytes, current.initialTotals.all.gzipBytes)
  printMetric('entry script gzip', entryScript(baseline.summary)?.gzipBytes ?? 0, entryScript(current)?.gzipBytes ?? 0)
}

async function readBaseline() {
  const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'))

  if (!baseline?.summary?.totals || !baseline?.summary?.initialTotals) {
    throw new Error(`Performance baseline at ${baselinePath} is missing summary totals.`)
  }

  return baseline
}

async function analyzeDist() {
  const [assets, indexHtml] = await Promise.all([readBuildAssets(distDir), fs.readFile(indexPath, 'utf8')])
  const initialAssets = parseInitialAssets(indexHtml)
  return summarizeAssets(assets, initialAssets, 20)
}

async function readBuildAssets(rootDir) {
  const files = []

  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await visit(fullPath)
      } else if (entry.isFile()) {
        files.push(fullPath)
      }
    }
  }

  await visit(rootDir)

  const assets = await Promise.all(
    files.map(async (fullPath) => {
      const buffer = await fs.readFile(fullPath)
      const relativePath = path.relative(rootDir, fullPath).split(path.sep).join('/')

      return {
        path: relativePath,
        stablePath: stableAssetPath(relativePath),
        kind: assetKind(relativePath),
        rawBytes: buffer.length,
        gzipBytes: gzipSync(buffer).length,
      }
    }),
  )

  return assets.sort((left, right) => left.path.localeCompare(right.path))
}

function assetKind(assetPath) {
  const ext = path.extname(assetPath).toLowerCase()

  if (ext === '.js' || ext === '.mjs') return 'script'
  if (ext === '.css') return 'style'
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico'].includes(ext)) return 'image'
  if (['.woff', '.woff2', '.ttf', '.otf'].includes(ext)) return 'font'
  if (ext === '.html') return 'html'
  if (ext === '.json') return 'json'
  return 'other'
}

function stableAssetPath(assetPath) {
  const parsed = path.posix.parse(assetPath)
  const stableName = parsed.name.replace(/-[A-Za-z0-9_-]{8,}$/, '')
  return path.posix.join(parsed.dir, `${stableName}${parsed.ext}`)
}

function parseInitialAssets(indexHtml) {
  const initial = []
  const linkPattern = /<link\b[^>]*\b(rel=["']([^"']+)["'])[^>]*>/gi
  const scriptPattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi

  for (const match of indexHtml.matchAll(linkPattern)) {
    const tag = match[0]
    const rel = match[2]
    const href = readAttribute(tag, 'href')

    if (!href) continue
    if (!['stylesheet', 'modulepreload', 'preload'].includes(rel)) continue

    const assetPath = localAssetPath(href)
    if (assetPath) {
      initial.push({ relation: rel, path: assetPath })
    }
  }

  for (const match of indexHtml.matchAll(scriptPattern)) {
    const assetPath = localAssetPath(match[1])
    if (assetPath) {
      initial.push({ relation: 'script', path: assetPath })
    }
  }

  return dedupeByPath(initial)
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))
  return match?.[1]
}

function localAssetPath(assetUrl) {
  if (/^https?:\/\//i.test(assetUrl) || assetUrl.startsWith('//')) {
    return null
  }

  const clean = assetUrl.split('#')[0].split('?')[0]
  const withoutLeadingDot = clean.startsWith('./') ? clean.slice(2) : clean
  const withoutLeadingSlash = withoutLeadingDot.replace(/^\/+/, '')

  if (!withoutLeadingSlash) {
    return null
  }

  return path.posix.normalize(decodeURIComponent(withoutLeadingSlash))
}

function dedupeByPath(items) {
  const seen = new Set()
  const deduped = []

  for (const item of items) {
    const key = `${item.relation}:${item.path}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }

  return deduped
}

function summarizeAssets(assets, initialAssets, topCount) {
  const totals = totalByKind(assets)
  const assetByPath = new Map(assets.map((asset) => [asset.path, asset]))
  const initial = initialAssets.map((entry) => {
    const asset = assetByPath.get(entry.path)

    return {
      ...entry,
      stablePath: stableAssetPath(entry.path),
      kind: asset?.kind ?? assetKind(entry.path),
      rawBytes: asset?.rawBytes ?? 0,
      gzipBytes: asset?.gzipBytes ?? 0,
      found: Boolean(asset),
      flaggedHeavy: heavyFirstLoadPattern.test(entry.path),
    }
  })

  return {
    assetCount: assets.length,
    totals,
    initial,
    initialTotals: totalByKind(initial.filter((asset) => asset.found)),
    largestAssets: [...assets].sort((left, right) => right.rawBytes - left.rawBytes).slice(0, topCount),
    flaggedInitialAssets: initial.filter((asset) => asset.flaggedHeavy),
  }
}

function totalByKind(assets) {
  const totals = {
    all: { count: 0, rawBytes: 0, gzipBytes: 0 },
    script: { count: 0, rawBytes: 0, gzipBytes: 0 },
    style: { count: 0, rawBytes: 0, gzipBytes: 0 },
    image: { count: 0, rawBytes: 0, gzipBytes: 0 },
    font: { count: 0, rawBytes: 0, gzipBytes: 0 },
    html: { count: 0, rawBytes: 0, gzipBytes: 0 },
    json: { count: 0, rawBytes: 0, gzipBytes: 0 },
    other: { count: 0, rawBytes: 0, gzipBytes: 0 },
  }

  for (const asset of assets) {
    const kind = totals[asset.kind] ? asset.kind : 'other'
    totals[kind].count += 1
    totals[kind].rawBytes += asset.rawBytes
    totals[kind].gzipBytes += asset.gzipBytes
    totals.all.count += 1
    totals.all.rawBytes += asset.rawBytes
    totals.all.gzipBytes += asset.gzipBytes
  }

  return totals
}

function compareBudgets(baseline, current) {
  return budgets.flatMap((budget) => {
    const baselineValue = budget.value(baseline)
    const currentValue = budget.value(current)
    const tolerance = Math.max(Math.round(baselineValue * budget.relativeTolerance), budget.absoluteTolerance)
    const limit = baselineValue + tolerance

    if (currentValue <= limit) {
      return []
    }

    return [
      `${budget.id} is ${formatBytes(currentValue)}; limit is ${formatBytes(limit)} ` +
        `(baseline ${formatBytes(baselineValue)}, tolerance ${formatBytes(tolerance)})`,
    ]
  })
}

function compareFirstLoadHeavyAssets(baseline, current) {
  const baselineHeavy = new Set((baseline.flaggedInitialAssets ?? []).map((asset) => stableAssetPath(asset.path)))
  const newHeavyAssets = (current.flaggedInitialAssets ?? []).filter((asset) => !baselineHeavy.has(stableAssetPath(asset.path)))

  if (!newHeavyAssets.length) {
    return []
  }

  return newHeavyAssets.map((asset) => `new heavy first-load asset detected: ${asset.path} (${formatBytes(asset.gzipBytes)} gzip)`)
}

function compareEntryPresence(baseline, current) {
  const baselineEntry = entryScript(baseline)
  const currentEntry = entryScript(current)

  if (baselineEntry && !currentEntry) {
    return ['initial entry script was not found in dist/index.html']
  }

  return []
}

function entryScript(summary) {
  return summary.initial?.find((asset) => asset.relation === 'script' && asset.kind === 'script')
}

function largestAsset(summary, kind) {
  return summary.largestAssets?.find((asset) => asset.kind === kind)
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function printMetric(label, baselineValue, currentValue) {
  const delta = currentValue - baselineValue
  const sign = delta > 0 ? '+' : ''
  console.log(`  ${label}: ${formatBytes(currentValue)} (${sign}${formatBytes(delta)} vs baseline)`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
