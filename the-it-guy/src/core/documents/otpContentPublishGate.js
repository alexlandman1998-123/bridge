import {
  scanOtpContent,
} from './otpContentScanner.js'

export const OTP_CONTENT_PUBLISH_GATE_VERSION = 'otp_content_publish_gate_phase7_v1'

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

export function formatOtpContentPublishGateIssue(issue = {}) {
  const message = normalizeText(issue.message)
  const remediation = normalizeText(issue.remediation)
  if (!message) return remediation || 'OTP template content needs legal review before publishing.'
  if (!remediation || message.toLowerCase().includes(remediation.toLowerCase())) return message
  return `${message} ${remediation}`
}

function summarizeIssue(issue = {}) {
  return {
    severity: normalizeText(issue.severity) || 'blocking',
    code: normalizeText(issue.code) || 'OTP_CONTENT_GATE_ISSUE',
    routeKey: normalizeText(issue.routeKey),
    routeLabel: normalizeText(issue.routeLabel),
    signalGroupKey: normalizeText(issue.signalGroupKey),
    signalGroupLabel: normalizeText(issue.signalGroupLabel),
    sectionKey: normalizeText(issue.sectionKey),
    sectionLabel: normalizeText(issue.sectionLabel),
    conditionalSectionKey: normalizeText(issue.conditionalSectionKey),
    message: normalizeText(issue.message),
    remediation: normalizeText(issue.remediation),
  }
}

function buildMissingRecommendedSectionWarnings(scan = {}) {
  return cloneList(scan.missingRecommendedSectionKeys).map((sectionKey) => ({
    severity: 'warning',
    code: 'OTP_MISSING_RECOMMENDED_SECTION',
    routeKey: normalizeText(scan.routeKey),
    routeLabel: normalizeText(scan.routeLabel),
    signalGroupKey: '',
    signalGroupLabel: '',
    sectionKey: normalizeText(sectionKey),
    sectionLabel: '',
    conditionalSectionKey: normalizeText(sectionKey),
    message: `${normalizeText(scan.routeLabel) || 'OTP'} template does not include the recommended section "${normalizeText(sectionKey)}".`,
    remediation: 'Add this section when the route needs the standard OTP clause family, or record legal sign-off for omitting it.',
  }))
}

export function serializeOtpContentPublishGateScan(input = {}, options = {}) {
  const scan = asRecord(input.scan || input)
  if (!Object.keys(scan).length) return null
  const warnings = cloneList(input.warnings || scan.warnings)
  const blockers = cloneList(input.blockers || scan.blockers)
  return {
    gateVersion: normalizeText(input.gateVersion || OTP_CONTENT_PUBLISH_GATE_VERSION),
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
    presentSectionKeys: cloneList(scan.presentSectionKeys),
    missingRecommendedSectionKeys: cloneList(scan.missingRecommendedSectionKeys),
    scannedAt: normalizeText(options.scannedAt || input.scannedAt) || new Date().toISOString(),
  }
}

export function buildOtpContentPublishGateReport(template = {}, options = {}) {
  const packetType = normalizePacketType(template, options)
  if (packetType && packetType !== 'otp' && packetType !== 'offer_to_purchase') {
    return {
      gateVersion: OTP_CONTENT_PUBLISH_GATE_VERSION,
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

  const scan = scanOtpContent(template, options)
  const blockers = cloneList(scan.blockers)
  const warnings = [
    ...cloneList(scan.warnings),
    ...buildMissingRecommendedSectionWarnings(scan),
  ]
  const report = {
    gateVersion: OTP_CONTENT_PUBLISH_GATE_VERSION,
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
    blockingMessages: blockers.map(formatOtpContentPublishGateIssue),
    warningMessages: warnings.map(formatOtpContentPublishGateIssue),
    scan,
  }
  report.metadata = serializeOtpContentPublishGateScan(report)
  return report
}

