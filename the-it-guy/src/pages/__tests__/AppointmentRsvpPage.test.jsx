// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
const api = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { rpc: api.rpc } }))
vi.mock('../../services/appointmentRsvpHandoffService', () => ({ sendBuyerRsvpHandoffAfterSellerAccept: vi.fn(), sendViewingConfirmationAfterBuyerAccept: vi.fn() }))
import AppointmentRsvpPage from '../AppointmentRsvpPage.jsx'

const invitation = { participant_id: 'person', appointment_id: 'booking', appointment_title: 'Viewing',
  participant_name: 'Buyer', participant_role: 'Buyer', rsvp_status: 'Accepted', appointment_date: '2099-07-20', start_time: '10:00', end_time: '11:00' }
const replacement = { managed: true, proposal: true, rsvp_status: 'Pending', appointment_date: '2099-07-21', start_time: '12:00', end_time: '13:00', timezone: 'Africa/Johannesburg' }
const mount = () => render(<MemoryRouter initialEntries={['/appointment-rsvp/current']}><Routes><Route path="/appointment-rsvp/:token" element={<AppointmentRsvpPage />} /></Routes></MemoryRouter>)
beforeEach(() => { api.rpc.mockReset().mockImplementation(async name => ({ data: name === 'get_appointment_rsvp_by_token' ? [invitation] : replacement, error: null })) })
afterEach(cleanup)

it('shows the current replacement for a previously accepted invitation and asks for fresh approval', async () => {
  mount()
  await screen.findByRole('heading', { name: 'Replacement Time Request' })
  expect(screen.getByText('2099-07-21', { exact: false })).toBeTruthy()
  expect(screen.getByText('12:00 - 13:00', { exact: false })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Accept proposed time' })).toBeTruthy()
  expect(screen.getByText(/original appointment stays reserved/)).toBeTruthy()
})

it('explains an expired hold and offers no response buttons', async () => {
  api.rpc.mockImplementation(async name => ({ data: name === 'get_appointment_rsvp_by_token' ? [invitation] : null }))
  mount()
  await screen.findByText(/temporary hold has expired/)
  expect(screen.queryByRole('button', { name: 'Accept proposed time' })).toBeNull()
})

it('labels an all-day replacement without presenting two midnight times', async () => {
  api.rpc.mockImplementation(async name => ({ data: name === 'get_appointment_rsvp_by_token' ? [invitation] : { ...replacement, all_day: true, start_time: '00:00', end_time: '00:00' } }))
  mount()
  await screen.findByText('All day', { exact: false })
  expect(screen.queryByText('00:00 - 00:00', { exact: false })).toBeNull()
})

it('rejects an unverified response without displaying confirmation', async () => {
  api.rpc.mockImplementation(async name => ({ data: name === 'get_appointment_rsvp_by_token' ? [invitation] : name === 'submit_appointment_rsvp' ? [] : replacement }))
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Accept proposed time' }))
  fireEvent.submit(screen.getByRole('button', { name: 'Submit RSVP' }).closest('form'))
  await screen.findByText(/invalid, expired, or already closed/)
  expect(screen.queryByText(/attendance has been confirmed/)).toBeNull()
})
