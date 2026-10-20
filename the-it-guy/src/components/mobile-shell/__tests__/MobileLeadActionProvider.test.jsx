// @vitest-environment jsdom
import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import MobileLeadActionProvider from '../MobileLeadActionProvider.jsx'
import { useMobileLeadActions } from '../mobileLeadActionContext.js'
import Modal from '../../ui/Modal.jsx'

afterEach(cleanup)
function Trigger({ rental = false, stageKey = '' }) {
  const { openLeadAction, revision } = useMobileLeadActions()
  const location = useLocation()
  return <><button onClick={() => openLeadAction({ leadId: 'one', rental, stageKey })}>Open action</button><p data-testid="location">{location.pathname}{location.search}</p><p data-testid="revision">{revision}</p></>
}
function NestedWorkspace() {
  const [open, setOpen] = useState(false)
  return <><button onClick={() => setOpen(true)}>Log contact</button><Modal open={open} onClose={() => setOpen(false)} title="Contact details"><p>Contact form</p></Modal></>
}
function setup(props = {}, renderWorkspace = vi.fn(() => <p>Shared workspace</p>)) {
  render(<MemoryRouter initialEntries={['/mobile/lead/one?source=home']}><MobileLeadActionProvider renderWorkspace={renderWorkspace}><Trigger {...props} /></MobileLeadActionProvider></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Open action' }))
  return renderWorkspace
}
it('opens the selected buyer workflow on the same mobile route and refreshes after closing', () => {
  const renderWorkspace = setup({ stageKey: 'viewing' })
  expect(screen.getByRole('dialog', { name: 'Buyer next action' })).toBeTruthy()
  expect(screen.getByTestId('location').textContent).toBe('/mobile/lead/one?source=home&tab=appointments')
  expect(renderWorkspace).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'one', rental: false, focusNextAction: false }))
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByTestId('location').textContent).toBe('/mobile/lead/one?source=home')
  expect(screen.getByTestId('revision').textContent).toBe('1')
})
it('opens the tenant workspace for a rental enquiry', () => {
  const renderWorkspace = setup({ rental: true })
  expect(screen.getByRole('dialog', { name: 'Tenant next action' })).toBeTruthy()
  expect(renderWorkspace).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'one', rental: true, focusNextAction: true }))
  expect(screen.getByTestId('location').textContent).toContain('tab=Overview')
})
it('keeps the action module open when Escape closes a nested workflow form', async () => {
  setup({}, () => <NestedWorkspace />)
  fireEvent.click(screen.getByRole('button', { name: 'Log contact' }))
  expect(screen.getByRole('dialog', { name: 'Contact details' })).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Contact details' })).toBeNull())
  expect(screen.getByRole('dialog', { name: 'Buyer next action' })).toBeTruthy()
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Buyer next action' })).getByRole('button', { name: 'Close dialog' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
