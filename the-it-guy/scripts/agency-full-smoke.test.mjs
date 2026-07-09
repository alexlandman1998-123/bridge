import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

const phases = [
  {
    key: 'audit',
    label: 'RLS and manual intervention audit',
    script: 'test:agency-rls-manual-audit',
    coverage: 'migration policy contracts, scoped access helpers, manual repair affordances, service plumbing',
    getArgs: () => [],
  },
  {
    key: 'workflow',
    label: 'Agency workflow smoke',
    script: 'test:agency-workflow-smoke',
    coverage: 'seller lead to listing, buyer lead to registration, listing workflows and data fields',
    getArgs: (options) => [
      ...(options.workflow ? [`--workflow=${options.workflow}`] : []),
      ...(options.bail ? ['--bail'] : []),
    ],
  },
  {
    key: 'browser',
    label: 'Browser action smoke',
    script: 'test:agency-browser-smoke',
    coverage: 'critical buttons, modals, filters, copy actions, editable fields, auth bounce checks',
    getArgs: () => [],
    skippable: true,
  },
]

function parseArgs(argv) {
  const options = {
    bail: false,
    list: false,
    workflow: '',
    skipBrowser: false,
    only: '',
  }

  for (const arg of argv) {
    if (arg === '--bail') {
      options.bail = true
    } else if (arg === '--list') {
      options.list = true
    } else if (arg === '--skip-browser') {
      options.skipBrowser = true
    } else if (arg.startsWith('--workflow=')) {
      options.workflow = arg.slice('--workflow='.length).trim().toLowerCase()
    } else if (arg.startsWith('--only=')) {
      options.only = arg.slice('--only='.length).trim().toLowerCase()
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  if (options.workflow && !['seller', 'buyer', 'listing'].includes(options.workflow)) {
    throw new Error(`Unknown workflow "${options.workflow}". Use one of: seller, buyer, listing`)
  }

  if (options.only && !phases.some((phase) => phase.key === options.only)) {
    throw new Error(`Unknown phase "${options.only}". Use one of: ${phases.map((phase) => phase.key).join(', ')}`)
  }

  return options
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0.0s'
  return `${(ms / 1000).toFixed(1)}s`
}

function getSelectedPhases(options) {
  return phases.filter((phase) => {
    if (options.only) return phase.key === options.only
    if (phase.key === 'browser' && options.skipBrowser) return false
    return true
  })
}

function printList(selectedPhases, options) {
  console.log('Agency full smoke phases')
  for (const phase of selectedPhases) {
    const args = phase.getArgs(options)
    console.log(`\n${phase.key}: ${phase.label}`)
    console.log(`  npm run ${phase.script}${args.length ? ` -- ${args.join(' ')}` : ''}`)
    console.log(`  ${phase.coverage}`)
  }
}

function runNpmScript(phase, options) {
  return new Promise((resolve) => {
    const args = phase.getArgs(options)
    const childArgs = ['run', '--silent', phase.script]
    if (args.length) childArgs.push('--', ...args)

    const startedAt = performance.now()
    const child = spawn('npm', childArgs, {
      cwd: appRoot,
      env: process.env,
      stdio: 'inherit',
    })

    child.on('error', (error) => {
      resolve({
        ...phase,
        ok: false,
        code: 1,
        error,
        durationMs: performance.now() - startedAt,
      })
    })

    child.on('exit', (code, signal) => {
      resolve({
        ...phase,
        ok: code === 0,
        code: code ?? 1,
        signal,
        durationMs: performance.now() - startedAt,
      })
    })
  })
}

function printSummary(results, totalDurationMs) {
  const failures = results.filter((result) => !result.ok)
  const passes = results.length - failures.length

  console.log('\nAgency full smoke summary')
  console.log(`  Passed: ${passes}`)
  console.log(`  Failed: ${failures.length}`)
  console.log(`  Duration: ${formatDuration(totalDurationMs)}`)

  if (!failures.length) return

  console.log('\nFailures')
  for (const failure of failures) {
    const suffix = failure.signal ? `signal ${failure.signal}` : `exit ${failure.code}`
    console.log(`  - ${failure.label} (${suffix})`)
    console.log(`    npm run ${failure.script}`)
    console.log(`    ${failure.coverage}`)
    if (failure.error) console.log(`    ${failure.error.message}`)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const selectedPhases = getSelectedPhases(options)

  if (options.list) {
    printList(selectedPhases, options)
    return
  }

  console.log('Agency full smoke')
  console.log(`  Phases: ${selectedPhases.map((phase) => phase.key).join(', ')}`)
  console.log(`  Workflow: ${options.workflow || 'all'}`)
  console.log(`  Browser: ${options.skipBrowser ? 'skipped' : 'included'}`)
  console.log(`  Bail: ${options.bail ? 'yes' : 'no'}`)

  const suiteStartedAt = performance.now()
  const results = []

  for (const phase of selectedPhases) {
    const args = phase.getArgs(options)
    console.log(`\n[agency-full-smoke] ${phase.label}`)
    console.log(`[agency-full-smoke] npm run ${phase.script}${args.length ? ` -- ${args.join(' ')}` : ''}`)
    console.log(`[agency-full-smoke] ${phase.coverage}`)

    const result = await runNpmScript(phase, options)
    results.push(result)

    const marker = result.ok ? 'PASS' : 'FAIL'
    console.log(`[agency-full-smoke] ${marker} ${phase.key} (${formatDuration(result.durationMs)})`)

    if (!result.ok && options.bail) break
  }

  printSummary(results, performance.now() - suiteStartedAt)

  if (results.some((result) => !result.ok)) process.exit(1)
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error)
  process.exitCode = 1
})
