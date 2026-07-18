function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function bool(value) {
  return value === true || value === 'true'
}

function text(value = '') {
  return String(value || '').trim()
}

export function buildSellerDocumentReleaseReadinessReport(snapshot = {}, { now = new Date() } = {}) {
  const generatedAt = now instanceof Date ? now : new Date(now)
  const dependenciesReady = bool(snapshot.dependencies_ready ?? snapshot.dependenciesReady)
  const heartbeatFresh = bool(snapshot.heartbeat_fresh ?? snapshot.heartbeatFresh)
  const missingAutomations = Array.isArray(snapshot.missing_automations)
    ? snapshot.missing_automations
    : Array.isArray(snapshot.missingAutomations) ? snapshot.missingAutomations : []
  const operationalBlocking = number(snapshot.operational_blocking_count ?? snapshot.operationalBlockingCount)
  const operationalAttention = number(snapshot.operational_attention_count ?? snapshot.operationalAttentionCount)
  const continuityBlocking = number(snapshot.continuity_blocking_count ?? snapshot.continuityBlockingCount)
  const continuityAttention = number(snapshot.continuity_attention_count ?? snapshot.continuityAttentionCount)
  const slaBlocking = number(snapshot.sla_blocking_count ?? snapshot.slaBlockingCount)
  const slaAttention = number(snapshot.sla_attention_count ?? snapshot.slaAttentionCount)
  const failedNotifications = number(snapshot.failed_notification_count ?? snapshot.failedNotificationCount)
  const blockingCount = Number(!dependenciesReady) + Number(!heartbeatFresh) + missingAutomations.length +
    operationalBlocking + continuityBlocking + slaBlocking + failedNotifications
  const attentionCount = operationalAttention + continuityAttention + slaAttention
  const gateStatus = blockingCount ? 'blocked' : attentionCount ? 'warning' : 'pass'
  const rollout = snapshot.rollout_control || snapshot.rolloutControl || null
  const actions = []

  if (!dependenciesReady) actions.push('Deploy every P0-1 through P1-10 database migration before rollout.')
  if (missingAutomations.length) actions.push(`Activate missing automations: ${missingAutomations.join(', ')}.`)
  if (!heartbeatFresh) actions.push('Deploy and invoke the notification reminder dispatcher; its last live heartbeat must be less than two hours old.')
  if (operationalBlocking) actions.push(`Resolve ${operationalBlocking} seller-document integrity or request issuance blocker${operationalBlocking === 1 ? '' : 's'}.`)
  if (continuityBlocking) actions.push(`Resolve ${continuityBlocking} listing-to-transaction continuity blocker${continuityBlocking === 1 ? '' : 's'}.`)
  if (slaBlocking) actions.push(`Resolve ${slaBlocking} critical, unassigned, or failed seller-document review SLA item${slaBlocking === 1 ? '' : 's'}.`)
  if (failedNotifications) actions.push(`Retry or investigate ${failedNotifications} failed seller-document notification${failedNotifications === 1 ? '' : 's'} from the last 24 hours.`)
  if (!blockingCount && attentionCount) actions.push(`Clear ${attentionCount} non-blocking operational, continuity, or SLA warning${attentionCount === 1 ? '' : 's'} before a strict broad release.`)
  if (!actions.length) actions.push('Certify one scoped canary listing, then promote the organisation to enabled with the recorded revision.')

  return {
    version: 'seller_document_release_readiness_p1_10_v1',
    generatedAt: generatedAt.toISOString(),
    scope: {
      organisationId: text(snapshot.organisation_id ?? snapshot.organisationId),
      listingId: text(snapshot.listing_id ?? snapshot.listingId),
    },
    summary: {
      blockingCount,
      attentionCount,
      operationalBlockingCount: operationalBlocking,
      operationalAttentionCount: operationalAttention,
      continuityBlockingCount: continuityBlocking,
      continuityAttentionCount: continuityAttention,
      slaBlockingCount: slaBlocking,
      slaAttentionCount: slaAttention,
      failedNotificationCount: failedNotifications,
      dependenciesReady,
      heartbeatFresh,
      missingAutomationCount: missingAutomations.length,
    },
    heartbeat: {
      lastLiveAt: text(snapshot.last_live_heartbeat_at ?? snapshot.lastLiveHeartbeatAt),
      ageMinutes: snapshot.heartbeat_age_minutes == null ? null : number(snapshot.heartbeat_age_minutes),
    },
    missingAutomations,
    rollout,
    gate: {
      status: gateStatus,
      releaseRecommended: gateStatus === 'pass',
      strictReleaseRecommended: gateStatus === 'pass',
      reason: blockingCount
        ? `${blockingCount} release blocker${blockingCount === 1 ? '' : 's'} must be resolved before seller-document automation is enabled.`
        : attentionCount
          ? `${attentionCount} warning${attentionCount === 1 ? '' : 's'} require review before broad rollout.`
          : 'The deployed seller-document chain is healthy and ready for a scoped canary certification.',
    },
    actions,
    raw: snapshot,
  }
}
