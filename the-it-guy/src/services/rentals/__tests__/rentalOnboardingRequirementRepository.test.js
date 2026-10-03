import { expect, it, vi } from 'vitest'
import { listRentalOnboardingRequirements } from '../rentalOnboardingRequirementRepository.js'
it('reads the saved requirement instances for exactly one parent and preserves lifecycle metadata', async () => {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), then: (resolve) => Promise.resolve({ data: [{ id: 'requirement', checklist_id: 'checklist', generation: 2, discovery_revision: 3, rule_version: 'rental_application_evidence_v1', active: true, required: true, mode: 'active', state: 'rejected', current_document_id: 'replacement' }] }).then(resolve) }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query)
  const from = vi.fn(() => query)
  const rows = await listRentalOnboardingRequirements({ applicationId: 'app' }, { client: { from } })
  expect(from).toHaveBeenCalledWith('rental_onboarding_requirement_summaries')
  expect(query.eq).toHaveBeenCalledWith('application_id', 'app')
  expect(rows[0]).toMatchObject({ id: 'requirement', generation: 2, discoveryRevision: 3, state: 'rejected', documentId: 'replacement' })
  await expect(listRentalOnboardingRequirements({ applicationId: 'app', landlordLeadId: 'lead' }, { client: { from } })).rejects.toThrow('Choose one')
})
it('reports an unapplied foundation rather than presenting an empty, completed checklist', async () => {
  const query = { select: () => query, eq: () => query, order: () => query, then: (resolve) => Promise.resolve({ error: { code: '42P01' } }).then(resolve) }
  await expect(listRentalOnboardingRequirements({ landlordLeadId: 'lead' }, { client: { from: () => query } })).rejects.toThrow('not been applied')
})
