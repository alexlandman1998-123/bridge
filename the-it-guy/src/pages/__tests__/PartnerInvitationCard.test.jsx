// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { PartnerInvitationCard } from '../PartnersPage'

afterEach(cleanup)
const base = { id: 'invite', fromOrganisationId: 'sender', toOrganisationName: 'Partner Firm', status: 'pending', invitedEmail: 'partner@agency.test', createdAt: '2026-11-07T10:59:15Z' }
function show(emailDelivery, overrides = {}) {
  render(<PartnerInvitationCard invitation={{ ...base, ...overrides, emailDelivery }} organisationId="sender" invitationAction={{ id: '', type: '' }} />)
}

test('a saved invitation with a failed send does not tell the user it was emailed', () => {
  show({ status: 'failed' })
  expect(screen.getByText('Email failed to send')).toBeTruthy()
  expect(screen.getByText('Outgoing')).toBeTruthy()
  expect(screen.getByText(/Contact email:/)).toBeTruthy()
  expect(screen.queryByText(/^Sent/)).toBeNull()
  expect(screen.queryByText(/Contact emailed:/)).toBeNull()
  expect(screen.queryAllByText(/Waiting for the company contact/)).toHaveLength(0)
  expect(screen.getByRole('button', { name: 'Resend' })).toBeTruthy()
})

test('a confirmed retry shows email sent and keeps the connection pending', () => {
  show({ status: 'sent', provider_message_id: 'accepted' })
  expect(screen.getByText('Email sent')).toBeTruthy()
  expect(screen.getByText('Pending')).toBeTruthy()
})

test('missing delivery evidence stays unconfirmed', () => {
  show(null)
  expect(screen.getByText('Email status unconfirmed')).toBeTruthy()
  expect(screen.queryByText('Email sent')).toBeNull()
})
