import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const workspacePath = path.join(root, 'src', 'components', 'documents', 'LegalDocumentWorkspace.jsx')
const source = fs.readFileSync(workspacePath, 'utf8')

function assertIncludes(needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} is missing: ${needle}`)
  }
}

function assertMatches(pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label} did not match ${pattern}`)
  }
}

function sliceBetween(startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle)
  if (start < 0) throw new Error(`${label} start not found: ${startNeedle}`)
  const end = source.indexOf(endNeedle, start)
  if (end < 0) throw new Error(`${label} end not found: ${endNeedle}`)
  return source.slice(start, end)
}

assertIncludes('const WORKSPACE_STATUS_FRESH_MS = 2500', 'Phase 3 freshness window')
assertIncludes('const WORKSPACE_STATUS_REVALIDATION_DELAYS_MS = [1000, 4000]', 'Phase 3 draft revalidation cadence')
assertIncludes('const SIGNING_STATUS_REVALIDATION_DELAYS_MS = [800, 3000, 8000]', 'Phase 3 signing revalidation cadence')
assertIncludes('lastWorkspaceRefreshAtRef', 'Phase 3 freshness timestamp')
assertIncludes('scheduledWorkspaceRefreshTimersRef', 'Phase 3 scheduled refresh timer registry')
assertIncludes('refreshWorkspaceData = useCallback(async ({ force = false, allowStale = false } = {})', 'Phase 3 refresh options')
assertIncludes('!force && allowStale && hasLoadedWorkspaceSnapshot(currentStatus)', 'Phase 3 stale-aware refresh short circuit')
assertIncludes('skipped: true', 'Phase 3 skipped refresh marker')
assertIncludes('scheduleWorkspaceStatusRevalidation', 'Phase 3 background revalidation scheduler')
assertIncludes('scheduledWorkspaceRefreshTimersRef.current.clear()', 'Phase 3 scheduled refresh cleanup')
assertIncludes('refreshWorkspaceData({ allowStale: true })', 'Phase 3 pre-send fresh snapshot reuse')
assertIncludes('scheduleWorkspaceStatusRevalidation(\'draft status\')', 'Phase 3 generation background refresh')
assertIncludes('scheduleWorkspaceStatusRevalidation(\'signing status\', SIGNING_STATUS_REVALIDATION_DELAYS_MS)', 'Phase 3 send background refresh')

// Phase 2 moved the sent transition to the controlled email-delivery
// endpoint. The workspace must not fabricate a local sent state after a
// provider response; it refreshes the server-owned packet state and then
// revalidates it in the background.
if (source.includes('const sentStatus = {')) {
  throw new Error('Phase 3 signing delivery must not restore the retired browser-owned sent-state update.')
}
const sendStatusBlock = sliceBetween(
  '// `send-mandate-signing-email` atomically completes E4 and promotes the',
  'void appendDocumentPacketEvent({',
  'Phase 3 authoritative send status block',
)
assertMatches(
  /setActionProgressMessage\('Delivery confirmed\. Refreshing signing status…'\)[\s\S]*await refreshWorkspaceData\(\{ force: true \}\)[\s\S]*scheduleWorkspaceStatusRevalidation\('signing status', SIGNING_STATUS_REVALIDATION_DELAYS_MS\)/,
  'Phase 3 authoritative send refresh then scheduled revalidation',
)
if (sendStatusBlock.includes("transitionLifecycleState('sent')") || sendStatusBlock.includes('statusStateRef.current = sentStatus')) {
  throw new Error('Phase 3 send handling must not promote the packet lifecycle in the browser.')
}
assertMatches(
  /if \(generationResult\?\.status\) \{[\s\S]*statusStateRef\.current = generationResult\.status[\s\S]*setStatusState\(generationResult\.status\)[\s\S]*lastWorkspaceRefreshAtRef\.current = Date\.now\(\)/,
  'Phase 3 generation snapshot freshness marker',
)

console.log('document workspace refresh phase 3 checks passed')
