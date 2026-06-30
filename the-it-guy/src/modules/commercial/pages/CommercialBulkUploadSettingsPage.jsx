import { AlertCircle, CheckCircle2, DatabaseZap, Download, FileClock, Save, Settings2, UploadCloud } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchOrganisationSettings, updateWorkflowSettings } from '../../../lib/settingsApi'
import { approveCommercialImportBatch, commitCommercialImportBatch, createCommercialImportBatch, createCommercialImportRows, findCommercialImportExistingDuplicates, getCommercialImportBatch, listCommercialImportBatches, prepareCommercialImportRetry, updateCommercialImportBatch, updateCommercialImportRow } from '../services/commercialImportApi'

const RECORD_TYPE_OPTIONS = [
  { value: 'vacancies', label: 'Vacancies', description: 'Commercial vacancy schedules and unit availability.' },
  { value: 'leads', label: 'Leads / Requirements', description: 'Tenant or buyer demand records used by the pipeline.' },
  { value: 'canvassing_seller_prospects', label: 'Seller Canvassing Prospects', description: 'Sales-side owners and disposal mandate prospects.' },
  { value: 'canvassing_buyer_prospects', label: 'Buyer Canvassing Prospects', description: 'Investor and owner-occupier acquisition prospects.' },
  { value: 'canvassing_landlord_prospects', label: 'Landlord Canvassing Prospects', description: 'Supply-side landlord targets and portfolio prospects.' },
  { value: 'canvassing_tenant_prospects', label: 'Tenant Canvassing Prospects', description: 'Demand-side occupier targets and tenant prospects.' },
  { value: 'properties', label: 'Properties', description: 'Property anchors used by vacancies and listings.' },
  { value: 'landlords', label: 'Landlords', description: 'Portfolio owners and landlord organisations.' },
  { value: 'companies', label: 'Companies', description: 'Commercial account records for tenants, buyers, funds, and counterparties.' },
  { value: 'contacts', label: 'Contacts', description: 'Decision makers, asset managers, property managers, and tenant reps.' },
  { value: 'listings', label: 'Listings', description: 'Market-ready commercial sale or lease opportunities.' },
]

const COMMIT_ENABLED_RECORD_TYPES = new Set([
  'vacancies',
  'leads',
  'canvassing_seller_prospects',
  'canvassing_buyer_prospects',
  'canvassing_landlord_prospects',
  'canvassing_tenant_prospects',
  'properties',
  'landlords',
  'companies',
  'contacts',
  'listings',
])

const DEFAULT_BULK_UPLOAD_SETTINGS = {
  enabled: true,
  allowedRecordTypes: [
    'vacancies',
    'leads',
    'canvassing_seller_prospects',
    'canvassing_buyer_prospects',
    'canvassing_landlord_prospects',
    'canvassing_tenant_prospects',
    'properties',
    'landlords',
    'companies',
    'contacts',
    'listings',
  ],
  requireManagerApproval: true,
  duplicateStrategy: 'review',
  defaultOwnerMode: 'uploading_broker',
  maxRowsPerUpload: 1000,
  documentUploadsEnabled: false,
}

const DUPLICATE_STRATEGIES = [
  { value: 'review', label: 'Review duplicates' },
  { value: 'skip', label: 'Skip duplicates' },
  { value: 'update', label: 'Update matching records' },
]

const OWNER_MODES = [
  { value: 'uploading_broker', label: 'Uploading broker' },
  { value: 'selected_broker', label: 'Selected broker' },
  { value: 'unassigned', label: 'Leave unassigned' },
]

const TEMPLATE_DEFINITIONS = {
  vacancies: {
    headers: ['Vacancy Name', 'Property Name', 'Landlord Name', 'Unit Or Floor', 'Available Area M2', 'Asking Rental', 'Availability Date', 'Broker Email', 'Notes'],
    sample: ['Block A Vacancy', 'Oxford Parks Office', 'Growthpoint', '3rd Floor', '450', '185', '2026-08-01', 'broker@example.com', 'White box office space'],
  },
  leads: {
    headers: ['Requirement Name', 'Lead Type', 'Company Name', 'Contact Name', 'Email', 'Phone', 'Property Type', 'Preferred Locations', 'Min Size M2', 'Max Size M2', 'Budget Min', 'Budget Max', 'Target Occupation Date', 'Broker Email', 'Notes'],
    sample: ['Industrial tenant requirement', 'tenant', 'Acme Logistics', 'Jane Smith', 'jane@example.com', '011 555 0101', 'industrial', 'Midrand; Linbro Park', '800', '1200', '85000', '130000', '2026-09-01', 'broker@example.com', 'Needs yard access'],
  },
  canvassing_seller_prospects: {
    headers: ['Company Name', 'Contact Name', 'Email', 'Phone', 'Area', 'Property Type', 'Deal Type', 'Canvassing Method', 'Status', 'Next Follow Up Date', 'Follow Up Priority', 'Broker Email', 'Notes'],
    sample: ['Urban Owner Co', 'Anele Dlamini', 'anele@example.com', '084 555 0101', 'Cape Town CBD', 'office', 'sale', 'Cold Call', 'New', '2026-07-20', 'High', 'broker@example.com', 'Potential disposal mandate'],
  },
  canvassing_buyer_prospects: {
    headers: ['Company Name', 'Contact Name', 'Email', 'Phone', 'Area', 'Property Type', 'Deal Type', 'Canvassing Method', 'Status', 'Next Follow Up Date', 'Follow Up Priority', 'Broker Email', 'Notes'],
    sample: ['Prime Capital', 'Michael Naidoo', 'michael@example.com', '081 555 0101', 'Edenvale', 'industrial', 'sale', 'Email', 'New', '2026-07-22', 'Medium', 'broker@example.com', 'Looking for income-producing assets'],
  },
  canvassing_landlord_prospects: {
    headers: ['Company Name', 'Contact Name', 'Email', 'Phone', 'Area', 'Property Type', 'Canvassing Method', 'Status', 'Next Follow Up Date', 'Follow Up Priority', 'Broker Email', 'Notes'],
    sample: ['Metro Property Fund', 'Sipho Mokoena', 'sipho@example.com', '082 555 0101', 'Sandton', 'office', 'Cold Call', 'New', '2026-07-15', 'High', 'broker@example.com', 'Potential office portfolio'],
  },
  canvassing_tenant_prospects: {
    headers: ['Company Name', 'Contact Name', 'Email', 'Phone', 'Area', 'Property Type', 'Deal Type', 'Canvassing Method', 'Status', 'Next Follow Up Date', 'Follow Up Priority', 'Broker Email', 'Notes'],
    sample: ['Northstar Retail', 'Aisha Patel', 'aisha@example.com', '083 555 0101', 'Rosebank', 'retail', 'lease', 'Email', 'New', '2026-07-18', 'Medium', 'broker@example.com', 'Expansion prospect'],
  },
  properties: {
    headers: ['Property Name', 'Landlord Name', 'Property Type', 'Address', 'Suburb', 'City', 'Province', 'GLA M2', 'Available Space M2', 'Asking Rental Per M2', 'Asking Sale Price', 'Broker Email', 'Notes'],
    sample: ['Oxford Parks Office', 'Growthpoint', 'office', '199 Oxford Road', 'Rosebank', 'Johannesburg', 'Gauteng', '12000', '450', '185', '', 'broker@example.com', 'Premium office building'],
  },
  landlords: {
    headers: ['Landlord Name', 'Legal Name', 'Entity Type', 'Registration Number', 'Email', 'Phone', 'Website', 'Address', 'Portfolio Type', 'Broker Email', 'Notes'],
    sample: ['Growthpoint', 'Growthpoint Properties Limited', 'company', '1997/008215/06', 'leasing@example.com', '011 944 6000', 'https://example.com', 'Sandton', 'fund', 'broker@example.com', 'Listed landlord'],
  },
  companies: {
    headers: ['Company Name', 'Company Type', 'Industry', 'Website', 'Registration Number', 'VAT Number', 'Email', 'Phone', 'Address', 'City', 'Province', 'Broker Email', 'Notes'],
    sample: ['Acme Logistics', 'tenant', 'Logistics', 'https://example.com', '2020/123456/07', '4123456789', 'info@example.com', '011 555 0101', '1 Main Road', 'Johannesburg', 'Gauteng', 'broker@example.com', 'Warehouse occupier'],
  },
  contacts: {
    headers: ['Company Name', 'First Name', 'Last Name', 'Job Title', 'Email', 'Phone', 'Mobile', 'Decision Maker', 'Primary Contact', 'Broker Email', 'Notes'],
    sample: ['Acme Logistics', 'Jane', 'Smith', 'Operations Director', 'jane@example.com', '011 555 0101', '082 555 0101', 'yes', 'yes', 'broker@example.com', 'Primary decision maker'],
  },
  listings: {
    headers: ['Listing Title', 'Listing Type', 'Listing Category', 'Property Name', 'Vacancy Name', 'Landlord Name', 'Description', 'Pricing', 'Available From', 'Broker Email', 'Notes'],
    sample: ['450m2 Office To Let', 'lease', 'office', 'Oxford Parks Office', 'Block A Vacancy', 'Growthpoint', 'Fitted office opportunity', 'R185/m2', '2026-08-01', 'broker@example.com', 'Market-ready listing'],
  },
}

const FIELD_DEFINITIONS = {
  vacancies: [
    { key: 'vacancy_name', label: 'Vacancy Name', type: 'text', required: true, aliases: ['vacancy name', 'vacancy', 'unit name'] },
    { key: 'property_name', label: 'Property Name', type: 'text', required: true, relationship: true, aliases: ['property name', 'property', 'building'] },
    { key: 'landlord_name', label: 'Landlord Name', type: 'text', relationship: true, aliases: ['landlord name', 'landlord', 'owner'] },
    { key: 'unit_or_floor', label: 'Unit Or Floor', type: 'text', aliases: ['unit or floor', 'unit', 'floor'] },
    { key: 'available_area_m2', label: 'Available Area M2', type: 'number', required: true, aliases: ['available area m2', 'available area', 'area', 'sqm', 'm2'] },
    { key: 'asking_rental', label: 'Asking Rental', type: 'number', aliases: ['asking rental', 'rental', 'rental per m2', 'asking rent'] },
    { key: 'availability_date', label: 'Availability Date', type: 'date', aliases: ['availability date', 'available from', 'occupation date'] },
    { key: 'broker_email', label: 'Broker Email', type: 'email', aliases: ['broker email', 'owner email', 'agent email'] },
    { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'comments'] },
  ],
  leads: [
    { key: 'requirement_name', label: 'Requirement Name', type: 'text', required: true, aliases: ['requirement name', 'lead name', 'lead', 'opportunity'] },
    { key: 'lead_type', label: 'Lead Type', type: 'enum', options: ['tenant', 'buyer', 'landlord', 'seller'], aliases: ['lead type', 'client type', 'role'] },
    { key: 'company_name', label: 'Company Name', type: 'text', relationship: true, aliases: ['company name', 'company', 'tenant', 'buyer'] },
    { key: 'contact_name', label: 'Contact Name', type: 'text', aliases: ['contact name', 'contact', 'person'] },
    { key: 'email', label: 'Email', type: 'email', aliases: ['email', 'email address'] },
    { key: 'phone', label: 'Phone', type: 'text', aliases: ['phone', 'mobile', 'telephone'] },
    { key: 'property_type', label: 'Property Type', type: 'text', aliases: ['property type', 'asset type'] },
    { key: 'preferred_locations', label: 'Preferred Locations', type: 'text', required: true, aliases: ['preferred locations', 'locations', 'areas', 'area'] },
    { key: 'min_size_m2', label: 'Min Size M2', type: 'number', aliases: ['min size m2', 'min size', 'minimum size'] },
    { key: 'max_size_m2', label: 'Max Size M2', type: 'number', aliases: ['max size m2', 'max size', 'maximum size'] },
    { key: 'budget_min', label: 'Budget Min', type: 'number', aliases: ['budget min', 'min budget'] },
    { key: 'budget_max', label: 'Budget Max', type: 'number', aliases: ['budget max', 'max budget'] },
    { key: 'target_occupation_date', label: 'Target Occupation Date', type: 'date', aliases: ['target occupation date', 'occupation date', 'move date'] },
    { key: 'broker_email', label: 'Broker Email', type: 'email', aliases: ['broker email', 'owner email', 'agent email'] },
    { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'comments'] },
  ],
  canvassing_seller_prospects: [
    { key: 'company_name', label: 'Company Name', type: 'text', required: true, aliases: ['company name', 'company', 'seller', 'owner'] },
    { key: 'contact_name', label: 'Contact Name', type: 'text', aliases: ['contact name', 'contact', 'person'] },
    { key: 'email', label: 'Email', type: 'email', aliases: ['email', 'email address'] },
    { key: 'phone', label: 'Phone', type: 'text', aliases: ['phone', 'mobile', 'telephone'] },
    { key: 'area', label: 'Area', type: 'text', required: true, aliases: ['area', 'location', 'suburb'] },
    { key: 'property_type', label: 'Property Type', type: 'text', aliases: ['property type', 'asset type'] },
    { key: 'deal_type', label: 'Deal Type', type: 'enum', options: ['sale', 'lease'], aliases: ['deal type', 'transaction type'] },
    { key: 'canvassing_method', label: 'Canvassing Method', type: 'text', aliases: ['canvassing method', 'source', 'method'] },
    { key: 'status', label: 'Status', type: 'text', aliases: ['status', 'stage'] },
    { key: 'next_follow_up_date', label: 'Next Follow Up Date', type: 'date', aliases: ['next follow up date', 'follow up date', 'next action date'] },
    { key: 'follow_up_priority', label: 'Follow Up Priority', type: 'enum', options: ['low', 'medium', 'high', 'urgent'], aliases: ['follow up priority', 'priority'] },
    { key: 'broker_email', label: 'Broker Email', type: 'email', aliases: ['broker email', 'owner email', 'agent email'] },
    { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'comments'] },
  ],
  canvassing_buyer_prospects: [
    { key: 'company_name', label: 'Company Name', type: 'text', required: true, aliases: ['company name', 'company', 'buyer', 'investor'] },
    { key: 'contact_name', label: 'Contact Name', type: 'text', aliases: ['contact name', 'contact', 'person'] },
    { key: 'email', label: 'Email', type: 'email', aliases: ['email', 'email address'] },
    { key: 'phone', label: 'Phone', type: 'text', aliases: ['phone', 'mobile', 'telephone'] },
    { key: 'area', label: 'Area', type: 'text', required: true, aliases: ['area', 'location', 'suburb'] },
    { key: 'property_type', label: 'Property Type', type: 'text', aliases: ['property type', 'asset type'] },
    { key: 'deal_type', label: 'Deal Type', type: 'enum', options: ['sale', 'lease'], aliases: ['deal type', 'transaction type'] },
    { key: 'canvassing_method', label: 'Canvassing Method', type: 'text', aliases: ['canvassing method', 'source', 'method'] },
    { key: 'status', label: 'Status', type: 'text', aliases: ['status', 'stage'] },
    { key: 'next_follow_up_date', label: 'Next Follow Up Date', type: 'date', aliases: ['next follow up date', 'follow up date', 'next action date'] },
    { key: 'follow_up_priority', label: 'Follow Up Priority', type: 'enum', options: ['low', 'medium', 'high', 'urgent'], aliases: ['follow up priority', 'priority'] },
    { key: 'broker_email', label: 'Broker Email', type: 'email', aliases: ['broker email', 'owner email', 'agent email'] },
    { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'comments'] },
  ],
  canvassing_landlord_prospects: [
    { key: 'company_name', label: 'Company Name', type: 'text', required: true, aliases: ['company name', 'company', 'landlord'] },
    { key: 'contact_name', label: 'Contact Name', type: 'text', aliases: ['contact name', 'contact', 'person'] },
    { key: 'email', label: 'Email', type: 'email', aliases: ['email', 'email address'] },
    { key: 'phone', label: 'Phone', type: 'text', aliases: ['phone', 'mobile', 'telephone'] },
    { key: 'area', label: 'Area', type: 'text', required: true, aliases: ['area', 'location', 'suburb'] },
    { key: 'property_type', label: 'Property Type', type: 'text', aliases: ['property type', 'asset type'] },
    { key: 'canvassing_method', label: 'Canvassing Method', type: 'text', aliases: ['canvassing method', 'source', 'method'] },
    { key: 'status', label: 'Status', type: 'text', aliases: ['status', 'stage'] },
    { key: 'next_follow_up_date', label: 'Next Follow Up Date', type: 'date', aliases: ['next follow up date', 'follow up date', 'next action date'] },
    { key: 'follow_up_priority', label: 'Follow Up Priority', type: 'enum', options: ['low', 'medium', 'high', 'urgent'], aliases: ['follow up priority', 'priority'] },
    { key: 'broker_email', label: 'Broker Email', type: 'email', aliases: ['broker email', 'owner email', 'agent email'] },
    { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'comments'] },
  ],
  canvassing_tenant_prospects: [
    { key: 'company_name', label: 'Company Name', type: 'text', required: true, aliases: ['company name', 'company', 'tenant'] },
    { key: 'contact_name', label: 'Contact Name', type: 'text', aliases: ['contact name', 'contact', 'person'] },
    { key: 'email', label: 'Email', type: 'email', aliases: ['email', 'email address'] },
    { key: 'phone', label: 'Phone', type: 'text', aliases: ['phone', 'mobile', 'telephone'] },
    { key: 'area', label: 'Area', type: 'text', required: true, aliases: ['area', 'location', 'suburb'] },
    { key: 'property_type', label: 'Property Type', type: 'text', aliases: ['property type', 'asset type'] },
    { key: 'deal_type', label: 'Deal Type', type: 'enum', options: ['lease', 'sale'], aliases: ['deal type', 'transaction type'] },
    { key: 'canvassing_method', label: 'Canvassing Method', type: 'text', aliases: ['canvassing method', 'source', 'method'] },
    { key: 'status', label: 'Status', type: 'text', aliases: ['status', 'stage'] },
    { key: 'next_follow_up_date', label: 'Next Follow Up Date', type: 'date', aliases: ['next follow up date', 'follow up date', 'next action date'] },
    { key: 'follow_up_priority', label: 'Follow Up Priority', type: 'enum', options: ['low', 'medium', 'high', 'urgent'], aliases: ['follow up priority', 'priority'] },
    { key: 'broker_email', label: 'Broker Email', type: 'email', aliases: ['broker email', 'owner email', 'agent email'] },
    { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'comments'] },
  ],
  properties: [
    { key: 'property_name', label: 'Property Name', type: 'text', required: true, aliases: ['property name', 'property', 'building'] },
    { key: 'landlord_name', label: 'Landlord Name', type: 'text', relationship: true, aliases: ['landlord name', 'landlord', 'owner'] },
    { key: 'property_type', label: 'Property Type', type: 'text', required: true, aliases: ['property type', 'asset type'] },
    { key: 'address', label: 'Address', type: 'text', aliases: ['address', 'street address'] },
    { key: 'suburb', label: 'Suburb', type: 'text', aliases: ['suburb', 'area'] },
    { key: 'city', label: 'City', type: 'text', aliases: ['city', 'town'] },
    { key: 'province', label: 'Province', type: 'text', aliases: ['province', 'state'] },
    { key: 'gla_m2', label: 'GLA M2', type: 'number', aliases: ['gla m2', 'gla', 'gross lettable area'] },
    { key: 'available_space_m2', label: 'Available Space M2', type: 'number', aliases: ['available space m2', 'available space'] },
    { key: 'asking_rental_per_m2', label: 'Asking Rental Per M2', type: 'number', aliases: ['asking rental per m2', 'rental per m2'] },
    { key: 'asking_sale_price', label: 'Asking Sale Price', type: 'number', aliases: ['asking sale price', 'sale price'] },
    { key: 'broker_email', label: 'Broker Email', type: 'email', aliases: ['broker email', 'owner email', 'agent email'] },
    { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'comments'] },
  ],
  landlords: [
    { key: 'name', label: 'Landlord Name', type: 'text', required: true, aliases: ['landlord name', 'landlord', 'name'] },
    { key: 'legal_name', label: 'Legal Name', type: 'text', aliases: ['legal name', 'registered name'] },
    { key: 'entity_type', label: 'Entity Type', type: 'text', aliases: ['entity type', 'type'] },
    { key: 'registration_number', label: 'Registration Number', type: 'text', aliases: ['registration number', 'reg number'] },
    { key: 'email', label: 'Email', type: 'email', aliases: ['email', 'main email'] },
    { key: 'phone', label: 'Phone', type: 'text', aliases: ['phone', 'main phone'] },
    { key: 'website', label: 'Website', type: 'text', aliases: ['website', 'url'] },
    { key: 'address', label: 'Address', type: 'text', aliases: ['address', 'registered address'] },
    { key: 'portfolio_type', label: 'Portfolio Type', type: 'text', aliases: ['portfolio type', 'portfolio'] },
    { key: 'broker_email', label: 'Broker Email', type: 'email', aliases: ['broker email', 'owner email', 'agent email'] },
    { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'comments'] },
  ],
  companies: [
    { key: 'company_name', label: 'Company Name', type: 'text', required: true, aliases: ['company name', 'company', 'name'] },
    { key: 'company_type', label: 'Company Type', type: 'enum', options: ['tenant', 'landlord', 'investor', 'developer', 'property_fund', 'brokerage', 'corporate', 'other'], aliases: ['company type', 'type'] },
    { key: 'industry', label: 'Industry', type: 'text', aliases: ['industry', 'sector'] },
    { key: 'website', label: 'Website', type: 'text', aliases: ['website', 'url'] },
    { key: 'registration_number', label: 'Registration Number', type: 'text', aliases: ['registration number', 'reg number'] },
    { key: 'vat_number', label: 'VAT Number', type: 'text', aliases: ['vat number', 'vat'] },
    { key: 'email', label: 'Email', type: 'email', aliases: ['email', 'main email'] },
    { key: 'phone', label: 'Phone', type: 'text', aliases: ['phone', 'main phone'] },
    { key: 'address', label: 'Address', type: 'text', aliases: ['address'] },
    { key: 'city', label: 'City', type: 'text', aliases: ['city'] },
    { key: 'province', label: 'Province', type: 'text', aliases: ['province'] },
    { key: 'broker_email', label: 'Broker Email', type: 'email', aliases: ['broker email', 'owner email', 'agent email'] },
    { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'comments'] },
  ],
  contacts: [
    { key: 'company_name', label: 'Company Name', type: 'text', required: true, relationship: true, aliases: ['company name', 'company'] },
    { key: 'first_name', label: 'First Name', type: 'text', aliases: ['first name', 'firstname'] },
    { key: 'last_name', label: 'Last Name', type: 'text', aliases: ['last name', 'lastname', 'surname'] },
    { key: 'job_title', label: 'Job Title', type: 'text', aliases: ['job title', 'title', 'role'] },
    { key: 'email', label: 'Email', type: 'email', aliases: ['email', 'email address'] },
    { key: 'phone', label: 'Phone', type: 'text', aliases: ['phone', 'telephone'] },
    { key: 'mobile', label: 'Mobile', type: 'text', aliases: ['mobile', 'cell'] },
    { key: 'decision_maker', label: 'Decision Maker', type: 'boolean', aliases: ['decision maker', 'decision_maker'] },
    { key: 'is_primary', label: 'Primary Contact', type: 'boolean', aliases: ['primary contact', 'is primary', 'primary'] },
    { key: 'broker_email', label: 'Broker Email', type: 'email', aliases: ['broker email', 'owner email', 'agent email'] },
    { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'comments'] },
  ],
  listings: [
    { key: 'title', label: 'Listing Title', type: 'text', required: true, aliases: ['listing title', 'title', 'listing'] },
    { key: 'listing_type', label: 'Listing Type', type: 'enum', options: ['lease', 'sale', 'investment', 'development'], aliases: ['listing type', 'deal type'] },
    { key: 'listing_category', label: 'Listing Category', type: 'text', aliases: ['listing category', 'category'] },
    { key: 'property_name', label: 'Property Name', type: 'text', relationship: true, aliases: ['property name', 'property'] },
    { key: 'vacancy_name', label: 'Vacancy Name', type: 'text', relationship: true, aliases: ['vacancy name', 'vacancy'] },
    { key: 'landlord_name', label: 'Landlord Name', type: 'text', relationship: true, aliases: ['landlord name', 'landlord'] },
    { key: 'description', label: 'Description', type: 'text', aliases: ['description', 'details'] },
    { key: 'pricing', label: 'Pricing', type: 'text', aliases: ['pricing', 'price'] },
    { key: 'available_from', label: 'Available From', type: 'date', aliases: ['available from', 'availability date'] },
    { key: 'broker_email', label: 'Broker Email', type: 'email', aliases: ['broker email', 'owner email', 'agent email'] },
    { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'comments'] },
  ],
}

FIELD_DEFINITIONS.requirements = FIELD_DEFINITIONS.leads

function normalizeBulkUploadSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const allowedRecordTypes = Array.isArray(source.allowedRecordTypes)
    ? source.allowedRecordTypes.filter((recordType) => (
        COMMIT_ENABLED_RECORD_TYPES.has(recordType) &&
        RECORD_TYPE_OPTIONS.some((option) => option.value === recordType)
      ))
    : DEFAULT_BULK_UPLOAD_SETTINGS.allowedRecordTypes

  return {
    ...DEFAULT_BULK_UPLOAD_SETTINGS,
    ...source,
    enabled: source.enabled !== false,
    allowedRecordTypes,
    requireManagerApproval: source.requireManagerApproval !== false,
    duplicateStrategy: DUPLICATE_STRATEGIES.some((strategy) => strategy.value === source.duplicateStrategy)
      ? source.duplicateStrategy
      : DEFAULT_BULK_UPLOAD_SETTINGS.duplicateStrategy,
    defaultOwnerMode: OWNER_MODES.some((mode) => mode.value === source.defaultOwnerMode)
      ? source.defaultOwnerMode
      : DEFAULT_BULK_UPLOAD_SETTINGS.defaultOwnerMode,
    maxRowsPerUpload: Math.max(1, Math.min(10000, Number(source.maxRowsPerUpload) || DEFAULT_BULK_UPLOAD_SETTINGS.maxRowsPerUpload)),
    documentUploadsEnabled: Boolean(source.documentUploadsEnabled),
  }
}

function normalizeRecordTypeLabel(value = '') {
  return RECORD_TYPE_OPTIONS.find((option) => option.value === value)?.label || value
}

function isCommitEnabledRecordType(recordType = '') {
  return COMMIT_ENABLED_RECORD_TYPES.has(recordType)
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function buildCsv(rows = []) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n')
}

function downloadBlob(content, filename, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function parseDelimitedText(text = '') {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  const source = String(text || '').replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell.trim())
      if (row.some((value) => String(value || '').trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell.trim())
  if (row.some((value) => String(value || '').trim())) rows.push(row)
  return rows
}

function rowsToObjects(rows = []) {
  if (!rows.length) return { headers: [], records: [] }
  const headers = rows[0].map((header, index) => String(header || `Column ${index + 1}`).trim()).filter(Boolean)
  const records = rows.slice(1).map((values) => headers.reduce((record, header, index) => {
    record[header] = String(values[index] ?? '').trim()
    return record
  }, {})).filter((record) => Object.values(record).some((value) => String(value || '').trim()))
  return { headers, records }
}

async function parseImportFile(file) {
  const name = String(file?.name || '').toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return { headers: [], records: [] }
    return rowsToObjects(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }))
  }
  return rowsToObjects(parseDelimitedText(await file.text()))
}

function normalizeHeader(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function autoMapColumns(recordType, headers = []) {
  const fields = FIELD_DEFINITIONS[recordType] || []
  const normalizedHeaders = headers.map((header) => ({ header, normalized: normalizeHeader(header) }))
  return fields.reduce((mapping, field) => {
    const candidates = [field.label, field.key, ...(field.aliases || [])].map(normalizeHeader)
    const exact = normalizedHeaders.find((entry) => candidates.includes(entry.normalized))
    const fuzzy = exact || normalizedHeaders.find((entry) => candidates.some((candidate) => entry.normalized.includes(candidate) || candidate.includes(entry.normalized)))
    mapping[field.key] = fuzzy?.header || ''
    return mapping
  }, {})
}

function normalizeCell(value) {
  return String(value ?? '').trim()
}

function normalizeBoolean(value) {
  const normalized = normalizeHeader(value)
  if (['yes', 'y', 'true', '1'].includes(normalized)) return true
  if (['no', 'n', 'false', '0'].includes(normalized)) return false
  return null
}

function normalizeDateValue(value) {
  const text = normalizeCell(value)
  if (!text) return ''
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function normalizeFieldValue(field, value) {
  const text = normalizeCell(value)
  if (!text) return ''
  if (field.type === 'number') {
    const numeric = Number(text.replace(/[,\s]/g, ''))
    return Number.isFinite(numeric) ? numeric : null
  }
  if (field.type === 'date') return normalizeDateValue(text)
  if (field.type === 'email') return text.toLowerCase()
  if (field.type === 'boolean') return normalizeBoolean(text)
  if (field.type === 'enum') return normalizeHeader(text).replaceAll(' ', '_')
  return text
}

function validateFieldValue(field, rawValue, normalizedValue) {
  const text = normalizeCell(rawValue)
  if (!text) return ''
  if (field.type === 'number' && normalizedValue === null) return `${field.label} must be a number.`
  if (field.type === 'date' && normalizedValue === null) return `${field.label} must be a valid date.`
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return `${field.label} must be a valid email address.`
  if (field.type === 'boolean' && normalizedValue === null) return `${field.label} must be yes/no or true/false.`
  if (field.type === 'enum' && field.options?.length && !field.options.includes(normalizedValue)) return `${field.label} must be one of: ${field.options.join(', ')}.`
  return ''
}

function duplicateKeyFor(recordType, payload = {}) {
  if (payload.email) return `${recordType}:email:${String(payload.email).toLowerCase()}`
  if (recordType === 'vacancies') return `${recordType}:${normalizeHeader(payload.property_name)}:${normalizeHeader(payload.vacancy_name || payload.unit_or_floor)}`
  if (recordType === 'properties') return `${recordType}:${normalizeHeader(payload.property_name)}:${normalizeHeader(payload.address)}`
  if (recordType === 'contacts') return `${recordType}:${normalizeHeader(payload.company_name)}:${normalizeHeader(`${payload.first_name || ''} ${payload.last_name || ''}`)}`
  if (recordType === 'listings') return `${recordType}:${normalizeHeader(payload.title)}:${normalizeHeader(payload.property_name)}`
  const name = payload.company_name || payload.name || payload.requirement_name || payload.title
  return name ? `${recordType}:name:${normalizeHeader(name)}` : ''
}

function validateImportMapping(recordType, headers = [], rows = [], mapping = {}) {
  const fields = FIELD_DEFINITIONS[recordType] || []
  const headerSet = new Set(headers)
  const mappingErrors = fields
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => `${field.label} is required but is not mapped.`)
  const seen = new Map()
  const rowResults = rows.map((row, index) => {
    const mappedPayload = {}
    const normalizedPayload = {}
    const errors = []
    const warnings = []

    fields.forEach((field) => {
      const sourceHeader = mapping[field.key]
      if (sourceHeader && !headerSet.has(sourceHeader)) {
        errors.push(`${field.label} is mapped to a missing column.`)
        return
      }
      const rawValue = sourceHeader ? row[sourceHeader] : ''
      const normalizedValue = normalizeFieldValue(field, rawValue)
      if (sourceHeader) mappedPayload[field.key] = normalizeCell(rawValue)
      if (normalizedValue !== '') normalizedPayload[field.key] = normalizedValue
      if (field.required && !normalizeCell(rawValue)) errors.push(`${field.label} is required.`)
      const validationMessage = validateFieldValue(field, rawValue, normalizedValue)
      if (validationMessage) errors.push(validationMessage)
      if (field.relationship && normalizeCell(rawValue)) warnings.push(`${field.label} will need matching or creation during commit.`)
    })

    if (recordType === 'contacts' && !normalizedPayload.email && !normalizedPayload.mobile && !normalizedPayload.phone) {
      warnings.push('Contact has no email, phone, or mobile number.')
    }
    if (recordType === 'leads' && normalizedPayload.min_size_m2 && normalizedPayload.max_size_m2 && normalizedPayload.min_size_m2 > normalizedPayload.max_size_m2) {
      errors.push('Min Size M2 cannot be greater than Max Size M2.')
    }
    if (normalizedPayload.budget_min && normalizedPayload.budget_max && normalizedPayload.budget_min > normalizedPayload.budget_max) {
      errors.push('Budget Min cannot be greater than Budget Max.')
    }

    const duplicateKey = duplicateKeyFor(recordType, normalizedPayload)
    if (duplicateKey) {
      const previous = seen.get(duplicateKey)
      if (previous) warnings.push(`Possible duplicate of row ${previous}.`)
      else seen.set(duplicateKey, index + 1)
    }

    const status = errors.length ? 'invalid' : warnings.length ? 'warning' : 'valid'
    return {
      rowNumber: index + 1,
      sourceRow: row,
      mappedPayload,
      normalizedPayload,
      validationErrors: errors,
      validationWarnings: warnings,
      duplicateKey,
      status,
      action: status === 'valid' ? 'create' : 'review',
    }
  })

  if (mappingErrors.length) {
    rowResults.forEach((result) => {
      result.validationErrors = [...mappingErrors, ...result.validationErrors]
      result.status = 'invalid'
      result.action = 'review'
    })
  }

  const summary = rowResults.reduce((counts, result) => {
    counts.totalRows += 1
    if (result.status === 'valid') counts.validRows += 1
    else if (['warning', 'skipped'].includes(result.status)) counts.warningRows += 1
    else counts.invalidRows += 1
    return counts
  }, { totalRows: 0, validRows: 0, warningRows: 0, invalidRows: 0 })

  return {
    ...summary,
    mappingErrors,
    rows: rowResults,
    issues: rowResults
      .filter((result) => result.validationErrors.length || result.validationWarnings.length)
      .slice(0, 25),
  }
}

function summarizeImportValidation(mappingErrors = [], rows = []) {
  const summary = rows.reduce((counts, result) => {
    counts.totalRows += 1
    if (result.status === 'valid') counts.validRows += 1
    else if (['warning', 'skipped'].includes(result.status)) counts.warningRows += 1
    else counts.invalidRows += 1
    return counts
  }, { totalRows: 0, validRows: 0, warningRows: 0, invalidRows: 0 })

  return {
    ...summary,
    mappingErrors,
    rows,
    issues: rows
      .filter((result) => result.validationErrors.length || result.validationWarnings.length)
      .slice(0, 25),
  }
}

function getDuplicateActionForStrategy(strategy = 'review') {
  if (strategy === 'skip') return 'skip'
  if (strategy === 'update') return 'update'
  return 'review'
}

function getDuplicateStatusForAction(action = 'review', hasErrors = false) {
  if (hasErrors) return 'invalid'
  if (action === 'skip') return 'skipped'
  return 'warning'
}

function mergeExistingDuplicateMatches(validation = {}, matchesByRowNumber = {}, duplicateStrategy = 'review') {
  const rows = (validation.rows || []).map((row) => {
    const match = matchesByRowNumber[row.rowNumber]
    if (!match?.recordId) return row

    const duplicateAction = getDuplicateActionForStrategy(duplicateStrategy)
    const label = match.label ? ` (${match.label})` : ''
    const warning = `Possible existing ${match.recordType || 'commercial record'} match${label}: ${match.reason || 'matching record already exists'}.`
    const validationWarnings = row.validationWarnings.includes(warning)
      ? row.validationWarnings
      : [...row.validationWarnings, warning]

    return {
      ...row,
      validationWarnings,
      duplicateRecordType: match.recordType || '',
      duplicateRecordId: match.recordId || '',
      status: getDuplicateStatusForAction(duplicateAction, row.validationErrors.length),
      action: row.validationErrors.length ? 'review' : duplicateAction,
    }
  })

  return summarizeImportValidation(validation.mappingErrors || [], rows)
}

function getImportRowTitle(row = {}) {
  const payload = row.normalizedPayload || row.mappedPayload || {}
  return (
    payload.vacancy_name ||
    payload.requirement_name ||
    payload.company_name ||
    payload.name ||
    payload.property_name ||
    payload.title ||
    `Row ${row.rowNumber || row.row_number || '-'}`
  )
}

function getImportRowIssueText(row = {}) {
  const issues = [...(row.validationErrors || []), ...(row.validationWarnings || [])]
  return issues.length ? issues.join(' ') : row.errorMessage || 'Ready to commit.'
}

function getImportRowDuplicateMatch(row = {}) {
  const duplicateRecordId = row.duplicateRecordId || row.duplicate_record_id || ''
  if (!duplicateRecordId) return ''
  const duplicateRecordType = row.duplicateRecordType || row.duplicate_record_type || 'commercial record'
  return `${duplicateRecordType} · ${String(duplicateRecordId).slice(0, 8)}`
}

function hasRelationshipResolutionWarning(row = {}) {
  return (row.validationWarnings || row.validation_warnings || []).some((warning) => (
    String(warning || '').toLowerCase().includes('matching or creation during commit')
  ))
}

function isImportIssueRow(row = {}) {
  return ['failed', 'invalid', 'warning', 'skipped'].includes(String(row.status || '').toLowerCase()) || Boolean(row.errorMessage)
}

function buildImportIssueCsvRows(rows = []) {
  const header = ['Row', 'Record', 'Status', 'Action', 'Issue', 'Duplicate Key', 'Duplicate Record Type', 'Duplicate Record ID', 'Target Table', 'Target Record ID']
  const body = rows.filter(isImportIssueRow).map((row) => [
    row.rowNumber,
    getImportRowTitle(row),
    row.status,
    row.action,
    getImportRowIssueText(row),
    row.duplicateKey,
    row.duplicateRecordType,
    row.duplicateRecordId,
    row.targetTable,
    row.targetRecordId,
  ])
  return [header, ...body]
}

function buildImportOutcomeCsvRows(rows = []) {
  const header = ['Row', 'Record', 'Status', 'Action', 'Issue', 'Duplicate Record', 'Target Table', 'Target Record ID', 'Processed At']
  const body = rows.map((row) => [
    row.rowNumber,
    getImportRowTitle(row),
    row.status,
    row.action,
    getImportRowIssueText(row),
    getImportRowDuplicateMatch(row),
    row.targetTable,
    row.targetRecordId,
    row.processedAt,
  ])
  return [header, ...body]
}

function summarizeImportReviewReadiness(rows = []) {
  return rows.reduce((summary, row) => {
    const status = String(row.status || '').toLowerCase()
    const action = String(row.action || '').toLowerCase()
    const hasErrors = Boolean(row.validationErrors?.length)
    summary.totalRows += 1
    if (status === 'created') summary.createdRows += 1
    if (status === 'updated') summary.updatedRows += 1
    if (status === 'failed') summary.failedRows += 1
    if (status === 'skipped' || action === 'skip') summary.skipRows += 1
    if (action === 'create' && !hasErrors && !['created', 'updated', 'skipped'].includes(status)) summary.createRows += 1
    if (action === 'update' && !hasErrors && !['created', 'updated', 'skipped'].includes(status)) summary.updateRows += 1
    if (action === 'review' && !['created', 'updated', 'skipped'].includes(status)) summary.reviewRows += 1
    if (hasErrors || status === 'invalid') summary.invalidRows += 1
    if (getImportRowDuplicateMatch(row)) summary.duplicateRows += 1
    if (hasRelationshipResolutionWarning(row)) summary.relationshipRows += 1
    return summary
  }, {
    totalRows: 0,
    createRows: 0,
    updateRows: 0,
    reviewRows: 0,
    skipRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    relationshipRows: 0,
    createdRows: 0,
    updatedRows: 0,
    failedRows: 0,
  })
}

function getImportReadinessLabel(summary = {}) {
  if (!summary.totalRows) return 'No rows loaded'
  if (summary.invalidRows) return `${summary.invalidRows} invalid ${summary.invalidRows === 1 ? 'row' : 'rows'}`
  if (summary.reviewRows) return `${summary.reviewRows} ${summary.reviewRows === 1 ? 'row needs' : 'rows need'} review`
  if (summary.failedRows) return `${summary.failedRows} failed ${summary.failedRows === 1 ? 'row' : 'rows'}`
  return 'Ready to commit'
}

function isImportRowLocked(row = {}) {
  return ['created', 'updated', 'committing'].includes(String(row.status || '').toLowerCase())
}

function getBulkReviewActionRows(rows = [], action = '') {
  return rows.filter((row) => {
    if (isImportRowLocked(row)) return false
    if (action === 'create') return !row.validationErrors?.length && !row.duplicateRecordId && row.action !== 'create'
    if (action === 'update') return !row.validationErrors?.length && Boolean(row.duplicateRecordId) && row.action !== 'update'
    if (action === 'skip') return Boolean(row.duplicateRecordId) && row.action !== 'skip'
    return false
  })
}

function getReviewedRowPatch(action, row = {}) {
  if (action === 'skip') {
    return { action: 'skip', status: 'skipped', errorMessage: 'Skipped by manager review.' }
  }
  if (action === 'update') {
    return {
      action: row.duplicateRecordId ? 'update' : 'review',
      status: row.duplicateRecordId ? 'ready' : 'warning',
      errorMessage: row.duplicateRecordId ? '' : 'Update requires an existing matched record.',
    }
  }
  if (action === 'review') {
    return { action: 'review', status: 'warning', errorMessage: 'Held for manager review.' }
  }
  return {
    action: 'create',
    status: row.validationWarnings?.length ? 'warning' : 'ready',
    errorMessage: '',
  }
}

function getUploadDisabledReason(settings = {}) {
  if (!settings.enabled) return 'Bulk upload is disabled in Commercial settings.'
  if (!settings.allowedRecordTypes?.length) return 'Select at least one enabled record type before uploading.'
  return ''
}

function getCreateImportDisabledReason(importDraft = {}, settings = {}) {
  if (importDraft.saving) return 'Creating the import batch.'
  if (importDraft.validating) return 'Validation is still running.'
  if (!settings.enabled) return 'Bulk upload is disabled in Commercial settings.'
  if (!settings.allowedRecordTypes?.length) return 'Select at least one enabled record type first.'
  if (!importDraft.rows.length) return 'Upload a CSV or XLSX file first.'
  if (!importDraft.validation) return 'Validate the column mapping first.'
  return ''
}

function CommercialBulkUploadSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [auditError, setAuditError] = useState('')
  const [success, setSuccess] = useState('')
  const [settings, setSettings] = useState(DEFAULT_BULK_UPLOAD_SETTINGS)
  const [organisationSettings, setOrganisationSettings] = useState({})
  const [organisationId, setOrganisationId] = useState('')
  const [importBatches, setImportBatches] = useState([])
  const [importAction, setImportAction] = useState({ batchId: '', action: '' })
  const [reviewBatch, setReviewBatch] = useState(null)
  const [reviewRows, setReviewRows] = useState([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewRowAction, setReviewRowAction] = useState({ rowId: '', action: '' })
  const [reviewBulkAction, setReviewBulkAction] = useState('')
  const [importDraft, setImportDraft] = useState({
    recordType: 'vacancies',
    file: null,
    headers: [],
    rows: [],
    columnMapping: {},
    validation: null,
    error: '',
    saving: false,
    validating: false,
    summary: null,
  })

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      setLoading(true)
      setError('')
      try {
        const response = await fetchOrganisationSettings({ forceRefresh: true })
        if (cancelled) return
        const nextOrganisationSettings = response?.organisationSettings || response || {}
        setOrganisationSettings(nextOrganisationSettings)
        const nextSettings = normalizeBulkUploadSettings(nextOrganisationSettings.commercialWorkspace?.bulkUpload)
        setSettings(nextSettings)
        setImportDraft((previous) => ({
          ...previous,
          recordType: nextSettings.allowedRecordTypes.includes(previous.recordType) ? previous.recordType : nextSettings.allowedRecordTypes[0] || 'vacancies',
        }))
        const nextOrganisationId = response?.organisation?.id || ''
        setOrganisationId(nextOrganisationId)
        if (nextOrganisationId) {
          try {
            const batches = await listCommercialImportBatches(nextOrganisationId, { limit: 5 })
            if (!cancelled) setImportBatches(batches)
          } catch (auditLoadError) {
            if (!cancelled) setAuditError(auditLoadError?.message || 'Import audit trail could not be loaded.')
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || 'Bulk upload settings could not be loaded.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedCount = settings.allowedRecordTypes.length
  const enabledSummary = useMemo(() => {
    if (!settings.enabled) return 'Bulk upload disabled'
    if (!selectedCount) return 'No record types selected'
    return `${selectedCount} record ${selectedCount === 1 ? 'type' : 'types'} enabled`
  }, [selectedCount, settings.enabled])
  const selectedTemplate = TEMPLATE_DEFINITIONS[importDraft.recordType] || TEMPLATE_DEFINITIONS.vacancies
  const selectedFields = FIELD_DEFINITIONS[importDraft.recordType] || []
  const previewRows = importDraft.rows.slice(0, 5)
  const reviewReadiness = useMemo(() => summarizeImportReviewReadiness(reviewRows), [reviewRows])
  const bulkCreateRows = useMemo(() => getBulkReviewActionRows(reviewRows, 'create'), [reviewRows])
  const bulkUpdateRows = useMemo(() => getBulkReviewActionRows(reviewRows, 'update'), [reviewRows])
  const bulkSkipRows = useMemo(() => getBulkReviewActionRows(reviewRows, 'skip'), [reviewRows])
  const uploadDisabledReason = getUploadDisabledReason(settings)
  const createImportDisabledReason = getCreateImportDisabledReason(importDraft, settings)

  function updateSetting(key, value) {
    setSuccess('')
    setSettings((previous) => ({ ...previous, [key]: value }))
  }

  function toggleRecordType(recordType) {
    if (!isCommitEnabledRecordType(recordType)) {
      setSuccess('')
      return
    }

    setSuccess('')
    setSettings((previous) => {
      const selected = new Set(previous.allowedRecordTypes || [])
      if (selected.has(recordType)) selected.delete(recordType)
      else selected.add(recordType)
      return { ...previous, allowedRecordTypes: Array.from(selected) }
    })
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const normalized = normalizeBulkUploadSettings(settings)
      const existingCommercialWorkspace = organisationSettings.commercialWorkspace || {}
      const nextSettings = {
        ...organisationSettings,
        commercialWorkspace: {
          ...existingCommercialWorkspace,
          bulkUpload: normalized,
        },
      }
      const response = await updateWorkflowSettings(nextSettings)
      const updatedSettings = response?.organisationSettings || response || nextSettings
      setOrganisationSettings(updatedSettings)
      setSettings(normalizeBulkUploadSettings(updatedSettings.commercialWorkspace?.bulkUpload))
      setSuccess('Bulk upload settings saved.')
    } catch (saveError) {
      setError(saveError?.message || 'Bulk upload settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  function handleDownloadTemplate() {
    const definition = TEMPLATE_DEFINITIONS[importDraft.recordType] || TEMPLATE_DEFINITIONS.vacancies
    const csv = buildCsv([definition.headers, definition.sample])
    downloadBlob(csv, `commercial-${importDraft.recordType}-template.csv`)
  }

  async function handleImportFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setImportDraft((previous) => ({ ...previous, file, headers: [], rows: [], columnMapping: {}, validation: null, error: '', summary: null }))
    try {
      const parsed = await parseImportFile(file)
      const limitedRows = parsed.records.slice(0, settings.maxRowsPerUpload)
      const columnMapping = autoMapColumns(importDraft.recordType, parsed.headers)
      setImportDraft((previous) => ({
        ...previous,
        file,
        headers: parsed.headers,
        rows: limitedRows,
        columnMapping,
        validation: null,
        error: parsed.records.length > settings.maxRowsPerUpload
          ? `Parsed ${settings.maxRowsPerUpload} rows. The file contains more rows than the current limit.`
          : '',
        summary: {
          fileName: file.name,
          fileSize: file.size,
          parsedRows: parsed.records.length,
          stagedRows: limitedRows.length,
          columnCount: parsed.headers.length,
        },
      }))
    } catch (parseError) {
      setImportDraft((previous) => ({
        ...previous,
        file,
        headers: [],
        rows: [],
        columnMapping: {},
        validation: null,
        summary: null,
        error: parseError?.message || 'The import file could not be parsed.',
      }))
    } finally {
      event.target.value = ''
    }
  }

  function updateColumnMapping(fieldKey, sourceHeader) {
    setImportDraft((previous) => ({
      ...previous,
      columnMapping: { ...(previous.columnMapping || {}), [fieldKey]: sourceHeader },
      validation: null,
      error: '',
    }))
  }

  async function handleValidateMapping() {
    setImportDraft((previous) => ({ ...previous, validating: true, error: '' }))
    try {
      const validation = validateImportMapping(importDraft.recordType, importDraft.headers, importDraft.rows, importDraft.columnMapping)
      let nextValidation = validation
      let validationNotice = ''
      if (!validation.mappingErrors.length && organisationId) {
        try {
          const duplicateResult = await findCommercialImportExistingDuplicates({
            organisationId,
            recordType: importDraft.recordType,
            rows: validation.rows,
          })
          nextValidation = mergeExistingDuplicateMatches(validation, duplicateResult.matchesByRowNumber || {}, settings.duplicateStrategy)
        } catch (duplicateError) {
          validationNotice = `Mapping validated, but existing-record duplicate checks could not be completed: ${duplicateError?.message || 'please review duplicates manually.'}`
        }
      }

      setImportDraft((previous) => ({
        ...previous,
        validation: nextValidation,
        validating: false,
        error: nextValidation.mappingErrors.length ? 'Required column mappings are missing.' : validationNotice,
        summary: previous.summary
          ? {
              ...previous.summary,
              validRows: nextValidation.validRows,
              warningRows: nextValidation.warningRows,
              invalidRows: nextValidation.invalidRows,
            }
          : previous.summary,
      }))
    } catch (validationError) {
      setImportDraft((previous) => ({
        ...previous,
        validation: null,
        validating: false,
        error: validationError?.message || 'Existing-record duplicate checks could not be completed.',
      }))
    }
  }

  async function refreshImportBatches() {
    if (!organisationId) return
    const batches = await listCommercialImportBatches(organisationId, { limit: 5 })
    setImportBatches(batches)
  }

  async function handleCreateImportBatch() {
    setImportDraft((previous) => ({ ...previous, saving: true, error: '' }))
    try {
      if (!organisationId) throw new Error('Commercial organisation context is not available.')
      if (!settings.enabled) throw new Error('Bulk upload is disabled in Commercial settings.')
      if (!settings.allowedRecordTypes.includes(importDraft.recordType)) throw new Error('This record type is not enabled for bulk upload.')
      if (!importDraft.file || !importDraft.rows.length) throw new Error('Upload a CSV or XLSX file with at least one data row.')
      if (!importDraft.validation) throw new Error('Validate the column mapping before creating an import batch.')

      const readinessSummary = summarizeImportReviewReadiness(importDraft.validation.rows)
      const batch = await createCommercialImportBatch({
        organisationId,
        recordType: importDraft.recordType,
        sourceType: importDraft.file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx',
        fileName: importDraft.file.name,
        fileMimeType: importDraft.file.type,
        fileSize: importDraft.file.size,
        duplicateStrategy: settings.duplicateStrategy,
        defaultOwnerMode: settings.defaultOwnerMode,
        requiresManagerApproval: settings.requireManagerApproval,
        totalRows: importDraft.rows.length,
        settingsSnapshot: settings,
        columnMapping: importDraft.columnMapping,
        validationSummary: {
          phase: 'phase_6_readiness_diagnostics',
          headers: importDraft.headers,
          parsedRows: importDraft.summary?.parsedRows || importDraft.rows.length,
          stagedRows: importDraft.rows.length,
          validRows: importDraft.validation.validRows,
          warningRows: importDraft.validation.warningRows,
          invalidRows: importDraft.validation.invalidRows,
          duplicateRows: readinessSummary.duplicateRows,
          relationshipRows: readinessSummary.relationshipRows,
          reviewRows: readinessSummary.reviewRows,
          createRows: readinessSummary.createRows,
          updateRows: readinessSummary.updateRows,
          skipRows: readinessSummary.skipRows,
          mappingErrors: importDraft.validation.mappingErrors,
        },
        importSummary: {
          fileName: importDraft.file.name,
          recordType: importDraft.recordType,
          status: 'validated_for_review',
          readiness: readinessSummary,
        },
        metadata: {
          source: 'commercial_bulk_upload_phase_7',
          reviewAutomationEnabled: true,
        },
      })

      const rowPayloads = importDraft.validation.rows.map((row) => ({
        rowNumber: row.rowNumber,
        sourceRow: row.sourceRow,
        mappedPayload: row.mappedPayload,
        normalizedPayload: row.normalizedPayload,
        status: row.status,
        action: row.action,
        validationErrors: row.validationErrors,
        validationWarnings: row.validationWarnings,
        duplicateKey: row.duplicateKey,
        duplicateRecordType: row.duplicateRecordType,
        duplicateRecordId: row.duplicateRecordId,
        metadata: {
          source: 'commercial_bulk_upload_phase_7',
          recordType: importDraft.recordType,
          readiness: {
            duplicateMatch: Boolean(row.duplicateRecordId),
            relationshipResolution: hasRelationshipResolutionWarning(row),
          },
        },
      }))
      const chunkSize = 250
      for (let index = 0; index < rowPayloads.length; index += chunkSize) {
        await createCommercialImportRows(batch.id, rowPayloads.slice(index, index + chunkSize))
      }
      await updateCommercialImportBatch(batch.id, {
        status: settings.requireManagerApproval ? 'approval_pending' : importDraft.validation.invalidRows ? 'validated' : 'ready',
        totalRows: rowPayloads.length,
        validRows: importDraft.validation.validRows,
        warningRows: importDraft.validation.warningRows,
        invalidRows: importDraft.validation.invalidRows,
        importSummary: {
          ...batch.importSummary,
          stagedRows: rowPayloads.length,
          readiness: readinessSummary,
          message: importDraft.validation.invalidRows ? 'Rows staged with validation issues for review.' : 'Rows validated and ready for review.',
        },
      })
      await refreshImportBatches()
      setImportDraft((previous) => ({
        ...previous,
        file: null,
        headers: [],
        rows: [],
        columnMapping: {},
        validation: null,
        saving: false,
        error: '',
        summary: { ...previous.summary, batchId: batch.id, stagedRows: rowPayloads.length },
      }))
      setSuccess('Import batch created with mapped validation results.')
    } catch (createError) {
      setImportDraft((previous) => ({ ...previous, saving: false, error: createError?.message || 'Import batch could not be created.' }))
    }
  }

  async function handleApproveBatch(batchId) {
    setImportAction({ batchId, action: 'approve' })
    setAuditError('')
    setSuccess('')
    try {
      await approveCommercialImportBatch(batchId)
      await refreshImportBatches()
      setSuccess('Import batch approved for commit.')
    } catch (approveError) {
      setAuditError(approveError?.message || 'Import batch could not be approved.')
    } finally {
      setImportAction({ batchId: '', action: '' })
    }
  }

  async function loadBatchReview(batchId) {
    setReviewLoading(true)
    setAuditError('')
    try {
      const detail = await getCommercialImportBatch(batchId)
      setReviewBatch(detail.batch)
      setReviewRows(detail.rows)
    } catch (reviewError) {
      setAuditError(reviewError?.message || 'Import batch rows could not be loaded.')
    } finally {
      setReviewLoading(false)
    }
  }

  async function handleReviewBatch(batchId) {
    setImportAction({ batchId, action: 'review' })
    try {
      await loadBatchReview(batchId)
    } finally {
      setImportAction({ batchId: '', action: '' })
    }
  }

  async function handleUpdateRowAction(row, action) {
    setReviewRowAction({ rowId: row.id, action })
    setAuditError('')
    try {
      const updated = await updateCommercialImportRow(row.id, getReviewedRowPatch(action, row))
      setReviewRows((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setSuccess(`Row ${updated.rowNumber} marked ${updated.action}.`)
    } catch (rowError) {
      setAuditError(rowError?.message || 'Import row action could not be updated.')
    } finally {
      setReviewRowAction({ rowId: '', action: '' })
    }
  }

  async function handleBulkReviewAction(action) {
    const rowsForAction = getBulkReviewActionRows(reviewRows, action)
    if (!rowsForAction.length) {
      setSuccess(`No eligible rows to mark ${action}.`)
      return
    }

    setReviewBulkAction(action)
    setAuditError('')
    try {
      const updatedRows = await Promise.all(rowsForAction.map((row) => updateCommercialImportRow(row.id, getReviewedRowPatch(action, row))))
      const updatedById = new Map(updatedRows.map((row) => [row.id, row]))
      setReviewRows((current) => current.map((row) => updatedById.get(row.id) || row))
      setSuccess(`${updatedRows.length} ${updatedRows.length === 1 ? 'row' : 'rows'} marked ${action}.`)
    } catch (bulkError) {
      setAuditError(bulkError?.message || 'Bulk row action could not be applied.')
    } finally {
      setReviewBulkAction('')
    }
  }

  function handleExportIssueReport() {
    if (!reviewBatch) return
    const csvRows = buildImportIssueCsvRows(reviewRows)
    if (csvRows.length <= 1) {
      setSuccess('No issue rows to export for this batch.')
      return
    }
    const csv = buildCsv(csvRows)
    downloadBlob(csv, `commercial-import-${String(reviewBatch.id).slice(0, 8)}-issues.csv`)
    setSuccess(`Exported ${csvRows.length - 1} issue rows.`)
  }

  function handleExportOutcomeReport() {
    if (!reviewBatch) return
    const csvRows = buildImportOutcomeCsvRows(reviewRows)
    const csv = buildCsv(csvRows)
    downloadBlob(csv, `commercial-import-${String(reviewBatch.id).slice(0, 8)}-outcome.csv`)
    setSuccess(`Exported ${Math.max(0, csvRows.length - 1)} outcome rows.`)
  }

  async function handlePrepareRetry(batchId, options = {}) {
    setImportAction({ batchId, action: options.includeSkipped ? 'retry_skipped' : 'retry' })
    setAuditError('')
    setSuccess('')
    try {
      const result = await prepareCommercialImportRetry(batchId, options)
      await refreshImportBatches()
      if (reviewBatch?.id === batchId) await loadBatchReview(batchId)
      setSuccess(`Retry prepared for ${result.resetCount} ${options.includeSkipped ? 'failed/skipped' : 'failed'} ${result.resetCount === 1 ? 'row' : 'rows'}.`)
    } catch (retryError) {
      setAuditError(retryError?.message || 'Failed rows could not be prepared for retry.')
    } finally {
      setImportAction({ batchId: '', action: '' })
    }
  }

  async function handleCommitBatch(batchId) {
    setImportAction({ batchId, action: 'commit' })
    setAuditError('')
    setSuccess('')
    try {
      const result = await commitCommercialImportBatch(batchId)
      await refreshImportBatches()
      if (reviewBatch?.id === batchId) await loadBatchReview(batchId)
      setSuccess(`Import committed: ${result.summary.createdCount} created, ${result.summary.updatedCount} updated, ${result.summary.relationshipsResolvedCount} linked, ${result.summary.skippedCount} skipped, ${result.summary.failedCount} failed.`)
    } catch (commitError) {
      setAuditError(commitError?.message || 'Import batch could not be committed.')
    } finally {
      setImportAction({ batchId: '', action: '' })
    }
  }

  return (
    <form onSubmit={handleSave} className="grid gap-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Bulk Upload & Imports</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Configure which commercial data types can be bulk uploaded before the import workflow is enabled.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <DatabaseZap size={14} /> Phase 8 recovery
          </span>
        </div>
      </section>

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          {success}
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        {loading ? (
          <div className="grid gap-3">
            <div className="h-8 w-56 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        ) : (
          <div className="grid gap-6">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#102236]">Import Access</h2>
                <p className="mt-1 text-sm text-slate-500">{enabledSummary}</p>
              </div>
              <button
                type="button"
                onClick={() => updateSetting('enabled', !settings.enabled)}
                className={`inline-flex min-h-10 w-fit items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${
                  settings.enabled ? 'bg-[#102b46] text-white hover:bg-[#163a5b]' : 'border border-slate-200 bg-white text-[#102236] hover:bg-slate-50'
                }`}
              >
                <UploadCloud size={16} />
                {settings.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <Settings2 size={17} className="text-[#1267a3]" />
                <h2 className="text-base font-semibold text-[#102236]">Allowed Upload Types</h2>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {RECORD_TYPE_OPTIONS.map((option) => {
                  const selected = settings.allowedRecordTypes.includes(option.value)
                  const commitEnabled = isCommitEnabledRecordType(option.value)
                  return (
                    <label
                      key={option.value}
                      className={`flex min-h-[112px] gap-3 rounded-2xl border p-4 transition ${
                        commitEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                      } ${
                        selected ? 'border-[#9fb9d1] bg-[#eef5fb]' : commitEnabled ? 'border-slate-200 bg-[#fbfcfe] hover:bg-white' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected && commitEnabled}
                        disabled={!commitEnabled}
                        onChange={() => toggleRecordType(option.value)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#1267a3] focus:ring-[#9fb9d1]"
                      />
                      <span>
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#102236]">
                          {option.label}
                          {!commitEnabled ? (
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                              Coming next
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-4 border-t border-slate-100 pt-5 lg:grid-cols-3">
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Max rows per upload</span>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={settings.maxRowsPerUpload}
                  onChange={(event) => updateSetting('maxRowsPerUpload', event.target.value)}
                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Duplicate handling</span>
                <select
                  value={settings.duplicateStrategy}
                  onChange={(event) => updateSetting('duplicateStrategy', event.target.value)}
                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  {DUPLICATE_STRATEGIES.map((strategy) => <option key={strategy.value} value={strategy.value}>{strategy.label}</option>)}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Default owner</span>
                <select
                  value={settings.defaultOwnerMode}
                  onChange={(event) => updateSetting('defaultOwnerMode', event.target.value)}
                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  {OWNER_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                </select>
              </label>
            </div>

            <div className="grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-2">
              <label className="flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <input
                  type="checkbox"
                  checked={settings.requireManagerApproval}
                  onChange={(event) => updateSetting('requireManagerApproval', event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#1267a3] focus:ring-[#9fb9d1]"
                />
                <span>
                  <span className="block text-sm font-semibold text-[#102236]">Require manager approval</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Imports stay in review until a commercial manager approves them.</span>
                </span>
              </label>
              <label className="flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <input
                  type="checkbox"
                  checked={settings.documentUploadsEnabled}
                  onChange={(event) => updateSetting('documentUploadsEnabled', event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#1267a3] focus:ring-[#9fb9d1]"
                />
                <span>
                  <span className="block text-sm font-semibold text-[#102236]">Allow document imports later</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Reserved for the later ZIP or manifest-based document upload workflow.</span>
                </span>
              </label>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-5">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#102b46] px-5 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#102236]">Upload Template & File</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Download a record-specific template, upload a CSV or XLSX file, and stage rows into the import audit trail.
            </p>
          </div>
          <div className="grid gap-2 justify-items-start lg:justify-items-end">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                disabled={Boolean(uploadDisabledReason)}
                title={uploadDisabledReason || 'Download CSV template'}
                className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={16} />
                Download Template
              </button>
              <label
                title={uploadDisabledReason || 'Upload CSV or XLSX file'}
                className={`inline-flex min-h-10 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${
                  uploadDisabledReason ? 'cursor-not-allowed bg-slate-200 text-slate-500' : 'cursor-pointer bg-[#102b46] text-white hover:bg-[#163a5b]'
                }`}
              >
                <UploadCloud size={16} />
                Upload CSV/XLSX
                <input
                  type="file"
                  accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  disabled={Boolean(uploadDisabledReason)}
                  onChange={handleImportFileChange}
                  className="hidden"
                />
              </label>
            </div>
            {uploadDisabledReason ? (
              <p className="max-w-sm text-xs font-semibold leading-5 text-amber-700">{uploadDisabledReason}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(220px,0.45fr)_minmax(0,1fr)]">
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Record type</span>
              <select
                value={importDraft.recordType}
                onChange={(event) => setImportDraft((previous) => ({ ...previous, recordType: event.target.value, error: '', summary: null, headers: [], rows: [], columnMapping: {}, validation: null, file: null }))}
                className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
              >
                {settings.allowedRecordTypes.map((recordType) => (
                  <option key={recordType} value={recordType}>{normalizeRecordTypeLabel(recordType)}</option>
                ))}
              </select>
            </label>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Template columns</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedTemplate.headers.slice(0, 8).map((header) => (
                  <span key={header} className="rounded-full bg-[#eef5fb] px-2.5 py-1 text-xs font-semibold text-[#123b61]">{header}</span>
                ))}
                {selectedTemplate.headers.length > 8 ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">+{selectedTemplate.headers.length - 8}</span> : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            {importDraft.error ? (
              <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                <AlertCircle size={17} className="mt-0.5 shrink-0" />
                {importDraft.error}
              </div>
            ) : null}

            {importDraft.summary ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">File</p>
                  <p className="mt-2 truncate text-sm font-semibold text-[#102236]">{importDraft.summary.fileName || 'Uploaded file'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Rows</p>
                  <p className="mt-2 text-sm font-semibold text-[#102236]">{importDraft.summary.stagedRows ?? importDraft.rows.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Columns</p>
                  <p className="mt-2 text-sm font-semibold text-[#102236]">{importDraft.summary.columnCount ?? importDraft.headers.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Audit</p>
                  <p className="mt-2 truncate text-sm font-semibold text-[#102236]">{importDraft.summary.batchId ? `Batch ${String(importDraft.summary.batchId).slice(0, 8)}` : 'Not staged'}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
                Upload a CSV or XLSX file to preview rows before the mapping step.
              </div>
            )}

            {previewRows.length ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                      <tr>
                        {importDraft.headers.slice(0, 6).map((header) => <th key={header} className="whitespace-nowrap px-3 py-3">{header}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewRows.map((row, rowIndex) => (
                        <tr key={`preview-${rowIndex}`}>
                          {importDraft.headers.slice(0, 6).map((header) => (
                            <td key={`${rowIndex}-${header}`} className="max-w-[220px] truncate px-3 py-3 text-slate-600">{row[header] || '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {importDraft.headers.length ? (
              <div className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[#102236]">Column Mapping</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Review auto-mapped fields before validating the upload.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleValidateMapping}
                    disabled={!importDraft.rows.length || importDraft.validating}
                    className="inline-flex min-h-10 w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 size={16} />
                    {importDraft.validating ? 'Checking Records...' : 'Validate Mapping'}
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {selectedFields.map((field) => (
                    <label key={field.key} className="grid gap-2">
                      <span className="flex min-h-5 items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                        {field.label}
                        {field.required ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-600">Required</span> : null}
                      </span>
                      <select
                        value={importDraft.columnMapping?.[field.key] || ''}
                        onChange={(event) => updateColumnMapping(field.key, event.target.value)}
                        className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
                      >
                        <option value="">Do not import</option>
                        {importDraft.headers.map((header) => (
                          <option key={`${field.key}-${header}`} value={header}>{header}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                {importDraft.validation ? (
                  <div className="grid gap-4 border-t border-slate-100 pt-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-700">Valid</p>
                        <p className="mt-2 text-xl font-semibold text-emerald-900">{importDraft.validation.validRows}</p>
                      </div>
                      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-700">Warnings</p>
                        <p className="mt-2 text-xl font-semibold text-amber-900">{importDraft.validation.warningRows}</p>
                      </div>
                      <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-rose-700">Invalid</p>
                        <p className="mt-2 text-xl font-semibold text-rose-900">{importDraft.validation.invalidRows}</p>
                      </div>
                    </div>

                    {importDraft.validation.mappingErrors.length ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                        {importDraft.validation.mappingErrors.join(' ')}
                      </div>
                    ) : null}

                    {importDraft.validation.issues.length ? (
                      <div className="overflow-hidden rounded-2xl border border-slate-200">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                              <tr>
                                <th className="whitespace-nowrap px-3 py-3">Row</th>
                                <th className="whitespace-nowrap px-3 py-3">Status</th>
                                <th className="min-w-[260px] px-3 py-3">Validation Notes</th>
                                <th className="whitespace-nowrap px-3 py-3">Duplicate Key</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {importDraft.validation.issues.map((issue) => (
                                <tr key={`issue-${issue.rowNumber}`}>
                                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-[#102236]">{issue.rowNumber}</td>
                                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{issue.status}</td>
                                  <td className="px-3 py-3 text-slate-600">
                                    {[...issue.validationErrors, ...issue.validationWarnings].join(' ') || '-'}
                                  </td>
                                  <td className="max-w-[220px] truncate px-3 py-3 text-slate-500">{issue.duplicateKey || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                        All staged rows passed validation.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 grid gap-2 justify-items-end">
              <button
                type="button"
                onClick={handleCreateImportBatch}
                disabled={Boolean(createImportDisabledReason)}
                title={createImportDisabledReason || 'Create import batch'}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#102b46] px-5 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileClock size={16} />
                {importDraft.saving ? 'Creating Batch...' : 'Create Import Batch'}
              </button>
              {createImportDisabledReason ? (
                <p className="max-w-md text-right text-xs font-semibold leading-5 text-slate-500">{createImportDisabledReason}</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#102236]">Recent Import Audit Trail</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Review row-level actions, approve batches, and commit validated commercial imports.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <FileClock size={14} /> Review ready
          </span>
        </div>

        {auditError ? (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            {auditError}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3">
          {importBatches.length ? importBatches.map((batch) => {
            const busy = importAction.batchId === batch.id
            const canApprove = batch.status === 'approval_pending' || (batch.status === 'validated' && batch.requiresManagerApproval)
            const canCommit = ['ready', 'approved', 'validated'].includes(batch.status) && (batch.validRows || batch.warningRows)
            const committed = ['committed', 'failed'].includes(batch.status)
            const canRetry = committed && batch.failedCount > 0
            const canReworkSkipped = committed && batch.skippedCount > 0
            return (
              <article key={batch.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 lg:grid-cols-[minmax(0,1fr)_120px_180px_180px] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#102236]">{batch.fileName || 'Commercial import batch'}</p>
                  <p className="mt-1 text-xs text-slate-500">{batch.recordType || 'record type pending'} · {batch.totalRows} rows · {batch.createdAt ? new Date(batch.createdAt).toLocaleDateString() : 'date pending'}</p>
                </div>
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{batch.status || 'uploaded'}</span>
                <div className="text-sm font-semibold text-[#102236]">
                  <p>{batch.validRows} valid · {batch.warningRows} warnings</p>
                  <p className="mt-1 text-xs text-slate-500">{batch.invalidRows} invalid</p>
                </div>
                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => handleReviewBatch(batch.id)}
                    disabled={busy || reviewLoading}
                    className="inline-flex min-h-9 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#102236] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FileClock size={14} />
                    {busy && importAction.action === 'review' ? 'Loading...' : 'Review'}
                  </button>
                  {committed ? (
                    <span className="inline-flex min-h-9 items-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500">
                      {batch.createdCount} created · {batch.updatedCount} updated · {batch.skippedCount} skipped · {batch.failedCount} failed
                    </span>
                  ) : null}
                  {canRetry ? (
                    <button
                      type="button"
                      onClick={() => handlePrepareRetry(batch.id)}
                      disabled={busy}
                      className="inline-flex min-h-9 items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <FileClock size={14} />
                      {busy && importAction.action === 'retry' ? 'Preparing...' : 'Retry Failed'}
                    </button>
                  ) : null}
                  {canReworkSkipped ? (
                    <button
                      type="button"
                      onClick={() => handlePrepareRetry(batch.id, { includeSkipped: true })}
                      disabled={busy}
                      className="inline-flex min-h-9 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#102236] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <FileClock size={14} />
                      {busy && importAction.action === 'retry_skipped' ? 'Preparing...' : 'Rework Skipped'}
                    </button>
                  ) : null}
                  {canApprove ? (
                    <button
                      type="button"
                      onClick={() => handleApproveBatch(batch.id)}
                      disabled={busy}
                      className="inline-flex min-h-9 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#102236] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <CheckCircle2 size={14} />
                      {busy && importAction.action === 'approve' ? 'Approving...' : 'Approve'}
                    </button>
                  ) : null}
                  {canCommit ? (
                    <button
                      type="button"
                      onClick={() => handleCommitBatch(batch.id)}
                      disabled={busy}
                      className="inline-flex min-h-9 items-center gap-2 rounded-2xl bg-[#102b46] px-3 text-xs font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <FileClock size={14} />
                      {busy && importAction.action === 'commit' ? 'Committing...' : 'Commit'}
                    </button>
                  ) : null}
                </div>
              </article>
            )
          }) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-[#fbfcfe] p-5 text-sm text-slate-500">
              No import batches have been logged yet.
            </div>
          )}
        </div>

        {reviewBatch ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-[#fbfcfe] p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-[#102236]">Review Rows: {reviewBatch.fileName || 'Commercial import batch'}</h3>
                <p className="mt-1 text-xs text-slate-500">{reviewBatch.recordType} · {reviewRows.length} rows loaded · {reviewBatch.status} · {getImportReadinessLabel(reviewReadiness)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkReviewAction('create')}
                  disabled={reviewLoading || Boolean(reviewBulkAction) || !bulkCreateRows.length}
                  className="inline-flex min-h-9 w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#102236] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCircle2 size={14} />
                  {reviewBulkAction === 'create' ? 'Marking...' : `Create Clean (${bulkCreateRows.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkReviewAction('update')}
                  disabled={reviewLoading || Boolean(reviewBulkAction) || !bulkUpdateRows.length}
                  className="inline-flex min-h-9 w-fit items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCircle2 size={14} />
                  {reviewBulkAction === 'update' ? 'Marking...' : `Update Matches (${bulkUpdateRows.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkReviewAction('skip')}
                  disabled={reviewLoading || Boolean(reviewBulkAction) || !bulkSkipRows.length}
                  className="inline-flex min-h-9 w-fit items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <AlertCircle size={14} />
                  {reviewBulkAction === 'skip' ? 'Marking...' : `Skip Matches (${bulkSkipRows.length})`}
                </button>
                <button
                  type="button"
                  onClick={handleExportIssueReport}
                  className="inline-flex min-h-9 w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#102236] transition hover:bg-slate-50"
                >
                  <Download size={14} />
                  Export Issues
                </button>
                <button
                  type="button"
                  onClick={handleExportOutcomeReport}
                  className="inline-flex min-h-9 w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#102236] transition hover:bg-slate-50"
                >
                  <Download size={14} />
                  Export Outcome
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReviewBatch(null)
                    setReviewRows([])
                  }}
                  className="inline-flex min-h-9 w-fit items-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#102236] transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            {!reviewLoading ? (
              <div className="grid gap-2 border-b border-slate-100 bg-white p-4 sm:grid-cols-2 xl:grid-cols-8">
                {[
                  { label: 'Create ready', value: reviewReadiness.createRows },
                  { label: 'Update ready', value: reviewReadiness.updateRows },
                  { label: 'Need review', value: reviewReadiness.reviewRows },
                  { label: 'Created', value: reviewReadiness.createdRows },
                  { label: 'Updated', value: reviewReadiness.updatedRows },
                  { label: 'Skipped', value: reviewReadiness.skipRows },
                  { label: 'Failed', value: reviewReadiness.failedRows },
                  { label: 'Invalid', value: reviewReadiness.invalidRows },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{item.label}</p>
                    <p className="mt-1 text-lg font-semibold text-[#102236]">{item.value}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {reviewLoading ? (
              <div className="grid gap-2 p-4">
                <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-3">Row</th>
                      <th className="min-w-[220px] px-3 py-3">Record</th>
                      <th className="whitespace-nowrap px-3 py-3">Status</th>
                      <th className="whitespace-nowrap px-3 py-3">Action</th>
                      <th className="min-w-[180px] px-3 py-3">Match</th>
                      <th className="min-w-[300px] px-3 py-3">Notes</th>
                      <th className="whitespace-nowrap px-3 py-3">Review Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {reviewRows.map((row) => {
                      const rowBusy = reviewRowAction.rowId === row.id
                      const locked = ['created', 'updated'].includes(row.status)
                      return (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold text-[#102236]">{row.rowNumber}</td>
                          <td className="max-w-[260px] truncate px-3 py-3 text-slate-700">{getImportRowTitle(row)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.status || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.action || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{getImportRowDuplicateMatch(row) || '-'}</td>
                          <td className="px-3 py-3 text-slate-600">{getImportRowIssueText(row)}</td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleUpdateRowAction(row, 'create')}
                                disabled={rowBusy || locked || row.validationErrors.length}
                                className="inline-flex min-h-8 items-center rounded-xl bg-[#102b46] px-3 text-xs font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {rowBusy && reviewRowAction.action === 'create' ? 'Saving...' : 'Create'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateRowAction(row, 'update')}
                                disabled={rowBusy || locked || row.validationErrors.length || !row.duplicateRecordId}
                                className="inline-flex min-h-8 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {rowBusy && reviewRowAction.action === 'update' ? 'Saving...' : 'Update'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateRowAction(row, 'review')}
                                disabled={rowBusy || locked}
                                className="inline-flex min-h-8 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#102236] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {rowBusy && reviewRowAction.action === 'review' ? 'Saving...' : 'Review'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateRowAction(row, 'skip')}
                                disabled={rowBusy || locked}
                                className="inline-flex min-h-8 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {rowBusy && reviewRowAction.action === 'skip' ? 'Saving...' : 'Skip'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </form>
  )
}

export default CommercialBulkUploadSettingsPage
