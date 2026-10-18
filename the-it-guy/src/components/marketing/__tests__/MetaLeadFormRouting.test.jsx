// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import MetaLeadFormRouting from '../MetaLeadFormRouting'
import { joiningPlanError, emptyJoiningPlan } from '../../../pages/recruitment/recruitmentJoiningModel'

afterEach(cleanup)
function Form() {
  const [form, setForm] = useState({ name: 'Agency enquiries', selected: true, leadType: 'seller', branchId: 'branch', assignedAgentId: 'agent' })
  return <><MetaLeadFormRouting form={form} agents={[{ id: 'agent', name: 'Sam Agent' }]} onChange={(patch) => setForm((value) => ({ ...value, ...patch }))} /><output aria-label="Saved routing">{JSON.stringify(form)}</output></>
}
it('routes Recruitment to its pipeline and clears property-agent routing before saving', () => {
  render(<MemoryRouter><Form /></MemoryRouter>)
  expect(screen.getByLabelText('Route to').value).toBe('agent')
  fireEvent.change(screen.getByLabelText('Lead type'), { target: { value: 'recruitment' } })
  expect(screen.queryByLabelText('Route to')).toBeNull()
  expect(screen.getByRole('link', { name: 'Recruitment' }).getAttribute('href')).toBe('/agency/recruitment')
  expect(JSON.parse(screen.getByLabelText('Saved routing').textContent)).toMatchObject({ leadType: 'recruitment', assignedAgentId: null, branchId: null, selected: true })
  fireEvent.change(screen.getByLabelText('Lead type'), { target: { value: 'buyer' } })
  expect(screen.getByLabelText('Route to').value).toBe('')
  fireEvent.change(screen.getByLabelText('Route to'), { target: { value: 'agent' } })
  fireEvent.click(screen.getByLabelText('Agency enquiries'))
  expect(JSON.parse(screen.getByLabelText('Saved routing').textContent)).toMatchObject({ leadType: 'buyer', assignedAgentId: 'agent', selected: false })
})
it('offers all three types and accepts editing a Meta recruitment joining plan', () => {
  render(<MemoryRouter><Form /></MemoryRouter>)
  expect(Array.from(screen.getByLabelText('Lead type').options).map((option) => option.text)).toEqual(['Buyer', 'Seller', 'Recruitment'])
  expect(joiningPlanError(emptyJoiningPlan('meta_lead_ad'))).toBe('')
})
