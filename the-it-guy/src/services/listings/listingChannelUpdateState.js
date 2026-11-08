import { listingPhotoPreparationMessages } from './listingPhotoPreparationFeedback.js'

const CHANNELS = Object.freeze(['Property24', 'Private Property', 'Agency Website', 'Kingdom Website'])
const DELIVERY_TYPES = new Set([
  'listing_price_changed', 'listing_under_offer', 'listing_sold', 'listing_portal_update_retried', 'listing_portal_update_started',
  'listing_channel_publication_submitted', 'listing_channel_publication_accepted', 'listing_channel_publication_failed',
])

function text(value) {
  return String(value ?? '').trim()
}

// Provider responses use several envelopes. Preserve their useful explanation
// in both immediate actions and durable background receipts; never stringify an
// error object or expose the whole response/payload as the user's error.
function safePortalText(value) {
  return String(value || '')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/<(?:[\w.-]+:)?(?:Token|Password|Digest|Authorization)\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?(?:Token|Password|Digest|Authorization)>/gi, '[redacted]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '[redacted]')
    .replace(/((?:access[_-]?token|token|password|client[_-]?secret|api[_-]?key|signature|authorization)\s*[=:]\s*)["']?[^\s&<>"']+/gi, '$1[redacted]')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ').trim()
}
const genericPortalMessage = value => !value || /^(?:request failed|validation failed|channel needs attention|publishing failed|an error occurred|one or more validation errors occurred)\.?$/i.test(value)
  || /^[a-z]+(?:_[a-z]+)+$/.test(value) || /^(?:Property24|Private Property) (?:GET|POST|PUT|PATCH) .*failed with \d+/i.test(value)

export function listingPortalFailureMessage(body = {}, fallback = '') {
  const report = body?.report || {}, preview = report.preview || body?.preview || report.readiness?.preview || body?.readiness?.preview || {}
  const message = value => typeof value === 'string' ? safePortalText(value) : typeof value?.message === 'string' ? safePortalText(value.message) : ''
  const photos = listingPhotoPreparationMessages(preview)
  if (photos.length) return [...new Set(photos.map(safePortalText))].slice(0, 3).join(' ')
  const details = [], visited = new Set()
  let fieldErrors = false
  // Walk error envelopes only, never stringify a listing, credentials or the
  // entire provider response. Both raw API and redacted report shapes occur.
  function collect(value, depth = 0, field = '') {
    if (depth > 6 || details.length >= 8 || value == null) return
    if (typeof value === 'string') {
      const clean = summarizeListingPortalError(value, { maxLength: 600 })
      if (!genericPortalMessage(clean)) details.push(field ? `${field}: ${clean}` : clean)
      return
    }
    if (Array.isArray(value)) { value.slice(0, 8).forEach(item => collect(item, depth + 1, field)); return }
    if (typeof value !== 'object' || visited.has(value)) return
    visited.add(value)
    const label = safePortalText(value.field || value.propertyName || value.property || value.Field || field).slice(0, 100)
    for (const key of ['errors', 'Errors', 'validationErrors', 'ValidationErrors', 'modelState', 'ModelState']) {
      const errors = value[key]
      if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
        for (const [name, reasons] of Object.entries(errors).slice(0, 16)) {
          if (/token|password|secret|authorization|digest/i.test(name)) continue
          fieldErrors = true; collect(reasons, depth + 1, safePortalText(name).slice(0, 100))
        }
      } else if (errors) collect(errors, depth + 1)
    }
    for (const key of ['message', 'Message', 'errorMessage', 'ErrorMessage', 'faultString', 'detail', 'resultText']) {
      if (typeof value[key] === 'string') { if (label) fieldErrors = true; collect(value[key], depth + 1, label) }
    }
    for (const key of ['response', 'responseSummary', 'sample', 'error']) {
      if (value[key] && typeof value[key] === 'object') collect(value[key], depth + 1)
    }
  }
  for (const value of [report.error, report.apiResponse?.error, body?.monitor?.apiError, body?.response, body?.error,
    { errors: body?.errors, Errors: body?.Errors, validationErrors: body?.validationErrors, modelState: body?.modelState, ModelState: body?.ModelState, detail: body?.detail },
  ]) collect(value)
  if (details.length) {
    const explanation = [...new Set(details)].slice(0, 4).join('; ')
    return fieldErrors ? `${explanation}. Review these fields, save the listing, then retry only the failed channel.` : explanation
  }
  const list = value => Array.isArray(value) ? value : []
  const blockers = [...list(preview.dataBlockers), ...list(preview.technicalBlockers), ...list(report.blockers), ...list(report.readiness?.blockers), ...list(body?.readiness?.blockers), ...list(report.checks).flatMap(check => list(check?.blockers))]
    .map(value => message(value) || message(value?.code)).filter(Boolean)
    .map(value => value.replace(/^missing_or_invalid_/, 'Enter or correct ').replace(/^missing_/, 'Add ').replaceAll('_', ' '))
  if (blockers.length) return `${[...new Set(blockers)].slice(0, 4).join('; ')}. Check requirements for the affected fields and next steps.`
  if (Array.isArray(body?.missingConfiguration) && body.missingConfiguration.length) return 'The portal connection is incomplete. Ask an agency administrator to check its account credentials and agency or branch setup.'
  const reason = [report.error, report.apiResponse?.error, body?.update?.message, report.locationResolution?.message, body?.readiness?.locationResolution?.message, report.recovery?.message, body?.readiness?.recovery?.message, body?.message, body?.Message, body?.error, report.nextStep].map(message).find(value => !genericPortalMessage(value))
  return reason ? summarizeListingPortalError(reason, { maxLength: 800 }) : fallback
}

export function summarizeListingPortalError(value = '', { maxLength = 240 } = {}) {
  let message = safePortalText(value)
  if (!message) return ''
  const invalidAttribute = message.match(/['"]([^'"]+)['"] is not a valid value for AttributeType/i)
  if (invalidAttribute) return `The portal rejected the feature code “${invalidAttribute[1]}”. Retry the submission with the latest saved listing.`
  if (/permission denied for (?:table|schema)|relation .+ does not exist|column .+ does not exist|schema cache|SQLSTATE|syntax error/i.test(message)) {
    return 'Arch9 could not read or save the required listing data. Contact support with the publishing request reference.'
  }
  if (/SoapException|System\.\w+|stack trace/i.test(message)) {
    message = message.replace(/^(?:[\w.]+(?:Exception|Error):\s*)+/g, '').split(/\s+at\s+(?:[A-Za-z_$][\w$]*\.)/)[0].trim()
    if (!message || /^(?:server was unable to process request|stack trace)\.?$/i.test(message)) return 'The portal could not process this submission. Check status and contact support with the publishing request reference.'
  }
  return message.length > maxLength ? `${message.slice(0, maxLength - 1)}…` : message
}

function eventType(event = {}) {
  return text(event.activity_type || event.activityType)
}

function eventMetadata(event = {}) {
  const value = event.metadata
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function eventTime(event = {}) {
  const value = Date.parse(event.created_at || event.createdAt || '')
  return Number.isFinite(value) ? value : 0
}

function eventAction(event, metadata) {
  return text(metadata.action) || ({
    listing_price_changed: 'price_reduction',
    listing_under_offer: 'under_offer',
    listing_sold: 'sold',
  }[eventType(event)] || '')
}

export function deriveListingChannelUpdateStates(activityRows = [], sessionResults = [], sessionAction = '') {
  const states = Object.fromEntries(CHANNELS.map((channel) => [channel, null]))
  const events = (Array.isArray(activityRows) ? activityRows : [])
    .filter((event) => DELIVERY_TYPES.has(eventType(event)) || ['listing_portal_update_verified', 'listing_channel_publication_verified', 'listing_channel_withdrawal_succeeded'].includes(eventType(event)))
    .sort((left, right) => eventTime(right) - eventTime(left))

  for (const event of events) {
    const metadata = eventMetadata(event)
    const action = eventAction(event, metadata)
    if (eventType(event) === 'listing_channel_withdrawal_succeeded') {
      const channel = text(metadata.channel)
      if (CHANNELS.includes(channel) && !states[channel]) states[channel] = { status: 'current', action: 'withdrawn', detail: 'Advert removed from this channel.' }
      continue
    }
    if (['listing_portal_update_verified', 'listing_channel_publication_verified'].includes(eventType(event))) {
      const channel = text(metadata.channel)
      if (CHANNELS.includes(channel) && !states[channel]) {
        states[channel] = { status: 'current', action, detail: 'Public page verified by an agent.' }
      }
      continue
    }
    if (eventType(event).startsWith('listing_channel_publication_')) {
      const channel = text(metadata.channel)
      if (!CHANNELS.includes(channel) || states[channel]) continue
      if (eventType(event) === 'listing_channel_publication_failed') {
        states[channel] = { status: 'needs_attention', action: action || 'publish', detail: text(metadata.error || metadata.detail) || 'Portal publication failed.', retriable: true }
      } else if (eventType(event) === 'listing_channel_publication_accepted') {
        states[channel] = { status: 'awaiting_verification', action: action || 'publish', detail: 'Portal accepted the publication; verify the public page before treating it as current.' }
      } else {
        states[channel] = { status: 'awaiting_verification', action: action || 'publish', detail: 'Publication was submitted and is waiting for a portal response.' }
      }
      continue
    }
    for (const result of Array.isArray(metadata.channelResults) ? metadata.channelResults : []) {
      const channel = text(result?.channel)
      if (!CHANNELS.includes(channel) || states[channel]) continue
      const resultAction = text(result.action) || action
      if (result.status === 'uncertain') states[channel] = { status: 'needs_attention', action: resultAction, detail: text(result.detail) || 'The previous advertising request is unconfirmed. Check status before sending again.', retriable: false }
      else if (result.status === 'failed') states[channel] = { status: 'needs_attention', action: resultAction, detail: text(result.detail) || 'Portal update failed.', retriable: true }
      else if (result.status === 'pending') states[channel] = { status: 'needs_attention', action: resultAction, detail: 'Arch9 saved this change, but the portal update has not been confirmed.' }
      else if (result.status === 'sent') states[channel] = { status: 'awaiting_verification', action: resultAction, detail: 'Update accepted; check the public page before confirming it is current.' }
      else if (result.status === 'not_connected') states[channel] = { status: 'needs_attention', action: resultAction, detail: text(result.detail) || 'No confirmed live listing to update.', retriable: false }
    }
  }

  // The current session is authoritative when activity storage itself fails.
  for (const result of Array.isArray(sessionResults) ? sessionResults : []) {
    const channel = text(result?.channel)
    if (!CHANNELS.includes(channel)) continue
    if (result.status === 'uncertain') states[channel] = { action: text(result.action) || text(sessionAction), status: 'needs_attention', detail: text(result.detail) || 'Check the previous advertising request before sending again.', retriable: false }
    else if (result.status === 'failed') states[channel] = { ...states[channel], action: text(result.action) || text(sessionAction) || states[channel]?.action || '', status: 'needs_attention', detail: text(result.detail) || 'Portal update failed.' }
    else if (result.status === 'not_connected') states[channel] = { action: text(sessionAction), status: 'needs_attention', detail: text(result.detail) || 'No confirmed live listing to update.', retriable: false }
    else if (result.status === 'sent' && !['current', 'needs_attention'].includes(states[channel]?.status)) states[channel] = { ...states[channel], action: text(sessionAction) || states[channel]?.action || '', status: 'awaiting_verification', detail: 'Update accepted; check the public page before confirming it is current.' }
  }
  return states
}

// A portal popup includes only its own deliveries, plus saved pricing changes.
export function getListingChannelManageActivity(activityRows = [], channel) {
  return (Array.isArray(activityRows) ? activityRows : []).flatMap(row => {
    const metadata = eventMetadata(row)
    const result = (Array.isArray(metadata.channelResults) ? metadata.channelResults : []).find(item => item.channel === channel)
    const direct = metadata.channel === channel
    const pricingEdit = eventType(row) === 'listing_price_changed' && metadata.action === 'pricing_edit'
    if (!direct && !result && !pricingEdit) return []
    const action = text(result?.action || metadata.action).replace(/_/g, ' ')
    return [{
      id: row.id,
      title: result ? `${channel} ${action || 'update'} · ${result.status === 'failed' ? 'Needs attention' : result.status === 'sent' ? 'Accepted' : result.status || 'Recorded'}` : text(row.activity_title || row.activityTitle) || `${channel} activity`,
      detail: text(result?.detail || (direct ? metadata.error || metadata.detail : '') || row.activity_description || row.activityDescription),
      at: row.created_at || row.createdAt || '',
      by: text(row.performedByName || row.performed_by_name),
    }]
  }).sort((left, right) => (Date.parse(right.at) || 0) - (Date.parse(left.at) || 0)).slice(0, 15)
}

const labels = { publishing: 'Sending…', submitted: 'Request accepted', needs_attention: 'Needs attention', uncertain: 'Not confirmed' }

export function listingPublicationReceipt(row) {
  return {
    label: row.jobState === 'queued' ? 'Queued' : row.status === 'publishing' && !row.jobId ? 'Confirming request…' : labels[row.status] || 'Not confirmed',
    message: row.status === 'submitted' ? 'The request was accepted. Check the public advert before treating it as live.' : row.status === 'publishing' && !row.jobId ? 'Waiting to confirm that your advertising request is saved. Keep this page open.' : row.jobState === 'queued' ? 'The request is saved and waiting to send. You can leave this page.' : row.status === 'publishing' ? 'The request is being sent. Wait for the result before sending again.' : summarizeListingPortalError(row.message, { maxLength: 800 }) || 'Check status for the latest result.',
  }
}

// Persist unresolved feedback across reloads without presenting old accepted
// receipts as the outcome of the current edit.
export function listingAdvertReceiptForEditor(attempt, receipt) {
  if (attempt) return !attempt.notSent && attempt.status !== 'skipped' ? receipt || attempt : attempt
  return receipt && ['needs_attention', 'uncertain', 'publishing'].includes(receipt.status) ? { ...receipt, previous: true } : null
}
