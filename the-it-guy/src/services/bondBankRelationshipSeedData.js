import {
  BANK_AGREEMENT_STATUSES,
  BANK_COMMISSION_BASES,
  BANK_SUPPORTED_PRODUCTS,
  BOND_ORIGINATOR_BANK_STATUSES,
  slugifyBank,
} from './bondOriginatorBankService'

export const BOND_BANK_RELATIONSHIP_SEED_NOW = '2026-06-06T09:30:00.000Z'
export const BOND_BANK_RELATIONSHIP_SEED_BANK_IDS = Object.freeze(['absa', 'fnb', 'nedbank', 'standard-bank'])

const REGIONS = Object.freeze([
  { id: 'gauteng', name: 'Gauteng' },
  { id: 'western-cape', name: 'Western Cape' },
  { id: 'kzn', name: 'KZN' },
  { id: 'eastern-cape', name: 'Eastern Cape' },
  { id: 'free-state', name: 'Free State' },
  { id: 'limpopo', name: 'Limpopo' },
  { id: 'mpumalanga', name: 'Mpumalanga' },
  { id: 'north-west', name: 'North West' },
  { id: 'northern-cape', name: 'Northern Cape' },
])

const BRANCHES = Object.freeze([
  { id: 'sandton', name: 'Sandton', regionId: 'gauteng', regionName: 'Gauteng' },
  { id: 'centurion', name: 'Centurion', regionId: 'gauteng', regionName: 'Gauteng' },
  { id: 'pretoria-east', name: 'Pretoria East', regionId: 'gauteng', regionName: 'Gauteng' },
  { id: 'cape-town-atlantic', name: 'Cape Town Atlantic', regionId: 'western-cape', regionName: 'Western Cape' },
  { id: 'durban-north', name: 'Durban North', regionId: 'kzn', regionName: 'KZN' },
  { id: 'gqeberha', name: 'Gqeberha', regionId: 'eastern-cape', regionName: 'Eastern Cape' },
  { id: 'bloemfontein', name: 'Bloemfontein', regionId: 'free-state', regionName: 'Free State' },
  { id: 'polokwane', name: 'Polokwane', regionId: 'limpopo', regionName: 'Limpopo' },
  { id: 'mbombela', name: 'Mbombela', regionId: 'mpumalanga', regionName: 'Mpumalanga' },
  { id: 'rustenburg', name: 'Rustenburg', regionId: 'north-west', regionName: 'North West' },
  { id: 'kimberley', name: 'Kimberley', regionId: 'northern-cape', regionName: 'Northern Cape' },
])

const CONSULTANTS = Object.freeze([
  { id: 'alex-van-der-merwe', name: 'Alex van der Merwe', branchId: 'sandton', regionId: 'gauteng' },
  { id: 'rachel-adams', name: 'Rachel Adams', branchId: 'pretoria-east', regionId: 'gauteng' },
  { id: 'emma-roberts', name: 'Emma Roberts', branchId: 'centurion', regionId: 'gauteng' },
  { id: 'siphokazi-dlamini', name: 'Siphokazi Dlamini', branchId: 'cape-town-atlantic', regionId: 'western-cape' },
  { id: 'naledi-maseko', name: 'Naledi Maseko', branchId: 'durban-north', regionId: 'kzn' },
  { id: 'priya-patel', name: 'Priya Patel', branchId: 'gqeberha', regionId: 'eastern-cape' },
])

const BANK_PANEL = Object.freeze([
  {
    bankId: 'fnb',
    bankName: 'FNB',
    shortName: 'FNB',
    primaryContactName: 'Thabo Mkhize',
    primaryContactEmail: 'thabo.mkhize@fnb.example',
    primaryContactPhone: '+27 11 555 0101',
    submissionEmail: 'home-loans-submissions@fnb.example',
    portalUrl: 'https://bankpanel.example/fnb',
    slaDays: 2,
    slaOwner: 'Mia Naidoo',
    relationshipOwner: 'Mia Naidoo',
    slaEscalationHours: 48,
    agreementReference: 'FNB-OOB-2026',
    agreementReviewDate: '2026-09-18',
    nextReviewDate: '2026-09-18',
    commissionRate: 0.48,
    regionsSupported: ['Gauteng', 'Western Cape', 'KZN', 'Eastern Cape', 'Free State'],
    notes: 'Preferred routing partner for high-confidence salaried applications and fast instruction conversion.',
  },
  {
    bankId: 'absa',
    bankName: 'ABSA',
    shortName: 'ABSA',
    primaryContactName: 'Lauren Jacobs',
    primaryContactEmail: 'lauren.jacobs@absa.example',
    primaryContactPhone: '+27 11 555 0102',
    submissionEmail: 'originator-panel@absa.example',
    portalUrl: 'https://bankpanel.example/absa',
    slaDays: 3,
    slaOwner: 'Jordan Pillay',
    relationshipOwner: 'Jordan Pillay',
    slaEscalationHours: 60,
    agreementReference: 'ABSA-OOB-2026',
    agreementReviewDate: '2026-10-06',
    nextReviewDate: '2026-10-06',
    commissionRate: 0.44,
    regionsSupported: ['Gauteng', 'Western Cape', 'KZN', 'North West'],
    notes: 'Strong service levels and stable approval quality. Good growth candidate in coastal branches.',
  },
  {
    bankId: 'nedbank',
    bankName: 'Nedbank',
    shortName: 'Nedbank',
    primaryContactName: 'Johan van Zyl',
    primaryContactEmail: 'johan.vanzyl@nedbank.example',
    primaryContactPhone: '+27 11 555 0103',
    submissionEmail: 'bond-originators@nedbank.example',
    portalUrl: 'https://bankpanel.example/nedbank',
    slaDays: 3,
    slaOwner: 'Bianca Pretorius',
    relationshipOwner: 'Bianca Pretorius',
    slaEscalationHours: 72,
    agreementReference: 'NED-OOB-2026',
    agreementReviewDate: '2026-08-28',
    nextReviewDate: '2026-08-28',
    commissionRate: 0.42,
    regionsSupported: ['Gauteng', 'Western Cape', 'Eastern Cape', 'Limpopo', 'Mpumalanga'],
    notes: 'Underutilised relationship with improving conversion in salaried and switch bond applications.',
  },
  {
    bankId: 'standard-bank',
    bankName: 'Standard Bank',
    shortName: 'Standard Bank',
    primaryContactName: 'Sipho Dlamini',
    primaryContactEmail: 'sipho.dlamini@standardbank.example',
    primaryContactPhone: '+27 11 555 0104',
    submissionEmail: 'originator-submissions@standardbank.example',
    portalUrl: 'https://bankpanel.example/standard-bank',
    slaDays: 3,
    slaOwner: 'Carla Botha',
    relationshipOwner: 'Carla Botha',
    slaEscalationHours: 72,
    agreementReference: 'STD-OOB-2026',
    agreementReviewDate: '2026-07-22',
    nextReviewDate: '2026-07-22',
    commissionRate: 0.4,
    regionsSupported: ['Gauteng', 'Western Cape', 'KZN', 'Free State', 'Northern Cape'],
    notes: 'Commercially important relationship currently needing SLA attention and escalation follow-up.',
  },
])

const BANK_APPLICATION_MODELS = Object.freeze([
  { bankId: 'fnb', bankName: 'FNB', count: 34, approvals: 28, instructions: 23, declines: 3, responseHours: 38, bondBase: 2250000 },
  { bankId: 'absa', bankName: 'ABSA', count: 29, approvals: 23, instructions: 18, declines: 3, responseHours: 31, bondBase: 2050000 },
  { bankId: 'nedbank', bankName: 'Nedbank', count: 24, approvals: 17, instructions: 12, declines: 4, responseHours: 58, bondBase: 1850000 },
  { bankId: 'standard-bank', bankName: 'Standard Bank', count: 19, approvals: 11, instructions: 7, declines: 5, responseHours: 88, bondBase: 2150000 },
])

function dateDaysAgo(days = 0, hour = 9) {
  const date = new Date(BOND_BANK_RELATIONSHIP_SEED_NOW)
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

function addHours(isoDate = '', hours = 0) {
  const date = new Date(isoDate)
  date.setHours(date.getHours() + Number(hours || 0))
  return date.toISOString()
}

function panelRow(row = {}, workspaceId = 'default') {
  return {
    id: `seed-panel-${row.bankId}`,
    originatorOrgId: workspaceId,
    bankId: row.bankId,
    status: BOND_ORIGINATOR_BANK_STATUSES.active,
    agreementStatus: BANK_AGREEMENT_STATUSES.active,
    agreementType: 'Originator Panel Agreement',
    agreementStartDate: '2026-01-15',
    commissionBasis: BANK_COMMISSION_BASES.bankCommissionReceived,
    commissionTrigger: 'Instruction issued',
    commissionNotes: 'Seeded demo commission model. Replace with contracted commercial terms when configured.',
    supportedProducts: [...BANK_SUPPORTED_PRODUCTS],
    createdAt: '2026-01-15T08:00:00.000Z',
    updatedAt: BOND_BANK_RELATIONSHIP_SEED_NOW,
    ...row,
  }
}

function branchAt(index = 0) {
  return BRANCHES[index % BRANCHES.length]
}

function consultantAt(index = 0) {
  return CONSULTANTS[index % CONSULTANTS.length]
}

function applicationStatus(model = {}, index = 0) {
  if (index < model.instructions) return 'Submitted Approved Instruction Issued'
  if (index < model.approvals) return 'Submitted Approved Bank Feedback Received'
  if (index < model.approvals + model.declines) return 'Submitted Declined Bank Feedback Received'
  return 'Submitted Credit Review Bank Feedback Received'
}

function applicationDeclineReason(index = 0) {
  return ['Affordability', 'Credit Profile', 'Risk Policy', 'Documentation', 'LTV'][index % 5]
}

function buildApplications(workspaceId = 'default') {
  return BANK_APPLICATION_MODELS.flatMap((model, bankIndex) => (
    Array.from({ length: model.count }, (_, index) => {
      const sequence = bankIndex * 100 + index + 1
      const branch = branchAt(index + bankIndex * 2)
      const consultant = consultantAt(index + bankIndex)
      const status = applicationStatus(model, index)
      const monthOffset = index % 12
      const dayOffset = monthOffset * 28 + Math.floor(index / 12) * 6 + bankIndex + 2
      const submittedAt = dateDaysAgo(dayOffset, 8 + (index % 4))
      const responseHours = Math.max(18, model.responseHours + ((index % 5) - 2) * 5 + bankIndex * 2)
      const bankFeedbackAt = addHours(submittedAt, responseHours)
      const approvedAt = status.includes('Approved') ? addHours(bankFeedbackAt, 18 + (index % 3) * 8) : ''
      const instructionIssuedAt = status.includes('Instruction') ? addHours(approvedAt || bankFeedbackAt, 30 + (index % 4) * 10) : ''
      const bondAmount = model.bondBase + index * 85000 + bankIndex * 125000

      return {
        id: `seed-bank-app-${sequence}`,
        applicationId: `seed-bank-app-${sequence}`,
        applicationReference: `BRG-BOND-${String(sequence).padStart(4, '0')}`,
        originatorOrgId: workspaceId,
        bank: model.bankName,
        bankId: model.bankId,
        bankName: model.bankName,
        banksSubmittedTo: [model.bankName],
        status,
        financeStatus: status,
        bankStatus: status,
        declineReason: status.includes('Declined') ? applicationDeclineReason(index) : '',
        createdAt: dateDaysAgo(dayOffset + 2, 9),
        submittedAt,
        bankSubmittedAt: submittedAt,
        bankFeedbackAt,
        respondedAt: bankFeedbackAt,
        approvedAt,
        instructionIssuedAt,
        updatedAt: instructionIssuedAt || approvedAt || bankFeedbackAt,
        branchId: branch.id,
        branchName: branch.name,
        regionId: branch.regionId,
        regionName: branch.regionName,
        assignedBranchId: branch.id,
        assignedRegionId: branch.regionId,
        consultantId: consultant.id,
        consultantName: consultant.name,
        assignedConsultantId: consultant.id,
        bondAmount,
        loanAmount: bondAmount,
        grossBondAmount: bondAmount,
        propertyValue: Math.round(bondAmount * 1.18),
        buyerName: `Seed Buyer ${sequence}`,
      }
    })
  ))
}

function buildContacts(workspaceId = 'default') {
  return BANK_PANEL.flatMap((bank, bankIndex) => ([
    {
      id: `seed-contact-${bank.bankId}-primary`,
      organisationId: workspaceId,
      bankId: bank.bankId,
      name: bank.primaryContactName,
      role: 'Primary Relationship Contact',
      email: bank.primaryContactEmail,
      phone: bank.primaryContactPhone,
      region: 'National',
      notes: 'Primary contact for relationship reviews, SLA concerns and executive follow-ups.',
      createdAt: '2026-01-15T08:00:00.000Z',
      updatedAt: BOND_BANK_RELATIONSHIP_SEED_NOW,
    },
    {
      id: `seed-contact-${bank.bankId}-service`,
      organisationId: workspaceId,
      bankId: bank.bankId,
      name: ['Nomsa Khumalo', 'Andre Botha', 'Lerato Molefe', 'Deon Smit'][bankIndex],
      role: 'Service Desk Lead',
      email: `service.${bank.bankId}@bankpanel.example`,
      phone: `+27 11 555 02${String(bankIndex + 1).padStart(2, '0')}`,
      region: bank.regionsSupported[0] || 'National',
      notes: 'Operational contact for delayed responses and document clarifications.',
      createdAt: '2026-01-15T08:00:00.000Z',
      updatedAt: BOND_BANK_RELATIONSHIP_SEED_NOW,
    },
  ]))
}

function buildEscalations(workspaceId = 'default') {
  return [
    ['standard-bank', 'seed-bank-app-304', 'SLA breach on credit decision', 'Slow Responses', 'High', 'open', 3, 'pretoria-east', 'gauteng', 'rachel-adams'],
    ['standard-bank', 'seed-bank-app-309', 'Missing feedback after document resubmission', 'Documentation', 'Medium', 'in_progress', 7, 'durban-north', 'kzn', 'naledi-maseko'],
    ['standard-bank', 'seed-bank-app-314', 'Escalated valuation clarification outstanding', 'Valuation', 'Medium', 'open', 11, 'sandton', 'gauteng', 'alex-van-der-merwe'],
    ['nedbank', 'seed-bank-app-206', 'Manual affordability review delayed', 'Credit Review', 'Medium', 'in_progress', 5, 'cape-town-atlantic', 'western-cape', 'siphokazi-dlamini'],
    ['absa', 'seed-bank-app-113', 'Resolved submission portal duplication', 'Portal', 'Low', 'resolved', 22, 'centurion', 'gauteng', 'emma-roberts'],
    ['fnb', 'seed-bank-app-21', 'Resolved proof-of-income query', 'Documentation', 'Low', 'resolved', 18, 'sandton', 'gauteng', 'alex-van-der-merwe'],
  ].map(([bankId, applicationId, issue, issueType, priority, status, age, branchId, regionId, consultantId], index) => ({
    id: `seed-escalation-${index + 1}`,
    organisationId: workspaceId,
    bankId,
    applicationId,
    consultantId,
    consultantName: CONSULTANTS.find((row) => row.id === consultantId)?.name || 'Consultant',
    branchId,
    regionId,
    issue,
    issueType,
    priority,
    status,
    createdBy: 'seed-hq',
    createdAt: dateDaysAgo(age, 10),
    resolvedAt: status === 'resolved' ? dateDaysAgo(Math.max(1, age - 3), 14) : '',
  }))
}

function buildFeedback(workspaceId = 'default') {
  return [
    ['fnb', 'Positive Experience', 'positive', 'FNB responded quickly and converted high-quality salaried files into instructions.', 'alex-van-der-merwe', 'sandton', 'gauteng', 6],
    ['absa', 'Relationship Feedback', 'positive', 'ABSA service levels are steady and the Cape Town team wants to send more business.', 'siphokazi-dlamini', 'cape-town-atlantic', 'western-cape', 8],
    ['nedbank', 'Growth Opportunity', 'positive', 'Nedbank approval quality is improving but application volume remains underweight.', 'emma-roberts', 'centurion', 'gauteng', 10],
    ['standard-bank', 'Negative Experience', 'negative', 'Standard Bank has unresolved SLA delays that require HQ relationship follow-up.', 'rachel-adams', 'pretoria-east', 'gauteng', 2],
  ].map(([bankId, feedbackType, sentiment, message, consultantId, branchId, regionId, age], index) => ({
    id: `seed-bank-feedback-${index + 1}`,
    organisationId: workspaceId,
    bankId,
    feedbackType,
    sentiment,
    message,
    consultantId,
    consultantName: CONSULTANTS.find((row) => row.id === consultantId)?.name || 'Consultant',
    branchId,
    regionId,
    createdBy: consultantId,
    createdAt: dateDaysAgo(age, 12),
  }))
}

export function isBondBankRelationshipSeedBank(bankId = '') {
  return BOND_BANK_RELATIONSHIP_SEED_BANK_IDS.includes(slugifyBank(bankId))
}

export function getBondBankRelationshipSeedData(workspaceId = 'default') {
  const safeWorkspaceId = workspaceId || 'default'
  return {
    workspaceId: safeWorkspaceId,
    originatorBanks: BANK_PANEL.map((row) => panelRow(row, safeWorkspaceId)),
    applications: buildApplications(safeWorkspaceId),
    regions: [...REGIONS],
    branches: [...BRANCHES],
    consultants: [...CONSULTANTS],
    contacts: buildContacts(safeWorkspaceId),
    escalations: buildEscalations(safeWorkspaceId),
    feedback: buildFeedback(safeWorkspaceId),
    platformRevenuePerBond: 45000,
    bankResponseTargetHours: 72,
    now: BOND_BANK_RELATIONSHIP_SEED_NOW,
  }
}
