import { spawnSync } from 'node:child_process'

export const ROLLOUT_CONTROL_RECEIPT_PATHS = Object.freeze([
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json',
  'the-it-guy/config/legal-document-rollout-phase1-staging.json',
  'the-it-guy/config/legal-document-rollout-phase2-staging-acceptance.json',
  'the-it-guy/config/legal-document-rollout-phase3-production-preflight.json',
  'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json',
  'the-it-guy/config/legal-document-rollout-phase5-pilot-observation.json',
])

function runGit(repoRoot, args, { binary = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: binary ? null : 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: binary ? Buffer.from(result.stdout || []) : String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  }
}

function commitSha(repoRoot, value) {
  const candidate = String(value || '').trim()
  if (!/^[0-9a-f]{40}$/i.test(candidate)) return ''
  const result = runGit(repoRoot, ['rev-parse', '--verify', `${candidate}^{commit}`])
  return result.ok ? result.stdout.trim().toLowerCase() : ''
}

function invalid({
  sourceCommitSha = null,
  currentCommitSha = null,
  reason,
  commits = [],
  changedPaths = [],
  phase0FreezeChangeCount = 0,
  phase1ReceiptChangeCount = 0,
  phase2ReceiptChangeCount = 0,
  phase3ReceiptChangeCount = 0,
  phase4ReceiptChangeCount = 0,
  phase5ReceiptChangeCount = 0,
} = {}) {
  return {
    status: 'INVALID',
    sourceCommitSha,
    currentCommitSha,
    reason,
    commits,
    changedPaths,
    phase0FreezeChangeCount,
    phase1ReceiptChangeCount,
    phase2ReceiptChangeCount,
    phase3ReceiptChangeCount,
    phase4ReceiptChangeCount,
    phase5ReceiptChangeCount,
  }
}

function rawCommitChanges(repoRoot, commit) {
  const result = runGit(repoRoot, ['diff-tree', '--no-commit-id', '--raw', '--full-index', '-r', '--no-renames', '-z', commit], { binary: true })
  if (!result.ok) return { ok: false, reason: result.stderr || 'git diff-tree failed.' }
  const tokens = result.stdout.toString('utf8').split('\0').filter(Boolean)
  if (tokens.length % 2 !== 0) return { ok: false, reason: 'Unexpected raw Git diff format.' }
  const changes = []
  for (let index = 0; index < tokens.length; index += 2) {
    const header = tokens[index]
    const file = tokens[index + 1]
    const match = header.match(/^:([0-7]{6}) ([0-7]{6}) [0-9a-f]{40} [0-9a-f]{40} ([A-Z])$/)
    if (!match || !file) return { ok: false, reason: 'Unexpected raw Git change record.' }
    changes.push({ oldMode: match[1], newMode: match[2], status: match[3], file })
  }
  return { ok: true, changes }
}

function regularReceiptChange(change) {
  if (!ROLLOUT_CONTROL_RECEIPT_PATHS.includes(change.file)) return false
  // Every receipt placeholder must already be present in the frozen source.
  // Allowing an add here would let a later rollout phase smuggle a new
  // control surface into an otherwise immutable release chain.
  return change.status === 'M' && change.oldMode === '100644' && change.newMode === '100644'
}

/**
 * Proves that the current commit is either the frozen source itself or a
 * linear chain of regular-file receipt-only commits. It inspects every commit
 * rather than just the final tree so a source change/revert cannot hide in the
 * release history. This helper is read-only and never contacts a remote.
 */
export function collectRolloutSourceContinuity({ repoRoot, sourceCommit, currentCommit } = {}) {
  const sourceCommitSha = commitSha(repoRoot, sourceCommit)
  const currentCommitSha = commitSha(repoRoot, currentCommit)
  if (!sourceCommitSha || !currentCommitSha) {
    return invalid({ sourceCommitSha: sourceCommitSha || null, currentCommitSha: currentCommitSha || null, reason: 'Source and current values must resolve to Git commits.' })
  }
  if (sourceCommitSha === currentCommitSha) {
    return {
      status: 'EXACT',
      sourceCommitSha,
      currentCommitSha,
      reason: null,
      commits: [],
      changedPaths: [],
      phase0FreezeChangeCount: 0,
      phase1ReceiptChangeCount: 0,
      phase2ReceiptChangeCount: 0,
      phase3ReceiptChangeCount: 0,
      phase4ReceiptChangeCount: 0,
      phase5ReceiptChangeCount: 0,
    }
  }
  if (!runGit(repoRoot, ['merge-base', '--is-ancestor', sourceCommitSha, currentCommitSha]).ok) {
    return invalid({ sourceCommitSha, currentCommitSha, reason: 'Frozen source is not an ancestor of the current commit.' })
  }
  const mergeCommits = runGit(repoRoot, ['rev-list', '--merges', `${sourceCommitSha}..${currentCommitSha}`])
  if (!mergeCommits.ok) return invalid({ sourceCommitSha, currentCommitSha, reason: mergeCommits.stderr || 'Could not inspect merge commits.' })
  if (mergeCommits.stdout.trim()) {
    return invalid({ sourceCommitSha, currentCommitSha, reason: 'Receipt-only continuity does not permit merge commits.' })
  }
  const commitList = runGit(repoRoot, ['rev-list', '--reverse', `${sourceCommitSha}..${currentCommitSha}`])
  if (!commitList.ok) return invalid({ sourceCommitSha, currentCommitSha, reason: commitList.stderr || 'Could not enumerate receipt commits.' })
  const commits = []
  const changedPaths = []
  let phase0FreezeChangeCount = 0
  let phase1ReceiptChangeCount = 0
  let phase2ReceiptChangeCount = 0
  let phase3ReceiptChangeCount = 0
  let phase4ReceiptChangeCount = 0
  let phase5ReceiptChangeCount = 0
  let phase2ReceiptSeen = false
  let phase3ReceiptSeen = false
  let phase4ReceiptSeen = false
  let phase5ReceiptSeen = false
  const orderedCommits = commitList.stdout.split('\n').map((value) => value.trim()).filter(Boolean)
  for (const [commitIndex, commit] of orderedCommits.entries()) {
    const parents = runGit(repoRoot, ['show', '-s', '--format=%P', commit])
    const parentShas = parents.ok ? parents.stdout.trim().split(/\s+/).filter(Boolean) : []
    if (parentShas.length !== 1) {
      return invalid({ sourceCommitSha, currentCommitSha, reason: `Receipt commit ${commit} is not a linear single-parent commit.`, commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
    }
    const raw = rawCommitChanges(repoRoot, commit)
    if (!raw.ok || !raw.changes.length) {
      return invalid({ sourceCommitSha, currentCommitSha, reason: raw.reason || `Receipt commit ${commit} contains no regular changes.`, commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
    }
    const commitPaths = raw.changes.map((change) => change.file)
    const changesPhase2Receipt = commitPaths.includes(ROLLOUT_CONTROL_RECEIPT_PATHS[2])
    const changesPhase3Receipt = commitPaths.includes(ROLLOUT_CONTROL_RECEIPT_PATHS[3])
    const changesPhase4Receipt = commitPaths.includes(ROLLOUT_CONTROL_RECEIPT_PATHS[4])
    const changesPhase5Receipt = commitPaths.includes(ROLLOUT_CONTROL_RECEIPT_PATHS[5])
    if (phase5ReceiptSeen) {
      return invalid({ sourceCommitSha, currentCommitSha, reason: 'No receipt commit may follow the one-time Phase 5 pilot-observation receipt.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount, phase5ReceiptChangeCount })
    }
    if (phase4ReceiptSeen && !changesPhase5Receipt) {
      return invalid({ sourceCommitSha, currentCommitSha, reason: 'The one-time Phase 4 controlled-pilot receipt may be followed only by the one-time Phase 5 pilot-observation receipt.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount, phase5ReceiptChangeCount })
    }
    if (phase3ReceiptSeen && changesPhase3Receipt) {
      return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 3 production-preflight receipt may be recorded exactly once; further rewrites are not permitted.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
    }
    if (phase3ReceiptSeen && !changesPhase4Receipt && !(phase4ReceiptSeen && changesPhase5Receipt)) {
      return invalid({ sourceCommitSha, currentCommitSha, reason: 'The one-time Phase 3 production-preflight receipt may be followed only by the one-time Phase 4 controlled-pilot receipt.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount, phase5ReceiptChangeCount })
    }
    if (phase2ReceiptSeen && changesPhase2Receipt) {
      return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 2 acceptance receipt may be recorded exactly once; further rewrites are not permitted.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
    }
    // Once the Phase 3 receipt has been seen, its sole allowed successor is
    // Phase 4, and Phase 4's sole allowed successor is Phase 5. Without the
    // two exceptions, the older Phase-2 successor rule would reject a valid
    // P0→P5 chain before the later branches can validate it.
    if (phase2ReceiptSeen && !changesPhase3Receipt && !(phase3ReceiptSeen && changesPhase4Receipt) && !(phase4ReceiptSeen && changesPhase5Receipt)) {
      return invalid({ sourceCommitSha, currentCommitSha, reason: 'The one-time Phase 2 acceptance receipt may be followed only by the one-time Phase 3 production-preflight receipt.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount, phase5ReceiptChangeCount })
    }
    if (changesPhase2Receipt) {
      if (commitPaths.length !== 1 || commitPaths[0] !== ROLLOUT_CONTROL_RECEIPT_PATHS[2]) {
        return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 2 acceptance receipt must be its own single-file commit.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
      }
      if (phase1ReceiptChangeCount !== 2) {
        return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 2 acceptance receipt may be committed only after the pending and evidence-recorded Phase 1 receipts.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
      }
      if (phase2ReceiptChangeCount !== 0) {
        return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 2 acceptance receipt may be recorded exactly once; further rewrites are not permitted.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
      }
      phase2ReceiptSeen = true
    }
    if (changesPhase3Receipt) {
      if (commitPaths.length !== 1 || commitPaths[0] !== ROLLOUT_CONTROL_RECEIPT_PATHS[3]) {
        return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 3 production-preflight receipt must be its own single-file commit.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
      }
      if (phase1ReceiptChangeCount !== 2 || phase2ReceiptChangeCount !== 1) {
        return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 3 production-preflight receipt may be committed only after the two Phase 1 receipts and one Phase 2 acceptance receipt.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
      }
      if (phase3ReceiptChangeCount !== 0) {
        return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 3 production-preflight receipt may be recorded exactly once; further rewrites are not permitted.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
      }
      phase3ReceiptSeen = true
    }
    if (changesPhase4Receipt) {
      if (commitPaths.length !== 1 || commitPaths[0] !== ROLLOUT_CONTROL_RECEIPT_PATHS[4]) {
        return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 4 controlled-pilot receipt must be its own single-file commit.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
      }
      if (phase1ReceiptChangeCount !== 2 || phase2ReceiptChangeCount !== 1 || phase3ReceiptChangeCount !== 1) {
        return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 4 controlled-pilot receipt may be committed only after the two Phase 1 receipts, Phase 2 acceptance receipt, and Phase 3 production-preflight receipt.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
      }
      if (phase4ReceiptChangeCount !== 0) {
        return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 4 controlled-pilot receipt may be recorded exactly once; further rewrites are not permitted.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
      }
      phase4ReceiptSeen = true
    }
    if (changesPhase5Receipt) {
      if (commitPaths.length !== 1 || commitPaths[0] !== ROLLOUT_CONTROL_RECEIPT_PATHS[5]) {
        return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 5 pilot-observation receipt must be its own single-file commit.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount, phase5ReceiptChangeCount })
      }
      if (phase1ReceiptChangeCount !== 2 || phase2ReceiptChangeCount !== 1 || phase3ReceiptChangeCount !== 1 || phase4ReceiptChangeCount !== 1) {
        return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 5 pilot-observation receipt may be committed only after the two Phase 1 receipts and the one-time Phase 2, 3, and 4 receipts.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount, phase5ReceiptChangeCount })
      }
      if (phase5ReceiptChangeCount !== 0) {
        return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 5 pilot-observation receipt may be recorded exactly once; further rewrites are not permitted.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount, phase5ReceiptChangeCount })
      }
      phase5ReceiptSeen = true
    }
    for (const change of raw.changes) {
      if (!regularReceiptChange(change)) {
        return invalid({ sourceCommitSha, currentCommitSha, reason: `Receipt commit ${commit} changes a non-receipt path or file mode: ${change.file}.`, commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
      }
      if (change.file === ROLLOUT_CONTROL_RECEIPT_PATHS[0]) phase0FreezeChangeCount += 1
      if (change.file === ROLLOUT_CONTROL_RECEIPT_PATHS[1]) phase1ReceiptChangeCount += 1
      if (change.file === ROLLOUT_CONTROL_RECEIPT_PATHS[2]) phase2ReceiptChangeCount += 1
      if (change.file === ROLLOUT_CONTROL_RECEIPT_PATHS[3]) phase3ReceiptChangeCount += 1
      if (change.file === ROLLOUT_CONTROL_RECEIPT_PATHS[4]) phase4ReceiptChangeCount += 1
      if (change.file === ROLLOUT_CONTROL_RECEIPT_PATHS[5]) phase5ReceiptChangeCount += 1
      changedPaths.push(change.file)
    }
    if (commitIndex === 0 && (commitPaths.length !== 1 || commitPaths[0] !== ROLLOUT_CONTROL_RECEIPT_PATHS[0])) {
      return invalid({ sourceCommitSha, currentCommitSha, reason: 'The first descendant commit must create only the Phase 0 freeze receipt.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
    }
    commits.push({ sha: commit, changedPaths: raw.changes.map((change) => change.file) })
  }
  if (phase0FreezeChangeCount !== 1) {
    return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 0 freeze receipt must be created exactly once in the descendant receipt chain.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
  }
  if (phase1ReceiptChangeCount > 2) {
    return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 1 staging receipt may be recorded once as pending and once as evidence-recorded; further rewrites are not permitted.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
  }
  if (phase2ReceiptChangeCount > 1) {
    return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 2 acceptance receipt may be recorded exactly once; further rewrites are not permitted.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
  }
  if (phase2ReceiptChangeCount && phase1ReceiptChangeCount !== 2) {
    return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 2 acceptance receipt requires exactly two prior Phase 1 receipt changes.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
  }
  if (phase3ReceiptChangeCount > 1) {
    return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 3 production-preflight receipt may be recorded exactly once; further rewrites are not permitted.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
  }
  if (phase3ReceiptChangeCount && (phase1ReceiptChangeCount !== 2 || phase2ReceiptChangeCount !== 1)) {
    return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 3 production-preflight receipt requires exactly two Phase 1 receipt changes and one prior Phase 2 acceptance receipt.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
  }
  if (phase4ReceiptChangeCount > 1) {
    return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 4 controlled-pilot receipt may be recorded exactly once; further rewrites are not permitted.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
  }
  if (phase4ReceiptChangeCount && (phase1ReceiptChangeCount !== 2 || phase2ReceiptChangeCount !== 1 || phase3ReceiptChangeCount !== 1)) {
    return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 4 controlled-pilot receipt requires exactly two Phase 1 receipts, one Phase 2 acceptance receipt, and one Phase 3 preflight receipt.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
  }
  if (phase5ReceiptChangeCount > 1) {
    return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 5 pilot-observation receipt may be recorded exactly once; further rewrites are not permitted.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount, phase5ReceiptChangeCount })
  }
  if (phase5ReceiptChangeCount && (phase1ReceiptChangeCount !== 2 || phase2ReceiptChangeCount !== 1 || phase3ReceiptChangeCount !== 1 || phase4ReceiptChangeCount !== 1)) {
    return invalid({ sourceCommitSha, currentCommitSha, reason: 'The Phase 5 pilot-observation receipt requires two Phase 1 receipts and one prior Phase 2, 3, and 4 receipt.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount, phase5ReceiptChangeCount })
  }
  const finalPaths = runGit(repoRoot, ['diff', '--name-only', '--no-renames', `${sourceCommitSha}..${currentCommitSha}`])
  if (!finalPaths.ok) return invalid({ sourceCommitSha, currentCommitSha, reason: finalPaths.stderr || 'Could not inspect final receipt paths.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
  const finalChangedPaths = finalPaths.stdout.split('\n').map((value) => value.trim()).filter(Boolean)
  if (!finalChangedPaths.length || finalChangedPaths.some((file) => !ROLLOUT_CONTROL_RECEIPT_PATHS.includes(file))) {
    return invalid({ sourceCommitSha, currentCommitSha, reason: 'Final tree differs outside the exact receipt allowlist.', commits, changedPaths, phase0FreezeChangeCount, phase1ReceiptChangeCount, phase2ReceiptChangeCount, phase3ReceiptChangeCount, phase4ReceiptChangeCount })
  }
  return {
    status: 'RECEIPT_ONLY_DESCENDANT',
    sourceCommitSha,
    currentCommitSha,
    reason: null,
    commits,
    changedPaths: [...new Set(changedPaths)].sort(),
    phase0FreezeChangeCount,
    phase1ReceiptChangeCount,
    phase2ReceiptChangeCount,
    phase3ReceiptChangeCount,
    phase4ReceiptChangeCount,
    phase5ReceiptChangeCount,
  }
}
