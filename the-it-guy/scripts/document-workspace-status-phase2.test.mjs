import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const migrationPath = path.join(root, '..', 'supabase', 'migrations', '202607220001_document_workspace_status_phase2.sql')
const apiPath = path.join(root, 'src', 'lib', 'documentPacketsApi.js')
const resolverPath = path.join(root, 'src', 'core', 'documents', 'packetStatusResolver.js')

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} is missing: ${needle}`)
  }
}

function assertMatches(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label} did not match ${pattern}`)
  }
}

const migration = read(migrationPath)
const api = read(apiPath)
const resolver = read(resolverPath)

assertIncludes(migration, 'bridge_get_document_workspace_status_p2', 'Phase 2 workspace status migration')
assertIncludes(migration, "'p2-document-workspace-status-v1'", 'Phase 2 workspace status contract')
assertIncludes(migration, "'mutatedData', false", 'Phase 2 workspace status read-only marker')
assertIncludes(migration, 'public.bridge_can_access_legal_packet_h2', 'Phase 2 workspace status access guard')
assertIncludes(migration, 'from public.document_packet_versions', 'Phase 2 workspace status versions query')
assertIncludes(migration, 'from public.document_packet_signers', 'Phase 2 workspace status signers query')
assertIncludes(migration, 'from public.document_signing_fields', 'Phase 2 workspace status fields query')
assertIncludes(migration, 'from public.document_packet_events', 'Phase 2 workspace status activity query')
assertIncludes(migration, 'p_include_activity', 'Phase 2 workspace status activity switch')
assertIncludes(migration, 'grant execute on function public.bridge_get_document_workspace_status_p2', 'Phase 2 workspace status grants')
assertIncludes(migration, 'to authenticated, service_role', 'Phase 2 workspace status role grants')
assertIncludes(migration, 'revoke all on function public.bridge_get_document_workspace_status_p2', 'Phase 2 workspace status public revoke')

assertIncludes(api, 'export async function getDocumentWorkspaceStatusFast', 'document packet API fast helper')
assertIncludes(api, "client.rpc('bridge_get_document_workspace_status_p2'", 'document packet API fast RPC call')
assertIncludes(api, "data.contract !== 'p2-document-workspace-status-v1'", 'document packet API contract guard')
assertIncludes(api, 'hydratePacketVersionAccessUrls(client, item)', 'document packet API version hydration')
assertIncludes(api, 'buildDocumentPacketSigningSummary(packet, rawFields, rawSigners)', 'document packet API shared signing summary')
assertIncludes(api, 'export async function getDocumentPacketSigningSummary', 'document packet API fallback signing summary')

assertIncludes(resolver, 'getDocumentWorkspaceStatusFast', 'packet status resolver fast helper import')
assertIncludes(resolver, 'isWorkspaceStatusFastPathUnavailable', 'packet status resolver fast-path fallback detector')
assertIncludes(resolver, 'includeActivity: true', 'packet status resolver fast activity inclusion')
assertIncludes(resolver, 'activityLimit: 25', 'packet status resolver fast activity cap')
assertIncludes(resolver, 'if (!fastPathResolved)', 'packet status resolver fallback guard')
assertIncludes(resolver, 'fetchDocumentPacket(normalizedPacketId', 'packet status resolver packet fallback')
assertIncludes(resolver, 'listDocumentPacketVersions(packet.id)', 'packet status resolver versions fallback')
assertIncludes(resolver, 'getDocumentPacketSigningSummary({', 'packet status resolver signing fallback')
assertMatches(
  resolver,
  /code === '42883'[\s\S]*code === 'PGRST202'[\s\S]*bridge_get_document_workspace_status_p2/,
  'packet status resolver missing-RPC fallback',
)

console.log('document workspace status phase 2 checks passed')
