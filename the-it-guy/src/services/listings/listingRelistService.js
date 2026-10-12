import { diffListingPublicationSnapshots } from './listingPublicationState.js'

export const RELIST_CHANNELS = ['Property24', 'Private Property']
const text = value => String(value ?? '').trim()

// Use the existing authenticated endpoints; never rotate the portal identity.
export function createListingRelistPortalActions({ listingId, channel, property24Reference, property24Context, callProperty24, callPrivateProperty, property24Message, privatePropertyReference, onPrivatePropertyStatus }) {
  return {
    withdraw: async () => channel === 'Private Property'
      ? callPrivateProperty('status-update', { propertyStatus: 'Inactive' })
      : callProperty24('status-update', { environment: 'production', listingNumber: property24Reference, status: 'Withdrawn' }),
    observeState: async () => {
      if (channel === 'Private Property') {
        const response = await callPrivateProperty('status', {}, { method: 'GET', query: new URLSearchParams({ cached: 'false', recordSync: 'true' }) })
        onPrivatePropertyStatus?.(response)
        const status = (response.monitor || response.report)?.externalStatus
        return status === 'active' ? true : ['inactive', 'removed'].includes(status) ? false : null
      }
      const response = await callProperty24('status', {}, { method: 'GET', query: new URLSearchParams({ environment: 'production', refresh: 'true' }) })
      if (text(response.status?.listingNumber) !== text(property24Reference)) return null
      const live = response.status?.lifecycle?.isOnPortal
      return typeof live === 'boolean' ? live : null
    },
    prepare: async () => {
      if (channel === 'Private Property') {
        const response = await callPrivateProperty('preview', {}, { fallbackMessage: 'Private Property could not check this relist.' })
        return response.readiness || response.report || {}
      }
      if (!property24Reference) throw new Error('There is no existing Property24 reference. Use Publish for the first submission.')
      const response = await callProperty24('preview', property24Context(), { fallbackMessage: 'Property24 could not check this relist.' })
      const preview = response.preview || response.report?.preview || {}
      return { ...preview, identity: { listingNumber: text(property24Reference) }, message: property24Message(response, 'Fix the Property24 listing requirements before relisting.') }
    },
    activate: async listingType => {
      const response = await callPrivateProperty('status-update', { propertyStatus: listingType === 'Rental' ? 'ToLet' : 'ForSale', confirm: `PRIVATE_PROPERTY_REACTIVATE:${listingId}:production` })
      return response.update || response.report || {}
    },
    publish: async () => {
      const response = channel === 'Private Property'
        ? await callPrivateProperty('publish', { confirm: `PRIVATE_PROPERTY_PUBLISH:${listingId}:production`, photosChanged: true })
        : await callProperty24('publish', property24Context())
      const report = response.report || {}
      const reference = channel === 'Property24' ? text(report.databaseWrite?.listingNumber) : privatePropertyReference(response)
      if (channel === 'Property24' && reference && reference !== text(property24Reference)) throw new Error('Property24 returned a different advert reference. Review its response before sending again.')
      return { status: report.status || response.status, reference, message: report.nextStep || response.message, definiteRejection: report.safety?.property24ApiCalled === false || report.safety?.privatePropertyApiCalled === false }
    },
    observe: async () => {
      if (channel === 'Private Property') {
        const response = await callPrivateProperty('status', {}, { method: 'GET', query: new URLSearchParams({ cached: 'false', recordSync: 'true' }) })
        onPrivatePropertyStatus?.(response)
        return (response.monitor || response.report)?.externalStatus === 'active'
      }
      const response = await callProperty24('status', {}, { method: 'GET', query: new URLSearchParams({ environment: 'production', refresh: 'true' }) })
      return text(response.status?.listingNumber) === text(property24Reference) && response.status?.lifecycle?.isOnPortal === true
    },
  }
}

// All selected adverts must be confirmed offline before any is republished.
// Durable withdrawal intent prevents duplicate writes after a lost response.
export async function withdrawListingForRelist({ listingId, channel, snapshot, checkpoint }, deps, { checkOnly = false } = {}) {
  let current = checkpoint || { listingId, channel, runId: globalThis.crypto.randomUUID(), phase: 'review', snapshot }
  const result = (status, detail) => ({ channel, status, detail, checkpoint: current })
  if (current.listingId !== listingId || current.channel !== channel) return result('blocked', 'This relist belongs to another listing or portal.')
  if (['activation_requested', 'content_requested', 'content_accepted', 'completed'].includes(current.phase)) return result('ready', 'Continuing the existing relist request without repeating withdrawal.')
  const progress = async phase => {
    const next = { ...current, phase, snapshot, recordedAt: new Date().toISOString() }
    await deps.recordCheckpoint(next)
    current = next
  }
  try {
    const review = await deps.prepare()
    const identity = channel === 'Private Property' ? { propertyId: review.recovery?.propertyId, branchGuid: review.recovery?.branchGuid } : review.identity || {}
    if (Object.entries(current.identity || {}).some(([key, value]) => value && text(identity[key]) !== text(value))) return result('blocked', 'The linked advert changed. Review it before relisting.')
    current = { ...current, identity }
    if (channel === 'Private Property') {
      if (!review.recovery?.checked || !text(identity.propertyId)) return result('blocked', 'No existing Private Property advert could be verified.')
      if (review.blockers?.includes('private_property_locked_address_mismatch')) return result('blocked', privatePropertyRelistAddressMessage(review))
      if ((review.blockers || []).some(value => value !== 'private_property_reactivation_required')) return result('blocked', review.nextStep || 'Fix the listing requirements before withdrawing for relist.')
    } else if (!review.canSubmit) return result('blocked', review.message || 'Fix the Property24 listing requirements before withdrawing for relist.')
    const live = await deps.observeState()
    if (checkOnly) {
      if (current.phase === 'withdrawal_confirmed' && live !== false) return result('blocked', 'This advert is no longer confirmed offline. Review it before continuing.')
      if (live === null && current.phase !== 'withdrawal_requested') return result('blocked', 'The portal could not confirm whether this advert is live. No withdrawal or republish was sent.')
      return result('ready', 'Listing requirements checked.')
    }
    if (live === false) {
      await progress('withdrawal_confirmed')
      return result('ready', 'Advert is offline. Waiting for the other selected portals before republishing.')
    }
    if (current.phase === 'withdrawal_confirmed') return result('blocked', 'This advert became live again after withdrawal. Review it before continuing.')
    if (current.phase === 'withdrawal_requested') return result('pending', 'Waiting for confirmed withdrawal. The request has not been repeated.')
    if (live !== true) return result('blocked', 'The portal could not confirm whether this advert is live. No withdrawal or republish was sent.')
    await progress('withdrawal_requested')
    await deps.withdraw()
    if (await deps.observeState() !== false) return result('pending', 'Withdrawal was requested. Waiting for the portal to confirm removal before republishing.')
    await progress('withdrawal_confirmed')
    return result('ready', 'Withdrawal confirmed. Waiting for the other selected portals before republishing.')
  } catch (error) {
    if (current.phase === 'withdrawal_requested') {
      if (error.definiteRejection) {
        try { await progress('rejected') } catch { /* Retain the durable send intent. */ }
        return result('failed', error.message)
      }
      return result('pending', `${error.message || 'Withdrawal could not be confirmed.'} Check and continue; withdrawal will not be repeated.`)
    }
    return result('failed', error.message || 'Relist could not be checked.')
  }
}

export async function relistListingChannels({ listingId, channels, snapshot, checkpoints = {}, previousResults = [], onProgress }, dependenciesFor) {
  if (!listingId || !channels.length || channels.some(channel => !RELIST_CHANNELS.includes(channel))) throw new Error('Choose a saved listing and supported portals.')
  let results = [...previousResults]
  const batchIds = [...new Set([...Object.values(checkpoints), ...previousResults.map(row => row.checkpoint)].filter(Boolean).map(row => row.batchId).filter(Boolean))]
  if (batchIds.length > 1) throw new Error('These portals have different relist requests in progress. Complete them separately before starting another relist.')
  const batchId = batchIds[0] || globalThis.crypto.randomUUID()
  const seeds = Object.fromEntries(channels.map(channel => [channel, { listingId, channel, runId: globalThis.crypto.randomUUID(), phase: 'review', snapshot, ...checkpoints[channel], batchId }]))
  const dependencies = new Map(channels.map(channel => [channel, dependenciesFor(channel)]))
  const show = row => { results = [...results.filter(value => value.channel !== row.channel), row]; onProgress?.([...results]) }
  const argsFor = channel => ({ listingId, channel, snapshot, checkpoint: results.find(row => row.channel === channel)?.checkpoint || seeds[channel] })
  // Preflight every portal first, so an address/readiness blocker cannot take
  // a healthy advert offline on a different portal.
  const checks = []
  for (const channel of channels) checks.push(await withdrawListingForRelist(argsFor(channel), dependencies.get(channel), { checkOnly: true }))
  if (checks.some(row => row.status !== 'ready')) {
    checks.forEach(row => show(row.status === 'ready' ? { ...row, status: 'blocked', detail: 'Resolve the other selected portal before starting the relist.' } : row))
    return results
  }
  checks.forEach(row => show({ ...row, status: 'pending', detail: 'Requirements checked. Waiting for withdrawal and confirmation before republishing.' }))
  for (const channel of channels) {
    const outcome = await withdrawListingForRelist(argsFor(channel), dependencies.get(channel))
    show(outcome)
    if (['failed', 'blocked'].includes(outcome.status)) return results
  }
  if (channels.some(channel => results.find(row => row.channel === channel)?.status !== 'ready')) return results
  for (const channel of channels) show(await relistListingChannel(argsFor(channel), dependencies.get(channel)))
  return results
}

// Persist intent before each send. A lost response must not cause another
// activation/content send when the dialog is reopened or the page is refreshed.
export function readListingRelistCheckpoint(rows = [], channel, { includeCompleted = false } = {}) {
  const row = rows.filter(item => (item.activity_type || item.activityType) === 'listing_relist_progress' && item.metadata?.channel === channel)
    .sort((a, b) => Date.parse(b.created_at || b.createdAt) - Date.parse(a.created_at || a.createdAt))[0]
  const checkpoint = row?.metadata
  return checkpoint && (includeCompleted || !['completed', 'rejected'].includes(checkpoint.phase)) ? checkpoint : null
}

export function readListingRelistCheckpoints(rows = [], channels = RELIST_CHANNELS) {
  const latest = Object.fromEntries(channels.map(channel => [channel, readListingRelistCheckpoint(rows, channel, { includeCompleted: true })]))
  const unfinished = Object.values(latest).filter(row => row && !['completed', 'rejected'].includes(row.phase))
  if (!unfinished.length) return {}
  // Keep completed portals in an unfinished batch after a page refresh. They
  // must not be withdrawn again just because another portal is still pending.
  const batches = new Set(unfinished.map(row => row.batchId).filter(Boolean))
  return Object.fromEntries(Object.entries(latest).filter(([, row]) => row && row.phase !== 'rejected' && (!row.batchId || batches.has(row.batchId))))
}

export function privatePropertyRelistAddressMessage(readiness = {}) {
  const address = value => [value?.streetNumber, value?.streetName, value?.unitNumber && `Unit ${value.unitNumber}`, value?.complexName, value?.suburb, value?.town].filter(Boolean).join(', ')
  return `Private Property retains ${address(readiness.recovery?.storedAddress) || 'a different address'}. Your saved listing uses ${address(readiness.preview?.payloadPreview?.address) || 'another address'}. Relist is for the same property. Correct the address or create a new listing for a different property.`
}

export async function relistListingChannel({ listingId, channel, snapshot, checkpoint = null }, { prepare, activate, publish, observe, recordCheckpoint, recordPublication, beforeSend = async () => {} }) {
  if (!listingId || !RELIST_CHANNELS.includes(channel)) throw new Error('Choose a saved listing and a supported portal.')
  if (checkpoint && (checkpoint.listingId !== listingId || checkpoint.channel !== channel)) throw new Error('This relist belongs to another listing or portal.')
  let current = checkpoint || { listingId, channel, runId: globalThis.crypto.randomUUID(), phase: 'review', snapshot }
  const result = (status, detail, extra = {}) => ({ channel, status, detail, checkpoint: current, ...extra })
  const progress = async (phase, extra = {}) => {
    const next = { ...current, ...extra, phase, snapshot, recordedAt: new Date().toISOString() }
    await recordCheckpoint(next)
    current = next
  }
  const identityFor = review => channel === 'Private Property'
    ? { propertyId: review.recovery?.propertyId, branchGuid: review.recovery?.branchGuid }
    : review.identity || {}
  const identityChanged = review => Object.entries(current.identity || {}).some(([key, value]) => value && text(identityFor(review)[key]) !== text(value))
  try {
    if (['content_requested', 'content_accepted', 'completed'].includes(current.phase) && (diffListingPublicationSnapshots(snapshot, current.snapshot, { channel }).length || channel === 'Property24' && snapshot.property24ExpiryDate !== current.snapshot?.property24ExpiryDate)) {
      return result('blocked', 'Details changed after the earlier relist send. Check that advert first, then send the later edits as an update.')
    }
    if (current.phase === 'completed') return result('completed', 'Relisted. Saved changes were accepted.')
    if (current.phase === 'content_requested') return result('uncertain', 'The previous content request has an unknown outcome. Check the advert before sending again; Arch9 has not repeated the request.')
    if (current.phase === 'content_accepted') {
      const review = await prepare()
      if (identityChanged(review)) return result('blocked', 'The linked advert changed after the relist request. Review the original advert before continuing.')
      if (review.blockers?.includes('private_property_locked_address_mismatch')) return result('blocked', privatePropertyRelistAddressMessage(review))
      if (!current.publicationRecorded) {
        await recordPublication('accepted', current.reference)
        await progress('content_accepted', { publicationRecorded: true })
      }
      if (!await observe()) return result('pending', 'Saved changes were accepted. Waiting for the portal to confirm the advert is active.')
      await progress('completed')
      return result('completed', 'Relisted. Saved changes were accepted and the advert is active. Check its public page to confirm the displayed details.')
    }

    let review = await prepare()
    if (identityChanged(review)) return result('blocked', 'The linked advert changed after the relist request. Review the original advert before continuing.')
    current = { ...current, identity: identityFor(review) }
    if (channel === 'Private Property') {
      const recovery = review.recovery || {}
      if (!recovery.checked || !text(recovery.propertyId)) return result('blocked', 'No existing Private Property advert could be verified. Use Publish for a first submission.')
      if (review.blockers?.includes('private_property_locked_address_mismatch')) return result('blocked', privatePropertyRelistAddressMessage(review))
      const blockers = (review.blockers || []).filter(value => value !== 'private_property_reactivation_required')
      if (blockers.length) return result('blocked', review.nextStep || 'Fix the listing requirements before relisting.')
      await beforeSend()
      review = await prepare()
      if ((review.blockers || []).some(value => value !== 'private_property_reactivation_required')) return result('blocked', review.nextStep || 'Recheck the listing before relisting.')
      const refreshedRecovery = review.recovery || {}
      if (!refreshedRecovery.checked || identityChanged(review)) return result('blocked', 'The existing advert changed. Refresh the listing before relisting.')
      if (refreshedRecovery.externalStatus !== 'active') {
        if (current.phase === 'activation_requested') return result('pending', 'Reactivation was requested. Waiting for Private Property; the request has not been repeated.')
        if (!refreshedRecovery.canReactivate) return result('blocked', refreshedRecovery.message || 'Private Property needs review before this advert can be relisted.')
        await progress('activation_requested')
        const activated = await activate(refreshedRecovery.listingType)
        if (!activated.confirmed) return result('pending', 'Reactivation was requested. Waiting for Private Property before sending your saved changes.')
        // Verify the retained address again against the current saved payload.
        review = await prepare()
        if (!review.ready) return result('blocked', review.nextStep || 'Recheck the listing before sending changes.')
      }
      if (!review.ready) return result('blocked', review.nextStep || 'Fix the listing requirements before relisting.')
    } else if (!review.canSubmit) {
      return result('blocked', review.message || 'Fix the Property24 listing requirements before relisting.')
    } else {
      await beforeSend()
      review = await prepare()
      if (identityChanged(review)) return result('blocked', 'The existing advert changed. Refresh the listing before relisting.')
      if (!review.canSubmit) return result('blocked', review.message || 'Recheck the listing before relisting.')
    }

    await recordPublication('submitted')
    await progress('content_requested')
    const receipt = await publish()
    if (receipt?.status !== 'SUBMITTED') {
      if (['BLOCKED', 'FAILED'].includes(receipt?.status) && receipt.definiteRejection) {
        await progress('rejected')
        return result('failed', receipt.message || 'The portal rejected the relist. Fix the issue before trying again.')
      }
      return result('uncertain', receipt?.message || 'The portal has not confirmed receipt of your saved changes. Check the advert before sending again.')
    }
    await progress('content_accepted', { reference: receipt.reference || '', publicationRecorded: false })
    await recordPublication('accepted', receipt.reference)
    await progress('content_accepted', { publicationRecorded: true })
    if (!await observe()) return result('pending', 'Saved changes were accepted. Waiting for the portal to confirm the advert is active.')
    await progress('completed')
    return result('completed', 'Relisted. Saved changes were accepted and the advert is active. Check its public page to confirm the displayed details.')
  } catch (error) {
    if (error.definiteRejection && ['activation_requested', 'content_requested'].includes(current.phase)) {
      try { await progress('rejected') } catch { /* Keep the durable send intent. */ }
      await recordPublication('failed', '', error.message).catch(() => {})
      return result('failed', error.message)
    }
    if (['activation_requested', 'content_requested', 'content_accepted'].includes(current.phase)) {
      return result(current.phase === 'content_requested' ? 'uncertain' : 'pending', `${error.message || 'The result could not be confirmed.'} Check and continue; completed sends will not be repeated.`)
    }
    return result('failed', error.message || 'Relisting could not be started.')
  }
}
