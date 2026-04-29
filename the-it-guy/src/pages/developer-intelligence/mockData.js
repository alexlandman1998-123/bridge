export const developerIntelligenceOverview = {
  marketShare: 6.8,
  revenueForecast: 38400000,
  activeDevelopments: 5,
  atRiskDeals: 9,
  opportunityValueMonthly: 2400000,
  potentialTransactionsMonthly: 64,
  confidenceScore: 87,
}

export const mockAgents = [
  {
    id: 'agent-melissa',
    name: 'Melissa van Rensburg',
    agency: 'Prime Residential',
    area: 'Pretoria East',
    activeListings: 25,
    involvementPercent: 0,
    opportunityValue: 480000,
    avatar: 'MV',
    listings: [
      { id: 'a1', title: '2 Bed Apartment', price: 'R1.35M', location: 'Pretoria East', status: 'No developer relationship' },
      { id: 'a2', title: '3 Bed Townhouse', price: 'R1.85M', location: 'Pretoria East', status: 'No developer relationship' },
      { id: 'a3', title: 'New Development Unit', price: 'R1.48M', location: 'Pretoria East', status: 'No developer relationship' },
    ],
  },
  {
    id: 'agent-jason',
    name: 'Jason Mokoena',
    agency: 'UrbanNest Realty',
    area: 'Boksburg',
    activeListings: 19,
    involvementPercent: 7,
    opportunityValue: 330000,
    avatar: 'JM',
  },
  {
    id: 'agent-carla',
    name: 'Carla Pretorius',
    agency: 'Platinum Property Co.',
    area: 'Midrand',
    activeListings: 17,
    involvementPercent: 12,
    opportunityValue: 280000,
    avatar: 'CP',
  },
]

export const mockDevelopments = [
  {
    id: 'dev-brookstone',
    name: 'Brookstone Heights',
    developer: 'Axis Property Group',
    area: 'Boksburg',
    units: 86,
    activeListings: 31,
    stage: 'Selling',
    opportunityValue: 620000,
    unitMix: [
      { label: '2-bed', percent: 48 },
      { label: '3-bed', percent: 36 },
      { label: 'Premium', percent: 16 },
    ],
  },
  {
    id: 'dev-ridge',
    name: 'The Ridge Estate',
    developer: 'Orion Living',
    area: 'Pretoria East',
    units: 64,
    activeListings: 24,
    stage: 'Pre-launch',
    opportunityValue: 390000,
    unitMix: [
      { label: '2-bed', percent: 52 },
      { label: '3-bed', percent: 34 },
      { label: 'Premium', percent: 14 },
    ],
  },
  {
    id: 'dev-willow',
    name: 'Willow Park',
    developer: 'Marble Homes',
    area: 'Midrand',
    units: 58,
    activeListings: 18,
    stage: 'Selling',
    opportunityValue: 310000,
    unitMix: [
      { label: '2-bed', percent: 44 },
      { label: '3-bed', percent: 42 },
      { label: 'Premium', percent: 14 },
    ],
  },
]

export const mockAreas = [
  {
    id: 'pretoria-east',
    name: 'Pretoria East',
    listings: 142,
    marketShare: 2.1,
    heat: 94,
    opportunityValue: 740000,
    level: 'High',
    suburbs: ['Silver Lakes', 'Moreleta Park', 'Faerie Glen', 'Olympus'],
  },
  {
    id: 'boksburg',
    name: 'Boksburg',
    listings: 121,
    marketShare: 5.2,
    heat: 76,
    opportunityValue: 520000,
    level: 'Strong',
    suburbs: ['Sunward Park', 'Beyers Park', 'Bartlett', 'Parkrand'],
  },
  {
    id: 'midrand',
    name: 'Midrand',
    listings: 104,
    marketShare: 3.4,
    heat: 63,
    opportunityValue: 380000,
    level: 'Emerging',
    suburbs: ['Waterfall', 'Noordwyk', 'Kyalami', 'Carlswald'],
  },
  {
    id: 'centurion',
    name: 'Centurion',
    listings: 98,
    marketShare: 4.9,
    heat: 69,
    opportunityValue: 360000,
    level: 'Stable',
    suburbs: ['Irene', 'Eldoraigne', 'Rooihuiskraal', 'Amberfield'],
  },
]

export const feasibilityScenario = {
  area: 'Pretoria East',
  landSize: '4,200m²',
  projectType: 'Residential',
  estimatedUnits: 48,
  score: 82,
  label: 'Strong Opportunity',
  confidenceScore: 89,
  marketBehaviour: [
    { text: '2-bed units under R1.35M are converting 34% faster', trend: 'up' },
    { text: 'Deals above R1.6M showing 28% fall-through rate', trend: 'down' },
    { text: 'Buyer affordability tightening in last 30 days', trend: 'down' },
  ],
  demandSupply: [
    { label: '2-bed units', state: 'High demand / Low supply', percent: 92 },
    { label: '3-bed units', state: 'Stable demand / Moderate supply', percent: 64 },
    { label: 'Luxury units', state: 'Oversupplied / Slowing conversion', percent: 28 },
  ],
  pricing: {
    optimalRange: 'R1.25M – R1.4M',
    planned: 'R1.5M',
    adjustment: '-5%',
  },
  projection: {
    revenue: 62400000,
    absorption: '6–8 units / month',
    sellOut: '7 months',
    conversion: '68%',
  },
  risks: [
    'No bulk services detected — add infrastructure cost',
    'Overexposure to bond-dependent buyers',
    'Pricing above current absorption threshold',
  ],
  recommendations: [
    'Reduce pricing by 4–6% to improve conversion',
    'Increase allocation of 2-bed units by 20%',
    'Phase release to prioritise smaller units',
    'Consider alternative segment for Phase 2',
  ],
}

export const marketDemandData = {
  unitTypePerformance: [
    { label: '2-bed apartments', demand: 92, conversion: 78 },
    { label: '3-bed townhouses', demand: 68, conversion: 61 },
    { label: 'Studio / 1-bed', demand: 56, conversion: 54 },
    { label: 'Luxury 4-bed+', demand: 31, conversion: 29 },
  ],
  priceBands: [
    { label: 'R850k – R1.2M', demand: 74, velocity: 'Fast' },
    { label: 'R1.2M – R1.5M', demand: 88, velocity: 'Very Fast' },
    { label: 'R1.5M – R1.8M', demand: 52, velocity: 'Moderate' },
    { label: 'R1.8M+', demand: 27, velocity: 'Slow' },
  ],
  affordability: [
    { label: 'Cash-ready buyers', percent: 34 },
    { label: 'Bond-approved buyers', percent: 46 },
    { label: 'Stretch affordability', percent: 20 },
  ],
}

export const pricingSimulator = {
  scenarios: [
    { name: 'Current plan', adjustment: '0%', conversion: '62%', sellOut: '9.2 months', revenue: 61400000, risk: 'Moderate' },
    { name: 'Recommended', adjustment: '-5%', conversion: '68%', sellOut: '7.0 months', revenue: 62400000, risk: 'Low' },
    { name: 'Aggressive', adjustment: '+4%', conversion: '53%', sellOut: '11.4 months', revenue: 60700000, risk: 'High' },
  ],
}

export const portfolioPerformance = {
  developments: [
    { name: 'Brookstone Heights', sellThrough: 64, forecast: 58, risk: 'Low', stage: 'Selling' },
    { name: 'The Ridge Estate', sellThrough: 31, forecast: 42, risk: 'Medium', stage: 'Pre-launch' },
    { name: 'Willow Park', sellThrough: 48, forecast: 46, risk: 'Low', stage: 'Selling' },
    { name: 'Vantage Point', sellThrough: 22, forecast: 35, risk: 'High', stage: 'Launch' },
    { name: 'Cedar Gate', sellThrough: 37, forecast: 40, risk: 'Medium', stage: 'Selling' },
  ],
}

export const growthNetwork = {
  topAgents: [
    { name: 'Melissa van Rensburg', value: 480000, volume: 12, avatar: 'MV' },
    { name: 'Jason Mokoena', value: 330000, volume: 9, avatar: 'JM' },
    { name: 'Carla Pretorius', value: 280000, volume: 8, avatar: 'CP' },
  ],
  topOriginators: [
    { name: 'Bridge Bond Desk', approvalRate: '92%', avgApprovalDays: 11, value: 520000 },
    { name: 'Summit Originators', approvalRate: '88%', avgApprovalDays: 14, value: 410000 },
    { name: 'Velocity Finance', approvalRate: '85%', avgApprovalDays: 15, value: 360000 },
  ],
  recommendedPartners: [
    { name: 'Prime Residential', reason: 'High listing concentration in Pretoria East', score: 95 },
    { name: 'Axis Property Group', reason: 'Growing mid-market unit release schedule', score: 91 },
    { name: 'UrbanNest Realty', reason: 'Strong conversion in Boksburg corridor', score: 86 },
  ],
}
