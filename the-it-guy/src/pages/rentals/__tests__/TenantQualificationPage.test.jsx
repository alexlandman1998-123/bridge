// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TenantQualificationPage from '../TenantQualificationPage'
import { invokeEdgeFunction } from '../../../lib/supabaseClient'
vi.mock('../../../lib/supabaseClient', () => ({ invokeEdgeFunction: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const session = { status: 'pending', enquiryKind: 'rental', organisationName: 'Test rentals', properties: [{ id: 'property', title: 'Rental home' }] }

function completeForm() {
  for (const [label, value] of [
    ['What is your maximum monthly rent?', '12000'], ['Which areas should we focus on?', 'Newlands'],
    ['When would you like to move?', '2026-11-01'], ['What is your employment or income situation?', 'Employed'],
    ['Is the rental deposit available?', 'Yes'], ['Do you agree to rental application screening?', 'No'],
    ['What type of property and features do you need?', 'Apartment'], ['How many people will live in the property?', '2'],
    ['Will any pets live with you?', 'No pets'], ['Date for option 1', '2026-10-15'], ['From for option 1', '10:00'], ['Until for option 1', '11:00'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
it('submits tenant keys and one viewing request without buyer fields or invented consent', async () => {
  invokeEdgeFunction.mockResolvedValue({ data: { session: { ...session, status: 'submitted' } } })
  render(<TenantQualificationPage token="token" session={session} />)
  expect(screen.queryByText(/Cash or bond|Pre-approval|Quick buyer details/)).toBeNull()
  completeForm()
  fireEvent.click(screen.getByRole('button', { name: 'Send qualification and viewing request' }))
  await waitFor(() => expect(screen.getByText('Thank you, your rental details are received.')).toBeTruthy())
  const body = invokeEdgeFunction.mock.calls[0][1].body
  expect(body.qualificationAnswers).toMatchObject({ monthlyBudget: '12000', desiredArea: 'Newlands', screeningConsent: 'No' })
  expect(body.availabilitySlots).toEqual([{ date: '2026-10-15', startTime: '10:00', endTime: '11:00' }])
  expect(body.buyerIntake).toBeUndefined()
  expect(screen.getByText(/not a booked appointment yet/)).toBeTruthy()
})
it('retains the form after a save error and permits retry', async () => {
  invokeEdgeFunction.mockResolvedValue({ data: { error: 'Please retry your submission.' } })
  render(<TenantQualificationPage token="token" session={session} />)
  completeForm()
  fireEvent.click(screen.getByRole('button', { name: 'Send qualification and viewing request' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Please retry'))
  expect(screen.getByLabelText('What is your maximum monthly rent?').value).toBe('12000')
  expect(screen.getByRole('button', { name: 'Send qualification and viewing request' }).disabled).toBe(false)
})
it('rejects reversed viewing ranges before any request and caps optional times at three', () => {
  render(<TenantQualificationPage token="token" session={session} />)
  completeForm()
  fireEvent.change(screen.getByLabelText('Until for option 1'), { target: { value: '09:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send qualification and viewing request' }))
  expect(screen.getByRole('alert').textContent).toContain('end time after')
  expect(invokeEdgeFunction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Add another viewing option'))
  fireEvent.click(screen.getByText('Add another viewing option'))
  expect(screen.queryByText('Add another viewing option')).toBeNull()
})
