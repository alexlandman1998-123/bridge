let servicePromise = null
const call = async (method, ...args) => {
  servicePromise ||= import('../services/transactionFinanceService')
  const service = await servicePromise
  return service[method](...args)
}
const METHODS = ['acceptBondOffer', 'captureBondOffer', 'declineBondOffer', 'markBondGrantMilestone', 'markBondInstructionSent', 'reviewFinanceDocuments', 'submitBankApplication', 'updateBankApplication', 'updateFinanceBlockerStatus', 'uploadFinanceDocument', 'verifyFinanceProofOfFunds']
const operations = Object.fromEntries(METHODS.map((method) => [method, (...args) => call(method, ...args)]))
export const { acceptBondOffer, captureBondOffer, declineBondOffer, markBondGrantMilestone, markBondInstructionSent, reviewFinanceDocuments, submitBankApplication, updateBankApplication, updateFinanceBlockerStatus, uploadFinanceDocument, verifyFinanceProofOfFunds } = operations
