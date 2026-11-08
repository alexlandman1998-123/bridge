// @vitest-environment jsdom
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { parse } from '@babel/parser'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import contract from './fixtures/lead-dialog-extraction.json'
import LeadActivityDialog from '../LeadActivityDialog.jsx'
afterEach(cleanup)

it.each(contract)('preserves the full $name controls, callbacks and open conditions', record => {
  const source = readFileSync(resolve(cwd(), 'src/pages/agency', `${record.name}.jsx`), 'utf8')
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
  const fn = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration
  const element = fn.body.body.find(node => node.type === 'ReturnStatement').argument
  expect(createHash('sha256').update(source.slice(element.start, element.end)).digest('hex')).toBe(record.jsxHash)
  expect(fn.params[0].properties.map(property => property.key.name).sort()).toEqual([...record.props].sort())
  const page = readFileSync(resolve(cwd(), 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
  expect(page).toContain(`const ${record.name} = lazy(() => import('./${record.name}.jsx'))`)
  expect(page).toContain(`{(${record.openExpression}) ? <Suspense`)
})

it('retains a controlled draft across closing and reopening the extracted activity dialog', async () => {
  const submit = vi.fn()
  function Harness() {
    const [open, setOpen] = useState(true)
    const [form, setForm] = useState({ activityType: 'Call', outcome: '', activityNote: 'Original note' })
    return <><button onClick={() => setOpen(true)}>Open composer</button>{open ? <LeadActivityDialog
      activityComposerOpen={open} activityComposerMode="note" activityForm={form} setActivityForm={setForm}
      LEAD_ACTIVITY_COMPOSER_MODES={[]} LEAD_ACTIVITY_SUGGESTION_CHIPS={[]} activityOutcomeOptions={[]} agentOptions={[]}
      taskForm={{}} setTaskForm={() => {}} handleActivityComposerModeChange={() => {}} handleAppendActivitySuggestion={() => {}}
      closeActivityComposer={() => setOpen(false)} handleUnifiedActivitySubmit={event => { event.preventDefault(); submit(form) }}
    /> : null}</>
  }
  render(<Harness />)
  fireEvent.change(screen.getByPlaceholderText('Write an internal note...'), { target: { value: 'Unsaved draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open composer' }))
  expect(screen.getByPlaceholderText('Write an internal note...').value).toBe('Unsaved draft')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add Note' })))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ activityNote: 'Unsaved draft' }))
})
