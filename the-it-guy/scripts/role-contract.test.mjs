import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    ROLE_CONTRACTS,
    ROLE_CONTRACT_KEYS,
    getRoleContractSnapshot,
    resolveSignupRoleContract,
    resolveWorkspaceKindForContract,
  } = await server.ssrLoadModule('/src/constants/roleContract.js')
  const {
    SIGNUP_POSITION_INTENT_MAP,
  } = await server.ssrLoadModule('/src/constants/signupIntents.js')
  const {
    buildSignupIntent,
    createSignupUserMetadata,
  } = await server.ssrLoadModule('/src/lib/signupIntent.js')

  const bondOwnerContract = ROLE_CONTRACTS[ROLE_CONTRACT_KEYS.bondOwner]
  assert.equal(bondOwnerContract.profileRole, 'bond_originator')
  assert.equal(bondOwnerContract.systemRole, 'professional')
  assert.equal(bondOwnerContract.workspaceType, 'bond_originator')
  assert.equal(bondOwnerContract.defaultWorkspaceKind, 'bond_company')
  assert.deepEqual([...bondOwnerContract.allowedWorkspaceKinds], ['personal_originator', 'bond_company'])
  assert.equal(bondOwnerContract.workspaceRole, 'owner')
  assert.equal(bondOwnerContract.organisationRole, 'owner')
  assert.equal(bondOwnerContract.scopeLevel, 'workspace_hq')
  assert.equal(bondOwnerContract.branchScope, 'all_branches')
  assert.equal(bondOwnerContract.isPrimaryOwner, true)

  const bondOwnerIntentTemplate = SIGNUP_POSITION_INTENT_MAP.bond_owner
  assert.equal(bondOwnerIntentTemplate.app_role, bondOwnerContract.profileRole)
  assert.equal(bondOwnerIntentTemplate.system_role, bondOwnerContract.systemRole)
  assert.equal(bondOwnerIntentTemplate.workspace_type, bondOwnerContract.workspaceType)
  assert.equal(bondOwnerIntentTemplate.workspace_kind, bondOwnerContract.defaultWorkspaceKind)
  assert.equal(bondOwnerIntentTemplate.intended_org_role, bondOwnerContract.intendedOrgRole)
  assert.equal(bondOwnerIntentTemplate.role_contract_key, bondOwnerContract.key)

  const signupIntent = buildSignupIntent({ position: 'bond_owner' })
  assert.equal(signupIntent.app_role, 'bond_originator')
  assert.equal(signupIntent.system_role, 'professional')
  assert.equal(signupIntent.workspace_type, 'bond_originator')
  assert.equal(signupIntent.workspace_kind, 'bond_company')
  assert.equal(signupIntent.role_contract_key, 'bond_owner')

  const metadata = createSignupUserMetadata({
    intent: signupIntent,
    fullName: 'Bond Owner',
    phone: '+27110000000',
  })
  assert.equal(metadata.role, 'bond_originator')
  assert.equal(metadata.app_role, 'bond_originator')
  assert.equal(metadata.system_role, 'professional')
  assert.equal(metadata.signup_intent.workspace_kind, 'bond_company')

  const resolved = resolveSignupRoleContract({
    app_role: 'bond_originator',
    workspace_type: 'bond_originator',
    intended_org_role: 'owner',
  })
  assert.equal(resolved.key, 'bond_owner')
  assert.equal(resolveWorkspaceKindForContract(resolved, 'personal'), 'personal_originator')

  const personalSnapshot = getRoleContractSnapshot(resolved, { workspaceKind: 'personal_originator' })
  assert.deepEqual(personalSnapshot, {
    key: 'bond_owner',
    profile_role: 'bond_originator',
    system_role: 'professional',
    workspace_type: 'bond_originator',
    workspace_kind: 'personal_originator',
    intended_org_role: 'owner',
    membership_role: 'owner',
    workspace_role: 'owner',
    organisation_role: 'owner',
    scope_level: 'workspace_hq',
    branch_scope: 'all_branches',
    is_primary_owner: true,
  })

  const operationalIntent = buildSignupIntent({ position: 'bond_operational' })
  assert.equal(operationalIntent.system_role, 'professional')
  assert.equal(operationalIntent.workspace_kind, 'bond_company')
  assert.equal(operationalIntent.intended_org_role, 'consultant')
  assert.equal(operationalIntent.role_contract_key, 'bond_operational')

  console.log('role contract tests passed')
} finally {
  await server.close()
}

