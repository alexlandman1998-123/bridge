import { expect, test } from 'vitest'
import { buildAgentClientDirectory, getAgentClientOpenPath, getAgentClientProfile } from '../agentClientDirectory.js'
import { clientMatchesStoredId, findClientDuplicateCandidates, resolveClientRedirect, validateClientContactDetails } from '../clientIdentity.js'

test('manual buyers open by their stable buyer id', () => {
  const path = getAgentClientOpenPath({
    id: 'name:rls smoke test buyer',
    linkedRecords: [{
      kind: 'client',
      path: '/clients/buyer%3Ae7f0b435-3595-451e-8796-ae2cdb845aaa',
      lastActivityAt: '2026-08-31T15:49:04.069Z',
    }],
  })

  expect(path).toBe('/clients/buyer%3Ae7f0b435-3595-451e-8796-ae2cdb845aaa')
})

test('legacy manual contacts keep their existing directory identity route', () => {
  const path = getAgentClientOpenPath({
    id: 'name:existing contact',
    linkedRecords: [{ kind: 'client', path: '/clients/contact%3Acontact-id' }],
  })

  expect(path).toBe('/clients/name%3Aexisting%20contact')
})

test('transaction-backed clients still open the transaction workspace', () => {
  const path = getAgentClientOpenPath({
    id: 'name:transaction buyer',
    linkedRecords: [{ kind: 'transaction', path: '/transactions/transaction-id' }],
  })

  expect(path).toBe('/transactions/transaction-id')
})

const source = (id, email, overrides = {}) => ({
  sourceRecordId: id, identitySource: { kind: 'lead', id }, organisationId: 'agency-a',
  name: 'Alex Smith', email, phone: '0821234567', typeLabel: 'Buyer Lead', sourceLabel: 'Website',
  leadId: id, linkedRecord: { kind: 'lead', id, path: `/pipeline/leads/${id}`, label: id }, ...overrides,
})

test('matching names and household phones suggest duplicates without combining people', () => {
  const clients = buildAgentClientDirectory([source('a', 'a@example.test'), source('b', 'b@example.test')])
  expect(clients).toHaveLength(2)
  expect(findClientDuplicateCandidates(clients[0], clients)[0].reasons).toEqual(['Matching phone', 'Matching name'])
  expect(buildAgentClientDirectory([source('a', ''), source('b', '')])).toHaveLength(2)
  expect(getAgentClientProfile(clients, 'name:alex smith')).toBeNull()
})

test('known email matching stays inside one agency and retains distinct enquiries', () => {
  const clients = buildAgentClientDirectory([source('a', 'A@example.test'), source('b', 'a@example.test'), source('c', 'a@example.test', { organisationId: 'agency-b' })])
  expect(clients).toHaveLength(2)
  expect(clients.find((client) => client.organisationId === 'agency-a').linkedLeadIds).toEqual(['a', 'b'])
})

test('reviewed identities retain aliases, stable profile routes, records and merge redirects', () => {
  const identities = {
    available: true, canManage: true,
    profiles: [{ id: 'primary', organisation_id: 'agency-a', name: 'Alex Primary', primary_email: 'preferred@example.test', version: 4 }, { id: 'former', organisation_id: 'agency-a', merged_into: 'primary' }],
    identifiers: [{ client_id: 'primary', kind: 'email', value: 'a@example.test' }, { client_id: 'primary', kind: 'email', value: 'b@example.test' }],
    links: [{ source_kind: 'lead', source_id: 'a', client_id: 'primary' }, { source_kind: 'lead', source_id: 'b', client_id: 'primary' }],
  }
  const clients = buildAgentClientDirectory([source('a', 'a@example.test'), source('b', 'b@example.test')], identities)
  expect(clients).toHaveLength(1)
  expect(clients[0]).toMatchObject({ id: 'client:primary', identityVersion: 4, name: 'Alex Primary', email: 'preferred@example.test', canManageIdentity: true })
  expect(clients[0].linkedLeadIds).toEqual(['a', 'b'])
  expect(clients[0].searchText).toContain('b@example.test')
  expect(clientMatchesStoredId(clients[0], new Set(['email:a@example.test']))).toBe(true)
  expect(clientMatchesStoredId(clients[0], new Set(['client:former']))).toBe(false)
  expect(getAgentClientProfile(clients, 'email:a@example.test').client.id).toBe('client:primary')
  expect(getAgentClientProfile(clients, 'client:former').client.id).toBe('client:primary')
  expect(resolveClientRedirect(identities.profiles, 'former').id).toBe('primary')
})

test('a merged buyer and seller on one transaction do not double-count the deal', () => {
  const tx = { transaction: { id: 'deal' } }
  const clients = buildAgentClientDirectory([source('a', 'same@example.test', { transactionId: 'deal', transactionRow: tx }), source('b', 'same@example.test', { transactionId: 'deal', transactionRow: tx })])
  expect(clients[0].transactions).toHaveLength(1)
})

test('client transaction cards retain captured photos, value and popup details', () => {
  const client = { id: 'client:test', transactions: [{ transaction: { id: 'deal', transaction_reference: 'REVO-14', property_address_line_1: '18 Willow Lane', stage: 'Bond approved', purchase_price: 3200000, deposit_amount: 320000, property_image_url: '/test-property.jpg', finance_type: 'bond', assigned_agent: 'Jamie Smit', attorney: 'Transfer Partners', expected_transfer_date: '2026-11-24', next_action: 'Confirm bond instructions' }, unit: { id: 'unit' } }] }
  expect(getAgentClientProfile([client], client.id).transactions[0]).toMatchObject({ id: 'deal', unitId: 'unit', imageUrl: '/test-property.jpg', price: 3200000, deposit: 320000, financeLabel: 'bond', assignedAgentName: 'Jamie Smit', attorneyName: 'Transfer Partners', expectedTransferDate: '2026-11-24', nextAction: 'Confirm bond instructions' })
})

test('invalid contact details and redirect cycles are rejected', () => {
  expect(() => validateClientContactDetails({ name: 'Alex', emails: ['not-an-email'] })).toThrow('valid email')
  expect(validateClientContactDetails({ name: ' Alex ', emails: ['A@example.test', 'a@example.test'], phones: ['0821234567'] })).toEqual({ name: 'Alex', emails: ['a@example.test'], phones: ['27821234567'] })
  expect(resolveClientRedirect([{ id: 'a', merged_into: 'b' }, { id: 'b', merged_into: 'a' }], 'a')).toBeNull()
})
