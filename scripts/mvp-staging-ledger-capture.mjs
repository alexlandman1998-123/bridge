import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseOptions(argv) {
  const options = { projectRef: '', input: '', output: '' }
  for (const arg of argv) {
    if (arg.startsWith('--project-ref=')) options.projectRef = arg.slice('--project-ref='.length)
    else if (arg.startsWith('--input=')) options.input = arg.slice('--input='.length)
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else throw new Error(`Unknown option: ${arg}`)
  }
  if (!options.projectRef) throw new Error('Use --project-ref=<confirmed-staging-project-ref>.')
  if (!options.output) throw new Error('Use --output=<ledger-evidence.json>.')
  return options
}

function collectRows(value, rows = []) {
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === 'object' && ('remote' in item || 'remote_version' in item))) rows.push(...value)
    else value.forEach((item) => collectRows(item, rows))
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectRows(item, rows))
  }
  return rows
}

function version(value) {
  return String(value || '').match(/\b\d{12,14}\b/)?.[0] || ''
}

function readRawLedger(options) {
  if (options.input) {
    const inputPath = path.resolve(repoRoot, options.input)
    if (!existsSync(inputPath)) throw new Error(`Input file not found: ${options.input}`)
    return readFileSync(inputPath, 'utf8')
  }
  const result = spawnSync('npx', ['supabase', 'migration', 'list', '--linked', '--output', 'json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(`Unable to read the linked Supabase ledger: ${(result.stderr || result.stdout || '').trim()}`)
  return result.stdout
}

const options = parseOptions(process.argv.slice(2))
const raw = readRawLedger(options)
let parsed
try { parsed = JSON.parse(raw) } catch { throw new Error('Supabase migration output was not valid JSON. Re-run with a current Supabase CLI or provide --input=<json-output>.') }
const rows = collectRows(parsed)
const appliedVersions = [...new Set(rows.map((row) => version(row.remote ?? row.remote_version ?? row.remoteVersion)).filter(Boolean))].sort()
if (!appliedVersions.length) throw new Error('No remote applied migration versions were found in the linked ledger output.')

const evidence = {
  version: 'arch9_mvp_staging_ledger_evidence_v1',
  projectRef: options.projectRef,
  capturedAt: new Date().toISOString(),
  sourceCommand: 'supabase migration list --linked --output json',
  appliedVersions,
}
const outputPath = path.resolve(repoRoot, options.output)
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`)
console.log(JSON.stringify({ passed: true, output: options.output, projectRef: evidence.projectRef, appliedVersionCount: appliedVersions.length }, null, 2))
