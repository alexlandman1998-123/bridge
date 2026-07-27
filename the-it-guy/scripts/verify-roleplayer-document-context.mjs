import { spawn } from 'node:child_process'

const RELEASE_GATE_VERSION = 'roleplayer_document_context_release_gate_v1'

const nodeCommand = process.execPath
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const RELEASE_GATE_STEPS = Object.freeze([
  Object.freeze({
    key: 'annexure_demo_freeze',
    phase: '0',
    label: 'Annexure A demo freeze',
    command: npmCommand,
    args: ['run', 'test:seller-annexure-a-demo-freeze'],
  }),
  Object.freeze({
    key: 'shared_annexure_adapter',
    phase: '1',
    label: 'Shared Annexure A context adapter',
    command: npmCommand,
    args: ['run', 'test:roleplayer-document-context-phase1'],
  }),
  Object.freeze({
    key: 'shared_mandate_adapter',
    phase: '2',
    label: 'Shared mandate packet context adapter',
    command: npmCommand,
    args: ['run', 'test:roleplayer-document-context-phase2'],
  }),
  Object.freeze({
    key: 'roleplayer_context_parity',
    phase: '3',
    label: 'Roleplayer document context parity',
    command: npmCommand,
    args: ['run', 'test:roleplayer-document-context-phase3'],
  }),
  Object.freeze({
    key: 'cross_module_document_consistency',
    phase: '4',
    label: 'Cross-module document key consistency',
    command: nodeCommand,
    args: ['scripts/cross-module-document-consistency-phase4.test.mjs'],
  }),
  Object.freeze({
    key: 'document_start_flow',
    phase: '4',
    label: 'Document start flow guard',
    command: nodeCommand,
    args: ['scripts/document-start-phase3.test.mjs'],
  }),
  Object.freeze({
    key: 'mandate_attorney_allocation',
    phase: '4',
    label: 'Mandate attorney allocation guard',
    command: nodeCommand,
    args: ['scripts/mandate-attorney-allocation-phase1.test.mjs'],
  }),
  Object.freeze({
    key: 'seller_document_source_of_truth',
    phase: '4',
    label: 'Seller document source of truth',
    command: nodeCommand,
    args: ['scripts/seller-document-source-of-truth.test.mjs'],
  }),
  Object.freeze({
    key: 'seller_portal_document_centre',
    phase: '4',
    label: 'Seller portal document centre',
    command: nodeCommand,
    args: ['scripts/client-portal-document-centre-phase4.test.mjs'],
  }),
  Object.freeze({
    key: 'canonical_document_adapters',
    phase: '4',
    label: 'Canonical document adapters',
    command: nodeCommand,
    args: ['scripts/canonical-document-adapters.test.mjs'],
  }),
  Object.freeze({
    key: 'production_build',
    phase: '4',
    label: 'Production build',
    command: npmCommand,
    args: ['run', 'build'],
    build: true,
  }),
])

function parseArgs(argv = []) {
  const options = {
    skipBuild: false,
    failFast: false,
    only: new Set(),
  }

  for (const arg of argv) {
    if (arg === '--skip-build') options.skipBuild = true
    else if (arg === '--fail-fast') options.failFast = true
    else if (arg.startsWith('--only=')) {
      for (const key of arg.slice('--only='.length).split(',')) {
        const normalized = key.trim()
        if (normalized) options.only.add(normalized)
      }
    }
  }

  return options
}

function tailOutput(value = '', maxLines = 24) {
  return String(value || '').split(/\r?\n/).filter(Boolean).slice(-maxLines).join('\n')
}

function stepCommandLabel(step) {
  return [step.command, ...(step.args || [])].join(' ')
}

function runStep(step) {
  const startedAt = new Date()
  const startedMs = Date.now()
  process.stderr.write(`\n[roleplayer-context] ${step.label}\n`)
  process.stderr.write(`[roleplayer-context] $ ${stepCommandLabel(step)}\n`)

  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      process.stderr.write(text)
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      process.stderr.write(text)
    })
    child.on('error', (error) => {
      stderr += `${error?.message || error}\n`
    })
    child.on('close', (exitCode) => {
      const durationMs = Date.now() - startedMs
      resolve({
        key: step.key,
        phase: step.phase,
        label: step.label,
        command: stepCommandLabel(step),
        status: exitCode === 0 ? 'pass' : 'fail',
        exitCode: Number(exitCode || 0),
        startedAt: startedAt.toISOString(),
        durationMs,
        stdoutTail: tailOutput(stdout),
        stderrTail: tailOutput(stderr),
      })
    })
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const steps = RELEASE_GATE_STEPS.filter((step) => {
    if (options.skipBuild && step.build) return false
    if (options.only.size && !options.only.has(step.key)) return false
    return true
  })
  const startedAt = new Date()
  const results = []

  for (const step of steps) {
    const result = await runStep(step)
    results.push(result)
    if (options.failFast && result.status !== 'pass') break
  }

  const failedSteps = results.filter((result) => result.status !== 'pass')
  const skippedSteps = RELEASE_GATE_STEPS
    .filter((step) => !steps.some((included) => included.key === step.key))
    .map((step) => ({
      key: step.key,
      phase: step.phase,
      label: step.label,
      reason: step.build && options.skipBuild ? 'skip_build_requested' : 'not_selected',
    }))

  const report = {
    contractVersion: RELEASE_GATE_VERSION,
    phase: '4',
    generatedAt: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    mutatedData: false,
    status: failedSteps.length ? 'fail' : 'pass',
    summary: {
      totalStepCount: RELEASE_GATE_STEPS.length,
      executedStepCount: results.length,
      skippedStepCount: skippedSteps.length,
      passedStepCount: results.filter((result) => result.status === 'pass').length,
      failedStepCount: failedSteps.length,
    },
    failedSteps: failedSteps.map((result) => ({
      key: result.key,
      phase: result.phase,
      label: result.label,
      exitCode: result.exitCode,
    })),
    skippedSteps,
    steps: results,
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (failedSteps.length) process.exitCode = 1
}

main().catch((error) => {
  console.error('Roleplayer document context release gate failed:', error?.message || error)
  process.exitCode = 1
})
