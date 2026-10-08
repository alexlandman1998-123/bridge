import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(app, '..')
const manifestPath = resolve(app, 'config/calendar-acceptance.json')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const normalize = path => path.split(sep).join('/')

// A green process alone cannot certify missing, skipped or malformed test output.
export function assessVitest(report, files, cwd = app) {
  const expected = files.map(file => normalize(resolve(cwd, file))).sort()
  const actual = (report?.testResults || []).map(suite => normalize(suite.name)).sort()
  const assertions = (report?.testResults || []).flatMap(suite => suite.assertionResults || [])
  const errors = []
  if (report?.success !== true || report.numFailedTests !== 0 || report.numFailedTestSuites !== 0) errors.push('Tests or suites failed')
  if (JSON.stringify(expected) !== JSON.stringify(actual)) errors.push('Expected test files were missing or unexpected files ran')
  if (!assertions.length || assertions.some(test => test.status !== 'passed') || report.numPendingTests !== 0 || report.numTodoTests > 0) errors.push('Tests were empty, skipped, pending or incomplete')
  if (assertions.length !== report?.numTotalTests) errors.push('Test totals did not match assertion evidence')
  if ((report?.testResults || []).some(suite => suite.status !== 'passed' || !suite.assertionResults?.length)) errors.push('A suite was empty or incomplete')
  return { passed: errors.length === 0, errors, tests: assertions.length }
}

export function scenarioEvidence(scenarios, reports, cwd = app) {
  return scenarios.map(scenario => {
    const evidence = scenario.evidence.map(selector => {
      const matches = reports.flatMap(({ stage, report }) => (report?.testResults || [])
        .filter(suite => normalize(suite.name) === normalize(resolve(cwd, selector.file)))
        .flatMap(suite => (suite.assertionResults || []).filter(test => test.title.includes(selector.titleContains))
          .map(test => ({ stage, test: test.fullName, status: test.status }))))
      return { ...selector, matches, passed: matches.length > 0 && matches.every(test => test.status === 'passed') }
    })
    return { ...scenario, evidence, localEvidencePassed: evidence.every(item => item.passed) }
  })
}

export function localVerdict(stages, scenarios, unchanged) {
  const required = ['calendar-utc', 'calendar-sast', 'attorney', 'concurrency', 'operator', 'edge', 'app']
  return unchanged && required.every(name => stages.filter(stage => stage.name === name).length === 1
    && stages.find(stage => stage.name === name)?.passed === true)
    && scenarios.length === 42 && new Set(scenarios.map(row => row.id)).size === 42
    && scenarios.every(row => row.localEvidencePassed === true)
}

export function assessExternal(output, kind, expectedFiles = []) {
  if (kind === 'operator') {
    const count = name => Number(output.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] ?? NaN)
    return { passed: count('tests') >= 10 && count('tests') === count('pass')
      && ['fail', 'cancelled', 'skipped', 'todo'].every(name => count(name) === 0), tests: count('tests') }
  }
  const summary = output.match(/^ok \| (\d+) passed \| 0 failed(?: \| 0 ignored)? \([^\n]*\)$/m)
  const filesRan = expectedFiles.every(file => output.includes(`test from ./supabase/functions/${file}`)
    || output.includes(`tests from ./supabase/functions/${file}`))
  return { passed: Boolean(summary) && Number(summary?.[1]) >= expectedFiles.length
    && !/\b[1-9]\d* ignored\b/.test(output) && filesRan, tests: Number(summary?.[1] ?? 0) }
}

async function sourceSnapshot() {
  const files = []
  async function walk(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.env') || ['node_modules', 'dist', '.vite', '.vercel', 'test-results', 'deno.lock'].includes(entry.name)) continue
      const full = resolve(path, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) files.push(full)
    }
  }
  for (const path of ['src', 'api', 'scripts', 'config', 'supabase-tests']) await walk(resolve(app, path))
  for (const path of ['supabase/migrations', 'supabase/functions']) await walk(resolve(root, path))
  files.push(...['package.json', 'package-lock.json', 'vite.config.js', 'eslint.config.js', 'index.html', 'vitest.attorney-calendar.config.js', 'README.md', 'docs/appointment-behaviour-contract.md'].map(path => resolve(app, path)))
  files.push(resolve(root, 'supabase/config.toml'), resolve(root, 'package.json'), resolve(root, 'docs/database-release-runbook.md'))
  const entries = await Promise.all(files.sort().map(async path => [normalize(relative(root, path)), digest(await readFile(path))]))
  return { sha256: digest(JSON.stringify(entries)), files: entries.length }
}

async function execute(name, command, args, cwd, environment, output) {
  const logPath = resolve(output, `${name}.log`)
  const log = createWriteStream(logPath, { flags: 'wx' })
  process.stdout.write(`Checking ${name}; log: ${logPath}\n`)
  const startedAt = new Date().toISOString()
  return new Promise(done => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...environment }, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false })
    let error = null, timedOut = false
    const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, 20 * 60 * 1000)
    child.on('error', failure => { error = failure.code || 'Command unavailable' })
    child.on('close', code => {
      clearTimeout(timeout)
      log.end(() => done({ name, command: [command, ...args], startedAt, finishedAt: new Date().toISOString(), passed: code === 0 && !error && !timedOut, code, error, timedOut, log: normalize(relative(output, logPath)) }))
    })
  })
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === '--help') {
    console.log('Local calendar acceptance (no remote writes): node scripts/check-calendar-acceptance.mjs --output <new-directory-under-repository-tmp>\nRequires deno on PATH and CALENDAR_LOCAL_PG_SOCKET for the isolated local PostgreSQL fixture. Runs both timezones, attorney, concurrency, operator, Edge and check:app. Live acceptance remains a separate release gate.')
    return 0
  }
  if (argv.length !== 2 || argv[0] !== '--output') throw new Error('Use --output <new-directory-under-repository-tmp> or --help')
  const output = resolve(app, argv[1])
  const inside = relative(resolve(root, 'tmp'), output)
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('Evidence must use a new directory under repository tmp')
  // Reject symlinked parents, preventing reports from replacing source or old evidence.
  const { lstat } = await import('node:fs/promises')
  for (let path = dirname(output); path !== root; path = dirname(path)) {
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error('Evidence path cannot contain symlinks') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  await mkdir(dirname(output), { recursive: true })
  await mkdir(output) // Existing evidence is immutable: never overwrite it.
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const before = await sourceSnapshot()
  if (manifest.version !== 1 || manifest.scenarios.map(row => row.id).join(',') !== Array.from({ length: 42 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`).join(',')) throw new Error('Invalid acceptance matrix')
  const contract = await readFile(resolve(app, 'docs/appointment-behaviour-contract.md'), 'utf8')
  const contractCases = [...contract.matchAll(/^\| (A\d+) \| ([^|]+)\|/gm)].map(match => ({ id: match[1], requirement: match[2].trim() }))
  if (JSON.stringify(contractCases) !== JSON.stringify(manifest.scenarios.map(({ id, requirement }) => ({ id, requirement })))) throw new Error('Acceptance matrix no longer matches the behaviour contract')
  for (const name of manifest.release.functions) await readFile(resolve(root, 'supabase/functions', name, 'index.ts'))
  for (const migration of manifest.release.migrations) {
    if (digest(await readFile(resolve(root, migration.path))) !== migration.sha256) throw new Error(`Release migration changed: ${migration.path}`)
  }
  for (const file of [...manifest.calendarTests, ...manifest.nativeTests]) {
    if (/\b(?:it|test|describe)\.(?:skip|todo|fails)\b/.test(await readFile(resolve(app, file), 'utf8'))) throw new Error(`Non-regression test declaration: ${file}`)
  }
  const stages = [], reports = []
  async function vitest(name, files, options = [], environment = {}) {
    const jsonPath = resolve(output, `${name}.json`)
    const stage = await execute(name, resolve(app, 'node_modules/.bin/vitest'), ['run', ...options, ...files, '--maxWorkers=1', '--testTimeout=30000', '--reporter=default', '--reporter=json', `--outputFile.json=${jsonPath}`], app, environment, output)
    try {
      const report = JSON.parse(await readFile(jsonPath, 'utf8'))
      stage.assertions = assessVitest(report, files)
      stage.passed &&= stage.assertions.passed
      reports.push({ stage: name, report })
    } catch { stage.passed = false; stage.error = 'Missing or invalid Vitest JSON evidence' }
    stages.push(stage)
  }
  await vitest('calendar-utc', manifest.calendarTests, [], { TZ: 'UTC' })
  await vitest('calendar-sast', manifest.calendarTests, [], { TZ: 'Africa/Johannesburg' })
  const attorneyFiles = [...(await readFile(resolve(app, manifest.attorneyConfig), 'utf8')).matchAll(/'(.*?)\.test\.(js|jsx)'/g)].map(match => `${match[1]}.test.${match[2]}`)
  await vitest('attorney', attorneyFiles, ['--config', manifest.attorneyConfig], { TZ: 'UTC' })
  if (process.env.CALENDAR_LOCAL_PG_SOCKET) await vitest('concurrency', manifest.nativeTests, [], { TZ: 'UTC' })
  else stages.push({ name: 'concurrency', passed: false, error: 'Set CALENDAR_LOCAL_PG_SOCKET to the isolated local fixture; missing concurrency is not a pass' })
  const operator = await execute('operator', process.execPath, ['--test', '--test-reporter=tap', ...manifest.operatorTests, 'scripts/check-calendar-acceptance.test.mjs'], app, {}, output)
  operator.assertions = assessExternal(await readFile(resolve(output, operator.log), 'utf8'), 'operator')
  operator.passed &&= operator.assertions.passed
  stages.push(operator)
  const edge = await execute('edge', 'deno', ['test', '--config', resolve(root, 'supabase/functions/send-email/deno.json'), '--no-lock', '--allow-env', '--allow-read', ...manifest.edgeTests.map(file => resolve(root, 'supabase/functions', file))], root, { NO_COLOR: '1' }, output)
  edge.assertions = assessExternal(await readFile(resolve(output, edge.log), 'utf8'), 'edge', manifest.edgeTests)
  edge.passed &&= edge.assertions.passed
  stages.push(edge)
  stages.push(await execute('app', 'npm', ['run', 'check:app'], root, {}, output))
  const after = await sourceSnapshot()
  const scenarios = scenarioEvidence(manifest.scenarios, reports)
  // The same regression evidence must exist in each process timezone.
  for (const row of scenarios) row.localEvidencePassed &&= ['calendar-utc', 'calendar-sast'].every(stage => row.evidence.filter(item => manifest.calendarTests.includes(item.file)).every(item => item.matches.some(match => match.stage === stage && match.status === 'passed')))
  const unchanged = before.sha256 === after.sha256
  const passed = localVerdict(stages, scenarios, unchanged)
  const result = { version: 1, generatedAt: new Date().toISOString(), product: manifest.product, node: process.version, localVerificationPassed: passed, releaseReady: false, source: { before, after, unchanged }, stages, scenarios, release: manifest.release, liveGates: manifest.liveGates.map(gate => ({ ...gate, status: 'pending' })) }
  await writeFile(resolve(output, 'report.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  const markdown = `# Calendar acceptance\n\nLocal verification: **${passed ? 'passed' : 'incomplete or failed'}**. Live release acceptance: **pending**.\n\nSource SHA-256: \`${before.sha256}\`. Source unchanged during checks: ${unchanged}.\n\n| Check | Result | Tests |\n| --- | --- | --- |\n${stages.map(stage => `| ${stage.name} | ${stage.passed ? 'passed' : 'failed / unavailable'} | ${stage.assertions?.tests ?? 'see log'} |`).join('\n')}\n\n| Case | Local regression evidence |\n| --- | --- |\n${scenarios.map(row => `| ${row.id} | ${row.localEvidencePassed ? 'passed' : 'missing / failed'} |`).join('\n')}\n\n## Live gates\n\n${manifest.liveGates.map(gate => `- **${gate.id}: pending.** ${gate.requiredEvidence}`).join('\n')}\n\nThe SQL fixture uses minimal prerequisite tables/policies and a mock digest; it does not certify full migration replay or hosted grants. jsdom is not a real mobile browser. Controlled HTTP acceptance and receipt fixtures are not inbox delivery or Google/Outlook account acceptance. No remote data, migration, deployment or email is changed by this runner. See the behaviour contract for exact rollout and recovery instructions.\n`
  await writeFile(resolve(output, 'report.md'), markdown, { flag: 'wx' })
  console.log(`Local verification ${passed ? 'passed' : 'incomplete or failed'}; live acceptance pending. Report: ${resolve(output, 'report.md')}`)
  return passed ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code }).catch(error => { console.error(error.message); process.exitCode = 1 })
}
