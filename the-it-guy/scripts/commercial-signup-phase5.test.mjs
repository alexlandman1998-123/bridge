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
  'export async function listCommercialAccessManagementState',
  'export async function setCommercialOrganisationModuleEnabled',
  'export async function setCommercialUserAccess',
  'buildCommercialManualGrantMetadata',
  'buildCommercialManualRevokeMetadata',
  "source: 'manual_grant'",
  "source: 'manual_revoke'",
  "source: 'manual'",
  'module_context: null',
  'normalizeCommercialAccessAssignment',
]) {
  includes(commercialApi, marker, `Commercial phase 5 management service should include ${marker}`)
}

const usersPage = await read('../src/pages/settings/SettingsUsersPage.jsx')
for (const marker of [
  'listCommercialAccessManagementState',
  'setCommercialOrganisationModuleEnabled',
  'setCommercialUserAccess',
  'Commercial module access',
  'Enable Commercial for this organisation',
  'commercialAccessByUserId',
  'Commercial assigned',
  'No Commercial access',
  'Grant Commercial',
  'Remove Commercial',
]) {
  includes(usersPage, marker, `Settings users commercial management UI should include ${marker}`)
}

const phase4Test = await read('./commercial-signup-phase4.test.mjs')
for (const marker of [
  'commercial_access_requests',
  'reviewCommercialAccessRequest',
]) {
  includes(phase4Test, marker, `Phase 5 must preserve Phase 4 request workflow marker ${marker}`)
}

console.log('commercial signup phase 5 diagnostics passed')
