// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import HomeSeekersNextSteps from '../HomeSeekersNextSteps'
import { readNextStepsReview } from '../homeSeekersNextStepsModel'
afterEach(cleanup)
beforeEach(() => localStorage.clear())
function fillQualifier(ffc, sales, value) {
  fireEvent.click(screen.getByRole('button', { name: 'See if you qualify' }))
  for (const [name, answer] of [['First name', 'Review'], ['Surname', 'Agent'], ['Email', 'review@example.test'], ['Mobile', '+27821234567'], ['Which area do you work in?', 'Sandton'], ['Registered sales in the last 12 months', sales], ['Total value of property sold in the last 12 months (R)', value]]) fireEvent.change(screen.getByLabelText(name, { exact: false }), { target: { value: answer } })
  fireEvent.change(screen.getByLabelText('Do you hold a valid Fidelity Fund Certificate?', { exact: false }), { target: { value: ffc } })
  fireEvent.change(screen.getByLabelText('What are you on at the moment?', { exact: false }), { target: { value: '70/30' } })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
}
it('shows all three options and opens the existing application only when requested', () => {
  const apply = vi.fn(); render(<HomeSeekersNextSteps onApply={apply} />)
  expect(screen.getByRole('heading', { name: 'What are your next steps?' })).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Apply to join' })); expect(apply).toHaveBeenCalledTimes(1)
})
it('loads a calendar only after qualifying, with eight weekly slots and a distinct booking event', () => {
  render(<HomeSeekersNextSteps />); fillQualifier('Yes', '0', '6000000')
  expect(screen.getByRole('dialog', { name: 'You’re through.' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next week' })); expect(screen.getAllByRole('radio')).toHaveLength(8)
  fireEvent.click(screen.getAllByRole('radio')[0]); fireEvent.click(screen.getByRole('button', { name: 'Confirm preview booking' }))
  expect(screen.getByText('Your preview call is booked.')).toBeTruthy()
  expect(readNextStepsReview().events.map(row => row.event)).toEqual(['qualifier_started', 'qualifier_passed', 'oneonone_booked'])
})
it.each(['No', 'Application in progress'])('never loads a calendar for FFC=%s', ffc => {
  render(<HomeSeekersNextSteps />); fillQualifier(ffc, '20', '50000000')
  expect(screen.getByRole('dialog', { name: 'Your Fidelity Fund Certificate' })).toBeTruthy()
  expect(screen.queryByRole('radio')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'See the next session' }))
  expect(screen.getByRole('form', { name: 'Information session registration' })).toBeTruthy()
  expect(screen.getByLabelText('First name', { exact: false }).value).toBe('Review')
  expect(readNextStepsReview().records[0].outcome).toBe('C')
})
it('retains the under-bar submission and offers the next session instead of a calendar', () => {
  render(<HomeSeekersNextSteps />); fillQualifier('Yes', '4', '5999999')
  expect(screen.getByRole('dialog', { name: 'Thanks for being straight with us.' })).toBeTruthy()
  expect(screen.queryByRole('radio')).toBeNull(); expect(readNextStepsReview().records[0].outcome).toBe('B')
})
it('saves session answers and offers confirmation and a calendar file without sending messages', () => {
  render(<HomeSeekersNextSteps />); fireEvent.click(screen.getByRole('button', { name: 'Book a seat' }))
  const form = screen.getByRole('form', { name: 'Information session registration' })
  for (const [name, value] of [['First name', 'Local'], ['Surname', 'Reviewer'], ['Email', 'local@example.test'], ['Mobile', '+27821234567'], ['Which area do you work in?', 'Rosebank']]) fireEvent.change(within(form).getByLabelText(name, { exact: false }), { target: { value } })
  fireEvent.change(within(form).getByLabelText('Registered sales in the last 12 months', { exact: false }), { target: { value: '0 to 4' } })
  expect(within(form).getByLabelText('Which session?', { exact: false }).options).toHaveLength(5)
  fireEvent.click(within(form).getByRole('checkbox')); fireEvent.click(within(form).getByRole('button', { name: 'Book a seat' }))
  expect(screen.getByText('Your preview seat is reserved.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Download preview calendar file' }).getAttribute('href')).toContain('data:text/calendar')
  expect(readNextStepsReview().events.map(row => row.event)).toEqual(['session_rsvp'])
})
