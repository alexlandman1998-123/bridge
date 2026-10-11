import { run } from 'node:test'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { categories } from './lib/listingDiagnosticCases.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
if (args.some(arg => !['--baseline', '--browser', '--profile=mobile-slow', '--desktop-acceptance'].includes(arg))) throw new Error('Usage: node scripts/listing-diagnostic.mjs [--baseline] [--browser] [--profile=mobile-slow] [--desktop-acceptance]')
const profile = args.includes('--profile=mobile-slow') ? 'mobile-slow' : 'desktop'
if (profile !== 'desktop' && !args.includes('--browser')) throw new Error('The mobile-slow profile requires --browser')
const desktopAcceptance = args.includes('--desktop-acceptance')
if (desktopAcceptance && (!args.includes('--browser') || profile !== 'desktop' || args.includes('--baseline'))) throw new Error('Desktop acceptance requires --browser with the desktop profile, without --baseline')
const out = resolve(root, '../output/playwright/listing-diagnostic', ...(profile === 'desktop' ? [] : [profile]))
await mkdir(out, { recursive: true })
await rm(resolve(out, 'results.json'), { force: true })
const fixtureRoot = new URL('./fixtures/listing-diagnostic/', import.meta.url)
const baseline = JSON.parse(await readFile(new URL('baseline.json', fixtureRoot), 'utf8'))
const sources = JSON.parse(await readFile(new URL('sources.json', fixtureRoot), 'utf8'))
const findings = JSON.parse(await readFile(new URL('findings.json', fixtureRoot), 'utf8'))
if (findings.length !== 18 || new Set(findings.map(row => row.id)).size !== 18 || findings.some(row => !row.reproducer || !row.acceptance || (row.verification === 'manual_browser_or_usability' && !row.manualSteps.length))) throw new Error('Incomplete diagnostic finding register')
for (const source of sources.sources) {
  const hash = createHash('sha256').update(await readFile(new URL(source.file, fixtureRoot))).digest('hex')
  if (hash !== source.sha256) throw new Error(`Vendor fixture changed: ${source.file}; review and update source provenance before using this baseline`)
}
const results = []
const stream = run({ files: [resolve(root, 'scripts/listing-diagnostic.cases.mjs')], concurrency: false })
for await (const event of stream) {
  if (['test:pass', 'test:fail'].includes(event.type)) {
    results.push({ name: event.data.name, status: event.type === 'test:pass' ? 'passed' : 'failed', message: event.data.details?.error?.cause?.message || event.data.details?.error?.message })
  }
}
if (args.includes('--browser')) {
  const log = []
  await rm(resolve(out, 'browser/results.json'), { force: true })
  await rm(resolve(out, 'browser/profile.json'), { force: true })
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, ['scripts/listing-diagnostic-browser.mjs', resolve(out, 'browser'), `--profile=${profile}`], { cwd: root })
    for (const channel of [child.stdout, child.stderr]) channel.on('data', bytes => { log.push(bytes.toString()); process.stdout.write(bytes) })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (signal || (code !== 0 && code !== 1)) reject(new Error(`Browser harness interrupted: exit ${code}, signal ${signal || 'none'}`))
      else done()
    })
  })
  await writeFile(resolve(out, 'browser.log'), log.join(''))
  // The prior result was removed before launch, so setup failure cannot reuse it.
  const browserResults = JSON.parse(await readFile(resolve(out, 'browser/results.json'), 'utf8'))
  results.push(...browserResults)
}
const expected = new Set([...baseline.contractFailures, ...(args.includes('--browser') ? baseline.browserFailures : [])])
const observed = new Set(results.filter(row => row.status === 'failed').map(row => row.name))
const knownFailures = results.filter(row => row.status === 'failed' && expected.has(row.name))
const unexpectedFailures = results.filter(row => row.status !== 'passed' && (row.status === 'error' || !expected.has(row.name)))
const resolved = [...expected].filter(name => results.some(row => row.name === name && row.status === 'passed'))
const required = [...baseline.contractTests, ...(args.includes('--browser') ? baseline.browserTests : [])]
const missing = required.filter(name => !results.some(row => row.name === name))
const duplicateNames = results.filter((row, index) => results.findIndex(other => other.name === row.name) !== index).map(row => row.name)
const desktopJourneys = []
if (desktopAcceptance) {
  // Sequential: every mode owns the same loopback fixture port. Evidence must
  // be from this invocation; never turn an old or incomplete run into a pass.
  for (const [mode, saleCount, rentalCount] of [['recovery', 3, 2], ['progress', 3, 3], ['capture', 7, 7], ['completion', 8, 9], ['publication', 7, 7], ['acceptance', 7, 7]]) {
    const directory = resolve(out, 'desktop-acceptance', mode)
    await mkdir(directory, { recursive: true })
    await rm(resolve(directory, 'results.json'), { force: true })
    const log = []
    const exitCode = await new Promise((done, reject) => {
      const child = spawn(process.execPath, ['scripts/listing-recovery-browser.test.mjs', directory, '', '', mode], { cwd: root })
      for (const channel of [child.stdout, child.stderr]) channel.on('data', bytes => { log.push(bytes.toString()); process.stdout.write(bytes) })
      child.on('error', reject)
      child.on('close', (code, signal) => signal ? reject(new Error(`${mode} interrupted: ${signal}`)) : done(code))
    })
    await writeFile(resolve(directory, 'run.log'), log.join(''))
    const rows = JSON.parse(await readFile(resolve(directory, 'results.json'), 'utf8'))
    const coverage = categories.flatMap(([category]) => ['sale', 'rental'].map(kind => {
      const group = rows.filter(row => row.category === category && row.kind === kind)
      const expectedCount = kind === 'sale' ? saleCount : rentalCount
      return { category, kind, expectedCount, observedCount: group.length, passed: group.length === expectedCount && group.every(row => row.passed === true) && new Set(group.map(row => row.check)).size === expectedCount }
    }))
    const validRows = rows.every(row => categories.some(([key]) => row.category === key) && ['sale', 'rental'].includes(row.kind))
    desktopJourneys.push({ mode, exitCode, passed: exitCode === 0 && validRows && coverage.every(row => row.passed), coverage, results: rows })
  }
}
const matrix = categories.flatMap(([category]) => ['sale', 'rental'].flatMap(mode => ['property24', 'private_property'].map(portal => {
  const stem = `${category}/${mode}/${portal}`
  const schema = results.find(row => row.name.includes(stem + ' outbound contract'))
  const local = results.find(row => row.name.includes(stem + ' complete example'))
  return { category, mode, portal, localReadiness: local?.status || 'not_run', vendorStructure: schema?.status || 'not_run', liveAcceptance: 'not_verified' }
})))
const browserProfile = args.includes('--browser') ? JSON.parse(await readFile(resolve(out, 'browser/profile.json'), 'utf8')) : null
if (browserProfile && browserProfile.profile !== profile) throw new Error('Browser evidence profile does not match the requested run')
const report = { checkedAt: new Date().toISOString(), node: process.version, profile, browserProfile, releaseReady: false, passed: results.filter(row => row.status === 'passed').length, knownFailures, unexpectedFailures, resolved, missing, duplicateNames, results, matrix, limitations: sources }
report.desktopAcceptance = desktopAcceptance ? { passed: desktopJourneys.every(row => row.passed), checksPassed: desktopJourneys.flatMap(row => row.results).filter(row => row.passed === true).length, journeys: desktopJourneys, limitation: 'Loopback fixtures only. No hosted saving, live provider submission or observed agent usability established.' } : null
report.findings = findings.map(finding => ({ ...finding, checks: results.filter(row => row.name.startsWith(`[${finding.id}]`)), verificationStatus: finding.verification === 'manual_browser_or_usability' ? 'manual_review_required' : finding.verification === 'automated_browser' && !args.includes('--browser') ? 'browser_not_run' : 'see_check_results' }))
await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n')
await writeFile(resolve(out, 'coverage.csv'), 'category,mode,portal,localReadiness,vendorStructure,liveAcceptance\n' + matrix.map(row => Object.values(row).join(',')).join('\n') + '\n')
console.log(`${report.passed} passed; ${knownFailures.length} known failures; ${unexpectedFailures.length} unexpected failures; ${resolved.length} newly passing; ${missing.length} missing. NOT a green release gate.`)
console.log(`Evidence: ${out}/results.json`)
if (desktopAcceptance) console.log(`${report.desktopAcceptance.checksPassed} desktop assertions passed; complete local coverage: ${report.desktopAcceptance.passed}. Hosted and human acceptance remain separate.`)
// Baseline mode establishes reproducibility, never marks the defects as fixed.
process.exitCode = unexpectedFailures.length || resolved.length || missing.length || duplicateNames.length || matrix.some(row => row.localReadiness === 'not_run' || row.vendorStructure === 'not_run') || (!args.includes('--baseline') && observed.size) || (desktopAcceptance && !report.desktopAcceptance.passed) ? 1 : 0
