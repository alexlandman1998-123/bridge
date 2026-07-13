import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

const workflows = [
  {
    key: 'seller',
    label: 'Seller lead -> lead -> listing process',
    checks: [
      ['test:agent-leads-workspace', 'seller workspace, manual action anchors, buyer/seller lead shells'],
      ['test:seller-journey', 'seller journey stages, readiness, document state'],
      ['test:seller-readiness', 'seller readiness calculation and manual completion gates'],
      ['test:seller-mandate-save-preserves-data', 'agent-entered mandate data preservation'],
      ['test:seller-listing-conversion-idempotency', 'seller lead to listing conversion repeat-safety'],
    ],
  },
  {
    key: 'buyer',
    label: 'Buyer lead -> lead -> registration',
    checks: [
      ['test:lead-ingestion', 'lead intake, import mapping, ingestion logs, RLS migration contract'],
      ['test:lead-assignment', 'assignment persistence, owner actions, activity/task creation'],
      ['test:lead-communication', 'first contact, communication logging, manual intervention points'],
      ['test:lead-ingestion-review', 'agent review queue and source mismatch checks'],
      ['test:lead-listing-interest', 'buyer listing interest linking and manual shortlist actions'],
      ['test:lead-requirements', 'buyer requirements capture and editable qualification fields'],
      ['test:lead-matching', 'property matching suggestions and shortlist workflow'],
      ['test:lead-property-sharing', 'property share/send controls and activity logging'],
    ],
  },
  {
    key: 'listing',
    label: 'Listing workflows and data fields',
    checks: [
      ['test:quick-add-listing-bypass', 'manual listing creation bypass without orphaning seller fields'],
      ['test:listing-workspace-followups', 'listing detail follow-up actions and missing-data prompts'],
      ['test:manual-listing-oversight', 'listing grid oversight filters and agent workload hotspots'],
      ['test:manual-listing-reminders', 'manual reminder/chase list actions for incomplete listings'],
      ['test:agent-listings-delete-ui', 'listing delete action visibility and guardrails'],
      ['test:seller-listing-document-continuity', 'seller documents carry into listing workspace'],
      ['test:seller-listing-relationship-integrity', 'seller/listing/contact relationship integrity'],
    ],
  },
]

function parseArgs(argv) {
  const options = {
    bail: false,
    list: false,
    workflow: '',
  }

  for (const arg of argv) {
    if (arg === '--bail') {
      options.bail = true
    } else if (arg === '--list') {
      options.list = true
    } else if (arg.startsWith('--workflow=')) {
      options.workflow = arg.slice('--workflow='.length).trim().toLowerCase()
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0.0s'
  return `${(ms / 1000).toFixed(1)}s`
}

function flattenChecks(selectedWorkflows) {
  return selectedWorkflows.flatMap((workflow) =>
    workflow.checks.map(([script, coverage]) => ({
      workflow: workflow.key,
      workflowLabel: workflow.label,
      script,
      coverage,
    })),
  )
}

async function loadPackageScripts() {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  return packageJson.scripts || {}
}

function runNpmScript(script) {
  return new Promise((resolve) => {
    const startedAt = performance.now()
    const child = spawn('npm', ['run', '--silent', script], {
      cwd: appRoot,
      env: process.env,
      stdio: 'inherit',
    })

    child.on('error', (error) => {
      resolve({
        script,
        ok: false,
        code: 1,
        error,
        durationMs: performance.now() - startedAt,
      })
    })

    child.on('exit', (code, signal) => {
      resolve({
        script,
        ok: code === 0,
        code: code ?? 1,
        signal,
        durationMs: performance.now() - startedAt,
      })
    })
  })
}

function printList(selectedWorkflows) {
  for (const workflow of selectedWorkflows) {
    console.log(`\n${workflow.key}: ${workflow.label}`)
    for (const [script, coverage] of workflow.checks) {
      console.log(`  - ${script}: ${coverage}`)
    }
  }
}

function printSummary(results, totalDurationMs) {
  const failures = results.filter((result) => !result.ok)
  const passes = results.length - failures.length

  console.log('\nAgency workflow smoke summary')
  console.log(`  Passed: ${passes}`)
  console.log(`  Failed: ${failures.length}`)
  console.log(`  Duration: ${formatDuration(totalDurationMs)}`)

  if (!failures.length) return

  console.log('\nFailures')
  for (const failure of failures) {
    const suffix = failure.signal ? `signal ${failure.signal}` : `exit ${failure.code}`
    console.log(`  - ${failure.workflowLabel} :: ${failure.script} (${suffix})`)
    console.log(`    ${failure.coverage}`)
    if (failure.error) console.log(`    ${failure.error.message}`)
  }
}

const options = parseArgs(process.argv.slice(2))
const selectedWorkflows = options.workflow
  ? workflows.filter((workflow) => workflow.key === options.workflow)
  : workflows

if (!selectedWorkflows.length) {
  throw new Error(`Unknown workflow "${options.workflow}". Use one of: ${workflows.map((workflow) => workflow.key).join(', ')}`)
}

if (options.list) {
  printList(selectedWorkflows)
  process.exit(0)
}

const checks = flattenChecks(selectedWorkflows)
const packageScripts = await loadPackageScripts()
const missingScripts = checks.filter((check) => !packageScripts[check.script])

if (missingScripts.length) {
  console.error('Agency workflow smoke cannot run because package.json is missing scripts:')
  for (const check of missingScripts) {
    console.error(`  - ${check.script} (${check.workflowLabel})`)
  }
  process.exit(1)
}

console.log('Agency workflow smoke')
console.log(`  Workflows: ${selectedWorkflows.map((workflow) => workflow.key).join(', ')}`)
console.log(`  Checks: ${checks.length}`)
console.log(`  Bail: ${options.bail ? 'yes' : 'no'}`)

const suiteStartedAt = performance.now()
const results = []

for (const check of checks) {
  console.log(`\n[agency-smoke] ${check.workflowLabel}`)
  console.log(`[agency-smoke] ${check.script}: ${check.coverage}`)

  const result = await runNpmScript(check.script)
  const enrichedResult = { ...check, ...result }
  results.push(enrichedResult)

  const marker = enrichedResult.ok ? 'PASS' : 'FAIL'
  console.log(`[agency-smoke] ${marker} ${check.script} (${formatDuration(enrichedResult.durationMs)})`)

  if (!enrichedResult.ok && options.bail) break
}

const totalDurationMs = performance.now() - suiteStartedAt
printSummary(results, totalDurationMs)

if (results.some((result) => !result.ok)) {
  process.exit(1)
}
