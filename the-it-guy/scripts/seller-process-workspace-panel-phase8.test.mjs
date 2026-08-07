import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
  resolveSellerProcessProfile,
  resolveSellerProcessProfileForOrganisation,
} from '../src/services/sellerProcessProfileService.js'

const appRoot = resolve(import.meta.dirname, '..')
const pageSource = readFileSync(resolve(appRoot, 'src/pages/AgentLeadsPage.jsx'), 'utf8')
const pipelinePageSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
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
  assert.equal(resolveSellerProcessProfileForOrganisation({
    organisationId: 'ec19d0a6-bcba-4eef-aa72-9972de88204d',
  }).isKingstons, true)
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
  assert.match(pageSource, /getLeadWorkspaceOrganisationId\(location\.state\?\.leadWorkspace\)/)
  assert.match(pageSource, /resolveSellerProcessProfileForOrganisation/)
  assert.match(pageSource, /buildSellerProcessWorkspacePanelModel/)
  assert.match(pageSource, /const includeSellerProcessShadowIntegration = sellerProcessProfileResolution\.isKingstons === true/)
  assert.match(pageSource, /organisationId,\s*\n\s*organisationSettings,/)
  assert.match(pageSource, /includeSellerProcessShadowIntegration,\s*\n\s*sellerProcessProfile: sellerProcessProfileResolution\.profile,\s*\n\s*organisationSettings,/)
  assert.match(pageSource, /const baseSellerProcessPanelModel = useMemo\(\(\) => buildSellerProcessWorkspacePanelModel\(data \|\| {}\), \[data\]\)/)
  assert.match(pageSource, /function hasKingstonsSellerWorkspaceSignal\(workspace = {}\)/)
  assert.match(pageSource, /KINGSTONS_SELLER_PROCESS_ORGANISATION_IDS\.includes\(explicitOrganisationId\)/)
  assert.match(pageSource, /JSON\.stringify\(workspace\)\.toLowerCase\(\)/)
  assert.match(pageSource, /workspace\?\.actor\?\.email/)
  assert.match(pageSource, /currentMembership: workspaceContext\.currentMembership/)
  assert.match(pageSource, /sellerProcessProfile: KINGSTONS_SELLER_PROCESS_PROFILE/)
  assert.match(pageSource, /const hasKingstonsSellerProcess = sellerProcessPanelModel\?\.visible === true/)
  assert.match(pageSource, /<KingstonsNextBestActionCard model=\{sellerProcessPanelModel\} onAction=\{handleAcquisitionAction\} \/>/)
  assert.match(pageSource, /<SellerProcessShadowPanel model=\{sellerProcessPanelModel\} onAction=\{handleAcquisitionAction\} \/>/)
  assert.match(pageSource, /sellerProcessPanelModel={sellerProcessPanelModel}/)
  assert.match(pipelinePageSource, /buildSellerProcessWorkspacePanelModel/)
  assert.match(pipelinePageSource, /hasKingstonsPipelineSignal/)
  assert.match(pipelinePageSource, /selectedLeadHasKingstonsSellerProcess/)
  assert.match(pipelinePageSource, /Kingstons Seller Process/)
  assert.match(pipelinePageSource, /schedule_valuation_appointment/)
  assert.match(pipelinePageSource, /schedule_valuation_presentation/)
  {
    const actionStart = pipelinePageSource.indexOf('const selectedKingstonsProcessAction = useMemo(')
    assert.notEqual(actionStart, -1, 'selectedKingstonsProcessAction should exist')
    const actionEnd = pipelinePageSource.indexOf('const selectedKingstonsRailSteps = useMemo', actionStart)
    assert.notEqual(actionEnd, -1, 'selectedKingstonsRailSteps should follow selectedKingstonsProcessAction')
    const actionSource = pipelinePageSource.slice(actionStart, actionEnd)
    assert.match(actionSource, /const action = getKingstonsPipelineActionMeta\(selectedSellerProcessPanelModel \|\| \{\}\)/)
    assert.doesNotMatch(actionSource, /if \(!selectedKingstonsSellerPackSummary\.complete\)/)
    assert.match(actionSource, /if \(\['complete_seller_pack', 'seller_pack_signed'\]\.includes\(action\.actionId\)\)/)
  }
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
