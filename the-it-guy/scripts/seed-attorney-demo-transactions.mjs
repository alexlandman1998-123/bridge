#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  getAttorneyStageDefinitionsForLane,
  getAttorneyStageKeysForLane,
  getAttorneyStageLabel,
} from '../src/constants/attorneyWorkflowStages.js'

const TARGET_EMAIL = String(process.env.ATTORNEY_DEMO_EMAIL || 'attorney.demo@bridgenine.co.za').trim().toLowerCase()
const SEED_KEY = 'attorney-demo-full-workflows-v1'
const ENVIRONMENT = String(process.env.ATTORNEY_DEMO_ENVIRONMENT || 'staging').trim() || 'staging'
const UUID_NAMESPACE = 'bridge9-attorney-demo-seed-v1'

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]
      }),
  )
}

const env = {
  ...parseEnvFile('.env'),
  ...parseEnvFile('.env.staging.local'),
  ...process.env,
}

function envValue(...names) {
  for (const name of names) {
    const value = String(env[name] || '').trim()
    if (value) return value
  }
  return ''
}

const supabaseUrl = envValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
const serviceRoleKey = envValue('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

function stableUuid(seed) {
  const hash = crypto.createHash('sha1').update(`${UUID_NAMESPACE}:${seed}`).digest('hex')
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join('-')
}

function nowMs() {
  return Date.parse('2026-07-09T10:00:00.000+02:00')
}

function isoDays(deltaDays, hour = 10) {
  const date = new Date(nowMs())
  date.setUTCDate(date.getUTCDate() + Number(deltaDays || 0))
  date.setUTCHours(hour, 0, 0, 0)
  return date.toISOString()
}

function dateDays(deltaDays) {
  return isoDays(deltaDays).slice(0, 10)
}

function money(value) {
  return Number(value || 0)
}

function normalizeText(value) {
  return String(value || '').trim()
}

function laneMeta(laneKey) {
  if (laneKey === 'bond') {
    return {
      laneKey: 'bond',
      attorneyRole: 'bond_attorney',
      assignmentType: 'bond',
      label: 'Bond Attorney',
      departmentType: 'bond',
    }
  }
  if (laneKey === 'cancellation') {
    return {
      laneKey: 'cancellation',
      attorneyRole: 'cancellation_attorney',
      assignmentType: 'cancellation',
      label: 'Cancellation Attorney',
      departmentType: 'transfer',
    }
  }
  return {
    laneKey: 'transfer',
    attorneyRole: 'transfer_attorney',
    assignmentType: 'transfer',
    label: 'Transfer Attorney',
    departmentType: 'transfer',
  }
}

function statusForStep({ index, currentIndex, laneStatus }) {
  if (laneStatus === 'completed') return 'completed'
  if (index < currentIndex) return 'completed'
  if (index === currentIndex) return laneStatus === 'blocked' ? 'blocked' : 'in_progress'
  return 'not_started'
}

function buildLaneSteps({ subprocessId, laneKey, currentStage, laneStatus, updatedBy }) {
  const keys = getAttorneyStageKeysForLane(laneKey)
  const currentIndex = Math.max(0, keys.indexOf(currentStage))
  return keys.map((stageKey, index) => {
    const status = statusForStep({ index, currentIndex, laneStatus })
    return {
      id: stableUuid(`step:${subprocessId}:${stageKey}`),
      subprocess_id: subprocessId,
      step_key: stageKey,
      step_label: getAttorneyStageLabel(stageKey, laneKey),
      status,
      completed_at: status === 'completed' ? isoDays(-(keys.length - index + 2), 13) : null,
      comment: index === currentIndex ? currentStageNote(laneKey, stageKey, laneStatus) : null,
      owner_type: 'attorney',
      sort_order: index + 1,
      visibility_scope: 'internal',
      completed_by: status === 'completed' ? updatedBy : null,
      updated_at: isoDays(-1, 15),
      is_demo_data: true,
      step_metadata: {
        seedKey: SEED_KEY,
        laneKey,
        statusBucket: getAttorneyStageDefinitionsForLane(laneKey).find((item) => item.key === stageKey)?.statusBucket || null,
      },
    }
  })
}

function currentStageNote(laneKey, stageKey, laneStatus) {
  if (laneStatus === 'blocked') return 'Demo blocker added so the escalation and follow-up workflow can be tested.'
  if (laneKey === 'transfer' && stageKey.includes('signing')) return 'Demo signing appointment is linked to this matter.'
  if (stageKey.includes('lodgement')) return 'Demo matter is ready for lodgement coordination.'
  return 'Demo workflow state seeded for end-to-end testing.'
}

function firstStage(laneKey) {
  return getAttorneyStageKeysForLane(laneKey)[0]
}

function finalStage(laneKey) {
  const keys = getAttorneyStageKeysForLane(laneKey)
  return keys[keys.length - 1]
}

function legacyRiskStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'blocked') return 'Blocked'
  if (normalized === 'attention' || normalized === 'at_risk') return 'At Risk'
  if (normalized === 'delayed') return 'Delayed'
  return 'On Track'
}

function legacyOperationalState(scenario = {}) {
  if (scenario.operationalState === 'blocked') return 'blocked'
  if (scenario.riskStatus === 'attention') return 'at_risk'
  return 'on_track'
}

function legacyStage(scenario = {}) {
  if (scenario.registrationOffset || scenario.operationalState === 'completed') return 'Registered'
  const stageKey = String(scenario.attorneyStage || '').toLowerCase()
  if (stageKey.includes('lodgement')) return 'Transfer Lodged'
  if (stageKey.includes('registered')) return 'Registered'
  return 'Transfer in Progress'
}

function legacyMainStage(scenario = {}) {
  if (scenario.registrationOffset || scenario.operationalState === 'completed') return 'REG'
  const stageKey = String(scenario.attorneyStage || '').toLowerCase()
  if (stageKey.includes('lodgement') || stageKey.includes('registered')) return 'XFER'
  return 'ATTY'
}

function legacyAttorneyStage(stageKey = '') {
  const normalized = String(stageKey || '').toLowerCase()
  if (normalized.includes('registered') || normalized.includes('matter_closed') || normalized.includes('registration_letter')) return 'registered'
  if (normalized.includes('prep')) return 'registration_preparation'
  if (normalized.includes('lodge') || normalized.includes('lodgement')) return 'lodgement'
  if (normalized.includes('rates') || normalized.includes('levy') || normalized.includes('clearance') || normalized.includes('certificate')) return 'clearances'
  if (normalized.includes('guarantee') || normalized.includes('bank_condition') || normalized.includes('bond')) return 'guarantees'
  if (normalized.includes('sign')) return 'signing'
  if (normalized.includes('fica') || normalized.includes('trust') || normalized.includes('company') || normalized.includes('authority') || normalized.includes('beneficial')) return 'fica_onboarding'
  if (normalized.includes('duty') || normalized.includes('documents') || normalized.includes('source_docs')) return 'drafting'
  return 'instruction_received'
}

function documentRequestLifecycleStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'approved' || normalized === 'completed') return 'completed'
  if (normalized === 'under_review' || normalized === 'uploaded') return 'uploaded'
  if (normalized === 'rejected') return 'rejected'
  return 'requested'
}

const scenarios = [
  {
    slug: 'sea-point-cash-transfer',
    reference: 'B9-TRF-2026-001',
    title: 'Sea Point apartment cash transfer',
    matterNumber: 'LMN/SEA/0412',
    transactionType: 'private_sale',
    financeType: 'cash',
    propertyType: 'residential',
    purchaserType: 'individual',
    sellerEntityType: 'individual',
    purchasePrice: 4250000,
    cashAmount: 4250000,
    depositAmount: 425000,
    riskStatus: 'healthy',
    operationalState: 'active',
    stage: 'transfer',
    mainStage: 'Transfer Preparation',
    subStage: 'Rates and levy clearances in progress',
    attorneyStage: 'rates_figures_requested',
    nextAction: 'Follow up on municipal rates figures and levy clearance statement.',
    saleDateOffset: -42,
    expectedTransferOffset: 28,
    targetRegistrationOffset: 42,
    property: {
      description: 'Sectional title apartment, Unit 803 The Palms',
      line1: 'Unit 803, The Palms, 11 Ocean View Drive',
      line2: 'Sea Point',
      suburb: 'Sea Point',
      city: 'Cape Town',
      province: 'Western Cape',
      postalCode: '8005',
      titleDeedNumber: 'ST48213/2021',
    },
    buyer: {
      name: 'Mia van der Merwe',
      email: 'mia.vdm.demo@bridgenine.co.za',
      phone: '+27 82 555 0142',
      ageGroup: '35-44',
    },
    seller: {
      name: 'Johan and Elna Pretorius',
      email: 'pretorius.sellers.demo@bridgenine.co.za',
      phone: '+27 72 555 0188',
    },
    agent: {
      name: 'Sarah Jacobs',
      email: 'sarah.jacobs.demo@legacyestates.co.za',
    },
    lanes: [
      { laneKey: 'transfer', stageKey: 'rates_figures_requested', laneStatus: 'in_progress', dueOffset: 4 },
    ],
    requests: [
      requestSeed('transfer', 'rates_clearance', 'Rates Clearance Certificate', 'seller', 'requested', 3),
      requestSeed('transfer', 'levy_clearance', 'Body Corporate Levy Clearance', 'seller', 'uploaded', 5),
      requestSeed('transfer', 'buyer_id_document', 'Buyer ID Document', 'buyer', 'approved', -3),
      requestSeed('transfer', 'seller_id_document', 'Seller ID Document', 'seller', 'approved', -4),
    ],
    documents: [
      documentSeed('transfer', 'buyer_id_document', 'Mia van der Merwe ID.pdf', 'fica', 'approved', true),
      documentSeed('transfer', 'seller_id_document', 'Pretorius Seller IDs.pdf', 'fica', 'approved', true),
      documentSeed('transfer', 'levy_clearance', 'The Palms Levy Clearance.pdf', 'property_compliance', 'uploaded', true),
    ],
    updates: [
      updateSeed('transfer', 'buyer_fica_approved', 'Buyer FICA has been approved. Rates and levy clearance remain the only open client-facing items.', 'professional_shared', -2),
      updateSeed('transfer', 'rates_figures_requested', 'Rates figures requested from City of Cape Town. Follow-up diarised for Friday.', 'client_visible', -1),
      updateSeed('transfer', 'internal_note', 'Check levy clearance validity date before lodgement pack is prepared.', 'internal', 0),
    ],
    appointments: [
      appointmentSeed('transfer_signing', 'Seller transfer document signing', 6, 'Landman Attorney offices, Cape Town'),
    ],
  },
  {
    slug: 'bryanston-bond-cancellation',
    reference: 'B9-BND-2026-014',
    title: 'Bryanston family home bond and cancellation',
    matterNumber: 'LMN/BRY/1198',
    transactionType: 'resale',
    financeType: 'bond',
    propertyType: 'residential',
    purchaserType: 'individual',
    sellerEntityType: 'individual',
    purchasePrice: 6850000,
    bondAmount: 5480000,
    depositAmount: 685000,
    bank: 'Nedbank',
    riskStatus: 'attention',
    operationalState: 'active',
    stage: 'attorney_workflow',
    mainStage: 'Bond + Transfer Coordination',
    subStage: 'Bank conditions outstanding before lodgement',
    attorneyStage: 'bank_conditions_outstanding',
    nextAction: 'Resolve bank condition for updated building insurance schedule.',
    saleDateOffset: -57,
    expectedTransferOffset: 35,
    targetRegistrationOffset: 49,
    sellerHasExistingBond: true,
    currentBondBank: 'FNB',
    currentBondAccountNumber: 'FNB-HL-771245',
    estimatedSettlementAmount: 3320000,
    property: {
      description: 'Freehold family home, Erf 4421 Bryanston',
      line1: '18 Jacaranda Crescent',
      line2: 'Bryanston',
      suburb: 'Bryanston',
      city: 'Johannesburg',
      province: 'Gauteng',
      postalCode: '2191',
      titleDeedNumber: 'T77124/2019',
    },
    buyer: {
      name: 'Thabo Mokoena',
      email: 'thabo.mokoena.demo@bridgenine.co.za',
      phone: '+27 83 555 0197',
      ageGroup: '45-54',
    },
    seller: {
      name: 'Grant and Nicola Fraser',
      email: 'fraser.sellers.demo@bridgenine.co.za',
      phone: '+27 71 555 0104',
    },
    agent: {
      name: 'Megan Barnard',
      email: 'megan.barnard.demo@primeurban.co.za',
    },
    bondOriginator: {
      name: 'BetterBond Sandton Desk',
      email: 'sandton.demo@betterbond.example',
    },
    lanes: [
      { laneKey: 'transfer', stageKey: 'guarantees_requested', laneStatus: 'in_progress', dueOffset: 7 },
      { laneKey: 'bond', stageKey: 'bank_conditions_outstanding', laneStatus: 'blocked', dueOffset: 2 },
      { laneKey: 'cancellation', stageKey: 'cancellation_figures_requested', laneStatus: 'in_progress', dueOffset: 5 },
    ],
    requests: [
      requestSeed('bond', 'bank_requirements', 'Updated Building Insurance Schedule', 'buyer', 'rejected', 1),
      requestSeed('bond', 'buyer_signed_bond_documents', 'Signed Bond Documents', 'buyer', 'uploaded', -1),
      requestSeed('transfer', 'guarantee_letter', 'Guarantee Letter', 'bond_attorney', 'requested', 5),
      requestSeed('cancellation', 'cancellation_figures', 'Cancellation Figures', 'seller', 'requested', 4),
      requestSeed('cancellation', 'seller_bond_cancellation_information', 'Seller Bond Statement', 'seller', 'approved', -2),
    ],
    documents: [
      documentSeed('bond', 'buyer_signed_bond_documents', 'Signed Nedbank Bond Pack.pdf', 'bond_documents', 'uploaded', true),
      documentSeed('bond', 'bank_requirements', 'Building Insurance Schedule - old.pdf', 'bond_documents', 'rejected', false),
      documentSeed('cancellation', 'seller_bond_cancellation_information', 'FNB Bond Statement.pdf', 'cancellation_documents', 'approved', true),
    ],
    updates: [
      updateSeed('bond', 'bank_conditions_outstanding', 'Nedbank requires an updated insurance schedule before approval to lodge.', 'professional_shared', -1),
      updateSeed('transfer', 'guarantees_requested', 'Guarantees requested from the bond attorney and aligned with cancellation settlement estimate.', 'client_visible', -1),
      updateSeed('cancellation', 'cancellation_figures_requested', 'Cancellation figures requested from FNB with seller bond account reference captured.', 'professional_shared', -3),
      updateSeed('bond', 'internal_note', 'Escalate with originator if revised insurance schedule is not received by tomorrow afternoon.', 'internal', 0),
    ],
    blockers: [
      blockerSeed('bond', 'Updated building insurance schedule required', 'Nedbank will not issue approval to lodge until the buyer uploads a schedule noting the bank interest.', 'high', 2),
    ],
    appointments: [
      appointmentSeed('bond_signing', 'Buyer bond document re-signing slot', 3, 'Teams video appointment'),
    ],
  },
  {
    slug: 'waterfall-development-company',
    reference: 'B9-DEV-2026-021',
    title: 'Waterfall development sale to company purchaser',
    matterNumber: 'LMN/WTR/2044',
    transactionType: 'development_sale',
    financeType: 'hybrid',
    propertyType: 'residential',
    purchaserType: 'company',
    sellerEntityType: 'company',
    purchasePrice: 3195000,
    bondAmount: 2300000,
    cashAmount: 895000,
    depositAmount: 319500,
    bank: 'Standard Bank',
    riskStatus: 'healthy',
    operationalState: 'active',
    stage: 'lodgement_ready',
    mainStage: 'Ready for Lodgement',
    subStage: 'Company authority checked, bank approval to lodge received',
    attorneyStage: 'lodgement_ready',
    nextAction: 'Coordinate simultaneous transfer and bond lodgement batch.',
    saleDateOffset: -69,
    expectedTransferOffset: 18,
    targetRegistrationOffset: 31,
    property: {
      description: 'New development unit, Munyaka Waterfall, Unit B1204',
      line1: 'Unit B1204 Munyaka',
      line2: 'Waterfall City',
      suburb: 'Waterfall',
      city: 'Midrand',
      province: 'Gauteng',
      postalCode: '1686',
      titleDeedNumber: 'PTN-DEV-MNY-B1204',
    },
    buyer: {
      name: 'Kopano Growth Holdings (Pty) Ltd',
      email: 'legal.demo@kopanogrowth.co.za',
      phone: '+27 11 555 0191',
      ageGroup: 'company',
    },
    seller: {
      name: 'Waterfall Residential Developments (Pty) Ltd',
      email: 'transfers.demo@waterfall-residential.example',
      phone: '+27 11 555 0133',
    },
    agent: {
      name: 'Zanele Mokoena',
      email: 'zanele.mokoena.demo@summitresidential.co.za',
    },
    bondOriginator: {
      name: 'Ooba Development Desk',
      email: 'development.demo@ooba.example',
    },
    lanes: [
      { laneKey: 'transfer', stageKey: 'lodgement_ready', laneStatus: 'in_progress', dueOffset: 3 },
      { laneKey: 'bond', stageKey: 'bank_approval_to_lodge_received', laneStatus: 'in_progress', dueOffset: 3 },
    ],
    requests: [
      requestSeed('transfer', 'buyer_company_resolution', 'Buyer Company Resolution', 'buyer', 'approved', -6),
      requestSeed('transfer', 'developer_sale_pack', 'Developer Sale Pack', 'developer', 'approved', -8),
      requestSeed('transfer', 'transfer_duty_receipt', 'Transfer Duty Receipt', 'attorney', 'approved', -2),
      requestSeed('bond', 'bank_approval_to_lodge', 'Bank Approval to Lodge', 'bond_attorney', 'approved', -1),
      requestSeed('bond', 'guarantee_letter', 'Guarantee Letter', 'bond_attorney', 'approved', -1),
    ],
    documents: [
      documentSeed('transfer', 'buyer_company_resolution', 'Kopano Board Resolution.pdf', 'entity_documents', 'approved', true),
      documentSeed('transfer', 'developer_sale_pack', 'Munyaka Developer Sale Pack.pdf', 'development_documents', 'approved', false),
      documentSeed('bond', 'bank_approval_to_lodge', 'Standard Bank Approval to Lodge.pdf', 'bond_documents', 'approved', false),
      documentSeed('bond', 'guarantee_letter', 'Standard Bank Guarantee.pdf', 'bond_documents', 'approved', true),
    ],
    updates: [
      updateSeed('transfer', 'company_resolution_received', 'Company authority and signatory resolution checked for Kopano Growth Holdings.', 'professional_shared', -5),
      updateSeed('bond', 'bank_approval_to_lodge_received', 'Standard Bank approval to lodge received and guarantee wording accepted.', 'professional_shared', -1),
      updateSeed('transfer', 'lodgement_ready', 'Transfer and bond packs are ready for simultaneous lodgement.', 'client_visible', 0),
    ],
    packets: [
      packetSeed('transfer_signature_pack', 'Company purchaser transfer signature pack', 'completed'),
      packetSeed('bond_signature_pack', 'Company purchaser bond signature pack', 'completed'),
    ],
  },
  {
    slug: 'stellenbosch-trust-cash',
    reference: 'B9-TRU-2026-033',
    title: 'Stellenbosch wine farm trust acquisition',
    matterNumber: 'LMN/STB/3370',
    transactionType: 'private_sale',
    financeType: 'cash',
    propertyType: 'agricultural',
    purchaserType: 'trust',
    sellerEntityType: 'company',
    purchasePrice: 12600000,
    cashAmount: 12600000,
    depositAmount: 1260000,
    riskStatus: 'blocked',
    operationalState: 'blocked',
    stage: 'attorney_workflow',
    mainStage: 'Entity Authority Review',
    subStage: 'Trustee authority outstanding',
    attorneyStage: 'entity_authority_checked',
    nextAction: 'Obtain trust letters of authority and trustee resolution.',
    saleDateOffset: -31,
    expectedTransferOffset: 61,
    targetRegistrationOffset: 78,
    sellerHasExistingBond: true,
    currentBondBank: 'ABSA',
    currentBondAccountNumber: 'ABSA-AGRI-6240',
    estimatedSettlementAmount: 7100000,
    property: {
      description: 'Agricultural holding, Portion 12 of Farm Goede Hoop',
      line1: 'Portion 12, Goede Hoop Road',
      line2: 'Blaauwklippen Valley',
      suburb: 'Stellenbosch Farms',
      city: 'Stellenbosch',
      province: 'Western Cape',
      postalCode: '7600',
      titleDeedNumber: 'T41088/2017',
    },
    buyer: {
      name: 'The Naledi Family Trust',
      email: 'trustees.demo@naleditrust.co.za',
      phone: '+27 21 555 0149',
      ageGroup: 'trust',
    },
    seller: {
      name: 'Goede Hoop Vineyards (Pty) Ltd',
      email: 'directors.demo@goedehoop.example',
      phone: '+27 21 555 0175',
    },
    agent: {
      name: 'Lerato Dlamini',
      email: 'lerato.dlamini.demo@agriland.co.za',
    },
    lanes: [
      { laneKey: 'transfer', stageKey: 'entity_authority_checked', laneStatus: 'blocked', dueOffset: 1 },
      { laneKey: 'cancellation', stageKey: 'cancellation_instruction_received', laneStatus: 'in_progress', dueOffset: 8 },
    ],
    requests: [
      requestSeed('transfer', 'buyer_trust_deed', 'Buyer Trust Deed', 'buyer', 'uploaded', -2),
      requestSeed('transfer', 'buyer_letters_of_authority', 'Buyer Letters of Authority', 'buyer', 'requested', 1),
      requestSeed('transfer', 'buyer_trustee_resolution', 'Trustee Resolution', 'buyer', 'requested', 1),
      requestSeed('transfer', 'seller_company_resolution', 'Seller Company Resolution', 'seller', 'under_review', 2),
      requestSeed('cancellation', 'bond_cancellation_notice', 'ABSA Cancellation Notice', 'seller', 'requested', 5),
    ],
    documents: [
      documentSeed('transfer', 'buyer_trust_deed', 'Naledi Trust Deed.pdf', 'entity_documents', 'uploaded', true),
      documentSeed('transfer', 'seller_company_resolution', 'Goede Hoop Directors Resolution.pdf', 'entity_documents', 'uploaded', true),
    ],
    updates: [
      updateSeed('transfer', 'trust_deed_received', 'Trust deed received. Letters of authority and trustee resolution remain outstanding.', 'professional_shared', -2),
      updateSeed('transfer', 'beneficial_ownership_requested', 'Beneficial ownership pack requested for trust and seller company verification.', 'client_visible', -1),
      updateSeed('transfer', 'internal_note', 'Do not progress duty assessment until trust authority is complete.', 'internal', 0),
    ],
    blockers: [
      blockerSeed('transfer', 'Trust authority incomplete', 'Letters of authority and trustee resolution are required before signing authority can be confirmed.', 'critical', 1),
    ],
  },
  {
    slug: 'woodstock-commercial-transfer',
    reference: 'B9-COM-2026-044',
    title: 'Woodstock commercial warehouse transfer',
    matterNumber: 'LMN/WDS/4481',
    transactionType: 'commercial',
    financeType: 'cash',
    propertyType: 'commercial',
    purchaserType: 'company',
    sellerEntityType: 'company',
    purchasePrice: 9800000,
    cashAmount: 9800000,
    depositAmount: 980000,
    riskStatus: 'attention',
    operationalState: 'active',
    stage: 'transfer_duty',
    mainStage: 'VAT and Transfer Duty',
    subStage: 'VAT treatment confirmed, SARS submission pending receipt',
    attorneyStage: 'transfer_duty_submitted',
    nextAction: 'Track SARS receipt and occupational rental addendum.',
    saleDateOffset: -48,
    expectedTransferOffset: 38,
    targetRegistrationOffset: 55,
    property: {
      description: 'Light industrial warehouse with showroom',
      line1: '24 Albert Road',
      line2: 'Woodstock',
      suburb: 'Woodstock',
      city: 'Cape Town',
      province: 'Western Cape',
      postalCode: '7925',
      titleDeedNumber: 'T22019/2015',
    },
    buyer: {
      name: 'Atlantic Warehousing (Pty) Ltd',
      email: 'finance.demo@atlanticwarehousing.co.za',
      phone: '+27 21 555 0109',
      ageGroup: 'company',
    },
    seller: {
      name: 'Cape Light Industrial Holdings (Pty) Ltd',
      email: 'assetmanager.demo@clih.example',
      phone: '+27 21 555 0180',
    },
    agent: {
      name: 'Brendan Dlamini',
      email: 'brendan.dlamini.demo@capitalcommercial.co.za',
    },
    lanes: [
      { laneKey: 'transfer', stageKey: 'transfer_duty_submitted', laneStatus: 'in_progress', dueOffset: 6 },
    ],
    requests: [
      requestSeed('transfer', 'zoning_certificate', 'Zoning Certificate', 'seller', 'approved', -3),
      requestSeed('transfer', 'occupation_certificate', 'Occupation Certificate', 'seller', 'uploaded', -1),
      requestSeed('transfer', 'buyer_company_resolution', 'Buyer Company Resolution', 'buyer', 'approved', -6),
      requestSeed('transfer', 'transfer_duty_receipt', 'Transfer Duty / VAT Receipt', 'attorney', 'requested', 6),
    ],
    documents: [
      documentSeed('transfer', 'zoning_certificate', 'Woodstock Zoning Certificate.pdf', 'commercial_documents', 'approved', true),
      documentSeed('transfer', 'occupation_certificate', 'Occupation Certificate.pdf', 'commercial_documents', 'uploaded', true),
      documentSeed('transfer', 'buyer_company_resolution', 'Atlantic Warehousing Resolution.pdf', 'entity_documents', 'approved', true),
    ],
    updates: [
      updateSeed('transfer', 'transfer_duty_submitted', 'VAT treatment confirmed with accountant and SARS submission lodged.', 'professional_shared', -1),
      updateSeed('transfer', 'internal_note', 'Review occupational rental addendum before preparing final transfer documents.', 'internal', 0),
    ],
  },
  {
    slug: 'durban-north-registered',
    reference: 'B9-REG-2026-052',
    title: 'Durban North townhouse registered matter',
    matterNumber: 'LMN/DBN/5228',
    transactionType: 'resale',
    financeType: 'bond',
    propertyType: 'residential',
    purchaserType: 'individual',
    sellerEntityType: 'individual',
    purchasePrice: 2890000,
    bondAmount: 2450000,
    depositAmount: 289000,
    bank: 'FNB',
    riskStatus: 'complete',
    operationalState: 'completed',
    stage: 'registered',
    mainStage: 'Registered',
    subStage: 'Final accounts and registration letters issued',
    attorneyStage: 'matter_closed',
    nextAction: 'Archive final account and close matter.',
    saleDateOffset: -112,
    expectedTransferOffset: -3,
    targetRegistrationOffset: -1,
    registrationOffset: -2,
    sellerHasExistingBond: true,
    currentBondBank: 'Standard Bank',
    currentBondAccountNumber: 'STD-HL-90871',
    estimatedSettlementAmount: 1180000,
    property: {
      description: 'Sectional title townhouse, Unit 14 Palm Grove',
      line1: 'Unit 14 Palm Grove, 7 Umhlanga Rocks Drive',
      line2: 'Durban North',
      suburb: 'Durban North',
      city: 'Durban',
      province: 'KwaZulu-Natal',
      postalCode: '4051',
      titleDeedNumber: 'ST9310/2020',
    },
    buyer: {
      name: 'Aisha Khan',
      email: 'aisha.khan.demo@bridgenine.co.za',
      phone: '+27 84 555 0172',
      ageGroup: '25-34',
    },
    seller: {
      name: 'Sipho Ndlovu',
      email: 'sipho.ndlovu.demo@bridgenine.co.za',
      phone: '+27 73 555 0168',
    },
    agent: {
      name: 'Priya Naidoo',
      email: 'priya.naidoo.demo@urbanasset.co.za',
    },
    bondOriginator: {
      name: 'BetterBond Durban Desk',
      email: 'durban.demo@betterbond.example',
    },
    lanes: [
      { laneKey: 'transfer', stageKey: finalStage('transfer'), laneStatus: 'completed', dueOffset: -2 },
      { laneKey: 'bond', stageKey: finalStage('bond'), laneStatus: 'completed', dueOffset: -2 },
      { laneKey: 'cancellation', stageKey: finalStage('cancellation'), laneStatus: 'completed', dueOffset: -2 },
    ],
    requests: [
      requestSeed('transfer', 'registration_confirmation', 'Registration Confirmation', 'attorney', 'approved', -2),
      requestSeed('transfer', 'final_account', 'Final Account', 'attorney', 'approved', -1),
      requestSeed('bond', 'bond_registration_confirmation', 'Bond Registration Confirmation', 'bond_attorney', 'approved', -2),
      requestSeed('cancellation', 'cancellation_confirmation', 'Bond Cancellation Confirmation', 'cancellation_attorney', 'approved', -2),
    ],
    documents: [
      documentSeed('transfer', 'registration_confirmation', 'Registration Confirmation - Durban North.pdf', 'transfer_documents', 'approved', true),
      documentSeed('transfer', 'final_account', 'Final Account - Khan.pdf', 'transfer_documents', 'approved', true),
      documentSeed('bond', 'bond_registration_confirmation', 'FNB Bond Registration Confirmation.pdf', 'bond_documents', 'approved', false),
      documentSeed('cancellation', 'cancellation_confirmation', 'Standard Bank Cancellation Confirmation.pdf', 'cancellation_documents', 'approved', false),
    ],
    updates: [
      updateSeed('transfer', 'registered', 'Transfer registered at the Deeds Office. Final account and registration letters issued.', 'client_visible', -2),
      updateSeed('bond', 'bond_registered', 'Bond registration confirmed with FNB and filed on the matter.', 'professional_shared', -2),
      updateSeed('cancellation', 'cancellation_complete', 'Existing Standard Bank bond cancellation completed.', 'professional_shared', -2),
      updateSeed('transfer', 'matter_closed', 'Demo completed matter ready for archive testing.', 'internal', -1),
    ],
    packets: [
      packetSeed('registration_closeout_pack', 'Registration close-out pack', 'completed'),
    ],
  },
]

function requestSeed(laneKey, documentType, title, requestedFrom, status, dueOffset = 3) {
  return { laneKey, documentType, title, requestedFrom, status, dueOffset }
}

function documentSeed(laneKey, documentType, fileName, category, status, clientVisible = false) {
  return { laneKey, documentType, fileName, category, status, clientVisible }
}

function updateSeed(laneKey, updateType, message, visibility, dayOffset) {
  return { laneKey, updateType, message, visibility, dayOffset }
}

function blockerSeed(laneKey, title, description, severity, dueOffset) {
  return { laneKey, title, description, severity, dueOffset }
}

function appointmentSeed(type, title, dayOffset, location) {
  return { type, title, dayOffset, location }
}

function packetSeed(packetType, title, status) {
  return { packetType, title, status }
}

async function fetchDefinitions() {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  })
  if (!response.ok) {
    throw new Error(`Could not fetch Supabase schema: ${response.status} ${await response.text()}`)
  }
  const spec = await response.json()
  return Object.fromEntries(
    Object.entries(spec.definitions || {}).map(([table, schema]) => [
      table,
      new Set(Object.keys(schema.properties || {})),
    ]),
  )
}

function filterRow(tableColumns, row) {
  if (!tableColumns) return row
  return Object.fromEntries(Object.entries(row).filter(([key]) => tableColumns.has(key)))
}

async function upsertRows(table, rows, definitions, options = {}) {
  const safeRows = rows.filter(Boolean).map((row) => filterRow(definitions[table], row))
  if (!safeRows.length) return 0
  const result = await supabase
    .from(table)
    .upsert(safeRows, {
      onConflict: options.onConflict || 'id',
      ignoreDuplicates: false,
    })
  if (result.error) {
    throw new Error(`${table} upsert failed: ${result.error.message}`)
  }
  return safeRows.length
}

async function fetchTargetContext() {
  const profileResult = await supabase
    .from('profiles')
    .select('*')
    .ilike('email', TARGET_EMAIL)
    .maybeSingle()
  if (profileResult.error) throw profileResult.error
  if (!profileResult.data?.id) {
    throw new Error(`No profile found for ${TARGET_EMAIL}.`)
  }

  const membershipResult = await supabase
    .from('organisation_users')
    .select('*')
    .eq('user_id', profileResult.data.id)
    .in('status', ['active', 'invited'])
    .order('created_at', { ascending: false })
    .limit(10)
  if (membershipResult.error) throw membershipResult.error

  const membership =
    (membershipResult.data || []).find((row) => normalizeText(row.workspace_type).toLowerCase() === 'attorney_firm') ||
    (membershipResult.data || [])[0]
  if (!membership?.organisation_id) {
    throw new Error(`No active organisation membership found for ${TARGET_EMAIL}.`)
  }

  const firmResult = await supabase
    .from('attorney_firms')
    .select('*')
    .or(`id.eq.${membership.organisation_id},organisation_id.eq.${membership.organisation_id}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (firmResult.error) throw firmResult.error
  if (!firmResult.data?.id) {
    throw new Error(`No attorney firm found for organisation ${membership.organisation_id}.`)
  }

  const departmentsResult = await supabase
    .from('attorney_firm_departments')
    .select('*')
    .eq('firm_id', firmResult.data.id)
  if (departmentsResult.error) throw departmentsResult.error

  return {
    profile: profileResult.data,
    membership,
    firm: firmResult.data,
    departments: departmentsResult.data || [],
  }
}

function departmentIdFor(departments, laneKey) {
  const type = laneMeta(laneKey).departmentType
  return (
    departments.find((department) => department.department_type === type)?.id ||
    departments.find((department) => department.department_type === 'management')?.id ||
    null
  )
}

function buildRows({ context }) {
  const nowIso = isoDays(0)
  const userId = context.profile.id
  const firmId = context.firm.id
  const organisationId = context.firm.organisation_id || context.membership.organisation_id || firmId
  const attorneyName = context.profile.full_name || 'Demo Attorney'
  const attorneyEmail = TARGET_EMAIL
  const rows = {
    buyers: [],
    transactions: [],
    assignments: [],
    participants: [],
    rolePlayers: [],
    subprocesses: [],
    steps: [],
    documents: [],
    requests: [],
    events: [],
    history: [],
    updates: [],
    blockers: [],
    packets: [],
    packetVersions: [],
    appointments: [],
    manifest: [],
  }

  for (const scenario of scenarios) {
    const transactionId = stableUuid(`transaction:${scenario.slug}`)
    const buyerId = stableUuid(`buyer:${scenario.slug}`)
    const transactionCreatedAt = isoDays(-90 + scenarios.indexOf(scenario) * 8, 8)
    const transactionUpdatedAt = isoDays(-Math.max(0, scenarios.indexOf(scenario)), 16)
    const documentKeys = new Set((scenario.documents || []).map((document) => `${document.laneKey}:${document.documentType}`))

    rows.buyers.push({
      id: buyerId,
      name: scenario.buyer.name,
      email: scenario.buyer.email,
      phone: scenario.buyer.phone,
      age_group: scenario.buyer.ageGroup,
      organisation_id: organisationId,
      created_at: transactionCreatedAt,
      updated_at: nowIso,
      is_demo_data: true,
      demo_metadata: { seedKey: SEED_KEY, scenario: scenario.slug, accountEmail: TARGET_EMAIL },
    })

    rows.transactions.push({
      id: transactionId,
      buyer_id: buyerId,
      stage: legacyStage(scenario),
      notes: `Seeded attorney demo transaction: ${scenario.title}`,
      created_at: transactionCreatedAt,
      updated_at: transactionUpdatedAt,
      finance_type: scenario.financeType,
      attorney: attorneyName,
      bond_originator: scenario.bondOriginator?.name || null,
      next_action: scenario.nextAction,
      risk_status: legacyRiskStatus(scenario.riskStatus),
      development_id: null,
      sales_price: money(scenario.purchasePrice),
      current_main_stage: legacyMainStage(scenario),
      current_sub_stage_summary: scenario.subStage,
      comment: 'Seeded for realistic attorney workflow testing.',
      stage_date: dateDays(-7),
      sale_date: dateDays(scenario.saleDateOffset),
      assigned_agent: scenario.agent.name,
      bank: scenario.bank || null,
      expected_transfer_date: dateDays(scenario.expectedTransferOffset),
      is_active: scenario.operationalState !== 'completed',
      purchaser_type: scenario.purchaserType,
      assigned_agent_email: scenario.agent.email,
      assigned_attorney_email: attorneyEmail,
      assigned_bond_originator_email: scenario.bondOriginator?.email || null,
      finance_managed_by: scenario.financeType === 'cash' ? 'internal' : 'bond_originator',
      purchase_price: money(scenario.purchasePrice),
      cash_amount: money(scenario.cashAmount),
      bond_amount: money(scenario.bondAmount),
      deposit_amount: money(scenario.depositAmount),
      transaction_reference: scenario.reference,
      transaction_type: scenario.transactionType,
      property_address_line_1: scenario.property.line1,
      property_address_line_2: scenario.property.line2,
      suburb: scenario.property.suburb,
      city: scenario.property.city,
      province: scenario.property.province,
      postal_code: scenario.property.postalCode,
      property_description: scenario.property.description,
      matter_owner: attorneyName,
      transaction_origin_role: 'attorney',
      transaction_origin_source: 'attorney',
      buyer_attorney_name: attorneyName,
      buyer_attorney_email: attorneyEmail,
      seller_attorney_name: attorneyName,
      seller_attorney_email: attorneyEmail,
      primary_transfer_conveyancer_name: attorneyName,
      primary_transfer_conveyancer_email: attorneyEmail,
      owner_user_id: userId,
      lifecycle_state: scenario.operationalState === 'completed' ? 'completed' : 'active',
      property_type: scenario.propertyType,
      access_level: 'shared',
      attorney_stage: legacyAttorneyStage(scenario.attorneyStage),
      operational_state: legacyOperationalState(scenario),
      waiting_on_role: scenario.operationalState === 'blocked' ? 'client' : null,
      registration_date: scenario.registrationOffset ? dateDays(scenario.registrationOffset) : null,
      title_deed_number: scenario.property.titleDeedNumber,
      registered_by_user_id: scenario.registrationOffset ? userId : null,
      registered_at: scenario.registrationOffset ? isoDays(scenario.registrationOffset, 11) : null,
      completed_by_user_id: scenario.operationalState === 'completed' ? userId : null,
      last_meaningful_activity_at: isoDays(-1, 12),
      organisation_id: organisationId,
      seller_has_existing_bond: Boolean(scenario.sellerHasExistingBond),
      current_bond_bank: scenario.currentBondBank || null,
      current_bond_account_number: scenario.currentBondAccountNumber || null,
      estimated_settlement_amount: money(scenario.estimatedSettlementAmount),
      cancellation_firm_id: scenario.sellerHasExistingBond ? firmId : null,
      is_demo_data: true,
      title: scenario.title,
      seller_name: scenario.seller.name,
      seller_email: scenario.seller.email,
      seller_phone: scenario.seller.phone,
      target_registration_date: dateDays(scenario.targetRegistrationOffset),
      buyer_name: scenario.buyer.name,
      purchaser_name: scenario.buyer.name,
      client_name: scenario.buyer.name,
      matter_number: scenario.matterNumber,
      assigned_user_id: userId,
      created_by: userId,
      assigned_organisation_id: organisationId,
      assigned_at: transactionCreatedAt,
      assignment_status: scenario.operationalState === 'completed' ? 'completed' : 'assigned',
      finance_status: scenario.financeType === 'cash' ? 'funds_secured_confirmed' : scenario.operationalState === 'completed' ? 'ready_for_transfer' : 'bank_feedback_pending',
      demo_metadata: {
        seedKey: SEED_KEY,
        scenario: scenario.slug,
        buyerEntityType: scenario.purchaserType,
        sellerEntityType: scenario.sellerEntityType,
        showcase: true,
      },
    })

    rows.events.push(
      eventRow(transactionId, 'TransactionDemoSeeded', userId, 'internal', {
        reference: scenario.reference,
        title: scenario.title,
        seedKey: SEED_KEY,
      }),
      eventRow(transactionId, 'AttorneyWorkflowSnapshotSeeded', userId, 'professional_shared', {
        mainStage: scenario.mainStage,
        subStage: scenario.subStage,
      }),
    )

    rows.participants.push(
      participantRow({ transactionId, name: scenario.buyer.name, email: scenario.buyer.email, roleType: 'buyer', legalRole: 'client', canEdit: false, isInternal: false }),
      participantRow({ transactionId, name: scenario.seller.name, email: scenario.seller.email, roleType: 'seller', legalRole: 'client', canEdit: false, isInternal: false }),
      participantRow({ transactionId, name: scenario.agent.name, email: scenario.agent.email, roleType: 'agent', legalRole: 'agent', canEdit: false, isInternal: false }),
    )

    rows.rolePlayers.push(
      rolePlayerRow({ transactionId, roleType: 'agent', name: scenario.agent.name, email: scenario.agent.email }),
    )

    if (scenario.bondOriginator?.email) {
      rows.participants.push(participantRow({ transactionId, name: scenario.bondOriginator.name, email: scenario.bondOriginator.email, roleType: 'bond_originator', legalRole: 'bond_originator', canEdit: false, isInternal: false }))
      rows.rolePlayers.push(rolePlayerRow({ transactionId, roleType: 'bond_originator', name: scenario.bondOriginator.name, email: scenario.bondOriginator.email }))
    }

    const assignmentIdsByLane = new Map()
    const subprocessIdsByLane = new Map()

    for (const lane of scenario.lanes) {
      const meta = laneMeta(lane.laneKey)
      const assignmentId = stableUuid(`assignment:${scenario.slug}:${lane.laneKey}`)
      const subprocessId = stableUuid(`subprocess:${scenario.slug}:${lane.laneKey}`)
      assignmentIdsByLane.set(lane.laneKey, assignmentId)
      subprocessIdsByLane.set(lane.laneKey, subprocessId)

      rows.assignments.push({
        id: assignmentId,
        transaction_id: transactionId,
        firm_id: firmId,
        attorney_firm_id: firmId,
        assignment_type: meta.assignmentType,
        department_id: departmentIdFor(context.departments, lane.laneKey),
        attorney_department_id: departmentIdFor(context.departments, lane.laneKey),
        primary_attorney_id: userId,
        attorney_user_id: userId,
        status: lane.laneStatus === 'completed' ? 'completed' : 'active',
        assignment_status: lane.laneStatus === 'completed' ? 'completed' : 'active',
        assigned_by: userId,
        assigned_at: transactionCreatedAt,
        created_at: transactionCreatedAt,
        updated_at: nowIso,
        attorney_role: meta.attorneyRole,
        is_primary: true,
        visibility_scope: 'firm_matter',
        can_edit: true,
        can_manage_documents: true,
        can_manage_signing: true,
        can_add_internal_notes: true,
        can_add_shared_updates: true,
        can_update_workflow_lane: true,
        is_demo_data: true,
        matter_type: scenario.transactionType,
        instruction_status: 'accepted',
        assigned_organisation_id: organisationId,
        assigned_user_id: userId,
        scope_level: 'assigned',
        scope_metadata: { seedKey: SEED_KEY, scenario: scenario.slug, laneKey: lane.laneKey },
      })

      rows.participants.push(participantRow({
        transactionId,
        userId,
        name: attorneyName,
        email: attorneyEmail,
        roleType: 'attorney',
        legalRole: meta.attorneyRole,
        organisationName: context.firm.name,
        canEdit: true,
        isInternal: true,
        laneKey: lane.laneKey,
      }))

      rows.rolePlayers.push(rolePlayerRow({
        transactionId,
        roleType: meta.attorneyRole,
        name: attorneyName,
        email: attorneyEmail,
        userId,
        organisationId,
        laneKey: lane.laneKey,
      }))

      rows.subprocesses.push({
        id: subprocessId,
        transaction_id: transactionId,
        process_type: lane.laneKey,
        owner_type: 'attorney',
        status: lane.laneStatus,
        created_at: transactionCreatedAt,
        updated_at: nowIso,
        finance_type_context: scenario.financeType,
        is_required: true,
        started_at: transactionCreatedAt,
        completed_at: lane.laneStatus === 'completed' ? isoDays(scenario.registrationOffset || -2, 12) : null,
        blocked_reason: lane.laneStatus === 'blocked' ? 'Demo blocker is active for workflow testing.' : null,
        visibility_scope: 'professional_shared',
        attorney_role: meta.attorneyRole,
        attorney_assignment_id: assignmentId,
        current_stage: lane.stageKey || firstStage(lane.laneKey),
        lane_status: lane.laneStatus,
        due_date: dateDays(lane.dueOffset),
        updated_by: userId,
        lane_metadata: {
          seedKey: SEED_KEY,
          scenario: scenario.slug,
          label: meta.label,
          currentStageLabel: getAttorneyStageLabel(lane.stageKey || firstStage(lane.laneKey), lane.laneKey),
        },
        is_demo_data: true,
      })

      rows.steps.push(...buildLaneSteps({
        subprocessId,
        laneKey: lane.laneKey,
        currentStage: lane.stageKey || firstStage(lane.laneKey),
        laneStatus: lane.laneStatus,
        updatedBy: userId,
      }))

      rows.history.push({
        id: stableUuid(`history:${scenario.slug}:${lane.laneKey}:${lane.stageKey}`),
        transaction_id: transactionId,
        subprocess_id: subprocessId,
        lane_key: lane.laneKey,
        attorney_role: meta.attorneyRole,
        previous_stage: firstStage(lane.laneKey),
        new_stage: lane.stageKey || firstStage(lane.laneKey),
        previous_status: 'not_started',
        new_status: lane.laneStatus,
        changed_by: userId,
        changed_at: isoDays(-2, 11),
        note: `${meta.label} demo workflow moved to ${getAttorneyStageLabel(lane.stageKey || firstStage(lane.laneKey), lane.laneKey)}.`,
        visibility: 'professional_shared',
        source: 'demo_seed',
        metadata: { seedKey: SEED_KEY, scenario: scenario.slug },
        is_demo_data: true,
      })
    }

    for (const request of scenario.requests || []) {
      const meta = laneMeta(request.laneKey)
      const requestId = stableUuid(`document-request:${scenario.slug}:${request.laneKey}:${request.documentType}`)
      const matchingDocumentId = stableUuid(`document:${scenario.slug}:${request.laneKey}:${request.documentType}`)
      const hasMatchingDocument = documentKeys.has(`${request.laneKey}:${request.documentType}`)
      rows.requests.push({
        id: requestId,
        transaction_id: transactionId,
        category: categoryForDocumentType(request.documentType, request.laneKey),
        document_type: request.documentType,
        title: request.title,
        description: descriptionForRequest(request),
        priority: ['rejected', 'requested'].includes(request.status) ? 'required' : 'important',
        due_date: dateDays(request.dueOffset),
        assigned_to_role: request.requestedFrom,
        status: documentRequestLifecycleStatus(request.status),
        requires_review: true,
        requested_document_id: hasMatchingDocument && ['uploaded', 'under_review', 'approved', 'completed', 'rejected'].includes(request.status) ? matchingDocumentId : null,
        created_by: userId,
        created_by_role: 'attorney',
        completed_at: ['approved', 'completed'].includes(request.status) ? isoDays(-1, 10) : null,
        rejected_reason: request.status === 'rejected' ? 'Uploaded document does not satisfy the bank condition.' : null,
        created_at: isoDays(-8, 9),
        updated_at: isoDays(-1, 14),
        lane_key: request.laneKey,
        attorney_role: meta.attorneyRole,
        requested_from: request.requestedFrom,
        requested_by: userId,
        review_status: request.status,
        requirement_id: request.documentType,
        rejection_reason: request.status === 'rejected' ? 'Please upload an updated version with the lender interest noted.' : null,
        is_demo_data: true,
        visibility_scope: ['buyer', 'seller', 'client'].includes(request.requestedFrom) ? 'client_visible' : 'professional_shared',
        request_type: 'attorney_workflow',
        notes: `Seeded request for ${scenario.reference}.`,
      })
    }

    for (const document of scenario.documents || []) {
      const meta = laneMeta(document.laneKey)
      const documentId = stableUuid(`document:${scenario.slug}:${document.laneKey}:${document.documentType}`)
      rows.documents.push({
        id: documentId,
        file_name: document.fileName,
        file_path: `demo/${SEED_KEY}/${scenario.slug}/${document.fileName.replace(/\s+/g, '-').toLowerCase()}`,
        created_at: isoDays(-6, 10),
        updated_at: isoDays(-1, 12),
        transaction_id: transactionId,
        name: document.fileName.replace(/\.[^.]+$/, ''),
        category: document.category,
        uploaded_by_role: document.clientVisible ? 'client' : 'attorney',
        uploaded_by_email: document.clientVisible ? scenario.buyer.email : attorneyEmail,
        is_client_visible: Boolean(document.clientVisible),
        uploaded_by_user_id: document.clientVisible ? null : userId,
        document_type: document.documentType,
        visibility_scope: document.clientVisible ? 'client' : 'shared',
        stage_key: scenario.attorneyStage,
        bucket_key: 'demo-attorney-documents',
        status: document.status,
        owner_role: meta.attorneyRole,
        approved_by_user_id: document.status === 'approved' ? userId : null,
        approved_at: document.status === 'approved' ? isoDays(-1, 15) : null,
        rejected_at: document.status === 'rejected' ? isoDays(-1, 15) : null,
        rejection_note: document.status === 'rejected' ? 'Demo rejection: corrected bank wording is required.' : null,
        metadata: {
          seedKey: SEED_KEY,
          scenario: scenario.slug,
          reference: scenario.reference,
        },
        lane_key: document.laneKey,
        attorney_role: meta.attorneyRole,
        review_status: document.status,
        is_demo_data: true,
        source: 'demo_seed',
        uploaded_by_party: document.clientVisible ? 'client' : 'attorney',
        file_bucket: 'documents',
        related_entity_type: 'transaction',
        related_entity_id: transactionId,
      })
    }

    for (const update of scenario.updates || []) {
      const meta = laneMeta(update.laneKey)
      rows.updates.push({
        id: stableUuid(`update:${scenario.slug}:${update.laneKey}:${update.updateType}:${update.dayOffset}`),
        transaction_id: transactionId,
        subprocess_id: subprocessIdsByLane.get(update.laneKey) || null,
        lane_key: update.laneKey,
        attorney_role: meta.attorneyRole,
        update_type: update.updateType,
        visibility: update.visibility,
        message: update.message,
        created_by: userId,
        created_at: isoDays(update.dayOffset, 12),
        client_recipients: update.visibility === 'client_visible' ? [scenario.buyer.email, scenario.seller.email] : [],
        metadata: {
          seedKey: SEED_KEY,
          scenario: scenario.slug,
          reference: scenario.reference,
        },
        is_demo_data: true,
      })
    }

    for (const blocker of scenario.blockers || []) {
      const meta = laneMeta(blocker.laneKey)
      rows.blockers.push({
        id: stableUuid(`blocker:${scenario.slug}:${blocker.laneKey}:${blocker.title}`),
        transaction_id: transactionId,
        title: blocker.title,
        description: blocker.description,
        lane_key: blocker.laneKey,
        attorney_role: meta.attorneyRole,
        severity: blocker.severity,
        owner: meta.attorneyRole,
        visibility: 'professional_shared',
        due_date: dateDays(blocker.dueOffset),
        created_by: userId,
        created_at: isoDays(-1, 9),
        metadata: { seedKey: SEED_KEY, scenario: scenario.slug },
        is_demo_data: true,
      })
    }

    for (const appointment of scenario.appointments || []) {
      rows.appointments.push({
        appointment_id: stableUuid(`appointment:${scenario.slug}:${appointment.type}`),
        organisation_id: organisationId,
        agent_id: userId,
        appointment_type: appointment.type,
        title: appointment.title,
        appointment_date: dateDays(appointment.dayOffset),
        start_time: '10:00',
        end_time: '10:45',
        date_time: isoDays(appointment.dayOffset, 8),
        location: appointment.location,
        transaction_id: transactionId,
        status: appointment.dayOffset < 0 ? 'completed' : 'confirmed',
        notes: `Seeded appointment for ${scenario.reference}.`,
        next_step: scenario.nextAction,
        created_by: userId,
        created_at: isoDays(-3, 9),
        updated_at: nowIso,
        linked_workflow: 'attorney',
        linked_transaction_stage: scenario.attorneyStage,
        visibility_scope: 'shared_role_players',
        location_type: appointment.location.toLowerCase().includes('teams') ? 'video_call' : 'physical_address',
        meeting_url: appointment.location.toLowerCase().includes('teams') ? 'https://teams.microsoft.com/l/demo-attorney-signing' : null,
        related_entity_type: 'transaction',
        related_entity_id: transactionId,
        is_demo_data: true,
        demo_metadata: { seedKey: SEED_KEY, scenario: scenario.slug },
      })
    }

    for (const packet of scenario.packets || []) {
      const packetId = stableUuid(`packet:${scenario.slug}:${packet.packetType}`)
      const versionId = stableUuid(`packet-version:${scenario.slug}:${packet.packetType}:v1`)
      rows.packets.push({
        id: packetId,
        organisation_id: organisationId,
        packet_type: packet.packetType,
        title: packet.title,
        status: packet.status,
        transaction_id: transactionId,
        unit_id: null,
        created_by: userId,
        current_version_number: 1,
        source_context_json: {
          seedKey: SEED_KEY,
          scenario: scenario.slug,
          reference: scenario.reference,
        },
        sent_at: packet.status === 'completed' ? isoDays(-7, 10) : isoDays(-1, 10),
        completed_at: packet.status === 'completed' ? isoDays(-3, 15) : null,
        created_at: isoDays(-9, 10),
        updated_at: nowIso,
      })
      rows.packetVersions.push({
        id: versionId,
        packet_id: packetId,
        organisation_id: organisationId,
        version_number: 1,
        render_status: 'generated',
        rendered_file_path: `demo/${SEED_KEY}/${scenario.slug}/${packet.packetType}.pdf`,
        rendered_file_name: `${packet.title}.pdf`,
        final_signed_file_path: packet.status === 'completed' ? `demo/${SEED_KEY}/${scenario.slug}/${packet.packetType}-signed.pdf` : null,
        final_signed_file_name: packet.status === 'completed' ? `${packet.title} - signed.pdf` : null,
        finalised_at: packet.status === 'completed' ? isoDays(-3, 15) : null,
        finalised_by: packet.status === 'completed' ? userId : null,
        placeholders_resolved_json: {
          buyer_name: scenario.buyer.name,
          seller_name: scenario.seller.name,
          purchase_price: scenario.purchasePrice,
        },
        placeholders_missing_json: [],
        validation_summary_json: { seedKey: SEED_KEY, status: 'demo_generated' },
        generated_by: userId,
        generated_at: isoDays(-9, 11),
        created_at: isoDays(-9, 11),
        updated_at: nowIso,
      })
    }
  }

  rows.manifest.push({
    id: stableUuid(`manifest:${ENVIRONMENT}:${SEED_KEY}:${TARGET_EMAIL}`),
    environment: ENVIRONMENT,
    demo_key: SEED_KEY,
    workspace_type: 'attorney_firm',
    account_role: 'attorney_firm_owner',
    account_email: TARGET_EMAIL,
    expected_records: {
      transactions: rows.transactions.length,
      workflowLanes: rows.subprocesses.length,
      workflowSteps: rows.steps.length,
      documentRequests: rows.requests.length,
      documents: rows.documents.length,
      laneUpdates: rows.updates.length,
      blockers: rows.blockers.length,
      appointments: rows.appointments.length,
      packets: rows.packets.length,
    },
    reset_notes: 'Rerun scripts/seed-attorney-demo-transactions.mjs to refresh these deterministic demo rows.',
    status: 'seeded',
    created_at: nowIso,
    updated_at: nowIso,
  })

  return rows
}

function eventRow(transactionId, eventType, userId, visibility, eventData) {
  const persistedEventType = transactionEventType(eventType)
  const persistedVisibility = transactionEventVisibility(visibility)
  return {
    id: stableUuid(`event:${transactionId}:${eventType}:${JSON.stringify(eventData)}`),
    transaction_id: transactionId,
    event_type: persistedEventType,
    event_data: { seedKey: SEED_KEY, originalEventType: eventType, originalVisibility: visibility, ...eventData },
    created_by: userId,
    created_by_role: 'attorney',
    created_at: isoDays(-1, 10),
    updated_at: isoDays(-1, 10),
    visibility_scope: persistedVisibility,
    is_demo_data: true,
  }
}

function transactionEventType(eventType = '') {
  if (eventType === 'TransactionDemoSeeded') return 'TransactionCreated'
  if (eventType === 'AttorneyWorkflowSnapshotSeeded') return 'TransactionUpdated'
  return eventType || 'TransactionUpdated'
}

function transactionEventVisibility(visibility = '') {
  if (visibility === 'professional_shared' || visibility === 'shared_role_players') return 'shared'
  if (visibility === 'client_visible') return 'client'
  return visibility || 'internal'
}

function participantRow({ transactionId, userId = null, name, email, roleType, legalRole, organisationName = '', canEdit = false, isInternal = false, laneKey = '' }) {
  const normalizedLegalRole = roleType === 'attorney'
    ? ({ transfer_attorney: 'transfer', bond_attorney: 'bond', cancellation_attorney: 'cancellation' }[legalRole] || legalRole || 'transfer')
    : 'none'
  return {
    id: stableUuid(`participant:${transactionId}:${roleType}:${legalRole}:${email}:${laneKey}`),
    transaction_id: transactionId,
    user_id: userId,
    role_type: roleType,
    participant_name: name,
    participant_email: email,
    can_view: true,
    can_comment: true,
    can_upload_documents: ['buyer', 'seller', 'attorney'].includes(roleType),
    can_edit_finance_workflow: false,
    can_edit_attorney_workflow: canEdit,
    can_edit_core_transaction: canEdit,
    created_at: isoDays(-8, 9),
    updated_at: isoDays(-1, 12),
    participant_scope: 'transaction',
    is_primary: Boolean(userId && canEdit),
    assignment_source: 'dalawyer_demo_seed',
    organisation_name: organisationName,
    can_manage_handover: canEdit,
    can_manage_snags: false,
    can_approve_documents: canEdit,
    can_view_financials: true,
    can_assign_roles: canEdit,
    legal_role: normalizedLegalRole,
    accepted_at: userId ? isoDays(-8, 9) : null,
    status: 'active',
    visibility_scope: isInternal ? 'internal' : 'shared',
    is_demo_data: true,
    transaction_role: legalRole,
    is_internal: Boolean(isInternal),
    assigned_user_id: userId,
    scope_level: userId ? 'assigned' : null,
    scope_metadata: { seedKey: SEED_KEY, laneKey },
  }
}

function rolePlayerRow({ transactionId, roleType, name, email, userId = null, organisationId = null, laneKey = '' }) {
  return {
    id: stableUuid(`role-player:${transactionId}:${roleType}:${email}:${laneKey}`),
    transaction_id: transactionId,
    role_type: roleType,
    selection_source: 'manual',
    partner_name: name,
    contact_person: name,
    email_address: email,
    snapshot_json: { seedKey: SEED_KEY, laneKey },
    is_demo_data: true,
    created_at: isoDays(-8, 9),
    updated_at: isoDays(-1, 12),
    organisation_id: organisationId,
    status: 'active',
    assignment_status: 'active',
    activation_trigger: 'manual',
    activated_at: isoDays(-8, 9),
    assigned_by: userId,
    user_id: userId,
    legal_role: roleType,
    assigned_organisation_id: organisationId,
    assigned_user_id: userId,
    scope_level: userId ? 'assigned' : null,
    scope_metadata: { seedKey: SEED_KEY, laneKey },
  }
}

function categoryForDocumentType(documentType, laneKey) {
  if (laneKey === 'bond') return 'bond_documents'
  if (laneKey === 'cancellation') return 'cancellation_documents'
  if (documentType.includes('fica') || documentType.includes('id_document') || documentType.includes('proof_of_address')) return 'fica'
  if (documentType.includes('company') || documentType.includes('trust') || documentType.includes('authority') || documentType.includes('resolution')) return 'entity_documents'
  if (documentType.includes('zoning') || documentType.includes('occupation')) return 'commercial_documents'
  if (documentType.includes('levy') || documentType.includes('rates')) return 'property_compliance'
  return 'transfer_documents'
}

function descriptionForRequest(request) {
  if (request.status === 'rejected') return `${request.title} was reviewed and a corrected upload is required.`
  if (request.status === 'approved') return `${request.title} has been received and approved.`
  if (request.status === 'uploaded' || request.status === 'under_review') return `${request.title} has been uploaded and is awaiting final review.`
  return `${request.title} is required to progress the ${laneMeta(request.laneKey).label.toLowerCase()} workflow.`
}

async function main() {
  const definitions = await fetchDefinitions()
  const context = await fetchTargetContext()
  const rows = buildRows({ context })

  const counts = {}
  counts.buyers = await upsertRows('buyers', rows.buyers, definitions)
  counts.transactions = await upsertRows('transactions', rows.transactions, definitions)
  counts.assignments = await upsertRows('transaction_attorney_assignments', rows.assignments, definitions)
  counts.participants = await upsertRows('transaction_participants', rows.participants, definitions)
  counts.rolePlayers = await upsertRows('transaction_role_players', rows.rolePlayers, definitions)
  counts.subprocesses = await upsertRows('transaction_subprocesses', rows.subprocesses, definitions)
  counts.steps = await upsertRows('transaction_subprocess_steps', rows.steps, definitions)
  counts.documents = await upsertRows('documents', rows.documents, definitions)
  counts.documentRequests = await upsertRows('document_requests', rows.requests, definitions)
  counts.events = await upsertRows('transaction_events', rows.events, definitions)
  counts.history = await upsertRows('transaction_attorney_lane_history', rows.history, definitions)
  counts.updates = await upsertRows('transaction_attorney_lane_updates', rows.updates, definitions)
  counts.blockers = await upsertRows('attorney_workflow_blockers', rows.blockers, definitions)
  counts.appointments = await upsertRows('appointments', rows.appointments, definitions, { onConflict: 'appointment_id' })
  counts.packets = await upsertRows('document_packets', rows.packets, definitions)
  counts.packetVersions = await upsertRows('document_packet_versions', rows.packetVersions, definitions)
  counts.manifest = await upsertRows('demo_seed_manifests', rows.manifest, definitions, { onConflict: 'environment,demo_key' })

  const verification = await supabase
    .from('transactions')
    .select('id, transaction_reference, title, finance_type, transaction_type, current_main_stage, risk_status')
    .eq('is_demo_data', true)
    .contains('demo_metadata', { seedKey: SEED_KEY })
    .order('transaction_reference', { ascending: true })

  if (verification.error) {
    throw new Error(`Verification query failed: ${verification.error.message}`)
  }

  console.log(JSON.stringify({
    seededAccount: TARGET_EMAIL,
    profileId: context.profile.id,
    firmId: context.firm.id,
    firmName: context.firm.name,
    seedKey: SEED_KEY,
    counts,
    transactions: verification.data || [],
  }, null, 2))
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error)
  process.exitCode = 1
})
