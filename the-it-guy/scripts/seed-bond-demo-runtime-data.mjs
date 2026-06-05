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
const TARGET_DEMO_USER_KEY = 'alex_van_der_merwe'
const TARGET_DEMO_REGION_KEY = 'gauteng'
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
    key: 'sandton',
    name: 'Sandton',
    code: 'BOND-DEMO-SDN',
    regionKey: 'gauteng',
    city: 'Johannesburg',
    suburb: 'Sandton',
    province: 'Gauteng',
    consultantKeys: ['emma_roberts', 'thabo_mokoena', 'lerato_khumalo'],
    processorKeys: ['tarryn_meyer', 'carla_smith'],
    complianceKeys: ['olivia_brown'],
    branchManagerKey: 'jason_smith',
    regionalManagerKey: TARGET_DEMO_USER_KEY,
  },
  {
    key: 'centurion',
    name: 'Centurion',
    code: 'BOND-DEMO-CEN',
    regionKey: 'gauteng',
    city: 'Centurion',
    suburb: 'Centurion',
    province: 'Gauteng',
    consultantKeys: ['naledi_maseko', 'priya_patel'],
    processorKeys: ['tarryn_meyer', 'jess_naidoo'],
    complianceKeys: ['olivia_brown', 'megan_jacobs'],
    branchManagerKey: 'jason_smith',
    regionalManagerKey: TARGET_DEMO_USER_KEY,
  },
  {
    key: 'fourways',
    name: 'Fourways',
    code: 'BOND-DEMO-FWY',
    regionKey: 'gauteng',
    city: 'Johannesburg',
    suburb: 'Fourways',
    province: 'Gauteng',
    consultantKeys: ['kabelo_dlamini', 'zanele_khumalo'],
    processorKeys: ['jess_naidoo', 'tarryn_meyer'],
    complianceKeys: ['olivia_brown'],
    branchManagerKey: 'mia_ferreira',
    regionalManagerKey: TARGET_DEMO_USER_KEY,
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
    regionalManagerKey: TARGET_DEMO_USER_KEY,
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
    regionalManagerKey: 'sarah_jacobs',
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

const BRANCH_ALLOCATION_BY_BUCKET = Object.freeze({
  new_finance_requested: { sandton: 4, centurion: 3, fourways: 2, pretoria_east: 1 },
  awaiting_contact: { pretoria_east: 3, sandton: 3, centurion: 2, durban_north: 2 },
  documents_required: { pretoria_east: 4, sandton: 4, centurion: 3, fourways: 2, durban_north: 1 },
  pre_qualification: { sandton: 2, centurion: 2, fourways: 1, durban_north: 1, pretoria_east: 1 },
  ready_for_submission: { sandton: 3, centurion: 2, fourways: 2, pretoria_east: 1, cape_town_atlantic: 2 },
  submitted_to_banks: { sandton: 2, centurion: 2, fourways: 1, pretoria_east: 1, cape_town_atlantic: 1 },
  bank_feedback: { pretoria_east: 1, sandton: 1, durban_north: 1 },
  approved: { sandton: 1, centurion: 1, cape_town_atlantic: 1 },
  grant_signed: { sandton: 1, fourways: 1 },
  bond_instruction_sent: { centurion: 1, pretoria_east: 1 },
  transfer_in_progress: { cape_town_atlantic: 8, durban_north: 7, sandton: 2, centurion: 2, fourways: 2, pretoria_east: 1 },
  registered: { cape_town_atlantic: 6, durban_north: 5, sandton: 2, centurion: 2, fourways: 2, pretoria_east: 1 },
  declined_or_cancelled: { pretoria_east: 2, fourways: 2, durban_north: 2, sandton: 2, centurion: 1, cape_town_atlantic: 1 },
})

const DEVELOPMENT_CATALOG = Object.freeze([
  {
    key: 'westbrook_estate',
    name: 'Westbrook Estate',
    developer: 'Westbrook Estates',
    branchKey: 'sandton',
    city: 'Johannesburg',
    suburb: 'Midrand',
    basePrice: 1850000,
    unitLabelStyle: 'unit',
  },
  {
    key: 'greenstone_living_lofts',
    name: 'Greenstone Living Lofts',
    developer: 'Greenstone Living',
    branchKey: 'sandton',
    city: 'Johannesburg',
    suburb: 'Morningside',
    basePrice: 1325000,
    unitLabelStyle: 'apartment',
  },
  {
    key: 'centurion_gate',
    name: 'Centurion Gate',
    developer: 'Westbrook Estates',
    branchKey: 'centurion',
    city: 'Centurion',
    suburb: 'Centurion',
    basePrice: 1540000,
    unitLabelStyle: 'unit',
  },
  {
    key: 'fourways_gardens',
    name: 'Fourways Gardens',
    developer: 'Greenstone Living',
    branchKey: 'fourways',
    city: 'Johannesburg',
    suburb: 'Fourways',
    basePrice: 1975000,
    unitLabelStyle: 'unit',
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

const TEAM_CATALOG = Object.freeze([
  { key: 'developer_desk', name: 'Developer Desk', code: 'BOND-DEMO-DEV-DESK', branchKey: 'sandton' },
  { key: 'processing_team', name: 'Processing Team', code: 'BOND-DEMO-PROCESS', branchKey: 'centurion' },
  { key: 'private_buyer_team', name: 'Private Buyer Team', code: 'BOND-DEMO-PBT', branchKey: 'fourways' },
  { key: 'pretoria_processing_team', name: 'Pretoria East Processing Team', code: 'BOND-DEMO-PTA-PROC', branchKey: 'pretoria_east' },
  { key: 'cape_town_operations', name: 'Cape Town Operations', code: 'BOND-DEMO-CPT-OPS', branchKey: 'cape_town_atlantic' },
  { key: 'durban_operations', name: 'Durban Operations', code: 'BOND-DEMO-DBN-OPS', branchKey: 'durban_north' },
])

const USER_CATALOG = Object.freeze([
  {
    key: TARGET_DEMO_USER_KEY,
    name: 'Alex van der Merwe',
    email: DEFAULT_DEMO_OWNER_EMAIL,
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    roleFamily: 'manager',
    requiredAuth: true,
    branchKey: null,
    regionKey: TARGET_DEMO_REGION_KEY,
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
    regionKey: 'western_cape',
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
    branchKey: 'sandton',
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
    branchKey: 'sandton',
    regionKey: 'gauteng',
  },
  {
    key: 'thabo_mokoena',
    name: 'Thabo Mokoena',
    email: 'thabo.mokoena+bond-demo@bridgenine.co.za',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    roleFamily: 'consultant',
    requiredAuth: false,
    branchKey: 'sandton',
    regionKey: 'gauteng',
  },
  {
    key: 'lerato_khumalo',
    name: 'Lerato Khumalo',
    email: 'lerato.khumalo+bond-demo@bridgenine.co.za',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    roleFamily: 'consultant',
    requiredAuth: false,
    branchKey: 'sandton',
    regionKey: 'gauteng',
  },
  {
    key: 'naledi_maseko',
    name: 'Naledi Maseko',
    email: 'naledi.maseko+bond-demo@bridgenine.co.za',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    roleFamily: 'consultant',
    requiredAuth: false,
    branchKey: 'centurion',
    regionKey: 'gauteng',
  },
  {
    key: 'priya_patel',
    name: 'Priya Patel',
    email: 'priya.patel+bond-demo@bridgenine.co.za',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    roleFamily: 'consultant',
    requiredAuth: false,
    branchKey: 'centurion',
    regionKey: 'gauteng',
  },
  {
    key: 'kabelo_dlamini',
    name: 'Kabelo Dlamini',
    email: 'kabelo.dlamini+bond-demo@bridgenine.co.za',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    roleFamily: 'consultant',
    requiredAuth: false,
    branchKey: 'fourways',
    regionKey: 'gauteng',
  },
  {
    key: 'zanele_khumalo',
    name: 'Zanele Khumalo',
    email: 'zanele.khumalo+bond-demo@bridgenine.co.za',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    roleFamily: 'consultant',
    requiredAuth: false,
    branchKey: 'fourways',
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
    branchKey: 'sandton',
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
  emma_roberts: 15,
  thabo_mokoena: 7,
  lerato_khumalo: 7,
  naledi_maseko: 11,
  priya_patel: 10,
  kabelo_dlamini: 8,
  zanele_khumalo: 7,
  rachel_adams: 15,
  daniel_nkosi: 10,
  ethan_govender: 9,
  chris_williams: 10,
  nicole_daniels: 9,
})

const PROCESSOR_QUOTAS = Object.freeze({
  tarryn_meyer: 45,
  jess_naidoo: 35,
  carla_smith: 19,
  michael_van_zyl: 19,
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
  sandton: '082',
  centurion: '083',
  fourways: '084',
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
  organisation_settings: ['organisation_id', 'settings_json'],
  workspace_regions: ['id', 'workspace_id', 'name', 'code'],
  workspace_units: ['id', 'workspace_id', 'unit_type', 'name', 'code'],
  organisation_users: ['organisation_id', 'email', 'role', 'status'],
  buyers: ['id', 'name'],
  developments: ['id', 'name'],
  development_settings: ['development_id'],
  units: ['id', 'development_id', 'unit_number'],
  transactions: ['id', 'organisation_id', 'transaction_reference'],
  transaction_finance_details: ['transaction_id'],
  transaction_finance_workflows: ['transaction_id', 'workflow_type', 'current_stage', 'status'],
  transaction_finance_workflow_events: ['id', 'workflow_id', 'to_stage', 'event_type'],
  transaction_bond_applications: ['id', 'transaction_id', 'workflow_id', 'bank_name', 'status'],
  transaction_bond_quotes: ['id', 'transaction_id', 'workflow_id', 'bank_name', 'quote_status'],
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
  bond_application_ownership_history: ['id', 'organisation_id', 'event_type'],
  bond_routing_rules: ['id', 'organisation_id', 'rule_type'],
  bond_routing_rule_activity: ['id', 'organisation_id', 'event_type'],
  bond_partners: ['id', 'organisation_id', 'name', 'partner_type'],
  bond_partner_invitations: ['id', 'organisation_id', 'partner_id', 'invited_email', 'token'],
  bond_partner_activity: ['id', 'organisation_id', 'event_type'],
  bond_partner_portal_users: ['id', 'organisation_id', 'partner_id', 'email', 'portal_token'],
  bond_partner_portal_documents: ['id', 'organisation_id', 'partner_id', 'document_name'],
  bond_partner_portal_document_requests: ['id', 'organisation_id', 'partner_id', 'document_name'],
  bond_partner_portal_comments: ['id', 'organisation_id', 'partner_id', 'message'],
  bond_partner_portal_support_tickets: ['id', 'organisation_id', 'partner_id', 'ticket_type', 'subject'],
  bond_partner_portal_audit: ['id', 'organisation_id', 'event_type'],
  bond_partner_portal_notifications: ['id', 'organisation_id', 'partner_id', 'notification_type', 'title'],
  bond_partner_requests: ['id', 'organisation_id', 'request_type', 'priority', 'status', 'title'],
  bond_partner_request_messages: ['id', 'organisation_id', 'request_id', 'message'],
  bond_partner_internal_notes: ['id', 'organisation_id', 'request_id', 'note'],
  bond_partner_request_activity: ['id', 'organisation_id', 'event_type'],
  bond_partner_request_notifications: ['id', 'organisation_id', 'type'],
  bond_consultant_targets: ['id', 'organisation_id', 'consultant_id', 'period'],
  bond_consultant_coaching_notes: ['id', 'organisation_id', 'consultant_id', 'note'],
  bond_consultant_performance_snapshots: ['id', 'organisation_id', 'consultant_id', 'period'],
  bond_branch_targets: ['id', 'organisation_id', 'branch_id', 'period'],
  bond_branch_health_snapshots: ['id', 'organisation_id', 'branch_id', 'period'],
  bond_branch_forecasts: ['id', 'organisation_id', 'branch_id', 'period', 'forecast_window_days'],
  bond_regional_targets: ['id', 'organisation_id', 'region_id', 'period'],
  bond_regional_health_snapshots: ['id', 'organisation_id', 'region_id', 'period'],
  bond_regional_forecasts: ['id', 'organisation_id', 'region_id', 'period', 'forecast_window_days'],
  bond_hq_health_snapshots: ['id', 'organisation_id', 'period'],
  bond_hq_forecasts: ['id', 'organisation_id', 'period', 'forecast_window_days'],
  bond_executive_alerts: ['id', 'organisation_id', 'alert_type', 'severity', 'title', 'source_type', 'source_id'],
  bond_executive_reports: ['id', 'organisation_id', 'period', 'format'],
  bond_banks: ['id', 'organisation_id', 'name'],
  bond_bank_contacts: ['id', 'organisation_id', 'bank_id', 'name', 'role'],
  bond_bank_escalations: ['id', 'organisation_id', 'bank_id', 'issue'],
  bond_bank_feedback: ['id', 'organisation_id', 'bank_id', 'feedback_type', 'message'],
  bond_bank_health_snapshots: ['id', 'organisation_id', 'bank_id', 'period'],
  bond_commission_rules: ['id', 'organisation_id', 'name', 'applies_to'],
  bond_commissions: ['id', 'organisation_id', 'amount'],
  bond_referral_fees: ['id', 'organisation_id', 'amount'],
  bond_bonus_awards: ['id', 'organisation_id', 'recipient_type', 'amount', 'reason'],
  bond_payouts: ['id', 'organisation_id', 'payee_type', 'payee_name', 'amount'],
  bond_revenue_snapshots: ['id', 'organisation_id', 'period'],
  bond_automation_rules: ['id', 'organisation_id', 'name', 'category'],
  bond_automation_runs: ['id', 'organisation_id', 'entity_id', 'entity_type'],
  bond_automation_history: ['id', 'organisation_id', 'action_type', 'event_type'],
  bond_automation_templates: ['id', 'organisation_id', 'name', 'category'],
  bond_automation_recommendations: ['id', 'organisation_id', 'title', 'category'],
  bond_prediction_snapshots: ['id', 'organisation_id', 'prediction_type', 'entity_type', 'entity_id'],
  bond_risk_scores: ['id', 'organisation_id', 'entity_type', 'entity_id'],
  bond_prediction_history: ['id', 'organisation_id', 'event_type', 'entity_type', 'entity_id'],
  bond_prediction_feedback: ['id', 'organisation_id'],
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
  transaction_finance_workflows: ['id', 'last_updated_by', 'last_updated_at', 'completed_at', 'created_at', 'updated_at'],
  transaction_finance_workflow_events: ['from_stage', 'notes', 'created_by', 'created_at'],
  transaction_bond_applications: [
    'submitted_at',
    'feedback_received_at',
    'reference_number',
    'notes',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
    'application_type',
    'assigned_organisation_id',
    'assigned_workspace_unit_id',
    'assigned_branch_id',
    'assigned_region_id',
    'assigned_team_id',
    'assigned_user_id',
    'assigned_consultant_id',
    'assigned_processor_id',
    'assignment_status',
    'assignment_source',
  ],
  transaction_bond_quotes: [
    'bond_application_id',
    'quoted_amount',
    'interest_rate',
    'term_months',
    'quote_received_at',
    'quote_expiry_at',
    'approved_at',
    'notes',
    'created_by',
    'updated_by',
    'created_at',
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
  bond_application_ownership_history: [
    'bond_application_id',
    'transaction_id',
    'application_reference',
    'from_consultant_id',
    'to_consultant_id',
    'consultant_id',
    'branch_id',
    'region_id',
    'reason',
    'actor_user_id',
    'previous_value',
    'new_value',
    'created_at',
  ],
  bond_routing_rules: ['source_id', 'source_name', 'region_id', 'branch_id', 'consultant_id', 'priority', 'status', 'accepts_overflow', 'maximum_capacity', 'overflow_destination_branch_id', 'metadata', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  bond_routing_rule_activity: ['routing_rule_id', 'bond_application_id', 'application_reference', 'actor_user_id', 'source', 'previous_value', 'new_value', 'created_at'],
  bond_partners: ['primary_contact_name', 'primary_contact_email', 'primary_contact_number', 'default_region_id', 'default_branch_id', 'default_consultant_id', 'routing_rule_id', 'status', 'notes', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  bond_partner_invitations: ['invited_by', 'status', 'sent_at', 'accepted_at', 'expires_at', 'created_at'],
  bond_partner_activity: ['partner_id', 'actor_user_id', 'source', 'previous_value', 'new_value', 'created_at'],
  bond_partner_portal_users: ['user_id', 'name', 'role', 'password_set_at', 'status', 'last_login_at', 'created_at', 'updated_at'],
  bond_partner_portal_documents: ['bond_application_id', 'application_reference', 'document_type', 'storage_path', 'status', 'uploaded_by', 'uploaded_at', 'created_at'],
  bond_partner_portal_document_requests: ['bond_application_id', 'application_reference', 'requested_by', 'requested_by_name', 'due_date', 'status', 'notes', 'created_at', 'updated_at'],
  bond_partner_portal_comments: ['bond_application_id', 'application_reference', 'author_user_id', 'author_name', 'author_role', 'attachments', 'created_at'],
  bond_partner_portal_support_tickets: ['bond_application_id', 'application_reference', 'message', 'status', 'created_by', 'created_at', 'updated_at'],
  bond_partner_portal_audit: ['partner_id', 'bond_application_id', 'application_reference', 'actor_user_id', 'previous_value', 'new_value', 'created_at'],
  bond_partner_portal_notifications: ['bond_application_id', 'application_reference', 'channel', 'read_at', 'created_at'],
  bond_partner_requests: ['partner_id', 'application_id', 'region_id', 'branch_id', 'owner_consultant_id', 'category', 'message', 'source_key', 'source_id', 'document_id', 'support_ticket_id', 'assigned_at', 'due_at', 'resolved_at', 'escalated', 'escalation_reason', 'resolution', 'created_at', 'updated_at'],
  bond_partner_request_messages: ['application_id', 'partner_id', 'actor_user_id', 'actor_name', 'attachments', 'visible_to_partner', 'created_at'],
  bond_partner_internal_notes: ['application_id', 'partner_id', 'actor_user_id', 'actor_name', 'visible_to_partner', 'created_at'],
  bond_partner_request_activity: ['request_id', 'partner_id', 'application_id', 'actor_user_id', 'previous_value', 'new_value', 'created_at'],
  bond_partner_request_notifications: ['request_id', 'recipient_user_id', 'recipient_role', 'title', 'read_at', 'created_at'],
  bond_consultant_targets: ['applications_target', 'approvals_target', 'approval_rate_target', 'turnaround_target', 'sla_compliance_target', 'response_time_target', 'created_by', 'created_at', 'updated_at'],
  bond_consultant_coaching_notes: ['flag_type', 'severity', 'created_by', 'created_at'],
  bond_consultant_performance_snapshots: ['active_applications', 'pending_documents', 'awaiting_bank_feedback', 'urgent_requests', 'open_partner_requests', 'sla_breaches', 'capacity_score', 'capacity_status', 'approval_rate', 'decline_rate', 'average_turnaround', 'sla_compliance', 'partner_response_time', 'applications_submitted', 'approvals', 'declines', 'coaching_flags', 'forecast', 'created_at', 'updated_at'],
  bond_branch_targets: ['approval_target', 'submission_target', 'turnaround_target', 'sla_target', 'satisfaction_target', 'created_by', 'created_at', 'updated_at'],
  bond_branch_health_snapshots: ['health_score', 'health_status', 'sla_compliance', 'consultant_capacity', 'approval_rate', 'partner_health', 'escalations', 'open_requests', 'summary', 'created_at', 'updated_at'],
  bond_branch_forecasts: ['expected_applications', 'expected_capacity', 'risk_level', 'required_headcount', 'recommended_action', 'inputs', 'created_at', 'updated_at'],
  bond_regional_targets: ['application_target', 'approval_target', 'sla_target', 'partner_health_target', 'growth_target', 'created_by', 'created_at', 'updated_at'],
  bond_regional_health_snapshots: ['health_score', 'health_status', 'branch_health', 'partner_health', 'sla_compliance', 'approval_rate', 'escalations', 'capacity_risk', 'forecast_risk', 'summary', 'created_at', 'updated_at'],
  bond_regional_forecasts: ['application_growth', 'capacity_demand', 'consultant_demand', 'partner_growth', 'escalation_risk', 'expected_capacity_risk', 'recommended_headcount', 'expected_application_volume', 'inputs', 'created_at', 'updated_at'],
  bond_hq_health_snapshots: ['health_score', 'health_status', 'regional_health', 'branch_health', 'partner_health', 'sla_compliance', 'approval_rate', 'escalations', 'capacity_risk', 'forecast_risk', 'summary', 'created_at', 'updated_at'],
  bond_hq_forecasts: ['expected_applications', 'expected_approvals', 'expected_capacity_risk', 'required_consultants', 'expected_sla_risk', 'executive_forecast_risk', 'inputs', 'created_at', 'updated_at'],
  bond_executive_alerts: ['description', 'status', 'assigned_to', 'created_at', 'dismissed_at', 'updated_at'],
  bond_executive_reports: ['generated_by', 'file_url', 'sections', 'created_at'],
  bond_banks: ['status', 'relationship_owner', 'created_at', 'updated_at'],
  bond_bank_contacts: ['email', 'phone', 'region', 'notes', 'created_by', 'created_at', 'updated_at'],
  bond_bank_escalations: ['application_id', 'consultant_id', 'branch_id', 'region_id', 'issue_type', 'priority', 'status', 'created_by', 'created_at', 'resolved_at', 'updated_at'],
  bond_bank_feedback: ['sentiment', 'consultant_id', 'branch_id', 'region_id', 'created_by', 'created_at'],
  bond_bank_health_snapshots: ['health_score', 'health_status', 'approval_rate', 'response_time_score', 'escalation_score', 'instruction_rate', 'consultant_feedback_score', 'partner_feedback_score', 'summary', 'created_at', 'updated_at'],
  bond_commission_rules: ['rule_type', 'percentage', 'fixed_amount', 'tiers', 'components', 'bonus_criteria', 'status', 'created_by', 'created_at', 'updated_at'],
  bond_commissions: ['application_id', 'consultant_id', 'status', 'calculated_at', 'approved_at', 'paid_at', 'created_at', 'updated_at'],
  bond_referral_fees: ['application_id', 'partner_id', 'status', 'created_at', 'approved_at', 'paid_at', 'updated_at'],
  bond_bonus_awards: ['recipient_id', 'branch_id', 'region_id', 'status', 'created_by', 'created_at', 'approved_at', 'paid_at', 'updated_at'],
  bond_payouts: ['payee_id', 'branch_id', 'region_id', 'status', 'workflow_stage', 'manager_approved_at', 'finance_approved_at', 'paid_at', 'audit_trail', 'created_by', 'created_at', 'updated_at'],
  bond_revenue_snapshots: ['revenue', 'commission', 'referral_fees', 'bonuses', 'bank_incentives', 'profit', 'margin', 'summary', 'created_at', 'updated_at'],
  bond_automation_rules: ['trigger', 'conditions', 'actions', 'status', 'created_by', 'created_at', 'updated_at'],
  bond_automation_runs: ['rule_id', 'result', 'action_results', 'executed_at'],
  bond_automation_history: ['rule_id', 'rule_name', 'entity_id', 'entity_type', 'result', 'details', 'created_at'],
  bond_automation_templates: ['channel', 'subject', 'body', 'sequence', 'status', 'created_by', 'created_at', 'updated_at'],
  bond_automation_recommendations: ['description', 'impact', 'status', 'source', 'created_at', 'dismissed_at'],
  bond_prediction_snapshots: ['score', 'confidence', 'recommendation', 'details', 'predicted_at', 'created_at'],
  bond_risk_scores: ['score', 'risk_level', 'reasons', 'confidence', 'recommended_action', 'updated_at', 'created_at'],
  bond_prediction_history: ['prediction_id', 'prediction_type', 'previous_value', 'new_value', 'created_by', 'created_at'],
  bond_prediction_feedback: ['prediction_id', 'expected_outcome', 'actual_outcome', 'accuracy', 'correct', 'notes', 'created_by', 'created_at'],
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

function createHierarchy(env = {}) {
  const workspaceId = normalizeText(env.BOND_DEMO_WORKSPACE_ID) || deterministicUuid('workspace:bridge-finance-demo')
  const workspaceName = normalizeText(env.BOND_DEMO_WORKSPACE_NAME) || DEFAULT_WORKSPACE_NAME
  const customWorkspaceSeed = normalizeText(env.BOND_DEMO_WORKSPACE_ID) ? `${workspaceId}:` : ''
  const hqId = deterministicUuid(`unit:${customWorkspaceSeed}hq`)
  const regions = REGION_CATALOG.map((region) => ({
    ...region,
    id: deterministicUuid(`region:${customWorkspaceSeed}${region.key}`),
    workspaceId,
  }))
  const regionIdByKey = Object.fromEntries(regions.map((region) => [region.key, region.id]))
  const branches = BRANCH_CATALOG.map((branch) => ({
    ...branch,
    id: deterministicUuid(`unit:branch:${customWorkspaceSeed}${branch.key}`),
    workspaceId,
    regionId: regionIdByKey[branch.regionKey],
    parentUnitId: hqId,
    unitType: 'branch',
  }))
  const branchIdByKey = Object.fromEntries(branches.map((branch) => [branch.key, branch.id]))
  const branchByKey = Object.fromEntries(branches.map((branch) => [branch.key, branch]))
  const teams = TEAM_CATALOG.map((team) => {
    const branch = branchByKey[team.branchKey] || branches[0]
    return {
      ...team,
      id: deterministicUuid(`unit:team:${customWorkspaceSeed}${team.key}`),
      workspaceId,
      regionId: branch.regionId,
      parentUnitId: branch.id,
      branchKey: branch.key,
    }
  }).map((team) => ({
    ...team,
    unitType: 'team',
  }))

  return {
    workspace: {
      id: workspaceId,
      name: workspaceName,
      slug: normalizeSlug(workspaceName),
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

function buildUsers(env = {}, hierarchy = createHierarchy(env)) {
  const demoOwnerEmail = normalizeEmail(env.BOND_DEMO_OWNER_EMAIL || DEFAULT_DEMO_OWNER_EMAIL)
  return USER_CATALOG.map((user) => {
    const email = user.key === TARGET_DEMO_USER_KEY ? demoOwnerEmail : normalizeEmail(user.email)
    const workspaceRole = user.key === TARGET_DEMO_USER_KEY
      ? normalizeText(env.BOND_DEMO_OWNER_WORKSPACE_ROLE || user.workspaceRole)
      : user.workspaceRole
    const scopeLevel = user.key === TARGET_DEMO_USER_KEY
      ? normalizeText(env.BOND_DEMO_OWNER_SCOPE_LEVEL || user.scopeLevel)
      : user.scopeLevel
    const regionKey = user.key === TARGET_DEMO_USER_KEY
      ? (Object.prototype.hasOwnProperty.call(env, 'BOND_DEMO_OWNER_REGION_KEY')
          ? normalizeText(env.BOND_DEMO_OWNER_REGION_KEY)
          : scopeLevel === 'workspace_hq'
            ? null
            : user.regionKey)
      : user.regionKey
    const branchKey = user.key === TARGET_DEMO_USER_KEY
      ? (Object.prototype.hasOwnProperty.call(env, 'BOND_DEMO_OWNER_BRANCH_KEY')
          ? normalizeText(env.BOND_DEMO_OWNER_BRANCH_KEY)
          : user.branchKey)
      : user.branchKey
    const branchId = branchKey ? hierarchy.branchIdByKey[branchKey] || null : null
    const teamId = user.workspaceRole === 'processor' && user.branchKey ? hierarchy.teamIdByBranchKey[user.branchKey] || null : null
    return {
      ...user,
      email,
      workspaceRole,
      scopeLevel,
      regionKey,
      branchKey,
      workspaceType: DEFAULT_WORKSPACE_TYPE,
      workspaceId: hierarchy.workspace.id,
      branchId,
      workspaceUnitId: teamId || branchId || null,
      regionId: regionKey ? hierarchy.regionIdByKey[regionKey] || null : null,
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
  return Object.fromEntries(BRANCH_CATALOG.map((branch) => [branch.key, 0]))
}

function branchSequenceForBucket(bucketKey = '') {
  const allocation = BRANCH_ALLOCATION_BY_BUCKET[bucketKey] || {}
  const sequence = []
  for (const branch of BRANCH_CATALOG) {
    const count = Number(allocation[branch.key]) || 0
    for (let index = 0; index < count; index += 1) {
      sequence.push(branch.key)
    }
  }
  return sequence
}

function chooseBranchForBucket(bucketKey = '', bucketIndex = 0, branchQuotaState = {}) {
  const allocated = branchSequenceForBucket(bucketKey)
  if (allocated.length) {
    const branchKey = allocated[bucketIndex % allocated.length]
    branchQuotaState[branchKey] = (branchQuotaState[branchKey] || 0) + 1
    return branchKey
  }

  const preferences = {
    new_finance_requested: ['sandton', 'centurion', 'fourways', 'pretoria_east', 'durban_north'],
    awaiting_contact: ['pretoria_east', 'sandton', 'centurion', 'fourways', 'durban_north'],
    documents_required: ['pretoria_east', 'sandton', 'centurion', 'fourways', 'durban_north'],
    pre_qualification: ['sandton', 'centurion', 'fourways', 'durban_north', 'pretoria_east'],
    ready_for_submission: ['sandton', 'centurion', 'fourways', 'pretoria_east', 'cape_town_atlantic'],
    submitted_to_banks: ['sandton', 'centurion', 'fourways', 'pretoria_east', 'cape_town_atlantic', 'durban_north'],
    bank_feedback: ['pretoria_east', 'sandton', 'fourways', 'durban_north', 'centurion'],
    approved: ['sandton', 'centurion', 'fourways', 'cape_town_atlantic', 'durban_north'],
    grant_signed: ['sandton', 'fourways', 'cape_town_atlantic', 'durban_north'],
    bond_instruction_sent: ['centurion', 'pretoria_east', 'cape_town_atlantic', 'durban_north'],
    transfer_in_progress: ['cape_town_atlantic', 'durban_north', 'sandton', 'centurion', 'fourways', 'pretoria_east'],
    registered: ['cape_town_atlantic', 'durban_north', 'sandton', 'centurion', 'fourways', 'pretoria_east'],
    declined_or_cancelled: ['pretoria_east', 'fourways', 'durban_north', 'sandton', 'centurion'],
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
    ? `Plot ${String(applicationIndex + 12).padStart(3, '0')}`
    : development.unitLabelStyle === 'apartment'
      ? `${floor}${String.fromCharCode(65 + (applicationIndex % 4))}${String(applicationIndex + 1).padStart(3, '0')}`
      : `${floor}${String(applicationIndex + 1).padStart(3, '0')}`
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
      const branchKey = chooseBranchForBucket(bucket.key, bucketIndex, branchQuotaState)
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

function normalizeTransactionStageForConstraint(stage = '') {
  const normalized = normalizeText(stage).toLowerCase()
  if (normalized === 'registered') return 'Registered'
  if (normalized.includes('transfer')) return 'Transfer In Progress'
  if (normalized.includes('instruction') || normalized.includes('grant')) return 'Proceed to Attorneys'
  if (normalized.includes('approved') || normalized.includes('bond approved')) return 'Bond Approved / Proof of Funds'
  return 'Finance Pending'
}

function normalizeAttorneyStageForConstraint(stage = '') {
  const normalized = normalizeText(stage).toLowerCase()
  if (!normalized) return null
  if (normalized === 'registered') return 'registered'
  if (normalized === 'instruction_received') return 'instruction_received'
  if (normalized === 'documents_pending') return 'fica_onboarding'
  if (normalized === 'preparation_in_progress') return 'drafting'
  if (normalized === 'ready_for_lodgement' || normalized === 'lodged_at_deeds_office') return 'lodgement'
  return normalized
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
      stage: normalizeTransactionStageForConstraint(stageConfig.stage),
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
      risk_status: application.atRisk ? 'At Risk' : 'On Track',
      operational_state: application.atRisk ? 'at_risk' : 'on_track',
      attorney_stage: normalizeAttorneyStageForConstraint(stageConfig.attorneyStage),
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

function getPeriod(offsetMonths = 0) {
  const date = new Date(Date.UTC(REFERENCE_NOW.getUTCFullYear(), REFERENCE_NOW.getUTCMonth() + offsetMonths, 1))
  return date.toISOString().slice(0, 7)
}

function hydrateApplicationsWithUsers(applications = [], users = []) {
  const byKey = Object.fromEntries(users.map((user) => [user.key, user]))
  return applications.map((application) => ({
    ...application,
    regionalManager: byKey[application.regionalManager?.key] || application.regionalManager,
    branchManager: byKey[application.branchManager?.key] || application.branchManager,
    consultant: byKey[application.consultant?.key] || application.consultant,
    processor: byKey[application.processor?.key] || application.processor,
    compliance: byKey[application.compliance?.key] || application.compliance,
  }))
}

function getFinanceWorkflowStage(bucketKey = '') {
  if (['new_finance_requested', 'awaiting_contact', 'documents_required'].includes(bucketKey)) return 'documents_received'
  if (bucketKey === 'pre_qualification') return 'documents_reviewed'
  if (['ready_for_submission', 'submitted_to_banks', 'bank_feedback'].includes(bucketKey)) return 'applications_submitted'
  if (bucketKey === 'approved') return 'quotes_received'
  if (bucketKey === 'grant_signed') return 'quote_approved'
  return 'instruction_sent'
}

function getBondApplicationStatus(bucketKey = '') {
  const statusByBucket = {
    new_finance_requested: 'pending',
    awaiting_contact: 'pending',
    documents_required: 'additional_documents_required',
    pre_qualification: 'pending',
    ready_for_submission: 'pending',
    submitted_to_banks: 'submitted',
    bank_feedback: 'feedback_received',
    approved: 'approved',
    grant_signed: 'buyer_approved',
    bond_instruction_sent: 'buyer_approved',
    transfer_in_progress: 'buyer_approved',
    registered: 'buyer_approved',
    declined_or_cancelled: 'declined',
  }
  return statusByBucket[bucketKey] || 'pending'
}

function buildFinanceWorkflowRuntimeRows(applications = [], ownerUserId = null) {
  const workflows = []
  const workflowEvents = []
  const bondApplications = []
  const quotes = []

  for (const application of applications) {
    const workflowId = deterministicUuid(`finance-workflow:${application.transactionReference}`)
    const bondApplicationId = deterministicUuid(`bond-application:${application.transactionReference}:originator-intake`)
    const currentStage = getFinanceWorkflowStage(application.bucketKey)
    const completed = ['registered', 'declined_or_cancelled'].includes(application.bucketKey)
    const status = application.bucketKey === 'declined_or_cancelled' ? 'blocked' : completed ? 'completed' : 'active'
    const submitted = ['submitted_to_banks', 'bank_feedback', 'approved', 'grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered', 'declined_or_cancelled'].includes(application.bucketKey)
    const feedback = ['bank_feedback', 'approved', 'grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered', 'declined_or_cancelled'].includes(application.bucketKey)
    const quoteVisible = ['approved', 'grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey)

    workflows.push({
      id: workflowId,
      transaction_id: application.transactionId,
      workflow_type: 'bond_hybrid',
      current_stage: currentStage,
      status,
      last_updated_by: ownerUserId,
      last_updated_at: application.updatedAt,
      completed_at: completed ? application.updatedAt : null,
      created_at: application.createdAt,
      updated_at: application.updatedAt,
    })

    workflowEvents.push({
      id: deterministicUuid(`finance-workflow-event:${application.transactionReference}:created`),
      workflow_id: workflowId,
      from_stage: null,
      to_stage: 'documents_received',
      event_type: 'stage_changed',
      notes: `Demo finance workflow opened for ${application.transactionReference}.`,
      created_by: ownerUserId,
      created_at: application.createdAt,
    })
    if (currentStage !== 'documents_received') {
      workflowEvents.push({
        id: deterministicUuid(`finance-workflow-event:${application.transactionReference}:${currentStage}`),
        workflow_id: workflowId,
        from_stage: 'documents_received',
        to_stage: currentStage,
        event_type: currentStage === 'instruction_sent' ? 'instruction_sent' : currentStage === 'quote_approved' ? 'quote_approved' : 'stage_changed',
        notes: application.stageConfig.nextAction,
        created_by: ownerUserId,
        created_at: application.updatedAt,
      })
    }

    bondApplications.push({
      id: bondApplicationId,
      transaction_id: application.transactionId,
      workflow_id: workflowId,
      bank_name: application.bank,
      status: getBondApplicationStatus(application.bucketKey),
      submitted_at: submitted ? isoDaysAgo(Math.max(resolveRecencyDays(application.bucketKey, application.applicationIndex) - 5, 1)) : null,
      feedback_received_at: feedback ? application.updatedAt : null,
      reference_number: `${application.bank.slice(0, 3).toUpperCase()}-${application.transactionReference}`,
      notes: application.story,
      created_by: ownerUserId,
      updated_by: ownerUserId,
      created_at: application.createdAt,
      updated_at: application.updatedAt,
      application_type: 'originator_intake',
      assigned_organisation_id: application.workspaceId,
      assigned_workspace_unit_id: application.branchId,
      assigned_branch_id: application.branchId,
      assigned_region_id: application.regionId,
      assigned_team_id: application.teamId,
      assigned_user_id: application.consultant?.userId || ownerUserId,
      assigned_consultant_id: application.consultant?.userId || ownerUserId,
      assigned_processor_id: application.processor?.userId || null,
      assignment_status: 'fully_assigned',
      assignment_source: 'manual',
    })

    if (quoteVisible) {
      quotes.push({
        id: deterministicUuid(`bond-quote:${application.transactionReference}:${application.bank}`),
        transaction_id: application.transactionId,
        workflow_id: workflowId,
        bond_application_id: bondApplicationId,
        bank_name: application.bank,
        quoted_amount: application.finance.bondAmount,
        interest_rate: Number((10.25 + (application.applicationIndex % 6) * 0.15).toFixed(2)),
        term_months: 240,
        quote_status: ['grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey) ? 'approved_by_buyer' : 'received',
        quote_received_at: application.updatedAt,
        quote_expiry_at: isoDaysFromNow(14 + (application.applicationIndex % 10)),
        approved_at: ['grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey) ? application.updatedAt : null,
        notes: `${application.bank} demo quote for ${application.transactionReference}.`,
        created_by: ownerUserId,
        updated_by: ownerUserId,
        created_at: application.createdAt,
        updated_at: application.updatedAt,
      })
    }
  }

  return { workflows, workflowEvents, bondApplications, quotes }
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
      status: application.bucketKey === 'registered' ? 'completed' : application.bucketKey === 'declined_or_cancelled' ? 'blocked' : 'in_progress',
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
      const status = rejected ? 'rejected' : approved ? 'reviewed' : uploaded ? 'uploaded' : 'requested'
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
        priority: index < 4 ? 'required' : 'optional',
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
          visibility_scope: 'client',
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
        author_role: index === 0 || index === 1 ? 'bond_originator' : 'attorney',
        comment_text: `[operational] ${templates[(application.applicationIndex + index) % templates.length]}`,
        created_at: isoDaysAgo(resolveRecencyDays(application.bucketKey, application.applicationIndex) + seededInt(`comment:${application.transactionReference}:${index}`, 1, 16)),
      })
    }
  }
  return comments
}

function normalizeTransactionEventTypeForConstraint(eventType = '') {
  const normalized = normalizeText(eventType).toLowerCase()
  if (normalized === 'document_uploaded') return 'DocumentUploaded'
  if (normalized === 'document_requested') return 'TransactionUpdated'
  if (normalized === 'finance_approved' || normalized === 'quote_approved') return 'BondHybridFinanceQuoteUpdated'
  if (normalized === 'finance_submitted' || normalized === 'finance_updated') return 'BondHybridFinanceApplicationUpdated'
  if (normalized === 'attorney_assigned') return 'attorney_assignment_created'
  if (normalized === 'registration_completed') return 'TransactionStageChanged'
  if (normalized === 'onboarding_completed' || normalized === 'note_shared_with_client') return 'TransactionUpdated'
  if (normalized === 'instruction_sent') return 'BondHybridFinanceInstructionSent'
  return 'TransactionStageChanged'
}

function normalizeTransactionEventRoleForConstraint(role = '') {
  const normalized = normalizeText(role).toLowerCase()
  if (normalized === 'processor' || normalized === 'compliance') return 'bond_originator'
  return normalized || 'system'
}

function normalizeNotificationTypeForConstraint(type = '') {
  const normalized = normalizeText(type).toLowerCase()
  if (normalized === 'documents_missing') return 'overdue_missing_docs'
  if (normalized === 'instruction_sent') return 'lane_handoff'
  if (normalized === 'application_closed' || normalized === 'at_risk') return 'readiness_updated'
  return 'readiness_updated'
}

function normalizeNotificationEventTypeForConstraint(eventType = '') {
  const normalized = normalizeText(eventType).toLowerCase()
  if (normalized === 'document_uploaded' || normalized === 'document_requested') return 'DocumentUploaded'
  if (normalized === 'attorney_assigned') return 'ParticipantAssigned'
  return 'TransactionUpdated'
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
        event_type: normalizeTransactionEventTypeForConstraint(event.key),
        event_data: event.eventData,
        created_by: ownerUserId,
        created_by_role: normalizeTransactionEventRoleForConstraint(event.createdByRole),
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
        notification_type: normalizeNotificationTypeForConstraint(item.type),
        title: item.title,
        message: item.message,
        is_read: application.applicationIndex % 5 === 0 && index === 0,
        read_at: application.applicationIndex % 5 === 0 && index === 0 ? application.updatedAt : null,
        dedupe_key: `${application.transactionReference}:${item.type}:${index}`,
        event_type: normalizeNotificationEventTypeForConstraint(item.eventType),
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
        role_type: 'bond_originator',
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
        role_type: 'bond_originator',
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
    participants.push(...rows.filter((row) => !['processor', 'compliance'].includes(row.transaction_role)))
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
        selection_source: 'manual',
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
        assignment_source: 'manual',
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
        role_type: 'transfer_attorney',
        selection_source: 'manual',
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
        assignment_source: 'manual',
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

function percent(numerator = 0, denominator = 1) {
  if (!denominator) return 0
  return Number(((numerator / denominator) * 100).toFixed(2))
}

function clampNumber(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

function buildBondModuleRuntimeRows(plan, applications = [], ownerUserId = null, financeRuntime = {}) {
  const period = getPeriod(0)
  const previousPeriod = getPeriod(-1)
  const applicationByTransactionId = new Map(applications.map((application) => [application.transactionId, application]))
  const bondApplicationByTransactionId = new Map((financeRuntime.bondApplications || []).map((row) => [row.transaction_id, row]))
  const consultantUsers = plan.users.filter((user) => user.roleFamily === 'consultant' && user.userId)
  const branchRows = plan.hierarchy.branches
  const regionRows = plan.hierarchy.regions
  const approvedBuckets = new Set(['approved', 'grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'])
  const submittedBuckets = new Set(['submitted_to_banks', 'bank_feedback', 'approved', 'grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'])
  const activeApplications = applications.filter((application) => application.bucketKey !== 'registered' && application.bucketKey !== 'declined_or_cancelled')
  const approvedApplications = applications.filter((application) => approvedBuckets.has(application.bucketKey))
  const submittedApplications = applications.filter((application) => submittedBuckets.has(application.bucketKey))

  const routingRules = [
    {
      id: deterministicUuid('bond-routing-rule:company'),
      organisation_id: plan.workspace.id,
      rule_type: 'company',
      source_id: 'company',
      source_name: 'Company fallback',
      region_id: plan.hierarchy.regionIdByKey.gauteng,
      branch_id: plan.hierarchy.branchIdByKey.sandton,
      consultant_id: getUserByKey(plan.users, 'emma_roberts')?.userId || ownerUserId,
      priority: 900,
      status: 'active',
      accepts_overflow: true,
      maximum_capacity: 160,
      overflow_destination_branch_id: plan.hierarchy.branchIdByKey.centurion,
      metadata: buildManagedMetadata({ rule_key: 'company_fallback' }),
      created_by: ownerUserId,
      updated_by: ownerUserId,
      created_at: isoDaysAgo(40),
      updated_at: isoDaysAgo(3),
    },
    ...regionRows.map((region, index) => ({
      id: deterministicUuid(`bond-routing-rule:region:${region.key}`),
      organisation_id: plan.workspace.id,
      rule_type: 'region',
      source_id: region.id,
      source_name: `${region.name} regional default`,
      region_id: region.id,
      branch_id: branchRows.find((branch) => branch.regionKey === region.key)?.id || null,
      consultant_id: getUserByKey(plan.users, region.key === 'gauteng' ? 'rachel_adams' : region.key === 'western_cape' ? 'chris_williams' : 'daniel_nkosi')?.userId || null,
      priority: 100 + index,
      status: 'active',
      accepts_overflow: true,
      maximum_capacity: 70,
      overflow_destination_branch_id: null,
      metadata: buildManagedMetadata({ rule_key: `region:${region.key}` }),
      created_by: ownerUserId,
      updated_by: ownerUserId,
      created_at: isoDaysAgo(39 - index),
      updated_at: isoDaysAgo(2),
    })),
    ...branchRows.map((branch, index) => ({
      id: deterministicUuid(`bond-routing-rule:branch:${branch.key}`),
      organisation_id: plan.workspace.id,
      rule_type: 'branch',
      source_id: branch.id,
      source_name: `${branch.name} branch default`,
      region_id: branch.regionId,
      branch_id: branch.id,
      consultant_id: getUserByKey(plan.users, branch.consultantKeys[0])?.userId || null,
      priority: 20 + index,
      status: index === 5 ? 'inactive' : 'active',
      accepts_overflow: index !== 5,
      maximum_capacity: 35 + index * 4,
      overflow_destination_branch_id: branchRows[(index + 1) % branchRows.length]?.id || null,
      metadata: buildManagedMetadata({ rule_key: `branch:${branch.key}` }),
      created_by: ownerUserId,
      updated_by: ownerUserId,
      created_at: isoDaysAgo(36 - index),
      updated_at: isoDaysAgo(index % 5),
    })),
  ]

  const developmentRules = DEVELOPMENT_CATALOG.slice(0, 6).map((development, index) => {
    const branch = branchRows.find((item) => item.key === development.branchKey) || branchRows[0]
    return {
      id: deterministicUuid(`bond-routing-rule:development:${development.key}`),
      organisation_id: plan.workspace.id,
      rule_type: 'development',
      source_id: deterministicUuid(`development:${development.key}`),
      source_name: development.name,
      region_id: branch.regionId,
      branch_id: branch.id,
      consultant_id: getUserByKey(plan.users, branch.consultantKeys[index % branch.consultantKeys.length])?.userId || null,
      priority: 5 + index,
      status: 'active',
      accepts_overflow: true,
      maximum_capacity: 45,
      overflow_destination_branch_id: null,
      metadata: buildManagedMetadata({ development_key: development.key }),
      created_by: ownerUserId,
      updated_by: ownerUserId,
      created_at: isoDaysAgo(30 - index),
      updated_at: isoDaysAgo(1),
    }
  })
  routingRules.push(...developmentRules)

  const agencyRules = AGENCY_CATALOG.map((agency, index) => {
    const branch = branchRows[index % branchRows.length]
    return {
      id: deterministicUuid(`bond-routing-rule:agency:${normalizeSlug(agency)}`),
      organisation_id: plan.workspace.id,
      rule_type: 'agency',
      source_id: normalizeSlug(agency),
      source_name: agency,
      region_id: branch.regionId,
      branch_id: branch.id,
      consultant_id: getUserByKey(plan.users, branch.consultantKeys[0])?.userId || null,
      priority: 30 + index,
      status: 'active',
      accepts_overflow: true,
      maximum_capacity: 55,
      overflow_destination_branch_id: null,
      metadata: buildManagedMetadata({ agency_name: agency }),
      created_by: ownerUserId,
      updated_by: ownerUserId,
      created_at: isoDaysAgo(25 - index),
      updated_at: isoDaysAgo(1),
    }
  })
  routingRules.push(...agencyRules)

  const partners = [
    ...AGENCY_CATALOG.map((name, index) => ({ name, partnerType: 'agency', sourceKey: normalizeSlug(name), branch: branchRows[index % branchRows.length] })),
    ...DEVELOPMENT_CATALOG.slice(0, 6).map((development, index) => ({ name: development.developer, partnerType: 'developer', sourceKey: development.key, branch: branchRows.find((branch) => branch.key === development.branchKey) || branchRows[index % branchRows.length] })),
    ...ATTORNEY_CATALOG.slice(0, 3).map((name, index) => ({ name, partnerType: 'attorney', sourceKey: normalizeSlug(name), branch: branchRows[index % branchRows.length] })),
  ].map((item, index) => {
    const routingRule = routingRules.find((rule) => rule.source_id === item.sourceKey) || routingRules[index % routingRules.length]
    return {
      id: deterministicUuid(`bond-partner:${item.partnerType}:${item.sourceKey}`),
      organisation_id: plan.workspace.id,
      name: item.name,
      partner_type: item.partnerType,
      primary_contact_name: `${['Nandi', 'Michael', 'Sasha', 'Bongani', 'Leigh'][index % 5]} ${['Mokoena', 'Botha', 'Jacobs', 'Pillay', 'Smith'][index % 5]}`,
      primary_contact_email: `${normalizeSlug(item.name)}@partners.demo.bridgefinance.co.za`,
      primary_contact_number: `087${String(1000000 + index * 193).slice(-7)}`,
      default_region_id: item.branch.regionId,
      default_branch_id: item.branch.id,
      default_consultant_id: routingRule?.consultant_id || null,
      routing_rule_id: routingRule?.id || null,
      status: index % 9 === 0 ? 'paused' : 'active',
      notes: `Demo partner profile for ${item.name}.`,
      created_by: ownerUserId,
      updated_by: ownerUserId,
      created_at: isoDaysAgo(24 - (index % 8)),
      updated_at: isoDaysAgo(index % 4),
    }
  })
  const partnerByName = new Map(partners.map((partner) => [partner.name, partner]))

  const bankRows = BANK_CATALOG.map((bank, index) => ({
    id: deterministicUuid(`bond-bank:${bank}`),
    organisation_id: plan.workspace.id,
    name: bank,
    status: index === 4 ? 'paused' : 'active',
    relationship_owner: getUserByKey(plan.users, index % 2 === 0 ? 'olivia_brown' : TARGET_DEMO_USER_KEY)?.userId || ownerUserId,
    created_at: isoDaysAgo(50 - index),
    updated_at: isoDaysAgo(index),
  }))
  const bankByName = new Map(bankRows.map((bank) => [bank.name, bank]))

  const routingRuleActivity = routingRules.flatMap((rule, index) => [
    {
      id: deterministicUuid(`bond-routing-activity:${rule.id}:created`),
      organisation_id: plan.workspace.id,
      routing_rule_id: rule.id,
      bond_application_id: null,
      application_reference: null,
      event_type: 'ROUTING_RULE_CREATED',
      actor_user_id: ownerUserId,
      source: 'demo_seed',
      previous_value: null,
      new_value: { ruleType: rule.rule_type, sourceName: rule.source_name },
      created_at: rule.created_at,
    },
    {
      id: deterministicUuid(`bond-routing-activity:${rule.id}:used`),
      organisation_id: plan.workspace.id,
      routing_rule_id: rule.id,
      bond_application_id: bondApplicationByTransactionId.get(applications[index % applications.length]?.transactionId)?.id || null,
      application_reference: applications[index % applications.length]?.transactionReference || null,
      event_type: 'ROUTING_RULE_USED',
      actor_user_id: ownerUserId,
      source: 'demo_seed',
      previous_value: null,
      new_value: { outcome: 'assigned' },
      created_at: isoDaysAgo(index % 12),
    },
  ])

  const partnerInvitations = partners.slice(0, 10).map((partner, index) => ({
    id: deterministicUuid(`bond-partner-invite:${partner.id}`),
    organisation_id: plan.workspace.id,
    partner_id: partner.id,
    invited_email: partner.primary_contact_email,
    invited_by: ownerUserId,
    status: index % 6 === 0 ? 'pending' : 'accepted',
    token: `bond-partner-demo-${normalizeSlug(partner.name)}-${index}`,
    sent_at: isoDaysAgo(18 - index),
    accepted_at: index % 6 === 0 ? null : isoDaysAgo(16 - index),
    expires_at: isoDaysFromNow(14 + index),
    created_at: isoDaysAgo(18 - index),
  }))

  const partnerActivity = partners.flatMap((partner, index) => [
    {
      id: deterministicUuid(`bond-partner-activity:${partner.id}:created`),
      organisation_id: plan.workspace.id,
      partner_id: partner.id,
      event_type: 'PARTNER_CREATED',
      actor_user_id: ownerUserId,
      source: 'demo_seed',
      previous_value: null,
      new_value: { name: partner.name, status: partner.status },
      created_at: partner.created_at,
    },
    {
      id: deterministicUuid(`bond-partner-activity:${partner.id}:routing`),
      organisation_id: plan.workspace.id,
      partner_id: partner.id,
      event_type: 'PARTNER_ROUTING_DEFAULT_UPDATED',
      actor_user_id: ownerUserId,
      source: 'demo_seed',
      previous_value: null,
      new_value: { branchId: partner.default_branch_id, consultantId: partner.default_consultant_id },
      created_at: isoDaysAgo(index % 11),
    },
  ])

  const portalUsers = partners.slice(0, 8).map((partner, index) => ({
    id: deterministicUuid(`bond-partner-portal-user:${partner.id}`),
    organisation_id: plan.workspace.id,
    partner_id: partner.id,
    user_id: null,
    email: partner.primary_contact_email,
    name: partner.primary_contact_name,
    role: index % 3 === 0 ? 'partner_admin' : 'partner_user',
    portal_token: `portal-${normalizeSlug(partner.name)}-${index}`,
    password_set_at: isoDaysAgo(10 - index),
    status: 'active',
    last_login_at: isoDaysAgo(index % 5),
    created_at: isoDaysAgo(15 - index),
    updated_at: isoDaysAgo(index % 4),
  }))
  const portalUserByPartnerId = new Map(portalUsers.map((user) => [user.partner_id, user]))

  const collaborationApplications = [
    ...applications.slice(0, 18),
    ...applications.filter((application) => approvedBuckets.has(application.bucketKey)).slice(0, 14),
    ...applications.filter((application) => ['transfer_in_progress', 'registered'].includes(application.bucketKey)).slice(0, 12),
    ...applications.filter((application) => application.atRisk).slice(0, 8),
  ].filter((application, index, list) => list.findIndex((item) => item.transactionId === application.transactionId) === index).slice(0, 36)
  const partnerRequests = collaborationApplications.map((application, index) => {
    const partner = partnerByName.get(application.agency) || partners[index % partners.length]
    const bondApplication = bondApplicationByTransactionId.get(application.transactionId)
    const isResolved = ['approved', 'grant_signed', 'bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey) && index % 3 !== 0
    const escalated = application.atRisk || index % 13 === 0
    return {
      id: deterministicUuid(`bond-partner-request:${application.transactionReference}`),
      organisation_id: plan.workspace.id,
      partner_id: partner?.id || null,
      application_id: bondApplication?.id || application.transactionId,
      region_id: application.regionId,
      branch_id: application.branchId,
      owner_consultant_id: application.consultant?.userId || ownerUserId,
      request_type: index % 5 === 0 ? 'support_ticket' : index % 4 === 0 ? 'document_review' : escalated ? 'escalation' : 'comment',
      category: index % 4 === 0 ? 'documents' : index % 5 === 0 ? 'support' : 'application_update',
      priority: escalated ? 'urgent' : index % 3 === 0 ? 'high' : 'normal',
      status: isResolved ? 'resolved' : escalated ? 'assigned' : index % 2 === 0 ? 'waiting_on_partner' : 'in_progress',
      title: `${application.transactionReference} partner follow-up`,
      message: application.story,
      source_key: `demo:${application.transactionReference}:partner-request`,
      source_id: application.transactionId,
      document_id: null,
      support_ticket_id: null,
      assigned_at: isoDaysAgo(9 + (index % 6)),
      due_at: isResolved ? null : (application.stageConfig.nextActionDueAt || isoDaysFromNow(2 + (index % 4))),
      resolved_at: isResolved ? application.updatedAt : null,
      escalated,
      escalation_reason: escalated ? 'SLA or bank feedback requires consultant intervention.' : null,
      resolution: isResolved ? 'Partner supplied required detail and file was cleared.' : null,
      created_at: isoDaysAgo(12 + (index % 9)),
      updated_at: application.updatedAt,
    }
  })

  const partnerRequestMessages = partnerRequests.flatMap((request, index) => [
    {
      id: deterministicUuid(`bond-partner-request-message:${request.id}:initial`),
      organisation_id: plan.workspace.id,
      request_id: request.id,
      application_id: request.application_id,
      partner_id: request.partner_id,
      actor_user_id: request.owner_consultant_id,
      actor_name: applicationByTransactionId.get(request.source_id)?.consultant?.name || 'Bond Consultant',
      message: request.message || request.title,
      attachments: [],
      visible_to_partner: true,
      created_at: request.created_at,
    },
    {
      id: deterministicUuid(`bond-partner-request-message:${request.id}:reply`),
      organisation_id: plan.workspace.id,
      request_id: request.id,
      application_id: request.application_id,
      partner_id: request.partner_id,
      actor_user_id: null,
      actor_name: partners.find((partner) => partner.id === request.partner_id)?.primary_contact_name || 'Partner Contact',
      message: request.status === 'resolved' ? 'Confirmed, the partner pack has been updated.' : 'We are checking the outstanding information and will revert.',
      attachments: request.request_type === 'document_review' ? [{ name: 'partner-pack.pdf', type: 'application/pdf' }] : [],
      visible_to_partner: true,
      created_at: isoDaysAgo(index % 7),
    },
  ])

  const partnerInternalNotes = partnerRequests.slice(0, 18).map((request, index) => ({
    id: deterministicUuid(`bond-partner-internal-note:${request.id}`),
    organisation_id: plan.workspace.id,
    request_id: request.id,
    application_id: request.application_id,
    partner_id: request.partner_id,
    actor_user_id: ownerUserId,
    actor_name: 'Alex van der Merwe',
    note: request.escalated ? 'Escalation is visible to regional queue; monitor before next SLA cut-off.' : 'Demo note: partner has reliable response history.',
    visible_to_partner: false,
    created_at: isoDaysAgo(index % 9),
  }))

  const partnerRequestActivity = partnerRequests.flatMap((request, index) => [
    {
      id: deterministicUuid(`bond-partner-request-activity:${request.id}:assigned`),
      organisation_id: plan.workspace.id,
      request_id: request.id,
      partner_id: request.partner_id,
      application_id: request.application_id,
      event_type: 'REQUEST_ASSIGNED',
      actor_user_id: ownerUserId,
      previous_value: null,
      new_value: { status: request.status, priority: request.priority },
      created_at: request.assigned_at || request.created_at,
    },
    {
      id: deterministicUuid(`bond-partner-request-activity:${request.id}:state`),
      organisation_id: plan.workspace.id,
      request_id: request.id,
      partner_id: request.partner_id,
      application_id: request.application_id,
      event_type: request.status === 'resolved' ? 'REQUEST_RESOLVED' : request.escalated ? 'REQUEST_ESCALATED' : 'REQUEST_UPDATED',
      actor_user_id: request.owner_consultant_id,
      previous_value: null,
      new_value: { status: request.status },
      created_at: isoDaysAgo(index % 6),
    },
  ])

  const partnerRequestNotifications = partnerRequests.slice(0, 30).map((request, index) => ({
    id: deterministicUuid(`bond-partner-request-notification:${request.id}`),
    organisation_id: plan.workspace.id,
    request_id: request.id,
    recipient_user_id: request.owner_consultant_id || ownerUserId,
    recipient_role: 'bond_originator',
    type: request.escalated ? 'REQUEST_ESCALATED' : 'REQUEST_ASSIGNED',
    title: request.title,
    read_at: index % 4 === 0 ? isoDaysAgo(index % 5) : null,
    created_at: request.created_at,
  }))

  const portalDocuments = collaborationApplications.slice(0, 20).map((application, index) => {
    const partner = partnerByName.get(application.agency) || partners[index % partners.length]
    const portalUser = portalUserByPartnerId.get(partner.id)
    const bondApplication = bondApplicationByTransactionId.get(application.transactionId)
    return {
      id: deterministicUuid(`bond-partner-portal-document:${application.transactionReference}:${index}`),
      organisation_id: plan.workspace.id,
      partner_id: partner.id,
      bond_application_id: bondApplication?.id || null,
      application_reference: application.transactionReference,
      document_name: index % 2 === 0 ? 'Signed OTP extract.pdf' : 'Reservation confirmation.pdf',
      document_type: index % 2 === 0 ? 'offer_to_purchase' : 'reservation_confirmation',
      storage_path: `bond-partner-demo/${application.transactionReference}/partner-${index}.pdf`,
      status: index % 7 === 0 ? 'rejected' : index % 3 === 0 ? 'reviewed' : 'received',
      uploaded_by: portalUser?.id || null,
      uploaded_at: isoDaysAgo(index % 12),
      created_at: isoDaysAgo(index % 12),
    }
  })

  const portalDocumentRequests = collaborationApplications.slice(12, 34).map((application, index) => {
    const partner = partnerByName.get(application.agency) || partners[index % partners.length]
    const bondApplication = bondApplicationByTransactionId.get(application.transactionId)
    return {
      id: deterministicUuid(`bond-partner-portal-doc-request:${application.transactionReference}:${index}`),
      organisation_id: plan.workspace.id,
      partner_id: partner.id,
      bond_application_id: bondApplication?.id || null,
      application_reference: application.transactionReference,
      document_name: index % 2 === 0 ? 'Updated source-of-funds note' : 'Latest signed addendum',
      requested_by: ownerUserId,
      requested_by_name: 'Alex van der Merwe',
      due_date: isoDateDaysAgo(-1 * (2 + (index % 6))),
      status: index % 5 === 0 ? 'uploaded' : index % 7 === 0 ? 'completed' : 'requested',
      notes: 'Demo partner portal request.',
      created_at: isoDaysAgo(8 + (index % 8)),
      updated_at: isoDaysAgo(index % 4),
    }
  })

  const portalComments = collaborationApplications.slice(0, 24).map((application, index) => {
    const partner = partnerByName.get(application.agency) || partners[index % partners.length]
    const bondApplication = bondApplicationByTransactionId.get(application.transactionId)
    return {
      id: deterministicUuid(`bond-partner-portal-comment:${application.transactionReference}:${index}`),
      organisation_id: plan.workspace.id,
      partner_id: partner.id,
      bond_application_id: bondApplication?.id || null,
      application_reference: application.transactionReference,
      author_user_id: index % 2 === 0 ? ownerUserId : null,
      author_name: index % 2 === 0 ? 'Alex van der Merwe' : partner.primary_contact_name,
      author_role: index % 2 === 0 ? 'Bond Originator' : 'Partner',
      message: index % 2 === 0 ? application.stageConfig.nextAction : 'Partner has acknowledged the requested update.',
      attachments: [],
      created_at: isoDaysAgo(index % 10),
    }
  })

  const portalSupportTickets = collaborationApplications.slice(20, 30).map((application, index) => {
    const partner = partnerByName.get(application.agency) || partners[index % partners.length]
    const portalUser = portalUserByPartnerId.get(partner.id)
    const bondApplication = bondApplicationByTransactionId.get(application.transactionId)
    return {
      id: deterministicUuid(`bond-partner-portal-ticket:${application.transactionReference}`),
      organisation_id: plan.workspace.id,
      partner_id: partner.id,
      bond_application_id: bondApplication?.id || null,
      application_reference: application.transactionReference,
      ticket_type: index % 2 === 0 ? 'document_help' : 'application_query',
      subject: `${application.transactionReference} support query`,
      message: application.story,
      status: index % 4 === 0 ? 'resolved' : index % 3 === 0 ? 'pending' : 'open',
      created_by: portalUser?.id || null,
      created_at: isoDaysAgo(index % 9),
      updated_at: isoDaysAgo(index % 4),
    }
  })

  const portalAudit = [
    ...portalUsers.map((user, index) => ({
      id: deterministicUuid(`bond-partner-portal-audit:${user.id}:login`),
      organisation_id: plan.workspace.id,
      partner_id: user.partner_id,
      bond_application_id: null,
      application_reference: null,
      event_type: 'PARTNER_LOGIN',
      actor_user_id: user.id,
      previous_value: null,
      new_value: { email: user.email },
      created_at: user.last_login_at || user.created_at,
    })),
    ...portalDocuments.slice(0, 12).map((document, index) => ({
      id: deterministicUuid(`bond-partner-portal-audit:${document.id}:uploaded`),
      organisation_id: plan.workspace.id,
      partner_id: document.partner_id,
      bond_application_id: document.bond_application_id,
      application_reference: document.application_reference,
      event_type: 'PARTNER_DOCUMENT_UPLOADED',
      actor_user_id: document.uploaded_by,
      previous_value: null,
      new_value: { documentName: document.document_name },
      created_at: isoDaysAgo(index % 9),
    })),
  ]

  const portalNotifications = portalDocumentRequests.slice(0, 18).map((request, index) => ({
    id: deterministicUuid(`bond-partner-portal-notification:${request.id}`),
    organisation_id: plan.workspace.id,
    partner_id: request.partner_id,
    bond_application_id: request.bond_application_id,
    application_reference: request.application_reference,
    notification_type: request.status === 'requested' ? 'DOCUMENT_REQUESTED' : 'DOCUMENT_UPDATED',
    channel: index % 3 === 0 ? 'email' : 'portal',
    title: `${request.document_name} requested`,
    read_at: index % 5 === 0 ? isoDaysAgo(index % 4) : null,
    created_at: request.created_at,
  }))

  const ownershipHistory = applications.map((application, index) => {
    const bondApplication = bondApplicationByTransactionId.get(application.transactionId)
    return {
      id: deterministicUuid(`bond-ownership:${application.transactionReference}:assigned`),
      organisation_id: plan.workspace.id,
      bond_application_id: bondApplication?.id || null,
      transaction_id: application.transactionId,
      application_reference: application.transactionReference,
      event_type: application.atRisk ? 'APPLICATION_ESCALATED' : index % 17 === 0 ? 'APPLICATION_REASSIGNED' : 'APPLICATION_ASSIGNED',
      from_consultant_id: index % 17 === 0 ? getUserByKey(plan.users, 'thabo_mokoena')?.userId || null : null,
      to_consultant_id: application.consultant?.userId || ownerUserId,
      consultant_id: application.consultant?.userId || ownerUserId,
      branch_id: application.branchId,
      region_id: application.regionId,
      reason: application.atRisk ? 'At-risk demo file escalated to regional manager.' : 'Demo routing assignment.',
      actor_user_id: ownerUserId,
      previous_value: null,
      new_value: { consultant: application.consultant?.name, branch: application.branch.name },
      created_at: application.createdAt,
    }
  })

  const consultantTargets = consultantUsers.map((user, index) => ({
    id: deterministicUuid(`bond-consultant-target:${user.key}:${period}`),
    organisation_id: plan.workspace.id,
    consultant_id: user.userId,
    period,
    applications_target: 12 + (index % 4),
    approvals_target: 7 + (index % 3),
    approval_rate_target: 62 + (index % 5),
    turnaround_target: 8,
    sla_compliance_target: 92,
    response_time_target: 4,
    created_by: ownerUserId,
    created_at: isoDaysAgo(25),
    updated_at: isoDaysAgo(2),
  }))

  const consultantSnapshots = consultantUsers.map((user, index) => {
    const assigned = applications.filter((application) => application.consultant?.key === user.key)
    const active = assigned.filter((application) => application.bucketKey !== 'registered' && application.bucketKey !== 'declined_or_cancelled')
    const approvals = assigned.filter((application) => approvedBuckets.has(application.bucketKey)).length
    const declines = assigned.filter((application) => application.bucketKey === 'declined_or_cancelled').length
    const submitted = assigned.filter((application) => submittedBuckets.has(application.bucketKey)).length
    const capacityScore = clampNumber(active.length * 7 + assigned.filter((application) => application.atRisk).length * 9, 0, 100)
    return {
      id: deterministicUuid(`bond-consultant-snapshot:${user.key}:${period}`),
      organisation_id: plan.workspace.id,
      consultant_id: user.userId,
      period,
      active_applications: active.length,
      pending_documents: assigned.filter((application) => application.stageConfig.documentsMissing).length,
      awaiting_bank_feedback: assigned.filter((application) => application.bucketKey === 'bank_feedback').length,
      urgent_requests: assigned.filter((application) => application.atRisk).length,
      open_partner_requests: partnerRequests.filter((request) => request.owner_consultant_id === user.userId && !['resolved', 'closed'].includes(request.status)).length,
      sla_breaches: assigned.filter((application) => application.atRisk).length,
      capacity_score: capacityScore,
      capacity_status: capacityScore >= 80 ? 'Overloaded' : capacityScore >= 65 ? 'Busy' : capacityScore >= 35 ? 'Normal' : 'Light',
      approval_rate: percent(approvals, Math.max(submitted, 1)),
      decline_rate: percent(declines, Math.max(submitted + declines, 1)),
      average_turnaround: 6.5 + (index % 5),
      sla_compliance: Math.max(75, 96 - assigned.filter((application) => application.atRisk).length * 4),
      partner_response_time: 3.2 + (index % 6) * 0.4,
      applications_submitted: submitted,
      approvals,
      declines,
      coaching_flags: assigned.some((application) => application.atRisk) ? [{ type: 'sla', label: 'At-risk file follow-up' }] : [],
      forecast: [
        { windowDays: 7, expectedApplications: active.length + 2 },
        { windowDays: 30, expectedApplications: active.length + 8 },
      ],
      created_at: isoDaysAgo(2),
      updated_at: isoDaysAgo(1),
    }
  })

  const consultantCoachingNotes = consultantSnapshots
    .filter((snapshot) => snapshot.sla_breaches > 0 || snapshot.capacity_status === 'Overloaded')
    .map((snapshot, index) => ({
      id: deterministicUuid(`bond-consultant-coaching:${snapshot.consultant_id}:${period}`),
      organisation_id: plan.workspace.id,
      consultant_id: snapshot.consultant_id,
      note: snapshot.capacity_status === 'Overloaded' ? 'Capacity review needed; rebalance new allocations this week.' : 'Review at-risk file cadence and partner follow-up rhythm.',
      flag_type: snapshot.capacity_status === 'Overloaded' ? 'capacity' : 'sla',
      severity: snapshot.capacity_status === 'Overloaded' ? 'High' : 'Medium',
      created_by: ownerUserId,
      created_at: isoDaysAgo(index + 1),
    }))

  const branchTargets = branchRows.map((branch, index) => ({
    id: deterministicUuid(`bond-branch-target:${branch.key}:${period}`),
    organisation_id: plan.workspace.id,
    branch_id: branch.id,
    period,
    approval_target: 64 + (index % 4),
    submission_target: 14 + index,
    turnaround_target: 8.5,
    sla_target: 92,
    satisfaction_target: 88,
    created_by: ownerUserId,
    created_at: isoDaysAgo(22),
    updated_at: isoDaysAgo(1),
  }))

  const branchHealthSnapshots = branchRows.map((branch, index) => {
    const scoped = applications.filter((application) => application.branch.key === branch.key)
    const approvals = scoped.filter((application) => approvedBuckets.has(application.bucketKey)).length
    const submitted = scoped.filter((application) => submittedBuckets.has(application.bucketKey)).length
    const escalations = scoped.filter((application) => application.atRisk).length
    const healthScore = clampNumber(88 - escalations * 9 + approvals, 35, 98)
    return {
      id: deterministicUuid(`bond-branch-health:${branch.key}:${period}`),
      organisation_id: plan.workspace.id,
      branch_id: branch.id,
      period,
      health_score: healthScore,
      health_status: healthScore >= 90 ? 'Excellent' : healthScore >= 75 ? 'Healthy' : healthScore >= 55 ? 'At Risk' : 'Critical',
      sla_compliance: clampNumber(96 - escalations * 7, 60, 99),
      consultant_capacity: scoped.filter((application) => application.bucketKey !== 'registered').length,
      approval_rate: percent(approvals, Math.max(submitted, 1)),
      partner_health: clampNumber(91 - index * 3, 70, 96),
      escalations,
      open_requests: partnerRequests.filter((request) => request.branch_id === branch.id && !['resolved', 'closed'].includes(request.status)).length,
      summary: buildManagedMetadata({ branch_key: branch.key, applications: scoped.length }),
      created_at: isoDaysAgo(2),
      updated_at: isoDaysAgo(1),
    }
  })

  const branchForecasts = branchRows.flatMap((branch, index) => [7, 14, 30].map((windowDays) => ({
    id: deterministicUuid(`bond-branch-forecast:${branch.key}:${period}:${windowDays}`),
    organisation_id: plan.workspace.id,
    branch_id: branch.id,
    period,
    forecast_window_days: windowDays,
    expected_applications: Math.round((applications.filter((application) => application.branch.key === branch.key).length / 30) * windowDays) + 2,
    expected_capacity: 12 + index * 2,
    risk_level: index % 5 === 0 && windowDays === 30 ? 'High' : index % 3 === 0 ? 'Medium' : 'Low',
    required_headcount: index % 5 === 0 && windowDays === 30 ? 2 : 1,
    recommended_action: index % 5 === 0 && windowDays === 30 ? 'Move overflow to regional pool and pause low-priority intake.' : 'Maintain normal consultant allocations.',
    inputs: buildManagedMetadata({ branch_key: branch.key, windowDays }),
    created_at: isoDaysAgo(2),
    updated_at: isoDaysAgo(1),
  })))

  const regionalTargets = regionRows.map((region, index) => ({
    id: deterministicUuid(`bond-regional-target:${region.key}:${period}`),
    organisation_id: plan.workspace.id,
    region_id: region.id,
    period,
    application_target: 40 + index * 12,
    approval_target: 65,
    sla_target: 92,
    partner_health_target: 88,
    growth_target: 12 + index,
    created_by: ownerUserId,
    created_at: isoDaysAgo(22),
    updated_at: isoDaysAgo(1),
  }))

  const regionalHealthSnapshots = regionRows.map((region, index) => {
    const scoped = applications.filter((application) => application.branch.regionKey === region.key)
    const approvals = scoped.filter((application) => approvedBuckets.has(application.bucketKey)).length
    const submitted = scoped.filter((application) => submittedBuckets.has(application.bucketKey)).length
    const escalations = scoped.filter((application) => application.atRisk).length
    const healthScore = clampNumber(90 - escalations * 5 + approvals * 0.4, 45, 97)
    return {
      id: deterministicUuid(`bond-regional-health:${region.key}:${period}`),
      organisation_id: plan.workspace.id,
      region_id: region.id,
      period,
      health_score: Math.round(healthScore),
      health_status: healthScore >= 90 ? 'Excellent' : healthScore >= 76 ? 'Healthy' : healthScore >= 58 ? 'At Risk' : 'Critical',
      branch_health: Math.round(branchHealthSnapshots.filter((row) => branchRows.find((branch) => branch.id === row.branch_id)?.regionKey === region.key).reduce((sum, row) => sum + row.health_score, 0) / Math.max(1, branchRows.filter((branch) => branch.regionKey === region.key).length)),
      partner_health: 86 - index * 4,
      sla_compliance: clampNumber(95 - escalations * 4, 65, 99),
      approval_rate: percent(approvals, Math.max(submitted, 1)),
      escalations,
      capacity_risk: scoped.filter((application) => application.bucketKey !== 'registered').length,
      forecast_risk: index === 0 ? 42 : 28,
      summary: buildManagedMetadata({ region_key: region.key, applications: scoped.length }),
      created_at: isoDaysAgo(2),
      updated_at: isoDaysAgo(1),
    }
  })

  const regionalForecasts = regionRows.flatMap((region, index) => [7, 30, 90].map((windowDays) => ({
    id: deterministicUuid(`bond-regional-forecast:${region.key}:${period}:${windowDays}`),
    organisation_id: plan.workspace.id,
    region_id: region.id,
    period,
    forecast_window_days: windowDays,
    application_growth: 4 + index * 2,
    capacity_demand: Math.round((applications.filter((application) => application.branch.regionKey === region.key).length / 30) * windowDays),
    consultant_demand: windowDays === 90 ? 3 + index : 1 + index,
    partner_growth: 2 + index,
    escalation_risk: index === 0 && windowDays === 90 ? 48 : 22 + index * 4,
    expected_capacity_risk: index === 0 && windowDays === 90 ? 'High' : windowDays === 30 ? 'Medium' : 'Low',
    recommended_headcount: windowDays === 90 ? 2 + index : 1,
    expected_application_volume: Math.round((applications.filter((application) => application.branch.regionKey === region.key).length / 30) * windowDays) + 6,
    inputs: buildManagedMetadata({ region_key: region.key, windowDays }),
    created_at: isoDaysAgo(2),
    updated_at: isoDaysAgo(1),
  })))

  const totalRevenue = approvedApplications.reduce((sum, application) => sum + Math.round(application.finance.bondAmount * 0.018), 0)
  const totalCommission = approvedApplications.reduce((sum, application) => sum + Math.round(application.finance.bondAmount * 0.006), 0)
  const totalReferralFees = approvedApplications.reduce((sum, application) => sum + Math.round(application.finance.bondAmount * 0.002), 0)

  const hqHealthSnapshots = [
    {
      id: deterministicUuid(`bond-hq-health:${period}`),
      organisation_id: plan.workspace.id,
      period,
      health_score: 84,
      health_status: 'Healthy',
      regional_health: 83,
      branch_health: 82,
      partner_health: 86,
      sla_compliance: 91,
      approval_rate: percent(approvedApplications.length, Math.max(submittedApplications.length, 1)),
      escalations: applications.filter((application) => application.atRisk).length,
      capacity_risk: activeApplications.length,
      forecast_risk: 38,
      summary: buildManagedMetadata({ totalApplications: applications.length, revenue: totalRevenue }),
      created_at: isoDaysAgo(1),
      updated_at: isoDaysAgo(1),
    },
  ]

  const hqForecasts = [7, 30, 90].map((windowDays) => ({
    id: deterministicUuid(`bond-hq-forecast:${period}:${windowDays}`),
    organisation_id: plan.workspace.id,
    period,
    forecast_window_days: windowDays,
    expected_applications: Math.round((applications.length / 30) * windowDays),
    expected_approvals: Math.round((approvedApplications.length / 30) * windowDays),
    expected_capacity_risk: windowDays === 90 ? 'High' : windowDays === 30 ? 'Medium' : 'Low',
    required_consultants: windowDays === 90 ? 6 : windowDays === 30 ? 3 : 1,
    expected_sla_risk: windowDays === 90 ? 'Medium' : 'Low',
    executive_forecast_risk: windowDays === 90 ? 'High' : windowDays === 30 ? 'Medium' : 'Low',
    inputs: buildManagedMetadata({ windowDays }),
    created_at: isoDaysAgo(1),
    updated_at: isoDaysAgo(1),
  }))

  const executiveAlerts = [
    {
      id: deterministicUuid('bond-executive-alert:gauteng-capacity'),
      organisation_id: plan.workspace.id,
      alert_type: 'capacity_risk',
      severity: 'High',
      title: 'Gauteng capacity approaching SLA limit',
      description: 'Sandton and Pretoria East have enough active files to justify temporary overflow routing.',
      source_type: 'region',
      source_id: plan.hierarchy.regionIdByKey.gauteng,
      status: 'assigned',
      assigned_to: ownerUserId,
      created_at: isoDaysAgo(2),
      dismissed_at: null,
      updated_at: isoDaysAgo(1),
    },
    {
      id: deterministicUuid('bond-executive-alert:bank-feedback'),
      organisation_id: plan.workspace.id,
      alert_type: 'bank_feedback',
      severity: 'Medium',
      title: 'Bank feedback queue requires review',
      description: 'Several lender clarification requests are older than the target response window.',
      source_type: 'bank',
      source_id: deterministicUuid('bond-bank:ABSA'),
      status: 'open',
      assigned_to: getUserByKey(plan.users, 'olivia_brown')?.userId || ownerUserId,
      created_at: isoDaysAgo(1),
      dismissed_at: null,
      updated_at: isoDaysAgo(1),
    },
  ]

  const executiveReports = ['PDF', 'Excel'].map((format, index) => ({
    id: deterministicUuid(`bond-executive-report:${period}:${format}`),
    organisation_id: plan.workspace.id,
    period,
    format,
    generated_by: ownerUserId,
    file_url: `bond-demo/reports/${period}/executive-${format.toLowerCase()}.${format === 'PDF' ? 'pdf' : 'xlsx'}`,
    sections: ['Executive KPIs', 'Regional Health', 'Revenue', 'SLA Risks'],
    created_at: isoDaysAgo(index + 1),
  }))

  const bankContacts = bankRows.flatMap((bank, index) => ['Relationship Manager', 'Credit Escalations'].map((role, roleIndex) => ({
    id: deterministicUuid(`bond-bank-contact:${bank.name}:${role}`),
    organisation_id: plan.workspace.id,
    bank_id: bank.id,
    name: `${['Andre', 'Melissa', 'Sipho', 'Lauren', 'Karin'][index]} ${roleIndex === 0 ? 'Meyer' : 'Naidoo'}`,
    role,
    email: `${normalizeSlug(bank.name)}.${normalizeSlug(role)}@banks.demo.bridgefinance.co.za`,
    phone: `086${String(2000000 + index * 331 + roleIndex * 17).slice(-7)}`,
    region: roleIndex === 0 ? 'National' : 'Gauteng',
    notes: `Demo ${bank.name} ${role.toLowerCase()} contact.`,
    created_by: ownerUserId,
    created_at: isoDaysAgo(28 - index),
    updated_at: isoDaysAgo(roleIndex),
  })))

  const bankEscalations = applications.filter((application) => application.bucketKey === 'bank_feedback' || application.atRisk).slice(0, 12).map((application, index) => {
    const bank = bankByName.get(application.bank) || bankRows[index % bankRows.length]
    const bondApplication = bondApplicationByTransactionId.get(application.transactionId)
    const resolved = index % 4 === 0
    return {
      id: deterministicUuid(`bond-bank-escalation:${application.transactionReference}`),
      organisation_id: plan.workspace.id,
      bank_id: bank.id,
      application_id: bondApplication?.id || application.transactionId,
      consultant_id: application.consultant?.userId || ownerUserId,
      branch_id: application.branchId,
      region_id: application.regionId,
      issue: application.story,
      issue_type: index % 2 === 0 ? 'Credit Query' : 'Turnaround Delay',
      priority: application.atRisk ? 'High' : 'Medium',
      status: resolved ? 'resolved' : index % 3 === 0 ? 'in_progress' : 'open',
      created_by: ownerUserId,
      created_at: isoDaysAgo(7 + index),
      resolved_at: resolved ? isoDaysAgo(index % 3) : null,
      updated_at: isoDaysAgo(index % 3),
    }
  })

  const bankFeedback = applications.filter((application) => submittedBuckets.has(application.bucketKey)).slice(0, 35).map((application, index) => {
    const bank = bankByName.get(application.bank) || bankRows[index % bankRows.length]
    return {
      id: deterministicUuid(`bond-bank-feedback:${application.transactionReference}`),
      organisation_id: plan.workspace.id,
      bank_id: bank.id,
      feedback_type: application.bucketKey === 'bank_feedback' ? 'query' : application.bucketKey === 'approved' ? 'approval' : 'turnaround',
      sentiment: application.bucketKey === 'bank_feedback' || application.atRisk ? 'negative' : application.bucketKey === 'approved' ? 'positive' : 'neutral',
      message: application.story,
      consultant_id: application.consultant?.userId || ownerUserId,
      branch_id: application.branchId,
      region_id: application.regionId,
      created_by: ownerUserId,
      created_at: isoDaysAgo(index % 18),
    }
  })

  const bankHealthSnapshots = bankRows.map((bank, index) => {
    const scoped = applications.filter((application) => application.bank === bank.name)
    const approvals = scoped.filter((application) => approvedBuckets.has(application.bucketKey)).length
    const submitted = scoped.filter((application) => submittedBuckets.has(application.bucketKey)).length
    const escalations = bankEscalations.filter((row) => row.bank_id === bank.id && row.status !== 'resolved').length
    const healthScore = clampNumber(90 - escalations * 12 + approvals, 45, 98)
    return {
      id: deterministicUuid(`bond-bank-health:${bank.name}:${period}`),
      organisation_id: plan.workspace.id,
      bank_id: bank.id,
      period,
      health_score: healthScore,
      health_status: healthScore >= 90 ? 'Excellent' : healthScore >= 76 ? 'Healthy' : healthScore >= 58 ? 'At Risk' : 'Critical',
      approval_rate: percent(approvals, Math.max(submitted, 1)),
      response_time_score: clampNumber(88 - index * 4, 65, 96),
      escalation_score: clampNumber(100 - escalations * 18, 45, 100),
      instruction_rate: percent(scoped.filter((application) => ['bond_instruction_sent', 'transfer_in_progress', 'registered'].includes(application.bucketKey)).length, Math.max(approvals, 1)),
      consultant_feedback_score: clampNumber(86 - index * 2, 70, 95),
      partner_feedback_score: clampNumber(84 - index, 70, 93),
      summary: buildManagedMetadata({ bank: bank.name, applications: scoped.length }),
      created_at: isoDaysAgo(2),
      updated_at: isoDaysAgo(1),
    }
  })

  const commissionRules = [
    ['Consultant Standard Bond Fee', 'consultant', 'percentage', 0.006, 0],
    ['Branch Performance Pool', 'branch', 'percentage', 0.0015, 0],
    ['Regional Growth Pool', 'region', 'percentage', 0.0008, 0],
    ['Partner Referral Fee', 'partner_referral', 'percentage', 0.002, 0],
    ['Bank Incentive Tracker', 'bank_incentive', 'fixed', 0, 2500],
    ['Monthly SLA Bonus', 'bonus', 'hybrid', 0.0005, 1500],
  ].map(([name, appliesTo, ruleType, percentageValue, fixedAmount]) => ({
    id: deterministicUuid(`bond-commission-rule:${normalizeSlug(name)}`),
    organisation_id: plan.workspace.id,
    name,
    applies_to: appliesTo,
    rule_type: ruleType,
    percentage: percentageValue,
    fixed_amount: fixedAmount,
    tiers: appliesTo === 'consultant' ? [{ min: 0, max: 3000000, percentage: 0.006 }, { min: 3000001, percentage: 0.007 }] : [],
    components: [{ key: 'bond_amount', label: 'Bond Amount' }],
    bonus_criteria: appliesTo === 'bonus' ? { slaCompliance: 94, approvalRate: 65 } : {},
    status: 'active',
    created_by: ownerUserId,
    created_at: isoDaysAgo(32),
    updated_at: isoDaysAgo(1),
  }))

  const commissions = approvedApplications.map((application, index) => ({
    id: deterministicUuid(`bond-commission:${application.transactionReference}`),
    organisation_id: plan.workspace.id,
    application_id: bondApplicationByTransactionId.get(application.transactionId)?.id || application.transactionId,
    consultant_id: application.consultant?.userId || ownerUserId,
    amount: Math.round(application.finance.bondAmount * 0.006),
    status: application.bucketKey === 'registered' ? 'Paid' : index % 4 === 0 ? 'Approved' : 'Pending',
    calculated_at: application.updatedAt,
    approved_at: application.bucketKey === 'registered' || index % 4 === 0 ? isoDaysAgo(index % 6) : null,
    paid_at: application.bucketKey === 'registered' ? application.updatedAt : null,
    created_at: application.updatedAt,
    updated_at: application.updatedAt,
  }))

  const referralFees = approvedApplications.slice(0, 40).map((application, index) => {
    const partner = partnerByName.get(application.agency) || partners[index % partners.length]
    return {
      id: deterministicUuid(`bond-referral-fee:${application.transactionReference}`),
      organisation_id: plan.workspace.id,
      application_id: bondApplicationByTransactionId.get(application.transactionId)?.id || application.transactionId,
      partner_id: partner?.id || null,
      amount: Math.round(application.finance.bondAmount * 0.002),
      status: application.bucketKey === 'registered' ? 'Paid' : index % 3 === 0 ? 'Approved' : 'Pending',
      created_at: application.updatedAt,
      approved_at: index % 3 === 0 || application.bucketKey === 'registered' ? isoDaysAgo(index % 5) : null,
      paid_at: application.bucketKey === 'registered' ? application.updatedAt : null,
      updated_at: application.updatedAt,
    }
  })

  const bonusAwards = [
    ...branchHealthSnapshots.filter((row) => row.health_score >= 86).slice(0, 3).map((row, index) => {
      const branch = branchRows.find((item) => item.id === row.branch_id)
      return {
        id: deterministicUuid(`bond-bonus:branch:${row.branch_id}:${period}`),
        organisation_id: plan.workspace.id,
        recipient_type: 'branch',
        recipient_id: row.branch_id,
        branch_id: row.branch_id,
        region_id: branch?.regionId || null,
        amount: 5000 + index * 1500,
        reason: 'Branch exceeded demo SLA and approval-rate targets.',
        status: index === 0 ? 'Approved' : 'Pending',
        created_by: ownerUserId,
        created_at: isoDaysAgo(index + 2),
        approved_at: index === 0 ? isoDaysAgo(1) : null,
        paid_at: null,
        updated_at: isoDaysAgo(1),
      }
    }),
    ...consultantSnapshots.filter((row) => row.approvals >= 2).slice(0, 4).map((row, index) => ({
      id: deterministicUuid(`bond-bonus:consultant:${row.consultant_id}:${period}`),
      organisation_id: plan.workspace.id,
      recipient_type: 'consultant',
      recipient_id: row.consultant_id,
      branch_id: null,
      region_id: null,
      amount: 2500 + index * 500,
      reason: 'Consultant demo performance bonus.',
      status: index === 0 ? 'Paid' : 'Approved',
      created_by: ownerUserId,
      created_at: isoDaysAgo(index + 1),
      approved_at: isoDaysAgo(index),
      paid_at: index === 0 ? isoDaysAgo(0) : null,
      updated_at: isoDaysAgo(0),
    })),
  ]

  const payouts = [
    ...commissions.slice(0, 28).map((commission, index) => {
      const application = applications.find((item) => bondApplicationByTransactionId.get(item.transactionId)?.id === commission.application_id)
      return {
        id: deterministicUuid(`bond-payout:commission:${commission.id}`),
        organisation_id: plan.workspace.id,
        payee_type: 'consultant',
        payee_id: commission.consultant_id,
        payee_name: application?.consultant?.name || 'Bond Consultant',
        branch_id: application?.branchId || null,
        region_id: application?.regionId || null,
        amount: commission.amount,
        status: commission.status === 'Paid' ? 'Paid' : index % 5 === 0 ? 'Processing' : 'Pending',
        workflow_stage: commission.status === 'Paid' ? 'Paid' : index % 5 === 0 ? 'Finance Review' : 'Calculated',
        manager_approved_at: index % 5 === 0 || commission.status === 'Paid' ? isoDaysAgo(index % 4) : null,
        finance_approved_at: commission.status === 'Paid' ? isoDaysAgo(index % 3) : null,
        paid_at: commission.paid_at,
        audit_trail: [{ event: 'calculated', at: commission.calculated_at }],
        created_by: ownerUserId,
        created_at: commission.created_at,
        updated_at: commission.updated_at,
      }
    }),
    ...referralFees.slice(0, 12).map((fee, index) => ({
      id: deterministicUuid(`bond-payout:referral:${fee.id}`),
      organisation_id: plan.workspace.id,
      payee_type: 'partner',
      payee_id: fee.partner_id,
      payee_name: partners.find((partner) => partner.id === fee.partner_id)?.name || 'Partner',
      branch_id: null,
      region_id: null,
      amount: fee.amount,
      status: fee.status,
      workflow_stage: fee.status === 'Paid' ? 'Paid' : fee.status === 'Approved' ? 'Finance Review' : 'Calculated',
      manager_approved_at: fee.approved_at,
      finance_approved_at: fee.status === 'Paid' ? fee.approved_at : null,
      paid_at: fee.paid_at,
      audit_trail: [{ event: 'referral_fee_calculated', at: fee.created_at }],
      created_by: ownerUserId,
      created_at: fee.created_at,
      updated_at: fee.updated_at,
    })),
  ]

  const revenueSnapshots = [previousPeriod, period].map((snapshotPeriod, index) => {
    const factor = index === 0 ? 0.74 : 1
    const revenue = Math.round(totalRevenue * factor)
    const commission = Math.round(totalCommission * factor)
    const referralFeeAmount = Math.round(totalReferralFees * factor)
    const bonuses = Math.round(bonusAwards.reduce((sum, row) => sum + row.amount, 0) * factor)
    const bankIncentives = Math.round(approvedApplications.length * 2500 * factor)
    const profit = revenue - commission - referralFeeAmount - bonuses + bankIncentives
    return {
      id: deterministicUuid(`bond-revenue-snapshot:${snapshotPeriod}`),
      organisation_id: plan.workspace.id,
      period: snapshotPeriod,
      revenue,
      commission,
      referral_fees: referralFeeAmount,
      bonuses,
      bank_incentives: bankIncentives,
      profit,
      margin: percent(profit, Math.max(revenue, 1)),
      summary: buildManagedMetadata({ approvedApplications: Math.round(approvedApplications.length * factor) }),
      created_at: isoDaysAgo(index + 1),
      updated_at: isoDaysAgo(index),
    }
  })

  const automationRules = [
    ['Missing Docs SLA Nudge', 'Documents', 'application_idle'],
    ['Bank Feedback Escalation', 'Banks', 'bank_feedback_overdue'],
    ['Partner Request Follow-up', 'Partners', 'partner_request_idle'],
    ['Consultant Capacity Guardrail', 'Consultants', 'capacity_threshold'],
    ['Branch SLA Alert', 'Branches', 'sla_breach'],
  ].map(([name, category, event], index) => ({
    id: deterministicUuid(`bond-automation-rule:${normalizeSlug(name)}`),
    organisation_id: plan.workspace.id,
    name,
    category,
    trigger: { event, entityType: index === 3 ? 'consultant' : 'application' },
    conditions: [{ field: 'status', operator: 'not_in', value: ['resolved', 'registered'] }],
    actions: [{ type: index % 2 === 0 ? 'create_task' : 'notify_manager', channel: 'portal' }],
    status: index === 4 ? 'draft' : 'active',
    created_by: ownerUserId,
    created_at: isoDaysAgo(20 - index),
    updated_at: isoDaysAgo(index % 4),
  }))

  const automationRuns = automationRules.flatMap((rule, ruleIndex) => applications.slice(ruleIndex * 5, ruleIndex * 5 + 8).map((application, index) => ({
    id: deterministicUuid(`bond-automation-run:${rule.id}:${application.transactionReference}`),
    organisation_id: plan.workspace.id,
    rule_id: rule.id,
    entity_id: bondApplicationByTransactionId.get(application.transactionId)?.id || application.transactionId,
    entity_type: 'application',
    result: index % 7 === 0 ? 'skipped' : 'success',
    action_results: [{ action: rule.actions[0]?.type, result: index % 7 === 0 ? 'not_applicable' : 'created' }],
    executed_at: isoDaysAgo(index % 10),
  })))

  const automationHistory = automationRuns.map((run, index) => {
    const rule = automationRules.find((item) => item.id === run.rule_id)
    return {
      id: deterministicUuid(`bond-automation-history:${run.id}`),
      organisation_id: plan.workspace.id,
      rule_id: run.rule_id,
      rule_name: rule?.name || 'Automation',
      entity_id: run.entity_id,
      entity_type: run.entity_type,
      action_type: rule?.actions?.[0]?.type || 'create_task',
      event_type: rule?.trigger?.event || 'automation_run',
      result: run.result,
      details: { actionResults: run.action_results },
      created_at: run.executed_at || isoDaysAgo(index % 10),
    }
  })

  const automationTemplates = [
    ['Missing documents reminder', 'Documents', 'email'],
    ['Partner request assigned', 'Partners', 'portal'],
    ['Bank feedback escalation', 'Banks', 'email'],
    ['Consultant coaching task', 'Consultants', 'task'],
  ].map(([name, category, channel], index) => ({
    id: deterministicUuid(`bond-automation-template:${normalizeSlug(name)}`),
    organisation_id: plan.workspace.id,
    name,
    category,
    channel,
    subject: `${name} - {{application_reference}}`,
    body: `Demo template for ${name}.`,
    sequence: [{ delayHours: index * 12, action: channel }],
    status: 'active',
    created_by: ownerUserId,
    created_at: isoDaysAgo(18 - index),
    updated_at: isoDaysAgo(index % 3),
  }))

  const automationRecommendations = [
    ['Automate second missing-doc reminder', 'Documents', 82],
    ['Route overflow from Sandton to Centurion', 'Branches', 76],
    ['Escalate ABSA feedback after 36 hours', 'Banks', 88],
    ['Create coaching tasks for overloaded consultants', 'Consultants', 71],
  ].map(([title, category, impact], index) => ({
    id: deterministicUuid(`bond-automation-recommendation:${normalizeSlug(title)}`),
    organisation_id: plan.workspace.id,
    title,
    description: `Demo recommendation generated from ${category.toLowerCase()} signals.`,
    category,
    impact,
    status: index === 1 ? 'accepted' : 'open',
    source: buildManagedMetadata({ category }),
    created_at: isoDaysAgo(index + 1),
    dismissed_at: null,
  }))

  const predictionSnapshots = applications.slice(0, 48).map((application, index) => {
    const riskScore = application.atRisk ? 84 : application.bucketKey === 'bank_feedback' ? 72 : application.bucketKey === 'approved' ? 24 : 45 + (index % 20)
    return {
      id: deterministicUuid(`bond-prediction:${application.transactionReference}`),
      organisation_id: plan.workspace.id,
      prediction_type: application.atRisk ? 'sla_breach' : 'approval_probability',
      entity_type: 'application',
      entity_id: bondApplicationByTransactionId.get(application.transactionId)?.id || application.transactionId,
      score: riskScore,
      confidence: index % 5 === 0 ? 'High Confidence' : 'Medium Confidence',
      recommendation: application.atRisk ? 'Escalate and reassign follow-up owner.' : 'Continue normal cadence.',
      details: buildManagedMetadata({ transaction_reference: application.transactionReference, bucket: application.bucketKey }),
      predicted_at: isoDaysAgo(index % 7),
      created_at: isoDaysAgo(index % 7),
    }
  })

  const riskScores = predictionSnapshots.map((prediction, index) => ({
    id: deterministicUuid(`bond-risk-score:${prediction.entity_id}`),
    organisation_id: plan.workspace.id,
    entity_type: prediction.entity_type,
    entity_id: prediction.entity_id,
    score: prediction.score,
    risk_level: prediction.score >= 80 ? 'High Risk' : prediction.score >= 60 ? 'Medium Risk' : 'Low Risk',
    reasons: prediction.score >= 80 ? ['Overdue SLA', 'Partner or bank feedback pending'] : ['Normal demo signal'],
    confidence: prediction.confidence,
    recommended_action: prediction.recommendation,
    updated_at: prediction.predicted_at,
    created_at: prediction.created_at,
  }))

  const predictionHistory = predictionSnapshots.slice(0, 24).map((prediction, index) => ({
    id: deterministicUuid(`bond-prediction-history:${prediction.id}`),
    organisation_id: plan.workspace.id,
    prediction_id: prediction.id,
    event_type: 'PREDICTION_CREATED',
    prediction_type: prediction.prediction_type,
    entity_type: prediction.entity_type,
    entity_id: prediction.entity_id,
    previous_value: null,
    new_value: { score: prediction.score, confidence: prediction.confidence },
    created_by: ownerUserId,
    created_at: isoDaysAgo(index % 6),
  }))

  const predictionFeedback = predictionSnapshots.slice(0, 12).map((prediction, index) => ({
    id: deterministicUuid(`bond-prediction-feedback:${prediction.id}`),
    organisation_id: plan.workspace.id,
    prediction_id: prediction.id,
    expected_outcome: prediction.score >= 60 ? 'intervention_required' : 'normal_progress',
    actual_outcome: index % 3 === 0 ? 'intervention_required' : 'normal_progress',
    accuracy: index % 3 === 0 ? 94 : 82,
    correct: index % 4 !== 0,
    notes: 'Demo feedback loop for predictive analytics.',
    created_by: ownerUserId,
    created_at: isoDaysAgo(index % 5),
  }))

  return {
    bondApplicationOwnershipHistory: ownershipHistory,
    bondRoutingRules: routingRules,
    bondRoutingRuleActivity: routingRuleActivity,
    bondPartners: partners,
    bondPartnerInvitations: partnerInvitations,
    bondPartnerActivity: partnerActivity,
    bondPartnerPortalUsers: portalUsers,
    bondPartnerPortalDocuments: portalDocuments,
    bondPartnerPortalDocumentRequests: portalDocumentRequests,
    bondPartnerPortalComments: portalComments,
    bondPartnerPortalSupportTickets: portalSupportTickets,
    bondPartnerPortalAudit: portalAudit,
    bondPartnerPortalNotifications: portalNotifications,
    bondPartnerRequests: partnerRequests,
    bondPartnerRequestMessages: partnerRequestMessages,
    bondPartnerInternalNotes: partnerInternalNotes,
    bondPartnerRequestActivity: partnerRequestActivity,
    bondPartnerRequestNotifications: partnerRequestNotifications,
    bondConsultantTargets: consultantTargets,
    bondConsultantCoachingNotes: consultantCoachingNotes,
    bondConsultantPerformanceSnapshots: consultantSnapshots,
    bondBranchTargets: branchTargets,
    bondBranchHealthSnapshots: branchHealthSnapshots,
    bondBranchForecasts: branchForecasts,
    bondRegionalTargets: regionalTargets,
    bondRegionalHealthSnapshots: regionalHealthSnapshots,
    bondRegionalForecasts: regionalForecasts,
    bondHqHealthSnapshots: hqHealthSnapshots,
    bondHqForecasts: hqForecasts,
    bondExecutiveAlerts: executiveAlerts,
    bondExecutiveReports: executiveReports,
    bondBanks: bankRows,
    bondBankContacts: bankContacts,
    bondBankEscalations: bankEscalations,
    bondBankFeedback: bankFeedback,
    bondBankHealthSnapshots: bankHealthSnapshots,
    bondCommissionRules: commissionRules,
    bondCommissions: commissions,
    bondReferralFees: referralFees,
    bondBonusAwards: bonusAwards,
    bondPayouts: payouts,
    bondRevenueSnapshots: revenueSnapshots,
    bondAutomationRules: automationRules,
    bondAutomationRuns: automationRuns,
    bondAutomationHistory: automationHistory,
    bondAutomationTemplates: automationTemplates,
    bondAutomationRecommendations: automationRecommendations,
    bondPredictionSnapshots: predictionSnapshots,
    bondRiskScores: riskScores,
    bondPredictionHistory: predictionHistory,
    bondPredictionFeedback: predictionFeedback,
  }
}

function buildMembershipRows(plan) {
  return plan.users
    .filter((user) => user.membershipEnabled && user.workspaceId)
    .map((user) => {
      const [firstName, ...rest] = user.name.split(' ')
      return {
        organisation_id: user.workspaceId,
        user_id: user.userId || null,
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
        branch_id: null,
        primary_branch_id: null,
        workspace_unit_id: user.workspaceUnitId,
        scope_metadata: buildManagedMetadata({
          user_key: user.key,
          branch_key: user.branchKey,
          region_key: user.regionKey,
        }),
        is_primary_owner: false,
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

  const hierarchy = createHierarchy(env)
  const users = buildUsers(env, hierarchy)
  const applications = buildApplicationRecords(users, hierarchy)
  const transactionRows = buildTransactionRows(applications)
  const financeDetailRows = buildFinanceDetailsRows(applications)
  const financeRuntimeRows = buildFinanceWorkflowRuntimeRows(applications, null)
  const bondModuleRows = buildBondModuleRuntimeRows({ workspace: hierarchy.workspace, hierarchy, users }, applications, null, financeRuntimeRows)
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
      organisationSettings: makeCount(),
      workspaceRegions: makeCount(),
      workspaceUnits: makeCount(),
      organisationUsers: makeCount(),
      buyers: makeCount(),
      developments: makeCount(),
      developmentSettings: makeCount(),
      units: makeCount(),
      transactions: makeCount(),
      transactionFinanceDetails: makeCount(),
      transactionFinanceWorkflows: makeCount(),
      transactionFinanceWorkflowEvents: makeCount(),
      transactionBondApplications: makeCount(),
      transactionBondQuotes: makeCount(),
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
      bondApplicationOwnershipHistory: makeCount(),
      bondRoutingRules: makeCount(),
      bondRoutingRuleActivity: makeCount(),
      bondPartners: makeCount(),
      bondPartnerInvitations: makeCount(),
      bondPartnerActivity: makeCount(),
      bondPartnerPortalUsers: makeCount(),
      bondPartnerPortalDocuments: makeCount(),
      bondPartnerPortalDocumentRequests: makeCount(),
      bondPartnerPortalComments: makeCount(),
      bondPartnerPortalSupportTickets: makeCount(),
      bondPartnerPortalAudit: makeCount(),
      bondPartnerPortalNotifications: makeCount(),
      bondPartnerRequests: makeCount(),
      bondPartnerRequestMessages: makeCount(),
      bondPartnerInternalNotes: makeCount(),
      bondPartnerRequestActivity: makeCount(),
      bondPartnerRequestNotifications: makeCount(),
      bondConsultantTargets: makeCount(),
      bondConsultantCoachingNotes: makeCount(),
      bondConsultantPerformanceSnapshots: makeCount(),
      bondBranchTargets: makeCount(),
      bondBranchHealthSnapshots: makeCount(),
      bondBranchForecasts: makeCount(),
      bondRegionalTargets: makeCount(),
      bondRegionalHealthSnapshots: makeCount(),
      bondRegionalForecasts: makeCount(),
      bondHqHealthSnapshots: makeCount(),
      bondHqForecasts: makeCount(),
      bondExecutiveAlerts: makeCount(),
      bondExecutiveReports: makeCount(),
      bondBanks: makeCount(),
      bondBankContacts: makeCount(),
      bondBankEscalations: makeCount(),
      bondBankFeedback: makeCount(),
      bondBankHealthSnapshots: makeCount(),
      bondCommissionRules: makeCount(),
      bondCommissions: makeCount(),
      bondReferralFees: makeCount(),
      bondBonusAwards: makeCount(),
      bondPayouts: makeCount(),
      bondRevenueSnapshots: makeCount(),
      bondAutomationRules: makeCount(),
      bondAutomationRuns: makeCount(),
      bondAutomationHistory: makeCount(),
      bondAutomationTemplates: makeCount(),
      bondAutomationRecommendations: makeCount(),
      bondPredictionSnapshots: makeCount(),
      bondRiskScores: makeCount(),
      bondPredictionHistory: makeCount(),
      bondPredictionFeedback: makeCount(),
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
        transactionFinanceWorkflows: financeRuntimeRows.workflows,
        transactionFinanceWorkflowEvents: financeRuntimeRows.workflowEvents,
        transactionBondApplications: financeRuntimeRows.bondApplications,
        transactionBondQuotes: financeRuntimeRows.quotes,
        subprocesses: subprocessRows.subprocesses,
        subprocessSteps: subprocessRows.steps,
        bondModule: bondModuleRows,
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

function parseMissingTable(error) {
  const message = normalizeText(error?.message)
  const schemaCacheMatch = message.match(/could not find the table ['"]public\.([a-zA-Z0-9_]+)['"] in the schema cache/i)
  if (schemaCacheMatch) return schemaCacheMatch[1]
  const relationMatch = message.match(/relation ["'](?:public\.)?([a-zA-Z0-9_]+)["'] does not exist/i)
  if (relationMatch) return relationMatch[1]
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

        const missingTable = parseMissingTable(error)
        if (missingTable === table && options.optionalTable) {
          return { data: [], skippedColumns, skippedTable: table }
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
  const applyOptions = table.startsWith('bond_') ? { optionalTable: true, ...options } : options
  const result = await adapter.upsertRows(table, prepared.rows, applyOptions)
  report.createdOrUpdated[key] = {
    rowCount: result.skippedTable ? 0 : prepared.rows.length,
    ids: result.skippedTable ? [] : prepared.rows.map((row) => row.id || row.transaction_id || row.development_id).filter(Boolean),
    skippedColumns: unique([...(prepared.omittedColumns || []), ...(result.skippedColumns || [])]),
    skippedTable: result.skippedTable || null,
    missing: result.skippedTable ? prepared.rows.length : 0,
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
        target_demo_user: normalizeEmail(getUserByKey(plan.users, TARGET_DEMO_USER_KEY)?.email || DEFAULT_DEMO_OWNER_EMAIL),
        organisation_structure_type: 'regional',
      }),
    },
  ]
}

function buildOrganisationSettingsRows(plan) {
  const settingsJson = {
    organisation_structure_type: 'regional',
    organisationStructureType: 'regional',
    organisationHierarchy: {
      branchesEnabled: true,
      reportingMode: 'regional_hierarchy',
      visibilityMode: 'role_based',
      organisation_structure_type: 'regional',
      organisationStructureType: 'regional',
      structureType: 'regional',
    },
  }

  return [
    {
      organisation_id: plan.workspace.id,
      settings_json: settingsJson,
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
    manager_user_id: getUserByKey(plan.users, region.key === 'gauteng' ? TARGET_DEMO_USER_KEY : region.key === 'kwazulu_natal' ? 'liam_naidoo' : 'sarah_jacobs')?.userId || null,
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
      manager_user_id: getUserByKey(plan.users, TARGET_DEMO_USER_KEY)?.userId || null,
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
  const targetDemoUser = getUserByKey(hydratedUsers, TARGET_DEMO_USER_KEY)
  if (!targetDemoUser?.userId) {
    throw new Error(`Missing required Bond demo auth user: ${targetDemoUser?.email || DEFAULT_DEMO_OWNER_EMAIL}`)
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

  const targetDemoUserId = targetDemoUser.userId
  const hydratedApplications = hydrateApplicationsWithUsers(hydrated._raw.applications, hydratedUsers)
  const hydratedFinanceRuntimeRows = buildFinanceWorkflowRuntimeRows(hydratedApplications, targetDemoUserId)
  const hydratedSubprocessRows = buildSubprocessRows(hydratedApplications)
  const hydratedBondModuleRows = buildBondModuleRuntimeRows(hydrated, hydratedApplications, targetDemoUserId, hydratedFinanceRuntimeRows)
  hydrated._raw = {
    ...hydrated._raw,
    applications: hydratedApplications,
    rows: {
      ...hydrated._raw.rows,
      transactions: buildTransactionRows(hydratedApplications),
      transactionFinanceDetails: buildFinanceDetailsRows(hydratedApplications),
      transactionFinanceWorkflows: hydratedFinanceRuntimeRows.workflows,
      transactionFinanceWorkflowEvents: hydratedFinanceRuntimeRows.workflowEvents,
      transactionBondApplications: hydratedFinanceRuntimeRows.bondApplications,
      transactionBondQuotes: hydratedFinanceRuntimeRows.quotes,
      subprocesses: hydratedSubprocessRows.subprocesses,
      subprocessSteps: hydratedSubprocessRows.steps,
      bondModule: hydratedBondModuleRows,
    },
  }

  const { requests, documents } = buildDocumentRows(hydratedApplications, targetDemoUserId)
  const comments = buildCommentRows(hydratedApplications)
  const events = buildEventRows(hydratedApplications, targetDemoUserId)
  const notifications = buildNotificationRows(hydratedApplications, targetDemoUserId)
  const participants = buildParticipantRows(hydratedApplications)
  const rolePlayers = buildRolePlayerRows(hydratedApplications)
  const portalLinks = buildClientPortalLinks(hydratedApplications)

  await applyCount(hydrated, 'organisations', 'organisations', buildOrganisationRows(hydrated), adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'organisationSettings', 'organisation_settings', buildOrganisationSettingsRows(hydrated), adapter, { onConflict: 'organisation_id' })
  await applyCount(hydrated, 'workspaceRegions', 'workspace_regions', buildWorkspaceRegionRows(hydrated), adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'workspaceUnits', 'workspace_units', buildWorkspaceUnitRows(hydrated), adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'organisationUsers', 'organisation_users', buildMembershipRows(hydrated), adapter, { onConflict: 'organisation_id,email' })
  await applyCount(hydrated, 'buyers', 'buyers', hydrated._raw.rows.buyers, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'developments', 'developments', hydrated._raw.rows.developments, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'developmentSettings', 'development_settings', hydrated._raw.rows.developmentSettings, adapter, { onConflict: 'development_id', select: 'development_id' })
  await applyCount(hydrated, 'units', 'units', hydrated._raw.rows.units, adapter, { onConflict: 'development_id,unit_number' })
  await applyCount(hydrated, 'transactions', 'transactions', hydrated._raw.rows.transactions, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'transactionFinanceWorkflows', 'transaction_finance_workflows', hydrated._raw.rows.transactionFinanceWorkflows, adapter, {
    onConflict: 'transaction_id,workflow_type',
    select: 'id, transaction_id, workflow_type',
  })
  await applyCount(hydrated, 'transactionFinanceWorkflowEvents', 'transaction_finance_workflow_events', hydrated._raw.rows.transactionFinanceWorkflowEvents, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'transactionBondApplications', 'transaction_bond_applications', hydrated._raw.rows.transactionBondApplications, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'transactionBondQuotes', 'transaction_bond_quotes', hydrated._raw.rows.transactionBondQuotes, adapter, { onConflict: 'id' })
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
  const bondRows = hydrated._raw.rows.bondModule
  await applyCount(hydrated, 'bondApplicationOwnershipHistory', 'bond_application_ownership_history', bondRows.bondApplicationOwnershipHistory, adapter, { onConflict: 'id', optionalTable: true })
  await applyCount(hydrated, 'bondRoutingRules', 'bond_routing_rules', bondRows.bondRoutingRules, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondRoutingRuleActivity', 'bond_routing_rule_activity', bondRows.bondRoutingRuleActivity, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartners', 'bond_partners', bondRows.bondPartners, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerInvitations', 'bond_partner_invitations', bondRows.bondPartnerInvitations, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerActivity', 'bond_partner_activity', bondRows.bondPartnerActivity, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerPortalUsers', 'bond_partner_portal_users', bondRows.bondPartnerPortalUsers, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerPortalDocuments', 'bond_partner_portal_documents', bondRows.bondPartnerPortalDocuments, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerPortalDocumentRequests', 'bond_partner_portal_document_requests', bondRows.bondPartnerPortalDocumentRequests, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerPortalComments', 'bond_partner_portal_comments', bondRows.bondPartnerPortalComments, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerPortalSupportTickets', 'bond_partner_portal_support_tickets', bondRows.bondPartnerPortalSupportTickets, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerPortalAudit', 'bond_partner_portal_audit', bondRows.bondPartnerPortalAudit, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerPortalNotifications', 'bond_partner_portal_notifications', bondRows.bondPartnerPortalNotifications, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerRequests', 'bond_partner_requests', bondRows.bondPartnerRequests, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerRequestMessages', 'bond_partner_request_messages', bondRows.bondPartnerRequestMessages, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerInternalNotes', 'bond_partner_internal_notes', bondRows.bondPartnerInternalNotes, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerRequestActivity', 'bond_partner_request_activity', bondRows.bondPartnerRequestActivity, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPartnerRequestNotifications', 'bond_partner_request_notifications', bondRows.bondPartnerRequestNotifications, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondConsultantTargets', 'bond_consultant_targets', bondRows.bondConsultantTargets, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondConsultantCoachingNotes', 'bond_consultant_coaching_notes', bondRows.bondConsultantCoachingNotes, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondConsultantPerformanceSnapshots', 'bond_consultant_performance_snapshots', bondRows.bondConsultantPerformanceSnapshots, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondBranchTargets', 'bond_branch_targets', bondRows.bondBranchTargets, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondBranchHealthSnapshots', 'bond_branch_health_snapshots', bondRows.bondBranchHealthSnapshots, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondBranchForecasts', 'bond_branch_forecasts', bondRows.bondBranchForecasts, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondRegionalTargets', 'bond_regional_targets', bondRows.bondRegionalTargets, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondRegionalHealthSnapshots', 'bond_regional_health_snapshots', bondRows.bondRegionalHealthSnapshots, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondRegionalForecasts', 'bond_regional_forecasts', bondRows.bondRegionalForecasts, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondHqHealthSnapshots', 'bond_hq_health_snapshots', bondRows.bondHqHealthSnapshots, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondHqForecasts', 'bond_hq_forecasts', bondRows.bondHqForecasts, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondExecutiveAlerts', 'bond_executive_alerts', bondRows.bondExecutiveAlerts, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondExecutiveReports', 'bond_executive_reports', bondRows.bondExecutiveReports, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondBanks', 'bond_banks', bondRows.bondBanks, adapter, { onConflict: 'organisation_id,name' })
  await applyCount(hydrated, 'bondBankContacts', 'bond_bank_contacts', bondRows.bondBankContacts, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondBankEscalations', 'bond_bank_escalations', bondRows.bondBankEscalations, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondBankFeedback', 'bond_bank_feedback', bondRows.bondBankFeedback, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondBankHealthSnapshots', 'bond_bank_health_snapshots', bondRows.bondBankHealthSnapshots, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondCommissionRules', 'bond_commission_rules', bondRows.bondCommissionRules, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondCommissions', 'bond_commissions', bondRows.bondCommissions, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondReferralFees', 'bond_referral_fees', bondRows.bondReferralFees, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondBonusAwards', 'bond_bonus_awards', bondRows.bondBonusAwards, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPayouts', 'bond_payouts', bondRows.bondPayouts, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondRevenueSnapshots', 'bond_revenue_snapshots', bondRows.bondRevenueSnapshots, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondAutomationRules', 'bond_automation_rules', bondRows.bondAutomationRules, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondAutomationRuns', 'bond_automation_runs', bondRows.bondAutomationRuns, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondAutomationHistory', 'bond_automation_history', bondRows.bondAutomationHistory, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondAutomationTemplates', 'bond_automation_templates', bondRows.bondAutomationTemplates, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondAutomationRecommendations', 'bond_automation_recommendations', bondRows.bondAutomationRecommendations, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPredictionSnapshots', 'bond_prediction_snapshots', bondRows.bondPredictionSnapshots, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondRiskScores', 'bond_risk_scores', bondRows.bondRiskScores, adapter, { onConflict: 'organisation_id,entity_type,entity_id' })
  await applyCount(hydrated, 'bondPredictionHistory', 'bond_prediction_history', bondRows.bondPredictionHistory, adapter, { onConflict: 'id' })
  await applyCount(hydrated, 'bondPredictionFeedback', 'bond_prediction_feedback', bondRows.bondPredictionFeedback, adapter, { onConflict: 'id' })

  hydrated.applied = true
  hydrated.applyReason = null
  hydrated.metrics.notifications = notifications.length
  hydrated.metrics.transactionEvents = events.length
  hydrated.metrics.documentRequests = requests.length
  hydrated.metrics.documents = documents.length
  hydrated.metrics.transactionComments = comments.length
  hydrated.metrics.clientPortalLinks = portalLinks.length
  hydrated.metrics.bondModuleRows = Object.values(bondRows).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0)
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
