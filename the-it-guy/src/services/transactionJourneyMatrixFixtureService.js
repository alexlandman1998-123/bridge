import { buildTransactionSyncReadModel } from './transactionSyncReadModelService.js'

export const TRANSACTION_JOURNEY_MATRIX_PHASE3_FIXTURE = Object.freeze({
  transactionId: 'nonprod-journey-matrix-transaction',
  environment: 'non-production',
  rolePlayers: Object.freeze({
    buyer: Object.freeze({ id: 'matrix-buyer', label: 'Buyer' }),
    seller: Object.freeze({ id: 'matrix-seller', label: 'Seller' }),
    agent: Object.freeze({ id: 'matrix-agent', label: 'Agency' }),
    developer: Object.freeze({ id: 'matrix-developer', label: 'Developer' }),
    bond_originator: Object.freeze({ id: 'matrix-originator', label: 'Bond originator' }),
    transfer_attorney: Object.freeze({ id: 'matrix-transfer-attorney', label: 'Transfer attorney' }),
  }),
})

const JOURNEY_ROLES = Object.freeze(Object.keys(TRANSACTION_JOURNEY_MATRIX_PHASE3_FIXTURE.rolePlayers))

function matrixActivity({ id, eventType, laneKey, visibility, audience, title, description, occurredAt }) {
  return Object.freeze({
    id,
    canonical_event_type: eventType,
    lane_key: laneKey,
    visibility,
    audience_json: Object.freeze(audience),
    title,
    description,
    payload_json: visibility === 'client_visible' ? Object.freeze({}) : Object.freeze({ source: 'phase3_journey_matrix' }),
    occurred_at: occurredAt,
  })
}

export function buildTransactionJourneyMatrixActivity() {
  return Object.freeze([
    matrixActivity({
      id: 'buyer-document-client',
      eventType: 'BUYER_DOCUMENT_UPLOADED',
      laneKey: 'buyer_documents',
      visibility: 'client_visible',
      audience: ['buyer', 'agent', 'developer', 'transfer_attorney'],
      title: 'Your document was received',
      description: 'Your document has been received and is awaiting review.',
      occurredAt: '2026-09-01T10:00:00Z',
    }),
    matrixActivity({
      id: 'buyer-document-professional',
      eventType: 'BUYER_DOCUMENT_UPLOADED',
      laneKey: 'buyer_documents',
      visibility: 'professional_shared',
      audience: ['agent', 'developer', 'bond_originator', 'transfer_attorney'],
      title: 'Buyer document received',
      description: 'A buyer document is ready for finance and transfer review.',
      occurredAt: '2026-09-01T10:00:01Z',
    }),
    matrixActivity({
      id: 'seller-document-client',
      eventType: 'SELLER_DOCUMENT_UPLOADED',
      laneKey: 'seller_documents',
      visibility: 'client_visible',
      audience: ['seller', 'agent', 'developer', 'transfer_attorney'],
      title: 'Your document was received',
      description: 'Your document has been received and is awaiting review.',
      occurredAt: '2026-09-01T10:01:00Z',
    }),
    matrixActivity({
      id: 'seller-document-professional',
      eventType: 'SELLER_DOCUMENT_UPLOADED',
      laneKey: 'seller_documents',
      visibility: 'professional_shared',
      audience: ['agent', 'developer', 'transfer_attorney'],
      title: 'Seller document received',
      description: 'A seller document is ready for listing and transfer review.',
      occurredAt: '2026-09-01T10:01:01Z',
    }),
    matrixActivity({
      id: 'agent-stage-client',
      eventType: 'AGENT_CLIENT_UPDATE_PUBLISHED',
      laneKey: 'transaction',
      visibility: 'client_visible',
      audience: ['buyer', 'seller', 'agent', 'developer', 'transfer_attorney'],
      title: 'Your purchase is moving forward',
      description: 'Your transaction journey has moved to the next step.',
      occurredAt: '2026-09-01T10:02:00Z',
    }),
    matrixActivity({
      id: 'transfer-stage-client',
      eventType: 'TRANSFER_ATTORNEY_STAGE_UPDATED',
      laneKey: 'transfer',
      visibility: 'client_visible',
      audience: ['buyer', 'seller', 'agent', 'developer', 'transfer_attorney'],
      title: 'Transfer progress updated',
      description: 'Your transfer journey has moved forward.',
      occurredAt: '2026-09-01T10:03:00Z',
    }),
    matrixActivity({
      id: 'transfer-stage-professional',
      eventType: 'TRANSFER_ATTORNEY_STAGE_UPDATED',
      laneKey: 'transfer',
      visibility: 'professional_shared',
      audience: ['agent', 'developer', 'bond_originator', 'transfer_attorney'],
      title: 'Transfer stage progressed',
      description: 'Transfer workflow has progressed and dependent teams can continue.',
      occurredAt: '2026-09-01T10:03:01Z',
    }),
    matrixActivity({
      id: 'bond-stage-client',
      eventType: 'ORIGINATOR_PROGRESS_RECORDED',
      laneKey: 'finance',
      visibility: 'client_visible',
      audience: ['buyer', 'agent', 'developer', 'bond_originator'],
      title: 'Finance progress updated',
      description: 'Your finance journey has moved forward.',
      occurredAt: '2026-09-01T10:04:00Z',
    }),
    matrixActivity({
      id: 'bond-stage-professional',
      eventType: 'ORIGINATOR_PROGRESS_RECORDED',
      laneKey: 'finance',
      visibility: 'professional_shared',
      audience: ['agent', 'developer', 'bond_originator', 'transfer_attorney'],
      title: 'Bond progress recorded',
      description: 'Finance workflow has progressed for the transaction team.',
      occurredAt: '2026-09-01T10:04:01Z',
    }),
  ])
}

export const TRANSACTION_JOURNEY_MATRIX_EXPECTATIONS = Object.freeze({
  buyer: Object.freeze(['buyer-document-client', 'agent-stage-client', 'transfer-stage-client', 'bond-stage-client']),
  seller: Object.freeze(['seller-document-client', 'agent-stage-client', 'transfer-stage-client']),
  agent: Object.freeze(['buyer-document-client', 'buyer-document-professional', 'seller-document-client', 'seller-document-professional', 'agent-stage-client', 'transfer-stage-client', 'transfer-stage-professional', 'bond-stage-client', 'bond-stage-professional']),
  developer: Object.freeze(['buyer-document-client', 'buyer-document-professional', 'seller-document-client', 'seller-document-professional', 'agent-stage-client', 'transfer-stage-client', 'transfer-stage-professional', 'bond-stage-client', 'bond-stage-professional']),
  bond_originator: Object.freeze(['buyer-document-professional', 'transfer-stage-professional', 'bond-stage-client', 'bond-stage-professional']),
  transfer_attorney: Object.freeze(['buyer-document-client', 'buyer-document-professional', 'seller-document-client', 'seller-document-professional', 'agent-stage-client', 'transfer-stage-client', 'transfer-stage-professional', 'bond-stage-professional']),
})

export function buildTransactionJourneyMatrixFixture() {
  const activityRows = buildTransactionJourneyMatrixActivity()
  const workflowReadModel = Object.freeze({
    mainStage: Object.freeze({ key: 'XFER', label: 'Transfer' }),
    detailedStage: Object.freeze({ key: 'instruction_sent', label: 'Instruction sent' }),
    lanes: Object.freeze([
      Object.freeze({ key: 'finance', label: 'Finance', status: 'in_progress', currentStep: 'bond_review' }),
      Object.freeze({ key: 'transfer', label: 'Transfer', status: 'in_progress', currentStep: 'instruction_sent' }),
    ]),
    sharedProgress: Object.freeze([{ id: 'matrix-shared-progress', processKey: 'transfer', stepKey: 'instruction_sent' }]),
  })
  const refreshSignal = Object.freeze({ version: 9, changed_at: '2026-09-01T10:04:01Z' })
  const roleModels = Object.freeze(Object.fromEntries(JOURNEY_ROLES.map((viewerRole) => [
    viewerRole,
    buildTransactionSyncReadModel({
      transactionId: TRANSACTION_JOURNEY_MATRIX_PHASE3_FIXTURE.transactionId,
      viewerRole,
      workflowReadModel,
      activityRows,
      refreshSignal,
    }),
  ])))

  return Object.freeze({
    ...TRANSACTION_JOURNEY_MATRIX_PHASE3_FIXTURE,
    activityRows,
    workflowReadModel,
    refreshSignal,
    roleModels,
  })
}
