import {
  buildSellerOnboardingLink,
  generateId,
  generateSellerOnboardingToken,
  OFFER_STATUS,
  SELLER_ONBOARDING_STATUS,
} from './agentListingStorage'

const TARGET_EMAIL = 'alexlandman1998@gmail.com'
const SEED_VERSION = '2026-04-29-agent-demo-v1'

const KEY_META = 'itg:agent-demo-seed:meta'
const KEY_AGENT_DIRECTORY = 'itg:agent-directory:v1'
const KEY_PRIVATE_LISTINGS = 'itg:agent-private-listings:v1'
const KEY_PIPELINE = 'itg:pipeline-leads:v1'
const KEY_AGENT_DEMO_TRANSACTIONS = 'itg:agent-demo-transactions:v1'

const AGENCY = {
  id: 'agency-bridge-realty-group',
  name: 'Bridge Realty Group',
  headquarters: 'Sandton',
}

const PRINCIPALS = [
  { id: 'principal-sarah-naidoo', name: 'Sarah Naidoo', office: 'Sandton', email: 'sarah.naidoo@bridgerealtygroup.co.za', phone: '0821102201' },
  { id: 'principal-michael-vdm', name: 'Michael van der Merwe', office: 'Pretoria', email: 'michael.vdm@bridgerealtygroup.co.za', phone: '0821102202' },
]

const AGENTS = [
  { id: 'jason.mokoena@bridgerealtygroup.co.za', name: 'Jason Mokoena', email: 'jason.mokoena@bridgerealtygroup.co.za', phone: '0823301001', principalId: PRINCIPALS[1].id, office: 'Pretoria East' },
  { id: 'lerato.khumalo@bridgerealtygroup.co.za', name: 'Lerato Khumalo', email: 'lerato.khumalo@bridgerealtygroup.co.za', phone: '0823301002', principalId: PRINCIPALS[0].id, office: 'Sandton' },
  { id: 'daniel.smith@bridgerealtygroup.co.za', name: 'Daniel Smith', email: 'daniel.smith@bridgerealtygroup.co.za', phone: '0823301003', principalId: PRINCIPALS[0].id, office: 'Fourways' },
  { id: 'aisha.patel@bridgerealtygroup.co.za', name: 'Aisha Patel', email: 'aisha.patel@bridgerealtygroup.co.za', phone: '0823301004', principalId: PRINCIPALS[1].id, office: 'Midrand' },
  { id: 'chris.botha@bridgerealtygroup.co.za', name: 'Chris Botha', email: 'chris.botha@bridgerealtygroup.co.za', phone: '0823301005', principalId: PRINCIPALS[1].id, office: 'Pretoria East' },
  { id: 'thabo.ndlovu@bridgerealtygroup.co.za', name: 'Thabo Ndlovu', email: 'thabo.ndlovu@bridgerealtygroup.co.za', phone: '0823301006', principalId: PRINCIPALS[0].id, office: 'Sandton' },
  { id: 'emma.jacobs@bridgerealtygroup.co.za', name: 'Emma Jacobs', email: 'emma.jacobs@bridgerealtygroup.co.za', phone: '0823301007', principalId: PRINCIPALS[1].id, office: 'Centurion' },
  { id: 'ryan.daniels@bridgerealtygroup.co.za', name: 'Ryan Daniels', email: 'ryan.daniels@bridgerealtygroup.co.za', phone: '0823301008', principalId: PRINCIPALS[0].id, office: 'Bryanston' },
]

const DEVELOPMENTS = [
  { id: 'dev-waterfall-terraces', name: 'Waterfall Terraces', suburb: 'Midrand', city: 'Johannesburg' },
  { id: 'dev-junoah-estate', name: 'Junoah Estate', suburb: 'Pretoria East', city: 'Pretoria' },
  { id: 'dev-ridge-estate', name: 'The Ridge Estate', suburb: 'Centurion', city: 'Pretoria' },
  { id: 'dev-willow-park', name: 'Willow Park', suburb: 'Fourways', city: 'Johannesburg' },
]

const SUBURBS = [
  ['Sandton', 'Johannesburg'],
  ['Fourways', 'Johannesburg'],
  ['Midrand', 'Johannesburg'],
  ['Pretoria East', 'Pretoria'],
  ['Bryanston', 'Johannesburg'],
  ['Centurion', 'Pretoria'],
  ['Boksburg', 'Boksburg'],
]

const SOURCES = ['Property24', 'Private Property', 'Referral', 'Website']
const LEAD_STAGE_PLAN = [
  ...Array(10).fill('New Lead'),
  ...Array(10).fill('Contacted'),
  ...Array(8).fill('Viewing Scheduled'),
  ...Array(6).fill('Offer Pending'),
  ...Array(6).fill('Lost'),
]

function toIsoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function money(value) {
  return Math.max(0, Math.round(Number(value || 0)))
}

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function mapLeadStageToPipelineStatus(stage) {
  if (stage === 'Offer Pending') return 'Negotiating'
  if (stage === 'Lost') return 'Lost'
  if (stage === 'Viewing Scheduled') return 'Follow Up'
  if (stage === 'Contacted') return 'Follow Up'
  return 'Active'
}

function buildSellerDocs(index) {
  const pattern = index % 5
  return [
    { key: 'mandate_to_sell', label: 'Mandate to Sell', status: 'completed', required: true, fileName: `mandate-${index + 1}.pdf` },
    { key: 'rates_account', label: 'Rates Account (Municipal)', status: pattern === 4 ? 'uploaded' : 'approved', required: true, fileName: `rates-${index + 1}.pdf` },
    { key: 'levies_statement', label: 'Levies Statement', status: pattern === 1 ? 'pending' : pattern === 3 ? 'requested' : 'uploaded', required: false, fileName: pattern === 3 ? '' : `levies-${index + 1}.pdf` },
    { key: 'bond_statement', label: 'Bond Statement', status: pattern === 2 ? 'requested' : 'uploaded', required: false, fileName: pattern === 2 ? '' : `bond-${index + 1}.pdf` },
    { key: 'utility_bill', label: 'Utility Bill', status: pattern === 0 ? 'uploaded' : 'requested', required: false, fileName: pattern === 0 ? `utility-${index + 1}.pdf` : '' },
    { key: 'id_document', label: 'ID Document', status: 'uploaded', required: true, fileName: `id-${index + 1}.pdf` },
    { key: 'proof_of_address', label: 'Proof of Address', status: pattern === 2 ? 'requested' : 'uploaded', required: true, fileName: pattern === 2 ? '' : `address-${index + 1}.pdf` },
    { key: 'entity_documents', label: 'Company / Trust Documents', status: pattern === 4 ? 'uploaded' : 'requested', required: false, fileName: pattern === 4 ? `entity-${index + 1}.pdf` : '' },
  ]
}

function buildOfferSet(askingPrice, listingIndex) {
  if (listingIndex >= 10) return []
  const statuses = [
    OFFER_STATUS.ACCEPTED,
    OFFER_STATUS.REJECTED,
    OFFER_STATUS.PENDING,
    OFFER_STATUS.PENDING,
    OFFER_STATUS.ACCEPTED,
    OFFER_STATUS.REJECTED,
    OFFER_STATUS.PENDING,
    OFFER_STATUS.ACCEPTED,
    OFFER_STATUS.REJECTED,
    OFFER_STATUS.PENDING,
  ]
  const primary = statuses[listingIndex] || OFFER_STATUS.PENDING
  const basePrice = Number(askingPrice || 0)
  const now = new Date()
  const offers = [
    {
      id: generateId('offer'),
      buyerName: ['Megan Barnard', 'Liam Petersen', 'Aiden Naidoo', 'Naledi Mokoena'][listingIndex % 4],
      offerPrice: money(basePrice * (0.94 + (listingIndex % 3) * 0.02)),
      offerDate: new Date(now.getTime() - (listingIndex + 1) * 86400000).toISOString(),
      conditions: listingIndex % 3 === 0 ? 'Cash' : 'Subject to bond approval',
      agentNotes: 'Offer captured via agent portal.',
      expiryDate: new Date(now.getTime() + (6 + listingIndex) * 86400000).toISOString(),
      status: primary,
    },
  ]
  if (listingIndex % 2 === 0) {
    offers.push({
      id: generateId('offer'),
      buyerName: ['Tumi Molefe', 'Chris Steyn', 'Farah Moosa'][listingIndex % 3],
      offerPrice: money(basePrice * 0.92),
      offerDate: new Date(now.getTime() - (listingIndex + 3) * 86400000).toISOString(),
      conditions: 'Subject to bond approval',
      agentNotes: 'Counter offer expected.',
      expiryDate: new Date(now.getTime() + (4 + listingIndex) * 86400000).toISOString(),
      status: OFFER_STATUS.PENDING,
    })
  }
  return offers
}

function buildPrivateListings() {
  const sellerNames = [
    'Anika Vermeulen', 'Sipho Dlamini', 'Karen Peters', 'Brandon Jacobs', 'Nadine Swart',
    'Thulani Sithole', 'Melissa du Toit', 'Gareth Naidoo', 'Nokuthula Zuma', 'Evan Botha',
    'Jenna Williams', 'Andre Venter', 'Lindiwe Khosa', 'Ruan Steyn',
  ]
  const onboardingStatuses = [
    ...Array(8).fill(SELLER_ONBOARDING_STATUS.COMPLETED),
    ...Array(4).fill(SELLER_ONBOARDING_STATUS.IN_PROGRESS),
    ...Array(2).fill(SELLER_ONBOARDING_STATUS.NOT_STARTED),
  ]

  return sellerNames.map((sellerName, index) => {
    const [suburb, city] = SUBURBS[index % SUBURBS.length]
    const agent = AGENTS[index % AGENTS.length]
    const askingPrice = money(950000 + index * 170000 + (index % 3) * 120000)
    const token = generateSellerOnboardingToken()
    const status = onboardingStatuses[index]
    const submittedAt = status === SELLER_ONBOARDING_STATUS.NOT_STARTED ? null : toIsoDaysAgo(12 - (index % 6))
    return {
      id: generateId('listing'),
      createdAt: toIsoDaysAgo(28 - index),
      listingTitle: `${2 + (index % 4)} Bedroom ${index % 3 === 0 ? 'House' : 'Apartment'} - ${suburb}`,
      propertyType: index % 3 === 0 ? 'House' : 'Apartment',
      suburb,
      city,
      askingPrice,
      mandateType: index % 4 === 0 ? 'open' : 'sole',
      mandateStartDate: toIsoDaysAgo(36 - index).slice(0, 10),
      mandateEndDate: toIsoDaysAgo(-(40 + index)).slice(0, 10),
      seller: {
        name: sellerName,
        email: `${sellerName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        phone: `08255${String(1400 + index).padStart(4, '0')}`,
        ownershipType: index % 5 === 0 ? 'company' : 'individual',
      },
      commission: {
        commission_type: 'percentage',
        commission_percentage: 5,
        commission_amount: 0,
        commission_notes: 'Standard sole mandate commission.',
        agent_id: agent.id,
        agency_id: AGENCY.id,
        principal_id: agent.principalId,
      },
      sellerOnboarding: {
        token,
        link: buildSellerOnboardingLink(token),
        status,
        startedAt: submittedAt,
        submittedAt,
        completedAt: status === SELLER_ONBOARDING_STATUS.COMPLETED ? submittedAt : null,
        currentStep: status === SELLER_ONBOARDING_STATUS.NOT_STARTED ? 0 : status === SELLER_ONBOARDING_STATUS.IN_PROGRESS ? 4 : 7,
        formData: {
          fullName: sellerName,
          email: `${sellerName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
          phone: `08255${String(1400 + index).padStart(4, '0')}`,
          ownershipType: index % 5 === 0 ? 'company' : 'individual',
          propertyAddress: `${10 + index} ${suburb} Street, ${suburb}`,
          askingPrice: String(askingPrice),
          mandateAcknowledged: status !== SELLER_ONBOARDING_STATUS.NOT_STARTED,
        },
      },
      offers: buildOfferSet(askingPrice, index),
      marketing: {
        source: SOURCES[index % SOURCES.length],
        mediaUrl: '',
        notes: 'Seeded demo listing.',
      },
      ownership: {
        ratesAccountNumber: `RATES-${10000 + index}`,
        leviesAccountNumber: `LEV-${20000 + index}`,
      },
      requiredDocuments: buildSellerDocs(index),
    }
  })
}

function buildPipelineLeads(privateListings) {
  const leadNames = [
    'Tshepo Radebe', 'Amelia Kruger', 'Nqobile Mthembu', 'Reece Joubert', 'Ayanda Mokoena', 'Hannah Adams',
    'Mpho Maseko', 'Kyle Pretorius', 'Lebo Nene', 'Shane Donald', 'Claire Daniels', 'Kagiso Moeketsi',
  ]
  return LEAD_STAGE_PLAN.map((journeyStage, index) => {
    const listing = privateListings[index % privateListings.length]
    const agent = AGENTS[index % AGENTS.length]
    const budget = money(700000 + (index % 12) * 280000 + (index % 4) * 95000)
    return {
      id: generateId('lead'),
      name: `${leadNames[index % leadNames.length]} ${String.fromCharCode(65 + (index % 18))}`,
      phone: `08344${String(1800 + index).padStart(4, '0')}`,
      email: `lead${index + 1}@example.com`,
      developmentId: index % 3 === 0 ? DEVELOPMENTS[index % DEVELOPMENTS.length].id : '',
      developmentName: index % 3 === 0 ? DEVELOPMENTS[index % DEVELOPMENTS.length].name : 'Private Sale Book',
      unitId: listing.id,
      unitNumber: listing.listingTitle,
      source: SOURCES[index % SOURCES.length],
      status: mapLeadStageToPipelineStatus(journeyStage),
      journeyStage,
      budget,
      financeType: index % 10 < 7 ? 'bond' : 'cash',
      assignedAgent: agent.name,
      agent_id: agent.id,
      nextFollowUpDate: toIsoDaysAgo(-(2 + (index % 8))).slice(0, 10),
      notes: 'Demo lead seeded for pipeline visualization.',
      createdAt: toIsoDaysAgo(22 - (index % 19)),
    }
  })
}

function createTransactionRow({
  transactionId,
  transactionReference,
  transactionType,
  development,
  unitNumber,
  price,
  buyerName,
  buyerEmail,
  buyerPhone,
  financeType,
  stage,
  mainStage,
  agent,
  daysAgoCreated,
  daysAgoUpdated,
  marketingSource,
  lifecycleState = 'active',
  onboardingStatus = 'submitted',
  uploadedCount = 4,
  totalRequired = 6,
  commissionEarned = 34000,
}) {
  const developmentId = transactionType === 'development' ? development.id : null
  const unitId = `${transactionType === 'development' ? 'dev' : 'priv'}-unit-${unitNumber}-${transactionId}`
  return {
    unit: {
      id: unitId,
      development_id: developmentId,
      unit_number: unitNumber,
      price,
      list_price: money(price * 1.03),
      status: stage,
      created_at: toIsoDaysAgo(daysAgoCreated),
      updated_at: toIsoDaysAgo(daysAgoUpdated),
    },
    development:
      transactionType === 'development'
        ? {
            id: development.id,
            name: development.name,
            location: development.suburb,
          }
        : null,
    transaction: {
      id: transactionId,
      transaction_reference: transactionReference,
      transaction_type: transactionType,
      development_id: developmentId,
      unit_id: unitId,
      buyer_id: `buyer-${transactionId}`,
      sales_price: price,
      purchase_price: price,
      finance_type: financeType,
      purchaser_type: 'individual',
      stage,
      current_main_stage: mainStage,
      current_sub_stage_summary: mainStage === 'FIN' ? 'Finance pack in progress.' : '',
      next_action: mainStage === 'REG' ? 'Registered and payout completed.' : 'Follow up and progress to next stage.',
      comment: 'Seeded agent deal for demo.',
      marketing_source: marketingSource,
      assigned_agent: agent.name,
      assigned_agent_email: agent.email,
      attorney: 'Bridge Conveyancing',
      assigned_attorney_email: 'transfers@bridgeconveyancing.co.za',
      bank: financeType === 'cash' ? 'N/A' : ['Standard Bank', 'FNB', 'ABSA', 'Nedbank'][price % 4],
      lifecycle_state: lifecycleState,
      is_active: lifecycleState !== 'cancelled',
      commission_earned: commissionEarned,
      updated_at: toIsoDaysAgo(daysAgoUpdated),
      created_at: toIsoDaysAgo(daysAgoCreated),
    },
    buyer: {
      id: `buyer-${transactionId}`,
      name: buyerName,
      phone: buyerPhone,
      email: buyerEmail,
      gender: transactionId.charCodeAt(0) % 2 ? 'female' : 'male',
      age_group: ['25-34', '35-44', '45-54'][transactionId.length % 3],
    },
    stage,
    mainStage,
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

function buildDemoTransactions() {
  const buyers = [
    'Megan Barnard', 'Liam Petersen', 'Naledi Mokoena', 'Chris Steyn', 'Farah Moosa', 'Aiden Naidoo',
    'Zanele Dlamini', 'Kobus Venter', 'Mia Jacobs', 'Karabo Nhlapo', 'Ruan Smit', 'Lisa Kruger',
    'Palesa Mokoena', 'Gareth Meyer', 'Tumi Maseko', 'Nadine du Plessis', 'Bokang Motaung', 'Leah Daniels',
    'Ethan Pretorius', 'Lerato Mthethwa',
  ]

  const blueprint = [
    { type: 'private', stage: 'Reserved', main: 'DEP', finance: 'bond', lifecycle: 'active', price: 1850000, agent: 0 },
    { type: 'private', stage: 'OTP Signed', main: 'OTP', finance: 'bond', lifecycle: 'active', price: 2140000, agent: 0 },
    { type: 'private', stage: 'Finance Pending', main: 'FIN', finance: 'bond', lifecycle: 'active', price: 2460000, agent: 0 },
    { type: 'private', stage: 'Proceed to Attorneys', main: 'ATTY', finance: 'cash', lifecycle: 'active', price: 1980000, agent: 0 },
    { type: 'private', stage: 'Transfer in Progress', main: 'XFER', finance: 'bond', lifecycle: 'active', price: 2750000, agent: 0 },
    { type: 'development', stage: 'Transfer Lodged', main: 'XFER', finance: 'cash', lifecycle: 'active', price: 3380000, agent: 0 },
    { type: 'private', stage: 'Reserved', main: 'DEP', finance: 'bond', lifecycle: 'active', price: 1620000, agent: 1 },
    { type: 'private', stage: 'Finance Pending', main: 'FIN', finance: 'bond', lifecycle: 'active', price: 2410000, agent: 1 },
    { type: 'development', stage: 'Proceed to Attorneys', main: 'ATTY', finance: 'cash', lifecycle: 'active', price: 3490000, agent: 1 },
    { type: 'private', stage: 'OTP Signed', main: 'OTP', finance: 'bond', lifecycle: 'active', price: 2290000, agent: 1 },
    { type: 'development', stage: 'Bond Approved / Proof of Funds', main: 'FIN', finance: 'bond', lifecycle: 'active', price: 3970000, agent: 2 },
    { type: 'private', stage: 'Reserved', main: 'DEP', finance: 'cash', lifecycle: 'active', price: 1760000, agent: 2 },
    { type: 'development', stage: 'Registered', main: 'REG', finance: 'bond', lifecycle: 'registered', price: 4120000, agent: 2 },
    { type: 'development', stage: 'Registered', main: 'REG', finance: 'bond', lifecycle: 'registered', price: 3650000, agent: 3 },
    { type: 'private', stage: 'Registered', main: 'REG', finance: 'bond', lifecycle: 'registered', price: 2080000, agent: 3 },
    { type: 'private', stage: 'Registered', main: 'REG', finance: 'cash', lifecycle: 'registered', price: 1890000, agent: 4 },
    { type: 'development', stage: 'Registered', main: 'REG', finance: 'bond', lifecycle: 'registered', price: 4280000, agent: 4 },
    { type: 'private', stage: 'Registered', main: 'REG', finance: 'cash', lifecycle: 'registered', price: 1710000, agent: 5 },
    { type: 'private', stage: 'Registered', main: 'REG', finance: 'bond', lifecycle: 'registered', price: 2230000, agent: 6 },
    { type: 'private', stage: 'Registered', main: 'REG', finance: 'cash', lifecycle: 'cancelled', price: 1540000, agent: 3 },
  ]

  return blueprint.map((item, index) => {
    const agent = AGENTS[item.agent]
    const development = DEVELOPMENTS[index % DEVELOPMENTS.length]
    const [suburb, city] = SUBURBS[index % SUBURBS.length]
    const row = createTransactionRow({
      transactionId: `seed-agent-deal-${index + 1}`,
      transactionReference: `AG-${3000 + index}`,
      transactionType: item.type,
      development,
      unitNumber: item.type === 'development' ? `D${101 + index}` : `P${401 + index}`,
      price: item.price,
      buyerName: buyers[index % buyers.length],
      buyerEmail: `buyer${index + 1}@example.com`,
      buyerPhone: `08277${String(2200 + index).padStart(4, '0')}`,
      financeType: item.finance,
      stage: item.stage,
      mainStage: item.main,
      agent,
      daysAgoCreated: 65 - index * 2,
      daysAgoUpdated: 15 - (index % 8),
      marketingSource: SOURCES[index % SOURCES.length],
      lifecycleState: item.lifecycle,
      onboardingStatus: index % 5 === 0 ? 'in_progress' : 'submitted',
      uploadedCount: 3 + (index % 4),
      totalRequired: 6 + (index % 3),
      commissionEarned: 26000 + (index % 5) * 7000,
    })
    if (item.type === 'private') {
      row.transaction.property_address_line_1 = `${40 + index} ${suburb} Avenue`
      row.transaction.suburb = suburb
      row.transaction.city = city
      row.transaction.province = 'Gauteng'
      row.transaction.postal_code = '2000'
      row.transaction.property_description = 'Private sale listing'
    }
    return row
  })
}

function buildAgentDirectory() {
  return {
    agency: AGENCY,
    principals: PRINCIPALS,
    agents: AGENTS.map((agent) => ({
      ...agent,
      status: 'active',
      agencyId: AGENCY.id,
    })),
  }
}

export function shouldSeedAgentDemo(profileEmail = '') {
  return String(profileEmail || '').trim().toLowerCase() === TARGET_EMAIL
}

export function ensureAgentModuleDemoSeed({ profileEmail = '' } = {}) {
  if (typeof window === 'undefined') return false
  if (!shouldSeedAgentDemo(profileEmail)) return false

  const meta = readJson(KEY_META, null)
  if (meta?.version === SEED_VERSION) {
    const hasDirectory = Boolean(readJson(KEY_AGENT_DIRECTORY, null)?.agents?.length)
    const hasListings = Array.isArray(readJson(KEY_PRIVATE_LISTINGS, [])) && readJson(KEY_PRIVATE_LISTINGS, []).length > 0
    const hasPipeline = Array.isArray(readJson(KEY_PIPELINE, [])) && readJson(KEY_PIPELINE, []).length > 0
    const hasTransactions =
      Array.isArray(readJson(KEY_AGENT_DEMO_TRANSACTIONS, [])) && readJson(KEY_AGENT_DEMO_TRANSACTIONS, []).length > 0
    if (hasDirectory && hasListings && hasPipeline && hasTransactions) {
      return false
    }
  }

  const privateListings = buildPrivateListings()
  const pipelineLeads = buildPipelineLeads(privateListings)
  const transactionRows = buildDemoTransactions()
  const directory = buildAgentDirectory()

  writeJson(KEY_AGENT_DIRECTORY, directory)
  writeJson(KEY_PRIVATE_LISTINGS, privateListings)
  writeJson(KEY_PIPELINE, pipelineLeads)
  writeJson(KEY_AGENT_DEMO_TRANSACTIONS, transactionRows)
  writeJson(KEY_META, {
    version: SEED_VERSION,
    email: String(profileEmail || '').trim().toLowerCase(),
    seededAt: new Date().toISOString(),
  })
  return true
}

export function getAgentDemoTransactionRowsFromStorage() {
  const rows = readJson(KEY_AGENT_DEMO_TRANSACTIONS, [])
  return Array.isArray(rows) ? rows : []
}
