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

    const pipelineItem = items.find((item) => item.key === 'pipeline')
    assert.ok(pipelineItem)
    assert.equal(Array.isArray(pipelineItem.children), true)
    assert.equal(pipelineItem.children.some((item) => item.label === 'My Applications'), true)
    assert.equal(pipelineItem.children.some((item) => item.label === 'Bank Feedback'), true)

    const transactionItem = items.find((item) => item.key === 'transactions')
    assert.ok(transactionItem)
    assert.equal(Array.isArray(transactionItem.children), true)
    assert.equal(transactionItem.children.some((item) => item.label === 'Active Transactions'), true)
    assert.equal(transactionItem.children.some((item) => item.label === 'Registered'), true)

    assert.equal(items.some((item) => item.key === 'teams'), true)
    assert.equal(items.some((item) => item.key === 'banks'), true)
    assert.equal(items.some((item) => item.key === 'performance'), true)
    assert.equal(items.some((item) => item.key === 'settings'), true)
    assert.equal(items.find((item) => item.key === 'dashboard')?.navSection, 'main')
    assert.equal(items.find((item) => item.key === 'documents')?.navSection, 'operations')
    assert.equal(items.find((item) => item.key === 'reports')?.navSection, 'insights')

    console.log('bond role navigation tests passed')
  } finally {
    await server.close()
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
