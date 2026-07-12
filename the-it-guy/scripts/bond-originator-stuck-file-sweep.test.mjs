import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { analyzeBondOriginatorRows } from './bond-originator-stuck-file-sweep.mjs'

const NOW = new Date('2026-07-12T10:00:00.000Z')

const fixture = {
  transactions: [
    {
      id: 'tx-ready-orphan',
      finance_type: 'bond',
      bond_originator_intake_status: 'READY_FOR_REVIEW',
      buyer_name: 'Ready Orphan',
      updated_at: '2026-07-11T10:00:00.000Z',
    },
    {
      id: 'tx-ready-accepted',
      finance_type: 'bond',
      bond_originator_intake_status: 'READY_FOR_REVIEW',
      bond_assignment_status: 'accepted',
      bond_workspace_id: 'workspace-bond',
      buyer_name: 'Accepted Intake',
      updated_at: '2026-07-11T10:00:00.000Z',
    },
    {
      id: 'tx-invalid-app',
      finance_type: 'bond',
      bond_workspace_id: 'workspace-bond',
      current_sub_stage_summary: 'Bank review',
      updated_at: '2026-07-11T10:00:00.000Z',
    },
    {
      id: 'tx-invalid-workflow',
      finance_type: 'bond',
      bond_workspace_id: 'workspace-bond',
      updated_at: '2026-07-11T10:00:00.000Z',
    },
    {
      id: 'tx-grant',
      finance_type: 'bond',
      bond_workspace_id: 'workspace-bond',
      current_sub_stage_summary: 'Grant signed',
      updated_at: '2026-07-11T10:00:00.000Z',
    },
    {
      id: 'tx-instruction',
      finance_type: 'bond',
      bond_workspace_id: 'workspace-bond',
      current_sub_stage_summary: 'Instruction sent',
      updated_at: '2026-07-01T10:00:00.000Z',
    },
    {
      id: 'tx-bank-stale',
      finance_type: 'bond',
      bond_workspace_id: 'workspace-bond',
      primary_bond_consultant_user_id: 'consultant-1',
      next_action: '',
      updated_at: '2026-06-20T10:00:00.000Z',
    },
    {
      id: 'tx-additional-docs',
      finance_type: 'bond',
      bond_workspace_id: 'workspace-bond',
      primary_bond_consultant_user_id: 'consultant-2',
      next_action: 'Follow up with buyer',
      updated_at: '2026-06-25T10:00:00.000Z',
    },
    {
      id: 'tx-clean',
      finance_type: 'bond',
      bond_workspace_id: 'workspace-bond',
      current_sub_stage_summary: 'Instruction sent',
      updated_at: '2026-07-11T10:00:00.000Z',
    },
  ],
  workflows: [
    { id: 'wf-invalid', transaction_id: 'tx-invalid-workflow', workflow_type: 'bond_hybrid', current_stage: 'bank_purgatory' },
    { id: 'wf-grant', transaction_id: 'tx-grant', workflow_type: 'bond_hybrid', current_stage: 'grant_signed' },
    { id: 'wf-instruction', transaction_id: 'tx-instruction', workflow_type: 'bond_hybrid', current_stage: 'instruction_sent' },
    { id: 'wf-clean', transaction_id: 'tx-clean', workflow_type: 'bond_hybrid', current_stage: 'instruction_sent' },
  ],
  applications: [
    { id: 'app-invalid', transaction_id: 'tx-invalid-app', status: 'bank_purgatory', bank_name: 'Bank A', updated_at: '2026-07-11T10:00:00.000Z' },
    { id: 'app-bank-stale', transaction_id: 'tx-bank-stale', status: 'submitted', bank_name: 'Bank B', submitted_at: '2026-06-20T10:00:00.000Z', updated_at: '2026-06-20T10:00:00.000Z' },
    { id: 'app-additional-docs', transaction_id: 'tx-additional-docs', status: 'additional_documents_required', bank_name: 'Bank C', updated_at: '2026-06-25T10:00:00.000Z' },
  ],
  quotes: [
    { id: 'quote-invalid', transaction_id: 'tx-invalid-app', quote_status: 'maybe_later' },
  ],
  instructions: [
    { transaction_id: 'tx-grant', grant_document_id: 'doc-grant' },
    {
      transaction_id: 'tx-instruction',
      grant_document_id: 'doc-grant',
      signed_grant_document_id: 'doc-signed',
      grant_submitted: true,
      instruction_sent: true,
      instruction_sent_at: '2026-07-01T10:00:00.000Z',
      instruction_document_id: 'doc-instruction',
    },
    {
      transaction_id: 'tx-clean',
      grant_document_id: 'doc-grant',
      signed_grant_document_id: 'doc-signed',
      grant_submitted: true,
      instruction_sent: true,
      instruction_sent_at: '2026-07-11T10:00:00.000Z',
      instruction_document_id: 'doc-instruction',
    },
  ],
  attorneyAssignments: [
    { transaction_id: 'tx-clean', assignment_type: 'bond', attorney_role: 'bond_attorney', assignment_status: 'active' },
  ],
}

const report = analyzeBondOriginatorRows(fixture, { now: NOW })
const codes = new Set(report.findings.map((finding) => finding.code))

assert.equal(report.readOnly, true)
assert.equal(report.totals.transactionsScanned, 9)
assert.equal(report.totals.bondTransactions, 9)
assert.equal(report.gate.status, 'fail')
assert.equal(codes.has('orphaned_ready_for_review'), true)
assert.equal(codes.has('accepted_file_still_in_intake'), true)
assert.equal(codes.has('invalid_bond_application_status'), true)
assert.equal(codes.has('invalid_bond_workflow_stage'), true)
assert.equal(codes.has('invalid_bond_quote_status'), true)
assert.equal(codes.has('missing_signed_grant_document'), true)
assert.equal(codes.has('instruction_sent_without_attorney_handoff'), true)
assert.equal(codes.has('stale_bank_feedback_wait'), true)
assert.equal(codes.has('stale_additional_documents_wait'), true)
assert.equal(
  report.findings.some((finding) => finding.transactionId === 'tx-clean'),
  false,
  'clean instruction-sent files with bond attorney handoff evidence should not be flagged',
)

const tempInput = path.join(os.tmpdir(), `bond-originator-stuck-file-sweep-${Date.now()}.json`)
fs.writeFileSync(tempInput, JSON.stringify(fixture, null, 2))
const cli = spawnSync(
  process.execPath,
  ['scripts/bond-originator-stuck-file-sweep.mjs', '--input', tempInput],
  { cwd: process.cwd(), encoding: 'utf8' },
)
assert.equal(cli.status, 1, 'CLI should fail when blocker findings are present')
assert.match(cli.stdout, /Finding summary:/)
const match = cli.stdout.match(/\{[\s\S]*\}\s*$/)
assert.ok(match, 'CLI should print final JSON report')
const cliReport = JSON.parse(match[0])
assert.equal(cliReport.gate.status, 'fail')
assert.equal(cliReport.findings.some((finding) => finding.code === 'orphaned_ready_for_review'), true)

console.log('bond originator stuck file sweep tests passed')

