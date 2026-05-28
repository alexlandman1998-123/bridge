import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const onboardingPersistencePath = resolve(root, 'src/services/onboarding/onboardingPersistence.js')
const auditLogServicePath = resolve(root, 'src/services/auditLogService.js')
const attorneyFirmsPath = resolve(root, 'src/services/attorneyFirms.js')

const onboardingPersistence = readFileSync(onboardingPersistencePath, 'utf8')
const auditLogService = readFileSync(auditLogServicePath, 'utf8')
const attorneyFirms = readFileSync(attorneyFirmsPath, 'utf8')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertIncludes(source, token, label = token) {
  assert(source.includes(token), `Expected ${label}`)
}

for (const [label, source] of [
  ['onboarding events', onboardingPersistence],
  ['security audit events', auditLogService],
]) {
  assertIncludes(source, 'isWorkspaceForeignKeyError', `${label} FK detector`)
  assertIncludes(source, "String(error.code || '').toLowerCase() === '23503'", `${label} FK code guard`)
  assertIncludes(source, 'workspaceForeignKeySkipped', `${label} metadata fallback marker`)
  assertIncludes(source, 'workspace_id: null', `${label} retry without organisation workspace FK`)
}

assertIncludes(onboardingPersistence, 'onboarding_events_workspace_id_fkey', 'onboarding event FK name')
assertIncludes(auditLogService, 'security_audit_events_workspace_id_fkey', 'audit event FK name')

assertIncludes(attorneyFirms, 'bootstrap_attorney_firm_admin_membership', 'attorney membership bootstrap RPC')
assertIncludes(attorneyFirms, 'attorney_membership_bootstrap_unavailable', 'membership bootstrap hard failure code')
assertIncludes(attorneyFirms, 'loadCurrentUserAttorneyFirmAdminMembership', 'real membership verification')
assertIncludes(attorneyFirms, 'message.includes(\'no_active_membership\')', 'specific no active membership user message')
assertIncludes(attorneyFirms, 'if (!isUnsafeFallbackAllowed())', 'production synthetic membership guard')

console.log('attorney onboarding FK safety tests passed')
