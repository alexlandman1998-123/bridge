// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppointmentClients, AppointmentOrganisers } from '../AppointmentPeopleFields'
import { toggleAppointmentClient, updateAppointmentOrganisers } from '../appointmentPeopleModel'
import { getAppointmentTypeOptions } from '../../../lib/appointmentTypeDefinitions'

afterEach(cleanup)
const agents = [{ id: 'one', userId: 'one', name: 'Alex Agent', email: 'alex@example.test', avatarUrl: '/alex.jpg' }, { id: 'two', userId: 'two', name: 'Sam Agent', email: 'sam@example.test' }]
const client = { id: 'lead:one', leadId: 'lead-one', contactId: 'contact-one', name: 'Taylor Client', email: 'taylor@example.test', role: 'Buyer' }

describe('appointment people', () => {
  it('selects multiple organisers with avatars and allows a primary change', () => {
    function Harness() {
      const [form, setForm] = useState({ assignedAgentId: 'one', participants: [] })
      return <><AppointmentOrganisers form={form} agents={agents} canChangePrimary currentAgentId="one" onChange={setForm} /><output>{form.assignedAgentId}:{form.participants.length}</output></>
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Organiser', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: /Sam Agent sam@example.test/ }))
    expect(screen.getByText('one:2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Make Sam Agent primary organiser' }))
    expect(screen.getByText('two:2')).toBeTruthy()
    expect(document.querySelector('img').getAttribute('src')).toBe('/alex.jpg')
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('keeps the existing primary locked for an ordinary organiser', () => {
    render(<AppointmentOrganisers form={{ assignedAgentId: 'one', participants: [{ ...agents[1], participantRole: 'Co-Agent' }] }} agents={agents} currentAgentId="one" onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Make .* primary organiser/ })).toBeNull()
  })

  it('preserves participant identity, RSVP and guests when changing the primary', () => {
    const existing = { ...agents[0], participantRole: 'Agent', participantId: 'stable', rsvpToken: 'token', rsvpStatus: 'Accepted' }
    const guest = { name: 'Guest', email: 'guest@example.test', participantRole: 'Buyer' }
    const result = updateAppointmentOrganisers({ participants: [existing, guest] }, [agents[1], agents[0]])
    expect(result.assignedAgentId).toBe('two')
    expect(result.participants).toContainEqual(guest)
    expect(result.participants.find(person => person.userId === 'one')).toMatchObject({ participantId: 'stable', rsvpToken: 'token', rsvpStatus: 'Accepted', participantRole: 'Co-Agent' })
  })

  it('links the first client and removes them without clearing the property context', () => {
    const form = toggleAppointmentClient({ participants: [], listingId: 'property' }, client)
    expect(form).toMatchObject({ contactId: client.contactId, relatedEntityType: 'lead', relatedEntityId: client.leadId })
    expect(form.participants[0]).toMatchObject({ contactId: client.contactId, participantRole: 'Buyer' })
    expect(toggleAppointmentClient(form, client)).toMatchObject({ contactId: '', relatedEntityId: '', listingId: 'property', participants: [] })
  })

  it('selects several clients without overwriting an existing transaction link', () => {
    const form = { participants: [], transactionId: 'transaction', relatedEntityType: 'transaction', relatedEntityId: 'transaction' }
    const first = toggleAppointmentClient(form, client)
    const next = toggleAppointmentClient(first, { ...client, contactId: 'another', leadId: 'another', email: 'another@example.test' })
    expect(next.relatedEntityId).toBe('transaction')
    expect(next.participants).toHaveLength(2)
  })

  it('inherits the selected lead’s property without replacing an already selected property', () => {
    expect(toggleAppointmentClient({ participants: [] }, { ...client, listingId: 'lead-property' }).listingId).toBe('lead-property')
    expect(toggleAppointmentClient({ participants: [], listingId: 'chosen-property' }, { ...client, listingId: 'lead-property' }).listingId).toBe('chosen-property')
  })

  it('searches locally, retains failed new-client details and retries explicitly', async () => {
    const onCreate = vi.fn().mockRejectedValueOnce(new Error('Connection failed')).mockResolvedValueOnce(undefined)
    render(<AppointmentClients form={{ participants: [] }} clients={[client]} onChange={vi.fn()} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clients', exact: true }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no match' } })
    expect(screen.getByText('No matches. Try another name.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create new client' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create client & add' }))
    expect(onCreate).not.toHaveBeenCalled()
    for (const [name, value] of [['First name', 'Taylor'], ['Surname', 'Client'], ['Email', 'taylor@example.test'], ['Phone', '0821234567']]) fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Create client & add' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Connection failed')
    expect(screen.getByLabelText('First name').value).toBe('Taylor')
    fireEvent.click(screen.getByRole('button', { name: 'Create client & add' }))
    await screen.findByRole('button', { name: 'Create new client' })
    expect(onCreate).toHaveBeenCalledTimes(2)
  })
})

it('offers appointment types for the active organisation, preserving the unscoped API', () => {
  const values = type => getAppointmentTypeOptions(type).map(option => option.value)
  expect(values('agency')).toContain('viewing')
  expect(values('agency')).not.toContain('bond_signing')
  expect(values('agency')).not.toContain('attorney_consultation')
  expect(values('developer')).toContain('snag_inspection')
  expect(values('attorney')).toContain('transfer_signing')
  expect(values('bond')).toContain('finance_consultation')
  expect(values('bond')).not.toContain('mandate_signing')
  expect(values()).toContain('bond_signing')
})
