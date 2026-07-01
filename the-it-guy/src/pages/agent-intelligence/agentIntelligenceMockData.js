export const agentIntelligenceMockData = {
  sharedFilters: {
    dateRange: '',
    area: '',
    listingScope: '',
  },
  overview: {
    kpis: [],
    nextBestActions: [],
    marketSnapshot: [],
    pipelineHealth: [],
  },
  opportunities: {
    scoreCards: [],
    underexposedAreas: [],
    lostInsights: [],
  },
  market: {
    position: [],
    marketShareVisual: [],
    buyerDemographics: [],
    buyerAges: [],
    propertyTypeDemand: [],
    priceBandDemand: [],
  },
  pricing: {
    assistant: {
      inputs: {},
      output: {
        range: '',
        buyerInterest: '',
        timeOnMarket: '',
        confidence: 0,
      },
    },
    priceBandPerformance: [],
    listingVsSelling: [],
    warnings: [],
  },
  pipeline: {
    stages: [],
    dealsByStage: [],
    stalledDeals: [],
    bottlenecks: [],
  },
  performance: {
    kpis: [],
    byArea: [],
    byLeadSource: [],
    earningsProjection: {
      current: 0,
      improved: 0,
      uplift: 0,
    },
    strengths: [],
    weaknesses: [],
  },
  network: {
    kpis: [],
    bondOriginators: [],
    attorneys: [],
    referralSources: [],
    insights: [],
  },
}
