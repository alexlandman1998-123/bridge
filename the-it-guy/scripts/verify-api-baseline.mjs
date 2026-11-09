import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const selection = JSON.parse(readFileSync(new URL('./api-verification-baseline.json', import.meta.url), 'utf8'))
const args = process.argv.slice(2)
if (args.some(arg => !['--native', '--vitest'].includes(arg)) || args.length > 1) {
  throw new Error('Use no arguments for the full baseline, or --native / --vitest for one part.')
}
const out = resolve(root, 'output/api-verification-baseline', new Date().toISOString().replaceAll(/[:.]/g, '-'))
mkdirSync(out, { recursive: true })
const results = []
const env = {
  ...process.env,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=1024`.trim(),
  // Accidental real-client imports cannot pick up the app's hosted defaults.
  VITE_SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_URL: 'http://127.0.0.1:9',
  VITE_SUPABASE_ANON_KEY: 'local-fixture-only', SUPABASE_ANON_KEY: 'local-fixture-only',
  SUPABASE_SERVICE_ROLE_KEY: '',
}
let memoryFailure = false
console.log(`Local API baseline: ${out}`)

function run(name, commandArgs, timeout) {
  const started = Date.now()
  const child = spawnSync(process.execPath, commandArgs, {
    cwd: root, env, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024,
  })
  const log = `${child.stdout || ''}\n${child.stderr || ''}`
  const logFile = `${name.replaceAll(/[^a-zA-Z0-9._-]/g, '_')}.log`
  writeFileSync(resolve(out, logFile), log)
  memoryFailure = child.signal === 'SIGKILL' || /heap out of memory|Allocation failed/i.test(log)
  const passed = child.status === 0 && !child.error && !memoryFailure
  results.push({ name, passed, status: child.status, signal: child.signal,
    error: child.error?.message || null, durationMs: Date.now() - started, log: logFile })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name} (${Date.now() - started}ms)`)
  if (!passed) console.log(log.slice(-2500))
  writeReport()
}

function writeReport() {
  writeFileSync(resolve(out, 'summary.json'), JSON.stringify({
    environment: 'Local fixtures only', mode: args[0] || 'all',
    selectedNativeFiles: selection.native.length, selectedVitestFiles: selection.vitest.length,
    memoryFailure, results,
  }, null, 2) + '\n')
}

if (args[0] !== '--vitest') {
  for (const file of selection.native) {
    run(file, [file], 60_000)
    if (memoryFailure) break
  }
}
if (!memoryFailure && args[0] !== '--native') {
  run('vitest', ['node_modules/vitest/vitest.mjs', 'run', ...selection.vitest,
    '--maxWorkers=1', '--no-file-parallelism', '--reporter=default', '--reporter=json',
    `--outputFile.json=${resolve(out, 'vitest.json')}`], 600_000)
}
const failed = results.filter(result => !result.passed)
console.log(`${failed.length ? 'FAILED' : 'PASSED'}: ${results.length} checks, ${failed.length} failures. Logs: ${out}`)
if (memoryFailure) console.log('Stopped after memory failure. Remaining checks were not run; do not raise the heap cap locally.')
process.exitCode = failed.length || memoryFailure ? 1 : 0
