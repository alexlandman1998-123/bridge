import { buildDeveloperTransactionRelationshipSummary } from './developerTransactionRelationshipProfile.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function findRow(rows = [], id = '') {
  return (Array.isArray(rows) ? rows : []).find((row) => normalizeKey(row?.id) === normalizeKey(id)) || null
}

function isActiveRow(row = null) {
  const status = normalizeKey(row?.status)
  const name = normalizeKey(row?.name)
  return Boolean(
    name &&
      !['not_assigned', 'developer_pending', 'buyer_pending'].includes(name) &&
      !['missing', 'pending_assignment', 'not_assigned', 'optional'].includes(status),
  )
}

function signerFromRow(row = {}, fallbackLabel = '') {
  return {
    role: normalizeKey(row.id || fallbackLabel),
    label: row.label || fallbackLabel,
    signerName: normalizeText(row.name),
    signerEmail: normalizeText(row.email).toLowerCase(),
    required: true,
    configured: isActiveRow(row),
  }
}

function normalizeSellerDetails(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const signatory =
    (Array.isArray(source.signatories) ? source.signatories[0] : null) ||
    source.defaultSignatory ||
    source.default_signatory ||
    source.signatory ||
    {}

  return {
    entityType: source.entityType || source.entity_type || 'company',
    legalName: source.legalName || source.legal_name || source.name || '',
    tradingName: source.tradingName || source.trading_name || '',
    registrationNumber: source.registrationNumber || source.registration_number || '',
    vatNumber: source.vatNumber || source.vat_number || '',
    registeredAddress: source.registeredAddress || source.registered_address || source.address || '',
    postalAddress: source.postalAddress || source.postal_address || '',
    email: source.email || '',
    phone: source.phone || source.mobile || '',
    signatory: {
      fullName: signatory.fullName || signatory.full_name || signatory.name || '',
      role: signatory.role || signatory.title || '',
      idNumber: signatory.idNumber || signatory.id_number || signatory.identityNumber || '',
      email: signatory.email || '',
      phone: signatory.phone || signatory.mobile || '',
      signingCapacity: signatory.signingCapacity || signatory.signing_capacity || signatory.capacity || '',
    },
  }
}

export function buildDeveloperTransactionMandateProfile({
  transaction = {},
  unit = {},
  buyer = {},
  rolePlayers = [],
  transactionParticipants = [],
  relationshipSummary = null,
} = {}) {
  const summary =
    relationshipSummary ||
    buildDeveloperTransactionRelationshipSummary({
      transaction,
      unit,
      buyer,
      rolePlayers,
      transactionParticipants,
    })

  if (!summary?.relationshipProfile?.isDeveloperSale) {
    return {
      transactionType: 'private_property',
      privateSellerMandateRequired: true,
      developerAgentMandateRequired: false,
      mandateType: 'seller_agent_mandate',
      mandateLabel: 'Seller-agent mandate',
      mandateCopy: 'Private resale transactions continue to use the seller mandate flow.',
      requiredSigners: [],
      missingSignerRoles: [],
      documentWorkspaceContext: {
        relationshipMode: 'seller_buyer',
        mandateType: 'seller_agent_mandate',
        blockPrivateSellerMandate: false,
      },
    }
  }

  const developerRow = findRow(summary.rows, 'developer_contact')
  const agentRow = findRow(summary.rows, 'agent')
  const developerAgentMandateRequired = Boolean(summary.developerAgentMandateRequired)
  const requiredSigners = developerAgentMandateRequired
    ? [
        signerFromRow(developerRow, 'Developer'),
        signerFromRow(agentRow, 'Selling Agent'),
      ]
    : []
  const missingSignerRoles = requiredSigners.filter((signer) => !signer.configured)

  return {
    transactionType: 'developer_sale',
    privateSellerMandateRequired: false,
    developerAgentMandateRequired,
    mandateType: developerAgentMandateRequired ? 'developer_agent_mandate' : 'developer_direct_sale_record',
    mandateLabel: developerAgentMandateRequired ? 'Developer-agent mandate' : 'No selling-agent mandate',
    mandateCopy: developerAgentMandateRequired
      ? 'Use a developer-agent mandate for this sale. The developer is the seller-side principal and the selling agent is the counterparty.'
      : 'This is a developer direct sale. Do not route it into the private seller mandate flow unless an external selling agent is assigned.',
    requiredSigners,
    missingSignerRoles,
    readyForMandate: developerAgentMandateRequired ? missingSignerRoles.length === 0 : true,
    documentWorkspaceContext: {
      relationshipMode: 'developer_buyer',
      mandateType: developerAgentMandateRequired ? 'developer_agent_mandate' : 'developer_direct_sale_record',
      sellerPartyRole: 'developer_contact',
      sellerLabel: 'Developer',
      agentLabel: 'Selling Agent',
      buyerLabel: 'Buyer / Purchaser',
      blockPrivateSellerMandate: true,
      privateSellerMandateRequired: false,
      developerAgentMandateRequired,
      requiredSigners,
    },
  }
}

export function buildDeveloperAgentMandatePacketContext({
  mandateProfile = {},
  transaction = {},
  unit = {},
  buyer = {},
  sellerDetails = {},
} = {}) {
  const developerSigner = (mandateProfile.requiredSigners || []).find((signer) => signer.role === 'developer_contact') || null
  const agentSigner = (mandateProfile.requiredSigners || []).find((signer) => signer.role === 'agent') || null
  const sellerSnapshot = normalizeSellerDetails(
    sellerDetails ||
      unit?.development?.sellerDetails ||
      unit?.development?.seller_details ||
      unit?.development?.profile?.sellerDetails ||
      {},
  )
  const sellerSignatory = sellerSnapshot.signatory || {}
  const developmentName = normalizeText(unit?.development?.name || transaction.developer_name || transaction.developer || developerSigner?.signerName)
  const sellerLegalName = normalizeText(sellerSnapshot.legalName || developmentName || developerSigner?.signerName)
  const sellerEmail = normalizeText(sellerSnapshot.email || sellerSignatory.email || developerSigner?.signerEmail).toLowerCase()
  const sellerRepresentativeName = normalizeText(sellerSignatory.fullName || developerSigner?.signerName)
  const sellerRepresentativeCapacity = normalizeText(sellerSignatory.signingCapacity || sellerSignatory.role)
  const unitLabel = normalizeText(unit?.unit_number ? `Unit ${unit.unit_number}` : unit?.name || '')
  const buyerName = normalizeText(buyer?.name || transaction.buyer_name)

  return {
    transactionId: normalizeText(transaction.id || transaction.transaction_id),
    unitId: normalizeText(unit.id || transaction.unit_id),
    developmentId: normalizeText(unit.development_id || unit?.development?.id || transaction.development_id),
    relationshipMode: 'developer_buyer',
    contextType: 'developer_agent_mandate',
    mandateType: mandateProfile.mandateType || 'developer_agent_mandate',
    mandateLabel: mandateProfile.mandateLabel || 'Developer-agent mandate',
    blockPrivateSellerMandate: true,
    privateSellerMandateRequired: false,
    developerAgentMandateRequired: Boolean(mandateProfile.developerAgentMandateRequired),
    generatedDataSnapshot: {
      sourceContext: {
        transactionId: normalizeText(transaction.id || transaction.transaction_id),
        unitId: normalizeText(unit.id || transaction.unit_id),
        developmentId: normalizeText(unit.development_id || unit?.development?.id || transaction.development_id),
        relationshipMode: 'developer_buyer',
        mandateType: mandateProfile.mandateType || 'developer_agent_mandate',
      },
      lead: {
        sellerFullName: sellerLegalName,
        sellerEmail,
        assignedAgentName: agentSigner?.signerName || normalizeText(transaction.assigned_agent),
        assignedAgentEmail: agentSigner?.signerEmail || normalizeText(transaction.assigned_agent_email),
      },
      agent: {
        fullName: agentSigner?.signerName || normalizeText(transaction.assigned_agent),
        name: agentSigner?.signerName || normalizeText(transaction.assigned_agent),
        email: agentSigner?.signerEmail || normalizeText(transaction.assigned_agent_email),
      },
      transaction: {
        id: normalizeText(transaction.id || transaction.transaction_id),
        reference: normalizeText(transaction.transaction_reference || transaction.matter_number),
        buyerName,
        developmentName,
        unitLabel,
        purchasePrice: transaction.purchase_price || transaction.sales_price || unit.price || null,
      },
      placeholders: {
        seller_full_name: sellerLegalName,
        seller_id_number: sellerSnapshot.registrationNumber || '',
        seller_email: sellerEmail,
        seller_phone: sellerSnapshot.phone || sellerSignatory.phone || '',
        seller_entity_type: sellerSnapshot.entityType || 'company',
        'seller.entity_type_raw': sellerSnapshot.entityType || 'company',
        seller_representative_name: sellerRepresentativeName,
        representative_name: sellerRepresentativeName,
        seller_representative_email: sellerSignatory.email || '',
        representative_email: sellerSignatory.email || '',
        seller_representative_phone: sellerSignatory.phone || '',
        representative_phone: sellerSignatory.phone || '',
        seller_representative_capacity: sellerRepresentativeCapacity,
        representative_capacity: sellerRepresentativeCapacity,
        representative_id_number: sellerSignatory.idNumber || '',
        seller_company_registration_number: sellerSnapshot.entityType === 'trust' ? '' : sellerSnapshot.registrationNumber || '',
        seller_trust_registration_number: sellerSnapshot.entityType === 'trust' ? sellerSnapshot.registrationNumber || '' : '',
        seller_vat_number: sellerSnapshot.vatNumber || '',
        seller_registered_address: sellerSnapshot.registeredAddress || '',
        seller_postal_address: sellerSnapshot.postalAddress || '',
        seller_domicilium_address: sellerSnapshot.registeredAddress || sellerSnapshot.postalAddress || '',
        agent_full_name: agentSigner?.signerName || normalizeText(transaction.assigned_agent),
        agent_email: agentSigner?.signerEmail || normalizeText(transaction.assigned_agent_email),
        property_address: [developmentName, unitLabel].filter(Boolean).join(' - '),
        developer_name: sellerLegalName,
        developer_company_registration: sellerSnapshot.registrationNumber || '',
        developer_representative: sellerRepresentativeName,
      },
      sellerDetails: sellerSnapshot,
      developerMandateProfile: mandateProfile.documentWorkspaceContext || {},
    },
    lead: {
      sellerFullName: sellerLegalName,
      sellerEmail,
      assignedAgentName: agentSigner?.signerName || normalizeText(transaction.assigned_agent),
      assignedAgentEmail: agentSigner?.signerEmail || normalizeText(transaction.assigned_agent_email),
    },
    agent: {
      fullName: agentSigner?.signerName || normalizeText(transaction.assigned_agent),
      name: agentSigner?.signerName || normalizeText(transaction.assigned_agent),
      email: agentSigner?.signerEmail || normalizeText(transaction.assigned_agent_email),
    },
    sellerDetails: sellerSnapshot,
    sellerEmail,
    requiredSigners: mandateProfile.requiredSigners || [],
  }
}
