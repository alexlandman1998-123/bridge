// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  fireEvent.click(screen.getByRole('button', { name: 'Link Test Buyer' }))
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
  expect(screen.getByText('This unit is no longer available for reservation.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Confirm reservation' }).disabled).toBe(true)
})


it('creates the canonical buyer inline, selects the returned lead and requires a separate reservation confirmation', async () => {
  const input = props()
  const created = { developerLeadId: 'new-buyer', buyerFullName: 'New Buyer', leadStatus: 'new' }
  input.onCreateLead.mockResolvedValue(created)
  const view = render(<DevelopmentLeadReservationDialog {...input} />)
  fireEvent.click(screen.getByRole('button', { name: 'New buyer' }))
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'New' } })
  fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Buyer' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create buyer & continue' })))
  expect(input.onCreateLead).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'New', lastName: 'Buyer', preferredUnitId: 'unit-one' }))
  expect(input.onReserve).not.toHaveBeenCalled()
  view.rerender(<DevelopmentLeadReservationDialog {...input} leads={[lead, created]} />)
  expect(screen.getByRole('button', { name: 'Link New Buyer' }).getAttribute('aria-pressed')).toBe('true')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm reservation' })))
  expect(input.onReserve).toHaveBeenCalledWith({ developerLeadId: 'new-buyer', unitId: 'unit-one' })
})

it('saves permitted stages and routes evidence-dependent stages to the buyer workflow', async () => {
  const onChangeStage = vi.fn().mockResolvedValue({ leadStatus: 'qualified' })
  const onOpenLead = vi.fn()
  render(<DevelopmentLeadReservationDialog {...props()} initialLeadId="buyer-one" onChangeStage={onChangeStage} onOpenLead={onOpenLead} />)
  fireEvent.change(screen.getByLabelText('Lead stage'), { target: { value: 'qualified' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save lead stage' })))
  expect(onChangeStage).toHaveBeenCalledWith('buyer-one', 'qualified')
  fireEvent.change(screen.getByLabelText('Lead stage'), { target: { value: 'offer' } })
  expect(screen.queryByRole('button', { name: 'Save lead stage' })).toBeNull()
  expect(screen.getByText('Complete this stage in the buyer workflow using its saved evidence.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Open buyer workflow' }))
  expect(onOpenLead).toHaveBeenCalledWith('buyer-one', 'offer')
})

it('rechecks stock when parent data changes instead of submitting a stale available unit', () => {
  const input = props()
  const view = render(<DevelopmentLeadReservationDialog {...input} initialLeadId="buyer-one" />)
  expect(screen.getByRole('button', { name: 'Confirm reservation' }).disabled).toBe(false)
  view.rerender(<DevelopmentLeadReservationDialog {...input} initialLeadId="buyer-one" units={[{ ...units[0], status: 'Reserved' }]} />)
  expect(screen.getByRole('button', { name: 'Confirm reservation' }).disabled).toBe(true)
  expect(input.onReserve).not.toHaveBeenCalled()
})

it('shows a confirmed hold with release and protects against rewinding its lead stage', async () => {
  const input = props()
  render(<DevelopmentLeadReservationDialog {...input} leads={[{ ...lead, leadStatus: 'onboarding_sent', preferredUnitId: 'unit-two', reservationState: 'reserved' }]} initialLeadId="buyer-one" initialUnitId="unit-two" />)
  expect(screen.getByRole('heading', { name: 'Buyer onboarding sent' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Lead stage'), { target: { value: 'qualified' } })
  expect(screen.queryByRole('button', { name: 'Save lead stage' })).toBeNull()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Release reservation' })))
  expect(input.onReserve).toHaveBeenCalledWith({ developerLeadId: 'buyer-one', unitId: 'unit-two', reserved: false })
})

it('blocks confirmation when leads are unavailable and keeps failed saves visible', async () => {
  const input = props()
  input.onReserve.mockRejectedValue(Error('Another buyer reserved this unit.'))
  const view = render(<DevelopmentLeadReservationDialog {...input} initialLeadId="buyer-one" leadsError="Read denied" />)
  expect(screen.getByRole('button', { name: 'Confirm reservation' }).disabled).toBe(true)
  view.rerender(<DevelopmentLeadReservationDialog {...input} initialLeadId="buyer-one" />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm reservation' })))
  expect(screen.getByRole('alert').textContent).toContain('Another buyer reserved this unit.')
  expect(input.onClose).not.toHaveBeenCalled()
})
