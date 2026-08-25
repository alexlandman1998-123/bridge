import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
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
  Mail,
  MessageCircle,
  PhoneCall,
  Scale,
  UploadCloud,
  UserRound,
  Users,
} from 'lucide-react'
import { resolveProspectDemoConfig } from '../lib/prospectDemoConfig'

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
  { key: 'documents', label: 'Your Documents', icon: FileText },
  { key: 'finance', label: 'Finance', icon: HandCoins },
  { key: 'bond-application', label: 'Bond Application', icon: FileSignature },
  { key: 'messages', label: 'Messages', icon: Mail },
  { key: 'team', label: 'Your Team', icon: Users },
]

const MOBILE_DEMO_NAV = DEMO_NAV.filter((item) => item.key !== 'messages')

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
    description: 'Your bond application is being prepared and submitted to the banks for approval.',
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

const DEMO_DOCUMENTS = [
  { title: 'Buyer ID Document', group: 'FICA documents', status: 'Approved', tone: 'complete', description: 'Verified copy of the buyer identity document.' },
  { title: 'Proof of Residential Address', group: 'FICA documents', status: 'Received', tone: 'complete', description: 'Utility bill or bank statement confirming residential address.' },
  { title: 'Signed Offer to Purchase', group: 'Sale documents', status: 'Shared', tone: 'info', description: 'Signed OTP available for the buyer and transfer team.' },
  { title: 'Sale Agreement Addendum', group: 'Sale documents', status: 'Drafting', tone: 'info', description: 'Prepared if the attorneys need updated purchase terms.' },
  { title: 'Rates Clearance Information', group: 'Property documents', status: 'Requested', tone: 'action', description: 'Property supporting document requested from the seller side.' },
  { title: 'Sectional Title Conduct Rules', group: 'Property documents', status: 'Shared', tone: 'info', description: 'Scheme conduct rules for the purchased unit.' },
  { title: 'Bank Statements', group: 'Bond documents', status: 'Received', tone: 'complete', description: 'Latest three months bank statements received.' },
  { title: 'Latest Payslip', group: 'Bond documents', status: 'Action needed', tone: 'action', description: 'Required before the bond application pack goes to banks.' },
]

const DEMO_TEAM_UPDATES = [
  {
    person: 'Sarah Williams',
    role: 'Transfer Attorney',
    time: 'Today, 10:42',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
    message:
      "We've requested the rates clearance figures from the City of Cape Town. We're currently waiting for the municipality to issue them. There's nothing needed from you at this stage.",
  },
  {
    person: 'James Meyer',
    role: 'Bond Originator',
    time: 'Yesterday, 14:15',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
    message: "Your application pack is almost complete. We're waiting for your updated payslip before submitting it to the banks.",
  },
  {
    person: 'Mia Khumalo',
    role: 'Buyer Agent',
    time: '22 Aug',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=120&q=80',
    message: 'Your signed Offer to Purchase has been sent to the transfer attorneys and your file has officially been opened.',
  },
]

const DOCUMENT_CATEGORY_SUMMARY = [
  { label: 'FICA Documents', count: '2 of 2', status: 'Complete', tone: 'complete', icon: FileSignature },
  { label: 'Sale Documents', count: '1 of 2', status: 'In progress', tone: 'info', icon: FileText },
  { label: 'Property Documents', count: '1 of 2', status: 'Requested', tone: 'action', icon: Home },
  { label: 'Finance Documents', count: '1 of 2', status: 'In progress', tone: 'info', icon: HandCoins },
  { label: 'Additional Documents', count: '0 of 2', status: 'Pending', tone: 'neutral', icon: Folder },
]

const BUYER_DOCUMENTS = [
  {
    id: 'latest-payslip',
    group: 'Required from you',
    title: 'Latest Payslip',
    description: 'Required before the bond application goes to the banks.',
    status: 'Required',
    statusDetail: 'Updated payslip needed',
    tone: 'action',
    action: 'Upload',
    responsible: 'You',
    icon: FileText,
    detailTitle: 'Latest Payslip',
    detailDescription: 'Your bond originator needs your most recent payslip before the bond application can be submitted to the banks.',
    whatIsThis:
      'This helps the banks confirm your current income so they can assess the bond application accurately.',
    facts: [
      ['Status', 'Required from you'],
      ['Needed for', 'Bond application'],
      ['Requested by', 'James Meyer, Bond Originator'],
    ],
    activity: [
      ['Requested by bond originator', 'Today, 09:20'],
      ['Reminder added to your document list', 'Today, 09:22'],
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
    responsible: 'Mia Khumalo',
    icon: FileSignature,
    detailTitle: 'Signed Offer to Purchase',
    detailDescription: 'The offer signed by you and the seller setting out the terms of your purchase.',
    whatIsThis:
      'This is the agreement between you and the seller which sets out the purchase price, deposit, conditions and other important terms of the property purchase.',
    facts: [
      ['Status', 'Signed by all parties'],
      ['Signed', '12 Aug 2026'],
      ['Provided by', 'Mia Khumalo, Vanguard Properties'],
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
      ['Responsible party', 'Sarah Williams, Transfer Attorney'],
    ],
    activity: [['Attorney started preparing addendum', 'Today, 11:05']],
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

const FINANCE_APPLICATION = {
  applicationStatus: 'Application being prepared',
  statusHelper: 'Almost ready to submit',
  requestedAmount: 'R 2 280 000',
  purchasePrice: 'R 2 850 000',
  loanToValue: '80%',
  originator: {
    name: 'James Meyer',
    company: 'BetterBond',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
  },
  currentStage: 'application',
  nextStep: {
    title: 'Submit to banks',
    helper: 'Once required documents are received',
  },
  requiredActions: [
    {
      id: 'latest-payslip',
      title: 'Upload latest payslip',
      description:
        'Your bond originator needs your latest payslip before the application can be submitted to the banks.',
    },
  ],
  applicationDetails: {
    applicant: 'Mia Khumalo',
    income: 'R82 000 gross monthly',
    expenses: 'R24 500 monthly',
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
      status: 'Conditional approval',
      statusTone: 'complete',
      responseDate: '27 Aug',
      requestedAmount: 'R2 280 000',
      approvedAmount: 'R2 280 000',
      interestRate: '10.65%',
      term: '30 years',
      estimatedRepayment: 'R22 935 / month',
      conditions: 'Provide additional information as requested.',
      action: 'View offer',
      latestUpdate: 'Conditional approval received. James will help you work through the remaining conditions.',
    },
    {
      bankId: 'standard-bank',
      bankName: 'Standard Bank',
      logo: '/brand/banks/standard-bank.png',
      status: 'Approved',
      statusTone: 'complete',
      responseDate: '27 Aug',
      requestedAmount: 'R2 280 000',
      approvedAmount: 'R2 280 000',
      interestRate: '10.40%',
      term: '30 years',
      estimatedRepayment: 'R22 412 / month',
      action: 'View offer',
      isRecommended: true,
      highlightTitle: 'Our best offer',
      highlightDetail: 'Lower rate, lower repayment',
      latestUpdate: 'Approved offer received from Standard Bank.',
    },
  ],
}

const DEMO_BOND_APPLICATION_SECTIONS = [
  { key: 'personal_details', label: 'Personal details', status: 'Complete', tone: 'complete' },
  { key: 'contact_address', label: 'Contact & address', status: 'Complete', tone: 'complete' },
  { key: 'employment', label: 'Employment', status: 'Complete', tone: 'complete' },
  { key: 'income_deductions_expenses', label: 'Income & expenses', status: '2 details needed', tone: 'action' },
  { key: 'banking_liabilities', label: 'Banking & liabilities', status: 'Not completed', tone: 'neutral' },
  { key: 'loan_details', label: 'Loan details', status: 'Complete', tone: 'complete' },
  { key: 'documents', label: 'Documents', status: '1 missing', tone: 'action' },
  { key: 'declarations_consents', label: 'Declaration', status: 'Final step', tone: 'neutral' },
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
        { key: 'residential_address', label: 'Residential address', value: '14 Ocean View Drive, Sea Point', source: 'Prefilled from onboarding', required: true },
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
        { key: 'declaration_accepted', label: 'I confirm that all information submitted is true and complete.', value: false, type: 'checkbox', required: true },
        { key: 'digital_signature_name', label: 'Digital signature name', value: 'Mia Khumalo', required: true },
        { key: 'digital_signature_date', label: 'Digital signature date', value: '2026-08-26', type: 'date', required: true },
      ],
    },
  ],
}

const DEMO_BOND_APPLICATION_DOCUMENTS = [
  { label: 'Buyer ID document', type: 'FICA', status: 'Uploaded', tone: 'complete' },
  { label: 'Three months bank statements', type: 'Income', status: 'Uploaded', tone: 'complete' },
  { label: 'Latest payslip', type: 'Income', status: 'Needed', tone: 'action' },
  { label: 'Signed Offer to Purchase', type: 'Sale document', status: 'Linked', tone: 'complete' },
]

const BOND_JOURNEY_STAGES = [
  { id: 'application', label: 'Application', helper: 'We are here', icon: FileSignature },
  { id: 'submitted', label: 'Submitted to Banks', helper: 'Coming next', icon: Building2 },
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
    currentActivity: 'Preparing application for bank submission',
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
      person: 'Sarah Williams',
      role: 'Transfer Attorney',
      time: 'Today, 10:42',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
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

function normalizeHex(value = '', fallback = '#152432') {
  const normalized = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback
}

function hexToRgba(hex = '#152432', alpha = 1) {
  const safeHex = normalizeHex(hex).slice(1)
  const r = parseInt(safeHex.slice(0, 2), 16)
  const g = parseInt(safeHex.slice(2, 4), 16)
  const b = parseInt(safeHex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

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

export default function ProspectBuyerDemo() {
  const { token = '', section = 'overview' } = useParams()
  const activeSection = ['overview', 'progress', 'documents', 'finance', 'bond-application', 'messages', 'team'].includes(section) ? section : 'overview'
  const [config, setConfig] = useState(DEFAULT_BRAND)
  const [loading, setLoading] = useState(true)
  const [demoUploadComplete, setDemoUploadComplete] = useState(false)

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
      setLoading(false)
    }
    void loadConfig()
    return () => {
      cancelled = true
    }
  }, [token])

  const brand = useMemo(() => {
    const primary = normalizeHex(config.primaryColour, DEFAULT_BRAND.primaryColour)
    const secondary = normalizeHex(config.secondaryColour, primary)
    const accent = normalizeHex(config.accentColour, DEFAULT_BRAND.accentColour)
    return { primary, secondary, accent }
  }, [config.accentColour, config.primaryColour, config.secondaryColour])
  const transactionTeam = useMemo(
    () => TRANSACTION_TEAM.map((member) => ({
      ...member,
      organisation: member.organisation === 'Vanguard Properties' ? config.agencyName : member.organisation,
    })),
    [config.agencyName],
  )
  const mainContact = transactionTeam.find((member) => member.isMainContact) || transactionTeam[0]

  if (!token) return <Navigate to="/" replace />

  const sidebarStyle = {
    background: `radial-gradient(circle at 18% -6%, ${hexToRgba(brand.accent, 0.24)} 0%, transparent 34%), linear-gradient(180deg, ${brand.primary} 0%, ${brand.secondary} 100%)`,
  }
  const heroOverlayStyle = {
    background: `linear-gradient(135deg, ${hexToRgba(brand.primary, 0.9)} 0%, ${hexToRgba(brand.primary, 0.7)} 48%, ${hexToRgba(brand.secondary, 0.88)} 100%)`,
  }

  const documentRows = DEMO_DOCUMENTS.map((document) =>
    document.title === 'Latest Payslip' && demoUploadComplete
      ? { ...document, status: 'Uploaded for review', tone: 'info' }
      : document,
  )

  return (
    <main className="min-h-screen bg-[#f3f6fb] text-[#142132]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col overflow-y-auto px-6 py-6 text-white lg:flex" style={sidebarStyle}>
        <div className="border-b border-white/10 pb-5">
          {config.logoDarkUrl ? (
            <img src={config.logoDarkUrl} alt={`${config.agencyName} logo`} className="max-h-14 max-w-[190px] object-contain object-left" />
          ) : (
            <h1 className="text-2xl font-semibold tracking-[-0.04em]">{config.agencyName}</h1>
          )}
          <p className="mt-3 text-sm font-medium text-white/70">Buyer Portal Demo</p>
        </div>

        <nav className="mt-6 grid gap-2">
          {DEMO_NAV.map((item) => {
            const Icon = item.icon
            const active = item.key === activeSection
            return (
              <Link
                key={item.key}
                to={getDemoPath(token, item.key)}
                className={`flex min-h-[46px] items-center gap-3 rounded-[12px] border px-3 text-sm font-semibold transition ${
                  active ? 'border-white/30 bg-white/15 text-white shadow-[inset_3px_0_0_rgba(255,255,255,0.8)]' : 'border-transparent text-white/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={17} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto rounded-[18px] border border-white/20 bg-white/10 p-4 text-white">
          <p className="text-sm font-semibold text-white">Need help?</p>
          <p className="mt-1 text-xs leading-5 text-white/75">{mainContact.name} from {mainContact.organisation} is here to help.</p>
          {mainContact.profileImage ? <img src={mainContact.profileImage} alt={mainContact.name} className="mt-3 h-10 w-10 rounded-full object-cover" /> : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={`mailto:${mainContact.email}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-white/15 text-xs font-semibold">
              <MessageCircle size={14} />
              Email
            </a>
            <a href={`tel:${mainContact.phone}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-white/15 text-xs font-semibold">
              <PhoneCall size={14} />
              Call
            </a>
          </div>
        </div>
      </aside>

      <section className="lg:hidden">
        <MobileBuyerPortal
          activeSection={activeSection}
          brand={brand}
          config={config}
          token={token}
          loading={loading}
          transactionTeam={transactionTeam}
          demoUploadComplete={demoUploadComplete}
          onCompleteUpload={() => setDemoUploadComplete(true)}
        />
      </section>

      <section className="hidden min-h-screen lg:block lg:pl-[264px]">
        <div className="w-full px-6 py-8 2xl:px-8">
          <DemoContent
            activeSection={activeSection}
            brand={brand}
            config={config}
            heroOverlayStyle={heroOverlayStyle}
            loading={loading}
            documentRows={documentRows}
            transactionTeam={transactionTeam}
            demoUploadComplete={demoUploadComplete}
            onCompleteUpload={() => setDemoUploadComplete(true)}
          />
        </div>
      </section>
    </main>
  )
}

function MobileBuyerPortal({ activeSection, brand, config, token, loading, transactionTeam, demoUploadComplete, onCompleteUpload }) {
  const mobileSection = activeSection === 'messages' ? 'overview' : activeSection
  const pageTitles = {
    overview: '',
    progress: 'Transfer Journey',
    documents: 'Your documents',
    finance: 'Finance',
    'bond-application': 'Bond application',
    team: 'Your team',
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc] pb-[calc(88px+env(safe-area-inset-bottom))] text-[#142132]">
      <div className="mx-auto max-w-[430px] px-4 pt-4">
        <MobileHeader
          activeSection={mobileSection}
          agencyName={config.agencyName}
          logoUrl={config.logoDarkUrl || config.logoLightUrl}
          brand={brand}
          title={pageTitles[mobileSection]}
        />

        {mobileSection === 'overview' ? (
          <MobileOverview
            brand={brand}
            config={config}
            loading={loading}
            demoUploadComplete={demoUploadComplete}
            onCompleteUpload={onCompleteUpload}
            token={token}
          />
        ) : null}
        {mobileSection === 'progress' ? <MobileTransferJourney brand={brand} /> : null}
        {mobileSection === 'documents' ? (
          <MobileDocuments
            brand={brand}
            config={config}
            demoUploadComplete={demoUploadComplete}
            onCompleteUpload={onCompleteUpload}
          />
        ) : null}
        {mobileSection === 'finance' ? <MobileFinance brand={brand} demoUploadComplete={demoUploadComplete} onCompleteUpload={onCompleteUpload} token={token} /> : null}
        {mobileSection === 'bond-application' ? <MobileBondApplication brand={brand} demoUploadComplete={demoUploadComplete} token={token} /> : null}
        {mobileSection === 'team' ? <MobileTeam brand={brand} team={transactionTeam} /> : null}
      </div>
      <MobileBottomNav activeSection={mobileSection} brand={brand} token={token} />
    </div>
  )
}

function MobileHeader({ activeSection, agencyName, logoUrl, brand, title }) {
  const isOverview = activeSection === 'overview'

  return (
    <header className="mb-4 flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        {isOverview ? (
          logoUrl ? (
            <span className="inline-flex min-h-12 items-center gap-2 rounded-[14px] px-3 py-2 shadow-sm" style={{ backgroundColor: brand.primary }}>
              <img src={logoUrl} alt={`${agencyName} logo`} className="max-h-8 max-w-[105px] object-contain object-left" />
              <span className="max-w-[118px] truncate text-sm font-semibold uppercase tracking-[0.04em] text-white">{agencyName}</span>
            </span>
          ) : (
            <strong className="text-base font-semibold">{agencyName}</strong>
          )
        ) : (
          <div>
            <h1 className="text-[1.55rem] font-semibold leading-tight tracking-[-0.05em] text-[#142132]">{title}</h1>
          </div>
        )}
      </div>
      <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#142132] shadow-sm" aria-label="Open menu">
        <span className="text-xl leading-none">≡</span>
      </button>
    </header>
  )
}

function MobileBottomNav({ activeSection, brand, token }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dfe7ee] bg-white/96 px-3 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_32px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="mx-auto grid max-w-[430px] gap-1" style={{ gridTemplateColumns: `repeat(${MOBILE_DEMO_NAV.length}, minmax(0, 1fr))` }}>
        {MOBILE_DEMO_NAV.map((item) => {
          const Icon = item.icon
          const active = item.key === activeSection
          const label = item.key === 'progress' ? 'Journey' : item.key === 'documents' ? 'Docs' : item.key === 'bond-application' ? 'Bond' : item.key === 'team' ? 'Team' : item.label
          return (
            <Link
              key={item.key}
              to={getDemoPath(token, item.key)}
              className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[14px] text-[0.6rem] font-semibold transition"
              style={active ? { color: brand.primary } : { color: '#667085' }}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function MobileOverview({ brand, config, loading, demoUploadComplete, onCompleteUpload, token }) {
  const addressParts = config.samplePropertyAddress.split(',')
  const primaryAddress = addressParts.slice(0, 2).join(',').trim()
  const areaAddress = addressParts.slice(2).join(',').trim() || 'Sea Point, Cape Town'

  return (
    <div className="space-y-3">
      <section className="relative overflow-hidden rounded-[22px] bg-slate-950 text-white shadow-[0_18px_42px_rgba(15,23,42,0.18)]">
        <img src={config.samplePropertyImageUrl} alt={config.samplePropertyAddress} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-black/20 to-black/82" />
        <div className="relative flex min-h-[270px] flex-col justify-end p-5">
          <p className="mb-auto text-xs font-semibold uppercase tracking-[0.16em] text-white/75">{loading ? 'Loading demo' : 'Your purchase'}</p>
          <h1 className="text-[1.65rem] font-semibold leading-[1.02] tracking-[-0.055em] text-white">{primaryAddress}</h1>
          <p className="mt-1 text-base font-semibold text-white/90">{areaAddress}</p>
          <div className="mt-4 w-fit rounded-[16px] border border-white/20 bg-black/45 px-4 py-3 backdrop-blur">
            <strong className="block text-base font-semibold">50% complete</strong>
            <span className="text-xs text-white/80">On track</span>
          </div>
        </div>
      </section>

      <MobilePriorityCard
        icon={FileSignature}
        label="Current stage"
        title="Finance"
        description="Your bond application is being prepared for submission."
        to={getDemoPath(token, 'finance')}
        brand={brand}
      />
      <MobilePriorityCard
        icon={AlertCircle}
        label={demoUploadComplete ? 'Nothing needed from you' : 'Next up'}
        title={demoUploadComplete ? "You're all caught up" : 'Upload latest payslip'}
        description={demoUploadComplete ? "We'll let you know when we need anything." : 'Needed before we can submit your application to the banks.'}
        to={getDemoPath(token, 'documents')}
        brand={brand}
        tone={demoUploadComplete ? 'complete' : 'action'}
        onClick={demoUploadComplete ? undefined : onCompleteUpload}
      />

      <section className="rounded-[18px] border border-[#dbe5ef] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#142132]">Latest update</h2>
          <span className="flex items-center gap-1 text-[0.7rem] font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Today, 09:15
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#52657b]">Your transfer attorney requested rates clearance figures from the City of Cape Town.</p>
        <Link to={getDemoPath(token, 'progress')} className="mt-3 inline-flex min-h-9 items-center text-sm font-semibold" style={{ color: brand.primary }}>
          View all updates
        </Link>
      </section>
    </div>
  )
}

function MobilePriorityCard({ icon: Icon, label, title, description, to, brand, tone = 'info', onClick }) {
  const content = (
    <>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border ${statusClasses(tone)}`}>
        <Icon size={21} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#667085]">{label}</p>
        <h2 className="mt-1 text-base font-semibold text-[#142132]">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-[#52657b]">{description}</p>
      </div>
      <ChevronRight size={18} className="shrink-0" style={{ color: brand.primary }} />
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="flex min-h-[98px] w-full items-center gap-3 rounded-[18px] border border-[#dbe5ef] bg-white p-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
        {content}
      </button>
    )
  }

  return (
    <Link to={to} className="flex min-h-[98px] items-center gap-3 rounded-[18px] border border-[#dbe5ef] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
      {content}
    </Link>
  )
}

function MobileTransferJourney({ brand }) {
  const mobileStages = [
    { title: 'Offer Accepted', date: '12 Aug 2026', description: 'You and the seller accepted the offer.', status: 'completed' },
    { title: 'Rates & Clearance', description: 'Your attorney is obtaining rates and levy clearance figures.', status: 'current', statusText: 'In progress', detail: 'Waiting for municipality response' },
    { title: 'Documents & Guarantees', description: 'Your attorney will prepare the transfer documents and request guarantees.', status: 'upcoming' },
    { title: 'Signing', description: "You'll sign the transfer documents.", status: 'upcoming' },
    { title: 'Lodgement', description: 'The documents will be lodged with the Deeds Office.', status: 'upcoming' },
    { title: 'Registration', description: 'Once registered, the property is officially in your name.', status: 'upcoming' },
  ]

  return (
    <div className="space-y-3">
      <p className="-mt-2 text-sm leading-5 text-[#52657b]">Here's how your property transfer works.</p>
      <section className="relative space-y-3">
        <span className="absolute left-[31px] top-5 h-[calc(100%-40px)] w-px bg-[#dbe5ef]" />
        {mobileStages.map((stage) => (
          <MobileTimelineStage key={stage.title} brand={brand} stage={stage} />
        ))}
      </section>
    </div>
  )
}

function MobileTimelineStage({ brand, stage }) {
  const [expanded, setExpanded] = useState(stage.status === 'current')
  const isCurrent = stage.status === 'current'
  const isComplete = stage.status === 'completed'

  return (
    <article className="relative grid grid-cols-[44px_minmax(0,1fr)] gap-3">
      <span
        className="relative z-10 mt-4 flex h-9 w-9 items-center justify-center rounded-full border-4 border-[#f7f9fc] text-sm font-semibold text-white"
        style={{ backgroundColor: isComplete || isCurrent ? brand.primary : '#c7d1dc' }}
      >
        {isComplete ? <CheckCircle2 size={18} /> : isCurrent ? '2' : <Clock3 size={16} />}
      </span>
      <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded-[18px] border border-[#dbe5ef] bg-white p-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#142132]">{stage.title}</h2>
            {stage.date ? <p className="mt-1 text-xs text-[#667085]">{stage.date}</p> : null}
            {stage.statusText ? <p className="mt-1 text-xs font-semibold" style={{ color: brand.primary }}>{stage.statusText}</p> : null}
          </div>
          <ChevronRight size={18} className={expanded ? 'rotate-90' : ''} style={{ color: brand.primary }} />
        </div>
        <p className="mt-2 text-sm leading-5 text-[#52657b]">{stage.description}</p>
        {expanded && isCurrent ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-[14px] border p-3" style={{ borderColor: hexToRgba(brand.primary, 0.22), backgroundColor: hexToRgba(brand.primary, 0.06), color: brand.primary }}>
              <p className="text-sm font-semibold">{stage.detail}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[14px] bg-[#f7f9fc] p-3">
                <p className="text-xs text-[#667085]">Usually takes</p>
                <strong className="mt-1 block text-[#142132]">5 - 10 days</strong>
              </div>
              <div className="rounded-[14px] bg-[#f7f9fc] p-3">
                <p className="text-xs text-[#667085]">You need to do</p>
                <strong className="mt-1 block text-[#142132]">Nothing right now</strong>
              </div>
            </div>
          </div>
        ) : null}
      </button>
    </article>
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
      <p className="-mt-2 flex items-center justify-between text-sm leading-5 text-[#52657b]">
        <span>All the documents for your purchase.</span>
        <Lock size={15} className="text-[#142132]" />
      </p>
      <DocumentStatusSummary readyCount={5} actionCount={actionDocument ? 1 : 0} preparingCount={2} unavailableCount={0} />
      {actionDocument ? (
        <section className="rounded-[18px] border border-amber-200 bg-amber-50/80 p-4">
          <p className="text-sm font-semibold text-amber-700">1 document needs your attention</p>
          <h2 className="mt-2 text-base font-semibold text-[#142132]">{actionDocument.title}</h2>
          <p className="mt-1 text-sm leading-5 text-[#52657b]">We need your updated payslip before we can submit your application.</p>
          <button type="button" onClick={onCompleteUpload} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#05080c] text-sm font-semibold text-white">
            <UploadCloud size={16} />
            Upload payslip
          </button>
        </section>
      ) : null}
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

function MobileFinance({ brand, demoUploadComplete, onCompleteUpload, token }) {
  const application = {
    ...FINANCE_APPLICATION,
    requiredActions: demoUploadComplete ? [] : FINANCE_APPLICATION.requiredActions,
  }
  const offers = application.bankApplications.filter((bank) => bank.approvedAmount)

  return (
    <div className="space-y-4">
      <p className="-mt-2 text-sm leading-5 text-[#52657b]">Track your bond application and bank responses.</p>
      <section className="rounded-[18px] border border-[#dbe5ef] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
        <div className="flex items-start gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${statusClasses('info')}`}>
            <FileSignature size={20} />
          </span>
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#667085]">Bond status</p>
            <h2 className="mt-1 text-base font-semibold text-[#142132]">{application.applicationStatus}</h2>
            <p className="mt-1 text-sm text-[#52657b]">{application.statusHelper}</p>
            <p className="mt-3 text-sm font-semibold text-[#142132]">{application.requestedAmount}</p>
          </div>
        </div>
      </section>
      <BondJourneyTracker brand={brand} currentStageIndex={0} />
      <CurrentFinanceStatus brand={brand} application={application} demoUploadComplete={demoUploadComplete} onCompleteUpload={onCompleteUpload} />
      <Link to={getDemoPath(token, 'bond-application')} className="flex min-h-11 items-center justify-center rounded-[12px] text-sm font-semibold text-white" style={{ backgroundColor: brand.primary }}>
        Open bond application
      </Link>
      <section>
        <h2 className="mb-2 text-base font-semibold text-[#142132]">Your bank applications</h2>
        <div className="overflow-hidden rounded-[18px] border border-[#dbe5ef] bg-white">
          {application.bankApplications.slice(0, demoUploadComplete ? 4 : 2).map((bank) => (
            <MobileBankRow key={bank.bankId} bank={bank} brand={brand} />
          ))}
        </div>
      </section>
      {offers.length ? (
        <section>
          <h2 className="mb-2 text-base font-semibold text-[#142132]">Your bank offers</h2>
          <div className="space-y-3">
            {offers.map((offer) => (
              <OfferCard key={offer.bankId} brand={brand} offer={offer} />
            ))}
          </div>
        </section>
      ) : null}
      <Link to={getDemoPath(token, 'documents')} className="flex min-h-11 items-center justify-center rounded-[12px] border border-[#dbe5ef] bg-white text-sm font-semibold" style={{ color: brand.primary }}>
        View all required documents
      </Link>
    </div>
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

function MobileTeam({ brand, team }) {
  const mainContact = team.find((member) => member.isMainContact) || team[0]
  const activeMember = team.find((member) => member.isActive) || mainContact
  const specialists = team.filter((member) => !member.isMainContact)
  const routes = [
    ['General questions about my purchase', `Speak to ${mainContact.name.split(' ')[0]} · Your Agent`, mainContact, MessageCircle, 'info'],
    ['My bond application or bank offers', 'Speak to Priya · Bond Originator', specialists.find((member) => member.role === 'Bond Originator'), Building2, 'complete'],
    ['Transfer, signing or registration', `Speak to ${activeMember.name.split(' ')[0]} · Transfer Attorney`, activeMember, FileSignature, 'info'],
    ['Documents or signing arrangements', 'Speak to Lerato · Conveyancing Secretary', specialists.find((member) => member.role === 'Conveyancing Secretary'), FileText, 'action'],
  ].filter(([, , member]) => member)

  return (
    <div className="space-y-4">
      <p className="-mt-2 text-sm leading-5 text-[#52657b]">The people helping you.</p>
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

function DemoContent({ activeSection, brand, config, heroOverlayStyle, loading, documentRows, transactionTeam, demoUploadComplete, onCompleteUpload }) {
  if (activeSection === 'documents') {
    return (
      <DocumentsSection
        brand={brand}
        config={config}
        demoUploadComplete={demoUploadComplete}
        onCompleteUpload={onCompleteUpload}
      />
    )
  }

  if (activeSection === 'finance') {
    return (
      <FinanceSection
        brand={brand}
        demoUploadComplete={demoUploadComplete}
        onCompleteUpload={onCompleteUpload}
      />
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
    return <TeamSection brand={brand} config={config} team={transactionTeam} />
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
              <HeroMetric label="Current stage" value="Finance" />
            </div>
          </div>
          <div className="rounded-[24px] border border-white/20 bg-white/10 p-5 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Progress</p>
            <div className="mt-5 flex items-center justify-center">
              <div className="relative flex h-36 w-36 items-center justify-center rounded-full" style={{ background: `conic-gradient(${brand.accent} 180deg, rgba(255,255,255,0.24) 0deg)` }}>
                <span className="absolute inset-3 rounded-full bg-slate-950/70" />
                <span className="relative text-center">
                  <strong className="block text-4xl tracking-[-0.05em]">50%</strong>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Complete</span>
                </span>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-white/80">Next: transfer attorney prepares guarantees and lodgement documents.</p>
          </div>
        </div>
      </section>

      {activeSection === 'overview' ? (
        <OverviewSection brand={brand} documentRows={documentRows} onCompleteUpload={onCompleteUpload} demoUploadComplete={demoUploadComplete} />
      ) : null}
      {activeSection === 'progress' ? <ConveyancingJourneySection brand={brand} /> : null}
      {activeSection === 'messages' ? <TransactionUpdatesSection brand={brand} standalone /> : null}
    </div>
  )
}

function PurchaseJourneySection({ brand }) {
  const currentStage = DEMO_JOURNEY_STAGES.find((stage) => stage.status === 'current') || DEMO_JOURNEY_STAGES[0]

  return (
    <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#52657b]">Your purchase journey</p>

      <div className="mt-6 overflow-x-auto pb-2">
        <div className="grid min-w-[860px] grid-cols-6 items-start">
          {DEMO_JOURNEY_STAGES.map((stage, index) => {
            const isComplete = stage.status === 'complete'
            const isCurrent = stage.status === 'current'
            return (
              <div key={stage.id} className="relative flex flex-col items-center px-2 text-center">
                {index > 0 ? (
                  <span
                    className="absolute left-0 top-[15px] h-px w-1/2"
                    style={{ backgroundColor: isComplete || isCurrent ? brand.primary : '#c7d1dc' }}
                  />
                ) : null}
                {index < DEMO_JOURNEY_STAGES.length - 1 ? (
                  <span
                    className="absolute right-0 top-[15px] h-px w-1/2"
                    style={{ backgroundColor: isComplete ? brand.primary : '#c7d1dc' }}
                  />
                ) : null}
                <span
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold ${
                    isCurrent ? 'bg-white shadow-[0_0_0_5px_rgba(16,185,129,0.14)]' : isComplete ? 'text-white' : 'bg-white text-[#7b8ca2]'
                  }`}
                  style={{
                    borderColor: isComplete || isCurrent ? brand.primary : '#98a6b6',
                    backgroundColor: isComplete ? brand.primary : '#ffffff',
                    color: isComplete ? '#ffffff' : isCurrent ? brand.primary : '#667085',
                  }}
                >
                  {isComplete ? <CheckCircle2 size={17} /> : null}
                </span>
                <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#101828]">{stage.label}</p>
                {stage.completionDate ? <p className="mt-1 text-xs font-medium uppercase text-[#98a2b3]">{stage.completionDate}</p> : null}
                {isCurrent ? <p className="mt-1 text-xs font-semibold uppercase" style={{ color: brand.primary }}>You are here</p> : null}
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-5 rounded-[20px] border p-5" style={{ borderColor: hexToRgba(brand.primary, 0.18), backgroundColor: hexToRgba(brand.primary, 0.045) }}>
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr_1fr] lg:items-center">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border bg-white" style={{ borderColor: hexToRgba(brand.primary, 0.18), color: brand.primary }}>
              <HandCoins size={25} />
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-[#142132]">{currentStage.label} is underway</h2>
              <p className="mt-2 text-sm leading-6 text-[#344054]">{currentStage.description}</p>
            </div>
          </div>
          <div className="border-[#d7e0ea] lg:border-l lg:pl-8">
            <div className="flex items-start gap-3">
              <Clock3 size={22} className="mt-1 text-[#344054]" />
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-[#667085]">Usually takes</p>
                <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#101828]">5 - 10</p>
                <p className="text-sm text-[#344054]">business days</p>
              </div>
            </div>
          </div>
          <div className="border-[#d7e0ea] lg:border-l lg:pl-8">
            <div className="flex items-start gap-3">
              <Flag size={22} className="mt-1 text-[#344054]" />
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-[#667085]">Next milestone</p>
                <p className="mt-1 text-base font-semibold leading-6 text-[#101828]">{currentStage.nextMilestone}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
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
    { label: 'Transfer attorney', value: 'Sarah Williams', helper: 'Tuckers Attorneys', icon: UserRound },
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
    { label: 'Usually takes', value: '5 - 10', helper: 'business days', icon: CalendarDays },
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

function DocumentCategorySummary({ brand }) {
  return (
    <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#52657b]">Your documents</p>
        </div>
        <span className="rounded-full bg-[#f2f4f7] px-3 py-1 text-xs font-semibold text-[#667085]">5 of 8 ready</span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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

function OverviewSection({ brand, documentRows, demoUploadComplete, onCompleteUpload }) {
  return (
    <div className="space-y-5">
      <PurchaseJourneySection brand={brand} />
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#52657b]">Needs your attention</p>
              <h2 className="mt-8 text-xl font-semibold tracking-[-0.04em] text-[#142132]">Upload your latest payslip</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#52657b]">Your bond originator needs an updated payslip before your application can be submitted to the banks.</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${demoUploadComplete ? statusClasses('info') : statusClasses('action')}`}>
              {demoUploadComplete ? 'Uploaded' : '1 item needs you'}
            </span>
          </div>
          <div className="mt-7 flex items-center gap-4">
            <span className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-full md:flex" style={{ backgroundColor: hexToRgba(brand.primary, 0.08), color: brand.primary }}>
              <FileSignature size={28} />
            </span>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={onCompleteUpload} className="inline-flex min-h-11 items-center gap-2 rounded-[14px] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.12)]" style={{ backgroundColor: brand.primary }}>
                <UploadCloud size={17} />
                {demoUploadComplete ? 'Uploaded for review' : 'Upload payslip'}
              </button>
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-[14px] border bg-white px-5 text-sm font-semibold" style={{ borderColor: hexToRgba(brand.primary, 0.22), color: '#344054' }}>
                View requested documents
              </button>
            </div>
          </div>
        </section>
        <TransactionUpdatesSection brand={brand} />
      </div>
      <DocumentCategorySummary brand={brand} />
    </div>
  )
}

function DocumentsSection({ brand, config, demoUploadComplete, onCompleteUpload }) {
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
            ['Shared with', 'James Meyer, Bond Originator'],
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
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-[#142132]">Your documents</h1>
          <p className="mt-2 text-base leading-6 text-[#52657b]">All the documents for your purchase, in one place.</p>
        </div>
        <div className="flex items-start gap-2 rounded-[14px] px-3 py-2 text-sm text-[#52657b]">
          <Lock size={15} className="mt-1 shrink-0 text-[#142132]" />
          <span>Your information is secure<br className="hidden lg:block" /> and encrypted.</span>
        </div>
      </header>

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

function DocumentStatusSummary({ readyCount, actionCount, preparingCount, unavailableCount }) {
  const items = [
    { value: `${readyCount} of 8`, label: 'Documents ready', helper: 'Complete', tone: 'complete', icon: CheckCircle2 },
    { value: actionCount, label: 'Needs your attention', helper: 'Action required', tone: 'action', icon: AlertCircle },
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

function FinanceSection({ brand, demoUploadComplete, onCompleteUpload }) {
  const [expandedBankId, setExpandedBankId] = useState('standard-bank')
  const [showApplicationDetails, setShowApplicationDetails] = useState(false)
  const application = {
    ...FINANCE_APPLICATION,
    requiredActions: demoUploadComplete ? [] : FINANCE_APPLICATION.requiredActions,
  }
  const currentStageIndex = BOND_JOURNEY_STAGES.findIndex((stage) => stage.id === application.currentStage)
  const offers = application.bankApplications
    .filter((bank) => bank.approvedAmount)
    .sort((first, second) => Number(second.isRecommended) - Number(first.isRecommended))

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-[#142132]">Finance</h1>
          <p className="mt-2 text-base leading-6 text-[#52657b]">Track your bond application and compare bank offers.</p>
        </div>
        <div className="flex items-start gap-2 rounded-[14px] px-3 py-2 text-sm text-[#52657b]">
          <Lock size={15} className="mt-1 shrink-0 text-[#142132]" />
          <span>Your information is secure<br className="hidden lg:block" /> and encrypted.</span>
        </div>
      </header>

      <FinanceSummary application={application} />

      <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:p-6">
        <h2 className="text-xl font-semibold tracking-[-0.04em] text-[#142132]">Your bond journey</h2>
        <p className="mt-2 text-sm leading-6 text-[#52657b]">Here's where we are in the bond process.</p>
        <BondJourneyTracker brand={brand} currentStageIndex={currentStageIndex} />
        <CurrentFinanceStatus
          brand={brand}
          application={application}
          demoUploadComplete={demoUploadComplete}
          onCompleteUpload={onCompleteUpload}
        />
      </section>

      <BankApplicationsSection
        brand={brand}
        banks={application.bankApplications}
        expandedBankId={expandedBankId}
        onToggleBank={(bankId) => setExpandedBankId((current) => (current === bankId ? '' : bankId))}
      />

      {offers.length ? <BankOffersSection brand={brand} application={application} offers={offers} /> : null}

      <ApplicationDetailsSection
        application={application}
        expanded={showApplicationDetails}
        onToggle={() => setShowApplicationDetails((value) => !value)}
      />
    </div>
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
                ? 'Your bond originator is preparing your application for submission to the banks. We just need your latest payslip before it can be sent.'
                : 'Your bond originator is preparing your application for submission.'}
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
            View all required documents
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
  const [activeSection, setActiveSection] = useState('income_deductions_expenses')
  const [values, setValues] = useState(() => createDemoBondApplicationValues())
  const [saved, setSaved] = useState(false)
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
  const totalDetails = 30
  const completedDetails = documentNeededCount > 0 ? 24 : 26
  const completionPercent = Math.round((completedDetails / totalDetails) * 100)
  const isFirstSection = activeIndex <= 0
  const isFinalSection = activeSection === 'declarations_consents'

  function updateField(key, value) {
    setSaved(false)
    setValues((current) => ({ ...current, [key]: value }))
  }

  function handleSaveDemoProgress() {
    setSaved(true)
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
            <p className="mt-2 text-base leading-6 text-[#52657b]">Your application has been completed and is ready for bank submission.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#142132]">
            <CheckCircle2 size={16} style={{ color: brand.primary }} />
            Application completed
          </span>
        </div>
        <div className="mt-6 rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ['Application completed', 'Ready'],
              ['Submitted to banks', 'Next'],
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
    <section className={`${compact ? 'space-y-4 overflow-hidden' : 'mx-auto max-w-[1280px]'}`}>
      <div className={`grid min-w-0 gap-6 ${compact ? '' : 'xl:grid-cols-[300px_minmax(0,900px)] xl:gap-10'}`}>
        <aside className={`${compact ? 'order-2 min-w-0' : 'xl:sticky xl:top-8 xl:self-start'}`}>
          <DemoBondApplicationJourney
            brand={brand}
            sections={sections}
            activeSection={activeSection}
            onSelect={setActiveSection}
            compact={compact}
          />
          {!compact ? (
            <div className="mt-8 rounded-[16px] border p-4" style={{ borderColor: hexToRgba(brand.primary, 0.16), backgroundColor: hexToRgba(brand.primary, 0.045) }}>
              <div className="flex items-start gap-3">
                <Lock size={18} className="mt-0.5 shrink-0" style={{ color: brand.primary }} />
                <div>
                  <h2 className="text-sm font-semibold text-[#142132]">Your information is secure</h2>
                  <p className="mt-1 text-sm leading-6 text-[#52657b]">We use bank-level security to protect your data.</p>
                </div>
              </div>
            </div>
          ) : null}
        </aside>

        <div className={`${compact ? 'order-1 min-w-0 overflow-hidden' : ''}`}>
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#53677d]">Your application</span>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-[#142132] lg:text-4xl">Your bond application</h1>
              <p className="mt-2 text-base leading-6 text-[#52657b]">Most of your application is already complete.</p>
            </div>
            <button type="button" className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#142132] shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
              <Lock size={15} />
              Save & exit
            </button>
          </header>

          <div className={`mt-5 ${compact ? 'space-y-2' : 'flex items-center gap-4'}`}>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#e4ebf3]">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${completionPercent}%`, backgroundColor: brand.primary }} />
            </div>
            <span className="block shrink-0 text-sm font-semibold" style={{ color: brand.primary }}>{completionPercent}% complete</span>
          </div>

          <DemoBondApplicationStatusCard
            brand={brand}
            completedDetails={completedDetails}
            documentNeededCount={documentNeededCount}
            selectedBanksCount={selectedBanksCount}
          />

          <article className="mt-6 rounded-[22px] border border-[#dbe5ef] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] lg:p-7">
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
              <div className="mt-8 space-y-8">
                {activeGroups.map((group) => {
                  const Icon = group.icon || FileText
                  return (
                    <section key={group.title}>
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: hexToRgba(brand.primary, 0.1), color: brand.primary }}>
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
                            field={field}
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

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                style={{ backgroundColor: brand.primary }}
              >
                {isFinalSection ? 'Review & submit' : saved ? 'Saved, continue' : 'Save & continue'}
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="mt-8 rounded-[16px] border p-4" style={{ borderColor: hexToRgba(brand.primary, 0.14), backgroundColor: hexToRgba(brand.primary, 0.04) }}>
              <div className="flex items-start gap-3">
                <Lock size={17} className="mt-0.5 shrink-0" style={{ color: brand.primary }} />
                <p className="text-sm leading-6 text-[#426074]">
                  <strong className="text-[#142132]">We've prefilled what we can.</strong><br />
                  You only need to complete the required details. Everything is saved as you go.
                </p>
              </div>
            </div>
          </article>
          <p className="mt-3 text-right text-xs font-medium text-[#7b8ca2]">Demo</p>
        </div>
      </div>
    </section>
  )
}

function getDemoBondApplicationSectionHelper(sectionKey) {
  if (sectionKey === 'income_deductions_expenses') return 'This helps your bond originator calculate affordability.'
  if (sectionKey === 'documents') return 'We only show what is required for your application right now.'
  if (sectionKey === 'declarations_consents') return 'Review the final declarations before your application is submitted.'
  if (sectionKey === 'banking_liabilities') return 'Confirm your banking details and current financial commitments.'
  if (sectionKey === 'loan_details') return 'Confirm the property, loan amount, deposit and selected banks.'
  return 'Most of this information has already been completed from your profile.'
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
      label: `${selectedBanksCount} banks selected`,
      helper: "We'll submit your application to your chosen banks",
      icon: Building2,
      tone: 'complete',
    },
  ]

  return (
    <section className="mt-6 rounded-[18px] border border-[#dbe5ef] bg-white px-4 py-4 shadow-[0_14px_28px_rgba(15,23,42,0.05)]">
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
    <section className={compact ? 'w-full min-w-0 overflow-hidden rounded-[18px] border border-[#dbe5ef] bg-white p-4' : ''}>
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#53677d]">Your application</p>
      <div className={compact ? 'max-w-full overflow-x-auto pb-1' : ''}>
        <nav className={compact ? 'flex w-max gap-3' : 'relative space-y-1'}>
          {!compact ? <span className="absolute left-[15px] top-5 h-[calc(100%-40px)] w-px bg-[#dbe5ef]" /> : null}
          {sections.map((section) => {
            const active = section.key === activeSection
            const complete = section.tone === 'complete'
            const attention = section.tone === 'action'
            const indicatorStyle = complete
              ? { backgroundColor: brand.primary, borderColor: brand.primary, color: '#ffffff' }
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
                style={active ? { boxShadow: `inset 3px 0 0 ${attention ? '#f59e0b' : brand.primary}` } : null}
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
    </section>
  )
}

function DemoBondApplicationField({ field, value, brand, onChange }) {
  if (field.type === 'checkbox') {
    return (
      <label className="flex min-h-[52px] items-start gap-3 rounded-[12px] border border-[#e3ebf4] bg-white px-3 py-3 md:col-span-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[#c7d4e3]"
          style={{ accentColor: brand.primary }}
        />
        <span className="text-sm leading-6 text-[#324559]">
          {field.label}
          {field.required ? <span className="ml-1 font-semibold" style={{ color: brand.primary }}>*</span> : null}
        </span>
      </label>
    )
  }

  const inputClassName = 'mt-2 min-h-[52px] w-full rounded-[12px] border border-[#d8e3ee] bg-white px-4 py-3 text-base text-[#142132] outline-none transition focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12 disabled:bg-[#f3f6f9] disabled:text-[#667085]'

  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#203549]">
        {field.label}
        {field.required ? <span className="ml-1" style={{ color: brand.primary }}>*</span> : null}
      </span>
      {field.type === 'select' ? (
        <select value={value ?? ''} onChange={(event) => onChange(event.target.value)} className={inputClassName}>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'date' || field.type === 'email' ? field.type : 'text'}
          inputMode={field.inputMode}
          value={value ?? ''}
          readOnly={field.readOnly}
          disabled={field.readOnly}
          onChange={(event) => onChange(event.target.value)}
          className={inputClassName}
        />
      )}
      {field.source ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-[#52657b]">
          <CheckCircle2 size={14} style={{ color: brand.primary }} />
          {field.source}
        </p>
      ) : null}
      {field.readOnly ? <p className="mt-2 text-sm text-[#6b7d93]">Calculated from your application values.</p> : null}
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

function TeamSection({ brand, team }) {
  const mainContact = team.find((member) => member.isMainContact) || team[0]
  const activeMember = team.find((member) => member.isActive) || mainContact
  const specialists = team.filter((member) => !member.isMainContact)
  const contactRoutes = [
    {
      id: 'general',
      title: 'General questions about my purchase',
      helper: `Speak to ${mainContact.name.split(' ')[0]} · Your Agent`,
      member: mainContact,
      icon: MessageCircle,
      tone: 'info',
    },
    {
      id: 'bond',
      title: 'My bond application or bank offers',
      helper: 'Speak to Priya · Bond Originator',
      member: team.find((member) => member.role === 'Bond Originator'),
      icon: Building2,
      tone: 'complete',
    },
    {
      id: 'transfer',
      title: 'Transfer, signing or registration',
      helper: `Speak to ${activeMember.name.split(' ')[0]} · Transfer Attorney`,
      member: activeMember,
      icon: FileSignature,
      tone: 'info',
    },
    {
      id: 'documents',
      title: 'Documents or signing arrangements',
      helper: 'Speak to Lerato · Secretary',
      member: team.find((member) => member.role === 'Conveyancing Secretary'),
      icon: FileText,
      tone: 'action',
    },
  ].filter((route) => route.member)

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-[-0.06em] text-[#142132]">Your transaction team</h1>
        <p className="mt-2 text-base leading-6 text-[#52657b]">The people helping you through your purchase, finance and transfer.</p>
      </header>

      <TeamContextSummary brand={brand} mainContact={mainContact} activeMember={activeMember} />

      <section className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)] xl:items-start">
        <div>
          <h2 className="mb-4 text-lg font-semibold tracking-[-0.04em] text-[#142132]">Your main contact</h2>
          <TeamMemberCard brand={brand} member={mainContact} prominent />
        </div>
        <div>
          <h2 className="mb-4 text-lg font-semibold tracking-[-0.04em] text-[#142132]">Your specialist team</h2>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {specialists.map((member) => (
              <TeamMemberCard key={member.id} brand={brand} member={member} />
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <h2 className="text-xl font-semibold tracking-[-0.04em] text-[#142132]">Not sure who to contact?</h2>
        <p className="mt-2 text-sm leading-6 text-[#52657b]">Here's who can help with the most common questions.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {contactRoutes.map((route) => (
            <ContactRouteCard key={route.id} brand={brand} route={route} />
          ))}
        </div>
      </section>

      <p className="flex items-center justify-center gap-2 text-sm text-[#52657b]">
        <Lock size={15} />
        Only authorised parties involved in your transaction can access your information.
      </p>
    </div>
  )
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
