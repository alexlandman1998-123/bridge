import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const repositoryRoot = path.resolve(root, '..')
const read = (relativePath, base = root) => readFileSync(path.join(base, relativePath), 'utf8')

const membershipPermissions = read('src/lib/attorneyPermissions.js')
const hook = read('src/hooks/useAttorneyPermissions.js')
const legalPermissions = read('src/services/permissions/attorneyPermissionService.js')
const operations = read('src/services/attorneyOperations.js')
const incomingQueue = read('src/services/attorneyIncomingMatterQueue.js')
const api = read('src/lib/api.js')
const migration = read('supabase/migrations/202607180040_attorney_professional_permission_cutover_phase7.sql', repositoryRoot)

assert.match(membershipPermissions, /professional_role, practice_qualifications/)
assert.match(membershipPermissions, /getAttorneyProfessionalProfilePermissions\(activeMembership\)/)
assert.match(hook, /membership\?\.professionalRole/)
assert.match(hook, /hasAttorneyProfessionalPermission/)
assert.match(legalPermissions, /getAttorneyProfessionalProfilePermissions\(membership\)/)
assert.match(legalPermissions, /isAttorneyProfessionalManagementRole/)
assert.doesNotMatch(legalPermissions, /getAttorneyRolePermissions\(membership\.role\)/)
assert.match(operations, /resolvedCurrentMembership\?\.professionalRole/)
assert.match(incomingQueue, /membership\.professionalRole/)
assert.match(api, /select\('firm_id, department_id, professional_role, practice_qualifications, status'\)/)

assert.match(migration, /m\.professional_role = 'firm_admin'/)
assert.match(migration, /m\.professional_role in \('firm_admin', 'director_partner'\)/)
assert.match(migration, /new\.role := public\.bridge_attorney_professional_to_compatibility_role/)
assert.doesNotMatch(migration, /when new\.professional_role = 'viewer'.*new\.role/s)
assert.match(migration, /professional_role, practice_qualifications/)
assert.match(migration, /Phase 7 derived compatibility mirror/)

const server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const catalog = await server.ssrLoadModule('/src/constants/attorneyRoleCatalog.js')
  const legal = await server.ssrLoadModule('/src/services/permissions/attorneyPermissionService.js')

  const transfer = catalog.getAttorneyProfessionalProfilePermissions({
    professionalRole: 'attorney_conveyancer',
    practiceQualifications: ['transfer'],
  })
  assert.equal(transfer.can_edit_transfer_workflow, true)
  assert.equal(transfer.can_edit_bond_workflow, false)

  const bond = catalog.getAttorneyProfessionalProfilePermissions({
    professionalRole: 'attorney_conveyancer',
    practiceQualifications: ['bond'],
  })
  assert.equal(bond.can_edit_transfer_workflow, false)
  assert.equal(bond.can_edit_bond_workflow, true)

  const multiLane = catalog.getAttorneyProfessionalProfilePermissions({
    professionalRole: 'attorney_conveyancer',
    practiceQualifications: ['transfer', 'bond', 'cancellation'],
  })
  assert.equal(multiLane.can_edit_transfer_workflow, true)
  assert.equal(multiLane.can_edit_bond_workflow, true)

  const unqualified = catalog.getAttorneyProfessionalProfilePermissions({
    professionalRole: 'attorney_conveyancer',
    practiceQualifications: [],
  })
  assert.equal(Object.values(unqualified).some(Boolean), false)

  const access = {
    canViewMatter: true,
    isAssignedParticipant: true,
    assignment: {
      can_manage_documents: true,
      can_manage_signing: true,
      can_update_workflow_lane: true,
      can_add_internal_notes: true,
      can_add_shared_updates: true,
    },
  }
  const compatibilityCannotEscalate = legal.resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: { role: 'firm_admin', professionalRole: 'viewer', practiceQualifications: [], status: 'active', isActive: true },
    attorneyRole: 'transfer_attorney',
    attorneyAccess: access,
    canViewAsAttorney: true,
  })
  assert.equal(compatibilityCannotEscalate.canUpdateLane, false)
  assert.equal(compatibilityCannotEscalate.canReviewDocuments, false)

  const canonicalManagementWins = legal.resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: { role: 'viewer', professionalRole: 'firm_admin', practiceQualifications: [], status: 'active', isActive: true },
    attorneyRole: 'transfer_attorney',
    attorneyAccess: access,
    canViewAsAttorney: true,
  })
  assert.equal(canonicalManagementWins.canUpdateLane, true)
  assert.equal(canonicalManagementWins.canReviewDocuments, true)

  console.log('Attorney professional permission cutover Phase 7 verification passed.')
} finally {
  await server.close()
}
