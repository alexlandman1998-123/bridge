import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'

// Exercise the editor's real retry controller without mounting the unrelated
// listing grid, seller intake and development workspaces in the same page.
const page = readFileSync(new URL('../../../pages/AgentListings.jsx', import.meta.url), 'utf8')
const source = page.slice(page.indexOf('  async function retryListingPublication()'), page.indexOf('  async function handleSaveListing('))
function editor(overrides = {}) {
  const context = {
    publicationStatusBusy: false, isListingSaving: false, publicationPending: false, isEditListingWorkspace: true,
    listingFieldIssues: [], editListingId: 'listing-1', form: { listingStatus: 'active', selectedSyndicationChannels: ['private_property'] },
    setValidationAttemptedStep: vi.fn(), setCreateListingStep: vi.fn(), setError: vi.fn(), setPublicationStatusBusy: vi.fn(), setWorkflowMessage: vi.fn(),
    performUpdateExistingListing: vi.fn(async () => true), retryFailedListingChannels: vi.fn(async () => [{ key: 'private_property', status: 'publishing' }]),
    ...overrides,
  }
  const retry = new Function(...Object.keys(context), `${source}; return retryListingPublication;`)(...Object.values(context))
  return { context, retry }
}
it('saves corrected details before requesting a targeted retry, without publishing all channels', async () => {
  const { context, retry } = editor()
  await retry()
  expect(context.performUpdateExistingListing).toHaveBeenCalledWith({ sendUpdates: false, navigateAfterSave: false })
  expect(context.retryFailedListingChannels).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'listing-1', channels: ['private_property'], listingStatus: 'active' }))
  expect(context.performUpdateExistingListing.mock.invocationCallOrder[0]).toBeLessThan(context.retryFailedListingChannels.mock.invocationCallOrder[0])
  expect(context.setPublicationStatusBusy).toHaveBeenLastCalledWith(false)
})
it('takes invalid corrected details to their setup step before saving or retrying', async () => {
  const { context, retry } = editor({ listingFieldIssues: [{ step: 'marketing', message: 'Add a headline.' }] })
  await retry()
  expect(context.setCreateListingStep).toHaveBeenCalledWith('marketing')
  expect(context.performUpdateExistingListing).not.toHaveBeenCalled()
  expect(context.retryFailedListingChannels).not.toHaveBeenCalled()
})
it('does not send a retry when corrected details could not be saved', async () => {
  const { context, retry } = editor({ performUpdateExistingListing: vi.fn(async () => false) })
  await retry()
  expect(context.retryFailedListingChannels).not.toHaveBeenCalled()
  expect(context.setPublicationStatusBusy).toHaveBeenLastCalledWith(false)
})
it('keeps an unsuccessful retry in the editor with the saved-listing explanation', async () => {
  const { context, retry } = editor({ retryFailedListingChannels: vi.fn(async () => { throw new Error('Connection lost. Check status.') }) })
  await retry()
  expect(context.setError).toHaveBeenLastCalledWith('Your listing is saved. Connection lost. Check status.')
  expect(context.setPublicationStatusBusy).toHaveBeenLastCalledWith(false)
})

it.each(['publicationPending', 'publicationUncertain'])('allows setup navigation without changing a listing while %s', async flag => {
  const nextSource = page.slice(page.indexOf('  async function goToNextCreateListingStep()'), page.indexOf('  function goToPreviousCreateListingStep()'))
  const context = {
    setValidationAttemptedStep: vi.fn(), createListingStep: 'marketing', listingFieldIssues: [], isCreateListingWorkspace: false,
    listingEditorSteps: [{ key: 'property' }, { key: 'marketing' }, { key: 'syndication' }, { key: 'review' }], createListingStepIndex: 1,
    isEditListingWorkspace: true, isListingSaving: false, publicationPending: false, publicationUncertain: false,
    setCreateListingStep: vi.fn(), setError: vi.fn(), setIsListingSaving: vi.fn(), performUpdateExistingListing: vi.fn(),
    setCreateListingMaxVisitedStep: vi.fn(), openCreateListingStep: vi.fn(), [flag]: true,
  }
  const next = new Function(...Object.keys(context), `${nextSource}; return goToNextCreateListingStep;`)(...Object.values(context))
  await next()
  expect(context.openCreateListingStep).toHaveBeenCalledWith('syndication', { allowForward: true })
  expect(context.performUpdateExistingListing).not.toHaveBeenCalled()
})
