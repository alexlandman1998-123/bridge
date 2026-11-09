import { readDomainApiSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  api: await readDomainApiSource(),
  addDevelopmentModal: await readFile(
    new URL('../src/components/AddDevelopmentModal.jsx', import.meta.url),
    'utf8',
  ),
  developmentDetail: await readFile(
    new URL('../src/pages/DevelopmentDetail.jsx', import.meta.url),
    'utf8',
  ),
}

for (const requiredApiToken of [
  'rolePlayerDefaults',
  'normalizeDevelopmentRolePlayerDefaults',
  'defaultTransferAttorneySource',
  'defaultBondOriginatorSource',
  'buyerAppointedBondOriginatorAllowed',
  'buyerAppointedBondOriginatorRequiresApproval',
  'autoInviteSelectedBondOriginator',
  'stakeholder_teams',
]) {
  assert(files.api.includes(requiredApiToken), `api.js should persist ${requiredApiToken}`)
}

assert(
  files.api.includes("defaultTransferAttorneySource: 'first_conveyancer'") &&
    files.api.includes("defaultBondOriginatorSource: 'first_bond_originator'"),
  'developer role-player defaults should start from the first configured conveyancer/originator',
)

assert(
  files.api.includes('Boolean(buyerAppointedBondOriginatorAllowed) &&') &&
    files.api.includes('Boolean(buyerAppointedBondOriginatorRequiresApproval)'),
  'buyer-appointed approval should normalize to false when buyer appointments are disabled',
)

for (const token of ['Sales setup', "role: 'transfer_attorney'", "role: 'bond_originator'", 'DevelopmentPartnerSetupCard', 'rolePlayerDefaults,']) {
  assert(files.addDevelopmentModal.includes(token), `Development creation must retain ${token}`)
}

for (const requiredDetailCopy of [
  'Reservation & Deposit',
  'Role Player Assignment Defaults',
  'Default Transfer Attorney',
  'Default Bond Originator',
  'Buyer may use own bond originator',
  'Approve buyer-appointed originators',
  'Auto-invite selected bond originator',
  'Save updates only reservation and unit defaults.',
]) {
  assert(
    files.developmentDetail.includes(requiredDetailCopy),
    `DevelopmentDetail should expose ${requiredDetailCopy}`,
  )
}

assert(
  files.developmentDetail.includes('rolePlayerDefaults') &&
    files.developmentDetail.includes('stakeholderTeams: {') &&
    files.developmentDetail.includes('Configuration saved.'),
  'DevelopmentDetail should save role-player defaults with reservation and deposit feedback',
)

console.log('Developer role-player defaults Phase 1 contract passed.')
