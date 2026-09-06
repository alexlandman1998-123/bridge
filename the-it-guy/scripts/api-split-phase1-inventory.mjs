#!/usr/bin/env node
/**
 * Produces the Phase 1 dependency and contract baseline for src/lib/api.js.
 * It reads source only; it does not contact Supabase or change application data.
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  API_SPLIT_CRITICAL_CONTRACTS,
  API_SPLIT_EXPORT_SURFACE_BASELINE,
} from './api-split-phase1-contract-registry.mjs'

const args = new Set(process.argv.slice(2))
const scriptDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDirectory = resolve(scriptDirectory, '..')
const apiPath = resolve(appDirectory, 'src/lib/api.js')
const sourceDirectory = resolve(appDirectory, 'src')

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return filesUnder(path)
    return /\.(?:js|mjs|cjs|jsx|ts|tsx)$/u.test(entry.name) ? [path] : []
  }))
  return nested.flat()
}

function exportedNames(source) {
  const names = new Set()
  for (const match of source.matchAll(/^export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)|^export\s+const\s+([A-Za-z_$][\w$]*)/gmu)) {
    names.add(match[1] || match[2])
  }
  for (const match of source.matchAll(/^export\s*\{([\s\S]*?)\}\s*(?:from\s*['"][^'"]+['"])?\s*$/gmu)) {
    for (const item of match[1].split(',')) {
      const name = item.trim().split(/\s+as\s+/u).at(-1)?.trim()
      if (name) names.add(name)
    }
  }
  return [...names].sort()
}

function domainFor(name) {
  const rules = [
    ['clientPortal', /clientPortal|ClientOtp|ClientHandover|ClientIssue|ClientOnboarding/u],
    ['onboarding', /Onboarding|Purchaser|BuyerRequirement/u],
    ['bond', /Bond|Finance|PreApproval/u],
    ['documents', /Document|Otp|Signing|Mandate|Template/u],
    ['developments', /Development|Unit|VisualMap/u],
    ['attorneys', /Attorney|Matter|Legal/u],
    ['stakeholders', /Stakeholder|Roleplayer|Participant|Firm|Invite/u],
    ['partners', /Partner|Organisation/u],
    ['transactions', /Transaction|Workflow|Subprocess|Stage|Reservation/u],
    ['reporting', /Dashboard|Report|Summary|Analytics/u],
    ['access', /Access|Permission|External|StatusLink/u],
  ]
  return rules.find(([, expression]) => expression.test(name))?.[0] || 'platform'
}

function importedApiNames(source) {
  const names = new Set()
  const pattern = /import\s+([\s\S]*?)\s+from\s+['"][^'"]*\blib\/api(?:\.js)?['"]/gu
  for (const match of source.matchAll(pattern)) {
    const clause = match[1]
    const destructured = clause.match(/\{([\s\S]*?)\}/u)?.[1]
    if (!destructured) continue
    for (const item of destructured.split(',')) {
      const name = item.trim().split(/\s+as\s+/u)[0]?.trim()
      if (name) names.add(name)
    }
  }
  return [...names].sort()
}

const [apiSource, sourceFiles] = await Promise.all([readFile(apiPath, 'utf8'), filesUnder(sourceDirectory)])
const exports = exportedNames(apiSource)
const callers = []
for (const path of sourceFiles) {
  if (path === apiPath) continue
  const imports = importedApiNames(await readFile(path, 'utf8'))
  if (imports.length) callers.push({ path: relative(appDirectory, path), imports })
}

const exportsByDomain = Object.groupBy(exports, domainFor)
const exportSurfaceSha256 = createHash('sha256').update(exports.join('\n')).digest('hex')
const missingCriticalExports = API_SPLIT_CRITICAL_CONTRACTS.filter(({ name }) => !exports.includes(name)).map(({ name }) => name)
const missingEvidence = []
for (const contract of API_SPLIT_CRITICAL_CONTRACTS) {
  for (const test of contract.tests) {
    try { await stat(resolve(appDirectory, test)) } catch { missingEvidence.push(`${contract.name}: ${test}`) }
  }
}
const scriptFiles = await filesUnder(resolve(appDirectory, 'scripts'))
const scriptSources = await Promise.all(scriptFiles.map(async (path) => ({
  path,
  source: await readFile(path, 'utf8'),
})))
const sourceCoupledFiles = scriptSources
  .filter(({ source }) => /src\/lib\/api\.js/u.test(source))
  .map(({ path }) => relative(appDirectory, path))
  .sort()
const result = {
  version: 'api_split_phase1_inventory_v1',
  api: 'src/lib/api.js',
  exportCount: exports.length,
  exportSurfaceSha256,
  exportSurfaceBaseline: API_SPLIT_EXPORT_SURFACE_BASELINE,
  exportSurfaceMatchesBaseline: exports.length === API_SPLIT_EXPORT_SURFACE_BASELINE.exportCount
    && exportSurfaceSha256 === API_SPLIT_EXPORT_SURFACE_BASELINE.sha256,
  exportsByDomain,
  directCallerCount: callers.length,
  callers,
  criticalContracts: API_SPLIT_CRITICAL_CONTRACTS,
  sourceCoupledTestCount: sourceCoupledFiles.length,
  sourceCoupledFiles,
  ready: missingCriticalExports.length === 0 && missingEvidence.length === 0
    && exports.length === API_SPLIT_EXPORT_SURFACE_BASELINE.exportCount
    && exportSurfaceSha256 === API_SPLIT_EXPORT_SURFACE_BASELINE.sha256,
  blockers: {
    missingCriticalExports,
    missingEvidence,
    exportSurfaceChanged: exports.length !== API_SPLIT_EXPORT_SURFACE_BASELINE.exportCount
      || exportSurfaceSha256 !== API_SPLIT_EXPORT_SURFACE_BASELINE.sha256,
  },
}

console.log(JSON.stringify(result, null, 2))
if (args.has('--strict') && !result.ready) process.exitCode = 1
