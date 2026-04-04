import { normalizeStageLabel } from '../../lib/stages'
import { normalizeFinanceType as normalizeCanonicalFinanceType } from './financeType'

function normalizeFinanceType(value) {
  return normalizeCanonicalFinanceType(value, { allowUnknown: true })
}

function cleanText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text || ''
}

export function getReportNextAction(row) {
  const workflowNextStep = cleanText(row?.report?.nextStep)
  if (workflowNextStep) {
    return workflowNextStep
  }

  const mainStage = String(row?.report?.currentMainStage || row?.transaction?.current_main_stage || '').toUpperCase()
  const detailedStage = normalizeStageLabel(row?.stage)
  const financeType = normalizeFinanceType(row?.transaction?.finance_type)
  const hasBuyer = Boolean(cleanText(row?.buyer?.name))

  if (detailedStage === 'Bond Approved / Proof of Funds') {
    return 'Instruct conveyancers and prepare transfer file'
  }

  if (mainStage === 'AVAIL') {
    return hasBuyer ? 'Send onboarding information sheet' : 'Assign buyer and issue reservation'
  }

  if (mainStage === 'DEP') {
    return 'Confirm deposit and prepare OTP'
  }

  if (mainStage === 'OTP') {
    if (financeType === 'cash') {
      return 'Collect proof of funds and move to conveyancing'
    }
    if (financeType === 'bond' || financeType === 'combination') {
      return 'Collect finance documents and submit bond application'
    }
    return 'Complete onboarding and prepare funding checks'
  }

  if (mainStage === 'FIN') {
    if (financeType === 'cash') {
      return 'Verify proof of funds and clear deal for conveyancing'
    }
    return 'Progress bond approval with bank or originator'
  }

  if (mainStage === 'ATTY') {
    return 'Prepare transfer documents and guarantees'
  }

  if (mainStage === 'XFER') {
    return 'Lodge transfer and track registration'
  }

  if (mainStage === 'REG') {
    return 'Move unit into handover and close-out'
  }

  const subStageSummary = cleanText(row?.transaction?.current_sub_stage_summary)
  if (subStageSummary) {
    return subStageSummary
  }

  const explicitNextAction = cleanText(row?.transaction?.next_action)
  if (explicitNextAction) {
    return explicitNextAction
  }

  return 'Review transaction and confirm next operational step'
}
