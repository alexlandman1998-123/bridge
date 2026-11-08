// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AreaAutocomplete from '../AreaAutocomplete'
import Modal from '../../ui/Modal'
import { searchArch9Areas } from '../../../lib/location/areas'

vi.mock('../../../lib/location/areas', () => ({ searchArch9Areas: vi.fn() }))
vi.mock('../../../lib/supabaseClient', () => ({ isSupabaseConfigured: true }))
const seaPoint = { id: 'sea-point', name: 'Sea Point', city: 'Cape Town', province: 'Western Cape' }
beforeEach(() => { vi.clearAllMocks(); searchArch9Areas.mockResolvedValue([seaPoint]) })
afterEach(cleanup)

function Controlled({ changed = () => {}, initial = '', ...props }) {
  const [value, setValue] = useState(initial)
  return <AreaAutocomplete label="Preferred area" value={value} onChange={(text, area) => { setValue(text); changed(text, area) }} {...props} />
}
const type = text => {
  const input = screen.getByRole('combobox', { name: 'Preferred area' })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: text } })
  return input
}
const pending = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

it('does not open or query the directory when an existing value mounts', async () => {
  render(<Controlled initial="Sea Point" />)
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(searchArch9Areas).not.toHaveBeenCalled()
  fireEvent.focus(screen.getByRole('combobox'))
  expect(await screen.findByRole('option', { name: /Sea Point Cape Town/ })).toBeTruthy()
})

it('selects a saved area once and retains its identity on blur without reopening the menu', async () => {
  const changed = vi.fn()
  render(<Controlled changed={changed} />)
  const input = type('Sea')
  fireEvent.click(await screen.findByRole('option', { name: /Sea Point Cape Town/ }))
  expect(input.value).toBe('Sea Point')
  expect(screen.queryByRole('listbox')).toBeNull()
  fireEvent.blur(input)
  expect(changed).toHaveBeenLastCalledWith('Sea Point', seaPoint)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)) })
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(searchArch9Areas).toHaveBeenCalledTimes(1)
})

it('ignores results that arrive after clearing or shortening the query', async () => {
  const old = pending()
  searchArch9Areas.mockReturnValue(old.promise)
  render(<Controlled />)
  const input = type('Sea')
  await waitFor(() => expect(searchArch9Areas).toHaveBeenCalled())
  fireEvent.change(input, { target: { value: 'S' } })
  await act(async () => old.resolve([seaPoint]))
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(screen.queryByRole('option')).toBeNull()
  expect(input.value).toBe('S')
})

it('ignores a late request after blur and after a newer search', async () => {
  const old = pending()
  searchArch9Areas.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ id: 'hatfield', name: 'Hatfield', city: 'Pretoria' }])
  render(<Controlled />)
  const input = type('Sea')
  await waitFor(() => expect(searchArch9Areas).toHaveBeenCalledTimes(1))
  fireEvent.blur(input)
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: 'Hat' } })
  await screen.findByRole('option', { name: /Hatfield Pretoria/ })
  await act(async () => old.resolve([seaPoint]))
  expect(screen.queryByRole('option', { name: /Sea Point Cape Town/ })).toBeNull()
  expect(screen.getByRole('option', { name: /Hatfield Pretoria/ })).toBeTruthy()
})

it('supports keyboard selection and announces the active option without submitting the surrounding form', async () => {
  const submitted = vi.fn(event => event.preventDefault())
  render(<form onSubmit={submitted}><Controlled /><button type="submit">Save</button></form>)
  const input = type('Sea')
  const option = await screen.findByRole('option', { name: /Sea Point Cape Town/ })
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(input.getAttribute('aria-activedescendant')).toBe(option.id)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(input.value).toBe('Sea Point')
  expect(submitted).not.toHaveBeenCalled()
})

it('offers a clear manual choice when no directory match exists or search fails', async () => {
  searchArch9Areas.mockRejectedValue(new Error('Directory offline'))
  const changed = vi.fn()
  render(<Controlled changed={changed} />)
  const input = type('New suburb')
  await screen.findByText(/Suggestions are unavailable/)
  fireEvent.click(screen.getByRole('option', { name: 'Use “New suburb”' }))
  expect(input.value).toBe('New suburb')
  expect(changed).toHaveBeenLastCalledWith('New suburb', null)
  expect(screen.queryByRole('listbox')).toBeNull()
})

it('dismisses the menu on Escape before closing its containing dialog', async () => {
  const close = vi.fn()
  render(<Modal open title="Qualify buyer" onClose={close}><Controlled /></Modal>)
  const input = type('Sea')
  await screen.findByRole('option', { name: /Sea Point Cape Town/ })
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(close).not.toHaveBeenCalled()
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(close).toHaveBeenCalledTimes(1)
})

it('does not commit unlisted text when free entry is disabled', async () => {
  const changed = vi.fn()
  render(<Controlled changed={changed} allowFreeText={false} />)
  const input = type('Sea')
  expect(changed).not.toHaveBeenCalled()
  fireEvent.click(await screen.findByRole('option', { name: /Sea Point Cape Town/ }))
  fireEvent.blur(input)
  expect(changed).toHaveBeenCalledTimes(1)
  expect(changed).toHaveBeenCalledWith('Sea Point', seaPoint)
})

it('keeps Enter inside the menu when a directory choice is still required', async () => {
  const changed = vi.fn()
  render(<Controlled changed={changed} allowFreeText={false} />)
  const input = type('Sea')
  await screen.findByRole('option', { name: /Sea Point Cape Town/ })
  expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false)
  expect(changed).not.toHaveBeenCalled()
  expect(screen.getByRole('listbox')).toBeTruthy()
})
