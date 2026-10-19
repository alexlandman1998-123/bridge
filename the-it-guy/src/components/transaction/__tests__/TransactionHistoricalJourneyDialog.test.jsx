// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import TransactionHistoricalJourneyDialog from '../TransactionHistoricalJourneyDialog.jsx'

afterEach(cleanup)
it('saves only explicitly confirmed milestones with optional dates', async () => {
  const save = vi.fn(async () => {})
  const close = vi.fn()
  render(<TransactionHistoricalJourneyDialog onSave={save} onClose={close} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Registered' }))
  fireEvent.change(screen.getByLabelText('Registered date'), { target: { value: '2026-01-12' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'OTP' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save progress' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(save).toHaveBeenCalledExactlyOnceWith({ registration: { completedOn: '2026-01-12' }, otp_signed: { completedOn: null } }, 0)
})
it('retains existing confirmations and supports removal without inferring other milestones', async () => {
  const save = vi.fn(async () => {})
  render(<TransactionHistoricalJourneyDialog history={{ recordRevision: 3, milestones: { finance: { completedOn: null } } }} onSave={save} onClose={() => {}} />)
  expect(screen.getByRole('checkbox', { name: 'Finance' }).checked).toBe(true)
  expect(screen.getByRole('checkbox', { name: 'OTP' }).checked).toBe(false)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Finance' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save progress' }))
  await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith({}, 3))
})
it('keeps edits open when persistence fails and prevents duplicate saves', async () => {
  let reject
  const save = vi.fn(() => new Promise((_, fail) => { reject = fail }))
  const close = vi.fn()
  render(<TransactionHistoricalJourneyDialog onSave={save} onClose={close} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Lodged' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save progress' }))
  expect(screen.getByRole('button', { name: 'Saving…' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
  reject(new Error('Historical progress changed. Reopen the form before saving.'))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('changed'))
  expect(close).not.toHaveBeenCalled()
  expect(screen.getByRole('checkbox', { name: 'Lodged' }).checked).toBe(true)
})
it('keeps the opening revision when a background refresh arrives during editing', async () => {
  const save = vi.fn(async () => {})
  const close = () => {}
  const { rerender } = render(<TransactionHistoricalJourneyDialog history={{ recordRevision: 1, milestones: {} }} onSave={save} onClose={close} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'OTP' }))
  rerender(<TransactionHistoricalJourneyDialog history={{ recordRevision: 2, milestones: { finance: { completedOn: null } } }} onSave={save} onClose={close} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save progress' }))
  await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith({ otp_signed: { completedOn: null } }, 1))
})
