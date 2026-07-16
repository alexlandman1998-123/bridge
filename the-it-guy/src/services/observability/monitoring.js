import { trackTelemetryEvent } from './telemetry'

const emittedWorkspaceBrandingMetrics = new Set()
const MAX_DEDUPED_WORKSPACE_BRANDING_METRICS = 500

function normalizeText(value) {
  return String(value || '').trim()
}

export function buildWorkspaceBrandingMetric(eventName, context = {}) {
  const membershipSources = Array.from(
    new Set((context.membershipSources || []).map((source) => normalizeText(source)).filter(Boolean)),
  ).sort()

  return {
    category: 'workspace',
    eventName: normalizeText(eventName),
    userId: normalizeText(context.userId),
    workspaceId: normalizeText(context.workspaceId),
    route: normalizeText(context.route),
    severity: normalizeText(context.severity) || 'info',
    metadata: {
      workspaceType: normalizeText(context.workspaceType) || null,
      membershipSource: normalizeText(context.membershipSource) || null,
      membershipSources,
      membershipSourceOverlap: membershipSources.length > 1,
      brandingSource: normalizeText(context.brandingSource) || null,
      logoPresent: context.logoPresent === true,
    },
  }
}

export function getWorkspaceBrandingMetricDedupeKey(metric = {}) {
  return [
    normalizeText(metric.eventName),
    normalizeText(metric.userId),
    normalizeText(metric.workspaceId),
    normalizeText(metric.metadata?.membershipSource),
    normalizeText(metric.metadata?.brandingSource),
    metric.metadata?.logoPresent === true ? 'logo' : 'no-logo',
  ].join(':')
}

export function trackWorkspaceBrandingMetric(eventName, context = {}) {
  const metric = buildWorkspaceBrandingMetric(eventName, context)
  if (!metric.eventName) return Promise.resolve({ persisted: false, reason: 'missing_event_name' })

  const dedupeKey = getWorkspaceBrandingMetricDedupeKey(metric)
  if (emittedWorkspaceBrandingMetrics.has(dedupeKey)) {
    return Promise.resolve({ persisted: false, reason: 'deduplicated' })
  }
  if (emittedWorkspaceBrandingMetrics.size >= MAX_DEDUPED_WORKSPACE_BRANDING_METRICS) {
    emittedWorkspaceBrandingMetrics.clear()
  }
  emittedWorkspaceBrandingMetrics.add(dedupeKey)
  return trackTelemetryEvent(metric)
}

export function trackAuthMetric(eventName, context = {}) {
  return trackTelemetryEvent({ ...context, category: 'auth', eventName })
}

export function trackOnboardingMetric(eventName, context = {}) {
  return trackTelemetryEvent({ ...context, category: 'onboarding', eventName })
}

export function trackWorkspaceMetric(eventName, context = {}) {
  return trackTelemetryEvent({ ...context, category: 'workspace', eventName })
}

export function trackPermissionMetric(eventName, context = {}) {
  return trackTelemetryEvent({ ...context, category: 'permission', eventName, severity: context.severity || 'warning' })
}

export function trackSystemMetric(eventName, context = {}) {
  return trackTelemetryEvent({ ...context, category: 'system', eventName })
}

export function trackMobileMetric(eventName, context = {}) {
  return trackTelemetryEvent({ ...context, category: 'mobile', eventName })
}
