export const DEMO_ENVIRONMENT_DOMAINS = Object.freeze({
  demo: 'demo.bridge9.io',
  staging: 'staging.bridge9.io',
})

export const DEMO_ACCOUNTS = Object.freeze([
  { key: 'agency_principal', workspaceType: 'agency', role: 'principal', email: 'principal.demo@bridgenine.co.za', purpose: 'Bridge9 Realty principal demo' },
  { key: 'bridge9_agency_agent', workspaceType: 'agency', role: 'agent', email: 'lerato.mokoena@bridgenine.co.za', purpose: 'Bridge9 Realty senior agent demo' },
  { key: 'bridge9_agency_admin', workspaceType: 'agency', role: 'admin', email: 'nandi.khumalo@bridgenine.co.za', purpose: 'Bridge9 Realty coordinator demo' },
  { key: 'agency_branch_manager', workspaceType: 'agency', role: 'branch_manager', email: 'agency.branch@demo.bridge9.io', purpose: 'Agency branch management demo' },
  { key: 'agency_agent', workspaceType: 'agency', role: 'agent', email: 'agency.agent@demo.bridge9.io', purpose: 'Assigned-only agent demo' },
  { key: 'agency_admin', workspaceType: 'agency', role: 'admin_staff', email: 'agency.admin@demo.bridge9.io', purpose: 'Agency admin staff demo' },
  { key: 'developer_owner', workspaceType: 'developer_company', role: 'owner', email: 'developer.owner@demo.bridge9.io', purpose: 'Developer owner demo' },
  { key: 'developer_sales', workspaceType: 'developer_company', role: 'sales_agent', email: 'developer.sales@demo.bridge9.io', purpose: 'Developer sales pipeline demo' },
  { key: 'attorney_partner', workspaceType: 'attorney_firm', role: 'partner', email: 'attorney.partner@demo.bridge9.io', purpose: 'Attorney partner demo' },
  { key: 'attorney_conveyancer', workspaceType: 'attorney_firm', role: 'conveyancer', email: 'attorney.conveyancer@demo.bridge9.io', purpose: 'Conveyancer workflow demo' },
  { key: 'bond_owner', workspaceType: 'bond_originator', role: 'owner', email: 'bond.owner@demo.bridge9.io', purpose: 'Bond originator owner demo' },
  { key: 'bond_consultant', workspaceType: 'bond_originator', role: 'consultant', email: 'bond.consultant@demo.bridge9.io', purpose: 'Assigned bond consultant demo' },
  { key: 'client_buyer', workspaceType: 'client', role: 'client', email: 'buyer.client@demo.bridge9.io', purpose: 'Buyer portal demo' },
  { key: 'client_seller', workspaceType: 'client', role: 'client', email: 'seller.client@demo.bridge9.io', purpose: 'Seller portal demo' },
])

export const DEMO_SEED_MANIFEST = Object.freeze([
  {
    key: 'bridge9_principal_demo',
    workspaceType: 'agency',
    ownerAccount: 'agency_principal',
    seedScripts: ['supabase/seed/reset-bridge9-principal-demo-data.sql', 'supabase/seed/seed-bridge9-principal-demo-data.sql'],
    expectedRecords: {
      branches: 4,
      users: 10,
      canvassingRecords: 120,
      buyerLeads: 160,
      sellerProspects: 120,
      listings: 45,
      appointments: 22,
      transactions: 22,
      heroTransactions: 1,
      documentsMinimum: 88,
      activityEventsMinimum: 500,
    },
  },
  {
    key: 'agency_demo',
    workspaceType: 'agency',
    ownerAccount: 'agency_principal',
    expectedRecords: {
      branches: 4,
      users: 10,
      leads: 280,
      listings: 45,
      appointments: 22,
      transactions: 22,
      clients: 280,
    },
  },
  {
    key: 'developer_demo',
    workspaceType: 'developer_company',
    ownerAccount: 'developer_owner',
    expectedRecords: {
      users: 3,
      developments: 3,
      units: 18,
      transactions: 8,
      reports: 3,
    },
  },
  {
    key: 'attorney_demo',
    workspaceType: 'attorney_firm',
    ownerAccount: 'attorney_partner',
    seedScripts: ['supabase/seed/reset-dalawyer-demo-data.sql', 'supabase/seed/seed-dalawyer-demo-data.sql'],
    expectedRecords: {
      users: 3,
      matters: 15,
      departments: 3,
      signingAppointments: 5,
      documentRequests: 20,
    },
  },
  {
    key: 'bond_demo',
    workspaceType: 'bond_originator',
    ownerAccount: 'bond_owner',
    expectedRecords: {
      users: 3,
      applications: 10,
      bankWorkflows: 5,
      financeStatuses: 10,
    },
  },
  {
    key: 'client_demo',
    workspaceType: 'client',
    ownerAccount: 'client_buyer',
    expectedRecords: {
      buyerPortals: 1,
      sellerPortals: 1,
      transactions: 2,
      uploadRequests: 8,
    },
  },
])

export const DEMO_FLOWS = Object.freeze([
  { key: 'agency', title: 'Bridge9 Realty Principal Demo', steps: ['Principal dashboard', 'Canvassing', 'Leads', 'Listings', 'Transactions', 'Client portal'] },
  { key: 'developer', title: 'Developer Demo', steps: ['Developments', 'Units', 'Sales pipeline', 'Reporting'] },
  { key: 'attorney', title: 'Attorney Demo', steps: ['Matters', 'Transfer workflow', 'Document requests', 'Signing appointments'] },
  { key: 'bond', title: 'Bond Demo', steps: ['Applications', 'Bank submission', 'Consultant assignment', 'Finance statuses'] },
  { key: 'client', title: 'Client Demo', steps: ['Portal access', 'Document uploads', 'Progress tracking', 'Comment thread'] },
])
