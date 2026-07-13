import {
  scanMandateTemplateContent,
} from './mandateTemplateContentScanner.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function templateMetadata(template = {}) {
  return template?.metadata_json && typeof template.metadata_json === 'object'
    ? template.metadata_json
    : template?.metadataJson && typeof template.metadataJson === 'object'
      ? template.metadataJson
      : {}
}

function normalizePacketType(template = {}, options = {}) {
  const metadata = templateMetadata(template)
  return normalizeText(
    options.packetType ||
      template.packet_type ||
      template.packetType ||
      metadata.packet_type ||
      metadata.packetType,
  ).toLowerCase()
}

function cloneList(value = []) {
  return Array.isArray(value) ? [...value] : []
}

export const MANDATE_TEMPLATE_PUBLISH_GATE_VERSION = 'mandate_template_publish_gate_v1'

export function formatMandateTemplatePublishGateIssue(issue = {}) {
  const message = normalizeText(issue.message)
  const remediation = normalizeText(issue.remediation)
  if (!message) return remediation || 'Mandate template content needs legal review before publishing.'
  if (!remediation || message.toLowerCase().includes(remediation.toLowerCase())) return message
  return `${message} ${remediation}`
}

function summarizeIssue(issue = {}) {
  return {
    severity: normalizeText(issue.severity) || 'blocking',
    code: normalizeText(issue.code) || 'MANDATE_TEMPLATE_CONTENT_ISSUE',
    routeKey: normalizeText(issue.routeKey),
    routeLabel: normalizeText(issue.routeLabel),
    signalGroupKey: normalizeText(issue.signalGroupKey),
    signalGroupLabel: normalizeText(issue.signalGroupLabel),
    sectionKey: normalizeText(issue.sectionKey),
    sectionLabel: normalizeText(issue.sectionLabel),
    conditionalPackKey: normalizeText(issue.conditionalPackKey),
    message: normalizeText(issue.message),
    remediation: normalizeText(issue.remediation),
  }
}

function buildMissingRecommendedPackWarnings(scan = {}) {
  return cloneList(scan.missingRecommendedPackKeys).map((packKey) => ({
    severity: 'warning',
    code: 'MISSING_RECOMMENDED_CONDITIONAL_PACK',
    routeKey: normalizeText(scan.routeKey),
    routeLabel: normalizeText(scan.routeLabel),
    signalGroupKey: '',
    signalGroupLabel: '',
    sectionKey: '',
    sectionLabel: '',
    conditionalPackKey: normalizeText(packKey),
    message: `${normalizeText(scan.routeLabel) || 'Mandate'} template does not include the recommended conditional pack "${normalizeText(packKey)}".`,
    remediation: 'Add this pack when the route needs scenario-specific wording, or confirm legal sign-off for omitting it.',
  }))
}

export function serializeMandateTemplatePublishGateScan(input = {}, options = {}) {
  const scan = asRecord(input.scan || input)
  if (!Object.keys(scan).length) return null
  const warnings = cloneList(input.warnings || scan.warnings)
  const blockers = cloneList(input.blockers || scan.blockers)
  return {
    gateVersion: normalizeText(input.gateVersion || MANDATE_TEMPLATE_PUBLISH_GATE_VERSION),
    scannerVersion: normalizeText(scan.scannerVersion),
    ruleVersion: normalizeText(scan.ruleVersion),
    routeKey: normalizeText(input.routeKey || scan.routeKey),
    routeLabel: normalizeText(input.routeLabel || scan.routeLabel),
    isValidForPublish: Boolean(input.isValidForPublish ?? input.canPublish ?? scan.isValidForPublish),
    blockingCount: Number(input.blockingCount ?? blockers.length ?? scan.blockingCount ?? 0),
    warningCount: Number(input.warningCount ?? warnings.length ?? scan.warningCount ?? 0),
    blockers: blockers.map(summarizeIssue),
    warnings: warnings.map(summarizeIssue),
    blockerCodes: blockers.map((issue) => normalizeText(issue.code)).filter(Boolean),
    warningCodes: warnings.map((issue) => normalizeText(issue.code)).filter(Boolean),
    presentSignalGroupKeys: cloneList(scan.presentSignalGroupKeys),
    presentPackKeys: cloneList(scan.presentPackKeys),
    missingRecommendedPackKeys: cloneList(scan.missingRecommendedPackKeys),
    scannedAt: normalizeText(options.scannedAt || input.scannedAt) || new Date().toISOString(),
  }
}

export function buildMandateTemplatePublishGateReport(template = {}, options = {}) {
  const packetType = normalizePacketType(template, options)
  if (packetType && packetType !== 'mandate') {
    return {
      gateVersion: MANDATE_TEMPLATE_PUBLISH_GATE_VERSION,
      applies: false,
      canPublish: true,
      isValidForPublish: true,
      blockers: [],
      warnings: [],
      blockingMessages: [],
      warningMessages: [],
      metadata: null,
      scan: null,
    }
  }

  const scan = scanMandateTemplateContent(template, options)
  const blockers = cloneList(scan.blockers)
  const warnings = [
    ...cloneList(scan.warnings),
    ...buildMissingRecommendedPackWarnings(scan),
  ]
  const report = {
    gateVersion: MANDATE_TEMPLATE_PUBLISH_GATE_VERSION,
    applies: true,
    canPublish: blockers.length === 0,
    isValidForPublish: blockers.length === 0,
    scannerVersion: scan.scannerVersion,
    ruleVersion: scan.ruleVersion,
    routeKey: scan.routeKey,
    routeLabel: scan.routeLabel,
    blockingCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    warnings,
    blockingMessages: blockers.map(formatMandateTemplatePublishGateIssue),
    warningMessages: warnings.map(formatMandateTemplatePublishGateIssue),
    scan,
  }
  report.metadata = serializeMandateTemplatePublishGateScan(report)
  return report
}
