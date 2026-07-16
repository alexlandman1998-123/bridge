export const CONVEYANCER_USABILITY_H9_VERSION = 'conveyancer_usability_h9_v1'

export const CONVEYANCER_H9_COMMAND_INTENTS = Object.freeze(['start', 'complete', 'resume', 'mark_waiting'])
export const CONVEYANCER_H9_NAVIGATION_INTENTS = Object.freeze(['open_documents', 'open_review', 'view'])

const CONFIRMATION_INTENTS = new Set(['start', 'complete'])
const COMMAND_INTENTS = new Set(CONVEYANCER_H9_COMMAND_INTENTS)
const NAVIGATION_INTENTS = new Set(CONVEYANCER_H9_NAVIGATION_INTENTS)
const text = (value = '') => String(value ?? '').trim()
const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

function componentStopped(operations = {}, component) {
  const state = operations.componentStops?.[component]
  return state === true || state?.allowed === false || state?.stopped === true
}

export function buildConveyancerActionAffordanceH9({ item = {}, operationalSummary = {}, cockpit = {}, busy = false } = {}) {
  const intentType = text(item.intent?.type).toLowerCase()
  const navigationOnly = NAVIGATION_INTENTS.has(intentType)
  const stateChanging = COMMAND_INTENTS.has(intentType)
  const orchestrationStopped = componentStopped(operationalSummary, 'orchestration') || cockpit.status === 'paused' || cockpit.control?.killSwitchEnabled === true
  const disabled = Boolean(busy || (stateChanging && orchestrationStopped))
  return freeze({
    actionKey: text(item.actionKey),
    intentType,
    navigationOnly,
    stateChanging,
    confirmationRequired: CONFIRMATION_INTENTS.has(intentType),
    disabled,
    disabledReason: busy
      ? 'Another update is being saved.'
      : stateChanging && orchestrationStopped
        ? 'Updates are paused safely. Continue in the normal matter workspace or ask a firm administrator for help.'
        : null,
  })
}

export function buildConveyancerActionConfirmationH9(item = {}) {
  const actionKey = text(item.actionKey)
  const intentType = text(item.intent?.type).toLowerCase()
  if (!actionKey || !CONFIRMATION_INTENTS.has(intentType)) return null
  const completing = intentType === 'complete'
  return freeze({
    version: CONVEYANCER_USABILITY_H9_VERSION,
    actionKey,
    intentType,
    title: completing ? 'Confirm this work is complete' : 'Confirm work can start',
    question: completing
      ? `Have you finished “${text(item.label) || 'this action'}” and checked the required evidence?`
      : `Are you ready to start “${text(item.label) || 'this action'}”?`,
    consequence: completing
      ? 'This updates the matter plan. It does not approve legal evidence, release a document, or send money.'
      : 'This records that work has started. It does not contact a client or external provider.',
    confirmLabel: completing ? 'Yes, mark complete' : 'Yes, start work',
    cancelLabel: 'Go back',
  })
}

export function buildConveyancerUsabilityH9({ cockpit = null, experience = {}, context = {} } = {}) {
  const operations = context.operationalSummary || {}
  const orchestrationStopped = componentStopped(operations, 'orchestration') || cockpit?.status === 'paused' || cockpit?.control?.killSwitchEnabled === true
  const stoppedComponents = ['orchestration', 'notifications', 'documents', 'providers'].filter((component) => componentStopped(operations, component))
  const status = orchestrationStopped
    ? {
        tone: 'warning',
        title: 'Matter updates are paused safely',
        detail: 'No cockpit update will be saved while the stop is active. You can still review the matter and continue through the normal workspace.',
        actionLabel: 'Open normal workspace',
      }
    : {
        tone: 'success',
        title: 'Matter updates are available',
        detail: 'The cockpit will ask you to confirm before it changes the matter plan.',
        actionLabel: null,
      }
  return freeze({
    version: CONVEYANCER_USABILITY_H9_VERSION,
    ready: Boolean(cockpit && experience),
    orchestrationStopped,
    stoppedComponents,
    status,
    controls: {
      onePrimaryAction: true,
      stateChangesRequireDeliberateConfirmation: true,
      stopPlaneVisibleBeforeAction: true,
      navigationRemainsAvailableDuringStop: true,
      manualWorkspaceAlwaysAvailable: true,
      legalApprovalInferred: false,
      externalContactInferred: false,
    },
  })
}

