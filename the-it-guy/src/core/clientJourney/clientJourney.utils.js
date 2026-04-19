import { normalizeFinanceType } from '../transactions/financeType'

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function mapWorkflowStepStatus(status) {
  const normalized = normalizeKey(status)
  if (['completed', 'complete', 'approved', 'verified', 'registered', 'done'].includes(normalized)) return 'complete'
  if (['in_progress', 'active', 'under_review', 'blocked'].includes(normalized)) return 'current'
  return 'upcoming'
}

function getJourneyPointer(mainStage) {
  const normalized = String(mainStage || '').toUpperCase()
  if (['REG'].includes(normalized)) return 4
  if (['ATTY', 'XFER'].includes(normalized)) return 3
  if (['FIN'].includes(normalized)) return 2
  if (['OTP'].includes(normalized)) return 1
  return 0
}

function buildTemplate(propertyType, financeType) {
  const isPrivate = propertyType === 'private_sale'
  const isHybrid = financeType === 'hybrid'
  const isBond = financeType === 'bond'
  const fundingLabel = isHybrid
    ? 'Funding in Progress'
    : isBond
      ? 'Bond Application in Progress'
      : 'Proof of Funds Verified'
  const fundingDescription = isHybrid
    ? 'Your cash contribution and bond portion are being progressed together.'
    : isBond
      ? 'We are progressing your home loan application with the selected banks.'
      : 'Your team is verifying proof of funds for this cash transaction.'

  const firstStageLabel = isPrivate ? 'Offer Accepted' : 'Reservation Secured'
  const firstStageDescription = isPrivate
    ? 'Your accepted offer has been recorded and opened for legal progression.'
    : 'Your reservation has been captured and secured on the transaction file.'

  return [
    {
      id: isPrivate ? 'offer_accepted' : 'reservation_secured',
      label: firstStageLabel,
      shortDescription: firstStageDescription,
      timeframe: 'Usually within a few working days.',
      whatHappensNow:
        'Your team confirms the deal opening details, allocates stakeholders, and prepares the file for agreement and funding stages.',
      clientRole: isPrivate
        ? 'No action is usually needed unless your team asks for supporting information.'
        : 'If a reservation deposit is required, upload proof of payment in Documents.',
      learnMore:
        'This stage confirms the deal is active and ready to progress into signed agreement and funding steps.',
      defaultSubsteps: ['Deal setup confirmed', 'Team allocation complete'],
    },
    {
      id: 'agreement_signed',
      label: 'Agreement Signed',
      shortDescription: 'The signed agreement is being confirmed and logged for the active file.',
      timeframe: 'Usually a few working days depending on signatures.',
      whatHappensNow:
        'Your signed agreement is validated and the transaction is prepared for funding and transfer processing.',
      clientRole: 'You may be asked to sign or confirm documents if anything is still outstanding.',
      learnMore:
        'This stage validates that legal sale terms are in place before finance and transfer preparation continue.',
      defaultSubsteps: ['Agreement prepared', 'Signatures confirmed', 'Document filed'],
    },
    {
      id: 'funding_in_progress',
      label: fundingLabel,
      shortDescription: fundingDescription,
      timeframe: isBond ? 'Often 5-15 working days depending on bank turnaround.' : 'Usually a few working days.',
      whatHappensNow: isBond
        ? 'Your finance team manages lender submissions, affordability checks, and bank feedback.'
        : isHybrid
          ? 'Your team tracks both bond progress and the cash contribution requirements.'
          : 'Proof of funds and payment readiness are being confirmed before transfer progression.',
      clientRole: isBond
        ? 'No action is needed unless your team asks for additional bank documents.'
        : 'You may be asked for supporting payment confirmation if needed.',
      learnMore:
        'Funding readiness is required before legal transfer can move forward confidently.',
      defaultSubsteps: isBond
        ? ['Documents received', 'Submitted to banks', 'Awaiting bank feedback']
        : ['Proof of funds requested', 'Proof reviewed', 'Funding confirmed'],
    },
    {
      id: 'transfer_preparation',
      label: 'Transfer Preparation',
      shortDescription: 'The legal team is preparing transfer documentation and lodgement readiness.',
      timeframe: 'Often a few weeks depending on legal and deeds-office processing.',
      whatHappensNow:
        'Attorneys progress transfer tasks, legal checks, and final preparation toward registration.',
      clientRole: 'No action is usually required unless signatures or specific documents are requested.',
      learnMore:
        'This stage coordinates legal transfer requirements before final registration is confirmed.',
      defaultSubsteps: ['Transfer pack prepared', 'Lodgement readiness confirmed', 'Registration queue monitored'],
    },
    {
      id: 'registration_complete',
      label: 'Registration Complete',
      shortDescription: 'The final legal registration and close-out checks are being completed.',
      timeframe: 'Timing varies by deeds-office and external dependency turnaround.',
      whatHappensNow: 'Your team is finalizing registration confirmation and completing close-out records.',
      clientRole: 'No action is typically required unless final confirmations are requested.',
      learnMore:
        'Registration completion marks the legal close of the transfer process before final handover close-out.',
      defaultSubsteps: ['Registration submitted', 'Registration confirmed', 'Close-out underway'],
    },
  ]
}

function deriveSubsteps(step, { financeProcess, attorneyProcess }) {
  if (step.id === 'funding_in_progress' && Array.isArray(financeProcess?.steps) && financeProcess.steps.length) {
    return financeProcess.steps.slice(0, 4).map((item, index) => ({
      id: item?.id || item?.step_key || `${step.id}_${index}`,
      label: item?.step_label || item?.step_key || 'Funding task',
      status: mapWorkflowStepStatus(item?.status),
    }))
  }

  if (step.id === 'transfer_preparation' && Array.isArray(attorneyProcess?.steps) && attorneyProcess.steps.length) {
    return attorneyProcess.steps.slice(0, 4).map((item, index) => ({
      id: item?.id || item?.step_key || `${step.id}_${index}`,
      label: item?.step_label || item?.step_key || 'Transfer task',
      status: mapWorkflowStepStatus(item?.status),
    }))
  }

  return (step.defaultSubsteps || []).map((label, index) => ({
    id: `${step.id}_${index}`,
    label,
    status: index === 0 ? 'current' : 'upcoming',
  }))
}

export function resolveClientJourneyPropertyType(transaction = {}) {
  const transactionType = normalizeKey(transaction?.transaction_type)
  if (transactionType === 'private_property' || transactionType.includes('private')) return 'private_sale'
  if (transaction?.development_id) return 'new_development'
  return 'new_development'
}

export function resolveClientJourneyFinanceType(value) {
  const normalized = normalizeFinanceType(value, { allowUnknown: true })
  if (normalized === 'combination') return 'hybrid'
  if (normalized === 'bond') return 'bond'
  return 'cash'
}

export function deriveClientJourneyStatusFlag({ nextStepState, stageAgeDays = null }) {
  if (nextStepState?.requiresAction) {
    return {
      type: 'action_required',
      label: 'Action Required',
      message: 'We need something from you before the transaction can move to the next step.',
    }
  }

  if (
    ['awaiting_finance_outcome', 'awaiting_transfer_legal_progress'].includes(nextStepState?.type) ||
    (typeof stageAgeDays === 'number' && stageAgeDays >= 21)
  ) {
    return {
      type: 'waiting_external',
      label: 'Waiting on External Party',
      message: 'We are currently waiting on a bank, attorney, municipality, or related external process.',
    }
  }

  return {
    type: 'on_track',
    label: 'On Track',
    message: 'Your transaction is progressing as expected.',
  }
}

export function buildClientNextActionModel(nextStepState, { isCompleted = false } = {}) {
  if (isCompleted) {
    return {
      type: 'complete',
      pillLabel: 'Completed',
      title: 'Your transaction is complete',
      description: 'All major milestones are complete. Your team will share any final close-out details if needed.',
    }
  }

  if (!nextStepState) {
    return {
      type: 'team_in_progress',
      pillLabel: 'In Progress',
      title: 'No action needed right now',
      description: 'Your team is currently handling the next stage of your purchase.',
    }
  }

  const type = nextStepState.requiresAction
    ? 'client_action'
    : ['awaiting_finance_outcome', 'awaiting_transfer_legal_progress'].includes(nextStepState.type)
      ? 'waiting_external'
      : 'team_in_progress'

  return {
    type,
    pillLabel:
      type === 'client_action'
        ? 'Action Required'
        : type === 'waiting_external'
          ? 'Waiting External'
          : 'In Progress',
    title: nextStepState.title || 'No action needed right now',
    description: nextStepState.description || nextStepState.helperText || 'Your team is progressing the next milestone.',
    helperText: nextStepState.helperText || '',
    ctaLabel: nextStepState.ctaLabel || '',
    ctaTo: nextStepState.ctaTo || '',
  }
}

export function buildClientJourney({
  propertyType,
  financeType,
  mainStage,
  nextStepState,
  reservationRequired = false,
  reservationStatus = '',
  otpSignaturePending = false,
  isCompleted = false,
  financeProcess = null,
  attorneyProcess = null,
}) {
  const template = buildTemplate(propertyType, financeType)
  const pointer = getJourneyPointer(mainStage)
  const normalizedReservationStatus = normalizeKey(reservationStatus)
  const reservationIncomplete = reservationRequired && !['paid', 'verified'].includes(normalizedReservationStatus)

  const steps = template.map((step, index) => {
    let status = index < pointer ? 'complete' : index === pointer ? 'current' : 'upcoming'

    if (isCompleted) {
      status = 'complete'
    } else if (index === pointer && nextStepState?.requiresAction) {
      status = 'blocked'
    } else if (!isCompleted && index === 0 && reservationIncomplete && pointer === 0) {
      status = 'blocked'
    } else if (!isCompleted && index === 1 && otpSignaturePending && pointer <= 1) {
      status = 'blocked'
    }

    const substeps = deriveSubsteps(step, { financeProcess, attorneyProcess }).map((item) => {
      if (status === 'complete') return { ...item, status: 'complete' }
      if (status === 'upcoming') return { ...item, status: 'upcoming' }
      return item
    })

    const clientAction =
      status === 'blocked' && nextStepState?.requiresAction
        ? nextStepState.title
        : step.clientRole

    return {
      id: step.id,
      label: step.label,
      shortDescription: step.shortDescription,
      status,
      timeframe: step.timeframe,
      whatHappensNow: step.whatHappensNow,
      clientAction,
      learnMore: step.learnMore,
      substeps,
    }
  })

  const current = steps.find((item) => item.status === 'current' || item.status === 'blocked') || steps[0] || null
  return {
    steps,
    currentStepId: current?.id || null,
  }
}
