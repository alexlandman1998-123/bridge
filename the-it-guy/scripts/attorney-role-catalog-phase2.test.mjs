import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = path.join(directory, entry)
    if (statSync(absolutePath).isDirectory()) return walk(absolutePath)
    return /\.(?:js|jsx|ts|tsx)$/.test(entry) ? [absolutePath] : []
  })
}

function relative(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/')
}

function filesDeclaring(constantName) {
  const pattern = new RegExp(`(?:export\\s+)?const\\s+${constantName}\\s*=`)
  return walk(path.join(root, 'src'))
    .filter((filePath) => pattern.test(readFileSync(filePath, 'utf8')))
    .map(relative)
    .sort()
}

function verifySourceOwnership() {
  const source = walk(path.join(root, 'src')).map((filePath) => readFileSync(filePath, 'utf8')).join('\n')
  assert.deepEqual(filesDeclaring('ATTORNEY_FIRM_ROLE_VALUES'), ['src/constants/attorneyRoleCatalog.js'])
  assert.deepEqual(filesDeclaring('ATTORNEY_TRANSACTION_ROLES'), ['src/constants/attorneyRoleCatalog.js'])
  assert.doesNotMatch(source, /ATTORNEY_ROLE_PERMISSION_MATRIX/)
  assert.doesNotMatch(source, /['"]attorney_(?:admin|manager)['"]/)

  for (const filePath of [
    'src/components/attorney/onboarding/TeamInvitesStep.jsx',
    'src/components/attorney/onboarding/ReviewConfirmStep.jsx',
    'src/components/attorney/onboarding/AttorneyFirmLivePreview.jsx',
    'src/components/attorney/onboarding/attorneyOnboardingGuidance.js',
  ]) {
    assert.doesNotMatch(read(filePath), /const ROLE_LABELS\s*=/, `${filePath} still owns attorney role labels`)
    assert.match(read(filePath), /getAttorneyRoleLabel/)
  }

  assert.match(read('src/lib/api.js'), /from '..\/constants\/attorneyRoleCatalog\.js'/)
  assert.match(read('src/lib/profileApi.js'), /from '..\/constants\/attorneyRoleCatalog\.js'/)
  assert.match(read('src/services/permissions/attorneyPermissionService.js'), /isAttorneyProfessionalManagementRole/)
  assert.match(read('src/services/transactionAttorneyAssignments.js'), /ATTORNEY_TRANSACTION_ROLES/)
}

const server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const catalog = await server.ssrLoadModule('/src/constants/attorneyRoleCatalog.js')
  const {
    ATTORNEY_FIRM_ADMIN_ROLES,
    ATTORNEY_FIRM_MANAGER_ROLES,
    ATTORNEY_FIRM_ROLE_CATALOG,
    ATTORNEY_FIRM_ROLE_VALUES,
    ATTORNEY_PERMISSION_KEYS,
    ATTORNEY_PRACTICE_QUALIFICATIONS,
    ATTORNEY_TRANSACTION_ROLES,
    getAllowedAttorneyDepartmentsForRole,
    getAttorneyRolePermissions,
    getDefaultAttorneyDepartmentForRole,
    getInviteableAttorneyFirmRoles,
    normalizeAttorneyTransactionRole,
  } = catalog

  assert.equal(ATTORNEY_FIRM_ROLE_VALUES.length, 9)
  assert.equal(new Set(ATTORNEY_FIRM_ROLE_VALUES).size, 9)
  assert.deepEqual([...ATTORNEY_TRANSACTION_ROLES], ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'])
  assert.deepEqual([...ATTORNEY_PRACTICE_QUALIFICATIONS], ['transfer', 'bond', 'cancellation'])
  assert.ok(Object.isFrozen(ATTORNEY_FIRM_ROLE_CATALOG))

  for (const role of ATTORNEY_FIRM_ROLE_VALUES) {
    const definition = ATTORNEY_FIRM_ROLE_CATALOG[role]
    assert.equal(definition.id, role)
    assert.ok(definition.label && definition.description && definition.authorityLevel)
    assert.ok(Object.isFrozen(definition))
    assert.ok(Object.isFrozen(definition.permissions))
    assert.deepEqual(Object.keys(definition.permissions), [...ATTORNEY_PERMISSION_KEYS])
    assert.ok(Object.values(definition.permissions).every((value) => typeof value === 'boolean'))
    assert.ok(definition.allowedDepartments.every((type) => ['transfer', 'bond', 'cancellation', 'admin', 'management'].includes(type)))
    assert.ok(definition.practiceQualifications.every((type) => ATTORNEY_PRACTICE_QUALIFICATIONS.includes(type)))
  }

  assert.deepEqual([...ATTORNEY_FIRM_ADMIN_ROLES], ['firm_admin'])
  assert.deepEqual([...ATTORNEY_FIRM_MANAGER_ROLES], ['firm_admin', 'director_partner'])
  assert.deepEqual(getInviteableAttorneyFirmRoles(), ATTORNEY_FIRM_ROLE_VALUES.filter((role) => role !== 'firm_admin'))
  assert.equal(Object.values(getAttorneyRolePermissions('unknown_role')).some(Boolean), false)

  const departments = ['transfer', 'bond', 'cancellation', 'admin', 'management']
  assert.deepEqual(getAllowedAttorneyDepartmentsForRole('transfer_attorney', departments), ['transfer', 'cancellation'])
  assert.deepEqual(getAllowedAttorneyDepartmentsForRole('bond_attorney', departments), ['bond'])
  assert.deepEqual(getAllowedAttorneyDepartmentsForRole('conveyancing_secretary', departments), ['transfer', 'bond', 'cancellation', 'admin'])
  assert.deepEqual(getAllowedAttorneyDepartmentsForRole('candidate_attorney', departments), ['transfer', 'bond', 'cancellation'])
  assert.equal(getDefaultAttorneyDepartmentForRole('director_partner', departments), 'management')
  assert.equal(getDefaultAttorneyDepartmentForRole('candidate_attorney', departments), 'transfer')

  assert.equal(normalizeAttorneyTransactionRole('transfer'), 'transfer_attorney')
  assert.equal(normalizeAttorneyTransactionRole('bond'), 'bond_attorney')
  assert.equal(normalizeAttorneyTransactionRole('cancellation'), 'cancellation_attorney')
  assert.deepEqual(ATTORNEY_FIRM_ROLE_CATALOG.transfer_attorney.practiceQualifications, ['transfer', 'cancellation'])
  assert.deepEqual(ATTORNEY_FIRM_ROLE_CATALOG.bond_attorney.practiceQualifications, ['bond'])

  verifySourceOwnership()
  console.log('Attorney role catalogue Phase 2 verification passed.')
} finally {
  await server.close()
}
