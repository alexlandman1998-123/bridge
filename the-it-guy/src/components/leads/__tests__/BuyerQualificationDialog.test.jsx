// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import BuyerQualificationDialog from '../BuyerQualificationDialog.jsx'

vi.mock('../../../lib/location/areas', () => ({ searchArch9Areas: vi.fn(async () => []) }))
vi.mock('../../../lib/supabaseClient', () => ({ isSupabaseConfigured: true }))
afterEach(cleanup)
const empty = { budget: '', areaInterest: '', moveTimeframe: '', financeType: '', depositAvailable: '', preApprovalStatus: '', propertyToSell: '', propertyNeed: '', additionalNotes: '' }
const warning = 'Capture at least 2 qualification answers before marking the buyer qualified.'
function Capture({ initial = empty, submitted = () => {}, ...props }) {
  const [form, setForm] = useState(initial)
  return <BuyerQualificationDialog open buyerName="Development buyer" error={warning} form={form} onChange={(key, value) => setForm(current => ({ ...current, [key]: value }))} onClose={() => {}} onSubmit={event => { event.preventDefault(); submitted(form) }} {...props} />
}

it('shows the qualification message inside a named dialog with the editable fields directly below', () => {
  render(<Capture />)
  const dialog = screen.getByRole('dialog', { name: 'Complete buyer qualification' })
  expect(within(dialog).getByRole('alert').textContent).toContain(warning)
  expect(within(dialog).getByRole('combobox', { name: /What is your budget/ })).toBeTruthy()
  expect(within(dialog).getByRole('combobox', { name: 'Which area should we focus on?' })).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Save and complete' }).disabled).toBe(true)
})

it('accepts edits in the popup and submits the current answers instead of a stale saved snapshot', () => {
  const submitted = vi.fn()
  render(<Capture submitted={submitted} />)
  fireEvent.change(screen.getByRole('combobox', { name: /What is your budget/ }), { target: { value: 'R 2m – R 3m' } })
  fireEvent.click(screen.getByRole('button', { name: 'Bond' }))
  const save = screen.getByRole('button', { name: 'Save and complete' })
  expect(save.disabled).toBe(false)
  fireEvent.click(save)
  expect(submitted).toHaveBeenCalledWith(expect.objectContaining({ budget: 'R 2m – R 3m', financeType: 'Bond' }))
})

it('does not count property preferences and call notes as sufficient qualification evidence', () => {
  render(<Capture initial={{ ...empty, propertyNeed: 'House', additionalNotes: 'Interested in the development' }} />)
  expect(screen.getByText('0 answers ready to save · 2 needed')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Save and complete' }).disabled).toBe(true)
})

it('preserves saved budget and timeframe values that are outside the standard dropdown options', () => {
  render(<Capture initial={{ ...empty, budget: 'R3m - R4m', moveTimeframe: 'Before school starts', areaInterest: 'Sea Point' }} />)
  expect(screen.getByRole('combobox', { name: /What is your budget/ }).value).toBe('R3m - R4m')
  expect(screen.getByRole('combobox', { name: /When would you like to move/ }).value).toBe('Before school starts')
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(screen.getByRole('button', { name: 'Save and complete' }).disabled).toBe(false)
})

it('keeps failures and answers visible and prevents duplicate submissions while saving', () => {
  const form = { ...empty, budget: 'R3m - R4m', areaInterest: 'Sea Point' }
  const props = { open: true, form, onChange: vi.fn(), onSubmit: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<BuyerQualificationDialog {...props} saving />)
  expect(screen.getByRole('button', { name: 'Saving…' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Close dialog' })).toBeNull()
  rerender(<BuyerQualificationDialog {...props} error="The lead could not be saved. Try again." />)
  expect(screen.getByRole('alert').textContent).toContain('could not be saved')
  expect(screen.getByRole('combobox', { name: /What is your budget/ }).value).toBe('R3m - R4m')
  expect(screen.getByRole('button', { name: 'Save and complete' }).disabled).toBe(false)
})
