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
} = {}) {
  const developerSigner = (mandateProfile.requiredSigners || []).find((signer) => signer.role === 'developer_contact') || null
  const agentSigner = (mandateProfile.requiredSigners || []).find((signer) => signer.role === 'agent') || null
  const developmentName = normalizeText(unit?.development?.name || transaction.developer_name || transaction.developer || developerSigner?.signerName)
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
        sellerFullName: developerSigner?.signerName || developmentName,
        sellerEmail: developerSigner?.signerEmail || '',
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
        seller_full_name: developerSigner?.signerName || developmentName,
        seller_email: developerSigner?.signerEmail || '',
        agent_full_name: agentSigner?.signerName || normalizeText(transaction.assigned_agent),
        agent_email: agentSigner?.signerEmail || normalizeText(transaction.assigned_agent_email),
        property_address: [developmentName, unitLabel].filter(Boolean).join(' - '),
      },
      developerMandateProfile: mandateProfile.documentWorkspaceContext || {},
    },
    lead: {
      sellerFullName: developerSigner?.signerName || developmentName,
      sellerEmail: developerSigner?.signerEmail || '',
      assignedAgentName: agentSigner?.signerName || normalizeText(transaction.assigned_agent),
      assignedAgentEmail: agentSigner?.signerEmail || normalizeText(transaction.assigned_agent_email),
    },
    agent: {
      fullName: agentSigner?.signerName || normalizeText(transaction.assigned_agent),
      name: agentSigner?.signerName || normalizeText(transaction.assigned_agent),
      email: agentSigner?.signerEmail || normalizeText(transaction.assigned_agent_email),
    },
    sellerEmail: developerSigner?.signerEmail || '',
    requiredSigners: mandateProfile.requiredSigners || [],
  }
}
