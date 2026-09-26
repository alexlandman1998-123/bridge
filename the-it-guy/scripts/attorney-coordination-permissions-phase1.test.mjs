import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })

try {
  const catalog = await server.ssrLoadModule('/src/constants/attorneyRoleCatalog.js')
  const legal = await server.ssrLoadModule('/src/services/permissions/attorneyPermissionService.js')
  const operations = await server.ssrLoadModule('/src/core/transactions/attorneyOperationsScope.js')

  for (const permission of [
    'can_view_cancellation_matters',
    'can_edit_cancellation_workflow',
    'can_nominate_attorney_firms',
    'can_manage_attorney_assignments',
    'can_act_on_behalf_of_attorney',
  ]) {
    assert.ok(catalog.ATTORNEY_PERMISSION_KEYS.includes(permission), `${permission} is not canonical`)
  }

  const transfer = catalog.getAttorneyProfessionalProfilePermissions({
    professionalRole: 'attorney_conveyancer',
    practiceQualifications: ['transfer'],
  })
  assert.equal(transfer.can_view_transfer_matters, true)
  assert.equal(transfer.can_edit_transfer_workflow, true)
  assert.equal(transfer.can_nominate_attorney_firms, true)
  assert.equal(transfer.can_view_cancellation_matters, false)
  assert.equal(transfer.can_edit_cancellation_workflow, false)
  assert.equal(transfer.can_act_on_behalf_of_attorney, true)

  const cancellation = catalog.getAttorneyProfessionalProfilePermissions({
    professionalRole: 'attorney_conveyancer',
    practiceQualifications: ['cancellation'],
  })
  assert.equal(cancellation.can_view_cancellation_matters, true)
  assert.equal(cancellation.can_edit_cancellation_workflow, true)
  assert.equal(cancellation.can_view_transfer_matters, false)
  assert.equal(cancellation.can_edit_transfer_workflow, false)
  assert.equal(cancellation.can_view_bond_matters, false)
  assert.equal(cancellation.can_edit_bond_workflow, false)

  const cancellationScope = operations.buildAttorneyOperationsScope({
    currentUser: { professionalRole: 'attorney_conveyancer', practiceQualifications: ['cancellation'] },
    permissions: cancellation,
  })
  assert.deepEqual([...cancellationScope.listLaneKeys], ['cancellation'])
  assert.equal(cancellationScope.defaultLaneKey, 'cancellation')

  const assignedAccess = {
    canViewMatter: true,
    isAssignedParticipant: true,
    assignment: {
      can_update_workflow_lane: true,
      can_manage_documents: true,
      can_manage_signing: true,
      can_add_internal_notes: true,
      can_add_shared_updates: true,
    },
  }
  const cancellationAction = legal.resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: {
      isActive: true,
      professionalRole: 'attorney_conveyancer',
      practiceQualifications: ['cancellation'],
    },
    attorneyRole: 'cancellation_attorney',
    attorneyAccess: assignedAccess,
    canViewAsAttorney: true,
  })
  assert.equal(cancellationAction.canUpdateLane, true)

  const crossLaneAction = legal.resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: {
      isActive: true,
      professionalRole: 'attorney_conveyancer',
      practiceQualifications: ['transfer'],
    },
    attorneyRole: 'cancellation_attorney',
    attorneyAccess: assignedAccess,
    canViewAsAttorney: true,
  })
  assert.equal(crossLaneAction.canUpdateLane, false)

  const teamAssignment = {
    can_update_workflow_lane: true,
    can_manage_documents: true,
    can_add_internal_notes: true,
    can_add_shared_updates: true,
  }
  for (const [role, expectedReview] of [
    ['firm_admin', true], ['attorney_conveyancer', true], ['conveyancing_secretary', true],
    ['admin_staff', true], ['candidate_attorney', false],
  ]) {
    const teamAction = legal.resolveAttorneyActionPermissions({
      appRole: 'attorney',
      membership: { isActive: true, professionalRole: role, practiceQualifications: ['transfer'] },
      attorneyRole: 'transfer_attorney',
      attorneyAccess: { canViewMatter: true, teamWorkflowEligible: true, assignment: teamAssignment },
      canViewAsAttorney: true,
    })
    assert.equal(teamAction.canUpdateLane, true, `${role} can move an allocated matter along`)
    assert.equal(teamAction.canReviewDocuments, expectedReview, `${role} document review`)
  }
  for (const [label, appRole, membership, attorneyAccess, canViewAsAttorney] of [
    ['unallocated outsider', 'attorney', { isActive: true, professionalRole: 'attorney_conveyancer', practiceQualifications: ['transfer'] },
      { canViewMatter: false, teamWorkflowEligible: false, assignment: teamAssignment }, false],
    ['other firm', 'attorney', { isActive: false, professionalRole: 'attorney_conveyancer' },
      { canViewMatter: false, teamWorkflowEligible: false, assignment: teamAssignment }, false],
    ['client', 'client', null, { canViewMatter: true, assignment: teamAssignment }, false],
  ]) {
    const denied = legal.resolveAttorneyActionPermissions({ appRole, membership, attorneyRole: 'transfer_attorney', attorneyAccess, canViewAsAttorney })
    assert.equal(denied.canUpdateLane, false, `${label} cannot update the lane`)
    assert.equal(denied.canReviewDocuments, false, `${label} cannot review documents`)
  }
  const cappedTeam = legal.resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: { isActive: true, professionalRole: 'conveyancing_secretary' },
    attorneyRole: 'transfer_attorney',
    attorneyAccess: { canViewMatter: true, teamWorkflowEligible: true, assignment: {
      ...teamAssignment, can_update_workflow_lane: false, can_add_internal_notes: false, can_add_shared_updates: false,
    } },
    canViewAsAttorney: true,
  })
  assert.equal(cappedTeam.canUpdateLane, false, 'team access must not bypass the lane update flag')
  assert.equal(cappedTeam.canAddInternalNote, false, 'team access must not bypass the internal-note flag')
  assert.equal(cappedTeam.canAddSharedUpdate, false, 'team access must not bypass the shared-update flag')

  assert.equal(catalog.normalizeAttorneyProfessionalRole('cancellation_attorney'), 'attorney_conveyancer')

  const partnerOptions = readFileSync(new URL('../src/lib/partnerPersonOptions.js', import.meta.url), 'utf8')
  assert.doesNotMatch(partnerOptions, /['"]attorney_(?:admin|manager)['"]/, 'Legacy management roles escaped containment')

  console.log('Attorney coordination permissions Phase 1 gate passed.')
} finally {
  await server.close()
}
