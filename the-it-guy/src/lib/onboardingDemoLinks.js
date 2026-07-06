export const BUYER_ONBOARDING_DEMO_TOKEN = 'demo-buyer-onboarding'
export const SELLER_ONBOARDING_DEMO_TOKEN = 'demo-seller-onboarding'
export const BUYER_PORTAL_DEMO_TOKEN = 'demo-buyer-portal'
export const SELLER_PORTAL_DEMO_TOKEN = 'demo-seller-portal'

const DEMO_BRAND = {
  organisationId: 'demo-arch9-agency',
  organisationName: 'Kingstons Real Estate',
  agencyName: 'Kingstons Real Estate',
  senderName: 'Sarah Williams',
  logoUrl: '/brand/kingstons-logo-cover.png',
  logoDarkUrl: '/brand/kingstons-logo-cover.png',
  logoLightUrl: '/brand/kingstons-logo-form.png',
  primaryColour: '',
  secondaryColour: '',
  initials: 'K',
}

const DEMO_PROPERTY_ADDRESS = {
  line1: '2 Pine Avenue',
  line2: 'Unit 4',
  suburb: 'Sea Point',
  city: 'Cape Town',
  province: 'Western Cape',
  postalCode: '8005',
  municipality: 'City of Cape Town',
  country: 'South Africa',
  source: 'demo',
  formatted: '2 Pine Avenue, Unit 4, Sea Point, Cape Town, Western Cape, 8005',
}

export function isBuyerOnboardingDemoToken(token = '') {
  return String(token || '').trim() === BUYER_ONBOARDING_DEMO_TOKEN
}

export function isSellerOnboardingDemoToken(token = '') {
  return String(token || '').trim() === SELLER_ONBOARDING_DEMO_TOKEN
}

export function isBuyerPortalDemoToken(token = '') {
  return String(token || '').trim() === BUYER_PORTAL_DEMO_TOKEN
}

export function isSellerPortalDemoToken(token = '') {
  return String(token || '').trim() === SELLER_PORTAL_DEMO_TOKEN
}

export function isClientPortalDemoToken(token = '') {
  return isBuyerPortalDemoToken(token) || isSellerPortalDemoToken(token)
}

function getDemoShareSearch(search = '') {
  const raw = String(search || '').trim()
  if (!raw) return ''
  const share = raw
    .split('#')
    .flatMap((part) => part.split('?'))
    .map((part) => part.replace(/^&+/, '').trim())
    .filter(Boolean)
    .map((part) => new URLSearchParams(part))
    .map((params) => params.get('_vercel_share') || params.get('vercel_share'))
    .find(Boolean)
  return share ? `?_vercel_share=${encodeURIComponent(share)}` : ''
}

function buildPath(path, search = '') {
  return `${path}${getDemoShareSearch(search)}`
}

function buildUrl(path, origin = '', search = '') {
  const base =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://app.arch9.co.za')
  return `${base}${buildPath(path, search)}`
}

export function getOnboardingDemoLinks(origin = '', search = '') {
  const buyerOnboardingPath = `/client/onboarding/${BUYER_ONBOARDING_DEMO_TOKEN}`
  const sellerOnboardingPath = `/seller/onboarding/${SELLER_ONBOARDING_DEMO_TOKEN}`
  const buyerPortalPath = `/client/${BUYER_PORTAL_DEMO_TOKEN}/buying`
  const sellerPortalPath = `/client/${SELLER_PORTAL_DEMO_TOKEN}/selling`

  return {
    indexPath: '/demo/onboarding-links',
    buyerPath: buildPath(buyerOnboardingPath, search),
    sellerPath: buildPath(sellerOnboardingPath, search),
    buyerPortalPath: buildPath(buyerPortalPath, search),
    sellerPortalPath: buildPath(sellerPortalPath, search),
    buyerUrl: buildUrl(buyerOnboardingPath, origin, search),
    sellerUrl: buildUrl(sellerOnboardingPath, origin, search),
    buyerPortalUrl: buildUrl(buyerPortalPath, origin, search),
    sellerPortalUrl: buildUrl(sellerPortalPath, origin, search),
  }
}

function demoRequiredDocument({
  key,
  label,
  group,
  description,
  status = 'required',
  complete = false,
  expectedFromRole = 'buyer',
  uploadedDocumentId = '',
}) {
  return {
    key,
    label,
    group,
    requirement_group: group,
    groupKey: String(group || '').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    description,
    requirementLevel: 'required',
    requiredDocumentStatus: status,
    status,
    complete,
    isUploaded: complete,
    expectedFromRole,
    expected_from_role: expectedFromRole,
    visibility: expectedFromRole === 'seller' ? 'seller_visible' : 'client',
    uploadedDocumentId: uploadedDocumentId || null,
    uploaded_document_id: uploadedDocumentId || null,
  }
}

function demoUploadedDocument({
  id,
  name,
  category,
  documentType,
  requirementKey = '',
  uploadedByRole = 'agent',
  status = 'uploaded',
  visibility = 'client',
  createdAt = '2026-07-06T08:20:00.000Z',
  url = '',
}) {
  return {
    id,
    name,
    document_name: name,
    category,
    document_type: documentType || requirementKey || category,
    requirementKey,
    requirement_key: requirementKey,
    uploaded_by_role: uploadedByRole,
    status,
    visibility,
    created_at: createdAt,
    url,
    openDirectUrl: Boolean(url),
  }
}

function getDemoBuyerPortalSeed(token = BUYER_PORTAL_DEMO_TOKEN) {
  const buyerPayload = getDemoBuyerOnboardingPayload(BUYER_ONBOARDING_DEMO_TOKEN)
  const formData = buyerPayload.formData || {}
  const updatedAt = '2026-07-06T09:30:00.000Z'
  const documents = [
    demoUploadedDocument({
      id: 'demo-buyer-id-document',
      name: 'Mia Khumalo ID.pdf',
      category: 'FICA',
      documentType: 'buyer_id_document',
      requirementKey: 'buyer_id_document',
      uploadedByRole: 'client',
      status: 'approved',
      createdAt: '2026-07-06T08:24:00.000Z',
    }),
    demoUploadedDocument({
      id: 'demo-buyer-bank-statements',
      name: 'Bank statements - May to July.pdf',
      category: 'Finance',
      documentType: 'bank_statements',
      requirementKey: 'bank_statements',
      uploadedByRole: 'client',
      createdAt: '2026-07-06T08:30:00.000Z',
    }),
    demoUploadedDocument({
      id: 'demo-buyer-draft-otp',
      name: 'Offer to Purchase - draft.pdf',
      category: 'Sales Pack',
      documentType: 'offer_to_purchase',
      uploadedByRole: 'agent',
      createdAt: '2026-07-06T09:05:00.000Z',
    }),
    demoUploadedDocument({
      id: 'demo-buyer-bond-offer-nedbank',
      name: 'Nedbank indicative bond approval.pdf',
      category: 'Bond Offer',
      documentType: 'bond_offer',
      uploadedByRole: 'bond_originator',
      createdAt: '2026-07-06T09:18:00.000Z',
    }),
  ]
  const requiredDocuments = [
    demoRequiredDocument({
      key: 'buyer_id_document',
      label: 'Buyer ID Document',
      group: 'FICA',
      description: 'A clear copy of the purchaser identity document.',
      status: 'approved',
      complete: true,
      uploadedDocumentId: 'demo-buyer-id-document',
    }),
    demoRequiredDocument({
      key: 'proof_of_income',
      label: 'Proof of Income',
      group: 'Finance',
      description: 'Latest payslip or income confirmation.',
      status: 'required',
    }),
    demoRequiredDocument({
      key: 'bank_statements',
      label: 'Bank Statements',
      group: 'Finance',
      description: 'Three months of bank statements.',
      status: 'uploaded',
      complete: true,
      uploadedDocumentId: 'demo-buyer-bank-statements',
    }),
    demoRequiredDocument({
      key: 'reservation_deposit_proof',
      label: 'Reservation Deposit Proof of Payment',
      group: 'Sales',
      description: 'Proof of payment for the reservation deposit.',
      status: 'required',
    }),
    demoRequiredDocument({
      key: 'signed_offer_to_purchase',
      label: 'Signed Offer to Purchase',
      group: 'Sales',
      description: 'Signed OTP once the agreement is ready.',
      status: 'requested',
    }),
  ]
  const transaction = {
    ...(buyerPayload.transaction || {}),
    token,
    stage: 'Finance In Progress',
    current_main_stage: 'FIN',
    status: 'active',
    finance_managed_by: 'bond_originator',
    assigned_agent_phone: '+27 21 555 0100',
    assigned_attorney_email: 'transfers.demo@jacobs.example',
    assigned_bond_originator_email: 'bond.demo@betterbond.example',
    stage_updated_at: updatedAt,
    updated_at: updatedAt,
  }
  const unit = {
    ...(buyerPayload.unit || {}),
    price: 2850000,
    development: {
      ...(buyerPayload.unit?.development || {}),
      name: 'Pine Avenue Apartments',
      developer_company: 'Arch9 Demo Agency',
    },
  }
  const portalData = {
    __demoPortal: true,
    buyer: buyerPayload.buyer,
    transaction,
    unit,
    listing: {
      id: 'demo-buyer-listing',
      title: '2 Pine Avenue, Unit 4',
      address: DEMO_PROPERTY_ADDRESS.formatted,
      seller: {
        name: 'Thabo Mokoena',
        email: 'thabo.demo@arch9.co.za',
      },
    },
    stage: transaction.stage,
    mainStage: transaction.current_main_stage,
    lastUpdated: updatedAt,
    onboarding: {
      ...(buyerPayload.onboarding || {}),
      status: 'Submitted',
      submittedAt: '2026-07-06T08:45:00.000Z',
    },
    onboardingFormData: {
      status: 'Submitted',
      purchaserType: 'individual',
      purchaserTypeLabel: 'Individual',
      formData,
    },
    requiredDocuments,
    requiredDocumentSummary: {
      uploadedCount: 2,
      totalRequired: requiredDocuments.length,
    },
    documents,
    additionalDocumentRequests: [
      {
        id: 'demo-proof-income-request',
        title: 'Updated payslip',
        documentName: 'Latest payslip',
        documentKey: 'proof_of_income',
        requestedBy: 'BetterBond Demo Desk',
        requestedFrom: 'buyer',
        assignedToRole: 'buyer',
        clientVisible: true,
        visibility: 'client_visible',
        status: 'requested',
        priority: 'high',
        dueDate: '2026-07-10',
        notes: 'Upload your latest payslip so the bond package can be finalised.',
      },
    ],
    appointments: [
      {
        id: 'demo-buyer-appointment',
        appointmentId: 'demo-buyer-appointment',
        title: 'Bond readiness call',
        dateTime: '2026-07-08T10:00:00.000+02:00',
        status: 'scheduled',
        visibility: 'client',
        location: 'Video call',
        notes: 'Confirm supporting documents and bank choices.',
      },
    ],
    subprocesses: [
      {
        process_type: 'finance',
        status: 'in_progress',
        steps: [
          { step_key: 'application_started', step_label: 'Application Started', status: 'completed' },
          { step_key: 'documents_pending', step_label: 'Documents Pending', status: 'in_progress' },
          { step_key: 'bank_submission', step_label: 'Bank Submission', status: 'pending' },
        ],
      },
      {
        process_type: 'transfer',
        status: 'pending',
        steps: [
          { step_key: 'instruction_received', step_label: 'Instruction Received', status: 'pending' },
          { step_key: 'lodgement', step_label: 'Lodgement', status: 'pending' },
        ],
      },
    ],
    discussion: [
      {
        id: 'demo-buyer-update-1',
        title: 'Bond package in progress',
        description: 'Your bond originator is waiting for the latest payslip before sending the application pack to the banks.',
        createdAt: updatedAt,
        actionRoute: 'documents',
        priority: 'high',
      },
      {
        id: 'demo-buyer-update-2',
        title: 'OTP shared',
        description: 'The draft Offer to Purchase is available in your documents area.',
        createdAt: '2026-07-06T09:05:00.000Z',
        actionRoute: 'documents',
        priority: 'normal',
      },
    ],
    events: [],
    settings: {
      snag_reporting_enabled: true,
      alteration_requests_enabled: true,
      service_reviews_enabled: true,
    },
    featureAvailability: {
      review: true,
    },
    handover: {
      status: 'not_started',
      handoverDate: '',
      electricityMeterReading: '',
      waterMeterReading: '',
      gasMeterReading: '',
      inspectionCompleted: false,
      keysHandedOver: false,
      remoteHandedOver: false,
      manualsHandedOver: false,
      notes: '',
      signatureName: 'Mia Khumalo',
    },
    issues: [],
    alterations: [],
    reviews: [],
    occupationalRent: null,
    buyerRequirementProfile: null,
    missingBuyerRequirements: {
      totalMissingCritical: 2,
    },
    clientVisibleBuyerRequirements: [],
  }

  return {
    portalData,
    contexts: [],
    hasBuyingContext: true,
    hasSellingContext: false,
    workspaceRoles: ['buyer'],
    nextActions: [
      {
        id: 'demo-buyer-next-action-documents',
        type: 'upload_documents',
        title: 'Upload the latest payslip',
        description: 'The bond originator needs one updated payslip before submitting the application pack.',
        actionRoute: 'documents',
        actionLabel: 'Open Documents',
        blocking: true,
        dueDate: '2026-07-10',
        priority: 'high',
      },
      {
        id: 'demo-buyer-next-action-appointment',
        type: 'appointment',
        title: 'Confirm bond readiness call',
        description: 'A short call is scheduled to confirm finance preferences and bank choices.',
        actionRoute: 'appointments',
        actionLabel: 'View Appointment',
        blocking: false,
        dueDate: '2026-07-08',
        priority: 'normal',
      },
    ],
    activityFeed: portalData.discussion,
    activityFeedSummary: {
      actionRequired: 1,
      overdue: 0,
      dueSoon: 1,
    },
    notifications: {
      unreadCount: 1,
      items: [
        {
          id: 'demo-buyer-notification-documents',
          type: 'document_request',
          title: 'Document requested',
          description: 'Upload the latest payslip to keep the bond application moving.',
          status: 'unread',
          priority: 'high',
          actionRoute: 'documents',
          actionLabel: 'Upload',
          createdAt: updatedAt,
        },
      ],
    },
  }
}

function getDemoSellerPortalSeed(token = SELLER_PORTAL_DEMO_TOKEN) {
  const sellerListing = getDemoSellerOnboardingListing(SELLER_ONBOARDING_DEMO_TOKEN)
  const formData = sellerListing.sellerOnboarding?.formData || {}
  const updatedAt = '2026-07-06T09:40:00.000Z'
  const documents = [
    demoUploadedDocument({
      id: 'demo-seller-id-document',
      name: 'Thabo Mokoena ID.pdf',
      category: 'Seller identity',
      documentType: 'seller_identity_document',
      requirementKey: 'seller_identity_document',
      uploadedByRole: 'seller',
      status: 'approved',
      visibility: 'seller_visible',
      createdAt: '2026-07-06T08:35:00.000Z',
    }),
    demoUploadedDocument({
      id: 'demo-seller-rates-account',
      name: 'Municipal rates account.pdf',
      category: 'Property compliance',
      documentType: 'rates_account',
      requirementKey: 'rates_account',
      uploadedByRole: 'seller',
      status: 'uploaded',
      visibility: 'seller_visible',
      createdAt: '2026-07-06T08:42:00.000Z',
    }),
    demoUploadedDocument({
      id: 'demo-seller-signed-mandate',
      name: 'Signed Sole Mandate.pdf',
      category: 'Mandate',
      documentType: 'mandate_signature',
      uploadedByRole: 'agent',
      status: 'completed',
      visibility: 'seller_visible',
      createdAt: '2026-07-06T09:10:00.000Z',
    }),
  ]
  const requiredDocuments = [
    demoRequiredDocument({
      key: 'seller_identity_document',
      label: 'Seller ID Document',
      group: 'Seller identity',
      description: 'A clear copy of the seller identity document.',
      status: 'approved',
      complete: true,
      expectedFromRole: 'seller',
      uploadedDocumentId: 'demo-seller-id-document',
    }),
    demoRequiredDocument({
      key: 'proof_of_address',
      label: 'Proof of Address',
      group: 'Seller identity',
      description: 'Recent proof of residential address.',
      status: 'required',
      expectedFromRole: 'seller',
    }),
    demoRequiredDocument({
      key: 'rates_account',
      label: 'Municipal Rates Account',
      group: 'Property compliance',
      description: 'Latest municipal rates account.',
      status: 'uploaded',
      complete: true,
      expectedFromRole: 'seller',
      uploadedDocumentId: 'demo-seller-rates-account',
    }),
    demoRequiredDocument({
      key: 'sectional_title_levy_statement',
      label: 'Levy Statement',
      group: 'Sectional title',
      description: 'Latest levy statement from the body corporate.',
      status: 'required',
      expectedFromRole: 'seller',
    }),
  ]
  const sellerExternalListingLinks = [
    {
      id: 'demo-property24-link',
      platform: 'Property24',
      url: 'https://www.property24.com/for-sale/sea-point/cape-town/western-cape/11021/demo',
      status: 'Live',
      visibleToSeller: true,
      publishedAt: '2026-07-06T09:20:00.000Z',
    },
  ]
  const activeSellingContext = {
    id: 'demo-selling-context',
    contextType: 'selling',
    status: 'active',
    sellerWorkspaceToken: token,
    listingId: 'demo-seller-listing',
    listingTitle: '2 Pine Avenue, Unit 4, Sea Point',
    clientName: 'Thabo Mokoena',
    clientEmail: 'thabo.demo@arch9.co.za',
    agencyName: DEMO_BRAND.organisationName,
    assignedAgentName: 'Sarah Williams',
    assignedAgentEmail: 'sarah.demo@arch9.co.za',
    assignedAgentPhone: '+27 21 555 0100',
    askingPrice: 2850000,
    listingStatus: 'active',
    sellerOnboardingStatus: 'submitted',
    mandateStatus: 'fully_signed',
    mandatePacket: {
      id: 'demo-mandate-packet',
      state: 'fully_signed',
      finalSignedFileName: 'Signed Sole Mandate.pdf',
    },
    offers: [
      {
        id: 'demo-seller-offer-1',
        buyerName: 'Lerato Jacobs',
        amount: 2790000,
        offerAmount: 2790000,
        status: 'submitted',
        receivedAt: '2026-07-06T09:25:00.000Z',
        financeType: 'bond',
        conditions: 'Subject to bond approval within 14 days.',
        expiryDate: '2026-07-09',
      },
      {
        id: 'demo-seller-offer-2',
        buyerName: 'Nadia Petersen',
        amount: 2725000,
        offerAmount: 2725000,
        status: 'under_review',
        receivedAt: '2026-07-06T09:32:00.000Z',
        financeType: 'cash',
        conditions: 'Cash offer with occupation on registration.',
        expiryDate: '2026-07-08',
      },
    ],
  }
  const portalData = {
    __demoPortal: true,
    buyer: {
      id: 'demo-seller-client',
      name: 'Thabo Mokoena',
      email: 'thabo.demo@arch9.co.za',
      phone: '+27 83 555 0198',
    },
    transaction: {
      id: 'demo-seller-transaction',
      transaction_reference: 'A9-SELL-2048',
      organisation_id: DEMO_BRAND.organisationId,
      stage: 'Listed',
      current_main_stage: 'OTP',
      status: 'active',
      finance_type: 'cash',
      purchase_price: 2850000,
      sales_price: 2850000,
      assigned_agent: 'Sarah Williams',
      assigned_agent_email: 'sarah.demo@arch9.co.za',
      assigned_agent_phone: '+27 21 555 0100',
      attorney: 'Jacobs Transfer Attorneys',
      property_address_line_1: DEMO_PROPERTY_ADDRESS.line1,
      property_address_line_2: DEMO_PROPERTY_ADDRESS.line2,
      suburb: DEMO_PROPERTY_ADDRESS.suburb,
      city: DEMO_PROPERTY_ADDRESS.city,
      province: DEMO_PROPERTY_ADDRESS.province,
      stage_updated_at: updatedAt,
      updated_at: updatedAt,
    },
    unit: {
      id: 'demo-seller-listing',
      unit_number: '2 Pine Avenue',
      unit_label: 'Unit 4',
      price: 2850000,
      status: 'Active Listing',
      development: {
        id: 'demo-seller-development',
        name: 'Pine Avenue Apartments',
        developer_company: DEMO_BRAND.organisationName,
      },
    },
    listing: {
      id: 'demo-seller-listing',
      title: '2 Pine Avenue, Unit 4, Sea Point',
      address: DEMO_PROPERTY_ADDRESS.formatted,
      seller: {
        name: 'Thabo Mokoena',
        email: 'thabo.demo@arch9.co.za',
        phone: '+27 83 555 0198',
      },
      externalLinks: sellerExternalListingLinks,
    },
    activeSellingContext,
    offers: activeSellingContext.offers,
    stage: 'Listed',
    mainStage: 'OTP',
    lastUpdated: updatedAt,
    onboarding: {
      id: 'demo-seller-onboarding-record',
      token: SELLER_ONBOARDING_DEMO_TOKEN,
      status: 'Submitted',
      submittedAt: '2026-07-06T08:55:00.000Z',
    },
    onboardingFormData: {
      status: 'Submitted',
      formData,
    },
    requiredDocuments,
    requiredDocumentSummary: {
      uploadedCount: 2,
      totalRequired: requiredDocuments.length,
    },
    documents,
    additionalDocumentRequests: [
      {
        id: 'demo-levy-statement-request',
        title: 'Latest levy statement',
        documentName: 'Levy Statement',
        documentKey: 'sectional_title_levy_statement',
        requestedBy: 'Sarah Williams',
        requestedFrom: 'seller',
        assignedToRole: 'seller',
        clientVisible: true,
        visibility: 'client_visible',
        status: 'requested',
        priority: 'normal',
        dueDate: '2026-07-11',
        notes: 'Please upload the latest body corporate levy statement.',
      },
    ],
    appointments: [
      {
        id: 'demo-seller-appointment',
        appointmentId: 'demo-seller-appointment',
        title: 'Private viewing',
        dateTime: '2026-07-09T16:30:00.000+02:00',
        status: 'scheduled',
        visibility: 'client',
        location: '2 Pine Avenue, Unit 4',
        notes: 'Qualified buyer viewing arranged by Sarah.',
      },
    ],
    subprocesses: [],
    discussion: [
      {
        id: 'demo-seller-update-1',
        title: 'Listing is live',
        description: 'Your listing is live and the first two offers are visible in the seller portal.',
        createdAt: updatedAt,
        actionRoute: 'offers',
        priority: 'normal',
      },
      {
        id: 'demo-seller-update-2',
        title: 'Levy statement requested',
        description: 'Upload the latest levy statement so compliance can be marked complete.',
        createdAt: '2026-07-06T09:15:00.000Z',
        actionRoute: 'documents',
        priority: 'high',
      },
    ],
    events: [],
    settings: {
      snag_reporting_enabled: false,
      alteration_requests_enabled: false,
      service_reviews_enabled: true,
    },
    featureAvailability: {
      review: true,
    },
    handover: {
      status: 'not_started',
      handoverDate: '',
      electricityMeterReading: '',
      waterMeterReading: '',
      gasMeterReading: '',
      inspectionCompleted: false,
      keysHandedOver: false,
      remoteHandedOver: false,
      manualsHandedOver: false,
      notes: '',
      signatureName: 'Thabo Mokoena',
    },
    issues: [],
    alterations: [],
    reviews: [],
    occupationalRent: null,
  }

  return {
    portalData,
    contexts: [activeSellingContext],
    hasBuyingContext: false,
    hasSellingContext: true,
    workspaceRoles: ['seller'],
    nextActions: [
      {
        id: 'demo-seller-next-action-documents',
        type: 'upload_documents',
        title: 'Upload the latest levy statement',
        description: 'The agent needs the latest body corporate levy statement before compliance can be closed.',
        actionRoute: 'documents',
        actionLabel: 'Open Documents',
        blocking: true,
        dueDate: '2026-07-11',
        priority: 'high',
      },
      {
        id: 'demo-seller-next-action-offers',
        type: 'review_offer',
        title: 'Review active offers',
        description: 'Two offers are ready for review in the seller portal.',
        actionRoute: 'offers',
        actionLabel: 'View Offers',
        blocking: false,
        dueDate: '2026-07-09',
        priority: 'normal',
      },
    ],
    activityFeed: portalData.discussion,
    activityFeedSummary: {
      actionRequired: 1,
      overdue: 0,
      dueSoon: 2,
    },
    notifications: {
      unreadCount: 1,
      items: [
        {
          id: 'demo-seller-notification-offers',
          type: 'offer_update',
          title: 'Offer received',
          description: 'A new offer has been added to your seller portal.',
          status: 'unread',
          priority: 'normal',
          actionRoute: 'offers',
          actionLabel: 'Review',
          createdAt: updatedAt,
        },
      ],
    },
  }
}

export function getDemoClientPortalSeedData(token = '') {
  const normalizedToken = String(token || '').trim()
  if (normalizedToken === BUYER_PORTAL_DEMO_TOKEN) return getDemoBuyerPortalSeed(normalizedToken)
  if (normalizedToken === SELLER_PORTAL_DEMO_TOKEN) return getDemoSellerPortalSeed(normalizedToken)
  return null
}

export function getDemoBuyerOnboardingPayload(token = BUYER_ONBOARDING_DEMO_TOKEN, formDataOverride = null) {
  const formData = formDataOverride || {
    purchaser_type: 'individual',
    purchaser_entity_type: 'individual',
    natural_person_purchase_mode: 'individual',
    purchase_finance_type: 'bond',
    purchase_price: '2850000',
    cash_amount: '350000',
    bond_amount: '2500000',
    deposit_amount: '150000',
    reservation_required: true,
    reservation_amount: '25000',
    reservation_status: 'requested',
    purchasers: [
      {
        first_name: 'Mia',
        last_name: 'Khumalo',
        date_of_birth: '1992-05-14',
        identity_number: '9205145009087',
        nationality: 'South African',
        residency_status: 'sa_citizen',
        tax_number: '9876543210',
        email: 'mia.demo@arch9.co.za',
        phone: '+27 82 555 0142',
        street_address: '18 Demo Lane',
        suburb: 'Green Point',
        city: 'Cape Town',
        postal_code: '8051',
        marital_status: 'single',
        marital_regime: 'not_applicable',
        employment_type: 'permanent',
        employer_name: 'Demo Design Studio',
        job_title: 'Product Manager',
        employment_start_date: '2021-02-01',
        gross_monthly_income: '85000',
        net_monthly_income: '62000',
        income_frequency: 'monthly',
        number_of_dependants: '0',
        monthly_credit_commitments: '7000',
        monthly_living_expenses: '22000',
        first_time_buyer: 'yes',
        primary_residence: 'yes',
        investment_purchase: 'no',
        under_debt_review: 'no',
        under_administration: 'no',
        ever_declared_insolvent: 'no',
        surety_obligations: 'no',
      },
    ],
    finance: {
      purchase_price: '2850000',
      cash_amount: '350000',
      bond_amount: '2500000',
      proof_of_funds_available: 'yes',
      source_of_funds: 'Savings and investment account',
      cash_funds_confirmed: 'yes',
      cash_contribution_available: 'yes',
      deposit_source: 'Savings',
      bank_statements_available: 'yes',
      bond_readiness_consent: 'yes',
      affordability_confirmed: 'yes',
      bond_current_status: 'pre_approval_only',
      bond_process_started: 'yes',
      bond_bank_name: 'Nedbank',
      bond_help_requested: 'yes',
      ooba_assist_requested: 'yes',
      joint_bond_application: 'no',
    },
    funding_sources: [
      {
        sourceType: 'personal_account',
        amount: '350000',
        expectedPaymentDate: '2026-07-20',
        status: 'planned',
        notes: 'Deposit and transfer-cost contribution.',
      },
    ],
  }

  return {
    onboarding: {
      id: 'demo-buyer-onboarding-record',
      transactionId: 'demo-buyer-transaction',
      token,
      status: 'Not Started',
      purchaserType: 'individual',
      purchaserTypeLabel: 'Individual',
      submittedAt: null,
      isActive: true,
      createdAt: '2026-07-06T08:00:00.000Z',
      updatedAt: '2026-07-06T08:00:00.000Z',
    },
    transaction: {
      id: 'demo-buyer-transaction',
      organisation_id: DEMO_BRAND.organisationId,
      development_id: 'demo-development',
      unit_id: 'demo-unit-4',
      buyer_id: 'demo-buyer',
      transaction_reference: 'A9-BUY-2048',
      property_address_line_1: DEMO_PROPERTY_ADDRESS.line1,
      property_address_line_2: DEMO_PROPERTY_ADDRESS.line2,
      suburb: DEMO_PROPERTY_ADDRESS.suburb,
      city: DEMO_PROPERTY_ADDRESS.city,
      province: DEMO_PROPERTY_ADDRESS.province,
      property_description: 'Two-bedroom apartment close to the promenade.',
      purchase_price: 2850000,
      sales_price: 2850000,
      finance_type: 'bond',
      cash_amount: 350000,
      bond_amount: 2500000,
      deposit_amount: 150000,
      reservation_required: true,
      reservation_amount: 25000,
      reservation_status: 'requested',
      reservation_payment_details: 'Arch9 Demo Trust Account',
      purchaser_type: 'individual',
      stage: 'Offer Accepted',
      current_main_stage: 'OTP',
      assigned_agent: 'Sarah Williams',
      assigned_agent_email: 'sarah.demo@arch9.co.za',
      attorney: 'Jacobs Transfer Attorneys',
      bond_originator: 'BetterBond Demo Desk',
      next_action: 'Buyer to complete onboarding details.',
      created_at: '2026-07-06T08:00:00.000Z',
      updated_at: '2026-07-06T08:00:00.000Z',
    },
    unit: {
      id: 'demo-unit-4',
      development_id: 'demo-development',
      unit_number: '4',
      unit_label: 'Apartment 4',
      phase: 'Phase 1',
      status: 'Offer Accepted',
      development: {
        id: 'demo-development',
        name: 'Pine Avenue Apartments',
      },
    },
    buyer: {
      id: 'demo-buyer',
      name: 'Mia Khumalo',
      email: 'mia.demo@arch9.co.za',
      phone: '+27 82 555 0142',
    },
    organisation: {
      id: DEMO_BRAND.organisationId,
      name: DEMO_BRAND.organisationName,
      display_name: DEMO_BRAND.organisationName,
      logo_url: '',
    },
    branding: DEMO_BRAND,
    purchaserType: 'individual',
    purchaserTypeLabel: 'Individual',
    formConfig: null,
    stepDefinitions: [],
    formData,
    derivedConfiguration: {},
    requiredDocuments: [
      {
        key: 'buyer_id_document',
        label: 'Buyer ID Document',
        group: 'FICA',
        description: 'A clear copy of the purchaser identity document.',
        requirementLevel: 'required',
        complete: false,
      },
      {
        key: 'proof_of_income',
        label: 'Proof of Income',
        group: 'Finance',
        description: 'Latest payslip or income confirmation.',
        requirementLevel: 'required',
        complete: false,
      },
      {
        key: 'bank_statements',
        label: 'Bank Statements',
        group: 'Finance',
        description: 'Three months of bank statements.',
        requirementLevel: 'required',
        complete: true,
      },
    ],
    summary: {
      uploadedCount: 1,
      totalRequired: 3,
    },
    uploadedDocuments: [],
    fundingSources: formData.funding_sources,
    onboardingFlow: null,
    rolePlayerPolicy: {
      buyerAppointedBondOriginatorAllowed: true,
      buyerAppointedBondOriginatorRequiresApproval: false,
    },
    clientPortalLink: {
      id: 'demo-buyer-portal-link',
      token: 'demo-buyer-portal',
      is_active: true,
      transaction_id: 'demo-buyer-transaction',
    },
    clientPortalPath: '/client/demo-buyer-portal/buying/documents',
  }
}

export function getDemoSellerOnboardingListing(token = SELLER_ONBOARDING_DEMO_TOKEN, formDataOverride = null) {
  const formData = formDataOverride || {
    sellerFirstName: 'Thabo',
    sellerSurname: 'Mokoena',
    idNumber: '8503035809086',
    email: 'thabo.demo@arch9.co.za',
    phone: '+27 83 555 0198',
    residentialAddress: '14 Ocean View Road, Sea Point, Cape Town',
    ownershipType: 'individual',
    sellerLegalType: 'individual',
    sellerTaxNumber: '1234567890',
    mandateType: 'sole',
    askingPrice: '2850000',
    sellingTimeline: '1_3_months',
    sellingReason: 'Relocating',
    propertyCategory: 'residential',
    propertyType: 'apartment',
    propertyStructureType: 'sectional_title',
    propertyAddressDetails: DEMO_PROPERTY_ADDRESS,
    propertyAddress: DEMO_PROPERTY_ADDRESS.formatted,
    propertyAddressLine1: DEMO_PROPERTY_ADDRESS.line1,
    propertyAddressLine2: DEMO_PROPERTY_ADDRESS.line2,
    suburb: DEMO_PROPERTY_ADDRESS.suburb,
    city: DEMO_PROPERTY_ADDRESS.city,
    province: DEMO_PROPERTY_ADDRESS.province,
    postalCode: DEMO_PROPERTY_ADDRESS.postalCode,
    municipality: DEMO_PROPERTY_ADDRESS.municipality,
    country: DEMO_PROPERTY_ADDRESS.country,
    sectionalTitle: true,
    bodyCorporate: true,
    schemeName: 'Pine Avenue Sectional Scheme',
    sectionNumber: '4',
    unitNumber: '4',
    schemeBodyCorporateName: 'Pine Avenue Body Corporate',
    schemeManagingAgentName: 'Cape Sectional Admin',
    schemeManagingAgentEmail: 'admin.demo@arch9.co.za',
    schemeManagingAgentPhone: '+27 21 555 0111',
    schemeLevies: '2150',
    schemeRulesAvailable: true,
    bedrooms: '2',
    bathrooms: '2',
    garages: '1',
    parkingCovered: '1',
    erfSize: '0',
    floorSize: '91',
    ratesTaxes: '1650',
    levies: '2150',
    occupancyStatus: 'owner_occupied',
    existingBond: true,
    bondBank: 'Standard Bank',
    bondAccountReference: 'STD-DEMO-2048',
    estimatedSettlementAmount: '1220000',
    cancellationRequired: true,
    cancellationAttorneyKnown: true,
    cancellationAttorneyDetails: 'Jacobs Cancellation Desk',
    features: ['security', 'fibre', 'solar'],
    propertyCondition: 'good',
    kitchenCondition: 'good',
    bathroomCondition: 'good',
    propertyNotes: 'North-facing apartment with backup inverter and secure parking.',
  }

  return {
    __demoOnboarding: true,
    id: 'demo-seller-listing',
    listingId: 'demo-seller-listing',
    listingTitle: '2 Pine Avenue, Unit 4',
    title: '2 Pine Avenue, Unit 4',
    organisationId: DEMO_BRAND.organisationId,
    organisationName: DEMO_BRAND.organisationName,
    agencyName: DEMO_BRAND.organisationName,
    assignedAgentName: 'Sarah Williams',
    assignedAgentEmail: 'sarah.demo@arch9.co.za',
    sellerName: 'Thabo Mokoena',
    sellerEmail: 'thabo.demo@arch9.co.za',
    sellerPhone: '+27 83 555 0198',
    askingPrice: 2850000,
    mandateType: 'sole',
    propertyCategory: 'residential',
    propertyType: 'apartment',
    propertyStructureType: 'sectional_title',
    addressLine1: DEMO_PROPERTY_ADDRESS.line1,
    addressLine2: DEMO_PROPERTY_ADDRESS.line2,
    suburb: DEMO_PROPERTY_ADDRESS.suburb,
    city: DEMO_PROPERTY_ADDRESS.city,
    province: DEMO_PROPERTY_ADDRESS.province,
    postalCode: DEMO_PROPERTY_ADDRESS.postalCode,
    municipality: DEMO_PROPERTY_ADDRESS.municipality,
    country: DEMO_PROPERTY_ADDRESS.country,
    seller: {
      id: 'demo-seller',
      name: 'Thabo Mokoena',
      email: 'thabo.demo@arch9.co.za',
      phone: '+27 83 555 0198',
    },
    branding: DEMO_BRAND,
    sellerOnboarding: {
      token,
      status: 'in_progress',
      currentStep: 0,
      startedAt: '2026-07-06T08:00:00.000Z',
      updatedAt: '2026-07-06T08:00:00.000Z',
      formData,
    },
    documentRequirements: [
      {
        key: 'seller_identity_document',
        label: 'Seller ID Document',
        group: 'Seller identity',
        status: 'required',
      },
      {
        key: 'proof_of_address',
        label: 'Proof of Address',
        group: 'Seller identity',
        status: 'required',
      },
      {
        key: 'rates_account',
        label: 'Municipal Rates Account',
        group: 'Property compliance',
        status: 'required',
      },
      {
        key: 'sectional_title_levy_statement',
        label: 'Levy Statement',
        group: 'Sectional title',
        status: 'required',
      },
      {
        key: 'bond_cancellation_instruction',
        label: 'Bond Cancellation Instruction',
        group: 'Bond & finance',
        status: 'required',
      },
    ],
    updatedAt: '2026-07-06T08:00:00.000Z',
  }
}
