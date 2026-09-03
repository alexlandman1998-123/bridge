const HOME_SEEKERS_DEMO_PROFILE = Object.freeze({
  id: 'home-seekers',
  name: 'Home Seekers',
  type: 'agency',
  demoOnly: true,
  workspaceId: 'home-seekers',
  businessLines: Object.freeze(['sales', 'rentals']),
  profile: Object.freeze({
    id: 'home-seekers-principal',
    email: 'alex.homeseekers.training@arch9.test',
    fullName: 'Home Seekers Principal',
    firstName: 'Home',
    lastName: 'Seekers',
    companyName: 'Home Seekers',
    role: 'agent',
    systemRole: 'agent',
    onboardingCompleted: true,
  }),
  seedData: Object.freeze({
    seedKey: 'home-seekers-demo-seed-v1',
    sourceScripts: Object.freeze([
      'scripts/agencyDemoBootstrap.mjs',
      'scripts/seed-agency-demo-transactions.mjs',
      'scripts/seed-agency-demo-listing-images.mjs',
    ]),
    branches: Object.freeze(['Cape Town CBD', 'Southern Suburbs']),
    listings: Object.freeze([
      Object.freeze({
        id: 'home-seekers-listing-116-ridge-road',
        title: '116 Ridge Road',
        addressLine1: '116 Ridge Road',
        suburb: 'Sea Point',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8005',
        askingPrice: 3125000,
        propertyType: 'House',
      }),
      Object.freeze({
        id: 'home-seekers-listing-117-ridge-road',
        title: '117 Ridge Road',
        addressLine1: '117 Ridge Road',
        suburb: 'Sea Point',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8005',
        askingPrice: 4850000,
        propertyType: 'House',
      }),
      Object.freeze({
        id: 'home-seekers-listing-constantia',
        title: '18 Constantia Road',
        addressLine1: '18 Constantia Road',
        suburb: 'Constantia',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '7806',
        askingPrice: 6250000,
        propertyType: 'House',
      }),
      Object.freeze({
        id: 'home-seekers-listing-woodstock',
        title: '12 Woodstock Street',
        addressLine1: '12 Woodstock Street',
        suburb: 'Woodstock',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '7925',
        askingPrice: 2650000,
        propertyType: 'Apartment',
      }),
    ]),
    team: Object.freeze([
      Object.freeze({ id: 'home-seekers-principal', name: 'Home Seekers Principal', role: 'principal' }),
      Object.freeze({ id: 'home-seekers-branch-manager', name: 'Home Seekers Branch Manager', role: 'branch_manager' }),
      Object.freeze({ id: 'home-seekers-agent', name: 'Home Seekers Agent', role: 'agent' }),
      Object.freeze({ id: 'home-seekers-admin', name: 'Home Seekers Admin', role: 'admin_staff' }),
    ]),
    clients: Object.freeze([
      Object.freeze({ id: 'home-seekers-buyer', name: 'Naledi Khumalo', role: 'buyer' }),
      Object.freeze({ id: 'home-seekers-seller', name: 'Andre van Rensburg', role: 'seller' }),
    ]),
    demoScenarios: Object.freeze([
      'Sea Point transfer in progress',
      'Constantia family home lodged',
      'Woodstock buyer finance pending',
    ]),
  }),
})

// Keep each demo agency in its own organisation.  The transaction seeder uses
// this catalogue to create an isolated principal login and the complete agency
// showcase dataset for that login.
const ORIPROP_DEMO_PROFILE = Object.freeze({
  id: 'oriprop',
  name: 'Oriprops',
  type: 'agency',
  demoOnly: true,
  workspaceId: 'oriprop',
  businessLines: Object.freeze(['sales', 'rentals']),
  profile: Object.freeze({
    id: 'oriprop-principal',
    email: 'oriprop.demo@oriprops.demo',
    fullName: 'Oriprops Principal',
    firstName: 'Oriprops',
    lastName: 'Principal',
    companyName: 'Oriprops',
    role: 'agent',
    systemRole: 'agent',
    onboardingCompleted: true,
  }),
  seedData: Object.freeze({
    seedKey: 'oriprop-demo-seed-v1',
    sourceScripts: Object.freeze([
      'scripts/agencyDemoBootstrap.mjs',
      'scripts/seed-agency-demo-transactions.mjs',
      'scripts/seed-agency-demo-listing-images.mjs',
    ]),
    branches: Object.freeze(['Cape Town CBD', 'Southern Suburbs']),
    // The shared agency seed scenarios resolve these listings by title.
    listings: HOME_SEEKERS_DEMO_PROFILE.seedData.listings,
    team: HOME_SEEKERS_DEMO_PROFILE.seedData.team,
    clients: HOME_SEEKERS_DEMO_PROFILE.seedData.clients,
    demoScenarios: HOME_SEEKERS_DEMO_PROFILE.seedData.demoScenarios,
  }),
})

export const DEMO_ENVIRONMENT_DOMAINS = Object.freeze({
  'home-seekers': Object.freeze(['homeseekers.demo.local', 'home-seekers.demo.local']),
  oriprop: Object.freeze(['oriprop.demo.local']),
})

export const DEMO_ACCOUNTS = Object.freeze([HOME_SEEKERS_DEMO_PROFILE, ORIPROP_DEMO_PROFILE])

export const DEMO_SEED_MANIFEST = Object.freeze([
  Object.freeze({
    id: 'home-seekers-seed-manifest',
    environment: 'demo',
    demoKey: 'home-seekers-agency-seed-v1',
    accountId: HOME_SEEKERS_DEMO_PROFILE.id,
    accountName: HOME_SEEKERS_DEMO_PROFILE.name,
    status: 'ready',
    seedKey: HOME_SEEKERS_DEMO_PROFILE.seedData.seedKey,
    summary:
      'Agency demo seed covering principal, branch manager, agent, admin staff, branches, leads, listings, appointments, transactions, and clients.',
    sourceScripts: HOME_SEEKERS_DEMO_PROFILE.seedData.sourceScripts,
  }),
  Object.freeze({
    id: 'oriprop-seed-manifest',
    environment: 'demo',
    demoKey: 'oriprop-agency-seed-v1',
    accountId: ORIPROP_DEMO_PROFILE.id,
    accountName: ORIPROP_DEMO_PROFILE.name,
    status: 'ready',
    seedKey: ORIPROP_DEMO_PROFILE.seedData.seedKey,
    summary:
      'Agency demo seed covering principal, branch manager, agent, admin staff, branches, leads, listings, appointments, transactions, and clients.',
    sourceScripts: ORIPROP_DEMO_PROFILE.seedData.sourceScripts,
  }),
])

export const DEMO_FLOWS = Object.freeze([
  Object.freeze({
    id: 'home-seekers-sales-flow',
    accountId: HOME_SEEKERS_DEMO_PROFILE.id,
    label: 'Home Seekers sales demo',
    workspaceId: HOME_SEEKERS_DEMO_PROFILE.workspaceId,
    route: '/dashboard',
    status: 'ready',
    description: 'Walk the principal through sales leads, listings, appointments, and transactions.',
  }),
  Object.freeze({
    id: 'home-seekers-rentals-flow',
    accountId: HOME_SEEKERS_DEMO_PROFILE.id,
    label: 'Home Seekers rentals demo',
    workspaceId: HOME_SEEKERS_DEMO_PROFILE.workspaceId,
    route: '/rentals',
    status: 'ready',
    description: 'Show the rentals side of the agency with candidate tenants and lease progression.',
  }),
  Object.freeze({
    id: 'oriprop-sales-flow',
    accountId: ORIPROP_DEMO_PROFILE.id,
    label: 'Oriprops sales demo',
    workspaceId: ORIPROP_DEMO_PROFILE.workspaceId,
    route: '/dashboard',
    status: 'ready',
    description: 'Walk the Oriprops principal through sales leads, listings, appointments, and transactions.',
  }),
  Object.freeze({
    id: 'oriprop-rentals-flow',
    accountId: ORIPROP_DEMO_PROFILE.id,
    label: 'Oriprops rentals demo',
    workspaceId: ORIPROP_DEMO_PROFILE.workspaceId,
    route: '/rentals',
    status: 'ready',
    description: 'Show the rentals side of the Oriprops agency with candidate tenants and lease progression.',
  }),
])
