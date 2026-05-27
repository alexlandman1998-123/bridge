import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const BOND_DEMO_RUNTIME_NAMESPACE = 'bond_demo_runtime_v1'
export const BOND_DEMO_RUNTIME_PHASE = 'bond_demo_seed'
export const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
export const DEFAULT_METADATA_PATH = '/tmp/bond-demo-runtime-data.json'

const DEFAULT_TARGET = 'staging'
const DEFAULT_WORKSPACE_TYPE = 'bond_originator'
const DEFAULT_WORKSPACE_NAME = 'Bridge Finance Demo'
const DEFAULT_DEMO_OWNER_EMAIL = 'bond.demo@bridgenine.co.za'
const REFERENCE_NOW = new Date('2026-05-26T09:00:00.000Z')

const ACTIVE_PIPELINE_BUCKETS = Object.freeze([
  { key: 'new_finance_requested', count: 10, priority: 'new_request' },
  { key: 'awaiting_contact', count: 10, priority: 'follow_up' },
  { key: 'documents_required', count: 14, priority: 'missing_docs' },
  { key: 'pre_qualification', count: 7, priority: 'prequal' },
  { key: 'ready_for_submission', count: 10, priority: 'submission_ready' },
  { key: 'submitted_to_banks', count: 7, priority: 'submitted' },
  { key: 'bank_feedback', count: 3, priority: 'bank_feedback' },
  { key: 'approved', count: 3, priority: 'approved' },
  { key: 'grant_signed', count: 2, priority: 'grant_signed' },
  { key: 'bond_instruction_sent', count: 2, priority: 'instruction_sent' },
])

const TRANSFER_BUCKETS = Object.freeze([
  { key: 'transfer_in_progress', count: 22, priority: 'transfer' },
  { key: 'registered', count: 18, priority: 'registered' },
])

const DECLINED_BUCKET = Object.freeze({ key: 'declined_or_cancelled', count: 10, priority: 'declined' })

const REGION_CATALOG = Object.freeze([
  { key: 'gauteng', name: 'Gauteng', code: 'BOND-DEMO-GAUTENG' },
  { key: 'western_cape', name: 'Western Cape', code: 'BOND-DEMO-WC' },
  { key: 'kwazulu_natal', name: 'KwaZulu-Natal', code: 'BOND-DEMO-KZN' },
])

const BRANCH_CATALOG = Object.freeze([
  {
    key: 'johannesburg_central',
    name: 'Johannesburg Central',
    code: 'BOND-DEMO-JHB',
    regionKey: 'gauteng',
    city: 'Johannesburg',
    suburb: 'Sandton',
    province: 'Gauteng',
    consultantKeys: ['emma_roberts', 'daniel_nkosi', 'ethan_govender'],
    processorKeys: ['tarryn_meyer', 'carla_smith'],
    complianceKeys: ['olivia_brown'],
    branchManagerKey: 'jason_smith',
    regionalManagerKey: 'sarah_jacobs',
  },
  {
    key: 'pretoria_east',
    name: 'Pretoria East',
    code: 'BOND-DEMO-PTA',
    regionKey: 'gauteng',
    city: 'Pretoria',
    suburb: 'Pretoria East',
    province: 'Gauteng',
    consultantKeys: ['emma_roberts', 'rachel_adams'],
    processorKeys: ['jess_naidoo', 'tarryn_meyer'],
    complianceKeys: ['olivia_brown', 'megan_jacobs'],
    branchManagerKey: 'mia_ferreira',
    regionalManagerKey: 'sarah_jacobs',
  },
  {
    key: 'cape_town_atlantic',
    name: 'Cape Town Atlantic',
    code: 'BOND-DEMO-CPT',
    regionKey: 'western_cape',
    city: 'Cape Town',
    suburb: 'Sea Point',
    province: 'Western Cape',
    consultantKeys: ['chris_williams', 'nicole_daniels'],
    processorKeys: ['carla_smith', 'michael_van_zyl'],
    complianceKeys: ['megan_jacobs'],
    branchManagerKey: 'kyle_petersen',
    regionalManagerKey: 'alex_van_der_merwe',
  },
  {
    key: 'durban_north',
    name: 'Durban North',
    code: 'BOND-DEMO-DBN',
    regionKey: 'kwazulu_natal',
    city: 'Durban',
    suburb: 'Umhlanga',
    province: 'KwaZulu-Natal',
    consultantKeys: ['daniel_nkosi', 'nicole_daniels', 'ethan_govender'],
    processorKeys: ['michael_van_zyl', 'jess_naidoo'],
    complianceKeys: ['megan_jacobs'],
    branchManagerKey: 'liam_naidoo',
    regionalManagerKey: 'liam_naidoo',
  },
])

const DEVELOPMENT_CATALOG = Object.freeze([
  {
    key: 'westbrook_estate',
    name: 'Westbrook Estate',
    developer: 'Westbrook Estates',
    branchKey: 'johannesburg_central',
    city: 'Johannesburg',
    suburb: 'Midrand',
    basePrice: 1850000,
    unitLabelStyle: 'unit',
  },
  {
    key: 'greenstone_living_lofts',
    name: 'Greenstone Living Lofts',
    developer: 'Greenstone Living',
    branchKey: 'johannesburg_central',
    city: 'Johannesburg',
    suburb: 'Morningside',
    basePrice: 1325000,
    unitLabelStyle: 'apartment',
  },
  {
    key: 'oakmont_residences',
    name: 'Oakmont Residences',
    developer: 'Oakmont Developments',
    branchKey: 'pretoria_east',
    city: 'Pretoria',
    suburb: 'Pretoria East',
    basePrice: 1675000,
    unitLabelStyle: 'plot',
  },
  {
    key: 'summit_ridge',
    name: 'Summit Ridge',
    developer: 'Summit Ridge Properties',
    branchKey: 'pretoria_east',
    city: 'Pretoria',
    suburb: 'Faerie Glen',
    basePrice: 2425000,
    unitLabelStyle: 'plot',
  },
  {
    key: 'atlantic_view',
    name: 'Atlantic View',
    developer: 'Greenstone Living',
    branchKey: 'cape_town_atlantic',
    city: 'Cape Town',
    suburb: 'Sea Point',
    basePrice: 4850000,
    unitLabelStyle: 'apartment',
  },
  {
    key: 'harbour_lane',
    name: 'Harbour Lane',
    developer: 'Westbrook Estates',
    branchKey: 'cape_town_atlantic',
    city: 'Cape Town',
    suburb: 'Green Point',
    basePrice: 3285000,
    unitLabelStyle: 'apartment',
  },
  {
    key: 'palm_grove',
    name: 'Palm Grove',
    developer: 'Oakmont Developments',
    branchKey: 'durban_north',
    city: 'Durban',
    suburb: 'La Lucia',
    basePrice: 1485000,
    unitLabelStyle: 'unit',
  },
  {
    key: 'umhlanga_terraces',
    name: 'Umhlanga Terraces',
    developer: 'Summit Ridge Properties',
    branchKey: 'durban_north',
    city: 'Durban',
    suburb: 'Umhlanga Ridge',
    basePrice: 2140000,
    unitLabelStyle: 'apartment',
  },
])

const AGENCY_CATALOG = Object.freeze([
  'Harcourts Platinum',
  'Century 21 Select',
  'Prime Property Group',
  'Urban Nest Realty',
])

const ATTORNEY_CATALOG = Object.freeze([
  'Tuckers Inc.',
  'Van Breda Attorneys',
  'MNS Conveyancing',
  'Smith & Partners',
])

const BANK_CATALOG = Object.freeze(['FNB', 'Standard Bank', 'Nedbank', 'ABSA', 'Investec'])

const USER_CATALOG = Object.freeze([
  {
    key: 'alex_van_der_merwe',
    name: 'Alex van der Merwe',
    email: DEFAULT_DEMO_OWNER_EMAIL,
    workspaceRole: 'owner',
    scopeLevel: 'workspace_hq',
    roleFamily: 'principal',
    requiredAuth: true,
    branchKey: null,
    regionKey: null,
  },
  {
    key: 'sarah_jacobs',
    name: 'Sarah Jacobs',
    email: 'sarah.jacobs+bond-demo@bridgenine.co.za',
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    roleFamily: 'manager',
    requiredAuth: false,
    branchKey: null,
    regionKey: 'gauteng',
  },
  {
    key: 'liam_naidoo',
    name: 'Liam Naidoo',
    email: 'liam.naidoo+bond-demo@bridgenine.co.za',
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    roleFamily: 'manager',
    requiredAuth: false,
    branchKey: null,
    regionKey: 'kwazulu_natal',
  },
  {
    key: 'jason_smith',
    name: 'Jason Smith',
    email: 'jason.smith+bond-demo@bridgenine.co.za',
    workspaceRole: 'branch_manager',
    scopeLevel: 'branch',
    roleFamily: 'manager',
    requiredAuth: false,
    branchKey: 'johannesburg_central',
    regionKey: 'gauteng',
  },
  {
    key: 'mia_ferreira',
    name: 'Mia Ferreira',
    email: 'mia.ferreira+bond-demo@bridgenine.co.za',
    workspaceRole: 'branch_manager',
    scopeLevel: 'branch',
    roleFamily: 'manager',
    requiredAuth: false,
    branchKey: 'pretoria_east',
    regionKey: 'gauteng',
  },
  {
    key: 'kyle_petersen',
    name: 'Kyle Petersen',
    email: 'kyle.petersen+bond-demo@bridgenine.co.za',
    workspaceRole: 'branch_manager',
    scopeLevel: 'branch',
    roleFamily: 'manager',
    requiredAuth: false,
    branchKey: 'cape_town_atlantic',
    regionKey: 'western_cape',
  },
  {
    key: 'emma_roberts',
    name: 'Emma Roberts',
    email: 'emma.roberts+bond-demo@bridgenine.co.za',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    roleFamily: 'consultant',
    requiredAuth: false,
    branchKey: 'johannesburg_central',
    regionKey: 'gauteng',
  },
  {
    key: 'daniel_nkosi',
    name: 'Daniel Nkosi',
    email: 'daniel.nkosi+bond-demo@bridgenine.co.za',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    roleFamily: 'consultant',
    requiredAuth: false,
    branchKey: 'durban_north',
    regionKey: 'kwazulu_natal',
  },
  {
    key: 'rachel_adams',
    name: 'Rachel Adams',
    email: 'rachel.adams+bond-demo@bridgenine.co.za',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    roleFamily: 'consultant',
    requiredAuth: false,
    branchKey: 'pretoria_east',
    regionKey: 'gauteng',
  },
  {
    key: 'chris_williams',
    name: 'Chris Williams',
    email: 'chris.williams+bond-demo@bridgenine.co.za',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    roleFamily: 'consultant',
    requiredAuth: false,
    branchKey: 'cape_town_atlantic',
    regionKey: 'western_cape',
  },
  {
    key: 'nicole_daniels',
    name: 'Nicole Daniels',
    email: 'nicole.daniels+bond-demo@bridgenine.co.za',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    roleFamily: 'consultant',
    requiredAuth: false,
    branchKey: 'cape_town_atlantic',
    regionKey: 'western_cape',
  },
  {
    key: 'ethan_govender',
    name: 'Ethan Govender',
    email: 'ethan.govender+bond-demo@bridgenine.co.za',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    roleFamily: 'consultant',
    requiredAuth: false,
    branchKey: 'durban_north',
    regionKey: 'kwazulu_natal',
  },
  {
    key: 'tarryn_meyer',
    name: 'Tarryn Meyer',
    email: 'tarryn.meyer+bond-demo@bridgenine.co.za',
    workspaceRole: 'processor',
    scopeLevel: 'team',
    roleFamily: 'processor',
    requiredAuth: false,
    branchKey: 'johannesburg_central',
    regionKey: 'gauteng',
  },
  {
    key: 'jess_naidoo',
    name: 'Jess Naidoo',
    email: 'jess.naidoo+bond-demo@bridgenine.co.za',
    workspaceRole: 'processor',
    scopeLevel: 'team',
    roleFamily: 'processor',
    requiredAuth: false,
    branchKey: 'pretoria_east',
    regionKey: 'gauteng',
  },
  {
    key: 'carla_smith',
    name: 'Carla Smith',
    email: 'carla.smith+bond-demo@bridgenine.co.za',
    workspaceRole: 'processor',
    scopeLevel: 'team',
    roleFamily: 'processor',
    requiredAuth: false,
    branchKey: 'cape_town_atlantic',
    regionKey: 'western_cape',
  },
  {
    key: 'michael_van_zyl',
    name: 'Michael van Zyl',
    email: 'michael.vanzyl+bond-demo@bridgenine.co.za',
    workspaceRole: 'processor',
    scopeLevel: 'team',
    roleFamily: 'processor',
    requiredAuth: false,
    branchKey: 'durban_north',
    regionKey: 'kwazulu_natal',
  },
  {
    key: 'olivia_brown',
    name: 'Olivia Brown',
    email: 'olivia.brown+bond-demo@bridgenine.co.za',
    workspaceRole: 'compliance',
    scopeLevel: 'workspace_hq',
    roleFamily: 'compliance',
    requiredAuth: false,
    branchKey: null,
    regionKey: null,
  },
  {
    key: 'megan_jacobs',
    name: 'Megan Jacobs',
    email: 'megan.jacobs+bond-demo@bridgenine.co.za',
    workspaceRole: 'compliance',
    scopeLevel: 'workspace_hq',
    roleFamily: 'compliance',
    requiredAuth: false,
    branchKey: null,
    regionKey: null,
  },
])

const CONSULTANT_QUOTAS = Object.freeze({
  emma_roberts: 24,
  daniel_nkosi: 22,
  rachel_adams: 18,
  chris_williams: 7,
  nicole_daniels: 23,
  ethan_govender: 24,
})

const PROCESSOR_QUOTAS = Object.freeze({
  tarryn_meyer: 34,
  jess_naidoo: 32,
  carla_smith: 20,
  michael_van_zyl: 32,
})

const FIRST_NAMES = Object.freeze([
  'Aiden', 'Aisha', 'Alyssa', 'Anathi', 'Ayanda', 'Bianca', 'Brandon', 'Caitlin', 'Caleb', 'Candice',
  'Dylan', 'Elana', 'Ethan', 'Faith', 'Gareth', 'Hannah', 'Imraan', 'Jade', 'Jason', 'Jenna',
  'Kagiso', 'Kayla', 'Keagan', 'Kyle', 'Lebo', 'Leila', 'Lethabo', 'Liam', 'Luke', 'Megan',
  'Mia', 'Naledi', 'Neo', 'Nicole', 'Ntokozo', 'Olivia', 'Paige', 'Priya', 'Reece', 'Samantha',
  'Sanele', 'Sarah', 'Simphiwe', 'Talia', 'Tarryn', 'Thabo', 'Themba', 'Tumi', 'Yolanda', 'Zanele',
])

const LAST_NAMES = Object.freeze([
  'Adams', 'Botha', 'Brown', 'Daniels', 'Dlamini', 'Du Toit', 'Edwards', 'Ferreira', 'Govender', 'Jacobs',
  'Janse van Rensburg', 'Khumalo', 'Mabaso', 'Meyer', 'Mkhize', 'Naidoo', 'Nkosi', 'Petersen', 'Pillay', 'Roberts',
  'Smith', 'Strydom', 'Van der Merwe', 'Van Wyk', 'Viljoen', 'Williams',
])

const SUBURB_PHONE_PREFIX = Object.freeze({
  johannesburg_central: '082',
  pretoria_east: '083',
  cape_town_atlantic: '084',
  durban_north: '081',
})

const DOCUMENT_TYPE_SEQUENCE = Object.freeze([
  'id_document',
  'payslip',
  'bank_statements',
  'proof_of_address',
  'offer_to_purchase',
  'marriage_certificate',
  'company_registration_documents',
  'trust_deed',
  'tax_returns',
  'accountant_letter',
])

const AT_RISK_APPLICATION_INDEXES = new Set([12, 17, 26, 33, 41, 52, 64, 79, 88, 97])
const COMPLIANCE_FLAG_APPLICATION_INDEXES = new Set([17, 33, 52, 79, 97])

const REQUIRED_COLUMNS_BY_TABLE = Object.freeze({
  organisations: ['id', 'name'],
  workspace_regions: ['id', 'workspace_id', 'name', 'code'],
  workspace_units: ['id', 'workspace_id', 'unit_type', 'name', 'code'],
  organisation_users: ['organisation_id', 'email', 'role', 'status'],
  buyers: ['id', 'name'],
  developments: ['id', 'name'],
  development_settings: ['development_id'],
  units: ['id', 'development_id', 'unit_number'],
  transactions: ['id', 'organisation_id', 'transaction_reference'],
  transaction_finance_details: ['transaction_id'],
  transaction_subprocesses: ['transaction_id', 'process_type', 'owner_type', 'status'],
  transaction_subprocess_steps: ['subprocess_id', 'step_key', 'step_label', 'status', 'owner_type', 'sort_order'],
  document_requests: ['id', 'transaction_id', 'category', 'document_type', 'title', 'status'],
  documents: ['id', 'transaction_id', 'name', 'file_path', 'category'],
  transaction_comments: ['id', 'transaction_id', 'comment_text'],
  transaction_events: ['id', 'transaction_id', 'event_type'],
  transaction_notifications: ['id', 'transaction_id', 'user_id', 'role_type', 'title', 'message', 'is_read'],
  transaction_participants: ['id', 'transaction_id', 'role_type'],
  transaction_role_players: ['id', 'transaction_id', 'role_type'],
  client_portal_links: ['id', 'transaction_id', 'token', 'is_active'],
})

const OPTIONAL_COLUMNS_BY_TABLE = Object.freeze({
  organisations: ['slug', 'display_name', 'workspace_type', 'workspace_kind', 'type', 'metadata', 'active'],
  workspace_regions: ['description', 'manager_user_id', 'active', 'metadata'],
  workspace_units: ['description', 'manager_user_id', 'active', 'metadata', 'parent_unit_id', 'region_id'],
  organisation_users: [
    'user_id',
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
  buyers: ['phone', 'email', 'created_at', 'updated_at'],
  developments: [
    'planned_units',
    'code',
    'location',
    'suburb',
    'city',
    'province',
    'country',
    'description',
    'status',
    'developer_company',
    'total_units_expected',
    'handover_enabled',
    'snag_tracking_enabled',
    'alterations_enabled',
    'onboarding_enabled',
  ],
  development_settings: [
    'client_portal_enabled',
    'snag_reporting_enabled',
    'alteration_requests_enabled',
    'service_reviews_enabled',
    'enabled_modules',
    'stakeholder_teams',
  ],
  units: [
    'unit_label',
    'phase',
    'block',
    'unit_type',
    'bedrooms',
    'bathrooms',
    'parking_count',
    'size_sqm',
    'list_price',
    'current_price',
    'price',
    'status',
    'vat_applicable',
    'notes',
  ],
  transactions: [
    'transaction_type',
    'property_type',
    'development_id',
    'unit_id',
    'buyer_id',
    'property_address_line_1',
    'property_address_line_2',
    'suburb',
    'city',
    'province',
    'property_description',
    'sales_price',
    'purchase_price',
    'finance_type',
    'purchaser_type',
    'stage',
    'current_main_stage',
    'current_sub_stage_summary',
    'assigned_agent',
    'assigned_agent_email',
    'attorney',
    'assigned_attorney_email',
    'bond_originator',
    'assigned_bond_originator_email',
    'bank',
    'next_action',
    'comment',
    'expected_transfer_date',
    'owner_user_id',
    'access_level',
    'lifecycle_state',
    'is_active',
    'updated_at',
    'created_at',
    'bond_workspace_id',
    'bond_region_id',
    'bond_workspace_unit_id',
    'primary_bond_consultant_user_id',
    'assigned_bond_processor_user_id',
    'assigned_bond_manager_user_id',
    'assigned_bond_compliance_user_id',
    'bond_assignment_status',
    'bond_assignment_source',
    'risk_status',
    'operational_state',
    'attorney_stage',
    'finance_status',
    'compliance_status',
    'compliance_review_required',
    'application_prepared',
    'submitted_to_banks',
    'documents_complete',
    'finance_documents_complete',
    'documents_missing',
    'missing_documents_count',
    'uploaded_documents_count',
    'total_required_documents',
    'bank_feedback_pending',
    'bank_feedback_status',
    'next_action_due_at',
    'finance_due_at',
    'processor_name',
    'assigned_bond_processor_name',
    'compliance_name',
    'gross_commission_amount',
    'agent_commission_amount',
    'agency_commission_amount',
    'last_meaningful_activity_at',
    'metadata',
    'registered_at',
    'completed_at',
    'cancelled_at',
  ],
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
  transaction_subprocesses: ['created_at', 'updated_at'],
  transaction_subprocess_steps: ['created_at', 'updated_at', 'comment', 'completed_at'],
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
  transaction_comments: ['author_name', 'author_role', 'created_at'],
  transaction_events: ['event_data', 'created_by', 'created_by_role', 'created_at', 'updated_at'],
  transaction_notifications: ['notification_type', 'event_type', 'event_data', 'dedupe_key', 'read_at', 'updated_at'],
  transaction_participants: [
    'participant_email',
    'participant_name',
    'user_id',
    'status',
    'removed_at',
    'metadata',
    'transaction_role',
    'legal_role',
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
  client_portal_links: ['development_id', 'unit_id', 'buyer_id', 'created_at', 'updated_at'],
})

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

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeSlug(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(normalizeText(value).toLowerCase())
}

function deriveProjectRef(supabaseUrl) {
  const match = normalizeText(supabaseUrl).match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)
  return match ? match[1] : ''
}

function deterministicUuid(seed) {
  const digest = crypto.createHash('sha1').update(`${BOND_DEMO_RUNTIME_NAMESPACE}:${seed}`).digest('hex')
  const chars = digest.slice(0, 32).split('')
  chars[12] = '4'
  chars[16] = 'a'
  const hex = chars.join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function seededInt(seed, min, max) {
  const digest = crypto.createHash('sha1').update(`${BOND_DEMO_RUNTIME_NAMESPACE}:${seed}`).digest('hex')
  const numeric = Number.parseInt(digest.slice(0, 12), 16)
  const span = Math.max(1, max - min + 1)
  return min + (numeric % span)
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))]
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function isoDaysAgo(daysAgo, hourOffset = 0) {
  return addHours(addDays(REFERENCE_NOW, -daysAgo), hourOffset).toISOString()
}

function isoDateDaysAgo(daysAgo) {
  return addDays(REFERENCE_NOW, -daysAgo).toISOString().slice(0, 10)
}

function isoDaysFromNow(daysFromNow, hourOffset = 0) {
  return addHours(addDays(REFERENCE_NOW, daysFromNow), hourOffset).toISOString()
}

function makeCount() {
  return { rowCount: 0, ids: [], skippedColumns: [], missing: 0 }
}

function buildManagedMetadata(extra = {}) {
  return {
    fixture_namespace: BOND_DEMO_RUNTIME_NAMESPACE,
    fixture_phase: BOND_DEMO_RUNTIME_PHASE,
    fixture_managed: true,
    ...extra,
  }
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
    throw new Error(`Bond demo apply cannot write ${table} because required columns are missing: ${missingRequired.join(', ')}`)
  }

  const allowedColumns = new Set([...requiredColumns, ...optionalColumns].filter((column) => known.has(column)))
  const omittedColumns = unique(
    rows.flatMap((row) => Object.keys(row || {}).filter((column) => !allowedColumns.has(column))),
  )

  return {
    rows: rows.map((row) => Object.fromEntries(Object.entries(row || {}).filter(([column]) => allowedColumns.has(column)))),
    omittedColumns,
  }
}

function createHierarchy() {
  const workspaceId = deterministicUuid('workspace:bridge-finance-demo')
  const hqId = deterministicUuid('unit:hq')
  const regions = REGION_CATALOG.map((region) => ({
    ...region,
    id: deterministicUuid(`region:${region.key}`),
    workspaceId,
  }))
  const regionIdByKey = Object.fromEntries(regions.map((region) => [region.key, region.id]))
  const branches = BRANCH_CATALOG.map((branch) => ({
    ...branch,
    id: deterministicUuid(`unit:branch:${branch.key}`),
    workspaceId,
    regionId: regionIdByKey[branch.regionKey],
    parentUnitId: hqId,
    unitType: 'branch',
  }))
  const branchIdByKey = Object.fromEntries(branches.map((branch) => [branch.key, branch.id]))
  const teams = branches.map((branch) => ({
    key: `${branch.key}_operations`,
    id: deterministicUuid(`unit:team:${branch.key}`),
    workspaceId,
    regionId: branch.regionId,
    parentUnitId: branch.id,
    unitType: 'team',
    name: `${branch.name} Operations`,
    code: `${branch.code}-OPS`,
    branchKey: branch.key,
  }))

  return {
    workspace: {
      id: workspaceId,
      name: DEFAULT_WORKSPACE_NAME,
      slug: normalizeSlug(DEFAULT_WORKSPACE_NAME),
      workspaceType: DEFAULT_WORKSPACE_TYPE,
      workspaceKind: 'bond_company',
    },
    hq: {
      id: hqId,
      workspaceId,
      regionId: null,
      parentUnitId: null,
      unitType: 'hq_department',
      name: 'HQ',
      code: 'BOND-DEMO-HQ',
    },
    regions,
    branches,
    teams,
    regionIdByKey,
    branchIdByKey,
    teamIdByBranchKey: Object.fromEntries(teams.map((team) => [team.branchKey, team.id])),
  }
}

function buildUsers(env = {}, hierarchy = createHierarchy()) {
  const demoOwnerEmail = normalizeEmail(env.BOND_DEMO_OWNER_EMAIL || DEFAULT_DEMO_OWNER_EMAIL)
  return USER_CATALOG.map((user) => {
    const email = user.key === 'alex_van_der_merwe' ? demoOwnerEmail : normalizeEmail(user.email)
    const branchId = user.branchKey ? hierarchy.branchIdByKey[user.branchKey] || null : null
    const teamId = user.workspaceRole === 'processor' && user.branchKey ? hierarchy.teamIdByBranchKey[user.branchKey] || null : null
    return {
      ...user,
      email,
      workspaceType: DEFAULT_WORKSPACE_TYPE,
      workspaceId: hierarchy.workspace.id,
      branchId,
      workspaceUnitId: teamId || branchId || null,
      regionId: user.regionKey ? hierarchy.regionIdByKey[user.regionKey] || null : null,
      membershipEnabled: true,
    }
  })
}

function getUserByKey(users = [], key = '') {
  return users.find((user) => user.key === key) || null
}

function createQuotaState(quotas = {}) {
  return Object.fromEntries(Object.entries(quotas).map(([key, value]) => [key, Number(value) || 0]))
}

function pickWithQuota(candidates = [], quotaState = {}, seed = '', fallbackCandidates = []) {
  const activeCandidates = (candidates.length ? candidates : fallbackCandidates).filter((key) => (quotaState[key] || 0) > 0)
  const usable = activeCandidates.length ? activeCandidates : (fallbackCandidates.length ? fallbackCandidates : candidates)
  const sorted = [...usable].sort((left, right) => {
    const quotaDelta = (quotaState[right] || 0) - (quotaState[left] || 0)
    if (quotaDelta !== 0) return quotaDelta
    return seededInt(`${seed}:${left}:${right}`, -1000, 1000)
  })
  const picked = sorted[0] || usable[0] || null
  if (picked && Object.prototype.hasOwnProperty.call(quotaState, picked) && quotaState[picked] > 0) {
    quotaState[picked] -= 1
  }
  return picked
}

function buildBranchQuotaState() {
  return {
    johannesburg_central: 31,
    pretoria_east: 30,
    cape_town_atlantic: 29,
    durban_north: 28,
  }
}

function chooseBranchForBucket(bucketKey = '', branchQuotaState = {}) {
  const preferences = {
    new_finance_requested: ['johannesburg_central', 'pretoria_east', 'durban_north'],
    awaiting_contact: ['pretoria_east', 'johannesburg_central', 'durban_north'],
    documents_required: ['pretoria_east', 'johannesburg_central', 'durban_north'],
    pre_qualification: ['johannesburg_central', 'durban_north', 'pretoria_east'],
    ready_for_submission: ['cape_town_atlantic', 'johannesburg_central', 'pretoria_east'],
    submitted_to_banks: ['cape_town_atlantic', 'johannesburg_central', 'durban_north'],
    bank_feedback: ['pretoria_east', 'durban_north', 'johannesburg_central'],
    approved: ['cape_town_atlantic', 'johannesburg_central', 'durban_north'],
    grant_signed: ['cape_town_atlantic', 'durban_north'],
    bond_instruction_sent: ['cape_town_atlantic', 'durban_north'],
    transfer_in_progress: ['cape_town_atlantic', 'durban_north', 'johannesburg_central'],
    registered: ['cape_town_atlantic', 'durban_north', 'johannesburg_central'],
    declined_or_cancelled: ['pretoria_east', 'durban_north', 'johannesburg_central'],
  }
  return pickWithQuota(preferences[bucketKey] || BRANCH_CATALOG.map((branch) => branch.key), branchQuotaState, `branch:${bucketKey}`, BRANCH_CATALOG.map((branch) => branch.key))
}

function createNameProfile(index = 0) {
  const first = FIRST_NAMES[index % FIRST_NAMES.length]
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]
  const secondaryFirst = FIRST_NAMES[(index + 11) % FIRST_NAMES.length]
  const secondaryLast = LAST_NAMES[(Math.floor((index + 7) / FIRST_NAMES.length) + 5) % LAST_NAMES.length]
  return {
    primaryFirstName: first,
    primaryLastName: last,
    secondaryFirstName: secondaryFirst,
    secondaryLastName: secondaryLast,
  }
}

function createBuyerProfile(index = 0, branch = {}, bucketKey = '') {
  const names = createNameProfile(index)
  const profileType = index % 12
  const purchaserType =
    profileType === 2
      ? 'married_coc'
      : profileType === 5
        ? 'married_anc'
        : profileType === 8
          ? 'trust'
          : profileType === 10
            ? 'company'
            : 'individual'
  const isEntity = purchaserType === 'trust' || purchaserType === 'company'
  const primaryName = isEntity
    ? purchaserType === 'trust'
      ? `${names.primaryLastName} Family Trust`
      : `${names.primaryLastName} Property Holdings (Pty) Ltd`
    : `${names.primaryFirstName} ${names.primaryLastName}`
  const secondaryName = ['married_coc', 'married_anc'].includes(purchaserType)
    ? `${names.secondaryFirstName} ${names.secondaryLastName}`
    : null
  const phoneSuffix = String(1000000 + index * 37).slice(-7)
  const phone = `${SUBURB_PHONE_PREFIX[branch.key] || '082'}${phoneSuffix}`
  const emailBase = normalizeSlug(primaryName.replace(/\(pty\)\s*ltd/gi, '').replace(/\s+trust/gi, ''))
  const email = `${emailBase}.${String(index + 1).padStart(3, '0')}@demo.bridgefinance.co.za`
  const employmentType =
    isEntity
      ? purchaserType
      : ['salaried', 'self_employed', 'commission_earner', 'public_sector', 'contractor'][index % 5]
  const salaryBand = [28500, 42000, 57500, 86000, 125000, 168000][index % 6]
  const financeBlend = ['full_bond', 'ten_percent_deposit', 'thirty_percent_deposit', 'hybrid_finance'][index % 4]

  return {
    id: deterministicUuid(`buyer:${index}:${primaryName}`),
    name: primaryName,
    phone,
    email,
    purchaserType,
    coApplicantName: secondaryName,
    employmentType,
    salaryBand,
    financeBlend,
    storyBias:
      bucketKey === 'documents_required'
        ? 'documents_pressure'
        : bucketKey === 'bank_feedback'
          ? 'bank_query'
          : bucketKey === 'declined_or_cancelled'
            ? 'decline'
            : 'standard',
  }
}

function chooseDevelopment(branchKey = '', index = 0) {
  const scoped = DEVELOPMENT_CATALOG.filter((development) => development.branchKey === branchKey)
  return scoped[index % scoped.length] || DEVELOPMENT_CATALOG[index % DEVELOPMENT_CATALOG.length]
}

function createUnitSpec(applicationIndex = 0, development = {}) {
  const seed = `${development.key}:${applicationIndex}`
  const unitId = deterministicUuid(`unit:${seed}`)
  const floor = seededInt(`${seed}:floor`, 1, development.unitLabelStyle === 'plot' ? 1 : 18)
  const unitNumber = development.unitLabelStyle === 'plot'
    ? `Plot ${seededInt(`${seed}:plot`, 12, 96)}`
    : development.unitLabelStyle === 'apartment'
      ? `${floor}${String.fromCharCode(65 + (applicationIndex % 4))}`
      : `${floor}${String(seededInt(`${seed}:door`, 1, 8)).padStart(2, '0')}`
  const bedrooms = seededInt(`${seed}:beds`, 2, development.basePrice > 4000000 ? 4 : 3)
  const bathrooms = Math.min(bedrooms, seededInt(`${seed}:baths`, 2, 4))
  const parking = seededInt(`${seed}:parking`, 1, development.basePrice > 3000000 ? 3 : 2)
  const sizeSqm = seededInt(`${seed}:sqm`, 68, development.basePrice > 4000000 ? 245 : 175)
  const priceDelta = seededInt(`${seed}:price-delta`, -225000, 975000)
  const price = Math.max(850000, Math.min(8500000, development.basePrice + priceDelta))

  return {
    id: unitId,
    developmentId: deterministicUuid(`development:${development.key}`),
    unitNumber,
    unitLabel: `${development.name} ${unitNumber}`,
    block: development.unitLabelStyle === 'apartment' ? `Block ${String.fromCharCode(65 + (applicationIndex % 3))}` : null,
    unitType: development.unitLabelStyle === 'apartment' ? 'Apartment' : 'House',
    bedrooms,
    bathrooms,
    parking,
    sizeSqm,
    price,
  }
}

function resolveFinanceBlend(index = 0) {
  return ['full_bond', 'ten_percent_deposit', 'thirty_percent_deposit', 'hybrid_finance'][index % 4]
}

function getBankForBucket(bucketKey = '', index = 0) {
  const byBucket = {
    documents_required: ['Nedbank', 'Standard Bank', 'ABSA'],
    ready_for_submission: ['ABSA', 'FNB', 'Standard Bank'],
    submitted_to_banks: ['FNB', 'ABSA', 'Standard Bank'],
    bank_feedback: ['ABSA', 'Nedbank', 'Investec'],
    approved: ['ABSA', 'FNB', 'Standard Bank'],
    grant_signed: ['ABSA', 'FNB'],
    bond_instruction_sent: ['FNB', 'ABSA'],
    transfer_in_progress: ['FNB', 'ABSA', 'Standard Bank'],
    registered: ['ABSA', 'FNB', 'Standard Bank'],
    declined_or_cancelled: ['Investec', 'Nedbank', 'Standard Bank'],
  }
  const list = byBucket[bucketKey] || BANK_CATALOG
  return list[index % list.length]
}

function buildStory(bucketKey = '', applicationIndex = 0, bank = '', buyer = {}, branch = {}, development = {}, unitSpec = {}) {
  const suburbLabel = `${development.name}, ${branch.suburb}`
  const storySets = {
    new_finance_requested: [
      `New finance help request from ${buyer.name} for ${suburbLabel}.`,
      `Agent asked for bond assistance after reservation on ${unitSpec.unitNumber}.`,
    ],
    awaiting_contact: [
      `Buyer asked for a call back after work hours before submitting income docs.`,
      `Consultant needs to complete affordability call with ${buyer.name}.`,
    ],
    documents_required: [
      'Awaiting updated 3-month bank statements from client.',
      'Buyer missing latest payslip for 6 days.',
      'Self-employed client awaiting accountant letter.',
      `${bank} requested updated bank statements before review.`,
    ],
    pre_qualification: [
      'Affordability captured and DIP pack under review.',
      `Income and liabilities captured for ${buyer.name}; preparing pre-qual output.`,
    ],
    ready_for_submission: [
      'Documents checked, affordability signed off, pack ready for bank launch.',
      `Application pack complete and queued for ${bank} submission this afternoon.`,
    ],
    submitted_to_banks: [
      `Application lodged with ${bank}; awaiting first assessment.`,
      `${bank} submission confirmed with valuation booking pending.`,
    ],
    bank_feedback: [
      `${bank} requested clarification on vehicle finance.`,
      `${bank} queried source of deposit and latest salary credit.`,
    ],
    approved: [
      `${bank} issued approval in principle within 24 hours.`,
      `Approval received and rate options shared with ${buyer.name}.`,
    ],
    grant_signed: [
      'Grant signed by client and awaiting attorney instruction.',
      'Client accepted grant and guarantees pack is being prepared.',
    ],
    bond_instruction_sent: [
      'Grant signed but attorney instruction delayed pending guarantees.',
      'Attorney handoff sent after signed grant and bank conditions met.',
    ],
    transfer_in_progress: [
      'Attorney confirmed guarantees received and transfer prep is in motion.',
      'Bond instruction sent; attorney waiting on final FICA refresh before lodgement.',
      'Transfer pack in drafting with finance conditions satisfied.',
    ],
    registered: [
      `Registration confirmed after finance support on ${unitSpec.unitNumber}.`,
      'Bond team monitoring completed and file is ready for closeout reporting.',
    ],
    declined_or_cancelled: [
      `${bank} declined due to affordability ratio and existing vehicle finance.`,
      'Client paused purchase after valuation shortfall and deposit pressure.',
      'Application cancelled after buyer chose cash alternative with family support.',
    ],
  }
  const stories = storySets[bucketKey] || storySets.awaiting_contact
  return stories[applicationIndex % stories.length]
}

function getAttorneyStage(bucketKey = '', applicationIndex = 0) {
  if (bucketKey === 'registered') return 'registered'
  if (bucketKey !== 'transfer_in_progress' && bucketKey !== 'bond_instruction_sent' && bucketKey !== 'grant_signed') return null
  const stages = ['instruction_received', 'documents_pending', 'preparation_in_progress', 'ready_for_lodgement', 'lodged_at_deeds_office']
  return stages[applicationIndex % stages.length]
}

function getStageConfiguration(bucketKey = '', applicationIndex = 0, bank = '', attorney = '') {
  const dueSoon = isoDaysFromNow(seededInt(`${bucketKey}:${applicationIndex}:due`, 1, 6))
  const overdue = isoDaysAgo(seededInt(`${bucketKey}:${applicationIndex}:overdue`, 8, 18))
  const configs = {
    new_finance_requested: {
      stage: 'Finance Requested',
      mainStage: 'FIN',
      financeStatus: 'new_finance_request',
      nextAction: 'Allocate consultant and complete first affordability call',
      currentSubStage: 'Lead captured from developer / agency referral',
      documentsMissing: false,
      missingDocumentsCount: 0,
      uploadedDocumentsCount: 0,
      totalRequiredDocuments: 5,
      applicationPrepared: false,
      submittedToBanks: false,
      bankFeedbackPending: false,
      complianceStatus: 'clear',
      nextActionDueAt: dueSoon,
      financeDueAt: dueSoon,
      attorneyStage: null,
    },
    awaiting_contact: {
      stage: 'Awaiting Contact',
      mainStage: 'FIN',
      financeStatus: 'awaiting_contact',
      nextAction: 'Contact client and collect income profile',
      currentSubStage: 'Call-back and affordability intake pending',
      documentsMissing: false,
      missingDocumentsCount: 0,
      uploadedDocumentsCount: 1,
      totalRequiredDocuments: 5,
      applicationPrepared: false,
      submittedToBanks: false,
      bankFeedbackPending: false,
      complianceStatus: 'clear',
      nextActionDueAt: dueSoon,
      financeDueAt: dueSoon,
      attorneyStage: null,
    },
    documents_required: {
      stage: 'Documents Required',
      mainStage: 'FIN',
      financeStatus: 'documents_pending',
      nextAction: 'Follow up on missing documents before pack review',
      currentSubStage: 'Docs collection in progress',
      documentsMissing: true,
      missingDocumentsCount: 2 + (applicationIndex % 3),
      uploadedDocumentsCount: 2 + (applicationIndex % 2),
      totalRequiredDocuments: 6 + (applicationIndex % 3),
      applicationPrepared: false,
      submittedToBanks: false,
      bankFeedbackPending: false,
      complianceStatus: 'clear',
      nextActionDueAt: applicationIndex % 3 === 0 ? overdue : dueSoon,
      financeDueAt: applicationIndex % 3 === 0 ? overdue : dueSoon,
      attorneyStage: null,
    },
    pre_qualification: {
      stage: 'Pre-Approval',
      mainStage: 'FIN',
      financeStatus: 'pre_qualification',
      nextAction: 'Review affordability result and select best-fit bank panel',
      currentSubStage: 'DIP analysis and packaging underway',
      documentsMissing: false,
      missingDocumentsCount: 0,
      uploadedDocumentsCount: 5,
      totalRequiredDocuments: 6,
      applicationPrepared: false,
      submittedToBanks: false,
      bankFeedbackPending: false,
      complianceStatus: 'clear',
      nextActionDueAt: dueSoon,
      financeDueAt: dueSoon,
      attorneyStage: null,
    },
    ready_for_submission: {
      stage: 'Ready for Submission',
      mainStage: 'FIN',
      financeStatus: 'prepared',
      nextAction: `Launch application to ${bank} and alternate lenders`,
      currentSubStage: 'Application pack complete and queued',
      documentsMissing: false,
      missingDocumentsCount: 0,
      uploadedDocumentsCount: 6,
      totalRequiredDocuments: 6,
      applicationPrepared: true,
      submittedToBanks: false,
      bankFeedbackPending: false,
      complianceStatus: 'clear',
      nextActionDueAt: dueSoon,
      financeDueAt: dueSoon,
      attorneyStage: null,
    },
    submitted_to_banks: {
      stage: 'Submitted to Banks',
      mainStage: 'FIN',
      financeStatus: 'submitted_to_banks',
      nextAction: `Await first lender response from ${bank}`,
      currentSubStage: 'Submission lodged with panel banks',
      documentsMissing: false,
      missingDocumentsCount: 0,
      uploadedDocumentsCount: 6,
      totalRequiredDocuments: 6,
      applicationPrepared: true,
      submittedToBanks: true,
      bankFeedbackPending: false,
      complianceStatus: 'clear',
      nextActionDueAt: dueSoon,
      financeDueAt: dueSoon,
      attorneyStage: null,
    },
    bank_feedback: {
      stage: 'Bank Feedback',
      mainStage: 'FIN',
      financeStatus: 'bank_feedback_pending',
      nextAction: `Respond to ${bank} query and refresh supporting docs`,
      currentSubStage: 'Lender query requires action',
      documentsMissing: true,
      missingDocumentsCount: 1,
      uploadedDocumentsCount: 6,
      totalRequiredDocuments: 7,
      applicationPrepared: true,
      submittedToBanks: true,
      bankFeedbackPending: true,
      complianceStatus: 'clear',
      nextActionDueAt: overdue,
      financeDueAt: overdue,
      attorneyStage: null,
    },
    approved: {
      stage: 'Bond Approved',
      mainStage: 'FIN',
      financeStatus: 'approved',
      nextAction: `Present ${bank} approval to client and confirm grant acceptance`,
      currentSubStage: 'Approval granted and client decision pending',
      documentsMissing: false,
      missingDocumentsCount: 0,
      uploadedDocumentsCount: 7,
      totalRequiredDocuments: 7,
      applicationPrepared: true,
      submittedToBanks: true,
      bankFeedbackPending: false,
      complianceStatus: 'clear',
      nextActionDueAt: dueSoon,
      financeDueAt: dueSoon,
      attorneyStage: null,
    },
    grant_signed: {
      stage: 'Grant Signed',
      mainStage: 'ATTY',
      financeStatus: 'approved',
      nextAction: `Finalize instruction pack for ${attorney || 'transfer attorney'}`,
      currentSubStage: 'Grant accepted and attorney handoff being prepared',
      documentsMissing: false,
      missingDocumentsCount: 0,
      uploadedDocumentsCount: 7,
      totalRequiredDocuments: 7,
      applicationPrepared: true,
      submittedToBanks: true,
      bankFeedbackPending: false,
      complianceStatus: 'clear',
      nextActionDueAt: dueSoon,
      financeDueAt: dueSoon,
      attorneyStage: 'instruction_received',
    },
    bond_instruction_sent: {
      stage: 'Instruction Sent',
      mainStage: 'ATTY',
      financeStatus: 'approved',
      nextAction: `Attorney instructed; confirm guarantees and transfer prep with ${attorney || 'transfer team'}`,
      currentSubStage: 'Bond instruction issued to attorney',
      documentsMissing: false,
      missingDocumentsCount: 0,
      uploadedDocumentsCount: 8,
      totalRequiredDocuments: 8,
      applicationPrepared: true,
      submittedToBanks: true,
      bankFeedbackPending: false,
      complianceStatus: 'clear',
      nextActionDueAt: dueSoon,
      financeDueAt: dueSoon,
      attorneyStage: 'preparation_in_progress',
    },
    transfer_in_progress: {
      stage: 'Instruction Sent',
      mainStage: applicationIndex % 4 === 0 ? 'XFER' : 'ATTY',
      financeStatus: 'approved',
      nextAction: `Monitor transfer progress with ${attorney || 'assigned attorney'}`,
      currentSubStage: 'Attorney transfer and lodgement progression',
      documentsMissing: false,
      missingDocumentsCount: applicationIndex % 6 === 0 ? 1 : 0,
      uploadedDocumentsCount: 8,
      totalRequiredDocuments: 8,
      applicationPrepared: true,
      submittedToBanks: true,
      bankFeedbackPending: false,
      complianceStatus: 'clear',
      nextActionDueAt: applicationIndex % 5 === 0 ? overdue : dueSoon,
      financeDueAt: applicationIndex % 5 === 0 ? overdue : dueSoon,
      attorneyStage: getAttorneyStage('transfer_in_progress', applicationIndex),
    },
    registered: {
      stage: 'Registered',
      mainStage: 'REG',
      financeStatus: 'approved',
      nextAction: 'Archive file and include in completed registration reporting',
      currentSubStage: 'Registration complete and post-closeout checks pending',
      documentsMissing: false,
      missingDocumentsCount: 0,
      uploadedDocumentsCount: 8,
      totalRequiredDocuments: 8,
      applicationPrepared: true,
      submittedToBanks: true,
      bankFeedbackPending: false,
      complianceStatus: 'clear',
      nextActionDueAt: null,
      financeDueAt: null,
      attorneyStage: 'registered',
    },
    declined_or_cancelled: {
      stage: 'Declined',
      mainStage: 'FIN',
      financeStatus: applicationIndex % 2 === 0 ? 'declined' : 'cancelled',
      nextAction: 'Close file and return client to advisor for alternate strategy',
      currentSubStage: 'Application halted after decline or client withdrawal',
      documentsMissing: false,
      missingDocumentsCount: 0,
      uploadedDocumentsCount: 4,
      totalRequiredDocuments: 6,
      applicationPrepared: true,
      submittedToBanks: applicationIndex % 2 === 0,
      bankFeedbackPending: false,
      complianceStatus: 'clear',
      nextActionDueAt: null,
      financeDueAt: null,
      attorneyStage: null,
    },
  }
  return configs[bucketKey] || configs.awaiting_contact
}

function getPurchaseAndBondAmounts(unitSpec = {}, buyer = {}, applicationIndex = 0) {
  const purchasePrice = unitSpec.price
  const blend = resolveFinanceBlend(applicationIndex)
  const depositRate =
    blend === 'ten_percent_deposit'
      ? 0.1
      : blend === 'thirty_percent_deposit'
        ? 0.3
        : blend === 'hybrid_finance'
          ? 0.18
          : 0
  const bondRate = 1 - depositRate
  const bondAmount = Math.round(Math.max(600000, Math.min(7000000, purchasePrice * bondRate)))
  return {
    financeType: blend === 'hybrid_finance' ? 'combination' : 'bond',
    depositAmount: Math.round(purchasePrice * depositRate),
    cashAmount: Math.round(purchasePrice * depositRate),
    purchasePrice,
    bondAmount,
    bondRatio: bondRate,
    financeBlend: buyer.financeBlend,
  }
}

function getCommissionAmounts(purchasePrice = 0) {
  const gross = Math.round(purchasePrice * 0.035)
  const agent = Math.round(gross * 0.4)
  const agency = Math.round(gross * 0.6)
  return { gross, agent, agency }
}

function resolveRecencyDays(bucketKey = '', applicationIndex = 0) {
  if (bucketKey === 'registered') return seededInt(`registered:${applicationIndex}`, 38, 87)
  if (bucketKey === 'transfer_in_progress') return seededInt(`transfer:${applicationIndex}`, 16, 72)
  if (bucketKey === 'declined_or_cancelled') return seededInt(`declined:${applicationIndex}`, 9, 78)
  return seededInt(`active:${bucketKey}:${applicationIndex}`, 0, 28)
}

function buildApplicationRecords(users = [], hierarchy = createHierarchy()) {
  const consultantQuotaState = createQuotaState(CONSULTANT_QUOTAS)
  const processorQuotaState = createQuotaState(PROCESSOR_QUOTAS)
  const branchQuotaState = buildBranchQuotaState()
  const complianceToggle = ['olivia_brown', 'megan_jacobs']
  const applications = []

  const allBuckets = [
    ...ACTIVE_PIPELINE_BUCKETS,
    ...TRANSFER_BUCKETS,
    DECLINED_BUCKET,
  ]

  let applicationIndex = 0
  for (const bucket of allBuckets) {
    for (let bucketIndex = 0; bucketIndex < bucket.count; bucketIndex += 1) {
      const branchKey = chooseBranchForBucket(bucket.key, branchQuotaState)
      const branch = BRANCH_CATALOG.find((item) => item.key === branchKey) || BRANCH_CATALOG[0]
      const regionId = hierarchy.regionIdByKey[branch.regionKey] || null
      const branchId = hierarchy.branchIdByKey[branch.key] || null
      const teamId = hierarchy.teamIdByBranchKey[branch.key] || null
      const consultantKey = pickWithQuota(branch.consultantKeys, consultantQuotaState, `consultant:${bucket.key}:${applicationIndex}`, Object.keys(CONSULTANT_QUOTAS))
      const processorKey = pickWithQuota(branch.processorKeys, processorQuotaState, `processor:${bucket.key}:${applicationIndex}`, Object.keys(PROCESSOR_QUOTAS))
      const consultant = getUserByKey(users, consultantKey) || getUserByKey(users, 'emma_roberts')
      const processor = getUserByKey(users, processorKey) || getUserByKey(users, 'tarryn_meyer')
      const complianceKey = complianceToggle[(applicationIndex + bucketIndex) % complianceToggle.length]
      const compliance = getUserByKey(users, complianceKey) || getUserByKey(users, 'olivia_brown')
      const regionalManager = getUserByKey(users, branch.regionalManagerKey) || getUserByKey(users, 'sarah_jacobs')
      const branchManager = getUserByKey(users, branch.branchManagerKey) || regionalManager
      const buyer = createBuyerProfile(applicationIndex, branch, bucket.key)
      const development = chooseDevelopment(branch.key, applicationIndex)
      const unitSpec = createUnitSpec(applicationIndex, development)
      const bank = getBankForBucket(bucket.key, applicationIndex)
      const attorney = ATTORNEY_CATALOG[(applicationIndex + bucketIndex) % ATTORNEY_CATALOG.length]
      const agency = AGENCY_CATALOG[(applicationIndex + bucketIndex) % AGENCY_CATALOG.length]
      const stageConfig = getStageConfiguration(bucket.key, applicationIndex, bank, attorney)
      const explicitAtRisk = AT_RISK_APPLICATION_INDEXES.has(applicationIndex)
      const explicitComplianceFlag = COMPLIANCE_FLAG_APPLICATION_INDEXES.has(applicationIndex)
      if (explicitAtRisk) {
        stageConfig.nextActionDueAt = isoDaysAgo(seededInt(`risk-due:${applicationIndex}`, 8, 16))
        stageConfig.financeDueAt = stageConfig.nextActionDueAt
      } else if (stageConfig.nextActionDueAt && new Date(stageConfig.nextActionDueAt).getTime() < REFERENCE_NOW.getTime()) {
        stageConfig.nextActionDueAt = isoDaysFromNow(seededInt(`future-due:${applicationIndex}`, 1, 5))
        stageConfig.financeDueAt = stageConfig.nextActionDueAt
      }
      if (explicitComplianceFlag) {
        stageConfig.complianceStatus = 'review_required'
      }
      const story = buildStory(bucket.key, applicationIndex, bank, buyer, branch, development, unitSpec)
      const finance = getPurchaseAndBondAmounts(unitSpec, buyer, applicationIndex)
      const commission = getCommissionAmounts(finance.purchasePrice)
      const updatedDaysAgo = resolveRecencyDays(bucket.key, applicationIndex)
      const createdDaysAgo = updatedDaysAgo + seededInt(`created-gap:${bucket.key}:${applicationIndex}`, 4, 32)
      const updatedAt = isoDaysAgo(updatedDaysAgo, seededInt(`updated-hour:${applicationIndex}`, 0, 8))
      const createdAt = isoDaysAgo(createdDaysAgo, seededInt(`created-hour:${applicationIndex}`, -5, 3))
      const reference = `BND-${String(applicationIndex + 1).padStart(4, '0')}`
      const riskFlag = explicitAtRisk
      const portalReady = applicationIndex < 15
      const atRisk = explicitAtRisk
      const declineReason = bucket.key === 'declined_or_cancelled'
        ? buildStory(bucket.key, applicationIndex + 2, bank, buyer, branch, development, unitSpec)
        : ''
      const metadata = buildManagedMetadata({
        application_bucket: bucket.key,
        branch_key: branch.key,
        region_key: branch.regionKey,
        workload_story: bucket.priority,
        buyer_profile: {
          purchaserType: buyer.purchaserType,
          coApplicantName: buyer.coApplicantName,
          employmentType: buyer.employmentType,
          salaryBand: buyer.salaryBand,
          financeBlend: finance.financeBlend,
        },
        operational_story: story,
        overdue: Boolean(stageConfig.nextActionDueAt && new Date(stageConfig.nextActionDueAt).getTime() < REFERENCE_NOW.getTime()),
        compliance_flag: stageConfig.complianceStatus === 'review_required',
        demo_portal_ready: portalReady,
      })

      applications.push({
        applicationIndex,
        bucketKey: bucket.key,
        priorityKey: bucket.priority,
        transactionId: deterministicUuid(`transaction:${reference}`),
        transactionReference: reference,
        workspaceId: hierarchy.workspace.id,
        regionId,
        branchId,
        teamId,
        branch,
        regionalManager,
        branchManager,
        consultant,
        processor,
        compliance,
        buyer,
        development,
        unitSpec,
        bank,
        attorney,
        agency,
        stageConfig,
        story,
        finance,
        commission,
        metadata,
        updatedAt,
        createdAt,
        portalReady,
        atRisk,
        declineReason,
      })
      applicationIndex += 1
    }
  }

  return applications
}

function buildTransactionRows(applications = []) {
  return applications.map((application) => {
    const { stageConfig, buyer, development, unitSpec, consultant, processor, compliance, branchManager } = application
    const branch = application.branch
    const propertyAddress = `${unitSpec.unitLabel}, ${development.suburb}, ${development.city}`
    const registeredAt = application.bucketKey === 'registered' ? application.updatedAt : null
    const cancelledAt = application.bucketKey === 'declined_or_cancelled' ? application.updatedAt : null
    const lastMeaningfulActivityAt = application.updatedAt

    return {
      id: application.transactionId,
      organisation_id: application.workspaceId,
      transaction_reference: application.transactionReference,
      transaction_type: 'bond_application',
      property_type: 'developer_sale',
      development_id: unitSpec.developmentId,
      unit_id: unitSpec.id,
      buyer_id: buyer.id,
      property_address_line_1: propertyAddress,
      suburb: development.suburb,
      city: development.city,
      province: branch.province,
      property_description: `${unitSpec.unitNumber}, ${development.name}`,
      sales_price: application.finance.purchasePrice,
      purchase_price: application.finance.purchasePrice,
      finance_type: application.finance.financeType,
      purchaser_type: buyer.purchaserType,
      stage: stageConfig.stage,
      current_main_stage: stageConfig.mainStage,
      current_sub_stage_summary: application.story,
      assigned_agent: application.agency,
      assigned_agent_email: `${normalizeSlug(application.agency)}@partners.demo.bridgefinance.co.za`,
      attorney: application.attorney,
      assigned_attorney_email: `${normalizeSlug(application.attorney)}@attorneys.demo.bridgefinance.co.za`,
      bond_originator: consultant?.name || 'Bond Consultant',
      assigned_bond_originator_email: consultant?.email || null,
      bank: application.bank,
      next_action: stageConfig.nextAction,
      comment: application.bucketKey === 'declined_or_cancelled' ? application.declineReason : application.story,
      expected_transfer_date: application.bucketKey === 'registered' ? isoDateDaysAgo(resolveRecencyDays('registered', application.applicationIndex)) : isoDateDaysAgo(Math.max(resolveRecencyDays(application.bucketKey, application.applicationIndex) - 12, 1)),
      owner_user_id: null,
      access_level: 'shared',
      lifecycle_state: application.bucketKey === 'declined_or_cancelled' ? 'cancelled' : application.bucketKey === 'registered' ? 'completed' : 'active',
      is_active: application.bucketKey !== 'declined_or_cancelled' && application.bucketKey !== 'registered',
      updated_at: application.updatedAt,
      created_at: application.createdAt,
      bond_workspace_id: application.workspaceId,
      bond_region_id: application.regionId,
      bond_workspace_unit_id: application.branchId,
      primary_bond_consultant_user_id: consultant?.userId || null,
      assigned_bond_processor_user_id: processor?.userId || null,
      assigned_bond_manager_user_id: branchManager?.userId || null,
      assigned_bond_compliance_user_id: compliance?.userId || null,
      bond_assignment_status: application.bucketKey === 'declined_or_cancelled' ? 'fully_assigned' : 'fully_assigned',
      bond_assignment_source: 'workflow_assignment',
      risk_status: application.atRisk ? 'At Risk' : application.bucketKey === 'registered' ? 'Registered' : 'On Track',
      operational_state: application.bucketKey === 'registered' ? 'registered' : application.atRisk ? 'needs_attention' : 'flowing',
      attorney_stage: stageConfig.attorneyStage,
      finance_status: stageConfig.financeStatus,
      compliance_status: stageConfig.complianceStatus,
      compliance_review_required: stageConfig.complianceStatus === 'review_required',
      application_prepared: stageConfig.applicationPrepared,
      submitted_to_banks: stageConfig.submittedToBanks,
      documents_complete: !stageConfig.documentsMissing,
      finance_documents_complete: !stageConfig.documentsMissing,
      documents_missing: stageConfig.documentsMissing,
      missing_documents_count: stageConfig.missingDocumentsCount,
      uploaded_documents_count: stageConfig.uploadedDocumentsCount,
      total_required_documents: stageConfig.totalRequiredDocuments,
      bank_feedback_pending: stageConfig.bankFeedbackPending,
      bank_feedback_status: stageConfig.bankFeedbackPending ? 'action_required' : 'clear',
      next_action_due_at: stageConfig.nextActionDueAt,
      finance_due_at: stageConfig.financeDueAt,
      processor_name: processor?.name || null,
      assigned_bond_processor_name: processor?.name || null,
      compliance_name: compliance?.name || null,
      gross_commission_amount: application.commission.gross,
      agent_commission_amount: application.commission.agent,
      agency_commission_amount: application.commission.agency,
      last_meaningful_activity_at: lastMeaningfulActivityAt,
      metadata: application.metadata,
      registered_at: registeredAt,
      completed_at: registeredAt,
      cancelled_at: cancelledAt,
    }
  })
}

function buildFinanceDetailsRows(applications = []) {
  return applications.map((application) => ({
    transaction_id: application.transactionId,
    proof_of_funds_received: ['approved', 'grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey),
    deposit_required: application.finance.depositAmount > 0,
    deposit_paid: application.bucketKey !== 'new_finance_requested' && application.bucketKey !== 'awaiting_contact',
    bond_submitted: ['submitted_to_banks', 'bank_feedback', 'approved', 'grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey),
    bond_approved: ['approved', 'grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey),
    grant_signed: ['grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey),
    proceed_to_attorneys: ['bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey),
    cash_portion: application.finance.cashAmount,
    bond_portion: application.finance.bondAmount,
    bond_originator: application.consultant?.name || null,
    bank: application.bank,
    attorney: application.attorney,
    expected_transfer_date: isoDateDaysAgo(Math.max(resolveRecencyDays(application.bucketKey, application.applicationIndex) - 10, 1)),
    next_action: application.stageConfig.nextAction,
    updated_at: application.updatedAt,
  }))
}

function buildSubprocessRows(applications = []) {
  const subprocesses = []
  const steps = []
  for (const application of applications) {
    const subprocessId = deterministicUuid(`subprocess:bond:${application.transactionReference}`)
    subprocesses.push({
      id: subprocessId,
      transaction_id: application.transactionId,
      process_type: 'bond',
      owner_type: 'bond_originator',
      status: application.bucketKey === 'registered' ? 'completed' : application.bucketKey === 'declined_or_cancelled' ? 'cancelled' : 'in_progress',
      created_at: application.createdAt,
      updated_at: application.updatedAt,
    })

    const stageOrder = [
      ['lead', 'Lead captured'],
      ['docs', 'Documents collected'],
      ['submit', 'Submitted to banks'],
      ['decision', 'Bank decision'],
      ['handoff', 'Attorney handoff'],
    ]

    for (const [index, [stepKey, stepLabel]] of stageOrder.entries()) {
      const completed =
        (stepKey === 'lead' && application.bucketKey !== 'new_finance_requested') ||
        (stepKey === 'docs' && !application.stageConfig.documentsMissing && application.stageConfig.uploadedDocumentsCount >= 5) ||
        (stepKey === 'submit' && application.stageConfig.submittedToBanks) ||
        (stepKey === 'decision' && ['approved', 'grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey)) ||
        (stepKey === 'handoff' && ['bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey))

      steps.push({
        id: deterministicUuid(`subprocess-step:${application.transactionReference}:${stepKey}`),
        subprocess_id: subprocessId,
        step_key: stepKey,
        step_label: stepLabel,
        status: completed ? 'completed' : stepKey === 'lead' ? 'in_progress' : 'not_started',
        owner_type: 'bond_originator',
        sort_order: index + 1,
        comment: completed ? `${stepLabel} completed in demo seed.` : null,
        completed_at: completed ? application.updatedAt : null,
        created_at: application.createdAt,
        updated_at: application.updatedAt,
      })
    }
  }

  return { subprocesses, steps }
}

function buildDocumentRows(applications = [], ownerUserId = null) {
  const requests = []
  const documents = []
  for (const application of applications) {
    const requiredCount = application.stageConfig.totalRequiredDocuments
    const uploadedCount = application.stageConfig.uploadedDocumentsCount
    const missingCount = application.stageConfig.missingDocumentsCount
    const rejectedCount = application.bucketKey === 'documents_required' && application.applicationIndex % 4 === 0 ? 1 : 0
    const requestedTypes = DOCUMENT_TYPE_SEQUENCE.slice(0, requiredCount)

    requestedTypes.forEach((documentType, index) => {
      const uploaded = index < uploadedCount
      const rejected = uploaded && index === uploadedCount - 1 && rejectedCount > 0
      const approved = uploaded && !rejected && ['approved', 'grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey)
      const status = rejected ? 'rejected' : approved ? 'approved' : uploaded ? 'uploaded' : 'requested'
      const createdAt = isoDaysAgo(resolveRecencyDays(application.bucketKey, application.applicationIndex) + seededInt(`doc-created:${application.transactionReference}:${index}`, 1, 25))
      const updatedAt = uploaded
        ? isoDaysAgo(Math.max(resolveRecencyDays(application.bucketKey, application.applicationIndex) - seededInt(`doc-updated:${application.transactionReference}:${index}`, 0, 8), 0))
        : createdAt
      const title = documentType
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
      const requestId = deterministicUuid(`document-request:${application.transactionReference}:${documentType}`)

      requests.push({
        id: requestId,
        transaction_id: application.transactionId,
        category: 'Bond Finance',
        document_type: documentType,
        title,
        description: missingCount > 0 && !uploaded ? `Still needed to progress ${application.transactionReference}.` : `Supporting document for ${application.transactionReference}.`,
        priority: index < 4 ? 'required' : 'supporting',
        due_date: application.stageConfig.nextActionDueAt ? application.stageConfig.nextActionDueAt.slice(0, 10) : null,
        assigned_to_role: 'bond_originator',
        assigned_to_user_id: application.consultant?.userId || ownerUserId,
        status,
        requires_review: uploaded || approved || rejected,
        requested_from: 'buyer',
        visibility_scope: 'client_visible',
        request_type: 'bond_finance',
        notes: rejected ? 'Please re-upload clearer copy.' : 'Demo runtime request',
        created_by: ownerUserId,
        created_by_role: 'bond_originator',
        created_at: createdAt,
        updated_at: updatedAt,
      })

      if (uploaded) {
        documents.push({
          id: deterministicUuid(`document:${application.transactionReference}:${documentType}`),
          transaction_id: application.transactionId,
          name: `${application.buyer.name} ${title}.pdf`,
          file_path: `bond-demo/${application.transactionReference}/${normalizeSlug(title)}.pdf`,
          category: 'Bond Finance',
          document_type: documentType,
          visibility_scope: 'client_visible',
          uploaded_by_user_id: ownerUserId,
          stage_key: application.bucketKey,
          is_client_visible: true,
          uploaded_by_role: 'buyer',
          uploaded_by_email: application.buyer.email,
          created_at: createdAt,
          updated_at: updatedAt,
        })
      }
    })
  }
  return { requests, documents }
}

function buildCommentRows(applications = []) {
  const comments = []
  const templates = [
    'Consultant note: Client advised salary increase effective next month.',
    'Processor note: Awaiting updated 3-month bank statements from client.',
    'Operational update: Bank submission pack checked and indexed for handoff.',
    'Attorney coordination: Awaiting guarantees release before transfer pack closes.',
  ]
  for (const application of applications) {
    const commentCount = application.portalReady ? 3 : 2
    for (let index = 0; index < commentCount; index += 1) {
      comments.push({
        id: deterministicUuid(`comment:${application.transactionReference}:${index}`),
        transaction_id: application.transactionId,
        author_name: index === 0 ? application.consultant?.name || 'Bond Consultant' : index === 1 ? application.processor?.name || 'Processor' : application.attorney,
        author_role: index === 0 ? 'bond_originator' : index === 1 ? 'processor' : 'attorney',
        comment_text: `[operational] ${templates[(application.applicationIndex + index) % templates.length]}`,
        created_at: isoDaysAgo(resolveRecencyDays(application.bucketKey, application.applicationIndex) + seededInt(`comment:${application.transactionReference}:${index}`, 1, 16)),
      })
    }
  }
  return comments
}

function buildEventRows(applications = [], ownerUserId = null) {
  const events = []
  for (const application of applications) {
    const eventSeedPrefix = `event:${application.transactionReference}`
    const introTime = isoDaysAgo(resolveRecencyDays(application.bucketKey, application.applicationIndex) + 20)
    const onboardingTime = isoDaysAgo(resolveRecencyDays(application.bucketKey, application.applicationIndex) + 18)
    const documentTime = isoDaysAgo(resolveRecencyDays(application.bucketKey, application.applicationIndex) + 12)
    const updateTime = isoDaysAgo(resolveRecencyDays(application.bucketKey, application.applicationIndex) + 6)
    const latestTime = application.updatedAt
    const attorneyVisible = ['grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey)
    const approvedVisible = ['approved', 'grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey)

    const baseEvents = [
      {
        key: 'bond_originator_assigned',
        createdAt: introTime,
        createdByRole: 'bond_originator',
        eventData: {
          title: 'Meet your bond team',
          description: `${application.consultant?.name || 'Your consultant'} and ${application.processor?.name || 'your processor'} were assigned to your finance file.`,
          visibility: 'client_visible',
          audience: 'buyer',
          actorName: application.consultant?.name || 'Bridge Finance Demo',
          actorRole: 'Bond Originator',
        },
      },
      {
        key: 'onboarding_completed',
        createdAt: onboardingTime,
        createdByRole: 'bond_originator',
        eventData: {
          title: 'Onboarding completed',
          description: `${application.buyer.name} completed the finance intake and profile capture.`,
          visibility: 'client_visible',
          audience: 'buyer',
          actorName: application.consultant?.name || 'Bridge Finance Demo',
          actorRole: 'Bond Originator',
        },
      },
      {
        key: application.stageConfig.documentsMissing ? 'document_requested' : 'document_uploaded',
        createdAt: documentTime,
        createdByRole: application.stageConfig.documentsMissing ? 'bond_originator' : 'buyer',
        eventData: {
          title: application.stageConfig.documentsMissing ? 'Additional documents required' : 'Documents uploaded',
          description: application.stageConfig.documentsMissing
            ? application.story
            : `${application.buyer.name} uploaded the supporting finance pack.`,
          visibility: 'client_visible',
          audience: 'buyer',
          actorName: application.stageConfig.documentsMissing ? (application.processor?.name || application.consultant?.name || 'Bridge Finance Demo') : application.buyer.name,
          actorRole: application.stageConfig.documentsMissing ? 'Bond Originator' : 'Buyer',
        },
      },
      {
        key: approvedVisible ? 'finance_approved' : application.stageConfig.submittedToBanks ? 'finance_submitted' : 'finance_updated',
        createdAt: updateTime,
        createdByRole: 'processor',
        eventData: {
          title: approvedVisible ? 'Finance approved' : application.stageConfig.submittedToBanks ? 'Finance submitted' : 'Finance update',
          description: approvedVisible
            ? `${application.bank} issued bond approval for ${application.transactionReference}.`
            : application.stageConfig.submittedToBanks
              ? `${application.transactionReference} was submitted to ${application.bank}.`
              : application.story,
          visibility: 'client_visible',
          audience: 'buyer',
          actorName: application.processor?.name || 'Bridge Finance Demo',
          actorRole: 'Processor',
        },
      },
      {
        key: attorneyVisible ? 'attorney_assigned' : 'note_shared_with_client',
        createdAt: latestTime,
        createdByRole: attorneyVisible ? 'attorney' : 'bond_originator',
        eventData: {
          title: attorneyVisible ? 'Attorney introduced' : 'Next step update',
          description: attorneyVisible
            ? `${application.attorney} is now tracking the deal through transfer and registration.`
            : application.stageConfig.nextAction,
          visibility: 'client_visible',
          audience: 'buyer',
          actorName: attorneyVisible ? application.attorney : application.consultant?.name || 'Bridge Finance Demo',
          actorRole: attorneyVisible ? 'Attorney' : 'Bond Originator',
        },
      },
    ]

    if (application.bucketKey === 'registered') {
      baseEvents.push({
        key: 'registration_completed',
        createdAt: latestTime,
        createdByRole: 'attorney',
        eventData: {
          title: 'Registration completed',
          description: `${application.transactionReference} progressed to registration completion.`,
          visibility: 'client_visible',
          audience: 'buyer',
          actorName: application.attorney,
          actorRole: 'Attorney',
        },
      })
    }

    for (const [index, event] of baseEvents.entries()) {
      events.push({
        id: deterministicUuid(`${eventSeedPrefix}:${event.key}:${index}`),
        transaction_id: application.transactionId,
        event_type: event.key,
        event_data: event.eventData,
        created_by: ownerUserId,
        created_by_role: event.createdByRole,
        created_at: event.createdAt,
        updated_at: event.createdAt,
      })
    }
  }
  return events
}

function buildNotificationRows(applications = [], ownerUserId = null) {
  const notifications = []
  for (const application of applications) {
    const items = [
      {
        title: 'New finance request received',
        message: `${application.transactionReference} requires team attention for ${application.buyer.name}.`,
        type: 'finance_request',
        eventType: 'finance_updated',
      },
      {
        title:
          application.bucketKey === 'documents_required'
            ? 'Missing documents reminder'
            : application.bucketKey === 'bank_feedback'
              ? 'Bank feedback received'
              : application.bucketKey === 'approved'
                ? 'Application approved'
                : application.bucketKey === 'grant_signed'
                  ? 'Grant signed'
                  : application.bucketKey === 'bond_instruction_sent'
                    ? 'Instruction sent to attorneys'
                    : application.bucketKey === 'declined_or_cancelled'
                      ? 'Application closed'
                      : 'Pipeline follow-up due',
        message:
          application.bucketKey === 'documents_required'
            ? application.story
            : application.bucketKey === 'bank_feedback'
              ? application.story
              : application.bucketKey === 'approved'
                ? `${application.bank} approved ${application.transactionReference}.`
                : application.bucketKey === 'grant_signed'
                  ? `${application.buyer.name} signed the grant documents.`
                  : application.bucketKey === 'bond_instruction_sent'
                    ? `${application.attorney} received the instruction pack.`
                    : application.bucketKey === 'declined_or_cancelled'
                      ? application.declineReason
                      : application.stageConfig.nextAction,
        type:
          application.bucketKey === 'documents_required'
            ? 'documents_missing'
            : application.bucketKey === 'bank_feedback'
              ? 'bank_feedback'
              : application.bucketKey === 'approved'
                ? 'finance_approved'
                : application.bucketKey === 'grant_signed'
                  ? 'grant_signed'
                  : application.bucketKey === 'bond_instruction_sent'
                    ? 'instruction_sent'
                    : application.bucketKey === 'declined_or_cancelled'
                      ? 'application_closed'
                      : 'follow_up_due',
        eventType:
          application.bucketKey === 'approved'
            ? 'finance_approved'
            : application.bucketKey === 'grant_signed'
              ? 'finance_updated'
              : application.bucketKey === 'bond_instruction_sent'
                ? 'attorney_assigned'
                : application.bucketKey === 'documents_required'
                  ? 'document_requested'
                  : application.bucketKey === 'bank_feedback'
                    ? 'finance_updated'
                    : 'finance_updated',
      },
    ]

    if (application.atRisk) {
      items.push({
        title: 'At-risk file needs intervention',
        message: `${application.transactionReference} is overdue or blocked: ${application.story}`,
        type: 'at_risk',
        eventType: 'finance_updated',
      })
    }

    for (const [index, item] of items.entries()) {
      notifications.push({
        id: deterministicUuid(`notification:${application.transactionReference}:${index}`),
        transaction_id: application.transactionId,
        user_id: ownerUserId,
        role_type: 'bond_originator',
        notification_type: item.type,
        title: item.title,
        message: item.message,
        is_read: application.applicationIndex % 5 === 0 && index === 0,
        read_at: application.applicationIndex % 5 === 0 && index === 0 ? application.updatedAt : null,
        dedupe_key: `${application.transactionReference}:${item.type}:${index}`,
        event_type: item.eventType,
        event_data: buildManagedMetadata({ transaction_reference: application.transactionReference, bucket: application.bucketKey }),
        updated_at: application.updatedAt,
      })
    }
  }
  return notifications
}

function buildParticipantRows(applications = []) {
  const participants = []
  for (const application of applications) {
    const commonMeta = buildManagedMetadata({
      transaction_reference: application.transactionReference,
      branch_key: application.branch.key,
    })
    const rows = [
      {
        id: deterministicUuid(`participant:${application.transactionReference}:client`),
        transaction_id: application.transactionId,
        role_type: 'client',
        transaction_role: 'buyer',
        legal_role: 'none',
        participant_email: application.buyer.email,
        participant_name: application.buyer.name,
        user_id: null,
        status: 'active',
        removed_at: null,
        metadata: commonMeta,
        created_at: application.createdAt,
        updated_at: application.updatedAt,
      },
      {
        id: deterministicUuid(`participant:${application.transactionReference}:consultant`),
        transaction_id: application.transactionId,
        role_type: 'bond_originator',
        transaction_role: 'bond_originator',
        legal_role: 'none',
        participant_email: application.consultant?.email || null,
        participant_name: application.consultant?.name || null,
        user_id: application.consultant?.userId || null,
        status: 'active',
        removed_at: null,
        metadata: commonMeta,
        created_at: application.createdAt,
        updated_at: application.updatedAt,
      },
      {
        id: deterministicUuid(`participant:${application.transactionReference}:processor`),
        transaction_id: application.transactionId,
        role_type: 'processor',
        transaction_role: 'processor',
        legal_role: 'none',
        participant_email: application.processor?.email || null,
        participant_name: application.processor?.name || null,
        user_id: application.processor?.userId || null,
        status: 'active',
        removed_at: null,
        metadata: commonMeta,
        created_at: application.createdAt,
        updated_at: application.updatedAt,
      },
      {
        id: deterministicUuid(`participant:${application.transactionReference}:compliance`),
        transaction_id: application.transactionId,
        role_type: 'compliance',
        transaction_role: 'compliance',
        legal_role: 'none',
        participant_email: application.compliance?.email || null,
        participant_name: application.compliance?.name || null,
        user_id: application.compliance?.userId || null,
        status: application.stageConfig.complianceStatus === 'review_required' ? 'active' : 'pending',
        removed_at: null,
        metadata: commonMeta,
        created_at: application.createdAt,
        updated_at: application.updatedAt,
      },
    ]
    participants.push(...rows)
  }
  return participants
}

function buildRolePlayerRows(applications = []) {
  const rows = []
  for (const application of applications) {
    const baseSnapshot = {
      consultant: application.consultant?.name || null,
      processor: application.processor?.name || null,
      branch: application.branch.name,
      bank: application.bank,
    }
    rows.push(
      {
        id: deterministicUuid(`roleplayer:${application.transactionReference}:bond-originator`),
        transaction_id: application.transactionId,
        role_type: 'bond_originator',
        selection_source: 'demo_seed',
        preferred_partner_id: null,
        partner_name: application.consultant?.name || null,
        contact_person: application.consultant?.name || null,
        email_address: application.consultant?.email || null,
        phone_number: null,
        website: null,
        physical_address: null,
        province: application.branch.province,
        notes: 'Demo bond team assignment.',
        snapshot_json: baseSnapshot,
        assignment_source: 'demo_seed',
        participant_email: application.consultant?.email || null,
        participant_name: application.consultant?.name || null,
        user_id: application.consultant?.userId || null,
        status: 'active',
        created_at: application.createdAt,
        updated_at: application.updatedAt,
      },
      {
        id: deterministicUuid(`roleplayer:${application.transactionReference}:attorney`),
        transaction_id: application.transactionId,
        role_type: 'attorney',
        selection_source: 'demo_seed',
        preferred_partner_id: null,
        partner_name: application.attorney,
        contact_person: application.attorney,
        email_address: `${normalizeSlug(application.attorney)}@attorneys.demo.bridgefinance.co.za`,
        phone_number: null,
        website: null,
        physical_address: null,
        province: application.branch.province,
        notes: 'Demo transfer attorney.',
        snapshot_json: baseSnapshot,
        assignment_source: 'demo_seed',
        participant_email: `${normalizeSlug(application.attorney)}@attorneys.demo.bridgefinance.co.za`,
        participant_name: application.attorney,
        user_id: null,
        status: 'active',
        created_at: application.createdAt,
        updated_at: application.updatedAt,
      },
    )
  }
  return rows
}

function buildClientPortalLinks(applications = []) {
  return applications
    .filter((application) => application.portalReady)
    .slice(0, 15)
    .map((application) => ({
      id: deterministicUuid(`portal-link:${application.transactionReference}`),
      development_id: application.unitSpec.developmentId,
      unit_id: application.unitSpec.id,
      transaction_id: application.transactionId,
      buyer_id: application.buyer.id,
      token: `bond-demo-${normalizeSlug(application.transactionReference)}-${String(application.applicationIndex + 1).padStart(3, '0')}`,
      is_active: true,
      created_at: application.createdAt,
      updated_at: application.updatedAt,
    }))
}

function buildMembershipRows(plan) {
  return plan.users
    .filter((user) => user.membershipEnabled && user.workspaceId && user.userId)
    .map((user) => {
      const [firstName, ...rest] = user.name.split(' ')
      return {
        organisation_id: user.workspaceId,
        user_id: user.userId,
        first_name: firstName || user.name,
        last_name: rest.join(' ') || null,
        email: user.email,
        role: user.workspaceRole === 'owner' ? 'principal' : user.workspaceRole === 'branch_manager' ? 'branch_manager' : user.workspaceRole === 'regional_manager' ? 'admin' : user.workspaceRole === 'processor' || user.workspaceRole === 'consultant' || user.workspaceRole === 'compliance' ? 'bond_originator' : 'admin',
        workspace_role: user.workspaceRole,
        organisation_role: user.workspaceRole,
        app_role: 'bond_originator',
        workspace_type: DEFAULT_WORKSPACE_TYPE,
        status: 'active',
        scope_level: user.scopeLevel,
        region_id: user.regionId,
        workspace_unit_id: user.workspaceUnitId,
        scope_metadata: buildManagedMetadata({
          user_key: user.key,
          branch_key: user.branchKey,
          region_key: user.regionKey,
        }),
        is_primary_owner: user.key === 'alex_van_der_merwe',
        active_workspace_selected_at: REFERENCE_NOW.toISOString(),
        invited_at: REFERENCE_NOW.toISOString(),
        accepted_at: REFERENCE_NOW.toISOString(),
        joined_at: REFERENCE_NOW.toISOString(),
      }
    })
}

function hydrateUsersWithAuth(users = [], authUserMap = new Map()) {
  return users.map((user) => {
    const matched = authUserMap.get(normalizeEmail(user.email)) || null
    return {
      ...user,
      userId: matched?.id || null,
      authUserFound: Boolean(matched),
    }
  })
}

function buildPlan(inputEnv = {}) {
  const env = {
    ...loadEnv(),
    ...inputEnv,
  }
  const applyRequested = parseBoolean(env.BOND_DEMO_RUNTIME_APPLY)
  const target = normalizeText(env.BOND_DEMO_RUNTIME_TARGET || DEFAULT_TARGET).toLowerCase() || DEFAULT_TARGET
  const dryRunExplicitlyDisabled =
    Object.prototype.hasOwnProperty.call(env, 'BOND_DEMO_RUNTIME_DRY_RUN') &&
    !parseBoolean(env.BOND_DEMO_RUNTIME_DRY_RUN)

  if (!applyRequested && dryRunExplicitlyDisabled) {
    throw new Error('BOND_DEMO_RUNTIME_APPLY=true is required before Bond demo runtime data can write to staging.')
  }
  if (applyRequested && target !== 'staging') {
    throw new Error('Refusing to apply Bond demo runtime data outside staging target.')
  }

  const hierarchy = createHierarchy()
  const users = buildUsers(env, hierarchy)
  const applications = buildApplicationRecords(users, hierarchy)
  const transactionRows = buildTransactionRows(applications)
  const financeDetailRows = buildFinanceDetailsRows(applications)
  const subprocessRows = buildSubprocessRows(applications)
  const buyerRows = unique(applications.map((application) => application.buyer.id)).map((buyerId) => {
    const buyer = applications.find((application) => application.buyer.id === buyerId)?.buyer
    return {
      id: buyer.id,
      name: buyer.name,
      phone: buyer.phone,
      email: buyer.email,
      created_at: applications.find((application) => application.buyer.id === buyerId)?.createdAt || REFERENCE_NOW.toISOString(),
      updated_at: applications.find((application) => application.buyer.id === buyerId)?.updatedAt || REFERENCE_NOW.toISOString(),
    }
  })
  const developmentRows = DEVELOPMENT_CATALOG.map((development) => {
    const branch = BRANCH_CATALOG.find((item) => item.key === development.branchKey) || BRANCH_CATALOG[0]
    const relatedUnits = applications.filter((application) => application.development.key === development.key)
    return {
      id: deterministicUuid(`development:${development.key}`),
      name: development.name,
      planned_units: relatedUnits.length,
      code: normalizeSlug(development.name).toUpperCase().slice(0, 12),
      location: `${development.suburb}, ${development.city}`,
      suburb: development.suburb,
      city: development.city,
      province: branch.province,
      country: 'South Africa',
      description: `${development.developer} showcase development for bond team demos.`,
      status: 'Active',
      developer_company: development.developer,
      total_units_expected: relatedUnits.length,
      handover_enabled: true,
      snag_tracking_enabled: false,
      alterations_enabled: false,
      onboarding_enabled: true,
    }
  })
  const unitRows = unique(applications.map((application) => application.unitSpec.id)).map((unitId) => {
    const match = applications.find((application) => application.unitSpec.id === unitId)
    return {
      id: match.unitSpec.id,
      development_id: match.unitSpec.developmentId,
      unit_number: match.unitSpec.unitNumber,
      unit_label: match.unitSpec.unitLabel,
      block: match.unitSpec.block,
      unit_type: match.unitSpec.unitType,
      bedrooms: match.unitSpec.bedrooms,
      bathrooms: match.unitSpec.bathrooms,
      parking_count: match.unitSpec.parking,
      size_sqm: match.unitSpec.sizeSqm,
      list_price: match.unitSpec.price,
      current_price: match.unitSpec.price,
      price: match.unitSpec.price,
      status: match.bucketKey === 'registered' ? 'Registered' : 'Reserved',
      vat_applicable: false,
      notes: `Demo seed unit linked to ${match.transactionReference}.`,
    }
  })

  return {
    fixtureNamespace: BOND_DEMO_RUNTIME_NAMESPACE,
    fixturePhase: BOND_DEMO_RUNTIME_PHASE,
    executionMode: applyRequested ? 'apply' : 'dry_run',
    dryRun: !applyRequested,
    applied: false,
    applyReason: applyRequested ? 'real_apply_pending' : 'fixture_not_applied',
    target,
    metadataPath: normalizeText(env.BOND_DEMO_RUNTIME_METADATA_PATH || env.BOND_DEMO_RUNTIME_METADATA || DEFAULT_METADATA_PATH),
    workspaceType: DEFAULT_WORKSPACE_TYPE,
    workspace: hierarchy.workspace,
    hierarchy,
    users,
    applications: applications.map((application) => ({
      transactionId: application.transactionId,
      transactionReference: application.transactionReference,
      bucketKey: application.bucketKey,
      branchKey: application.branch.key,
      consultant: application.consultant?.name || null,
      processor: application.processor?.name || null,
      compliance: application.compliance?.name || null,
      bank: application.bank,
      buyer: application.buyer.name,
      portalReady: application.portalReady,
      atRisk: application.atRisk,
    })),
    metrics: {
      totalApplications: applications.length,
      currentPipelineApplications: ACTIVE_PIPELINE_BUCKETS.reduce((sum, bucket) => sum + bucket.count, 0),
      transferStageTransactions: TRANSFER_BUCKETS.find((bucket) => bucket.key === 'transfer_in_progress')?.count || 0,
      registeredTransactions: TRANSFER_BUCKETS.find((bucket) => bucket.key === 'registered')?.count || 0,
      declinedOrCancelled: DECLINED_BUCKET.count,
      portalReadyBuyers: applications.filter((application) => application.portalReady).length,
      atRiskApplications: applications.filter((application) => application.atRisk).length,
      complianceFlags: applications.filter((application) => application.stageConfig.complianceStatus === 'review_required').length,
    },
    createdOrUpdated: {
      organisations: makeCount(),
      workspaceRegions: makeCount(),
      workspaceUnits: makeCount(),
      organisationUsers: makeCount(),
      buyers: makeCount(),
      developments: makeCount(),
      developmentSettings: makeCount(),
      units: makeCount(),
      transactions: makeCount(),
      transactionFinanceDetails: makeCount(),
      transactionSubprocesses: makeCount(),
      transactionSubprocessSteps: makeCount(),
      documentRequests: makeCount(),
      documents: makeCount(),
      transactionComments: makeCount(),
      transactionEvents: makeCount(),
      transactionNotifications: makeCount(),
      transactionParticipants: makeCount(),
      transactionRolePlayers: makeCount(),
      clientPortalLinks: makeCount(),
    },
    missingAuthUsers: [],
    resolvedUserIds: {},
    _raw: {
      hierarchy,
      applications,
      rows: {
        buyers: buyerRows,
        developments: developmentRows,
        developmentSettings: developmentRows.map((row) => ({
          development_id: row.id,
          client_portal_enabled: true,
          snag_reporting_enabled: false,
          alteration_requests_enabled: false,
          service_reviews_enabled: false,
          enabled_modules: ['client_portal', 'bond_tracking', 'documents'],
          stakeholder_teams: ['bond_originator', 'attorney', 'agent'],
        })),
        units: unitRows,
        transactions: transactionRows,
        transactionFinanceDetails: financeDetailRows,
        subprocesses: subprocessRows.subprocesses,
        subprocessSteps: subprocessRows.steps,
      },
    },
  }
}

function writeMetadata(report, outputPath = DEFAULT_METADATA_PATH) {
  const normalizedPath = normalizeText(outputPath || DEFAULT_METADATA_PATH)
  fs.mkdirSync(path.dirname(normalizedPath), { recursive: true })
  const serializable = { ...report }
  delete serializable._raw
  fs.writeFileSync(normalizedPath, `${JSON.stringify(serializable, null, 2)}\n`)
}

function resolveApplyConfig(env = {}) {
  const merged = {
    ...loadEnv(),
    ...env,
  }
  const supabaseUrl = normalizeText(merged.SUPABASE_URL || merged.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(merged.SUPABASE_SERVICE_ROLE_KEY)
  const projectRef = deriveProjectRef(supabaseUrl)
  const target = normalizeText(merged.BOND_DEMO_RUNTIME_TARGET || DEFAULT_TARGET).toLowerCase() || DEFAULT_TARGET

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Bond demo staging apply.')
  }
  if (target !== 'staging') {
    throw new Error('Refusing to apply Bond demo runtime data outside staging target.')
  }
  if (projectRef !== STAGING_PROJECT_REF) {
    throw new Error('Refusing to apply Bond demo runtime data outside the staging Supabase project.')
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    projectRef,
    target,
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
      const wanted = unique((emails || []).map(normalizeEmail))
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
        // Fall through to profiles.
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
          throw new Error(`Bond demo apply failed for ${table}: ${error.message}`)
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

async function applyCount(report, key, table, rows, adapter, options = {}) {
  const knownColumns = typeof adapter.getTableColumns === 'function' ? await adapter.getTableColumns(table) : null
  const prepared = prepareRowsForUpsert(table, rows, { knownColumns })
  const result = await adapter.upsertRows(table, prepared.rows, options)
  report.createdOrUpdated[key] = {
    rowCount: prepared.rows.length,
    ids: prepared.rows.map((row) => row.id || row.transaction_id || row.development_id).filter(Boolean),
    skippedColumns: unique([...(prepared.omittedColumns || []), ...(result.skippedColumns || [])]),
    missing: 0,
  }
  return {
    data: result.data || [],
  }
}

function buildOrganisationRows(plan) {
  return [
    {
      id: plan.workspace.id,
      name: plan.workspace.name,
      display_name: plan.workspace.name,
      slug: plan.workspace.slug,
      type: plan.workspace.workspaceType,
      workspace_type: plan.workspace.workspaceType,
      workspace_kind: plan.workspace.workspaceKind,
      active: true,
      metadata: buildManagedMetadata({
        seed_purpose: 'bond_demo_runtime',
        target_demo_owner: normalizeEmail(getUserByKey(plan.users, 'alex_van_der_merwe')?.email || DEFAULT_DEMO_OWNER_EMAIL),
      }),
    },
  ]
}

function buildWorkspaceRegionRows(plan) {
  return plan.hierarchy.regions.map((region) => ({
    id: region.id,
    workspace_id: region.workspaceId,
    name: region.name,
    code: region.code,
    description: `Bond demo region for ${region.name}.`,
    manager_user_id: getUserByKey(plan.users, region.key === 'gauteng' ? 'sarah_jacobs' : region.key === 'kwazulu_natal' ? 'liam_naidoo' : 'alex_van_der_merwe')?.userId || null,
    active: true,
    metadata: buildManagedMetadata({ region_key: region.key }),
  }))
}

function buildWorkspaceUnitRows(plan) {
  const rows = [
    {
      id: plan.hierarchy.hq.id,
      workspace_id: plan.hierarchy.hq.workspaceId,
      region_id: null,
      parent_unit_id: null,
      unit_type: plan.hierarchy.hq.unitType,
      name: plan.hierarchy.hq.name,
      code: plan.hierarchy.hq.code,
      description: 'Principal and compliance HQ oversight.',
      manager_user_id: getUserByKey(plan.users, 'alex_van_der_merwe')?.userId || null,
      active: true,
      metadata: buildManagedMetadata({ unit_key: 'hq' }),
    },
  ]

  for (const branch of plan.hierarchy.branches) {
    rows.push({
      id: branch.id,
      workspace_id: branch.workspaceId,
      region_id: branch.regionId,
      parent_unit_id: branch.parentUnitId,
      unit_type: 'branch',
      name: branch.name,
      code: branch.code,
      description: `${branch.name} branch operations.`,
      manager_user_id: getUserByKey(plan.users, branch.branchManagerKey)?.userId || getUserByKey(plan.users, branch.regionalManagerKey)?.userId || null,
      active: true,
      metadata: buildManagedMetadata({ unit_key: branch.key, branch_key: branch.key }),
    })
  }

  for (const team of plan.hierarchy.teams) {
    rows.push({
      id: team.id,
      workspace_id: team.workspaceId,
      region_id: team.regionId,
      parent_unit_id: team.parentUnitId,
      unit_type: 'team',
      name: team.name,
      code: team.code,
      description: `Processing desk for ${team.branchKey}.`,
      manager_user_id: null,
      active: true,
      metadata: buildManagedMetadata({ unit_key: team.key, branch_key: team.branchKey }),
    })
  }

  return rows
}

async function performRealApply(plan, adapter) {
  const authUserMap = await adapter.lookupUsersByEmails(plan.users.map((user) => user.email))
  const hydratedUsers = hydrateUsersWithAuth(plan.users, authUserMap)
  const owner = getUserByKey(hydratedUsers, 'alex_van_der_merwe')
  if (!owner?.userId) {
    throw new Error(`Missing required Bond demo owner auth user: ${owner?.email || DEFAULT_DEMO_OWNER_EMAIL}`)
  }

  const hydrated = {
    ...plan,
    users: hydratedUsers,
    resolvedUserIds: Object.fromEntries(hydratedUsers.filter((user) => user.userId).map((user) => [user.key, user.userId])),
    missingAuthUsers: hydratedUsers.filter((user) => user.requiredAuth && !user.userId).map((user) => ({
      key: user.key,
      email: user.email,
    })),
  }

  const ownerUserId = owner.userId
  const { requests, documents } = buildDocumentRows(hydrated._raw.applications, ownerUserId)
  const comments = buildCommentRows(hydrated._raw.applications)
  const events = buildEventRows(hydrated._raw.applications, ownerUserId)
  const notifications = buildNotificationRows(hydrated._raw.applications, ownerUserId)
  const participants = buildParticipantRows(hydrated._raw.applications)
  const rolePlayers = buildRolePlayerRows(hydrated._raw.applications)
  const portalLinks = buildClientPortalLinks(hydrated._raw.applications)

  await applyCount(hydrated, 'organisations', 'organisations', buildOrganisationRows(hydrated), adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'workspaceRegions', 'workspace_regions', buildWorkspaceRegionRows(hydrated), adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'workspaceUnits', 'workspace_units', buildWorkspaceUnitRows(hydrated), adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'organisationUsers', 'organisation_users', buildMembershipRows(hydrated), adapter, { onConflict: 'organisation_id,email' })
  await applyCount(hydrated, 'buyers', 'buyers', hydrated._raw.rows.buyers, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'developments', 'developments', hydrated._raw.rows.developments, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'developmentSettings', 'development_settings', hydrated._raw.rows.developmentSettings, adapter, { onConflict: 'development_id' })
  await applyCount(hydrated, 'units', 'units', hydrated._raw.rows.units, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'transactions', 'transactions', hydrated._raw.rows.transactions, adapter, { onConflict: 'id' })
  const subprocessApply = await applyCount(hydrated, 'transactionSubprocesses', 'transaction_subprocesses', hydrated._raw.rows.subprocesses, adapter, {
    onConflict: 'transaction_id,process_type',
    select: 'id, transaction_id, process_type',
  })
  const subprocessIdByComposite = new Map((subprocessApply.data || []).map((row) => [`${row.transaction_id}:${row.process_type}`, row.id]))
  const remappedSteps = hydrated._raw.rows.subprocessSteps.map((row) => ({
    ...row,
    subprocess_id: subprocessIdByComposite.get(`${hydrated._raw.rows.subprocesses.find((item) => item.id === row.subprocess_id)?.transaction_id}:bond`) || row.subprocess_id,
  }))
  await applyCount(hydrated, 'transactionSubprocessSteps', 'transaction_subprocess_steps', remappedSteps, adapter, { onConflict: 'subprocess_id,step_key' })
  await applyCount(hydrated, 'transactionFinanceDetails', 'transaction_finance_details', hydrated._raw.rows.transactionFinanceDetails, adapter, { onConflict: 'transaction_id' })
  await applyCount(hydrated, 'documentRequests', 'document_requests', requests, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'documents', 'documents', documents, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'transactionComments', 'transaction_comments', comments, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'transactionEvents', 'transaction_events', events, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'transactionNotifications', 'transaction_notifications', notifications, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'transactionParticipants', 'transaction_participants', participants, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'transactionRolePlayers', 'transaction_role_players', rolePlayers, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'clientPortalLinks', 'client_portal_links', portalLinks, adapter, { onConflict: 'id' })

  hydrated.applied = true
  hydrated.applyReason = null
  hydrated.metrics.notifications = notifications.length
  hydrated.metrics.transactionEvents = events.length
  hydrated.metrics.documentRequests = requests.length
  hydrated.metrics.documents = documents.length
  hydrated.metrics.transactionComments = comments.length
  hydrated.metrics.clientPortalLinks = portalLinks.length
  return hydrated
}

export async function runSeeder(inputEnv = {}, options = {}) {
  const plan = buildPlan(inputEnv)
  if (plan.executionMode === 'dry_run') {
    writeMetadata(plan, plan.metadataPath)
    return { report: plan }
  }

  const applyConfig = options.applyConfig || resolveApplyConfig(inputEnv)
  const adapter = options.adapter || createServiceAdapter(applyConfig)
  const appliedReport = await performRealApply(plan, adapter)
  writeMetadata(appliedReport, appliedReport.metadataPath)
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

export { buildPlan as buildBondDemoRuntimePlan, writeMetadata as writeBondDemoRuntimeMetadata }
