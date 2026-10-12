// @vitest-environment jsdom
import React, { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import PrintableMandateTerms from '../PrintableMandateTerms.jsx'

afterEach(cleanup)
const saved = { mandateType: 'sole', startDate: '2026-10-12', endDate: '2027-01-12', protectionPeriod: '', commissionBasis: 'percentage', commissionPercentage: '4', vatHandling: 'inclusive' }
function Form({ initial = saved }) {
  const [value, setValue] = useState(initial)
  return <PrintableMandateTerms value={value} initialValue={initial} onChange={setValue} />
}
it('asks only for the missing protection period and keeps 0 editable', () => {
  render(<Form />)
  expect(screen.queryByLabelText('Mandate start date')).toBeNull()
  expect(screen.queryByLabelText('Commission percentage')).toBeNull()
  const input = screen.getByLabelText('Protection period (calendar days; enter 0 for none)')
  fireEvent.change(input, { target: { value: '0' } })
  expect(input.value).toBe('0')
  expect(screen.getByText('0 days')).toBeTruthy()
  expect(screen.getByText(/4%/)).toBeTruthy()
})
it('shows dependent missing commission fields after choosing a basis', () => {
  render(<Form initial={{ ...saved, commissionBasis: '', commissionPercentage: '', protectionPeriod: '0' }} />)
  fireEvent.change(screen.getByLabelText('Commission basis'), { target: { value: 'fixed' } })
  expect(screen.getByLabelText('Fixed commission (Rand)')).toBeTruthy()
  expect(screen.queryByLabelText('Commission percentage')).toBeNull()
})
it('does not ask to recapture complete saved terms', () => {
  render(<Form initial={{ ...saved, protectionPeriod: '0' }} />)
  expect(screen.queryByRole('spinbutton')).toBeNull()
  expect(screen.getByLabelText('Mandate end date').value).toBe(saved.endDate)
})
it('lets the agent confirm a new end date without changing saved terms automatically', () => {
  render(<Form initial={{ ...saved, endDate: '2026-10-12' }} />)
  const input = screen.getByLabelText('Mandate end date')
  expect(input.value).toBe('2026-10-12')
  fireEvent.change(input, { target: { value: '2027-01-12' } })
  expect(input.value).toBe('2027-01-12')
  expect(screen.getByText(/2027-01-12/)).toBeTruthy()
})
