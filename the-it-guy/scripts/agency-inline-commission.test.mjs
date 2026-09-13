import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import React from 'react'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react')
const server = await createServer({
  root: new URL('../', import.meta.url).pathname,
  logLevel: 'silent', server: { middlewareMode: true },
  plugins: [{ name: 'commission-test-storage', enforce: 'pre',
    resolveId(source, importer) {
      if (source.endsWith('/settingsApi') && importer?.includes('InlineCommissionStructure')) return '\0commission-test-storage'
    },
    load(id) { if (id === '\0commission-test-storage') return 'export const saveOrganisationCommissionStructure = (input) => globalThis.__commissionTestSave(input)' },
  }],
})
try {
  const { default: InlineCommissionStructure } = await server.ssrLoadModule('/src/components/commission/InlineCommissionStructure.jsx')
  let saved, selected, busy = false, fail = true
  globalThis.__commissionTestSave = async (input) => {
    saved = input
    if (fail) throw new Error('Test save failed')
    return { ...input, id: 'saved-structure' }
  }
  render(React.createElement('form', null,
    React.createElement('label', null, 'Agent name', React.createElement('input', { defaultValue: 'Test agent' })),
    React.createElement(InlineCommissionStructure, { onCreated: (row) => { selected = row }, onSavingChange: (value) => { busy = value } }),
  ))
  fireEvent.click(screen.getByRole('button', { name: 'Create commission structure here' }))
  assert.equal(document.querySelectorAll('form').length, 1, 'Never nests forms')
  fireEvent.click(screen.getByRole('button', { name: 'Save and select structure' }))
  assert.match(screen.getByRole('alert').textContent, /Enter a name/)
  assert.equal(saved, undefined, 'Invalid form never writes')
  fireEvent.change(screen.getByLabelText('Structure name'), { target: { value: 'Team split' } })
  fireEvent.change(screen.getByLabelText('Agent share (%)'), { target: { value: '65' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save and select structure' }))
  await waitFor(() => assert.match(screen.getByRole('alert').textContent, /Test save failed/))
  assert.equal(screen.getByLabelText('Agent name').value, 'Test agent')
  assert.equal(screen.getByLabelText('Structure name').value, 'Team split')
  assert.equal(busy, false)
  fail = false
  fireEvent.click(screen.getByRole('button', { name: 'Save and select structure' }))
  await waitFor(() => assert.equal(selected?.id, 'saved-structure'))
  assert.equal(saved.agentSplitPercentage, 65)
  assert.equal(saved.agencySplitPercentage, 35)
  assert.equal(saved.isDefault, false)
  assert.equal(screen.getByLabelText('Agent name').value, 'Test agent')
  assert.equal(screen.queryByLabelText('Structure name'), null)
  assert.equal(busy, false)
  console.log('PASS: inline commission validation, retry, persistence selection, complementary split, unchanged default and preserved agent form')
} finally {
  cleanup()
  await server.close()
  dom.window.close()
  delete globalThis.__commissionTestSave
}
