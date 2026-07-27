import { spawn } from 'node:child_process'

const OPERATIONAL_READINESS_VERSION = 'roleplayer_document_context_operational_readiness_v1'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function isTruthy(value = '') {
  return ['1', 'true', 'yes', 'on'].includes(normalizeText(value).toLowerCase())
}

function hasArg(name) {
  return process.argv.includes(name)
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

function extractJsonObject(output = '') {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not parse roleplayer document context release-gate JSON output.')
  }
  return JSON.parse(output.slice(start, end + 1))
}

function createReport() {
  return {
    ok: false,
    contractVersion: OPERATIONAL_READINESS_VERSION,
    phase: '5',
    scope: 'roleplayer-document-context-operational-readiness',
    generatedAt: new Date().toISOString(),
    mode: 'local_release_gate_operational_readiness',
    mutatedData: false,
    status: 'RUNNING',
    blockedStage: null,
    gates: {
      releaseGate: null,
    },
    nextCommand: null,
  }
}

function createChildError(scriptPath, code, stdout, stderr) {
  const output = `${stdout || ''}\n${stderr || ''}`.trim()
  const error = new Error(`${scriptPath} exited ${code}${output ? `\n${output}` : ''}`)
  error.code = code
  error.stdout = stdout
  error.stderr = stderr
  return error
}

async function runNodeScript(scriptPath, args = [], env = process.env, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      process.stderr.write(text)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0 && !options.allowFailure) {
        reject(createChildError(scriptPath, code, stdout, stderr))
        return
      }
      resolve({ code, stdout, stderr })
    })
  })
}

function summarizeReleaseGate(childResult = {}) {
  let releaseGate = null
  try {
    releaseGate = extractJsonObject(childResult.stdout)
  } catch {
    releaseGate = null
  }

  const failedSteps = releaseGate?.failedSteps || []
  const skippedSteps = releaseGate?.skippedSteps || []
  return {
    ok: childResult.code === 0 && releaseGate?.status === 'pass',
    status: releaseGate?.status || 'UNKNOWN',
    contractVersion: releaseGate?.contractVersion || null,
    summary: releaseGate?.summary || null,
    failedSteps,
    skippedSteps,
    skippedBuild: skippedSteps.some((step) => step.key === 'production_build'),
    blockingReasons: failedSteps.map((step) => ({
      code: 'release_gate_step_failed',
      stepKey: step.key,
      detail: `${step.label || step.key} failed with exit code ${step.exitCode ?? 'unknown'}.`,
    })),
  }
}

async function main() {
  const report = createReport()
  const skipBuild = hasArg('--skip-build') || isTruthy(process.env.ROLEPLAYER_CONTEXT_OPERATIONAL_SKIP_BUILD)
  const releaseGateArgs = ['--fail-fast']
  if (skipBuild) releaseGateArgs.push('--skip-build')

  try {
    const releaseGateResult = await runNodeScript(
      'scripts/verify-roleplayer-document-context.mjs',
      releaseGateArgs,
      process.env,
      { allowFailure: true },
    )
    report.gates.releaseGate = summarizeReleaseGate(releaseGateResult)

    if (!report.gates.releaseGate.ok) {
      report.ok = false
      report.status = 'BLOCKED'
      report.blockedStage = 'release_gate'
      report.nextCommand = 'Resolve releaseGate.blockingReasons, then rerun npm run verify:roleplayer-document-context:operational.'
      console.log(safeJson(report))
      process.exitCode = 1
      return
    }

    report.ok = true
    report.status = skipBuild ? 'READY_FOR_BUILD_VERIFICATION' : 'OPERATIONAL'
    report.nextCommand = skipBuild
      ? 'Run npm run verify:roleplayer-document-context:operational without --skip-build before release sign-off.'
      : 'Roleplayer document context is ready for controlled demo/release sign-off.'
    console.log(safeJson(report))
  } catch (error) {
    report.ok = false
    report.status = 'ERROR'
    report.blockedStage = report.blockedStage || 'operational_readiness'
    report.nextCommand = 'Review the error, then rerun npm run verify:roleplayer-document-context:operational.'
    report.error = error?.message || String(error)
    console.error(safeJson(report))
    process.exitCode = 1
  }
}

main()
