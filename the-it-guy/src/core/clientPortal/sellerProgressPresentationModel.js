const EDUCATION = {
  contacted: 'Your agent establishes the property and seller details needed to begin the listing process.',
  onboarding: 'Seller details, ownership and disclosure information are collected for the listing file.',
  submitted: 'Your agent reviews the submitted onboarding before progressing the mandate and listing.',
  mandate_signed: 'The signed mandate records the authority and agreed terms for marketing your property.',
  listing_created: 'The property details, asking price and marketing material are prepared for publication.',
  listing_live: 'Published listing links, enquiries and viewings are managed through the listing workspace.',
  documents_complete: 'The required seller documents are reviewed so the file is ready for the next sale milestone.',
}

// Adapt the same listing projection used by the overview; this view never
// decides that a milestone is completed or starts a legal matter itself.
export function buildSellerListingJourneyPresentation({ listingProgress = {}, nextAction = {}, agentUpdate = null, agentName = '' } = {}) {
  const steps = Array.isArray(listingProgress.steps) ? listingProgress.steps : []
  if (!steps.length) return { status: 'unavailable', stages: [], currentStage: null }
  const stages = steps.map((step) => ({
    key: step.key,
    title: step.label,
    status: step.state === 'completed' ? 'completed' : step.state === 'current' ? 'in_progress' : 'not_started',
    description: EDUCATION[step.key] || step.description || '',
    education: EDUCATION[step.key] || step.description || '',
    currentStatus: step.state === 'current' ? listingProgress.helperMessage || 'In progress' : step.state === 'completed' ? 'Completed' : 'Not started',
    duration: 'Your agent will confirm timing',
    latestUpdate: step.state === 'current' ? agentUpdate : null,
  }))
  const currentIndex = stages.findIndex((stage) => stage.key === listingProgress.currentKey)
  const currentStage = stages[currentIndex] || stages.find((stage) => stage.status === 'in_progress') || null
  return {
    status: 'ready', stages, currentStage, currentIndex,
    progressPercent: listingProgress.percent ?? 0,
    completedCount: stages.filter((stage) => stage.status === 'completed').length,
    isComplete: stages.every((stage) => stage.status === 'completed'),
    nextStage: stages.slice(Math.max(currentIndex, 0) + 1).find((stage) => stage.status !== 'completed') || null,
    waitingOn: nextAction.tone === 'action' ? 'Your requested items' : agentName || 'Your property team',
    clientAction: nextAction.title || 'Check your requested items',
    clientActionDetail: nextAction.description || 'Your agent will share any required action here.',
    updateIsOld: false,
  }
}
