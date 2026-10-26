import { HIGH_LEVEL_MILESTONES } from './highLevelJourneyRules.js'

const keys = new Set(HIGH_LEVEL_MILESTONES.map(item => item.id))
export function normaliseHistoricalMilestones(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid historical milestones.')
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (!keys.has(key) || !item || typeof item !== 'object' || Array.isArray(item) ||
      Object.keys(item).some(field => field !== 'completedOn') || !Object.hasOwn(item, 'completedOn')) {
      throw new Error('Invalid historical milestone.')
    }
    const date = item.completedOn
    if (date !== null && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date)) {
      throw new Error('Enter a valid milestone date.')
    }
    return [key, { completedOn: date }]
  }))
}

// Explicit historical confirmations never complete underlying tasks or infer earlier milestones.
export function applyHistoricalJourney(journey, history) {
  if (history?.version !== 1 || !Number.isSafeInteger(history.recordRevision) || history.recordRevision < 1) return journey
  let milestones
  try { milestones = normaliseHistoricalMilestones(history.milestones) } catch { return journey }
  return { ...journey, historicalJourney: { recordRevision: history.recordRevision, milestones },
    milestones: journey.milestones.map(item => Object.hasOwn(milestones, item.id)
      ? { ...item, status: 'complete', isComplete: true, historical: true, completedOn: milestones[item.id].completedOn }
      : item.isComplete ? item : { ...item, status: 'unknown', isComplete: false }) }
}
