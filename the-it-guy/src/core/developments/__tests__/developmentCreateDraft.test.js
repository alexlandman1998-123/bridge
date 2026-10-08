// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest'
import { clearDevelopmentDraft, developmentDraftScope, markDevelopmentDraftCreated, readDevelopmentDraft, restoreDevelopmentDraft, writeDevelopmentDraft } from '../developmentCreateDraft.js'
const scope = developmentDraftScope({ userId: 'alice' }, { id: 'agency' }, 'agent')
const draft = () => ({ details: { name: 'Willow Park', address: '', suburb: '', city: '' }, financials: {}, transactionDefaults: {}, developerAccess: {}, legal: { agents: [], conveyancers: [], bondOriginators: [], requiredDocuments: [] }, documents: [], developmentType: 'residential', unitConfigurationMethod: 'later', stepId: 'basic', stockStepIndex: 0, stockEditor: null, stockPlan: { groups: [], unitTypes: [] } })
beforeEach(() => window.localStorage.clear())

it('isolates drafts by account, workspace and role', async () => {
  await writeDevelopmentDraft(scope, draft())
  expect(readDevelopmentDraft(scope).data.details.name).toBe('Willow Park')
  for (const otherScope of [developmentDraftScope({ userId: 'bob' }, { id: 'agency' }, 'agent'), developmentDraftScope({ userId: 'alice' }, { id: 'other-agency' }, 'agent'), developmentDraftScope({ userId: 'alice' }, { id: 'agency' }, 'developer')]) expect(readDevelopmentDraft(otherScope)).toBeNull()
  expect(developmentDraftScope({}, { id: 'agency' }, 'agent')).toBe('')
})

it('writes text synchronously and recovers incomplete form values', async () => {
  const data = draft()
  data.details.name = ''
  data.details.address = 'Unfinished address'
  const saved = writeDevelopmentDraft(scope, data)
  expect(readDevelopmentDraft(scope).data.details.address).toBe('Unfinished address')
  await saved
  expect((await restoreDevelopmentDraft(readDevelopmentDraft(scope))).details.name).toBe('')
})

it('drops expired, incompatible and corrupt drafts safely', async () => {
  await writeDevelopmentDraft(scope, draft())
  const valid = readDevelopmentDraft(scope)
  for (const record of [{ ...valid, version: 99 }, { ...valid, scope: 'different-account' }, { ...valid, updatedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }, { ...valid, data: { ...valid.data, stockPlan: { groups: [], unitTypes: [{}] } } }]) {
    window.localStorage.setItem(scope, JSON.stringify(record))
    expect(readDevelopmentDraft(scope)).toBeNull()
    expect(window.localStorage.getItem(scope)).toBeNull()
  }
  window.localStorage.setItem(scope, '{broken')
  expect(readDevelopmentDraft(scope)).toBeNull()
})

it('replaces a saved draft with only a durable record link to prevent duplicate creation', async () => {
  await writeDevelopmentDraft(scope, draft())
  markDevelopmentDraftCreated(scope, { id: 'created-id', name: 'Willow Park', unrelatedField: 'not stored' })
  const saved = readDevelopmentDraft(scope)
  expect(saved.savedDevelopment).toEqual({ id: 'created-id', name: 'Willow Park' })
  expect(saved.data).toBeUndefined()
  expect(JSON.stringify(saved)).not.toContain('unrelatedField')
})

it('clears only the current account and workspace draft', async () => {
  const other = developmentDraftScope({ id: 'bob' }, { id: 'agency' }, 'agent')
  await writeDevelopmentDraft(scope, draft())
  await writeDevelopmentDraft(other, draft())
  clearDevelopmentDraft(scope)
  expect(readDevelopmentDraft(scope)).toBeNull()
  expect(readDevelopmentDraft(other)).toBeTruthy()
})
