import { describe, expect, it, vi } from 'vitest'
import { createListingRelistPortalActions, readListingRelistCheckpoint, relistListingChannel } from '../listingRelistService.js'

const snapshot = { price: '1250000', description: 'New description', gallery: ['new-photo'], listingStatus: 'active' }
const inactive = () => ({ ready: false, blockers: ['private_property_reactivation_required'], recovery: { checked: true, propertyId: 'same-property', externalStatus: 'inactive', listingType: 'Sale', canReactivate: true } })
const active = () => ({ ready: true, blockers: [], recovery: { checked: true, propertyId: 'same-property', externalStatus: 'active' } })
function setup({ channel = 'Private Property', checkpoint = null, review = inactive() } = {}) {
  let state = review
  const recorded = []
  const deps = {
    prepare: vi.fn(async () => state), beforeSend: vi.fn(async () => {}),
    activate: vi.fn(async () => { state = active(); return { confirmed: true } }),
    publish: vi.fn(async () => ({ status: 'SUBMITTED', reference: 'same-reference' })),
    observe: vi.fn(async () => true),
    recordCheckpoint: vi.fn(async row => { recorded.push(row) }), recordPublication: vi.fn(async () => {}),
  }
  const args = { listingId: 'listing-one', channel, snapshot, checkpoint }
  return { args, deps, recorded, run: () => relistListingChannel(args, deps) }
}

describe('relist the existing advert using the saved edits', () => {
  it('records activation intent, confirms activation, then sends content once', async () => {
    const { run, deps, recorded } = setup()
    expect((await run()).status).toBe('completed')
    expect(recorded.map(row => row.phase)).toEqual(['activation_requested', 'content_requested', 'content_accepted', 'content_accepted', 'completed'])
    expect(deps.activate).toHaveBeenCalledWith('Sale')
    expect(deps.publish).toHaveBeenCalledTimes(1)
    expect(deps.activate.mock.invocationCallOrder[0]).toBeLessThan(deps.publish.mock.invocationCallOrder[0])
    expect(deps.prepare.mock.calls.length).toBe(3)
    expect(recorded[1].snapshot).toEqual(snapshot)
  })
  it('uses ToLet for an existing rental advert', async () => {
    const review = inactive(); review.recovery.listingType = 'Rental'
    const { run, deps } = setup({ review })
    await run()
    expect(deps.activate).toHaveBeenCalledWith('Rental')
  })
  it('a live PP advert receives only content updates', async () => {
    const { run, deps } = setup({ review: active() })
    expect((await run()).status).toBe('completed')
    expect(deps.activate).not.toHaveBeenCalled()
    expect(deps.publish).toHaveBeenCalledOnce()
  })
  it('P24 relists through its existing content submission, without a PP activation', async () => {
    const { run, deps } = setup({ channel: 'Property24', review: { canSubmit: true } })
    expect((await run()).status).toBe('completed')
    expect(deps.activate).not.toHaveBeenCalled()
    expect(deps.publish).toHaveBeenCalledOnce()
  })
  it('blocks changed addresses before restoring Arch9 or making a portal mutation', async () => {
    const review = { ...inactive(), blockers: ['private_property_locked_address_mismatch'], preview: { payloadPreview: { address: { streetNumber: '509', streetName: '30th Avenue', suburb: 'Villieria' } } } }
    review.recovery.storedAddress = { streetNumber: '1547', streetName: 'Bougainvillea Drive', suburb: 'Montana Tuine' }
    const { run, deps } = setup({ review })
    const result = await run()
    expect(result.status).toBe('blocked')
    expect(result.detail).toContain('1547, Bougainvillea Drive')
    expect(result.detail).toContain('509, 30th Avenue')
    expect(deps.beforeSend).not.toHaveBeenCalled()
    expect(deps.activate).not.toHaveBeenCalled()
    expect(deps.publish).not.toHaveBeenCalled()
  })
  it('refuses to create a first advert through Relist or bypass readiness', async () => {
    for (const review of [{ ready: true, recovery: { checked: false } }, { ...inactive(), blockers: ['missing_agent'], nextStep: 'Assign an agent.' }]) {
      const { run, deps } = setup({ review })
      expect((await run()).status).toBe('blocked')
      expect(deps.publish).not.toHaveBeenCalled()
    }
  })
  it('waits after an acknowledged but delayed activation; resume does not repeat it', async () => {
    const original = setup()
    original.deps.activate.mockResolvedValue({ confirmed: false })
    const pending = await original.run()
    expect(pending.status).toBe('pending')
    expect(original.deps.publish).not.toHaveBeenCalled()
    const waiting = setup({ checkpoint: pending.checkpoint })
    expect((await waiting.run()).status).toBe('pending')
    expect(waiting.deps.activate).not.toHaveBeenCalled()
    expect(waiting.deps.publish).not.toHaveBeenCalled()
    const resumed = setup({ checkpoint: pending.checkpoint, review: active() })
    expect((await resumed.run()).status).toBe('completed')
    expect(resumed.deps.activate).not.toHaveBeenCalled()
    expect(resumed.deps.publish).toHaveBeenCalledOnce()
  })
  it('a lost activation response retains durable intent across refresh', async () => {
    const first = setup()
    first.deps.activate.mockRejectedValue(new Error('Network response lost.'))
    const result = await first.run()
    expect(result.status).toBe('pending')
    const row = { activity_type: 'listing_relist_progress', created_at: '2026-10-12T09:00:00Z', metadata: first.recorded.at(-1) }
    const second = setup({ checkpoint: readListingRelistCheckpoint([row], 'Private Property') })
    await second.run()
    expect(second.deps.activate).not.toHaveBeenCalled()
    expect(second.deps.publish).not.toHaveBeenCalled()
  })
  it('never repeats a content send with a lost response, even after reopening', async () => {
    const first = setup({ review: active() })
    first.deps.publish.mockRejectedValue(new Error('Response lost.'))
    const uncertain = await first.run()
    expect(uncertain.status).toBe('uncertain')
    const second = setup({ checkpoint: uncertain.checkpoint, review: active() })
    expect((await second.run()).status).toBe('uncertain')
    expect(second.deps.publish).not.toHaveBeenCalled()
    expect(second.deps.activate).not.toHaveBeenCalled()
  })
  it('continues observation after accepted content without sending it again', async () => {
    const first = setup({ review: active() }); first.deps.observe.mockResolvedValue(false)
    const pending = await first.run()
    const second = setup({ checkpoint: pending.checkpoint })
    expect((await second.run()).status).toBe('completed')
    expect(second.deps.publish).not.toHaveBeenCalled()
    expect(second.deps.activate).not.toHaveBeenCalled()
  })
  it('does not claim later edits were sent as part of an earlier accepted request', async () => {
    const first = setup({ review: active() }); first.deps.observe.mockResolvedValue(false)
    const pending = await first.run()
    const second = setup({ checkpoint: pending.checkpoint })
    second.args.snapshot = { ...snapshot, price: '1400000' }
    expect((await second.run()).status).toBe('blocked')
    expect(second.deps.publish).not.toHaveBeenCalled()
  })
  it('retains the send checkpoint if saving the acceptance fails', async () => {
    const { run, deps, recorded } = setup({ review: active() })
    deps.recordCheckpoint.mockImplementation(async row => { if (row.phase === 'content_accepted') throw new Error('History unavailable.'); recorded.push(row) })
    const result = await run()
    expect(result.status).toBe('uncertain')
    expect(result.checkpoint.phase).toBe('content_requested')
    expect(deps.publish).toHaveBeenCalledOnce()
  })
  it('never mutates if the send intent cannot be saved', async () => {
    const { run, deps } = setup()
    deps.recordCheckpoint.mockRejectedValue(new Error('History unavailable.'))
    expect((await run()).status).toBe('failed')
    expect(deps.activate).not.toHaveBeenCalled()
    expect(deps.publish).not.toHaveBeenCalled()
  })
  it('allows corrected retries only after a definite rejection', async () => {
    const { run, deps } = setup({ review: active() })
    deps.publish.mockRejectedValue(Object.assign(new Error('Invalid feature.'), { definiteRejection: true }))
    const result = await run()
    expect(result.status).toBe('failed')
    expect(result.checkpoint.phase).toBe('rejected')
  })
  it('rechecks identity/address before mutation and rejects changed ownership', async () => {
    const { run, deps } = setup()
    deps.prepare.mockResolvedValueOnce(inactive()).mockResolvedValueOnce({ ...active(), recovery: { ...active().recovery, propertyId: 'another-property' } })
    expect((await run()).status).toBe('blocked')
    expect(deps.activate).not.toHaveBeenCalled()
    expect(deps.publish).not.toHaveBeenCalled()
  })
  it('refuses to resume against a replaced portal identity', async () => {
    const first = setup(); first.deps.activate.mockResolvedValue({ confirmed: false })
    const pending = await first.run()
    const review = active(); review.recovery.propertyId = 'replacement-id'
    const second = setup({ checkpoint: pending.checkpoint, review })
    expect((await second.run()).status).toBe('blocked')
    expect(second.deps.activate).not.toHaveBeenCalled()
    expect(second.deps.publish).not.toHaveBeenCalled()
  })
  it('does not claim a later expiry date was part of an earlier accepted P24 send', async () => {
    const first = setup({ channel: 'Property24', review: { canSubmit: true } })
    first.deps.observe.mockResolvedValue(false)
    first.args.snapshot = { ...snapshot, property24ExpiryDate: '2027-01-10' }
    const pending = await first.run()
    const second = setup({ channel: 'Property24', checkpoint: pending.checkpoint, review: { canSubmit: true } })
    second.args.snapshot = { ...snapshot, property24ExpiryDate: '2027-02-10' }
    expect((await second.run()).status).toBe('blocked')
    expect(second.deps.publish).not.toHaveBeenCalled()
  })
})

describe('existing authenticated portal contracts', () => {
  const context = { environment: 'production', listingNumber: '117000001', status: 'Active', expiryDate: '2027-01-10', photosChanged: true }
  const options = { listingId: 'listing-one', property24Reference: context.listingNumber, property24Context: () => context, property24Message: (_, fallback) => fallback, privatePropertyReference: response => response.report?.apiResponse?.privatePropertyReference || '' }
  it('uses the existing P24 advert number, Active status, new expiry and refreshed photos', async () => {
    const callProperty24 = vi.fn(async action => action === 'preview' ? { preview: { canSubmit: true } } : action === 'publish' ? { report: { status: 'SUBMITTED', databaseWrite: { listingNumber: 117000001 } } } : { status: { listingNumber: 117000001, lifecycle: { isOnPortal: true } } })
    const actions = createListingRelistPortalActions({ ...options, channel: 'Property24', callProperty24 })
    const fixture = setup({ channel: 'Property24' })
    expect((await relistListingChannel(fixture.args, { ...fixture.deps, ...actions })).status).toBe('completed')
    expect(callProperty24).toHaveBeenCalledWith('publish', context)
    const observation = callProperty24.mock.calls.find(([action]) => action === 'status')
    expect(observation[2].method).toBe('GET')
    expect(observation[2].query.get('refresh')).toBe('true')
    expect(observation[2].query.get('environment')).toBe('production')
  })
  it('uses the exact PP reactivation confirmation, then content publishing and a fresh probe', async () => {
    let activated = false
    const callPrivateProperty = vi.fn(async action => {
      if (action === 'preview') return { readiness: activated ? active() : inactive() }
      if (action === 'status-update') { activated = true; return { update: { confirmed: true } } }
      if (action === 'publish') return { report: { status: 'SUBMITTED', apiResponse: { privatePropertyReference: 'T123' } } }
      return { monitor: { externalStatus: 'active' } }
    })
    const actions = createListingRelistPortalActions({ ...options, channel: 'Private Property', callPrivateProperty })
    const fixture = setup()
    expect((await relistListingChannel(fixture.args, { ...fixture.deps, ...actions })).status).toBe('completed')
    expect(callPrivateProperty).toHaveBeenCalledWith('status-update', { propertyStatus: 'ForSale', confirm: 'PRIVATE_PROPERTY_REACTIVATE:listing-one:production' })
    expect(callPrivateProperty).toHaveBeenCalledWith('publish', { confirm: 'PRIVATE_PROPERTY_PUBLISH:listing-one:production', photosChanged: true })
    const observation = callPrivateProperty.mock.calls.find(([action]) => action === 'status')
    expect(observation[2].query.get('cached')).toBe('false')
    expect(observation[2].query.get('recordSync')).toBe('true')
  })
  it('treats an unexpected P24 identity as uncertain and never creates a first advert', async () => {
    const callProperty24 = vi.fn(async () => ({ report: { status: 'SUBMITTED', databaseWrite: { listingNumber: 999999 } } }))
    const actions = createListingRelistPortalActions({ ...options, channel: 'Property24', callProperty24 })
    await expect(actions.publish()).rejects.toThrow('different advert reference')
    const firstAdvert = createListingRelistPortalActions({ ...options, property24Reference: '', channel: 'Property24', callProperty24 })
    callProperty24.mockClear()
    await expect(firstAdvert.prepare()).rejects.toThrow('Use Publish for the first submission')
    expect(callProperty24).not.toHaveBeenCalled()
  })
})
