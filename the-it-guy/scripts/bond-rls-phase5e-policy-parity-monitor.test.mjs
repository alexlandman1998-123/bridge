import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(appRoot, 'scripts', 'bond-rls-phase5e-policy-parity-monitor.mjs');

function parseJsonOutput(rawOutput) {
  const trimmed = rawOutput.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  }
}

function runMonitor() {
  const output = execFileSync('node', [scriptPath], {
    cwd: appRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  return parseJsonOutput(output);
}

test('Phase 5E parity monitor reports clean read/write parity and preserved exclusions', () => {
  const report = runMonitor();

  assert.equal(report.readParityPass, true);
  assert.equal(report.writeParityPass, true);
  assert.equal(report.unexpectedReadAllow, 0);
  assert.equal(report.unexpectedReadDeny, 0);
  assert.equal(report.unexpectedWriteAllow, 0);
  assert.equal(report.unexpectedWriteDeny, 0);
  assert.equal(report.excludedRowsPreserved, true);
  assert.equal(report.legacyCompatRowsPreserved, true);
  assert.equal(report.personalOriginatorPass, true);
  assert.equal(report.branchScopePass, true);
  assert.equal(report.regionScopePass, true);
});

test('Phase 5E parity monitor reports target-table policy overlap details without delete expansion', () => {
  const report = runMonitor();
  const stepPolicies = report.policyOverlapAudit.tables.transaction_subprocess_steps;
  const documentPolicies = report.policyOverlapAudit.tables.documents;

  assert.ok(stepPolicies.updatePolicies.includes('transaction_subprocess_steps_update_phase5d_bond_finance'));
  assert.ok(documentPolicies.insertPolicies.includes('documents_insert_phase5d_bond_finance'));
  assert.deepEqual(stepPolicies.deletePolicies, []);
  assert.deepEqual(documentPolicies.deletePolicies, []);
  assert.deepEqual(report.policyOverlapAudit.broadFindings, []);
});

test('Phase 5E parity monitor surfaces local smoke and tolerates missing live staging auth state', () => {
  const report = runMonitor();

  assert.equal(report.uiWorkflowSmoke.dashboard, 'pass');
  assert.equal(report.uiWorkflowSmoke.queues, 'pass');
  assert.equal(report.uiWorkflowSmoke.writeDenialHandling, 'pass');
  assert.ok(['blocked_no_auth_state', 'pending_runtime_verification', 'blocked_missing_staging_env'].includes(report.stagingSmoke.status));
});
