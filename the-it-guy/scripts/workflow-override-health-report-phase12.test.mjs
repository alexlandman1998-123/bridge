#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  WORKFLOW_OVERRIDE_HEALTH_REPORT_VERSION,
  WORKFLOW_OVERRIDE_HEALTH_RISK_CODES,
  assertWorkflowOverrideHealthReport,
  buildWorkflowOverrideDiagnostic,
  buildWorkflowOverrideHealthReport,
} from '../server/services/workflowOverrideDiagnosticService.js'

const PROJECT_ROOT = new URL('../', import.meta.url)

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

function buildDiagnostic(transaction) {
  return buildWorkflowOverrideDiagnostic({ transaction })
}

const bondDiagnostic = buildDiagnostic({
  id: 'tx-health-bond',
  finance_type: 'bond',
  seller_has_existing_bond: true,
})
const cashDiagnostic = buildDiagnostic({
  id: 'tx-health-cash',
  finance_type: 'cash',
  seller_has_existing_bond: false,
})

const healthyReport = buildWorkflowOverrideHealthReport({
  diagnostics: [bondDiagnostic, cashDiagnostic],
  events: [
    {
      transaction_id: 'tx-health-bond',
      workflow_key: 'sales_otp',
      step_key: 'ready_for_finance_handoff',
      action_key: 'FORCE_WAIVE',
      event_type: 'workflow_override_applied',
      source: 'workflow_override',
      payload_json: {
        overrideType: 'force_waive',
        overrideIntent: 'waiver_override',
        completionMode: 'waived',
        waiver: true,
      },
    },
    {
      transaction_id: 'tx-health-cash',
      workflow_key: 'finance_cash',
      step_key: 'proof_of_funds_received',
      action_key: 'REOPEN_FINANCE',
      event_type: 'workflow_override_applied',
      source: 'workflow_override',
      payload_json: {
        overrideType: 'force_reopen',
        overrideIntent: 'reopen_override',
        completionMode: 'reopened',
        waiver: false,
      },
    },
    {
      transaction_id: 'tx-health-cash',
      workflow_key: 'sales_otp',
      step_key: 'signed_otp_received',
      action_key: 'RECORD_PAPER_SIGNED_OTP',
      event_type: 'workflow_action_blocked',
      source: 'paper_signed_otp_upload',
      payload_json: {
        blockers: [{ code: 'WORKFLOW_ACTION_WAIVER_REQUIRES_OVERRIDE' }],
      },
    },
  ],
  audits: [
    {
      transaction_id: 'tx-health-bond',
      reason_code: 'step_waived',
      derived_from_json: {
        auditMetadata: {
          workflowKey: 'sales_otp',
          stepKey: 'ready_for_finance_handoff',
          overrideType: 'force_waive',
          overrideIntent: 'waiver_override',
          completionMode: 'waived',
          waiver: true,
        },
      },
    },
  ],
})

assert.equal(healthyReport.version, WORKFLOW_OVERRIDE_HEALTH_REPORT_VERSION)
assert.equal(healthyReport.summary.diagnosticCount, 2)
assert.equal(healthyReport.summary.transactionCount, 2)
assert.equal(healthyReport.summary.overrideEventCount, 2)
assert.equal(healthyReport.summary.waiverOverrideCount, 1)
assert.equal(healthyReport.summary.reopenOverrideCount, 1)
assert.equal(healthyReport.summary.waiverOverrideMissingMetadataCount, 0)
assert.equal(healthyReport.summary.waiverAuditCount, 1)
assert.equal(healthyReport.summary.waiverAuditMissingMetadataCount, 0)
assert.equal(healthyReport.summary.blockedWaiverActionAttemptCount, 1)
assert.equal(healthyReport.summary.normalActionWaiverCompletionCount, 0)
assert.equal(healthyReport.byWorkflowStep['sales_otp.ready_for_finance_handoff'].waiverOverrideCount, 1)
assert.equal(healthyReport.byTransaction['tx-health-bond'].waiverAuditCount, 1)
assert.equal(assertWorkflowOverrideHealthReport(healthyReport), true)

const riskyReport = buildWorkflowOverrideHealthReport({
  events: [
    {
      transaction_id: 'tx-risk',
      workflow_key: 'sales_otp',
      step_key: 'signed_otp_received',
      action_key: 'RECORD_PAPER_SIGNED_OTP',
      event_type: 'workflow_action_completed',
      source: 'paper_signed_otp_upload',
      payload_json: {
        payload: {
          completionMode: 'waived',
        },
      },
    },
    {
      transaction_id: 'tx-risk',
      workflow_key: 'sales_otp',
      step_key: 'ready_for_finance_handoff',
      action_key: 'FORCE_WAIVE',
      event_type: 'workflow_override_applied',
      source: 'workflow_override',
      payload_json: {
        overrideType: 'force_waive',
        reason: 'Legacy waiver event without Phase 11 metadata.',
      },
    },
  ],
  audits: [
    {
      transaction_id: 'tx-risk',
      reason_code: 'step_waived',
      derived_from_json: {
        auditMetadata: {
          workflowKey: 'sales_otp',
          stepKey: 'ready_for_finance_handoff',
          overrideType: 'force_waive',
        },
      },
    },
  ],
})

assert.equal(riskyReport.summary.normalActionWaiverCompletionCount, 1)
assert.equal(riskyReport.summary.waiverOverrideMissingMetadataCount, 1)
assert.equal(riskyReport.summary.waiverAuditMissingMetadataCount, 1)
assert.deepEqual(
  riskyReport.risks.map((risk) => risk.code).sort(),
  [
    WORKFLOW_OVERRIDE_HEALTH_RISK_CODES.waiverActionCompletionEvent,
    WORKFLOW_OVERRIDE_HEALTH_RISK_CODES.waiverAuditMissingMetadata,
    WORKFLOW_OVERRIDE_HEALTH_RISK_CODES.waiverOverrideMissingAuditMetadata,
  ].sort(),
)
assert.throws(
  () => assertWorkflowOverrideHealthReport(riskyReport),
  /WAIVER_ACTION_COMPLETION_EVENT/,
)

const diagnosticServiceSource = readProjectFile('server/services/workflowOverrideDiagnosticService.js')
const packageJson = readProjectFile('package.json')

assert.match(
  diagnosticServiceSource,
  /WORKFLOW_OVERRIDE_HEALTH_REPORT_VERSION = 'workflow_override_health_report_v1'/,
  'Diagnostic service should expose the Phase 12 health report contract version.',
)
assert.match(
  diagnosticServiceSource,
  /WAIVER_ACTION_COMPLETION_EVENT[\s\S]*WAIVER_OVERRIDE_MISSING_AUDIT_METADATA[\s\S]*WAIVER_AUDIT_MISSING_METADATA/,
  'Health report should guard waiver action completion and missing waiver audit metadata.',
)
assert.match(
  diagnosticServiceSource,
  /buildWorkflowOverrideHealthReport[\s\S]*normalActionWaiverCompletionCount[\s\S]*blockedWaiverActionAttemptCount/,
  'Health report should summarize waiver policy attempts and violations.',
)
assert.match(
  packageJson,
  /"test:workflow-override-health-report-phase12":\s*"node scripts\/workflow-override-health-report-phase12\.test\.mjs"/,
  'package.json should expose the Phase 12 override health report regression test.',
)

console.log('workflow override health report Phase 12 tests passed')
