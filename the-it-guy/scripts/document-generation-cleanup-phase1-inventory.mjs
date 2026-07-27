import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

const INVENTORY_CONTRACT = 'document_generation_cleanup_phase1_legacy_inventory_v1'
const PHASE0_CONTRACT = 'document_generation_cleanup_phase0_freeze_v1'

const EXPECTED_LEGACY_BLOCKERS = Object.freeze([])

function sha256(value = '') {
  return createHash('sha256').update(value).digest('hex')
}

function tailOutput(value = '', maxLines = 40) {
  return String(value || '').split(/\r?\n/).filter(Boolean).slice(-maxLines).join('\n')
}

function normalizeFailureText(value = '') {
  return String(value || '').replace(/\\/g, '')
}

function hasFailureMarker(output = '', marker = '') {
  return String(output || '').includes(marker) || normalizeFailureText(output).includes(normalizeFailureText(marker))
}

function extractJsonObject(output = '') {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not parse JSON output from Phase 0 freeze.')
  }
  return JSON.parse(output.slice(start, end + 1))
}

function runCommand({ key, label, command, args }) {
  const startedMs = Date.now()
  process.stderr.write(`\n[document-generation-cleanup-phase1] ${label}\n`)
  process.stderr.write(`[document-generation-cleanup-phase1] $ ${[command, ...args].join(' ')}\n`)

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
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
        stdout,
        stderr,
      })
    })
  })
}

function buildInventoryDigest({ phase0 = {}, capturedBlockers = [] }) {
  return sha256(JSON.stringify({
    contract: INVENTORY_CONTRACT,
    phase0FreezeDigest: phase0.freeze?.freezeDigest || null,
    blockerKeys: capturedBlockers.map((blocker) => blocker.key).sort(),
    nextPhases: capturedBlockers.map((blocker) => blocker.nextPhase).sort(),
  }))
}

async function main() {
  const startedAt = new Date().toISOString()
  const blockers = []
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

  const phase0Run = await runCommand({
    key: 'phase0_document_generation_freeze',
    label: 'Phase 0 protected document generation freeze',
    command: npmCommand,
    args: ['run', '--silent', 'verify:document-generation:cleanup-phase0'],
  })

  let phase0 = null
  try {
    phase0 = extractJsonObject(phase0Run.stdout)
  } catch (error) {
    blockers.push({ code: 'phase1_phase0_output_invalid', detail: error?.message || String(error) })
  }

  if (
    phase0Run.exitCode !== 0 ||
    phase0?.contract !== PHASE0_CONTRACT ||
    phase0?.status !== 'DOCUMENT_GENERATION_BASELINE_FROZEN' ||
    phase0?.frozen !== true ||
    phase0?.blockerCount !== 0
  ) {
    blockers.push({
      code: 'phase1_document_generation_baseline_not_frozen',
      detail: `Phase 0 status is ${phase0?.status || 'missing'} with ${phase0?.blockerCount ?? 'unknown'} blocker(s).`,
    })
  }

  const legacyRuns = []
  for (const expected of EXPECTED_LEGACY_BLOCKERS) {
    const result = await runCommand({
      key: expected.key,
      label: expected.plainEnglish,
      command: npmCommand,
      args: ['run', '--silent', expected.script],
    })
    const combinedOutput = `${result.stdout}\n${result.stderr}`
    const missingMarkers = expected.expectedMarkers.filter((marker) => !hasFailureMarker(combinedOutput, marker))
    const captured = result.exitCode !== 0 && missingMarkers.length === 0
    legacyRuns.push({
      ...expected,
      command: result.command,
      exitCode: result.exitCode,
      status: captured ? 'captured' : result.exitCode === 0 ? 'unexpected_pass' : 'changed_failure',
      durationMs: result.durationMs,
      missingMarkers,
      stdoutTail: tailOutput(result.stdout),
      stderrTail: tailOutput(result.stderr),
    })

    if (!captured) {
      blockers.push({
        code: `phase1_${expected.key}_${result.exitCode === 0 ? 'unexpected_pass' : 'changed_failure'}`,
        detail: result.exitCode === 0
          ? `${expected.script} passed before its cleanup phase removed it from the inventory.`
          : `${expected.script} failed differently; missing marker(s): ${missingMarkers.join(', ') || 'none'}.`,
      })
    }
  }

  const capturedBlockers = legacyRuns.filter((run) => run.status === 'captured')
  const captured = blockers.length === 0
  const inventory = captured
    ? {
      contract: INVENTORY_CONTRACT,
      status: 'captured',
      capturedAt: new Date().toISOString(),
      documentBaselineStatus: phase0.status,
      phase0FreezeDigest: phase0.freeze?.freezeDigest || null,
      knownLegacyBlockerCount: capturedBlockers.length,
      knownLegacyBlockers: capturedBlockers.map((run) => ({
        key: run.key,
        area: run.area,
        script: run.script,
        plainEnglish: run.plainEnglish,
        nextPhase: run.nextPhase,
      })),
      cleanupScope: {
        protects: ['seller_annexure_a', 'seller_mandate', 'seller_otp_document_context', 'signed_otp_attorney_instruction'],
        excludesFromPhase1: ['template_rendering_changes', 'database_migrations', 'roleplayer_document_adapter_rewrites'],
        nextWork: 'legacy_cleanup_complete',
      },
      rollbackPosture: {
        mutatedApplicationData: false,
        databaseRollbackRequired: false,
        templateRollbackRequired: false,
      },
      mutatedData: false,
    }
    : null
  if (inventory) inventory.inventoryDigest = buildInventoryDigest({ phase0, capturedBlockers })

  console.log(JSON.stringify({
    phase: '1',
    contract: INVENTORY_CONTRACT,
    status: captured ? 'DOCUMENT_GENERATION_LEGACY_SMOKE_INVENTORY_CAPTURED' : 'DOCUMENT_GENERATION_LEGACY_SMOKE_INVENTORY_HOLD',
    captured,
    blockerCount: blockers.length,
    blockers,
    inventory,
    gates: {
      phase0: {
        exitCode: phase0Run.exitCode,
        status: phase0?.status || null,
        frozen: Boolean(phase0?.frozen),
        freezeDigest: phase0?.freeze?.freezeDigest || null,
        stdoutTail: tailOutput(phase0Run.stdout),
        stderrTail: tailOutput(phase0Run.stderr),
      },
      legacyBlockers: legacyRuns,
    },
    startedAt,
    checkedAt: new Date().toISOString(),
    mutatedData: false,
  }, null, 2))

  if (!captured) process.exitCode = 1
}

main().catch((error) => {
  console.error(`Document generation cleanup Phase 1 inventory failed: ${error?.message || error}`)
  process.exitCode = 1
})
