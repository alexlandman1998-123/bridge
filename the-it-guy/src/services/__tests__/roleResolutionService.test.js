import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { resolveCurrentWorkspaceAppRole } = await server.ssrLoadModule('/src/services/roleResolutionService.js')

  assert.equal(
    resolveCurrentWorkspaceAppRole({
      baseRole: 'agent',
      workspaceType: 'attorney_firm',
      workspaceRole: 'partner',
    }),
    'attorney',
    'an attorney-firm workspace must render the attorney module even if the profile has another professional role',
  )

  assert.equal(
    resolveCurrentWorkspaceAppRole({
      baseRole: 'attorney',
      workspaceType: 'agency',
      workspaceRole: 'principal',
    }),
    'agent',
    'switching to an agency workspace must render the agency module',
  )

  assert.equal(
    resolveCurrentWorkspaceAppRole({
      baseRole: 'developer',
      workspaceType: 'developer_company',
      workspaceRole: 'owner',
    }),
    'developer',
  )

  assert.equal(
    resolveCurrentWorkspaceAppRole({
      baseRole: 'agent',
      workspaceType: 'bond_originator',
      workspaceRole: 'consultant',
    }),
    'bond_originator',
  )

  assert.equal(
    resolveCurrentWorkspaceAppRole({
      baseRole: 'client',
      workspaceType: 'attorney_firm',
      workspaceRole: 'owner',
    }),
    'client',
    'a client identity must never gain an attorney presentation mode from workspace metadata',
  )

  assert.equal(
    resolveCurrentWorkspaceAppRole({
      baseRole: 'platform_admin',
      workspaceType: 'attorney_firm',
      workspaceRole: 'owner',
    }),
    'platform_admin',
    'a platform admin identity must remain explicit',
  )

  assert.equal(
    resolveCurrentWorkspaceAppRole({ baseRole: 'attorney' }),
    'attorney',
    'missing workspace context must preserve the established profile role',
  )

  console.log('roleResolutionService tests passed')
} finally {
  await server.close()
}
