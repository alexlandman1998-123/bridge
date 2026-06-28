import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  wizard: await readFile(new URL('../src/components/NewTransactionWizard.jsx', import.meta.url), 'utf8'),
  api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
}

for (const requiredWizardToken of [
  'getDevelopmentTeamDefaultOption',
  'normalizeDevelopmentTeamMember',
  'partnerOptionToRolePlayerSelection',
  'partnerDefaultsTouched',
  'developmentDefaultTransferAttorney',
  'developmentDefaultBondOriginator',
  'Development defaults applied:',
]) {
  assert(files.wizard.includes(requiredWizardToken), `NewTransactionWizard should include ${requiredWizardToken}`)
}

assert(
  files.wizard.includes("source: 'development_default'") &&
    files.wizard.includes("selectionSource: resolvedSelectionSource"),
  'development defaults should be persisted as explicit role-player selection sources',
)

assert(
  files.wizard.includes("defaultAttorney.source === 'development_default' ? '' : defaultAttorney.id") &&
    files.wizard.includes("defaultBondOriginator.source === 'development_default' ? '' : defaultBondOriginator.id"),
  'plain development team defaults should populate names without pretending to be connected partner selections',
)

assert(
  files.wizard.includes('shouldAutoInviteDevelopmentDefaultBondOriginator') &&
    files.wizard.includes("source: 'development_role_player_default'") &&
    files.wizard.includes("roleType: 'bond_originator'"),
  'auto-invite should be available for default development bond originators',
)

assert(
  files.wizard.includes('setPartnerDefaultsTouched({') &&
    files.wizard.includes('setSelectedPartnerProspects(createInitialPartnerProspectState())') &&
    files.wizard.includes('setPartnerInvitationModes(createInitialPartnerInvitationModes())'),
  'changing development should reset partner-default touch state and stale partner choices',
)

assert(
  files.api.includes("'development_default'") &&
    files.api.includes('const allowedSources = new Set([') &&
    files.api.includes('normalizeTransactionRolePlayerInputs'),
  'api role-player normalizer should accept development_default selection sources',
)

console.log('Developer role-player defaults Phase 2 contract passed.')
