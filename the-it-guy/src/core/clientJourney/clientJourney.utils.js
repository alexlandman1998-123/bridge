import { normalizeFinanceType } from '../transactions/financeType'

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function mapWorkflowStepStatus(status) {
  const normalized = normalizeKey(status)
  if (['completed', 'complete', 'approved', 'verified', 'registered', 'done', 'signed'].includes(normalized)) return 'complete'
  if (['in_progress', 'active', 'under_review', 'blocked', 'pending_confirmation'].includes(normalized)) return 'current'
  return 'upcoming'
}

function getBuyerJourneyPointer(mainStage) {
  const normalized = String(mainStage || '').toUpperCase()
  if (['REG'].includes(normalized)) return 5
  if (['ATTY', 'XFER'].includes(normalized)) return 4
  if (['FIN'].includes(normalized)) return 3
  if (['OTP'].includes(normalized)) return 2
  if (['DEP'].includes(normalized)) return 1
  return 0
}

function getSellerJourneyPointer(mainStage) {
  const normalized = String(mainStage || '').toUpperCase()
  if (['REG'].includes(normalized)) return 6
  if (['ATTY', 'XFER'].includes(normalized)) return 5
  if (['FIN'].includes(normalized)) return 4
  if (['OTP'].includes(normalized)) return 4
  return 0
}

function buildBuyerTemplate({ financeType, subjectToSale }) {
  const isHybrid = financeType === 'hybrid'
  const isBond = financeType === 'bond'
  const isCash = financeType === 'cash'

  const financeLabel = isCash ? 'Proof of Funds' : 'Finance'
  const financeShortDescription = isCash
    ? 'Your proof of funds is reviewed before legal transfer continues.'
    : isHybrid
      ? 'Your cash contribution and bond finance are progressing together.'
      : 'Your bond application and lender approvals are progressing.'

  const financeWhatHappensNow = isCash
    ? 'Your team verifies available funds and confirms transfer readiness.'
    : isHybrid
      ? 'Your team tracks both your cash contribution and bank-side approval steps.'
      : 'Your finance team coordinates lender submissions and tracks approval outcomes.'

  const financeClientRole = isCash
    ? 'Share any missing proof of funds documents if your team requests them.'
    : 'No action is usually needed unless your team asks for additional finance documents.'

  const firstStage = subjectToSale
    ? {
        id: 'selling_existing_property',
        label: 'Selling Existing Property',
        shortDescription: 'Your current property sale is being tracked as part of this purchase journey.',
        timeframe: 'Timing depends on your linked sale progression.',
        whatHappensNow:
          'Your team is monitoring progress on your existing property sale so your purchase can move smoothly.',
        clientRole: 'Stay in touch with your team if your sale timeline changes.',
        learnMore:
          'When your linked sale progresses, your purchase can move confidently into offer and legal milestones.',
        defaultSubsteps: ['Sale status reviewed', 'Linked sale timeline confirmed'],
      }
    : {
        id: 'reservation_deposit',
        label: 'Reservation / Deposit',
        shortDescription: 'Your reservation is captured and any required deposit is being confirmed.',
        timeframe: 'Usually completed within a few working days.',
        whatHappensNow:
          'Your team confirms reservation records and checks that the file is ready for agreement progression.',
        clientRole: 'If asked, upload reservation payment proof in your Documents section.',
        learnMore: 'This stage secures your file before legal agreement and transfer workflow starts.',
        defaultSubsteps: ['Reservation captured', 'Deposit check complete'],
      }

  return [
    firstStage,
    {
      id: 'offer_accepted',
      label: 'Offer Accepted',
      shortDescription: 'Your accepted offer is confirmed and prepared for legal progression.',
      timeframe: 'Usually a few working days.',
      whatHappensNow:
        'Your transaction details are reviewed, stakeholders are aligned, and document readiness is confirmed.',
      clientRole: 'You may be asked to confirm personal details if anything is outstanding.',
      learnMore:
        'This stage confirms your commercial terms before full OTP and legal process movement.',
      defaultSubsteps: ['Offer terms confirmed', 'Stakeholders aligned'],
    },
    {
      id: 'otp',
      label: 'OTP',
      shortDescription: 'Your Offer to Purchase is prepared, shared, and signed by required parties.',
      timeframe: 'Often a few days depending on signer availability.',
      whatHappensNow:
        'Your OTP packet is prepared and signing actions are coordinated across all required parties.',
      clientRole: 'Sign your OTP when it appears in Documents.',
      learnMore:
        'OTP completion activates the formal legal and transfer workflow for the transaction.',
      defaultSubsteps: ['OTP generated', 'Signatures requested', 'OTP fully signed'],
    },
    {
      id: 'finance',
      label: financeLabel,
      shortDescription: financeShortDescription,
      timeframe: isCash ? 'Usually a few working days.' : 'Often 5-15 working days depending on bank turnaround.',
      whatHappensNow: financeWhatHappensNow,
      clientRole: financeClientRole,
      learnMore: 'Finance readiness is required before transfer can move to final legal progression.',
      defaultSubsteps: isCash
        ? ['Proof requested', 'Proof reviewed', 'Funds verified']
        : ['Documents received', 'Submitted to banks', 'Approval outcome tracked'],
    },
    {
      id: 'transfer_preparation',
      label: 'Transfer Preparation',
      shortDescription: 'Attorneys are preparing legal transfer packs and lodgement readiness.',
      timeframe: 'Usually a few weeks depending on legal and deeds-office timelines.',
      whatHappensNow:
        'Your legal team is compiling transfer documents and progressing all pre-lodgement requirements.',
      clientRole: 'No action is usually needed unless legal signatures or confirmations are requested.',
      learnMore: 'This stage prepares everything needed before transfer lodgement and registration.',
      defaultSubsteps: ['Transfer pack prepared', 'Lodgement readiness checked'],
    },
    {
      id: 'transfer_registration',
      label: 'Transfer / Registration',
      shortDescription: 'Transfer lodgement and registration completion are now in progress.',
      timeframe: 'Timing varies based on deeds-office and legal processing.',
      whatHappensNow:
        'The legal team is progressing transfer completion and final registration confirmations.',
      clientRole: 'No action is usually needed unless final confirmations are requested.',
      learnMore: 'Registration completion marks legal close-out of your property transaction.',
      defaultSubsteps: ['Lodgement submitted', 'Registration confirmed', 'Close-out finalised'],
    },
  ]
}

function buildSellerTemplate() {
  return [
    {
      id: 'seller_onboarding',
      label: 'Seller Onboarding',
      shortDescription: 'Your seller details and property basics are being collected and verified.',
      timeframe: 'Usually completed in a few days.',
      whatHappensNow: 'Your agent is capturing seller details and preparing the mandate workflow.',
      clientRole: 'Complete onboarding details when requested.',
      learnMore: 'This creates the baseline for mandate generation and listing activation.',
      defaultSubsteps: ['Seller profile captured', 'Property basics recorded'],
    },
    {
      id: 'mandate',
      label: 'Mandate',
      shortDescription: 'Your mandate is prepared and moved through signing readiness.',
      timeframe: 'Usually a few working days depending on signatures.',
      whatHappensNow: 'Your mandate packet is generated, reviewed, and prepared for signature.',
      clientRole: 'Sign your mandate when it is ready in Documents.',
      learnMore: 'A signed mandate enables listing activation and full go-to-market progression.',
      defaultSubsteps: ['Mandate generated', 'Mandate sent', 'Mandate signed'],
    },
    {
      id: 'listing_active',
      label: 'Listing Active',
      shortDescription: 'Your property listing is now live and available for buyer interest.',
      timeframe: 'Timing depends on media and listing readiness.',
      whatHappensNow: 'Your agent is marketing the listing and qualifying incoming buyer interest.',
      clientRole: 'Review listing details and keep communication open with your agent.',
      learnMore: 'This stage drives buyer visibility and opportunities for offers.',
      defaultSubsteps: ['Listing prepared', 'Listing published', 'Marketing active'],
    },
    {
      id: 'offers_received',
      label: 'Offers Received',
      shortDescription: 'Buyer offers are being submitted and reviewed with your agent.',
      timeframe: 'Varies based on market activity and buyer readiness.',
      whatHappensNow: 'Your agent is collecting, qualifying, and discussing offers with you.',
      clientRole: 'Review offer terms and indicate whether to accept, reject, or counter.',
      learnMore: 'Offer handling leads into accepted terms and formal transfer progression.',
      defaultSubsteps: ['Offers captured', 'Offer review completed'],
    },
    {
      id: 'offer_accepted',
      label: 'Offer Accepted',
      shortDescription: 'An offer is accepted and legal transaction setup is progressing.',
      timeframe: 'Usually a few working days.',
      whatHappensNow: 'Your accepted offer is moved into formal transaction and legal workflow.',
      clientRole: 'Sign and confirm any requested sale documents.',
      learnMore: 'Offer acceptance transitions your sale into transfer workflow.',
      defaultSubsteps: ['Accepted offer confirmed', 'Transaction opened'],
    },
    {
      id: 'transfer',
      label: 'Transfer',
      shortDescription: 'Attorney teams are progressing legal transfer milestones.',
      timeframe: 'Usually a few weeks depending on legal/deeds-office processing.',
      whatHappensNow: 'Transfer preparation, lodgement, and legal dependencies are being handled.',
      clientRole: 'No action is usually needed unless attorney signatures are requested.',
      learnMore: 'This stage prepares your sale for legal registration completion.',
      defaultSubsteps: ['Transfer prep complete', 'Lodgement in progress'],
    },
    {
      id: 'registration',
      label: 'Registration',
      shortDescription: 'Final registration and close-out confirmations are underway.',
      timeframe: 'Depends on deeds-office finalisation.',
      whatHappensNow: 'Your legal team is concluding registration and closing transfer records.',
      clientRole: 'No action is usually needed unless final confirmations are required.',
      learnMore: 'Registration marks legal completion of your property sale.',
      defaultSubsteps: ['Registration confirmed', 'Sale close-out complete'],
    },
  ]
}

const SELLER_STATUS_POINTER_MAP = {
  new: 0,
  contacted: 0,
  appointment_scheduled: 0,
  onboarding_sent: 0,
  onboarding_completed: 1,
  mandate_ready: 1,
  mandate_generated: 1,
  mandate_sent: 1,
  mandate_signed: 2,
  converted_to_listing: 2,
  listing_active: 2,
  offer_submitted: 3,
  offer_received: 3,
  offer_accepted: 4,
  transaction_created: 5,
  transfer: 5,
  transfer_in_progress: 5,
  registered: 6,
  completed: 6,
}

function resolveSellerPointer({ sellerStatus, mainStage }) {
  const normalizedStatus = normalizeKey(sellerStatus)
  if (normalizedStatus && Object.hasOwn(SELLER_STATUS_POINTER_MAP, normalizedStatus)) {
    return SELLER_STATUS_POINTER_MAP[normalizedStatus]
  }
  return getSellerJourneyPointer(mainStage)
}

function deriveSubsteps(step, { financeProcess, attorneyProcess }) {
  if (step.id === 'finance' && Array.isArray(financeProcess?.steps) && financeProcess.steps.length) {
    return financeProcess.steps.slice(0, 4).map((item, index) => ({
      id: item?.id || item?.step_key || `${step.id}_${index}`,
      label: item?.step_label || item?.step_key || 'Finance task',
      status: mapWorkflowStepStatus(item?.status),
    }))
  }

  if (['transfer_preparation', 'transfer', 'transfer_registration', 'registration'].includes(step.id) && Array.isArray(attorneyProcess?.steps) && attorneyProcess.steps.length) {
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
  const category = normalizeKey(transaction?.property_category || transaction?.property_type)
  if (['commercial', 'industrial', 'development'].includes(category)) return category
  if (transaction?.development_id) return 'development'
  return 'residential'
}

export function resolveClientJourneyFinanceType(value) {
  const normalized = normalizeFinanceType(value, { allowUnknown: true })
  if (normalized === 'combination' || normalized === 'hybrid') return 'hybrid'
  if (normalized === 'bond') return 'bond'
  return 'cash'
}

export function deriveClientJourneyStatusFlag({ nextStepState, stageAgeDays = null }) {
  if (nextStepState?.requiresAction) {
    return {
      type: 'action_required',
      label: 'Action Required',
      message: 'We need one action from you before this journey can move forward.',
    }
  }

  if (
    ['awaiting_finance_outcome', 'awaiting_transfer_legal_progress'].includes(nextStepState?.type) ||
    (typeof stageAgeDays === 'number' && stageAgeDays >= 21)
  ) {
    return {
      type: 'waiting_external',
      label: 'Waiting on External Team',
      message: 'Your team is waiting on finance, legal, or municipality processing.',
    }
  }

  return {
    type: 'on_track',
    label: 'On Track',
    message: 'Your journey is progressing as expected.',
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
      description: 'Your team is currently handling the next stage of your journey.',
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
  journeyType = 'buyer',
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
  subjectToSale = false,
  sellerStatus = '',
}) {
  const normalizedJourneyType = String(journeyType || '').trim().toLowerCase() === 'seller' ? 'seller' : 'buyer'
  const template = normalizedJourneyType === 'seller'
    ? buildSellerTemplate({ propertyType })
    : buildBuyerTemplate({ financeType, subjectToSale })
  const pointer = normalizedJourneyType === 'seller'
    ? resolveSellerPointer({ sellerStatus, mainStage })
    : getBuyerJourneyPointer(mainStage)
  const normalizedReservationStatus = normalizeKey(reservationStatus)
  const reservationIncomplete = reservationRequired && !['paid', 'verified'].includes(normalizedReservationStatus)

  const steps = template.map((step, index) => {
    let status = index < pointer ? 'complete' : index === pointer ? 'current' : 'upcoming'

    if (isCompleted) {
      status = 'complete'
    } else if (index === pointer && nextStepState?.requiresAction) {
      status = 'blocked'
    } else if (normalizedJourneyType === 'buyer' && !isCompleted && index === 0 && reservationIncomplete && pointer === 0) {
      status = 'blocked'
    } else if (normalizedJourneyType === 'buyer' && !isCompleted && step.id === 'otp' && otpSignaturePending && pointer <= index) {
      status = 'blocked'
    }

    const substeps = deriveSubsteps(step, { financeProcess, attorneyProcess }).map((item) => {
      if (status === 'complete') return { ...item, status: 'complete' }
      if (status === 'upcoming') return { ...item, status: 'upcoming' }
      return item
    })

    return {
      id: step.id,
      label: step.label,
      shortDescription: step.shortDescription,
      status,
      timeframe: step.timeframe,
      whatHappensNow: step.whatHappensNow,
      clientAction: status === 'blocked' && nextStepState?.requiresAction ? nextStepState.title : step.clientRole,
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
