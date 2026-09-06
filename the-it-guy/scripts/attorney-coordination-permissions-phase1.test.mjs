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

  assert.equal(catalog.normalizeAttorneyProfessionalRole('cancellation_attorney'), 'attorney_conveyancer')

  const partnerOptions = readFileSync(new URL('../src/lib/partnerPersonOptions.js', import.meta.url), 'utf8')
  assert.doesNotMatch(partnerOptions, /['"]attorney_(?:admin|manager)['"]/, 'Legacy management roles escaped containment')

  console.log('Attorney coordination permissions Phase 1 gate passed.')
} finally {
  await server.close()
}
