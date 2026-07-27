import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const PHASE4_CONTRACT = 'document_generation_cleanup_phase4_listing_followups_contract_v1'
const PHASE0_CONTRACT = 'document_generation_cleanup_phase0_freeze_v1'

const RESOLVED_BLOCKERS = Object.freeze([
  Object.freeze({
    key: 'agency_rls_manual_listing_followups_copy',
    script: 'test:agency-rls-manual-audit',
    resolvedMarker: 'Listing follow-ups',
    previousFailureMarker: 'Listing page manual intervention coverage is missing "Listing follow-ups"',
    plainEnglish: 'Listing cards now show an explicit follow-up preview heading.',
  }),
  Object.freeze({
    key: 'manual_listing_oversight_removed_followup_copy',
    script: 'test:manual-listing-oversight',
    resolvedMarker: 'Listing follow-ups',
    plainEnglish: 'The listing grid now keeps follow-up hints on individual cards without restoring the removed oversight panel.',
  }),
  Object.freeze({
    key: 'manual_listing_reminders_due_label_binding',
    script: 'test:manual-listing-reminders',
    resolvedMarker: 'item.reminderLabel',
    plainEnglish: 'Listing cards now render reminder labels beside follow-up items when due-state metadata exists.',
  }),
])

const RESOLVED_PASSING_SCRIPTS = Object.freeze([
  Object.freeze({
    key: 'manual_listing_oversight',
    script: 'test:manual-listing-oversight',
    plainEnglish: 'Listing grid oversight removal contract stays satisfied with card-level follow-ups.',
  }),
  Object.freeze({
    key: 'manual_listing_reminders',
    script: 'test:manual-listing-reminders',
    plainEnglish: 'Listing card reminder labels are rendered from the follow-up queue.',
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
  process.stderr.write(`\n[document-generation-cleanup-phase4] ${label}\n`)
  process.stderr.write(`[document-generation-cleanup-phase4] $ ${[command, ...args].join(' ')}\n`)

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
    contract: PHASE4_CONTRACT,
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
  for (const marker of ['Listing follow-ups', 'card.followUpQueue.slice(0, 3)', 'item.reminderLabel']) {
    if (!listingsPageSource.includes(marker)) {
      blockers.push({
        code: `phase4_listing_followup_marker_missing_${marker.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
        detail: `Listing cards must include "${marker}".`,
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
    blockers.push({ code: 'phase4_phase0_output_invalid', detail: error?.message || String(error) })
  }

  if (
    phase0Run.exitCode !== 0 ||
    phase0?.contract !== PHASE0_CONTRACT ||
    phase0?.status !== 'DOCUMENT_GENERATION_BASELINE_FROZEN' ||
    phase0?.frozen !== true ||
    phase0?.blockerCount !== 0
  ) {
    blockers.push({
      code: 'phase4_document_generation_baseline_not_frozen',
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
        code: `phase4_${expected.key}_not_resolved`,
        detail: `${expected.script} should pass after the listing follow-up preview change.`,
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

    if (expected.script === 'test:agency-rls-manual-audit' && combinedOutput.includes('Listing page manual intervention coverage is missing "Listing follow-ups"')) {
      blockers.push({
        code: 'phase4_listing_followups_blocker_still_present',
        detail: `${expected.script} still fails on the resolved listing follow-up marker.`,
      })
    }

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
        code: `phase4_${expected.key}_${result.exitCode === 0 ? 'unexpected_pass' : 'changed_failure'}`,
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
      contract: PHASE4_CONTRACT,
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
        changedSurface: 'listing_card_followup_preview',
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
    phase: '4',
    contract: PHASE4_CONTRACT,
    status: resolved ? 'DOCUMENT_GENERATION_CLEANUP_PHASE4_RESOLVED' : 'DOCUMENT_GENERATION_CLEANUP_PHASE4_HOLD',
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
  console.error(`Document generation cleanup Phase 4 failed: ${error?.message || error}`)
  process.exitCode = 1
})
