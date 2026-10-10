// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SellerOnboarding } from '../../../pages/SellerOnboarding.jsx'

afterEach(cleanup)

function capture(props = {}) {
  return render(<MemoryRouter><SellerOnboarding tokenOverride="demo-seller-onboarding" embedded {...props} /></MemoryRouter>)
}

test('embedded agent capture has one working draft action and saves incomplete answers without remote writes', async () => {
  const saved = vi.fn()
  const busy = vi.fn()
  capture({ completionModeOverride: 'agent_assisted', onDraftSaved: saved, onSaveStateChange: busy })
  await screen.findByText('Agent-assisted onboarding.')
  expect(screen.getAllByRole('button', { name: 'Save Draft', exact: true })).toHaveLength(1)
  expect(screen.getByLabelText(/I confirm the seller gave this permission.*I consent/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Partial capture' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft', exact: true }))
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
  expect(saved.mock.calls[0][0].sellerOnboarding.formData.sellerFirstName).toBe('Partial capture')
  expect(saved.mock.calls[0][0].sellerOnboarding.status).toBe('in_progress')
  expect(saved.mock.calls[0][0].sellerOnboarding.formData.propertyDisclosure.declarationAccepted).toBe(false)
  expect(busy).toHaveBeenLastCalledWith(false)
})

test('both capture modes expose the same seller identity, FICA and mandate fields', async () => {
  const fields = ['First name', 'Surname', 'Email', 'Phone', 'Date of Birth *', 'Nationality *', 'Alternative Number',
    'Residential address', 'Tax Number *', 'SA Resident *', 'Occupation or business activity', 'Source of funds / wealth',
    'Mandate start date', 'Mandate end date']
  for (const completionModeOverride of ['self_service', 'agent_assisted']) {
    capture({ completionModeOverride })
    await screen.findByRole('heading', { name: 'Personal details' })
    for (const label of fields) expect(screen.getAllByLabelText(label, { exact: true })).toHaveLength(1)
    cleanup()
  }
})

test('incomplete answers can be saved but cannot advance to submission', async () => {
  const saved = vi.fn()
  capture({ completionModeOverride: 'agent_assisted', onDraftSaved: saved })
  await screen.findByRole('heading', { name: 'Personal details' })
  fireEvent.click(screen.getByRole('button', { name: 'Save & Continue', exact: true }))
  await screen.findByRole('alert')
  expect(screen.getByRole('heading', { name: 'Personal details' })).toBeTruthy()
  expect(saved).not.toHaveBeenCalled()
})
