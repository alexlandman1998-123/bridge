import {
  SIGNING_CLASSIFICATION_REGISTER,
  assertElectronicSigningApproved,
} from './signingClassificationPolicy.js'

export const SIGNING_WORKFLOW_INVENTORY_VERSION = 'arch9-signing-workflow-inventory-v1'

export const SIGNING_WORKFLOW_CHANGE_TYPES = Object.freeze({
  ELECTRONIC_DISPATCH: 'electronic_dispatch',
  ELECTRONIC_COMPLETION: 'electronic_completion',
  ACKNOWLEDGEMENT_CAPTURE: 'acknowledgement_capture',
  PHYSICAL_SIGNATURE_WORKFLOW: 'physical_signature_workflow',
})

const inventoryItem = (workflowKey, status, sourceReferences) => Object.freeze({
  workflowKey,
  status,
  sourceReferences: Object.freeze(sourceReferences),
})

// This is the Phase 1 inventory of executable surfaces, not a statement that
// any surface is legally approved. New surfaces must be added here and to the
// classification register before implementation.
export const SIGNING_WORKFLOW_INVENTORY = Object.freeze([
  inventoryItem('seller_mandate', 'retired_and_wet_ink_only', [
    'the-it-guy/src/pages/AgentListingDetail.jsx',
    'the-it-guy/src/pages/agency/AgencyPipelinePage.jsx',
    'the-it-guy/src/core/documents/onlineSigningPolicy.js',
    'the-it-guy/src/pages/OnlineSigningUnavailablePage.jsx',
  ]),
  inventoryItem('offer_to_purchase', 'frozen_pending_legal_review', [
    'the-it-guy/src/components/documents/LegalDocumentWorkspace.jsx',
    'the-it-guy/src/components/documents/DocumentPacketWorkflowPanel.jsx',
    'the-it-guy/src/lib/documentPacketsApi.js',
    'the-it-guy/src/pages/SignerPortal.jsx',
  ]),
  inventoryItem('legal_document_packet', 'frozen_pending_legal_review', [
    'the-it-guy/src/components/documents/LegalDocumentWorkspace.jsx',
    'the-it-guy/src/pages/settings/SettingsSigningTemplatesPage.jsx',
    'supabase/functions/resolve-final-signed-document-access/index.ts',
  ]),
  inventoryItem('rental_lease', 'frozen_pending_legal_review', [
    'the-it-guy/src/modules/rentals/shared/tenancies/RentalLeaseSigningPanel.jsx',
    'the-it-guy/src/services/rentals/rentalLeaseSigningRepository.js',
  ]),
  inventoryItem('buyer_onboarding', 'acknowledgement_only', [
    'the-it-guy/src/lib/buyerOnboardingFlow.js',
    'the-it-guy/src/pages/mobile/MobileOnboardingPage.jsx',
  ]),
  inventoryItem('seller_onboarding', 'acknowledgement_only', [
    'the-it-guy/src/pages/SellerOnboarding.jsx',
    'the-it-guy/src/core/documents/sellerOnboardingSigningLifecycle.js',
  ]),
  inventoryItem('seller_fica_and_disclosure', 'frozen_pending_legal_review', [
    'the-it-guy/src/core/documents/sellerOnboardingFormalPackDispatch.js',
    'the-it-guy/src/core/documents/sellerOnboardingSigningPackSnapshot.js',
  ]),
])

export function getSigningWorkflowInventoryItem(workflowKey = '') {
  const key = String(workflowKey || '').trim()
  return SIGNING_WORKFLOW_INVENTORY.find((item) => item.workflowKey === key) || null
}

export function assertSigningWorkflowChangeAllowed(workflowKey = '', changeType = '') {
  const normalizedChangeType = String(changeType || '').trim()
  const inventoryItem = getSigningWorkflowInventoryItem(workflowKey)
  if (!inventoryItem || !SIGNING_CLASSIFICATION_REGISTER[inventoryItem.workflowKey]) {
    const error = new Error('A signing workflow must be inventoried and legally classified before it can be changed.')
    error.code = 'signing_workflow_not_inventoried'
    throw error
  }

  if ([
    SIGNING_WORKFLOW_CHANGE_TYPES.ELECTRONIC_DISPATCH,
    SIGNING_WORKFLOW_CHANGE_TYPES.ELECTRONIC_COMPLETION,
  ].includes(normalizedChangeType)) {
    assertElectronicSigningApproved(inventoryItem.workflowKey)
  }
}
