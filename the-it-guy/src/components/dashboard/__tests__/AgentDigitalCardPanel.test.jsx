// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AgentDigitalCardPanel from '../AgentDigitalCardPanel'

const agent = { name: 'Alex Agent', email: 'alex@example.test', phone: '+27821234567', avatarUrl: 'https://example.test/photo.jpg' }
const link = { id: 'card-1', status: 'active', enabledIntents: ['buy'], agentDigitalCard: { features: { qr: false, vcf: false, share: false } } }
afterEach(cleanup)

it('sets up and activates a card in the dashboard, preserving entered values after a failed save', async () => {
  const onSave = vi.fn().mockRejectedValueOnce(new Error('Card save unavailable')).mockResolvedValueOnce({})
  render(<AgentDigitalCardPanel canManage agent={agent} onSave={onSave} />)
  fireEvent.click(screen.getByRole('button', { name: 'Set up card' }))
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Alex Updated' } })
  fireEvent.click(screen.getByRole('button', { name: 'Activate card' }))
  await screen.findByText('Card save unavailable')
  expect(screen.getByLabelText('Display name').value).toBe('Alex Updated')
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alex Updated', avatarUrl: agent.avatarUrl, buyEnabled: true }), 'active')
  fireEvent.click(screen.getByRole('button', { name: 'Activate card' }))
  await waitFor(() => expect(screen.queryByRole('form', { name: 'Digital card setup' })).toBeNull())
})

it('saves a draft without activating it and rejects a card with no enquiry action', async () => {
  const onSave = vi.fn().mockResolvedValue({})
  render(<AgentDigitalCardPanel canManage agent={agent} onSave={onSave} />)
  fireEvent.click(screen.getByRole('button', { name: 'Set up card' }))
  fireEvent.click(screen.getByLabelText('Buyer enquiries'))
  fireEvent.click(screen.getByLabelText('Seller enquiries'))
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  expect(screen.getByRole('alert').textContent).toBe('Enable at least one enquiry action.')
  expect(onSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByLabelText('Buyer enquiries'))
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ buyEnabled: true, sellEnabled: false }), 'draft'))
})

it('shows real stats, honours disabled sharing features, and handles a missing photo', () => {
  render(<AgentDigitalCardPanel agent={agent} link={link} shareUrl="https://example.test/card/alex" urls={{buyerUrl: 'https://example.test/buy',sellerUrl: 'https://example.test/sell'}} insights={{summary:{views:12,contactClicks:3}}} />)
  expect(screen.getByText('12')).toBeTruthy()
  expect(screen.getByText('3')).toBeTruthy()
  expect(screen.queryByRole('button', {name:'Edit card'})).toBeNull()
  expect(screen.queryByRole('button', {name:'Download QR'})).toBeNull()
  expect(screen.queryByRole('button', {name:'Download contact'})).toBeNull()
  expect(screen.queryByRole('button', {name:'Copy link'})).toBeNull()
  expect(screen.getByRole('link', {name:'Buyer enquiry ↗'})).toBeTruthy()
  expect(screen.queryByRole('link', {name:'Seller enquiry ↗'})).toBeNull()
  fireEvent.error(screen.getByRole('img', {name:'Alex Agent profile'}))
  expect(screen.getByLabelText('Profile initials').textContent).toBe('AA')
})

it('does not show setup to an agent without management permission or pretend missing stats are zero', () => {
  render(<AgentDigitalCardPanel agent={agent} />)
  expect(screen.queryByRole('button', {name:'Set up card'})).toBeNull()
  expect(screen.getByText(/Your principal or admin can activate/)).toBeTruthy()
  expect(screen.getAllByText('—').length).toBe(7)
})


it('enables a rental-only card with a custom label and preserves it when editing', async () => {
  const onSave = vi.fn().mockResolvedValue({})
  render(<AgentDigitalCardPanel canManage agent={agent} link={{ ...link, enabledIntents: ['rent'], rentalCtaLabel: 'Find a rental' }} shareUrl="https://example.test/card/alex" urls={{ rentalUrl: 'https://example.test/card/alex?intent=rent' }} onSave={onSave} />)
  expect(screen.getByRole('link', { name: 'Rental enquiry ↗' }).href).toContain('intent=rent')
  fireEvent.click(screen.getByRole('button', { name: 'Edit card' }))
  expect(screen.getByLabelText('Rental enquiries').checked).toBe(true)
  expect(screen.getByLabelText('Rental button label').value).toBe('Find a rental')
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ rentEnabled: true, buyEnabled: false, sellEnabled: false, rentalCtaLabel: 'Find a rental' }), 'active'))
})
