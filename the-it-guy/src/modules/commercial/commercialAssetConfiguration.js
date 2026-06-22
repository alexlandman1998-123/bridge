import { normalizeKey } from './commercialProspectFormatters.js'

export const COMMERCIAL_ASSET_CLASSES = ['retail', 'office', 'industrial', 'agricultural', 'mixed_use', 'other']

const CONFIGURATION = {
  retail: {
    assetClass: 'retail',
    label: 'Retail',
    propertyFields: [
      { key: 'anchorTenant', label: 'Anchor Tenant' },
      { key: 'footTraffic', label: 'Foot Traffic' },
      { key: 'shopfrontWidth', label: 'Shopfront Width' },
      { key: 'tradingLevels', label: 'Trading Levels' },
      { key: 'parkingBays', label: 'Parking Bays' },
      { key: 'visibility', label: 'Visibility' },
      { key: 'signageOpportunities', label: 'Signage Opportunities' },
      { key: 'tradingHours', label: 'Trading Hours' },
    ],
    requirementFields: [
      { key: 'footTrafficRequirement', label: 'Foot Traffic Requirement' },
      { key: 'anchorTenantPreference', label: 'Anchor Tenant Preference' },
      { key: 'shopfrontRequirement', label: 'Shopfront Requirement' },
      { key: 'visibilityImportance', label: 'Visibility Importance' },
      { key: 'parkingRequirement', label: 'Parking Requirement' },
      { key: 'shoppingCentrePreference', label: 'Shopping Centre Preference' },
    ],
    readinessChecks: [
      { key: 'anchorTenant', label: 'Anchor Tenant Captured' },
      { key: 'parkingBays', fallbackKey: 'parkingRequirement', label: 'Parking Captured' },
      { key: 'visibility', fallbackKey: 'visibilityImportance', label: 'Visibility Captured' },
    ],
    matchingRules: ['Area', 'Budget', 'Foot Traffic', 'Parking', 'Visibility'],
    dashboardCards: [
      { label: 'Retail Profile', key: 'assetProfile', fallback: 'Retail intelligence pending' },
      { label: 'Anchor Tenant', key: 'anchorTenant', fallback: 'Anchor tenant pending' },
      { label: 'Foot Traffic', key: 'footTraffic', fallback: 'Foot traffic pending' },
      { label: 'Parking', key: 'parkingBays', fallback: 'Parking pending' },
      { label: 'Visibility', key: 'visibility', fallback: 'Visibility pending' },
      { label: 'Retail Suitability', key: 'suitability', fallback: 'Medium' },
    ],
    documentChecklist: ['Tenant Mix', 'Trading Statistics', 'Centre Plans'],
  },
  office: {
    assetClass: 'office',
    label: 'Office',
    propertyFields: [
      { key: 'officeGrade', label: 'Office Grade' },
      { key: 'numberOfFloors', label: 'Number of Floors' },
      { key: 'parkingRatio', label: 'Parking Ratio' },
      { key: 'meetingRooms', label: 'Meeting Rooms' },
      { key: 'reception', label: 'Reception' },
      { key: 'backupPower', label: 'Backup Power' },
      { key: 'backupWater', label: 'Backup Water' },
      { key: 'security', label: 'Security' },
    ],
    requirementFields: [
      { key: 'gradeRequirement', label: 'Grade Requirement' },
      { key: 'parkingRatio', label: 'Parking Ratio' },
      { key: 'meetingRooms', label: 'Meeting Rooms' },
      { key: 'backupPower', label: 'Backup Power' },
      { key: 'hybridWorkspaceRequirement', label: 'Hybrid Workspace Requirement' },
      { key: 'corporateHqRequirement', label: 'Corporate HQ Requirement' },
    ],
    readinessChecks: [
      { key: 'officeGrade', fallbackKey: 'gradeRequirement', label: 'Grade Captured' },
      { key: 'parkingRatio', label: 'Parking Ratio Captured' },
      { key: 'backupPower', label: 'Power Status Captured' },
    ],
    matchingRules: ['Area', 'Grade', 'Parking', 'Power', 'Meeting Rooms'],
    dashboardCards: [
      { label: 'Office Profile', key: 'assetProfile', fallback: 'Office intelligence pending' },
      { label: 'Grade', key: 'officeGrade', fallback: 'Grade pending' },
      { label: 'Parking Ratio', key: 'parkingRatio', fallback: 'Parking ratio pending' },
      { label: 'Backup Power', key: 'backupPower', fallback: 'Power status pending' },
      { label: 'Security', key: 'security', fallback: 'Security pending' },
      { label: 'Corporate Readiness', key: 'corporateReadiness', fallback: 'B Grade' },
    ],
    documentChecklist: ['Floor Plans', 'Parking Schedule', 'Building Specs'],
  },
  industrial: {
    assetClass: 'industrial',
    label: 'Industrial',
    propertyFields: [
      { key: 'powerSupply', label: 'Power Supply' },
      { key: 'yardSize', label: 'Yard Size' },
      { key: 'warehouseHeight', label: 'Warehouse Height' },
      { key: 'dockLevellers', label: 'Dock Levellers' },
      { key: 'sprinklers', label: 'Sprinklers' },
      { key: 'truckAccess', label: 'Truck Access' },
      { key: 'turningRadius', label: 'Turning Radius' },
      { key: 'loadingBays', label: 'Loading Bays' },
    ],
    requirementFields: [
      { key: 'minimumPowerRequirement', label: 'Minimum Power Requirement' },
      { key: 'minimumYardRequirement', label: 'Minimum Yard Requirement' },
      { key: 'warehouseHeightRequirement', label: 'Warehouse Height Requirement' },
      { key: 'dockRequirement', label: 'Dock Requirement' },
      { key: 'truckAccessRequirement', label: 'Truck Access Requirement' },
    ],
    readinessChecks: [
      { key: 'powerSupply', fallbackKey: 'minimumPowerRequirement', label: 'Power Captured' },
      { key: 'yardSize', fallbackKey: 'minimumYardRequirement', label: 'Yard Captured' },
      { key: 'warehouseHeight', fallbackKey: 'warehouseHeightRequirement', label: 'Height Captured' },
    ],
    matchingRules: ['Area', 'Power', 'Yard', 'Height', 'Docks'],
    dashboardCards: [
      { label: 'Industrial Profile', key: 'assetProfile', fallback: 'Industrial intelligence pending' },
      { label: 'Power', key: 'powerSupply', fallback: 'Power pending' },
      { label: 'Yard', key: 'yardSize', fallback: 'Yard pending' },
      { label: 'Height', key: 'warehouseHeight', fallback: 'Height pending' },
      { label: 'Docks', key: 'dockLevellers', fallback: 'Docks pending' },
      { label: 'Logistics Suitability', key: 'logisticsSuitability', fallback: 'Good' },
    ],
    documentChecklist: ['Power Certificates', 'Yard Plans', 'Warehouse Specs'],
  },
  agricultural: {
    assetClass: 'agricultural',
    label: 'Agricultural',
    propertyFields: [
      { key: 'farmSize', label: 'Farm Size' },
      { key: 'arableLand', label: 'Arable Land' },
      { key: 'waterRights', label: 'Water Rights' },
      { key: 'irrigation', label: 'Irrigation' },
      { key: 'storageFacilities', label: 'Storage Facilities' },
      { key: 'processingFacilities', label: 'Processing Facilities' },
      { key: 'staffAccommodation', label: 'Staff Accommodation' },
      { key: 'infrastructure', label: 'Infrastructure' },
    ],
    requirementFields: [
      { key: 'minimumFarmSize', label: 'Minimum Farm Size' },
      { key: 'waterRequirement', label: 'Water Requirement' },
      { key: 'storageRequirement', label: 'Storage Requirement' },
      { key: 'processingRequirement', label: 'Processing Requirement' },
      { key: 'infrastructureRequirement', label: 'Infrastructure Requirement' },
    ],
    readinessChecks: [
      { key: 'waterRights', fallbackKey: 'waterRequirement', label: 'Water Rights Captured' },
      { key: 'storageFacilities', fallbackKey: 'storageRequirement', label: 'Storage Captured' },
      { key: 'infrastructure', fallbackKey: 'infrastructureRequirement', label: 'Infrastructure Captured' },
    ],
    matchingRules: ['Area', 'Farm Size', 'Water', 'Storage', 'Infrastructure'],
    dashboardCards: [
      { label: 'Agricultural Profile', key: 'assetProfile', fallback: 'Agricultural intelligence pending' },
      { label: 'Farm Size', key: 'farmSize', fallback: 'Farm size pending' },
      { label: 'Water Rights', key: 'waterRights', fallback: 'Water rights pending' },
      { label: 'Storage', key: 'storageFacilities', fallback: 'Storage pending' },
      { label: 'Infrastructure', key: 'infrastructure', fallback: 'Infrastructure pending' },
      { label: 'Operational Suitability', key: 'operationalSuitability', fallback: 'Medium' },
    ],
    documentChecklist: ['Water Rights', 'Land Surveys', 'Infrastructure Reports'],
  },
  mixed_use: {
    assetClass: 'mixed_use',
    label: 'Mixed-use',
    propertyFields: [
      { key: 'retailComponent', label: 'Retail Component' },
      { key: 'officeComponent', label: 'Office Component' },
      { key: 'industrialComponent', label: 'Industrial Component' },
      { key: 'primaryUse', label: 'Primary Use' },
      { key: 'secondaryUse', label: 'Secondary Use' },
      { key: 'occupancyMix', label: 'Occupancy Mix' },
      { key: 'incomeMix', label: 'Income Mix' },
    ],
    requirementFields: [
      { key: 'primaryUseRequirement', label: 'Primary Use Requirement' },
      { key: 'secondaryUseRequirement', label: 'Secondary Use Requirement' },
      { key: 'useBreakdown', label: 'Use Breakdown' },
      { key: 'occupancyMix', label: 'Occupancy Mix' },
      { key: 'incomeMix', label: 'Income Mix' },
    ],
    readinessChecks: [
      { key: 'primaryUse', fallbackKey: 'primaryUseRequirement', label: 'Primary Use Defined' },
      { key: 'secondaryUse', fallbackKey: 'secondaryUseRequirement', label: 'Secondary Use Defined' },
      { key: 'occupancyMix', label: 'Occupancy Mix Defined' },
    ],
    matchingRules: ['Area', 'Primary Use', 'Secondary Use', 'Occupancy Mix', 'Income Mix'],
    dashboardCards: [
      { label: 'Use Breakdown', key: 'useBreakdown', fallback: 'Use breakdown pending' },
      { label: 'Occupancy Mix', key: 'occupancyMix', fallback: 'Occupancy mix pending' },
      { label: 'Income Mix', key: 'incomeMix', fallback: 'Income mix pending' },
    ],
    documentChecklist: ['Use Breakdown', 'Occupancy Schedule', 'Income Mix'],
  },
  other: {
    assetClass: 'other',
    label: 'Other',
    propertyFields: [],
    requirementFields: [],
    readinessChecks: [],
    matchingRules: ['Area', 'Budget', 'Size'],
    dashboardCards: [
      { label: 'Asset Profile', key: 'assetProfile', fallback: 'Asset intelligence pending' },
    ],
    documentChecklist: [],
  },
}

export const CommercialAssetConfiguration = CONFIGURATION

export function normalizeCommercialAssetClass(assetClass = '') {
  const key = normalizeKey(assetClass)
  if (key === 'mixed-use' || key === 'mixeduse' || key === 'mixed use') return 'mixed_use'
  return COMMERCIAL_ASSET_CLASSES.includes(key) ? key : 'other'
}

export function getCommercialAssetConfiguration(assetClass = '') {
  return CONFIGURATION[normalizeCommercialAssetClass(assetClass)] || CONFIGURATION.other
}
