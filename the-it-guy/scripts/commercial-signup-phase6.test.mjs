import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

const commercialApi = await read('../src/modules/commercial/services/commercialApi.js')
for (const marker of [
  'COMMERCIAL_ACCESS_AUDIT_ACTIONS',
  'recordCommercialAccessAudit',
  'normalizeCommercialAccessAuditEvent',
  'commercial_access_requested',
  'commercial_access_approved',
  'commercial_access_rejected',
  'commercial_module_enabled',
  'commercial_module_disabled',
  'commercial_user_access_granted',
  'commercial_user_access_revoked',
  'export async function listCommercialAccessAuditEvents',
  'security_audit_events',
  'auditEvents',
]) {
  includes(commercialApi, marker, `Commercial signup phase 6 audit service should include ${marker}`)
}

const usersPage = await read('../src/pages/settings/SettingsUsersPage.jsx')
for (const marker of [
  'formatCommercialAuditAction',
  'getCommercialAuditSubject',
  'commercialAccessManagement.auditEvents',
  'Recent Commercial access history',
  'No Commercial access history yet.',
  'Source:',
]) {
  includes(usersPage, marker, `Settings users Commercial audit history UI should include ${marker}`)
}

const phase5Test = await read('./commercial-signup-phase5.test.mjs')
for (const marker of [
  'setCommercialOrganisationModuleEnabled',
  'setCommercialUserAccess',
  'Grant Commercial',
  'Remove Commercial',
]) {
  includes(phase5Test, marker, `Phase 6 must preserve Phase 5 management marker ${marker}`)
}

console.log('commercial signup phase 6 diagnostics passed')
