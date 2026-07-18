const REQUIRED_SURFACES = ['workspace', 'signer_portal']
const REQUIRED_PACKET_TYPES = ['mandate', 'otp']
const REQUIRED_VIEWPORTS = ['desktop', 'mobile']

function blocker(code, detail, solution, scenarioId = null) {
  return { code, detail, solution, scenarioId }
}

export function assessDocumentBrowserExperience({ journeys = [], telemetry = {} } = {}) {
  const rows = Array.isArray(journeys) ? journeys : []
  const blockers = []
  for (const row of rows) {
    const id = row?.id || 'unknown-browser-scenario'
    if (!row?.loaded) blockers.push(blocker('N2_PAGE_NOT_RENDERED', `${id} did not render the document experience.`, 'Fix the browser route or runtime render failure and rerun N2.', id))
    for (const area of ['journey', 'guidance', 'actions', 'responsibility', 'help']) {
      if (!row?.[area]) blockers.push(blocker('N2_CORE_UI_MISSING', `${id} is missing its ${area} surface.`, `Restore the ${area} component before browser rollout.`, id))
    }
    if (row?.viewport === 'mobile' && !row?.mobileAction) blockers.push(blocker('N2_MOBILE_ACTION_MISSING', `${id} has no visible mobile primary action.`, 'Restore the M2 dock at mobile width.', id))
    if (!row?.keyboardSkip) blockers.push(blocker('N2_KEYBOARD_SKIP_FAILED', `${id} cannot reach visible skip navigation by keyboard.`, 'Restore M3 skip links and focusable landmarks.', id))
    if (!row?.interactionPassed) blockers.push(blocker('N2_PRIMARY_INTERACTION_FAILED', `${id} could not complete its send or signing confirmation.`, 'Repair the primary action, confirmation, and outcome chain.', id))
    if (!row?.outcome) blockers.push(blocker('N2_OUTCOME_NOT_RENDERED', `${id} did not render an outcome receipt.`, 'Restore M5 outcome feedback after the browser action.', id))
    if (Number(row?.horizontalOverflowPx || 0) > 1) blockers.push(blocker('N2_HORIZONTAL_OVERFLOW', `${id} overflows horizontally by ${row.horizontalOverflowPx}px.`, 'Correct responsive widths at this viewport.', id))
    if (!row?.accessibleControls) blockers.push(blocker('N2_UNNAMED_CONTROL', `${id} contains a visible unnamed button or link.`, 'Add an accessible name to every interactive control.', id))
  }
  const surfaces = [...new Set(rows.map((row) => row.surface))]
  const packetTypes = [...new Set(rows.map((row) => row.packetType))]
  const viewports = [...new Set(rows.map((row) => row.viewport))]
  for (const surface of REQUIRED_SURFACES) if (!surfaces.includes(surface)) blockers.push(blocker('N2_SURFACE_COVERAGE_MISSING', `${surface} has no browser scenario.`, `Add a rendered ${surface} scenario.`))
  for (const packetType of REQUIRED_PACKET_TYPES) if (!packetTypes.includes(packetType)) blockers.push(blocker('N2_DOCUMENT_COVERAGE_MISSING', `${packetType} has no browser scenario.`, `Add rendered ${packetType} coverage.`))
  for (const viewport of REQUIRED_VIEWPORTS) if (!viewports.includes(viewport)) blockers.push(blocker('N2_VIEWPORT_COVERAGE_MISSING', `${viewport} has no browser scenario.`, `Add a ${viewport} viewport scenario.`))
  for (const message of telemetry.pageErrors || []) blockers.push(blocker('N2_BROWSER_RUNTIME_ERROR', String(message).slice(0, 240), 'Fix the uncaught browser error and rerun N2.'))
  for (const message of telemetry.consoleErrors || []) blockers.push(blocker('N2_BROWSER_CONSOLE_ERROR', String(message).slice(0, 240), 'Fix the browser console error and rerun N2.'))
  return {
    contract: 'arch9-document-browser-experience-v1',
    status: blockers.length ? 'BROWSER_EXPERIENCE_BLOCKED' : 'READY_FOR_N3',
    ready: blockers.length === 0,
    mutatedData: false,
    coverage: { surfaces, packetTypes, viewports, scenarioCount: rows.length, passedScenarioCount: rows.filter((row) => row.interactionPassed).length },
    blockers,
  }
}
