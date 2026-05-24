import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { isUnsafeFallbackAllowed } = await server.ssrLoadModule('/src/lib/envValidation.js')
  const { MOCK_DATA_ENABLED } = await server.ssrLoadModule('/src/lib/mockData.js')
  const { WorkspaceContextError } = await server.ssrLoadModule('/src/services/workspaceResolutionService.js')
  const {
    createAgencyLead,
    getAgencyPipelineSnapshot,
    listAppointmentsAsync,
  } = await server.ssrLoadModule('/src/lib/agencyPipelineService.js')
  const { createAgentInvite } = await server.ssrLoadModule('/src/lib/agentInviteService.js')

  assert.equal(isUnsafeFallbackAllowed(), false)
  assert.equal(MOCK_DATA_ENABLED, false)

  const emptySnapshot = getAgencyPipelineSnapshot('11111111-1111-4111-8111-111111111111')
  assert.deepEqual(emptySnapshot.leads, [])
  assert.deepEqual(emptySnapshot.appointments, [])

  assert.throws(
    () => createAgencyLead('11111111-1111-4111-8111-111111111111', { leadCategory: 'Buyer' }),
    WorkspaceContextError,
  )

  assert.rejects(
    () => listAppointmentsAsync('default'),
    WorkspaceContextError,
  )

  assert.throws(
    () => createAgentInvite({ email: 'agent@example.test' }),
    WorkspaceContextError,
  )

  console.log('unsafe fallback guard tests passed')
} finally {
  await server.close()
}
