import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const pageSource = readFileSync(resolve(appRoot, 'src/pages/AgentLeadsPage.jsx'), 'utf8')
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
  assert.match(pageSource, /const SELLER_APPOINTMENT_TYPES = \[/)
  assert.match(pageSource, /\{ value: 'seller_valuation', label: 'Valuation Appointment' \}/)
  assert.match(pageSource, /\{ value: 'valuation_presentation', label: 'Valuation Presentation' \}/)
  assert.match(pageSource, /if \(appointmentType === 'seller_valuation'\) return `Valuation Appointment - \$\{personName\}`/)
  assert.match(pageSource, /if \(appointmentType === 'valuation_presentation'\) return `Valuation Presentation - \$\{personName\}`/)
}

{
  const formSource = sliceFunction(pageSource, 'SellerAppointmentForm', 'SellerAppointmentsTab')
  assert.match(formSource, /initialAppointmentType = 'seller_consultation'/)
  assert.match(formSource, /normalizedInitialAppointmentType/)
  assert.match(formSource, /appointmentType: normalizedInitialAppointmentType/)
  assert.match(formSource, /setDraft\(\(previous\) => \{/)
  assert.match(formSource, /getSellerAppointmentDefaultTitle\(normalizedInitialAppointmentType/)
}

{
  const appointmentsTabSource = sliceFunction(pageSource, 'SellerAppointmentsTab', 'getDealOfferNumber')
  assert.match(appointmentsTabSource, /composerAppointmentType = 'seller_consultation'/)
  assert.match(appointmentsTabSource, /initialAppointmentType=\{composerAppointmentType\}/)
}

{
  const panelSource = sliceFunction(pageSource, 'SellerProcessShadowPanel', 'SellerListingFact')
  assert.match(panelSource, /onClick=\{\(\) => onAction\?\.\(card\.key\)\}/)
  assert.match(panelSource, /disabled=\{!onAction\}/)
  assert.match(panelSource, /getSellerProcessPanelActionHint\(card\.key\)/)
  assert.doesNotMatch(panelSource, /createAppointmentAsync/)
  assert.doesNotMatch(panelSource, /uploadPrivateListingDocument/)
  assert.doesNotMatch(panelSource, /updatePrivateListing/)
  assert.doesNotMatch(panelSource, /sendSellerOnboarding/)
}

{
  const layoutSource = sliceFunction(pageSource, 'SellerLeadWorkspaceLayout', 'OwnershipCard')
  assert.match(layoutSource, /const \[appointmentComposerType, setAppointmentComposerType\] = useState\('seller_consultation'\)/)
  assert.match(layoutSource, /openAppointmentComposer = useCallback\(\(appointmentType = 'seller_consultation'\)/)
  assert.match(layoutSource, /setAppointmentComposerType\(nextType\)/)
  assert.match(layoutSource, /key === 'schedule_valuation_appointment'\) openAppointmentComposer\('seller_valuation'\)/)
  assert.match(layoutSource, /key === 'schedule_valuation_presentation'\) openAppointmentComposer\('valuation_presentation'\)/)
  assert.match(layoutSource, /key === 'upload_valuation_document'\) setActiveWorkspaceTab\('documents'\)/)
  assert.match(layoutSource, /key === 'complete_seller_pack'\) setActiveWorkspaceTab\('mandate'\)/)
  assert.match(layoutSource, /key === 'prepare_listing'\) onOpenListing\?\.\(\)/)
  assert.match(layoutSource, /<SellerProcessShadowPanel model=\{sellerProcessPanelModel\} onAction=\{handleAcquisitionAction\} \/>/)
  assert.match(layoutSource, /appointmentComposerType=\{appointmentComposerType\}/)
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
  assert.equal(
    packageJson.scripts?.['test:seller-process-panel-action-routing-phase9'],
    'node scripts/seller-process-panel-action-routing-phase9.test.mjs',
  )
}

console.log('seller process panel action routing Phase 9 contract passed')
