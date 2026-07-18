import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const repositoryRoot = path.resolve(root, '..')

function read(relativePath, base = root) {
  return readFileSync(path.join(base, relativePath), 'utf8')
}

function verifySourceContracts() {
  const attorneyFirms = read('src/services/attorneyFirms.js')
  const teamService = read('src/services/attorneyTeamService.js')
  const workspaceService = read('src/services/workspaceService.js')
  const signupIntents = read('src/constants/signupIntents.js')
  const migration = read('supabase/migrations/202607180038_attorney_signup_team_invitation_phase4.sql', repositoryRoot)

  assert.match(attorneyFirms, /import \{ inviteAttorneyTeamMember \} from '.\/attorneyTeamService'/)
  assert.doesNotMatch(attorneyFirms, /import \{ inviteAttorneyFirmMember \}/)
  assert.match(attorneyFirms, /const invitation = await inviteAttorneyTeamMember\(/)
  assert.match(teamService, /acceptAttorneyTeamInvitation/)
  assert.match(teamService, /updateAttorneyTeamMember/)
  assert.match(teamService, /removeAttorneyTeamMember/)
  assert.match(teamService, /getAttorneyTeamRoster/)
  assert.match(teamService, /getAttorneyTeamDepartments/)
  assert.match(teamService, /professionalRole: invite\.professionalRole/)
  assert.match(teamService, /practiceQualifications: invite\.practiceQualifications/)

  assert.match(signupIntents, /attorney_operational:[\s\S]*role_contract_key: SIGNUP_ROLE_CONTRACTS\.attorney_operational\.key/)
  assert.match(workspaceService, /requested_attorney_professional_role: intent\.workspace_type === WORKSPACE_TYPES\.attorneyFirm \? 'viewer' : null/)
  assert.match(workspaceService, /requested_attorney_practice_qualifications: \[\]/)
  assert.match(migration, /requested_attorney_professional_role text/)
  assert.match(migration, /requested_attorney_practice_qualifications text\[\]/)
  assert.match(migration, /set[\s\S]*requested_attorney_professional_role = 'viewer'/)
  assert.match(migration, /attorney_firm_invitations_apply_accepted_profile/)
  assert.match(migration, /practice_qualifications = public\.bridge_normalize_attorney_practice_qualifications/)
  assert.doesNotMatch(migration, /insert into public\.attorney_firm_members/)
}

const server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const roleContracts = await server.ssrLoadModule('/src/constants/roleContract.js')
  const signupIntents = await server.ssrLoadModule('/src/constants/signupIntents.js')
  const team = await server.ssrLoadModule('/src/services/attorneyTeamService.js')

  const operationalContract = roleContracts.ROLE_CONTRACTS.attorney_operational
  assert.ok(operationalContract)
  assert.equal(operationalContract.profileRole, 'attorney')
  assert.equal(operationalContract.intendedOrgRole, 'attorney')
  assert.equal(operationalContract.attorneyProfessionalRole, 'viewer')
  assert.equal(operationalContract.requiresInvitationOrApproval, true)
  assert.equal(operationalContract.isPrimaryOwner, false)

  assert.equal(
    roleContracts.resolveSignupRoleContract({
      app_role: 'attorney',
      workspace_type: 'attorney_firm',
      intended_org_role: 'attorney',
    }).key,
    'attorney_operational',
  )
  assert.equal(
    roleContracts.resolveSignupRoleContract({
      app_role: 'attorney',
      workspace_type: 'attorney_firm',
      intended_org_role: 'owner',
    }).key,
    'attorney_owner',
  )
  assert.equal(signupIntents.SIGNUP_POSITION_INTENT_MAP.attorney_operational.role_contract_key, 'attorney_operational')
  assert.equal(signupIntents.SIGNUP_POSITION_INTENT_MAP.attorney_operational.workspace_action, 'join_or_request_workspace')

  const transferInvite = team.normalizeAttorneyTeamInvite({
    email: 'transfer@example.com',
    role: 'transfer_attorney',
    departmentType: 'transfer',
  })
  assert.equal(transferInvite.professionalRole, 'attorney_conveyancer')
  assert.deepEqual(transferInvite.practiceQualifications, ['transfer'])
  assert.equal(transferInvite.role, 'transfer_attorney')

  const bondInvite = team.normalizeAttorneyTeamInvite({
    email: 'bond@example.com',
    professionalRole: 'attorney_conveyancer',
    practiceQualifications: ['bond'],
    departmentType: 'bond',
  })
  assert.equal(bondInvite.role, 'bond_attorney')
  assert.deepEqual(bondInvite.practiceQualifications, ['bond'])

  const viewerInvite = team.normalizeAttorneyTeamInvite({
    email: 'viewer@example.com',
    professionalRole: 'viewer',
    departmentType: 'admin',
  })
  assert.equal(viewerInvite.role, 'viewer')
  assert.deepEqual(viewerInvite.practiceQualifications, [])

  assert.throws(
    () => team.normalizeAttorneyTeamInvite({ email: 'admin@example.com', professionalRole: 'firm_admin' }),
    /protected ownership workflow/,
  )
  assert.throws(
    () => team.normalizeAttorneyTeamInvite({ email: 'attorney@example.com', professionalRole: 'attorney_conveyancer' }),
    /practice qualification/,
  )
  assert.throws(
    () => team.normalizeAttorneyTeamInvite({ email: 'bond@example.com', role: 'bond_attorney', departmentType: 'transfer' }),
    /cannot be assigned/,
  )

  verifySourceContracts()
  console.log('Attorney signup and shared team lifecycle Phase 4 verification passed.')
} finally {
  await server.close()
}
