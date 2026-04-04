export const STAGES = [
  'Available',
  'Reserved',
  'OTP Signed',
  'Deposit Paid',
  'Finance Pending',
  'Bond Approved / Proof of Funds',
  'Proceed to Attorneys',
  'Transfer in Progress',
  'Transfer Lodged',
  'Registered',
]

export const MAIN_PROCESS_STAGES = ['AVAIL', 'DEP', 'OTP', 'FIN', 'ATTY', 'XFER', 'REG']

export const MAIN_STAGE_LABELS = {
  AVAIL: 'Available',
  DEP: 'Deposit',
  OTP: 'OTP',
  FIN: 'Finance',
  ATTY: 'Transfer Preparation',
  XFER: 'Transfer',
  REG: 'Registered',
}

export const CLIENT_STAGE_EXPLAINERS = {
  AVAIL: {
    stageKey: 'AVAIL',
    clientLabel: 'Unit Available',
    shortExplainer:
      'This unit is currently available and has not yet moved into an active sale process.',
    nextStepText:
      'The next step is usually the reservation/security deposit and Offer to Purchase process.',
    actionText: null,
    learnMore:
      'Your sales team will guide you when the unit moves into reservation so each step stays clear and structured.',
  },
  DEP: {
    stageKey: 'DEP',
    clientLabel: 'Deposit Secured',
    shortExplainer: 'Your reservation/security deposit has been received to hold the unit.',
    nextStepText: 'The next step is for the Offer to Purchase to be signed and processed.',
    actionText:
      'If requested, share any outstanding reservation paperwork so the transaction file can move smoothly.',
    learnMore:
      'This stage secures the unit while your transaction pack is finalized and prepared for legal/finance handover.',
  },
  OTP: {
    stageKey: 'OTP',
    clientLabel: 'Offer to Purchase Signed',
    shortExplainer:
      'The Offer to Purchase has been signed, which means the transaction is now formally underway.',
    nextStepText:
      'The next step is to finalize the funding side of the purchase and move the transaction forward.',
    actionText:
      'Keep your supporting buyer information current so finance and attorney teams can avoid delays.',
    learnMore:
      'Once OTP is signed, your purchase is actively managed across legal and finance milestones.',
  },
  FIN: {
    stageKey: 'FIN',
    clientLabel: 'Finance in Progress',
    shortExplainer:
      'Your finance or funding process is currently being worked on. This may include bond approval or proof of funds verification.',
    nextStepText: 'Once the funding side is confirmed, the matter can move to the attorneys.',
    actionText: 'Stay available in case your bond originator or bank requests final supporting documents.',
    learnMore:
      'Behind the scenes, originators and finance teams coordinate submissions, feedback, approvals, and attorney instructions.',
  },
  ATTY: {
    stageKey: 'ATTY',
    clientLabel: 'Transfer Preparation',
    shortExplainer:
      'Your attorneys are preparing the transfer documents and obtaining the required certificates before lodgement.',
    nextStepText:
      'Once all required documents and clearances are in place, the transaction can move to lodgement.',
    actionText: 'You do not need to take any action right now unless your team requests a specific document.',
    learnMore:
      'Internal teams are coordinating transfer documentation, guarantees, and clearances so the matter can be lodged.',
  },
  XFER: {
    stageKey: 'XFER',
    clientLabel: 'Transfer Underway',
    shortExplainer:
      'The transfer is actively progressing through the legal process and may already be lodged or approaching registration.',
    nextStepText: 'The next major milestone is registration of the property.',
    actionText: 'At this stage there may be limited action required from you unless requested.',
    learnMore:
      'Transfer timing can depend on deeds office processing and external legal turnaround windows.',
  },
  REG: {
    stageKey: 'REG',
    clientLabel: 'Registered',
    shortExplainer: 'Your property transaction has been registered successfully.',
    nextStepText:
      'The legal transfer is complete. Any next steps such as occupation, snagging, or handover can follow.',
    actionText: 'You may now move into the post-registration / handover phase if applicable.',
    learnMore:
      'Registration confirms legal transfer completion. Your team can now guide handover and post-registration support.',
  },
}

export function getClientStageExplainer(mainStage) {
  const normalized = String(mainStage || '').toUpperCase()
  return (
    CLIENT_STAGE_EXPLAINERS[normalized] || {
      stageKey: normalized || 'AVAIL',
      clientLabel: MAIN_STAGE_LABELS[normalized] || 'Current Stage',
      shortExplainer:
        'Your transaction is progressing and the team will continue guiding each milestone.',
      nextStepText: 'Your next milestone will be shared as soon as the current stage is completed.',
      actionText: null,
      learnMore:
        'Each stage is managed by specialist teams. You will only be asked for action when necessary.',
    }
  )
}

const STAGE_ALIASES = {
  'Transfer In Progress': 'Transfer in Progress',
  'Legal Preparation': 'Proceed to Attorneys',
  'Transfer Preparation': 'Proceed to Attorneys',
  'With Attorneys': 'Proceed to Attorneys',
}

const TRANSFER_STAGES = new Set([
  'Proceed to Attorneys',
  'Transfer in Progress',
  'Transfer Lodged',
])

export function normalizeStageLabel(stage) {
  return STAGE_ALIASES[stage] || stage
}

export function getMainStageFromDetailedStage(stage) {
  const normalized = normalizeStageLabel(stage)

  if (normalized === 'Available') return 'AVAIL'
  if (normalized === 'Reserved' || normalized === 'Deposit Paid') return 'DEP'
  if (normalized === 'OTP Signed') return 'OTP'
  if (normalized === 'Finance Pending' || normalized === 'Bond Approved / Proof of Funds') return 'FIN'
  if (normalized === 'Proceed to Attorneys') return 'ATTY'
  if (normalized === 'Transfer in Progress' || normalized === 'Transfer Lodged' || normalized === 'Transfer') return 'XFER'
  if (normalized === 'Registered') return 'REG'

  return 'AVAIL'
}

export function getDetailedStageFromMainStage(mainStage, currentDetailedStage = null) {
  const normalizedMain = String(mainStage || '').toUpperCase()

  if (normalizedMain === 'AVAIL') return 'Available'
  if (normalizedMain === 'DEP') return 'Reserved'
  if (normalizedMain === 'OTP') return 'OTP Signed'
  if (normalizedMain === 'FIN') {
    const current = normalizeStageLabel(currentDetailedStage)
    if (current === 'Bond Approved / Proof of Funds') {
      return 'Bond Approved / Proof of Funds'
    }
    return 'Finance Pending'
  }
  if (normalizedMain === 'ATTY') return 'Proceed to Attorneys'
  if (normalizedMain === 'XFER') {
    const current = normalizeStageLabel(currentDetailedStage)
    if (current === 'Transfer Lodged') {
      return 'Transfer Lodged'
    }
    return 'Transfer in Progress'
  }
  if (normalizedMain === 'REG') return 'Registered'

  return normalizeStageLabel(currentDetailedStage) || 'Available'
}

export function getMainStageIndex(stageOrMain) {
  const raw = String(stageOrMain || '').toUpperCase()
  const mainStage = MAIN_PROCESS_STAGES.includes(raw) ? raw : getMainStageFromDetailedStage(stageOrMain)
  const index = MAIN_PROCESS_STAGES.indexOf(mainStage)
  return index === -1 ? 0 : index
}

export function getMainProcessStats(rows) {
  return MAIN_PROCESS_STAGES.reduce((accumulator, mainStage) => {
    accumulator[mainStage] = 0
    return accumulator
  }, {})
}

export function getStageIndex(stage) {
  const index = STAGES.indexOf(normalizeStageLabel(stage))
  return index === -1 ? 0 : index
}

export function isInTransferStage(stage) {
  return TRANSFER_STAGES.has(normalizeStageLabel(stage))
}

export function getSummaryStats(rows) {
  const totalUnits = rows.length
  const available = rows.filter((row) => row.stage === 'Available').length
  const registered = rows.filter((row) => row.stage === 'Registered').length
  const inTransfer = rows.filter((row) => isInTransferStage(row.stage)).length

  return {
    totalUnits,
    available,
    soldActive: totalUnits - available,
    inTransfer,
    registered,
  }
}

export function getLifecycleStatus(stage) {
  const normalized = normalizeStageLabel(stage)

  if (normalized === 'Available') {
    return 'Available'
  }

  if (normalized === 'Registered') {
    return 'Registered'
  }

  if (isInTransferStage(normalized)) {
    return 'In Transfer'
  }

  return 'Active'
}
