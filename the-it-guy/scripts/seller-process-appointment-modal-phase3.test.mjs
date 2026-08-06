import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getAppointmentTypeLabel } from '../src/lib/appointmentTypeDefinitions.js'
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
  assert.equal(valuationTemplate.type, 'seller_valuation')
  assert.equal(valuationTemplate.label, 'Valuation Appointment')
  assert.equal(valuationTemplate.linkedWorkflow, 'kingstons_seller_process')
  assert.equal(valuationTemplate.linkedWorkflowStage, 'valuation_appointment_scheduled')
  assert.equal(getAppointmentTypeLabel('seller_valuation'), 'Valuation Appointment')
}

{
  const presentationTemplate = getAppointmentTypeTemplate('valuation_presentation')
  assert.equal(presentationTemplate.type, 'valuation_presentation')
  assert.equal(presentationTemplate.label, 'Valuation Presentation')
  assert.equal(presentationTemplate.linkedWorkflow, 'kingstons_seller_process')
  assert.equal(presentationTemplate.linkedWorkflowStage, 'valuation_presentation_scheduled')
  assert.equal(getAppointmentTypeLabel('valuation_presentation'), 'Valuation Presentation')
}

{
  assert.match(agencyPipelineSource, /const KINGSTONS_SELLER_PROCESS_APPOINTMENT_TYPES = new Set\(\[/)
  assert.match(agencyPipelineSource, /'seller_valuation'/)
  assert.match(agencyPipelineSource, /'valuation_presentation'/)
  assert.match(agencyPipelineSource, /const selectedAppointmentTypeOptions = useMemo\(\(\) => \{/)
  assert.match(agencyPipelineSource, /Boolean\(selectedKingstonsSellerProcessActionModel\?\.visible\)/)
  assert.match(agencyPipelineSource, /KINGSTONS_SELLER_PROCESS_APPOINTMENT_TYPES\.has\(currentType\)/)
  assert.match(agencyPipelineSource, /selectedAppointmentTypeOptions\.map\(\(option\) =>/)
}

{
  const scheduleSource = sliceFunction(agencyPipelineSource, 'handleScheduleSellerAppointment', 'const sellerPreferredAttorneyCacheKey')
  assert.match(scheduleSource, /setSelectedAppointmentId\(''\)/)
  assert.match(scheduleSource, /selectedKingstonsSellerProcessActionModel\?\.visible/)
  assert.match(scheduleSource, /KINGSTONS_SELLER_PROCESS_APPOINTMENT_TYPES\.has\(resolvedAppointmentType\)/)
  assert.match(scheduleSource, /buildKingstonsSellerAppointmentParticipants/)
  assert.match(scheduleSource, /linkedWorkflow: isKingstonsSellerAppointment \? 'kingstons_seller_process'/)
  assert.match(scheduleSource, /linkedWorkflowStage: isKingstonsSellerAppointment \? kingstonsStageKey/)
  assert.match(scheduleSource, /sellerProcessProfile: 'kingstons_residential'/)
  assert.match(scheduleSource, /evidenceKey: kingstonsEvidenceKey/)
  assert.match(scheduleSource, /sendInviteEmails: true/)
  assert.match(scheduleSource, /attachCalendarInvite: true/)
  assert.match(scheduleSource, /notifyCreatorOnRsvp: true/)
  assert.match(scheduleSource, /participants: isKingstonsSellerAppointment \? kingstonsParticipants/)
}

{
  assert.match(agencyPipelineSource, /handleScheduleSellerAppointment\('seller_valuation'\)/)
  assert.match(agencyPipelineSource, /handleScheduleSellerAppointment\('valuation_presentation'\)/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-appointment-modal-phase3'],
    'node scripts/seller-process-appointment-modal-phase3.test.mjs',
  )
}

console.log('seller process appointment modal Phase 3 contract passed')
