// Canonical buyer-side requirement engine entry-point.
// This keeps UI modules decoupled from implementation details and avoids scattered rule logic.
export {
  buildBuyerRequirementProfile,
  canProgressTransactionStage,
  getBuyerFicaReadiness,
  getBuyerFinanceReadiness,
  getBuyerRequirementProfile,
  getMissingBuyerDocuments,
  getMissingBuyerRequirements,
  getRequiredBuyerDocuments,
  getRequiredOnboardingSections,
  getRequiredTransactionActions,
  getRoleFilteredRequirements,
  getTransferReadinessFromBuyerDocs,
  isRequirementSatisfied,
} from './buyerRequirementEngine'
