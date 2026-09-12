import { getAttorneyStageDefinition } from '../../constants/attorneyWorkflowStages.js'
import { presentSharedMatterJourney } from '../../core/transactions/sharedMatterJourneyContract.js'
import { evaluateTransferTaxLodgementReadiness } from './transferTaxLodgementGate.js'

export const TRANSFER_TAX_CROSS_ROLE_AUDIENCES = Object.freeze([
  'attorney', 'developer', 'agent', 'buyer', 'seller',
])

const INTERNAL_TRANSFER_TAX_TASKS = new Set([
  'transfer_tax_route_confirmed',
  'transfer_duty_tdc01_submission',
  'sars_evidence_request_response',
  'transfer_duty_assessment_payment',
  'vat_exemption_evidence_verified',
  'non_resident_seller_withholding_review',
])

const CLIENT_TAX_RECEIPT_TASK = 'sars_transfer_tax_receipt_verified'
const CLIENT_SENSITIVE_TAX_TERMS = /vat|tdc01|non[ -]?resident|withholding|transfer[ -]?duty|sars/i

function blocker(code, detail, remediation) {
  return { code, detail, remediation }
}

function taskIndex(presentation) {
  return new Map((presentation?.lanes || []).flatMap((lane) =>
    (lane.phases || []).flatMap((phase) => (phase.tasks || []).map((task, index) => [
      `${lane.key}:${phase.key}:${index}`,
      { ...task, laneKey: lane.key, phaseKey: phase.key, index },
    ])),
  ))
}

function transferTaxTasks(index) {
  return [...index.values()].filter((task) => task.laneKey === 'transfer' && (
    INTERNAL_TRANSFER_TAX_TASKS.has(task.key) || task.key === CLIENT_TAX_RECEIPT_TASK
  ))
}

function stepsFromJourney(index) {
  return transferTaxTasks(index).map((task) => ({ stepKey: task.key, status: task.status }))
}

/**
 * Deterministic Phase 7 acceptance report for the transfer-tax workflow.
 * It uses the same shared-journey projection read by every role; it does not
 * read database rows or mutate a matter. A release check can therefore catch
 * a visibility or status-projection regression before a portal is exposed.
 */
export function buildTransferTaxCrossRoleAssurance({
  journey,
  transferTaxDecision = {},
  audiences = TRANSFER_TAX_CROSS_ROLE_AUDIENCES,
} = {}) {
  const blockers = []
  const requestedAudiences = [...new Set((Array.isArray(audiences) ? audiences : []).filter(Boolean))]
  const missingAudiences = TRANSFER_TAX_CROSS_ROLE_AUDIENCES.filter((audience) => !requestedAudiences.includes(audience))
  if (missingAudiences.length) {
    blockers.push(blocker(
      'TAX_ROLE_COVERAGE_MISSING',
      `Missing transfer-tax assurance coverage for: ${missingAudiences.join(', ')}.`,
      'Include attorney, developer, agent, buyer, and seller projections in the release check.',
    ))
  }

  const views = {}
  for (const audience of requestedAudiences) {
    try {
      views[audience] = presentSharedMatterJourney(journey, audience)
    } catch (error) {
      blockers.push(blocker(
        'TAX_SHARED_JOURNEY_UNAVAILABLE',
        `${audience} could not read the shared journey: ${error.message}`,
        'Restore the canonical shared-journey snapshot before releasing the workflow.',
      ))
    }
  }

  const attorneyTasks = taskIndex(views.attorney)
  const taxTasks = transferTaxTasks(attorneyTasks)
  if (!taxTasks.length) {
    blockers.push(blocker(
      'TAX_TASKS_ABSENT',
      'The transfer-tax workflow has no tasks in the attorney shared journey.',
      'Resolve the matter workflow plan before checking cross-role tax progress.',
    ))
  }

  for (const audience of requestedAudiences.filter((role) => views[role])) {
    const roleTasks = taskIndex(views[audience])
    for (const task of taxTasks) {
      const roleTask = roleTasks.get(`${task.laneKey}:${task.phaseKey}:${task.index}`)
      if (!roleTask) {
        blockers.push(blocker(
          'TAX_TASK_PROJECTION_MISSING',
          `${task.key} is missing from the ${audience} journey projection.`,
          'Project the canonical task key and status to every authorised role.',
        ))
        continue
      }
      if (roleTask.status !== task.status || roleTask.revision !== task.revision) {
        blockers.push(blocker(
          'TAX_TASK_SYNC_MISMATCH',
          `${task.key} differs between attorney and ${audience} (${task.status}/${task.revision} vs ${roleTask.status}/${roleTask.revision}).`,
          'Read every role view from the same canonical task status and revision.',
        ))
      }
    }
  }

  for (const clientRole of ['buyer', 'seller']) {
    const clientTasks = taskIndex(views[clientRole])
    for (const task of taxTasks) {
      const clientTask = clientTasks.get(`${task.laneKey}:${task.phaseKey}:${task.index}`)
      if (!clientTask) continue
      const definition = getAttorneyStageDefinition(task.key, 'transfer')
      const expectedLabel = definition.clientVisibleAllowed === false
        ? 'Transfer progress'
        : definition.sharedProgress?.client?.title || 'Transfer tax clearance'
      if (clientTask.label !== expectedLabel) {
        blockers.push(blocker(
          'TAX_CLIENT_LABEL_UNSAFE',
          `${task.key} exposes “${clientTask.label}” to the ${clientRole} portal instead of “${expectedLabel}”.`,
          'Use the task catalog client title or the generic Transfer progress label in client projections.',
        ))
      }
      if (CLIENT_SENSITIVE_TAX_TERMS.test(clientTask.label)) {
        blockers.push(blocker(
          'TAX_CLIENT_DETAIL_EXPOSED',
          `${task.key} exposes tax-route detail to the ${clientRole} portal.`,
          'Keep VAT, SARS, transfer-duty and withholding detail inside the professional workspace.',
        ))
      }
    }
  }

  const lodgementReadiness = evaluateTransferTaxLodgementReadiness({
    transferTaxDecision,
    steps: stepsFromJourney(attorneyTasks),
  })

  return {
    contract: 'arch9-transfer-tax-cross-role-assurance-v1',
    ready: blockers.length === 0,
    status: blockers.length ? 'ROLE_SYNC_BLOCKED' : 'ROLE_SYNC_READY',
    audiences: requestedAudiences,
    coveredTaskKeys: taxTasks.map((task) => task.key),
    views,
    lodgementReadiness,
    blockers,
  }
}
