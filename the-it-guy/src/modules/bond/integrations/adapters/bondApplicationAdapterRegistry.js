import {
  BOND_APPLICATION_CANONICAL_EXPORT_SCHEMA_VERSION,
} from '../canonical/canonicalBondApplicationExport.js'
import { validateCanonicalBondApplicationExport } from '../canonical/validateCanonicalBondApplicationExport.js'
import { BOND_APPLICATION_TRANSFORMATION_REGISTRY_VERSION } from './bondApplicationTransformations.js'

export const BOND_APPLICATION_ADAPTER_REGISTRY_VERSION = 'phase-8-adapter-registry-v1'

export const BOND_APPLICATION_DESTINATION_KEYS = {
  ooba: 'ooba',
  genericBank: 'bank_generic',
}

export const BOND_APPLICATION_DELIVERY_METHODS = {
  secureExport: 'secure_export',
  manualConfirmation: 'manual_confirmation',
  api: 'api',
  sftp: 'sftp',
  email: 'email',
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function disabledAdapterIssue(destinationKey) {
  return {
    code: 'official_destination_specification_missing',
    severity: 'blocker',
    message: `No approved ${destinationKey} payload specification is present in the repository.`,
  }
}

function createDisabledAdapter({
  destinationKey,
  label,
  destinationType,
  capabilityProfile = {},
} = {}) {
  const issue = disabledAdapterIssue(destinationKey)
  return {
    destinationKey,
    label,
    destinationType,
    adapterVersion: 'phase-8-disabled-v1',
    canonicalSchemaVersion: BOND_APPLICATION_CANONICAL_EXPORT_SCHEMA_VERSION,
    transformationRegistryVersion: BOND_APPLICATION_TRANSFORMATION_REGISTRY_VERSION,
    enabled: false,
    officialSpecificationAvailable: false,
    liveDeliveryAllowed: false,
    deliveryMethods: [],
    capabilityProfile: {
      supportsApplicants: true,
      supportsCoApplicants: true,
      supportsSureties: false,
      supportsSupplementalDocuments: false,
      supportsExternalStatusSync: false,
      requiresOfficialSpecification: true,
      ...capabilityProfile,
    },
    blockers: [issue],
    validateCanonicalSource(canonicalExport) {
      const validation = validateCanonicalBondApplicationExport(canonicalExport)
      return {
        valid: false,
        issues: [...validation.issues, issue],
      }
    },
    mapCanonicalToDestination() {
      return {
        ok: false,
        payload: null,
        issues: [issue],
      }
    },
    validateDestinationPayload() {
      return {
        valid: false,
        issues: [issue],
      }
    },
    serializePayload() {
      return {
        ok: false,
        contentType: null,
        body: null,
        issues: [issue],
      }
    },
    mapDeliveryResponse(response = {}) {
      return {
        status: 'unknown',
        externalReference: normalizeText(response.externalReference || response.external_reference) || null,
        receivedAt: response.receivedAt || response.received_at || null,
        rawResponseStored: false,
        issues: [issue],
      }
    },
    mapExternalEvent(event = {}) {
      return {
        eventType: normalizeText(event.eventType || event.event_type) || 'unknown',
        externalStatus: normalizeText(event.status || event.externalStatus || event.external_status) || 'unknown',
        mappedStatus: 'review_required',
        issues: [issue],
      }
    },
  }
}

const ADAPTERS = {
  [BOND_APPLICATION_DESTINATION_KEYS.ooba]: createDisabledAdapter({
    destinationKey: BOND_APPLICATION_DESTINATION_KEYS.ooba,
    label: 'OOBA',
    destinationType: 'bond_originator',
    capabilityProfile: {
      supportsSureties: false,
      specificationDependency: 'Approved OOBA bond-originator intake schema, validation rules, enum map and transport policy.',
    },
  }),
  [BOND_APPLICATION_DESTINATION_KEYS.genericBank]: createDisabledAdapter({
    destinationKey: BOND_APPLICATION_DESTINATION_KEYS.genericBank,
    label: 'Bank adapter placeholder',
    destinationType: 'bank',
    capabilityProfile: {
      specificationDependency: 'Approved bank-specific payload schema, document manifest rules and delivery acknowledgement contract.',
    },
  }),
}

export function listBondApplicationDestinationAdapters() {
  return Object.values(ADAPTERS).map((adapter) => ({
    destinationKey: adapter.destinationKey,
    label: adapter.label,
    destinationType: adapter.destinationType,
    adapterVersion: adapter.adapterVersion,
    enabled: adapter.enabled,
    officialSpecificationAvailable: adapter.officialSpecificationAvailable,
    liveDeliveryAllowed: adapter.liveDeliveryAllowed,
    capabilityProfile: adapter.capabilityProfile,
    blockers: adapter.blockers,
  }))
}

export function getBondApplicationDestinationAdapter(destinationKey = BOND_APPLICATION_DESTINATION_KEYS.ooba) {
  const normalized = normalizeText(destinationKey).toLowerCase()
  return ADAPTERS[normalized] || createDisabledAdapter({
    destinationKey: normalized || 'unknown',
    label: normalized || 'Unknown destination',
    destinationType: 'unknown',
    capabilityProfile: {
      specificationDependency: 'Destination adapter is not registered.',
    },
  })
}

export function validateBondApplicationDestinationAdapter(adapter = {}) {
  const issues = []
  if (!normalizeText(adapter.destinationKey)) {
    issues.push({ code: 'destination_key_missing', severity: 'blocker', message: 'Adapter destination key is required.' })
  }
  if (adapter.canonicalSchemaVersion !== BOND_APPLICATION_CANONICAL_EXPORT_SCHEMA_VERSION) {
    issues.push({ code: 'canonical_schema_unsupported', severity: 'blocker', message: 'Adapter targets an unsupported canonical schema version.' })
  }
  if (adapter.enabled === true && adapter.officialSpecificationAvailable !== true) {
    issues.push({ code: 'enabled_without_specification', severity: 'blocker', message: 'A destination adapter cannot be enabled without an approved official specification.' })
  }
  if (adapter.liveDeliveryAllowed === true && adapter.enabled !== true) {
    issues.push({ code: 'live_delivery_without_enabled_adapter', severity: 'blocker', message: 'Live delivery requires an enabled destination adapter.' })
  }
  const allIssues = [...issues, ...(Array.isArray(adapter.blockers) ? adapter.blockers : [])]
  return {
    valid: !allIssues.some((item) => item.severity === 'blocker'),
    issues: allIssues,
  }
}

export function buildBondApplicationMappingCoverageReport(adapter = {}) {
  const blockers = Array.isArray(adapter.blockers) ? adapter.blockers : []
  const requiredSourceGroups = ['source', 'application', 'participants', 'documents', 'declarations', 'signerManifest']
  return {
    registryVersion: BOND_APPLICATION_ADAPTER_REGISTRY_VERSION,
    destinationKey: adapter.destinationKey || 'unknown',
    adapterVersion: adapter.adapterVersion || null,
    officialSpecificationAvailable: adapter.officialSpecificationAvailable === true,
    enabled: adapter.enabled === true,
    requiredSourceGroups,
    mappedSourceGroups: adapter.enabled === true ? requiredSourceGroups : [],
    unmappedSourceGroups: adapter.enabled === true ? [] : requiredSourceGroups,
    requiredDestinationFields: adapter.requiredDestinationFields || [],
    mappedDestinationFields: adapter.mappedDestinationFields || [],
    unmappedDestinationFields: adapter.enabled === true ? [] : adapter.requiredDestinationFields || ['official_specification_required'],
    blockers,
  }
}
