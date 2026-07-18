function text(value) { return typeof value === 'string' ? value.trim() : '' }

export function assessDocumentGeneratorBrowserUsability({ g1 = {}, journeys = [], telemetry = {} } = {}) {
  const blockers = []
  if (g1.status !== 'READY_FOR_G2' || g1.ready !== true) blockers.push({ code: 'G2_G1_NOT_READY', solution: 'Complete the G1 launch chain before browser verification.' })
  const rows = Array.isArray(journeys) ? journeys : []
  for (const type of ['otp', 'mandate']) for (const viewport of ['desktop', 'mobile']) {
    const row = rows.find((item) => item.packetType === type && item.viewport === viewport)
    if (!row) blockers.push({ code: 'G2_JOURNEY_MISSING', packetType: type, viewport, solution: `Run the ${type} completed-document journey at the ${viewport} viewport.` })
    else {
      if (!row.finalStateVisible || !row.completedEverywhereVisible) blockers.push({ code: 'G2_COMPLETION_STATE_UNCLEAR', packetType: type, viewport, solution: 'Restore the finalized and completed-everywhere status language.' })
      if (!row.downloadVisible || !row.downloadVerifiedPdf) blockers.push({ code: 'G2_DOWNLOAD_INVALID', packetType: type, viewport, solution: 'Restore a working secure PDF download from the finalized record.' })
      if (!row.accessibleControls) blockers.push({ code: 'G2_ACCESSIBILITY_INVALID', packetType: type, viewport, solution: 'Give every visible link and button an accessible name.' })
      if (Number(row.horizontalOverflowPx || 0) > 2) blockers.push({ code: 'G2_RESPONSIVE_OVERFLOW', packetType: type, viewport, solution: 'Remove horizontal overflow from the legal-document workspace.' })
      if (row.unexpectedRetryVisible) blockers.push({ code: 'G2_FALSE_RECOVERY_ACTION', packetType: type, viewport, solution: 'Do not show Retry completion after the cross-surface receipt and deliveries are complete.' })
    }
  }
  if ((telemetry.pageErrors || []).length || (telemetry.http5xx || []).length) blockers.push({ code: 'G2_RUNTIME_ERRORS', solution: 'Resolve browser exceptions and application HTTP 5xx responses before rollout.' })
  return { ready: blockers.length === 0, blockers, journeyCount: rows.length, summary: text(g1.status) }
}
