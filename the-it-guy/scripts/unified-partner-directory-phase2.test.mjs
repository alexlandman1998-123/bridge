import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  page: await readFile(new URL('../src/pages/PartnersPage.jsx', import.meta.url), 'utf8'),
  service: await readFile(new URL('../src/services/partnerDirectoryService.js', import.meta.url), 'utf8'),
  quickCreate: await readFile(new URL('../src/components/QuickCreateDropdown.jsx', import.meta.url), 'utf8'),
}

for (const token of [
  "title: 'Partners'",
  "actionLabel: 'Add partner'",
  "{ key: 'invitations', label: 'Invites' }",
  "{ key: 'discover', label: 'Discover' }",
  'isUnifiedPartnersTab',
  'partnerDirectoryFilters',
  'PARTNER_DIRECTORY_ROLE_FILTERS',
  'PARTNER_DIRECTORY_STATUS_FILTERS',
  'UnifiedPartnerCard',
  'visiblePartnerDirectoryRows',
  'listUnifiedPartnerDirectory(organisationId)',
  'buildLegacyPartnerDirectory({',
  "label=\"Partners\"",
  'External contacts',
  'Invite pending',
  'Connected',
]) {
  assert(files.page.includes(token), `PartnersPage should expose the unified directory UI contract: ${token}`)
}

const secondaryViews = files.page.match(/const SECONDARY_PARTNER_VIEWS = \[([\s\S]*?)\]/)?.[1] || ''
assert.ok(secondaryViews, 'Secondary partner navigation should be declared.')
assert.ok(!secondaryViews.includes("key: 'connected'"), 'Connections must not remain a separate simplified-workspace tab.')

for (const token of [
  'bridge_list_organisation_partner_directory',
  'buildLegacyPartnerDirectory',
  'normalizePartnerDirectoryEntry',
  "`organisation:${partnerOrganisationId}`",
  "`external:${partner.id}`",
  "`invitation:${invitation.id}`",
]) {
  assert(files.service.includes(token), `Partner directory adapter should preserve: ${token}`)
}

assert(files.quickCreate.includes("type: 'partner'"))
assert(files.quickCreate.includes("label: 'Partner'"))
assert.ok(!files.quickCreate.includes("label: 'Third Party'"))

console.log('Unified partner-directory Phase 2 UI contract passed.')
