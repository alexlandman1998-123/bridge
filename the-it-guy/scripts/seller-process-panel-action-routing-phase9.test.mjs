import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const agentLeadsPageSource = readFileSync(resolve(appRoot, 'src/pages/AgentLeadsPage.jsx'), 'utf8')
const pageSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const phase9Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase9-panel-action-routing.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

const liveNonWorkspaceSources = [
  'src/pages/LegalDocumentWorkspacePage.jsx',
  'src/services/privateListingService.js',
  'src/lib/sellerDocumentRequirementEngine.js',
  'src/services/sellerPortalAppointmentsService.js',
  'src/services/clientPortalNotificationsService.js',
  'src/services/principalDashboardService.js',
  'src/lib/privateListingLifecycle.js',
]

function sliceFunction(source, functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}`)
  assert.notEqual(start, -1, `${functionName} should exist`)
  const end = nextFunctionName ? source.indexOf(`function ${nextFunctionName}`, start) : source.length
  assert.notEqual(end, -1, `${nextFunctionName} should exist after ${functionName}`)
  return source.slice(start, end)
}

{
  assert.match(agentLeadsPageSource, /<AgencyPipelinePage initialViewMode="leads" \/>/)
  assert.match(pageSource, /function buildDefaultAppointmentFormForType/)
  assert.match(pageSource, /const title = id === 'schedule_valuation_presentation' \? 'Valuation Presentation' : 'Valuation Appointment'/)
  assert.match(pageSource, /appointmentType,\n\s+title,/)
  assert.match(pageSource, /appointmentThemeTypeKey === 'valuation_presentation'/)
}

{
  assert.match(pageSource, /const selectedSellerProcessPanelModel = useMemo/)
  assert.match(pageSource, /buildSellerProcessWorkspacePanelModel/)
  assert.match(pageSource, /const selectedLeadHasKingstonsSellerProcess = selectedSellerProcessPanelModel\?\.visible === true/)
  assert.match(pageSource, /const selectedKingstonsProcessAction = useMemo/)
  assert.match(pageSource, /getKingstonsPipelineActionMeta\(selectedSellerProcessPanelModel \|\| \{\}\)/)
  assert.match(pageSource, /onClick=\{\(\) => handleSellerJourneyAction\(selectedLeadHasKingstonsSellerProcess \? selectedKingstonsProcessAction\.actionId/)
}

{
  const actionSource = sliceFunction(pageSource, 'handleSellerJourneyAction', 'handleCalendarShift')
  assert.match(actionSource, /id === 'schedule_valuation_appointment' \|\| id === 'schedule_valuation_presentation'/)
  assert.match(actionSource, /appointmentType = id === 'schedule_valuation_presentation' \? 'valuation_presentation' : 'seller_valuation'/)
  assert.match(actionSource, /setAppointmentForm\(buildDefaultAppointmentFormForType\(appointmentType/)
  assert.match(actionSource, /setAppointmentModalOpen\(true\)/)
  assert.match(actionSource, /id === 'upload_valuation_document'/)
  assert.match(actionSource, /formalValuationUploadInputRef\.current\?\.click\?\.\(\)/)
  assert.match(actionSource, /id === 'complete_seller_pack' \|\| id === 'seller_pack_signed'/)
  assert.match(actionSource, /openKingstonsSellerPackWizard\(selectedKingstonsSellerPackSummary\.sellerTypeCaptured \? 'details' : 'type'\)/)
  assert.match(actionSource, /id === 'prepare_listing'/)
  assert.match(actionSource, /handleCreateListingFromSellerLead/)
  assert.doesNotMatch(actionSource, /createAppointmentAsync/)
  assert.doesNotMatch(actionSource, /updatePrivateListing/)
  assert.doesNotMatch(actionSource, /sendSellerOnboarding/)
}

{
  for (const file of liveNonWorkspaceSources) {
    const source = readFileSync(resolve(appRoot, file), 'utf8')
    assert.equal(
      source.includes('schedule_valuation_appointment'),
      false,
      `${file} must not route Kingston seller process panel actions`,
    )
    assert.equal(
      source.includes('valuation_presentation'),
      false,
      `${file} must not add Kingston valuation presentation appointment handling`,
    )
  }
}

{
  assert.match(phase9Doc, /Phase 9 lets the Kingston seller process panel route agents/)
  assert.match(phase9Doc, /does not create appointments, upload documents, generate mandates/)
  assert.match(phase9Doc, /valuation appointment saves still go through the existing/)
  assert.match(phase9Doc, /complete_seller_pack` opens the existing Seller Pack wizard/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-panel-action-routing-phase9'],
    'node scripts/seller-process-panel-action-routing-phase9.test.mjs',
  )
}

console.log('seller process panel action routing Phase 9 contract passed')
