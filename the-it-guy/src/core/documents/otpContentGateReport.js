import {
  listOtpLegalContentTemplateSections,
} from './otpLegalContentTemplates.js'
import {
  buildOtpContentPublishGateReport,
} from './otpContentPublishGate.js'
import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'

export const OTP_CONTENT_GATE_REPORT_VERSION = 'otp_content_gate_report_phase7_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

export function buildOtpContentGateReport({ generatedAt = new Date().toISOString() } = {}) {
  const routeReports = OTP_DOCUMENT_VARIANTS.map((variant) => {
    const sections = listOtpLegalContentTemplateSections({ variant: variant.key })
    const gate = buildOtpContentPublishGateReport({
      packet_type: 'otp',
      metadata_json: { otp_document_variant: variant.key },
      sections,
    }, {
      packetType: 'otp',
      routeKey: variant.key,
    })
    return {
      variant: variant.key,
      label: variant.label,
      sectionCount: sections.length,
      gate,
    }
  })
  const blockers = routeReports.flatMap((route) => route.gate.blockers.map((issue) => ({ ...issue, variant: route.variant })))
  const warnings = routeReports.flatMap((route) => route.gate.warnings.map((issue) => ({ ...issue, variant: route.variant })))

  return {
    version: OTP_CONTENT_GATE_REPORT_VERSION,
    generatedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_CONTENT_GATE_REMEDIATION_REQUIRED' : 'OTP_CONTENT_GATE_READY_FOR_LAUNCH_READINESS',
    summary: {
      routeCount: routeReports.length,
      sectionCount: routeReports.reduce((sum, route) => sum + route.sectionCount, 0),
      blockerCount: blockers.length,
      warningCount: warnings.length,
      publishableRouteCount: routeReports.filter((route) => route.gate.canPublish).length,
    },
    routeReports,
    blockers,
    warnings,
  }
}

export function formatOtpContentGateReportMarkdown(report = buildOtpContentGateReport()) {
  return [
    '# OTP Template vNext Phase 7 Content Gate And Scanner',
    '',
    `Generated: ${report.generatedAt}`,
    `Version: ${report.version}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Routes', report.summary.routeCount],
        ['Scanned route sections', report.summary.sectionCount],
        ['Publishable routes', report.summary.publishableRouteCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
      ],
    ),
    '',
    '## Route Gates',
    '',
    table(
      ['Route', 'Can Publish', 'Blockers', 'Warnings', 'Signals'],
      report.routeReports.map((route) => [
        route.label,
        route.gate.canPublish ? 'yes' : 'no',
        route.gate.blockingCount,
        route.gate.warningCount,
        route.gate.scan?.presentSignalGroupKeys?.join(', ') || '',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 7 is the OTP content gate and scanner. It does not publish live templates, record counsel approval, change runtime fallback approval, or replace the later launch-readiness/runtime-lock phases.',
    '',
  ].join('\n')
}

