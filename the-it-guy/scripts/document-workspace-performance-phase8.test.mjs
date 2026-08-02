import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const resolverPath = path.join(root, 'src', 'core', 'documents', 'packetStatusResolver.js')
const packetsApiPath = path.join(root, 'src', 'lib', 'documentPacketsApi.js')
const workspacePath = path.join(root, 'src', 'components', 'documents', 'LegalDocumentWorkspace.jsx')
const packagePath = path.join(root, 'package.json')

const resolverSource = fs.readFileSync(resolverPath, 'utf8')
const packetsApiSource = fs.readFileSync(packetsApiPath, 'utf8')
const workspaceSource = fs.readFileSync(workspacePath, 'utf8')
const pkg = fs.readFileSync(packagePath, 'utf8')

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} is missing: ${needle}`)
  }
}

assertIncludes(resolverSource, 'includeActivity = true', 'Phase 8 resolver activity option')
assertIncludes(resolverSource, "includeActivity === false ? 'no_activity' : 'activity'", 'Phase 8 activity-aware status cache key')
assertIncludes(resolverSource, 'includeActivity: includeActivity !== false', 'Phase 8 fast status activity propagation')
assertIncludes(resolverSource, 'includeEvents: includeActivity !== false', 'Phase 8 fallback packet activity guard')
assertIncludes(resolverSource, 'if (includeActivity !== false && !Array.isArray(packet.events))', 'Phase 8 fallback event fetch guard')
assertIncludes(resolverSource, 'eventLimit: activityLimit', 'Phase 8 fallback event limit propagation')

assertIncludes(packetsApiSource, 'eventLimit = 100', 'Phase 8 packet event limit option')
assertIncludes(packetsApiSource, 'Math.max(0, Math.min(Number(eventLimit || 100), 250))', 'Phase 8 packet event limit cap')
assertIncludes(packetsApiSource, 'eventsQuery = eventsQuery.limit(resolvedEventLimit)', 'Phase 8 packet event query limit')

assertIncludes(workspaceSource, 'includeEvents = true', 'Phase 8 workspace refresh event option')
assertIncludes(workspaceSource, 'fetchDocumentPacket(resolvedPacketId, { includeVersions: false, includeEvents })', 'Phase 8 workspace refresh event propagation')
assertIncludes(workspaceSource, 'refreshWorkspaceData({ force: true, includeEvents: false })', 'Phase 8 background refresh avoids audit event fetch')

assertIncludes(
  pkg,
  '"test:document-workspace-performance-phase8": "node scripts/document-workspace-performance-phase8.test.mjs"',
  'Phase 8 package script',
)

console.log('document workspace performance phase 8 checks passed')
