import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const partnerService = await server.ssrLoadModule('/src/services/bondPartnerManagementService.js')
  const routingService = await server.ssrLoadModule('/src/services/bondRoutingRulesService.js')
  partnerService.__bondPartnerManagementServiceTestUtils.clearStores()
  routingService.__bondRoutingRulesServiceTestUtils.clearStores()

  const workspaceId = 'workspace-partners'
  const regions = [
    { id: 'region-gauteng', name: 'Gauteng' },
    { id: 'region-cape', name: 'Western Cape' },
  ]
  const branches = [
    { id: 'branch-east', name: 'East Rand Branch', regionId: 'region-gauteng' },
    { id: 'branch-cape', name: 'Cape Branch', regionId: 'region-cape' },
  ]
  const consultants = [
    { id: 'consultant-east', user_id: 'consultant-east', name: 'Sarah Jacobs', branchId: 'branch-east', regionId: 'region-gauteng', workspaceRole: 'consultant' },
    { id: 'consultant-cape', user_id: 'consultant-cape', name: 'Cape Owner', branchId: 'branch-cape', regionId: 'region-cape', workspaceRole: 'consultant' },
  ]
  const applications = [
    {
      id: 'app-1',
      partnerId: 'partner-agency',
      partnerName: 'Harcourts Bedfordview',
      assignedRegionId: 'region-gauteng',
      assignedBranchId: 'branch-east',
      assignedUserId: 'consultant-east',
      status: 'active',
      financeStageLabel: 'Bank Feedback',
      createdAt: '2026-05-01T08:00:00.000Z',
      lastActivityAt: '2026-05-10T08:00:00.000Z',
    },
    {
      id: 'app-2',
      partnerName: 'Harcourts Bedfordview',
      assignedRegionId: 'region-gauteng',
      assignedBranchId: 'branch-east',
      assignedUserId: 'consultant-east',
      status: 'approved',
      financeStageLabel: 'Approved',
      createdAt: '2026-05-02T08:00:00.000Z',
      lastActivityAt: '2026-05-12T08:00:00.000Z',
    },
    {
      id: 'app-3',
      partnerName: 'Cape Referral Co',
      assignedRegionId: 'region-cape',
      assignedBranchId: 'branch-cape',
      assignedUserId: 'consultant-cape',
      status: 'active',
      financeStageLabel: 'Docs Collection',
      createdAt: '2026-05-04T08:00:00.000Z',
      lastActivityAt: '2026-05-08T08:00:00.000Z',
    },
  ]

  function makeContext({
    userId = 'hq-owner',
    workspaceRole = 'owner',
    scopeLevel = 'workspace_hq',
    regionId = '',
    workspaceUnitId = '',
  } = {}) {
    return {
      appRole: 'bond_originator',
      workspaceType: 'bond_originator',
      userId,
      profile: { id: userId, email: `${userId}@example.test` },
      currentWorkspace: { id: workspaceId, type: 'bond_originator' },
      currentMembership: {
        id: `membership-${userId}`,
        status: 'active',
        user_id: userId,
        organisation_id: workspaceId,
        workspaceRole,
        workspace_role: workspaceRole,
        scopeLevel,
        scope_level: scopeLevel,
        regionId,
        region_id: regionId,
        workspaceUnitId,
        workspace_unit_id: workspaceUnitId,
      },
    }
  }

  const hqContext = makeContext()
  const commonOptions = { regions, branches, consultants, applications, forceLocal: true }

  const partner = await partnerService.createBondPartner({
    id: 'partner-agency',
    name: 'Harcourts Bedfordview',
    type: 'agency',
    primaryContactName: 'Agency Principal',
    primaryContactEmail: 'principal@harcourts.example',
    defaultRegionId: 'region-gauteng',
    defaultBranchId: 'branch-east',
    status: 'draft',
  }, hqContext, workspaceId, commonOptions)
  assert.equal(partner.name, 'Harcourts Bedfordview')

  const edited = await partnerService.updateBondPartner(partner.id, {
    ...partner,
    notes: 'Strategic estate agency partner',
    status: 'active',
  }, hqContext, workspaceId, commonOptions)
  assert.equal(edited.notes, 'Strategic estate agency partner')

  const invite = await partnerService.inviteBondPartner(partner.id, 'partner@harcourts.example', hqContext, workspaceId, commonOptions)
  assert.equal(invite.status, 'pending')
  const resent = await partnerService.resendBondPartnerInvite(invite.id, hqContext, workspaceId, commonOptions)
  assert.equal(resent.status, 'pending')
  const cancelled = await partnerService.cancelBondPartnerInvite(resent.id, hqContext, workspaceId, commonOptions)
  assert.equal(cancelled.status, 'cancelled')

  const acceptedInvite = await partnerService.inviteBondPartner(partner.id, 'accept@harcourts.example', hqContext, workspaceId, commonOptions)
  const accepted = await partnerService.acceptBondPartnerInvite(acceptedInvite.token, hqContext, workspaceId, commonOptions)
  assert.equal(accepted.status, 'accepted')
  assert.equal(partnerService.__bondPartnerManagementServiceTestUtils.getPartners(workspaceId).find((row) => row.id === partner.id).status, 'active')

  const routed = await partnerService.setPartnerRoutingDefaults(partner.id, {
    defaultRegionId: 'region-gauteng',
    defaultBranchId: 'branch-east',
    defaultConsultantId: 'consultant-east',
  }, hqContext, workspaceId, commonOptions)
  assert.equal(routed.defaultBranchId, 'branch-east')
  assert.ok(routed.routingRuleId)
  let rules = routingService.__bondRoutingRulesServiceTestUtils.getRules(workspaceId)
  assert.equal(rules.length, 1)
  assert.equal(rules[0].ruleType, 'agency')
  assert.equal(rules[0].sourceId, partner.id)

  const updatedRouting = await partnerService.setPartnerRoutingDefaults(partner.id, {
    defaultRegionId: 'region-gauteng',
    defaultBranchId: 'branch-east',
    defaultConsultantId: '',
  }, hqContext, workspaceId, { ...commonOptions, routingRules: rules })
  assert.equal(updatedRouting.defaultConsultantId, '')
  rules = routingService.__bondRoutingRulesServiceTestUtils.getRules(workspaceId)
  assert.equal(rules[0].consultantId, '')

  const cleared = await partnerService.setPartnerRoutingDefaults(partner.id, {
    defaultRegionId: '',
    defaultBranchId: '',
    defaultConsultantId: '',
  }, hqContext, workspaceId, { ...commonOptions, routingRules: rules })
  assert.equal(cleared.routingRuleId, '')
  rules = routingService.__bondRoutingRulesServiceTestUtils.getRules(workspaceId)
  assert.equal(rules[0].status, 'disabled')

  const referral = await partnerService.createBondPartner({
    id: 'partner-referral',
    name: 'Cape Referral Co',
    type: 'referral_partner',
    defaultRegionId: 'region-cape',
    defaultBranchId: 'branch-cape',
    defaultConsultantId: 'consultant-cape',
    status: 'active',
  }, hqContext, workspaceId, commonOptions)
  assert.equal(referral.type, 'referral_partner')

  const hqPartners = partnerService.getBondPartners(hqContext, workspaceId, commonOptions)
  assert.equal(hqPartners.length, 2)
  assert.equal(hqPartners.find((row) => row.id === partner.id).applicationsSent, 2)
  assert.equal(hqPartners.find((row) => row.id === partner.id).approvalRate, 50)

  const workspace = partnerService.getBondPartnerWorkspace(partner.id, hqContext, workspaceId, commonOptions)
  assert.equal(workspace.partner.name, 'Harcourts Bedfordview')
  assert.equal(workspace.applications.length, 2)
  assert.ok(workspace.recentActivity.some((row) => row.eventType === partnerService.BOND_PARTNER_ACTIVITY_EVENTS.routingDefaultUpdated))

  const regionalContext = makeContext({ userId: 'regional-manager', workspaceRole: 'regional_manager', scopeLevel: 'region', regionId: 'region-gauteng' })
  const regionalPartners = partnerService.getBondPartners(regionalContext, workspaceId, commonOptions)
  assert.equal(regionalPartners.length, 1)
  assert.equal(regionalPartners[0].name, 'Harcourts Bedfordview')
  await assert.rejects(
    () => partnerService.createBondPartner({ name: 'Blocked Agency', type: 'agency' }, regionalContext, workspaceId, commonOptions),
    /permission/,
  )

  const branchContext = makeContext({ userId: 'branch-manager', workspaceRole: 'branch_manager', scopeLevel: 'branch', workspaceUnitId: 'branch-east' })
  const branchPartners = partnerService.getBondPartners(branchContext, workspaceId, commonOptions)
  assert.equal(branchPartners.length, 1)
  assert.equal(branchPartners[0].id, partner.id)

  const consultantContext = makeContext({ userId: 'consultant-east', workspaceRole: 'consultant', scopeLevel: 'assigned', workspaceUnitId: 'branch-east' })
  const consultantPartners = partnerService.getBondPartners(consultantContext, workspaceId, commonOptions)
  assert.equal(consultantPartners.length, 1)
  assert.equal(consultantPartners[0].id, partner.id)

  assert.ok(partnerService.__bondPartnerManagementServiceTestUtils.getActivity(workspaceId).some((row) => row.eventType === partnerService.BOND_PARTNER_ACTIVITY_EVENTS.created))
  assert.ok(partnerService.__bondPartnerManagementServiceTestUtils.getActivity(workspaceId).some((row) => row.eventType === partnerService.BOND_PARTNER_ACTIVITY_EVENTS.invited))
  assert.ok(partnerService.__bondPartnerManagementServiceTestUtils.getNotifications(workspaceId).some((row) => row.type === partnerService.BOND_PARTNER_ACTIVITY_EVENTS.accepted))

  console.log('bondPartnerManagementService tests passed')
} finally {
  await server.close()
}
