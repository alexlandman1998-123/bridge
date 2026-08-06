import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildKingstonsSellerProcessRailModel } from '../src/services/sellerProcessRailModelService.js'

const appRoot = resolve(import.meta.dirname, '..')
const pageSource = readFileSync(resolve(appRoot, 'src/pages/AgentLeadsPage.jsx'), 'utf8')
const phase4Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase4-appointment-actions.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

function sliceFunction(source, functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}`)
  assert.notEqual(start, -1, `${functionName} should exist`)
  const end = nextFunctionName ? source.indexOf(`function ${nextFunctionName}`, start) : source.length
  assert.notEqual(end, -1, `${nextFunctionName} should exist after ${functionName}`)
  return source.slice(start, end)
}

{
  const model = buildKingstonsSellerProcessRailModel({
    sellerProcessProfile: 'kingstons_residential',
  })
  const appointmentStages = model.stages.filter((stage) => stage.surface === 'appointments')
  assert.deepEqual(appointmentStages.map((stage) => stage.key), [
    'valuation_appointment',
    'valuation_presentation',
  ])
  assert.deepEqual(appointmentStages.map((stage) => stage.appointmentType), [
    'seller_valuation',
    'valuation_presentation',
  ])
  assert.deepEqual(appointmentStages.map((stage) => stage.actionKey), [
    'schedule_valuation_appointment',
    'schedule_valuation_presentation',
  ])
  assert.equal(model.stages.find((stage) => stage.key === 'formal_valuation')?.surface, 'documents')
  assert.equal(model.stages.find((stage) => stage.key === 'formal_valuation')?.actionKey, 'upload_valuation_document')
  assert.equal(model.stages.find((stage) => stage.key === 'seller_pack')?.deferred, true)
}

{
  const railSource = sliceFunction(pageSource, 'KingstonsSellerProcessRail', 'ListingReadinessCircle')
  assert.match(pageSource, /function canTriggerKingstonsRailAppointmentAction\(stage = \{\}\)/)
  assert.match(pageSource, /stage\?\.surface === 'appointments'/)
  assert.match(railSource, /onClick=\{\(\) => onAction\(stage\.actionKey\)\}/)
  assert.match(railSource, /aria-label=\{`Open \$\{stage\.label\}`\}/)
  assert.match(railSource, /canTriggerKingstonsRailAppointmentAction\(stage\) && typeof onAction === 'function'/)
  assert.doesNotMatch(railSource, /createAppointmentAsync/)
  assert.doesNotMatch(railSource, /uploadPrivateListingDocument/)
  assert.doesNotMatch(railSource, /updatePrivateListing/)
}

{
  const layoutSource = sliceFunction(pageSource, 'SellerLeadWorkspaceLayout', 'OwnershipCard')
  assert.match(layoutSource, /<KingstonsSellerProcessRail model=\{kingstonsSellerProcessRailModel\} onAction=\{handleAcquisitionAction\} \/>/)
  assert.match(layoutSource, /key === 'schedule_valuation_appointment'\) openAppointmentComposer\('seller_valuation'\)/)
  assert.match(layoutSource, /key === 'schedule_valuation_presentation'\) openAppointmentComposer\('valuation_presentation'\)/)
  assert.match(layoutSource, /key === 'upload_valuation_document'\) setActiveWorkspaceTab\('documents'\)/)
  assert.match(layoutSource, /key === 'complete_seller_pack'\) setActiveWorkspaceTab\('mandate'\)/)
  assert.match(layoutSource, /key === 'prepare_listing'\) onOpenListing\?\.\(\)/)
}

{
  assert.match(phase4Doc, /Appointment Actions/)
  assert.match(phase4Doc, /Only stages with `surface: 'appointments'`/)
  assert.match(phase4Doc, /does not create appointments directly/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-rail-appointment-actions-phase4'],
    'node scripts/seller-process-rail-appointment-actions-phase4.test.mjs',
  )
}

console.log('seller process rail appointment actions Phase 4 contract passed')
