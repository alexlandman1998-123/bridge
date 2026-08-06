import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getAppointmentTypeTemplate } from '../src/services/appointmentTemplateService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const agencyPipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')

function sliceFunction(source, functionName, nextMarker) {
  const start = source.indexOf(`function ${functionName}`)
  assert.notEqual(start, -1, `${functionName} should exist`)
  const end = nextMarker ? source.indexOf(nextMarker, start) : source.length
  assert.notEqual(end, -1, `${nextMarker} should exist after ${functionName}`)
  return source.slice(start, end)
}

{
  const valuationTemplate = getAppointmentTypeTemplate('seller_valuation')
  const presentationTemplate = getAppointmentTypeTemplate('valuation_presentation')

  assert.equal(valuationTemplate.type, 'seller_valuation')
  assert.equal(valuationTemplate.linkedWorkflow, 'kingstons_seller_process')
  assert.equal(valuationTemplate.linkedWorkflowStage, 'valuation_appointment_scheduled')

  assert.equal(presentationTemplate.type, 'valuation_presentation')
  assert.equal(presentationTemplate.linkedWorkflow, 'kingstons_seller_process')
  assert.equal(presentationTemplate.linkedWorkflowStage, 'valuation_presentation_scheduled')
}

{
  assert.match(agencyPipelineSource, /const KINGSTONS_SELLER_PROCESS_APPOINTMENT_TERMINAL_STATUSES = new Set\(\[/)
  assert.match(agencyPipelineSource, /const selectedKingstonsSellerAppointmentsByType = useMemo\(\(\) => \{/)
  assert.match(agencyPipelineSource, /KINGSTONS_SELLER_PROCESS_APPOINTMENT_TYPES\.has\(appointmentType\)/)
  assert.match(agencyPipelineSource, /KINGSTONS_SELLER_PROCESS_APPOINTMENT_TERMINAL_STATUSES\.has\(status\)/)
  assert.match(agencyPipelineSource, /parseAppointmentDate\(existing\)\?\.getTime\(\)/)
}

{
  const openExistingSource = sliceFunction(agencyPipelineSource, 'handleOpenKingstonsSellerAppointment', 'function handleScheduleSellerAppointment')
  assert.match(openExistingSource, /selectedKingstonsSellerProcessActionModel\?\.visible/)
  assert.match(openExistingSource, /selectedKingstonsSellerAppointmentsByType\.get\(resolvedAppointmentType\)/)
  assert.match(openExistingSource, /handleLeadWorkspaceTabSelection\('appointments'\)/)
  assert.match(openExistingSource, /handleOpenAppointmentModal\(existingAppointment\)/)
  assert.match(openExistingSource, /Use Resend Invite to send it again/)
}

{
  const scheduleSource = sliceFunction(agencyPipelineSource, 'handleScheduleSellerAppointment', 'const sellerPreferredAttorneyCacheKey')
  assert.match(scheduleSource, /handleOpenKingstonsSellerAppointment\(resolvedAppointmentType\)/)
  assert.match(scheduleSource, /return/)
  assert.match(scheduleSource, /linkedWorkflow: isKingstonsSellerAppointment \? 'kingstons_seller_process'/)
  assert.match(scheduleSource, /evidenceKey: kingstonsEvidenceKey/)
}

{
  const actionSource = sliceFunction(agencyPipelineSource, 'handleSellerJourneyAction', 'function handleCalendarShift')
  assert.match(actionSource, /id === 'schedule_valuation_appointment'/)
  assert.match(actionSource, /handleScheduleSellerAppointment\('seller_valuation'\)/)
  assert.match(actionSource, /id === 'schedule_valuation_presentation'/)
  assert.match(actionSource, /handleScheduleSellerAppointment\('valuation_presentation'\)/)
  assert.match(actionSource, /id === 'resend_valuation_presentation'/)
  assert.match(actionSource, /handleOpenKingstonsSellerAppointment\('valuation_presentation', \{ resend: true \}\)/)
  assert.match(actionSource, /No valuation presentation appointment was found/)
}

{
  assert.match(agencyPipelineSource, /<Button type="button" variant="secondary" size="sm" onClick=\{handleResendAppointmentInvite\}>Resend Invite<\/Button>/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-appointment-actions-phase4'],
    'node scripts/seller-process-appointment-actions-phase4.test.mjs',
  )
}

console.log('seller process appointment actions Phase 4 contract passed')
