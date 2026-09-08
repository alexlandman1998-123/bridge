// Phase 3 contract. Consumes resolved, authorised facts only; no writes, queries,
// dates-as-proof, stage-index completion or inferred legal applicability.
export const HIGH_LEVEL_JOURNEY_RULE_VERSION = 1
export const HIGH_LEVEL_MILESTONES = Object.freeze([
  { id: 'otp_signed', label: 'OTP', target: 'deal_setup' },
  { id: 'finance', label: 'Finance', target: 'finance' },
  { id: 'transfer', label: 'Transfer', target: 'transfer' },
  { id: 'lodgement', label: 'Lodged', target: 'transfer' },
  { id: 'registration', label: 'Registered', target: 'transfer' },
].map(Object.freeze))
const COMPLETE = new Set(['completed', 'complete', 'completed_externally'])
const KNOWN = new Set([...COMPLETE, 'not_started', 'pending', 'in_progress', 'waiting', 'blocked', 'not_applicable'])
const LEGAL_KEYS = Object.freeze({
  transfer: { ready: 'lodgement_ready', lodged: 'lodged_at_deeds_office', registered: 'registered' },
  bond: { ready: 'bond_lodgement_ready', lodged: 'bond_lodged', registered: 'bond_registered' },
  cancellation: { ready: 'cancellation_lodgement_ready', lodged: 'cancellation_lodged', registered: 'cancellation_registered' },
})
const FINANCE_KEYS = Object.freeze({
  cash: ['proof_of_funds_reviewed', 'cash_confirmation_approved'],
  bond: ['quote_approved', 'instruction_sent'],
  hybrid: ['cash_portion_confirmed', 'quote_approved', 'instruction_sent'],
})
function fact(rows, key, source) {
  const matches = (Array.isArray(rows) ? rows : []).filter(row => (row.key || row.stepKey) === key)
  return { key: `${source}:${key}`, status: matches.length === 1 ? matches[0].status : null }
}
function evaluate(facts, reason) {
  const unresolved = facts.filter(f => !KNOWN.has(f.status) || f.status === 'not_applicable')
  // These are explicit milestone confirmations, not an evidence checklist.
  // N/A cannot assert that signing, funding, lodgement or registration occurred.
  const status = !facts.length || unresolved.length ? 'unknown'
    : facts.some(f => f.status === 'blocked') ? 'blocked'
      : facts.every(f => COMPLETE.has(f.status)) ? 'complete'
        : facts.some(f => f.status === 'waiting') ? 'waiting'
          : facts.some(f => COMPLETE.has(f.status) || f.status === 'in_progress') ? 'in_progress' : 'pending'
  return { status, reason: status === 'unknown' ? `${reason}_UNCONFIRMED` : reason,
    sourceKeys: facts.map(f => f.key), missingSourceKeys: unresolved.map(f => f.key) }
}

/**
 * legalJourney is the shared reader result; requiredLaneKeys comes from the
 * resolved active plan, never from present rows. Legacy-derived workflow facts
 * must be excluded by the caller (pass factsAvailable:false).
 */
export function evaluateHighLevelJourney({ workflows = {}, financeType, legalJourney, requiredLaneKeys,
  factsAvailable = true, lifecycleState = '' } = {}) {
  const source = factsAvailable ? workflows : {}
  const otp = evaluate([fact(source.sales_otp?.requiredSteps, 'signed_otp_received', 'sales_otp')], 'SIGNED_OTP')
  const financeKeys = FINANCE_KEYS[financeType] || []
  const finance = evaluate(financeKeys.map(key => fact(source[`finance_${financeType}`]?.requiredSteps, key, `finance_${financeType}`)), 'FINANCE_ROUTE')
  const validPlan = Array.isArray(requiredLaneKeys) && requiredLaneKeys.includes('transfer') &&
    new Set(requiredLaneKeys).size === requiredLaneKeys.length && requiredLaneKeys.every(key => Object.hasOwn(LEGAL_KEYS,key))
  const lanes = legalJourney?.status === 'ready' ? legalJourney.snapshot?.lanes : null
  const legal = kind => {
    if (!validPlan || !Array.isArray(lanes)) return evaluate([], `LEGAL_${kind.toUpperCase()}`)
    return evaluate(requiredLaneKeys.map(key => {
      const matching = lanes.filter(l => l.key === key)
      const tasks = matching.length === 1 ? (matching[0].phases || []).flatMap(p => p.tasks || []) : []
      return fact(tasks, LEGAL_KEYS[key][kind], key)
    }), `LEGAL_${kind.toUpperCase()}`)
  }
  const values = [otp, finance, legal('ready'), legal('lodged'), legal('registered')]
  const milestones = HIGH_LEVEL_MILESTONES.map((m,i) => Object.freeze({ ...m, ...values[i], isComplete: values[i].status === 'complete' }))
  // Cancellation is context, not permission to mark untouched milestones done.
  return Object.freeze({ ruleVersion: HIGH_LEVEL_JOURNEY_RULE_VERSION,
    lifecycleState: ['cancelled','canceled','archived'].includes(lifecycleState) ? lifecycleState : 'active',
    milestones: Object.freeze(milestones),
    // Deliberately no overall percentage: weighting belongs to the later contract.
  })
}
