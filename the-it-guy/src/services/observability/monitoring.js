import { trackTelemetryEvent } from './telemetry'

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
