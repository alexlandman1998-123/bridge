import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  FileSignature,
  Flag,
  Folder,
  HandCoins,
  Home,
  Info,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  PhoneCall,
  Scale,
  ShieldCheck,
  Truck,
  UploadCloud,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react'
import BuyerPortalDesktopSidebar from '../components/client-portal/BuyerPortalDesktopSidebar'
import {
  BuyerMobileBottomNavigation,
  BuyerMobileActionSheet,
  BuyerMobileHeader,
  BuyerMobilePriorityAction,
  BuyerMobilePropertyHero,
} from '../components/client-portal/BuyerMobileChrome'
import BuyerPortalJourney from '../components/client-portal/BuyerPortalJourney'
import BuyerDocumentWorkspace, { BuyerDocumentSummary } from '../components/client-portal/documents/BuyerDocumentWorkspace'
import BuyerFinanceWorkspace from '../components/client-portal/finance/BuyerFinanceWorkspace'
import { DemoInsurancePromotion } from '../components/client-portal/insurance/DemoInsuranceComponents'
import DemoBondLifeSection from '../components/client-portal/insurance/DemoBondLifeSection'
import DemoInsuranceWorkspace from '../components/client-portal/insurance/DemoInsuranceWorkspace'
import DemoMaintenanceWorkspace from '../components/client-portal/home-services/DemoMaintenanceWorkspace'
import DemoMoveWorkspace from '../components/client-portal/home-services/DemoMoveWorkspace'
import { DemoHomeSupportProvider } from '../components/client-portal/support/DemoHomeSupport'
import BuyerTeamWorkspace from '../components/client-portal/team/BuyerTeamWorkspace'
import {
  buyerPortalHexToRgba as hexToRgba,
  createBuyerPortalTheme,
} from '../components/client-portal/buyerPortalTheme'
import {
  BuyerPortalOverviewHero,
  BuyerPortalOverviewShell,
} from '../components/client-portal/BuyerPortalOverview'
import { buildBuyerJourneyPresentationModel } from '../core/clientPortal/buyerJourneyPresentationModel'
import { buildBuyerDocumentPresentationModel } from '../core/clientPortal/buyerDocumentPresentationModel'
import { buildBuyerFinancePresentationModel } from '../core/clientPortal/buyerFinancePresentationModel'
import { buildBuyerTeamPresentationModel } from '../core/clientPortal/buyerTeamPresentationModel'
import { buildBuyerPortalCutoverReadiness } from '../core/clientPortal/buyerPortalCutoverReadiness'
import { resolveProspectDemoConfig } from '../lib/prospectDemoConfig'
import './ProspectBuyerDemo.css'

const DEMO_CURRENT_HOME_ADDRESS = '14 Ocean View Drive, Sea Point'

const DEFAULT_BRAND = {
  agencyName: 'Demo Agency',
  logoDarkUrl: '/brand/produktive-realty-logo-white.svg',
  logoLightUrl: '/brand/produktive-realty-logo-white.svg',
  primaryColour: '#152432',
  secondaryColour: '#233d53',
  accentColour: '#d1ad61',
  samplePropertyImageUrl: '/brand/agency-intake-buy.webp',
  samplePropertyAddress: '2 Pine Avenue, Unit 4, Sea Point, Cape Town',
}

const DEMO_NAV = [
  { key: 'overview', label: 'Overview', icon: Home },
  { key: 'progress', label: 'Transfer Journey', icon: CheckCircle2 },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'finance', label: 'Finance', icon: HandCoins },
  { key: 'bond-application', label: 'Bond Application', icon: FileSignature },
  { key: 'insurance', label: 'Insurance', icon: ShieldCheck },
  { key: 'maintenance', label: 'Maintenance', icon: Wrench },
  { key: 'move', label: 'Move', icon: Truck },
  { key: 'messages', label: 'Messages', icon: Mail },
  { key: 'team', label: 'Your Team', icon: Users },
]

// Mobile navigation stays focused on the five destinations buyers use most.
// Additional destinations remain reachable from the overflow menu.
const MOBILE_DEMO_NAV = DEMO_NAV.filter((item) => ['overview', 'progress', 'documents', 'finance', 'team'].includes(item.key))

const DEMO_JOURNEY_STAGES = [
  {
    id: 'otp-signed',
    label: 'OTP Signed',
    status: 'complete',
    completionDate: '12 Aug',
    description: 'Your signed Offer to Purchase has been received and sent to the transfer team.',
    expectedDuration: 'Complete',
    nextMilestone: 'Finance application starts',
  },
  {
    id: 'finance',
    label: 'Finance',
    status: 'current',
    description: 'Your bond application has been submitted to four banks. Priya will update you as they respond.',
    expectedDuration: '5 - 10 business days',
    nextMilestone: 'Finance approved & guarantees issued',
  },
  {
    id: 'guarantees',
    label: 'Guarantees',
    status: 'upcoming',
    description: 'Your bank issues payment guarantees once finance is approved.',
    expectedDuration: '3 - 5 business days',
    nextMilestone: 'Transfer documents prepared',
  },
  {
    id: 'transfer',
    label: 'Transfer',
    status: 'upcoming',
    description: 'The attorneys prepare and sign the transfer documents.',
    expectedDuration: '2 - 4 weeks',
    nextMilestone: 'Lodgement at Deeds Office',
  },
  {
    id: 'lodgement',
    label: 'Lodgement',
    status: 'upcoming',
    description: 'Documents are lodged with the Deeds Office for examination.',
    expectedDuration: '7 - 10 business days',
    nextMilestone: 'Registration scheduled',
  },
  {
    id: 'registration',
    label: 'Registration',
    status: 'upcoming',
    description: 'Ownership is registered and the purchase is complete.',
    expectedDuration: 'Final step',
    nextMilestone: 'Keys and handover',
  },
]

const DEMO_BUYER_JOURNEY_MODEL = buildBuyerJourneyPresentationModel({
  steps: DEMO_JOURNEY_STAGES,
  currentStepId: 'finance',
  currentStageLabel: 'Finance',
  nextStageLabel: 'Guarantees',
  source: 'demo',
})

const DEMO_DOCUMENTS = [
  { title: 'Buyer ID Document', group: 'FICA documents', status: 'Approved', tone: 'complete', description: 'Verified copy of the buyer identity document.' },
  { title: 'Proof of Residential Address', group: 'FICA documents', status: 'Received', tone: 'complete', description: 'Utility bill or bank statement confirming residential address.' },
  { title: 'Signed Offer to Purchase', group: 'Sale documents', status: 'Shared', tone: 'info', description: 'Signed OTP available for the buyer and transfer team.' },
  { title: 'Sale Agreement Addendum', group: 'Sale documents', status: 'Drafting', tone: 'info', description: 'Prepared if the attorneys need updated purchase terms.' },
  { title: 'Rates Clearance Information', group: 'Property documents', status: 'Requested', tone: 'action', description: 'Property supporting document requested from the seller side.' },
  { title: 'Sectional Title Conduct Rules', group: 'Property documents', status: 'Shared', tone: 'info', description: 'Scheme conduct rules for the purchased unit.' },
  { title: 'Bank Statements', group: 'Bond documents', status: 'Received', tone: 'complete', description: 'Latest three months bank statements received.' },
  { title: 'Latest Payslip', group: 'Bond documents', status: 'Received', tone: 'complete', description: 'Included in the submitted bond application.' },
]

const DEMO_TEAM_UPDATES = [
  {
    person: 'Daniel Jacobs',
    role: 'Transfer Attorney',
    time: '28 Aug, 10:42',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
    message:
      "We've requested the rates clearance figures from the City of Cape Town. We're currently waiting for the municipality to issue them. There's nothing needed from you at this stage.",
  },
  {
    person: 'Priya Naidoo',
    role: 'Bond Originator',
    time: '26 Aug, 14:15',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=120&q=80',
    message: "Your completed application, including your latest payslip, has been submitted to ABSA, FNB, Nedbank and Standard Bank. We’re waiting for their responses; nothing is needed from you right now.",
  },
  {
    person: 'Sarah Williams',
    role: 'Buyer Agent',
    time: '13 Aug',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
    message: 'Your signed Offer to Purchase has been sent to Daniel at Tuckers Attorneys and your transfer file has been opened.',
  },
]

const DOCUMENT_CATEGORY_SUMMARY = [
  { label: 'FICA Documents', count: '2 of 2', status: 'Complete', tone: 'complete', icon: FileSignature },
  { label: 'Sale Documents', count: '1 of 2', status: 'In progress', tone: 'info', icon: FileText },
  { label: 'Property Documents', count: '1 of 2', status: 'Requested', tone: 'action', icon: Home },
  { label: 'Finance Documents', count: '2 of 2', status: 'Complete', tone: 'complete', icon: HandCoins },
  { label: 'Additional Documents', count: '0 of 2', status: 'Pending', tone: 'neutral', icon: Folder },
]

const BUYER_DOCUMENTS = [
  {
    id: 'latest-payslip',
    group: 'Your finance documents',
    title: 'Latest Payslip',
    description: 'Received and included in your submitted bond application.',
    status: 'Received',
    statusDetail: 'Included in bank submission · 26 Aug 2026',
    tone: 'complete',
    action: 'View',
    responsible: 'You',
    icon: FileText,
    detailTitle: 'Latest Payslip',
    detailDescription: 'Priya received your latest payslip and included it in the application submitted to the banks.',
    whatIsThis:
      'This helps the banks confirm your current income so they can assess the bond application accurately.',
    facts: [
      ['Status', 'Received and included in bank submission'],
      ['Needed for', 'Bond application'],
      ['Requested by', 'Priya Naidoo, Bond Originator'],
    ],
    activity: [
      ['Payslip received', '25 Aug 2026'],
      ['Submitted to banks', '26 Aug 2026'],
    ],
  },
  {
    id: 'signed-otp',
    group: 'Your transaction documents',
    title: 'Signed Offer to Purchase',
    description: 'The offer signed by you and the seller.',
    status: 'Signed',
    statusDetail: 'Signed 12 Aug 2026',
    tone: 'complete',
    action: 'View',
    responsible: 'Sarah Williams',
    icon: FileSignature,
    detailTitle: 'Signed Offer to Purchase',
    detailDescription: 'The offer signed by you and the seller setting out the terms of your purchase.',
    whatIsThis:
      'This is the agreement between you and the seller which sets out the purchase price, deposit, conditions and other important terms of the property purchase.',
    facts: [
      ['Status', 'Signed by all parties'],
      ['Signed', '12 Aug 2026'],
      ['Provided by', 'Sarah Williams, Vanguard Properties'],
      ['Shared with', 'Tuckers Attorneys'],
    ],
    activity: [
      ['Signed by buyer', '12 Aug 2026'],
      ['Signed by seller', '12 Aug 2026'],
      ['Shared with transfer attorneys', '12 Aug 2026'],
    ],
  },
  {
    id: 'sale-addendum',
    group: 'Your transaction documents',
    title: 'Sale Agreement Addendum',
    description: 'Your attorney is preparing this document.',
    status: 'Being prepared',
    statusDetail: 'Being prepared',
    tone: 'info',
    action: '',
    responsible: 'Transfer attorney',
    icon: FileText,
    detailTitle: 'Sale Agreement Addendum',
    detailDescription: 'An additional agreement used when the sale terms need to be clarified or updated.',
    whatIsThis:
      'An addendum records agreed changes or extra terms without replacing the original Offer to Purchase.',
    facts: [
      ['Status', 'Being prepared'],
      ['Responsible party', 'Daniel Jacobs, Transfer Attorney'],
    ],
    activity: [['Attorney started preparing addendum', '28 Aug, 11:05']],
  },
  {
    id: 'rates-clearance',
    group: 'Property & transfer documents',
    title: 'Rates Clearance Certificate',
    description: 'Requested from the City of Cape Town.',
    status: 'In progress',
    statusDetail: 'Rates figures requested · 21 Aug 2026',
    tone: 'info',
    action: '',
    responsible: 'Transfer attorney',
    icon: FileText,
    detailTitle: 'Rates Clearance Certificate',
    detailDescription: 'The municipality confirms what must be paid before the property can transfer.',
    whatIsThis:
      'Before transfer, the municipality must confirm the rates amount linked to the property. Once paid, they issue the certificate the attorneys need.',
    facts: [
      ['Status', 'Rates figures requested'],
      ['Waiting on', 'City of Cape Town'],
      ['Requested', '21 Aug 2026'],
    ],
    activity: [
      ['Rates figures requested from municipality', '21 Aug 2026'],
      ['Transfer attorney confirmed request', '21 Aug 2026'],
    ],
  },
  {
    id: 'conduct-rules',
    group: 'Property & transfer documents',
    title: 'Sectional Title Conduct Rules',
    description: 'Rules for the sectional title scheme.',
    status: 'Available',
    statusDetail: 'Available to view',
    tone: 'complete',
    action: 'View',
    responsible: 'Managing agent',
    icon: Home,
    detailTitle: 'Sectional Title Conduct Rules',
    detailDescription: 'Rules that explain how residents in the sectional title scheme should use and care for the property.',
    whatIsThis:
      'These rules help owners and residents understand what is allowed in the building or estate, including pets, parking and common areas.',
    facts: [
      ['Status', 'Available'],
      ['Provided by', 'Managing agent'],
    ],
    activity: [['Shared with buyer', '18 Aug 2026']],
  },
  {
    id: 'levy-clearance',
    group: 'Property & transfer documents',
    title: 'Levy Clearance Certificate',
    description: 'Will be requested once the levy account is finalised.',
    status: 'Not available yet',
    statusDetail: 'Not requested yet',
    tone: 'neutral',
    action: '',
    responsible: 'Managing agent',
    icon: FileText,
    detailTitle: 'Levy Clearance Certificate',
    detailDescription: 'A certificate confirming the levy account has been dealt with for transfer.',
    whatIsThis:
      'For sectional title properties, the body corporate or managing agent confirms the levy account before transfer can be completed.',
    facts: [
      ['Status', 'Not available yet'],
      ['Expected later', 'After levy account is finalised'],
    ],
    activity: [['Document expected later in transfer', 'Upcoming']],
  },
]

function buildDemoBuyerDocumentItems() {
  const statusById = {
    'latest-payslip': 'approved',
    'signed-otp': 'approved',
    'sale-addendum': 'under_review',
    'rates-clearance': 'under_review',
    'conduct-rules': 'approved',
    'levy-clearance': 'upcoming',
  }
  return BUYER_DOCUMENTS.map((document) => ({
    ...document,
    status: statusById[document.id] || document.status,
    uploadKey: document.id === 'latest-payslip' ? 'latest_payslip' : '',
    uploadSpec: document.id === 'latest-payslip'
      ? { type: 'requirement', requirementKey: 'latest_payslip' }
      : null,
    group: document.group,
    education: document.whatIsThis,
    metaLine: document.statusDetail,
  }))
}

const FINANCE_APPLICATION = {
  applicationStatus: 'Submitted to banks',
  statusHelper: 'Your application is with four banks for assessment. Nothing is needed from you right now.',
  requestedAmount: 'R 2 280 000',
  purchasePrice: 'R 2 850 000',
  loanToValue: '80%',
  originator: {
    name: 'Priya Naidoo',
    company: 'BetterBond',
    email: 'priya.demo@arch9.co.za',
    phone: '+27215550102',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=120&q=80',
  },
  currentStage: 'submitted',
  nextStep: {
    title: 'Bank responses',
    helper: 'We’ll update you as the banks respond.',
  },
  requiredActions: [],
  applicationDetails: {
    applicant: 'Mia Khumalo',
    income: 'R85 000 gross monthly',
    expenses: 'R30 700 monthly commitments',
    requestedBond: 'R2 280 000',
    loanToValue: '80%',
    employment: 'Full-time employed',
  },
  bankApplications: [
    {
      bankId: 'absa',
      bankName: 'ABSA',
      logo: '/brand/banks/absa.png',
      status: 'Awaiting response',
      statusTone: 'info',
      submittedDate: '26 Aug',
      requestedAmount: 'R2 280 000',
      latestUpdate: 'Application submitted. We will update you as soon as ABSA responds.',
    },
    {
      bankId: 'fnb',
      bankName: 'FNB',
      logo: '/brand/banks/fnb.png',
      status: 'Awaiting response',
      statusTone: 'info',
      submittedDate: '26 Aug',
      requestedAmount: 'R2 280 000',
      latestUpdate: 'Application submitted. We are waiting for feedback from FNB.',
    },
    {
      bankId: 'nedbank',
      bankName: 'Nedbank',
      logo: '/brand/banks/nedbank.png',
      status: 'Awaiting response',
      statusTone: 'info',
      submittedDate: '26 Aug',
      requestedAmount: 'R2 280 000',
      latestUpdate: 'Application submitted. Priya will update you as soon as Nedbank responds.',
    },
    {
      bankId: 'standard-bank',
      bankName: 'Standard Bank',
      logo: '/brand/banks/standard-bank.png',
      status: 'Awaiting response',
      statusTone: 'info',
      submittedDate: '26 Aug',
      requestedAmount: 'R2 280 000',
      latestUpdate: 'Application submitted. Priya will update you as soon as Standard Bank responds.',
    },
  ],
}

function buildDemoBuyerFinanceModel(demoUploadComplete = false) {
  const requiredActions = demoUploadComplete ? [] : FINANCE_APPLICATION.requiredActions
  const offers = FINANCE_APPLICATION.bankApplications.filter((bank) => bank.approvedAmount)
  return buildBuyerFinancePresentationModel({
    source: 'demo',
    financeType: 'bond',
    status: FINANCE_APPLICATION.applicationStatus,
    statusHelper: FINANCE_APPLICATION.statusHelper,
    currentStage: FINANCE_APPLICATION.currentStage,
    purchasePrice: FINANCE_APPLICATION.purchasePrice,
    requestedAmount: FINANCE_APPLICATION.requestedAmount,
    loanToValue: FINANCE_APPLICATION.loanToValue,
    progressPercent: 100,
    manager: FINANCE_APPLICATION.originator,
    nextStep: FINANCE_APPLICATION.nextStep,
    requiredActions,
    bankApplications: FINANCE_APPLICATION.bankApplications,
    offers,
  })
}

const DEMO_BOND_APPLICATION_SECTIONS = [
  { key: 'personal_details', label: 'Personal details', status: 'Complete', tone: 'complete' },
  { key: 'contact_address', label: 'Contact & address', status: 'Complete', tone: 'complete' },
  { key: 'employment', label: 'Employment', status: 'Complete', tone: 'complete' },
  { key: 'income_deductions_expenses', label: 'Income & expenses', status: 'Complete', tone: 'complete' },
  { key: 'banking_liabilities', label: 'Banking & liabilities', status: 'Complete', tone: 'complete' },
  { key: 'loan_details', label: 'Loan details', status: 'Complete', tone: 'complete' },
  { key: 'documents', label: 'Documents', status: 'Complete', tone: 'complete' },
  { key: 'declarations_consents', label: 'Declaration', status: 'Complete', tone: 'complete' },
]

const DEMO_BOND_APPLICATION_FIELD_GROUPS = {
  personal_details: [
    {
      title: 'Primary applicant',
      icon: UserRound,
      helper: 'Personal details needed by the bond originator and banks.',
      fields: [
        { key: 'first_names', label: 'First names', value: 'Mia Nomsa', source: 'Prefilled from your buyer profile', required: true },
        { key: 'surname', label: 'Surname', value: 'Khumalo', source: 'Prefilled from your buyer profile', required: true },
        { key: 'identity_number', label: 'ID number', value: '900512 **** 087', source: 'Prefilled from onboarding', required: true },
        { key: 'marital_status', label: 'Marital status', value: 'Single', type: 'select', options: ['Single', 'Married', 'Divorced', 'Widowed'], source: 'Prefilled from onboarding', required: true },
        { key: 'dependants', label: 'Number of dependants', value: '0', inputMode: 'numeric' },
        { key: 'main_residence', label: 'Main residence', value: 'Yes', type: 'select', options: ['Yes', 'No'] },
      ],
    },
  ],
  contact_address: [
    {
      title: 'Contact details',
      icon: Mail,
      helper: 'Communication and legal notice details used during the application.',
      fields: [
        { key: 'cellphone_number', label: 'Cellphone number', value: '+27 82 555 0194', source: 'Prefilled from your buyer profile', required: true },
        { key: 'email_address', label: 'Email address', value: 'mia.demo@example.com', type: 'email', source: 'Prefilled from your buyer profile', required: true },
        { key: 'residential_address', label: 'Residential address', value: DEMO_CURRENT_HOME_ADDRESS, source: 'Prefilled from onboarding', required: true },
        { key: 'residential_city', label: 'City', value: 'Cape Town', source: 'Prefilled from onboarding', required: true },
        { key: 'postal_code', label: 'Postal code', value: '8005', source: 'Prefilled from onboarding', required: true },
        { key: 'legal_notice_delivery_method', label: 'Legal notice delivery method', value: 'Email', type: 'select', options: ['Email', 'Residential address', 'Postal address'], required: true },
      ],
    },
  ],
  employment: [
    {
      title: 'Employment',
      icon: Building2,
      helper: 'Employment information used to prepare the affordability assessment.',
      fields: [
        { key: 'occupation_status', label: 'Occupation status', value: 'Permanent employee', type: 'select', options: ['Permanent employee', 'Contract employee', 'Self-employed', 'Commission-based', 'Retired'], source: 'Prefilled from your profile', required: true },
        { key: 'employer_name', label: 'Employer', value: 'Khumalo Advisory Group', source: 'Prefilled from your profile', required: true },
        { key: 'nature_of_occupation', label: 'Nature of occupation', value: 'Senior Financial Analyst', required: true },
        { key: 'employment_years', label: 'Employment years', value: '4', inputMode: 'numeric' },
        { key: 'employment_months', label: 'Employment months', value: '7', inputMode: 'numeric' },
        { key: 'works_in_south_africa', label: 'Works in South Africa', value: 'Yes', type: 'select', options: ['Yes', 'No'] },
      ],
    },
  ],
  income_deductions_expenses: [
    {
      title: 'Monthly income',
      icon: HandCoins,
      helper: '',
      fields: [
        { key: 'gross_salary', label: 'Gross monthly income', value: 'R 85 000', inputMode: 'decimal', source: 'Prefilled from your profile', required: true },
        { key: 'other_income', label: 'Other income (bonus, commission, etc.)', value: 'R 5 000', inputMode: 'decimal' },
      ],
    },
    {
      title: 'Monthly commitments',
      icon: Building2,
      helper: '',
      fields: [
        { key: 'bond_rent', label: 'Bond / rent', value: 'R 18 000', inputMode: 'decimal', required: true },
        { key: 'vehicle_finance', label: 'Vehicle finance', value: 'R 8 500', inputMode: 'decimal' },
        { key: 'credit_repayments', label: 'Credit repayments', value: 'R 4 200', inputMode: 'decimal' },
        { key: 'other_commitments', label: 'Other commitments', value: 'R 0', inputMode: 'decimal' },
      ],
    },
  ],
  banking_liabilities: [
    {
      title: 'Banking & liabilities',
      icon: Building2,
      helper: 'The banks use this to assess current commitments and debit-order readiness.',
      fields: [
        { key: 'primary_bank_name', label: 'Primary bank / institution', value: 'Standard Bank', required: true },
        { key: 'primary_account_type', label: 'Primary account type', value: 'Cheque / Current', type: 'select', options: ['Cheque / Current', 'Savings', 'Transmission'], required: true },
        { key: 'primary_account_number', label: 'Account number', value: '********4921', required: true },
        { key: 'preferred_debit_order_date', label: 'Preferred debit order date', value: '2026-09-01', type: 'date', required: true },
        { key: 'retail_current_balance', label: 'Retail account balance', value: 'R 7 200', inputMode: 'decimal' },
        { key: 'debt_review', label: 'Currently under debt review', value: 'No', type: 'select', options: ['Yes', 'No'], required: true },
      ],
    },
  ],
  loan_details: [
    {
      title: 'Property & loan details',
      icon: Home,
      helper: 'The loan instruction prepared for the bond originator and banks.',
      fields: [
        { key: 'street_or_complex', label: 'Street / complex', value: '2 Pine Avenue', source: 'Prefilled from your property', required: true },
        { key: 'suburb', label: 'Suburb', value: 'Sea Point', source: 'Prefilled from your property', required: true },
        { key: 'amount_to_be_registered', label: 'Amount to be registered', value: 'R 2 280 000', inputMode: 'decimal', source: 'Prefilled from your offer', required: true },
        { key: 'loan_to_value', label: 'Loan to value', value: '80%', readOnly: true },
        { key: 'selected_banks', label: 'Preferred lenders', value: 'ABSA, FNB, Nedbank, Standard Bank' },
        { key: 'solar_panels_included', label: 'Solar panels included', value: 'No', type: 'select', options: ['Yes', 'No'] },
      ],
    },
  ],
  declarations_consents: [
    {
      title: 'Declaration & consents',
      icon: Lock,
      helper: 'These are accepted before the submission pack is prepared.',
      fields: [
        { key: 'loan_processing_consent', label: 'I consent to loan processing and affordability assessment.', value: true, type: 'checkbox', required: true },
        { key: 'credit_bureau_consent', label: 'I consent to credit bureau, fraud and bank-data retrieval checks.', value: true, type: 'checkbox', required: true },
        { key: 'third_party_communication_consent', label: 'I consent to related third-party communication where required.', value: true, type: 'checkbox' },
        { key: 'declaration_accepted', label: 'I confirm that all information submitted is true and complete.', value: true, type: 'checkbox', required: true },
        { key: 'digital_signature_name', label: 'Digital signature name', value: 'Mia Khumalo', required: true },
        { key: 'digital_signature_date', label: 'Digital signature date', value: '2026-08-26', type: 'date', required: true },
      ],
    },
  ],
}

const DEMO_BOND_APPLICATION_DOCUMENTS = [
  { label: 'Buyer ID document', type: 'FICA', status: 'Uploaded', tone: 'complete' },
  { label: 'Three months bank statements', type: 'Income', status: 'Uploaded', tone: 'complete' },
  { label: 'Latest payslip', type: 'Income', status: 'Uploaded', tone: 'complete' },
  { label: 'Signed Offer to Purchase', type: 'Sale document', status: 'Linked', tone: 'complete' },
]

const BOND_JOURNEY_STAGES = [
  { id: 'application', label: 'Application', helper: 'Completed', icon: FileSignature },
  { id: 'submitted', label: 'Submitted to Banks', helper: 'With four banks', icon: Building2 },
  { id: 'responses', label: 'Bank Responses', helper: 'Waiting for responses', icon: MessageCircle },
  { id: 'approval', label: 'Approval', helper: 'Offer received', icon: CheckCircle2 },
  { id: 'guarantees', label: 'Guarantees', helper: 'Before registration', icon: Scale },
]

const TRANSACTION_TEAM = [
  {
    id: 'sarah-williams',
    name: 'Sarah Williams',
    profileImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80',
    initials: 'SW',
    role: 'Buyer Agent',
    organisation: 'Vanguard Properties',
    description: "Sarah is your main point of contact and can help if you're unsure who to speak to.",
    currentActivity: 'General questions about your purchase',
    email: 'sarah.demo@arch9.co.za',
    phone: '+27215550100',
    messagingAvailable: true,
    isMainContact: true,
    isActive: false,
    responsibilities: ['General transaction questions', "What's happening next", 'Questions about the property', 'Unsure who to contact'],
    relatedTransactionStages: ['overview', 'coordination'],
  },
  {
    id: 'daniel-jacobs',
    name: 'Daniel Jacobs',
    profileImage: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80',
    initials: 'DJ',
    role: 'Transfer Attorney',
    organisation: 'Tuckers Attorneys',
    description: 'Daniel is responsible for the legal transfer of the property into your name.',
    currentActivity: 'Waiting for rates clearance figures',
    email: 'daniel.demo@arch9.co.za',
    phone: '+27215550101',
    messagingAvailable: true,
    isMainContact: false,
    isActive: true,
    responsibilities: ['Legal transfer', 'Transfer documents', 'Rates clearance', 'Guarantees', 'Lodgement', 'Registration'],
    relatedTransactionStages: ['rates-clearance', 'transfer', 'registration'],
  },
  {
    id: 'priya-naidoo',
    name: 'Priya Naidoo',
    profileImage: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=240&q=80',
    initials: 'PN',
    role: 'Bond Originator',
    organisation: 'BetterBond',
    description: 'Priya manages your bond application and communicates with the banks on your behalf.',
    currentActivity: 'Awaiting responses from four banks',
    email: 'priya.demo@arch9.co.za',
    phone: '+27215550102',
    messagingAvailable: true,
    isMainContact: false,
    isActive: false,
    responsibilities: ['Bond application', 'Bank submissions', 'Bank responses', 'Interest rates', 'Bond offers', 'Finance documentation'],
    relatedTransactionStages: ['finance'],
  },
  {
    id: 'lerato-mokoena',
    name: 'Lerato Mokoena',
    profileImage: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=240&q=80',
    initials: 'LM',
    role: 'Conveyancing Secretary',
    organisation: 'Tuckers Attorneys',
    description: 'Lerato assists with transfer documentation, signing arrangements and the administration required for registration.',
    currentActivity: 'Preparing transfer documentation',
    email: 'lerato.demo@arch9.co.za',
    phone: '+27215550103',
    messagingAvailable: true,
    isMainContact: false,
    isActive: false,
    responsibilities: ['Document requests', 'Signing appointments', 'Missing documents', 'Administrative transfer questions'],
    relatedTransactionStages: ['documents', 'signing'],
  },
  {
    id: 'home-insurance-team',
    name: 'Home insurance team',
    initials: 'HI',
    role: 'Home Insurance Advisor',
    organisation: 'Demo insurance partner',
    description: 'Your home insurance team helps you compare building and household contents cover, understand your policy and get help with claims.',
    currentActivity: 'Building cover, contents and claims',
    email: 'home-insurance.demo@arch9.co.za',
    messagingAvailable: true,
    isMainContact: false,
    isActive: false,
    responsibilities: ['Building insurance', 'Household contents', 'Policy questions', 'Claims guidance'],
    relatedTransactionStages: ['insurance'],
  },
  {
    id: 'bond-life-team',
    name: 'Bond Life team',
    initials: 'BL',
    role: 'Life Cover Specialist',
    organisation: 'Vermillion',
    description: 'Your life cover team helps you explore Bond Life and Bond Life Plus and understand the cover options for your bond.',
    currentActivity: 'Bond Life and Bond Life Plus',
    email: 'bond-life.demo@arch9.co.za',
    messagingAvailable: true,
    isMainContact: false,
    isActive: false,
    responsibilities: ['Bond Life', 'Bond Life Plus', 'Life cover questions'],
    relatedTransactionStages: ['insurance', 'finance'],
  },
]

const CONVEYANCING_STAGES = [
  {
    id: 'attorneys-instructed',
    number: '01',
    title: 'Transfer attorneys instructed',
    shortDescription: 'The signed OTP has been received and the transfer file has been opened.',
    status: 'completed',
    completedDate: '13 Aug',
    educationalDescription:
      'The transfer attorney opens the file, checks the sale details, and starts preparing the legal work needed to move the property into your name.',
  },
  {
    id: 'fica-collected',
    number: '02',
    title: 'Documents & FICA collected',
    shortDescription: 'The attorneys collect the required buyer and seller information and supporting documents.',
    status: 'completed',
    completedDate: '15 Aug',
    educationalDescription:
      'Before transfer can continue, the attorneys need to confirm everyone involved and collect the basic documents required for the sale.',
  },
  {
    id: 'rates-clearance',
    number: '03',
    title: 'Rates & clearance figures requested',
    shortDescription:
      'The transfer attorney has requested the rates clearance figures from the City of Cape Town and is preparing the transfer documents.',
    status: 'current',
    currentStatus: 'Waiting for municipality',
    waitingOn: 'City of Cape Town',
    estimatedDuration: '5 - 10 business days',
    buyerAction: 'Nothing right now',
    buyerActionDetail: "We'll let you know if anything is needed.",
    latestUpdate: {
      person: 'Daniel Jacobs',
      role: 'Transfer Attorney',
      time: '28 Aug, 10:42',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
      message: 'Rates figures were requested on 21 August. We are currently waiting for the City of Cape Town to issue them.',
    },
    educationalDescription:
      'Before a property can be transferred, the municipality needs to confirm the amounts that must be settled on the property. Once the required amounts are paid, the municipality issues the clearance certificate needed for transfer.',
  },
  {
    id: 'guarantees-finance',
    number: '04',
    title: 'Guarantees & finance',
    shortDescription: 'The bank and bond attorneys arrange the guarantees required for the purchase price.',
    status: 'upcoming',
    educationalDescription:
      'The bank confirms how the purchase money will be guaranteed, so the seller and attorneys know the funds will be available on registration.',
  },
  {
    id: 'documents-signed',
    number: '05',
    title: 'Transfer documents signed',
    shortDescription: 'The buyer and seller sign the documents required to transfer the property.',
    status: 'upcoming',
    educationalDescription:
      'You and the seller sign the legal transfer documents. These documents allow the attorneys to lodge the transfer at the Deeds Office.',
  },
  {
    id: 'compliance-clearances',
    number: '06',
    title: 'Compliance & clearances',
    shortDescription: 'Rates clearance, levy clearance and other required certificates are obtained.',
    status: 'upcoming',
    educationalDescription:
      'The attorneys collect the certificates needed to prove that the property is ready to transfer, including municipal and sectional title clearances where applicable.',
  },
  {
    id: 'deeds-office',
    number: '07',
    title: 'Lodged at the Deeds Office',
    shortDescription: 'The transfer, bond and cancellation documents are lodged together at the Deeds Office for examination.',
    status: 'upcoming',
    educationalDescription:
      'The attorneys submit the transfer documents to the Deeds Office, where examiners check that everything is correct before registration.',
  },
  {
    id: 'registration',
    number: '08',
    title: 'Registration',
    shortDescription: "The property is officially registered in the buyer's name.",
    status: 'upcoming',
    educationalDescription:
      'Ownership officially transfers into your name. Once registration is confirmed, the purchase is complete.',
  },
]

function getDemoPath(token = '', section = 'overview') {
  const safeSection = section && section !== 'overview' ? `/${section}` : ''
  return `/demo/${token}/buyer${safeSection}`
}

function statusClasses(tone = 'info') {
  if (tone === 'complete') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (tone === 'action') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (tone === 'neutral') return 'border-slate-200 bg-slate-50 text-slate-600'
  return 'border-sky-200 bg-sky-50 text-sky-700'
}

function ProspectBuyerDemoLoading() {
  return (
    <main className="min-h-screen bg-[#f3f6fb] text-[#142132]" aria-busy="true">
      <div className="flex min-h-screen">
        <aside className="hidden w-[264px] shrink-0 bg-[#152432] p-6 lg:block" aria-hidden="true">
          <div className="h-12 w-36 animate-pulse rounded-[12px] bg-white/12" />
          <div className="mt-8 grid gap-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="h-11 animate-pulse rounded-[12px] bg-white/8" key={index} />
            ))}
          </div>
        </aside>
        <section className="w-full px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-[1280px]">
            <div className="h-[300px] animate-pulse rounded-[24px] bg-slate-200 sm:h-[360px]" aria-hidden="true" />
            <div className="mt-6 grid gap-5 lg:grid-cols-2" aria-hidden="true">
              <div className="h-64 animate-pulse rounded-[22px] bg-white" />
              <div className="h-64 animate-pulse rounded-[22px] bg-white" />
            </div>
            <p className="sr-only" role="status" aria-live="polite">Loading buyer portal</p>
          </div>
        </section>
      </div>
    </main>
  )
}

export default function ProspectBuyerDemo() {
  const { token = '', section = 'overview' } = useParams()
  const activeSection = ['overview', 'progress', 'documents', 'finance', 'bond-application', 'messages', 'team', 'insurance', 'maintenance', 'move'].includes(section) ? section : 'overview'
  const [config, setConfig] = useState(DEFAULT_BRAND)
  const [loading, setLoading] = useState(true)
  const [loadedConfigToken, setLoadedConfigToken] = useState('')
  const demoUploadComplete = false
  const [demoUploadNotice, setDemoUploadNotice] = useState(false)

  useEffect(() => {
    if (!loading && ['finance', 'insurance', 'maintenance', 'move'].includes(activeSection)) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
  }, [activeSection, loading, token])

  useEffect(() => {
    let cancelled = false
    async function loadConfig() {
      setLoading(true)
      const resolved = await resolveProspectDemoConfig(token)
      if (cancelled) return
      setConfig({
        ...DEFAULT_BRAND,
        ...resolved,
        agencyName: resolved.agencyName || DEFAULT_BRAND.agencyName,
        logoDarkUrl: resolved.logoDarkUrl || resolved.logoUrl || DEFAULT_BRAND.logoDarkUrl,
        logoLightUrl: resolved.logoLightUrl || resolved.logoUrl || resolved.logoDarkUrl || DEFAULT_BRAND.logoLightUrl,
        primaryColour: resolved.primaryColour || DEFAULT_BRAND.primaryColour,
        secondaryColour: resolved.secondaryColour || resolved.primaryColour || DEFAULT_BRAND.secondaryColour,
        accentColour: resolved.accentColour || DEFAULT_BRAND.accentColour,
        samplePropertyImageUrl: resolved.samplePropertyImageUrl || DEFAULT_BRAND.samplePropertyImageUrl,
        samplePropertyAddress: resolved.samplePropertyAddress || DEFAULT_BRAND.samplePropertyAddress,
      })
      setLoadedConfigToken(token)
      setLoading(false)
    }
    void loadConfig()
    return () => {
      cancelled = true
    }
  }, [token])

  const brand = useMemo(() => {
    const theme = createBuyerPortalTheme({
      primaryColour: config.primaryColour || DEFAULT_BRAND.primaryColour,
      secondaryColour: config.secondaryColour || config.primaryColour || DEFAULT_BRAND.secondaryColour,
      accentColour: config.accentColour || DEFAULT_BRAND.accentColour,
    })
    return theme
  }, [config.accentColour, config.primaryColour, config.secondaryColour])
  const transactionTeam = useMemo(
    () => TRANSACTION_TEAM.map((member) => ({
      ...member,
      organisation: member.organisation === 'Vanguard Properties' ? config.agencyName : member.organisation,
    })),
    [config.agencyName],
  )
  const buyerDocumentModel = useMemo(
    () => buildBuyerDocumentPresentationModel({
      items: buildDemoBuyerDocumentItems(demoUploadComplete),
      source: 'demo',
    }),
    [demoUploadComplete],
  )
  const buyerFinanceModel = useMemo(
    () => buildDemoBuyerFinanceModel(demoUploadComplete),
    [demoUploadComplete],
  )
  const buyerTeamModel = useMemo(
    () => buildBuyerTeamPresentationModel({
      source: 'demo',
      members: transactionTeam,
      heading: 'Your transaction team',
      description: 'The people helping you through your purchase, finance, and transfer.',
      currentProcess: {
        title: 'Rates & clearance figures',
        helper: 'Waiting for the municipality response',
        status: 'In progress',
      },
    }),
    [transactionTeam],
  )
  const buyerPortalCutoverReadiness = buildBuyerPortalCutoverReadiness({
    source: 'demo',
    models: {
      journey: DEMO_BUYER_JOURNEY_MODEL,
      documents: buyerDocumentModel,
      finance: buyerFinanceModel,
      team: buyerTeamModel,
    },
    capabilities: {
      documentSimulation: true,
      financeSimulation: true,
      contactActions: true,
    },
  })
  const handleDemoUploadRequest = () => {
    setDemoUploadNotice(true)
  }

  if (!token) return <Navigate to="/" replace />
  if (loading || loadedConfigToken !== token) return <ProspectBuyerDemoLoading />

  const heroOverlayStyle = brand.heroOverlayStyle

  return (
    <DemoHomeSupportProvider key={token}>
    <main
      className="min-h-screen bg-[#f3f6fb] text-[#142132]"
      data-buyer-portal-release={buyerPortalCutoverReadiness.phase}
      data-buyer-portal-aligned={buyerPortalCutoverReadiness.releaseLabel}
      data-buyer-portal-source={buyerPortalCutoverReadiness.source}
    >
      <BuyerPortalDesktopSidebar
        brandName={config.agencyName}
        brandLogoUrl={config.logoDarkUrl}
        brandDescriptor=""
        theme={brand}
        items={DEMO_NAV}
        activeItemKey={activeSection}
        getItemPath={(item) => getDemoPath(token, item.key)}
        showSupportPanel={false}
      />

      <section className="lg:hidden">
        <MobileBuyerPortal
          activeSection={activeSection}
          brand={brand}
          config={config}
          token={token}
          loading={loading}
          demoUploadComplete={demoUploadComplete}
          financeModel={buyerFinanceModel}
          teamModel={buyerTeamModel}
          demoUploadNotice={demoUploadNotice}
          onCompleteUpload={handleDemoUploadRequest}
        />
      </section>

      <section className="hidden min-h-screen lg:block lg:pl-[264px]">
        <div className="w-full px-6 py-8 2xl:px-8">
          <DemoContent
            activeSection={activeSection}
            brand={brand}
            config={config}
            token={token}
            heroOverlayStyle={heroOverlayStyle}
            loading={loading}
            demoUploadComplete={demoUploadComplete}
            documentModel={buyerDocumentModel}
            financeModel={buyerFinanceModel}
            teamModel={buyerTeamModel}
            demoUploadNotice={demoUploadNotice}
            onCompleteUpload={handleDemoUploadRequest}
          />
        </div>
      </section>
    </main>
    </DemoHomeSupportProvider>
  )
}

function MobileBuyerPortal({ activeSection, brand, config, token, loading, demoUploadComplete, financeModel, teamModel, demoUploadNotice, onCompleteUpload }) {
  const [demoClosed, setDemoClosed] = useState(false)
  const [demoUploadSheetOpen, setDemoUploadSheetOpen] = useState(false)
  const mobileSection = activeSection
  const openDemoUploadSheet = () => setDemoUploadSheetOpen(true)
  const confirmDemoUpload = () => {
    setDemoUploadSheetOpen(false)
    onCompleteUpload()
  }
  const pageTitles = {
    overview: '',
    progress: 'Transfer Journey',
    documents: '',
    finance: '',
    insurance: '',
    maintenance: '',
    move: '',
    'bond-application': 'Bond application',
    messages: '',
    team: 'Your team',
  }

  if (demoClosed) return (
    <div className="prospect-buyer-mobile flex min-h-screen items-center justify-center bg-[#f7f9fc] p-6">
      <section className="w-full max-w-[360px] rounded-[12px] border border-[#dbe5ef] bg-white p-6 text-center">
        <img src={config.logoLightUrl || config.logoDarkUrl} alt={`${config.agencyName} logo`} className="mx-auto mb-6 max-h-12 max-w-[180px] object-contain" />
        <h1 className="text-xl font-semibold text-[#142132]">You’ve left the demo</h1>
        <p className="mt-2 text-sm leading-6 text-[#667085]">You can reopen the buyer portal whenever you’re ready.</p>
        <button type="button" onClick={() => setDemoClosed(false)} className="mt-6 min-h-11 w-full rounded-[8px] text-sm font-semibold text-white" style={{ backgroundColor: brand.primary }}>Reopen demo</button>
      </section>
    </div>
  )

  return (
    <div className="prospect-buyer-mobile min-h-screen bg-[#f7f9fc] pb-[calc(88px+env(safe-area-inset-bottom))] text-[#142132]">
      <div className="mx-auto max-w-[430px] px-4 pt-4">
        <MobileHeader
          activeSection={mobileSection}
          agencyName={config.agencyName}
          logoUrl={config.logoLightUrl || config.logoDarkUrl}
          brand={brand}
          title={pageTitles[mobileSection]}
          onLogout={() => setDemoClosed(true)}
          token={token}
        />

        {demoUploadNotice ? <DemoModeNotice /> : null}

        {mobileSection === 'overview' ? (
          <MobileOverview
            brand={brand}
            config={config}
            loading={loading}
            demoUploadComplete={demoUploadComplete}
            onCompleteUpload={openDemoUploadSheet}
            token={token}
          />
        ) : null}
        {mobileSection === 'progress' ? <MobileTransferJourney brand={brand} token={token} demoUploadComplete={demoUploadComplete} onCompleteUpload={openDemoUploadSheet} /> : null}
        {mobileSection === 'documents' ? (
          <MobileDocuments
            brand={brand}
            config={config}
            demoUploadComplete={demoUploadComplete}
            onCompleteUpload={openDemoUploadSheet}
          />
        ) : null}
        {mobileSection === 'finance' ? <MobileFinance brand={brand} model={financeModel} onCompleteUpload={openDemoUploadSheet} token={token} /> : null}
        {mobileSection === 'insurance' ? <DemoInsuranceWorkspace theme={brand} propertyAddress={config.samplePropertyAddress} compact /> : null}
        {mobileSection === 'maintenance' ? <DemoMaintenanceWorkspace theme={brand} propertyAddress={config.samplePropertyAddress} compact /> : null}
        {mobileSection === 'move' ? <DemoMoveWorkspace theme={brand} propertyAddress={config.samplePropertyAddress} currentAddress={`${DEMO_CURRENT_HOME_ADDRESS}, Cape Town`} compact /> : null}
        {mobileSection === 'bond-application' ? <MobileBondApplication brand={brand} demoUploadComplete={demoUploadComplete} token={token} /> : null}
        {mobileSection === 'messages' ? <MobileMessages brand={brand} token={token} /> : null}
        {mobileSection === 'team' ? <MobileTeam brand={brand} model={teamModel} /> : null}
      </div>
      <MobileBottomNav activeSection={mobileSection} brand={brand} token={token} />
      <BuyerMobileActionSheet
        isOpen={demoUploadSheetOpen}
        onClose={() => setDemoUploadSheetOpen(false)}
        eyebrow="Secure document upload"
        title="Upload latest payslip"
        description="In the live buyer portal, you can take a photo or choose a saved PDF. This demo keeps your data private and does not accept files."
        labelledBy="demo-buyer-upload-title"
      >
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" disabled className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[18px] border border-[#dfe5ec] bg-[#fbfcfd] text-sm font-semibold text-[#98a2b3]">
              <UploadCloud size={20} />
              Take photo
            </button>
            <button type="button" disabled className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[18px] border border-[#dfe5ec] bg-[#fbfcfd] text-sm font-semibold text-[#98a2b3]">
              <FileText size={20} />
              Choose file
            </button>
          </div>
          <button type="button" onClick={confirmDemoUpload} className="flex min-h-12 w-full items-center justify-center rounded-[14px] text-sm font-semibold text-white" style={{ backgroundColor: brand.primary }}>
            Continue in demo
          </button>
        </div>
      </BuyerMobileActionSheet>
    </div>
  )
}

function MobileHeader({ agencyName, logoUrl, brand, title, onLogout, token }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (!profileOpen) return undefined
    profileRef.current?.querySelector('button')?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setProfileOpen(false)
        triggerRef.current?.focus()
      }
    }
    const onPointerDown = (event) => {
      if (!profileRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setProfileOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [profileOpen])

  return (
    <>
      <BuyerMobileHeader
        brand={brand}
        brandName={agencyName}
        logoUrl={logoUrl}
        appearance="light"
        homePath={getDemoPath(token, 'overview')}
        actions={(
          <button ref={triggerRef} type="button" onClick={() => setProfileOpen((open) => !open)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e2e8ef] bg-[#f7f9fc] text-[#344054]" aria-label="Your profile" aria-expanded={profileOpen} aria-controls="buyer-demo-profile-menu">
            <UserRound size={21} strokeWidth={1.7} aria-hidden="true" />
          </button>
        )}
        menu={profileOpen ? (
          <div id="buyer-demo-profile-menu" ref={profileRef} className="absolute right-0 top-[calc(100%+8px)] z-50 w-[228px] rounded-[12px] border border-[#dbe5ef] bg-white p-2 text-[#142132] shadow-[0_12px_36px_rgba(15,23,42,0.14)]" aria-label="Your profile">
            <div className="border-b border-[#edf0f3] px-3 py-3">
              <p className="text-sm font-semibold">Mia Khumalo</p>
              <p className="mt-0.5 text-xs text-[#667085]">Buyer · {agencyName}</p>
            </div>
            <button type="button" onClick={() => { setProfileOpen(false); onLogout() }} className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 text-sm font-medium text-[#344054] hover:bg-[#f7f9fc]"><LogOut size={17} aria-hidden="true" />Log out</button>
          </div>
        ) : null}
      />
      {title ? <h1 className="mb-4 text-xl font-semibold tracking-[-0.025em] text-[#142132]">{title}</h1> : null}
    </>
  )
}

function DemoModeNotice() {
  return (
    <div role="status" aria-live="polite" className="mb-3 rounded-[14px] border border-sky-200 bg-sky-50 px-3 py-2 text-sm leading-5 text-sky-900">
      Demo mode: uploads are disabled. In a live portal, this request opens secure file selection and only updates after a file is received.
    </div>
  )
}

function MobileMessages({ brand, token }) {
  return (
    <section id="mobile-transaction-updates" aria-label="Updates from your transaction team" className="space-y-4">
      <p className="text-xs leading-5 text-[#7b8491]">Your transaction updates, in one place.</p>
      <ol className="space-y-5">
        {DEMO_TEAM_UPDATES.map((update) => {
          const [day, time] = update.time.split(', ')
          return (
            <li key={`${update.person}-${update.time}`}>
              <div className="mb-2 flex items-center gap-3">
                <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[#7b8491]">{day}</h2>
                <span className="h-px flex-1 bg-[#e4e9ef]" aria-hidden="true" />
              </div>
              <article className="rounded-[12px] border border-[#dbe5ef] bg-white p-4">
                <div className="flex items-start gap-3">
                  <img src={update.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" loading="lazy" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold leading-5 text-[#142132]">{update.person}</h3>
                    <p className="mt-0.5 text-xs leading-4 text-[#7b8491]">{update.role}</p>
                  </div>
                  {time ? <time className="shrink-0 pt-0.5 text-[0.65rem] text-[#98a2b3]">{time}</time> : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-[#52657b]">{update.message}</p>
                {update.role === 'Bond Originator' ? <Link to={getDemoPath(token, 'finance')} className="mt-3 inline-flex min-h-11 items-center gap-2 border-t border-[#edf0f3] pt-2 text-xs font-semibold" style={{ color: brand.primary }}><Building2 size={15} aria-hidden="true" />View bank applications<ChevronRight size={14} aria-hidden="true" /></Link> : null}
              </article>
            </li>
          )
        })}
      </ol>
      <Link to={getDemoPath(token, 'team')} className="flex min-h-[72px] items-center gap-3 rounded-[12px] border border-[#dbe5ef] bg-white p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px]" style={{ color: brand.primary, backgroundColor: hexToRgba(brand.primary, 0.06) }}><Users size={18} aria-hidden="true" /></span>
        <span className="flex-1"><span className="block text-sm font-semibold text-[#142132]">Need a hand?</span><span className="mt-0.5 block text-xs text-[#667085]">Contact your team</span></span>
        <ChevronRight size={17} className="shrink-0" style={{ color: brand.primary }} aria-hidden="true" />
      </Link>
    </section>
  )
}

function MobileBottomNav({ activeSection, brand, token }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const menuItems = DEMO_NAV.filter((item) => !['overview', 'progress', 'documents', 'finance'].includes(item.key))
  const closeMenu = () => {
    setMenuOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!menuOpen) return undefined
    menuRef.current?.querySelector('a')?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const items = [...MOBILE_DEMO_NAV.filter((item) => item.key !== 'team').map((item) => ({
    ...item,
    mobileLabel: item.key === 'progress' ? 'Journey' : item.key === 'documents' ? 'Docs' : item.key === 'team' ? 'Team' : item.label,
    isActive: (currentKey) => item.key === 'finance' && currentKey === 'bond-application',
  })), {
    key: 'menu',
    label: 'Menu',
    icon: ArrowUpLeft,
    expanded: menuOpen,
    controls: 'buyer-demo-bottom-menu',
    isActive: (currentKey) => menuOpen || (currentKey !== 'bond-application' && menuItems.some((item) => item.key === currentKey)),
    onClick: (event) => {
      triggerRef.current = event.currentTarget
      setMenuOpen((open) => !open)
    },
  }]

  return (
    <>
      {menuOpen ? <button type="button" className="fixed inset-0 z-30 bg-black/10 lg:hidden" aria-label="Close navigation menu" onClick={closeMenu} /> : null}
      <BuyerMobileBottomNavigation
        items={items}
        activeKey={activeSection}
        onNavigate={() => setMenuOpen(false)}
        getPath={(item) => getDemoPath(token, item.key)}
        activeStyle={{ backgroundColor: hexToRgba(brand.primary, 0.1), color: brand.primary }}
        menu={menuOpen ? (
          <div id="buyer-demo-bottom-menu" ref={menuRef} className="buyer-demo-bottom-menu absolute bottom-[calc(100%+10px)] right-0 w-[260px] max-w-[calc(100vw-24px)] rounded-[12px] border border-[#dbe5ef] bg-white p-2 shadow-[0_12px_40px_rgba(15,23,42,0.16)]" aria-label="More buyer portal pages">
            <p className="px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#667085]">Explore</p>
            {menuItems.map((item) => {
              const Icon = item.icon
              const active = item.key === activeSection
              return <Link key={item.key} to={getDemoPath(token, item.key)} onClick={closeMenu} aria-current={active ? 'page' : undefined} className="flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-sm font-medium text-[#344054] hover:bg-[#f7f9fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]" style={active ? { backgroundColor: hexToRgba(brand.primary, 0.08), color: brand.primary } : undefined}><Icon size={18} aria-hidden="true" />{item.label}</Link>
            })}
          </div>
        ) : null}
      />
    </>
  )
}

function MobileOverview({ brand, config, demoUploadComplete, onCompleteUpload, token }) {
  const addressParts = config.samplePropertyAddress.split(',')
  const primaryAddress = addressParts.slice(0, 2).join(',').trim()
  const areaAddress = addressParts.slice(2).join(',').trim() || 'Sea Point, Cape Town'

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-[22px] border border-[#dbe5ef] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)]" aria-label="Your purchase">
        <BuyerMobilePropertyHero imageUrl={config.samplePropertyImageUrl} imageAlt={config.samplePropertyAddress} theme={brand} className="!rounded-none !shadow-none">
          <div className="flex min-h-[200px] flex-col justify-end p-4">
            <h1 className="text-[1.35rem] font-semibold leading-[1.3] tracking-[-0.025em] text-white [overflow-wrap:anywhere]">{primaryAddress}</h1>
            <p className="mt-1 text-sm leading-5 text-white/90">{areaAddress}</p>
          </div>
        </BuyerMobilePropertyHero>
        <div className="p-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs leading-5">
              <strong className="font-semibold text-[#344054]">{DEMO_BUYER_JOURNEY_MODEL.progressPercent}% complete</strong>
              <span className="inline-flex items-center gap-1.5 text-[#52657b]"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />On track</span>
            </div>
            <div role="progressbar" aria-label="Purchase progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={DEMO_BUYER_JOURNEY_MODEL.progressPercent} className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf0f3]">
              <div className="h-full rounded-full" style={{ backgroundColor: brand.primary, width: `${DEMO_BUYER_JOURNEY_MODEL.progressPercent}%` }} />
            </div>
          </div>
        </div>
      </section>

      <MobilePurchaseJourneyStrip brand={brand} token={token} />

      <DemoInsurancePromotion theme={brand} to={getDemoPath(token, 'insurance')} />

      <MobileDocumentTracker brand={brand} token={token} demoUploadComplete={demoUploadComplete} onCompleteUpload={onCompleteUpload} />

    </div>
  )
}

function MobilePurchaseJourneyStrip({ brand, token }) {
  const currentIndex = DEMO_JOURNEY_STAGES.findIndex((stage) => stage.status === 'current')
  const nearbyStages = DEMO_JOURNEY_STAGES.slice(Math.max(0, currentIndex - 1), currentIndex + 2)

  return (
    <section className="rounded-[18px] border border-[#dbe5ef] bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-[#142132]">Your journey</h2>
      <ol aria-label="Previous, current and next purchase stages">
        {nearbyStages.map((stage, index) => {
          const isCurrent = stage.status === 'current'
          const isComplete = stage.status === 'complete'
          return (
            <li key={stage.id} className={`relative grid grid-cols-[24px_minmax(0,1fr)] gap-3 ${index < nearbyStages.length - 1 ? 'pb-3' : ''}`} aria-current={isCurrent ? 'step' : undefined}>
              {index < nearbyStages.length - 1 ? <span className="absolute bottom-0 left-[11px] top-6 w-px bg-[#e4e9ef]" aria-hidden="true" /> : null}
              <span className="relative z-10 mt-2 flex h-6 w-6 items-center justify-center bg-white" aria-hidden="true">
                {isComplete ? <CheckCircle2 size={17} className="text-emerald-600" /> : isCurrent ? <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: hexToRgba(brand.primary, 0.1) }}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand.primary }} /></span> : <span className="h-2 w-2 rounded-full bg-[#c7d1dc]" />}
              </span>
              <div className={isCurrent ? 'rounded-[12px] p-3' : 'py-2'} style={isCurrent ? { backgroundColor: hexToRgba(brand.primary, 0.04) } : undefined}>
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-[#667085]">{isCurrent ? 'Current stage' : isComplete ? 'Completed' : 'Up next'}</p>
                <h3 className={`mt-1 font-semibold ${isCurrent ? 'text-base text-[#142132]' : 'text-sm text-[#667085]'}`}>{stage.label}</h3>
                {isCurrent ? <p className="mt-1 text-sm leading-5 text-[#52657b]">{stage.description}</p> : null}
                {isComplete && stage.completionDate ? <p className="mt-0.5 text-xs text-[#98a2b3]">{stage.completionDate}</p> : null}
              </div>
            </li>
          )
        })}
      </ol>
      <Link to={getDemoPath(token, 'progress')} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1 border-t border-[#edf0f3] pt-3 text-sm font-semibold" style={{ color: brand.primary }}>
        View full journey<ChevronRight size={16} aria-hidden="true" />
      </Link>
    </section>
  )
}

function MobileDocumentTracker({ brand, token, demoUploadComplete, onCompleteUpload }) {
  const documents = buildDemoBuyerDocumentItems(demoUploadComplete)
  const readyCount = documents.filter((document) => document.status === 'approved').length
  const neededCount = documents.filter((document) => document.status === 'required').length
  const preparingCount = documents.filter((document) => document.status === 'under_review').length
  const upcomingCount = documents.filter((document) => document.status === 'upcoming').length

  return (
    <section className="overflow-hidden rounded-[12px] border border-[#dbe5ef] bg-white" aria-labelledby="mobile-document-tracker-title">
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="mobile-document-tracker-title" className="text-sm font-semibold text-[#142132]">Your documents</h2>
          <span className="text-xs font-medium text-[#667085]">{readyCount} of {documents.length} ready</span>
        </div>
        <div role="progressbar" aria-label="Documents ready" aria-valuemin={0} aria-valuemax={documents.length} aria-valuenow={readyCount} aria-valuetext={`${readyCount} of ${documents.length} documents ready`} className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-[#edf0f3]">
          <span className="h-full rounded-full bg-emerald-500" style={{ width: `${readyCount / documents.length * 100}%` }} />
        </div>
        <p className="mt-2 text-xs leading-5 text-[#667085]" aria-live="polite">{neededCount} needed · {preparingCount} in progress · {upcomingCount} upcoming</p>
      </div>
      <ul className="buyer-document-carousel flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]" tabIndex={0} aria-label="Document cards — swipe to browse">
        {documents.map((document) => {
          const isReady = document.status === 'approved'
          const isNeeded = document.status === 'required'
          const isUpcoming = document.status === 'upcoming'
          const statusLabel = isReady ? 'Ready' : isNeeded ? 'Upload needed' : isUpcoming ? 'Upcoming' : 'In progress'
          const DocumentIcon = document.icon
          const toneClass = isReady ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : isNeeded ? 'border-amber-100 bg-amber-50 text-amber-800' : isUpcoming ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-sky-100 bg-sky-50 text-sky-700'
          return (
            <li key={document.id} className={`flex w-[82%] max-w-[280px] shrink-0 snap-start flex-col rounded-[12px] border p-4 ${isNeeded ? 'border-amber-200 bg-[#fffdf7]' : 'border-[#e2e8ef] bg-[#fbfcfe]'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-white bg-white shadow-sm" style={{ color: brand.primary }}><DocumentIcon size={21} strokeWidth={1.6} aria-hidden="true" /></span>
                <span className={`rounded-full border px-2 py-1 text-[0.6rem] font-semibold ${toneClass}`}>{statusLabel}</span>
              </div>
              <p className="mt-4 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-[#7b8491]">{document.group}</p>
              <h3 className="mt-1 min-h-12 text-base font-semibold leading-6 tracking-[-0.02em] text-[#142132]">{document.title}</h3>
              <p className="mt-2 flex-1 text-xs leading-5 text-[#667085]">{document.id === 'latest-payslip' && demoUploadComplete ? 'Your payslip has been received for review.' : document.description}</p>
              {isNeeded ? (
                <button type="button" onClick={onCompleteUpload} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] text-sm font-semibold text-white" style={{ backgroundColor: brand.primary }} aria-label={`Upload ${document.title}`}><UploadCloud size={16} aria-hidden="true" />Upload document</button>
              ) : (
                <Link to={getDemoPath(token, 'documents')} className="mt-4 flex min-h-11 items-center justify-center gap-1 rounded-[8px] border border-[#dbe3ec] bg-white text-sm font-semibold" style={{ color: brand.primary }} aria-label={`${isReady ? 'View document' : 'View status'}: ${document.title}`}>{isReady ? 'View document' : 'View status'}<ChevronRight size={16} aria-hidden="true" /></Link>
              )}
            </li>
          )
        })}
      </ul>
      <p className="flex items-center justify-center gap-1.5 px-4 pb-3 text-[0.65rem] text-[#7b8491]">Swipe to browse all {documents.length} documents<ChevronRight size={12} aria-hidden="true" /></p>
      <Link to={getDemoPath(token, 'documents')} className="flex min-h-12 items-center justify-center gap-1 border-t border-[#edf0f3] text-sm font-semibold" style={{ color: brand.primary }}>View all documents<ChevronRight size={16} aria-hidden="true" /></Link>
    </section>
  )
}

function MobileTransferJourney({ brand, token, demoUploadComplete, onCompleteUpload }) {
  const completedCount = DEMO_JOURNEY_STAGES.filter((stage) => stage.status === 'complete').length
  const progressPercent = Math.round(completedCount / DEMO_JOURNEY_STAGES.length * 100)

  return (
    <section className="rounded-[12px] border border-[#dbe5ef] bg-white p-4">
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#142132]">Your progress</h2>
          <span className="text-xs text-[#667085]">{completedCount} of {DEMO_JOURNEY_STAGES.length} steps complete</span>
        </div>
        <div role="progressbar" aria-label="Purchase journey progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#edf0f3]">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
      <ol aria-label="Your purchase journey">
        {DEMO_JOURNEY_STAGES.map((stage, index) => (
          <MobileTimelineStage key={stage.id} brand={brand} stage={stage} isLast={index === DEMO_JOURNEY_STAGES.length - 1} token={token} demoUploadComplete={demoUploadComplete} onCompleteUpload={onCompleteUpload} />
        ))}
      </ol>
      <p className="mt-5 border-t border-[#edf0f3] pt-4 text-xs leading-5 text-[#7b8491]">Your team will keep you updated as each step moves forward.</p>
    </section>
  )
}

function MobileTimelineStage({ brand, stage, isLast, token }) {
  const isCurrent = stage.status === 'current'
  const isComplete = stage.status === 'complete'

  return (
    <li className={`relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 ${isLast ? '' : 'pb-5'}`} aria-current={isCurrent ? 'step' : undefined}>
      {!isLast ? <span className={`absolute bottom-0 left-[13px] top-7 w-px ${isComplete ? 'bg-emerald-200' : 'bg-[#e4e9ef]'}`} aria-hidden="true" /> : null}
      <span className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full ${isCurrent ? 'mt-7 bg-white' : isComplete ? 'bg-emerald-50 text-emerald-600' : 'bg-white'}`} aria-hidden="true">
        {isComplete ? <CheckCircle2 size={18} /> : isCurrent ? <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: hexToRgba(brand.primary, 0.09) }}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand.primary }} /></span> : <span className="h-2 w-2 rounded-full bg-[#c7d1dc]" />}
      </span>
      <div className={isCurrent ? 'min-w-0 rounded-[12px] border p-4' : 'min-w-0 pt-0.5'} style={isCurrent ? { backgroundColor: hexToRgba(brand.primary, 0.025), borderColor: hexToRgba(brand.primary, 0.07) } : undefined}>
        {isCurrent ? <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-[#667085]">Current stage</p> : null}
        <h2 className={`${isCurrent ? 'mt-1 text-lg tracking-[-0.025em]' : 'text-sm'} font-semibold ${isCurrent || isComplete ? 'text-[#142132]' : 'text-[#667085]'}`}>{stage.label}</h2>
        {isComplete ? <p className="mt-1 text-xs text-[#98a2b3]">Completed · {stage.completionDate}</p> : null}
        {!isComplete && !isCurrent ? <p className="mt-1 text-xs text-[#98a2b3]">{stage.expectedDuration === 'Final step' ? 'Keys and handover' : `Usually ${stage.expectedDuration.toLowerCase()}`}</p> : null}
        {isCurrent ? (
          <div className="mt-2">
            <p className="text-sm leading-6 text-[#52657b]">Your completed application is with four banks for assessment.</p>
            <div className="mt-4 flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e2e8ef] bg-white text-[#667085]"><UserRound size={16} aria-hidden="true" /></span>
              <p className="text-xs leading-5 text-[#52657b]">Priya Naidoo<span className="block text-[#7b8491]">Bond originator</span></p>
            </div>
            <div className="mt-4 border-t border-black/5 pt-3">
              <p className="text-xs leading-5 text-[#52657b]">Nothing needed from you. Priya will update you as the banks respond.</p>
              <Link to={getDemoPath(token, 'finance')} className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-[#dbe5ef] bg-white text-sm font-semibold" style={{ color: brand.primary }}>View bank applications<ChevronRight size={16} aria-hidden="true" /></Link>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  )
}

function MobileDocuments({ brand, config, demoUploadComplete, onCompleteUpload }) {
  const documents = BUYER_DOCUMENTS.map((document) =>
    document.id === 'latest-payslip' && demoUploadComplete ? { ...document, status: 'Received', statusDetail: 'Uploaded for review', tone: 'info', action: 'View' } : document,
  )
  const actionDocument = documents.find((document) => document.tone === 'action')
  const groupedDocuments = documents.reduce((groups, document) => {
    groups[document.group] = [...(groups[document.group] || []), document]
    return groups
  }, {})

  return (
    <div className="space-y-4">
      <DocumentStatusSummary totalCount={documents.length} readyCount={documents.filter((document) => document.tone === 'complete').length} actionCount={documents.filter((document) => document.tone === 'action').length} preparingCount={documents.filter((document) => document.tone === 'info').length} unavailableCount={documents.filter((document) => document.tone === 'neutral').length} />
      {actionDocument ? (
        <BuyerMobilePriorityAction
          eyebrow="1 document needs your attention"
          title={actionDocument.title}
          description={actionDocument.description}
          icon={UploadCloud}
          action={<button type="button" onClick={onCompleteUpload} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#05080c] text-sm font-semibold text-white">
            <UploadCloud size={16} />
            Upload payslip
          </button>}
        />
      ) : null}
      {!actionDocument ? <section className="rounded-[12px] border border-[#dbe5ef] bg-white p-4"><h2 className="text-sm font-semibold text-[#142132]">Nothing needed from you</h2><p className="mt-1 text-sm leading-5 text-[#52657b]">Your finance documents are with the banks. The team is preparing the remaining transfer documents.</p></section> : null}
      {Object.entries(groupedDocuments).map(([group, rows]) => (
        <section key={group}>
          <h2 className="mb-2 text-sm font-semibold text-[#142132]">{group}</h2>
          <div className="overflow-hidden rounded-[18px] border border-[#dbe5ef] bg-white">
            {rows.map((document) => (
              <MobileDocumentRow key={document.id} brand={brand} config={config} document={document} onCompleteUpload={onCompleteUpload} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function MobileDocumentRow({ brand, config, document, onCompleteUpload }) {
  const Icon = document.icon
  const canUpload = document.id === 'latest-payslip' && document.tone === 'action'

  return (
    <button type="button" onClick={canUpload ? onCompleteUpload : undefined} className="grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#e4ebf3] p-4 text-left last:border-b-0">
      <span className={`flex h-9 w-9 items-center justify-center rounded-full border ${statusClasses(document.tone)}`}>
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-[#142132]">{document.title}</h3>
          <span className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${statusClasses(document.tone)}`}>{document.status}</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-[#52657b]">{document.description.replace('Vanguard Properties', config.agencyName)}</p>
        {document.statusDetail ? <p className="mt-1 text-xs font-medium text-[#667085]">{document.statusDetail}</p> : null}
      </div>
      <span className="flex min-h-9 items-center gap-1 text-xs font-semibold" style={{ color: brand.primary }}>
        {canUpload ? 'Upload' : document.action || ''}
        <ChevronRight size={16} />
      </span>
    </button>
  )
}

function MobileFinance({ brand, model, token }) {
  return (
    <div className="buyer-finance-mobile space-y-4">
      <section className="rounded-[18px] border border-[#dbe5ef] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
        <div className="flex items-start gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${statusClasses('info')}`}>
            <FileSignature size={20} />
          </span>
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#667085]">Bond status</p>
            <h2 className="mt-1 text-base font-semibold text-[#142132]">{model.status}</h2>
            <p className="mt-1 text-sm text-[#52657b]">{model.statusHelper}</p>
            <p className="mt-3 text-sm font-semibold text-[#142132]">{model.requestedAmountLabel}</p>
          </div>
        </div>
      </section>
      <MobileBondJourneyTracker brand={brand} currentStageIndex={model.currentStageIndex} />
      <section>
        <h2 className="mb-2 text-base font-semibold text-[#142132]">Your bank applications</h2>
        <div className="overflow-hidden rounded-[18px] border border-[#dbe5ef] bg-white">
          {model.bankApplications.map((bank) => (
            <MobileBankRow key={bank.id} bank={bank} brand={brand} />
          ))}
        </div>
      </section>
      {model.offers.length ? (
        <section>
          <h2 className="mb-2 text-base font-semibold text-[#142132]">Your bank offers</h2>
          <div className="space-y-3">
            {model.offers.map((offer) => (
              <OfferCard key={offer.id} brand={brand} offer={offer} />
            ))}
          </div>
        </section>
      ) : <section className="rounded-[12px] border border-[#dbe5ef] bg-white p-4"><h2 className="text-sm font-semibold text-[#142132]">Your bank offers</h2><p className="mt-1 text-sm leading-5 text-[#52657b]">No offers yet. They’ll appear here as the banks respond.</p></section>}
      {model.isBondFinance ? <div id="mobile-bond-life-options"><DemoBondLifeSection theme={brand} /></div> : null}
      <Link to={getDemoPath(token, 'documents')} className="flex min-h-11 items-center justify-center rounded-[12px] border border-[#dbe5ef] bg-white text-sm font-semibold" style={{ color: brand.primary }}>
        View your documents
      </Link>
    </div>
  )
}

function MobileBondJourneyTracker({ brand, currentStageIndex = 0 }) {
  const currentIndex = Math.max(0, Math.min(BOND_JOURNEY_STAGES.length - 1, currentStageIndex))
  const [focusedIndex, setFocusedIndex] = useState(currentIndex)
  const trackRef = useRef(null)

  useEffect(() => {
    const track = trackRef.current
    if (track) track.scrollTo({ left: currentIndex * track.clientWidth / 3, behavior: 'instant' })
  }, [currentIndex])

  const focusStage = (index) => {
    const track = trackRef.current
    if (!track) return
    track.scrollTo({ left: index * track.clientWidth / 3, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  return (
    <section className="overflow-hidden rounded-[12px] border border-[#dbe5ef] bg-white py-4" aria-label="Your bond journey">
      <ol ref={trackRef} className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]" aria-label="Finance stages — swipe to browse" onScroll={(event) => {
        const track = event.currentTarget
        setFocusedIndex(Math.max(0, Math.min(BOND_JOURNEY_STAGES.length - 1, Math.round(track.scrollLeft / (track.clientWidth / 3)))))
      }}>
        <li className="basis-1/3 shrink-0" aria-hidden="true" />
        {BOND_JOURNEY_STAGES.map((stage, index) => {
          const StageIcon = stage.icon
          const focused = index === focusedIndex
          const current = index === currentIndex
          const completed = index < currentIndex
          return <li key={stage.id} className="relative min-w-0 basis-1/3 shrink-0 snap-center">
            {index > 0 ? <span className="absolute left-0 top-8 h-px w-1/2 bg-[#dbe5ef]" aria-hidden="true" /> : null}
            {index < BOND_JOURNEY_STAGES.length - 1 ? <span className="absolute right-0 top-8 h-px w-1/2 bg-[#dbe5ef]" aria-hidden="true" /> : null}
            <button type="button" onClick={() => focusStage(index)} aria-current={current ? 'step' : undefined} className="relative flex min-h-[128px] w-full flex-col items-center px-1.5 text-center">
              <span className="relative z-10 flex h-16 items-center justify-center">
                <span className={`flex items-center justify-center rounded-full border transition-[width,height,background-color] motion-reduce:transition-none ${focused ? 'h-14 w-14 shadow-sm' : 'h-10 w-10'}`} style={{ backgroundColor: current ? brand.primary : '#ffffff', borderColor: current ? brand.primary : '#dbe5ef', color: current ? '#ffffff' : focused ? brand.primary : '#98a2b3' }}>
                  {completed ? <CheckCircle2 size={focused ? 23 : 18} aria-hidden="true" /> : <StageIcon size={focused ? 23 : 18} aria-hidden="true" />}
                </span>
              </span>
              <span className={`mt-2 font-semibold leading-4 ${focused ? 'text-sm text-[#142132]' : 'text-[0.65rem] text-[#7b8491]'}`}>{stage.label}</span>
              <span className="mt-1 text-[0.6rem] leading-4 text-[#98a2b3]">{current ? 'Current stage' : completed ? 'Completed' : 'Upcoming'}</span>
            </button>
          </li>
        })}
        <li className="basis-1/3 shrink-0" aria-hidden="true" />
      </ol>
      <p className="px-4 text-center text-[0.65rem] text-[#7b8491]">Swipe to explore each stage</p>
    </section>
  )
}

function MobileBondApplication({ brand, demoUploadComplete, token }) {
  const application = {
    ...FINANCE_APPLICATION,
    requiredActions: demoUploadComplete ? [] : FINANCE_APPLICATION.requiredActions,
  }

  return (
    <div className="space-y-4">
      <DemoBondApplicationForm brand={brand} application={application} compact />
      <Link to={getDemoPath(token, 'finance')} className="flex min-h-11 items-center justify-center rounded-[12px] border border-[#dbe5ef] bg-white text-sm font-semibold" style={{ color: brand.primary }}>
        Back to finance
      </Link>
    </div>
  )
}

function MobileBankRow({ bank, brand }) {
  return (
    <button type="button" className="grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#e4ebf3] p-4 text-left last:border-b-0">
      <BankLogo bank={bank} />
      <div>
        <h3 className="text-sm font-semibold text-[#142132]">{bank.bankName}</h3>
        <p className="mt-1 text-xs leading-5 text-[#52657b]">{bank.approvedAmount ? `${bank.approvedAmount} · ${bank.interestRate}` : 'Application submitted'}</p>
        <p className="text-xs text-[#667085]">{bank.submittedDate ? `Submitted ${bank.submittedDate}` : `Response ${bank.responseDate}`}</p>
      </div>
      <span className="flex items-center gap-1">
        <span className={`rounded-full border px-2 py-1 text-[0.63rem] font-semibold ${statusClasses(bank.statusTone)}`}>{bank.status}</span>
        <ChevronRight size={16} style={{ color: brand.primary }} />
      </span>
    </button>
  )
}

function MobileTeam({ brand, model }) {
  const mainContact = model.mainContact
  const activeMember = model.activeMember
  const specialists = model.specialists
  const routes = [
    ['General questions about my purchase', `Speak to ${mainContact.name.split(' ')[0]} · Your Agent`, mainContact, MessageCircle, 'info'],
    ['My bond application or bank offers', 'Speak to Priya · Bond Originator', specialists.find((member) => member.role === 'Bond Originator'), Building2, 'complete'],
    ['Transfer, signing or registration', `Speak to ${activeMember.name.split(' ')[0]} · Transfer Attorney`, activeMember, FileSignature, 'info'],
    ['Documents or signing arrangements', 'Speak to Lerato · Conveyancing Secretary', specialists.find((member) => member.role === 'Conveyancing Secretary'), FileText, 'action'],
    ['Building cover, contents or claims', 'Speak to your home insurance team', specialists.find((member) => member.id === 'home-insurance-team'), ShieldCheck, 'info'],
    ['Bond Life or Bond Life Plus', 'Speak to your life cover team', specialists.find((member) => member.id === 'bond-life-team'), ShieldCheck, 'info'],
  ].filter(([, , member]) => member)

  return (
    <div className="space-y-4">
      <section className="rounded-[18px] border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]" style={{ borderColor: hexToRgba(brand.primary, 0.14), backgroundColor: hexToRgba(brand.primary, 0.06) }}>
        <p className="text-xs font-medium text-[#52657b]">Currently handling your transaction</p>
        <div className="mt-3 flex items-center gap-3">
          <Avatar member={activeMember} size="sm" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-[#142132]">{activeMember.name}</h2>
            <p className="text-sm text-[#52657b]">{activeMember.role}</p>
            <p className="mt-1 text-sm font-semibold text-[#142132]">Rates & clearance figures</p>
            <p className="text-xs text-[#52657b]">Waiting for municipality response</p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[0.63rem] font-semibold text-emerald-700">Active now</span>
          <ChevronRight size={16} />
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-base font-semibold text-[#142132]">Your main contact</h2>
        <MobileMainContactCard brand={brand} member={mainContact} />
      </section>
      <section>
        <h2 className="mb-2 text-base font-semibold text-[#142132]">Your specialist team</h2>
        <div className="overflow-hidden rounded-[18px] border border-[#dbe5ef] bg-white">
          {specialists.map((member) => (
            <MobileTeamRow key={member.id} member={member} brand={brand} />
          ))}
        </div>
      </section>
      <section className="rounded-[18px] border border-[#dbe5ef] bg-white p-4">
        <h2 className="text-base font-semibold text-[#142132]">Not sure who to contact?</h2>
        <p className="mt-1 text-sm text-[#52657b]">Here's who can help with common questions.</p>
        <div className="mt-3 divide-y divide-[#e4ebf3]">
          {routes.map(([title, helper, member, Icon, tone]) => (
            <a key={title} href={`mailto:${member.email}`} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 py-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full border ${statusClasses(tone)}`}>
                <Icon size={16} />
              </span>
              <span>
                <strong className="block text-sm text-[#142132]">{title}</strong>
                <span className="text-xs text-[#52657b]">{helper}</span>
              </span>
              <ChevronRight size={16} style={{ color: brand.primary }} />
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}

function MobileMainContactCard({ brand, member }) {
  return (
    <article className="rounded-[18px] border border-[#dbe5ef] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
        <Avatar member={member} size="md" />
        <div className="min-w-0">
          <div className="mb-2 flex justify-end">
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[0.62rem] font-semibold uppercase text-sky-700">Main contact</span>
          </div>
          <h3 className="text-lg font-semibold tracking-[-0.04em] text-[#142132]">{member.name}</h3>
          <p className="mt-1 text-sm font-semibold text-[#52657b]">{member.role}</p>
          <p className="text-sm text-[#52657b]">{member.organisation}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <a href={`mailto:${member.email}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] text-sm font-semibold text-white" style={{ backgroundColor: brand.primary }}>
          <MessageCircle size={15} />
          Message {member.name.split(' ')[0]}
        </a>
        <a href={`tel:${member.phone}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border bg-white text-sm font-semibold" style={{ borderColor: hexToRgba(brand.primary, 0.28), color: brand.primary }}>
          <PhoneCall size={15} />
          Call
        </a>
      </div>
    </article>
  )
}

function MobileTeamRow({ member, brand }) {
  return (
    <a href={`mailto:${member.email}`} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#e4ebf3] p-4 last:border-b-0">
      <Avatar member={member} size="sm" />
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-[#142132]">{member.name}</h3>
        <p className="text-xs leading-5 text-[#52657b]">{member.role} · {member.organisation}</p>
        <p className="mt-1 text-xs leading-5 text-[#52657b]">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: member.isActive ? brand.primary : '#2563eb' }} />
          {member.currentActivity}
        </p>
      </div>
      <ChevronRight size={16} style={{ color: brand.primary }} />
    </a>
  )
}

function DemoContent({ activeSection, brand, config, token, heroOverlayStyle, loading, demoUploadComplete, documentModel, financeModel, teamModel, demoUploadNotice, onCompleteUpload }) {
  const demoNotice = demoUploadNotice ? <DemoModeNotice /> : null
  if (activeSection === 'insurance') {
    return <DemoInsuranceWorkspace theme={brand} propertyAddress={config.samplePropertyAddress} />
  }
  if (activeSection === 'maintenance') {
    return <DemoMaintenanceWorkspace theme={brand} propertyAddress={config.samplePropertyAddress} />
  }
  if (activeSection === 'move') {
    return <DemoMoveWorkspace theme={brand} propertyAddress={config.samplePropertyAddress} currentAddress={`${DEMO_CURRENT_HOME_ADDRESS}, Cape Town`} />
  }
  if (activeSection === 'documents') {
    return (
      <>{demoNotice}<DocumentsSection brand={brand} config={config} demoUploadComplete={demoUploadComplete} documentModel={documentModel} onCompleteUpload={onCompleteUpload} /></>
    )
  }

  if (activeSection === 'finance') {
    return (
      <>{demoNotice}<FinanceSection brand={brand} model={financeModel} token={token} onCompleteUpload={onCompleteUpload} /></>
    )
  }

  if (activeSection === 'bond-application') {
    return (
      <BondApplicationSection
        brand={brand}
        demoUploadComplete={demoUploadComplete}
      />
    )
  }

  if (activeSection === 'team') {
    return <TeamSection brand={brand} model={teamModel} />
  }

  if (activeSection === 'messages') {
    return (
      <div className="space-y-6">
        <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-6 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[#142132]">Messages & updates</h1>
          <p className="mt-2 text-sm leading-6 text-[#52657b]">Read updates from your transaction team and contact the right person when you need help.</p>
        </section>
        <TransactionUpdatesSection brand={brand} standalone />
        <Link to={getDemoPath(token, 'team')} className="inline-flex min-h-11 items-center justify-center rounded-[12px] px-5 text-sm font-semibold text-white" style={{ backgroundColor: brand.primary }}>Contact your team</Link>
      </div>
    )
  }

  if (activeSection === 'overview') {
    return (
      <>{demoNotice}<DemoBuyerOverview
        brand={brand}
        config={config}
        token={token}
        demoUploadComplete={demoUploadComplete}
        documentModel={documentModel}
        onCompleteUpload={onCompleteUpload}
      /></>
    )
  }

  return (
    <div className="space-y-6">
      <section className="relative mt-5 overflow-hidden rounded-[28px] border border-white/70 bg-slate-900 text-white shadow-[0_22px_54px_rgba(15,23,42,0.16)] lg:mt-0">
        <img src={config.samplePropertyImageUrl} alt={config.samplePropertyAddress} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={heroOverlayStyle} />
        <div className="relative grid min-h-[310px] gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:p-8">
          <div className="flex flex-col justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/75">{loading ? 'Loading demo' : 'Your purchase'}</p>
              <h1 className="mt-4 max-w-5xl text-[2.35rem] font-semibold leading-[0.98] tracking-[-0.06em] text-white lg:text-[3.5rem] 2xl:text-[4.15rem]">
                {config.samplePropertyAddress}
              </h1>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <HeroMetric label="Buyer" value="Mia Khumalo" />
              <HeroMetric label="Purchase price" value="R 2 850 000" />
              <HeroMetric label="Current stage" value={DEMO_BUYER_JOURNEY_MODEL.currentStageLabel} />
            </div>
          </div>
          <div className="rounded-[24px] border border-white/20 bg-white/10 p-5 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Progress</p>
            <div className="mt-5 flex items-center justify-center">
              <div className="relative flex h-36 w-36 items-center justify-center rounded-full" style={{ background: `conic-gradient(${brand.accent} ${DEMO_BUYER_JOURNEY_MODEL.progressPercent * 3.6}deg, rgba(255,255,255,0.24) 0deg)` }}>
                <span className="absolute inset-3 rounded-full bg-slate-950/70" />
                <span className="relative text-center">
                  <strong className="block text-4xl tracking-[-0.05em]">{DEMO_BUYER_JOURNEY_MODEL.progressPercent}%</strong>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Complete</span>
                </span>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-white/80">Next: {DEMO_BUYER_JOURNEY_MODEL.nextStageLabel}.</p>
          </div>
        </div>
      </section>

      {activeSection === 'progress' ? <><DemoBuyerJourney brand={brand} token={token} detailed /><ConveyancingJourneySection brand={brand} /></> : null}
      {activeSection === 'messages' ? <TransactionUpdatesSection brand={brand} standalone /> : null}
    </div>
  )
}

function DemoBuyerOverview({ brand, config, token, documentModel }) {
  return (
    <BuyerPortalOverviewShell
      hero={(
        <BuyerPortalOverviewHero
          welcomeName="Mia"
          propertyName={config.samplePropertyAddress}
          purchasePriceLabel="R 2 850 000"
          statusLabel="On track"
          statusClassName="border-emerald-200/40 bg-emerald-400/15 text-white"
          currentStageLabel={DEMO_BUYER_JOURNEY_MODEL.currentStageLabel}
          nextStageLabel={DEMO_BUYER_JOURNEY_MODEL.nextStageLabel}
          progressPercent={DEMO_BUYER_JOURNEY_MODEL.progressPercent}
          timeInStageLabel="2 days"
          stageUpdatedDateLabel="26 Aug"
          attentionTitle="Nothing needed from you"
          attentionDescription="Your completed application is with four banks. Priya will update you as they respond."
          attentionRequired={false}
          attentionActions={<Link to={getDemoPath(token, 'finance')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] px-4 text-sm font-semibold text-white" style={{ backgroundColor: brand.primary }}>View bank applications<ChevronRight size={16} /></Link>}
          theme={brand}
          propertyImageUrl={config.samplePropertyImageUrl}
          propertyImageAlt={config.samplePropertyAddress}
        />
      )}
      progress={(<DemoBuyerJourney brand={brand} token={token} />)}
      afterProgress={<DemoInsurancePromotion theme={brand} to={getDemoPath(token, 'insurance')} />}
      updates={(<TransactionUpdatesSection brand={brand} />)}
      documents={(<BuyerDocumentSummary
        model={documentModel}
        compact
        action={(
          <Link to={getDemoPath(token, 'documents')} className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-[#fbfdff] px-4 text-sm font-semibold text-[#35546c] transition hover:bg-white">
            <FileText size={15} />
            Open documents
          </Link>
        )}
      />)}
    />
  )
}

function DemoBuyerJourney({ brand, token, detailed = false }) {
  return (
    <BuyerPortalJourney
      model={DEMO_BUYER_JOURNEY_MODEL}
      theme={brand}
      title="Your purchase journey"
      subtitle="One clear view of every milestone from signed offer to registration."
      variant={detailed ? 'detailed' : 'summary'}
      action={(
        <Link
          to={getDemoPath(token, detailed ? 'documents' : 'progress')}
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[11px] px-4 py-2 text-sm font-semibold text-white transition"
          style={{ backgroundColor: brand.primary }}
        >
          {detailed ? 'View documents' : 'View full journey'}
          <ChevronRight size={15} />
        </Link>
      )}
    />
  )
}

function ConveyancingJourneySection({ brand }) {
  const currentStage = CONVEYANCING_STAGES.find((stage) => stage.status === 'current') || CONVEYANCING_STAGES[0]

  return (
    <div className="space-y-5">
      <TransferStatusStrip brand={brand} currentStage={currentStage} />

      <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:p-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[#142132]">The conveyancing process</h2>
          <p className="mt-2 text-sm leading-6 text-[#52657b]">Step-by-step journey of how your property is being transferred into your name.</p>
        </div>

        <div className="mt-6">
          {CONVEYANCING_STAGES.map((stage, index) => (
            <ConveyancingStageCard
              key={stage.id}
              brand={brand}
              stage={stage}
              isLast={index === CONVEYANCING_STAGES.length - 1}
            />
          ))}
        </div>

        <div className="mt-5 rounded-[18px] border p-4" style={{ borderColor: hexToRgba(brand.primary, 0.16), backgroundColor: hexToRgba(brand.primary, 0.04) }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white" style={{ color: brand.primary }}>
                <GraduationCapIcon />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[#142132]">Want to understand more about the process?</h3>
                <p className="mt-1 text-sm leading-5 text-[#52657b]">Learn more about conveyancing and what happens at each stage.</p>
              </div>
            </div>
            <button type="button" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border bg-white px-4 text-sm font-semibold text-[#142132]">
              View conveyancing guide
              <ExternalLink size={15} />
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function TransferStatusStrip({ brand, currentStage }) {
  const items = [
    { label: 'Transfer status', value: 'Rates & clearances', helper: 'In progress', icon: Scale, helperTone: brand.primary },
    { label: 'Transfer attorney', value: 'Daniel Jacobs', helper: 'Tuckers Attorneys', icon: UserRound },
    { label: 'Currently waiting on', value: currentStage.waitingOn || 'City of Cape Town', helper: '', icon: Building2 },
    { label: 'Estimated registration', value: '8 - 10 weeks*', helper: '', icon: CalendarDays },
  ]

  return (
    <section className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="grid gap-4 lg:grid-cols-4 lg:divide-x lg:divide-[#dbe5ef]">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <article key={item.label} className="flex items-start gap-3 lg:px-5 first:lg:pl-0 last:lg:pr-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#dbe5ef] bg-white text-[#142132]">
                <Icon size={20} />
              </span>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">{item.label}</p>
                <h3 className="mt-1 text-sm font-semibold text-[#142132]">{item.value}</h3>
                {item.helper ? <p className="mt-1 text-xs font-semibold" style={{ color: item.helperTone || '#52657b' }}>{item.helper}</p> : null}
              </div>
            </article>
          )
        })}
      </div>
      <p className="mt-4 border-t border-[#e4ebf3] pt-3 text-xs leading-5 text-[#667085]">
        *Estimated timelines can change depending on banks, municipalities, attorneys and the Deeds Office.
      </p>
    </section>
  )
}

function ConveyancingStageCard({ brand, stage, isLast }) {
  const [expanded, setExpanded] = useState(stage.status === 'current')
  const isCompleted = stage.status === 'completed'
  const isCurrent = stage.status === 'current'

  return (
    <article className="relative grid grid-cols-[48px_minmax(0,1fr)] gap-4">
      {!isLast ? (
        <span
          className="absolute left-6 top-10 h-[calc(100%-10px)] w-px"
          style={{ backgroundColor: isCompleted || isCurrent ? hexToRgba(brand.primary, 0.32) : '#dbe5ef' }}
        />
      ) : null}
      <div className="relative z-10 flex justify-center">
        <span
          className={`flex items-center justify-center rounded-full font-semibold ${
            isCurrent ? 'h-12 w-12 text-base text-white shadow-[0_10px_26px_rgba(15,23,42,0.16)]' : 'mt-1 h-9 w-9 text-sm'
          }`}
          style={{
            backgroundColor: isCompleted || isCurrent ? brand.primary : '#c7d1dc',
            color: '#ffffff',
          }}
        >
          {isCompleted ? <CheckCircle2 size={18} /> : stage.number}
        </span>
      </div>

      <div className={`${isLast ? '' : 'pb-4'}`}>
        <div
          className={`rounded-[18px] border p-4 transition ${
            isCurrent ? 'bg-[#fbfffd] shadow-[0_14px_34px_rgba(15,23,42,0.06)]' : 'bg-white'
          }`}
          style={{ borderColor: isCurrent ? hexToRgba(brand.primary, 0.2) : '#dbe5ef' }}
        >
          <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-start justify-between gap-4 text-left">
            <div className="flex items-start gap-4">
              <span className="hidden text-sm font-semibold text-[#52657b] sm:block">{stage.number}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-[#142132]">{stage.title}</h3>
                  {isCurrent ? (
                    <span className="rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold" style={{ borderColor: hexToRgba(brand.primary, 0.2), backgroundColor: hexToRgba(brand.primary, 0.08), color: brand.primary }}>
                      We are here
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-[#52657b]">{stage.shortDescription}</p>
                {isCompleted ? <p className="mt-1 text-xs font-medium text-[#667085]">Completed · {stage.completedDate}</p> : null}
                {stage.nextStage ? <p className="mt-1 text-xs font-medium text-[#667085]">What happens next.</p> : null}
              </div>
            </div>
            <ChevronDown size={18} className={`mt-1 shrink-0 text-[#142132] transition ${expanded ? 'rotate-180' : ''}`} />
          </button>

          {expanded ? (
            <div className="mt-5 space-y-4">
              {isCurrent ? <CurrentStageDetails brand={brand} stage={stage} /> : null}
              <div className="rounded-[16px] border border-[#e4ebf3] bg-[#fbfdff] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">Why is this needed?</p>
                <p className="mt-2 text-sm leading-6 text-[#52657b]">{stage.educationalDescription}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function CurrentStageDetails({ brand, stage }) {
  const details = [
    { label: 'Currently', value: stage.currentStatus, helper: 'Rates clearance figures have been requested.', icon: Clock3 },
    { label: 'Usually takes', value: stage.estimatedDuration || 'Timeline to be confirmed', helper: 'Estimated for this stage', icon: CalendarDays },
    { label: 'You need to do', value: stage.buyerAction, helper: stage.buyerActionDetail, icon: UserRound },
  ]

  return (
    <>
      <div className="grid gap-4 rounded-[16px] border border-[#e4ebf3] bg-white p-4 lg:grid-cols-3 lg:divide-x lg:divide-[#dbe5ef]">
        {details.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="flex items-start gap-3 lg:px-4 first:lg:pl-0 last:lg:pr-0">
              <Icon size={21} className="mt-1 shrink-0 text-[#142132]" />
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">{item.label}</p>
                <h4 className="mt-1 text-sm font-semibold text-[#142132]">{item.value}</h4>
                <p className="mt-1 text-sm leading-5 text-[#52657b]">{item.helper}</p>
              </div>
            </div>
          )
        })}
      </div>

      {stage.latestUpdate ? (
        <div className="rounded-[16px] border border-[#e4ebf3] bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <img src={stage.latestUpdate.avatar} alt={stage.latestUpdate.person} className="h-11 w-11 rounded-full object-cover" />
              <div>
                <p className="text-sm font-semibold text-[#142132]">
                  Latest update from {stage.latestUpdate.person} <span className="font-medium text-[#667085]">· {stage.latestUpdate.role}</span>
                </p>
                <p className="mt-1 text-xs font-medium text-[#667085]">{stage.latestUpdate.time}</p>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#52657b]">{stage.latestUpdate.message}</p>
              </div>
            </div>
            <button type="button" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#142132]">
              Why is this needed?
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

function GraduationCapIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 10-10-5-10 5 10 5 10-5Z" />
      <path d="M6 12v5c3 2 9 2 12 0v-5" />
      <path d="M22 10v6" />
    </svg>
  )
}

function DocumentCategorySummary({ brand, compact = false }) {
  return (
    <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#52657b]">Documents</p>
        </div>
        <span className="rounded-full bg-[#f2f4f7] px-3 py-1 text-xs font-semibold text-[#667085]">5 of 8 ready</span>
      </div>
      <div className={`mt-5 grid gap-3 md:grid-cols-2 ${compact ? '2xl:grid-cols-2' : 'xl:grid-cols-5'}`}>
        {DOCUMENT_CATEGORY_SUMMARY.map((category) => {
          const Icon = category.icon
          return (
            <article key={category.label} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
                  style={{ backgroundColor: hexToRgba(category.tone === 'action' ? brand.accent : brand.primary, 0.1), color: category.tone === 'action' ? brand.accent : brand.primary }}
                >
                  <Icon size={19} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#344054]">{category.label}</h3>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-xs font-semibold text-[#667085]">{category.count}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusClasses(category.tone)}`}>{category.status}</span>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
      <p className="mt-4 text-center text-xs text-[#667085]">Your information is secure and encrypted. Only authorised parties can access your data.</p>
    </section>
  )
}

function TransactionUpdatesSection({ brand, standalone = false }) {
  return (
    <section className={`rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] ${standalone ? '' : 'h-full'}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#52657b]">Latest from your transaction team</h3>
        <button type="button" className="text-xs font-semibold" style={{ color: brand.primary }}>View all</button>
      </div>
      <div className="mt-4 divide-y divide-[#e4ebf3]">
        {DEMO_TEAM_UPDATES.map((update) => (
          <article key={`${update.person}-${update.time}`} className="grid grid-cols-[38px_minmax(0,1fr)_auto] gap-3 py-3 first:pt-0 last:pb-0">
            <img src={update.avatar} alt={update.person} className="mt-1 h-8 w-8 rounded-full object-cover" />
            <div>
              <p className="text-sm font-semibold text-[#142132]">
                {update.person} <span className="font-medium text-[#667085]">· {update.role}</span>
              </p>
              <p className="mt-1 text-sm leading-5 text-[#52657b]">{update.message}</p>
            </div>
            <time className="whitespace-nowrap text-xs font-medium text-[#667085]">{update.time}</time>
          </article>
        ))}
      </div>
    </section>
  )
}

function HeroMetric({ label, value }) {
  return (
    <article className="rounded-[18px] border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">
      <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-white/70">{label}</span>
      <strong className="mt-1 block text-sm font-semibold text-white">{value}</strong>
    </article>
  )
}

function DocumentsSection({ brand, documentModel, onCompleteUpload }) {
  const handleDemoUpload = async () => {
    onCompleteUpload()
    return { success: true }
  }

  return (
    <BuyerDocumentWorkspace
      model={documentModel}
      theme={brand}
      onUpload={handleDemoUpload}
    />
  )
}

function LegacyDocumentsSection({ brand, config, demoUploadComplete, onCompleteUpload }) {
  const documents = BUYER_DOCUMENTS.map((document) =>
    document.id === 'latest-payslip' && demoUploadComplete
      ? {
          ...document,
          status: 'Received',
          statusDetail: 'Uploaded for review',
          tone: 'info',
          action: 'View',
          detailDescription: 'Your latest payslip has been uploaded and is being reviewed by the bond originator.',
          facts: [
            ['Status', 'Uploaded for review'],
            ['Provided by', 'Mia Khumalo'],
            ['Shared with', 'Priya Naidoo, Bond Originator'],
          ],
          activity: [
            ['Uploaded by buyer', 'Just now'],
            ['Shared with bond originator', 'Just now'],
          ],
        }
      : document,
  )
  const [selectedDocumentId, setSelectedDocumentId] = useState('signed-otp')
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) || documents[0]
  const groupedDocuments = documents.reduce((groups, document) => {
    groups[document.group] = [...(groups[document.group] || []), document]
    return groups
  }, {})
  const actionDocument = documents.find((document) => document.tone === 'action')
  const readyCount = 5
  const actionCount = documents.filter((document) => document.tone === 'action').length
  const preparingCount = 2
  const unavailableCount = 0

  return (
    <div className="space-y-5">


      <DocumentStatusSummary
        readyCount={readyCount}
        actionCount={actionCount}
        preparingCount={preparingCount}
        unavailableCount={unavailableCount}
      />

      {actionDocument ? (
        <section className="rounded-[20px] border border-amber-200 bg-amber-50/70 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertCircle size={24} />
              </span>
              <div>
                <p className="text-sm font-semibold text-amber-700">{actionCount} document needs your attention</p>
                <h2 className="mt-2 text-base font-semibold text-[#142132]">{actionDocument.title}</h2>
                <p className="mt-1 text-sm leading-6 text-[#52657b]">{actionDocument.detailDescription}</p>
              </div>
            </div>
            <button type="button" onClick={onCompleteUpload} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-[#05080c] px-5 text-sm font-semibold text-white">
              <UploadCloud size={16} />
              Upload payslip
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-[20px] border border-emerald-200 bg-emerald-50/70 p-5">
          <p className="text-sm font-semibold text-emerald-700">You're all caught up</p>
          <p className="mt-1 text-sm leading-6 text-[#52657b]">There are no documents we need from you right now.</p>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        {Object.entries(groupedDocuments).map(([group, documents]) => (
          <div key={group} className="border-b border-[#e4ebf3] py-4 first:pt-1 last:border-b-0 last:pb-1">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#52657b]">
              {group === 'Required from you' ? <UserRound size={15} /> : group === 'Property & transfer documents' ? <Home size={15} /> : <FileText size={15} />}
              {group}
            </h2>
            <div className="overflow-hidden rounded-[18px] border border-[#e4ebf3] bg-[#fbfdff]">
              {documents.map((document) => (
                <DocumentRow
                  key={document.id}
                  brand={brand}
                  document={document}
                  selected={selectedDocument.id === document.id}
                  onSelect={() => setSelectedDocumentId(document.id)}
                  onCompleteUpload={onCompleteUpload}
                />
              ))}
            </div>
          </div>
        ))}
        </section>
        <DocumentDetailPanel brand={brand} config={config} document={selectedDocument} onCompleteUpload={onCompleteUpload} />
      </div>
    </div>
  )
}

function DocumentStatusSummary({ readyCount, actionCount, preparingCount, unavailableCount, totalCount = 8 }) {
  const items = [
    { value: `${readyCount} of ${totalCount}`, label: 'Documents ready', helper: 'Complete', tone: 'complete', icon: CheckCircle2 },
    { value: actionCount, label: 'Needs your attention', helper: actionCount ? 'Action required' : 'All caught up', tone: actionCount ? 'action' : 'complete', icon: AlertCircle },
    { value: preparingCount, label: 'Being prepared', helper: 'In progress', tone: 'info', icon: Clock3 },
    { value: unavailableCount, label: 'Not available yet', helper: 'Upcoming', tone: 'neutral', icon: FileText },
  ]

  return (
    <section className="rounded-[18px] border border-[#dbe5ef] bg-white p-3 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:rounded-[20px] lg:p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:divide-x lg:divide-[#dbe5ef]">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <article key={item.label} className="rounded-[14px] border border-[#edf2f7] p-3 lg:flex lg:items-start lg:gap-3 lg:rounded-none lg:border-0 lg:px-5 first:lg:pl-0 last:lg:pr-0">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border lg:h-12 lg:w-12 ${statusClasses(item.tone)}`}>
                <Icon size={20} />
              </span>
              <div className="mt-2 lg:mt-0">
                <h3 className="text-base font-semibold tracking-[-0.04em] text-[#142132] lg:text-xl">{item.value}</h3>
                <p className="text-xs leading-5 text-[#52657b] lg:text-sm">{item.label}</p>
                <p className={`mt-2 text-[0.68rem] font-semibold lg:mt-3 lg:text-xs ${item.tone === 'complete' ? 'text-emerald-700' : item.tone === 'action' ? 'text-amber-700' : item.tone === 'info' ? 'text-sky-700' : 'text-slate-500'}`}>{item.helper}</p>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function DocumentRow({ brand, document, selected, onSelect, onCompleteUpload }) {
  const Icon = document.icon
  const showUpload = document.id === 'latest-payslip' && document.tone === 'action'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className={`grid w-full gap-3 border-b border-[#e4ebf3] p-4 text-left transition last:border-b-0 md:grid-cols-[minmax(0,1fr)_220px_120px_24px] md:items-center ${
        selected ? 'bg-white' : 'hover:bg-white'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${statusClasses(document.tone)}`}>
          <Icon size={18} />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[#142132]">{document.title}</h3>
            <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusClasses(document.tone)}`}>{document.status}</span>
          </div>
          <p className="mt-1 text-sm leading-5 text-[#52657b]">{document.description}</p>
        </div>
      </div>
      <p className={`text-sm font-medium ${document.tone === 'action' ? 'text-amber-700' : document.tone === 'complete' ? 'text-emerald-700' : document.tone === 'info' ? 'text-sky-700' : 'text-[#667085]'}`}>
        {document.statusDetail}
      </p>
      {showUpload ? (
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation()
            onCompleteUpload()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              onCompleteUpload()
            }
          }}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[#05080c] px-4 text-sm font-semibold text-white"
        >
          <UploadCloud size={15} />
          Upload
        </span>
      ) : document.action ? (
        <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#142132]">
          <FileText size={15} />
          {document.action}
        </span>
      ) : (
        <Info size={18} className="justify-self-start text-[#52657b] md:justify-self-center" />
      )}
      <ChevronRight size={18} className="hidden text-[#142132] md:block" style={{ color: selected ? brand.primary : '#142132' }} />
    </div>
  )
}

function DocumentDetailPanel({ brand, config, document, onCompleteUpload }) {
  const canView = document.action === 'View'
  const canUpload = document.id === 'latest-payslip' && document.tone === 'action'
  const unavailable = document.tone === 'neutral'

  return (
    <aside className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] xl:sticky xl:top-6 xl:self-start">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.04em] text-[#142132]">{document.detailTitle}</h2>
          <span className={`mt-4 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(document.tone)}`}>{document.status}</span>
        </div>
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dbe5ef] text-[#142132]">x</button>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#52657b]">{document.detailDescription}</p>

      <div className="mt-5 border-t border-[#e4ebf3] pt-5">
        <div className="grid gap-4">
          {document.facts.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 text-sm">
              <span className="text-[#52657b]">{label}</span>
              <strong className="font-semibold text-[#142132]">{value.replace('Vanguard Properties', config.agencyName)}</strong>
            </div>
          ))}
        </div>
      </div>

      <section className="mt-5 rounded-[16px] border p-4" style={{ borderColor: hexToRgba(brand.primary, 0.16), backgroundColor: hexToRgba(brand.primary, 0.045) }}>
        <h3 className="text-sm font-semibold text-[#142132]">What is this?</h3>
        <p className="mt-2 text-sm leading-6 text-[#52657b]">{document.whatIsThis}</p>
      </section>

      <div className="mt-5 grid gap-3">
        {canView ? (
          <>
            <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-[#05080c] px-4 text-sm font-semibold text-white">
              <Info size={15} />
              View document
            </button>
            <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#142132]">
              <Download size={15} />
              Download
            </button>
          </>
        ) : null}
        {canUpload ? (
          <button type="button" onClick={onCompleteUpload} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-[#05080c] px-4 text-sm font-semibold text-white">
            <UploadCloud size={15} />
            Upload document
          </button>
        ) : null}
        {unavailable ? <p className="rounded-[14px] bg-[#f2f4f7] p-3 text-sm leading-6 text-[#52657b]">We'll let you know when this document becomes available.</p> : null}
      </div>

      <section className="mt-6 border-t border-[#e4ebf3] pt-5">
        <h3 className="text-sm font-semibold text-[#142132]">Activity</h3>
        <div className="mt-4 space-y-4">
          {document.activity.map(([label, date]) => (
            <div key={`${label}-${date}`} className="grid grid-cols-[14px_minmax(0,1fr)] gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brand.primary }} />
              <div>
                <p className="text-sm text-[#142132]">{label}</p>
                <p className="mt-1 text-xs text-[#667085]">{date}</p>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="mt-5 text-sm font-semibold" style={{ color: brand.primary }}>View all activity</button>
      </section>
    </aside>
  )
}

function FinanceSection({ brand, model, token, onCompleteUpload }) {
  return (
    <BuyerFinanceWorkspace
      model={model}
      theme={brand}
      lenderColumns={2}
      afterLenders={<DemoBondLifeSection theme={brand} />}
      primaryAction={model?.firstAction ? (
        <button type="button" onClick={onCompleteUpload} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-[#111827] px-5 text-sm font-semibold text-white transition hover:bg-black">
          <UploadCloud size={16} />
          Upload payslip
        </button>
      ) : (
        <Link to={getDemoPath(token, 'bond-application')} className="inline-flex min-h-11 items-center justify-center rounded-[12px] px-5 text-sm font-semibold text-white" style={{ backgroundColor: brand.primary }}>
          Open bond application
        </Link>
      )}
      secondaryAction={(
        <Link to={getDemoPath(token, 'documents')} className="inline-flex min-h-11 items-center justify-center rounded-[12px] border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#35546c]">
          Finance documents
        </Link>
      )}
      />
  )
}

function BondApplicationSection({ brand, demoUploadComplete }) {
  const application = {
    ...FINANCE_APPLICATION,
    requiredActions: demoUploadComplete ? [] : FINANCE_APPLICATION.requiredActions,
  }

  return (
    <div>
      <DemoBondApplicationForm brand={brand} application={application} />
    </div>
  )
}

function FinanceSummary({ application }) {
  const items = [
    { label: 'Bond status', value: application.applicationStatus, helper: application.statusHelper, icon: FileSignature, tone: 'info' },
    { label: 'Requested bond', value: application.requestedAmount, helper: `${application.loanToValue} of purchase price`, icon: HandCoins, tone: 'complete' },
    { label: 'Bond originator', value: application.originator.name, helper: application.originator.company, avatar: application.originator.avatar },
    { label: 'Next step', value: application.nextStep.title, helper: application.nextStep.helper, icon: UploadCloud, tone: 'action' },
  ]

  return (
    <section className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="grid gap-4 lg:grid-cols-4 lg:divide-x lg:divide-[#dbe5ef]">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <article key={item.label} className="flex items-start gap-3 lg:px-5 first:lg:pl-0 last:lg:pr-0">
              {item.avatar ? (
                <img src={item.avatar} alt={item.value} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${statusClasses(item.tone)}`}>
                  <Icon size={22} />
                </span>
              )}
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">{item.label}</p>
                <h3 className="mt-1 text-base font-semibold text-[#142132]">{item.value}</h3>
                <p className="mt-1 text-sm leading-5 text-[#52657b]">{item.helper}</p>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function BondJourneyTracker({ brand, currentStageIndex }) {
  return (
    <div className="mt-5 overflow-x-auto pb-2 lg:mt-8">
      <div className="grid min-w-[500px] grid-cols-5 items-start lg:min-w-[760px]">
        {BOND_JOURNEY_STAGES.map((stage, index) => {
          const Icon = stage.icon
          const isComplete = index < currentStageIndex
          const isCurrent = index === currentStageIndex
          return (
            <div key={stage.id} className="relative flex flex-col items-center px-2 text-center">
              {index > 0 ? (
                <span className="absolute left-0 top-[21px] h-px w-1/2" style={{ backgroundColor: isComplete || isCurrent ? brand.primary : '#c7d1dc' }} />
              ) : null}
              {index < BOND_JOURNEY_STAGES.length - 1 ? (
                <span className="absolute right-0 top-[21px] h-px w-1/2" style={{ backgroundColor: isComplete ? brand.primary : '#c7d1dc' }} />
              ) : null}
              <span
                className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 bg-white"
                style={{
                  borderColor: isComplete || isCurrent ? brand.primary : '#dbe5ef',
                  backgroundColor: isComplete || isCurrent ? brand.primary : '#ffffff',
                  color: isComplete || isCurrent ? '#ffffff' : '#52657b',
                }}
              >
                {isComplete ? <CheckCircle2 size={19} /> : <Icon size={19} />}
              </span>
              <p className="mt-3 text-xs font-semibold leading-4 text-[#142132] lg:text-sm" style={isCurrent ? { color: brand.primary } : null}>{stage.label}</p>
              <p className="mt-1 text-[0.68rem] leading-4 text-[#52657b] lg:text-xs lg:leading-5">{isCurrent ? 'We are here' : stage.helper}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CurrentFinanceStatus({ brand, application, demoUploadComplete, onCompleteUpload }) {
  const needsAction = application.requiredActions.length > 0

  return (
    <div className="mt-6 rounded-[18px] border p-5" style={{ borderColor: hexToRgba(brand.primary, 0.18), backgroundColor: hexToRgba(brand.primary, 0.055) }}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: hexToRgba(brand.primary, 0.12), color: brand.primary }}>
            <FileSignature size={30} />
          </span>
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.04em] text-[#142132]">
              {needsAction ? 'Your application is almost ready' : 'Everything we need has been received'}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#344054]">
              {needsAction
                ? 'Your completed application is with four banks for assessment. Nothing is needed from you right now.'
                : 'Your application has been submitted to four banks.'}
            </p>
            {needsAction ? (
              <span className="mt-4 inline-flex rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700">
                {application.requiredActions.length} thing needed from you
              </span>
            ) : (
              <span className="mt-4 inline-flex rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                Ready for submission
              </span>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[300px] lg:grid-cols-1">
          {needsAction ? (
            <button type="button" onClick={onCompleteUpload} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.12)]" style={{ backgroundColor: brand.primary }}>
              <UploadCloud size={16} />
              Upload latest payslip
            </button>
          ) : null}
          <Link to="../documents" relative="path" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] px-5 text-sm font-semibold" style={{ color: brand.primary }}>
            View your documents
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>
      {demoUploadComplete ? <p className="mt-4 text-sm font-semibold text-emerald-700">Latest payslip uploaded for review.</p> : null}
    </div>
  )
}

function createDemoBondApplicationValues() {
  return Object.values(DEMO_BOND_APPLICATION_FIELD_GROUPS).reduce((values, groups) => {
    groups.forEach((group) => {
      group.fields.forEach((field) => {
        values[field.key] = field.value ?? ''
      })
    })
    return values
  }, {})
}

function DemoBondApplicationForm({ brand, application, compact = false }) {
  const [activeSection, setActiveSection] = useState('personal_details')
  const [values, setValues] = useState(() => createDemoBondApplicationValues())
  const [submitted, setSubmitted] = useState(false)
  const documentNeededCount = application.requiredActions.length
  const sections = DEMO_BOND_APPLICATION_SECTIONS.map((section) => {
    if (section.key !== 'documents') return section
    return documentNeededCount > 0
      ? { ...section, status: `${documentNeededCount} document needed`, tone: 'action' }
      : { ...section, status: 'Complete', tone: 'complete' }
  })
  const activeMeta = sections.find((section) => section.key === activeSection) || sections[0]
  const activeGroups = DEMO_BOND_APPLICATION_FIELD_GROUPS[activeSection] || []
  const activeIndex = sections.findIndex((section) => section.key === activeSection)
  const selectedBanksCount = application.bankApplications.length
  const totalDetails = Object.values(DEMO_BOND_APPLICATION_FIELD_GROUPS).reduce((count, groups) => count + groups.reduce((total, group) => total + group.fields.length, 0), 0)
  const completedDetails = totalDetails
  const completionPercent = Math.round((completedDetails / totalDetails) * 100)
  const actionColour = brand.accent || brand.primary
  const isFirstSection = activeIndex <= 0
  const isFinalSection = activeSection === 'declarations_consents'

  function updateField(key, value) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function handleSaveDemoProgress() {
    if (isFinalSection) {
      setSubmitted(true)
      return
    }
    const nextSection = sections[activeIndex + 1]
    if (nextSection) setActiveSection(nextSection.key)
  }

  function handleBack() {
    const previousSection = sections[activeIndex - 1]
    if (previousSection) setActiveSection(previousSection.key)
  }

  if (submitted) {
    return (
      <section className={`${compact ? 'space-y-4' : 'mx-auto max-w-[1180px]'}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#53677d]">Your application</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-[#142132] lg:text-4xl">Your bond application</h1>
            <p className="mt-2 text-base leading-6 text-[#52657b]">Your completed application was submitted to four banks on 26 Aug. Priya will update you as they respond.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#142132]">
            <CheckCircle2 size={16} style={{ color: brand.primary }} />
            Application completed
          </span>
        </div>
        <div className="mt-6 rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ['Application completed', 'Complete'],
              ['Submitted to banks', 'Current'],
              ['Offers received', 'Pending'],
              ['Offer accepted', 'Pending'],
            ].map(([label, status], index) => (
              <article key={label} className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold" style={{
                  borderColor: index === 0 ? brand.primary : '#dbe5ef',
                  backgroundColor: index === 0 ? brand.primary : '#ffffff',
                  color: index === 0 ? '#ffffff' : '#52657b',
                }}>
                  {index === 0 ? <CheckCircle2 size={18} /> : index + 1}
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-[#142132]">{label}</h2>
                  <p className="mt-1 text-xs text-[#667085]">{status}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={`${compact ? 'space-y-4 overflow-hidden' : 'mx-auto max-w-[1320px]'}`}>
      <div className={`grid min-w-0 gap-5 ${compact ? '' : 'xl:grid-cols-[270px_minmax(0,1fr)]'}`}>
        {!compact ? <aside className="xl:sticky xl:top-8 xl:self-start">
          <DemoBondApplicationJourney
            brand={brand}
            sections={sections}
            activeSection={activeSection}
            onSelect={setActiveSection}
            compact={compact}
          />
        </aside> : null}

        <div className={`${compact ? 'order-1 min-w-0 overflow-hidden' : ''}`}>
          <header className="rounded-[22px] border border-[#e3eaf2] bg-white px-5 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.045)] lg:rounded-[24px] lg:px-7 lg:py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-[-0.06em] text-[#142132] lg:text-4xl">Your bond application</h1>
                <p className="mt-2 text-base leading-6 text-[#52657b]">Submitted to four banks on 26 Aug. Review your completed application below.</p>
              </div>
              <span className="inline-flex min-h-11 w-fit items-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#142132]"><CheckCircle2 size={15} />Submitted to banks</span>
            </div>

            <div className={`mt-6 ${compact ? 'space-y-2' : 'flex items-center gap-5'}`}>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#e4ebf3]">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${completionPercent}%`, backgroundColor: actionColour }} />
              </div>
              <span className="block shrink-0 text-sm font-semibold" style={{ color: actionColour }}>{completionPercent}% complete</span>
            </div>

            <DemoBondApplicationStatusCard
              brand={brand}
              completedDetails={completedDetails}
              documentNeededCount={documentNeededCount}
              selectedBanksCount={selectedBanksCount}
            />
          </header>

          <article className="mt-5 overflow-hidden rounded-[22px] border border-[#e3eaf2] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.045)] lg:rounded-[24px]">
            <div className="p-5 lg:p-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[#142132]">{activeMeta.label}</h2>
                  <p className="mt-2 text-base leading-6 text-[#52657b]">{getDemoBondApplicationSectionHelper(activeSection)}</p>
                </div>
                {activeMeta.tone === 'action' ? (
                  <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">{activeMeta.status}</span>
                ) : null}
              </div>

              {activeSection === 'documents' ? (
                <DemoBondApplicationDocuments brand={brand} />
              ) : (
                <div className="mt-8">
                  {activeGroups.map((group, groupIndex) => {
                    const Icon = group.icon || FileText
                    return (
                      <section key={group.title} className={groupIndex > 0 ? 'mt-9 border-t border-[#e5ecf3] pt-8' : ''}>
                        <div className="flex items-start gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: hexToRgba(brand.primary, 0.08), color: brand.primary }}>
                            <Icon size={18} />
                          </span>
                          <div>
                            <h3 className="text-lg font-semibold tracking-[-0.03em] text-[#142132]">{group.title}</h3>
                            {group.helper ? <p className="mt-1 text-sm leading-5 text-[#52657b]">{group.helper}</p> : null}
                          </div>
                        </div>
                        <div className="mt-5 grid gap-x-6 gap-y-5 md:grid-cols-2">
                          {group.fields.map((field) => (
                            <DemoBondApplicationField
                              key={field.key}
                              field={{ ...field, readOnly: true, reviewRequired: false }}
                              value={values[field.key]}
                              brand={brand}
                              onChange={(nextValue) => updateField(field.key, nextValue)}
                            />
                          ))}
                        </div>
                      </section>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex flex-col gap-3 border-t border-[#e5ecf3] bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:px-7">
              <button
                type="button"
                onClick={handleBack}
                disabled={isFirstSection}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-5 text-sm font-semibold text-[#142132] shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ArrowLeft size={16} />
                Back
              </button>
              <button
                type="button"
                onClick={handleSaveDemoProgress}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[12px] px-6 text-sm font-semibold text-white shadow-[0_14px_24px_rgba(15,23,42,0.14)]"
                style={{ backgroundColor: actionColour }}
              >
                {isFinalSection ? 'Finish review' : 'Next section'}
                <ChevronRight size={16} />
              </button>
            </div>
          </article>
          <p className="mt-3 text-right text-xs font-medium text-[#7b8ca2]">Demo</p>
        </div>
      </div>
    </section>
  )
}

function getDemoBondApplicationSectionHelper(sectionKey) {
  if (sectionKey === 'income_deductions_expenses') return 'Your income and monthly commitments included in the bank submission.'
  if (sectionKey === 'documents') return 'All required documents were included in your submitted application.'
  if (sectionKey === 'declarations_consents') return 'The declarations included in your submitted application.'
  if (sectionKey === 'banking_liabilities') return 'Your banking details and financial commitments included in the bank submission.'
  if (sectionKey === 'loan_details') return 'The property, loan amount and lenders included in your submitted application.'
  return 'Your completed details included in the bank submission.'
}

function DemoBondApplicationStatusCard({ brand, completedDetails, documentNeededCount, selectedBanksCount }) {
  const items = [
    {
      label: `${completedDetails} details completed`,
      helper: 'Prefilled from your profile, property & offer',
      icon: CheckCircle2,
      tone: 'complete',
    },
    {
      label: `${documentNeededCount} document${documentNeededCount === 1 ? '' : 's'} needed`,
      helper: documentNeededCount > 0 ? 'We just need one more document from you' : 'All required documents are in',
      icon: FileText,
      tone: documentNeededCount > 0 ? 'action' : 'complete',
    },
    {
      label: `${selectedBanksCount} bank submissions`,
      helper: 'Submitted on 26 Aug · Awaiting responses',
      icon: Building2,
      tone: 'complete',
    },
  ]

  return (
    <section className="mt-6 rounded-[18px] border border-[#e4ebf3] bg-[#fbfcfe] px-4 py-4">
      <div className="grid gap-4 md:grid-cols-3 md:divide-x md:divide-[#dbe5ef]">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <article key={item.label} className="flex min-w-0 items-start gap-3 md:px-5 first:md:pl-0 last:md:pr-0">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${statusClasses(item.tone)}`}>
                <Icon size={20} />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[#142132]">{item.label}</h2>
                <p className="mt-1 text-sm leading-5 text-[#52657b]">{item.helper}</p>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function DemoBondApplicationJourney({ brand, sections, activeSection, onSelect, compact }) {
  return (
    <section className={`${compact ? 'w-full min-w-0 overflow-hidden rounded-[18px]' : 'min-h-[calc(100vh-64px)]'} flex flex-col rounded-[22px] border border-[#e3eaf2] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.045)] lg:p-6`}>
      <p className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#142132]">Your application</p>
      <div className={compact ? 'max-w-full overflow-x-auto pb-1' : ''}>
        <nav className={compact ? 'flex w-max gap-3' : 'relative space-y-1'}>
          {!compact ? <span className="absolute left-[15px] top-6 h-[calc(100%-48px)] w-px bg-[#dbe5ef]" /> : null}
          {sections.map((section) => {
            const active = section.key === activeSection
            const complete = section.tone === 'complete'
            const attention = section.tone === 'action'
            const indicatorStyle = complete
              ? { backgroundColor: '#087443', borderColor: '#087443', color: '#ffffff' }
              : attention
                ? { backgroundColor: '#f59e0b', borderColor: '#f59e0b', color: '#ffffff' }
                : { backgroundColor: '#ffffff', borderColor: '#c8d3df', color: '#6b7d93' }

            return (
              <button
                key={section.key}
                type="button"
                onClick={() => onSelect(section.key)}
                className={`${compact ? 'min-w-[150px]' : 'relative w-full'} group rounded-[14px] px-3 py-3 text-left transition ${
                  active
                    ? attention
                      ? 'bg-amber-50/75'
                      : 'bg-white'
                    : 'hover:bg-white/70'
                }`}
                style={active && attention ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : null}
              >
                <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
                  <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold" style={indicatorStyle}>
                    {complete ? <CheckCircle2 size={17} /> : attention ? '!' : ''}
                  </span>
                  <span>
                    <strong className={`block text-sm ${active ? 'font-semibold text-[#142132]' : 'font-semibold text-[#21384d]'}`}>{section.label}</strong>
                    <span className="mt-1 block text-sm text-[#52657b]">{section.status}</span>
                  </span>
                </div>
              </button>
            )
          })}
        </nav>
      </div>
      {!compact ? (
        <div className="mt-auto pt-8">
          <div className="rounded-[16px] bg-emerald-50/65 p-4">
            <div className="flex items-start gap-3">
              <Lock size={17} className="mt-0.5 shrink-0 text-emerald-700" />
              <div>
                <h2 className="text-sm font-semibold text-emerald-900">Your information is secure</h2>
                <p className="mt-1 text-sm leading-6 text-[#52657b]">We use bank-level security to protect your data.</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function DemoBondApplicationField({ field, value, brand, onChange }) {
  const actionColour = brand.accent || brand.primary
  const hasValue = typeof value === 'boolean' ? value : String(value ?? '').trim().length > 0
  const showConfirmedValue = Boolean(field.source && hasValue && field.type !== 'select')
  const needsRequiredValue = Boolean(field.required && !hasValue)
  const needsReview = Boolean(field.reviewRequired)

  if (field.type === 'checkbox') {
    return (
      <label className="flex min-h-[52px] items-start gap-3 rounded-[12px] border border-[#e3ebf4] bg-white px-3 py-3 md:col-span-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={field.readOnly}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[#c7d4e3]"
          style={{ accentColor: actionColour }}
        />
        <span className="text-sm leading-6 text-[#324559]">
          {field.label}
          {field.required ? <span className="ml-1 font-semibold" style={{ color: brand.primary }}>*</span> : null}
        </span>
      </label>
    )
  }

  const inputClassName = `mt-2 min-h-[52px] w-full rounded-[12px] border bg-white px-4 py-3 text-base text-[#142132] outline-none transition disabled:bg-[#f3f6f9] disabled:text-[#667085] ${
    needsRequiredValue || needsReview
      ? 'border-amber-300 bg-amber-50/45 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
      : 'border-[#d8e3ee] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12'
  } ${showConfirmedValue ? 'pr-11' : ''}`

  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#203549]">
        {field.label}
        {field.required ? <span className="ml-1 text-[#142132]">*</span> : null}
      </span>
      {field.type === 'select' ? (
        <select disabled={field.readOnly} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className={inputClassName}>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : (
        <span className="relative block">
          <input
            type={field.type === 'date' || field.type === 'email' ? field.type : 'text'}
            inputMode={field.inputMode}
            value={value ?? ''}
            readOnly={field.readOnly}
            disabled={field.readOnly}
            onChange={(event) => onChange(event.target.value)}
            className={inputClassName}
          />
          {showConfirmedValue ? (
            <CheckCircle2 size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-emerald-700" />
          ) : null}
        </span>
      )}
      {field.source ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-[#52657b]">
          <CheckCircle2 size={14} className="text-emerald-700" />
          {field.source}
        </p>
      ) : null}
      {needsRequiredValue ? <p className="mt-2 text-sm font-medium text-amber-700">Required to continue</p> : null}
      {!needsRequiredValue && needsReview ? <p className="mt-2 text-sm font-medium text-amber-700">{field.reviewMessage || 'Confirm before continuing'}</p> : null}
      {field.readOnly ? <p className="mt-2 text-sm text-[#6b7d93]">Included in your submitted application.</p> : null}
    </label>
  )
}

function DemoBondApplicationDocuments({ brand }) {
  return (
    <div className="mt-7 space-y-3">
      {DEMO_BOND_APPLICATION_DOCUMENTS.map((document) => (
        <article key={document.label} className="flex flex-col gap-3 rounded-[14px] border border-[#e3ebf4] bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${statusClasses(document.tone)}`}>
              {document.tone === 'complete' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            </span>
            <div>
              <h4 className="text-sm font-semibold text-[#142132]">{document.label}</h4>
              <p className="mt-1 text-xs text-[#6b7d93]">{document.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(document.tone)}`}>{document.status}</span>
            {document.tone === 'action' ? (
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] px-4 text-sm font-semibold text-white" style={{ backgroundColor: brand.primary }}>
                <UploadCloud size={14} />
                Upload payslip
              </button>
            ) : (
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#142132]">
                View
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

function BankApplicationsSection({ brand, banks, expandedBankId, onToggleBank }) {
  return (
    <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <h2 className="text-xl font-semibold tracking-[-0.04em] text-[#142132]">Your bank applications</h2>
      <p className="mt-2 text-sm leading-6 text-[#52657b]">We'll update you as soon as we hear back from the banks.</p>
      <div className="mt-5 overflow-hidden rounded-[18px] border border-[#e4ebf3]">
        {banks.map((bank) => (
          <BankApplicationRow
            key={bank.bankId}
            brand={brand}
            bank={bank}
            expanded={expandedBankId === bank.bankId}
            onToggle={() => onToggleBank(bank.bankId)}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 rounded-[16px] bg-[#fbfdff] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-sm text-[#52657b]">
          <Lock size={15} />
          <span>We submit to the banks best suited to your profile to get you the best possible outcome.</span>
        </div>
        <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: brand.primary }}>
          Learn more about the process
          <ExternalLink size={15} />
        </button>
      </div>
    </section>
  )
}

function BankApplicationRow({ brand, bank, expanded, onToggle }) {
  return (
    <article className="border-b border-[#e4ebf3] last:border-b-0">
      <button type="button" onClick={onToggle} className="grid w-full gap-3 p-4 text-left md:grid-cols-[minmax(0,1fr)_180px_140px_24px] md:items-center">
        <div className="flex items-center gap-4">
          <BankLogo bank={bank} />
          <div>
            <h3 className="text-sm font-semibold text-[#142132]">{bank.bankName}</h3>
            <p className="mt-1 text-sm leading-5 text-[#52657b]">{bank.approvedAmount ? bank.status : 'Application submitted'}</p>
            <p className="mt-1 text-xs text-[#667085]">{bank.submittedDate ? `Submitted ${bank.submittedDate}` : `Response ${bank.responseDate}`}</p>
          </div>
        </div>
        <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(bank.statusTone)}`}>{bank.status}</span>
        {bank.action ? (
          <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#142132]">
            {bank.action}
            <ChevronRight size={15} />
          </span>
        ) : <span />}
        <ChevronDown size={18} className={`hidden transition md:block ${expanded ? 'rotate-180' : ''}`} style={{ color: brand.primary }} />
      </button>
      {expanded ? (
        <div className="grid gap-3 border-t border-[#e4ebf3] bg-[#fbfdff] p-4 md:grid-cols-3">
          {[
            ['Requested amount', bank.requestedAmount],
            ['Approved amount', bank.approvedAmount],
            ['Interest rate', bank.interestRate],
            ['Term', bank.term],
            ['Estimated repayment', bank.estimatedRepayment],
            ['Latest update', bank.latestUpdate],
          ].filter(([, value]) => value).map(([label, value]) => (
            <div key={label}>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">{label}</p>
              <p className="mt-1 text-sm font-semibold leading-5 text-[#142132]">{value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}

function BankOffersSection({ brand, application, offers }) {
  return (
    <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.04em] text-[#142132]">You have {offers.length} bank offers</h2>
          <p className="mt-2 text-sm leading-6 text-[#52657b]">Compare your offers to choose the one that's right for you.</p>
        </div>
        <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: brand.primary }}>
          Need help deciding? Speak to {application.originator.name.split(' ')[0]}
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {offers.map((offer) => (
          <OfferCard key={offer.bankId} brand={brand} offer={offer} />
        ))}
      </div>
      <div className="mt-5 flex justify-center">
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-5 text-sm font-semibold text-[#142132]">
          <FileText size={15} />
          View all offers & documents
          <ChevronRight size={15} />
        </button>
      </div>
    </section>
  )
}

function OfferCard({ brand, offer }) {
  return (
    <article className="rounded-[18px] border border-[#dbe5ef] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <BankLogo bank={offer} />
          <h3 className="text-base font-semibold text-[#142132]">{offer.bankName}</h3>
        </div>
        {offer.isRecommended ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Recommended</span> : null}
      </div>
      <h4 className="mt-5 text-2xl font-semibold tracking-[-0.05em] text-[#142132]">{offer.approvedAmount}</h4>
      <p className="mt-1 text-sm text-[#52657b]">{offer.status}</p>
      <div className="mt-5 grid grid-cols-3 divide-x divide-[#dbe5ef]">
        {[
          ['Interest rate', offer.interestRate],
          ['Estimated repayment', offer.estimatedRepayment],
          ['Term', offer.term],
        ].map(([label, value]) => (
          <div key={label} className="px-4 first:pl-0 last:pr-0">
            <p className="text-[0.68rem] font-semibold text-[#7b8ca2]">{label}</p>
            <p className="mt-1 text-sm font-semibold text-[#142132]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-[14px] border p-4" style={{ borderColor: hexToRgba(offer.isRecommended ? brand.primary : '#2563eb', 0.18), backgroundColor: hexToRgba(offer.isRecommended ? brand.primary : '#2563eb', 0.045) }}>
        <p className="text-sm font-semibold" style={{ color: offer.isRecommended ? brand.primary : '#2563eb' }}>{offer.highlightTitle || 'Conditions to meet'}</p>
        <p className="mt-1 text-sm leading-5 text-[#52657b]">{offer.highlightDetail || offer.conditions}</p>
      </div>
    </article>
  )
}

function ApplicationDetailsSection({ application, expanded, onToggle }) {
  const details = application.applicationDetails
  const summary = [
    ['Applicant', details.applicant],
    ['Income', details.income],
    ['Expenses', details.expenses],
    ['Requested bond', details.requestedBond],
    ['Loan to value', details.loanToValue],
  ]

  return (
    <section className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <UserRound size={18} className="mt-1 text-[#142132]" />
          <div>
            <h2 className="text-base font-semibold text-[#142132]">Your application details</h2>
            <p className="mt-1 text-sm leading-6 text-[#52657b]">A summary of the information in your bond application.</p>
          </div>
        </div>
        <button type="button" onClick={onToggle} className="inline-flex items-center gap-2 text-sm font-semibold text-[#142132]">
          {expanded ? 'Hide details' : 'Show details'}
          <ChevronDown size={16} className={expanded ? 'rotate-180' : ''} />
        </button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-5 md:divide-x md:divide-[#dbe5ef]">
        {summary.map(([label, value]) => (
          <div key={label} className="md:px-4 first:md:pl-0 last:md:pr-0">
            <p className="text-[0.68rem] font-semibold text-[#7b8ca2]">{label}</p>
            <p className="mt-1 text-sm font-semibold text-[#142132]">{value}</p>
          </div>
        ))}
      </div>
      {expanded ? (
        <div className="mt-5 rounded-[16px] border border-[#e4ebf3] bg-[#fbfdff] p-4">
          <p className="text-sm leading-6 text-[#52657b]">Employment: <strong className="text-[#142132]">{details.employment}</strong>. Purchase price: <strong className="text-[#142132]">{application.purchasePrice}</strong>.</p>
        </div>
      ) : null}
    </section>
  )
}

function BankLogo({ bank }) {
  if (bank.logo) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white">
        <img src={bank.logo} alt={`${bank.bankName} logo`} className="max-h-11 max-w-11 object-contain" />
      </span>
    )
  }

  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#eef4fb] text-sm font-semibold text-[#142132]">
      {bank.bankName.slice(0, 2).toUpperCase()}
    </span>
  )
}

function TeamSection({ brand, model }) {
  return <BuyerTeamWorkspace model={model} theme={brand} />
}

function TeamContextSummary({ brand, mainContact, activeMember }) {
  const items = [
    { label: 'Your main contact', value: mainContact.name, helper: mainContact.organisation, icon: UserRound, tone: 'info' },
    { label: 'Currently handling your transaction', value: activeMember.name, helper: activeMember.role, icon: FileSignature, tone: 'complete', badge: 'Active now' },
    { label: 'Current process', value: 'Rates & clearance figures', helper: 'Waiting for municipality response', icon: CalendarDays, tone: 'info', badge: 'In progress' },
  ]

  return (
    <section className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="grid gap-4 lg:grid-cols-3 lg:divide-x lg:divide-[#dbe5ef]">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <article key={item.label} className="flex items-start gap-4 lg:px-6 first:lg:pl-0 last:lg:pr-0">
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border ${statusClasses(item.tone)}`}>
                <Icon size={24} />
              </span>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">{item.label}</p>
                <h3 className="mt-1 text-base font-semibold text-[#142132]">{item.value}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-sm leading-5 text-[#52657b]">{item.helper}</p>
                  {item.badge ? (
                    <span className="rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold" style={{ borderColor: hexToRgba(brand.primary, 0.18), backgroundColor: hexToRgba(brand.primary, 0.08), color: brand.primary }}>
                      {item.badge}
                    </span>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function TeamMemberCard({ brand, member, prominent = false }) {
  return (
    <article className="flex h-full flex-col rounded-[22px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <Avatar member={member} size={prominent ? 'lg' : 'md'} />
          {!prominent ? <span className="hidden h-9 w-9 items-center justify-center rounded-full bg-[#eef4fb] text-xs font-semibold text-[#35546c] sm:flex">{member.initials}</span> : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          {member.isMainContact ? <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase text-sky-700">Your main contact</span> : null}
          {member.isActive ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase text-emerald-700">Active now</span> : null}
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-xl font-semibold tracking-[-0.04em] text-[#142132]">{member.name}</h3>
        <p className="mt-2 text-sm font-semibold text-[#52657b]">{member.role}</p>
        <p className="mt-1 text-sm font-semibold text-[#52657b]">{member.organisation}</p>
      </div>

      <div className={`${prominent ? 'mt-6' : 'mt-5'} border-t border-[#e4ebf3] pt-5`}>
        <p className="text-sm leading-6 text-[#52657b]">{member.description}</p>
      </div>

      {!member.isMainContact ? (
        <div className="mt-5 rounded-[14px] p-4" style={{ backgroundColor: hexToRgba(member.isActive ? brand.primary : '#2563eb', member.isActive ? 0.08 : 0.06) }}>
          <p className="text-sm font-semibold text-[#142132]">
            <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: member.isActive ? brand.primary : '#2563eb' }} />
            Current: {member.currentActivity}
          </p>
        </div>
      ) : null}

      <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
        {member.messagingAvailable ? (
          <a href={`mailto:${member.email}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border px-3 text-sm font-semibold" style={prominent ? { backgroundColor: brand.primary, borderColor: brand.primary, color: '#ffffff' } : { borderColor: hexToRgba(brand.primary, 0.35), color: brand.primary }}>
            <MessageCircle size={15} />
            {prominent ? `Message ${member.name.split(' ')[0]}` : 'Message'}
          </a>
        ) : null}
        {member.phone ? (
          <a href={`tel:${member.phone}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border px-3 text-sm font-semibold" style={{ borderColor: hexToRgba(brand.primary, 0.35), color: brand.primary }}>
            <PhoneCall size={15} />
            Call
          </a>
        ) : null}
      </div>
    </article>
  )
}

function ContactRouteCard({ brand, route }) {
  const Icon = route.icon
  return (
    <a href={`mailto:${route.member.email}`} className="flex min-h-[92px] items-center gap-4 rounded-[16px] border border-[#dbe5ef] bg-[#fbfdff] p-4 transition hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.07)]">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${statusClasses(route.tone)}`}>
        <Icon size={21} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.68rem] font-medium text-[#52657b]">I need help with...</p>
        <h3 className="mt-1 text-sm font-semibold leading-5 text-[#142132]">{route.title}</h3>
        <p className="mt-1 text-xs leading-5 text-[#52657b]">{route.helper}</p>
      </div>
      <ChevronRight size={18} className="shrink-0" style={{ color: brand.primary }} />
    </a>
  )
}

function Avatar({ member, size = 'md' }) {
  const sizeClass = size === 'lg' ? 'h-20 w-20' : size === 'sm' ? 'h-11 w-11' : 'h-16 w-16'
  if (member.profileImage) {
    return <img src={member.profileImage} alt={member.name} className={`${sizeClass} rounded-full object-cover`} />
  }

  return (
    <span className={`${sizeClass} flex items-center justify-center rounded-full bg-[#eef4fb] text-sm font-semibold text-[#35546c]`}>
      {member.initials}
    </span>
  )
}
