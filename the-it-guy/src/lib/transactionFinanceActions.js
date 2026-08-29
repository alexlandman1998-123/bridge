let financeServicePromise = null

function loadFinanceService() {
  financeServicePromise ||= import('../services/transactionFinanceService')
  return financeServicePromise
}

export async function markBondInstructionSent(...args) {
  const service = await loadFinanceService()
  return service.markBondInstructionSent(...args)
}

export async function markBondGrantMilestone(...args) {
  const service = await loadFinanceService()
  return service.markBondGrantMilestone(...args)
}
