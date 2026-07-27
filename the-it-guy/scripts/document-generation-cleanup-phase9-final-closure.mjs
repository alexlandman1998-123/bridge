import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const PHASE9_CONTRACT = 'document_generation_cleanup_phase9_final_closure_v1'
const PHASE0_CONTRACT = 'document_generation_cleanup_phase0_freeze_v1'

const FINAL_CONTRACT_MARKERS = Object.freeze([
  'Manual intervention actions',
  'buildListingFollowUpQueue',
  'card.followUpQueue.slice(0, 3)',
  'item.reminderLabel',
  'handleSellerDocumentUpload',
  'sellerProfile.sections.map',
  'Complete skipped Quick Add fields without restarting seller onboarding.',
])

const RESOLVED_BLOCKERS = Object.freeze([
  Object.freeze({
    key: 'listing_workspace_legacy_followup_model',
    script: 'test:listing-workspace-followups',
    resolvedMarker: 'Manual intervention actions',
    previousFailureMarker: 'const followUpActions = useMemo',
    plainEnglish: 'Listing workspace follow-ups now verify the shared listing-card queue and seller-profile manual intervention surface instead of the removed local follow-up model.',
  }),
])

const FINAL_PASSING_SCRIPTS = Object.freeze([
  Object.freeze({
    key: 'agency_rls_manual_intervention_audit',
    script: 'test:agency-rls-manual-audit',
    plainEnglish: 'Agency RLS and manual-intervention coverage passes.',
  }),
  Object.freeze({
    key: 'lead_ingestion_contract',
    script: 'test:lead-ingestion',
    plainEnglish: 'Lead ingestion contract passes.',
  }),
  Object.freeze({
    key: 'lead_ingestion_review_contract',
    script: 'test:lead-ingestion-review',
    plainEnglish: 'Lead ingestion review contract passes.',
  }),
  Object.freeze({
    key: 'quick_add_listing_contract',
    script: 'test:quick-add-listing-bypass',
    plainEnglish: 'Quick Add listing bypass contract passes.',
  }),
  Object.freeze({
    key: 'listing_workspace_followups_contract',
    script: 'test:listing-workspace-followups',
    plainEnglish: 'Listing workspace follow-up contract passes.',
  }),
])

function sha256(value = '') {
  return createHash('sha256').update(value).digest('hex')
}

function tailOutput(value = '', maxLines = 40) {
  return String(value || '').split(/\r?\n/).filter(Boolean).slice(-maxLines).join('\n')
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
  process.stderr.write(`\n[document-generation-cleanup-phase9] ${label}\n`)
  process.stderr.write(`[document-generation-cleanup-phase9] $ ${[command, ...args].join(' ')}\n`)

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

function buildPhaseDigest({ phase0 = {}, resolvedRuns = [] }) {
  return sha256(JSON.stringify({
    contract: PHASE9_CONTRACT,
    phase0FreezeDigest: phase0.freeze?.freezeDigest || null,
    resolvedBlockers: RESOLVED_BLOCKERS.map((blocker) => blocker.key).sort(),
    finalRunKeys: resolvedRuns.map((run) => run.key).sort(),
    remainingBlockerKeys: [],
  }))
}

async function main() {
  const startedAt = new Date().toISOString()
  const blockers = []
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

  const listingDetailSource = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
  const listingsSource = await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
  const listingFollowupsTestSource = await readFile(new URL('./listing-workspace-followups.test.mjs', import.meta.url), 'utf8')
  const combinedSource = `${listingDetailSource}\n${listingsSource}\n${listingFollowupsTestSource}`

  for (const marker of FINAL_CONTRACT_MARKERS) {
    if (!combinedSource.includes(marker)) {
      blockers.push({
        code: `phase9_final_contract_marker_missing_${marker.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
        detail: `Final cleanup contract must include "${marker}".`,
      })
    }
  }
  if (listingFollowupsTestSource.includes('const followUpActions = useMemo')) {
    blockers.push({
      code: 'phase9_legacy_followup_actions_marker_still_present',
      detail: 'Listing workspace follow-up test should not require the removed local followUpActions model.',
    })
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
    blockers.push({ code: 'phase9_phase0_output_invalid', detail: error?.message || String(error) })
  }

  if (
    phase0Run.exitCode !== 0 ||
    phase0?.contract !== PHASE0_CONTRACT ||
    phase0?.status !== 'DOCUMENT_GENERATION_BASELINE_FROZEN' ||
    phase0?.frozen !== true ||
    phase0?.blockerCount !== 0
  ) {
    blockers.push({
      code: 'phase9_document_generation_baseline_not_frozen',
      detail: `Phase 0 status is ${phase0?.status || 'missing'} with ${phase0?.blockerCount ?? 'unknown'} blocker(s).`,
    })
  }

  const resolvedRuns = []
  for (const expected of FINAL_PASSING_SCRIPTS) {
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
        code: `phase9_${expected.key}_not_resolved`,
        detail: `${expected.script} should pass in the final cleanup closure.`,
      })
    }
  }

  const resolved = blockers.length === 0
  const phase = resolved
    ? {
      contract: PHASE9_CONTRACT,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      documentBaselineStatus: phase0.status,
      phase0FreezeDigest: phase0.freeze?.freezeDigest || null,
      resolvedBlockers: RESOLVED_BLOCKERS,
      finalPassingScripts: resolvedRuns.map((run) => ({ key: run.key, script: run.script, status: run.status })),
      remainingLegacyBlockerCount: 0,
      remainingLegacyBlockers: [],
      cleanupScope: {
        protects: ['seller_annexure_a', 'seller_mandate', 'seller_otp_document_context', 'signed_otp_attorney_instruction'],
        changedSurface: 'listing_workspace_followup_contract',
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
  if (phase) phase.phaseDigest = buildPhaseDigest({ phase0, resolvedRuns })

  console.log(JSON.stringify({
    phase: '9',
    contract: PHASE9_CONTRACT,
    status: resolved ? 'DOCUMENT_GENERATION_CLEANUP_PHASE9_COMPLETE' : 'DOCUMENT_GENERATION_CLEANUP_PHASE9_HOLD',
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
      finalPassingScripts: resolvedRuns,
      remainingLegacyBlockers: [],
    },
    startedAt,
    checkedAt: new Date().toISOString(),
    mutatedData: false,
  }, null, 2))

  if (!resolved) process.exitCode = 1
}

main().catch((error) => {
  console.error(`Document generation cleanup Phase 9 failed: ${error?.message || error}`)
  process.exitCode = 1
})
