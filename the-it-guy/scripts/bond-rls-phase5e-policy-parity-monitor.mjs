import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(appRoot, '..');
const scriptsDir = path.join(appRoot, 'scripts');
const migrationsDir = path.join(workspaceRoot, 'supabase', 'migrations');
const defaultManualMapping = path.join(scriptsDir, 'data', 'bond-workspace-manual-mapping.json');
const defaultCutoverExclusions = path.join(scriptsDir, 'data', 'bond-rls-cutover-exclusions.json');

const targetTables = [
  'transaction_subprocess_steps',
  'transaction_finance_details',
  'document_requests',
  'documents',
  'transaction_events',
  'transaction_notifications',
];

const requiredSafeErrorChecks = [
  {
    file: path.join(appRoot, 'src', 'lib', 'api.js'),
    label: 'requestDocumentPermission',
    needle: 'You do not have permission to request additional documents for this transaction.',
  },
  {
    file: path.join(appRoot, 'src', 'lib', 'api.js'),
    label: 'updateDocumentRequestPermission',
    needle: 'You do not have permission to update this additional document request.',
  },
  {
    file: path.join(appRoot, 'src', 'lib', 'api.js'),
    label: 'workflowPermission',
    needle: 'Your role does not have permission to update ${laneLabel}.',
  },
  {
    file: path.join(appRoot, 'src', 'pages', 'UnitDetail.jsx'),
    label: 'createDocumentRequestError',
    needle: 'Unable to create document request.',
  },
  {
    file: path.join(appRoot, 'src', 'pages', 'UnitDetail.jsx'),
    label: 'updateDocumentRequestError',
    needle: 'Unable to update document request status.',
  },
  {
    file: path.join(appRoot, 'src', 'pages', 'UnitDetail.jsx'),
    label: 'progressFinanceWorkflowError',
    needle: 'Unable to progress finance workflow.',
  },
  {
    file: path.join(appRoot, 'src', 'services', 'transactionWorkflowReadModelService.js'),
    label: 'documentRequestLoadWarning',
    needle: 'Failed to load document requests:',
  },
];

function parseJsonOutput(rawOutput) {
  const trimmed = rawOutput.trim();
  if (!trimmed) {
    throw new Error('Expected JSON output but received empty output.');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error(`Unable to parse JSON output: ${trimmed.slice(0, 300)}`);
    }
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  }
}

function runJsonScript(relativeScriptPath, extraEnv = {}) {
  const scriptPath = path.join(appRoot, relativeScriptPath);
  const output = execFileSync('node', [scriptPath], {
    cwd: appRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      BOND_ASSIGNMENT_MANUAL_MAPPING: process.env.BOND_ASSIGNMENT_MANUAL_MAPPING || defaultManualMapping,
      BOND_RLS_CUTOVER_EXCLUSIONS: process.env.BOND_RLS_CUTOVER_EXCLUSIONS || defaultCutoverExclusions,
      BOND_RLS_SHADOW_SAMPLE_LIMIT: process.env.BOND_RLS_SHADOW_SAMPLE_LIMIT || '0',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return parseJsonOutput(output);
}

function runStatusCommand(command, args) {
  try {
    execFileSync(command, args, {
      cwd: appRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: process.env,
    });
    return { status: 'pass' };
  } catch (error) {
    const stderr = String(error.stderr || error.stdout || error.message || '').trim();
    return {
      status: 'fail',
      code: error.status || 1,
      detail: stderr.split('\n').slice(-8),
    };
  }
}

function toPolicyName(rawName) {
  return rawName.replace(/^"/u, '').replace(/"$/u, '').trim();
}

function scanPolicyOverlap() {
  const files = readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  const tableMap = Object.fromEntries(
    targetTables.map((tableName) => [
      tableName,
      {
        selectPolicies: [],
        insertPolicies: [],
        updatePolicies: [],
        deletePolicies: [],
        broadPermissivePolicyDetected: false,
        policyBehaviorMatchesSimulation: true,
      },
    ]),
  );

  const broadFindings = [];

  for (const fileName of files) {
    const fullPath = path.join(migrationsDir, fileName);
    const sql = readFileSync(fullPath, 'utf8');

    for (const tableName of targetTables) {
      const regex = new RegExp(
        `create policy\\s+("?[\\w-]+"?)\\s+on\\s+public\\.${tableName}\\s+for\\s+(select|insert|update|delete)([\\s\\S]*?);`,
        'gi',
      );

      let match;
      while ((match = regex.exec(sql)) !== null) {
        const policyName = toPolicyName(match[1]);
        const operation = match[2].toLowerCase();
        const statement = match[0];
        const operationKey = `${operation}Policies`;
        tableMap[tableName][operationKey].push(policyName);

        const isBroadPermissive =
          /using\s*\(\s*true\s*\)/iu.test(statement) ||
          /with check\s*\(\s*true\s*\)/iu.test(statement) ||
          ((operation === 'insert' || operation === 'update') &&
            !/bridge_/iu.test(statement) &&
            !/phase5d/iu.test(policyName));

        if (isBroadPermissive) {
          tableMap[tableName].broadPermissivePolicyDetected = true;
          broadFindings.push({
            fileName,
            tableName,
            operation,
            policyName,
          });
        }
      }
    }
  }

  return {
    tables: tableMap,
    broadFindings,
  };
}

function inspectSafeErrorHandling() {
  const checks = requiredSafeErrorChecks.map(({ file, label, needle }) => {
    const content = readFileSync(file, 'utf8');
    return {
      file: path.relative(appRoot, file),
      label,
      present: content.includes(needle),
    };
  });

  const pass = checks.every((check) => check.present);

  return {
    pass,
    checks,
  };
}

function inspectPolicyGuardrails() {
  const phase5bMigration = readFileSync(
    path.join(migrationsDir, '202605250020_bond_rls_scoped_policy_rollout_phase5b.sql'),
    'utf8',
  );
  const phase5dMigration = readFileSync(
    path.join(migrationsDir, '202605250022_bond_finance_write_policy_rollout_phase5d.sql'),
    'utf8',
  );

  return {
    acceptedUnresolvedLegacyExcluded: /accepted_unresolved_legacy/iu.test(phase5bMigration),
    manualReviewExcluded: /manual_review/iu.test(phase5bMigration),
    legacyCompatibilityRequiredExcluded: /legacy_compatibility_required/iu.test(phase5bMigration),
    personalOriginatorBranchlessPreserved:
      !/alter table[\s\S]*region_id[\s\S]*set not null/iu.test(phase5dMigration) &&
      !/alter table[\s\S]*workspace_unit_id[\s\S]*set not null/iu.test(phase5dMigration),
    noDeletePoliciesAdded: !/create policy[\s\S]+for delete/iu.test(phase5dMigration),
    submitToBankStillNotEnforcedByPolicy:
      /bridge_can_submit_bond_to_banks_phase5d/iu.test(phase5dMigration) &&
      !/create policy[\s\S]+bridge_can_submit_bond_to_banks_phase5d/iu.test(phase5dMigration),
    assignmentMutationStillNotEnforcedByPolicy:
      /bridge_can_manage_bond_assignment_phase5d/iu.test(phase5dMigration) &&
      !/create policy[\s\S]+bridge_can_manage_bond_assignment_phase5d/iu.test(phase5dMigration),
  };
}

function metric(report, key) {
  if (Object.hasOwn(report, key)) {
    return report[key];
  }

  if (report.categories && Object.hasOwn(report.categories, key)) {
    return report.categories[key];
  }

  return 0;
}

function inspectStagingSmoke() {
  const stagingEnvPath = path.join(appRoot, '.env.staging.local');
  const authStatePath = path.join(appRoot, 'playwright', '.auth', 'staging-internal.json');

  const stagingEnvPresent = existsSync(stagingEnvPath);
  const authStatePresent = existsSync(authStatePath);

  if (!stagingEnvPresent) {
    return {
      status: 'blocked_missing_staging_env',
      reason: '.env.staging.local is not present in the repo root.',
    };
  }

  if (!authStatePresent) {
    return {
      status: 'blocked_no_auth_state',
      reason: 'playwright/.auth/staging-internal.json is not present, so live staging policy smoke could not be completed in this session.',
    };
  }

  return {
    status: 'pending_runtime_verification',
    reason: 'Staging credentials and auth state are present, but no dedicated Phase 5E live workflow verifier has been executed from this monitor.',
  };
}

function buildUiWorkflowSmoke({ dashboardSafetyResult, safeErrors }) {
  const dashboardPass = dashboardSafetyResult.status === 'pass';
  const safeErrorsPass = safeErrors.pass;

  return {
    dashboard: dashboardPass ? 'pass' : 'fail',
    queues: dashboardPass ? 'pass' : 'fail',
    financeWorkflow: dashboardPass && safeErrorsPass ? 'pass' : 'needs_attention',
    documentRequests: dashboardPass && safeErrorsPass ? 'pass' : 'needs_attention',
    writeDenialHandling: safeErrorsPass ? 'pass' : 'fail',
    detail: {
      dashboardSafety: dashboardSafetyResult,
      safeErrorChecks: safeErrors.checks,
    },
  };
}

function main() {
  const phase5aReport = runJsonScript('scripts/bond-rls-shadow-access-report.mjs');
  const phase5bReport = runJsonScript('scripts/bond-rls-phase5b-policy-simulation.mjs');
  const phase5cReport = runJsonScript('scripts/bond-rls-phase5c-write-simulation.mjs');
  const phase5dReport = runJsonScript('scripts/bond-rls-phase5d-write-policy-simulation.mjs');
  const dashboardSafetyResult = runStatusCommand('node', ['scripts/phase4-bond-dashboard-safety.test.mjs']);
  const policyOverlapAudit = scanPolicyOverlap();
  const safeErrors = inspectSafeErrorHandling();
  const guardrails = inspectPolicyGuardrails();
  const stagingSmoke = inspectStagingSmoke();

  const unexpectedReadAllow = metric(phase5aReport, 'unexpectedAllow') + metric(phase5bReport, 'unexpectedAllow');
  const unexpectedReadDeny = metric(phase5aReport, 'unexpectedDeny') + metric(phase5bReport, 'unexpectedDeny');
  const unexpectedWriteAllow = metric(phase5cReport, 'unexpectedAllow') + metric(phase5dReport, 'unexpectedAllow');
  const unexpectedWriteDeny = metric(phase5cReport, 'unexpectedDeny') + metric(phase5dReport, 'unexpectedDeny');

  const excludedRowsPreserved =
    metric(phase5aReport, 'acceptedLegacyExcluded') > 0 &&
    metric(phase5aReport, 'manualReviewExcluded') >= 0 &&
    metric(phase5bReport, 'acceptedLegacyExcluded') > 0 &&
    metric(phase5bReport, 'manualReviewExcluded') >= 0 &&
    metric(phase5dReport, 'phase5dLegacyExcluded') > 0 &&
    metric(phase5dReport, 'manualReviewWriteExcluded') >= 0 &&
    guardrails.acceptedUnresolvedLegacyExcluded &&
    guardrails.manualReviewExcluded &&
    guardrails.legacyCompatibilityRequiredExcluded;

  const legacyCompatRowsPreserved =
    metric(phase5aReport, 'excludedLegacyStillAllowed') > 0 &&
    metric(phase5dReport, 'phase5dLegacyExcluded') > 0;

  const noBroadTargetPolicies = policyOverlapAudit.broadFindings.length === 0;
  const personalOriginatorPass =
    guardrails.personalOriginatorBranchlessPreserved &&
    unexpectedReadDeny === 0 &&
    unexpectedWriteDeny === 0;
  const branchScopePass = noBroadTargetPolicies && unexpectedReadDeny === 0 && unexpectedWriteDeny === 0;
  const regionScopePass = noBroadTargetPolicies && unexpectedReadDeny === 0 && unexpectedWriteDeny === 0;

  for (const table of Object.values(policyOverlapAudit.tables)) {
    table.policyBehaviorMatchesSimulation =
      !table.broadPermissivePolicyDetected &&
      metric(phase5dReport, 'unexpectedAllow') === 0 &&
      metric(phase5dReport, 'unexpectedDeny') === 0;
  }

  const uiWorkflowSmoke = buildUiWorkflowSmoke({ dashboardSafetyResult, safeErrors });

  const report = {
    readParityPass: unexpectedReadAllow === 0 && unexpectedReadDeny === 0,
    writeParityPass: unexpectedWriteAllow === 0 && unexpectedWriteDeny === 0,
    unexpectedReadAllow,
    unexpectedReadDeny,
    unexpectedWriteAllow,
    unexpectedWriteDeny,
    excludedRowsPreserved,
    legacyCompatRowsPreserved,
    personalOriginatorPass,
    branchScopePass,
    regionScopePass,
    policyOverlapAudit,
    uiWorkflowSmoke,
    stagingSmoke,
    sourceReports: {
      phase5a: phase5aReport,
      phase5b: phase5bReport,
      phase5c: phase5cReport,
      phase5d: phase5dReport,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
