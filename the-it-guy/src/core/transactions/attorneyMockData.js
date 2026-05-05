import { MOCK_DATA_ENABLED } from '../../lib/mockData'
import { getAgentDemoTransactionRowsFromStorage } from '../../lib/agentDemoSeed'
import { getDerivedAgentTransactionRowsFromListings } from '../../lib/agentDataService'

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

const MOCK_DEVELOPMENTS = {
  'mock-dev-junoah': {
    id: 'mock-dev-junoah',
    name: 'Junoah Estate',
    location: 'Pretoria East',
    suburb: 'Pretoria East',
    city: 'Pretoria',
    province: 'Gauteng',
    country: 'South Africa',
    status: 'planning',
    address: '214 Garsfontein Road, Pretoria East',
    description: 'Mixed residential development with repeated transfer matters and attorney oversight across multiple units.',
    totalUnits: 19,
    attorneyFirmName: 'Bridge Conveyancing',
    contactName: 'Brendan Dlamini',
    contactEmail: 'brendan@bridgeconveyancing.co.za',
    contactPhone: '+27 82 555 1180',
  },
  'mock-dev-ridge': {
    id: 'mock-dev-ridge',
    name: 'The Ridge',
    location: 'Midstream',
    suburb: 'Midstream',
    city: 'Centurion',
    province: 'Gauteng',
    country: 'South Africa',
    status: 'active',
    address: '8 Heritage Boulevard, Midstream',
    description: 'Sectional title development with steady bond-driven file flow and repeat document follow-up.',
    totalUnits: 24,
    attorneyFirmName: 'Bridge Conveyancing',
    contactName: 'Nadia Pretorius',
    contactEmail: 'nadia@bridgeconveyancing.co.za',
    contactPhone: '+27 82 555 4421',
  },
  'mock-dev-harbour': {
    id: 'mock-dev-harbour',
    name: 'Harbour View',
    location: 'Umhlanga',
    suburb: 'Umhlanga',
    city: 'Durban',
    province: 'KwaZulu-Natal',
    country: 'South Africa',
    status: 'active',
    address: '51 Lagoon Drive, Umhlanga',
    description: 'Coastal development with a smaller but higher-value matter book.',
    totalUnits: 12,
    attorneyFirmName: 'Bridge Conveyancing',
    contactName: 'Marius Botha',
    contactEmail: 'marius@bridgeconveyancing.co.za',
    contactPhone: '+27 82 555 7722',
  },
}

const MOCK_DEVELOPMENT_DOCUMENTS = {
  'mock-dev-junoah': [
    {
      id: 'mock-doc-junoah-floorplan-a',
      documentType: 'floorplan',
      title: 'Unit Type A Floorplan',
      description: 'Standard two-bedroom floorplan pack for Junoah Estate.',
      fileUrl: 'Bridge internal asset / Junoah Estate / Type A Floorplan',
      linkedUnitType: 'type_a',
    },
    {
      id: 'mock-doc-junoah-site',
      documentType: 'site_plan',
      title: 'Site Layout Plan',
      description: 'Latest approved site layout and unit positioning plan.',
      fileUrl: 'Bridge internal asset / Junoah Estate / Site Layout',
      linkedUnitType: null,
    },
    {
      id: 'mock-doc-junoah-legal',
      documentType: 'legal',
      title: 'Development Mandate',
      description: 'Signed development conveyancing mandate and fee schedule.',
      fileUrl: 'Bridge internal asset / Junoah Estate / Mandate',
      linkedUnitType: null,
    },
  ],
  'mock-dev-ridge': [
    {
      id: 'mock-doc-ridge-floorplan-b',
      documentType: 'floorplan',
      title: 'Type B Floorplan',
      description: 'Standard unit floorplan used for bond and sales pack circulation.',
      fileUrl: 'Bridge internal asset / The Ridge / Type B Floorplan',
      linkedUnitType: 'type_b',
    },
    {
      id: 'mock-doc-ridge-pricing',
      documentType: 'pricing',
      title: 'Current Pricing Sheet',
      description: 'Current list price and stock schedule distributed to the legal team.',
      fileUrl: 'Bridge internal asset / The Ridge / Pricing Sheet',
      linkedUnitType: null,
    },
  ],
  'mock-dev-harbour': [
    {
      id: 'mock-doc-harbour-marketing',
      documentType: 'marketing',
      title: 'Project Brochure',
      description: 'High-level marketing brochure used for purchaser communication.',
      fileUrl: 'Bridge internal asset / Harbour View / Brochure',
      linkedUnitType: null,
    },
    {
      id: 'mock-doc-harbour-spec',
      documentType: 'specification',
      title: 'Finishes Schedule',
      description: 'Project finishes and specification schedule for units.',
      fileUrl: 'Bridge internal asset / Harbour View / Finishes Schedule',
      linkedUnitType: null,
    },
  ],
}

function createMatterRow({
  transactionId,
  transactionReference,
  transactionType,
  developmentId = null,
  developmentName = null,
  developmentLocation = null,
  unitId = null,
  unitNumber = null,
  unitStatus = 'Reserved',
  unitPrice = 0,
  buyerId,
  buyerName,
  buyerPhone,
  buyerEmail,
  financeType = 'cash',
  stage,
  currentMainStage,
  nextAction,
  comment,
  createdAt,
  updatedAt,
  propertyAddressLine1 = null,
  propertyAddressLine2 = null,
  suburb = null,
  city = null,
  province = null,
  postalCode = null,
  propertyDescription = null,
  marketingSource = null,
  assignedAgent = null,
  attorney = 'Bridge Conveyancing',
  bank = null,
  expectedTransferDate = null,
  uploadedCount = 0,
  totalRequired = 0,
  onboardingStatus = 'submitted',
}) {
  const development =
    developmentId && developmentName
      ? {
          id: developmentId,
          name: developmentName,
          location: developmentLocation || 'Location pending',
        }
      : null

  return {
    unit: unitId
      ? {
          id: unitId,
          development_id: developmentId,
          unit_number: unitNumber,
          price: unitPrice,
          list_price: unitPrice,
          status: unitStatus,
          created_at: createdAt,
          updated_at: updatedAt,
        }
      : null,
    development,
    transaction: {
      id: transactionId,
      transaction_reference: transactionReference,
      transaction_type: transactionType,
      development_id: developmentId,
      unit_id: unitId,
      buyer_id: buyerId,
      property_address_line_1: propertyAddressLine1,
      property_address_line_2: propertyAddressLine2,
      suburb,
      city,
      province,
      postal_code: postalCode,
      property_description: propertyDescription,
      matter_owner: 'Attorney Desk A',
      sales_price: unitPrice,
      purchase_price: unitPrice,
      finance_type: financeType,
      purchaser_type: 'individual',
      finance_managed_by: financeType === 'bond' ? 'bank' : null,
      stage,
      current_main_stage: currentMainStage,
      next_action: nextAction,
      comment,
      marketing_source: marketingSource,
      assigned_agent: assignedAgent,
      bank,
      attorney,
      assigned_attorney_email: 'team@bridgeconveyancing.co.za',
      expected_transfer_date: expectedTransferDate,
      is_active: true,
      updated_at: updatedAt,
      created_at: createdAt,
    },
    buyer: {
      id: buyerId,
      name: buyerName,
      phone: buyerPhone,
      email: buyerEmail,
    },
    stage,
    mainStage: currentMainStage,
    onboarding: {
      status: onboardingStatus,
    },
    documentSummary: {
      uploadedCount,
      totalRequired,
      missingCount: Math.max(totalRequired - uploadedCount, 0),
    },
  }
}

export const ATTORNEY_MOCK_ROWS = [
  createMatterRow({
    transactionId: 'mock-trx-junoah-12',
    transactionReference: 'MAT-2041',
    transactionType: 'development',
    developmentId: 'mock-dev-junoah',
    developmentName: 'Junoah Estate',
    developmentLocation: 'Pretoria East',
    unitId: 'mock-unit-junoah-12',
    unitNumber: '12',
    unitStatus: 'Reserved',
    unitPrice: 2215000,
    buyerId: 'mock-buyer-megan',
    buyerName: 'Megan Barnard',
    buyerPhone: '+27 82 400 1200',
    buyerEmail: 'megan@example.com',
    financeType: 'cash',
    stage: 'Reserved',
    currentMainStage: 'OTP',
    nextAction: 'Confirm outstanding FICA delivery',
    comment: 'Buyer confirmed FICA documents will be uploaded this afternoon.',
    createdAt: isoDaysAgo(5),
    updatedAt: isoHoursAgo(1),
    marketingSource: 'Development',
    uploadedCount: 2,
    totalRequired: 5,
  }),
  createMatterRow({
    transactionId: 'mock-trx-junoah-7',
    transactionReference: 'MAT-1660',
    transactionType: 'development',
    developmentId: 'mock-dev-junoah',
    developmentName: 'Junoah Estate',
    developmentLocation: 'Pretoria East',
    unitId: 'mock-unit-junoah-7',
    unitNumber: '7',
    unitStatus: 'Proceed to Attorneys',
    unitPrice: 2380000,
    buyerId: 'mock-buyer-marius',
    buyerName: 'Marius Botha',
    buyerPhone: '+27 82 400 7700',
    buyerEmail: 'marius@example.com',
    financeType: 'bond',
    stage: 'Proceed to Attorneys',
    currentMainStage: 'ATTY',
    nextAction: 'Follow up on municipal clearance response',
    comment: 'Municipal clearance request submitted and now awaiting response.',
    createdAt: isoDaysAgo(19),
    updatedAt: isoHoursAgo(7),
    marketingSource: 'Development',
    uploadedCount: 7,
    totalRequired: 8,
  }),
  createMatterRow({
    transactionId: 'mock-trx-ridge-a04',
    transactionReference: 'MAT-1988',
    transactionType: 'development',
    developmentId: 'mock-dev-ridge',
    developmentName: 'The Ridge',
    developmentLocation: 'Midstream',
    unitId: 'mock-unit-ridge-a04',
    unitNumber: 'A04',
    unitStatus: 'Bond Approved / Proceed',
    unitPrice: 2450000,
    buyerId: 'mock-buyer-arian',
    buyerName: 'Arian Moosa',
    buyerPhone: '+27 82 400 9800',
    buyerEmail: 'arian@example.com',
    financeType: 'bond',
    stage: 'Bond Approved / Proceed',
    currentMainStage: 'FIN',
    nextAction: 'Review final guarantee wording before issue',
    comment: 'Bank requested final guarantee wording review before issue.',
    createdAt: isoDaysAgo(12),
    updatedAt: isoHoursAgo(42 / 60),
    assignedAgent: 'Legacy Estates',
    marketingSource: 'Agent',
    uploadedCount: 6,
    totalRequired: 6,
  }),
  createMatterRow({
    transactionId: 'mock-trx-harbour-18',
    transactionReference: 'MAT-1552',
    transactionType: 'development',
    developmentId: 'mock-dev-harbour',
    developmentName: 'Harbour View',
    developmentLocation: 'Umhlanga',
    unitId: 'mock-unit-harbour-18',
    unitNumber: '18',
    unitStatus: 'Proceed to Attorneys',
    unitPrice: 3185000,
    buyerId: 'mock-buyer-lerato',
    buyerName: 'Lerato Dlamini',
    buyerPhone: '+27 82 400 8800',
    buyerEmail: 'lerato@example.com',
    financeType: 'combination',
    stage: 'Proceed to Attorneys',
    currentMainStage: 'ATTY',
    nextAction: 'Send file for final lodgement review',
    comment: 'All documents received and file prepared for lodgement review.',
    createdAt: isoDaysAgo(24),
    updatedAt: isoHoursAgo(11),
    marketingSource: 'Development',
    uploadedCount: 8,
    totalRequired: 8,
  }),
  createMatterRow({
    transactionId: 'mock-trx-private-green',
    transactionReference: 'MAT-2401',
    transactionType: 'private',
    buyerId: 'mock-buyer-sarah',
    buyerName: 'Sarah James',
    buyerPhone: '+27 82 500 1122',
    buyerEmail: 'sarah@example.com',
    financeType: 'cash',
    stage: 'Available',
    currentMainStage: 'NEW',
    nextAction: 'Issue initial instruction pack and FICA checklist',
    comment: 'New private transfer instruction received from seller mandate.',
    createdAt: isoDaysAgo(2),
    updatedAt: isoHoursAgo(6),
    propertyAddressLine1: '12 Green Street',
    suburb: 'Pretoria East',
    city: 'Pretoria',
    province: 'Gauteng',
    postalCode: '0081',
    propertyDescription: 'Freehold residential transfer',
    marketingSource: 'Private Seller',
    unitPrice: 1895000,
    uploadedCount: 1,
    totalRequired: 5,
  }),
  createMatterRow({
    transactionId: 'mock-trx-private-aloe',
    transactionReference: 'MAT-2214',
    transactionType: 'private',
    buyerId: 'mock-buyer-pieter',
    buyerName: 'Pieter Smit',
    buyerPhone: '+27 82 500 3311',
    buyerEmail: 'pieter@example.com',
    financeType: 'bond',
    stage: 'OTP Signed',
    currentMainStage: 'OTP',
    nextAction: 'Confirm signing appointment and finalise seller signatures',
    comment: 'Buyer has signed. Seller signing outstanding for tomorrow morning.',
    createdAt: isoDaysAgo(8),
    updatedAt: isoHoursAgo(15),
    propertyAddressLine1: '18 Aloe Crescent',
    suburb: 'Centurion',
    city: 'Centurion',
    province: 'Gauteng',
    postalCode: '0157',
    propertyDescription: 'Private sectional title transfer',
    marketingSource: 'Private Seller',
    unitPrice: 2140000,
    uploadedCount: 5,
    totalRequired: 7,
  }),
  createMatterRow({
    transactionId: 'mock-trx-private-beach',
    transactionReference: 'MAT-1764',
    transactionType: 'private',
    buyerId: 'mock-buyer-nadia',
    buyerName: 'Nadia Khan',
    buyerPhone: '+27 82 500 7744',
    buyerEmail: 'nadia@example.com',
    financeType: 'cash',
    stage: 'Transfer Lodged',
    currentMainStage: 'XFER',
    nextAction: 'Track Deeds Office progress and prepare registration handover',
    comment: 'Matter lodged at deeds office and awaiting registration turn.',
    createdAt: isoDaysAgo(21),
    updatedAt: isoDaysAgo(1),
    propertyAddressLine1: '7 Beach Lane',
    suburb: 'Umhlanga',
    city: 'Durban',
    province: 'KwaZulu-Natal',
    postalCode: '4319',
    propertyDescription: 'Private coastal transfer',
    marketingSource: 'Private Seller',
    unitPrice: 3420000,
    uploadedCount: 6,
    totalRequired: 6,
  }),
  createMatterRow({
    transactionId: 'mock-trx-private-jacaranda',
    transactionReference: 'MAT-1508',
    transactionType: 'private',
    buyerId: 'mock-buyer-khumo',
    buyerName: 'Khumo Maseko',
    buyerPhone: '+27 82 500 9182',
    buyerEmail: 'khumo@example.com',
    financeType: 'bond',
    stage: 'Registered',
    currentMainStage: 'REG',
    nextAction: 'Issue final close-out statement and archive file',
    comment: 'Registration completed and payment confirmation received.',
    createdAt: isoDaysAgo(36),
    updatedAt: isoDaysAgo(2),
    propertyAddressLine1: '44 Jacaranda Drive',
    suburb: 'Bryanston',
    city: 'Johannesburg',
    province: 'Gauteng',
    postalCode: '2191',
    propertyDescription: 'Standalone private transfer',
    marketingSource: 'Other',
    unitPrice: 2890000,
    uploadedCount: 7,
    totalRequired: 7,
  }),
]

function cloneMatterRow(row, overrides = {}) {
  return {
    ...row,
    ...overrides,
    unit: row?.unit ? { ...row.unit, ...(overrides.unit || {}) } : null,
    development: row?.development ? { ...row.development, ...(overrides.development || {}) } : null,
    transaction: row?.transaction ? { ...row.transaction, ...(overrides.transaction || {}) } : null,
    buyer: row?.buyer ? { ...row.buyer, ...(overrides.buyer || {}) } : null,
    onboarding: {
      ...(row?.onboarding || {}),
      ...(overrides.onboarding || {}),
    },
    documentSummary: {
      ...(row?.documentSummary || {}),
      ...(overrides.documentSummary || {}),
    },
  }
}

const AGENT_MOCK_ROWS = [
  cloneMatterRow(ATTORNEY_MOCK_ROWS[0], {
    onboarding: { status: 'in_progress' },
    transaction: {
      assigned_agent: 'Alexander Landman',
      next_action: 'Follow up with buyer to finish onboarding details.',
      comment: 'Buyer started the form but still needs to complete identity and address information.',
    },
  }),
  cloneMatterRow(ATTORNEY_MOCK_ROWS[1], {
    onboarding: { status: 'submitted' },
    transaction: {
      assigned_agent: 'Alexander Landman',
      next_action: 'Prepare OTP pack and confirm reservation proof.',
      comment: 'Reservation is secured and the deal is ready for the OTP pack.',
    },
    documentSummary: {
      uploadedCount: 7,
      totalRequired: 8,
      missingCount: 1,
    },
  }),
  cloneMatterRow(ATTORNEY_MOCK_ROWS[2], {
    onboarding: { status: 'submitted' },
    transaction: {
      assigned_agent: 'Alexander Landman',
      next_action: 'Hand off to attorneys after final FICA check.',
      comment: 'Supporting docs are in and the matter is almost ready for legal handoff.',
    },
    documentSummary: {
      uploadedCount: 6,
      totalRequired: 6,
      missingCount: 0,
    },
  }),
]

const BOND_MOCK_ROWS = [
  cloneMatterRow(ATTORNEY_MOCK_ROWS[1], {
    transaction: {
      bank: 'Nedbank',
      next_action: 'Awaiting payslips and bank statements before submission to bank.',
      comment: 'Finance pack is almost complete. Final income support is still outstanding.',
    },
    documentSummary: {
      uploadedCount: 5,
      totalRequired: 8,
      missingCount: 3,
    },
  }),
  cloneMatterRow(ATTORNEY_MOCK_ROWS[2], {
    transaction: {
      bank: 'Absa',
      next_action: 'Application lodged with bank and currently under credit review.',
      comment: 'Bank confirmed receipt and underwriting review is underway.',
    },
    documentSummary: {
      uploadedCount: 8,
      totalRequired: 8,
      missingCount: 0,
    },
  }),
  cloneMatterRow(ATTORNEY_MOCK_ROWS[7], {
    transaction: {
      bank: 'Standard Bank',
      next_action: 'Bond approved at 10.75% and waiting for final grant signature.',
      comment: 'Approval issued. Client needs to sign the grant before attorney handoff.',
    },
    documentSummary: {
      uploadedCount: 7,
      totalRequired: 7,
      missingCount: 0,
    },
  }),
]

const MOCK_EXTRA_UNITS = {
  'mock-dev-junoah': [
    { id: 'mock-unit-junoah-3', unit_number: '3', status: 'Available', price: 2050000 },
    { id: 'mock-unit-junoah-15', unit_number: '15', status: 'Registered', price: 2520000 },
  ],
  'mock-dev-ridge': [
    { id: 'mock-unit-ridge-b02', unit_number: 'B02', status: 'Reserved', price: 2310000 },
  ],
  'mock-dev-harbour': [
    { id: 'mock-unit-harbour-6', unit_number: '6', status: 'Available', price: 2980000 },
  ],
}

function isPrivateMatter(row) {
  const type = String(row?.transaction?.transaction_type || '').toLowerCase()
  return type === 'private' || type === 'private_property' || (!row?.development?.id && !row?.unit?.id)
}

function buildMockSubprocess(processType, ownerType, transactionId, steps) {
  const completedSteps = steps.filter((step) => step.status === 'completed').length
  const waitingStep = steps.find((step) => step.status !== 'completed') || null

  return {
    id: `mock-${transactionId}-${processType}`,
    transaction_id: transactionId,
    process_type: processType,
    owner_type: ownerType,
    status: waitingStep ? waitingStep.status : 'completed',
    steps: steps.map((step, index) => ({
      id: `mock-${transactionId}-${processType}-step-${index + 1}`,
      subprocess_id: `mock-${transactionId}-${processType}`,
      step_key: step.key,
      step_label: step.label,
      status: step.status,
      completed_at: step.completedAt || null,
      comment: step.comment || '',
      owner_type: ownerType,
      sort_order: index + 1,
    })),
    summary: {
      totalSteps: steps.length,
      completedSteps,
      completionPercent: steps.length ? Math.round((completedSteps / steps.length) * 100) : 0,
      waitingStep,
      lastCompletedStep: [...steps].reverse().find((step) => step.status === 'completed') || null,
      summaryText: waitingStep?.comment || waitingStep?.label || 'Workflow complete',
    },
  }
}

function mergeDemoRows(liveRows = [], demoRows = [], { minRows = demoRows.length } = {}) {
  const normalizedLiveRows = Array.isArray(liveRows) ? liveRows.filter(Boolean) : []
  if (!MOCK_DATA_ENABLED) {
    return normalizedLiveRows
  }
  const merged = [...demoRows]
  const seenIds = new Set(demoRows.map((row) => row?.transaction?.id).filter(Boolean))

  for (const row of normalizedLiveRows) {
    const transactionId = row?.transaction?.id
    if (transactionId && seenIds.has(transactionId)) continue
    merged.push(row)
    if (transactionId) {
      seenIds.add(transactionId)
    }
  }

  if (merged.length < minRows) {
    for (const row of ATTORNEY_MOCK_ROWS) {
      const transactionId = row?.transaction?.id
      if (!transactionId || seenIds.has(transactionId)) continue
      merged.push(row)
      seenIds.add(transactionId)
      if (merged.length >= minRows) break
    }
  }

  return merged
}

function buildMockSubprocesses(row) {
  return [
    buildMockSubprocess('attorney', 'attorney', row.transaction.id, [
      {
        key: 'instruction_received',
        label: 'Instruction Received',
        status: 'completed',
        completedAt: row.transaction.created_at,
        comment: 'Matter opened and initial instruction recorded.',
      },
      {
        key: 'fica_review',
        label: 'FICA / Compliance Review',
        status: row.documentSummary?.uploadedCount ? 'completed' : 'in_progress',
        completedAt: row.documentSummary?.uploadedCount ? row.transaction.updated_at : null,
        comment: row.documentSummary?.uploadedCount ? 'Initial compliance pack received.' : 'Awaiting compliance documents.',
      },
      {
        key: 'transfer_preparation',
        label: 'Transfer Preparation',
        status: ['ATTY', 'XFER', 'REG'].includes(row.mainStage) ? 'in_progress' : 'not_started',
        comment: row.transaction.next_action || 'Prepare file for transfer workflow.',
      },
      {
        key: 'lodgement',
        label: 'Lodgement',
        status: row.mainStage === 'XFER' ? 'in_progress' : row.mainStage === 'REG' ? 'completed' : 'not_started',
        completedAt: row.mainStage === 'REG' ? row.transaction.updated_at : null,
        comment: row.mainStage === 'XFER' ? 'Matter currently lodged.' : '',
      },
      {
        key: 'registration',
        label: 'Registration',
        status: row.mainStage === 'REG' ? 'completed' : 'not_started',
        completedAt: row.mainStage === 'REG' ? row.transaction.updated_at : null,
        comment: row.mainStage === 'REG' ? 'Matter registered.' : '',
      },
    ]),
    buildMockSubprocess('finance', 'bond_originator', row.transaction.id, [
      {
        key: 'application',
        label: 'Bond / Finance Application',
        status: row.transaction.finance_type === 'cash' ? 'completed' : ['OTP', 'FIN', 'ATTY', 'XFER', 'REG'].includes(row.mainStage) ? 'completed' : 'not_started',
        completedAt: ['OTP', 'FIN', 'ATTY', 'XFER', 'REG'].includes(row.mainStage) ? row.transaction.updated_at : null,
        comment: row.transaction.finance_type === 'cash' ? 'Cash purchase - no finance lane required.' : 'Initial finance application prepared.',
      },
      {
        key: 'approval',
        label: 'Approval / Proof of Funds',
        status:
          row.transaction.finance_type === 'cash'
            ? 'completed'
            : ['FIN', 'ATTY', 'XFER', 'REG'].includes(row.mainStage)
              ? 'completed'
              : row.mainStage === 'OTP'
                ? 'in_progress'
                : 'not_started',
        completedAt: ['FIN', 'ATTY', 'XFER', 'REG'].includes(row.mainStage) ? row.transaction.updated_at : null,
        comment: row.transaction.next_action || 'Waiting for final finance confirmation.',
      },
    ]),
  ]
}

export function buildAttorneyDemoRows(rows = [], { ensurePrivate = true, ensureDevelopment = true, minRows = 8 } = {}) {
  const liveRows = Array.isArray(rows) ? rows.filter(Boolean) : []
  if (!MOCK_DATA_ENABLED) {
    return liveRows
  }
  const prioritizedDemoRows = ATTORNEY_MOCK_ROWS.filter((row) => !isPrivateMatter(row)).slice(0, 3)
  const merged = [...prioritizedDemoRows]
  const seenIds = new Set(prioritizedDemoRows.map((row) => row?.transaction?.id).filter(Boolean))
  const hasPrivate = liveRows.some((row) => isPrivateMatter(row))
  const hasDevelopment = liveRows.some((row) => !isPrivateMatter(row))

  for (const row of liveRows) {
    const transactionId = row?.transaction?.id
    if (transactionId && seenIds.has(transactionId)) continue
    merged.push(row)
    if (transactionId) {
      seenIds.add(transactionId)
    }
  }

  const candidates = ATTORNEY_MOCK_ROWS.filter((row) => {
    if (seenIds.has(row.transaction.id)) return false
    if (ensurePrivate && !hasPrivate && isPrivateMatter(row)) return true
    if (ensureDevelopment && !hasDevelopment && !isPrivateMatter(row)) return true
    return false
  })

  for (const row of candidates) {
    merged.push(row)
    seenIds.add(row.transaction.id)
  }

  if (merged.length < minRows) {
    for (const row of ATTORNEY_MOCK_ROWS) {
      if (seenIds.has(row.transaction.id)) continue
      merged.push(row)
      seenIds.add(row.transaction.id)
      if (merged.length >= minRows) break
    }
  }

  return merged
}

export function buildAgentDemoRows(rows = [], { minRows = 6, profile = null, scope = 'agent' } = {}) {
  const seededRows = getAgentDemoTransactionRowsFromStorage()
  const derivedRows = getDerivedAgentTransactionRowsFromListings({ profile, scope })
  const seeded = Array.isArray(seededRows) ? seededRows.filter((row) => row?.transaction?.id) : []
  const derived = Array.isArray(derivedRows) ? derivedRows.filter((row) => row?.transaction?.id) : []
  const localRows = [...seeded, ...derived]
  const demoRows = localRows.length ? [...localRows, ...AGENT_MOCK_ROWS] : AGENT_MOCK_ROWS

  if (!MOCK_DATA_ENABLED && !localRows.length) {
    return Array.isArray(rows) ? rows.filter(Boolean) : []
  }

  if (!MOCK_DATA_ENABLED) {
    return mergeDemoRows(rows, localRows, { minRows: Math.max(minRows, localRows.length || minRows) })
  }

  return mergeDemoRows(rows, demoRows, { minRows: Math.max(minRows, localRows.length || minRows) })
}

export function buildBondDemoRows(rows = [], { minRows = 6 } = {}) {
  return mergeDemoRows(rows, BOND_MOCK_ROWS, { minRows })
}

export function getAttorneyMockRowsForDevelopment(developmentId) {
  if (!MOCK_DATA_ENABLED) {
    return []
  }
  return ATTORNEY_MOCK_ROWS.filter((row) => row?.development?.id === developmentId)
}

export function getAttorneyMockDevelopmentDetail(developmentId) {
  if (!MOCK_DATA_ENABLED) return null
  const development = MOCK_DEVELOPMENTS[developmentId]
  if (!development) return null

  const matterRows = getAttorneyMockRowsForDevelopment(developmentId)
  const extraRows = (MOCK_EXTRA_UNITS[developmentId] || []).map((unit) => ({
    unit: {
      ...unit,
      development_id: developmentId,
      list_price: unit.price,
      created_at: isoDaysAgo(40),
      updated_at: isoDaysAgo(3),
    },
    development: {
      id: development.id,
      name: development.name,
      location: development.location,
    },
    transaction: null,
    buyer: null,
    stage: unit.status,
    mainStage: 'NEW',
    documentSummary: {
      uploadedCount: 0,
      totalRequired: 0,
      missingCount: 0,
    },
  }))

  return {
    development: {
      id: development.id,
      name: development.name,
      location: development.location,
      suburb: development.suburb,
      city: development.city,
      province: development.province,
      country: development.country,
      description: development.description,
      status: development.status,
      total_units_expected: development.totalUnits,
      handover_enabled: true,
      snag_tracking_enabled: true,
      alterations_enabled: false,
      onboarding_enabled: true,
    },
    profile: {
      location: development.location,
      suburb: development.suburb,
      city: development.city,
      province: development.province,
      country: development.country,
      status: development.status,
      address: development.address,
      description: development.description,
    },
    financials: {
      landCost: 0,
      buildCost: 0,
      professionalFees: 0,
      marketingCost: 0,
      infrastructureCost: 0,
      otherCosts: 0,
      totalProjectedCost: 0,
      projectedGrossSalesValue: 0,
      projectedProfit: 0,
      targetMargin: 0,
      notes: '',
    },
    documents: MOCK_DEVELOPMENT_DOCUMENTS[developmentId] || [],
    attorneyConfig: {
      attorneyFirmName: development.attorneyFirmName,
      contactName: development.contactName,
      contactEmail: development.contactEmail,
      contactPhone: development.contactPhone,
    },
    bondConfig: {
      originatorCompanyName: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
    },
    rows: [...matterRows, ...extraRows],
    stats: {
      totalUnits: development.totalUnits,
    },
    settings: {},
  }
}

export function getAttorneyMockTransactionDetail(transactionId) {
  if (!MOCK_DATA_ENABLED) return null
  const row = ATTORNEY_MOCK_ROWS.find((item) => item?.transaction?.id === transactionId)
  if (!row) return null

  const totalRequired = Number(row.documentSummary?.totalRequired || 0)
  const uploadedCount = Number(row.documentSummary?.uploadedCount || 0)
  const requiredDocumentChecklist = Array.from({ length: Math.max(totalRequired, 1) }, (_, index) => ({
    id: `${row.transaction.id}-required-${index + 1}`,
    label: `Required document ${index + 1}`,
    complete: index < uploadedCount,
  }))

  const documents = Array.from({ length: uploadedCount }, (_, index) => ({
    id: `${row.transaction.id}-document-${index + 1}`,
    transaction_id: row.transaction.id,
    name:
      index === 0
        ? 'Signed OTP'
        : index === 1
          ? 'FICA Pack'
          : index === 2
            ? 'Guarantee Letter'
            : `Supporting Document ${index + 1}`,
    category:
      index === 0
        ? 'Agreement'
        : index === 1
          ? 'Compliance'
          : index === 2
            ? 'Finance'
            : 'General',
    created_at: row.transaction.updated_at || row.transaction.created_at,
    file_url: '#',
  }))

  const transactionDiscussion = [
    {
      id: `${row.transaction.id}-comment-1`,
      authorName: 'Bridge Conveyancing',
      authorRole: 'attorney',
      authorRoleLabel: 'Attorney / Conveyancer',
      discussionType: 'operational',
      commentBody: row.transaction.comment || row.transaction.next_action || 'Matter update logged.',
      createdAt: row.transaction.updated_at || row.transaction.created_at,
    },
  ]

  const transactionEvents = [
    {
      id: `${row.transaction.id}-event-1`,
      event_type: 'stage_update',
      title: `${row.stage} recorded`,
      body: row.transaction.next_action || 'Matter updated.',
      created_at: row.transaction.updated_at || row.transaction.created_at,
    },
  ]

  return {
    transaction: row.transaction,
    unit: row.unit
      ? {
          ...row.unit,
          development: row.development || null,
        }
      : null,
    development: row.development,
    buyer: row.buyer,
    stage: row.stage,
    mainStage: row.mainStage,
    subprocesses: buildMockSubprocesses(row),
    transactionSubprocesses: buildMockSubprocesses(row),
    financeSummary: null,
    attorneySummary: null,
    latestDiscussion: transactionDiscussion[0],
    latestStatusComment: row.transaction.comment || row.transaction.next_action || '',
    nextStep: row.transaction.next_action || 'No next action set.',
    updatedAt: row.transaction.updated_at || row.transaction.created_at || null,
    documents,
    clientPortalLinks: [],
    clientIssues: [],
    alterationRequests: [],
    serviceReviews: [],
    trustInvestmentForm: null,
    handover: null,
    onboarding: null,
    onboardingFormData: null,
    purchaserType: 'individual',
    purchaserTypeLabel: 'Individual',
    transactionRequiredDocuments: [],
    transactionParticipants: [],
    activeViewerRole: 'attorney',
    activeViewerPermissions: {
      canEditCoreTransaction: true,
      canEditFinanceWorkflow: false,
      canEditAttorneyWorkflow: true,
      canComment: true,
      canUploadDocuments: true,
      canManageExternalLinks: false,
      canViewReports: true,
    },
    transactionStatusLink: null,
    developmentSettings: {},
    requiredDocumentChecklist,
    documentSummary: {
      uploadedCount,
      totalRequired,
      missingCount: Math.max(totalRequired - uploadedCount, 0),
    },
    transactionDiscussion,
    transactionEvents,
  }
}

export function getAttorneyMockTransactionDetailByUnitId(unitId) {
  if (!MOCK_DATA_ENABLED) return null
  const row = ATTORNEY_MOCK_ROWS.find((item) => item?.unit?.id === unitId)
  if (!row?.transaction?.id) return null
  return getAttorneyMockTransactionDetail(row.transaction.id)
}
