import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
  resolveSellerProcessProfile,
} from '../src/services/sellerProcessProfileService.js'

const appRoot = resolve(import.meta.dirname, '..')
const pageSource = readFileSync(resolve(appRoot, 'src/pages/AgentLeadsPage.jsx'), 'utf8')
const phase8Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase8-gated-workspace-panel.md'), 'utf8')
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

{
  const nameOnly = resolveSellerProcessProfile({
    organisation: {
      name: 'Kingstons Real Estate',
    },
  })
  assert.equal(nameOnly.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(nameOnly.isKingstons, false)
}

{
  const explicitProfile = resolveSellerProcessProfile({
    organisationSettings: {
      sellerProcess: {
        profile: 'kingstons_residential',
      },
    },
  })
  assert.equal(explicitProfile.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(explicitProfile.isKingstons, true)
}

{
  assert.match(pageSource, /useOptionalOrganisation/)
  assert.match(pageSource, /resolveSellerProcessProfile/)
  assert.match(pageSource, /buildSellerProcessWorkspacePanelModel/)
  assert.match(pageSource, /const includeSellerProcessShadowIntegration = sellerProcessProfileResolution\.isKingstons === true/)
  assert.match(pageSource, /includeSellerProcessShadowIntegration,\s*\n\s*sellerProcessProfile: sellerProcessProfileResolution\.profile,\s*\n\s*organisationSettings,/)
  assert.match(pageSource, /const sellerProcessPanelModel = useMemo\(\(\) => buildSellerProcessWorkspacePanelModel\(data \|\| {}\), \[data\]\)/)
  assert.match(pageSource, /const hasKingstonsSellerProcess = sellerProcessPanelModel\?\.visible === true/)
  assert.match(pageSource, /<KingstonsNextBestActionCard model=\{sellerProcessPanelModel\} onAction=\{handleAcquisitionAction\} \/>/)
  assert.match(pageSource, /<SellerProcessShadowPanel model=\{sellerProcessPanelModel\} onAction=\{handleAcquisitionAction\} \/>/)
  assert.match(pageSource, /sellerProcessPanelModel={sellerProcessPanelModel}/)
  assert.equal(
    pageSource.includes("includeSellerProcessShadowIntegration: true"),
    false,
    'workspace fetch must not hard-code the shadow integration on',
  )
  assert.equal(
    pageSource.includes('sellerProcessWorkspaceIntegrationService'),
    false,
    'AgentLeadsPage must not bypass the Phase 6 fetch gate helper',
  )
}

{
  const panelStart = pageSource.indexOf('function SellerProcessShadowPanel')
  assert.notEqual(panelStart, -1, 'SellerProcessShadowPanel should exist')
  const panelEnd = pageSource.indexOf('function SellerListingFact', panelStart)
  const panelSource = pageSource.slice(panelStart, panelEnd)
  assert.match(panelSource, /if \(!model\?\.visible\) return null/)
  assert.match(panelSource, /StatusPill tone="green">Active Profile/)
  assert.match(panelSource, /onClick=\{\(\) => onAction\?\.\(card\.key\)\}/)
  assert.match(panelSource, /disabled=\{!onAction \|\| card\.disabled === true\}/)
  assert.doesNotMatch(panelSource, /onSaved/)
  assert.doesNotMatch(panelSource, /createAppointmentAsync/)
  assert.doesNotMatch(panelSource, /uploadPrivateListingDocument/)
  assert.doesNotMatch(panelSource, /updatePrivateListing/)
  assert.doesNotMatch(panelSource, /sendSellerOnboarding/)
}

{
  const cardStart = pageSource.indexOf('function KingstonsNextBestActionCard')
  assert.notEqual(cardStart, -1, 'Kingstons next best action card should exist')
  const cardEnd = pageSource.indexOf('function SellerReadinessScoreCard', cardStart)
  const cardSource = pageSource.slice(cardStart, cardEnd)
  assert.match(cardSource, /getKingstonsNextActionMeta\(model\)/)
  assert.match(cardSource, /onClick=\{\(\) => onAction\?\.\(meta\.actionId\)\}/)
  assert.match(cardSource, /Kingstons Next Best Action/)
  assert.doesNotMatch(cardSource, /SellerAcquisitionActionRow/)
}

{
  for (const file of liveNonWorkspaceSources) {
    const source = readFileSync(resolve(appRoot, file), 'utf8')
    assert.equal(
      source.includes('sellerProcessWorkspacePanelService'),
      false,
      `${file} must not consume the workspace panel model`,
    )
    assert.equal(
      source.includes('includeSellerProcessShadowIntegration'),
      false,
      `${file} must not request the Kingston shadow workspace payload`,
    )
  }
}

{
  assert.match(phase8Doc, /Phase 8 mounts the Kingston seller process panel/)
  assert.match(phase8Doc, /requests the Phase 6 shadow payload only when/)
  assert.match(phase8Doc, /Organisation name alone still does not activate/)
  assert.match(phase8Doc, /does not:\n\n- write lead/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-workspace-panel-phase8'],
    'node scripts/seller-process-workspace-panel-phase8.test.mjs',
  )
}

console.log('seller process workspace panel Phase 8 contract passed')
