import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultRoutes = ['/bridge', '/auth', '/dashboard']
const defaultChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const heavyFirstLoadPattern = /vendor-(jspdf|pdf|fflate|canvg|html2canvas)|html2pdf|xlsx|pdf\.worker/i

function parseArgs(argv) {
  const options = {
    dist: 'dist',
    output: 'docs/performance-baseline.json',
    markdown: 'docs/performance-baseline.md',
    top: 20,
    browser: false,
    requireBrowser: false,
    baseUrl: 'http://127.0.0.1:4173',
    routes: defaultRoutes,
    chromePath: existsSync(defaultChromePath) ? defaultChromePath : undefined,
    build: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--browser') {
      options.browser = true
    } else if (arg === '--build') {
      options.build = true
    } else if (arg === '--no-build') {
      options.build = false
    } else if (arg === '--require-browser') {
      options.browser = true
      options.requireBrowser = true
    } else if (arg === '--dist' && next) {
      options.dist = next
      index += 1
    } else if (arg.startsWith('--dist=')) {
      options.dist = arg.slice('--dist='.length)
    } else if (arg === '--output' && next) {
      options.output = next
      index += 1
    } else if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length)
    } else if (arg === '--markdown' && next) {
      options.markdown = next
      index += 1
    } else if (arg.startsWith('--markdown=')) {
      options.markdown = arg.slice('--markdown='.length)
    } else if (arg === '--top' && next) {
      options.top = Number(next)
      index += 1
    } else if (arg.startsWith('--top=')) {
      options.top = Number(arg.slice('--top='.length))
    } else if (arg === '--base-url' && next) {
      options.baseUrl = next
      index += 1
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length)
    } else if (arg === '--routes' && next) {
      options.routes = parseRoutes(next)
      index += 1
    } else if (arg.startsWith('--routes=')) {
      options.routes = parseRoutes(arg.slice('--routes='.length))
    } else if (arg === '--chrome-path' && next) {
      options.chromePath = next
      index += 1
    } else if (arg.startsWith('--chrome-path=')) {
      options.chromePath = arg.slice('--chrome-path='.length)
    } else if (arg === '--no-chrome-path') {
      options.chromePath = undefined
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    }
  }

  if (!Number.isFinite(options.top) || options.top < 1) {
    options.top = 20
  }

  return options
}

function parseRoutes(value) {
  return value
    .split(',')
    .map((route) => route.trim())
    .filter(Boolean)
    .map((route) => (route.startsWith('/') ? route : `/${route}`))
}

function printHelp() {
  console.log(`Usage: node scripts/performance-baseline.mjs [options]

Measures build output size and optionally cold-load route metrics from a running preview server.

Options:
  --dist <path>          Build output directory. Default: dist
  --output <path>        JSON report path. Default: docs/performance-baseline.json
  --markdown <path>      Markdown report path. Default: docs/performance-baseline.md
  --top <number>         Number of largest assets to include. Default: 20
  --build                Run and time "npm run build" before measuring dist.
  --no-build             Do not run the build command before measuring.
  --browser              Also measure browser route cold loads.
  --require-browser      Fail if browser measurement cannot complete.
  --base-url <url>       Preview server URL for --browser. Default: http://127.0.0.1:4173
  --routes <list>        Comma-separated routes for --browser. Default: /bridge,/auth,/dashboard
  --chrome-path <path>   Browser executable path for Playwright.
  --no-chrome-path       Let Playwright use its default browser.
`)
}

async function runBuildCommand() {
  const command = 'npm run build'
  const startedAt = new Date().toISOString()
  const started = performance.now()
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], {
      cwd: appRoot,
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
  const durationMs = Math.round(performance.now() - started)

  if (exitCode !== 0) {
    throw new Error(`${command} failed with exit code ${exitCode}`)
  }

  return {
    captured: true,
    source: 'current-run',
    command,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs,
  }
}

async function readBuildAssets(distDir) {
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

  await visit(distDir)

  const assets = await Promise.all(
    files.map(async (fullPath) => {
      const buffer = await fs.readFile(fullPath)
      const relativePath = path.relative(distDir, fullPath).split(path.sep).join('/')

      return {
        path: relativePath,
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
  if (ext === '.map') return 'map'
  return 'other'
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

async function measureBrowser(options) {
  try {
    const { chromium } = await import('playwright')
    const launchOptions = {
      headless: true,
    }

    if (options.chromePath) {
      launchOptions.executablePath = options.chromePath
    }

    const browser = await chromium.launch(launchOptions)

    try {
      const routes = []

      for (const route of options.routes) {
        routes.push(await measureRoute(browser, options.baseUrl, route))
      }

      return {
        baseUrl: options.baseUrl,
        routes,
      }
    } finally {
      await browser.close()
    }
  } catch (error) {
    if (options.requireBrowser) {
      throw error
    }

    return {
      baseUrl: options.baseUrl,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function measureRoute(browser, baseUrl, route) {
  const page = await browser.newPage()
  const failedRequests = []
  const consoleErrors = []
  const url = new URL(route, baseUrl).toString()
  const startedAt = Date.now()

  page.on('requestfailed', (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? 'unknown',
    })
  })

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })

    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0]
      const paints = Object.fromEntries(
        performance.getEntriesByType('paint').map((entry) => [entry.name, Math.round(entry.startTime)]),
      )
      const resources = performance.getEntriesByType('resource').map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
        duration: Math.round(entry.duration),
      }))
      const root = document.querySelector('#root')
      const overlay = document.querySelector('vite-error-overlay, .vite-error-overlay')

      return {
        title: document.title,
        finalUrl: window.location.href,
        bodyTextLength: document.body?.innerText?.trim().length ?? 0,
        rootChildCount: root?.children?.length ?? 0,
        hasViteErrorOverlay: Boolean(overlay),
        navigation: navigation
          ? {
              domContentLoaded: Math.round(navigation.domContentLoadedEventEnd),
              load: Math.round(navigation.loadEventEnd),
              transferSize: navigation.transferSize,
              encodedBodySize: navigation.encodedBodySize,
              decodedBodySize: navigation.decodedBodySize,
            }
          : null,
        paints,
        resources,
      }
    })

    return {
      route,
      requestedUrl: url,
      finalUrl: metrics.finalUrl,
      status: response?.status() ?? null,
      ok: response?.ok() ?? false,
      measuredMs: Date.now() - startedAt,
      title: metrics.title,
      firstPaintMs: metrics.paints['first-paint'] ?? null,
      firstContentfulPaintMs: metrics.paints['first-contentful-paint'] ?? null,
      navigation: metrics.navigation,
      transferredBytes: totalResourceBytes(metrics.resources, 'transferSize'),
      decodedBytes: totalResourceBytes(metrics.resources, 'decodedBodySize'),
      resourcesByKind: summarizeBrowserResources(metrics.resources),
      largestResources: largestBrowserResources(metrics.resources, 10),
      consoleErrors,
      failedRequests,
      bodyTextLength: metrics.bodyTextLength,
      rootChildCount: metrics.rootChildCount,
      hasViteErrorOverlay: metrics.hasViteErrorOverlay,
    }
  } catch (error) {
    return {
      route,
      requestedUrl: url,
      error: error instanceof Error ? error.message : String(error),
      measuredMs: Date.now() - startedAt,
      consoleErrors,
      failedRequests,
    }
  } finally {
    await page.close()
  }
}

function totalResourceBytes(resources, field) {
  return resources.reduce((sum, resource) => sum + (Number(resource[field]) || 0), 0)
}

function summarizeBrowserResources(resources) {
  const totals = {
    all: { count: 0, transferSize: 0, decodedBodySize: 0 },
    script: { count: 0, transferSize: 0, decodedBodySize: 0 },
    style: { count: 0, transferSize: 0, decodedBodySize: 0 },
    image: { count: 0, transferSize: 0, decodedBodySize: 0 },
    font: { count: 0, transferSize: 0, decodedBodySize: 0 },
    fetch: { count: 0, transferSize: 0, decodedBodySize: 0 },
    other: { count: 0, transferSize: 0, decodedBodySize: 0 },
  }

  for (const resource of resources) {
    const kind = browserResourceKind(resource)
    totals[kind].count += 1
    totals[kind].transferSize += Number(resource.transferSize) || 0
    totals[kind].decodedBodySize += Number(resource.decodedBodySize) || 0
    totals.all.count += 1
    totals.all.transferSize += Number(resource.transferSize) || 0
    totals.all.decodedBodySize += Number(resource.decodedBodySize) || 0
  }

  return totals
}

function browserResourceKind(resource) {
  const pathname = safePathname(resource.name)
  const ext = path.extname(pathname).toLowerCase()

  if (resource.initiatorType === 'script' || ext === '.js' || ext === '.mjs') return 'script'
  if (resource.initiatorType === 'css' || resource.initiatorType === 'link' || ext === '.css') return 'style'
  if (resource.initiatorType === 'img' || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico'].includes(ext)) {
    return 'image'
  }
  if (['.woff', '.woff2', '.ttf', '.otf'].includes(ext)) return 'font'
  if (['fetch', 'xmlhttprequest'].includes(resource.initiatorType)) return 'fetch'
  return 'other'
}

function safePathname(value) {
  try {
    return new URL(value).pathname
  } catch {
    return value
  }
}

function largestBrowserResources(resources, count) {
  return [...resources]
    .sort((left, right) => (right.transferSize || right.decodedBodySize || 0) - (left.transferSize || left.decodedBodySize || 0))
    .slice(0, count)
    .map((resource) => ({
      url: resource.name,
      kind: browserResourceKind(resource),
      initiatorType: resource.initiatorType,
      transferSize: resource.transferSize,
      decodedBodySize: resource.decodedBodySize,
      duration: resource.duration,
    }))
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : '0'
}

function markdownTable(headers, rows) {
  const header = `| ${headers.join(' | ')} |`
  const separator = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${row.join(' | ')} |`)
  return [header, separator, ...body].join('\n')
}

function renderMarkdown(report) {
  const bundleRows = ['script', 'style', 'image', 'font', 'html', 'json', 'other', 'all'].map((kind) => {
    const total = report.summary.totals[kind]
    return [kind, formatNumber(total.count), formatBytes(total.rawBytes), formatBytes(total.gzipBytes)]
  })

  const initialRows = report.summary.initial.map((asset) => [
    asset.relation,
    `\`${asset.path}\``,
    asset.found ? formatBytes(asset.rawBytes) : 'missing',
    asset.found ? formatBytes(asset.gzipBytes) : 'missing',
    asset.flaggedHeavy ? 'yes' : '',
  ])

  const largestRows = report.summary.largestAssets.map((asset) => [
    asset.kind,
    `\`${asset.path}\``,
    formatBytes(asset.rawBytes),
    formatBytes(asset.gzipBytes),
  ])

  const lines = [
    '# Performance Baseline',
    '',
    'Phase 0 diagnostic artifact. This file records the current platform performance baseline and does not enforce budgets.',
    '',
    `Generated: ${report.generatedAt}`,
    `Dist: \`${report.distDir}\``,
    '',
    '## How to update',
    '',
    '```bash',
    'npm run baseline:performance',
    '```',
    '',
    'Phase 1 guardrails compare future builds to this baseline:',
    '',
    '```bash',
    'npm run test:performance-budget',
    'npm run build:guarded',
    '```',
    '',
    'For route cold-load measurements, run the preview server after the baseline build completes:',
    '',
    '```bash',
    'npm run preview -- --host 127.0.0.1 --port 4173',
    'npm run baseline:performance:browser',
    '```',
    '',
    '## Build command',
    '',
    renderBuildMarkdown(report.build),
    '',
    '## Build output summary',
    '',
    markdownTable(['Kind', 'Files', 'Raw', 'Gzip'], bundleRows),
    '',
    '## Initial HTML resources',
    '',
    initialRows.length
      ? markdownTable(['Relation', 'Asset', 'Raw', 'Gzip', 'Heavy flag'], initialRows)
      : 'No initial resources were detected from `dist/index.html`.',
    '',
    '## Largest build assets',
    '',
    markdownTable(['Kind', 'Asset', 'Raw', 'Gzip'], largestRows),
    '',
  ]

  if (report.summary.flaggedInitialAssets.length) {
    lines.push(
      '## First-load flags',
      '',
      'These assets are present in the initial HTML dependency graph and are likely candidates for later performance phases:',
      '',
      ...report.summary.flaggedInitialAssets.map((asset) => `- \`${asset.path}\` (${asset.relation}, ${formatBytes(asset.gzipBytes)} gzip)`),
      '',
    )
  }

  if (report.browser) {
    lines.push('## Browser route cold-loads', '')

    if (report.browser.error) {
      lines.push(`Browser measurements were requested but did not complete: \`${report.browser.error}\``, '')
    } else {
      const routeRows = report.browser.routes.map((route) => [
        `\`${route.route}\``,
        route.status ?? 'error',
        route.finalUrl ? `\`${new URL(route.finalUrl).pathname}\`` : '',
        route.firstContentfulPaintMs == null ? '' : `${route.firstContentfulPaintMs} ms`,
        formatBytes(route.transferredBytes ?? 0),
        formatBytes(route.decodedBytes ?? 0),
        route.consoleErrors?.length ?? 0,
        route.failedRequests?.length ?? 0,
        route.hasViteErrorOverlay ? 'yes' : '',
      ])

      lines.push(
        markdownTable(
          ['Route', 'Status', 'Final path', 'FCP', 'Transfer', 'Decoded', 'Console errors', 'Failed requests', 'Overlay'],
          routeRows,
        ),
        '',
      )

      for (const route of report.browser.routes) {
        if (route.error) {
          lines.push(`### ${route.route}`, '', `Measurement failed: \`${route.error}\``, '')
          continue
        }

        const resourceRows = ['script', 'style', 'image', 'font', 'fetch', 'other', 'all'].map((kind) => {
          const total = route.resourcesByKind[kind]
          return [kind, formatNumber(total.count), formatBytes(total.transferSize), formatBytes(total.decodedBodySize)]
        })

        lines.push(
          `### ${route.route}`,
          '',
          markdownTable(['Resource kind', 'Count', 'Transfer', 'Decoded'], resourceRows),
          '',
        )
      }
    }
  } else {
    lines.push('## Browser route cold-loads', '', 'Not captured in this run. Use `npm run baseline:performance:browser` while preview is running.', '')
  }

  return `${lines.join('\n')}\n`
}

function renderBuildMarkdown(build) {
  if (!build?.captured) {
    return 'Build timing was not captured in this run. Use `npm run baseline:performance` to refresh it.'
  }

  return markdownTable(['Command', 'Duration', 'Completed'], [[`\`${build.command}\``, formatDuration(build.durationMs), build.completedAt]])
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return 'n/a'
  if (ms < 1000) return `${ms} ms`

  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds - minutes * 60)
  return `${minutes}m ${remainingSeconds}s`
}

async function writeJson(filePath, report) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`)
}

async function writeMarkdown(filePath, report) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, renderMarkdown(report))
}

function printSummary(report) {
  const scripts = report.summary.totals.script
  const styles = report.summary.totals.style
  const initial = report.summary.initialTotals

  console.log('performance baseline written')
  if (report.build?.captured) {
    console.log(`  build: ${formatDuration(report.build.durationMs)} (${report.build.source})`)
  }
  console.log(`  assets: ${formatNumber(report.summary.assetCount)}`)
  console.log(`  scripts: ${formatBytes(scripts.rawBytes)} raw / ${formatBytes(scripts.gzipBytes)} gzip`)
  console.log(`  styles: ${formatBytes(styles.rawBytes)} raw / ${formatBytes(styles.gzipBytes)} gzip`)
  console.log(`  initial: ${formatBytes(initial.all.rawBytes)} raw / ${formatBytes(initial.all.gzipBytes)} gzip`)

  if (report.browser?.routes?.length) {
    for (const route of report.browser.routes) {
      if (route.error) {
        console.log(`  ${route.route}: failed (${route.error})`)
      } else {
        console.log(
          `  ${route.route}: FCP ${route.firstContentfulPaintMs ?? 'n/a'} ms, ` +
            `${formatBytes(route.transferredBytes)} transfer, ${formatBytes(route.decodedBytes)} decoded`,
        )
      }
    }
  } else if (report.browser?.error) {
    console.log(`  browser: skipped (${report.browser.error})`)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    printHelp()
    return
  }

  const outputPath = path.resolve(appRoot, options.output)
  const previousReport = await readPreviousReport(outputPath)
  const build = options.build ? await runBuildCommand() : preservedBuild(previousReport)
  const distDir = path.resolve(appRoot, options.dist)
  const indexPath = path.join(distDir, 'index.html')

  if (!existsSync(indexPath)) {
    throw new Error(`Build output not found at ${indexPath}. Run "npm run build" before baseline measurement.`)
  }

  const [assets, indexHtml] = await Promise.all([readBuildAssets(distDir), fs.readFile(indexPath, 'utf8')])
  const initialAssets = parseInitialAssets(indexHtml)
  const summary = summarizeAssets(assets, initialAssets, options.top)
  const report = {
    tool: 'scripts/performance-baseline.mjs',
    toolVersion: 1,
    generatedAt: new Date().toISOString(),
    distDir: path.relative(appRoot, distDir) || '.',
    options: {
      top: options.top,
      build: options.build,
      browser: options.browser,
      baseUrl: options.browser ? options.baseUrl : undefined,
      routes: options.browser ? options.routes : undefined,
    },
    build,
    summary,
  }

  if (options.browser) {
    report.browser = await measureBrowser(options)
  }

  await Promise.all([
    writeJson(outputPath, report),
    writeMarkdown(path.resolve(appRoot, options.markdown), report),
  ])

  printSummary(report)
}

async function readPreviousReport(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

function preservedBuild(previousReport) {
  if (!previousReport?.build?.captured) {
    return { captured: false }
  }

  return {
    ...previousReport.build,
    source: previousReport.build.source === 'previous-report' ? 'current-run' : previousReport.build.source,
    carriedForward: true,
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
