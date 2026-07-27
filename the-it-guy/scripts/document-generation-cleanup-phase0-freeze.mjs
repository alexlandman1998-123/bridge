import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

const FREEZE_CONTRACT = 'document_generation_cleanup_phase0_freeze_v1'
const RELEASE_GATE_CONTRACT = 'roleplayer_document_context_release_gate_v1'
const SOURCE_DRIFT_CONTRACT = 'roleplayer_document_context_source_drift_guard_v1'
const OTP_GUARD_STEPS = Object.freeze([
  Object.freeze({
    key: 'otp_canonical_pdf_contract',
    label: 'OTP canonical PDF source contract',
    args: ['run', 'test:otp-phase2-staging-acceptance'],
  }),
  Object.freeze({
    key: 'otp_launch_hardening_contract',
    label: 'OTP launch hardening contract',
    args: ['run', 'test:otp-phase3-launch-hardening'],
  }),
  Object.freeze({
    key: 'signed_otp_transfer_instruction',
    label: 'Signed OTP transfer instruction activation',
    args: ['run', 'test:signed-otp-transfer-instruction-phase4'],
  }),
])

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function sha256(value = '') {
  return createHash('sha256').update(value).digest('hex')
}

function tailOutput(value = '', maxLines = 28) {
  return String(value || '').split(/\r?\n/).filter(Boolean).slice(-maxLines).join('\n')
}

function extractJsonObject(output = '') {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not parse JSON output from document generation freeze command.')
  }
  return JSON.parse(output.slice(start, end + 1))
}

function runCommand({ key, label, command, args }) {
  const startedAt = new Date()
  const startedMs = Date.now()
  process.stderr.write(`\n[document-generation-freeze] ${label}\n`)
  process.stderr.write(`[document-generation-freeze] $ ${[command, ...args].join(' ')}\n`)

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
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
      resolve({
        key,
        label,
        command: [command, ...args].join(' '),
        exitCode: Number(exitCode || 0),
        durationMs: Date.now() - startedMs,
        startedAt: startedAt.toISOString(),
        stdout,
        stderr,
      })
    })
  })
}

function buildFreezeDigest({ releaseGate = {}, sourceDrift = {} }) {
  return sha256(JSON.stringify({
    releaseGateContract: releaseGate.contractVersion,
    releaseGateStatus: releaseGate.status,
    releaseGateSummary: releaseGate.summary,
    sourceDriftContract: sourceDrift.contract,
    sourceDriftStatus: sourceDrift.status,
    sourceDigest: sourceDrift.guard?.sourceDigest || null,
    sourceReceiptDigest: sourceDrift.guard?.sourceReceiptDigest || null,
    sourceLaunchLockDigest: sourceDrift.guard?.sourceLaunchLockDigest || null,
  }))
}

async function main() {
  const startedAt = new Date().toISOString()
  const blockers = []
  const sourceDriftArgs = ['scripts/roleplayer-document-context-phase12-source-drift-guard.mjs']
  const maxAgeMinutes = arg('max-age-minutes')
  const receiptDir = arg('receipt-dir')
  if (maxAgeMinutes) sourceDriftArgs.push(`--max-age-minutes=${maxAgeMinutes}`)
  if (receiptDir) sourceDriftArgs.push(`--receipt-dir=${receiptDir}`)

  const releaseGateRun = await runCommand({
    key: 'roleplayer_release_gate',
    label: 'Roleplayer document context release gate',
    command: process.execPath,
    args: ['scripts/verify-roleplayer-document-context.mjs'],
  })

  let releaseGate = null
  try {
    releaseGate = extractJsonObject(releaseGateRun.stdout)
  } catch (error) {
    blockers.push({ code: 'phase0_release_gate_output_invalid', detail: error?.message || String(error) })
  }

  if (
    releaseGateRun.exitCode !== 0 ||
    releaseGate?.contractVersion !== RELEASE_GATE_CONTRACT ||
    releaseGate?.status !== 'pass' ||
    releaseGate?.summary?.failedStepCount !== 0
  ) {
    blockers.push({
      code: 'phase0_release_gate_failed',
      detail: `Release gate status is ${releaseGate?.status || 'missing'} with ${releaseGate?.summary?.failedStepCount ?? 'unknown'} failed step(s).`,
    })
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const otpGuardRuns = []
  for (const step of OTP_GUARD_STEPS) {
    const result = await runCommand({
      key: step.key,
      label: step.label,
      command: npmCommand,
      args: step.args,
    })
    otpGuardRuns.push(result)
    if (result.exitCode !== 0) {
      blockers.push({
        code: `phase0_${step.key}_failed`,
        detail: `${step.label} failed with exit code ${result.exitCode}.`,
      })
    }
  }

  const sourceDriftRun = await runCommand({
    key: 'source_drift_guard',
    label: 'Roleplayer document source drift guard',
    command: process.execPath,
    args: sourceDriftArgs,
  })

  let sourceDrift = null
  try {
    sourceDrift = extractJsonObject(sourceDriftRun.stdout)
  } catch (error) {
    blockers.push({ code: 'phase0_source_drift_output_invalid', detail: error?.message || String(error) })
  }

  if (
    sourceDriftRun.exitCode !== 0 ||
    sourceDrift?.contract !== SOURCE_DRIFT_CONTRACT ||
    sourceDrift?.guarded !== true ||
    sourceDrift?.status !== 'SOURCE_DRIFT_GUARDED'
  ) {
    blockers.push({
      code: 'phase0_source_drift_guard_failed',
      detail: `Source drift status is ${sourceDrift?.status || 'missing'}, guarded=${Boolean(sourceDrift?.guarded)}.`,
    })
  }

  const frozen = blockers.length === 0
  const freeze = frozen
    ? {
      contract: FREEZE_CONTRACT,
      status: 'frozen',
      frozenAt: new Date().toISOString(),
      releaseGateStatus: releaseGate.status,
      releaseGatePassedSteps: releaseGate.summary?.passedStepCount || 0,
      otpGuardPassedSteps: otpGuardRuns.filter((result) => result.exitCode === 0).length,
      sourceDriftStatus: sourceDrift.status,
      sourceDigest: sourceDrift.guard?.sourceDigest || null,
      sourceReceiptDigest: sourceDrift.guard?.sourceReceiptDigest || null,
      sourceLaunchLockDigest: sourceDrift.guard?.sourceLaunchLockDigest || null,
      cleanupScope: {
        protects: ['seller_annexure_a', 'seller_mandate', 'seller_otp_document_context', 'signed_otp_attorney_instruction'],
        nextWork: 'lead_listing_legacy_smoke_cleanup',
      },
      rollbackPosture: {
        mutatedApplicationData: false,
        databaseRollbackRequired: false,
        templateRollbackRequired: false,
      },
      mutatedData: false,
    }
    : null
  if (freeze) freeze.freezeDigest = buildFreezeDigest({ releaseGate, sourceDrift })

  console.log(JSON.stringify({
    phase: '0',
    contract: FREEZE_CONTRACT,
    status: frozen ? 'DOCUMENT_GENERATION_BASELINE_FROZEN' : 'DOCUMENT_GENERATION_BASELINE_HOLD',
    frozen,
    blockerCount: blockers.length,
    blockers,
    freeze,
    gates: {
      releaseGate: {
        exitCode: releaseGateRun.exitCode,
        status: releaseGate?.status || null,
        contractVersion: releaseGate?.contractVersion || null,
        summary: releaseGate?.summary || null,
        stdoutTail: tailOutput(releaseGateRun.stdout),
        stderrTail: tailOutput(releaseGateRun.stderr),
      },
      otpGuards: otpGuardRuns.map((result) => ({
        key: result.key,
        label: result.label,
        command: result.command,
        exitCode: result.exitCode,
        status: result.exitCode === 0 ? 'pass' : 'fail',
        durationMs: result.durationMs,
        stdoutTail: tailOutput(result.stdout),
        stderrTail: tailOutput(result.stderr),
      })),
      sourceDrift: {
        exitCode: sourceDriftRun.exitCode,
        status: sourceDrift?.status || null,
        contract: sourceDrift?.contract || null,
        guarded: Boolean(sourceDrift?.guarded),
        blockerCount: sourceDrift?.blockerCount ?? null,
        guardDigest: sourceDrift?.guard?.guardDigest || null,
        stdoutTail: tailOutput(sourceDriftRun.stdout),
        stderrTail: tailOutput(sourceDriftRun.stderr),
      },
    },
    startedAt,
    checkedAt: new Date().toISOString(),
    mutatedData: false,
  }, null, 2))

  if (!frozen) process.exitCode = 1
}

main().catch((error) => {
  console.error(`Document generation cleanup Phase 0 freeze failed: ${error?.message || error}`)
  process.exitCode = 1
})
