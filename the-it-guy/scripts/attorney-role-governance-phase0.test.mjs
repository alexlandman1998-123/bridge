import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const EXPECTED_FIRM_ROLES = [
  'firm_admin',
  'director_partner',
  'transfer_attorney',
  'bond_attorney',
  'conveyancing_secretary',
  'admin_staff',
  'reception_scheduling',
  'candidate_attorney',
  'viewer',
]

const EXPECTED_TRANSACTION_ROLES = [
  'transfer_attorney',
  'bond_attorney',
  'cancellation_attorney',
]

const ALLOWED_FIRM_ROLE_REGISTRIES = [
  'src/constants/attorneyRoleCatalog.js',
]

const ALLOWED_TRANSACTION_ROLE_REGISTRIES = [
  'src/constants/attorneyRoleCatalog.js',
]

const ALLOWED_LEGACY_MANAGEMENT_ROLE_FILES = []

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

function extractArray(source, constantName) {
  const match = source.match(new RegExp(`(?:export\\s+)?const\\s+${constantName}\\s*=\\s*(?:Object\\.freeze\\()?\\[([\\s\\S]*?)\\]`))
  assert.ok(match, `${constantName} declaration is missing`)
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1])
}

function filesDeclaring(constantName) {
  const pattern = new RegExp(`(?:export\\s+)?const\\s+${constantName}\\s*=`)
  return walk(path.join(root, 'src'))
    .filter((filePath) => pattern.test(readFileSync(filePath, 'utf8')))
    .map(relative)
    .sort()
}

function filesContainingQuotedRole(role) {
  const quotedRole = new RegExp(`['"]${role}['"]`)
  return walk(path.join(root, 'src'))
    .filter((filePath) => quotedRole.test(readFileSync(filePath, 'utf8')))
    .map(relative)
    .sort()
}

function verifyDocumentation() {
  const adr = read('docs/architecture/adr-001-attorney-role-boundaries.md')
  const inventory = read('docs/audits/attorney-role-phase0-inventory.md')

  for (const heading of ['## Decision', '## Authority rules', '## Target role model', '## Change-control rule']) {
    assert.ok(adr.includes(heading), `ADR is missing ${heading}`)
  }
  for (const heading of ['## Canonical ownership by layer', '## Current firm roles', '## Transaction roles', '## Deprecation register', '## Phase 0 invariants']) {
    assert.ok(inventory.includes(heading), `Inventory is missing ${heading}`)
  }
  for (const role of [...EXPECTED_FIRM_ROLES, ...EXPECTED_TRANSACTION_ROLES]) {
    assert.ok(inventory.includes(`\`${role}\``), `Inventory does not account for ${role}`)
  }
}

function verifyFrozenFirmRoleRegistries() {
  assert.deepEqual(filesDeclaring('ATTORNEY_FIRM_ROLE_VALUES'), ALLOWED_FIRM_ROLE_REGISTRIES)
  for (const filePath of ALLOWED_FIRM_ROLE_REGISTRIES) {
    assert.deepEqual(
      extractArray(read(filePath), 'ATTORNEY_FIRM_ROLE_VALUES'),
      EXPECTED_FIRM_ROLES,
      `${filePath} has drifted from the frozen Phase 0 firm-role contract`,
    )
  }
}

function verifyTransactionRoleRegistries() {
  assert.deepEqual(filesDeclaring('ATTORNEY_TRANSACTION_ROLES'), ALLOWED_TRANSACTION_ROLE_REGISTRIES)
  for (const filePath of ALLOWED_TRANSACTION_ROLE_REGISTRIES) {
    assert.deepEqual(
      extractArray(read(filePath), 'ATTORNEY_TRANSACTION_ROLES'),
      EXPECTED_TRANSACTION_ROLES,
      `${filePath} has drifted from the transaction-role contract`,
    )
  }
}

function verifySignupBoundary() {
  const signupIntents = read('src/constants/signupIntents.js')
  assert.match(signupIntents, /attorney_owner:\s*\{[\s\S]*?workspace_action:\s*SIGNUP_WORKSPACE_ACTIONS\.createWorkspace/)
  assert.match(signupIntents, /attorney_operational:\s*\{[\s\S]*?workspace_action:\s*SIGNUP_WORKSPACE_ACTIONS\.joinOrRequestWorkspace/)
  assert.match(signupIntents, /attorney_operational:\s*\{[\s\S]*?intended_org_role:\s*SIGNUP_ROLE_CONTRACTS\.attorney_operational\.intendedOrgRole/)
  assert.match(signupIntents, /attorney_operational:\s*\{[\s\S]*?role_contract_key:\s*SIGNUP_ROLE_CONTRACTS\.attorney_operational\.key/)
}

function verifyLegacyRoleContainment() {
  for (const role of ['attorney_admin', 'attorney_manager']) {
    assert.deepEqual(
      filesContainingQuotedRole(role),
      ALLOWED_LEGACY_MANAGEMENT_ROLE_FILES,
      `${role} escaped its documented Phase 0 legacy containment boundary`,
    )
  }
}

verifyDocumentation()
verifyFrozenFirmRoleRegistries()
verifyTransactionRoleRegistries()
verifySignupBoundary()
verifyLegacyRoleContainment()

console.log('Attorney role governance Phase 0 verification passed.')
