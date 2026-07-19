function text(value) {
  return String(value || '').trim()
}

function summaryFor(version = {}) {
  const value = version.validation_summary_json || version.validationSummaryJson
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/** A fallback is review material only; it is never a document eligible for signing. */
export function isPilotDocumentFallbackVersion(version = {}) {
  const summary = summaryFor(version)
  return summary.previewOnly === true ||
    summary.generationStatus === 'preview_only' ||
    summary.pilotFallback?.active === true
}

export function buildPilotDocumentFallback({ packetType = 'mandate', reason = '', failureCode = '' } = {}) {
  const type = text(packetType).toLowerCase() === 'otp' ? 'OTP' : 'mandate'
  return {
    contract: 'arch9-pilot-document-fallback-v1',
    active: true,
    signable: false,
    label: 'Pilot review draft — not for signature',
    message: `A ${type} preview was saved for internal review only. Correct the issue and generate a verified document before sending or signing.`,
    reason: text(reason) || null,
    failureCode: text(failureCode).replace(/[^A-Z0-9_]/gi, '_').toUpperCase() || null,
  }
}

export function findLatestPilotDocumentFallback(versions = []) {
  return (Array.isArray(versions) ? versions : []).find(isPilotDocumentFallbackVersion) || null
}

export function findLatestSignableGeneratedVersion(versions = []) {
  return (Array.isArray(versions) ? versions : []).find((version) =>
    text(version?.render_status || version?.renderStatus).toLowerCase() === 'generated' &&
    !isPilotDocumentFallbackVersion(version),
  ) || null
}
