import { MAIN_STAGE_LABELS, getClientStageExplainer, getMainStageFromDetailedStage } from './stageConfig'

const ROLE_EMPHASIS = {
  attorney: 'Transfer readiness, requirements by party, and progression momentum in one view.',
  bond_originator: 'Finance progression, missing requirements, and attorney handover clarity at a glance.',
  client: 'Clear progress, calm guidance, and simple actions for your purchase journey.',
}

const ROLE_FOCUS = {
  attorney: {
    title: 'Attorney Focus',
    bullets: [
      'Check transfer pack readiness before lodgement.',
      'Track outstanding requirements by owner.',
      'Post concise transfer updates for all stakeholders.',
    ],
  },
  bond_originator: {
    title: 'Bond Focus',
    bullets: [
      'Confirm finance documentation is complete.',
      'Share bank feedback and approval outcomes fast.',
      'Signal handover readiness to attorneys early.',
    ],
  },
  client: {
    title: 'Buyer Focus',
    bullets: [
      'See where your transaction is right now.',
      'Understand what happens next in plain language.',
      'Upload requested documents with confidence.',
    ],
  },
}

function normalizeVisibility(value, fallback = 'shared') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ['shared', 'client', 'client_safe', 'internal'].includes(normalized) ? normalized : fallback
}

function isClientVisibleDocument(document = {}) {
  const scope = normalizeVisibility(document.visibility_scope, document.is_client_visible ? 'shared' : 'internal')
  return scope !== 'internal' || Boolean(document.is_client_visible)
}

function isClientVisibleDiscussion(item = {}) {
  const scope = normalizeVisibility(item.visibility, 'shared')
  return scope !== 'internal'
}

export function getExternalRolePresentation(roleKey) {
  const normalizedRoleKey = String(roleKey || '').toLowerCase()
  return {
    roleEmphasis: ROLE_EMPHASIS[normalizedRoleKey] || 'Track transaction progress clearly and coordinate confidently.',
    roleFocus: ROLE_FOCUS[normalizedRoleKey] || ROLE_FOCUS.client,
  }
}

export function buildClientSafeExternalWorkspace(rawPortal) {
  const portal = rawPortal || {}
  const safeDocuments = (portal.documents || []).filter(isClientVisibleDocument)
  const safeDiscussion = (portal.discussion || []).filter(isClientVisibleDiscussion)

  const completeCount = (portal.requiredDocumentChecklist || []).filter((item) => item.complete).length
  const totalRequired = (portal.requiredDocumentChecklist || []).length
  const missingRequiredCount = Math.max(totalRequired - completeCount, 0)
  const completion = totalRequired ? Math.round((completeCount / totalRequired) * 100) : 0

  const latestUpdate = safeDiscussion[0] || null
  const latestDocument = [...safeDocuments].sort(
    (left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime(),
  )[0]

  const mainStage = getMainStageFromDetailedStage(portal.stage)
  const stageLabel = MAIN_STAGE_LABELS[mainStage] || mainStage
  const stageExplainer = getClientStageExplainer(mainStage)

  const guidedNextSteps = [
    portal.transaction?.next_action
      ? {
          title: 'Next Action',
          body: portal.transaction.next_action,
          owner: 'Shared Team',
        }
      : null,
    missingRequiredCount > 0
      ? {
          title: 'Required Documents',
          body: `${missingRequiredCount} required document${missingRequiredCount === 1 ? '' : 's'} still outstanding.`,
          owner: 'Buyer / Client',
        }
      : null,
    stageExplainer?.actionText
      ? {
          title: 'Client Action',
          body: stageExplainer.actionText,
          owner: 'Buyer / Client',
        }
      : null,
  ].filter(Boolean)

  return {
    ...portal,
    documents: safeDocuments,
    discussion: safeDiscussion,
    presentation: {
      mainStage,
      stageLabel,
      stageExplainer,
      completeCount,
      totalRequired,
      missingRequiredCount,
      completion,
      latestUpdate,
      latestDocument,
      guidedNextSteps,
    },
  }
}
