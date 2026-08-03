import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile('src/services/auditLogService.js', 'utf8')

assert.match(
  source,
  /\.rpc\('bridge_record_security_audit_event'/,
  'Security audit writes should go through the server-side RPC before direct table access.',
)
assert.match(
  source,
  /function\s+recordSecurityAuditEventDirect/,
  'Security audit writes should keep a direct insert fallback for older deployments.',
)
assert.match(
  source,
  /isMissingAuditRpcError\(rpcResult\.error\)/,
  'The direct insert fallback should only run when the audit RPC is unavailable.',
)
assert.match(
  source,
  /reason:\s*'permission_denied'/,
  'Denied audit writes should be reported as permission_denied, not table_missing.',
)
assert.match(
  source,
  /relation "security_audit_events" does not exist/,
  'Missing-table detection should stay specific to absent relations.',
)
assert.doesNotMatch(
  source,
  /message\.includes\('security_audit_events'\)/,
  'Audit logging must not classify every security_audit_events error as a missing table.',
)

console.log('audit-log-service-rpc tests passed')
