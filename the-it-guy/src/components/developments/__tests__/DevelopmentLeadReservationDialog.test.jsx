// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import DevelopmentLeadReservationDialog from '../DevelopmentLeadReservationDialog.jsx'

afterEach(cleanup)
const lead = { developerLeadId: 'buyer-one', buyerFullName: 'Test Buyer' }
const units = [{ id: 'unit-one', unitNumber: 'A01', status: 'Available' }, { id: 'unit-two', unitNumber: 'A02', status: 'Reserved' }]
const props = () => ({ leads: [lead], units, initialUnitId: 'unit-one', onClose: vi.fn(), onReserve: vi.fn(), onCreateLead: vi.fn() })

it('requires an explicit buyer selection before reserving available stock', () => {
  const input = props()
  render(<DevelopmentLeadReservationDialog {...input} />)
  const confirm = screen.getByRole('button', { name: 'Confirm reservation' })
  expect(confirm.disabled).toBe(true)
  expect(screen.queryByRole('option', { name: 'A02' })).toBeNull()
  expect(input.onReserve).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Buyer lead'), { target: { value: 'buyer-one' } })
  fireEvent.click(confirm)
  expect(input.onReserve).toHaveBeenCalledExactlyOnceWith({ developerLeadId: 'buyer-one', unitId: 'unit-one' })
})

it('Cancel and Escape close setup without reserving a unit', () => {
  const input = props()
  render(<DevelopmentLeadReservationDialog {...input} />)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(input.onClose).toHaveBeenCalledOnce()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(input.onClose).toHaveBeenCalledTimes(2)
  expect(input.onReserve).not.toHaveBeenCalled()
})

it('does not submit a previously selected unit that is now reserved', () => {
  const input = props()
  render(<DevelopmentLeadReservationDialog {...input} initialLeadId="buyer-one" initialUnitId="unit-two" />)
  expect(screen.getByLabelText('Unit').value).toBe('')
  expect(screen.getByRole('button', { name: 'Confirm reservation' }).disabled).toBe(true)
})
