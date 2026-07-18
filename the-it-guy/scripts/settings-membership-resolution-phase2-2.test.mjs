import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  isOrganisationOwnerMembership,
  resolveActiveOrganisationMembership,
  resolveOrganisationMembershipRole,
} from '../src/lib/organisationMembershipResolution.js'

const organisationMembership = {
  id: 'org-membership-1',
  source: 'organisation_users',
  workspaceId: 'workspace-1',
  workspaceRole: 'owner',
  status: 'active',
}
const attorneyMembership = {
  id: 'firm-membership-1',
  source: 'attorney_firm_members',
  workspaceId: 'workspace-1',
  role: 'attorney',
  status: 'active',
}

assert.equal(
  resolveActiveOrganisationMembership({
    currentMembership: attorneyMembership,
    currentMemberships: [attorneyMembership, organisationMembership],
    membershipContexts: { effective: attorneyMembership, organisation: organisationMembership },
    currentWorkspace: { id: 'workspace-1' },
  }),
  organisationMembership,
  'the organisation membership should win even when another membership is the effective context',
)

assert.equal(
  resolveActiveOrganisationMembership({
    currentMembership: organisationMembership,
    currentMemberships: [organisationMembership],
    currentWorkspace: { id: 'workspace-2' },
  }),
  null,
  'membership resolution must not leak authority across selected workspaces',
)

assert.equal(
  resolveActiveOrganisationMembership({
    currentMemberships: [{ ...organisationMembership, status: 'deactivated' }],
    currentWorkspace: { id: 'workspace-1' },
  }),
  null,
  'inactive organisation memberships must not grant settings authority',
)

assert.equal(resolveOrganisationMembershipRole(organisationMembership), 'owner')
assert.equal(isOrganisationOwnerMembership(organisationMembership), true)
assert.equal(isOrganisationOwnerMembership({ ...organisationMembership, workspaceRole: 'admin' }), false)

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const [workspaceContext, accountPage, usersPage, signingTemplatesPage, legalLanding, legalOverview, legalPreview] = await Promise.all([
  read('../src/context/WorkspaceContext.jsx'),
  read('../src/pages/settings/SettingsAccountPage.jsx'),
  read('../src/pages/settings/SettingsUsersPage.jsx'),
  read('../src/pages/settings/SettingsSigningTemplatesPage.jsx'),
  read('../src/pages/settings/LegalDocumentsLandingPage.jsx'),
  read('../src/pages/settings/LegalDocumentOverviewPage.jsx'),
  read('../src/pages/settings/LegalDocumentPreviewPage.jsx'),
])

assert.match(workspaceContext, /resolveActiveOrganisationMembership/)
assert.match(workspaceContext, /organisationMembershipRole/)
assert.match(workspaceContext, /isOrganisationOwner/)
assert.match(accountPage, /organisationMembershipRole/)
assert.match(usersPage, /organisationMembership/)
assert.match(signingTemplatesPage, /organisationMembershipRole/)

for (const [name, source] of [
  ['account settings', accountPage],
  ['user settings', usersPage],
  ['signing template settings', signingTemplatesPage],
  ['legal document landing', legalLanding],
  ['legal document overview', legalOverview],
  ['legal document preview', legalPreview],
]) {
  assert.doesNotMatch(source, /\bcurrentMembership\b/, `${name} should use the resolved organisation membership`)
}

console.log('settings membership resolution phase 2.2 checks passed')
