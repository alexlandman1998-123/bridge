// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileContactCreateSheet from '../MobileContactCreateSheet.jsx'
const mocks = vi.hoisted(() => ({ workspace: null, context: null }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => mocks.context }))
vi.mock('../../../pages/Clients.jsx', () => ({ AddClientModal: ({ title, mode, organisationId, onClose }) => {
  const [value, setValue] = React.useState('')
  return <div role="dialog" aria-label={title}><p>{mode}:{organisationId}</p><input aria-label="Contact name" value={value} onChange={event => setValue(event.target.value)} /><button onClick={onClose}>Close contact</button></div>
} }))
beforeEach(() => { mocks.workspace = { role: 'agent', profile: { id: 'me' } }; mocks.context = { organisation: { id: 'agency' } } })
afterEach(cleanup)
it('uses the desktop contact form in the current agency and closes without navigation', async () => {
  const close = vi.fn()
  render(<MobileContactCreateSheet onClose={close} />)
  expect(await screen.findByRole('dialog', { name: 'New contact' })).toBeTruthy()
  expect(await screen.findByText('agent:agency')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close contact' }))
  expect(close).toHaveBeenCalledOnce()
})
it('discards an unfinished form when the workspace changes', async () => {
  const { rerender } = render(<MobileContactCreateSheet onClose={vi.fn()} />)
  const name = await screen.findByRole('textbox', { name: 'Contact name' })
  fireEvent.change(name, { target: { value: 'Unsaved person' } })
  mocks.context = { organisation: { id: 'another-agency' } }
  rerender(<MobileContactCreateSheet onClose={vi.fn()} />)
  expect(screen.getByRole('textbox', { name: 'Contact name' }).value).toBe('')
  expect(screen.getByText('agent:another-agency')).toBeTruthy()
})
it('does not offer a save form without a resolved identity and workspace', () => {
  mocks.context = { loading: true }
  render(<MobileContactCreateSheet onClose={vi.fn()} />)
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('Loading contact form…')
})
