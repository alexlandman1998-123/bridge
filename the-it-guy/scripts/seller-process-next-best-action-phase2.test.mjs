import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildKingstonsSellerProcessActionModel } from '../src/services/sellerProcessActionModelService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const agencyPipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')

{
  const model = buildKingstonsSellerProcessActionModel({
    sellerProcessProfile: 'kingstons_residential',
    lead: {
      status: 'Contacted',
      stage: 'Contacted',
    },
  })

  assert.equal(model.visible, true)
  assert.equal(model.currentAction?.key, 'schedule_valuation_appointment')
  assert.equal(model.currentAction?.label, 'Schedule Valuation Appointment')
  assert.equal(model.currentAction?.appointmentType, 'seller_valuation')
}

{
  const defaultModel = buildKingstonsSellerProcessActionModel({
    lead: {
      status: 'Contacted',
      stage: 'Contacted',
    },
  })

  assert.equal(defaultModel.visible, false)
  assert.equal(defaultModel.canReplaceGlobalNextBestAction, false)
  assert.equal(defaultModel.currentAction, null)
}

{
  assert.match(
    agencyPipelineSource,
    /import \{ buildKingstonsSellerProcessActionModel \} from '..\/..\/services\/sellerProcessActionModelService'/,
  )
  assert.match(
    agencyPipelineSource,
    /const selectedKingstonsSellerProcessActionModel = useMemo\(\(\) => buildKingstonsSellerProcessActionModel\(\{/,
  )
  assert.match(agencyPipelineSource, /const selectedSellerNextBestAction = useMemo\(\(\) => \{/)
  assert.match(agencyPipelineSource, /selectedKingstonsSellerProcessActionModel\?\.canReplaceGlobalNextBestAction/)
  assert.match(agencyPipelineSource, /source: 'kingstons_seller_process'/)
  assert.match(agencyPipelineSource, /source: 'default_seller_readiness'/)
}

{
  assert.match(agencyPipelineSource, /\{selectedSellerNextBestAction\.label\}/)
  assert.match(agencyPipelineSource, /\{selectedSellerNextBestAction\.description\}/)
  assert.match(agencyPipelineSource, /handleSellerJourneyAction\(selectedSellerNextBestAction\.id\)/)
  assert.match(agencyPipelineSource, /disabled=\{selectedSellerNextBestAction\.disabled\}/)
  assert.match(agencyPipelineSource, /data-testid="seller-next-best-action-button"/)
}

{
  assert.match(agencyPipelineSource, /Next best action is now Schedule Valuation Appointment/)
  assert.match(agencyPipelineSource, /id === 'resend_valuation_presentation'/)
  assert.match(agencyPipelineSource, /handleOpenKingstonsSellerAppointment\('valuation_presentation', \{ resend: true \}\)/)
  assert.match(agencyPipelineSource, /handleScheduleSellerAppointment\('seller_valuation'\)/)
  assert.match(agencyPipelineSource, /handleScheduleSellerAppointment\('valuation_presentation'\)/)
}

{
  assert.doesNotMatch(agencyPipelineSource, /sellerReadinessService.*kingston/i)
  assert.equal(
    packageJson.scripts?.['test:seller-process-next-best-action-phase2'],
    'node scripts/seller-process-next-best-action-phase2.test.mjs',
  )
}

console.log('seller process next best action Phase 2 contract passed')
