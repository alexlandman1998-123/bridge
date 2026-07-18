import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8')

const page = read('src/pages/AttorneyFirmPage.jsx')
const teamService = read('src/services/attorneyTeamService.js')
const memberService = read('src/services/attorneyFirmMembers.js')

assert.doesNotMatch(page, /inviteOrganisationUser|listOrganisationUsers/)
assert.match(page, /getCurrentUserPrimaryAttorneyFirm/)
assert.match(page, /getAttorneyTeamRoster/)
assert.match(page, /getAttorneyTeamDepartments/)
assert.match(page, /inviteAttorneyTeamMember/)
assert.match(page, /updateAttorneyTeamMember/)
assert.match(page, /removeAttorneyTeamMember/)
assert.match(page, /Practice qualifications/)
assert.match(page, /Protected administrator access/)
assert.match(page, /Pending invites/)
assert.match(page, /user\.isPendingInvitation/)

assert.match(teamService, /source: 'membership'/)
assert.match(teamService, /source: 'invitation'/)
assert.match(teamService, /Firm administrator access must be changed through the protected ownership workflow/)
assert.match(teamService, /cannot be assigned to the selected department/)
assert.match(teamService, /export async function removeAttorneyTeamMember[\s\S]*professional_role === 'firm_admin'/)
assert.match(memberService, /professional_role, practice_qualifications, status/)

const server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const team = await server.ssrLoadModule('/src/services/attorneyTeamService.js')
  const departments = [
    { id: 'transfer-id', name: 'Transfers', departmentType: 'transfer' },
    { id: 'bond-id', name: 'Bonds', departmentType: 'bond' },
    { id: 'admin-id', name: 'Administration', departmentType: 'admin' },
    { id: 'management-id', name: 'Management', departmentType: 'management' },
  ]

  assert.deepEqual(
    team.getAllowedAttorneyTeamDepartments({
      professionalRole: 'attorney_conveyancer',
      practiceQualifications: ['transfer', 'cancellation'],
    }, departments).map((department) => department.id),
    ['transfer-id'],
  )
  assert.deepEqual(
    team.getAllowedAttorneyTeamDepartments({
      professionalRole: 'attorney_conveyancer',
      practiceQualifications: ['bond'],
    }, departments).map((department) => department.id),
    ['bond-id'],
  )
  assert.deepEqual(
    team.getAllowedAttorneyTeamDepartments({ professionalRole: 'admin_staff' }, departments)
      .map((department) => department.id),
    ['admin-id'],
  )
  assert.ok(team.getAttorneyTeamRoleOptions().every((option) => option.value !== 'firm_admin'))

  console.log('Attorney team Settings Phase 5 verification passed.')
} finally {
  await server.close()
}
