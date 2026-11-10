// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DevelopmentAvailabilityWorkspace from '../DevelopmentAvailabilityWorkspace.jsx'

vi.mock('../DevelopmentVisualMappingStudio', () => ({ default: () => null }))
afterEach(cleanup)
const unit = { id: 'unit-1', unitNumber: '101', unitType: 'Studio', status: 'Available', currentPrice: 1500000 }
const options = ['Available', 'Reserved', 'Finance Pending', 'Sold', 'Not Released'].map(value => ({ value, label: value }))

it('places reservations immediately below the gradient workspace banner and before filters', () => {
  render(<DevelopmentAvailabilityWorkspace units={[unit]} reservationWorkspace={<section aria-label="Reservation controls">Reservations</section>} />)
  const banner = screen.getByRole('heading', { name: 'Availability workspace' }).closest('section')
  const reservations = screen.getByRole('region', { name: 'Reservation controls' })
  expect(banner.nextElementSibling).toBe(reservations)
  expect(reservations.nextElementSibling).toBe(screen.getByRole('region', { name: 'Availability filters' }))
})

it('defaults to cards and saves list statuses without opening the unit workspace', () => {
  const save = vi.fn()
  const { rerender } = render(<DevelopmentAvailabilityWorkspace units={[unit]} canManageInventory unitStatusOptions={options} onChangeUnitStatus={save} />)
  expect(screen.getByRole('button', { name: 'Cards', exact: true }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByTestId('availability-unit-cards').className).toContain('xl:grid-cols-4')
  fireEvent.click(screen.getByRole('button', { name: 'List', exact: true }))
  const select = screen.getByRole('combobox', { name: 'Update status for unit 101' })
  fireEvent.click(select)
  fireEvent.change(select, { target: { value: 'Finance Pending' } })
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: unit.id }), 'Finance Pending')
  expect(screen.queryByRole('dialog')).toBeNull()
  // Only the persisted parent data changes the displayed value and stock totals.
  expect(select.value).toBe('Available')
  rerender(<DevelopmentAvailabilityWorkspace units={[{ ...unit, status: 'Finance Pending' }]} canManageInventory unitStatusOptions={options} onChangeUnitStatus={save} />)
  expect(screen.getByRole('combobox', { name: 'Update status for unit 101' }).value).toBe('Finance Pending')
  expect(within(screen.getByText('Reserved', { selector: 'span' }).closest('article')).getByText('1')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cards', exact: true }))
  expect(within(screen.getByTestId('availability-unit-cards')).getByText('Reserved')).toBeTruthy()
})

it('keeps status controls read-only for viewers and disables edits during a save', () => {
  const { rerender } = render(<DevelopmentAvailabilityWorkspace units={[unit]} onChangeUnitStatus={vi.fn()} unitStatusOptions={options} />)
  fireEvent.click(screen.getByRole('button', { name: 'List', exact: true }))
  expect(screen.queryByRole('combobox', { name: 'Update status for unit 101' })).toBeNull()
  rerender(<DevelopmentAvailabilityWorkspace units={[unit]} canManageInventory unitStatusSaving onChangeUnitStatus={vi.fn()} unitStatusOptions={options} />)
  expect(screen.getByRole('combobox', { name: 'Update status for unit 101' }).disabled).toBe(true)
})


it('opens a contained unit popup and hands reservation setup to the shared buyer dialog', () => {
  const reserve = vi.fn()
  render(<DevelopmentAvailabilityWorkspace units={[unit]} canManageInventory onReserveUnit={reserve} />)
  fireEvent.click(screen.getByRole('button', { name: /Unit 101 Available/ }))
  const dialog = screen.getByRole('dialog', { name: 'Unit workspace' })
  expect(dialog.className).not.toContain('inset-0')
  expect(dialog.className).not.toContain('w-screen')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reserve for a buyer' }))
  expect(reserve).toHaveBeenCalledWith(expect.objectContaining({ id: unit.id }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
