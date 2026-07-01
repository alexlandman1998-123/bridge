export const attorneyOpportunityData = {
  potentialMonthlyTransactions: 0,
  monthlyOpportunityValue: 0,
  confidenceScore: 0,
  marketShareVolume: 0,
  marketShareValue: 0,
  predictedRegistrations: 0,
  revenueForecast: 0,
  missedOpportunity: 0,
}

export const mockAgents = []
export const mockDevelopments = []
export const mockAreas = []

export const mockPartners = {
  topPartnerValue: 0,
  referralConcentration: 0,
  newPartnerMatches: 0,
  partnerGrowthPotential: 0,
  networkNodes: [],
  topCurrentPartners: [],
  missingHighValuePartners: [],
}

export const mockRevenueForecast = {
  currentMonthForecast: 0,
  next90Days: 0,
  pipelineCoverage: 0,
  revenueGap: 0,
  lineItems: [],
  funnel: [],
  recommendations: [],
}

export const attorneyIntelligenceNavItems = [
  { key: 'dashboard', label: 'Dashboard', to: '/attorney/intelligence/dashboard' },
  { key: 'opportunity_engine', label: 'Opportunity Engine', to: '/attorney/intelligence/opportunity-engine' },
  { key: 'partner_intelligence', label: 'Partner Intelligence', to: '/attorney/intelligence/partner-intelligence' },
  { key: 'market_position', label: 'Market Position', to: '/attorney/intelligence/market-position' },
  { key: 'revenue_forecast', label: 'Revenue Forecast', to: '/attorney/intelligence/revenue-forecast' },
]
