import { expect, test } from 'vitest'
import { getLocalClientPreview, getLocalPreviewTransaction } from '../localClientPreview'

const profile = { client: { id: 'alexander', organisationId: '322c3853-2d82-4413-97e6-b4cd8bc32a7c', email: 'alexlandman1998@gmail.com', name: 'Alexander Landman', linkedRecords: [{ id: 'real-enquiry' }] }, transactions: [] }
const options = { development: true, hostname: '127.0.0.1', now: Date.parse('2026-10-10T08:00:00Z') }

test('mock data stays limited to Alexander in Revo on local development', () => {
  expect(getLocalClientPreview(profile, options)).toBeTruthy()
  expect(getLocalClientPreview(profile, { ...options, development: false })).toBeNull()
  expect(getLocalClientPreview(profile, { ...options, hostname: 'app.arch9.com' })).toBeNull()
  expect(getLocalClientPreview({ ...profile, client: { ...profile.client, organisationId: 'other' } }, options)).toBeNull()
  expect(getLocalClientPreview({ ...profile, client: { ...profile.client, email: 'someone@example.test' } }, options)).toBeNull()
  expect(getLocalClientPreview(null, options)).toBeNull()
})

test('full mock transaction routes resolve only known IDs in local Revo development', () => {
  const scope = { ...options, organisationId: profile.client.organisationId }
  expect(getLocalPreviewTransaction('preview-transaction-cicely', scope).transaction.propertyLabel).toBe('694 Cicely Street')
  expect(getLocalPreviewTransaction('unknown', scope)).toBeNull()
  expect(getLocalPreviewTransaction('preview-transaction-cicely', { ...scope, development: false })).toBeNull()
  expect(getLocalPreviewTransaction('preview-transaction-cicely', { ...scope, hostname: 'app.arch9.com' })).toBeNull()
  expect(getLocalPreviewTransaction('preview-transaction-cicely', { ...scope, organisationId: 'other' })).toBeNull()
})

test('overview counts agree with the sample records and the source profile remains unchanged', () => {
  const result = getLocalClientPreview(profile, options)
  expect(result.transactions).toHaveLength(3)
  expect(result.client.activeTransactions).toBe(result.transactions.filter(row => row.status === 'Active').length)
  expect(result.client.completedTransactions).toBe(result.transactions.filter(row => row.status === 'Completed').length)
  expect(result.client.lastActivityAt).toBe(result.preview.activity.events[0].occurred_at)
  expect(result.preview.activity.events).toHaveLength(10)
  expect(result.preview.sources.touches).toHaveLength(4)
  expect(result.preview.campaigns.campaigns).toHaveLength(4)
  expect(result.preview.campaigns.summary.sentCount).toBe(result.preview.campaigns.campaigns.filter(row => row.sent_at).length)
  expect(result.client.linkedRecords).toEqual(profile.client.linkedRecords)
  expect(profile.transactions).toEqual([])
  expect(profile.client.totalTransactions).toBeUndefined()
})
