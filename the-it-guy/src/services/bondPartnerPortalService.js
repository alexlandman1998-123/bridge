import { BOND_PARTNER_TYPES } from './bondPartnerManagementService'
import { DEV_BYPASS_WORKSPACE_IDS } from '../lib/demoIds'

export const BOND_PARTNER_PORTAL_EVENTS = Object.freeze({
  login: 'PARTNER_LOGIN',
  documentUploaded: 'PARTNER_DOCUMENT_UPLOADED',
  documentDownloaded: 'PARTNER_DOCUMENT_DOWNLOADED',
  commentAdded: 'PARTNER_COMMENT_ADDED',
  supportCreated: 'PARTNER_SUPPORT_CREATED',
})

export const BOND_PARTNER_SUPPORT_STATUSES = Object.freeze({
  open: 'open',
  pending: 'pending',
  resolved: 'resolved',
})

const LOCAL_PORTAL_USER_STORE = new Map()
const LOCAL_DOCUMENT_STORE = new Map()
const LOCAL_DOCUMENT_REQUEST_STORE = new Map()
const LOCAL_COMMENT_STORE = new Map()
const LOCAL_SUPPORT_STORE = new Map()
const LOCAL_AUDIT_STORE = new Map()
const LOCAL_NOTIFICATION_STORE = new Map()
let localSequence = 0

const ACTIVE_APPLICATION_TERMS = ['active', 'new', 'intake', 'pre', 'document', 'submit', 'feedback', 'bank', 'quote', 'instruction', 'in_progress']
const APPROVED_APPLICATION_TERMS = ['approved', 'grant', 'accepted', 'registered']
const DECLINED_APPLICATION_TERMS = ['declined', 'rejected', 'lost']
const SUBMITTED_APPLICATION_TERMS = ['submitted', 'bank', 'feedback', 'quote', 'approved', 'declined', 'registered']
const FINANCE_STAGE_ORDER = [
  { key: 'documents', label: 'Documents' },
  { key: 'review', label: 'Review' },
  { key: 'submission', label: 'Submission' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'approval', label: 'Approval' },
  { key: 'instruction', label: 'Instruction' },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function getWorkspaceKey(options = {}, context = {}) {
  return normalizeText(options.workspaceId || context.workspaceId || context.organisationId || context.organisation_id || 'default')
}

function createId(prefix = 'partner-portal') {
  localSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${localSequence}`
}

function getSignal(row = {}) {
  return normalizeLower(`${row.status || ''} ${row.stage || ''} ${row.financeStageKey || ''} ${row.finance_stage_key || ''} ${row.financeStageLabel || ''} ${row.registrationStatus || ''}`)
}

function isActiveApplication(row = {}) {
  const signal = getSignal(row)
  if (row.active === false || row.is_active === false) return false
  if (['archived', 'cancelled', 'canceled', 'completed', 'registered', 'declined', 'lost'].some((term) => signal.includes(term))) return false
  if (!signal) return true
  return ACTIVE_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function isApprovedApplication(row = {}) {
  const signal = getSignal(row)
  return APPROVED_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function isDeclinedApplication(row = {}) {
  const signal = getSignal(row)
  return DECLINED_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function isSubmittedApplication(row = {}) {
  const signal = getSignal(row)
  return SUBMITTED_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function isPendingDocuments(row = {}) {
  const signal = getSignal(row)
  return signal.includes('doc') || signal.includes('payslip') || signal.includes('statement') || normalizeLower(row.nextAction).includes('document')
}

function percent(part = 0, total = 0) {
  return total ? Math.round((Number(part || 0) / Number(total || 0)) * 100) : 0
}

function average(values = []) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value) && value > 0)
  if (!safe.length) return 0
  return Math.round((safe.reduce((sum, value) => sum + value, 0) / safe.length) * 10) / 10
}

function getDateValue(row = {}) {
  return normalizeText(row.lastActivityAt || row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at || row.createdAt || row.created_at || row.transaction?.updated_at || row.transaction?.created_at)
}

function getLeadDays(row = {}) {
  const created = new Date(row.createdAt || row.created_at || row.transaction?.created_at || '')
  const updated = new Date(getDateValue(row))
  if (Number.isNaN(created.getTime()) || Number.isNaN(updated.getTime())) return 0
  return Math.max(1, Math.round((updated.getTime() - created.getTime()) / (24 * 60 * 60 * 1000)))
}

function getApplicationId(row = {}) {
  return normalizeText(row.id || row.applicationId || row.application_id || row.transactionId || row.transaction_id || row.key)
}

function getApplicationPartnerId(row = {}) {
  return normalizeText(row.partnerId || row.partner_id || row.bondPartnerId || row.bond_partner_id || row.agencyId || row.agency_id || row.developmentId || row.development_id || row.referralPartnerId || row.referral_partner_id)
}

function getApplicationPartnerName(row = {}) {
  return normalizeText(row.partnerName || row.partner_name || row.agencyName || row.agency_name || row.developmentName || row.development_name || row.referralPartnerName || row.referral_partner_name)
}

function normalizePartner(row = {}) {
  return {
    ...row,
    id: normalizeText(row.id || row.partnerId || row.partner_id),
    organisationId: normalizeText(row.organisationId || row.organisation_id),
    name: normalizeText(row.name || row.partnerName || row.partner_name) || 'Partner',
    type: normalizeLower(row.type || row.partnerType || row.partner_type) || BOND_PARTNER_TYPES.agency,
    primaryContactName: normalizeText(row.primaryContactName || row.primary_contact_name),
    primaryContactEmail: normalizeText(row.primaryContactEmail || row.primary_contact_email),
    defaultBranchId: normalizeText(row.defaultBranchId || row.default_branch_id),
    defaultConsultantId: normalizeText(row.defaultConsultantId || row.default_consultant_id),
    status: normalizeLower(row.status) || 'active',
  }
}

function normalizePortalUser(row = {}) {
  return {
    ...row,
    id: normalizeText(row.id || row.userId || row.user_id),
    partnerId: normalizeText(row.partnerId || row.partner_id),
    email: normalizeText(row.email),
    name: normalizeText(row.name || row.fullName || row.full_name || row.email) || 'Partner User',
    role: normalizeLower(row.role) || 'partner_user',
    token: normalizeText(row.token || row.portalToken || row.portal_token),
    status: normalizeLower(row.status) || 'active',
  }
}

function getLocalRows(store, workspaceKey = '') {
  return [...(store.get(workspaceKey) || [])]
}

function setLocalRows(store, workspaceKey = '', rows = []) {
  store.set(workspaceKey, rows)
}

function daysAgo(days = 0, hour = 8) {
  const date = new Date()
  date.setHours(hour, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

function isCommercialDemoWorkspace(options = {}, workspaceKey = '') {
  if (options.seedCommercialDemo === true || options.commercialDemo === true) return true
  return normalizeText(workspaceKey) === DEV_BYPASS_WORKSPACE_IDS.bond_originator
}

function getCommercialDemoSeed(workspaceKey = '') {
  const regions = [
    { id: 'demo-region-gauteng', name: 'Gauteng' },
    { id: 'demo-region-western-cape', name: 'Western Cape' },
    { id: 'demo-region-kzn', name: 'KZN' },
  ]
  const branches = [
    { id: 'demo-branch-sandton', name: 'Sandton HQ', regionId: regions[0].id, regionName: regions[0].name },
    { id: 'demo-branch-pretoria', name: 'Pretoria North', regionId: regions[0].id, regionName: regions[0].name },
    { id: 'demo-branch-cape-town', name: 'Cape Town Central', regionId: regions[1].id, regionName: regions[1].name },
    { id: 'demo-branch-umhlanga', name: 'Umhlanga Ridge', regionId: regions[2].id, regionName: regions[2].name },
  ]
  const consultants = [
    { id: 'demo-consultant-lerato', name: 'Lerato Mokoena', branchId: branches[0].id, regionId: regions[0].id, role: 'Senior Bond Consultant' },
    { id: 'demo-consultant-michael', name: 'Michael Jacobs', branchId: branches[1].id, regionId: regions[0].id, role: 'Bond Consultant' },
    { id: 'demo-consultant-amira', name: 'Amira Daniels', branchId: branches[2].id, regionId: regions[1].id, role: 'Key Accounts Consultant' },
    { id: 'demo-consultant-sipho', name: 'Sipho Dlamini', branchId: branches[3].id, regionId: regions[2].id, role: 'Bond Consultant' },
  ]
  const partners = [
    {
      id: 'demo-partner-ooba-homes',
      organisationId: workspaceKey,
      name: 'Ooba Home Loans Channel',
      type: BOND_PARTNER_TYPES.agency,
      primaryContactName: 'Naledi Petersen',
      primaryContactEmail: 'naledi@ooba-demo.test',
      defaultBranchId: branches[0].id,
      defaultConsultantId: consultants[0].id,
      status: 'active',
    },
    {
      id: 'demo-partner-atlantic-agency',
      organisationId: workspaceKey,
      name: 'Atlantic Realty Group',
      type: BOND_PARTNER_TYPES.agency,
      primaryContactName: 'Daniel Fisher',
      primaryContactEmail: 'daniel@atlantic-demo.test',
      defaultBranchId: branches[2].id,
      defaultConsultantId: consultants[2].id,
      status: 'active',
    },
    {
      id: 'demo-partner-northbank-developments',
      organisationId: workspaceKey,
      name: 'Northbank Developments',
      type: BOND_PARTNER_TYPES.developer,
      primaryContactName: 'Priya Naidoo',
      primaryContactEmail: 'priya@northbank-demo.test',
      defaultBranchId: branches[3].id,
      defaultConsultantId: consultants[3].id,
      status: 'active',
    },
  ]
  const banks = [
    { id: 'absa', name: 'ABSA', status: 'active' },
    { id: 'fnb', name: 'FNB', status: 'active' },
    { id: 'standard-bank', name: 'Standard Bank', status: 'active' },
    { id: 'nedbank', name: 'Nedbank', status: 'active' },
    { id: 'investec', name: 'Investec', status: 'active' },
  ]
  const commissionRules = [
    { id: 'demo-originator-commercial', name: 'HQ Gross Revenue 2.05%', appliesTo: 'originator_company', calculationBasis: 'gross_bond_amount', type: 'percentage', percentage: 2.05, rate: 2.05, status: 'active' },
    { id: 'demo-consultant-split', name: 'Consultant Split 38%', appliesTo: 'consultant', calculationBasis: 'originator_commission', type: 'percentage', percentage: 38, rate: 38, status: 'active' },
    { id: 'demo-branch-override', name: 'Branch Override 4%', appliesTo: 'branch', calculationBasis: 'originator_commission', type: 'percentage', percentage: 4, rate: 4, status: 'active' },
    { id: 'demo-region-override', name: 'Regional Override 2%', appliesTo: 'region', calculationBasis: 'originator_commission', type: 'percentage', percentage: 2, rate: 2, status: 'active' },
    { id: 'demo-agency-referral', name: 'Agency Referral 0.32%', appliesTo: 'agency', calculationBasis: 'gross_bond_amount', type: 'percentage', percentage: 0.32, rate: 0.32, status: 'active' },
    { id: 'demo-developer-referral', name: 'Developer Referral 0.45%', appliesTo: 'developer', calculationBasis: 'gross_bond_amount', type: 'percentage', percentage: 0.45, rate: 0.45, status: 'active' },
    { id: 'demo-bank-incentive', name: 'Bank Incentive 0.5%', appliesTo: 'bank', calculationBasis: 'originator_commission', type: 'percentage', percentage: 0.5, rate: 0.5, status: 'active' },
  ]
  const makeApplication = ({
    id,
    reference,
    clientName,
    bondAmount,
    consultant,
    branch,
    partner,
    bank,
    status,
    financeStageKey,
    financeStageLabel,
    revenueStatus,
    days,
    submittedDays = days + 8,
    approvedDays = days,
  }) => ({
    id,
    applicationId: id,
    organisationId: workspaceKey,
    partnerId: partner.id,
    partnerName: partner.name,
    partnerType: partner.type,
    clientName,
    buyerName: clientName,
    property: `${branch.name} residential finance`,
    applicationReference: reference,
    consultant: consultant.name,
    consultantName: consultant.name,
    assignedConsultantId: consultant.id,
    assignedUserId: consultant.id,
    branch: branch.name,
    branchName: branch.name,
    branchId: branch.id,
    assignedBranchId: branch.id,
    regionName: regions.find((region) => region.id === branch.regionId)?.name,
    regionId: branch.regionId,
    assignedRegionId: branch.regionId,
    bank,
    submittedBank: bank,
    selectedBanks: [bank],
    bondAmount,
    purchasePrice: Math.round(bondAmount * 1.08),
    status,
    financeStageKey,
    financeStageLabel,
    revenueStatus,
    submittedAt: daysAgo(submittedDays),
    approvedAt: ['approved', 'payable', 'paid'].includes(revenueStatus) ? daysAgo(approvedDays) : '',
    paidAt: revenueStatus === 'paid' ? daysAgo(days) : '',
    lastActivityAt: daysAgo(days),
    updatedAt: daysAgo(days),
    createdAt: daysAgo(days + 14),
  })

  const applications = [
    makeApplication({ id: 'demo-commercial-app-001', reference: 'BO-COM-2601', clientName: 'Thandi Nkosi', bondAmount: 2850000, consultant: consultants[0], branch: branches[0], partner: partners[0], bank: 'ABSA', status: 'registered paid', financeStageKey: 'registered_paid', financeStageLabel: 'Registered / Paid', revenueStatus: 'paid', days: 4 }),
    makeApplication({ id: 'demo-commercial-app-002', reference: 'BO-COM-2602', clientName: 'Matthew Williams', bondAmount: 4120000, consultant: consultants[2], branch: branches[2], partner: partners[1], bank: 'Standard Bank', status: 'instruction issued', financeStageKey: 'bond_instruction_sent', financeStageLabel: 'Instruction Issued', revenueStatus: 'payable', days: 7 }),
    makeApplication({ id: 'demo-commercial-app-003', reference: 'BO-COM-2603', clientName: 'Aisha Khan', bondAmount: 3680000, consultant: consultants[0], branch: branches[0], partner: partners[0], bank: 'Nedbank', status: 'quote accepted', financeStageKey: 'quote_approved', financeStageLabel: 'Accepted Quote', revenueStatus: 'approved', days: 10 }),
    makeApplication({ id: 'demo-commercial-app-004', reference: 'BO-COM-2604', clientName: 'Johan van der Merwe', bondAmount: 5150000, consultant: consultants[3], branch: branches[3], partner: partners[2], bank: 'FNB', status: 'approved by buyer', financeStageKey: 'quote_approved', financeStageLabel: 'Accepted Quote', revenueStatus: 'approved', days: 13 }),
    makeApplication({ id: 'demo-commercial-app-005', reference: 'BO-COM-2605', clientName: 'Mpho Dube', bondAmount: 2420000, consultant: consultants[1], branch: branches[1], partner: partners[0], bank: 'Investec', status: 'bank feedback', financeStageKey: 'bank_feedback', financeStageLabel: 'Bank Feedback', revenueStatus: 'pending', days: 16 }),
    makeApplication({ id: 'demo-commercial-app-006', reference: 'BO-COM-2606', clientName: 'Claudia Botha', bondAmount: 3340000, consultant: consultants[2], branch: branches[2], partner: partners[1], bank: 'ABSA', status: 'submitted to banks', financeStageKey: 'submitted_to_banks', financeStageLabel: 'Submitted', revenueStatus: 'pending', days: 21 }),
    makeApplication({ id: 'demo-commercial-app-007', reference: 'BO-COM-2607', clientName: 'Sizwe Mthembu', bondAmount: 4750000, consultant: consultants[3], branch: branches[3], partner: partners[2], bank: 'Nedbank', status: 'registered paid', financeStageKey: 'registered_paid', financeStageLabel: 'Registered / Paid', revenueStatus: 'paid', days: 34 }),
    makeApplication({ id: 'demo-commercial-app-008', reference: 'BO-COM-2608', clientName: 'Michelle Hart', bondAmount: 2190000, consultant: consultants[0], branch: branches[0], partner: partners[0], bank: 'FNB', status: 'instruction issued', financeStageKey: 'bond_instruction_sent', financeStageLabel: 'Instruction Issued', revenueStatus: 'payable', days: 41 }),
    makeApplication({ id: 'demo-commercial-app-009', reference: 'BO-COM-2609', clientName: 'Karabo Molefe', bondAmount: 3920000, consultant: consultants[1], branch: branches[1], partner: partners[0], bank: 'Standard Bank', status: 'approved', financeStageKey: 'approval', financeStageLabel: 'Approved', revenueStatus: 'approved', days: 48 }),
    makeApplication({ id: 'demo-commercial-app-010', reference: 'BO-COM-2610', clientName: 'Peter Naidoo', bondAmount: 3020000, consultant: consultants[2], branch: branches[2], partner: partners[1], bank: 'ABSA', status: 'declined', financeStageKey: 'declined', financeStageLabel: 'Declined', revenueStatus: 'cancelled', days: 53 }),
  ]

  return {
    partners,
    portalUsers: partners.map((partner, index) => ({
      id: `demo-portal-user-${index + 1}`,
      partnerId: partner.id,
      email: partner.primaryContactEmail,
      name: partner.primaryContactName,
      token: `demo-commercial-${index + 1}`,
      status: 'active',
    })),
    applications,
    branches,
    regions,
    consultants,
    banks,
    commissionRules,
  }
}

function getSeedData(options = {}, workspaceKey = '') {
  const demoPartner = {
    id: 'partner-demo-agency',
    organisationId: workspaceKey,
    name: 'Harcourts Bedfordview',
    type: BOND_PARTNER_TYPES.agency,
    primaryContactName: 'Partner Principal',
    primaryContactEmail: 'partner@example.test',
    defaultBranchId: 'branch-east',
    defaultConsultantId: 'consultant-sarah',
    status: 'active',
  }
  const demoApplications = [
    {
      id: 'app-demo-1',
      partnerId: demoPartner.id,
      partnerName: demoPartner.name,
      client: 'John Buyer',
      property: '12 Main Road',
      applicationReference: 'BO-2026-00125',
      consultant: 'Sarah Jacobs',
      consultantEmail: 'sarah@example.test',
      consultantPhone: '+27 11 555 0101',
      branch: 'East Rand Branch',
      status: 'active',
      bank: 'ABSA',
      financeStageKey: 'documents_received',
      financeStageLabel: 'Documents Received',
      submittedAt: '2026-06-02T08:00:00.000Z',
      lastActivityAt: '2026-06-03T08:00:00.000Z',
      createdAt: '2026-05-28T08:00:00.000Z',
    },
  ]
  if (options.token === 'demo-partner' && !normalizeArray(options.partners).length && !normalizeArray(options.applications).length) {
    return {
      partners: [demoPartner],
      portalUsers: [{ id: 'partner-user-demo', partnerId: demoPartner.id, email: 'partner@example.test', name: 'Harcourts Bedfordview', token: 'demo-partner', status: 'active' }],
      applications: demoApplications,
      branches: [],
      regions: [],
      consultants: [],
      banks: [],
      commissionRules: [],
    }
  }
  if (isCommercialDemoWorkspace(options, workspaceKey) && !normalizeArray(options.partners).length && !normalizeArray(options.applications).length) {
    return getCommercialDemoSeed(workspaceKey)
  }
  return { partners: [], portalUsers: [], applications: [], branches: [], regions: [], consultants: [], banks: [], commissionRules: [] }
}

function getData(options = {}, workspaceKey = '') {
  const seed = getSeedData(options, workspaceKey)
  return {
    partners: (normalizeArray(options.partners).length ? options.partners : seed.partners).map(normalizePartner),
    portalUsers: (normalizeArray(options.portalUsers).length ? options.portalUsers : (getLocalRows(LOCAL_PORTAL_USER_STORE, workspaceKey).length ? getLocalRows(LOCAL_PORTAL_USER_STORE, workspaceKey) : seed.portalUsers)).map(normalizePortalUser),
    applications: normalizeArray(options.applications).length ? options.applications : seed.applications,
    branches: normalizeArray(options.branches || options.units).length ? normalizeArray(options.branches || options.units) : seed.branches,
    regions: normalizeArray(options.regions).length ? options.regions : seed.regions,
    consultants: normalizeArray(options.consultants || options.users).length ? normalizeArray(options.consultants || options.users) : seed.consultants,
    banks: normalizeArray(options.banks || options.configuredBanks).length ? normalizeArray(options.banks || options.configuredBanks) : seed.banks,
    commissionRules: normalizeArray(options.commissionRules).length ? options.commissionRules : seed.commissionRules,
    documents: normalizeArray(options.documents).length ? options.documents : getLocalRows(LOCAL_DOCUMENT_STORE, workspaceKey),
    documentRequests: normalizeArray(options.documentRequests).length ? options.documentRequests : getLocalRows(LOCAL_DOCUMENT_REQUEST_STORE, workspaceKey),
    comments: normalizeArray(options.comments).length ? options.comments : getLocalRows(LOCAL_COMMENT_STORE, workspaceKey),
    supportTickets: normalizeArray(options.supportTickets).length ? options.supportTickets : getLocalRows(LOCAL_SUPPORT_STORE, workspaceKey),
  }
}

function createPermissionError() {
  const error = new Error('Partner portal access is not permitted for this record.')
  error.code = 'permission_denied'
  return error
}

function resolvePortalContext(context = {}, options = {}) {
  const workspaceKey = getWorkspaceKey(options, context)
  const data = getData({ ...options, token: context.token || options.token }, workspaceKey)
  const token = normalizeText(context.token || context.portalToken || options.token)
  const partnerId = normalizeText(context.partnerId || context.partner_id)
  const user = data.portalUsers.find((row) => (
    (token && row.token === token) ||
    (partnerId && row.partnerId === partnerId)
  )) || (partnerId ? { partnerId, id: context.userId || 'partner-user', name: context.name || 'Partner User', email: context.email || '' } : null)
  const resolvedPartnerId = normalizeText(user?.partnerId || partnerId)
  const partner = data.partners.find((row) => row.id === resolvedPartnerId)
  if (!partner) throw createPermissionError()
  if (user?.status && !['active', 'accepted'].includes(normalizeLower(user.status))) throw createPermissionError()
  return { workspaceKey, data, partner, user, partnerId: partner.id }
}

function assertApplicationAccess(applicationId = '', portalContext = {}) {
  const application = getPartnerApplicationsForContext(portalContext).find((row) => getApplicationId(row) === normalizeText(applicationId))
  if (!application) throw createPermissionError()
  return application
}

function getPartnerApplicationsForContext(portalContext = {}) {
  const partnerName = normalizeLower(portalContext.partner?.name)
  return portalContext.data.applications.filter((row) => {
    const rowPartnerId = getApplicationPartnerId(row)
    const rowPartnerName = normalizeLower(getApplicationPartnerName(row))
    return (rowPartnerId && rowPartnerId === portalContext.partnerId) || (partnerName && rowPartnerName === partnerName)
  })
}

function getFinanceStageKey(row = {}) {
  const signal = getSignal(row)
  if (signal.includes('instruction')) return 'instruction'
  if (signal.includes('approved') || signal.includes('quote')) return 'approval'
  if (signal.includes('feedback') || signal.includes('bank')) return 'feedback'
  if (signal.includes('submit')) return 'submission'
  if (signal.includes('review')) return 'review'
  return 'documents'
}

function getStatusRail(row = {}) {
  const currentIndex = Math.max(0, FINANCE_STAGE_ORDER.findIndex((stage) => stage.key === getFinanceStageKey(row)))
  return FINANCE_STAGE_ORDER.map((stage, index) => ({
    ...stage,
    status: index < currentIndex ? 'complete' : index === currentIndex ? 'active' : 'pending',
  }))
}

function normalizeApplication(row = {}) {
  return {
    ...row,
    id: getApplicationId(row),
    buyer: normalizeText(row.buyer || row.buyerName || row.client || row.buyer?.name) || 'Buyer pending',
    property: normalizeText(row.property || row.propertyAddress || row.property_address || row.address) || 'Property pending',
    reference: normalizeText(row.applicationReference || row.application_reference || row.transactionReference || row.transaction_reference || row.id) || 'Application',
    consultant: normalizeText(row.consultant || row.consultantName || row.assignedConsultantName || row.assigned_consultant_name) || 'Assigned consultant',
    consultantEmail: normalizeText(row.consultantEmail || row.consultant_email || row.assignedUserEmail || row.assigned_user_email),
    consultantPhone: normalizeText(row.consultantPhone || row.consultant_phone),
    branch: normalizeText(row.branch || row.branchName || row.branch_name) || 'Branch',
    status: normalizeText(row.status || row.financeStageLabel || row.finance_stage_label) || 'In progress',
    bank: normalizeText(row.bank || row.primaryBank || row.primary_bank) || 'Bank pending',
    submittedDate: normalizeText(row.submittedAt || row.submitted_at || row.createdAt || row.created_at),
    lastActivity: normalizeText(row.lastActivityLabel || row.lastActivityAt || row.updatedAt || row.updated_at) || 'No activity',
    financeStageKey: getFinanceStageKey(row),
    financeStageLabel: normalizeText(row.financeStageLabel || row.finance_stage_label) || 'Documents',
    statusRail: getStatusRail(row),
  }
}

function getApplicationDocuments(applicationId = '', data = {}) {
  return data.documents.filter((row) => normalizeText(row.applicationId || row.application_id) === normalizeText(applicationId))
}

function getApplicationDocumentRequests(applicationId = '', data = {}) {
  return data.documentRequests.filter((row) => normalizeText(row.applicationId || row.application_id) === normalizeText(applicationId))
}

function normalizeDocument(row = {}) {
  return {
    id: normalizeText(row.id || row.documentId || row.document_id),
    applicationId: normalizeText(row.applicationId || row.application_id),
    name: normalizeText(row.name || row.documentName || row.document_name || row.fileName || row.file_name) || 'Document',
    documentType: normalizeText(row.documentType || row.document_type || row.type) || 'other',
    status: normalizeLower(row.status) || 'received',
    uploadedAt: normalizeText(row.uploadedAt || row.uploaded_at || row.createdAt || row.created_at),
    uploadedBy: normalizeText(row.uploadedBy || row.uploaded_by) || 'Partner',
    url: normalizeText(row.url || row.downloadUrl || row.download_url),
  }
}

function normalizeDocumentRequest(row = {}) {
  return {
    id: normalizeText(row.id || row.requestId || row.request_id),
    applicationId: normalizeText(row.applicationId || row.application_id),
    documentName: normalizeText(row.documentName || row.document_name || row.title) || 'Document',
    requestedBy: normalizeText(row.requestedBy || row.requested_by || row.requestedByName || row.requested_by_name) || 'Consultant',
    dueDate: normalizeText(row.dueDate || row.due_date),
    status: normalizeLower(row.status) || 'requested',
    notes: normalizeText(row.notes || row.reason),
  }
}

function recordAudit(workspaceKey = '', event = {}) {
  const rows = getLocalRows(LOCAL_AUDIT_STORE, workspaceKey)
  const row = {
    id: event.id || createId('partner-audit'),
    eventType: event.eventType,
    partnerId: normalizeText(event.partnerId),
    applicationId: normalizeText(event.applicationId),
    actorUserId: normalizeText(event.actorUserId),
    previousValue: event.previousValue || null,
    newValue: event.newValue || null,
    createdAt: event.createdAt || new Date().toISOString(),
  }
  setLocalRows(LOCAL_AUDIT_STORE, workspaceKey, [row, ...rows])
  return row
}

function recordNotification(workspaceKey = '', notification = {}) {
  const rows = getLocalRows(LOCAL_NOTIFICATION_STORE, workspaceKey)
  const row = {
    id: createId('partner-notification'),
    partnerId: normalizeText(notification.partnerId),
    applicationId: normalizeText(notification.applicationId),
    type: normalizeText(notification.type),
    channel: normalizeText(notification.channel || 'portal'),
    title: normalizeText(notification.title),
    createdAt: new Date().toISOString(),
  }
  setLocalRows(LOCAL_NOTIFICATION_STORE, workspaceKey, [row, ...rows])
  return row
}

function getPerformanceForApplications(applications = []) {
  const approved = applications.filter(isApprovedApplication).length
  const submitted = applications.filter(isSubmittedApplication).length
  return {
    applicationsSubmitted: applications.length,
    activeApplications: applications.filter(isActiveApplication).length,
    approvals: approved,
    declinedApplications: applications.filter(isDeclinedApplication).length,
    pendingDocuments: applications.filter(isPendingDocuments).length,
    approvalRate: percent(approved, applications.length),
    averageTurnaround: average(applications.map(getLeadDays)),
    averageBankResponse: average(applications.map((row) => row.averageBankResponseTime || row.average_bank_response_time || row.bankResponseDays || row.bank_response_days)),
    submittedApplications: submitted,
  }
}

function getDashboardVariant(partner = {}, applications = []) {
  const type = normalizeLower(partner.type)
  const performance = getPerformanceForApplications(applications)
  if (type === BOND_PARTNER_TYPES.development || type === BOND_PARTNER_TYPES.developer) {
    return {
      type: 'development',
      title: 'Development Performance',
      metrics: {
        unitsSold: applications.length,
        applicationsSubmitted: performance.applicationsSubmitted,
        approvals: performance.approvals,
        approvalRate: performance.approvalRate,
        pendingApplications: performance.activeApplications,
      },
      units: applications.map(normalizeApplication).map((row) => ({
        unit: row.property,
        buyer: row.buyer,
        applicationStatus: row.status,
        approvalStatus: isApprovedApplication(row) ? 'Approved' : isDeclinedApplication(row) ? 'Declined' : 'Pending',
        consultant: row.consultant,
      })),
    }
  }
  if (type === BOND_PARTNER_TYPES.referralPartner) {
    return {
      type: 'referral',
      title: 'Referral Performance',
      metrics: {
        referredClients: applications.length,
        applications: performance.applicationsSubmitted,
        approvals: performance.approvals,
        activeApplications: performance.activeApplications,
      },
    }
  }
  return {
    type: 'agency',
    title: 'Agency Performance',
    metrics: {
      applicationsSubmitted: performance.applicationsSubmitted,
      approvalRate: performance.approvalRate,
      averageTurnaround: performance.averageTurnaround,
      averageBankResponse: performance.averageBankResponse,
      currentMonth: performance.applicationsSubmitted,
      previousMonth: 0,
    },
  }
}

export function getPartnerDashboard(context = {}, options = {}) {
  const portalContext = resolvePortalContext(context, options)
  recordAudit(portalContext.workspaceKey, {
    eventType: BOND_PARTNER_PORTAL_EVENTS.login,
    partnerId: portalContext.partnerId,
    actorUserId: portalContext.user?.id,
  })
  const applications = getPartnerApplicationsForContext(portalContext)
  const normalizedApplications = applications.map(normalizeApplication)
  const performance = getPerformanceForApplications(applications)
  const documents = applications.flatMap((row) => getApplicationDocuments(getApplicationId(row), portalContext.data)).map(normalizeDocument)
  const documentRequests = applications.flatMap((row) => getApplicationDocumentRequests(getApplicationId(row), portalContext.data)).map(normalizeDocumentRequest)
  const latestApplication = normalizedApplications[0] || {}
  return {
    partner: portalContext.partner,
    user: portalContext.user,
    greeting: `Good Morning, ${portalContext.partner.name}`,
    summaryCards: {
      applicationsSubmitted: performance.applicationsSubmitted,
      activeApplications: performance.activeApplications,
      approvals: performance.approvals,
      pendingDocuments: performance.pendingDocuments,
      averageTurnaround: performance.averageTurnaround,
    },
    statusBreakdown: FINANCE_STAGE_ORDER.map((stage) => ({
      ...stage,
      count: normalizedApplications.filter((row) => row.financeStageKey === stage.key).length,
    })),
    documents: {
      received: documents.filter((row) => ['received', 'reviewed', 'approved'].includes(row.status)).length,
      reviewed: documents.filter((row) => ['reviewed', 'approved'].includes(row.status)).length,
      outstanding: documentRequests.filter((row) => ['requested', 'outstanding'].includes(row.status)).length,
    },
    recentActivity: getPartnerActivity(context, options).slice(0, 6),
    consultantContact: {
      name: latestApplication.consultant || 'Assigned Consultant',
      email: latestApplication.consultantEmail || '',
      phone: latestApplication.consultantPhone || '',
    },
    performance: getDashboardVariant(portalContext.partner, applications),
  }
}

export function getPartnerApplications(context = {}, options = {}) {
  const portalContext = resolvePortalContext(context, options)
  const filter = normalizeLower(options.filter || 'all')
  return getPartnerApplicationsForContext(portalContext)
    .map(normalizeApplication)
    .filter((row) => {
      if (filter === 'active') return isActiveApplication(row)
      if (filter === 'approved') return isApprovedApplication(row)
      if (filter === 'declined') return isDeclinedApplication(row)
      if (filter === 'pending_documents') return isPendingDocuments(row)
      return true
    })
}

export function getPartnerApplication(applicationId = '', context = {}, options = {}) {
  const portalContext = resolvePortalContext(context, options)
  const application = assertApplicationAccess(applicationId, portalContext)
  const id = getApplicationId(application)
  return {
    ...normalizeApplication(application),
    summary: {
      consultant: normalizeApplication(application).consultant,
      branch: normalizeApplication(application).branch,
      submittedDate: normalizeApplication(application).submittedDate,
      lastUpdated: normalizeApplication(application).lastActivity,
    },
    financeProgress: {
      documentsReceived: getApplicationDocuments(id, portalContext.data).filter((row) => normalizeLower(row.status) !== 'outstanding').length,
      documentsOutstanding: getApplicationDocumentRequests(id, portalContext.data).filter((row) => ['requested', 'outstanding'].includes(normalizeLower(row.status))).length,
      applicationsSubmitted: isSubmittedApplication(application),
      banksSubmittedTo: normalizeArray(application.banksSubmittedTo || application.banks_submitted_to),
      bankFeedback: normalizeText(application.bankFeedback || application.bank_feedback || application.financeStageLabel),
      approved: isApprovedApplication(application),
      declined: isDeclinedApplication(application),
      instructionSent: getSignal(application).includes('instruction'),
    },
    documents: getPartnerDocuments(applicationId, context, options),
    activity: getPartnerActivity(context, { ...options, applicationId }),
    comments: getLocalRows(LOCAL_COMMENT_STORE, portalContext.workspaceKey).filter((row) => row.applicationId === id && row.partnerId === portalContext.partnerId),
  }
}

export function getPartnerDocuments(applicationId = '', context = {}, options = {}) {
  const portalContext = resolvePortalContext(context, options)
  const application = assertApplicationAccess(applicationId, portalContext)
  const id = getApplicationId(application)
  const documents = getApplicationDocuments(id, portalContext.data).map(normalizeDocument)
  const requests = getApplicationDocumentRequests(id, portalContext.data).map(normalizeDocumentRequest)
  return {
    documents,
    outstandingDocuments: requests.filter((row) => ['requested', 'outstanding'].includes(row.status)),
    requests,
  }
}

export function uploadPartnerDocument(applicationId = '', payload = {}, context = {}, options = {}) {
  const portalContext = resolvePortalContext(context, options)
  const application = assertApplicationAccess(applicationId, portalContext)
  const workspaceKey = portalContext.workspaceKey
  const now = new Date().toISOString()
  const document = normalizeDocument({
    id: payload.id || createId('partner-document'),
    applicationId: getApplicationId(application),
    name: payload.name || payload.fileName || payload.documentName,
    documentType: payload.documentType || payload.type,
    status: 'received',
    uploadedAt: now,
    uploadedBy: portalContext.user?.name || portalContext.partner.name,
    url: payload.url || '',
  })
  setLocalRows(LOCAL_DOCUMENT_STORE, workspaceKey, [document, ...getLocalRows(LOCAL_DOCUMENT_STORE, workspaceKey)])
  if (payload.requestId) {
    const requests = getLocalRows(LOCAL_DOCUMENT_REQUEST_STORE, workspaceKey)
    setLocalRows(LOCAL_DOCUMENT_REQUEST_STORE, workspaceKey, requests.map((request) => (
      normalizeText(request.id || request.requestId || request.request_id) === normalizeText(payload.requestId)
        ? { ...request, status: 'uploaded', uploadedAt: now }
        : request
    )))
  }
  recordAudit(workspaceKey, {
    eventType: BOND_PARTNER_PORTAL_EVENTS.documentUploaded,
    partnerId: portalContext.partnerId,
    applicationId: getApplicationId(application),
    actorUserId: portalContext.user?.id,
    newValue: document,
  })
  recordNotification(workspaceKey, {
    type: BOND_PARTNER_PORTAL_EVENTS.documentUploaded,
    partnerId: portalContext.partnerId,
    applicationId: getApplicationId(application),
    title: `${document.name} uploaded by ${portalContext.partner.name}`,
  })
  return document
}

export function getPartnerActivity(context = {}, options = {}) {
  const portalContext = resolvePortalContext(context, options)
  const applicationIds = new Set(getPartnerApplicationsForContext(portalContext).map(getApplicationId))
  const selectedApplicationId = normalizeText(options.applicationId)
  const auditRows = getLocalRows(LOCAL_AUDIT_STORE, portalContext.workspaceKey)
    .filter((row) => row.partnerId === portalContext.partnerId)
    .filter((row) => !selectedApplicationId || row.applicationId === selectedApplicationId)
  const applicationEvents = getPartnerApplicationsForContext(portalContext)
    .filter((row) => !selectedApplicationId || getApplicationId(row) === selectedApplicationId)
    .map((row) => ({
      id: `application-${getApplicationId(row)}`,
      eventType: isApprovedApplication(row) ? 'Quote Approved' : isSubmittedApplication(row) ? 'Application Submitted' : 'Application Updated',
      applicationId: getApplicationId(row),
      title: isApprovedApplication(row) ? 'Approval received' : isSubmittedApplication(row) ? 'Application submitted' : normalizeApplication(row).financeStageLabel,
      createdAt: getDateValue(row) || new Date().toISOString(),
    }))
  const documentEvents = getLocalRows(LOCAL_DOCUMENT_STORE, portalContext.workspaceKey)
    .filter((row) => applicationIds.has(normalizeText(row.applicationId || row.application_id)))
    .filter((row) => !selectedApplicationId || normalizeText(row.applicationId || row.application_id) === selectedApplicationId)
    .map((row) => ({
      id: `document-${row.id}`,
      eventType: 'Document Uploaded',
      applicationId: normalizeText(row.applicationId || row.application_id),
      title: `${normalizeDocument(row).name} uploaded`,
      createdAt: normalizeDocument(row).uploadedAt || new Date().toISOString(),
    }))
  return [...auditRows, ...applicationEvents, ...documentEvents]
    .map((row) => ({
      id: row.id,
      eventType: row.eventType,
      applicationId: row.applicationId,
      title: row.title || row.eventType,
      createdAt: row.createdAt,
      actor: portalContext.partner.name,
    }))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}

export function addPartnerComment(applicationId = '', payload = {}, context = {}, options = {}) {
  const portalContext = resolvePortalContext(context, options)
  const application = assertApplicationAccess(applicationId, portalContext)
  const workspaceKey = portalContext.workspaceKey
  const comment = {
    id: payload.id || createId('partner-comment'),
    partnerId: portalContext.partnerId,
    applicationId: getApplicationId(application),
    authorName: portalContext.user?.name || portalContext.partner.name,
    authorRole: 'Partner',
    message: normalizeText(payload.message || payload.comment),
    attachments: normalizeArray(payload.attachments),
    createdAt: new Date().toISOString(),
  }
  if (!comment.message) throw new Error('Comment message is required.')
  setLocalRows(LOCAL_COMMENT_STORE, workspaceKey, [comment, ...getLocalRows(LOCAL_COMMENT_STORE, workspaceKey)])
  recordAudit(workspaceKey, {
    eventType: BOND_PARTNER_PORTAL_EVENTS.commentAdded,
    partnerId: portalContext.partnerId,
    applicationId: getApplicationId(application),
    actorUserId: portalContext.user?.id,
    newValue: comment,
  })
  return comment
}

export function createPartnerSupportTicket(payload = {}, context = {}, options = {}) {
  const portalContext = resolvePortalContext(context, options)
  const applicationId = normalizeText(payload.applicationId)
  if (applicationId) assertApplicationAccess(applicationId, portalContext)
  const workspaceKey = portalContext.workspaceKey
  const ticket = {
    id: payload.id || createId('partner-support'),
    partnerId: portalContext.partnerId,
    applicationId,
    type: normalizeText(payload.type || 'General Query'),
    subject: normalizeText(payload.subject || payload.type || 'Support request'),
    message: normalizeText(payload.message || payload.description),
    status: BOND_PARTNER_SUPPORT_STATUSES.open,
    createdAt: new Date().toISOString(),
  }
  setLocalRows(LOCAL_SUPPORT_STORE, workspaceKey, [ticket, ...getLocalRows(LOCAL_SUPPORT_STORE, workspaceKey)])
  recordAudit(workspaceKey, {
    eventType: BOND_PARTNER_PORTAL_EVENTS.supportCreated,
    partnerId: portalContext.partnerId,
    applicationId,
    actorUserId: portalContext.user?.id,
    newValue: ticket,
  })
  recordNotification(workspaceKey, {
    type: BOND_PARTNER_PORTAL_EVENTS.supportCreated,
    partnerId: portalContext.partnerId,
    applicationId,
    title: `${portalContext.partner.name} created a support ticket.`,
  })
  return ticket
}

export function getPartnerPerformance(context = {}, options = {}) {
  const portalContext = resolvePortalContext(context, options)
  return getDashboardVariant(portalContext.partner, getPartnerApplicationsForContext(portalContext))
}

export function getPartnerPortalOperationalRows(context = {}, options = {}) {
  const workspaceKey = getWorkspaceKey(options, context)
  const data = getData({ ...options, token: context.token || options.token }, workspaceKey)
  return {
    workspaceKey,
    partners: data.partners,
    portalUsers: data.portalUsers,
    applications: data.applications,
    branches: data.branches,
    regions: data.regions,
    consultants: data.consultants,
    banks: data.banks,
    commissionRules: data.commissionRules,
    documents: data.documents,
    documentRequests: data.documentRequests,
    comments: data.comments,
    supportTickets: data.supportTickets,
    audit: getLocalRows(LOCAL_AUDIT_STORE, workspaceKey),
    notifications: getLocalRows(LOCAL_NOTIFICATION_STORE, workspaceKey),
  }
}

export const __bondPartnerPortalServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_PORTAL_USER_STORE.clear()
    LOCAL_DOCUMENT_STORE.clear()
    LOCAL_DOCUMENT_REQUEST_STORE.clear()
    LOCAL_COMMENT_STORE.clear()
    LOCAL_SUPPORT_STORE.clear()
    LOCAL_AUDIT_STORE.clear()
    LOCAL_NOTIFICATION_STORE.clear()
    localSequence = 0
  },
  seedPortalUsers(workspaceId = '', rows = []) {
    setLocalRows(LOCAL_PORTAL_USER_STORE, normalizeText(workspaceId || 'default'), rows.map(normalizePortalUser))
  },
  seedDocuments(workspaceId = '', rows = []) {
    setLocalRows(LOCAL_DOCUMENT_STORE, normalizeText(workspaceId || 'default'), rows)
  },
  seedDocumentRequests(workspaceId = '', rows = []) {
    setLocalRows(LOCAL_DOCUMENT_REQUEST_STORE, normalizeText(workspaceId || 'default'), rows)
  },
  getDocuments(workspaceId = '') {
    return getLocalRows(LOCAL_DOCUMENT_STORE, normalizeText(workspaceId || 'default'))
  },
  getSupportTickets(workspaceId = '') {
    return getLocalRows(LOCAL_SUPPORT_STORE, normalizeText(workspaceId || 'default'))
  },
  getAudit(workspaceId = '') {
    return getLocalRows(LOCAL_AUDIT_STORE, normalizeText(workspaceId || 'default'))
  },
  getNotifications(workspaceId = '') {
    return getLocalRows(LOCAL_NOTIFICATION_STORE, normalizeText(workspaceId || 'default'))
  },
})
