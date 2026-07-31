import fs from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = path.join(appRoot, 'src')
const json = process.argv.includes('--json')
const selectedDomain = readStringArg('--domain', '')
const enforceDashboardClean = process.argv.includes('--enforce-dashboard-clean')

const DOMAIN_CONFIGS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    entry: 'src/pages/Dashboard.jsx',
    controlClean: true,
  },
  {
    key: 'client-portal',
    label: 'Client Portal',
    entry: 'src/pages/ClientPortal.jsx',
    controlClean: false,
  },
  {
    key: 'attorney-transaction-detail',
    label: 'Attorney Transaction Detail',
    entry: 'src/pages/AttorneyTransactionDetail.jsx',
    controlClean: false,
  },
  {
    key: 'pipeline',
    label: 'Pipeline',
    entry: 'src/pages/Pipeline.jsx',
    controlClean: false,
  },
  {
    key: 'agent-listing-detail',
    label: 'Agent Listing Detail',
    entry: 'src/pages/AgentListingDetail.jsx',
    controlClean: false,
  },
  {
    key: 'unit-detail',
    label: 'Unit Detail',
    entry: 'src/pages/UnitDetail.jsx',
    controlClean: false,
  },
]

const TRACKED_MODULES = [
  {
    key: 'shared-api',
    label: 'Giant shared frontend API',
    path: 'src/lib/api.js',
  },
  {
    key: 'private-listing-service',
    label: 'Private listing service',
    path: 'src/services/privateListingService.js',
  },
  {
    key: 'agency-pipeline-service',
    label: 'Agency pipeline service',
    path: 'src/lib/agencyPipelineService.js',
  },
]

async function main() {
  const configs = selectedDomain
    ? DOMAIN_CONFIGS.filter((domain) => domain.key === selectedDomain)
    : DOMAIN_CONFIGS

  if (selectedDomain && !configs.length) {
    throw new Error(`Unknown domain "${selectedDomain}". Known domains: ${DOMAIN_CONFIGS.map((domain) => domain.key).join(', ')}`)
  }

  const reports = []
  for (const config of configs) {
    reports.push(await buildDomainReport(config))
  }

  const report = {
    trackedModules: TRACKED_MODULES,
    domains: reports,
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printReport(report)
  }

  if (enforceDashboardClean) {
    const dashboard = reports.find((domain) => domain.key === 'dashboard')
    if (dashboard && dashboard.trackedImportCount > 0) {
      throw new Error(`Dashboard import inventory failed: found ${dashboard.trackedImportCount} tracked heavy imports.`)
    }
  }
}

async function buildDomainReport(config) {
  const entryAbsPath = path.join(appRoot, config.entry)
  const graph = await buildStaticImportGraph(entryAbsPath)
  const trackedImports = []
  const dynamicTrackedImports = []

  for (const file of graph.files) {
    for (const importRecord of file.imports) {
      const trackedModule = findTrackedModule(importRecord.resolvedPath)
      if (trackedModule) {
        trackedImports.push({
          moduleKey: trackedModule.key,
          moduleLabel: trackedModule.label,
          modulePath: trackedModule.path,
          importer: toProjectPath(file.path),
          directFromEntry: file.path === entryAbsPath,
          symbols: importRecord.importedNames,
          chain: [...file.chain.map(toProjectPath), trackedModule.path],
        })
      }
    }

    for (const importRecord of file.dynamicImports) {
      const trackedModule = findTrackedModule(importRecord.resolvedPath)
      if (trackedModule) {
        dynamicTrackedImports.push({
          moduleKey: trackedModule.key,
          moduleLabel: trackedModule.label,
          modulePath: trackedModule.path,
          importer: toProjectPath(file.path),
          directFromEntry: file.path === entryAbsPath,
          chain: [...file.chain.map(toProjectPath), trackedModule.path],
        })
      }
    }
  }

  return {
    key: config.key,
    label: config.label,
    entry: config.entry,
    controlClean: config.controlClean,
    scannedFileCount: graph.files.length,
    staticImportEdgeCount: graph.staticImportEdgeCount,
    dynamicImportEdgeCount: graph.dynamicImportEdgeCount,
    trackedImportCount: trackedImports.length,
    dynamicTrackedImportCount: dynamicTrackedImports.length,
    directTrackedImports: trackedImports.filter((item) => item.directFromEntry),
    transitiveTrackedImports: trackedImports.filter((item) => !item.directFromEntry),
    dynamicTrackedImports,
    trackedModuleSummary: buildTrackedModuleSummary(trackedImports, dynamicTrackedImports),
  }
}

async function buildStaticImportGraph(entryAbsPath) {
  const visited = new Set()
  const queue = [{ path: entryAbsPath, chain: [entryAbsPath] }]
  const files = []
  let staticImportEdgeCount = 0
  let dynamicImportEdgeCount = 0

  while (queue.length) {
    const current = queue.shift()
    if (visited.has(current.path)) continue
    visited.add(current.path)

    const source = await fs.readFile(current.path, 'utf8')
    const imports = parseStaticImports(source, current.path)
    const dynamicImports = parseDynamicImports(source, current.path)
    staticImportEdgeCount += imports.length
    dynamicImportEdgeCount += dynamicImports.length

    files.push({
      path: current.path,
      chain: current.chain,
      imports,
      dynamicImports,
    })

    for (const importRecord of imports) {
      if (!importRecord.resolvedPath || visited.has(importRecord.resolvedPath)) continue
      if (findTrackedModule(importRecord.resolvedPath)?.key === 'shared-api') continue
      queue.push({
        path: importRecord.resolvedPath,
        chain: [...current.chain, importRecord.resolvedPath],
      })
    }
  }

  return {
    files,
    staticImportEdgeCount,
    dynamicImportEdgeCount,
  }
}

function parseStaticImports(source, importerPath) {
  const imports = []
  const importFromPattern = /\bimport\s+(?!\()([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g
  const sideEffectPattern = /\bimport\s+['"]([^'"]+)['"]/g
  const exportFromPattern = /\bexport\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g

  for (const match of source.matchAll(importFromPattern)) {
    imports.push({
      specifier: match[2],
      importedNames: parseImportedNames(match[1]),
      resolvedPath: resolveSourceImport(importerPath, match[2]),
    })
  }

  for (const match of source.matchAll(sideEffectPattern)) {
    imports.push({
      specifier: match[1],
      importedNames: ['side-effect'],
      resolvedPath: resolveSourceImport(importerPath, match[1]),
    })
  }

  for (const match of source.matchAll(exportFromPattern)) {
    imports.push({
      specifier: match[1],
      importedNames: ['re-export'],
      resolvedPath: resolveSourceImport(importerPath, match[1]),
    })
  }

  return imports.filter((item) => item.resolvedPath)
}

function parseDynamicImports(source, importerPath) {
  const imports = []
  const dynamicPattern = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const match of source.matchAll(dynamicPattern)) {
    const resolvedPath = resolveSourceImport(importerPath, match[1])
    if (resolvedPath) {
      imports.push({
        specifier: match[1],
        resolvedPath,
      })
    }
  }

  return imports
}

function parseImportedNames(clause) {
  const names = []
  const normalized = clause.replace(/\s+/g, ' ').trim()

  if (!normalized) return names

  const namespaceMatch = normalized.match(/\*\s+as\s+([A-Za-z0-9_$]+)/)
  if (namespaceMatch) names.push('*')

  const namedMatch = normalized.match(/\{([^}]*)\}/)
  if (namedMatch) {
    for (const part of namedMatch[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/i)[0]?.trim()
      if (name) names.push(name)
    }
  }

  const beforeNamed = namedMatch ? normalized.slice(0, namedMatch.index).replace(/,$/, '').trim() : normalized
  if (beforeNamed && !beforeNamed.startsWith('*')) {
    names.unshift('default')
  }

  return [...new Set(names)]
}

function resolveSourceImport(importerPath, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null

  const basePath = path.resolve(path.dirname(importerPath), specifier)
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.jsx'),
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
  ]

  for (const candidate of candidates) {
    if (!candidate.startsWith(srcRoot)) continue
    try {
      return requireExistingPath(candidate)
    } catch {
      // Try the next extension candidate.
    }
  }

  return null
}

function requireExistingPath(candidate) {
  const resolved = path.resolve(candidate)
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new Error(`Missing source file: ${resolved}`)
  }
  return resolved
}

function findTrackedModule(absPath) {
  if (!absPath) return null
  const projectPath = toProjectPath(absPath)
  return TRACKED_MODULES.find((module) => module.path === projectPath) || null
}

function buildTrackedModuleSummary(trackedImports, dynamicTrackedImports) {
  return TRACKED_MODULES.map((module) => {
    const staticImports = trackedImports.filter((item) => item.moduleKey === module.key)
    const dynamicImports = dynamicTrackedImports.filter((item) => item.moduleKey === module.key)
    return {
      moduleKey: module.key,
      moduleLabel: module.label,
      modulePath: module.path,
      staticImportCount: staticImports.length,
      dynamicImportCount: dynamicImports.length,
      directFromEntry: staticImports.some((item) => item.directFromEntry),
      importedSymbols: [...new Set(staticImports.flatMap((item) => item.symbols))].sort(),
      importers: [...new Set(staticImports.map((item) => item.importer))].sort(),
    }
  }).filter((item) => item.staticImportCount || item.dynamicImportCount)
}

function toProjectPath(absPath) {
  return path.relative(appRoot, absPath).split(path.sep).join('/')
}

function readStringArg(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return String(process.argv[index + 1] || '').trim() || fallback
}

function printReport(report) {
  console.log('domain import inventory')
  console.log(`  tracked modules: ${report.trackedModules.map((module) => module.path).join(', ')}`)
  console.log('')

  for (const domain of report.domains) {
    console.log(`${domain.label} (${domain.key})${domain.controlClean ? ' [clean control]' : ''}`)
    console.log(`  entry: ${domain.entry}`)
    console.log(`  scanned files: ${domain.scannedFileCount}`)
    console.log(`  static import edges: ${domain.staticImportEdgeCount}`)
    console.log(`  dynamic import edges: ${domain.dynamicImportEdgeCount}`)

    if (!domain.trackedModuleSummary.length) {
      if (domain.dynamicTrackedImportCount) {
        console.log(`  tracked heavy static imports: none`)
        console.log(`  tracked heavy dynamic imports: ${domain.dynamicTrackedImportCount}`)
        for (const item of domain.dynamicTrackedImports) {
          console.log(`    - ${item.modulePath} from ${item.importer}`)
        }
      } else {
        console.log('  tracked heavy imports: none')
      }
      console.log('')
      continue
    }

    console.log(`  tracked heavy static imports: ${domain.trackedImportCount}`)
    if (domain.dynamicTrackedImportCount) {
      console.log(`  tracked heavy dynamic imports: ${domain.dynamicTrackedImportCount}`)
    }
    for (const summary of domain.trackedModuleSummary) {
      const direct = summary.directFromEntry ? 'direct' : 'transitive'
      console.log(`    - ${summary.modulePath}: ${summary.staticImportCount} static, ${summary.dynamicImportCount} dynamic (${direct})`)
      if (summary.importedSymbols.length) {
        console.log(`      symbols: ${summary.importedSymbols.join(', ')}`)
      }
      console.log(`      importers: ${summary.importers.join(', ')}`)
    }
    console.log('')
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
