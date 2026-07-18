import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDocumentBrowserExperience } from '../documentBrowserExperienceAssessment.js'

const complete = (id, surface, packetType, viewport) => ({ id, surface, packetType, viewport, loaded: true, journey: true, guidance: true, actions: true, responsibility: true, help: true, mobileAction: viewport === 'mobile', keyboardSkip: true, interactionPassed: true, outcome: true, horizontalOverflowPx: 0, accessibleControls: true })

test('certifies complete desktop and mobile browser coverage', () => {
  const result = assessDocumentBrowserExperience({ journeys: [complete('a', 'workspace', 'mandate', 'desktop'), complete('b', 'signer_portal', 'otp', 'mobile')] })
  assert.equal(result.status, 'READY_FOR_N3')
  assert.equal(result.mutatedData, false)
})

test('returns a workable mobile-overflow blocker', () => {
  const broken = { ...complete('mobile', 'signer_portal', 'otp', 'mobile'), horizontalOverflowPx: 24 }
  const result = assessDocumentBrowserExperience({ journeys: [complete('desktop', 'workspace', 'mandate', 'desktop'), broken] })
  const issue = result.blockers.find((row) => row.code === 'N2_HORIZONTAL_OVERFLOW')
  assert.match(issue.solution, /responsive widths/i)
})

test('blocks unnamed controls and failed confirmation outcomes', () => {
  const broken = { ...complete('desktop', 'workspace', 'mandate', 'desktop'), accessibleControls: false, interactionPassed: false, outcome: false }
  const result = assessDocumentBrowserExperience({ journeys: [broken, complete('mobile', 'signer_portal', 'otp', 'mobile')] })
  assert.ok(result.blockers.some((row) => row.code === 'N2_UNNAMED_CONTROL'))
  assert.ok(result.blockers.some((row) => row.code === 'N2_PRIMARY_INTERACTION_FAILED'))
})

test('blocks runtime and console failures', () => {
  const result = assessDocumentBrowserExperience({ journeys: [complete('a', 'workspace', 'mandate', 'desktop'), complete('b', 'signer_portal', 'otp', 'mobile')], telemetry: { pageErrors: ['render failed'], consoleErrors: ['bad state'] } })
  assert.ok(result.blockers.some((row) => row.code === 'N2_BROWSER_RUNTIME_ERROR'))
  assert.ok(result.blockers.some((row) => row.code === 'N2_BROWSER_CONSOLE_ERROR'))
})
