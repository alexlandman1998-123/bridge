import { normalizeStageLabel } from './stages'

function parseDate(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date
}

function diffDays(from, to = new Date()) {
  const ms = to.getTime() - from.getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function thresholdForStage(stage) {
  const normalized = normalizeStageLabel(stage)
  if (['Finance Pending', 'Bond Approved / Proof of Funds'].includes(normalized)) {
    return { warn: 3, risk: 7 }
  }
  if (['Proceed to Attorneys', 'Transfer in Progress', 'Transfer Lodged'].includes(normalized)) {
    return { warn: 4, risk: 10 }
  }
  if (['Reserved', 'OTP Signed', 'Deposit Paid'].includes(normalized)) {
    return { warn: 2, risk: 5 }
  }
  return { warn: 5, risk: 12 }
}

export function getStageAgingMeta(stage, stageUpdatedAt) {
  const parsed = parseDate(stageUpdatedAt)
  if (!parsed) {
    return { days: null, tone: 'neutral', label: 'No stage date' }
  }

  const days = diffDays(parsed)
  const thresholds = thresholdForStage(stage)

  const label = days === 0 ? 'Updated today' : days === 1 ? '1 day in stage' : `${days} days in stage`

  if (days >= thresholds.risk) {
    return { days, tone: 'risk', label }
  }

  if (days >= thresholds.warn) {
    return { days, tone: 'watch', label }
  }

  return { days, tone: 'ok', label }
}
