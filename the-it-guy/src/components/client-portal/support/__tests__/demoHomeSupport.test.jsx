// @vitest-environment jsdom
import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DemoHomeSupport, { DemoHomeSupportProvider } from '../DemoHomeSupport'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function openClaim() {
  render(<DemoHomeSupport includeClaim propertyAddress="2 Pine Avenue" />)
  fireEvent.click(screen.getByRole('button', { name: /^Submit a claim/ }))
}

function completeIncident() {
  fireEvent.change(screen.getByLabelText('Incident date'), { target: { value: '2026-01-02' } })
  fireEvent.change(screen.getByLabelText('Tell us what happened'), { target: { value: 'A kitchen pipe leaked.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next: photos' }))
}

it('requires incident details and rejects a future date before advancing', () => {
  openClaim()
  fireEvent.click(screen.getByRole('button', { name: 'Next: photos' }))
  expect(screen.getByRole('alert').textContent).toContain('incident date and a short description')
  fireEvent.change(screen.getByLabelText('Incident date'), { target: { value: '2099-01-01' } })
  fireEvent.change(screen.getByLabelText('Tell us what happened'), { target: { value: 'A kitchen pipe leaked.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next: photos' }))
  expect(screen.getByRole('alert').textContent).toContain('cannot be in the future')
  expect(screen.queryByRole('button', { name: 'Review claim' })).toBeNull()
})

it('reviews the selected policy, incident and sample photos, then creates only a local claim', () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  openClaim()
  fireEvent.change(screen.getByLabelText('Sample policy'), { target: { value: 'contents' } })
  completeIncident()
  fireEvent.click(screen.getByRole('button', { name: 'Use sample photos' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove sample-damage.jpg' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review claim' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByText('King Price · Household contents')).toBeTruthy()
  expect(dialog.getByText('A kitchen pipe leaked.')).toBeTruthy()
  expect(dialog.getByText('sample-incident.jpg')).toBeTruthy()
  expect(dialog.queryByText('sample-damage.jpg')).toBeNull()
  fireEvent.click(dialog.getByRole('button', { name: 'Submit demo claim' }))
  expect(dialog.getByText('DEMO-CLM-1001')).toBeTruthy()
  expect(dialog.getAllByText('Not started in this demo')).toHaveLength(2)
  expect(dialog.getByText(/Nothing has been sent to an insurer/)).toBeTruthy()
  fireEvent.click(dialog.getByRole('button', { name: 'Done' }))
  fireEvent.click(screen.getByRole('button', { name: /View claim/ }))
  expect(screen.getByRole('dialog', { name: 'Your demo claim' })).toBeTruthy()
  expect(screen.getByText('DEMO-CLM-1001')).toBeTruthy()
  expect(fetch).not.toHaveBeenCalled()
})

it('allows a claim without photos and retains incident details when going back', () => {
  openClaim()
  completeIncident()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByLabelText('Incident date').value).toBe('2026-01-02')
  expect(screen.getByLabelText('Tell us what happened').value).toBe('A kitchen pipe leaked.')
  fireEvent.click(screen.getByRole('button', { name: 'Next: photos' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review claim' }))
  expect(screen.getByText('No photos attached')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Submit demo claim' }))
  expect(screen.getByText('Your demo claim is ready.')).toBeTruthy()
})

it('validates photo type, size and count without reading file contents', () => {
  openClaim()
  completeIncident()
  const chooser = screen.getByLabelText('Attach incident photos')
  fireEvent.change(chooser, { target: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] } })
  expect(screen.getByRole('alert').textContent).toContain('Choose JPG, PNG')
  const oversized = new File([], 'large.jpg', { type: 'image/jpeg' })
  Object.defineProperty(oversized, 'size', { value: 11 * 1024 * 1024 })
  fireEvent.change(chooser, { target: { files: [oversized] } })
  expect(screen.getByRole('alert').textContent).toContain('10 MB each')
  const photos = Array.from({ length: 6 }, (_, i) => new File(['image'], `damage-${i}.jpg`, { type: 'image/jpeg' }))
  fireEvent.change(chooser, { target: { files: photos } })
  expect(screen.getByRole('alert').textContent).toContain('up to five photos')
  const read = vi.fn(() => { throw new Error('Must not read photos') })
  Object.defineProperty(photos[0], 'arrayBuffer', { value: read })
  Object.defineProperty(photos[0], 'text', { value: read })
  fireEvent.change(chooser, { target: { files: [photos[0]] } })
  expect(screen.getByText('damage-0.jpg')).toBeTruthy()
  expect(read).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Remove damage-0.jpg' }))
  expect(screen.queryByText('damage-0.jpg')).toBeNull()
})

it('restores keyboard focus on Escape and discards an unsubmitted draft', async () => {
  render(<DemoHomeSupport includeClaim />)
  const trigger = screen.getByRole('button', { name: /^Submit a claim/ })
  trigger.focus()
  fireEvent.click(trigger)
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' })))
  fireEvent.change(screen.getByLabelText('Tell us what happened'), { target: { value: 'Unsubmitted draft' } })
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  fireEvent.click(trigger)
  expect(screen.getByLabelText('Tell us what happened').value).toBe('')
  expect(screen.queryByRole('button', { name: /View claim/ })).toBeNull()
})

function NavigationHarness() {
  const [page, setPage] = useState('insurance')
  return <><button onClick={() => setPage('maintenance')}>Go to Maintenance</button><button onClick={() => setPage('insurance')}>Go to Insurance</button><DemoHomeSupport key={page} propertyAddress="2 Pine Avenue" includeClaim={page === 'insurance'} /></>
}

it('validates assistance details and keeps the same request across both pages', () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  render(<DemoHomeSupportProvider><NavigationHarness /></DemoHomeSupportProvider>)
  fireEvent.click(screen.getByRole('button', { name: /^Emergency assist/ }))
  expect(screen.getByRole('button', { name: 'Next: your details' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('radio', { name: /^Electrical/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Next: your details' }))
  expect(screen.getByLabelText('Assistance address').value).toBe('2 Pine Avenue')
  expect(screen.getByLabelText('Contact name').value).toBe('Alex Morgan')
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create demo request' }))
  expect(screen.getByRole('alert').textContent).toContain('7 to 15 digits')
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '082 555 0199' } })
  fireEvent.change(screen.getByLabelText('Assistance address'), { target: { value: '4 Cedar Road' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create demo request' }))
  expect(screen.getByText('DEMO-AST-1001')).toBeTruthy()
  expect(screen.getByText('4 Cedar Road')).toBeTruthy()
  expect(screen.getByText(/No team has been contacted/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  fireEvent.click(screen.getByRole('button', { name: 'Go to Maintenance' }))
  expect(screen.queryByRole('button', { name: /^Submit a claim/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /View request/ }))
  expect(screen.getByRole('dialog', { name: 'Your demo assistance request' })).toBeTruthy()
  expect(screen.getByText('DEMO-AST-1001')).toBeTruthy()
  expect(screen.getByText('Electrical')).toBeTruthy()
  expect(screen.getByText('082 555 0199')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  fireEvent.click(screen.getByRole('button', { name: 'Go to Insurance' }))
  expect(screen.getByRole('button', { name: /View request/ }).textContent).toContain('DEMO-AST-1001')
  expect(fetch).not.toHaveBeenCalled()
})
