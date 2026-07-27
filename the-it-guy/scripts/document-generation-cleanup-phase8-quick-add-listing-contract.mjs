import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const PHASE8_CONTRACT = 'document_generation_cleanup_phase8_quick_add_listing_contract_v1'
const PHASE0_CONTRACT = 'document_generation_cleanup_phase0_freeze_v1'

const QUICK_ADD_CONTRACT_MARKERS = Object.freeze([
  "if (normalized === 'signed_uploaded') return 'signed_external_pending_upload'",
  'signed: false',
  'function resolveQuickListingStatus(form)',
  "return 'listing_review'",
  'function canQuickListingActivateWithMandateStatus()',
  'Manual mandate evidence upload outstanding',
])

const RESOLVED_BLOCKERS = Object.freeze([
  Object.freeze({
    key: 'quick_add_listing_old_signed_uploaded_transition',
    script: 'test:quick-add-listing-bypass',
    resolvedMarker: "if (normalized === 'signed_uploaded') return 'signed_external_pending_upload'",
    previousFailureMarker: "mandateStatus === 'signed_uploaded' ? 'signed_external_pending_upload' : mandateStatus",
    plainEnglish: 'Quick Add now verifies the canonical normalization helper instead of the removed inline signed-uploaded transition.',
  }),
  Object.freeze({
    key: 'quick_add_listing_local_active_promotion',
    script: 'test:quick-add-listing-bypass',
    resolvedMarker: 'function canQuickListingActivateWithMandateStatus()',
    previousFailureMarker: "sellerUpdatePayload.listingStatus = 'active'",
    plainEnglish: 'Quick Add now verifies that manual evidence cannot locally activate a listing without canonical packet completion.',
  }),
])

const RESOLVED_PASSING_SCRIPTS = Object.freeze([
  Object.freeze({
    key: 'quick_add_listing_contract',
    script: 'test:quick-add-listing-bypass',
    plainEnglish: 'Quick Add listing bypass contract now passes against the current evidence-only mandate flow.',
  }),
])

const EXPECTED_REMAINING_BLOCKERS = Object.freeze([])

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
  process.stderr.write(`\n[document-generation-cleanup-phase8] ${label}\n`)
  process.stderr.write(`[document-generation-cleanup-phase8] $ ${[command, ...args].join(' ')}\n`)

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

function buildPhaseDigest({ phase0 = {}, capturedBlockers = [], resolvedRuns = [] }) {
  return sha256(JSON.stringify({
    contract: PHASE8_CONTRACT,
    phase0FreezeDigest: phase0.freeze?.freezeDigest || null,
    resolvedBlockers: RESOLVED_BLOCKERS.map((blocker) => blocker.key).sort(),
    resolvedRunKeys: resolvedRuns.map((run) => run.key).sort(),
    remainingBlockerKeys: capturedBlockers.map((blocker) => blocker.key).sort(),
  }))
}

async function main() {
  const startedAt = new Date().toISOString()
  const blockers = []
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

  const listingsPageSource = await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
  const quickAddTestSource = await readFile(new URL('./quick-add-listing-bypass.test.mjs', import.meta.url), 'utf8')
  const combinedSource = `${listingsPageSource}\n${quickAddTestSource}`
  for (const marker of QUICK_ADD_CONTRACT_MARKERS) {
    if (!combinedSource.includes(marker)) {
      blockers.push({
        code: `phase8_quick_add_contract_marker_missing_${marker.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
        detail: `Quick Add listing contract must include "${marker}".`,
      })
    }
  }
  for (const legacyMarker of [
    "mandateStatus === 'signed_uploaded' ? 'signed_external_pending_upload' : mandateStatus",
    "sellerUpdatePayload.listingStatus = 'active'",
  ]) {
    if (quickAddTestSource.includes(legacyMarker)) {
      blockers.push({
        code: `phase8_quick_add_legacy_marker_still_present_${legacyMarker.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
        detail: `Quick Add listing contract should not require "${legacyMarker}".`,
      })
    }
  }

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
    blockers.push({ code: 'phase8_phase0_output_invalid', detail: error?.message || String(error) })
  }

  if (
    phase0Run.exitCode !== 0 ||
    phase0?.contract !== PHASE0_CONTRACT ||
    phase0?.status !== 'DOCUMENT_GENERATION_BASELINE_FROZEN' ||
    phase0?.frozen !== true ||
    phase0?.blockerCount !== 0
  ) {
    blockers.push({
      code: 'phase8_document_generation_baseline_not_frozen',
      detail: `Phase 0 status is ${phase0?.status || 'missing'} with ${phase0?.blockerCount ?? 'unknown'} blocker(s).`,
    })
  }

  const resolvedRuns = []
  for (const expected of RESOLVED_PASSING_SCRIPTS) {
    const result = await runCommand({
      key: expected.key,
      label: expected.plainEnglish,
      command: npmCommand,
      args: ['run', '--silent', expected.script],
    })
    const combinedOutput = `${result.stdout}\n${result.stderr}`
    resolvedRuns.push({
      ...expected,
      command: result.command,
      exitCode: result.exitCode,
      status: result.exitCode === 0 ? 'pass' : 'fail',
      durationMs: result.durationMs,
      stdoutTail: tailOutput(result.stdout),
      stderrTail: tailOutput(result.stderr),
    })
    if (result.exitCode !== 0) {
      blockers.push({
        code: `phase8_${expected.key}_not_resolved`,
        detail: `${expected.script} should pass after the Quick Add listing contract cleanup. ${tailOutput(combinedOutput, 8)}`,
      })
    }
    if (hasFailureMarker(combinedOutput, "mandateStatus === 'signed_uploaded' ? 'signed_external_pending_upload' : mandateStatus")) {
      blockers.push({
        code: 'phase8_quick_add_old_transition_blocker_still_present',
        detail: `${expected.script} still fails on the old signed-uploaded transition marker.`,
      })
    }
  }

  const legacyRuns = []
  for (const expected of EXPECTED_REMAINING_BLOCKERS) {
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
        code: `phase8_${expected.key}_${result.exitCode === 0 ? 'unexpected_pass' : 'changed_failure'}`,
        detail: result.exitCode === 0
          ? `${expected.script} passed before its cleanup phase removed it from the remaining inventory.`
          : `${expected.script} failed differently; missing marker(s): ${missingMarkers.join(', ') || 'none'}.`,
      })
    }
  }

  const capturedBlockers = legacyRuns.filter((run) => run.status === 'captured')
  const resolved = blockers.length === 0
  const phase = resolved
    ? {
      contract: PHASE8_CONTRACT,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      documentBaselineStatus: phase0.status,
      phase0FreezeDigest: phase0.freeze?.freezeDigest || null,
      resolvedBlockers: RESOLVED_BLOCKERS,
      resolvedPassingScripts: resolvedRuns.map((run) => ({ key: run.key, script: run.script, status: run.status })),
      remainingLegacyBlockerCount: capturedBlockers.length,
      remainingLegacyBlockers: capturedBlockers.map((run) => ({
        key: run.key,
        area: run.area,
        script: run.script,
        plainEnglish: run.plainEnglish,
        nextPhase: run.nextPhase,
      })),
      cleanupScope: {
        protects: ['seller_annexure_a', 'seller_mandate', 'seller_otp_document_context', 'signed_otp_attorney_instruction'],
        changedSurface: 'quick_add_listing_contract',
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
  if (phase) phase.phaseDigest = buildPhaseDigest({ phase0, capturedBlockers, resolvedRuns })

  console.log(JSON.stringify({
    phase: '8',
    contract: PHASE8_CONTRACT,
    status: resolved ? 'DOCUMENT_GENERATION_CLEANUP_PHASE8_RESOLVED' : 'DOCUMENT_GENERATION_CLEANUP_PHASE8_HOLD',
    resolved,
    blockerCount: blockers.length,
    blockers,
    result: phase,
    gates: {
      phase0: {
        exitCode: phase0Run.exitCode,
        status: phase0?.status || null,
        frozen: Boolean(phase0?.frozen),
        freezeDigest: phase0?.freeze?.freezeDigest || null,
        stdoutTail: tailOutput(phase0Run.stdout),
        stderrTail: tailOutput(phase0Run.stderr),
      },
      resolvedPassingScripts: resolvedRuns,
      remainingLegacyBlockers: legacyRuns,
    },
    startedAt,
    checkedAt: new Date().toISOString(),
    mutatedData: false,
  }, null, 2))

  if (!resolved) process.exitCode = 1
}

main().catch((error) => {
  console.error(`Document generation cleanup Phase 8 failed: ${error?.message || error}`)
  process.exitCode = 1
})
