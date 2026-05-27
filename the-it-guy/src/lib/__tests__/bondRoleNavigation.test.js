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
    const items = roles.getRoleNavItems('bond_originator')

    const pipelineItem = items.find((item) => item.key === 'bond_pipeline')
    assert.ok(pipelineItem)
    assert.equal(pipelineItem.label, 'Pipeline')
    assert.equal(pipelineItem.to, '/bond/pipeline')

    const applicationItem = items.find((item) => item.key === 'applications')
    assert.ok(applicationItem)
    assert.equal(applicationItem.label, 'Applications')
    assert.equal(applicationItem.to, '/bond/applications')

    const organisationItem = items.find((item) => item.key === 'bond_organisation')
    assert.ok(organisationItem)
    assert.equal(organisationItem.label, 'Organisation')
    assert.equal(organisationItem.to, '/bond/organisation')

    assert.equal(items.some((item) => item.key === 'documents'), true)
    assert.equal(items.some((item) => item.key === 'tasks'), true)
    assert.equal(items.some((item) => item.key === 'bond_calendar'), true)
    assert.equal(items.some((item) => item.key === 'settings'), true)
    assert.equal(items.find((item) => item.key === 'dashboard')?.navSection, 'main')
    assert.equal(items.find((item) => item.key === 'documents')?.navSection, 'secondary')
    assert.equal(items.find((item) => item.key === 'settings')?.navSection, 'secondary')

    console.log('bond role navigation tests passed')
  } finally {
    await server.close()
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
