import { formatCurrencyZAR } from './commercialProspectFormatters'
import { deriveCommercialCanvassingMetrics } from './commercialProspectFilters'

export { deriveCommercialCanvassingMetrics }

export function formatCommercialMetricValue(key, value) {
  if (key === 'pipelineValue') return formatCurrencyZAR(value)
  return String(Number(value || 0))
}

