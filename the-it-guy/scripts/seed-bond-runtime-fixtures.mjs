import fs from 'node:fs'
import path from 'node:path'

export const BOND_RUNTIME_FIXTURE_NAMESPACE = 'bond_runtime_phase5h'
export const DEFAULT_METADATA_PATH = process.env.BOND_RUNTIME_FIXTURE_METADATA || '/tmp/bond-runtime-fixtures.json'

function boolFromEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return String(value).trim().toLowerCase() === 'true'
}

function nowIso() {
  return new Date().toISOString()
}

function makeJwt(payload = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.`
}

export function resolveExecutionMode(env = process.env) {
  const apply = boolFromEnv(env.BOND_RUNTIME_FIXTURE_APPLY, false)
  const dryRun = apply ? false : boolFromEnv(env.BOND_RUNTIME_FIXTURE_DRY_RUN, true)

  if (!apply && dryRun === false) {
    throw new Error('Refusing to write Bond runtime fixtures without BOND_RUNTIME_FIXTURE_APPLY=true')
  }

  return { apply, dryRun }
}

export function buildFixturePlan(env = process.env) {
  const { apply, dryRun } = resolveExecutionMode(env)
  const createdAt = nowIso()
  const ids = {
    companyWorkspace: 'b0bd5000-0000-4000-8000-000000000001',
    personalWorkspace: 'b0bd5000-0000-4000-8000-000000000002',
    unrelatedWorkspace: 'b0bd5000-0000-4000-8000-000000000003',
    region: 'b0bd5000-0000-4000-8000-000000000010',
    branch: 'b0bd5000-0000-4000-8000-000000000011',
    team: 'b0bd5000-0000-4000-8000-000000000012',
    owner: 'b0bd5000-0000-4000-8000-000000000101',
    director: 'b0bd5000-0000-4000-8000-000000000102',
    hqManager: 'b0bd5000-0000-4000-8000-000000000103',
    regionalManager: 'b0bd5000-0000-4000-8000-000000000104',
    branchManager: 'b0bd5000-0000-4000-8000-000000000105',
    consultant: 'b0bd5000-0000-4000-8000-000000000106',
    processor: 'b0bd5000-0000-4000-8000-000000000107',
    compliance: 'b0bd5000-0000-4000-8000-000000000108',
    participantOnly: 'b0bd5000-0000-4000-8000-000000000109',
    unrelatedUser: 'b0bd5000-0000-4000-8000-000000000110',
    personalOriginatorOwner: 'b0bd5000-0000-4000-8000-000000000111',
  }

  const workspaces = [
    {
      workspaceKey: 'bond_company',
      workspaceId: ids.companyWorkspace,
      workspaceName: 'Bond Runtime Test Company',
      workspaceType: 'bond_originator',
      workspaceKind: 'bond_company',
    },
    {
      workspaceKey: 'personal_originator',
      workspaceId: ids.personalWorkspace,
      workspaceName: 'Bond Runtime Personal Originator',
      workspaceType: 'bond_originator',
      workspaceKind: 'personal_originator',
    },
    {
      workspaceKey: 'unrelated_bond_workspace',
      workspaceId: ids.unrelatedWorkspace,
      workspaceName: 'Bond Runtime Unrelated Workspace',
      workspaceType: 'bond_originator',
      workspaceKind: 'bond_company',
    },
  ]

  const hierarchy = {
    hq: {
      workspaceId: ids.companyWorkspace,
      label: 'HQ',
    },
    region: {
      id: ids.region,
      workspaceId: ids.companyWorkspace,
      name: 'Gauteng Region',
      code: 'GAUTENG',
    },
    branch: {
      id: ids.branch,
      workspaceId: ids.companyWorkspace,
      regionId: ids.region,
      unitType: 'branch',
      name: 'Sandton Branch',
      code: 'SANDTON',
    },
    team: {
      id: ids.team,
      workspaceId: ids.companyWorkspace,
      regionId: ids.region,
      parentUnitId: ids.branch,
      unitType: 'team',
      name: 'Processing Team A',
      code: 'TEAM_A',
    },
  }

  const users = [
    {
      roleKey: 'owner',
      userId: ids.owner,
      email: 'bond-runtime+owner@bridgenine.co.za',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      workspaceType: 'bond_originator',
      workspaceRole: 'owner',
      scopeLevel: 'workspace_hq',
      regionId: null,
      workspaceUnitId: null,
      activeMembership: true,
    },
    {
      roleKey: 'director',
      userId: ids.director,
      email: 'bond-runtime+director@bridgenine.co.za',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      workspaceType: 'bond_originator',
      workspaceRole: 'director',
      scopeLevel: 'workspace_hq',
      regionId: null,
      workspaceUnitId: null,
      activeMembership: true,
    },
    {
      roleKey: 'hq_manager',
      userId: ids.hqManager,
      email: 'bond-runtime+hq-manager@bridgenine.co.za',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      workspaceType: 'bond_originator',
      workspaceRole: 'hq_manager',
      scopeLevel: 'workspace_hq',
      regionId: null,
      workspaceUnitId: null,
      activeMembership: true,
    },
    {
      roleKey: 'regional_manager',
      userId: ids.regionalManager,
      email: 'bond-runtime+regional-manager@bridgenine.co.za',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      workspaceType: 'bond_originator',
      workspaceRole: 'regional_manager',
      scopeLevel: 'region',
      regionId: ids.region,
      workspaceUnitId: null,
      activeMembership: true,
    },
    {
      roleKey: 'branch_manager',
      userId: ids.branchManager,
      email: 'bond-runtime+branch-manager@bridgenine.co.za',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      workspaceType: 'bond_originator',
      workspaceRole: 'branch_manager',
      scopeLevel: 'branch',
      regionId: ids.region,
      workspaceUnitId: ids.branch,
      activeMembership: true,
    },
    {
      roleKey: 'consultant',
      userId: ids.consultant,
      email: 'bond-runtime+consultant@bridgenine.co.za',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      workspaceType: 'bond_originator',
      workspaceRole: 'consultant',
      scopeLevel: 'assigned',
      regionId: ids.region,
      workspaceUnitId: ids.branch,
      activeMembership: true,
    },
    {
      roleKey: 'processor',
      userId: ids.processor,
      email: 'bond-runtime+processor@bridgenine.co.za',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      workspaceType: 'bond_originator',
      workspaceRole: 'processor',
      scopeLevel: 'team',
      regionId: ids.region,
      workspaceUnitId: ids.team,
      activeMembership: true,
    },
    {
      roleKey: 'compliance',
      userId: ids.compliance,
      email: 'bond-runtime+compliance@bridgenine.co.za',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      workspaceType: 'bond_originator',
      workspaceRole: 'compliance',
      scopeLevel: 'workspace_hq',
      regionId: null,
      workspaceUnitId: null,
      activeMembership: true,
    },
    {
      roleKey: 'participant_only',
      userId: ids.participantOnly,
      email: 'bond-runtime+participant@bridgenine.co.za',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      workspaceType: 'bond_originator',
      workspaceRole: 'admin_staff',
      scopeLevel: 'assigned',
      regionId: ids.region,
      workspaceUnitId: ids.branch,
      activeMembership: true,
    },
    {
      roleKey: 'unrelated_user',
      userId: ids.unrelatedUser,
      email: 'bond-runtime+unrelated@bridgenine.co.za',
      workspaceId: ids.unrelatedWorkspace,
      workspaceKind: 'bond_company',
      workspaceType: 'bond_originator',
      workspaceRole: 'owner',
      scopeLevel: 'workspace_hq',
      regionId: null,
      workspaceUnitId: null,
      activeMembership: true,
    },
    {
      roleKey: 'personal_originator_owner',
      userId: ids.personalOriginatorOwner,
      email: 'bond-runtime+personal-originator@bridgenine.co.za',
      workspaceId: ids.personalWorkspace,
      workspaceKind: 'personal_originator',
      workspaceType: 'bond_originator',
      workspaceRole: 'owner',
      scopeLevel: 'workspace_hq',
      regionId: null,
      workspaceUnitId: null,
      activeMembership: true,
    },
  ]

  const applications = [
    {
      applicationKey: 'consultant_assigned',
      transactionId: 'b0bd5000-0000-4000-8000-000000001001',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      canonicalReady: true,
      exclusionType: null,
      assignedConsultantUserId: ids.consultant,
      assignedProcessorUserId: ids.processor,
      assignedManagerUserId: ids.branchManager,
      assignedComplianceUserId: null,
      regionId: ids.region,
      workspaceUnitId: ids.branch,
      assignedBondOriginatorEmail: 'bond-runtime+consultant@bridgenine.co.za',
      bondOriginator: 'Bond Runtime Consultant',
      expectedRuntimeScenarios: ['dashboard_visibility', 'document_requests', 'submit_to_bank_denied_without_explicit_permission'],
    },
    {
      applicationKey: 'processor_assigned',
      transactionId: 'b0bd5000-0000-4000-8000-000000001002',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      canonicalReady: true,
      exclusionType: null,
      assignedConsultantUserId: ids.consultant,
      assignedProcessorUserId: ids.processor,
      assignedManagerUserId: ids.branchManager,
      assignedComplianceUserId: null,
      regionId: ids.region,
      workspaceUnitId: ids.team,
      assignedBondOriginatorEmail: 'bond-runtime+consultant@bridgenine.co.za',
      bondOriginator: 'Bond Runtime Consultant',
      expectedRuntimeScenarios: ['processing_queue', 'bank_feedback', 'processing_step_update'],
    },
    {
      applicationKey: 'compliance_assigned',
      transactionId: 'b0bd5000-0000-4000-8000-000000001003',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      canonicalReady: true,
      exclusionType: null,
      assignedConsultantUserId: ids.consultant,
      assignedProcessorUserId: ids.processor,
      assignedManagerUserId: ids.branchManager,
      assignedComplianceUserId: ids.compliance,
      regionId: ids.region,
      workspaceUnitId: ids.branch,
      assignedBondOriginatorEmail: 'bond-runtime+consultant@bridgenine.co.za',
      bondOriginator: 'Bond Runtime Consultant',
      expectedRuntimeScenarios: ['compliance_queue', 'review_compliance', 'submit_to_bank_denied'],
    },
    {
      applicationKey: 'branch_scoped',
      transactionId: 'b0bd5000-0000-4000-8000-000000001004',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      canonicalReady: true,
      exclusionType: null,
      assignedConsultantUserId: ids.consultant,
      assignedProcessorUserId: ids.processor,
      assignedManagerUserId: ids.branchManager,
      assignedComplianceUserId: null,
      regionId: ids.region,
      workspaceUnitId: ids.branch,
      assignedBondOriginatorEmail: 'bond-runtime+consultant@bridgenine.co.za',
      bondOriginator: 'Bond Runtime Consultant',
      expectedRuntimeScenarios: ['branch_assignment_allowed', 'outside_branch_denied'],
    },
    {
      applicationKey: 'region_scoped',
      transactionId: 'b0bd5000-0000-4000-8000-000000001005',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      canonicalReady: true,
      exclusionType: null,
      assignedConsultantUserId: ids.consultant,
      assignedProcessorUserId: ids.processor,
      assignedManagerUserId: ids.branchManager,
      assignedComplianceUserId: null,
      regionId: ids.region,
      workspaceUnitId: ids.branch,
      assignedBondOriginatorEmail: 'bond-runtime+consultant@bridgenine.co.za',
      bondOriginator: 'Bond Runtime Consultant',
      expectedRuntimeScenarios: ['regional_scope_allowed', 'outside_region_denied'],
    },
    {
      applicationKey: 'hq_visible',
      transactionId: 'b0bd5000-0000-4000-8000-000000001006',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      canonicalReady: true,
      exclusionType: null,
      assignedConsultantUserId: ids.consultant,
      assignedProcessorUserId: ids.processor,
      assignedManagerUserId: ids.branchManager,
      assignedComplianceUserId: ids.compliance,
      regionId: ids.region,
      workspaceUnitId: ids.branch,
      assignedBondOriginatorEmail: 'bond-runtime+consultant@bridgenine.co.za',
      bondOriginator: 'Bond Runtime Consultant',
      expectedRuntimeScenarios: ['hq_dashboard', 'submit_to_bank_allowed_with_permission', 'assignment_mutation_hq'],
    },
    {
      applicationKey: 'personal_originator',
      transactionId: 'b0bd5000-0000-4000-8000-000000001007',
      workspaceId: ids.personalWorkspace,
      workspaceKind: 'personal_originator',
      canonicalReady: true,
      exclusionType: null,
      assignedConsultantUserId: ids.personalOriginatorOwner,
      assignedProcessorUserId: null,
      assignedManagerUserId: null,
      assignedComplianceUserId: null,
      regionId: null,
      workspaceUnitId: null,
      assignedBondOriginatorEmail: 'bond-runtime+personal-originator@bridgenine.co.za',
      bondOriginator: 'Bond Runtime Personal Originator',
      expectedRuntimeScenarios: ['personal_dashboard', 'branchless_workflow_mutation'],
    },
    {
      applicationKey: 'legacy_email_only',
      transactionId: 'b0bd5000-0000-4000-8000-000000001008',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      canonicalReady: false,
      exclusionType: 'legacy_compatibility_required',
      assignedConsultantUserId: null,
      assignedProcessorUserId: null,
      assignedManagerUserId: null,
      assignedComplianceUserId: null,
      regionId: ids.region,
      workspaceUnitId: ids.branch,
      assignedBondOriginatorEmail: 'bond-runtime+consultant@bridgenine.co.za',
      bondOriginator: 'Legacy Email Only Bond Originator',
      expectedRuntimeScenarios: ['legacy_fallback_visibility'],
    },
    {
      applicationKey: 'participant_only',
      transactionId: 'b0bd5000-0000-4000-8000-000000001009',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      canonicalReady: true,
      exclusionType: null,
      assignedConsultantUserId: ids.consultant,
      assignedProcessorUserId: ids.processor,
      assignedManagerUserId: ids.branchManager,
      assignedComplianceUserId: null,
      regionId: ids.region,
      workspaceUnitId: ids.branch,
      assignedBondOriginatorEmail: 'bond-runtime+consultant@bridgenine.co.za',
      bondOriginator: 'Bond Runtime Consultant',
      expectedRuntimeScenarios: ['participant_read_only', 'participant_submit_denied'],
    },
    {
      applicationKey: 'accepted_unresolved_legacy',
      transactionId: 'b0bd5000-0000-4000-8000-000000001010',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      canonicalReady: false,
      exclusionType: 'accepted_unresolved_legacy',
      assignedConsultantUserId: ids.consultant,
      assignedProcessorUserId: ids.processor,
      assignedManagerUserId: null,
      assignedComplianceUserId: null,
      regionId: ids.region,
      workspaceUnitId: ids.branch,
      assignedBondOriginatorEmail: 'bond-runtime+consultant@bridgenine.co.za',
      bondOriginator: 'Accepted Legacy Bond Originator',
      expectedRuntimeScenarios: ['excluded_legacy_path'],
    },
    {
      applicationKey: 'manual_review',
      transactionId: 'b0bd5000-0000-4000-8000-000000001011',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      canonicalReady: false,
      exclusionType: 'manual_review',
      assignedConsultantUserId: ids.consultant,
      assignedProcessorUserId: ids.processor,
      assignedManagerUserId: null,
      assignedComplianceUserId: ids.compliance,
      regionId: ids.region,
      workspaceUnitId: ids.branch,
      assignedBondOriginatorEmail: 'bond-runtime+consultant@bridgenine.co.za',
      bondOriginator: 'Manual Review Bond Originator',
      expectedRuntimeScenarios: ['manual_review_exclusion'],
    },
    {
      applicationKey: 'unrelated_application',
      transactionId: 'b0bd5000-0000-4000-8000-000000001012',
      workspaceId: ids.companyWorkspace,
      workspaceKind: 'bond_company',
      canonicalReady: true,
      exclusionType: null,
      assignedConsultantUserId: ids.consultant,
      assignedProcessorUserId: ids.processor,
      assignedManagerUserId: ids.branchManager,
      assignedComplianceUserId: null,
      regionId: ids.region,
      workspaceUnitId: ids.branch,
      assignedBondOriginatorEmail: 'bond-runtime+consultant@bridgenine.co.za',
      bondOriginator: 'Bond Runtime Consultant',
      expectedRuntimeScenarios: ['unrelated_user_denied'],
    },
  ]

  const supportingRecords = {
    transaction_subprocesses: applications.map((item) => ({
      id: `${item.transactionId}-subprocess-finance`,
      transaction_id: item.transactionId,
      process_type: 'bond_finance',
      status: item.exclusionType ? 'legacy_review' : 'active',
      workspace_id: item.workspaceId,
      created_at: createdAt,
      updated_at: createdAt,
    })),
    transaction_subprocess_steps: applications.flatMap((item) => [
      {
        id: `${item.transactionId}-step-processing`,
        transaction_id: item.transactionId,
        step_key: 'processing_review',
        status: 'pending',
        created_at: createdAt,
        updated_at: createdAt,
      },
      {
        id: `${item.transactionId}-step-compliance`,
        transaction_id: item.transactionId,
        step_key: 'compliance_review',
        status: item.assignedComplianceUserId ? 'in_progress' : 'pending',
        created_at: createdAt,
        updated_at: createdAt,
      },
    ]),
    transaction_finance_details: applications.map((item) => ({
      id: `${item.transactionId}-finance`,
      transaction_id: item.transactionId,
      bank_submission_status: 'draft',
      workflow_state: item.exclusionType ? 'legacy_compatibility' : 'canonical_ready',
      created_at: createdAt,
      updated_at: createdAt,
    })),
    document_requests: applications.map((item) => ({
      id: `${item.transactionId}-doc-request`,
      transaction_id: item.transactionId,
      request_type: 'bond_finance_supporting_docs',
      status: 'open',
      created_at: createdAt,
      updated_at: createdAt,
    })),
    documents: applications.map((item) => ({
      id: `${item.transactionId}-document`,
      transaction_id: item.transactionId,
      document_type: 'bond_finance_checklist',
      status: 'placeholder',
      created_at: createdAt,
      updated_at: createdAt,
    })),
    transaction_events: applications.map((item) => ({
      id: `${item.transactionId}-event`,
      transaction_id: item.transactionId,
      event_type: 'bond_runtime_fixture_seeded',
      created_at: createdAt,
    })),
    transaction_notifications: applications.map((item) => ({
      id: `${item.transactionId}-notification`,
      transaction_id: item.transactionId,
      notification_type: 'bond_runtime_fixture_ready',
      status: 'queued',
      created_at: createdAt,
      updated_at: createdAt,
    })),
    transaction_participants: applications.flatMap((item) => {
      const participants = []
      if (item.assignedConsultantUserId) {
        participants.push({
          id: `${item.transactionId}-participant-consultant`,
          transaction_id: item.transactionId,
          role: 'bond_originator',
          user_id: item.assignedConsultantUserId,
          participant_email: item.assignedBondOriginatorEmail,
        })
      }
      if (item.assignedProcessorUserId) {
        participants.push({
          id: `${item.transactionId}-participant-processor`,
          transaction_id: item.transactionId,
          role: 'processor',
          user_id: item.assignedProcessorUserId,
          participant_email: 'bond-runtime+processor@bridgenine.co.za',
        })
      }
      if (item.applicationKey === 'participant_only') {
        participants.push({
          id: `${item.transactionId}-participant-only`,
          transaction_id: item.transactionId,
          role: 'observer',
          user_id: ids.participantOnly,
          participant_email: 'bond-runtime+participant@bridgenine.co.za',
        })
      }
      return participants
    }),
    transaction_role_players: applications.flatMap((item) => {
      const rows = []
      if (item.assignedConsultantUserId) {
        rows.push({
          id: `${item.transactionId}-role-consultant`,
          transaction_id: item.transactionId,
          role_key: 'bond_consultant',
          user_id: item.assignedConsultantUserId,
          email: item.assignedBondOriginatorEmail,
        })
      }
      if (item.assignedProcessorUserId) {
        rows.push({
          id: `${item.transactionId}-role-processor`,
          transaction_id: item.transactionId,
          role_key: 'bond_processor',
          user_id: item.assignedProcessorUserId,
          email: 'bond-runtime+processor@bridgenine.co.za',
        })
      }
      if (item.assignedComplianceUserId) {
        rows.push({
          id: `${item.transactionId}-role-compliance`,
          transaction_id: item.transactionId,
          role_key: 'bond_compliance',
          user_id: item.assignedComplianceUserId,
          email: 'bond-runtime+compliance@bridgenine.co.za',
        })
      }
      return rows
    }),
  }

  return {
    fixtureNamespace: BOND_RUNTIME_FIXTURE_NAMESPACE,
    executionMode: apply ? 'apply' : 'dry_run',
    dryRun,
    applyRequested: apply,
    workspaceType: 'bond_originator',
    createdAt,
    metadataPath: env.BOND_RUNTIME_FIXTURE_METADATA || DEFAULT_METADATA_PATH,
    authStatePath: env.BOND_RUNTIME_AUTH_STATE_PATH || '/tmp/bond-runtime-auth-state.json',
    workspaces,
    hierarchy,
    users,
    applications,
    excludedRows: applications
      .filter((item) => item.exclusionType)
      .map((item) => ({ applicationKey: item.applicationKey, transactionId: item.transactionId, exclusionType: item.exclusionType })),
    supportingRecords,
    suggestedAuthEnv: users.map((item) => ({
      roleKey: item.roleKey,
      email: item.email,
      passwordEnvVar: `BOND_RUNTIME_AUTH_PASSWORD_${item.roleKey.toUpperCase()}`,
    })),
    sampleAuthState: {
      email: 'bond-runtime+consultant@bridgenine.co.za',
      userId: ids.consultant,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      accessToken: makeJwt({
        sub: ids.consultant,
        email: 'bond-runtime+consultant@bridgenine.co.za',
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
        user_metadata: { fixture_namespace: BOND_RUNTIME_FIXTURE_NAMESPACE },
      }),
    },
  }
}

export function writeFixtureMetadata(plan, outputPath = plan.metadataPath || DEFAULT_METADATA_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`)
  return outputPath
}

function main() {
  const plan = buildFixturePlan(process.env)
  const outputPath = writeFixtureMetadata(plan)
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        fixtureNamespace: plan.fixtureNamespace,
        executionMode: plan.executionMode,
        dryRun: plan.dryRun,
        applyRequested: plan.applyRequested,
        metadataPath: outputPath,
        workspaceCount: plan.workspaces.length,
        userCount: plan.users.length,
        applicationCount: plan.applications.length,
        excludedRowCount: plan.excludedRows.length,
      },
      null,
      2,
    )}\n`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
