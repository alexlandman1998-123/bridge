/* global process */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

try {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const roles = await server.ssrLoadModule('/src/lib/roles.js')
    const hqItems = roles.getRoleNavItems('bond_originator', { membershipRole: 'bond_hq_manager' })

    assert.deepEqual(
      hqItems.map((item) => item.label),
      ['Dashboard', 'Regions', 'Branches', 'Consultants', 'Applications', 'Partners', 'Reports', 'Settings'],
    )

    const regionalItems = roles.getRoleNavItems('bond_originator', { membershipRole: 'bond_regional_manager' })
    assert.deepEqual(
      regionalItems.map((item) => item.label),
      ['Dashboard', 'Branches', 'Consultants', 'Applications', 'Partners', 'Reports'],
    )

    const branchItems = roles.getRoleNavItems('bond_originator', { membershipRole: 'bond_branch_manager' })
    assert.deepEqual(
      branchItems.map((item) => item.label),
      ['Dashboard', 'Consultants', 'Applications', 'Partners'],
    )

    const consultantItems = roles.getRoleNavItems('bond_originator', { membershipRole: 'bond_consultant' })
    assert.deepEqual(
      consultantItems.map((item) => item.label),
      ['Dashboard', 'My Applications', 'Clients', 'Tasks'],
    )

    const independentItems = roles.getRoleNavItems('bond_originator', { membershipRole: 'bond_independent_consultant' })
    assert.deepEqual(
      independentItems.map((item) => item.label),
      ['Dashboard', 'My Applications', 'Clients', 'Tasks', 'Settings'],
    )
    assert.equal(independentItems.some((item) => item.key === 'bond_regions'), false)
    assert.equal(independentItems.some((item) => item.key === 'bond_branches'), false)

    console.log('bond role navigation tests passed')
  } finally {
    await server.close()
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
