// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicAgentDigitalCardPage from '../PublicAgentDigitalCardPage.jsx'
import { buildAgencyPublicIntakeContract, buildAgencyPublicIntakeCrmRows, validateAgencyIntakeSubmission } from '../../../server/services/publicAgencyIntakeApi.js'
import { isRentalCrmLead } from '../../services/rentals/rentalCrmLeadModel.js'

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), submit: vi.fn(), track: vi.fn() }))
vi.mock('../../services/agencyPublicIntakeService', () => ({
  resolveAgencyPublicAgentCard: mocks.resolve,
  resolveAgencyPublicCardListings: vi.fn().mockResolvedValue([]),
  submitAgencyPublicIntake: mocks.submit,
  recordAgentDigitalCardEventSoon: mocks.track,
  AGENCY_PUBLIC_INTAKE_PRIVACY_VERSION: 'privacy-v1',
  getOrCreateAgencyIntakeIdempotencyKey: () => 'rental-profile-123456789',
  rotateAgencyIntakeIdempotencyKey: vi.fn(),
}))
const link = {
  slug: 'kevin', organisation_id: '11111111-1111-4111-8111-111111111111',
  default_assigned_agent_id: '22222222-2222-4222-8222-222222222222', enabled_intents: ['rent'],
  metadata_json: { surface: 'agent_digital_card', agentDigitalCard: {
    agent: { name: 'Kevin Croft' }, rentalCtaLabel: 'Find a rental', features: { listings: false },
  } },
}
function show() { render(<MemoryRouter initialEntries={['/card/kevin']}><Routes><Route path="/card/:cardSlug" element={<PublicAgentDigitalCardPage />} /></Routes></MemoryRouter>) }
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, '', '/'); mocks.resolve.mockResolvedValue(buildAgencyPublicIntakeContract({ link, organisation: { name: 'Kingdom' } })) })
afterEach(cleanup)

it('captures a tenant enquiry from a rental-only public card, including assignment and monthly budget', async () => {
  let persisted
  mocks.submit.mockImplementation(async ({ payload }) => {
    const { normalized, errors } = validateAgencyIntakeSubmission({ ...payload, idempotencyKey: 'rental-profile-123456789' }, link)
    expect(errors).toEqual({})
    persisted = buildAgencyPublicIntakeCrmRows({ link, normalized, submission: { payload_json: payload } })
    return { accepted: true }
  })
  show()
  fireEvent.click(await screen.findByRole('button', { name: /Find a rental/ }))
  for (const [label, value] of [['First name', 'Jane'], ['Surname', 'Tenant'], ['Email address', 'jane@example.test'], ['Mobile number', '0821234567']]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.change(screen.getByLabelText('Preferred areas'), { target: { value: 'Montana' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.queryByLabelText('Finance readiness')).toBeNull()
  fireEvent.change(screen.getByLabelText(/Maximum monthly rent/), { target: { value: '12000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Send enquiry' }))
  await screen.findByText(/Kevin Croft has your enquiry/)
  expect(isRentalCrmLead(persisted.leadRow)).toBe(true)
  expect(persisted.leadRow.assigned_agent_id).toBe(link.default_assigned_agent_id)
  expect(persisted.leadRow.raw_enquiry_payload.rentalCrm.qualification).toMatchObject({ monthlyBudget: 12000, desiredArea: 'Montana' })
  expect(persisted.requirementRow).toBeNull()
  expect(mocks.submit).toHaveBeenCalledTimes(1)
})

it('does not expose or open rentals when disabled, including a direct rental URL', async () => {
  window.history.replaceState({}, '', '/?intent=rent')
  mocks.resolve.mockResolvedValue(buildAgencyPublicIntakeContract({ link: { ...link, enabled_intents: ['buy'] } }))
  show()
  await screen.findByText('How can I help you?')
  expect(screen.queryByRole('button', { name: /Find a rental/ })).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('opens the rental form from the saved card rental link', async () => {
  window.history.replaceState({}, '', '/?intent=rent')
  show()
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
  expect(screen.getByText('Find a rental home')).toBeTruthy()
})
