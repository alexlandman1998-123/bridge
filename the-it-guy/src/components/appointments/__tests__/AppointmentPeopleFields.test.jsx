// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppointmentClients, AppointmentOrganisers } from '../AppointmentPeopleFields'
import { mergeAppointmentClients, toggleAppointmentClient, updateAppointmentOrganisers } from '../appointmentPeopleModel'
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

  it('includes saved clients without leads and preserves contact links when selecting them', () => {
    const saved = { id: 'client:contact-only', contactId: 'contact-only', name: 'Lien Leach', email: 'lien@example.test', role: 'Seller' }
    function Harness() {
      const [form, setForm] = useState({ participants: [], listingId: 'chosen-property' })
      return <><AppointmentClients form={form} clients={mergeAppointmentClients([client, saved])} onChange={setForm} /><output>{JSON.stringify(form)}</output></>
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Clients', exact: true }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'lien' } })
    fireEvent.click(screen.getByRole('button', { name: /Lien Leach lien@example.test/ }))
    const form = JSON.parse(document.querySelector('output').textContent)
    expect(form).toMatchObject({ contactId: 'contact-only', relatedEntityType: 'client', relatedEntityId: 'contact-only', listingId: 'chosen-property' })
    expect(form.participants).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Lien Leach lien@example.test/ }))
    expect(JSON.parse(document.querySelector('output').textContent)).toMatchObject({ contactId: '', relatedEntityType: 'none', relatedEntityId: '', participants: [] })
  })

  it('uses directory names and aliases without losing lead, contact or property context', () => {
    const rows = mergeAppointmentClients([
      { ...client, name: 'Client', listingId: 'property' },
      { id: 'client:one', contactId: client.contactId, name: 'Client', email: client.email },
    ], [{ id: 'identity-one', name: 'Laetitia Leach', email: client.email, emails: [], linkedLeadIds: [client.leadId], typeLabel: 'Seller Lead' }])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Laetitia Leach', contactId: client.contactId, leadId: client.leadId, listingId: 'property' })
    expect(toggleAppointmentClient({ participants: [] }, rows[0])).toMatchObject({ relatedEntityType: 'lead', relatedEntityId: client.leadId })
  })

  it('shows usable contact details instead of repeated generic names and keeps distinct people separate', () => {
    const rows = mergeAppointmentClients([
      { id: 'lead:a', name: 'Client', email: 'a@example.test', phone: '0821234567' },
      { id: 'lead:b', name: 'Client', email: 'b@example.test', phone: '0821234567' },
      { id: 'lead:c', name: 'Taylor Client' },
      { id: 'lead:d', name: 'Taylor Client' },
    ])
    expect(rows).toHaveLength(4)
    expect(rows.map(row => row.name)).toContain('a@example.test')
    expect(rows.map(row => row.name)).toContain('b@example.test')
  })

  it('can select and deselect a directory-only person without inventing a lead or contact', () => {
    const [saved] = mergeAppointmentClients([], [{ id: 'profile-only', name: 'Saved Person', email: '', linkedLeadIds: [], sources: [] }])
    const form = toggleAppointmentClient({ participants: [], transactionId: 'transaction', relatedEntityType: 'transaction', relatedEntityId: 'transaction' }, saved)
    expect(form).toMatchObject({ relatedEntityType: 'transaction', relatedEntityId: 'transaction', transactionId: 'transaction' })
    expect(form.participants).toHaveLength(1)
    expect(toggleAppointmentClient(form, saved).participants).toHaveLength(0)
  })

  it('reports incomplete client loading and lets the user retry without losing selection', () => {
    const retry = vi.fn()
    render(<AppointmentClients form={{ participants: [], contactId: client.contactId }} clients={[client]} loading loadError="Unable to load saved clients." onRetry={retry} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Clients', exact: true }).textContent).toContain(client.name)
    fireEvent.click(screen.getByRole('button', { name: 'Clients', exact: true }))
    expect(screen.getByRole('status').textContent).toContain('Loading saved clients')
    fireEvent.click(screen.getByRole('button', { name: 'Retry clients' }))
    expect(retry).toHaveBeenCalledOnce()
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
