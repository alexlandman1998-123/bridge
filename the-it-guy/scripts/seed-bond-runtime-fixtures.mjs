import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const BOND_RUNTIME_FIXTURE_NAMESPACE = 'bond_runtime_phase5h'
export const BOND_RUNTIME_FIXTURE_PHASE = 'phase5h_runtime'
export const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
export const DEFAULT_METADATA_PATH = '/tmp/bond-runtime-fixtures.json'

const DEFAULT_TARGET = 'staging'
const DEFAULT_WORKSPACE_TYPE = 'bond_originator'
const DEFAULT_PERSONAL_WORKSPACE_NAME = 'Bond Runtime Personal Originator'
const DEFAULT_COMPANY_WORKSPACE_NAME = 'Bond Runtime Test Company'
const DEFAULT_REGION_NAME = 'Gauteng Region'
const DEFAULT_BRANCH_NAME = 'Sandton Branch'
const DEFAULT_TEAM_NAME = 'Processing Team A'

const REQUIRED_APPLICATION_KEYS = [
  'canonical_consultant_assigned',
  'canonical_processor_assigned',
  'canonical_compliance_assigned',
  'branch_scoped',
  'region_scoped',
  'hq_visible',
  'personal_originator_application',
  'legacy_email_only',
  'participant_only',
  'accepted_unresolved_legacy',
  'manual_review',
  'unrelated_application',
]

const OPTIONAL_COLUMNS_BY_TABLE = {
  organisations: ['slug', 'display_name', 'workspace_type', 'workspace_kind', 'type', 'metadata', 'active'],
  workspace_regions: ['description', 'manager_user_id', 'active', 'metadata'],
  workspace_units: ['description', 'manager_user_id', 'active', 'metadata', 'parent_unit_id'],
  organisation_users: [
    'branch_id',
    'primary_branch_id',
    'branch_scope',
    'workspace_role',
    'organisation_role',
    'app_role',
    'workspace_type',
    'scope_level',
    'region_id',
    'workspace_unit_id',
    'scope_metadata',
    'is_primary_owner',
    'active_workspace_selected_at',
    'invited_at',
    'accepted_at',
    'joined_at',
    'first_name',
    'last_name',
  ],
  transactions: [
    'transaction_type',
    'finance_type',
    'lifecycle_state',
    'stage',
    'current_main_stage',
    'current_sub_stage_summary',
    'is_active',
    'bond_workspace_id',
    'bond_region_id',
    'bond_workspace_unit_id',
    'primary_bond_consultant_user_id',
    'assigned_bond_processor_user_id',
    'assigned_bond_manager_user_id',
    'assigned_bond_compliance_user_id',
    'bond_assignment_status',
    'bond_assignment_source',
    'assigned_bond_originator_email',
    'bond_originator',
    'next_action',
    'metadata',
  ],
  transaction_subprocesses: ['created_at', 'updated_at'],
  transaction_subprocess_steps: ['created_at', 'updated_at', 'comment', 'completed_at'],
  transaction_finance_details: [
    'proof_of_funds_received',
    'deposit_required',
    'deposit_paid',
    'bond_submitted',
    'bond_approved',
    'grant_signed',
    'proceed_to_attorneys',
    'cash_portion',
    'bond_portion',
    'bond_originator',
    'bank',
    'attorney',
    'expected_transfer_date',
    'next_action',
    'updated_at',
  ],
  document_requests: [
    'description',
    'priority',
    'due_date',
    'assigned_to_role',
    'assigned_to_user_id',
    'request_group_id',
    'requires_review',
    'requested_from',
    'visibility_scope',
    'request_type',
    'notes',
    'created_by',
    'created_by_role',
    'created_at',
    'updated_at',
  ],
  documents: [
    'document_type',
    'visibility_scope',
    'uploaded_by_user_id',
    'stage_key',
    'is_client_visible',
    'uploaded_by_role',
    'uploaded_by_email',
    'created_at',
    'updated_at',
  ],
  transaction_events: ['event_data', 'created_by', 'created_by_role', 'created_at', 'updated_at'],
  transaction_notifications: ['notification_type', 'event_type', 'event_data', 'dedupe_key', 'read_at', 'updated_at'],
  transaction_participants: [
    'participant_email',
    'participant_name',
    'user_id',
    'status',
    'removed_at',
    'metadata',
    'created_at',
    'updated_at',
  ],
  transaction_role_players: [
    'selection_source',
    'preferred_partner_id',
    'partner_name',
    'contact_person',
    'email_address',
    'phone_number',
    'website',
    'physical_address',
    'province',
    'notes',
    'snapshot_json',
    'assignment_source',
    'participant_email',
    'participant_name',
    'user_id',
    'status',
    'created_at',
    'updated_at',
  ],
  bond_rls_cutover_exclusions: ['reason', 'notes', 'metadata', 'created_at', 'updated_at'],
}

const REQUIRED_COLUMNS_BY_TABLE = {
  organisations: ['id', 'name'],
  workspace_regions: ['id', 'workspace_id', 'name', 'code'],
  workspace_units: ['id', 'workspace_id', 'unit_type', 'name', 'code'],
  organisation_users: ['organisation_id', 'email', 'role', 'status'],
  transactions: ['id', 'organisation_id', 'transaction_reference'],
  transaction_subprocesses: ['transaction_id', 'process_type', 'owner_type', 'status'],
  transaction_subprocess_steps: ['subprocess_id', 'step_key', 'step_label', 'status', 'owner_type', 'sort_order'],
  transaction_finance_details: ['transaction_id'],
  document_requests: ['id', 'transaction_id', 'category', 'document_type', 'title', 'status'],
  documents: ['id', 'transaction_id', 'name', 'file_path', 'category'],
  transaction_events: ['id', 'transaction_id', 'event_type'],
  transaction_notifications: ['id', 'transaction_id', 'user_id', 'role_type', 'title', 'message', 'is_read'],
  transaction_participants: ['id', 'transaction_id', 'role_type'],
  transaction_role_players: ['id', 'transaction_id', 'role_type'],
  bond_rls_cutover_exclusions: ['id', 'transaction_id', 'exclusion_type'],
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

function loadEnv() {
  return {
    ...parseEnvFile('.env'),
    ...parseEnvFile('.env.local'),
    ...parseEnvFile('.env.staging.local'),
    ...process.env,
  }
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeSlug(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(normalizeText(value).toLowerCase())
}

function deriveProjectRef(supabaseUrl) {
  const match = normalizeText(supabaseUrl).match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)
  return match ? match[1] : ''
}

function deterministicUuid(seed) {
  const digest = crypto.createHash('sha1').update(`${BOND_RUNTIME_FIXTURE_NAMESPACE}:${seed}`).digest('hex')
  const chars = digest.slice(0, 32).split('')
  chars[12] = '4'
  chars[16] = 'a'
  const hex = chars.join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function nowIso() {
  return new Date().toISOString()
}

function buildFixtureManagedMetadata(extra = {}) {
  return {
    fixture_namespace: BOND_RUNTIME_FIXTURE_NAMESPACE,
    fixture_phase: BOND_RUNTIME_FIXTURE_PHASE,
    fixture_managed: true,
    ...extra,
  }
}

function makeCount() {
  return { rowCount: 0, ids: [], skippedColumns: [], missing: 0 }
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function prepareRowsForUpsert(table, rows = [], { knownColumns = null } = {}) {
  const requiredColumns = REQUIRED_COLUMNS_BY_TABLE[table] || []
  const optionalColumns = OPTIONAL_COLUMNS_BY_TABLE[table] || []
  if (!knownColumns) {
    return {
      rows: rows.map((row) => ({ ...row })),
      omittedColumns: [],
    }
  }

  const known = new Set([...knownColumns].filter(Boolean))
  const missingRequired = requiredColumns.filter((column) => !known.has(column))
  if (missingRequired.length) {
    throw new Error(`Bond runtime apply cannot write ${table} because required columns are missing: ${missingRequired.join(', ')}`)
  }

  const allowedColumns = new Set([...requiredColumns, ...optionalColumns].filter((column) => known.has(column)))
  const omittedColumns = unique(
    rows.flatMap((row) =>
      Object.keys(row || {}).filter((column) => !allowedColumns.has(column)),
    ),
  )

  return {
    rows: rows.map((row) =>
      Object.fromEntries(Object.entries(row || {}).filter(([column]) => allowedColumns.has(column))),
    ),
    omittedColumns,
  }
}

function createFixtureHierarchy() {
  const companyWorkspaceId = deterministicUuid('workspace:bond-company')
  const personalWorkspaceId = deterministicUuid('workspace:personal-originator')
  const regionId = deterministicUuid('region:gauteng')
  const hqUnitId = deterministicUuid('unit:hq')
  const branchId = deterministicUuid('unit:sandton-branch')
  const teamId = deterministicUuid('unit:processing-team-a')
  const unrelatedWorkspaceId = deterministicUuid('workspace:unrelated')

  return {
    workspaceType: DEFAULT_WORKSPACE_TYPE,
    personalWorkspace: {
      id: personalWorkspaceId,
      name: DEFAULT_PERSONAL_WORKSPACE_NAME,
      slug: 'bond-runtime-personal-originator',
      workspaceType: DEFAULT_WORKSPACE_TYPE,
      workspaceKind: 'personal_originator',
    },
    companyWorkspace: {
      id: companyWorkspaceId,
      name: DEFAULT_COMPANY_WORKSPACE_NAME,
      slug: 'bond-runtime-test-company',
      workspaceType: DEFAULT_WORKSPACE_TYPE,
      workspaceKind: 'bond_company',
    },
    unrelatedWorkspace: {
      id: unrelatedWorkspaceId,
      name: 'Unrelated Runtime Workspace',
      slug: 'bond-runtime-unrelated-workspace',
      workspaceType: DEFAULT_WORKSPACE_TYPE,
      workspaceKind: 'bond_company',
    },
    region: {
      id: regionId,
      workspaceId: companyWorkspaceId,
      name: DEFAULT_REGION_NAME,
      code: 'BOND-RUNTIME-GAUTENG',
    },
    hq: {
      id: hqUnitId,
      workspaceId: companyWorkspaceId,
      regionId: null,
      parentUnitId: null,
      unitType: 'hq_department',
      name: 'HQ',
      code: 'BOND-RUNTIME-HQ',
    },
    branch: {
      id: branchId,
      workspaceId: companyWorkspaceId,
      regionId,
      parentUnitId: hqUnitId,
      unitType: 'branch',
      name: DEFAULT_BRANCH_NAME,
      code: 'BOND-RUNTIME-SANDTON',
    },
    team: {
      id: teamId,
      workspaceId: companyWorkspaceId,
      regionId,
      parentUnitId: branchId,
      unitType: 'team',
      name: DEFAULT_TEAM_NAME,
      code: 'BOND-RUNTIME-PROCESSING-A',
    },
  }
}

function buildUserSpecs(env = {}, hierarchy = createFixtureHierarchy()) {
  const users = [
    {
      roleKey: 'personal_originator_owner',
      envKey: 'BOND_RUNTIME_PERSONAL_EMAIL',
      defaultEmail: 'bond-runtime+personal@bridgenine.co.za',
      displayName: 'Bond Runtime Personal Owner',
      workspaceKind: 'personal_originator',
      workspaceId: hierarchy.personalWorkspace.id,
      workspaceRole: 'owner',
      scopeLevel: 'workspace_hq',
      regionId: null,
      workspaceUnitId: null,
      membershipEnabled: true,
      requiredForRuntimeSmoke: true,
      isPrimaryOwner: true,
    },
    {
      roleKey: 'owner',
      envKey: 'BOND_RUNTIME_OWNER_EMAIL',
      defaultEmail: 'bond-runtime+owner@bridgenine.co.za',
      displayName: 'Bond Runtime Owner',
      workspaceKind: 'bond_company',
      workspaceId: hierarchy.companyWorkspace.id,
      workspaceRole: 'owner',
      scopeLevel: 'workspace_hq',
      regionId: null,
      workspaceUnitId: null,
      membershipEnabled: true,
      requiredForRuntimeSmoke: true,
      isPrimaryOwner: true,
    },
    {
      roleKey: 'director',
      envKey: 'BOND_RUNTIME_DIRECTOR_EMAIL',
      defaultEmail: 'bond-runtime+director@bridgenine.co.za',
      displayName: 'Bond Runtime Director',
      workspaceKind: 'bond_company',
      workspaceId: hierarchy.companyWorkspace.id,
      workspaceRole: 'director',
      scopeLevel: 'workspace_hq',
      regionId: null,
      workspaceUnitId: hierarchy.hq.id,
      membershipEnabled: true,
      requiredForRuntimeSmoke: true,
    },
    {
      roleKey: 'hq_manager',
      envKey: 'BOND_RUNTIME_HQ_EMAIL',
      defaultEmail: 'bond-runtime+hq@bridgenine.co.za',
      displayName: 'Bond Runtime HQ Manager',
      workspaceKind: 'bond_company',
      workspaceId: hierarchy.companyWorkspace.id,
      workspaceRole: 'hq_manager',
      scopeLevel: 'workspace_hq',
      regionId: null,
      workspaceUnitId: hierarchy.hq.id,
      membershipEnabled: true,
      requiredForRuntimeSmoke: true,
    },
    {
      roleKey: 'regional_manager',
      envKey: 'BOND_RUNTIME_REGIONAL_MANAGER_EMAIL',
      defaultEmail: 'bond-runtime+regional@bridgenine.co.za',
      displayName: 'Bond Runtime Regional Manager',
      workspaceKind: 'bond_company',
      workspaceId: hierarchy.companyWorkspace.id,
      workspaceRole: 'regional_manager',
      scopeLevel: 'region',
      regionId: hierarchy.region.id,
      workspaceUnitId: null,
      membershipEnabled: true,
      requiredForRuntimeSmoke: true,
    },
    {
      roleKey: 'branch_manager',
      envKey: 'BOND_RUNTIME_BRANCH_MANAGER_EMAIL',
      defaultEmail: 'bond-runtime+branch@bridgenine.co.za',
      displayName: 'Bond Runtime Branch Manager',
      workspaceKind: 'bond_company',
      workspaceId: hierarchy.companyWorkspace.id,
      workspaceRole: 'branch_manager',
      scopeLevel: 'branch',
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.branch.id,
      membershipEnabled: true,
      requiredForRuntimeSmoke: true,
    },
    {
      roleKey: 'consultant',
      envKey: 'BOND_RUNTIME_CONSULTANT_EMAIL',
      defaultEmail: 'bond-runtime+consultant@bridgenine.co.za',
      displayName: 'Bond Runtime Consultant',
      workspaceKind: 'bond_company',
      workspaceId: hierarchy.companyWorkspace.id,
      workspaceRole: 'consultant',
      scopeLevel: 'assigned',
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.branch.id,
      membershipEnabled: true,
      requiredForRuntimeSmoke: true,
    },
    {
      roleKey: 'processor',
      envKey: 'BOND_RUNTIME_PROCESSOR_EMAIL',
      defaultEmail: 'bond-runtime+processor@bridgenine.co.za',
      displayName: 'Bond Runtime Processor',
      workspaceKind: 'bond_company',
      workspaceId: hierarchy.companyWorkspace.id,
      workspaceRole: 'processor',
      scopeLevel: 'team',
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.team.id,
      membershipEnabled: true,
      requiredForRuntimeSmoke: true,
    },
    {
      roleKey: 'compliance',
      envKey: 'BOND_RUNTIME_COMPLIANCE_EMAIL',
      defaultEmail: 'bond-runtime+compliance@bridgenine.co.za',
      displayName: 'Bond Runtime Compliance',
      workspaceKind: 'bond_company',
      workspaceId: hierarchy.companyWorkspace.id,
      workspaceRole: 'compliance',
      scopeLevel: 'workspace_hq',
      regionId: null,
      workspaceUnitId: hierarchy.hq.id,
      membershipEnabled: true,
      requiredForRuntimeSmoke: true,
    },
    {
      roleKey: 'participant_only',
      envKey: 'BOND_RUNTIME_PARTICIPANT_EMAIL',
      defaultEmail: 'bond-runtime+participant@bridgenine.co.za',
      displayName: 'Bond Runtime Participant',
      workspaceKind: 'none',
      workspaceId: null,
      workspaceRole: null,
      scopeLevel: null,
      regionId: null,
      workspaceUnitId: null,
      membershipEnabled: false,
      requiredForRuntimeSmoke: true,
    },
    {
      roleKey: 'unrelated_user',
      envKey: 'BOND_RUNTIME_UNRELATED_EMAIL',
      defaultEmail: 'bond-runtime+unrelated@bridgenine.co.za',
      displayName: 'Bond Runtime Unrelated User',
      workspaceKind: 'none',
      workspaceId: null,
      workspaceRole: null,
      scopeLevel: null,
      regionId: null,
      workspaceUnitId: null,
      membershipEnabled: false,
      requiredForRuntimeSmoke: true,
    },
  ]

  return users.map((user) => ({
    ...user,
    email: normalizeEmail(env[user.envKey] || user.defaultEmail),
    workspaceType: DEFAULT_WORKSPACE_TYPE,
  }))
}

function createApplicationSpecs(hierarchy, usersByRole) {
  const companyWorkspaceId = hierarchy.companyWorkspace.id
  const personalWorkspaceId = hierarchy.personalWorkspace.id

  const specs = [
    {
      applicationKey: 'canonical_consultant_assigned',
      workspaceId: companyWorkspaceId,
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.branch.id,
      consultantRoleKey: 'consultant',
      processorRoleKey: 'processor',
      managerRoleKey: 'branch_manager',
      complianceRoleKey: 'compliance',
      exclusionStatus: null,
      legacyOnly: false,
    },
    {
      applicationKey: 'canonical_processor_assigned',
      workspaceId: companyWorkspaceId,
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.team.id,
      consultantRoleKey: 'consultant',
      processorRoleKey: 'processor',
      managerRoleKey: 'branch_manager',
      complianceRoleKey: 'compliance',
      exclusionStatus: null,
      legacyOnly: false,
    },
    {
      applicationKey: 'canonical_compliance_assigned',
      workspaceId: companyWorkspaceId,
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.branch.id,
      consultantRoleKey: 'consultant',
      processorRoleKey: 'processor',
      managerRoleKey: 'branch_manager',
      complianceRoleKey: 'compliance',
      exclusionStatus: null,
      legacyOnly: false,
    },
    {
      applicationKey: 'branch_scoped',
      workspaceId: companyWorkspaceId,
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.branch.id,
      consultantRoleKey: 'consultant',
      processorRoleKey: 'processor',
      managerRoleKey: 'branch_manager',
      complianceRoleKey: 'compliance',
      exclusionStatus: null,
      legacyOnly: false,
    },
    {
      applicationKey: 'region_scoped',
      workspaceId: companyWorkspaceId,
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.branch.id,
      consultantRoleKey: 'consultant',
      processorRoleKey: 'processor',
      managerRoleKey: 'regional_manager',
      complianceRoleKey: 'compliance',
      exclusionStatus: null,
      legacyOnly: false,
    },
    {
      applicationKey: 'hq_visible',
      workspaceId: companyWorkspaceId,
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.hq.id,
      consultantRoleKey: 'consultant',
      processorRoleKey: 'processor',
      managerRoleKey: 'hq_manager',
      complianceRoleKey: 'compliance',
      exclusionStatus: null,
      legacyOnly: false,
    },
    {
      applicationKey: 'personal_originator_application',
      workspaceId: personalWorkspaceId,
      regionId: null,
      workspaceUnitId: null,
      consultantRoleKey: 'personal_originator_owner',
      processorRoleKey: null,
      managerRoleKey: 'personal_originator_owner',
      complianceRoleKey: null,
      exclusionStatus: null,
      legacyOnly: false,
    },
    {
      applicationKey: 'legacy_email_only',
      workspaceId: companyWorkspaceId,
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.branch.id,
      consultantRoleKey: null,
      processorRoleKey: null,
      managerRoleKey: null,
      complianceRoleKey: null,
      exclusionStatus: 'legacy_compatibility_required',
      legacyOnly: true,
    },
    {
      applicationKey: 'participant_only',
      workspaceId: companyWorkspaceId,
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.branch.id,
      consultantRoleKey: 'consultant',
      processorRoleKey: 'processor',
      managerRoleKey: 'branch_manager',
      complianceRoleKey: 'compliance',
      participantOnlyRoleKey: 'participant_only',
      exclusionStatus: null,
      legacyOnly: false,
    },
    {
      applicationKey: 'accepted_unresolved_legacy',
      workspaceId: companyWorkspaceId,
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.branch.id,
      consultantRoleKey: 'consultant',
      processorRoleKey: 'processor',
      managerRoleKey: 'branch_manager',
      complianceRoleKey: 'compliance',
      exclusionStatus: 'accepted_unresolved_legacy',
      legacyOnly: true,
    },
    {
      applicationKey: 'manual_review',
      workspaceId: companyWorkspaceId,
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.branch.id,
      consultantRoleKey: 'consultant',
      processorRoleKey: 'processor',
      managerRoleKey: 'branch_manager',
      complianceRoleKey: 'compliance',
      exclusionStatus: 'manual_review',
      legacyOnly: true,
    },
    {
      applicationKey: 'unrelated_application',
      workspaceId: companyWorkspaceId,
      regionId: hierarchy.region.id,
      workspaceUnitId: hierarchy.branch.id,
      consultantRoleKey: 'consultant',
      processorRoleKey: 'processor',
      managerRoleKey: 'branch_manager',
      complianceRoleKey: 'compliance',
      exclusionStatus: null,
      legacyOnly: false,
    },
  ]

  return specs.map((spec) => {
    const consultant = spec.consultantRoleKey ? usersByRole.get(spec.consultantRoleKey) : null
    const processor = spec.processorRoleKey ? usersByRole.get(spec.processorRoleKey) : null
    const manager = spec.managerRoleKey ? usersByRole.get(spec.managerRoleKey) : null
    const compliance = spec.complianceRoleKey ? usersByRole.get(spec.complianceRoleKey) : null
    const participant = spec.participantOnlyRoleKey ? usersByRole.get(spec.participantOnlyRoleKey) : null

    return {
      id: deterministicUuid(`transaction:${spec.applicationKey}`),
      transactionReference: `BOND-RUNTIME-${spec.applicationKey.toUpperCase()}`,
      title: `Bond Runtime ${spec.applicationKey.replace(/_/g, ' ')}`,
      workspaceType: DEFAULT_WORKSPACE_TYPE,
      ...spec,
      consultantEmail: consultant?.email || null,
      participantEmail: participant?.email || null,
      assignedBondOriginatorEmail: spec.legacyOnly ? consultant?.email || usersByRole.get('consultant')?.email || null : consultant?.email || null,
      bondOriginatorName: spec.legacyOnly ? consultant?.displayName || usersByRole.get('consultant')?.displayName || 'Bond Runtime Consultant' : consultant?.displayName || null,
      primaryBondConsultantUserId: consultant?.userId || null,
      assignedBondProcessorUserId: processor?.userId || null,
      assignedBondManagerUserId: manager?.userId || null,
      assignedBondComplianceUserId: compliance?.userId || null,
      allowedActions: [
        'dashboard_view',
        'finance_workflow_load',
        'document_request_create',
        'document_upload_update',
        'bank_feedback_manage',
      ],
      deniedActions: spec.applicationKey === 'legacy_email_only'
        ? ['canonical_assignment_mutation', 'submit_to_banks']
        : ['out_of_scope_assignment_mutation'],
    }
  })
}

function createSupportingRecordPlan(applications) {
  const subprocesses = []
  const steps = []
  const financeDetails = []
  const documentRequests = []
  const documents = []
  const events = []
  const notifications = []
  const participants = []
  const rolePlayers = []
  const exclusions = []

  for (const application of applications) {
    const subprocessId = deterministicUuid(`subprocess:${application.applicationKey}:bond`)
    subprocesses.push({
      id: subprocessId,
      transaction_id: application.id,
      process_type: 'bond',
      owner_type: 'bond_originator',
      status: 'not_started',
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    for (const [index, step] of [
      ['request_documents', 'Request documents', 'bond_originator'],
      ['processing_update', 'Processing update', 'internal'],
      ['compliance_review', 'Compliance review', 'internal'],
      ['bank_feedback', 'Bank feedback', 'internal'],
      ['submit_to_banks', 'Submit to banks', 'internal'],
    ].entries()) {
      steps.push({
        id: deterministicUuid(`step:${application.applicationKey}:${step[0]}`),
        subprocess_id: subprocessId,
        step_key: step[0],
        step_label: step[1],
        owner_type: step[2],
        status: 'not_started',
        sort_order: index + 1,
        comment: null,
        completed_at: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      })
    }

    financeDetails.push({
      transaction_id: application.id,
      proof_of_funds_received: false,
      deposit_required: true,
      deposit_paid: false,
      bond_submitted: false,
      bond_approved: false,
      grant_signed: false,
      proceed_to_attorneys: false,
      cash_portion: 0,
      bond_portion: 1000000,
      bond_originator: application.bondOriginatorName || null,
      bank: 'Bond Runtime Bank',
      attorney: null,
      expected_transfer_date: null,
      next_action: 'Runtime smoke validation',
      updated_at: nowIso(),
    })

    documentRequests.push({
      id: deterministicUuid(`document-request:${application.applicationKey}`),
      transaction_id: application.id,
      category: 'Bond Finance',
      document_type: 'income_verification',
      title: `Runtime document request ${application.applicationKey}`,
      description: 'Seeded for Phase 5H runtime validation.',
      priority: 'required',
      due_date: null,
      assigned_to_role: 'bond_originator',
      status: 'requested',
      requires_review: false,
      requested_from: 'client',
      visibility_scope: 'shared',
      request_type: 'bond_runtime',
      notes: 'Seeded by Bond runtime fixture seeder.',
      created_by: application.primaryBondConsultantUserId,
      created_by_role: 'bond_originator',
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    documents.push({
      id: deterministicUuid(`document:${application.applicationKey}`),
      transaction_id: application.id,
      name: `Runtime document ${application.applicationKey}.pdf`,
      file_path: `bond-runtime/${application.applicationKey}.pdf`,
      category: 'Bond Finance',
      document_type: 'income_verification',
      visibility_scope: 'shared',
      uploaded_by_user_id: application.primaryBondConsultantUserId,
      stage_key: 'bond',
      is_client_visible: true,
      uploaded_by_role: 'bond_originator',
      uploaded_by_email: application.assignedBondOriginatorEmail,
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    events.push({
      id: deterministicUuid(`event:${application.applicationKey}`),
      transaction_id: application.id,
      event_type: 'TransactionCreated',
      event_data: buildFixtureManagedMetadata({ application_key: application.applicationKey }),
      created_by: application.primaryBondConsultantUserId,
      created_by_role: 'bond_originator',
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    rolePlayers.push({
      id: deterministicUuid(`role-player:${application.applicationKey}:bond_originator`),
      transaction_id: application.id,
      role_type: 'bond_originator',
      selection_source: 'runtime_fixture',
      preferred_partner_id: null,
      partner_name: application.bondOriginatorName || 'Bond Runtime Consultant',
      contact_person: application.bondOriginatorName || 'Bond Runtime Consultant',
      email_address: application.assignedBondOriginatorEmail,
      phone_number: null,
      website: null,
      physical_address: null,
      province: null,
      notes: 'Seeded by runtime fixture seeder.',
      snapshot_json: buildFixtureManagedMetadata({ application_key: application.applicationKey }),
      assignment_source: 'runtime_fixture',
      participant_email: application.assignedBondOriginatorEmail,
      participant_name: application.bondOriginatorName || 'Bond Runtime Consultant',
      user_id: application.primaryBondConsultantUserId,
      status: 'active',
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    if (application.primaryBondConsultantUserId || application.assignedBondOriginatorEmail) {
      participants.push({
        id: deterministicUuid(`participant:${application.applicationKey}:bond_originator`),
        transaction_id: application.id,
        role_type: 'bond_originator',
        legal_role: 'none',
        participant_email: application.assignedBondOriginatorEmail,
        participant_name: application.bondOriginatorName || 'Bond Runtime Consultant',
        user_id: application.primaryBondConsultantUserId,
        status: 'active',
        removed_at: null,
        metadata: buildFixtureManagedMetadata({ application_key: application.applicationKey }),
        created_at: nowIso(),
        updated_at: nowIso(),
      })
    }

    if (application.participantEmail) {
      participants.push({
        id: deterministicUuid(`participant:${application.applicationKey}:participant_only`),
        transaction_id: application.id,
        role_type: 'client',
        legal_role: 'none',
        participant_email: application.participantEmail,
        participant_name: 'Bond Runtime Participant',
        user_id: null,
        status: 'active',
        removed_at: null,
        metadata: buildFixtureManagedMetadata({ application_key: application.applicationKey, participant_only: true }),
        created_at: nowIso(),
        updated_at: nowIso(),
      })
    }

    if (application.exclusionStatus) {
      exclusions.push({
        id: deterministicUuid(`exclusion:${application.applicationKey}:${application.exclusionStatus}`),
        transaction_id: application.id,
        exclusion_type: application.exclusionStatus,
        reason: `Runtime fixture ${application.exclusionStatus}`,
        notes: 'Seeded for Phase 5H runtime compatibility validation.',
        metadata: buildFixtureManagedMetadata({ application_key: application.applicationKey, exclusion_type: application.exclusionStatus }),
        created_at: nowIso(),
        updated_at: nowIso(),
      })
    }
  }

  return {
    transactionSubprocesses: subprocesses,
    transactionSubprocessSteps: steps,
    transactionFinanceDetails: financeDetails,
    documentRequests,
    documents,
    transactionEvents: events,
    transactionNotifications: notifications,
    transactionParticipants: participants,
    transactionRolePlayers: rolePlayers,
    cutoverExclusions: exclusions,
  }
}

export function buildFixturePlan(inputEnv = {}) {
  const env = {
    ...loadEnv(),
    ...inputEnv,
  }

  const applyRequested = parseBoolean(env.BOND_RUNTIME_FIXTURE_APPLY)
  const target = normalizeText(env.BOND_RUNTIME_FIXTURE_TARGET || DEFAULT_TARGET).toLowerCase() || DEFAULT_TARGET
  const dryRunExplicitlyDisabled =
    Object.prototype.hasOwnProperty.call(env, 'BOND_RUNTIME_FIXTURE_DRY_RUN') &&
    !parseBoolean(env.BOND_RUNTIME_FIXTURE_DRY_RUN)

  if (!applyRequested && dryRunExplicitlyDisabled) {
    throw new Error('BOND_RUNTIME_FIXTURE_APPLY=true is required before Bond runtime fixtures can write to staging.')
  }
  if (applyRequested && target !== 'staging') {
    throw new Error('Refusing to apply Bond runtime fixtures outside staging target.')
  }

  const executionMode = applyRequested ? 'apply' : 'dry_run'
  const hierarchy = createFixtureHierarchy()
  const users = buildUserSpecs(env, hierarchy)
  const usersByRole = new Map(users.map((user) => [user.roleKey, user]))
  const applications = createApplicationSpecs(hierarchy, usersByRole)
  const supporting = createSupportingRecordPlan(applications)

  return {
    phase: '5H-Fix-2',
    fixtureNamespace: BOND_RUNTIME_FIXTURE_NAMESPACE,
    fixturePhase: BOND_RUNTIME_FIXTURE_PHASE,
    executionMode,
    dryRun: executionMode === 'dry_run',
    applied: false,
    applyReason: executionMode === 'dry_run' ? 'fixture_not_applied' : 'real_apply_pending',
    target,
    workspaceType: DEFAULT_WORKSPACE_TYPE,
    metadataPath: normalizeText(env.BOND_RUNTIME_FIXTURE_METADATA_PATH || env.BOND_RUNTIME_FIXTURE_METADATA || DEFAULT_METADATA_PATH),
    workspaces: [
      hierarchy.personalWorkspace,
      hierarchy.companyWorkspace,
    ],
    hierarchy: {
      hq: hierarchy.hq,
      region: hierarchy.region,
      branch: hierarchy.branch,
      team: hierarchy.team,
    },
    users,
    applications,
    exclusions: supporting.cutoverExclusions.map((item) => ({
      id: item.id,
      transactionId: item.transaction_id,
      exclusionType: item.exclusion_type,
    })),
    supportingRecords: {
      transactionSubprocesses: supporting.transactionSubprocesses.map((item) => item.id),
      transactionSubprocessSteps: supporting.transactionSubprocessSteps.map((item) => item.id),
      transactionFinanceDetails: supporting.transactionFinanceDetails.map((item) => item.transaction_id),
      documentRequests: supporting.documentRequests.map((item) => item.id),
      documents: supporting.documents.map((item) => item.id),
      transactionEvents: supporting.transactionEvents.map((item) => item.id),
      transactionNotifications: supporting.transactionNotifications.map((item) => item.id),
      transactionParticipants: supporting.transactionParticipants.map((item) => item.id),
      transactionRolePlayers: supporting.transactionRolePlayers.map((item) => item.id),
    },
    allowedActions: [
      'dashboard_view',
      'finance_workflow_update',
      'document_request_create',
      'document_upload_update',
      'bank_feedback_manage',
      'submit_to_banks',
      'assignment_mutation',
    ],
    deniedActions: [
      'out_of_scope_assignment_mutation',
      'submit_to_banks_without_permission',
      'processor_mutation_outside_scope',
      'compliance_submit_to_banks',
      'participant_internal_bond_mutation',
    ],
    knownGaps: [],
    createdOrUpdated: {
      organisations: makeCount(),
      workspaceRegions: makeCount(),
      workspaceUnits: makeCount(),
      organisationUsers: makeCount(),
      transactions: makeCount(),
      transactionSubprocesses: makeCount(),
      transactionSubprocessSteps: makeCount(),
      transactionFinanceDetails: makeCount(),
      documentRequests: makeCount(),
      documents: makeCount(),
      transactionEvents: makeCount(),
      transactionNotifications: makeCount(),
      transactionParticipants: makeCount(),
      transactionRolePlayers: makeCount(),
      cutoverExclusions: makeCount(),
    },
    missingAuthUsers: [],
    resolvedUserIds: {},
    _raw: {
      hierarchy,
      supporting,
    },
  }
}

function resolveApplyConfig(env = {}) {
  const merged = {
    ...loadEnv(),
    ...env,
  }
  const supabaseUrl = normalizeText(merged.SUPABASE_URL || merged.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(merged.SUPABASE_SERVICE_ROLE_KEY)
  const projectRef = deriveProjectRef(supabaseUrl)
  const target = normalizeText(merged.BOND_RUNTIME_FIXTURE_TARGET || DEFAULT_TARGET).toLowerCase() || DEFAULT_TARGET

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Bond runtime staging apply.')
  }
  if (target !== 'staging') {
    throw new Error('Refusing to apply Bond runtime fixtures outside staging target.')
  }
  if (projectRef !== STAGING_PROJECT_REF) {
    throw new Error('Refusing to apply Bond runtime fixtures outside the staging Supabase project.')
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    projectRef,
    target,
  }
}

function createServiceAdapter(config) {
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
  const schemaCache = new Map()

  return {
    async getTableColumns(table) {
      if (schemaCache.has(table)) return schemaCache.get(table)
      try {
        const response = await fetch(`${config.supabaseUrl}/rest/v1/`, {
          headers: {
            apikey: config.serviceRoleKey,
            Authorization: `Bearer ${config.serviceRoleKey}`,
            Accept: 'application/openapi+json',
          },
        })
        if (!response.ok) {
          schemaCache.set(table, null)
          return null
        }
        const spec = await response.json()
        const candidateSchemas = [
          spec?.components?.schemas?.[table],
          spec?.definitions?.[table],
        ].filter(Boolean)
        const properties = candidateSchemas.find((item) => item?.properties)?.properties || null
        const columns = properties ? Object.keys(properties) : null
        schemaCache.set(table, columns)
        return columns
      } catch {
        schemaCache.set(table, null)
        return null
      }
    },
    async lookupUsersByEmails(emails = []) {
      const wanted = unique(emails.map(normalizeEmail))
      const authByEmail = new Map()
      try {
        let page = 1
        while (true) {
          const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
          if (error) break
          const users = data?.users || []
          for (const user of users) {
            const email = normalizeEmail(user.email)
            if (wanted.includes(email)) {
              authByEmail.set(email, { id: user.id, email })
            }
          }
          if (users.length < 200) break
          page += 1
        }
      } catch {
        // Fall through to profiles lookup.
      }

      const unresolved = wanted.filter((email) => !authByEmail.has(email))
      if (unresolved.length) {
        const { data, error } = await supabase.from('profiles').select('id, email').in('email', unresolved)
        if (!error) {
          for (const row of data || []) {
            const email = normalizeEmail(row.email)
            if (email) {
              authByEmail.set(email, { id: row.id, email })
            }
          }
        }
      }
      return authByEmail
    },
    async upsertRows(table, rows = [], options = {}) {
      if (!rows.length) {
        return { data: [], skippedColumns: [] }
      }

      let workingRows = rows.map((row) => ({ ...row }))
      const skippedColumns = []
      const onConflict = options.onConflict || 'id'
      const optionalColumns = new Set(OPTIONAL_COLUMNS_BY_TABLE[table] || [])

      while (true) {
        const query = supabase
          .from(table)
          .upsert(workingRows, { onConflict, ignoreDuplicates: false })
          .select(options.select || 'id')
        const { data, error } = await query
        if (!error) {
          return { data: data || [], skippedColumns }
        }

        const missingColumn = parseMissingColumn(error)
        if (!missingColumn || !optionalColumns.has(missingColumn)) {
          throw new Error(`Bond runtime apply failed for ${table}: ${error.message}`)
        }

        skippedColumns.push(missingColumn)
        workingRows = workingRows.map((row) => {
          const nextRow = { ...row }
          delete nextRow[missingColumn]
          return nextRow
        })
      }
    },
  }
}

function parseMissingColumn(error) {
  const message = normalizeText(error?.message)
  const relationMatch = message.match(/column ["']?([a-zA-Z0-9_]+)["']? of relation/i)
  if (relationMatch) return relationMatch[1]
  const missingMatch = message.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/i)
  if (missingMatch) return missingMatch[1]
  const schemaCacheMatch = message.match(/could not find the ['"]([a-zA-Z0-9_]+)['"] column/i)
  if (schemaCacheMatch) return schemaCacheMatch[1]
  return null
}

function isMissingTableLikeError(error, table) {
  const message = normalizeText(error?.message).toLowerCase()
  const normalizedTable = String(table || '').toLowerCase()
  return (
    message.includes(`could not find the table 'public.${normalizedTable}' in the schema cache`) ||
    message.includes(`relation "${normalizedTable}" does not exist`) ||
    message.includes(`relation 'public.${normalizedTable}' does not exist`) ||
    error?.code === '42P01'
  )
}

function buildOrganisationRows(plan) {
  return plan.workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    display_name: workspace.name,
    slug: workspace.slug,
    type: workspace.workspaceType,
    workspace_type: workspace.workspaceType,
    workspace_kind: workspace.workspaceKind,
    active: true,
    metadata: buildFixtureManagedMetadata({ workspace_kind: workspace.workspaceKind }),
  }))
}

function buildWorkspaceRegionRows(plan) {
  const region = plan._raw.hierarchy.region
  return [
    {
      id: region.id,
      workspace_id: region.workspaceId,
      name: region.name,
      code: region.code,
      description: 'Bond runtime staging region',
      manager_user_id: plan.resolvedUserIds.regional_manager || null,
      active: true,
      metadata: buildFixtureManagedMetadata({ hierarchy: 'region' }),
    },
  ]
}

function buildWorkspaceUnitRows(plan) {
  const { hq, branch, team } = plan._raw.hierarchy
  return [
    {
      id: hq.id,
      workspace_id: hq.workspaceId,
      region_id: hq.regionId,
      parent_unit_id: hq.parentUnitId,
      unit_type: hq.unitType,
      name: hq.name,
      code: hq.code,
      description: 'Bond runtime HQ unit',
      manager_user_id: plan.resolvedUserIds.hq_manager || plan.resolvedUserIds.owner || null,
      active: true,
      metadata: buildFixtureManagedMetadata({ hierarchy: 'hq' }),
    },
    {
      id: branch.id,
      workspace_id: branch.workspaceId,
      region_id: branch.regionId,
      parent_unit_id: branch.parentUnitId,
      unit_type: branch.unitType,
      name: branch.name,
      code: branch.code,
      description: 'Bond runtime branch unit',
      manager_user_id: plan.resolvedUserIds.branch_manager || null,
      active: true,
      metadata: buildFixtureManagedMetadata({ hierarchy: 'branch' }),
    },
    {
      id: team.id,
      workspace_id: team.workspaceId,
      region_id: team.regionId,
      parent_unit_id: team.parentUnitId,
      unit_type: team.unitType,
      name: team.name,
      code: team.code,
      description: 'Bond runtime team unit',
      manager_user_id: plan.resolvedUserIds.processor || null,
      active: true,
      metadata: buildFixtureManagedMetadata({ hierarchy: 'team' }),
    },
  ]
}

function buildMembershipRows(plan) {
  return plan.users
    .filter((user) => user.membershipEnabled && user.userId && user.workspaceId)
    .map((user) => {
      const nameParts = user.displayName.split(' ')
      const firstName = nameParts.shift() || user.displayName
      const lastName = nameParts.join(' ') || null
      const branchId =
        user.scopeLevel === 'branch' ? user.workspaceUnitId : user.scopeLevel === 'team' ? plan._raw.hierarchy.branch.id : null

      return {
        organisation_id: user.workspaceId,
        user_id: user.userId,
        branch_id: branchId,
        primary_branch_id: branchId,
        branch_scope: branchId ? 'branch' : null,
        first_name: firstName,
        last_name: lastName,
        email: user.email,
        role: user.workspaceRole,
        workspace_role: user.workspaceRole,
        organisation_role: user.workspaceRole,
        app_role: 'bond_originator',
        workspace_type: DEFAULT_WORKSPACE_TYPE,
        status: 'active',
        scope_level: user.scopeLevel,
        region_id: user.regionId,
        workspace_unit_id: user.workspaceUnitId,
        scope_metadata: buildFixtureManagedMetadata({ role_key: user.roleKey }),
        is_primary_owner: Boolean(user.isPrimaryOwner),
        active_workspace_selected_at: nowIso(),
        invited_at: nowIso(),
        accepted_at: nowIso(),
        joined_at: nowIso(),
      }
    })
}

function buildTransactionRows(plan) {
  return plan.applications.map((application) => ({
    id: application.id,
    organisation_id: application.workspaceId,
    transaction_reference: application.transactionReference,
    transaction_type: 'bond_application',
    finance_type: 'bond',
    lifecycle_state: 'active',
    stage: 'Finance Pending',
    current_main_stage: 'FIN',
    current_sub_stage_summary: application.applicationKey,
    is_active: true,
    bond_workspace_id: application.workspaceId,
    bond_region_id: application.regionId,
    bond_workspace_unit_id: application.workspaceUnitId,
    primary_bond_consultant_user_id: application.primaryBondConsultantUserId,
    assigned_bond_processor_user_id: application.assignedBondProcessorUserId,
    assigned_bond_manager_user_id: application.assignedBondManagerUserId,
    assigned_bond_compliance_user_id: application.assignedBondComplianceUserId,
    bond_assignment_status: application.exclusionStatus ? 'legacy_compatibility' : 'canonical_ready',
    bond_assignment_source: 'runtime_fixture',
    assigned_bond_originator_email: application.assignedBondOriginatorEmail,
    bond_originator: application.bondOriginatorName,
    next_action: 'Phase 5H runtime smoke',
    metadata: buildFixtureManagedMetadata({
      application_key: application.applicationKey,
      exclusion_status: application.exclusionStatus,
      personal_originator: application.applicationKey === 'personal_originator_application',
    }),
  }))
}

function buildNotificationRows(plan) {
  const notificationUserId = plan.resolvedUserIds.hq_manager || plan.resolvedUserIds.owner || null
  if (!notificationUserId) return []
  return plan.applications.map((application) => ({
    id: deterministicUuid(`notification:${application.applicationKey}`),
    transaction_id: application.id,
    user_id: notificationUserId,
    role_type: 'bond_originator',
    notification_type: 'bond_runtime_fixture',
    title: `Bond runtime fixture ${application.applicationKey}`,
    message: 'Seeded for Phase 5H runtime smoke.',
    is_read: false,
    read_at: null,
    dedupe_key: `bond-runtime-${application.applicationKey}`,
    event_type: 'TransactionUpdated',
    event_data: buildFixtureManagedMetadata({ application_key: application.applicationKey }),
    updated_at: nowIso(),
  }))
}

function hydrateResolvedUsers(plan, authUserMap) {
  const hydrated = deepClone(plan)
  hydrated.resolvedUserIds = {}
  hydrated.missingAuthUsers = []
  hydrated.users = hydrated.users.map((user) => {
    const matched = authUserMap.get(normalizeEmail(user.email)) || null
    const hydratedUser = {
      ...user,
      userId: matched?.id || null,
      authUserFound: Boolean(matched),
    }
    if (matched?.id) {
      hydrated.resolvedUserIds[user.roleKey] = matched.id
    } else if (user.requiredForRuntimeSmoke) {
      hydrated.missingAuthUsers.push({
        role: user.roleKey,
        email: user.email,
        requiredForRuntimeSmoke: true,
      })
    }
    return hydratedUser
  })

  const byRole = new Map(hydrated.users.map((user) => [user.roleKey, user]))
  hydrated.applications = createApplicationSpecs(hydrated._raw.hierarchy, byRole)
  hydrated._raw.supporting = createSupportingRecordPlan(hydrated.applications)
  hydrated.exclusions = hydrated._raw.supporting.cutoverExclusions.map((item) => ({
    id: item.id,
    transactionId: item.transaction_id,
    exclusionType: item.exclusion_type,
  }))
  hydrated.supportingRecords = {
    transactionSubprocesses: hydrated._raw.supporting.transactionSubprocesses.map((item) => item.id),
    transactionSubprocessSteps: hydrated._raw.supporting.transactionSubprocessSteps.map((item) => item.id),
    transactionFinanceDetails: hydrated._raw.supporting.transactionFinanceDetails.map((item) => item.transaction_id),
    documentRequests: hydrated._raw.supporting.documentRequests.map((item) => item.id),
    documents: hydrated._raw.supporting.documents.map((item) => item.id),
    transactionEvents: hydrated._raw.supporting.transactionEvents.map((item) => item.id),
    transactionNotifications: hydrated._raw.supporting.transactionNotifications.map((item) => item.id),
    transactionParticipants: hydrated._raw.supporting.transactionParticipants.map((item) => item.id),
    transactionRolePlayers: hydrated._raw.supporting.transactionRolePlayers.map((item) => item.id),
  }
  return hydrated
}

async function applyCount(report, key, table, rows, adapter, options = {}) {
  const knownColumns = typeof adapter.getTableColumns === 'function' ? await adapter.getTableColumns(table) : null
  const prepared = prepareRowsForUpsert(table, rows, { knownColumns })
  const result = await adapter.upsertRows(table, prepared.rows, options)
  report.createdOrUpdated[key] = {
    rowCount: prepared.rows.length,
    ids: prepared.rows.map((row) => row.id || row.transaction_id).filter(Boolean),
    skippedColumns: unique([...(prepared.omittedColumns || []), ...(result.skippedColumns || [])]),
    missing: 0,
  }
  return {
    data: result.data || [],
    rows: prepared.rows,
    skippedColumns: unique([...(prepared.omittedColumns || []), ...(result.skippedColumns || [])]),
  }
}

async function performRealApply(plan, adapter) {
  const authUserMap = await adapter.lookupUsersByEmails(plan.users.map((user) => user.email))
  const hydrated = hydrateResolvedUsers(plan, authUserMap)

  await applyCount(hydrated, 'organisations', 'organisations', buildOrganisationRows(hydrated), adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'workspaceRegions', 'workspace_regions', buildWorkspaceRegionRows(hydrated), adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'workspaceUnits', 'workspace_units', buildWorkspaceUnitRows(hydrated), adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'organisationUsers', 'organisation_users', buildMembershipRows(hydrated), adapter, { onConflict: 'organisation_id,email' })
  await applyCount(hydrated, 'transactions', 'transactions', buildTransactionRows(hydrated), adapter, { onConflict: 'id' })
  const subprocessApply = await applyCount(
    hydrated,
    'transactionSubprocesses',
    'transaction_subprocesses',
    hydrated._raw.supporting.transactionSubprocesses,
    adapter,
    {
    onConflict: 'transaction_id,process_type',
      select: 'id, transaction_id, process_type',
    },
  )
  const plannedSubprocessByComposite = new Map(
    hydrated._raw.supporting.transactionSubprocesses.map((row) => [`${row.transaction_id}:${row.process_type}`, row.id]),
  )
  const actualSubprocessIdByPlannedId = new Map()
  for (const row of subprocessApply.data || []) {
    const plannedId = plannedSubprocessByComposite.get(`${row.transaction_id}:${row.process_type}`)
    if (plannedId && row.id) {
      actualSubprocessIdByPlannedId.set(plannedId, row.id)
    }
  }
  const remappedStepRows = hydrated._raw.supporting.transactionSubprocessSteps.map((row) => ({
    ...row,
    subprocess_id: actualSubprocessIdByPlannedId.get(row.subprocess_id) || row.subprocess_id,
  }))
  await applyCount(hydrated, 'transactionSubprocessSteps', 'transaction_subprocess_steps', remappedStepRows, adapter, {
    onConflict: 'subprocess_id,step_key',
  })
  await applyCount(hydrated, 'transactionFinanceDetails', 'transaction_finance_details', hydrated._raw.supporting.transactionFinanceDetails, adapter, {
    onConflict: 'transaction_id',
  })
  await applyCount(hydrated, 'documentRequests', 'document_requests', hydrated._raw.supporting.documentRequests, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'documents', 'documents', hydrated._raw.supporting.documents, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'transactionEvents', 'transaction_events', hydrated._raw.supporting.transactionEvents, adapter, { onConflict: 'id' })

  hydrated._raw.supporting.transactionNotifications = buildNotificationRows(hydrated)
  await applyCount(
    hydrated,
    'transactionNotifications',
    'transaction_notifications',
    hydrated._raw.supporting.transactionNotifications,
    adapter,
    { onConflict: 'id' },
  )
  await applyCount(
    hydrated,
    'transactionParticipants',
    'transaction_participants',
    hydrated._raw.supporting.transactionParticipants,
    adapter,
    { onConflict: 'transaction_id,role_type,legal_role' },
  )
  try {
    await applyCount(
      hydrated,
      'transactionRolePlayers',
      'transaction_role_players',
      hydrated._raw.supporting.transactionRolePlayers,
      adapter,
      { onConflict: 'transaction_id,role_type' },
    )
  } catch (error) {
    if (!isMissingTableLikeError(error, 'transaction_role_players')) {
      throw error
    }
    hydrated.knownGaps.push(`transaction_role_players_apply_skipped: ${error.message}`)
    hydrated.createdOrUpdated.transactionRolePlayers = {
      rowCount: 0,
      ids: [],
      skippedColumns: [],
      missing: hydrated._raw.supporting.transactionRolePlayers.length,
    }
  }

  try {
    await applyCount(
      hydrated,
      'cutoverExclusions',
      'bond_rls_cutover_exclusions',
      hydrated._raw.supporting.cutoverExclusions,
      adapter,
      { onConflict: 'transaction_id,exclusion_type' },
    )
  } catch (error) {
    hydrated.knownGaps.push(`cutover_exclusion_table_apply_failed: ${error.message}`)
    hydrated.createdOrUpdated.cutoverExclusions = {
      rowCount: 0,
      ids: [],
      skippedColumns: [],
      missing: hydrated._raw.supporting.cutoverExclusions.length,
    }
  }

  hydrated.applied = true
  hydrated.applyReason = null
  return hydrated
}

export function writeFixtureMetadata(report, outputPath = DEFAULT_METADATA_PATH) {
  const normalizedPath = normalizeText(outputPath || DEFAULT_METADATA_PATH)
  fs.mkdirSync(path.dirname(normalizedPath), { recursive: true })
  const serializable = { ...report }
  delete serializable._raw
  fs.writeFileSync(normalizedPath, `${JSON.stringify(serializable, null, 2)}\n`)
}

export async function runSeeder(inputEnv = {}, options = {}) {
  const plan = buildFixturePlan(inputEnv)
  const metadataPath = plan.metadataPath

  if (plan.executionMode === 'dry_run') {
    writeFixtureMetadata(plan, metadataPath)
    return { report: plan }
  }

  if (parseBoolean(inputEnv.BOND_RUNTIME_CREATE_AUTH_USERS || process.env.BOND_RUNTIME_CREATE_AUTH_USERS)) {
    throw new Error('BOND_RUNTIME_CREATE_AUTH_USERS=true is not supported by the Bond runtime fixture seeder in this phase.')
  }

  const applyConfig = options.applyConfig || resolveApplyConfig(inputEnv)
  const adapter = options.adapter || createServiceAdapter(applyConfig)
  const appliedReport = await performRealApply(plan, adapter)
  writeFixtureMetadata(appliedReport, metadataPath)
  return { report: appliedReport }
}

async function main() {
  const { report } = await runSeeder(process.env)
  process.stdout.write(`${JSON.stringify({ metadataPath: report.metadataPath, executionMode: report.executionMode, applied: report.applied }, null, 2)}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
