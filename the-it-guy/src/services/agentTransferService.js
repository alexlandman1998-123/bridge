import {
  executeAgentAssetReassignment,
  hasBlockingAgentAssets,
} from './agentOffboardingService'
import { recordSecurityAuditEvent } from './auditLogService'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeAgentId(agent = {}) {
  return normalizeText(agent.userId || agent.user_id || agent.id)
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function countRetainedAssets(summary = {}) {
  return [
    summary.sellerLeads,
    summary.buyerLeads,
    summary.contacts,
    summary.tasks,
    summary.listings,
    summary.activeTransactions,
    summary.appointments,
    summary.documentPackets,
    summary.openDocumentRequests,
    summary.pendingSellerUploads,
  ].reduce((total, value) => total + Number(value || 0), 0)
}

export function buildTransferMembershipReport({ agent = {}, sourceOrganisation = {}, destinationOrganisation = {}, summary = {} } = {}) {
  return {
    currentBehaviour: [
      'Agent identity is separate from organisation membership.',
      'Operational access is granted by an active organisation membership.',
      'Business records are scoped to the originating organisation.',
      'Asset ownership uses assigned/owner fields and can be reassigned without changing created-by attribution.',
    ],
    desiredBehaviour: [
      'Deactivate the source organisation membership after source assets are retained.',
      'Create or send a destination agency invite for future access.',
      'Keep old-agency business assets in the old organisation by default.',
      'Preserve created-by, won-by and originated-by style attribution fields.',
    ],
    gaps: [
      'Strict all-or-nothing transfer execution should move into a database RPC before high-volume production transfers.',
      'Destination agency acceptance remains invitation-led; the source agency cannot silently activate another agency membership.',
    ],
    context: {
      agentUserId: normalizeAgentId(agent),
      agentEmail: normalizeEmail(agent.email),
      sourceOrganisationId: normalizeText(sourceOrganisation.id || agent.organisationId),
      destinationOrganisationId: normalizeText(destinationOrganisation.id),
      retainedAssetCount: countRetainedAssets(summary),
    },
  }
}

export function validateTransferRetentionStrategy({ summary = {}, strategy = {} } = {}) {
  if (!hasBlockingAgentAssets(summary)) return { ok: true, reason: '' }

  const mode = normalizeText(strategy.mode || 'single')
  if (mode === 'branch_pool') {
    const blocked = [
      ['listings', summary.listings],
      ['transactions', summary.activeTransactions],
      ['appointments', summary.appointments],
      ['document packets', summary.documentPackets],
    ].filter(([, count]) => Number(count || 0) > 0)
    if (blocked.length) {
      return {
        ok: false,
        reason: 'Branch pool retention can only be used when the transferring agent has no active listings, transactions, appointments, or document packets.',
      }
    }
    return { ok: true, reason: '' }
  }

  if (mode === 'single') {
    return strategy.defaultAgent?.userId
      ? { ok: true, reason: '' }
      : { ok: false, reason: 'Choose an internal owner to retain source-agency assets.' }
  }

  const required = [
    ['leads', Number(summary.sellerLeads || 0) + Number(summary.buyerLeads || 0)],
    ['listings', summary.listings],
    ['transactions', summary.activeTransactions],
    ['appointments', summary.appointments],
  ]
  const missing = required.filter(([key, count]) => Number(count || 0) > 0 && !strategy.byType?.[key]?.userId)
  if (missing.length) {
    return { ok: false, reason: `Choose retention owners for ${missing.map(([key]) => key).join(', ')}.` }
  }

  return { ok: true, reason: '' }
}

export async function executeAgentTransferRetention({
  organisationId = '',
  agent = {},
  assets = {},
  summary = {},
  strategy = {},
  actor = {},
  reason = 'Agent agency transfer',
  appointmentAction = 'reassign',
  destinationOrganisation = {},
  destinationInvite = null,
} = {}) {
  const validation = validateTransferRetentionStrategy({ summary, strategy })
  if (!validation.ok) throw new Error(validation.reason)

  const sourceAgentId = normalizeAgentId(agent)
  const actorId = normalizeAgentId(actor)
  let retainedResults = null

  if (hasBlockingAgentAssets(summary)) {
    retainedResults = await executeAgentAssetReassignment({
      organisationId,
      agent,
      assets,
      strategy,
      actor,
      reason,
      appointmentAction,
    })
  }

  await recordSecurityAuditEvent({
    userId: actorId,
    workspaceId: organisationId,
    action: 'agent_transfer_assets_retained',
    targetType: 'organisation_user',
    targetId: agent.organisationUserId || sourceAgentId || normalizeEmail(agent.email),
    metadata: {
      sourceAgentId,
      sourceAgentEmail: normalizeEmail(agent.email),
      destinationOrganisationId: normalizeText(destinationOrganisation.id),
      destinationOrganisationName: normalizeText(destinationOrganisation.name),
      destinationInviteId: destinationInvite?.id || null,
      reason,
      strategyMode: strategy.mode || 'single',
      retainedResults,
      retainedAssetCount: countRetainedAssets(summary),
    },
  })

  return {
    retainedResults,
    retainedAssetCount: countRetainedAssets(summary),
  }
}

export async function recordAgentTransferMembershipTransition({
  actor = {},
  agent = {},
  sourceOrganisation = {},
  destinationOrganisation = {},
  destinationInvite = null,
  reason = 'Agent agency transfer',
  oldMembershipDeactivated = false,
} = {}) {
  const actorId = normalizeAgentId(actor)
  const sourceOrganisationId = normalizeText(sourceOrganisation.id || agent.organisationId)
  const sourceAgentId = normalizeAgentId(agent)

  return recordSecurityAuditEvent({
    userId: actorId,
    workspaceId: sourceOrganisationId,
    action: 'agent_transferred_between_agencies',
    targetType: 'organisation_user',
    targetId: agent.organisationUserId || sourceAgentId || normalizeEmail(agent.email),
    metadata: {
      sourceAgentId,
      agentEmail: normalizeEmail(agent.email),
      sourceOrganisationId,
      sourceOrganisationName: normalizeText(sourceOrganisation.name || agent.organisationName),
      destinationOrganisationId: normalizeText(destinationOrganisation.id),
      destinationOrganisationName: normalizeText(destinationOrganisation.name),
      destinationInviteId: destinationInvite?.id || null,
      destinationInviteStatus: destinationInvite?.status || null,
      oldMembershipDeactivated,
      reason,
    },
  })
}
