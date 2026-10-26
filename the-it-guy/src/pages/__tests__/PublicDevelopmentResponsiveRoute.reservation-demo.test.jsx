// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicDevelopmentResponsiveRoute from '../PublicDevelopmentResponsiveRoute.jsx'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), mobile: false }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { rpc: mocks.rpc } }))
vi.mock('../../components/developments/PublicDevelopmentVisualExplorer.jsx', () => ({
  default: ({ inventory, onReserveUnit }) => <section aria-label="Test inventory">{inventory.map(unit => <div key={unit.id}><span>Unit {unit.unitNumber}: {unit.status}</span><button disabled={unit.status !== 'available'} onClick={() => onReserveUnit(unit)}>Reserve unit {unit.unitNumber}</button></div>)}</section>,
}))
const storageKey = 'arch9:development-reservation-demo:v1'
const listing = (status = 'available') => ({ name: 'Madison Place', marketing: { mediaLibrary: { coverImageUrl: '/cover.jpg' } }, inventory: [
  { id: 'unit-42', unitNumber: '042', status, price: 2750000 },
  { id: 'unit-43', unitNumber: '043', status: 'available', price: 2750000 },
] })
function mount(slug = 'madison-place-abcf1b8a') {
  return render(<MemoryRouter initialEntries={[`/development/${slug}`]}><Routes><Route path="/development/:slug" element={<PublicDevelopmentResponsiveRoute />} /></Routes></MemoryRouter>)
}
function fillDetails() {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Demo Buyer' } })
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'demo@example.test' } })
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '0100000000' } })
}
beforeEach(() => {
  sessionStorage.clear()
  mocks.mobile = false
  mocks.rpc.mockReset().mockResolvedValue({ data: listing(), error: null })
  vi.spyOn(window, 'open').mockImplementation(() => null)
  vi.stubGlobal('matchMedia', () => ({ matches: mocks.mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each([false, true])('simulates payment, updates only this session and restores availability on reset (mobile: %s)', async mobile => {
  mocks.mobile = mobile
  const view = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Reserve unit 042' }))
  expect(screen.getByText(/No money will be charged/)).toBeTruthy()
  fillDetails()
  fireEvent.click(screen.getByRole('button', { name: 'Pay R10,000' }))
  expect(screen.getByRole('heading', { name: 'Unit 042 reserved.' })).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('Simulated payment complete')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to residences' }))
  expect(window.open).not.toHaveBeenCalled()
  expect(JSON.parse(sessionStorage.getItem(storageKey))).toEqual({ 'madison-place-abcf1b8a': ['unit-42'] })
  expect(sessionStorage.getItem(storageKey)).not.toMatch(/Demo Buyer|demo@example|0100000000/)
  fireEvent.click(screen.getByRole('button', { name: 'Back to residences' }))
  expect(screen.getByText('Unit 042: reserved')).toBeTruthy()
  expect(screen.getByText('Unit 043: available')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Reserve unit 042' }).disabled).toBe(true)
  view.unmount()
  mount()
  expect(await screen.findByText('Unit 042: reserved')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
  expect(screen.getByText('Unit 042: available')).toBeTruthy()
  expect(screen.queryByRole('complementary', { name: 'Reservation demo' })).toBeNull()
  expect(mocks.rpc.mock.calls.every(([name]) => name === 'get_public_development_landing')).toBe(true)
})

it('requires contact details and a valid email before the simulated payment', async () => {
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Reserve unit 042' }))
  const button = screen.getByRole('button', { name: 'Pay R10,000' })
  fireEvent.submit(button.closest('form'))
  expect(screen.queryByText('Simulated payment complete')).toBeNull()
  fillDetails()
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'invalid-email' } })
  fireEvent.submit(button.closest('form'))
  expect(screen.queryByText('Simulated payment complete')).toBeNull()
  expect(screen.getByText('Unit 042: available')).toBeTruthy()
})

it('never replaces a real sold status with a saved demo reservation', async () => {
  sessionStorage.setItem(storageKey, JSON.stringify({ 'madison-place-abcf1b8a': ['unit-42'] }))
  mocks.rpc.mockResolvedValue({ data: listing('sold'), error: null })
  mount()
  expect(await screen.findByText('Unit 042: sold')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Reserve unit 042' }).disabled).toBe(true)
})

it('leaves other development reservation enquiries unchanged', async () => {
  mount('another-development')
  fireEvent.click(await screen.findByRole('button', { name: 'Reserve unit 042' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('button', { name: 'Send reservation request' })).toBeTruthy()
  expect(within(dialog).queryByRole('button', { name: 'Pay R10,000' })).toBeNull()
})

it('works in memory when browser storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked') })
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Reserve unit 042' }))
  fillDetails()
  fireEvent.click(screen.getByRole('button', { name: 'Pay R10,000' }))
  expect(screen.getByRole('heading', { name: 'Unit 042 reserved.' })).toBeTruthy()
})
